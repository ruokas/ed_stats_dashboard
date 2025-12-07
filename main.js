import { createClientStore, registerServiceWorker, PerfMonitor, clearClientData } from './app.js';

    /**
     * Įkelia Chart.js iš CDN naudojant klasikinį <script>, kad išvengtume CORS/MIME klaidų.
     * Jei biblioteka jau užkrauta (pvz., iš ankstesnio seanso), panaudojamas esamas egzempliorius.
     * @returns {Promise<typeof window.Chart|null>}
     */
    let chartJsPromise = null;

      function loadChartJs() {
        if (window.Chart) {
          return Promise.resolve(window.Chart);
        }

      if (!chartJsPromise) {
        chartJsPromise = new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
          script.defer = true;
          script.onload = () => resolve(window.Chart ?? null);
          script.onerror = (error) => {
            console.error('Nepavyko įkelti Chart.js bibliotekos:', error);
            chartJsPromise = null;
            resolve(null);
          };
          document.head.appendChild(script);
        });
      }

      return chartJsPromise;
    }

    function runAfterDomAndIdle(task, { timeout = 1200 } = {}) {
      if (typeof task !== 'function') {
        return;
      }

      const execute = () => {
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(() => task(), { timeout });
        } else {
          window.setTimeout(() => task(), timeout);
        }
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', execute, { once: true });
      } else {
        execute();
      }
    }

    function enableLazyLoading() {
      document.querySelectorAll('img:not([loading])').forEach((img) => {
        if (!img.dataset?.forceEager) {
          img.loading = 'lazy';
        }
      });
      document.querySelectorAll('iframe:not([loading])').forEach((frame) => {
        frame.loading = 'lazy';
      });
    }

    function initializeServiceWorker() {
      registerServiceWorker('/service-worker.js').then((registration) => {
        if (registration?.scope) {
          updateClientConfig({ swScope: registration.scope });
        }
      });
    }

    enableLazyLoading();
    initializeServiceWorker();

    // Iškart inicijuojame įkėlimą, kad biblioteka būtų paruošta, kai prireiks piešti grafikus.
    runAfterDomAndIdle(() => loadChartJs());
    /**
     * Pagrindinė demonstracinė duomenų kopija, naudojama kaip rezervas, jei nepavyksta pasiekti nuotolinio CSV.
     */
    const DEFAULT_DEMO_CSV = `Atvykimo data,Išrašymo data,Diena/naktis,GMP,Nukreiptas į padalinį
2024-02-01T07:15:00+02:00,2024-02-01T10:45:00+02:00,Diena,TAIP,Chirurgija
2024-02-01T13:20:00+02:00,2024-02-01T16:00:00+02:00,Diena,NE,
2024-02-01T21:10:00+02:00,2024-02-02T00:30:00+02:00,Naktis,TAIP,Traumatologija
2024-02-02T06:55:00+02:00,2024-02-02T09:10:00+02:00,Diena,NE,
2024-02-02T18:40:00+02:00,2024-02-02T22:05:00+02:00,Vakare,TAIP,Chirurgija
2024-02-03T02:30:00+02:00,2024-02-03T05:00:00+02:00,Naktis,NE,
2024-02-03T10:15:00+02:00,2024-02-03T13:20:00+02:00,Diena,NE,
2024-02-04T08:05:00+02:00,2024-02-04T11:15:00+02:00,Diena,TAIP,Chirurgija
2024-02-04T17:50:00+02:00,2024-02-04T21:30:00+02:00,Vakare,NE,
2024-02-05T00:40:00+02:00,2024-02-05T04:10:00+02:00,Naktis,TAIP,Reanimacija
2024-02-05T12:25:00+02:00,2024-02-05T15:45:00+02:00,Diena,NE,
2024-02-06T07:55:00+02:00,2024-02-06T10:35:00+02:00,Diena,TAIP,Chirurgija
2024-02-06T22:20:00+02:00,2024-02-07T01:40:00+02:00,Naktis,NE,
2024-02-07T14:10:00+02:00,2024-02-07T18:55:00+02:00,Diena,NE,
2024-02-08T05:50:00+02:00,2024-02-08T09:15:00+02:00,Rytas,TAIP,
2024-02-08T19:30:00+02:00,2024-02-08T23:05:00+02:00,Vakare,NE,
2024-02-09T23:10:00+02:00,2024-02-10T02:20:00+02:00,Naktis,TAIP,Traumatologija`;
    const DEFAULT_FEEDBACK_CSV = `Timestamp,Kas pildo formą?,Šaltinis,Kaip vertinate savo bendrą patirtį mūsų skyriuje?,Kaip vertinate gydytojų darbą,Kaip vertinate slaugytojų darbą ?,Ar bendravote su slaugytojų padėjėjais?,Kaip vertinate slaugytojų padėjėjų darbą,Kaip vertinate laukimo laiką skyriuje?
2024-02-01T09:12:00+02:00,Pacientas,Registratūros QR kodas,4,4,5,Taip,5,4
2024-02-02T18:40:00+02:00,Artimasis,SMS nuoroda,3,4,3,Ne,,3
2024-02-03T12:05:00+02:00,Pacientas,Planšetė skyriuje,5,5,5,Taip,5,5
2024-02-04T22:20:00+02:00,Artimasis,El. pašto kvietimas,2,3,2,Taip,3,2
2024-02-05T08:55:00+02:00,Pacientas,Registratūros QR kodas,4,5,4,Ne,,4`;
    const DEFAULT_ED_CSV = `Šiuo metu pacientų,Užimta lovų,Slaugytojų - pacientų santykis,Gydytojų - pacientų santykis,1 kategorijos pacientų,2 kategorijos pacientų,3 kategorijos pacientų,4 kategorijos pacientų,5 kategorijos pacientų
14,11,1:4,1:7,3,4,4,2,1
18,13,1:5,1:8,4,5,5,3,1
20,15,1:5,1:9,5,6,5,3,1
16,12,1:4.5,1:8,3,4,5,3,1
12,9,1:4,1:7,2,3,4,2,1
22,17,1:5.5,1:10,4,6,6,4,2
19,14,1:5,1:8.5,4,5,5,3,2
15,11,1:4.2,1:7.5,3,4,4,3,1
17,13,1:4.8,1:8.2,3,5,5,3,1
21,16,1:5.4,1:9.5,4,6,6,4,1`;
    const DEFAULT_ED_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTx5aS_sRmpVE78hB57h6J2C2r3OQAKm4T2qoC4JBfY7hFm97prfSajgtQHzitrcqzQx5GZefyEY2vR/pub?gid=715561082&single=true&output=csv';
    const ED_TOTAL_BEDS = 29;
    const FEEDBACK_RATING_MIN = 1;
    const FEEDBACK_RATING_MAX = 5;
    const FEEDBACK_LEGACY_MAX = 10;
    const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // Automatinio atnaujinimo intervalas (5 min). Keiskite čia, jei reikia kito dažnio.
    let autoRefreshTimerId = null;
    /**
     * Konfigūracija tekstams ir greitiems pakeitimams (LT numatytasis, lengva išplėsti EN).
     */
    const TEXT = {
      title: 'RŠL SMPS statistika',
      subtitle: 'Greita statistikos apžvalga.',
      settings: 'Nustatymai',
      theme: {
        toggle: 'Perjungti šviesią/tamsią temą',
        light: 'Šviesi tema',
        dark: 'Tamsi tema',
        contrastWarning: 'Dėmesio: pasirinkta tema gali turėti nepakankamą KPI kortelių kontrastą. Apsvarstykite kitą temą.',
      },
      scrollTop: 'Grįžti į pradžią',
      tabs: {
        overview: 'Bendras vaizdas',
        ed: 'RŠL SMPS skydelis',
      },
      edToggle: {
        open: (label) => `Atidaryti ${label}`,
        close: (label) => `Uždaryti ${label}`,
      },
      status: {
        loading: 'Kraunama...',
        error: 'Nepavyko įkelti duomenų. Patikrinkite ryšį ir bandykite dar kartą.',
        success: (timestamp) => `Atnaujinta ${timestamp}`,
        fallbackSuccess: (timestamp) => `Rodomi demonstraciniai duomenys (bandyta ${timestamp})`,
        fallbackNote: (reason) => `Nepavyko pasiekti nuotolinio šaltinio: ${reason}.`,
        errorDetails: (details) => `Nepavyko įkelti duomenų${details ? ` (${details})` : ''}.`,
        errorAdvice: 'Patikrinkite, ar „Google Sheet“ paskelbta pasirinkus „File → Share → Publish to web → CSV“.',
      },
      footer: (timestamp) => `Atnaujinta ${timestamp}`,
      footerFallback: (timestamp) => `Rodoma demonstracinė versija (atnaujinta ${timestamp})`,
      ed: {
        title: 'RŠL SMPS skydelis',
        closeButton: (label) => `Grįžti į ${label}`,
        status: {
          loading: 'Kraunama...',
          empty: 'ED duomenų nerasta.',
          success: (timestamp) => (timestamp ? `Atnaujinta ${timestamp}` : 'Duomenys sėkmingai atnaujinti'),
          fallback: (reason, timestamp) => `Rodomi ED demonstraciniai duomenys${timestamp ? ` (${timestamp})` : ''}. Priežastis: ${reason}`,
          error: (reason) => `Nepavyko įkelti ED duomenų: ${reason}`,
          noUrl: 'Nenurodytas ED duomenų URL. Rodomi demonstraciniai duomenys.',
        },
        cardSections: {
          default: {
            title: 'Skydelio rodikliai',
            description: '',
            icon: 'flow',
          },
          flow: {
            title: 'Pacientų srautas',
            description: '',
            icon: 'flow',
          },
          staffing: {
            title: 'Komanda ir lovos',
            description: '',
            icon: 'staffing',
          },
          efficiency: {
            title: 'Procesų trukmės',
            description: '',
            icon: 'efficiency',
          },
          insights: {
            title: 'Įžvalgos',
            description: 'Srautų disbalanso ir procesų apkrovos indikatoriai.',
            icon: 'insights',
          },
        },
        cards: {
          legacy: [
            {
              key: 'avgDailyPatients',
              title: 'Vid. pacientų per dieną',
              description: 'Skaičiuojama pagal dienas, kuriose yra duomenų.',
              empty: '—',
              format: 'oneDecimal',
              section: 'flow',
            },
            {
              key: 'hospitalizedShare',
              title: 'Hospitalizacijų dalis',
              description: 'Pacientų dalis, kuriems prireikė stacionaro.',
              empty: '—',
              format: 'percent',
              section: 'flow',
            },
            {
              key: 'hospitalizedMonthShare',
              title: 'Hospitalizacijų dalis (šis mėn.)',
              description: 'Šio mėnesio hospitalizacijų dalis.',
              empty: '—',
              format: 'percent',
              section: 'flow',
            },
            {
              key: 'dispositionsDonut',
              title: 'Pacientų pasiskirstymas',
              description: 'Naujausių duomenų dalys pagal kategoriją.',
              empty: '—',
              type: 'donut',
              section: 'flow',
            },
            { 
              key: 'avgLosMinutes',
              title: 'Vid. buvimo trukmė',
              description: 'Vidutinė buvimo trukmė skyriuje.',
              empty: '—',
              format: 'hours',
              section: 'efficiency',
            },
            {
              key: 'avgDoorToProviderMinutes',
              title: 'Vid. iki gydytojo',
              description: 'Vidutinis „durys iki gydytojo“ laikas (min.).',
              empty: '—',
              format: 'minutes',
              section: 'efficiency',
            },
            { 
              key: 'avgLosMonthMinutes',
              title: 'Vid. laikas skyriuje (šis mėn.)',
              description: 'Šio mėnesio vidutinė buvimo trukmė (val.).',
              empty: '—',
              format: 'hours',
              section: 'efficiency',
            },
            { 
              key: 'avgLabMonthMinutes',
              title: 'Vid. lab. tyrimų laikas',
              description: 'Šio mėnesio laboratorinių tyrimų trukmė (min.).',
              empty: '—',
              format: 'minutes',
              section: 'efficiency',
            },
            {
              key: 'peakWindowText',
              title: 'Piko langai',
              description: 'Top 3 atvykimo ir išvykimo valandos.',
              empty: 'Nėra pakankamai duomenų.',
              format: 'text',
              metaKey: 'peakWindowRiskNote',
              section: 'insights',
            },
            {
              key: 'losVariabilityIndex',
              title: 'LOS variacijos indeksas',
              description: 'P90/P50 buvimo trukmės santykis.',
              empty: '—',
              format: 'multiplier',
              metaKey: 'losPercentilesText',
              section: 'insights',
            },
            {
              key: 'taktTimeMinutes',
              title: 'Taktinis laikas',
              description: 'Min. vienam pacientui pagal srautą.',
              empty: '—',
              format: 'minutes',
              metaKey: 'taktTimeMeta',
              section: 'insights',
            },
            {
              key: 'fastSlowSplitValue',
              title: '„Fast lane“ vs „Slow lane“',
              description: 'LOS < 2 val. ir > 8 val. pasiskirstymas.',
              empty: 'Nėra pakankamai duomenų.',
              format: 'text',
              metaKey: 'fastSlowTrendText',
              section: 'insights',
            },
          ],
          snapshot: [
            {
              key: 'currentPatients',
              title: 'Pacientai skyriuje dabar',
              description: '',
              empty: '—',
              section: 'flow',
            },
            {
              key: 'occupiedBeds',
              title: 'Užimtos lovos dabar',
              description: '',
              empty: '—',
              format: 'beds',
              section: 'staffing',
            },
            {
              key: 'avgLosMonthMinutes',
              title: 'Vidutinis laikas',
              description: 'Vidutinė buvimo trukmė skyriuje.',
              empty: '—',
              format: 'hours',
              section: 'efficiency',
            },
            {
              key: 'hospitalizedMonthShare',
              title: 'Hospitalizacijų dalis (šis mėn.)',
              description: '',
              empty: '—',
              format: 'percent',
              section: 'flow',
            },
            {
              key: 'dispositionsDonut',
              title: 'Pacientų pasiskirstymas',
              description: 'Naujausių duomenų dalys pagal kategoriją.',
              empty: '—',
              type: 'donut',
              section: 'flow',
            },
            { 
              key: 'avgLabMonthMinutes',
              title: 'Vid. lab. tyrimų laikas',
              description: 'Šių metų laboratorinių tyrimų trukmė.',
              empty: '—',
              format: 'minutes',
              section: 'efficiency',
            },
          ],
        },
        dispositions: {
          legacy: {
            title: 'Pacientų išvykimo sprendimai',
            caption: 'Pacientų išvykimo sprendimų pasiskirstymas.',
            empty: 'Nėra duomenų apie išvykimo sprendimus.',
            centerLabel: 'Viso pacientų',
            centerMetaDefault: 'Pasirinkite sprendimą, kad matytumėte jo dalį.',
            centerShareSuffix: 'viso srauto',
            legendTitle: 'Išvykimo sprendimų kategorijos',
            legendHint: 'Užveskite arba spauskite, kad išryškintumėte grafike.',
            legendAction: 'Išryškinti kategoriją grafike',
          },
          snapshot: {
            title: 'Pasiskirstymas pagal ESI',
            caption: 'Pacientų pasiskirstymas pagal naujausią įrašą.',
            empty: 'Nėra kategorijų duomenų.',
            legendTitle: 'Pacientų kategorijos',
            legendHint: '',
            legendAction: '',
            centerShareSuffix: 'viso pasiskirstymo',
          },
        },
        triage: {
          category1: '1 kategorija',
          category2: '2 kategorija',
          category3: '3 kategorija',
          category4: '4 kategorija',
          category5: '5 kategorija',
        },
        ratioLabels: {
          nurses: 'Slaugyt.',
          doctors: 'Gyd.',
        },
      },
      kpis: {
        title: 'Pagrindiniai rodikliai',
        subtitle: 'Paskutinė pamaina ir palyginimas su metiniu vidurkiu',
        windowAllLabel: 'Visas laikotarpis',
        windowAllShortLabel: 'viso laik.',
        windowYearSuffix: 'metai',
        monthPrefix: 'Šis mėnuo',
        monthPrefixShort: 'Šis mėnuo',
        monthNoData: 'Šio mėnesio duomenų nėra.',
        monthNoDataShort: 'Šio mėn. duomenų nėra',
        shareNoData: 'Nepavyko apskaičiuoti dalies.',
        noYearData: 'Pasirinktam laikotarpiui apskaičiuoti nepakanka duomenų.',
        primaryNoData: '—',
        summary: {
          title: 'Paskutinės pamainos santrauka',
          period: 'Pamaina',
          periodFallback: 'Pamainos data nenustatyta.',
          reference: 'Lyginama su',
          referenceFallback: 'Metinis vidurkis',
          weekdayReference: (weekday) => `Metinis vidurkis (${weekday})`,
          month: 'Šio mėnesio duomenys',
          noMonth: 'Šio mėnesio duomenų nėra.',
          unknownPeriod: 'Nenurodytas laikotarpis',
        },
        cards: [
          { metricKey: 'total', label: 'Pacientai', format: 'integer', unitLabel: 'pac.' },
          { metricKey: 'night', label: 'Naktiniai pacientai', format: 'integer', unitLabel: 'pac.' },
          { metricKey: 'hospitalized', label: 'Hospitalizuoti', format: 'integer', unitLabel: 'pac.' },
          { metricKey: 'discharged', label: 'Išleisti', format: 'integer', unitLabel: 'pac.' },
        ],
        monthly: {
          title: 'Šio mėnesio vidurkiai',
          subtitle: 'Vidurkis per dieną lyginant su metiniu vidurkiu.',
          mainLabel: 'Šio mėn. vid.',
          referenceLabel: (referenceLabel) => referenceLabel || 'Metinis vidurkis',
          averageLabel: 'Metinis vidurkis',
          deltaLabel: 'Skirtumas',
          deltaContext: (referenceLabel) => (referenceLabel ? `vs ${referenceLabel}` : ''),
          emptyTitle: 'Šio mėnesio vidurkiai',
          empty: 'Šio mėnesio duomenų nėra.',
          primaryNoData: '—',
          cards: [
            { metricKey: 'patientsPerDay', label: 'Pacientai / d.', format: 'oneDecimal', unitLabel: 'pac./d.' },
            { metricKey: 'nightPerDay', label: 'Naktiniai pacientai / d.', format: 'oneDecimal', unitLabel: 'pac./d.' },
            { metricKey: 'dischargedPerDay', label: 'Išleisti / d.', format: 'oneDecimal', unitLabel: 'pac./d.', shareKey: 'dischargedShare' },
            { metricKey: 'hospitalizedPerDay', label: 'Hospitalizuoti / d.', format: 'oneDecimal', unitLabel: 'pac./d.', shareKey: 'hospitalizedShare' },
          ],
        },
        detailLabels: {
          delta: 'Δ',
          average: 'Vidurkis',
          averageContext: (weekday) => (weekday ? `(${weekday})` : ''),
        },
        deltaNoData: 'Nėra duomenų palyginimui.',
        averageNoData: 'Vidurkio nėra.',
        deltaContext: (reference) => {
          if (!reference) {
            return '';
          }
          const normalized = reference.replace(/^Metinis vidurkis/i, 'vid.');
          return `vs ${normalized}`;
        },
        mainValueLabel: '',
      },
      charts: {
        title: 'Pacientų srautai',
        subtitle: 'Kasdieniai skaičiai, srautas pagal sprendimą ir atvykimų žemėlapis',
        dailyCaption: 'Kasdieniai pacientų srautai (paskutinės 30 dienų).',
        dailyContext: () => '',
        dowCaption: 'Vidutinis pacientų skaičius pagal savaitės dieną.',
        dowStayCaption: 'Vidutinė buvimo trukmė pagal savaitės dieną.',
        dowStayLabel: 'Vidutinė trukmė (val.)',
        funnelCaption: 'Pacientų srautas pagal sprendimą (atvykę → sprendimas).',
        funnelCaptionWithYear: (year) => (year
          ? `Pacientų srautas pagal sprendimą – ${year} m. (atvykę → sprendimas).`
          : 'Pacientų srautas pagal sprendimą (atvykę → sprendimas).'),
        yearFilterLabel: 'Metai',
        yearFilterAll: 'Visi metai',
        empty: 'Šiam grafikui kol kas trūksta duomenų.',
        funnelSteps: [
          { key: 'arrived', label: 'Atvykę' },
          { key: 'discharged', label: 'Išleisti' },
          { key: 'hospitalized', label: 'Hospitalizuoti' },
        ],
        funnelEmpty: 'Piltuvėlio sugeneruoti nepavyko – šiuo metu nėra atvykimų duomenų.',
        heatmapCaption: (metricLabel) => (metricLabel
          ? `Pasirinkto rodiklio („${metricLabel}“) reikšmės pagal savaitės dieną ir valandą.`
          : 'Rodikliai pagal savaitės dieną ir valandą.'),
        heatmapEmpty: 'Šiame laikotarpyje nėra duomenų pasirinktai kombinacijai.',
        heatmapLegend: 'Tamsesnė spalva reiškia didesnę pasirinktą reikšmę.',
        heatmapMetricLabel: 'Rodiklis',
        heatmapMetricOptions: {
          arrivals: 'Atvykimų skaičius / d.',
          discharges: 'Išleidimų skaičius / d.',
          hospitalized: 'Hospitalizacijų skaičius / d.',
          avgDuration: 'Vidutinė buvimo trukmė (val.)',
        },
        heatmapMetricUnits: {
          arrivals: 'pac./d.',
          discharges: 'pac./d.',
          hospitalized: 'pac./d.',
          avgDuration: 'val.',
        },
        heatmapMetricDescriptions: {
          arrivals: 'atvykimų (vid. per dieną)',
          discharges: 'išleidimų (vid. per dieną)',
          hospitalized: 'hospitalizacijų (vid. per dieną)',
          avgDuration: 'vidutinė buvimo trukmė (val.)',
        },
        errorLoading: 'Nepavyko atvaizduoti grafikų (Chart.js biblioteka nepasiekiama).',
      },
      insights: {
        title: 'Įžvalgos',
        subtitle: '„Boarding“ langai ir procesų apkrovos indikatoriai.',
        empty: 'Įžvalgoms sugeneruoti kol kas trūksta duomenų.',
        cards: [
          {
            key: 'peakWindowText',
            title: 'Piko langai',
            description: 'Top 3 atvykimų ir išvykimų valandos.',
            format: 'text',
            metaKey: 'peakWindowRiskNote',
            empty: 'Nėra pakankamai duomenų.',
          },
          {
            key: 'losVariabilityIndex',
            title: 'LOS variacijos indeksas',
            description: 'P90/P50 buvimo trukmės santykis.',
            format: 'multiplier',
            metaKey: 'losPercentilesText',
            empty: '—',
          },
          {
            key: 'taktTimeMinutes',
            title: 'Taktinis laikas',
            description: 'Minutės vienam pacientui pagal srautą.',
            format: 'minutes',
            unit: 'min.',
            metaKey: 'taktTimeMeta',
            empty: '—',
          },
          {
            key: 'fastSlowSplitValue',
            title: '„Fast lane“ vs „Slow lane“',
            description: 'LOS < 2 val. ir > 8 val. dalys.',
            format: 'text',
            metaKey: 'fastSlowTrendText',
            empty: 'Nėra pakankamai duomenų.',
          },
        ],
      },
      recent: {
        title: 'Paskutinės 7 dienos',
        subtitle: 'Kasdienė suvestinė pagal naujausius duomenis.',
        caption: 'Paskutinių 7 kalendorinių dienų pacientų ir trukmės suvestinė.',
        empty: 'Šiame laikotarpyje duomenų nėra.',
      },
      monthly: {
        title: 'Mėnesinė suvestinė',
        subtitle: 'Kalendoriniai mėnesiai (paskutiniai 12 mėnesių).',
        caption: 'Mėnesių pacientų suvestinė: sumos ir vidurkiai.',
        empty: 'Duomenų lentelė bus parodyta užkrovus failą.',
        comparisonUnavailable: 'Laukiama pilno mėnesio duomenų palyginimui.',
      },
      yearly: {
        title: 'Metinė suvestinė',
        subtitle: 'Kalendoriniai metai (paskutiniai 5 metai).',
        caption: 'Metinių pacientų suvestinė: sumos ir vidurkiai.',
        empty: 'Metinių duomenų lentelė bus parodyta užkrovus failą.',
        noCompleteYears: 'Šiuo metu nėra pilnų kalendorinių metų rodymui. Kai tik bus sukaupti visi mėnesiai, naujausi metai atsiras automatiškai.',
        comparisonUnavailable: 'Laukiama pilnų metų duomenų palyginimui.',
      },
      feedback: {
        title: 'Pacientų atsiliepimai',
        subtitle: 'Apibendrinti apklausos rezultatai.',
        description: 'Kortelės rodo bendras įžvalgas, lentelė – mėnesines suvestines.',
        empty: 'Kol kas nėra apibendrintų atsiliepimų.',
        trend: {
          title: 'Bendro vertinimo dinamika',
          subtitle: (months) => {
            if (!Number.isFinite(months) || months <= 0) {
              return 'Visų prieinamų mėnesių dinamika';
            }
            const normalized = Math.max(1, Math.round(months));
            if (normalized === 1) {
              return 'Paskutinio mėnesio dinamika';
            }
            return `Paskutinių ${normalized} mėnesių dinamika`;
          },
          controlsLabel: 'Laikotarpis',
          periods: [
            { months: 3, label: '3 mėn.' },
            { months: 6, label: '6 mėn.' },
            { months: 12, label: '12 mėn.' },
          ],
          empty: 'Trendo grafikas bus parodytas, kai atsiras bent vienas mėnuo su bendru įvertinimu.',
          unavailable: 'Nepavyko atvaizduoti trendo grafiko. Patikrinkite ryšį ir bandykite dar kartą.',
          aria: (label, from, to) => {
            if (from && to && from !== to) {
              return `${label} mėnesių trendas nuo ${from} iki ${to}.`;
            }
            if (from) {
              return `${label} mėnesio trendas (${from}).`;
            }
            return `${label} mėnesio trendas.`;
          },
          averageLabel: 'Vidutinis įvertinimas',
          responsesLabel: 'Atsakymų skaičius',
          summary: (info) => {
            if (!info || typeof info !== 'object') {
              return '';
            }
            const parts = [];
            if (info.average?.formatted) {
              parts.push(`Vidurkis ${info.average.formatted}`);
            }
            if (info.best?.label && info.best?.formatted) {
              parts.push(`Geriausias ${info.best.label} (${info.best.formatted})`);
            }
            if (info.worst?.label && info.worst?.formatted) {
              parts.push(`Silpniausias ${info.worst.label} (${info.worst.formatted})`);
            }
            if (info.responses?.minFormatted && info.responses?.maxFormatted) {
              if (info.responses.minFormatted === info.responses.maxFormatted) {
                parts.push(`${info.responses.label || 'Atsakymai/mėn.'}: ${info.responses.minFormatted}`);
              } else {
                parts.push(`${info.responses.label || 'Atsakymai/mėn.'}: ${info.responses.minFormatted}–${info.responses.maxFormatted}`);
              }
            }
            return parts.join(' • ');
          },
        },
        filters: {
          summaryLabel: 'Rodoma:',
          summaryDefault: 'Rodomi visi atsakymai',
          countLabel: 'Atsakymai',
          missing: 'Nenurodyta',
          respondent: {
            label: 'Kas pildo anketą',
            all: 'Visi dalyviai',
          },
          location: {
            label: 'Šaltinis',
            all: 'Visos vietos',
          },
        },
        cards: [
          {
            key: 'overallAverage',
            title: 'Bendra patirtis',
            description: 'Vidurkis (1–5) pagal bendros patirties klausimą.',
            empty: 'Nėra vertinimų.',
            format: 'decimal',
            countKey: 'overallCount',
          },
          {
            key: 'doctorsAverage',
            title: 'Gydytojų darbas',
            description: 'Vidurkis (1–5) apie gydytojų darbą.',
            empty: 'Nėra vertinimų.',
            format: 'decimal',
            countKey: 'doctorsCount',
          },
          {
            key: 'nursesAverage',
            title: 'Slaugytojų darbas',
            description: 'Vidurkis (1–5) apie slaugytojų darbą.',
            empty: 'Nėra vertinimų.',
            format: 'decimal',
            countKey: 'nursesCount',
          },
          {
            key: 'aidesAverage',
            title: 'Slaugytojų padėjėjų darbas',
            description: 'Vidurkis (1–5) iš pacientų, bendravusių su padėjėjais.',
            empty: 'Nėra duomenų.',
            format: 'decimal',
            countKey: 'aidesResponses',
          },
          {
            key: 'waitingAverage',
            title: 'Laukimo laikas',
            description: 'Vidutinis laukimo vertinimas (1–5).',
            empty: 'Nėra vertinimų.',
            format: 'decimal',
            countKey: 'waitingCount',
          },
          {
            key: 'totalResponses',
            title: 'Užpildytos formos',
            description: 'Bendras gautų atsakymų skaičius.',
            empty: '0',
            format: 'integer',
          },
        ],
        table: {
          caption: 'Mėnesio atsiliepimų suvestinė pagal apklausos vertinimus.',
          empty: 'Dar neturime mėnesinių atsiliepimų suvestinių.',
          headers: {
            month: 'Mėnuo',
            responses: 'Atsakymai',
            overall: 'Bendra patirtis (vid. 1–5)',
            doctors: 'Gydytojų darbas (vid. 1–5)',
            nurses: 'Slaugytojų darbas (vid. 1–5)',
            aides: 'Padėjėjų darbas (vid. 1–5)',
            waiting: 'Laukimo vertinimas (vid. 1–5)',
            contact: 'Bendravo su padėjėjais',
          },
          placeholder: '—',
        },
        status: {
          fallback: (reason) => `Atsiliepimai rodomi iš demonstracinio šaltinio: ${reason}`,
          error: (reason) => `Atsiliepimų nepavyko įkelti: ${reason}`,
          missingUrl: 'Nenurodytas atsiliepimų duomenų URL.',
        },
      },
      compare: {
        toggle: 'Palyginti',
        active: 'Uždaryti palyginimą',
        prompt: 'Pasirinkite dvi eilutes lentelėje.',
        insufficient: 'Pasirinkite dar vieną datą palyginimui.',
        summaryTitle: (newer, older) => `${newer} vs ${older}`,
        sparklineTitle: 'Grafiškas palyginimas',
        sparklineFallback: 'Nepakanka duomenų grafiko atvaizdavimui.',
        sparklineAria: (current, previous, diff) => `Pacientų palyginimas: ${current} ir ${previous}. ${diff}.`,
        metrics: {
          total: 'Pacientai',
          avgStay: 'Vid. buvimo trukmė (val.)',
          emsShare: 'GMP dalis',
          hospShare: 'Hospitalizacijų dalis',
        },
      },
    };

    const DEFAULT_FOOTER_SOURCE = '';
    const DEFAULT_KPI_WINDOW_DAYS = 365;
    const DEFAULT_PAGE_TITLE = document.title || 'RŠL SMPS statistika';
    const SETTINGS_STORAGE_KEY = 'edDashboardSettings-v1';
    const THEME_STORAGE_KEY = 'edDashboardTheme';
    const CLIENT_CONFIG_KEY = 'edDashboardClientConfig-v1';
    const CACHE_PREFIXES = ['ed-static', 'ed-api'];

    const clientStore = createClientStore(CLIENT_CONFIG_KEY);
    const perfMonitor = new PerfMonitor();
    let clientConfig = { profilingEnabled: true, ...clientStore.load() };

    const DEFAULT_SETTINGS = {
      dataSource: {
        // Pagrindinis operatyvinių duomenų šaltinis (Google Sheets → Publish to CSV)
        url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS8xfS3FxpD5pT6rm-ClSf9DjV3usXjvJG4uKj7aC3_QtThtXidQZaN0ZQe9SEMOXB94XeLshwwLUSW/pub?gid=706041848&single=true&output=csv',
        useFallback: true,
        fallbackCsv: DEFAULT_DEMO_CSV,
        feedback: {
          url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTr4ghdkkUJw5pYjb7nTDgoGdaTIUjLT7bD_8q05QyBNR4Z-tTVqhWMvXGemJUIneXyyUF_8-O-EftK/pub?gid=369777093&single=true&output=csv',
          useFallback: true,
          fallbackCsv: DEFAULT_FEEDBACK_CSV,
        },
        ed: {
          url: DEFAULT_ED_SOURCE_URL,
          useFallback: true,
          fallbackCsv: DEFAULT_ED_CSV,
        },
        historical: {
          enabled: true,
          label: 'Papildomas istorinis (5 metai)',
          url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSOtG7CuPVq_nYNTuhTnNiGnyzg93HK2JcPjYcuJ442EiMPz9HYXsBi1niQNj5Yzg/pub?output=csv',
          useFallback: false,
          fallbackCsv: '',
        },
      },
      csv: {
        arrival: 'Atvykimo data',
        discharge: 'Išrašymo data',
        dayNight: 'Diena/naktis',
        gmp: 'GMP',
        department: 'Nukreiptas į padalinį',
        number: 'Numeris',
        trueValues: '1,true,taip,t,yes,y,GMP,su GMP,GMP (su GMP)',
        hospitalizedValues: '',
        nightKeywords: 'nakt,night',
        dayKeywords: 'dien,ryt,vak,day',
      },
      calculations: {
        windowDays: DEFAULT_KPI_WINDOW_DAYS,
        recentDays: 7,
        nightStartHour: 20,
        nightEndHour: 7,
      },
      output: {
        pageTitle: DEFAULT_PAGE_TITLE,
        title: TEXT.title,
        subtitle: TEXT.subtitle,
        kpiTitle: TEXT.kpis.title,
        kpiSubtitle: TEXT.kpis.subtitle,
        chartsTitle: TEXT.charts.title,
        chartsSubtitle: TEXT.charts.subtitle,
        recentTitle: TEXT.recent.title,
        recentSubtitle: TEXT.recent.subtitle,
        monthlyTitle: TEXT.monthly.title,
        monthlySubtitle: TEXT.monthly.subtitle,
        yearlyTitle: TEXT.yearly.title,
        yearlySubtitle: TEXT.yearly.subtitle,
        feedbackTitle: TEXT.feedback.title,
        feedbackSubtitle: TEXT.feedback.subtitle,
        feedbackDescription: TEXT.feedback.description,
        feedbackTrendTitle: TEXT.feedback.trend.title,
        footerSource: DEFAULT_FOOTER_SOURCE,
        scrollTopLabel: TEXT.scrollTop,
        tabOverviewLabel: TEXT.tabs.overview,
        tabEdLabel: TEXT.tabs.ed,
        edTitle: TEXT.ed.title,
        showRecent: true,
        showMonthly: true,
        showYearly: true,
        showFeedback: true,
      },
    };

    let settings = loadSettings();

    const KPI_WINDOW_OPTION_BASE = [7, 14, 30, 60, 90, 180, 365];
    const KPI_FILTER_LABELS = {
      shift: {
        all: 'visos pamainos',
        day: 'dieninės pamainos',
        night: 'naktinės pamainos',
      },
      arrival: {
        all: 'visi atvykimai',
        ems: 'tik GMP',
        self: 'be GMP',
      },
      disposition: {
        all: 'visos būsenos',
        hospitalized: 'hospitalizuoti',
        discharged: 'išleisti',
      },
      cardType: {
        all: 'visos kortelės',
        t: 'T kortelės',
        tr: 'TR kortelės',
        ch: 'CH kortelės',
      },
    };

    const KPI_FILTER_TOGGLE_LABELS = {
      show: 'Išskleisti filtrus',
      hide: 'Sutraukti filtrus',
    };

    function getDefaultKpiFilters() {
      const configuredWindow = Number.isFinite(Number(settings?.calculations?.windowDays))
        ? Number(settings.calculations.windowDays)
        : DEFAULT_SETTINGS.calculations.windowDays;
      const defaultWindow = Number.isFinite(configuredWindow) && configuredWindow > 0
        ? configuredWindow
        : DEFAULT_KPI_WINDOW_DAYS;
      return {
        window: defaultWindow,
        shift: 'all',
        arrival: 'all',
        disposition: 'all',
        cardType: 'all',
      };
    }

    function getDefaultChartFilters() {
      return {
        arrival: 'all',
        disposition: 'all',
        cardType: 'all',
      };
    }

    function sanitizeKpiFilters(filters) {
      const defaults = getDefaultKpiFilters();
      const normalized = { ...defaults, ...(filters || {}) };
      if (!Number.isFinite(normalized.window) || normalized.window < 0) {
        normalized.window = defaults.window;
      }
      if (!(normalized.shift in KPI_FILTER_LABELS.shift)) {
        normalized.shift = defaults.shift;
      }
      if (!(normalized.arrival in KPI_FILTER_LABELS.arrival)) {
        normalized.arrival = defaults.arrival;
      }
      if (!(normalized.disposition in KPI_FILTER_LABELS.disposition)) {
        normalized.disposition = defaults.disposition;
      }
      if (!(normalized.cardType in KPI_FILTER_LABELS.cardType)) {
        normalized.cardType = defaults.cardType;
      }
      return normalized;
    }

    function sanitizeChartFilters(filters) {
      const defaults = getDefaultChartFilters();
      const normalized = { ...defaults, ...(filters || {}) };
      if (!(normalized.arrival in KPI_FILTER_LABELS.arrival)) {
        normalized.arrival = defaults.arrival;
      }
      if (!(normalized.disposition in KPI_FILTER_LABELS.disposition)) {
        normalized.disposition = defaults.disposition;
      }
      if (!(normalized.cardType in KPI_FILTER_LABELS.cardType)) {
        normalized.cardType = defaults.cardType;
      }
      return normalized;
    }

    const FEEDBACK_FILTER_ALL = 'all';
    const FEEDBACK_FILTER_MISSING = '__missing__';

    function getDefaultFeedbackFilters() {
      return {
        respondent: FEEDBACK_FILTER_ALL,
        location: FEEDBACK_FILTER_ALL,
      };
    }

    // Formatai datoms ir skaičiams (LT locale).
    const numberFormatter = new Intl.NumberFormat('lt-LT');
    const decimalFormatter = new Intl.NumberFormat('lt-LT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const oneDecimalFormatter = new Intl.NumberFormat('lt-LT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const percentFormatter = new Intl.NumberFormat('lt-LT', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const monthFormatter = new Intl.DateTimeFormat('lt-LT', { month: 'long', year: 'numeric' });
    const shortDateFormatter = new Intl.DateTimeFormat('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const monthDayFormatter = new Intl.DateTimeFormat('lt-LT', { month: '2-digit', day: '2-digit' });
    const statusTimeFormatter = new Intl.DateTimeFormat('lt-LT', { dateStyle: 'short', timeStyle: 'short' });
    const tvTimeFormatter = new Intl.DateTimeFormat('lt-LT', { hour: '2-digit', minute: '2-digit' });
    const tvDateFormatter = new Intl.DateTimeFormat('lt-LT', { weekday: 'long', day: '2-digit', month: 'long' });
    const weekdayLongFormatter = new Intl.DateTimeFormat('lt-LT', { weekday: 'long' });
    const textCollator = new Intl.Collator('lt-LT', { sensitivity: 'base', usage: 'sort' });
    const dailyDateFormatter = new Intl.DateTimeFormat('lt-LT', {
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    function capitalizeSentence(text) {
      if (typeof text !== 'string') {
        return '';
      }
      const trimmed = text.trim();
      if (!trimmed) {
        return '';
      }
      return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
    }

    function debounce(fn, delay = 200) {
      let timeoutId;
      return (...args) => {
        window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
          fn(...args);
        }, delay);
      };
    }

    function restartAutoRefreshTimer() {
      if (autoRefreshTimerId) {
        window.clearInterval(autoRefreshTimerId);
      }
      autoRefreshTimerId = window.setInterval(() => {
        loadDashboard();
      }, AUTO_REFRESH_INTERVAL_MS);
    }

    const selectors = {
      hero: document.querySelector('header.hero'),
      title: document.getElementById('pageTitle'),
      subtitle: document.getElementById('pageSubtitle'),
      tabSwitcher: document.getElementById('tabSwitcher'),
      tabButtons: Array.from(document.querySelectorAll('[data-tab-target]')),
      tabPanels: Array.from(document.querySelectorAll('[data-tab-panel]')),
      tabOverview: document.getElementById('tabOverview'),
      edNavButton: document.getElementById('edNavButton'),
      closeEdPanelBtn: document.getElementById('closeEdPanelBtn'),
      overviewPanel: document.getElementById('panelOverview'),
      edPanel: document.getElementById('panelEd'),
      status: document.getElementById('status'),
      footerSource: document.getElementById('footerSource'),
      kpiHeading: document.getElementById('kpiHeading'),
      kpiSubtitle: document.getElementById('kpiSubtitle'),
      kpiSummary: document.getElementById('kpiSummary'),
      kpiGrid: document.getElementById('kpiGrid'),
      chartHeading: document.getElementById('chartHeading'),
      chartSubtitle: document.getElementById('chartSubtitle'),
      dailyCaption: document.getElementById('dailyChartLabel'),
      dailyCaptionContext: document.getElementById('dailyChartContext'),
      dowCaption: document.getElementById('dowChartTitle'),
      dowStayCaption: document.getElementById('dowStayChartTitle'),
      funnelCaption: document.getElementById('funnelChartTitle'),
      heatmapCaption: document.getElementById('arrivalHeatmapTitle'),
      heatmapContainer: document.getElementById('arrivalHeatmap'),
      heatmapMetricSelect: document.getElementById('heatmapMetric'),
      heatmapMetricLabel: document.getElementById('heatmapMetricLabel'),
      chartYearLabel: document.getElementById('chartYearLabel'),
      chartYearSelect: document.getElementById('chartYear'),
      chartPeriodButtons: Array.from(document.querySelectorAll('[data-chart-period]')),
      chartFiltersSummary: document.getElementById('chartFiltersSummary'),
      chartFiltersForm: document.getElementById('chartFiltersForm'),
      chartFilterArrival: document.getElementById('chartArrival'),
      chartFilterDisposition: document.getElementById('chartDisposition'),
      chartFilterCardType: document.getElementById('chartCardType'),
      chartCards: Array.from(document.querySelectorAll('.chart-grid .chart-card')),
      recentHeading: document.getElementById('recentHeading'),
      recentSubtitle: document.getElementById('recentSubtitle'),
      recentCaption: document.getElementById('recentCaption'),
      recentTable: document.getElementById('recentTable'),
      monthlyHeading: document.getElementById('monthlyHeading'),
      monthlySubtitle: document.getElementById('monthlySubtitle'),
      monthlyCaption: document.getElementById('monthlyCaption'),
      monthlyTable: document.getElementById('monthlyTable'),
      yearlyHeading: document.getElementById('yearlyHeading'),
      yearlySubtitle: document.getElementById('yearlySubtitle'),
      yearlyCaption: document.getElementById('yearlyCaption'),
      yearlyTable: document.getElementById('yearlyTable'),
      feedbackHeading: document.getElementById('feedbackHeading'),
      feedbackSubtitle: document.getElementById('feedbackSubtitle'),
      feedbackDescription: document.getElementById('feedbackDescription'),
      feedbackFiltersSummary: document.getElementById('feedbackFiltersSummary'),
      feedbackRespondentFilter: document.getElementById('feedbackRespondentFilter'),
      feedbackRespondentLabel: document.getElementById('feedbackRespondentLabel'),
      feedbackLocationFilter: document.getElementById('feedbackLocationFilter'),
      feedbackLocationLabel: document.getElementById('feedbackLocationLabel'),
      feedbackCaption: document.getElementById('feedbackCaption'),
      feedbackCards: document.getElementById('feedbackCards'),
      feedbackTrendTitle: document.getElementById('feedbackTrendTitle'),
      feedbackTrendSubtitle: document.getElementById('feedbackTrendSubtitle'),
      feedbackTrendControls: document.getElementById('feedbackTrendControls'),
      feedbackTrendControlsLabel: document.getElementById('feedbackTrendControlsLabel'),
      feedbackTrendButtons: Array.from(document.querySelectorAll('[data-trend-months]')),
      feedbackTrendSummary: document.getElementById('feedbackTrendSummary'),
      feedbackTrendMessage: document.getElementById('feedbackTrendMessage'),
      feedbackTrendChart: document.getElementById('feedbackTrendChart'),
      feedbackTable: document.getElementById('feedbackTable'),
      feedbackColumnMonth: document.getElementById('feedbackColumnMonth'),
      feedbackColumnResponses: document.getElementById('feedbackColumnResponses'),
      feedbackColumnOverall: document.getElementById('feedbackColumnOverall'),
      feedbackColumnDoctors: document.getElementById('feedbackColumnDoctors'),
      feedbackColumnNurses: document.getElementById('feedbackColumnNurses'),
      feedbackColumnAides: document.getElementById('feedbackColumnAides'),
      feedbackColumnWaiting: document.getElementById('feedbackColumnWaiting'),
      feedbackColumnContact: document.getElementById('feedbackColumnContact'),
      edHeading: document.getElementById('edHeading'),
      edStatus: document.getElementById('edStatus'),
      edSearchInput: document.getElementById('edSearchInput'),
      edCards: document.getElementById('edCards'),
      edDispositionsTitle: document.getElementById('edDispositionsTitle'),
      edDispositionsChart: document.getElementById('edDispositionsChart'),
      edDispositionsMessage: document.getElementById('edDispositionsMessage'),
      edStandardSection: document.getElementById('edStandardSection'),
      edTvToggleBtn: document.getElementById('toggleTvBtn'),
      edTvPanel: document.getElementById('edTvPanel'),
      edTvTitle: document.getElementById('edTvTitle'),
      edTvSubtitle: document.getElementById('edTvSubtitle'),
      edTvClockTime: document.getElementById('edTvClockTime'),
      edTvClockDate: document.getElementById('edTvClockDate'),
      edTvUpdated: document.getElementById('edTvUpdated'),
      edTvStatusText: document.getElementById('edTvStatusText'),
      edTvNotice: document.getElementById('edTvNotice'),
      edTvPrimaryTitle: document.getElementById('edTvPrimaryTitle'),
      edTvStaffTitle: document.getElementById('edTvStaffTitle'),
      edTvFlowTitle: document.getElementById('edTvFlowTitle'),
      edTvPrimaryMetrics: document.getElementById('edTvPrimaryMetrics'),
      edTvStaffMetrics: document.getElementById('edTvStaffMetrics'),
      edTvFlowMetrics: document.getElementById('edTvFlowMetrics'),
      edTvTriageTitle: document.getElementById('edTvTriageTitle'),
      edTvTriageMeta: document.getElementById('edTvTriageMeta'),
      edTvTriageList: document.getElementById('edTvTriageList'),
      openSettingsBtn: document.getElementById('openSettingsBtn'),
      themeToggleBtn: document.getElementById('themeToggleBtn'),
      settingsDialog: document.getElementById('settingsDialog'),
      settingsForm: document.getElementById('settingsForm'),
      resetSettingsBtn: document.getElementById('resetSettingsBtn'),
      clearDataBtn: document.getElementById('clearDataBtn'),
      cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
      recentSection: document.querySelector('[data-section="recent"]'),
      monthlySection: document.querySelector('[data-section="monthly"]'),
      yearlySection: document.querySelector('[data-section="yearly"]'),
      feedbackSection: document.querySelector('[data-section="feedback"]'),
      kpiControls: document.querySelector('.kpi-controls'),
      kpiFiltersForm: document.getElementById('kpiFiltersForm'),
      kpiWindow: document.getElementById('kpiWindow'),
      kpiShift: document.getElementById('kpiShift'),
      kpiArrival: document.getElementById('kpiArrival'),
      kpiDisposition: document.getElementById('kpiDisposition'),
      kpiCardType: document.getElementById('kpiCardType'),
      kpiFiltersReset: document.getElementById('kpiFiltersReset'),
      kpiFiltersToggle: document.getElementById('kpiFiltersToggle'),
      kpiActiveInfo: document.getElementById('kpiActiveFilters'),
      compareToggle: document.getElementById('compareToggle'),
      compareCard: document.getElementById('compareCard'),
      compareSummary: document.getElementById('compareSummary'),
      compareClear: document.getElementById('compareClear'),
      sectionNav: document.querySelector('.section-nav'),
      sectionNavLinks: Array.from(document.querySelectorAll('.section-nav__link')),
      scrollTopBtn: document.getElementById('scrollTopBtn'),
    };

    const sectionNavState = {
      initialized: false,
      items: [],
      itemBySection: new Map(),
      activeHeadingId: '',
    };

    const sectionNavCompactQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 640px)')
      : null;

    const sectionVisibility = new Map();
    const layoutMetrics = { hero: 0, nav: 0 };
    let sectionObserver = null;
    let layoutRefreshHandle = null;
    let layoutResizeObserver = null;
    let layoutStylesReady = false;
    let layoutStylesReadyPromise = null;
    let layoutRefreshAllowed = false;
    let pendingLayoutRefresh = false;
    const scrollTopState = { visible: false, rafHandle: null };
    const tvState = { clockHandle: null };

    function areStylesheetsLoaded() {
      const sheets = Array.from(document.styleSheets || []);
      if (!sheets.length) {
        return false;
      }
      return sheets.every((sheet) => {
        try {
          return sheet.cssRules != null;
        } catch (error) {
          return true;
        }
      });
    }

    function waitForFontsAndStyles() {
      if (layoutStylesReadyPromise) {
        return layoutStylesReadyPromise;
      }

      const fontsPromise = document.fonts && typeof document.fonts.ready?.then === 'function'
        ? document.fonts.ready.catch(() => undefined)
        : Promise.resolve();

      const stylesheetPromise = new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 40;
        const check = () => {
          if (areStylesheetsLoaded() || attempts >= maxAttempts) {
            resolve();
            return;
          }
          attempts += 1;
          window.setTimeout(check, 50);
        };
        check();
      });

      layoutStylesReadyPromise = Promise.all([fontsPromise, stylesheetPromise]).then(() => {
        layoutStylesReady = true;
        return true;
      });

      return layoutStylesReadyPromise;
    }

    function computeVisibleRatio(rect) {
      if (!rect) {
        return 0;
      }
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const elementHeight = Math.max(rect.height, 1);
      if (viewportHeight <= 0 || elementHeight <= 0) {
        return 0;
      }
      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, viewportHeight);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      return Math.max(0, Math.min(1, visibleHeight / elementHeight));
    }

    function updateLayoutMetrics() {
      const heroElement = selectors.hero || document.querySelector('header.hero');
      const navElement = selectors.sectionNav;
      const heroHeight = heroElement ? heroElement.getBoundingClientRect().height : 0;
      const navHeight = navElement ? navElement.getBoundingClientRect().height : 0;
      layoutMetrics.hero = heroHeight;
      layoutMetrics.nav = navHeight;
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty('--hero-height', `${Math.max(0, heroHeight).toFixed(2)}px`);
      rootStyle.setProperty('--section-nav-height', `${Math.max(0, navHeight).toFixed(2)}px`);
    }

    function getScrollOffset() {
      if (typeof window.scrollY === 'number') {
        return window.scrollY;
      }
      if (typeof window.pageYOffset === 'number') {
        return window.pageYOffset;
      }
      return (document.documentElement && document.documentElement.scrollTop) || (document.body && document.body.scrollTop) || 0;
    }

    function updateScrollTopButtonVisibility() {
      const button = selectors.scrollTopBtn;
      if (!button) {
        return;
      }
      const threshold = Math.max(160, Math.round(layoutMetrics.hero + layoutMetrics.nav + 40));
      const offset = getScrollOffset();
      const shouldShow = offset > threshold;
      if (scrollTopState.visible !== shouldShow) {
        scrollTopState.visible = shouldShow;
        button.dataset.visible = shouldShow ? 'true' : 'false';
      }
      button.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
      button.setAttribute('tabindex', shouldShow ? '0' : '-1');
    }

    function scheduleScrollTopUpdate() {
      if (scrollTopState.rafHandle) {
        return;
      }
      const raf = typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (cb) => window.setTimeout(cb, 16);
      scrollTopState.rafHandle = raf(() => {
        scrollTopState.rafHandle = null;
        updateScrollTopButtonVisibility();
      });
    }

    function initializeScrollTopButton() {
      const button = selectors.scrollTopBtn;
      if (!button) {
        return;
      }
      button.setAttribute('aria-hidden', 'true');
      button.setAttribute('tabindex', '-1');
      updateScrollTopButtonVisibility();
      button.addEventListener('click', () => {
        const prefersReduced = typeof window.matchMedia === 'function'
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (typeof window.scrollTo === 'function') {
          if (!prefersReduced && 'scrollBehavior' in document.documentElement.style) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            window.scrollTo(0, 0);
          }
        } else {
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        }
      });
      window.addEventListener('scroll', scheduleScrollTopUpdate, { passive: true });
      window.addEventListener('resize', scheduleScrollTopUpdate, { passive: true });
    }

    function updateActiveNavLink(headingId) {
      sectionNavState.activeHeadingId = headingId;
      sectionNavState.items.forEach((item) => {
        const isActive = Boolean(headingId) && item.headingId === headingId && !item.link.hidden;
        if (isActive) {
          item.link.setAttribute('aria-current', 'true');
        } else {
          item.link.removeAttribute('aria-current');
        }
        item.link.classList.toggle('is-active', isActive);
      });
    }

    function evaluateActiveSection() {
      if (!sectionNavState.initialized) {
        return;
      }
      const visibleItems = sectionNavState.items.filter((item) => item.section && !item.section.hasAttribute('hidden') && !item.link.hidden);
      if (!visibleItems.length) {
        updateActiveNavLink('');
        return;
      }
      const sorted = visibleItems
        .map((item) => {
          const data = sectionVisibility.get(item.headingId) || { ratio: 0, top: Number.POSITIVE_INFINITY };
          return { item, ratio: data.ratio, top: data.top };
        })
        .sort((a, b) => {
          const ratioDiff = b.ratio - a.ratio;
          if (Math.abs(ratioDiff) > 0.0001) {
            return ratioDiff;
          }
          return a.top - b.top;
        });
      const best = sorted.find((candidate) => candidate.ratio > 0)
        ?? sorted.find((candidate) => candidate.top >= 0)
        ?? sorted[0];
      if (best && best.item.headingId !== sectionNavState.activeHeadingId) {
        updateActiveNavLink(best.item.headingId);
      }
    }

    function updateSectionNavCompactState(forceCompact) {
      if (!selectors.sectionNav) {
        return;
      }

      const isCompact = typeof forceCompact === 'boolean'
        ? forceCompact
        : Boolean(sectionNavCompactQuery?.matches);

      selectors.sectionNav.classList.toggle('section-nav--compact', isCompact);

      selectors.sectionNavLinks.forEach((link) => {
        const labelText = (link.querySelector('.section-nav__label')?.textContent || '').trim();
        if (!labelText) {
          link.removeAttribute('aria-label');
          link.removeAttribute('title');
          return;
        }

        link.setAttribute('aria-label', labelText);
        if (isCompact) {
          link.setAttribute('title', labelText);
        } else {
          link.removeAttribute('title');
        }
      });
    }

    function refreshSectionObserver() {
      const observedItems = sectionNavState.items.filter((item) => item.section && !item.section.hasAttribute('hidden'));
      if (!observedItems.length) {
        if (sectionObserver) {
          sectionObserver.disconnect();
          sectionObserver = null;
        }
        evaluateActiveSection();
        return;
      }
      if (sectionObserver) {
        sectionObserver.disconnect();
      }
      const topOffset = Math.max(
        0,
        Math.round(Math.max(layoutMetrics.hero || 0, layoutMetrics.nav || 0)),
      );
      sectionObserver = new IntersectionObserver(handleSectionIntersection, {
        rootMargin: `-${topOffset}px 0px -55% 0px`,
        threshold: [0.1, 0.25, 0.5, 0.75, 1],
      });
      observedItems.forEach((item) => {
        sectionObserver.observe(item.section);
        const rect = item.section.getBoundingClientRect();
        sectionVisibility.set(item.headingId, {
          ratio: computeVisibleRatio(rect),
          top: rect.top,
        });
      });
      evaluateActiveSection();
    }

    function scheduleLayoutRefresh() {
      if (!sectionNavState.initialized) {
        return;
      }
      if (!layoutRefreshAllowed || !layoutStylesReady) {
        pendingLayoutRefresh = true;
        return;
      }
      if (typeof window.requestAnimationFrame !== 'function') {
        updateLayoutMetrics();
        refreshSectionObserver();
        updateScrollTopButtonVisibility();
        return;
      }
      if (layoutRefreshHandle) {
        window.cancelAnimationFrame(layoutRefreshHandle);
      }
      layoutRefreshHandle = window.requestAnimationFrame(() => {
        layoutRefreshHandle = null;
        updateLayoutMetrics();
        refreshSectionObserver();
        updateScrollTopButtonVisibility();
      });
    }

    function flushPendingLayoutRefresh() {
      if (pendingLayoutRefresh && layoutRefreshAllowed && layoutStylesReady) {
        pendingLayoutRefresh = false;
        scheduleLayoutRefresh();
      }
    }

    function handleSectionIntersection(entries) {
      entries.forEach((entry) => {
        const item = sectionNavState.itemBySection.get(entry.target);
        if (!item) {
          return;
        }
        if (item.link.hidden || (item.section && item.section.hasAttribute('hidden'))) {
          sectionVisibility.set(item.headingId, { ratio: 0, top: Number.POSITIVE_INFINITY });
          return;
        }
        sectionVisibility.set(item.headingId, {
          ratio: entry.isIntersecting ? entry.intersectionRatio : 0,
          top: entry.boundingClientRect.top,
        });
      });
      evaluateActiveSection();
    }

    function handleNavKeydown(event) {
      if (!sectionNavState.initialized) {
        return;
      }
      const controllableKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
      if (!controllableKeys.includes(event.key)) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLAnchorElement)) {
        return;
      }
      const visibleLinks = sectionNavState.items
        .map((item) => item.link)
        .filter((link) => link && !link.hidden && !link.hasAttribute('aria-hidden'));
      if (!visibleLinks.length) {
        return;
      }
      const currentIndex = visibleLinks.indexOf(target);
      if (currentIndex === -1) {
        return;
      }
      event.preventDefault();
      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % visibleLinks.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + visibleLinks.length) % visibleLinks.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = visibleLinks.length - 1;
      }
      const nextLink = visibleLinks[nextIndex];
      if (nextLink && typeof nextLink.focus === 'function') {
        nextLink.focus({ preventScroll: true });
      }
    }

    function setupNavKeyboardNavigation() {
      if (!selectors.sectionNav || selectors.sectionNav.dataset.keyboard === 'bound') {
        return;
      }
      selectors.sectionNav.addEventListener('keydown', handleNavKeydown);
      selectors.sectionNav.dataset.keyboard = 'bound';
    }

    function syncSectionNavVisibility() {
      if (!sectionNavState.initialized) {
        return;
      }
      let hasVisible = false;
      sectionNavState.items.forEach((item) => {
        const { link, section } = item;
        const sectionVisible = Boolean(section) && !section.hasAttribute('hidden');
        if (sectionVisible) {
          hasVisible = true;
          link.hidden = false;
          link.removeAttribute('aria-hidden');
          link.removeAttribute('tabindex');
          const rect = section.getBoundingClientRect();
          sectionVisibility.set(item.headingId, {
            ratio: computeVisibleRatio(rect),
            top: rect.top,
          });
        } else {
          link.hidden = true;
          link.setAttribute('aria-hidden', 'true');
          link.setAttribute('tabindex', '-1');
          sectionVisibility.set(item.headingId, { ratio: 0, top: Number.POSITIVE_INFINITY });
          if (sectionObserver && section) {
            sectionObserver.unobserve(section);
          }
        }
      });

      if (!hasVisible) {
        updateActiveNavLink('');
      } else if (!sectionNavState.activeHeadingId) {
        const firstVisible = sectionNavState.items.find((item) => !item.link.hidden);
        if (firstVisible) {
          updateActiveNavLink(firstVisible.headingId);
        }
      } else {
        const activeItem = sectionNavState.items.find((item) => item.headingId === sectionNavState.activeHeadingId);
        if (!activeItem || activeItem.link.hidden) {
          const firstVisible = sectionNavState.items.find((item) => !item.link.hidden);
          updateActiveNavLink(firstVisible ? firstVisible.headingId : '');
        }
      }

      evaluateActiveSection();
      scheduleLayoutRefresh();
    }

    function initializeSectionNavigation() {
      if (sectionNavState.initialized) {
        scheduleLayoutRefresh();
        return;
      }
      if (!selectors.sectionNav) {
        return;
      }
      layoutRefreshAllowed = true;
      const links = Array.from(selectors.sectionNav.querySelectorAll('.section-nav__link'));
      selectors.sectionNavLinks = links;
      sectionNavState.items = [];
      sectionNavState.itemBySection = new Map();
      sectionVisibility.clear();

      links.forEach((link) => {
        const href = link.getAttribute('href') || '';
        const headingId = href.startsWith('#') ? href.slice(1) : '';
        const headingEl = headingId ? document.getElementById(headingId) : null;
        const sectionEl = headingEl ? headingEl.closest('section[data-section]') : null;
        if (!headingId || !sectionEl) {
          link.hidden = true;
          link.setAttribute('aria-hidden', 'true');
          link.setAttribute('tabindex', '-1');
          return;
        }
        const item = { link, headingId, section: sectionEl };
        sectionNavState.items.push(item);
        sectionNavState.itemBySection.set(sectionEl, item);
        sectionVisibility.set(headingId, { ratio: 0, top: Number.POSITIVE_INFINITY });
      });

      if (!sectionNavState.items.length) {
        return;
      }

      selectors.sectionNavLinks = sectionNavState.items.map((item) => item.link);

      updateSectionNavCompactState();
      if (sectionNavCompactQuery) {
        const handleCompactChange = (event) => updateSectionNavCompactState(event.matches);
        if (typeof sectionNavCompactQuery.addEventListener === 'function') {
          sectionNavCompactQuery.addEventListener('change', handleCompactChange);
        } else if (typeof sectionNavCompactQuery.addListener === 'function') {
          sectionNavCompactQuery.addListener(handleCompactChange);
        }
      }

      sectionNavState.initialized = true;
      setupNavKeyboardNavigation();

      if (typeof ResizeObserver === 'function') {
        if (layoutResizeObserver && typeof layoutResizeObserver.disconnect === 'function') {
          layoutResizeObserver.disconnect();
        }
        layoutResizeObserver = new ResizeObserver(() => {
          scheduleLayoutRefresh();
        });
        if (selectors.hero) {
          layoutResizeObserver.observe(selectors.hero);
        }
        if (selectors.sectionNav) {
          layoutResizeObserver.observe(selectors.sectionNav);
        }
      }

      window.addEventListener('resize', scheduleLayoutRefresh, { passive: true });
      window.addEventListener('load', scheduleLayoutRefresh);

      syncSectionNavVisibility();
      waitForFontsAndStyles().then(() => {
        updateLayoutMetrics();
        refreshSectionObserver();
        updateScrollTopButtonVisibility();
        flushPendingLayoutRefresh();
      });
    }

    function cloneSettings(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function deepMerge(target, source) {
      if (!source || typeof source !== 'object') {
        return target;
      }
      Object.entries(source).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          target[key] = value.slice();
        } else if (value && typeof value === 'object') {
          if (!target[key] || typeof target[key] !== 'object') {
            target[key] = {};
          }
          deepMerge(target[key], value);
        } else if (value !== undefined) {
          target[key] = value;
        }
      });
      return target;
    }

    function updateClientConfig(patch = {}) {
      if (!patch || typeof patch !== 'object') {
        return clientConfig;
      }
      clientConfig = { ...clientConfig, ...patch };
      clientStore.save(clientConfig);
      return clientConfig;
    }

    function clampNumber(value, min, max, fallback) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        let result = parsed;
        if (Number.isFinite(min) && result < min) {
          result = min;
        }
        if (Number.isFinite(max) && result > max) {
          result = max;
        }
        return result;
      }
      return fallback;
    }

    function normalizeSettings(rawSettings) {
      const originalSettings = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
      let sanitizedSettings = {};
      if (originalSettings && typeof originalSettings === 'object') {
        try {
          sanitizedSettings = cloneSettings(originalSettings);
        } catch (error) {
          console.warn('Nepavyko nukopijuoti išsaugotų nustatymų, naudojami tik numatytieji.', error);
          sanitizedSettings = {};
        }
      }

      const merged = deepMerge(cloneSettings(DEFAULT_SETTINGS), sanitizedSettings ?? {});
      merged.dataSource.url = (merged.dataSource.url ?? '').trim();
      merged.dataSource.useFallback = Boolean(merged.dataSource.useFallback);
      merged.dataSource.fallbackCsv = typeof merged.dataSource.fallbackCsv === 'string'
        ? merged.dataSource.fallbackCsv
        : DEFAULT_SETTINGS.dataSource.fallbackCsv;
      if (!merged.dataSource.feedback || typeof merged.dataSource.feedback !== 'object') {
        merged.dataSource.feedback = cloneSettings(DEFAULT_SETTINGS.dataSource.feedback);
      }
      merged.dataSource.feedback.url = (merged.dataSource.feedback.url ?? '').trim();
      merged.dataSource.feedback.useFallback = Boolean(merged.dataSource.feedback.useFallback);
      merged.dataSource.feedback.fallbackCsv = typeof merged.dataSource.feedback.fallbackCsv === 'string'
        ? merged.dataSource.feedback.fallbackCsv
        : DEFAULT_SETTINGS.dataSource.feedback.fallbackCsv;

      if (!merged.dataSource.ed || typeof merged.dataSource.ed !== 'object') {
        merged.dataSource.ed = cloneSettings(DEFAULT_SETTINGS.dataSource.ed);
      }
      merged.dataSource.ed.url = (merged.dataSource.ed.url ?? '').trim();
      merged.dataSource.ed.useFallback = Boolean(merged.dataSource.ed.useFallback);
      merged.dataSource.ed.fallbackCsv = typeof merged.dataSource.ed.fallbackCsv === 'string'
        ? merged.dataSource.ed.fallbackCsv
        : DEFAULT_SETTINGS.dataSource.ed.fallbackCsv;

      if (!merged.dataSource.historical || typeof merged.dataSource.historical !== 'object') {
        merged.dataSource.historical = cloneSettings(DEFAULT_SETTINGS.dataSource.historical);
      }
      merged.dataSource.historical.enabled = merged.dataSource.historical.enabled !== false;
      merged.dataSource.historical.url = (merged.dataSource.historical.url ?? '').trim();
      merged.dataSource.historical.useFallback = Boolean(merged.dataSource.historical.useFallback);
      merged.dataSource.historical.fallbackCsv = typeof merged.dataSource.historical.fallbackCsv === 'string'
        ? merged.dataSource.historical.fallbackCsv
        : DEFAULT_SETTINGS.dataSource.historical.fallbackCsv;
      merged.dataSource.historical.label = merged.dataSource.historical.label != null
        ? String(merged.dataSource.historical.label)
        : DEFAULT_SETTINGS.dataSource.historical.label;

      ['arrival', 'discharge', 'dayNight', 'gmp', 'department', 'number', 'trueValues', 'hospitalizedValues', 'nightKeywords', 'dayKeywords']
        .forEach((key) => {
          merged.csv[key] = merged.csv[key] != null
            ? String(merged.csv[key])
            : String(DEFAULT_SETTINGS.csv[key] ?? '');
        });

      merged.calculations.windowDays = clampNumber(
        merged.calculations.windowDays,
        7,
        365,
        DEFAULT_SETTINGS.calculations.windowDays,
      );
      merged.calculations.recentDays = clampNumber(
        merged.calculations.recentDays,
        1,
        60,
        DEFAULT_SETTINGS.calculations.recentDays,
      );
      merged.calculations.nightStartHour = clampNumber(
        merged.calculations.nightStartHour,
        0,
        23,
        DEFAULT_SETTINGS.calculations.nightStartHour,
      );
      merged.calculations.nightEndHour = clampNumber(
        merged.calculations.nightEndHour,
        0,
        23,
        DEFAULT_SETTINGS.calculations.nightEndHour,
      );

      merged.output.pageTitle = merged.output.pageTitle != null ? String(merged.output.pageTitle) : DEFAULT_SETTINGS.output.pageTitle;
      merged.output.title = merged.output.title != null ? String(merged.output.title) : DEFAULT_SETTINGS.output.title;
      merged.output.subtitle = merged.output.subtitle != null ? String(merged.output.subtitle) : DEFAULT_SETTINGS.output.subtitle;
      merged.output.kpiTitle = merged.output.kpiTitle != null ? String(merged.output.kpiTitle) : DEFAULT_SETTINGS.output.kpiTitle;
      merged.output.kpiSubtitle = merged.output.kpiSubtitle != null ? String(merged.output.kpiSubtitle) : DEFAULT_SETTINGS.output.kpiSubtitle;
      merged.output.chartsTitle = merged.output.chartsTitle != null ? String(merged.output.chartsTitle) : DEFAULT_SETTINGS.output.chartsTitle;
      merged.output.chartsSubtitle = merged.output.chartsSubtitle != null ? String(merged.output.chartsSubtitle) : DEFAULT_SETTINGS.output.chartsSubtitle;
      merged.output.recentTitle = merged.output.recentTitle != null ? String(merged.output.recentTitle) : DEFAULT_SETTINGS.output.recentTitle;
      merged.output.recentSubtitle = merged.output.recentSubtitle != null ? String(merged.output.recentSubtitle) : DEFAULT_SETTINGS.output.recentSubtitle;
      if (merged.output.monthlyTitle == null && merged.output.weeklyTitle != null) {
        merged.output.monthlyTitle = merged.output.weeklyTitle;
      }
      if (merged.output.monthlySubtitle == null && merged.output.weeklySubtitle != null) {
        merged.output.monthlySubtitle = merged.output.weeklySubtitle;
      }
      if (merged.output.showMonthly == null && merged.output.showWeekly != null) {
        merged.output.showMonthly = merged.output.showWeekly;
      }
      merged.output.monthlyTitle = merged.output.monthlyTitle != null ? String(merged.output.monthlyTitle) : DEFAULT_SETTINGS.output.monthlyTitle;
      merged.output.monthlySubtitle = merged.output.monthlySubtitle != null ? String(merged.output.monthlySubtitle) : DEFAULT_SETTINGS.output.monthlySubtitle;
      merged.output.yearlyTitle = merged.output.yearlyTitle != null ? String(merged.output.yearlyTitle) : DEFAULT_SETTINGS.output.yearlyTitle;
      merged.output.yearlySubtitle = merged.output.yearlySubtitle != null ? String(merged.output.yearlySubtitle) : DEFAULT_SETTINGS.output.yearlySubtitle;
      merged.output.feedbackTitle = merged.output.feedbackTitle != null ? String(merged.output.feedbackTitle) : DEFAULT_SETTINGS.output.feedbackTitle;
      merged.output.feedbackSubtitle = merged.output.feedbackSubtitle != null ? String(merged.output.feedbackSubtitle) : DEFAULT_SETTINGS.output.feedbackSubtitle;
      merged.output.feedbackDescription = merged.output.feedbackDescription != null ? String(merged.output.feedbackDescription) : DEFAULT_SETTINGS.output.feedbackDescription;
      merged.output.footerSource = merged.output.footerSource != null ? String(merged.output.footerSource) : DEFAULT_SETTINGS.output.footerSource;
      merged.output.scrollTopLabel = merged.output.scrollTopLabel != null ? String(merged.output.scrollTopLabel) : DEFAULT_SETTINGS.output.scrollTopLabel;
      merged.output.tabOverviewLabel = merged.output.tabOverviewLabel != null ? String(merged.output.tabOverviewLabel) : DEFAULT_SETTINGS.output.tabOverviewLabel;
      merged.output.tabEdLabel = merged.output.tabEdLabel != null ? String(merged.output.tabEdLabel) : DEFAULT_SETTINGS.output.tabEdLabel;
      merged.output.edTitle = merged.output.edTitle != null ? String(merged.output.edTitle) : DEFAULT_SETTINGS.output.edTitle;
      merged.output.showRecent = Boolean(merged.output.showRecent);
      merged.output.showMonthly = Boolean(merged.output.showMonthly);
      merged.output.showYearly = Boolean(merged.output.showYearly);
      merged.output.showFeedback = Boolean(merged.output.showFeedback);

      return merged;
    }

    function loadSettings() {
      let storedSettings = {};
      try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            storedSettings = parsed;
          }
        }
      } catch (error) {
        console.warn('Nepavyko įkelti nustatymų iš localStorage, naudojami numatytieji.', error);
        storedSettings = {};
      }

      const windowSettings = typeof window !== 'undefined' && window.ED_DASHBOARD_SETTINGS
        ? window.ED_DASHBOARD_SETTINGS
        : {};

      const merged = deepMerge(
        deepMerge({}, storedSettings && typeof storedSettings === 'object' ? storedSettings : {}),
        windowSettings && typeof windowSettings === 'object' ? windowSettings : {},
      );
      return normalizeSettings(merged);
    }

    function saveSettings(currentSettings) {
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(currentSettings));
      } catch (error) {
        console.warn('Nepavyko išsaugoti nustatymų.', error);
      }
      if (typeof window !== 'undefined') {
        window.ED_DASHBOARD_SETTINGS = cloneSettings(currentSettings);
      }
    }

    function applySettingsToText() {
      TEXT.title = settings.output.title || DEFAULT_SETTINGS.output.title;
      TEXT.subtitle = settings.output.subtitle || DEFAULT_SETTINGS.output.subtitle;
      TEXT.tabs.overview = settings.output.tabOverviewLabel || DEFAULT_SETTINGS.output.tabOverviewLabel;
      TEXT.tabs.ed = settings.output.tabEdLabel || DEFAULT_SETTINGS.output.tabEdLabel;
      TEXT.ed.title = settings.output.edTitle || DEFAULT_SETTINGS.output.edTitle;
      TEXT.kpis.title = settings.output.kpiTitle || DEFAULT_SETTINGS.output.kpiTitle;
      TEXT.kpis.subtitle = settings.output.kpiSubtitle || DEFAULT_SETTINGS.output.kpiSubtitle;
      TEXT.charts.title = settings.output.chartsTitle || DEFAULT_SETTINGS.output.chartsTitle;
      TEXT.charts.subtitle = settings.output.chartsSubtitle || DEFAULT_SETTINGS.output.chartsSubtitle;
      TEXT.recent.title = settings.output.recentTitle || DEFAULT_SETTINGS.output.recentTitle;
      TEXT.recent.subtitle = settings.output.recentSubtitle || DEFAULT_SETTINGS.output.recentSubtitle;
      TEXT.monthly.title = settings.output.monthlyTitle || DEFAULT_SETTINGS.output.monthlyTitle;
      TEXT.monthly.subtitle = settings.output.monthlySubtitle || DEFAULT_SETTINGS.output.monthlySubtitle;
      TEXT.yearly.title = settings.output.yearlyTitle || DEFAULT_SETTINGS.output.yearlyTitle;
      TEXT.yearly.subtitle = settings.output.yearlySubtitle || DEFAULT_SETTINGS.output.yearlySubtitle;
      TEXT.feedback.title = settings.output.feedbackTitle || DEFAULT_SETTINGS.output.feedbackTitle;
      TEXT.feedback.subtitle = settings.output.feedbackSubtitle || DEFAULT_SETTINGS.output.feedbackSubtitle;
      TEXT.feedback.description = settings.output.feedbackDescription || DEFAULT_SETTINGS.output.feedbackDescription;
      TEXT.feedback.trend.title = settings.output.feedbackTrendTitle || DEFAULT_SETTINGS.output.feedbackTrendTitle;
      TEXT.scrollTop = settings.output.scrollTopLabel || DEFAULT_SETTINGS.output.scrollTopLabel;
      const pageTitle = settings.output.pageTitle || TEXT.title || DEFAULT_SETTINGS.output.pageTitle;
      document.title = pageTitle;
    }

    function applyFooterSource() {
      if (selectors.footerSource) {
        selectors.footerSource.textContent = settings.output.footerSource || DEFAULT_FOOTER_SOURCE;
      }
    }

    function toggleSectionVisibility(element, isVisible) {
      if (!element) {
        return;
      }
      if (isVisible) {
        element.removeAttribute('hidden');
        element.removeAttribute('aria-hidden');
      } else {
        element.setAttribute('hidden', 'hidden');
        element.setAttribute('aria-hidden', 'true');
      }
    }

    function applySectionVisibility() {
      toggleSectionVisibility(selectors.recentSection, settings.output.showRecent);
      toggleSectionVisibility(selectors.monthlySection, settings.output.showMonthly);
      toggleSectionVisibility(selectors.yearlySection, settings.output.showYearly);
      toggleSectionVisibility(selectors.feedbackSection, settings.output.showFeedback);
      syncSectionNavVisibility();
    }

    function parseCandidateList(value, fallback = '') {
      const base = value && String(value).trim().length ? String(value) : String(fallback ?? '');
      return base
        .replace(/\r\n/g, '\n')
        .split(/[\n,|;]+/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    }

    function toHeaderCandidates(value, fallback) {
      return parseCandidateList(value, fallback);
    }

    function toNormalizedList(value, fallback) {
      return parseCandidateList(value, fallback).map((token) => token.toLowerCase());
    }

    function buildCsvRuntime(csvSettings) {
      const fallback = DEFAULT_SETTINGS.csv;
      const departmentHasValue = csvSettings.department && csvSettings.department.trim().length > 0;
      const departmentHeaders = departmentHasValue
        ? toHeaderCandidates(csvSettings.department, '')
        : [];

      const runtime = {
        arrivalHeaders: toHeaderCandidates(csvSettings.arrival, fallback.arrival),
        dischargeHeaders: toHeaderCandidates(csvSettings.discharge, fallback.discharge),
        dayNightHeaders: toHeaderCandidates(csvSettings.dayNight, fallback.dayNight),
        gmpHeaders: toHeaderCandidates(csvSettings.gmp, fallback.gmp),
        departmentHeaders,
        trueValues: toNormalizedList(csvSettings.trueValues, fallback.trueValues),
        hospitalizedValues: toNormalizedList(csvSettings.hospitalizedValues, fallback.hospitalizedValues),
        nightKeywords: toNormalizedList(csvSettings.nightKeywords, fallback.nightKeywords),
        dayKeywords: toNormalizedList(csvSettings.dayKeywords, fallback.dayKeywords),
        labels: {
          arrival: csvSettings.arrival || fallback.arrival,
          discharge: csvSettings.discharge || fallback.discharge,
          dayNight: csvSettings.dayNight || fallback.dayNight,
          gmp: csvSettings.gmp || fallback.gmp,
          department: departmentHasValue ? csvSettings.department : fallback.department,
        },
      };
      runtime.hasHospitalizedValues = runtime.hospitalizedValues.length > 0;
      runtime.requireDepartment = departmentHasValue;
      return runtime;
    }

    function resolveColumnIndex(headerNormalized, candidates) {
      if (!Array.isArray(candidates) || !candidates.length) {
        return -1;
      }
      for (const candidate of candidates) {
        const trimmed = candidate.trim();
        const match = headerNormalized.find((column) => column.original === trimmed);
        if (match) {
          return match.index;
        }
      }
      for (const candidate of candidates) {
        const normalized = candidate.trim().toLowerCase();
        const match = headerNormalized.find((column) => column.normalized === normalized);
        if (match) {
          return match.index;
        }
      }
      for (const candidate of candidates) {
        const normalized = candidate.trim().toLowerCase();
        const match = headerNormalized.find((column) => column.normalized.includes(normalized));
        if (match) {
          return match.index;
        }
      }
      return -1;
    }

    function matchesWildcard(normalized, candidate) {
      if (!candidate) {
        return false;
      }
      if (candidate === '*') {
        return normalized.length > 0;
      }
      if (!candidate.includes('*')) {
        return normalized === candidate;
      }
      const parts = candidate.split('*').filter((part) => part.length > 0);
      if (!parts.length) {
        return normalized.length > 0;
      }
      return parts.every((fragment) => normalized.includes(fragment));
    }

    function detectHospitalized(value, csvRuntime) {
      const raw = value != null ? String(value).trim() : '';
      if (!raw) {
        return false;
      }
      if (!csvRuntime.hasHospitalizedValues) {
        return true;
      }
      const normalized = raw.toLowerCase();
      return csvRuntime.hospitalizedValues.some((candidate) => matchesWildcard(normalized, candidate));
    }

    function getField(form, name) {
      if (!form) {
        return null;
      }
      const node = form.elements.namedItem(name);
      if (!node) {
        return null;
      }
      if (typeof RadioNodeList !== 'undefined' && node instanceof RadioNodeList) {
        return node[0] ?? null;
      }
      return node;
    }

    function populateSettingsForm() {
      const form = selectors.settingsForm;
      if (!form) {
        return;
      }
      const assign = (name, value) => {
        const field = getField(form, name);
        if (!field) {
          return;
        }
        if ('type' in field && field.type === 'checkbox') {
          field.checked = Boolean(value);
        } else if ('value' in field) {
          field.value = value ?? '';
        }
      };

      assign('dataSource.url', settings.dataSource.url);
      assign('dataSource.useFallback', settings.dataSource.useFallback);
      assign('dataSource.fallbackCsv', settings.dataSource.fallbackCsv);
      assign('dataSource.feedback.url', settings.dataSource.feedback?.url);
      assign('dataSource.feedback.useFallback', settings.dataSource.feedback?.useFallback);
      assign('dataSource.feedback.fallbackCsv', settings.dataSource.feedback?.fallbackCsv);
      assign('dataSource.ed.url', settings.dataSource.ed?.url);
      assign('dataSource.ed.useFallback', settings.dataSource.ed?.useFallback);
      assign('dataSource.ed.fallbackCsv', settings.dataSource.ed?.fallbackCsv);
      assign('dataSource.historical.enabled', settings.dataSource.historical?.enabled);
      assign('dataSource.historical.url', settings.dataSource.historical?.url);
      assign('dataSource.historical.useFallback', settings.dataSource.historical?.useFallback);
      assign('dataSource.historical.fallbackCsv', settings.dataSource.historical?.fallbackCsv);

      assign('csv.arrival', settings.csv.arrival);
      assign('csv.discharge', settings.csv.discharge);
      assign('csv.dayNight', settings.csv.dayNight);
      assign('csv.gmp', settings.csv.gmp);
      assign('csv.department', settings.csv.department);
      assign('csv.number', settings.csv.number);
      assign('csv.trueValues', settings.csv.trueValues);
      assign('csv.hospitalizedValues', settings.csv.hospitalizedValues);
      assign('csv.nightKeywords', settings.csv.nightKeywords);
      assign('csv.dayKeywords', settings.csv.dayKeywords);

      assign('calculations.windowDays', settings.calculations.windowDays);
      assign('calculations.recentDays', settings.calculations.recentDays);
      assign('calculations.nightStartHour', settings.calculations.nightStartHour);
      assign('calculations.nightEndHour', settings.calculations.nightEndHour);

      assign('output.pageTitle', settings.output.pageTitle);
      assign('output.title', settings.output.title);
      assign('output.subtitle', settings.output.subtitle);
      assign('output.tabOverviewLabel', settings.output.tabOverviewLabel);
      assign('output.tabEdLabel', settings.output.tabEdLabel);
      assign('output.kpiTitle', settings.output.kpiTitle);
      assign('output.kpiSubtitle', settings.output.kpiSubtitle);
      assign('output.chartsTitle', settings.output.chartsTitle);
      assign('output.chartsSubtitle', settings.output.chartsSubtitle);
      assign('output.recentTitle', settings.output.recentTitle);
      assign('output.recentSubtitle', settings.output.recentSubtitle);
      assign('output.monthlyTitle', settings.output.monthlyTitle);
      assign('output.monthlySubtitle', settings.output.monthlySubtitle);
      assign('output.yearlyTitle', settings.output.yearlyTitle);
      assign('output.yearlySubtitle', settings.output.yearlySubtitle);
      assign('output.feedbackTitle', settings.output.feedbackTitle);
      assign('output.feedbackSubtitle', settings.output.feedbackSubtitle);
      assign('output.feedbackDescription', settings.output.feedbackDescription);
      assign('output.edTitle', settings.output.edTitle);
      assign('output.footerSource', settings.output.footerSource);
      assign('output.showRecent', settings.output.showRecent);
      assign('output.showMonthly', settings.output.showMonthly);
      assign('output.showYearly', settings.output.showYearly);
      assign('output.showFeedback', settings.output.showFeedback);
    }

    function extractSettingsFromForm(form) {
      const result = {
        dataSource: {
          url: '',
          useFallback: false,
          fallbackCsv: '',
          feedback: {
            url: '',
            useFallback: false,
            fallbackCsv: '',
          },
          ed: {
            url: '',
            useFallback: false,
            fallbackCsv: '',
          },
          historical: {
            enabled: false,
            url: '',
            useFallback: false,
            fallbackCsv: '',
          },
        },
        csv: {
          arrival: '',
          discharge: '',
          dayNight: '',
          gmp: '',
          department: '',
          number: '',
          trueValues: '',
          hospitalizedValues: '',
          nightKeywords: '',
          dayKeywords: '',
        },
        calculations: {
          windowDays: '',
          recentDays: '',
          nightStartHour: '',
          nightEndHour: '',
        },
        output: {
          pageTitle: '',
          title: '',
          subtitle: '',
          kpiTitle: '',
          kpiSubtitle: '',
          chartsTitle: '',
          chartsSubtitle: '',
          recentTitle: '',
          recentSubtitle: '',
          monthlyTitle: '',
          monthlySubtitle: '',
          yearlyTitle: '',
          yearlySubtitle: '',
          feedbackTitle: '',
          feedbackSubtitle: '',
          feedbackDescription: '',
          footerSource: '',
          showRecent: false,
          showMonthly: false,
          showYearly: false,
          showFeedback: false,
        },
      };

      const readText = (name) => {
        const field = getField(form, name);
        if (!field || !('value' in field)) {
          return '';
        }
        return String(field.value ?? '');
      };

      const readCheckbox = (name) => {
        const field = getField(form, name);
        if (!field || !('type' in field) || field.type !== 'checkbox') {
          return false;
        }
        return Boolean(field.checked);
      };

      result.dataSource.url = readText('dataSource.url').trim();
      result.dataSource.useFallback = readCheckbox('dataSource.useFallback');
      result.dataSource.fallbackCsv = readText('dataSource.fallbackCsv').trim();
      result.dataSource.feedback.url = readText('dataSource.feedback.url').trim();
      result.dataSource.feedback.useFallback = readCheckbox('dataSource.feedback.useFallback');
      result.dataSource.feedback.fallbackCsv = readText('dataSource.feedback.fallbackCsv').trim();
      result.dataSource.ed.url = readText('dataSource.ed.url').trim();
      result.dataSource.ed.useFallback = readCheckbox('dataSource.ed.useFallback');
      result.dataSource.ed.fallbackCsv = readText('dataSource.ed.fallbackCsv').trim();
      result.dataSource.historical.enabled = readCheckbox('dataSource.historical.enabled');
      result.dataSource.historical.url = readText('dataSource.historical.url').trim();
      result.dataSource.historical.useFallback = readCheckbox('dataSource.historical.useFallback');
      result.dataSource.historical.fallbackCsv = readText('dataSource.historical.fallbackCsv').trim();

      result.csv.arrival = readText('csv.arrival').trim();
      result.csv.discharge = readText('csv.discharge').trim();
      result.csv.dayNight = readText('csv.dayNight').trim();
      result.csv.gmp = readText('csv.gmp').trim();
      result.csv.department = readText('csv.department').trim();
      result.csv.number = readText('csv.number').trim();
      result.csv.trueValues = readText('csv.trueValues').trim();
      result.csv.hospitalizedValues = readText('csv.hospitalizedValues').trim();
      result.csv.nightKeywords = readText('csv.nightKeywords').trim();
      result.csv.dayKeywords = readText('csv.dayKeywords').trim();

      result.calculations.windowDays = readText('calculations.windowDays').trim();
      result.calculations.recentDays = readText('calculations.recentDays').trim();
      result.calculations.nightStartHour = readText('calculations.nightStartHour').trim();
      result.calculations.nightEndHour = readText('calculations.nightEndHour').trim();

      result.output.pageTitle = readText('output.pageTitle').trim();
      result.output.title = readText('output.title').trim();
      result.output.subtitle = readText('output.subtitle').trim();
      result.output.tabOverviewLabel = readText('output.tabOverviewLabel').trim();
      result.output.tabEdLabel = readText('output.tabEdLabel').trim();
      result.output.kpiTitle = readText('output.kpiTitle').trim();
      result.output.kpiSubtitle = readText('output.kpiSubtitle').trim();
      result.output.chartsTitle = readText('output.chartsTitle').trim();
      result.output.chartsSubtitle = readText('output.chartsSubtitle').trim();
      result.output.recentTitle = readText('output.recentTitle').trim();
      result.output.recentSubtitle = readText('output.recentSubtitle').trim();
      result.output.monthlyTitle = readText('output.monthlyTitle').trim();
      result.output.monthlySubtitle = readText('output.monthlySubtitle').trim();
      result.output.yearlyTitle = readText('output.yearlyTitle').trim();
      result.output.yearlySubtitle = readText('output.yearlySubtitle').trim();
      result.output.feedbackTitle = readText('output.feedbackTitle').trim();
      result.output.feedbackSubtitle = readText('output.feedbackSubtitle').trim();
      result.output.feedbackDescription = readText('output.feedbackDescription').trim();
      result.output.edTitle = readText('output.edTitle').trim();
      result.output.footerSource = readText('output.footerSource').trim();
      result.output.showRecent = readCheckbox('output.showRecent');
      result.output.showMonthly = readCheckbox('output.showMonthly');
      result.output.showYearly = readCheckbox('output.showYearly');
      result.output.showFeedback = readCheckbox('output.showFeedback');

      return result;
    }

    function openSettingsDialog() {
      if (!selectors.settingsDialog) {
        return;
      }
      if (selectors.settingsDialog.hasAttribute('open')) {
        return;
      }
      populateSettingsForm();
      if (typeof selectors.settingsDialog.showModal === 'function') {
        selectors.settingsDialog.showModal();
      } else {
        selectors.settingsDialog.setAttribute('open', 'open');
      }
      const focusable = selectors.settingsForm?.querySelector('input, textarea, select, button');
      if (focusable && typeof focusable.focus === 'function') {
        focusable.focus();
      }
    }

    function closeSettingsDialog() {
      if (!selectors.settingsDialog) {
        return;
      }
      if (typeof selectors.settingsDialog.close === 'function') {
        selectors.settingsDialog.close();
      } else {
        selectors.settingsDialog.removeAttribute('open');
      }
      if (selectors.openSettingsBtn && typeof selectors.openSettingsBtn.focus === 'function') {
        selectors.openSettingsBtn.focus();
      }
    }

    function handleSettingsSubmit(event) {
      event.preventDefault();
      if (!selectors.settingsForm) {
        return;
      }
      const extracted = extractSettingsFromForm(selectors.settingsForm);
      settings = normalizeSettings(extracted);
      const previousFilters = dashboardState.kpi.filters;
      const defaultFilters = getDefaultKpiFilters();
      dashboardState.kpi.filters = {
        ...defaultFilters,
        shift: previousFilters.shift,
        arrival: previousFilters.arrival,
        disposition: previousFilters.disposition,
        cardType: previousFilters.cardType,
      };
      refreshKpiWindowOptions();
      syncKpiFilterControls();
      saveSettings(settings);
      applySettingsToText();
      applyTextContent();
      applyFooterSource();
      applySectionVisibility();
      closeSettingsDialog();
      loadDashboard();
    }

    function handleResetSettings() {
      const confirmed = window.confirm('Atstatyti numatytuosius nustatymus?');
      if (!confirmed) {
        return;
      }
      settings = normalizeSettings({});
      dashboardState.kpi.filters = getDefaultKpiFilters();
      dashboardState.chartFilters = getDefaultChartFilters();
      refreshKpiWindowOptions();
      syncKpiFilterControls();
      syncChartFilterControls();
      updateChartFiltersSummary({ records: [], daily: [] });
      saveSettings(settings);
      applySettingsToText();
      applyTextContent();
      applyFooterSource();
      applySectionVisibility();
      populateSettingsForm();
      loadDashboard();
    }

    async function handleClearData() {
      const confirmed = window.confirm('Išvalyti vietinius nustatymus, talpyklas ir service worker?');
      if (!confirmed) {
        return;
      }
      try {
        inMemoryDataCache.clear();
        updateClientConfig({ lastClearedAt: new Date().toISOString() });
        settings = normalizeSettings({});
        saveSettings(settings);
        applySettingsToText();
        applyTextContent();
        applyFooterSource();
        populateSettingsForm();
        await clearClientData({
          storageKeys: [SETTINGS_STORAGE_KEY, THEME_STORAGE_KEY, CLIENT_CONFIG_KEY],
          cachePrefixes: CACHE_PREFIXES,
        });
        initializeServiceWorker();
        setStatus('success', 'Vietiniai duomenys išvalyti. Puslapis perkraunamas iš tinklo.');
        loadDashboard();
      } catch (error) {
        console.error('Nepavyko išvalyti vietinių duomenų:', error);
        setStatus('error', 'Nepavyko išvalyti vietinių duomenų.');
      }
    }

    /**
     * Čia saugome aktyvius grafikus, kad galėtume juos sunaikinti prieš piešiant naujus.
     */
    const HEATMAP_WEEKDAY_SHORT = ['Pir', 'Antr', 'Treč', 'Ketv', 'Penkt', 'Šešt', 'Sekm'];
    const HEATMAP_WEEKDAY_FULL = [
      'Pirmadienis',
      'Antradienis',
      'Trečiadienis',
      'Ketvirtadienis',
      'Penktadienis',
      'Šeštadienis',
      'Sekmadienis',
    ];
    const HEATMAP_HOURS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);
    const HEATMAP_METRIC_KEYS = ['arrivals', 'discharges', 'hospitalized', 'avgDuration'];
    const DEFAULT_HEATMAP_METRIC = HEATMAP_METRIC_KEYS[0];

    const dashboardState = {
      loading: false,
      queuedReload: false,
      hasLoadedOnce: false,
      charts: {
        daily: null,
        dow: null,
        dowStay: null,
        funnel: null,
        feedbackTrend: null,
        edDispositions: null,
      },
      chartLib: null,
      usingFallback: false,
      lastErrorMessage: '',
      rawRecords: [],
      dailyStats: [],
      primaryRecords: [],
      primaryDaily: [],
      monthly: {
        all: [],
        window: [],
      },
      dataMeta: null,
      loadCounter: 0,
      chartPeriod: 30,
      chartYear: null,
      heatmapMetric: DEFAULT_HEATMAP_METRIC,
      chartData: {
        baseDaily: [],
        baseRecords: [],
        dailyWindow: [],
        funnel: null,
        heatmap: null,
        filteredDaily: [],
        filteredRecords: [],
        filteredWindowRecords: [],
      },
      theme: 'light',
      fullscreen: false,
      tvMode: false,
      activeTab: 'overview',
      compare: {
        active: false,
        selections: [],
      },
      contrastWarning: false,
      chartFilters: getDefaultChartFilters(),
      kpi: {
        filters: getDefaultKpiFilters(),
        records: [],
        daily: [],
      },
      feedback: {
        summary: null,
        monthly: [],
        usingFallback: false,
        lastErrorMessage: '',
        trendWindow: 6,
        records: [],
        filteredRecords: [],
        filters: getDefaultFeedbackFilters(),
        filterOptions: { respondent: [], location: [] },
      },
      ed: {
        records: [],
        summary: null,
        dispositions: [],
        daily: [],
        usingFallback: false,
        lastErrorMessage: '',
        error: null,
        updatedAt: null,
      },
      edSearchQuery: '',
    };

    function resetMonthlyState() {
      dashboardState.monthly.all = [];
      dashboardState.monthly.window = [];
    }

    function setFullscreenMode(active, options = {}) {
      const previousState = dashboardState.fullscreen === true;
      const allowFullscreen = dashboardState.activeTab === 'ed';
      const requestedActive = Boolean(active);
      const isActive = requestedActive && allowFullscreen;
      dashboardState.fullscreen = isActive;
      if (isActive) {
        document.body.setAttribute('data-fullscreen', 'true');
      } else {
        document.body.removeAttribute('data-fullscreen');
      }
      if (selectors.tabSwitcher) {
        if (isActive) {
          selectors.tabSwitcher.setAttribute('hidden', 'hidden');
          selectors.tabSwitcher.setAttribute('aria-hidden', 'true');
        } else {
          selectors.tabSwitcher.removeAttribute('hidden');
          selectors.tabSwitcher.removeAttribute('aria-hidden');
        }
      }
      const shouldRestoreFocus = options.restoreFocus;
      if (!isActive
        && previousState
        && shouldRestoreFocus
        && selectors.edNavButton
        && typeof selectors.edNavButton.focus === 'function') {
        selectors.edNavButton.focus();
      }
      updateFullscreenControls();
    }

    function updateFullscreenControls() {
      if (!selectors.edNavButton) {
        return;
      }
      const panelLabel = selectors.edNavButton.dataset.panelLabel
        || settings?.output?.tabEdLabel
        || TEXT.tabs.ed;
      const openLabel = selectors.edNavButton.dataset.openLabel
        || (typeof TEXT.edToggle?.open === 'function'
          ? TEXT.edToggle.open(panelLabel)
          : `Atidaryti ${panelLabel}`);
      const closeLabel = selectors.edNavButton.dataset.closeLabel
        || (typeof TEXT.edToggle?.close === 'function'
          ? TEXT.edToggle.close(panelLabel)
          : `Uždaryti ${panelLabel}`);
      const isFullscreen = dashboardState.fullscreen === true;
      const isEdActive = dashboardState.activeTab === 'ed';
      const activeLabel = isFullscreen && isEdActive ? closeLabel : openLabel;
      selectors.edNavButton.setAttribute('aria-label', activeLabel);
      selectors.edNavButton.title = activeLabel;
      selectors.edNavButton.dataset.fullscreenAvailable = isEdActive ? 'true' : 'false';
      updateTvToggleControls();
    }

    function updateTvToggleControls() {
      if (!selectors.edTvToggleBtn) {
        return;
      }
      const toggleTexts = TEXT.edTv?.toggle || {};
      const isActive = dashboardState.tvMode === true && dashboardState.activeTab === 'ed';
      const label = isActive
        ? (toggleTexts.exit || 'Išjungti ekraną')
        : (toggleTexts.enter || 'Įjungti ekraną');
      const labelTarget = selectors.edTvToggleBtn.querySelector('[data-tv-toggle-label]');
      if (labelTarget) {
        labelTarget.textContent = label;
      }
      selectors.edTvToggleBtn.setAttribute('aria-label', `${label} (Ctrl+Shift+T)`);
      selectors.edTvToggleBtn.title = `${label} (Ctrl+Shift+T)`;
      selectors.edTvToggleBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }

    function updateEdTvClock() {
      if (!selectors.edTvClockTime || !selectors.edTvClockDate) {
        return;
      }
      const now = new Date();
      selectors.edTvClockTime.textContent = tvTimeFormatter.format(now);
      selectors.edTvClockDate.textContent = capitalizeSentence(tvDateFormatter.format(now));
    }

    function startTvClock() {
      updateEdTvClock();
      if (tvState.clockHandle != null) {
        return;
      }
      tvState.clockHandle = window.setInterval(updateEdTvClock, 15000);
    }

    function stopTvClock() {
      if (tvState.clockHandle != null) {
        window.clearInterval(tvState.clockHandle);
        tvState.clockHandle = null;
      }
    }

    function setTvMode(active, options = {}) {
      if (!selectors.edTvPanel) {
        dashboardState.tvMode = false;
        document.body.removeAttribute('data-tv-mode');
        if (selectors.edStandardSection) {
          selectors.edStandardSection.removeAttribute('hidden');
          selectors.edStandardSection.removeAttribute('aria-hidden');
        }
        stopTvClock();
        if (!options.silent) {
          scheduleLayoutRefresh();
        }
        return;
      }
      const shouldEnable = Boolean(active);
      const previous = dashboardState.tvMode === true;
      if (shouldEnable === previous && !options.force) {
        updateTvToggleControls();
        return;
      }
      dashboardState.tvMode = shouldEnable;
      if (shouldEnable) {
        document.body.setAttribute('data-tv-mode', 'true');
        if (selectors.edStandardSection) {
          selectors.edStandardSection.setAttribute('hidden', 'hidden');
          selectors.edStandardSection.setAttribute('aria-hidden', 'true');
        }
        if (selectors.edTvPanel) {
          selectors.edTvPanel.removeAttribute('hidden');
          selectors.edTvPanel.setAttribute('aria-hidden', 'false');
        }
        startTvClock();
        setFullscreenMode(true);
        const dataset = dashboardState.ed || {};
        const summary = dataset.summary || createEmptyEdSummary(dataset.meta?.type);
        const dispositions = Array.isArray(dataset.dispositions) ? dataset.dispositions : [];
        const summaryMode = typeof summary?.mode === 'string' ? summary.mode : (dataset.meta?.type || 'legacy');
        const hasSnapshotMetrics = Number.isFinite(summary?.currentPatients)
          || Number.isFinite(summary?.occupiedBeds)
          || Number.isFinite(summary?.nursePatientsPerStaff)
          || Number.isFinite(summary?.doctorPatientsPerStaff);
        const displayVariant = summaryMode === 'snapshot'
          || (summaryMode === 'hybrid' && hasSnapshotMetrics)
          ? 'snapshot'
          : 'legacy';
        const statusInfo = buildEdStatus(summary, dataset, displayVariant);
        updateEdTvPanel(summary, dispositions, displayVariant, dataset, statusInfo);
      } else {
        document.body.removeAttribute('data-tv-mode');
        if (selectors.edStandardSection) {
          selectors.edStandardSection.removeAttribute('hidden');
          selectors.edStandardSection.removeAttribute('aria-hidden');
        }
        if (selectors.edTvPanel) {
          selectors.edTvPanel.setAttribute('hidden', 'hidden');
          selectors.edTvPanel.setAttribute('aria-hidden', 'true');
        }
        stopTvClock();
      }
      updateTvToggleControls();
      if (!options.silent) {
        scheduleLayoutRefresh();
      }
    }

    /**
     * Pirminis tekstų suleidimas iš konfigūracijos (galima perrašyti iš kitų failų).
     */
    function applyTextContent() {
      selectors.title.textContent = TEXT.title;
      selectors.subtitle.textContent = TEXT.subtitle;
      if (selectors.tabOverview) {
        selectors.tabOverview.textContent = settings.output.tabOverviewLabel || TEXT.tabs.overview;
      }
      if (selectors.edNavButton) {
        const edNavLabel = settings.output.tabEdLabel || TEXT.tabs.ed;
        const openLabel = typeof TEXT.edToggle?.open === 'function'
          ? TEXT.edToggle.open(edNavLabel)
          : `Atidaryti ${edNavLabel}`;
        const closeLabel = typeof TEXT.edToggle?.close === 'function'
          ? TEXT.edToggle.close(edNavLabel)
          : `Uždaryti ${edNavLabel}`;
        selectors.edNavButton.dataset.panelLabel = edNavLabel;
        selectors.edNavButton.dataset.openLabel = openLabel;
        selectors.edNavButton.dataset.closeLabel = closeLabel;
        const isActive = dashboardState.activeTab === 'ed';
        const currentLabel = isActive ? closeLabel : openLabel;
        selectors.edNavButton.setAttribute('aria-label', currentLabel);
        selectors.edNavButton.title = currentLabel;
      }
      if (selectors.closeEdPanelBtn) {
        const overviewLabel = settings.output.tabOverviewLabel || TEXT.tabs.overview;
        const closeLabel = typeof TEXT.ed?.closeButton === 'function'
          ? TEXT.ed.closeButton(overviewLabel)
          : (TEXT.ed?.closeButton || `Grįžti į ${overviewLabel}`);
        selectors.closeEdPanelBtn.setAttribute('aria-label', closeLabel);
        selectors.closeEdPanelBtn.title = closeLabel;
        const labelSpan = selectors.closeEdPanelBtn.querySelector('span');
        if (labelSpan) {
          labelSpan.textContent = closeLabel;
        } else {
          selectors.closeEdPanelBtn.textContent = closeLabel;
        }
      }
      if (selectors.edTvToggleBtn) {
        const toggleTexts = TEXT.edTv?.toggle || {};
        const isActive = dashboardState.tvMode === true;
        const label = isActive
          ? (toggleTexts.exit || 'Išjungti ekraną')
          : (toggleTexts.enter || 'Įjungti ekraną');
        const labelTarget = selectors.edTvToggleBtn.querySelector('[data-tv-toggle-label]');
        if (labelTarget) {
          labelTarget.textContent = label;
        }
        selectors.edTvToggleBtn.setAttribute('aria-label', `${label} (Ctrl+Shift+T)`);
        selectors.edTvToggleBtn.title = `${label} (Ctrl+Shift+T)`;
      }
      if (selectors.edTvTitle && TEXT.edTv?.title) {
        selectors.edTvTitle.textContent = TEXT.edTv.title;
      }
      if (selectors.edTvSubtitle) {
        selectors.edTvSubtitle.textContent = TEXT.edTv?.subtitle || selectors.edTvSubtitle.textContent || '';
      }
      if (selectors.openSettingsBtn) {
        selectors.openSettingsBtn.setAttribute('aria-label', TEXT.settings);
        selectors.openSettingsBtn.title = `${TEXT.settings} (Ctrl+,)`;
      }
      if (selectors.themeToggleBtn) {
        selectors.themeToggleBtn.setAttribute('aria-label', TEXT.theme.toggle);
        selectors.themeToggleBtn.title = `${TEXT.theme.toggle} (Ctrl+Shift+L)`;
      }
      updateFullscreenControls();
      selectors.kpiHeading.textContent = TEXT.kpis.title;
      selectors.kpiSubtitle.textContent = TEXT.kpis.subtitle;
      selectors.chartHeading.textContent = TEXT.charts.title;
      selectors.chartSubtitle.textContent = TEXT.charts.subtitle;
      if (selectors.chartYearLabel) {
        selectors.chartYearLabel.textContent = TEXT.charts.yearFilterLabel;
      }
      if (selectors.chartYearSelect) {
        const firstOption = selectors.chartYearSelect.querySelector('option[value="all"]');
        if (firstOption) {
          firstOption.textContent = TEXT.charts.yearFilterAll;
        }
      }
      selectors.dailyCaption.textContent = formatDailyCaption(dashboardState.chartPeriod);
      if (selectors.dailyCaptionContext) {
        selectors.dailyCaptionContext.textContent = '';
      }
      selectors.dowCaption.textContent = TEXT.charts.dowCaption;
      if (selectors.dowStayCaption) {
        selectors.dowStayCaption.textContent = TEXT.charts.dowStayCaption;
      }
      const funnelCaptionText = typeof TEXT.charts.funnelCaptionWithYear === 'function'
        ? TEXT.charts.funnelCaptionWithYear(null)
        : TEXT.charts.funnelCaption;
      selectors.funnelCaption.textContent = funnelCaptionText;
      if (selectors.heatmapMetricLabel) {
        const heatmapLabelText = TEXT.charts?.heatmapMetricLabel || 'Rodiklis';
        selectors.heatmapMetricLabel.textContent = heatmapLabelText;
        if (selectors.heatmapMetricSelect) {
          selectors.heatmapMetricSelect.setAttribute('aria-label', heatmapLabelText);
          selectors.heatmapMetricSelect.title = `${heatmapLabelText} (Ctrl+Shift+H)`;
        }
      }
      populateHeatmapMetricOptions();
      updateHeatmapCaption(dashboardState.heatmapMetric);
      selectors.recentHeading.textContent = TEXT.recent.title;
      selectors.recentSubtitle.textContent = TEXT.recent.subtitle;
      selectors.recentCaption.textContent = TEXT.recent.caption;
      selectors.monthlyHeading.textContent = TEXT.monthly.title;
      selectors.monthlySubtitle.textContent = TEXT.monthly.subtitle;
      selectors.monthlyCaption.textContent = TEXT.monthly.caption;
      if (selectors.yearlyHeading) {
        selectors.yearlyHeading.textContent = TEXT.yearly.title;
      }
      if (selectors.yearlySubtitle) {
        selectors.yearlySubtitle.textContent = TEXT.yearly.subtitle;
      }
      if (selectors.yearlyCaption) {
        selectors.yearlyCaption.textContent = TEXT.yearly.caption;
      }
      selectors.feedbackHeading.textContent = TEXT.feedback.title;
      selectors.feedbackSubtitle.textContent = TEXT.feedback.subtitle;
      if (selectors.feedbackDescription) {
        selectors.feedbackDescription.textContent = TEXT.feedback.description;
      }
      const feedbackFiltersText = TEXT.feedback?.filters || {};
      if (selectors.feedbackRespondentLabel) {
        selectors.feedbackRespondentLabel.textContent = feedbackFiltersText.respondent?.label || 'Kas pildo anketą';
      }
      if (selectors.feedbackLocationLabel) {
        selectors.feedbackLocationLabel.textContent = feedbackFiltersText.location?.label || 'Šaltinis';
      }
      populateFeedbackFilterControls();
      syncFeedbackFilterControls();
      updateFeedbackFiltersSummary();
      if (selectors.feedbackTrendTitle) {
        selectors.feedbackTrendTitle.textContent = TEXT.feedback.trend.title;
      }
      updateFeedbackTrendSubtitle();
      if (selectors.feedbackTrendControlsLabel) {
        selectors.feedbackTrendControlsLabel.textContent = TEXT.feedback.trend.controlsLabel;
      }
      if (selectors.feedbackTrendButtons && selectors.feedbackTrendButtons.length) {
        const periodConfig = Array.isArray(TEXT.feedback.trend.periods) ? TEXT.feedback.trend.periods : [];
        selectors.feedbackTrendButtons.forEach((button) => {
          const months = Number.parseInt(button.dataset.trendMonths || '', 10);
          const config = periodConfig.find((item) => Number.parseInt(item?.months, 10) === months);
          if (config?.label) {
            button.textContent = config.label;
          }
          if (config?.hint) {
            button.title = config.hint;
          } else {
            button.removeAttribute('title');
          }
        });
      }
      syncFeedbackTrendControls();
      if (selectors.feedbackCaption) {
        selectors.feedbackCaption.textContent = TEXT.feedback.table.caption;
      }
      if (selectors.feedbackColumnMonth) {
        selectors.feedbackColumnMonth.textContent = TEXT.feedback.table.headers.month;
      }
      if (selectors.feedbackColumnResponses) {
        selectors.feedbackColumnResponses.textContent = TEXT.feedback.table.headers.responses;
      }
      if (selectors.feedbackColumnOverall) {
        selectors.feedbackColumnOverall.textContent = TEXT.feedback.table.headers.overall;
      }
      if (selectors.feedbackColumnDoctors) {
        selectors.feedbackColumnDoctors.textContent = TEXT.feedback.table.headers.doctors;
      }
      if (selectors.feedbackColumnNurses) {
        selectors.feedbackColumnNurses.textContent = TEXT.feedback.table.headers.nurses;
      }
      if (selectors.feedbackColumnAides) {
        selectors.feedbackColumnAides.textContent = TEXT.feedback.table.headers.aides;
      }
      if (selectors.feedbackColumnWaiting) {
        selectors.feedbackColumnWaiting.textContent = TEXT.feedback.table.headers.waiting;
      }
      if (selectors.feedbackColumnContact) {
        selectors.feedbackColumnContact.textContent = TEXT.feedback.table.headers.contact;
      }
      if (selectors.edHeading) {
        selectors.edHeading.textContent = settings.output.edTitle || TEXT.ed.title;
      }
      if (selectors.edStatus) {
        selectors.edStatus.textContent = TEXT.ed.status.loading;
        selectors.edStatus.dataset.tone = 'info';
      }
      if (selectors.compareToggle) {
        selectors.compareToggle.textContent = TEXT.compare.toggle;
      }
      if (selectors.scrollTopBtn) {
        selectors.scrollTopBtn.textContent = TEXT.scrollTop;
        selectors.scrollTopBtn.setAttribute('aria-label', TEXT.scrollTop);
        selectors.scrollTopBtn.title = `${TEXT.scrollTop} (Home)`;
      }
      if (selectors.compareSummary) {
        selectors.compareSummary.textContent = TEXT.compare.prompt;
      }
      hideStatusNote();
    }

    const statusDisplay = {
      base: TEXT.status.loading,
      note: '',
      tone: 'info',
    };

    function applyTone(tone = 'info') {
      const normalized = tone === 'error' ? 'error' : tone === 'warning' ? 'warning' : 'info';
      if (normalized === 'error' || statusDisplay.tone === 'error') {
        statusDisplay.tone = 'error';
        return;
      }
      if (normalized === 'warning' || statusDisplay.tone === 'warning') {
        statusDisplay.tone = 'warning';
        return;
      }
      statusDisplay.tone = 'info';
    }

    function renderStatusDisplay() {
      if (!selectors.status) return;
      const parts = [statusDisplay.base, statusDisplay.note].filter(Boolean);
      const message = parts.join(' · ');
      selectors.status.classList.toggle('status--error', statusDisplay.tone === 'error');
      selectors.status.dataset.tone = statusDisplay.tone;
      if (!message) {
        selectors.status.textContent = '';
        selectors.status.setAttribute('hidden', 'hidden');
        return;
      }
      selectors.status.textContent = message;
      selectors.status.removeAttribute('hidden');
    }

    function hideStatusNote() {
      statusDisplay.note = '';
      applyTone('info');
      renderStatusDisplay();
    }

    function showStatusNote(message, tone = 'info') {
      statusDisplay.note = message || '';
      applyTone(tone);
      renderStatusDisplay();
    }

    function createChunkReporter(label) {
      let lastUpdate = 0;
      return (payload = {}) => {
        const now = performance.now();
        if (now - lastUpdate < 120) {
          return;
        }
        lastUpdate = now;
        const { receivedBytes = 0, current = 0, total = 0 } = payload;
        const sizeKb = receivedBytes ? `~${Math.max(1, Math.round(receivedBytes / 1024))} KB` : '';
        const percent = total > 0 ? `${Math.min(100, Math.round((current / total) * 100))}%` : '';
        const progressLabel = percent || sizeKb;
        if (!progressLabel && !label) {
          return;
        }
        const message = label ? `${label}: įkeliama ${progressLabel}`.trim() : `Įkeliama ${progressLabel}`.trim();
        showStatusNote(message, 'info');
      };
    }

    function updateThemeToggleState(theme) {
      if (!selectors.themeToggleBtn) {
        return;
      }
      const isDark = theme === 'dark';
      selectors.themeToggleBtn.setAttribute('aria-pressed', String(isDark));
      selectors.themeToggleBtn.dataset.theme = theme;
      selectors.themeToggleBtn.title = `${TEXT.theme.toggle} (Ctrl+Shift+L)`;
    }

    function parseColorValue(value) {
      if (!value) {
        return null;
      }
      const trimmed = value.trim();
      if (trimmed.startsWith('#')) {
        const hex = trimmed.slice(1);
        if (hex.length === 3) {
          const r = parseInt(hex[0] + hex[0], 16);
          const g = parseInt(hex[1] + hex[1], 16);
          const b = parseInt(hex[2] + hex[2], 16);
          return { r, g, b };
        }
        if (hex.length === 6) {
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          if ([r, g, b].every((component) => Number.isFinite(component))) {
            return { r, g, b };
          }
        }
        return null;
      }
      const rgbMatch = trimmed.match(/rgba?\(([^)]+)\)/i);
      if (rgbMatch) {
        const parts = rgbMatch[1].split(',').map((part) => Number.parseFloat(part.trim()));
        if (parts.length >= 3 && parts.slice(0, 3).every((component) => Number.isFinite(component))) {
          return { r: parts[0], g: parts[1], b: parts[2] };
        }
      }
      return null;
    }

    function computeLuminance(rgb) {
      if (!rgb) {
        return null;
      }
      const normalize = (channel) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      const r = normalize(rgb.r);
      const g = normalize(rgb.g);
      const b = normalize(rgb.b);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    function checkKpiContrast() {
      const rootStyles = getComputedStyle(document.body);
      const surface = parseColorValue(rootStyles.getPropertyValue('--color-surface'));
      const text = parseColorValue(rootStyles.getPropertyValue('--color-text'));
      const surfaceLum = computeLuminance(surface);
      const textLum = computeLuminance(text);
      if (surfaceLum == null || textLum == null) {
        dashboardState.contrastWarning = false;
        return;
      }
      const lighter = Math.max(surfaceLum, textLum);
      const darker = Math.min(surfaceLum, textLum);
      const ratio = (lighter + 0.05) / (darker + 0.05);
      if (ratio < 4.5) {
        dashboardState.contrastWarning = true;
        const existingMessage = statusDisplay.note || '';
        if (existingMessage && existingMessage !== TEXT.theme.contrastWarning) {
          const combined = existingMessage.includes(TEXT.theme.contrastWarning)
            ? existingMessage
            : `${existingMessage} ${TEXT.theme.contrastWarning}`;
          showStatusNote(combined, 'warning');
        } else {
          showStatusNote(TEXT.theme.contrastWarning, 'warning');
        }
      } else if (dashboardState.contrastWarning) {
        dashboardState.contrastWarning = false;
        if (statusDisplay.note) {
          const cleaned = statusDisplay.note.replace(TEXT.theme.contrastWarning, '').trim();
          statusDisplay.note = cleaned;
          renderStatusDisplay();
        }
      }
    }

    function applyTheme(theme, { persist = false } = {}) {
      const normalized = theme === 'dark' ? 'dark' : 'light';
      const targets = [document.documentElement, document.body].filter(Boolean);
      targets.forEach((el) => {
        el.setAttribute('data-theme', normalized);
      });
      dashboardState.theme = normalized;
      updateThemeToggleState(normalized);
      if (persist) {
        try {
          localStorage.setItem(THEME_STORAGE_KEY, normalized);
        } catch (error) {
          console.warn('Nepavyko išsaugoti temos nustatymo:', error);
        }
      }
      if (typeof window !== 'undefined') {
        window.ED_DASHBOARD_THEME = normalized;
      }
      checkKpiContrast();
    }

    function initializeTheme() {
      const attributeTheme = (() => {
        const htmlTheme = document.documentElement.getAttribute('data-theme');
        const bodyTheme = document.body ? document.body.getAttribute('data-theme') : null;
        const candidate = htmlTheme || bodyTheme;
        return candidate === 'dark' || candidate === 'light' ? candidate : null;
      })();

      let storedTheme = null;
      try {
        storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      } catch (error) {
        storedTheme = null;
      }

      const windowTheme = typeof window !== 'undefined' ? window.ED_DASHBOARD_THEME : null;
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const resolvedTheme = attributeTheme
        || (windowTheme === 'dark' || windowTheme === 'light'
          ? windowTheme
          : storedTheme === 'dark' || storedTheme === 'light'
            ? storedTheme
            : prefersDark
              ? 'dark'
              : 'light');

      applyTheme(resolvedTheme, { persist: false });
    }

    function toggleTheme() {
      const nextTheme = dashboardState.theme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme, { persist: true });
      rerenderChartsForTheme();
    }

    function setStatus(type, details = '') {
      if (type === 'loading') {
        statusDisplay.base = TEXT.status.loading;
        statusDisplay.note = '';
        statusDisplay.tone = 'info';
        renderStatusDisplay();
        return;
      }

      if (type === 'error') {
        const message = details ? TEXT.status.errorDetails(details) : TEXT.status.error;
        statusDisplay.base = message;
        statusDisplay.note = TEXT.status.errorAdvice;
        statusDisplay.tone = 'error';
        renderStatusDisplay();
        return;
      }

      const formatted = statusTimeFormatter.format(new Date());
      if (dashboardState.usingFallback) {
        statusDisplay.base = TEXT.status.fallbackSuccess(formatted);
        statusDisplay.tone = 'warning';
        const warningsList = Array.isArray(dashboardState.dataMeta?.warnings)
          ? dashboardState.dataMeta.warnings.filter((item) => typeof item === 'string' && item.trim().length > 0)
          : [];
        const fallbackNote = dashboardState.lastErrorMessage
          ? TEXT.status.fallbackNote(dashboardState.lastErrorMessage)
          : TEXT.status.fallbackNote(TEXT.status.error);
        const combinedNote = warningsList.length
          ? `${fallbackNote} ${warningsList.join(' ')}`.trim()
          : fallbackNote;
        statusDisplay.note = combinedNote;
        renderStatusDisplay();
      } else {
        statusDisplay.base = '';
        statusDisplay.tone = 'info';
        const warningsList = Array.isArray(dashboardState.dataMeta?.warnings)
          ? dashboardState.dataMeta.warnings.filter((item) => typeof item === 'string' && item.trim().length > 0)
          : [];
        if (warningsList.length) {
          statusDisplay.note = warningsList.join(' ');
          statusDisplay.tone = 'warning';
          renderStatusDisplay();
        } else {
          statusDisplay.note = '';
          renderStatusDisplay();
        }
      }
    }

    function applyFeedbackStatusNote() {
      if (dashboardState.usingFallback || !settings.output.showFeedback) {
        return;
      }
      if (dashboardState.feedback.usingFallback) {
        const reason = dashboardState.feedback.lastErrorMessage || TEXT.status.error;
        showStatusNote(TEXT.feedback.status.fallback(reason), 'warning');
        return;
      }
      if (dashboardState.feedback.lastErrorMessage) {
        showStatusNote(TEXT.feedback.status.error(dashboardState.feedback.lastErrorMessage), 'warning');
      }
    }

    /**
     * CSV duomenų apdorojimo pagalbinės funkcijos: diagnostika, atsisiuntimas ir transformacija.
     */
    function formatUrlForDiagnostics(rawUrl) {
      if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        return '';
      }
      try {
        const parsed = new URL(rawUrl);
        const safeParams = new URLSearchParams();
        parsed.searchParams.forEach((value, key) => {
          if (/token|key|auth|secret|signature|pass/i.test(key)) {
            safeParams.append(key, '***');
            return;
          }
          safeParams.append(key, value);
        });
        const query = safeParams.toString();
        return `${parsed.origin}${parsed.pathname}${query ? `?${query}` : ''}`;
      } catch (parseError) {
        console.warn('Nepavyko normalizuoti URL diagnostikai:', parseError);
        return rawUrl;
      }
    }

    function describeError(error) {
      if (!error) {
        return TEXT.status.error;
      }
      const message = typeof error === 'string' ? error : error.message ?? TEXT.status.error;
      const hints = [];
      const diagnostic = typeof error === 'object' && error ? error.diagnostic : null;

      if (diagnostic?.url) {
        hints.push(`URL: ${diagnostic.url}.`);
      }

      if (diagnostic?.type === 'http') {
        if (diagnostic.status === 404) {
          hints.push('Patikrinkite, ar „Google Sheet“ paskelbta per „File → Share → Publish to web → CSV“ ir kad naudojamas publikuotas CSV adresas.');
        } else if (diagnostic.status === 403) {
          hints.push('Patikrinkite bendrinimo teises – dokumentas turi būti pasiekiamas be prisijungimo.');
        } else if (diagnostic.status === 0) {
          hints.push('Gautas atsakas be statuso – tikėtina tinklo arba CORS klaida.');
        }
        if (diagnostic.statusText) {
          hints.push(`Serverio atsakymas: ${diagnostic.statusText}.`);
        }
      }

      if (/Failed to fetch/i.test(message) || /NetworkError/i.test(message)) {
        hints.push('Nepavyko pasiekti šaltinio – patikrinkite interneto ryšį ir ar serveris leidžia CORS užklausas iš šio puslapio.');
      }

      if (/HTML atsakas/i.test(message)) {
        hints.push('Gautas HTML vietoje CSV – nuorodoje turi būti „.../pub?output=csv“.');
      }

      if (diagnostic?.hint) {
        hints.push(diagnostic.hint);
      }

      const renderedHints = hints.length ? ` ${hints.join(' ')}` : '';
      if (/HTTP klaida:\s*404/.test(message)) {
        return `HTTP 404 – nuoroda nerasta arba dokumentas nepublikuotas.${renderedHints}`;
      }
      if (/HTTP klaida:\s*403/.test(message)) {
        return `HTTP 403 – prieiga uždrausta.${renderedHints}`;
      }
      if (/Failed to fetch/i.test(message) || /NetworkError/i.test(message)) {
        return `Nepavyko pasiekti šaltinio.${renderedHints}`;
      }
      if (/HTML atsakas/i.test(message)) {
        return `Gautas HTML atsakas vietoje CSV.${renderedHints}`;
      }
      return `${message}${renderedHints}`.trim();
    }

    function createTextSignature(text) {
      if (typeof text !== 'string') {
        return '';
      }
      const length = text.length;
      const head = text.slice(0, 128);
      return `${length}:${head}`;
    }

    async function downloadCsv(url, { cacheInfo = null, onChunk } = {}) {
      const headers = {};
      if (cacheInfo?.etag) {
        headers['If-None-Match'] = cacheInfo.etag;
      }
      if (cacheInfo?.lastModified) {
        headers['If-Modified-Since'] = cacheInfo.lastModified;
      }
      const response = await fetch(url, { cache: 'no-store', headers });
      const statusText = response.statusText || '';
      const cacheStatusHeader = response.headers.get('x-cache-status') || '';
      if (response.status === 304) {
        return {
          status: 304,
          text: '',
          contentType: response.headers.get('content-type') ?? '',
          etag: cacheInfo?.etag || '',
          lastModified: cacheInfo?.lastModified || '',
          signature: cacheInfo?.signature || '',
          cacheStatus: cacheStatusHeader || 'not-modified',
        };
      }
      if (!response.ok) {
        const error = new Error(`HTTP klaida: ${response.status}`);
        error.diagnostic = {
          type: 'http',
          status: response.status,
          statusText,
          url: formatUrlForDiagnostics(url),
        };
        throw error;
      }
      let textContent = '';
      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let receivedBytes = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          receivedBytes += value.byteLength;
          textContent += decoder.decode(value, { stream: true });
          if (typeof onChunk === 'function') {
            onChunk({ receivedBytes });
          }
        }
        textContent += decoder.decode();
      } else {
        textContent = await response.text();
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('text/html') || /^<!doctype html/i.test(textContent.trim())) {
        const error = new Error('HTML atsakas vietoje CSV – patikrinkite, ar nuoroda publikuota kaip CSV.');
        error.diagnostic = {
          type: 'html',
          url: formatUrlForDiagnostics(url),
          hint: 'Google Sheets lange pasirinkite „File → Share → Publish to web → CSV“ ir naudokite gautą CSV nuorodą.',
        };
        throw error;
      }
      const etag = response.headers.get('etag') ?? '';
      const lastModified = response.headers.get('last-modified') ?? '';
      return {
        status: response.status,
        text: textContent,
        contentType,
        etag,
        lastModified,
        cacheStatus: cacheStatusHeader || 'tinklas',
        signature: etag || lastModified || createTextSignature(textContent),
      };
    }

    const DATA_WORKER_URL = new URL('data-worker.js', window.location.href).toString();
    const DATA_CACHE_PREFIX = 'edDashboard:dataCache:';
    const inMemoryDataCache = new Map();
    let dataWorkerCounter = 0;
    let kpiWorkerJobToken = 0;

    function getDataCacheKey(url) {
      if (!url) {
        return '';
      }
      return `${DATA_CACHE_PREFIX}${encodeURIComponent(url)}`;
    }

    function cloneCacheRecords(records) {
      if (!Array.isArray(records)) {
        return [];
      }
      return records.map((record) => {
        const entry = { ...record };
        if (entry.arrival instanceof Date && !Number.isNaN(entry.arrival.getTime())) {
          entry.arrival = new Date(entry.arrival.getTime());
        }
        if (entry.discharge instanceof Date && !Number.isNaN(entry.discharge.getTime())) {
          entry.discharge = new Date(entry.discharge.getTime());
        }
        return entry;
      });
    }

    function cloneCacheDailyStats(dailyStats) {
      if (!Array.isArray(dailyStats)) {
        return [];
      }
      return dailyStats.map((item) => ({ ...item }));
    }

    function cloneCacheEntry(entry) {
      const timestamp = typeof entry?.timestamp === 'number' ? entry.timestamp : Date.now();
      return {
        etag: entry?.etag || '',
        lastModified: entry?.lastModified || '',
        signature: entry?.signature || '',
        timestamp,
        records: cloneCacheRecords(entry?.records),
        dailyStats: cloneCacheDailyStats(entry?.dailyStats),
      };
    }

    function rememberCacheEntry(key, entry) {
      if (!key) {
        return;
      }
      inMemoryDataCache.set(key, cloneCacheEntry(entry));
    }

    function readDataCache(url) {
      const key = getDataCacheKey(url);
      if (!key) {
        return null;
      }

      if (inMemoryDataCache.has(key)) {
        return cloneCacheEntry(inMemoryDataCache.get(key));
      }
      return null;
    }

    function writeDataCache(url, payload) {
      const key = getDataCacheKey(url);
      if (!key) {
        return;
      }

      const entry = cloneCacheEntry({ ...payload, timestamp: Date.now() });
      rememberCacheEntry(key, entry);
    }

    function clearDataCache(url) {
      const key = getDataCacheKey(url);
      if (!key) {
        return;
      }

      inMemoryDataCache.delete(key);
    }

    function describeCacheMeta(meta) {
      if (!meta) {
        return 'tinklas';
      }
      if (meta.cacheStatus && /hit|revalidated/i.test(meta.cacheStatus)) {
        return meta.cacheStatus.toLowerCase();
      }
      if (meta.fromFallback) {
        return 'demonstracinis';
      }
      if (meta.fromCache) {
        return 'talpykla';
      }
      return 'tinklas';
    }

    function runWorkerJob(message, { onProgress } = {}) {
      if (typeof Worker !== 'function') {
        return Promise.reject(new Error('Naršyklė nepalaiko Web Worker.'));
      }
      const jobId = `data-job-${Date.now()}-${dataWorkerCounter += 1}`;
      const worker = new Worker(DATA_WORKER_URL);
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          try {
            worker.terminate();
          } catch (error) {
            console.warn('Nepavyko uždaryti duomenų workerio:', error);
          }
        };
        worker.addEventListener('message', (event) => {
          const data = event.data;
          if (!data || data.id !== jobId) {
            return;
          }
          if (data.status === 'progress') {
            if (typeof onProgress === 'function') {
              onProgress(data.payload || {});
            }
            return;
          }
          cleanup();
          if (data.status === 'error') {
            const error = new Error(data.error?.message || 'Worker klaida.');
            error.name = data.error?.name || error.name;
            if (data.error?.stack) {
              error.stack = data.error.stack;
            }
            reject(error);
            return;
          }
          resolve(data.payload);
        });
        worker.addEventListener('error', (event) => {
          cleanup();
          reject(event.error || new Error(event.message || 'Worker klaida.'));
        });
        try {
          worker.postMessage({
            id: jobId,
            ...message,
          });
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
    }

    function runDataWorker(csvText, options, jobOptions = {}) {
      const message = { type: 'transformCsv', csvText, options };
      if (Number.isInteger(jobOptions.progressStep) && jobOptions.progressStep > 0) {
        message.progressStep = jobOptions.progressStep;
      }
      return runWorkerJob(message, jobOptions);
    }

    function runKpiWorkerJob(payload) {
      return runWorkerJob({ type: 'applyKpiFilters', ...payload });
    }

    function detectDelimiter(text) {
      const sampleLine = text.split('\n').find((line) => line.trim().length > 0) ?? '';
      const candidates = [',', ';', '\t', '|'];
      let best = ',';
      let bestScore = -1;
      candidates.forEach((delimiter) => {
        let inQuotes = false;
        let score = 0;
        for (let i = 0; i < sampleLine.length; i += 1) {
          const char = sampleLine[i];
          if (char === '"') {
            if (inQuotes && sampleLine[i + 1] === '"') {
              i += 1;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (!inQuotes && char === delimiter) {
            score += 1;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          best = delimiter;
        }
      });
      return bestScore > 0 ? best : ',';
    }

    function parseCsv(text) {
      const sanitized = text.replace(/\r\n/g, '\n');
      const delimiter = detectDelimiter(sanitized);
      const rows = [];
      let current = [];
      let value = '';
      let inQuotes = false;
      for (let i = 0; i < sanitized.length; i += 1) {
        const char = sanitized[i];
        if (char === '"') {
          if (inQuotes && sanitized[i + 1] === '"') {
            value += '"';
            i += 1;
          } else {
            inQuotes = !inQuotes;
          }
          continue;
        }
        if (char === delimiter && !inQuotes) {
          current.push(value);
          value = '';
          continue;
        }
        if (char === '\n' && !inQuotes) {
          current.push(value);
          rows.push(current);
          current = [];
          value = '';
          continue;
        }
        value += char;
      }
      if (value.length > 0 || current.length) {
        current.push(value);
        rows.push(current);
      }
      const filteredRows = rows.filter((row) => row.some((cell) => (cell ?? '').trim().length > 0));
      return { rows: filteredRows, delimiter };
    }

    function parseDate(value) {
      if (!value) {
        return null;
      }
      const raw = String(value).trim();
      if (!raw) {
        return null;
      }
      const normalized = raw.replace(/\s+/g, ' ').trim();
      let isoCandidate = normalized.includes('T') ? normalized : normalized.replace(' ', 'T');
      isoCandidate = isoCandidate.replace(' T', 'T').replace(' +', '+').replace(' -', '-');
      let parsed = new Date(isoCandidate);
      if (!Number.isNaN(parsed?.getTime?.())) {
        return parsed;
      }
      // Papildoma atrama formoms, kurios vietoje brūkšnių naudoja pasviruosius arba taškus.
      const slashIso = normalized.match(/^(\d{4})[\/](\d{1,2})[\/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
      if (slashIso) {
        const [, year, month, day, hour = '0', minute = '0', second = '0'] = slashIso;
        parsed = new Date(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second)
        );
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
      const dotIso = normalized.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
      if (dotIso) {
        const [, year, month, day, hour = '0', minute = '0', second = '0'] = dotIso;
        parsed = new Date(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second)
        );
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
      const onlyDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (onlyDate) {
        parsed = new Date(Number(onlyDate[1]), Number(onlyDate[2]) - 1, Number(onlyDate[3]));
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
      const european = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
      if (european) {
        const [, day, month, year, hour = '0', minute = '0', second = '0'] = european;
        parsed = new Date(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second)
        );
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
      // Google Forms CSV dažnai išveda datą „dd/mm/yyyy“ formatu.
      const slashEuropean = normalized.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
      if (slashEuropean) {
        const [, day, month, year, hour = '0', minute = '0', second = '0'] = slashEuropean;
        parsed = new Date(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second)
        );
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
      return null;
    }

    function toDateKeyFromDate(date) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return '';
      }
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    function toMonthKeyFromDate(date) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return '';
      }
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
    }

    function normalizeHourToMinutes(hour) {
      const raw = Number(hour);
      if (!Number.isFinite(raw)) {
        return null;
      }
      const dayMinutes = 24 * 60;
      const minutes = Math.round(raw * 60);
      return ((minutes % dayMinutes) + dayMinutes) % dayMinutes;
    }

    function resolveNightBoundsMinutes(calculationSettings = {}) {
      const defaultStart = Number.isFinite(Number(DEFAULT_SETTINGS?.calculations?.nightStartHour))
        ? Number(DEFAULT_SETTINGS.calculations.nightStartHour)
        : 20;
      const defaultEnd = Number.isFinite(Number(DEFAULT_SETTINGS?.calculations?.nightEndHour))
        ? Number(DEFAULT_SETTINGS.calculations.nightEndHour)
        : 7;
      const startMinutes = normalizeHourToMinutes(
        Number.isFinite(Number(calculationSettings?.nightStartHour))
          ? Number(calculationSettings.nightStartHour)
          : defaultStart
      );
      const endMinutes = normalizeHourToMinutes(
        Number.isFinite(Number(calculationSettings?.nightEndHour))
          ? Number(calculationSettings.nightEndHour)
          : defaultEnd
      );
      return {
        startMinutes: Number.isFinite(startMinutes) ? startMinutes : normalizeHourToMinutes(defaultStart),
        endMinutes: Number.isFinite(endMinutes) ? endMinutes : normalizeHourToMinutes(defaultEnd),
      };
    }

    function isNightTimestamp(date, nightStartMinutes, nightEndMinutes) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null;
      }
      const minutes = date.getHours() * 60 + date.getMinutes();
      if (!Number.isFinite(nightStartMinutes) || !Number.isFinite(nightEndMinutes)) {
        return null;
      }
      if (nightStartMinutes === nightEndMinutes) {
        return false;
      }
      if (nightStartMinutes < nightEndMinutes) {
        return minutes >= nightStartMinutes && minutes < nightEndMinutes;
      }
      return minutes >= nightStartMinutes || minutes < nightEndMinutes;
    }

    function dateKeyToUtc(dateKey) {
      if (typeof dateKey !== 'string') {
        return Number.NaN;
      }
      const parts = dateKey.split('-').map((part) => Number.parseInt(part, 10));
      if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
        return Number.NaN;
      }
      const [year, month, day] = parts;
      return Date.UTC(year, month - 1, day);
    }

    function dateKeyToDate(dateKey) {
      const utc = dateKeyToUtc(dateKey);
      if (!Number.isFinite(utc)) {
        return null;
      }
      return new Date(utc);
    }

    function isWeekendDateKey(dateKey) {
      const date = dateKeyToDate(dateKey);
      if (!(date instanceof Date)) {
        return false;
      }
      const day = date.getUTCDay();
      return day === 0 || day === 6;
    }

    function getWeekdayIndexFromDateKey(dateKey) {
      const date = dateKeyToDate(dateKey);
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null;
      }
      const weekday = date.getUTCDay();
      return (weekday + 6) % 7;
    }


    /**
     * CSV duomenų užkrovimas iš Google Sheets (ar kito šaltinio) su demonstraciniu rezervu.
     */
    async function loadCsvSource(config, workerOptions, { required = false, sourceId = 'primary', label = '' } = {}) {
      const trimmedUrl = (config?.url ?? '').trim();
      const allowFallback = Boolean(config?.useFallback);
      const fallbackRaw = typeof config?.fallbackCsv === 'string' ? config.fallbackCsv : '';
      const fallbackContent = allowFallback && fallbackRaw.trim().length ? fallbackRaw : '';
      const missingMessage = config?.missingMessage || 'Nenurodytas duomenų URL.';
      const result = {
        records: [],
        dailyStats: [],
        meta: {
          sourceId,
          url: trimmedUrl,
          label: label || sourceId,
        },
        usingFallback: false,
        lastErrorMessage: '',
        error: null,
      };
      const onChunk = typeof config?.onChunk === 'function' ? config.onChunk : null;
      const onWorkerProgress = typeof config?.onWorkerProgress === 'function'
        ? config.onWorkerProgress
        : null;
      const workerProgressStep = onWorkerProgress
        ? (Number.isInteger(config?.workerProgressStep) && config.workerProgressStep > 0
          ? config.workerProgressStep
          : 400)
        : null;

      const parseDataset = async (csvText) => {
        const dataset = await runDataWorker(csvText, workerOptions, { onProgress: onWorkerProgress, progressStep: workerProgressStep });
        return {
          records: Array.isArray(dataset?.records) ? dataset.records : [],
          dailyStats: Array.isArray(dataset?.dailyStats) ? dataset.dailyStats : [],
        };
      };

      const assignDataset = (dataset, metaOverrides = {}) => {
        result.records = dataset.records;
        result.dailyStats = dataset.dailyStats;
        result.meta = { ...result.meta, ...metaOverrides };
      };

      if (!trimmedUrl) {
        if (fallbackContent) {
          const dataset = await parseDataset(fallbackContent);
          assignDataset(dataset, { fromFallback: true });
          result.usingFallback = true;
          result.lastErrorMessage = missingMessage;
          result.error = missingMessage;
          return result;
        }
        result.lastErrorMessage = missingMessage;
        result.error = missingMessage;
        if (required) {
          const error = new Error(missingMessage);
          error.diagnostic = { type: 'config', sourceId, reason: 'missing-url' };
          throw error;
        }
        return result;
      }

      const cacheEntry = readDataCache(trimmedUrl);

      try {
        let download = await downloadCsv(trimmedUrl, { cacheInfo: cacheEntry, onChunk });
        if (download.status === 304) {
          if (cacheEntry?.records && cacheEntry?.dailyStats) {
            assignDataset({
              records: cacheEntry.records,
              dailyStats: cacheEntry.dailyStats,
            }, {
              etag: cacheEntry.etag,
              lastModified: cacheEntry.lastModified,
              signature: cacheEntry.signature,
              cacheStatus: download.cacheStatus,
              fromCache: true,
            });
            return result;
          }
          clearDataCache(trimmedUrl);
          download = await downloadCsv(trimmedUrl, { onChunk });
        }

        const dataset = await runDataWorker(download.text, workerOptions, {
          onProgress: onWorkerProgress,
          progressStep: workerProgressStep,
        });
        assignDataset({
          records: Array.isArray(dataset?.records) ? dataset.records : [],
          dailyStats: Array.isArray(dataset?.dailyStats) ? dataset.dailyStats : [],
        }, {
          etag: download.etag,
          lastModified: download.lastModified,
          signature: download.signature,
          cacheStatus: download.cacheStatus,
          fromCache: false,
        });
        writeDataCache(trimmedUrl, {
          etag: download.etag,
          lastModified: download.lastModified,
          signature: download.signature,
          records: result.records,
          dailyStats: result.dailyStats,
        });
        return result;
      } catch (error) {
        console.error(`Nepavyko atsisiųsti CSV duomenų (${sourceId}):`, error);
        const friendly = describeError(error);
        result.lastErrorMessage = friendly;
        result.error = friendly;
        if (cacheEntry?.records && cacheEntry?.dailyStats) {
          console.warn(`Naudojami talpyklos duomenys dėl klaidos (${sourceId}).`);
          assignDataset({
            records: cacheEntry.records,
            dailyStats: cacheEntry.dailyStats,
          }, {
            etag: cacheEntry.etag,
            lastModified: cacheEntry.lastModified,
            signature: cacheEntry.signature,
            fromCache: true,
            fallbackReason: friendly,
          });
          return result;
        }
        if (fallbackContent) {
          try {
            const fallbackDataset = await parseDataset(fallbackContent);
            assignDataset(fallbackDataset, { fromFallback: true });
            result.usingFallback = true;
            return result;
          } catch (fallbackError) {
            console.error(`Klaida skaitant demonstracinius duomenis (${sourceId}):`, fallbackError);
            const fallbackFriendly = describeError(fallbackError);
            result.lastErrorMessage = fallbackFriendly;
            result.error = fallbackFriendly;
            if (required) {
              throw fallbackError;
            }
            return result;
          }
        }
        if (required) {
          throw error;
        }
        return result;
      }
    }

    async function fetchData(options = {}) {
      const workerOptions = {
        csvSettings: settings.csv || {},
        csvDefaults: DEFAULT_SETTINGS.csv || {},
        calculations: settings.calculations || {},
        calculationDefaults: DEFAULT_SETTINGS.calculations || {},
      };

      const mainConfig = {
        url: settings?.dataSource?.url,
        useFallback: settings?.dataSource?.useFallback,
        fallbackCsv: settings?.dataSource?.fallbackCsv,
        missingMessage: 'Nenurodytas duomenų URL.',
        onChunk: typeof options?.onPrimaryChunk === 'function' ? options.onPrimaryChunk : null,
        onWorkerProgress: typeof options?.onWorkerProgress === 'function' ? options.onWorkerProgress : null,
      };

      const historicalDefaults = DEFAULT_SETTINGS?.dataSource?.historical || {};
      const historicalConfig = settings?.dataSource?.historical || historicalDefaults;
      const historicalLabel = historicalConfig.label || historicalDefaults.label || 'Papildomas istorinis (5 metai)';
      const historicalEnabled = historicalConfig.enabled !== false;
      let historicalMeta = null;

      const normalizedHistoricalConfig = historicalEnabled
        ? {
          url: historicalConfig.url,
          useFallback: historicalConfig.useFallback,
          fallbackCsv: historicalConfig.fallbackCsv,
          missingMessage: 'Nenurodytas papildomo istorinio šaltinio URL.',
          onChunk: typeof options?.onHistoricalChunk === 'function' ? options.onHistoricalChunk : null,
          onWorkerProgress: typeof options?.onWorkerProgress === 'function' ? options.onWorkerProgress : null,
        }
        : null;
      const historicalShouldAttempt = Boolean(normalizedHistoricalConfig)
        && ((normalizedHistoricalConfig.url ?? '').trim().length > 0
          || (normalizedHistoricalConfig.useFallback && (normalizedHistoricalConfig.fallbackCsv ?? '').trim().length > 0));

      const primaryPromise = loadCsvSource(mainConfig, workerOptions, {
        required: true,
        sourceId: 'primary',
        label: 'Pagrindinis CSV',
      });
      const historicalPromise = historicalEnabled && historicalShouldAttempt
        ? loadCsvSource(normalizedHistoricalConfig, workerOptions, {
          required: false,
          sourceId: 'historical',
          label: historicalLabel,
        })
        : Promise.resolve(null);

      const [primaryResult, historicalResult] = await Promise.all([primaryPromise, historicalPromise]);

      const baseRecords = Array.isArray(primaryResult.records) ? primaryResult.records : [];
      const baseDaily = Array.isArray(primaryResult.dailyStats) ? primaryResult.dailyStats : [];
      let combinedRecords = baseRecords.slice();
      let usingFallback = Boolean(primaryResult.usingFallback);
      const fallbackMessages = [];
      if (primaryResult.usingFallback) {
        fallbackMessages.push(primaryResult.lastErrorMessage || 'Nenurodytas duomenų URL.');
      }
      const warnings = [];
      const primaryUrl = (settings?.dataSource?.url ?? '').trim();
      const sources = [
        {
          id: 'primary',
          label: 'Pagrindinis CSV',
          url: primaryResult.meta?.url || primaryUrl,
          fromCache: Boolean(primaryResult.meta?.fromCache),
          fromFallback: Boolean(primaryResult.meta?.fromFallback),
          usingFallback: primaryResult.usingFallback,
          lastErrorMessage: primaryResult.lastErrorMessage || '',
          error: primaryResult.error || '',
          used: baseRecords.length > 0,
          enabled: true,
        },
      ];

      if (primaryResult.error && !primaryResult.usingFallback && primaryResult.meta?.fromCache) {
        warnings.push(`Pagrindinis CSV: ${primaryResult.error}`);
      }

      if (historicalEnabled) {
        if (historicalShouldAttempt && historicalResult) {
          historicalMeta = historicalResult.meta || null;
          const historicalRecords = Array.isArray(historicalResult.records) ? historicalResult.records : [];
          if (historicalRecords.length) {
            combinedRecords = combinedRecords.concat(historicalRecords);
          }
          if (historicalResult.usingFallback) {
            usingFallback = true;
            const message = historicalResult.lastErrorMessage || 'Papildomas šaltinis pasiektas iš demonstracinių duomenų.';
            fallbackMessages.push(`${historicalLabel}: ${message}`);
          } else if (historicalResult.error) {
            warnings.push(`${historicalLabel}: ${historicalResult.error}`);
          }
          sources.push({
            id: 'historical',
            label: historicalLabel,
            url: historicalResult.meta?.url || (historicalConfig.url ?? ''),
            fromCache: Boolean(historicalResult.meta?.fromCache),
            fromFallback: Boolean(historicalResult.meta?.fromFallback),
            usingFallback: historicalResult.usingFallback,
            lastErrorMessage: historicalResult.lastErrorMessage || '',
            error: historicalResult.error || '',
            used: historicalRecords.length > 0,
            enabled: true,
          });
        } else {
          sources.push({
            id: 'historical',
            label: historicalLabel,
            url: historicalConfig.url || '',
            fromCache: false,
            fromFallback: false,
            usingFallback: false,
            lastErrorMessage: '',
            error: '',
            used: false,
            enabled: true,
          });
          warnings.push(`${historicalLabel}: Nenurodytas papildomo istorinio šaltinio URL.`);
        }
      } else {
        sources.push({
          id: 'historical',
          label: historicalLabel,
          url: historicalConfig.url || '',
          fromCache: false,
          fromFallback: false,
          usingFallback: false,
          lastErrorMessage: '',
          error: '',
          used: false,
          enabled: false,
        });
      }

      dashboardState.usingFallback = usingFallback;
      dashboardState.lastErrorMessage = usingFallback ? fallbackMessages.join(' ').trim() : '';

      const meta = {
        primary: { ...(primaryResult.meta || {}), sourceId: 'primary' },
        historical: historicalMeta ? { ...historicalMeta, sourceId: 'historical' } : null,
        sources,
        warnings,
      };

      const hasBaseDaily = Array.isArray(baseDaily) && baseDaily.length > 0;
      const combinedDaily = (combinedRecords.length === baseRecords.length && hasBaseDaily)
        ? baseDaily.slice()
        : computeDailyStats(combinedRecords);
      const combinedYearlyStats = computeYearlyStats(computeMonthlyStats(combinedDaily.slice()));

      return {
        records: combinedRecords,
        primaryRecords: baseRecords,
        dailyStats: combinedDaily,
        primaryDaily: baseDaily.slice(),
        yearlyStats: combinedYearlyStats,
        meta,
      };
    }

    async function fetchEdData(options = {}) {
      const config = settings?.dataSource?.ed || DEFAULT_SETTINGS.dataSource.ed;
      const url = (config?.url ?? '').trim();
      const allowFallback = Boolean(config?.useFallback);
      const fallbackCsv = typeof config?.fallbackCsv === 'string' && config.fallbackCsv.trim().length
        ? config.fallbackCsv
        : DEFAULT_ED_CSV;
      const empty = {
        records: [],
        summary: createEmptyEdSummary(),
        dispositions: [],
        daily: [],
        meta: { type: 'legacy' },
        usingFallback: false,
        lastErrorMessage: '',
        error: null,
        updatedAt: new Date(),
      };

      const finalize = (result, options = {}) => {
        const payload = Array.isArray(result)
          ? { records: result, meta: {} }
          : (result && typeof result === 'object'
            ? {
              records: Array.isArray(result.records) ? result.records : [],
              meta: result.meta && typeof result.meta === 'object' ? result.meta : {},
            }
            : { records: [], meta: {} });
        const aggregates = summarizeEdRecords(payload.records, payload.meta);
        return {
          records: payload.records,
          summary: aggregates.summary,
          dispositions: aggregates.dispositions,
          daily: aggregates.daily,
          meta: { ...payload.meta, ...(aggregates.meta || {}) },
          usingFallback: Boolean(options.usingFallback),
          lastErrorMessage: options.lastErrorMessage || '',
          error: options.error || null,
          updatedAt: new Date(),
        };
      };

      const useFallback = (reason) => {
        if (!allowFallback || !fallbackCsv) {
          return {
            ...empty,
            lastErrorMessage: reason || TEXT.ed.status.noUrl,
            error: reason || TEXT.ed.status.noUrl,
          };
        }
        try {
          const result = transformEdCsv(fallbackCsv);
          return finalize(result, { usingFallback: true, lastErrorMessage: reason || TEXT.ed.status.noUrl });
        } catch (fallbackError) {
          const friendly = describeError(fallbackError);
          return {
            ...empty,
            usingFallback: true,
            lastErrorMessage: friendly,
            error: reason || friendly,
          };
        }
      };

      if (!url) {
        return useFallback(TEXT.ed.status.noUrl);
      }

      try {
        const download = await downloadCsv(url, { onChunk: options?.onChunk });
        const result = transformEdCsv(download.text);
        return finalize(result);
      } catch (error) {
        const friendly = describeError(error);
        if (allowFallback && fallbackCsv) {
          try {
            const result = transformEdCsv(fallbackCsv);
            return finalize(result, { usingFallback: true, lastErrorMessage: friendly });
          } catch (fallbackError) {
            const fallbackFriendly = describeError(fallbackError);
            return {
              ...empty,
              usingFallback: true,
              lastErrorMessage: fallbackFriendly,
              error: friendly,
            };
          }
        }
        return {
          ...empty,
          lastErrorMessage: friendly,
          error: friendly,
        };
      }
    }

    const FEEDBACK_HEADER_CANDIDATES = {
      date: 'timestamp,gauta,data,received,created,submitted,laikas,pildymo data,pildymo laikas,pildymo data ir laikas,užpildymo data,užpildymo laikas,forma pateikta,data pateikta,atsakymo data,atsakymo laikas,įrašo data,įrašo laikas',
      respondent: 'kas pildo formą?,kas pildo formą,kas pildo forma,respondentas,role,dalyvis,tipas',
      location: 'kur pildėte anketą?,kur pildėte anketą,kur pildėte anketa,kur pildėte forma,kur pildėte formą?,kur pildoma anketa,pildymo vieta,pildymo vieta?,apklausos vieta,location,kur pildoma forma,šaltinis,saltinis',
      overall: 'kaip vertinate savo bendrą patirtį mūsų skyriuje?,*bendr* patirt*,overall,general experience,experience rating',
      doctors: 'kaip vertinate gydytojų darbą,*gydytojų darb*,gydytoju darba,gydytojų vertinimas,physician,doctor rating',
      nurses: 'kaip vertinate slaugytojų darbą ?,kaip vertinate slaugytojų darbą,*slaugytojų darb*,slaugytoju darba,slaugytojų vertinimas,nurse rating',
      aidesContact: 'ar bendravote su slaugytojų padėjėjais?,ar bendravote su slaugytojų padėjėjais,ar bendravote su slaugytoju padejejais,ar bendravote su padėjėjais,contact with aides',
      aides: 'kaip vertinate slaugytojų padėjėjų darbą,*padėjėjų darb*,slaugytoju padejeju darba,padėjėjų vertinimas,aide rating',
      waiting: 'kaip vertinate laukimo laiką skyriuje?,*laukimo laik*,wait time,laukimo vertinimas',
    };

    const FEEDBACK_CONTACT_YES = 'taip,yes,yeah,1,true';
    const FEEDBACK_CONTACT_NO = 'ne,no,0,false';

    function resolveFeedbackColumn(headerNormalized, candidateList) {
      const candidates = parseCandidateList(candidateList, candidateList);
      for (const candidate of candidates) {
        const trimmed = candidate.trim();
        if (!trimmed || trimmed.includes('*')) {
          continue;
        }
        const match = headerNormalized.find((column) => column.original === trimmed);
        if (match) {
          return match.index;
        }
      }

      for (const candidate of candidates) {
        const trimmed = candidate.trim().toLowerCase();
        if (!trimmed || candidate.includes('*')) {
          continue;
        }
        const match = headerNormalized.find((column) => column.normalized === trimmed);
        if (match) {
          return match.index;
        }
      }

      for (const candidate of candidates) {
        const normalizedCandidate = candidate.trim().toLowerCase();
        if (!normalizedCandidate || candidate.includes('*')) {
          continue;
        }
        const match = headerNormalized.find((column) => column.normalized.includes(normalizedCandidate));
        if (match) {
          return match.index;
        }
      }

      for (const candidate of candidates) {
        const normalizedCandidate = candidate.trim().toLowerCase();
        if (!normalizedCandidate) {
          continue;
        }
        const match = headerNormalized.find((column) => matchesWildcard(column.normalized, normalizedCandidate));
        if (match) {
          return match.index;
        }
      }

      return -1;
    }

    function normalizeFeedbackRating(value) {
      if (!Number.isFinite(value)) {
        return null;
      }
      if (value >= FEEDBACK_RATING_MIN && value <= FEEDBACK_RATING_MAX) {
        return value;
      }
      if (value > FEEDBACK_RATING_MAX && value <= FEEDBACK_LEGACY_MAX) {
        const scaled = (value / FEEDBACK_LEGACY_MAX) * FEEDBACK_RATING_MAX;
        const clamped = Math.min(FEEDBACK_RATING_MAX, Math.max(FEEDBACK_RATING_MIN, scaled));
        return clamped;
      }
      return null;
    }

    function parseFeedbackRatingCell(value) {
      if (value == null) {
        return null;
      }
      const text = String(value).trim();
      if (!text) {
        return null;
      }
      const normalized = text.replace(',', '.');
      const direct = Number.parseFloat(normalized);
      if (Number.isFinite(direct)) {
        return normalizeFeedbackRating(direct);
      }
      const match = normalized.match(/(-?\d+(?:\.\d+)?)/);
      if (match) {
        const fallback = Number.parseFloat(match[1]);
        return normalizeFeedbackRating(fallback);
      }
      return null;
    }

    function parseFeedbackContactValue(value, yesCandidates, noCandidates) {
      if (value == null) {
        return null;
      }
      const text = String(value).trim();
      if (!text) {
        return null;
      }
      const normalized = text.toLowerCase();
      if (yesCandidates.some((candidate) => matchesWildcard(normalized, candidate))) {
        return true;
      }
      if (noCandidates.some((candidate) => matchesWildcard(normalized, candidate))) {
        return false;
      }
      return null;
    }

    function transformFeedbackCsv(text) {
      if (typeof text !== 'string' || !text.trim()) {
        return [];
      }
      const { rows } = parseCsv(text);
      if (!rows.length) {
        return [];
      }
      const header = rows[0].map((cell) => String(cell ?? '').trim());
      const headerNormalized = header.map((column, index) => ({
        original: column,
        normalized: column.toLowerCase(),
        index,
      }));

      const indices = {
        date: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.date),
        respondent: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.respondent),
        location: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.location),
        overall: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.overall),
        doctors: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.doctors),
        nurses: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.nurses),
        aidesContact: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.aidesContact),
        aides: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.aides),
        waiting: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.waiting),
      };

      const yesCandidates = parseCandidateList(FEEDBACK_CONTACT_YES, FEEDBACK_CONTACT_YES)
        .map((token) => token.toLowerCase());
      const noCandidates = parseCandidateList(FEEDBACK_CONTACT_NO, FEEDBACK_CONTACT_NO)
        .map((token) => token.toLowerCase());

      const rowsWithoutHeader = rows.slice(1).filter((row) => row.some((cell) => (cell ?? '').trim().length > 0));
      return rowsWithoutHeader
        .map((columns) => {
          const rawDate = indices.date >= 0 ? columns[indices.date] : '';
          const parsedDate = parseDate(rawDate);
          const dateValue = parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;

          const respondent = indices.respondent >= 0
            ? String(columns[indices.respondent] ?? '').trim()
            : '';

          const location = indices.location >= 0
            ? String(columns[indices.location] ?? '').trim()
            : '';

          const overallRating = indices.overall >= 0
            ? parseFeedbackRatingCell(columns[indices.overall])
            : null;
          const doctorsRating = indices.doctors >= 0
            ? parseFeedbackRatingCell(columns[indices.doctors])
            : null;
          const nursesRating = indices.nurses >= 0
            ? parseFeedbackRatingCell(columns[indices.nurses])
            : null;
          const aidesContact = indices.aidesContact >= 0
            ? parseFeedbackContactValue(columns[indices.aidesContact], yesCandidates, noCandidates)
            : null;
          const aidesRating = indices.aides >= 0
            ? parseFeedbackRatingCell(columns[indices.aides])
            : null;
          const waitingRating = indices.waiting >= 0
            ? parseFeedbackRatingCell(columns[indices.waiting])
            : null;

          const hasRating = [overallRating, doctorsRating, nursesRating, aidesRating, waitingRating]
            .some((value) => Number.isFinite(value));
          const hasContact = aidesContact === true || aidesContact === false;
          const hasRespondent = respondent.length > 0;

          const hasLocation = location.length > 0;

          if (!dateValue && !hasRating && !hasRespondent && !hasContact && !hasLocation) {
            return null;
          }

          return {
            receivedAt: dateValue,
            respondent,
            location,
            overallRating: Number.isFinite(overallRating) ? overallRating : null,
            doctorsRating: Number.isFinite(doctorsRating) ? doctorsRating : null,
            nursesRating: Number.isFinite(nursesRating) ? nursesRating : null,
            aidesContact: hasContact ? aidesContact : null,
            aidesRating: Number.isFinite(aidesRating) ? aidesRating : null,
            waitingRating: Number.isFinite(waitingRating) ? waitingRating : null,
          };
        })
        .filter(Boolean);
    }

    async function fetchFeedbackData() {
      const config = settings?.dataSource?.feedback || DEFAULT_SETTINGS.dataSource.feedback;
      const url = (config?.url ?? '').trim();
      const useFallback = Boolean(config?.useFallback);
      const fallbackCsv = typeof config?.fallbackCsv === 'string'
        ? config.fallbackCsv
        : DEFAULT_SETTINGS.dataSource.feedback.fallbackCsv;
      const fallbackContent = useFallback ? fallbackCsv : '';

      if (!url) {
        if (fallbackContent) {
          try {
            const dataset = transformFeedbackCsv(fallbackContent);
            dashboardState.feedback.usingFallback = true;
            dashboardState.feedback.lastErrorMessage = TEXT.feedback.status.missingUrl;
            return dataset;
          } catch (error) {
            console.error('Klaida skaitant demonstracinius atsiliepimus:', error);
            dashboardState.feedback.usingFallback = false;
            dashboardState.feedback.lastErrorMessage = describeError(error);
            return [];
          }
        }
        dashboardState.feedback.usingFallback = false;
        dashboardState.feedback.lastErrorMessage = '';
        return [];
      }

      try {
        const download = await downloadCsv(url);
        const dataset = transformFeedbackCsv(download.text);
        dashboardState.feedback.usingFallback = false;
        dashboardState.feedback.lastErrorMessage = '';
        return dataset;
      } catch (error) {
        console.error('Nepavyko atsisiųsti atsiliepimų CSV:', error);
        const friendly = describeError(error);
        dashboardState.feedback.lastErrorMessage = friendly;
        if (fallbackContent) {
          try {
            const dataset = transformFeedbackCsv(fallbackContent);
            dashboardState.feedback.usingFallback = true;
            return dataset;
          } catch (fallbackError) {
            console.error('Klaida skaitant demonstracinius atsiliepimų duomenis:', fallbackError);
            dashboardState.feedback.usingFallback = false;
            dashboardState.feedback.lastErrorMessage = describeError(fallbackError);
            return [];
          }
        }
        dashboardState.feedback.usingFallback = false;
        return [];
      }
    }

    /**
     * Grąžina tik paskutines N dienų įrašus (pagal vėliausią turimą datą).
     * @param {Array<{date: string}>} dailyStats
     * @param {number} days
     */
    function filterDailyStatsByWindow(dailyStats, days) {
      if (!Array.isArray(dailyStats)) {
        return [];
      }
      if (!Number.isFinite(days) || days <= 0) {
        return [...dailyStats];
      }
      const decorated = dailyStats
        .map((entry) => ({ entry, utc: dateKeyToUtc(entry?.date) }))
        .filter((item) => Number.isFinite(item.utc));
      if (!decorated.length) {
        return [];
      }
      const endUtc = decorated.reduce((max, item) => Math.max(max, item.utc), decorated[0].utc);
      const startUtc = endUtc - (days - 1) * 86400000;
      return decorated
        .filter((item) => item.utc >= startUtc && item.utc <= endUtc)
        .map((item) => item.entry);
    }

    function filterRecordsByWindow(records, days) {
      if (!Array.isArray(records)) {
        return [];
      }
      if (!Number.isFinite(days) || days <= 0) {
        return records.slice();
      }
      const decorated = records
        .map((entry) => {
          let reference = null;
          if (entry.arrival instanceof Date && !Number.isNaN(entry.arrival.getTime())) {
            reference = entry.arrival;
          } else if (entry.discharge instanceof Date && !Number.isNaN(entry.discharge.getTime())) {
            reference = entry.discharge;
          }
          if (!reference) {
            return null;
          }
          const utc = Date.UTC(reference.getFullYear(), reference.getMonth(), reference.getDate());
          if (!Number.isFinite(utc)) {
            return null;
          }
          return { entry, utc };
        })
        .filter(Boolean);
      if (!decorated.length) {
        return [];
      }
      const endUtc = decorated.reduce((max, item) => Math.max(max, item.utc), decorated[0].utc);
      const startUtc = endUtc - (days - 1) * 86400000;
      return decorated
        .filter((item) => item.utc >= startUtc && item.utc <= endUtc)
        .map((item) => item.entry);
    }

    function filterRecordsByShiftWindow(records, days) {
      if (!Array.isArray(records)) {
        return [];
      }
      if (!Number.isFinite(days) || days <= 0) {
        return records.slice();
      }
      const shiftStartHour = resolveShiftStartHour(settings?.calculations);
      const decorated = records
        .map((entry) => {
          const hasArrival = entry.arrival instanceof Date && !Number.isNaN(entry.arrival.getTime());
          const hasDischarge = entry.discharge instanceof Date && !Number.isNaN(entry.discharge.getTime());
          const reference = hasArrival ? entry.arrival : (hasDischarge ? entry.discharge : null);
          if (!reference) {
            return null;
          }
          const dateKey = computeShiftDateKey(reference, shiftStartHour);
          if (!dateKey) {
            return null;
          }
          const utc = dateKeyToUtc(dateKey);
          if (!Number.isFinite(utc)) {
            return null;
          }
          return { entry, utc };
        })
        .filter(Boolean);
      if (!decorated.length) {
        return [];
      }
      const endUtc = decorated.reduce((max, item) => Math.max(max, item.utc), decorated[0].utc);
      const startUtc = endUtc - (days - 1) * 86400000;
      return decorated
        .filter((item) => item.utc >= startUtc && item.utc <= endUtc)
        .map((item) => item.entry);
    }

    function filterDailyStatsByYear(dailyStats, year) {
      if (!Number.isFinite(year)) {
        return Array.isArray(dailyStats) ? dailyStats.slice() : [];
      }
      const targetYear = Number(year);
      return (Array.isArray(dailyStats) ? dailyStats : []).filter((entry) => {
        if (!entry || typeof entry.date !== 'string') {
          return false;
        }
        const date = dateKeyToDate(entry.date);
        return date instanceof Date
          && !Number.isNaN(date.getTime())
          && date.getUTCFullYear() === targetYear;
      });
    }

    function filterRecordsByYear(records, year) {
      if (!Number.isFinite(year)) {
        return Array.isArray(records) ? records.slice() : [];
      }
      const targetYear = Number(year);
      return (Array.isArray(records) ? records : []).filter((entry) => {
        const arrivalYear = entry?.arrival instanceof Date && !Number.isNaN(entry.arrival.getTime())
          ? entry.arrival.getFullYear()
          : null;
        const dischargeYear = entry?.discharge instanceof Date && !Number.isNaN(entry.discharge.getTime())
          ? entry.discharge.getFullYear()
          : null;
        const referenceYear = Number.isFinite(arrivalYear) ? arrivalYear : dischargeYear;
        return Number.isFinite(referenceYear) && referenceYear === targetYear;
      });
    }

    function parseDurationMinutes(value) {
      if (value == null) {
        return null;
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      const text = String(value).trim();
      if (!text) {
        return null;
      }
      const numeric = Number.parseFloat(text.replace(',', '.'));
      if (Number.isFinite(numeric)) {
        if (/\b(h|val)\b/i.test(text) && !/\bmin/i.test(text)) {
          return numeric * 60;
        }
        if (/\b(sec|s)\b/i.test(text) && !/\bmin|h|val/i.test(text)) {
          return numeric / 60;
        }
        return numeric;
      }
      const parts = text.split(':');
      if (parts.length >= 2 && parts.length <= 3) {
        const hours = Number.parseFloat(parts[0].replace(',', '.'));
        const minutes = Number.parseFloat(parts[1].replace(',', '.'));
        const seconds = parts.length === 3 ? Number.parseFloat(parts[2].replace(',', '.')) : 0;
        if ([hours, minutes].every((component) => Number.isFinite(component))) {
          const secValue = Number.isFinite(seconds) ? seconds : 0;
          return hours * 60 + minutes + secValue / 60;
        }
      }
      let totalMinutes = 0;
      let matched = false;
      const hoursMatch = text.match(/([0-9]+(?:[\.,][0-9]+)?)\s*(h|val)/i);
      if (hoursMatch) {
        totalMinutes += Number.parseFloat(hoursMatch[1].replace(',', '.')) * 60;
        matched = true;
      }
      const minutesMatch = text.match(/([0-9]+(?:[\.,][0-9]+)?)\s*(min|minutes|mins)/i);
      if (minutesMatch) {
        totalMinutes += Number.parseFloat(minutesMatch[1].replace(',', '.'));
        matched = true;
      }
      const secondsMatch = text.match(/([0-9]+(?:[\.,][0-9]+)?)\s*(sec|s)/i);
      if (secondsMatch) {
        totalMinutes += Number.parseFloat(secondsMatch[1].replace(',', '.')) / 60;
        matched = true;
      }
      if (matched && Number.isFinite(totalMinutes) && totalMinutes >= 0) {
        return totalMinutes;
      }
      return null;
    }

    function parseNumericCell(value) {
      if (value == null) {
        return null;
      }
      const text = String(value).trim();
      if (!text) {
        return null;
      }
      const normalized = text.replace(',', '.');
      const direct = Number.parseFloat(normalized);
      if (Number.isFinite(direct)) {
        return direct;
      }
      const match = normalized.match(/(-?\d+(?:\.\d+)?)/);
      if (match) {
        const fallback = Number.parseFloat(match[1]);
        return Number.isFinite(fallback) ? fallback : null;
      }
      return null;
    }

    function normalizeRatioValue(value) {
      if (value == null) {
        return { ratio: null, text: '' };
      }
      const text = String(value).trim();
      if (!text) {
        return { ratio: null, text: '' };
      }
      const normalized = text.replace(',', '.');
      const match = normalized.match(/(\d+(?:\.\d+)?)\s*[:\/\-]\s*(\d+(?:\.\d+)?)/);
      if (match) {
        const a = Number.parseFloat(match[1]);
        const b = Number.parseFloat(match[2]);
        if (Number.isFinite(a) && Number.isFinite(b) && a > 0) {
          return { ratio: b / a, text };
        }
      }
      const numeric = Number.parseFloat(normalized);
      if (Number.isFinite(numeric) && numeric > 0) {
        return { ratio: numeric, text };
      }
      return { ratio: null, text };
    }

    function normalizeDispositionValue(value) {
      const raw = typeof value === 'string' ? value.trim() : '';
      if (!raw) {
        return { label: 'Nežinoma', category: 'unknown' };
      }
      const lower = raw.toLowerCase();
      if (/(hospital|stacion|admit|ward|perkel|stacionar|stac\.|priimtuvas)/i.test(lower)) {
        return { label: raw, category: 'hospitalized' };
      }
      if (/(discharg|nam|ambulator|released|outpatient|home|išle)/i.test(lower)) {
        return { label: raw, category: 'discharged' };
      }
      if (/(transfer|perkeltas|perkelta|pervež|perkėlimo)/i.test(lower)) {
        return { label: raw, category: 'transfer' };
      }
      if (/(left|atsisak|neatvyko|nedalyv|amoa|dnw|did not wait|lwbs|lwt|pabėg|walked)/i.test(lower)) {
        return { label: raw, category: 'left' };
      }
      return { label: raw, category: 'other' };
    }

    function createEmptyEdSummary(mode = 'legacy') {
      return {
        mode,
        totalPatients: 0,
        uniqueDates: 0,
        avgDailyPatients: null,
        avgLosMinutes: null,
        avgLosHospitalizedMinutes: null,
        avgLosMonthMinutes: null,
        avgLosYearMinutes: null,
        avgLabMinutes: null,
        avgLabMonthMinutes: null,
        avgLabYearMinutes: null,
        avgDoorToProviderMinutes: null,
        avgDecisionToLeaveMinutes: null,
        hospitalizedShare: null,
        hospitalizedMonthShare: null,
        hospitalizedYearShare: null,
        avgDaytimePatientsMonth: null,
        currentMonthKey: '',
        entryCount: 0,
        currentPatients: null,
        occupiedBeds: null,
        nursePatientsPerStaff: null,
        doctorPatientsPerStaff: null,
        latestSnapshotLabel: '',
        latestSnapshotAt: null,
        generatedAt: new Date(),
        peakWindowText: '',
        peakWindowRiskNote: '',
        losMedianMinutes: null,
        losP90Minutes: null,
        losVariabilityIndex: null,
        losPercentilesText: '',
        taktTimeMinutes: null,
        taktTimeMeta: '',
        littlesLawEstimate: null,
        littlesLawMeta: '',
        fastLaneShare: null,
        slowLaneShare: null,
        fastLaneDelta: null,
        slowLaneDelta: null,
        fastSlowSplitValue: '',
        fastSlowTrendText: '',
        fastSlowTrendWindowDays: 0,
      };
    }

    function transformEdCsv(text) {
      if (!text) {
        throw new Error('ED CSV turinys tuščias.');
      }
      const { rows } = parseCsv(text);
      if (!rows.length) {
        throw new Error('ED CSV neturi jokių eilučių.');
      }
      const header = rows[0].map((cell) => String(cell ?? '').trim());
      const headerNormalized = header.map((column, index) => ({
        original: column,
        normalized: column.toLowerCase(),
        index,
      }));
      const legacyCandidates = {
        date: ['date', 'data', 'service date', 'diena', 'atvykimo data'],
        arrival: ['arrival', 'arrival time', 'atvykimo laikas', 'atvykimo data', 'registered'],
        departure: ['departure', 'departure time', 'discharge', 'išrašymo data', 'išvykimo laikas', 'completion'],
        disposition: ['disposition', 'outcome', 'sprendimas', 'status', 'būsena', 'dispo'],
        los: ['length of stay (min)', 'los (min)', 'stay (min)', 'trukmė (min)', 'los minutes', 'los_min'],
        door: ['door to provider (min)', 'door to doctor (min)', 'door to doc (min)', 'door to physician (min)', 'laukimo laikas (min)', 'durys iki gydytojo (min)'],
        decision: ['decision to depart (min)', 'boarding (min)', 'decision to leave (min)', 'disposition to depart (min)', 'sprendimo laukimas (min)'],
        lab: [
          'avg lab turnaround (min)',
          'lab turnaround (min)',
          'vid. lab. tyrimų laikas (min)',
          'vid. lab. tyrimų laikas',
          'vid. lab. tyrimu laikas (min)',
          'vid. lab. tyrimu laikas',
          'lab',
          'laboratorijos trukmė (min)',
        ],
      };
      const legacyIndices = {
        date: resolveColumnIndex(headerNormalized, legacyCandidates.date),
        arrival: resolveColumnIndex(headerNormalized, legacyCandidates.arrival),
        departure: resolveColumnIndex(headerNormalized, legacyCandidates.departure),
        disposition: resolveColumnIndex(headerNormalized, legacyCandidates.disposition),
        los: resolveColumnIndex(headerNormalized, legacyCandidates.los),
        door: resolveColumnIndex(headerNormalized, legacyCandidates.door),
        decision: resolveColumnIndex(headerNormalized, legacyCandidates.decision),
        lab: resolveColumnIndex(headerNormalized, legacyCandidates.lab),
      };
      const snapshotCandidates = {
        timestamp: ['timestamp', 'datetime', 'laikas', 'įrašyta', 'atnaujinta', 'data', 'created', 'updated'],
        currentPatients: ['šiuo metu pacientų', 'current patients', 'patients now', 'patients in ed'],
        occupiedBeds: ['užimta lovų', 'occupied beds', 'beds occupied'],
        nurseRatio: ['slaugytojų - pacientų santykis', 'nurse - patient ratio', 'nurse to patient ratio', 'nurse ratio'],
        doctorRatio: ['gydytojų - pacientų santykis', 'doctor - patient ratio', 'doctor to patient ratio', 'physician ratio'],
        lab: [
          'lab',
          'avg lab turnaround (min)',
          'lab turnaround (min)',
          'vid. lab. tyrimų laikas (min)',
          'vid. lab. tyrimų laikas',
        ],
        category1: ['1 kategorijos pacientų', 'category 1 patients', 'patients category 1', 'c1'],
        category2: ['2 kategorijos pacientų', 'category 2 patients', 'patients category 2', 'c2'],
        category3: ['3 kategorijos pacientų', 'category 3 patients', 'patients category 3', 'c3'],
        category4: ['4 kategorijos pacientų', 'category 4 patients', 'patients category 4', 'c4'],
        category5: ['5 kategorijos pacientų', 'category 5 patients', 'patients category 5', 'c5'],
      };
      const snapshotIndices = {
        timestamp: resolveColumnIndex(headerNormalized, snapshotCandidates.timestamp),
        currentPatients: resolveColumnIndex(headerNormalized, snapshotCandidates.currentPatients),
        occupiedBeds: resolveColumnIndex(headerNormalized, snapshotCandidates.occupiedBeds),
        nurseRatio: resolveColumnIndex(headerNormalized, snapshotCandidates.nurseRatio),
        doctorRatio: resolveColumnIndex(headerNormalized, snapshotCandidates.doctorRatio),
        lab: resolveColumnIndex(headerNormalized, snapshotCandidates.lab),
        category1: resolveColumnIndex(headerNormalized, snapshotCandidates.category1),
        category2: resolveColumnIndex(headerNormalized, snapshotCandidates.category2),
        category3: resolveColumnIndex(headerNormalized, snapshotCandidates.category3),
        category4: resolveColumnIndex(headerNormalized, snapshotCandidates.category4),
        category5: resolveColumnIndex(headerNormalized, snapshotCandidates.category5),
      };
      const hasSnapshot = snapshotIndices.currentPatients >= 0
        || snapshotIndices.occupiedBeds >= 0
        || snapshotIndices.nurseRatio >= 0
        || snapshotIndices.doctorRatio >= 0
        || snapshotIndices.category1 >= 0
        || snapshotIndices.category2 >= 0
        || snapshotIndices.category3 >= 0
        || snapshotIndices.category4 >= 0
        || snapshotIndices.category5 >= 0;
      const hasLegacy = Object.values(legacyIndices).some((index) => index >= 0);
      const datasetType = hasSnapshot && hasLegacy ? 'hybrid' : (hasSnapshot ? 'snapshot' : 'legacy');

      const records = [];
      let syntheticCounter = 0;
      for (let i = 1; i < rows.length; i += 1) {
        const row = rows[i];
        if (!row || !row.length) {
          continue;
        }
        const normalizedRow = header.map((_, index) => {
          const cell = row[index];
          return cell != null ? String(cell).trim() : '';
        });

        const timestampRaw = snapshotIndices.timestamp >= 0 ? normalizedRow[snapshotIndices.timestamp] : '';
        const timestamp = timestampRaw ? parseDate(timestampRaw) : null;
        const arrivalValue = legacyIndices.arrival >= 0 ? normalizedRow[legacyIndices.arrival] : '';
        const departureValue = legacyIndices.departure >= 0 ? normalizedRow[legacyIndices.departure] : '';
        const dateValue = legacyIndices.date >= 0 ? normalizedRow[legacyIndices.date] : '';
        const arrivalDate = arrivalValue ? parseDate(arrivalValue) : null;
        const departureDate = departureValue ? parseDate(departureValue) : null;
        let recordDate = dateValue ? parseDate(dateValue) : null;
        if (!(recordDate instanceof Date) || Number.isNaN(recordDate.getTime())) {
          recordDate = arrivalDate || departureDate || (timestamp instanceof Date && !Number.isNaN(timestamp.getTime()) ? timestamp : null);
        }
        let dateKey = recordDate instanceof Date && !Number.isNaN(recordDate.getTime())
          ? toDateKeyFromDate(recordDate)
          : '';

        const dispositionValue = legacyIndices.disposition >= 0 ? normalizedRow[legacyIndices.disposition] : '';
        let losMinutes = legacyIndices.los >= 0 ? parseDurationMinutes(normalizedRow[legacyIndices.los]) : null;
        if (!Number.isFinite(losMinutes) && arrivalDate instanceof Date && departureDate instanceof Date) {
          const diffMinutes = (departureDate.getTime() - arrivalDate.getTime()) / 60000;
          if (Number.isFinite(diffMinutes) && diffMinutes >= 0) {
            losMinutes = diffMinutes;
          }
        }
        const doorMinutes = legacyIndices.door >= 0 ? parseDurationMinutes(normalizedRow[legacyIndices.door]) : null;
        const decisionMinutes = legacyIndices.decision >= 0 ? parseDurationMinutes(normalizedRow[legacyIndices.decision]) : null;
        const labMinutes = legacyIndices.lab >= 0 ? parseDurationMinutes(normalizedRow[legacyIndices.lab]) : null;
        const dispositionInfo = normalizeDispositionValue(dispositionValue);

        const currentPatients = snapshotIndices.currentPatients >= 0
          ? parseNumericCell(normalizedRow[snapshotIndices.currentPatients])
          : null;
        const occupiedBeds = snapshotIndices.occupiedBeds >= 0
          ? parseNumericCell(normalizedRow[snapshotIndices.occupiedBeds])
          : null;
        const nurseRatioInfo = snapshotIndices.nurseRatio >= 0
          ? normalizeRatioValue(normalizedRow[snapshotIndices.nurseRatio])
          : { ratio: null, text: '' };
        const doctorRatioInfo = snapshotIndices.doctorRatio >= 0
          ? normalizeRatioValue(normalizedRow[snapshotIndices.doctorRatio])
          : { ratio: null, text: '' };
        const snapshotLabMinutes = snapshotIndices.lab >= 0
          ? parseNumericCell(normalizedRow[snapshotIndices.lab])
          : null;
        const categories = {};
        let hasCategoryData = false;
        ['1', '2', '3', '4', '5'].forEach((key) => {
          const prop = `category${key}`;
          const index = snapshotIndices[prop];
          const value = index >= 0 ? parseNumericCell(normalizedRow[index]) : null;
          if (Number.isFinite(value) && value >= 0) {
            categories[key] = value;
            hasCategoryData = true;
          } else {
            categories[key] = null;
          }
        });
        const hasSnapshotData = Number.isFinite(currentPatients)
          || Number.isFinite(occupiedBeds)
          || Number.isFinite(nurseRatioInfo.ratio)
          || Number.isFinite(doctorRatioInfo.ratio)
          || hasCategoryData;

        if (!hasSnapshotData && datasetType === 'snapshot') {
          continue;
        }

        if (!dateKey) {
          if (datasetType === 'legacy' && !hasSnapshotData) {
            continue;
          }
          syntheticCounter += 1;
          dateKey = `snapshot-${String(syntheticCounter).padStart(3, '0')}`;
        }

        records.push({
          dateKey,
          timestamp: timestamp instanceof Date && !Number.isNaN(timestamp.getTime()) ? timestamp : null,
          rawTimestamp: timestampRaw,
          disposition: dispositionInfo.label,
          dispositionCategory: dispositionInfo.category,
          losMinutes: Number.isFinite(losMinutes) && losMinutes >= 0 ? losMinutes : null,
          doorToProviderMinutes: Number.isFinite(doorMinutes) && doorMinutes >= 0 ? doorMinutes : null,
          decisionToLeaveMinutes: Number.isFinite(decisionMinutes) && decisionMinutes >= 0 ? decisionMinutes : null,
          labMinutes: Number.isFinite(labMinutes) && labMinutes >= 0 ? labMinutes : null,
          snapshotLabMinutes: Number.isFinite(snapshotLabMinutes) && snapshotLabMinutes >= 0 ? snapshotLabMinutes : null,
          currentPatients: Number.isFinite(currentPatients) && currentPatients >= 0 ? currentPatients : null,
          occupiedBeds: Number.isFinite(occupiedBeds) && occupiedBeds >= 0 ? occupiedBeds : null,
          nurseRatio: Number.isFinite(nurseRatioInfo.ratio) && nurseRatioInfo.ratio > 0 ? nurseRatioInfo.ratio : null,
          nurseRatioText: nurseRatioInfo.text,
          doctorRatio: Number.isFinite(doctorRatioInfo.ratio) && doctorRatioInfo.ratio > 0 ? doctorRatioInfo.ratio : null,
          doctorRatioText: doctorRatioInfo.text,
          categories,
          arrivalHour: arrivalDate instanceof Date && !Number.isNaN(arrivalDate.getTime()) ? arrivalDate.getHours() : null,
          departureHour: departureDate instanceof Date && !Number.isNaN(departureDate.getTime()) ? departureDate.getHours() : null,
        });
      }

      return { records, meta: { type: datasetType } };
    }

    function formatHourLabel(hour) {
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        return '';
      }
      return `${String(hour).padStart(2, '0')}:00`;
    }

    function pickTopHours(hourCounts, limit = 3) {
      if (!Array.isArray(hourCounts) || !hourCounts.length) {
        return [];
      }
      return hourCounts
        .map((count, hour) => ({ hour, count }))
        .filter((entry) => Number.isFinite(entry.count) && entry.count > 0)
        .sort((a, b) => {
          if (b.count !== a.count) {
            return b.count - a.count;
          }
          return a.hour - b.hour;
        })
        .slice(0, Math.max(0, limit));
    }

    function computePercentile(sortedValues, percentile) {
      if (!Array.isArray(sortedValues) || !sortedValues.length) {
        return null;
      }
      const clamped = Math.min(Math.max(percentile, 0), 1);
      if (sortedValues.length === 1) {
        return sortedValues[0];
      }
      const index = (sortedValues.length - 1) * clamped;
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const weight = index - lower;
      if (upper >= sortedValues.length) {
        return sortedValues[sortedValues.length - 1];
      }
      if (lower === upper) {
        return sortedValues[lower];
      }
      const lowerValue = sortedValues[lower];
      const upperValue = sortedValues[upper];
      if (!Number.isFinite(lowerValue) || !Number.isFinite(upperValue)) {
        return null;
      }
      return lowerValue + (upperValue - lowerValue) * weight;
    }

    function formatPercentPointDelta(delta) {
      if (!Number.isFinite(delta)) {
        return '';
      }
      const magnitude = Math.abs(delta) * 100;
      const rounded = Math.round(magnitude * 10) / 10;
      if (!rounded) {
        return '±0 p.p.';
      }
      const sign = delta > 0 ? '+' : '−';
      return `${sign}${oneDecimalFormatter.format(rounded)} p.p.`;
    }

    function summarizeLegacyRecords(records) {
      const summary = createEmptyEdSummary('legacy');
      const dispositions = new Map();
      const categoryTotals = { hospitalized: 0, discharged: 0, left: 0, transfer: 0, other: 0 };
      const dailyBuckets = new Map();
      const monthBuckets = new Map();
      const arrivalHourCounts = Array.from({ length: 24 }, () => 0);
      const dischargeHourCounts = Array.from({ length: 24 }, () => 0);
      let arrivalsWithHour = 0;
      const losValues = [];
      const losPositiveValues = [];
      let losValidCount = 0;
      let fastCount = 0;
      let slowCount = 0;
      const validRecords = Array.isArray(records)
        ? records.filter((record) => record && typeof record.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.dateKey))
        : [];
      if (!validRecords.length) {
        return { summary, dispositions: [], daily: [] };
      }

      let losSum = 0;
      let losCount = 0;
      let hospitalizedLosSum = 0;
      let hospitalizedLosCount = 0;
      let doorSum = 0;
      let doorCount = 0;
      let decisionSum = 0;
      let decisionCount = 0;
      let labSum = 0;
      let labCount = 0;

      summary.totalPatients = validRecords.length;
      validRecords.forEach((record) => {
        const {
          dateKey,
          disposition,
          dispositionCategory,
          losMinutes,
          doorToProviderMinutes,
          decisionToLeaveMinutes,
          labMinutes,
          arrivalHour,
          departureHour,
        } = record;
        if (Number.isInteger(arrivalHour) && arrivalHour >= 0 && arrivalHour <= 23) {
          arrivalHourCounts[arrivalHour] += 1;
          arrivalsWithHour += 1;
        }
        if (Number.isInteger(departureHour) && departureHour >= 0 && departureHour <= 23) {
          dischargeHourCounts[departureHour] += 1;
        }
        const key = disposition && disposition.trim().length ? disposition : 'Nežinoma';
        if (!dispositions.has(key)) {
          dispositions.set(key, { label: key, count: 0, category: dispositionCategory || 'other' });
        }
        const dispositionEntry = dispositions.get(key);
        dispositionEntry.count += 1;
        const categoryKey = dispositionCategory && categoryTotals[dispositionCategory] != null ? dispositionCategory : 'other';
        categoryTotals[categoryKey] += 1;

        const bucket = dailyBuckets.get(dateKey) || {
          dateKey,
          patients: 0,
          losSum: 0,
          losCount: 0,
          doorSum: 0,
          doorCount: 0,
          labSum: 0,
          labCount: 0,
          fastCount: 0,
          slowCount: 0,
        };
        bucket.patients += 1;
        if (Number.isFinite(losMinutes)) {
          bucket.losSum += losMinutes;
          bucket.losCount += 1;
          losSum += losMinutes;
          losCount += 1;
          losValues.push(losMinutes);
          if (losMinutes > 0) {
            losPositiveValues.push(losMinutes);
          }
          losValidCount += 1;
          if (losMinutes < 120) {
            bucket.fastCount += 1;
            fastCount += 1;
          }
          if (losMinutes > 480) {
            bucket.slowCount += 1;
            slowCount += 1;
          }
          if (dispositionCategory === 'hospitalized') {
            hospitalizedLosSum += losMinutes;
            hospitalizedLosCount += 1;
          }
        }
        if (Number.isFinite(doorToProviderMinutes)) {
          bucket.doorSum += doorToProviderMinutes;
          bucket.doorCount += 1;
          doorSum += doorToProviderMinutes;
          doorCount += 1;
        }
        if (Number.isFinite(decisionToLeaveMinutes)) {
          decisionSum += decisionToLeaveMinutes;
          decisionCount += 1;
        }
        if (Number.isFinite(labMinutes)) {
          bucket.labSum += labMinutes;
          bucket.labCount += 1;
          labSum += labMinutes;
          labCount += 1;
        }
        dailyBuckets.set(dateKey, bucket);

        const monthKey = typeof dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
          ? dateKey.slice(0, 7)
          : '';
        if (monthKey) {
          const monthBucket = monthBuckets.get(monthKey) || {
            count: 0,
            hospitalized: 0,
            losSum: 0,
            losCount: 0,
            hospitalizedLosSum: 0,
            hospitalizedLosCount: 0,
            labSum: 0,
            labCount: 0,
          };
          monthBucket.count += 1;
          if (dispositionCategory === 'hospitalized') {
            monthBucket.hospitalized += 1;
          }
          if (Number.isFinite(losMinutes)) {
            monthBucket.losSum += losMinutes;
            monthBucket.losCount += 1;
            if (dispositionCategory === 'hospitalized') {
              monthBucket.hospitalizedLosSum += losMinutes;
              monthBucket.hospitalizedLosCount += 1;
            }
          }
          if (Number.isFinite(labMinutes)) {
            monthBucket.labSum += labMinutes;
            monthBucket.labCount += 1;
          }
          monthBuckets.set(monthKey, monthBucket);
        }
      });

      summary.uniqueDates = dailyBuckets.size;
      if (summary.uniqueDates > 0) {
        summary.avgDailyPatients = summary.totalPatients / summary.uniqueDates;
      }
      if (losCount > 0) {
        summary.avgLosMinutes = losSum / losCount;
      }
      if (hospitalizedLosCount > 0) {
        summary.avgLosHospitalizedMinutes = hospitalizedLosSum / hospitalizedLosCount;
      }
      if (doorCount > 0) {
        summary.avgDoorToProviderMinutes = doorSum / doorCount;
      }
      if (decisionCount > 0) {
        summary.avgDecisionToLeaveMinutes = decisionSum / decisionCount;
      }
      if (labCount > 0) {
        summary.avgLabMinutes = labSum / labCount;
      }
      if (summary.totalPatients > 0) {
        summary.hospitalizedShare = categoryTotals.hospitalized / summary.totalPatients;
      }
      summary.generatedAt = new Date();

      const monthlyDayTotals = new Map();
      dailyBuckets.forEach((bucket) => {
        if (!bucket || typeof bucket.dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(bucket.dateKey)) {
          return;
        }
        const monthKey = bucket.dateKey.slice(0, 7);
        if (!monthKey || !Number.isFinite(bucket.patients)) {
          return;
        }
        const entry = monthlyDayTotals.get(monthKey) || { patientSum: 0, dayCount: 0 };
        entry.patientSum += bucket.patients;
        entry.dayCount += 1;
        monthlyDayTotals.set(monthKey, entry);
      });

      if (monthBuckets.size > 0) {
        const sortedMonthKeys = Array.from(monthBuckets.keys()).sort();
        const latestMonthKey = sortedMonthKeys[sortedMonthKeys.length - 1];
        const currentMonth = monthBuckets.get(latestMonthKey);
        if (currentMonth) {
          summary.avgLosMonthMinutes = currentMonth.losCount > 0
            ? currentMonth.losSum / currentMonth.losCount
            : null;
          summary.hospitalizedMonthShare = currentMonth.count > 0
            ? currentMonth.hospitalized / currentMonth.count
            : null;
          summary.avgLabMonthMinutes = currentMonth.labCount > 0
            ? currentMonth.labSum / currentMonth.labCount
            : null;
          summary.currentMonthKey = latestMonthKey;
          const monthDayInfo = monthlyDayTotals.get(latestMonthKey);
          if (monthDayInfo && monthDayInfo.dayCount > 0) {
            summary.avgDaytimePatientsMonth = monthDayInfo.patientSum / monthDayInfo.dayCount;
          }
          const currentYear = typeof latestMonthKey === 'string' ? latestMonthKey.slice(0, 4) : '';
          if (currentYear) {
            const yearTotals = {
              count: 0,
              hospitalized: 0,
              losSum: 0,
              losCount: 0,
              hospitalizedLosSum: 0,
              hospitalizedLosCount: 0,
              labSum: 0,
              labCount: 0,
            };
            monthBuckets.forEach((bucket, key) => {
              if (typeof key === 'string' && key.startsWith(currentYear)) {
                yearTotals.count += bucket.count;
                yearTotals.hospitalized += bucket.hospitalized;
                yearTotals.losSum += bucket.losSum;
                yearTotals.losCount += bucket.losCount;
                yearTotals.hospitalizedLosSum += bucket.hospitalizedLosSum;
                yearTotals.hospitalizedLosCount += bucket.hospitalizedLosCount;
                yearTotals.labSum += bucket.labSum;
                yearTotals.labCount += bucket.labCount;
              }
            });
            summary.avgLosYearMinutes = yearTotals.losCount > 0
              ? yearTotals.losSum / yearTotals.losCount
              : null;
            summary.hospitalizedYearShare = yearTotals.count > 0
              ? yearTotals.hospitalized / yearTotals.count
              : null;
            if (yearTotals.hospitalizedLosCount > 0) {
              summary.avgLosHospitalizedMinutes = yearTotals.hospitalizedLosSum / yearTotals.hospitalizedLosCount;
            }
            summary.avgLabYearMinutes = yearTotals.labCount > 0
              ? yearTotals.labSum / yearTotals.labCount
              : null;
          }
        }
      }

      const topArrivalHours = pickTopHours(arrivalHourCounts, 3);
      const topDepartureHours = pickTopHours(dischargeHourCounts, 3);
      if (topArrivalHours.length || topDepartureHours.length) {
        const arrivalText = topArrivalHours.length
          ? topArrivalHours.map((item) => formatHourLabel(item.hour)).filter(Boolean).join(', ')
          : '—';
        const departureText = topDepartureHours.length
          ? topDepartureHours.map((item) => formatHourLabel(item.hour)).filter(Boolean).join(', ')
          : '—';
        summary.peakWindowText = `Atvykimai: ${arrivalText} / Išvykimai: ${departureText}`;
        if (topArrivalHours.length && topDepartureHours.length) {
          const mismatch = topArrivalHours.filter((item) => !topDepartureHours.some((candidate) => candidate.hour === item.hour));
          if (mismatch.length) {
            const labels = mismatch.map((item) => formatHourLabel(item.hour)).filter(Boolean);
            summary.peakWindowRiskNote = labels.length
              ? `Galima „boarding“ rizika: ${labels.join(', ')}`
              : 'Galima neatitiktis tarp atvykimų ir išvykimų.';
          } else {
            summary.peakWindowRiskNote = 'Pagrindiniai srautai sutampa.';
          }
        } else if (topArrivalHours.length) {
          summary.peakWindowRiskNote = 'Trūksta išvykimų valandų duomenų.';
        } else {
          summary.peakWindowRiskNote = 'Trūksta atvykimų valandų duomenų.';
        }
      }

      if (summary.uniqueDates > 0 && arrivalsWithHour > 0) {
        const arrivalsPerHour = arrivalsWithHour / (summary.uniqueDates * 24);
        if (Number.isFinite(arrivalsPerHour) && arrivalsPerHour > 0) {
          summary.taktTimeMinutes = 60 / arrivalsPerHour;
          summary.taktTimeMeta = `~${oneDecimalFormatter.format(arrivalsPerHour)} atv./val.`;
        }
      }

      const percentileValues = losPositiveValues.length ? losPositiveValues : losValues;
      if (percentileValues.length) {
        const sortedLos = [...percentileValues].sort((a, b) => a - b);
        const losMedian = computePercentile(sortedLos, 0.5);
        const losP90 = computePercentile(sortedLos, 0.9);
        if (Number.isFinite(losMedian)) {
          summary.losMedianMinutes = losMedian;
        }
        if (Number.isFinite(losP90)) {
          summary.losP90Minutes = losP90;
        }
        if (Number.isFinite(losMedian) && Number.isFinite(losP90) && losMedian > 0) {
          summary.losVariabilityIndex = losP90 / losMedian;
        }
        const medianHours = Number.isFinite(losMedian) ? losMedian / 60 : null;
        const p90Hours = Number.isFinite(losP90) ? losP90 / 60 : null;
        if (Number.isFinite(medianHours) && Number.isFinite(p90Hours)) {
          summary.losPercentilesText = `P50: ${oneDecimalFormatter.format(medianHours)} val. • P90: ${oneDecimalFormatter.format(p90Hours)} val.`;
        }
        const medianLosDays = Number.isFinite(losMedian) ? losMedian / (60 * 24) : null;
        if (Number.isFinite(summary.avgDailyPatients) && Number.isFinite(medianLosDays)) {
          summary.littlesLawEstimate = summary.avgDailyPatients * medianLosDays;
          if (Number.isFinite(medianHours)) {
            summary.littlesLawMeta = `Vid. ${oneDecimalFormatter.format(summary.avgDailyPatients)} atv./d. × median ${oneDecimalFormatter.format(medianHours)} val.`;
          }
        }
      }

      const dispositionsList = Array.from(dispositions.values())
        .map((entry) => ({
          label: entry.label,
          count: entry.count,
          category: entry.category,
          share: summary.totalPatients > 0 ? entry.count / summary.totalPatients : null,
        }))
        .sort((a, b) => {
          if (b.count !== a.count) {
            return b.count - a.count;
          }
          return a.label.localeCompare(b.label);
        });

      const daily = Array.from(dailyBuckets.values())
        .map((bucket) => ({
          dateKey: bucket.dateKey,
          patients: bucket.patients,
          avgLosMinutes: bucket.losCount > 0 ? bucket.losSum / bucket.losCount : null,
          avgDoorMinutes: bucket.doorCount > 0 ? bucket.doorSum / bucket.doorCount : null,
          fastCount: bucket.fastCount || 0,
          slowCount: bucket.slowCount || 0,
          losCount: bucket.losCount || 0,
          fastShare: bucket.losCount > 0 ? bucket.fastCount / bucket.losCount : null,
          slowShare: bucket.losCount > 0 ? bucket.slowCount / bucket.losCount : null,
        }))
        .sort((a, b) => (a.dateKey === b.dateKey ? 0 : (a.dateKey > b.dateKey ? -1 : 1)));

      const dailyAsc = [...daily].sort((a, b) => (a.dateKey > b.dateKey ? 1 : -1));
      const trendWindowSize = Math.min(30, dailyAsc.length);
      const recentWindow = trendWindowSize > 0 ? dailyAsc.slice(-trendWindowSize) : [];
      const previousWindow = trendWindowSize > 0 ? dailyAsc.slice(Math.max(0, dailyAsc.length - trendWindowSize * 2), dailyAsc.length - trendWindowSize) : [];
      const reduceWindow = (list) => list.reduce((acc, item) => {
        acc.fast += Number.isFinite(item.fastCount) ? item.fastCount : 0;
        acc.slow += Number.isFinite(item.slowCount) ? item.slowCount : 0;
        acc.totalLos += Number.isFinite(item.losCount) ? item.losCount : 0;
        return acc;
      }, { fast: 0, slow: 0, totalLos: 0 });
      const recentAgg = reduceWindow(recentWindow);
      const previousAgg = reduceWindow(previousWindow);
      const recentFastShare = recentAgg.totalLos > 0 ? recentAgg.fast / recentAgg.totalLos : (losValidCount > 0 ? fastCount / losValidCount : null);
      const recentSlowShare = recentAgg.totalLos > 0 ? recentAgg.slow / recentAgg.totalLos : (losValidCount > 0 ? slowCount / losValidCount : null);
      summary.fastLaneShare = Number.isFinite(recentFastShare) ? recentFastShare : null;
      summary.slowLaneShare = Number.isFinite(recentSlowShare) ? recentSlowShare : null;
      if (summary.fastLaneShare != null && summary.slowLaneShare != null) {
        summary.fastSlowSplitValue = `Greitieji: ${percentFormatter.format(summary.fastLaneShare)} • Lėtieji: ${percentFormatter.format(summary.slowLaneShare)}`;
      }
      let fastDelta = null;
      let slowDelta = null;
      if (previousAgg.totalLos > 0 && recentAgg.totalLos > 0) {
        const previousFastShare = previousAgg.fast / previousAgg.totalLos;
        const previousSlowShare = previousAgg.slow / previousAgg.totalLos;
        fastDelta = Number.isFinite(previousFastShare) && Number.isFinite(recentFastShare)
          ? recentFastShare - previousFastShare
          : null;
        slowDelta = Number.isFinite(previousSlowShare) && Number.isFinite(recentSlowShare)
          ? recentSlowShare - previousSlowShare
          : null;
      }
      summary.fastLaneDelta = Number.isFinite(fastDelta) ? fastDelta : null;
      summary.slowLaneDelta = Number.isFinite(slowDelta) ? slowDelta : null;
      summary.fastSlowTrendWindowDays = trendWindowSize;
      if (trendWindowSize > 0) {
        if (Number.isFinite(fastDelta) || Number.isFinite(slowDelta)) {
          const fastDeltaText = Number.isFinite(fastDelta) ? formatPercentPointDelta(fastDelta) : '—';
          const slowDeltaText = Number.isFinite(slowDelta) ? formatPercentPointDelta(slowDelta) : '—';
          summary.fastSlowTrendText = `Langas: ${trendWindowSize} d. • Pokytis vs ankst. ${trendWindowSize} d.: ${fastDeltaText} / ${slowDeltaText}`;
        } else {
          summary.fastSlowTrendText = `Langas: ${trendWindowSize} d. • Ankstesnių duomenų palyginimui nepakanka.`;
        }
      } else if (losValidCount > 0) {
        summary.fastSlowSplitValue = summary.fastSlowSplitValue || `Greitieji: ${percentFormatter.format(fastCount / losValidCount)} • Lėtieji: ${percentFormatter.format(slowCount / losValidCount)}`;
        summary.fastSlowTrendText = 'Langas: visi turimi duomenys • Pokyčiams apskaičiuoti reikia bent 2 langų.';
      }

      return { summary, dispositions: dispositionsList, daily };
    }

    function summarizeSnapshotRecords(records) {
      const result = {
        entryCount: 0,
        currentPatients: null,
        occupiedBeds: null,
        nursePatientsPerStaff: null,
        doctorPatientsPerStaff: null,
        labMinutes: null,
        latestSnapshotLabel: '',
        latestSnapshotAt: null,
        generatedAt: null,
        dispositions: [],
        daily: [],
      };
      const wrapped = Array.isArray(records)
        ? records.map((record, index) => ({ record, index })).filter((item) => {
          if (!item.record) {
            return false;
          }
          const r = item.record;
          const hasValue = Number.isFinite(r.currentPatients)
            || Number.isFinite(r.occupiedBeds)
            || Number.isFinite(r.nurseRatio)
            || Number.isFinite(r.doctorRatio)
            || (r.categories && Object.values(r.categories).some((value) => Number.isFinite(value)));
          return hasValue;
        })
        : [];
      if (!wrapped.length) {
        return result;
      }

      result.entryCount = wrapped.length;

      const sortedByTime = [...wrapped].sort((a, b) => {
        const timeA = a.record.timestamp instanceof Date && !Number.isNaN(a.record.timestamp.getTime())
          ? a.record.timestamp.getTime()
          : Number.NEGATIVE_INFINITY;
        const timeB = b.record.timestamp instanceof Date && !Number.isNaN(b.record.timestamp.getTime())
          ? b.record.timestamp.getTime()
          : Number.NEGATIVE_INFINITY;
        if (timeA !== timeB) {
          return timeB - timeA;
        }
        return b.index - a.index;
      });

      const latest = sortedByTime[0]?.record || null;
      if (latest) {
        result.latestSnapshotAt = latest.timestamp instanceof Date && !Number.isNaN(latest.timestamp.getTime())
          ? latest.timestamp
          : null;
        if (result.latestSnapshotAt) {
          result.latestSnapshotLabel = result.latestSnapshotAt.toISOString();
        } else if (latest.rawTimestamp && latest.rawTimestamp.length) {
          result.latestSnapshotLabel = latest.rawTimestamp;
        } else {
          result.latestSnapshotLabel = '';
        }
        if (Number.isFinite(latest.currentPatients)) {
          result.currentPatients = latest.currentPatients;
        }
        if (Number.isFinite(latest.occupiedBeds)) {
          result.occupiedBeds = latest.occupiedBeds;
        }
        if (Number.isFinite(latest.nurseRatio)) {
          result.nursePatientsPerStaff = latest.nurseRatio;
        }
        if (Number.isFinite(latest.doctorRatio)) {
          result.doctorPatientsPerStaff = latest.doctorRatio;
        }
        if (Number.isFinite(latest.snapshotLabMinutes)) {
          result.labMinutes = latest.snapshotLabMinutes;
        }
        if (latest.categories && typeof latest.categories === 'object') {
          const categoryEntries = [];
          let total = 0;
          ['1', '2', '3', '4', '5'].forEach((key) => {
            const value = latest.categories[key];
            if (Number.isFinite(value) && value >= 0) {
              const label = TEXT?.ed?.triage?.[`category${key}`] || `${key} kategorija`;
              categoryEntries.push({ label, count: value, key });
              total += value;
            }
          });
          result.dispositions = categoryEntries.map((entry) => ({
            label: entry.label,
            count: entry.count,
            share: total > 0 ? entry.count / total : null,
            categoryKey: entry.key,
          }));
        }
      }
      result.generatedAt = result.latestSnapshotAt || new Date();

      return result;
    }

    function summarizeEdRecords(records, meta = {}) {
      const hasSnapshot = Array.isArray(records)
        && records.some((record) => record
          && (Number.isFinite(record.currentPatients)
            || Number.isFinite(record.occupiedBeds)
            || Number.isFinite(record.nurseRatio)
            || Number.isFinite(record.doctorRatio)
            || (record.categories && Object.values(record.categories).some((value) => Number.isFinite(value)))));
      const hasLegacy = Array.isArray(records)
        && records.some((record) => record
          && (Number.isFinite(record.losMinutes)
            || Number.isFinite(record.doorToProviderMinutes)
            || Number.isFinite(record.decisionToLeaveMinutes)
            || (typeof record.dispositionCategory === 'string' && record.dispositionCategory !== 'unknown')));

      let mode = meta?.type;
      if (!mode) {
        if (hasSnapshot && hasLegacy) {
          mode = 'hybrid';
        } else if (hasSnapshot) {
          mode = 'snapshot';
        } else {
          mode = 'legacy';
        }
      }

      const { startMinutes: nightStartMinutes, endMinutes: nightEndMinutes } = resolveNightBoundsMinutes(settings?.calculations);
      const daytimeSnapshotBuckets = new Map();
      let latestSnapshotMonth = '';
      (Array.isArray(records) ? records : []).forEach((record) => {
        if (!record || !Number.isFinite(record.currentPatients)) {
          return;
        }
        const timestamp = record.timestamp instanceof Date && !Number.isNaN(record.timestamp.getTime())
          ? record.timestamp
          : null;
        if (!timestamp) {
          return;
        }
        const monthKey = toMonthKeyFromDate(timestamp);
        if (!monthKey) {
          return;
        }
        const isNight = isNightTimestamp(timestamp, nightStartMinutes, nightEndMinutes);
        if (isNight === true) {
          return;
        }
        const bucket = daytimeSnapshotBuckets.get(monthKey) || { sum: 0, count: 0 };
        bucket.sum += record.currentPatients;
        bucket.count += 1;
        daytimeSnapshotBuckets.set(monthKey, bucket);
        if (!latestSnapshotMonth || monthKey > latestSnapshotMonth) {
          latestSnapshotMonth = monthKey;
        }
      });

      const summary = createEmptyEdSummary(mode);
      if (!Array.isArray(records) || !records.length) {
        return { summary, dispositions: [], daily: [], meta: { type: mode } };
      }

      let legacy = { summary: createEmptyEdSummary('legacy'), dispositions: [], daily: [] };
      if (hasLegacy) {
        legacy = summarizeLegacyRecords(records);
        summary.totalPatients = legacy.summary.totalPatients;
        summary.uniqueDates = legacy.summary.uniqueDates;
        summary.avgDailyPatients = legacy.summary.avgDailyPatients;
        summary.avgLosMinutes = legacy.summary.avgLosMinutes;
        summary.avgLosHospitalizedMinutes = legacy.summary.avgLosHospitalizedMinutes;
        summary.avgLosMonthMinutes = legacy.summary.avgLosMonthMinutes;
        summary.avgLosYearMinutes = legacy.summary.avgLosYearMinutes;
        summary.avgDoorToProviderMinutes = legacy.summary.avgDoorToProviderMinutes;
        summary.avgDecisionToLeaveMinutes = legacy.summary.avgDecisionToLeaveMinutes;
        summary.hospitalizedShare = legacy.summary.hospitalizedShare;
        summary.hospitalizedMonthShare = legacy.summary.hospitalizedMonthShare;
        summary.hospitalizedYearShare = legacy.summary.hospitalizedYearShare;
        summary.avgLabMinutes = legacy.summary.avgLabMinutes;
        summary.avgLabMonthMinutes = legacy.summary.avgLabMonthMinutes;
        summary.avgLabYearMinutes = legacy.summary.avgLabYearMinutes;
        summary.currentMonthKey = legacy.summary.currentMonthKey;
        summary.generatedAt = legacy.summary.generatedAt;
        summary.peakWindowText = legacy.summary.peakWindowText;
        summary.peakWindowRiskNote = legacy.summary.peakWindowRiskNote;
        summary.losMedianMinutes = legacy.summary.losMedianMinutes;
        summary.losP90Minutes = legacy.summary.losP90Minutes;
        summary.losVariabilityIndex = legacy.summary.losVariabilityIndex;
        summary.losPercentilesText = legacy.summary.losPercentilesText;
        summary.taktTimeMinutes = legacy.summary.taktTimeMinutes;
        summary.taktTimeMeta = legacy.summary.taktTimeMeta;
        summary.littlesLawEstimate = legacy.summary.littlesLawEstimate;
        summary.littlesLawMeta = legacy.summary.littlesLawMeta;
        summary.fastLaneShare = legacy.summary.fastLaneShare;
        summary.slowLaneShare = legacy.summary.slowLaneShare;
        summary.fastLaneDelta = legacy.summary.fastLaneDelta;
        summary.slowLaneDelta = legacy.summary.slowLaneDelta;
        summary.fastSlowSplitValue = legacy.summary.fastSlowSplitValue;
        summary.fastSlowTrendText = legacy.summary.fastSlowTrendText;
        summary.fastSlowTrendWindowDays = legacy.summary.fastSlowTrendWindowDays;
      }

      let snapshot = {
        entryCount: 0,
        currentPatients: null,
        occupiedBeds: null,
        nursePatientsPerStaff: null,
        doctorPatientsPerStaff: null,
        labMinutes: null,
        latestSnapshotLabel: '',
        latestSnapshotAt: null,
        generatedAt: null,
        dispositions: [],
        daily: [],
      };
      if (hasSnapshot) {
        snapshot = summarizeSnapshotRecords(records);
        summary.entryCount = snapshot.entryCount;
        summary.currentPatients = snapshot.currentPatients;
        summary.occupiedBeds = snapshot.occupiedBeds;
        summary.nursePatientsPerStaff = snapshot.nursePatientsPerStaff;
        summary.doctorPatientsPerStaff = snapshot.doctorPatientsPerStaff;
        if (Number.isFinite(snapshot.labMinutes)) {
          summary.avgLabMinutes = snapshot.labMinutes;
          summary.avgLabMonthMinutes = snapshot.labMinutes;
          summary.avgLabYearMinutes = snapshot.labMinutes;
        }
        summary.latestSnapshotLabel = snapshot.latestSnapshotLabel;
        summary.latestSnapshotAt = snapshot.latestSnapshotAt;
        if (snapshot.generatedAt) {
          summary.generatedAt = snapshot.generatedAt;
        }
        if (!summary.currentMonthKey && snapshot.latestSnapshotAt instanceof Date && !Number.isNaN(snapshot.latestSnapshotAt.getTime())) {
          summary.currentMonthKey = toMonthKeyFromDate(snapshot.latestSnapshotAt);
        }
      }

      const targetMonth = summary.currentMonthKey || latestSnapshotMonth;
      if (summary.avgDaytimePatientsMonth == null && targetMonth && daytimeSnapshotBuckets.has(targetMonth)) {
        const bucket = daytimeSnapshotBuckets.get(targetMonth);
        summary.avgDaytimePatientsMonth = bucket.count > 0 ? bucket.sum / bucket.count : null;
      } else if (
        summary.avgDaytimePatientsMonth == null
        && latestSnapshotMonth
        && daytimeSnapshotBuckets.has(latestSnapshotMonth)
      ) {
        const bucket = daytimeSnapshotBuckets.get(latestSnapshotMonth);
        summary.avgDaytimePatientsMonth = bucket.count > 0 ? bucket.sum / bucket.count : null;
        if (!summary.currentMonthKey) {
          summary.currentMonthKey = latestSnapshotMonth;
        }
      }

      let dispositions = [];
      let daily = [];
      if (mode === 'snapshot') {
        dispositions = snapshot.dispositions;
        daily = snapshot.daily;
      } else if (mode === 'hybrid') {
        dispositions = snapshot.dispositions.length ? snapshot.dispositions : legacy.dispositions;
        daily = snapshot.daily.length ? snapshot.daily : legacy.daily;
      } else {
        dispositions = legacy.dispositions;
        daily = legacy.daily;
      }

      return { summary, dispositions, daily, meta: { type: mode } };
    }

    function enrichSummaryWithOverviewFallback(summary, overviewRecords, overviewDailyStats, options = {}) {
      if (!summary || typeof summary !== 'object') {
        return summary;
      }
      const records = Array.isArray(overviewRecords)
        ? overviewRecords.filter((record) => record && (record.arrival instanceof Date || record.discharge instanceof Date))
        : [];
      if (!records.length) {
        return summary;
      }

      const arrivalHourCounts = Array.from({ length: 24 }, () => 0);
      const dischargeHourCounts = Array.from({ length: 24 }, () => 0);
      const losValues = [];
      const losDailyBuckets = new Map();
      const uniqueDateKeys = new Set();
      let arrivalsWithHour = 0;
      let fastCount = 0;
      let slowCount = 0;
      let losValidCount = 0;

      records.forEach((record) => {
        const arrival = record.arrival instanceof Date && !Number.isNaN(record.arrival.getTime()) ? record.arrival : null;
        const discharge = record.discharge instanceof Date && !Number.isNaN(record.discharge.getTime()) ? record.discharge : null;
        if (!arrival && !discharge) {
          return;
        }
        const reference = arrival || discharge;
        const dateKey = reference ? formatLocalDateKey(reference) : '';
        if (dateKey) {
          uniqueDateKeys.add(dateKey);
        }
        if (arrival) {
          const hour = arrival.getHours();
          if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
            arrivalHourCounts[hour] += 1;
            arrivalsWithHour += 1;
          }
        }
        if (discharge) {
          const hour = discharge.getHours();
          if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
            dischargeHourCounts[hour] += 1;
          }
        }
        if (arrival && discharge) {
          const diffMinutes = (discharge.getTime() - arrival.getTime()) / 60000;
          if (Number.isFinite(diffMinutes) && diffMinutes >= 0) {
            losValues.push(diffMinutes);
            losValidCount += 1;
            if (diffMinutes < 120) {
              fastCount += 1;
            }
            if (diffMinutes > 480) {
              slowCount += 1;
            }
            if (dateKey) {
              const bucket = losDailyBuckets.get(dateKey) || { dateKey, fastCount: 0, slowCount: 0, losCount: 0 };
              bucket.losCount += 1;
              if (diffMinutes < 120) {
                bucket.fastCount += 1;
              }
              if (diffMinutes > 480) {
                bucket.slowCount += 1;
              }
              losDailyBuckets.set(dateKey, bucket);
            }
          }
        }
      });

      const hasPeakWindow = typeof summary.peakWindowText === 'string' && summary.peakWindowText.trim().length;
      if (!hasPeakWindow) {
        const topArrivalHours = pickTopHours(arrivalHourCounts, 3);
        const topDepartureHours = pickTopHours(dischargeHourCounts, 3);
        if (topArrivalHours.length || topDepartureHours.length) {
          const arrivalText = topArrivalHours.length
            ? topArrivalHours.map((item) => formatHourLabel(item.hour)).filter(Boolean).join(', ')
            : '—';
          const departureText = topDepartureHours.length
            ? topDepartureHours.map((item) => formatHourLabel(item.hour)).filter(Boolean).join(', ')
            : '—';
          summary.peakWindowText = `Atvykimai: ${arrivalText} / Išvykimai: ${departureText}`;
          const hasRiskNote = typeof summary.peakWindowRiskNote === 'string' && summary.peakWindowRiskNote.trim().length;
          if (topArrivalHours.length && topDepartureHours.length) {
            const mismatch = topArrivalHours.filter((item) => !topDepartureHours.some((candidate) => candidate.hour === item.hour));
            if (mismatch.length) {
              const labels = mismatch.map((item) => formatHourLabel(item.hour)).filter(Boolean);
              summary.peakWindowRiskNote = labels.length
                ? `Galima „boarding“ rizika: ${labels.join(', ')}`
                : 'Galima neatitiktis tarp atvykimų ir išvykimų.';
            } else if (!hasRiskNote) {
              summary.peakWindowRiskNote = 'Pagrindiniai srautai sutampa.';
            }
          } else if (!hasRiskNote) {
            summary.peakWindowRiskNote = topArrivalHours.length
              ? 'Trūksta išvykimų valandų duomenų.'
              : 'Trūksta atvykimų valandų duomenų.';
          }
        }
      }

      if (!Number.isFinite(summary.taktTimeMinutes) && uniqueDateKeys.size > 0 && arrivalsWithHour > 0) {
        const arrivalsPerHour = arrivalsWithHour / (uniqueDateKeys.size * 24);
        if (Number.isFinite(arrivalsPerHour) && arrivalsPerHour > 0) {
          summary.taktTimeMinutes = 60 / arrivalsPerHour;
          summary.taktTimeMeta = `~${oneDecimalFormatter.format(arrivalsPerHour)} atv./val.`;
        }
      }

      if (losValues.length) {
        const sortedLos = losValues.slice().sort((a, b) => a - b);
        const losMedian = computePercentile(sortedLos, 0.5);
        const losP90 = computePercentile(sortedLos, 0.9);
        if (!Number.isFinite(summary.losMedianMinutes) && Number.isFinite(losMedian)) {
          summary.losMedianMinutes = losMedian;
        }
        if (!Number.isFinite(summary.losP90Minutes) && Number.isFinite(losP90)) {
          summary.losP90Minutes = losP90;
        }
        if (!Number.isFinite(summary.losVariabilityIndex)
          && Number.isFinite(losMedian)
          && Number.isFinite(losP90)
          && losMedian > 0) {
          summary.losVariabilityIndex = losP90 / losMedian;
        }
        const medianHours = Number.isFinite(losMedian) ? losMedian / 60 : null;
        const p90Hours = Number.isFinite(losP90) ? losP90 / 60 : null;
        if ((!summary.losPercentilesText || !summary.losPercentilesText.trim())
          && Number.isFinite(medianHours)
          && Number.isFinite(p90Hours)) {
          summary.losPercentilesText = `P50: ${oneDecimalFormatter.format(medianHours)} val. • P90: ${oneDecimalFormatter.format(p90Hours)} val.`;
        }
        const medianLosDays = Number.isFinite(losMedian) ? losMedian / (60 * 24) : null;
        let avgDaily = Number.isFinite(summary.avgDailyPatients) ? summary.avgDailyPatients : null;
        const dailySource = Array.isArray(overviewDailyStats) ? overviewDailyStats : [];
        if (!Number.isFinite(avgDaily) && dailySource.length) {
          const windowDays = Number.isFinite(Number(options.windowDays)) && Number(options.windowDays) > 0
            ? Number(options.windowDays)
            : 30;
          const scopedDaily = filterDailyStatsByWindow(dailySource, windowDays);
          const effectiveDaily = scopedDaily.length ? scopedDaily : dailySource;
          const totals = effectiveDaily.reduce((acc, entry) => {
            if (Number.isFinite(entry?.count)) {
              acc.sum += Number(entry.count);
              acc.days += 1;
            }
            return acc;
          }, { sum: 0, days: 0 });
          if (totals.days > 0) {
            avgDaily = totals.sum / totals.days;
            if (!Number.isFinite(summary.avgDailyPatients)) {
              summary.avgDailyPatients = avgDaily;
            }
          }
        }
        if (!Number.isFinite(summary.littlesLawEstimate)
          && Number.isFinite(avgDaily)
          && Number.isFinite(medianLosDays)) {
          summary.littlesLawEstimate = avgDaily * medianLosDays;
          if ((!summary.littlesLawMeta || !summary.littlesLawMeta.trim()) && Number.isFinite(medianHours)) {
            summary.littlesLawMeta = `Vid. ${oneDecimalFormatter.format(avgDaily)} atv./d. × median ${oneDecimalFormatter.format(medianHours)} val.`;
          }
        }
      }

      const needsFastSlow = (!Number.isFinite(summary.fastLaneShare)
        || !Number.isFinite(summary.slowLaneShare)
        || !summary.fastSlowSplitValue
        || !summary.fastSlowSplitValue.trim()
        || !summary.fastSlowTrendText
        || !summary.fastSlowTrendText.trim());
      if (needsFastSlow && (losValidCount > 0 || losDailyBuckets.size > 0)) {
        const daily = Array.from(losDailyBuckets.values()).sort((a, b) => (a.dateKey > b.dateKey ? 1 : -1));
        const trendWindowSize = Math.min(30, daily.length);
        const recentWindow = trendWindowSize > 0 ? daily.slice(-trendWindowSize) : [];
        const previousWindow = trendWindowSize > 0
          ? daily.slice(Math.max(0, daily.length - trendWindowSize * 2), daily.length - trendWindowSize)
          : [];
        const reduceWindow = (list) => list.reduce((acc, item) => {
          acc.fast += Number.isFinite(item.fastCount) ? item.fastCount : 0;
          acc.slow += Number.isFinite(item.slowCount) ? item.slowCount : 0;
          acc.totalLos += Number.isFinite(item.losCount) ? item.losCount : 0;
          return acc;
        }, { fast: 0, slow: 0, totalLos: 0 });
        const recentAgg = reduceWindow(recentWindow);
        const previousAgg = reduceWindow(previousWindow);
        const recentFastShare = recentAgg.totalLos > 0
          ? recentAgg.fast / recentAgg.totalLos
          : (losValidCount > 0 ? fastCount / losValidCount : null);
        const recentSlowShare = recentAgg.totalLos > 0
          ? recentAgg.slow / recentAgg.totalLos
          : (losValidCount > 0 ? slowCount / losValidCount : null);
        if (!Number.isFinite(summary.fastLaneShare) && Number.isFinite(recentFastShare)) {
          summary.fastLaneShare = recentFastShare;
        }
        if (!Number.isFinite(summary.slowLaneShare) && Number.isFinite(recentSlowShare)) {
          summary.slowLaneShare = recentSlowShare;
        }
        if ((!summary.fastSlowSplitValue || !summary.fastSlowSplitValue.trim())
          && Number.isFinite(summary.fastLaneShare)
          && Number.isFinite(summary.slowLaneShare)) {
          summary.fastSlowSplitValue = `Greitieji: ${percentFormatter.format(summary.fastLaneShare)} • Lėtieji: ${percentFormatter.format(summary.slowLaneShare)}`;
        }
        let fastDelta = null;
        let slowDelta = null;
        if (previousAgg.totalLos > 0 && recentAgg.totalLos > 0) {
          const previousFastShare = previousAgg.fast / previousAgg.totalLos;
          const previousSlowShare = previousAgg.slow / previousAgg.totalLos;
          fastDelta = Number.isFinite(previousFastShare) && Number.isFinite(recentFastShare)
            ? recentFastShare - previousFastShare
            : null;
          slowDelta = Number.isFinite(previousSlowShare) && Number.isFinite(recentSlowShare)
            ? recentSlowShare - previousSlowShare
            : null;
        }
        if (!Number.isFinite(summary.fastLaneDelta) && Number.isFinite(fastDelta)) {
          summary.fastLaneDelta = fastDelta;
        }
        if (!Number.isFinite(summary.slowLaneDelta) && Number.isFinite(slowDelta)) {
          summary.slowLaneDelta = slowDelta;
        }
        if (!Number.isFinite(summary.fastSlowTrendWindowDays) && trendWindowSize > 0) {
          summary.fastSlowTrendWindowDays = trendWindowSize;
        }
        if ((!summary.fastSlowTrendText || !summary.fastSlowTrendText.trim()) && trendWindowSize > 0) {
          if (Number.isFinite(fastDelta) || Number.isFinite(slowDelta)) {
            const fastDeltaText = Number.isFinite(fastDelta) ? formatPercentPointDelta(fastDelta) : '—';
            const slowDeltaText = Number.isFinite(slowDelta) ? formatPercentPointDelta(slowDelta) : '—';
            summary.fastSlowTrendText = `Langas: ${trendWindowSize} d. • Pokytis vs ankst. ${trendWindowSize} d.: ${fastDeltaText} / ${slowDeltaText}`;
          } else {
            summary.fastSlowTrendText = `Langas: ${trendWindowSize} d. • Ankstesnių duomenų palyginimui nepakanka.`;
          }
        }
        if ((!summary.fastSlowTrendText || !summary.fastSlowTrendText.trim()) && losValidCount > 0) {
          summary.fastSlowTrendText = 'Langas: visi turimi duomenys • Pokyčiams apskaičiuoti reikia bent 2 langų.';
        }
      }

      return summary;
    }

    function getAvailableYearsFromDaily(dailyStats) {
      const years = new Set();
      (Array.isArray(dailyStats) ? dailyStats : []).forEach((entry) => {
        if (!entry || typeof entry.date !== 'string') {
          return;
        }
        const date = dateKeyToDate(entry.date);
        if (date instanceof Date && !Number.isNaN(date.getTime())) {
          years.add(date.getUTCFullYear());
        }
      });
      return Array.from(years).sort((a, b) => b - a);
    }

    function populateChartYearOptions(dailyStats) {
      if (!selectors.chartYearSelect) {
        return;
      }
      const years = getAvailableYearsFromDaily(dailyStats);
      selectors.chartYearSelect.replaceChildren();
      const defaultOption = document.createElement('option');
      defaultOption.value = 'all';
      defaultOption.textContent = TEXT.charts.yearFilterAll;
      selectors.chartYearSelect.appendChild(defaultOption);
      years.forEach((year) => {
        const option = document.createElement('option');
        option.value = String(year);
        option.textContent = `${year} m.`;
        selectors.chartYearSelect.appendChild(option);
      });
      const currentYear = Number.isFinite(dashboardState.chartYear) ? dashboardState.chartYear : null;
      const hasCurrent = Number.isFinite(currentYear) && years.includes(currentYear);
      if (hasCurrent) {
        selectors.chartYearSelect.value = String(currentYear);
      } else {
        selectors.chartYearSelect.value = 'all';
        dashboardState.chartYear = null;
      }
      syncChartYearControl();
    }

    function syncChartYearControl() {
      if (!selectors.chartYearSelect) {
        return;
      }
      const value = Number.isFinite(dashboardState.chartYear) ? String(dashboardState.chartYear) : 'all';
      if (selectors.chartYearSelect.value !== value) {
        selectors.chartYearSelect.value = value;
      }
    }

    function prepareChartDataForPeriod(period) {
      const normalized = Number.isFinite(Number(period)) && Number(period) > 0
        ? Number(period)
        : 30;
      const baseDaily = Array.isArray(dashboardState.chartData.baseDaily) && dashboardState.chartData.baseDaily.length
        ? dashboardState.chartData.baseDaily
        : dashboardState.dailyStats;
      const baseRecords = Array.isArray(dashboardState.chartData.baseRecords) && dashboardState.chartData.baseRecords.length
        ? dashboardState.chartData.baseRecords
        : dashboardState.rawRecords;
      const selectedYear = Number.isFinite(dashboardState.chartYear) ? Number(dashboardState.chartYear) : null;
      const yearScopedRecords = filterRecordsByYear(baseRecords, selectedYear);
      const sanitizedFilters = sanitizeChartFilters(dashboardState.chartFilters);
      dashboardState.chartFilters = { ...sanitizedFilters };
      const filteredRecords = filterRecordsByChartFilters(yearScopedRecords, sanitizedFilters);
      const filteredDaily = computeDailyStats(filteredRecords);
      const scopedDaily = filterDailyStatsByWindow(filteredDaily, normalized);
      const scopedRecords = filterRecordsByWindow(filteredRecords, normalized);
      const fallbackDaily = filteredDaily.length
        ? filteredDaily
        : filterDailyStatsByYear(baseDaily, selectedYear);
      const funnelData = computeFunnelStats(scopedDaily, selectedYear, fallbackDaily);
      const heatmapData = computeArrivalHeatmap(scopedRecords);

      dashboardState.chartData.filteredRecords = filteredRecords;
      dashboardState.chartData.filteredDaily = filteredDaily;
      dashboardState.chartData.filteredWindowRecords = scopedRecords;
      dashboardState.chartData.dailyWindow = scopedDaily;
      dashboardState.chartData.funnel = funnelData;
      dashboardState.chartData.heatmap = heatmapData;
      updateChartFiltersSummary({ records: filteredRecords, daily: filteredDaily });

      return { daily: scopedDaily, funnel: funnelData, heatmap: heatmapData };
    }

    function computeFunnelStats(dailyStats, targetYear, fallbackDailyStats) {
      const primaryEntries = Array.isArray(dailyStats) ? dailyStats : [];
      const fallbackEntries = Array.isArray(fallbackDailyStats) ? fallbackDailyStats : [];
      const entries = primaryEntries.length ? primaryEntries : fallbackEntries;
      const withYear = entries
        .map((entry) => {
          const date = typeof entry?.date === 'string' ? dateKeyToDate(entry.date) : null;
          if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return null;
          }
          return { entry, year: date.getUTCFullYear() };
        })
        .filter(Boolean);

      if (!withYear.length) {
        const totals = entries.reduce(
          (acc, entry) => ({
            arrived: acc.arrived + (Number.isFinite(entry?.count) ? entry.count : 0),
            hospitalized: acc.hospitalized + (Number.isFinite(entry?.hospitalized) ? entry.hospitalized : 0),
            discharged: acc.discharged + (Number.isFinite(entry?.discharged) ? entry.discharged : 0),
          }),
          { arrived: 0, hospitalized: 0, discharged: 0 }
        );
        const normalizedYear = Number.isFinite(targetYear) ? Number(targetYear) : null;
        return { ...totals, year: normalizedYear };
      }

      let effectiveYear = Number.isFinite(targetYear) ? Number(targetYear) : null;
      if (!Number.isFinite(effectiveYear)) {
        const uniqueYears = withYear.reduce((acc, item) => {
          if (!acc.includes(item.year)) {
            acc.push(item.year);
          }
          return acc;
        }, []);
        if (uniqueYears.length === 1) {
          effectiveYear = uniqueYears[0];
        } else if (!primaryEntries.length && uniqueYears.length) {
          effectiveYear = uniqueYears.reduce((latest, year) => (year > latest ? year : latest), uniqueYears[0]);
        }
      }

      let scoped = withYear;
      if (Number.isFinite(effectiveYear)) {
        scoped = withYear.filter((item) => item.year === effectiveYear);
        if (!scoped.length) {
          scoped = withYear;
        }
      }

      const aggregated = scoped.reduce(
        (acc, item) => ({
          arrived: acc.arrived + (Number.isFinite(item.entry?.count) ? item.entry.count : 0),
          hospitalized: acc.hospitalized + (Number.isFinite(item.entry?.hospitalized) ? item.entry.hospitalized : 0),
          discharged: acc.discharged + (Number.isFinite(item.entry?.discharged) ? item.entry.discharged : 0),
        }),
        { arrived: 0, hospitalized: 0, discharged: 0 }
      );

      return { ...aggregated, year: Number.isFinite(effectiveYear) ? effectiveYear : null };
    }

    function computeArrivalHeatmap(records) {
      const aggregates = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({
        arrivals: 0,
        discharges: 0,
        hospitalized: 0,
        durationSum: 0,
        durationCount: 0,
      })));
      const weekdayDays = Array.from({ length: 7 }, () => new Set());
      (Array.isArray(records) ? records : []).forEach((entry) => {
        if (!(entry.arrival instanceof Date) || Number.isNaN(entry.arrival.getTime())) {
          return;
        }
        const rawDay = entry.arrival.getDay();
        const dayIndex = (rawDay + 6) % 7; // perkeliam, kad pirmadienis būtų pirmas
        const hour = entry.arrival.getHours();
        if (hour < 0 || hour > 23) {
          return;
        }
        const cell = aggregates[dayIndex][hour];
        cell.arrivals += 1;
        if (entry.hospitalized) {
          cell.hospitalized += 1;
        } else {
          cell.discharges += 1;
        }
        if (entry.arrival instanceof Date && entry.discharge instanceof Date) {
          const duration = (entry.discharge.getTime() - entry.arrival.getTime()) / 3600000;
          if (Number.isFinite(duration) && duration >= 0 && duration <= 24) {
            cell.durationSum += duration;
            cell.durationCount += 1;
          }
        }
        const dateKey = formatLocalDateKey(entry.arrival);
        if (dateKey) {
          weekdayDays[dayIndex].add(dateKey);
        }
      });

      const createMatrix = () => Array.from({ length: 7 }, () => Array(24).fill(0));
      const metrics = {
        arrivals: { matrix: createMatrix(), max: 0, hasData: false },
        discharges: { matrix: createMatrix(), max: 0, hasData: false },
        hospitalized: { matrix: createMatrix(), max: 0, hasData: false },
        avgDuration: {
          matrix: createMatrix(),
          counts: createMatrix(),
          max: 0,
          hasData: false,
          samples: 0,
        },
      };

      aggregates.forEach((row, dayIndex) => {
        const divisor = weekdayDays[dayIndex].size || 1;
        row.forEach((cell, hourIndex) => {
          if (cell.arrivals > 0) {
            metrics.arrivals.hasData = true;
          }
          if (cell.discharges > 0) {
            metrics.discharges.hasData = true;
          }
          if (cell.hospitalized > 0) {
            metrics.hospitalized.hasData = true;
          }
          if (cell.durationCount > 0) {
            metrics.avgDuration.hasData = true;
            metrics.avgDuration.samples += cell.durationCount;
          }

          const arrivalsAvg = divisor ? cell.arrivals / divisor : 0;
          const dischargesAvg = divisor ? cell.discharges / divisor : 0;
          const hospitalizedAvg = divisor ? cell.hospitalized / divisor : 0;
          const averageDuration = cell.durationCount > 0 ? cell.durationSum / cell.durationCount : 0;

          metrics.arrivals.matrix[dayIndex][hourIndex] = arrivalsAvg;
          metrics.discharges.matrix[dayIndex][hourIndex] = dischargesAvg;
          metrics.hospitalized.matrix[dayIndex][hourIndex] = hospitalizedAvg;
          metrics.avgDuration.matrix[dayIndex][hourIndex] = averageDuration;
          metrics.avgDuration.counts[dayIndex][hourIndex] = cell.durationCount;

          if (arrivalsAvg > metrics.arrivals.max) {
            metrics.arrivals.max = arrivalsAvg;
          }
          if (dischargesAvg > metrics.discharges.max) {
            metrics.discharges.max = dischargesAvg;
          }
          if (hospitalizedAvg > metrics.hospitalized.max) {
            metrics.hospitalized.max = hospitalizedAvg;
          }
          if (averageDuration > metrics.avgDuration.max) {
            metrics.avgDuration.max = averageDuration;
          }
        });
      });

      return { metrics };
    }

    function getHeatmapMetricLabel(metricKey) {
      const options = TEXT.charts?.heatmapMetricOptions || {};
      if (typeof options[metricKey] === 'string' && options[metricKey].trim()) {
        return options[metricKey];
      }
      if (typeof metricKey === 'string' && metricKey.trim()) {
        return metricKey.trim();
      }
      const fallbackKey = DEFAULT_HEATMAP_METRIC;
      return typeof options[fallbackKey] === 'string' ? options[fallbackKey] : 'Rodiklis';
    }

    function getHeatmapMetricUnit(metricKey) {
      const units = TEXT.charts?.heatmapMetricUnits || {};
      return typeof units[metricKey] === 'string' ? units[metricKey] : '';
    }

    function getHeatmapMetricDescription(metricKey) {
      const descriptions = TEXT.charts?.heatmapMetricDescriptions || {};
      return typeof descriptions[metricKey] === 'string' ? descriptions[metricKey] : '';
    }

    function hasHeatmapMetricData(metric) {
      if (!metric || typeof metric !== 'object') {
        return false;
      }
      if (metric.hasData) {
        return true;
      }
      const matrix = Array.isArray(metric.matrix) ? metric.matrix : [];
      return matrix.some((row) => Array.isArray(row) && row.some((value) => Number.isFinite(value) && value > 0));
    }

    function isValidHeatmapData(heatmapData) {
      if (!heatmapData || typeof heatmapData !== 'object') {
        return false;
      }
      const metrics = heatmapData.metrics;
      if (!metrics || typeof metrics !== 'object') {
        return false;
      }
      return HEATMAP_METRIC_KEYS.some((key) => Array.isArray(metrics[key]?.matrix));
    }

    function normalizeHeatmapMetricKey(metricKey, metrics = {}) {
      const hasMetrics = metrics && typeof metrics === 'object' && Object.keys(metrics).length > 0;
      if (typeof metricKey === 'string' && HEATMAP_METRIC_KEYS.includes(metricKey)) {
        if (!hasMetrics || metrics[metricKey]) {
          return metricKey;
        }
      }
      if (hasMetrics) {
        const available = HEATMAP_METRIC_KEYS.find((key) => metrics[key]);
        if (available) {
          return available;
        }
      }
      if (typeof metricKey === 'string' && HEATMAP_METRIC_KEYS.includes(metricKey)) {
        return metricKey;
      }
      return DEFAULT_HEATMAP_METRIC;
    }

    function formatHeatmapMetricValue(value) {
      if (!Number.isFinite(value)) {
        return '0,0';
      }
      return oneDecimalFormatter.format(value);
    }

    function updateHeatmapCaption(metricKey) {
      if (!selectors.heatmapCaption) {
        return;
      }
      const label = getHeatmapMetricLabel(metricKey);
      const captionText = typeof TEXT.charts?.heatmapCaption === 'function'
        ? TEXT.charts.heatmapCaption(label)
        : (TEXT.charts?.heatmapCaption || 'Rodikliai pagal savaitės dieną ir valandą.');
      selectors.heatmapCaption.textContent = captionText;
    }

    function populateHeatmapMetricOptions() {
      if (!selectors.heatmapMetricSelect) {
        return;
      }
      const select = selectors.heatmapMetricSelect;
      select.innerHTML = '';
      HEATMAP_METRIC_KEYS.forEach((key) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = getHeatmapMetricLabel(key);
        select.appendChild(option);
      });
      const current = typeof dashboardState?.heatmapMetric === 'string'
        ? dashboardState.heatmapMetric
        : DEFAULT_HEATMAP_METRIC;
      select.value = normalizeHeatmapMetricKey(current);
    }

    function computeHeatmapColor(accentColor, intensity) {
      const alpha = Math.min(0.85, Math.max(0.08, 0.08 + intensity * 0.75));
      const hexMatch = /^#?([a-f\d]{6})$/i.exec(accentColor.trim());
      if (hexMatch) {
        const numeric = Number.parseInt(hexMatch[1], 16);
        const r = (numeric >> 16) & 255;
        const g = (numeric >> 8) & 255;
        const b = numeric & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
      }
      const rgbMatch = accentColor.trim().match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (rgbMatch) {
        const [, r, g, b] = rgbMatch;
        return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
      }
      return `rgba(37, 99, 235, ${alpha.toFixed(3)})`;
    }

    function renderArrivalHeatmap(container, heatmapData, accentColor, metricKey = DEFAULT_HEATMAP_METRIC) {
      if (!container) {
        return;
      }
      container.replaceChildren();
      const metrics = heatmapData && typeof heatmapData === 'object' ? heatmapData.metrics || {} : {};
      let selectedMetric = normalizeHeatmapMetricKey(metricKey, metrics);
      if (!metrics[selectedMetric]) {
        selectedMetric = normalizeHeatmapMetricKey(DEFAULT_HEATMAP_METRIC, metrics);
      }

      if (selectors.heatmapMetricSelect) {
        selectors.heatmapMetricSelect.value = selectedMetric;
      }
      updateHeatmapCaption(selectedMetric);

      const metric = metrics[selectedMetric] || {};
      const matrix = Array.isArray(metric.matrix) ? metric.matrix : [];
      const countsMatrix = Array.isArray(metric.counts) ? metric.counts : [];
      const hasData = hasHeatmapMetricData(metric);

      const captionText = selectors.heatmapCaption?.textContent || '';
      const metricLabel = getHeatmapMetricLabel(selectedMetric);
      if (metricLabel && captionText) {
        container.setAttribute('aria-label', `${metricLabel}. ${captionText}`);
      } else {
        container.removeAttribute('aria-label');
      }
      container.dataset.metric = selectedMetric;

      if (!hasData) {
        const empty = document.createElement('p');
        empty.className = 'heatmap-empty';
        empty.textContent = TEXT.charts?.heatmapEmpty || 'Šiuo metu nėra duomenų.';
        container.appendChild(empty);
        return;
      }

      const table = document.createElement('table');
      table.className = 'heatmap-table';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      const corner = document.createElement('th');
      corner.setAttribute('scope', 'col');
      corner.textContent = '';
      headerRow.appendChild(corner);
      HEATMAP_HOURS.forEach((label) => {
        const th = document.createElement('th');
        th.setAttribute('scope', 'col');
        th.textContent = label;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      matrix.forEach((rowValues, dayIndex) => {
        const row = document.createElement('tr');
        const rowHeader = document.createElement('th');
        rowHeader.setAttribute('scope', 'row');
        rowHeader.textContent = HEATMAP_WEEKDAY_SHORT[dayIndex] || '';
        row.appendChild(rowHeader);
        rowValues.forEach((value, hourIndex) => {
          const numericValue = Number.isFinite(value) ? value : 0;
          const cell = document.createElement('td');
          const intensity = metric.max > 0 ? numericValue / metric.max : 0;
          const badge = document.createElement('span');
          badge.className = 'heatmap-cell';
          const color = intensity > 0 ? computeHeatmapColor(accentColor, intensity) : 'var(--color-surface-alt)';
          badge.style.backgroundColor = color;
          badge.style.color = intensity > 0.55 ? '#fff' : intensity > 0 ? 'var(--color-text)' : 'var(--color-text-muted)';
          const durationSamples = Array.isArray(countsMatrix?.[dayIndex]) ? countsMatrix[dayIndex][hourIndex] : 0;
          const hasCellData = selectedMetric === 'avgDuration'
            ? Number.isFinite(durationSamples) && durationSamples > 0
            : numericValue > 0;
          const formattedValue = formatHeatmapMetricValue(numericValue);
          badge.textContent = hasCellData ? formattedValue : '';
          badge.tabIndex = hasCellData ? 0 : -1;
          const descriptor = getHeatmapMetricDescription(selectedMetric);
          const tooltipValue = hasCellData ? formattedValue : formatHeatmapMetricValue(0);
          const tooltip = `${HEATMAP_WEEKDAY_FULL[dayIndex] || ''}, ${HEATMAP_HOURS[hourIndex]} – ${tooltipValue}${descriptor ? ` ${descriptor}` : ''}`;
          cell.setAttribute('aria-label', tooltip);
          badge.setAttribute('title', tooltip);
          cell.appendChild(badge);
          row.appendChild(cell);
        });
        tbody.appendChild(row);
      });
      table.appendChild(tbody);

      container.appendChild(table);
      const legend = document.createElement('p');
      legend.className = 'heatmap-legend';
      const unit = getHeatmapMetricUnit(selectedMetric);
      const legendLabel = TEXT.charts?.heatmapMetricLabel || 'Rodiklis';
      const legendBase = TEXT.charts?.heatmapLegend || '';
      const metricInfo = `${legendLabel}: ${metricLabel}${unit ? ` (${unit})` : ''}.`;
      legend.textContent = legendBase ? `${metricInfo} ${legendBase}` : metricInfo;
      container.appendChild(legend);
    }

    function formatLocalDateKey(date) {
      if (!(date instanceof Date)) {
        return '';
      }
      const time = date.getTime();
      if (Number.isNaN(time)) {
        return '';
      }
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    function resolveShiftStartHour(calculationSettings) {
      const fallback = Number.isFinite(Number(DEFAULT_SETTINGS?.calculations?.nightEndHour))
        ? Number(DEFAULT_SETTINGS.calculations.nightEndHour)
        : 7;
      if (Number.isFinite(Number(calculationSettings?.shiftStartHour))) {
        return Number(calculationSettings.shiftStartHour);
      }
      if (Number.isFinite(Number(calculationSettings?.nightEndHour))) {
        return Number(calculationSettings.nightEndHour);
      }
      return fallback;
    }

    function computeShiftDateKey(referenceDate, shiftStartHour) {
      if (!(referenceDate instanceof Date) || Number.isNaN(referenceDate.getTime())) {
        return '';
      }
      const dayMinutes = 24 * 60;
      const startMinutesRaw = Number.isFinite(Number(shiftStartHour)) ? Number(shiftStartHour) * 60 : 7 * 60;
      const startMinutes = ((Math.round(startMinutesRaw) % dayMinutes) + dayMinutes) % dayMinutes;
      const arrivalMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
      const shiftAnchor = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
      if (arrivalMinutes < startMinutes) {
        shiftAnchor.setDate(shiftAnchor.getDate() - 1);
      }
      return formatLocalDateKey(shiftAnchor);
    }

    function computeDailyStats(data) {
      const shiftStartHour = resolveShiftStartHour(settings?.calculations);
      const dailyMap = new Map();
      data.forEach((record) => {
        const reference = record.arrival instanceof Date && !Number.isNaN(record.arrival.getTime())
          ? record.arrival
          : record.discharge instanceof Date && !Number.isNaN(record.discharge.getTime())
            ? record.discharge
            : null;
        const dateKey = computeShiftDateKey(reference, shiftStartHour);
        if (!dateKey) {
          return;
        }

        if (!dailyMap.has(dateKey)) {
          dailyMap.set(dateKey, {
            date: dateKey,
            count: 0,
            night: 0,
            ems: 0,
            discharged: 0,
            hospitalized: 0,
            totalTime: 0,
            durations: 0,
            hospitalizedTime: 0,
            hospitalizedDurations: 0,
          });
        }
        const summary = dailyMap.get(dateKey);
        summary.count += 1;
        summary.night += record.night ? 1 : 0;
        summary.ems += record.ems ? 1 : 0;
        if (record.hospitalized) {
          summary.hospitalized += 1;
        } else {
          summary.discharged += 1;
        }
        if (record.arrival instanceof Date && record.discharge instanceof Date) {
          const duration = (record.discharge.getTime() - record.arrival.getTime()) / 3600000;
          if (Number.isFinite(duration) && duration >= 0 && duration <= 24) { // ignoruojame >24 val. buvimo laikus
            summary.totalTime += duration;
            summary.durations += 1;
            if (record.hospitalized) {
              summary.hospitalizedTime += duration;
              summary.hospitalizedDurations += 1;
            }
          }
        }
      });

      return Array.from(dailyMap.values()).sort((a, b) => (a.date > b.date ? 1 : -1)).map((item) => ({
        ...item,
        avgTime: item.durations ? item.totalTime / item.durations : 0,
        avgHospitalizedTime: item.hospitalizedDurations ? item.hospitalizedTime / item.hospitalizedDurations : 0,
      }));
    }

    function computeMonthlyStats(daily) {
      const monthlyMap = new Map();
      daily.forEach((entry) => {
        if (!entry?.date) {
          return;
        }
        const monthKey = entry.date.slice(0, 7);
        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, {
            month: monthKey,
            count: 0,
            night: 0,
            ems: 0,
            discharged: 0,
            hospitalized: 0,
            totalTime: 0,
            durations: 0,
            hospitalizedTime: 0,
            hospitalizedDurations: 0,
            dayCount: 0,
          });
        }
        const summary = monthlyMap.get(monthKey);
        summary.count += entry.count;
        summary.night += entry.night;
        summary.ems += entry.ems;
        summary.discharged += entry.discharged;
        summary.hospitalized += entry.hospitalized;
        summary.totalTime += entry.totalTime;
        summary.durations += entry.durations;
        summary.hospitalizedTime += entry.hospitalizedTime;
        summary.hospitalizedDurations += entry.hospitalizedDurations;
        summary.dayCount += 1;
      });

      return Array.from(monthlyMap.values()).sort((a, b) => (a.month > b.month ? 1 : -1));
    }

    function computeYearlyStats(monthlyStats) {
      const yearlyMap = new Map();
      monthlyStats.forEach((entry) => {
        if (!entry?.month) {
          return;
        }
        const yearKey = entry.month.slice(0, 4);
        if (!yearKey) {
          return;
        }
        if (!yearlyMap.has(yearKey)) {
          yearlyMap.set(yearKey, {
            year: yearKey,
            count: 0,
            night: 0,
            ems: 0,
            discharged: 0,
            hospitalized: 0,
            totalTime: 0,
            durations: 0,
            hospitalizedTime: 0,
            hospitalizedDurations: 0,
            dayCount: 0,
            monthCount: 0,
          });
        }
        const bucket = yearlyMap.get(yearKey);
        bucket.count += Number.isFinite(entry.count) ? entry.count : 0;
        bucket.night += Number.isFinite(entry.night) ? entry.night : 0;
        bucket.ems += Number.isFinite(entry.ems) ? entry.ems : 0;
        bucket.discharged += Number.isFinite(entry.discharged) ? entry.discharged : 0;
        bucket.hospitalized += Number.isFinite(entry.hospitalized) ? entry.hospitalized : 0;
        bucket.totalTime += Number.isFinite(entry.totalTime) ? entry.totalTime : 0;
        bucket.durations += Number.isFinite(entry.durations) ? entry.durations : 0;
        bucket.hospitalizedTime += Number.isFinite(entry.hospitalizedTime) ? entry.hospitalizedTime : 0;
        bucket.hospitalizedDurations += Number.isFinite(entry.hospitalizedDurations) ? entry.hospitalizedDurations : 0;
        bucket.dayCount += Number.isFinite(entry.dayCount) ? entry.dayCount : 0;
        bucket.monthCount += 1;
      });

      return Array.from(yearlyMap.values()).sort((a, b) => (a.year > b.year ? 1 : -1));
    }

    function computeFeedbackStats(records) {
      const list = Array.isArray(records) ? records.filter(Boolean) : [];
      const sorted = list
        .slice()
        .sort((a, b) => {
          const aTime = a?.receivedAt instanceof Date ? a.receivedAt.getTime() : -Infinity;
          const bTime = b?.receivedAt instanceof Date ? b.receivedAt.getTime() : -Infinity;
          return bTime - aTime;
        });

      const totalResponses = sorted.length;
      const collectValues = (key, predicate = null) => sorted
        .filter((entry) => (typeof predicate === 'function' ? predicate(entry) : true))
        .map((entry) => {
          const value = entry?.[key];
          return Number.isFinite(value) ? Number(value) : null;
        })
        .filter((value) => Number.isFinite(value)
          && value >= FEEDBACK_RATING_MIN
          && value <= FEEDBACK_RATING_MAX);

      const overallRatings = collectValues('overallRating');
      const doctorsRatings = collectValues('doctorsRating');
      const nursesRatings = collectValues('nursesRating');
      const aidesRatings = collectValues('aidesRating', (entry) => entry?.aidesContact === true);
      const waitingRatings = collectValues('waitingRating');

      const average = (values) => (values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null);

      const contactResponses = sorted
        .filter((entry) => entry?.aidesContact === true || entry?.aidesContact === false)
        .length;
      const contactYes = sorted.filter((entry) => entry?.aidesContact === true).length;
      const contactShare = contactResponses > 0 ? contactYes / contactResponses : null;

      const monthlyMap = new Map();
      sorted.forEach((entry) => {
        if (!(entry?.receivedAt instanceof Date) || Number.isNaN(entry.receivedAt.getTime())) {
          return;
        }
        const dateKey = formatLocalDateKey(entry.receivedAt);
        if (!dateKey) {
          return;
        }
        const monthKey = dateKey.slice(0, 7);
        if (!monthKey) {
          return;
        }
        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, {
            month: monthKey,
            responses: 0,
            overallSum: 0,
            overallCount: 0,
            doctorsSum: 0,
            doctorsCount: 0,
            nursesSum: 0,
            nursesCount: 0,
            aidesSum: 0,
            aidesCount: 0,
            waitingSum: 0,
            waitingCount: 0,
            contactResponses: 0,
            contactYes: 0,
          });
        }

        const bucket = monthlyMap.get(monthKey);
        bucket.responses += 1;

        if (Number.isFinite(entry?.overallRating)
          && entry.overallRating >= FEEDBACK_RATING_MIN
          && entry.overallRating <= FEEDBACK_RATING_MAX) {
          bucket.overallSum += Number(entry.overallRating);
          bucket.overallCount += 1;
        }
        if (Number.isFinite(entry?.doctorsRating)
          && entry.doctorsRating >= FEEDBACK_RATING_MIN
          && entry.doctorsRating <= FEEDBACK_RATING_MAX) {
          bucket.doctorsSum += Number(entry.doctorsRating);
          bucket.doctorsCount += 1;
        }
        if (Number.isFinite(entry?.nursesRating)
          && entry.nursesRating >= FEEDBACK_RATING_MIN
          && entry.nursesRating <= FEEDBACK_RATING_MAX) {
          bucket.nursesSum += Number(entry.nursesRating);
          bucket.nursesCount += 1;
        }
        if (entry?.aidesContact === true
          && Number.isFinite(entry?.aidesRating)
          && entry.aidesRating >= FEEDBACK_RATING_MIN
          && entry.aidesRating <= FEEDBACK_RATING_MAX) {
          bucket.aidesSum += Number(entry.aidesRating);
          bucket.aidesCount += 1;
        }
        if (Number.isFinite(entry?.waitingRating)
          && entry.waitingRating >= FEEDBACK_RATING_MIN
          && entry.waitingRating <= FEEDBACK_RATING_MAX) {
          bucket.waitingSum += Number(entry.waitingRating);
          bucket.waitingCount += 1;
        }
        if (entry?.aidesContact === true) {
          bucket.contactResponses += 1;
          bucket.contactYes += 1;
        } else if (entry?.aidesContact === false) {
          bucket.contactResponses += 1;
        }
      });

      const monthly = Array.from(monthlyMap.values()).map((bucket) => ({
        month: bucket.month,
        responses: bucket.responses,
        overallAverage: bucket.overallCount > 0 ? bucket.overallSum / bucket.overallCount : null,
        doctorsAverage: bucket.doctorsCount > 0 ? bucket.doctorsSum / bucket.doctorsCount : null,
        nursesAverage: bucket.nursesCount > 0 ? bucket.nursesSum / bucket.nursesCount : null,
        aidesAverage: bucket.aidesCount > 0 ? bucket.aidesSum / bucket.aidesCount : null,
        waitingAverage: bucket.waitingCount > 0 ? bucket.waitingSum / bucket.waitingCount : null,
        contactResponses: bucket.contactResponses,
        contactShare: bucket.contactResponses > 0 ? bucket.contactYes / bucket.contactResponses : null,
      }));

      return {
        summary: {
          totalResponses,
          overallAverage: average(overallRatings),
          doctorsAverage: average(doctorsRatings),
          nursesAverage: average(nursesRatings),
          aidesAverage: average(aidesRatings),
          waitingAverage: average(waitingRatings),
          overallCount: overallRatings.length,
          doctorsCount: doctorsRatings.length,
          nursesCount: nursesRatings.length,
          aidesResponses: aidesRatings.length,
          waitingCount: waitingRatings.length,
          contactResponses,
          contactYes,
          contactShare,
        },
        monthly,
      };
    }

    function sanitizeFeedbackFilters(filters, options = {}) {
      const defaults = getDefaultFeedbackFilters();
      const normalized = { ...defaults, ...(filters || {}) };
      const respondentValues = new Set([FEEDBACK_FILTER_ALL]);
      const locationValues = new Set([FEEDBACK_FILTER_ALL]);

      const respondentOptions = Array.isArray(options.respondent) ? options.respondent : [];
      respondentOptions.forEach((option) => {
        if (option && typeof option.value === 'string') {
          respondentValues.add(option.value);
        }
      });

      const locationOptions = Array.isArray(options.location) ? options.location : [];
      locationOptions.forEach((option) => {
        if (option && typeof option.value === 'string') {
          locationValues.add(option.value);
        }
      });

      if (!respondentValues.has(normalized.respondent)) {
        normalized.respondent = defaults.respondent;
      }
      if (!locationValues.has(normalized.location)) {
        normalized.location = defaults.location;
      }

      return normalized;
    }

    function normalizeFeedbackFilterValue(value) {
      if (typeof value !== 'string') {
        return '';
      }
      return value.trim().toLowerCase();
    }

    function buildFeedbackFilterOptions(records) {
      const filtersText = TEXT.feedback?.filters || {};
      const missingLabel = filtersText.missing || 'Nenurodyta';
      const respondentMap = new Map();
      const locationMap = new Map();

      const pushValue = (map, raw) => {
        const trimmed = typeof raw === 'string' ? raw.trim() : '';
        const key = trimmed ? trimmed.toLowerCase() : FEEDBACK_FILTER_MISSING;
        const existing = map.get(key) || {
          value: key,
          label: trimmed ? capitalizeSentence(trimmed) : missingLabel,
          count: 0,
          original: trimmed,
        };
        existing.count += 1;
        if (trimmed && !existing.original) {
          existing.original = trimmed;
          existing.label = capitalizeSentence(trimmed);
        }
        map.set(key, existing);
      };

      (Array.isArray(records) ? records : []).forEach((entry) => {
        pushValue(respondentMap, entry?.respondent);
        pushValue(locationMap, entry?.location);
      });

      const toOptions = (map) => Array.from(map.values())
        .filter((item) => Number.isFinite(item.count) && item.count > 0 && typeof item.value === 'string')
        .map((item) => ({
          value: item.value,
          label: item.label,
          count: item.count,
        }))
        .sort((a, b) => textCollator.compare(a.label, b.label));

      return {
        respondent: toOptions(respondentMap),
        location: toOptions(locationMap),
      };
    }

    function formatFeedbackFilterOption(option) {
      if (!option || typeof option !== 'object') {
        return '';
      }
      const label = option.label || '';
      const count = Number.isFinite(option.count) ? option.count : null;
      if (count != null && count > 0) {
        return `${label} (${numberFormatter.format(count)})`;
      }
      return label;
    }

    function populateFeedbackFilterControls(options = dashboardState.feedback.filterOptions) {
      const config = options || { respondent: [], location: [] };
      const filtersText = TEXT.feedback?.filters || {};
      if (selectors.feedbackRespondentFilter) {
        const select = selectors.feedbackRespondentFilter;
        const items = [];
        const allOption = document.createElement('option');
        allOption.value = FEEDBACK_FILTER_ALL;
        allOption.textContent = filtersText.respondent?.all || 'Visi dalyviai';
        items.push(allOption);
        (Array.isArray(config.respondent) ? config.respondent : []).forEach((option) => {
          if (!option || typeof option.value !== 'string') {
            return;
          }
          const opt = document.createElement('option');
          opt.value = option.value;
          opt.textContent = formatFeedbackFilterOption(option);
          items.push(opt);
        });
        select.replaceChildren(...items);
      }
      if (selectors.feedbackLocationFilter) {
        const select = selectors.feedbackLocationFilter;
        const items = [];
        const allOption = document.createElement('option');
        allOption.value = FEEDBACK_FILTER_ALL;
        allOption.textContent = filtersText.location?.all || 'Visos vietos';
        items.push(allOption);
        (Array.isArray(config.location) ? config.location : []).forEach((option) => {
          if (!option || typeof option.value !== 'string') {
            return;
          }
          const opt = document.createElement('option');
          opt.value = option.value;
          opt.textContent = formatFeedbackFilterOption(option);
          items.push(opt);
        });
        select.replaceChildren(...items);
      }
    }

    function syncFeedbackFilterControls() {
      const filters = dashboardState.feedback.filters || getDefaultFeedbackFilters();
      if (selectors.feedbackRespondentFilter) {
        const select = selectors.feedbackRespondentFilter;
        const value = typeof filters.respondent === 'string' ? filters.respondent : FEEDBACK_FILTER_ALL;
        const hasOption = Array.from(select.options).some((option) => option.value === value);
        select.value = hasOption ? value : FEEDBACK_FILTER_ALL;
      }
      if (selectors.feedbackLocationFilter) {
        const select = selectors.feedbackLocationFilter;
        const value = typeof filters.location === 'string' ? filters.location : FEEDBACK_FILTER_ALL;
        const hasOption = Array.from(select.options).some((option) => option.value === value);
        select.value = hasOption ? value : FEEDBACK_FILTER_ALL;
      }
    }

    function getFeedbackFilterLabel(type, value) {
      const filtersText = TEXT.feedback?.filters || {};
      if (value === FEEDBACK_FILTER_ALL || !value) {
        if (type === 'respondent') {
          return filtersText.respondent?.all || 'Visi dalyviai';
        }
        if (type === 'location') {
          return filtersText.location?.all || 'Visos vietos';
        }
        return '';
      }
      if (value === FEEDBACK_FILTER_MISSING) {
        return filtersText.missing || 'Nenurodyta';
      }
      const options = dashboardState.feedback.filterOptions?.[type];
      if (Array.isArray(options)) {
        const match = options.find((option) => option?.value === value);
        if (match) {
          return match.label || match.value;
        }
      }
      return value;
    }

    function updateFeedbackFiltersSummary(summary = dashboardState.feedback.summary) {
      const summaryElement = selectors.feedbackFiltersSummary;
      if (!summaryElement) {
        return;
      }
      const filters = dashboardState.feedback.filters || getDefaultFeedbackFilters();
      const filtersText = TEXT.feedback?.filters || {};
      const respondentLabel = getFeedbackFilterLabel('respondent', filters.respondent);
      const locationLabel = getFeedbackFilterLabel('location', filters.location);
      const parts = [];
      if (respondentLabel) {
        parts.push(respondentLabel);
      }
      if (locationLabel) {
        parts.push(locationLabel);
      }
      const baseText = parts.length
        ? (filtersText.summaryLabel ? `${filtersText.summaryLabel} ${parts.join(' • ')}` : parts.join(' • '))
        : filtersText.summaryDefault || '';
      const totalResponses = Number.isFinite(summary?.totalResponses) ? summary.totalResponses : null;
      const countLabel = filtersText.countLabel || TEXT.feedback?.table?.headers?.responses || 'Atsakymai';
      const countText = Number.isFinite(totalResponses) ? `${countLabel}: ${numberFormatter.format(totalResponses)}` : '';
      const finalText = baseText && countText ? `${baseText} • ${countText}` : (baseText || countText || filtersText.summaryDefault || '');
      summaryElement.textContent = finalText;
      const isDefault = filters.respondent === FEEDBACK_FILTER_ALL && filters.location === FEEDBACK_FILTER_ALL;
      summaryElement.dataset.default = isDefault ? 'true' : 'false';
    }

    function filterFeedbackRecords(records, filters) {
      const list = Array.isArray(records) ? records.filter(Boolean) : [];
      if (!filters) {
        return list;
      }
      return list.filter((entry) => {
        if (!entry) {
          return false;
        }
        const respondentValue = normalizeFeedbackFilterValue(entry.respondent);
        const locationValue = normalizeFeedbackFilterValue(entry.location);
        if (filters.respondent !== FEEDBACK_FILTER_ALL) {
          if (filters.respondent === FEEDBACK_FILTER_MISSING) {
            if (respondentValue) {
              return false;
            }
          } else if (respondentValue !== filters.respondent) {
            return false;
          }
        }
        if (filters.location !== FEEDBACK_FILTER_ALL) {
          if (filters.location === FEEDBACK_FILTER_MISSING) {
            if (locationValue) {
              return false;
            }
          } else if (locationValue !== filters.location) {
            return false;
          }
        }
        return true;
      });
    }

    function applyFeedbackFiltersAndRender() {
      const options = dashboardState.feedback.filterOptions || { respondent: [], location: [] };
      const sanitized = sanitizeFeedbackFilters(dashboardState.feedback.filters, options);
      dashboardState.feedback.filters = sanitized;
      syncFeedbackFilterControls();
      const filteredRecords = filterFeedbackRecords(dashboardState.feedback.records, sanitized);
      dashboardState.feedback.filteredRecords = filteredRecords;
      const feedbackStats = computeFeedbackStats(filteredRecords);
      dashboardState.feedback.summary = feedbackStats.summary;
      dashboardState.feedback.monthly = feedbackStats.monthly;
      renderFeedbackSection(feedbackStats);
      updateFeedbackFiltersSummary(feedbackStats.summary);
      return feedbackStats;
    }

    function handleFeedbackFilterChange(event) {
      const target = event?.target;
      if (!target || target.tagName !== 'SELECT') {
        return;
      }
      const { name, value } = target;
      if (name === 'respondent' || name === 'location') {
        dashboardState.feedback.filters = {
          ...dashboardState.feedback.filters,
          [name]: typeof value === 'string' ? value : FEEDBACK_FILTER_ALL,
        };
        applyFeedbackFiltersAndRender();
      }
    }

    function updateFeedbackFilterOptions(records) {
      const options = buildFeedbackFilterOptions(records);
      dashboardState.feedback.filterOptions = options;
      populateFeedbackFilterControls(options);
      dashboardState.feedback.filters = sanitizeFeedbackFilters(dashboardState.feedback.filters, options);
      syncFeedbackFilterControls();
    }

    function initializeFeedbackFilters() {
      populateFeedbackFilterControls(dashboardState.feedback.filterOptions);
      syncFeedbackFilterControls();
      updateFeedbackFiltersSummary(dashboardState.feedback.summary);
      if (selectors.feedbackRespondentFilter) {
        selectors.feedbackRespondentFilter.addEventListener('change', handleFeedbackFilterChange);
      }
      if (selectors.feedbackLocationFilter) {
        selectors.feedbackLocationFilter.addEventListener('change', handleFeedbackFilterChange);
      }
    }

    function aggregatePeriodSummary(entries) {
      if (!Array.isArray(entries)) {
        return {
          days: 0,
          totalCount: 0,
          totalNight: 0,
          totalHospitalized: 0,
          totalDischarged: 0,
          totalTime: 0,
          durationCount: 0,
          totalHospitalizedTime: 0,
          hospitalizedDurationCount: 0,
        };
      }
      return entries.reduce((acc, entry) => {
        acc.days += 1;
        const count = Number.isFinite(entry?.count) ? entry.count : 0;
        const hospitalized = Number.isFinite(entry?.hospitalized) ? entry.hospitalized : 0;
        const discharged = Number.isFinite(entry?.discharged) ? entry.discharged : 0;
        const night = Number.isFinite(entry?.night) ? entry.night : 0;
        const totalTime = Number.isFinite(entry?.totalTime) ? entry.totalTime : 0;
        const durations = Number.isFinite(entry?.durations) ? entry.durations : 0;
        const hospitalizedTime = Number.isFinite(entry?.hospitalizedTime) ? entry.hospitalizedTime : 0;
        const hospitalizedDurations = Number.isFinite(entry?.hospitalizedDurations) ? entry.hospitalizedDurations : 0;
        acc.totalCount += count;
        acc.totalNight += night;
        acc.totalHospitalized += hospitalized;
        acc.totalDischarged += discharged;
        acc.totalTime += totalTime;
        acc.durationCount += durations;
        acc.totalHospitalizedTime += hospitalizedTime;
        acc.hospitalizedDurationCount += hospitalizedDurations;
        return acc;
      }, {
        days: 0,
        totalCount: 0,
        totalNight: 0,
        totalHospitalized: 0,
        totalDischarged: 0,
        totalTime: 0,
        durationCount: 0,
        totalHospitalizedTime: 0,
        hospitalizedDurationCount: 0,
      });
    }

    function derivePeriodMetrics(summary) {
      const days = Number.isFinite(summary?.days) ? summary.days : 0;
      const totalCount = Number.isFinite(summary?.totalCount) ? summary.totalCount : 0;
      const totalNight = Number.isFinite(summary?.totalNight) ? summary.totalNight : 0;
      const totalHospitalized = Number.isFinite(summary?.totalHospitalized) ? summary.totalHospitalized : 0;
      const totalDischarged = Number.isFinite(summary?.totalDischarged) ? summary.totalDischarged : 0;
      const totalTime = Number.isFinite(summary?.totalTime) ? summary.totalTime : 0;
      const durationCount = Number.isFinite(summary?.durationCount) ? summary.durationCount : 0;
      const totalHospitalizedTime = Number.isFinite(summary?.totalHospitalizedTime) ? summary.totalHospitalizedTime : 0;
      const hospitalizedDurationCount = Number.isFinite(summary?.hospitalizedDurationCount)
        ? summary.hospitalizedDurationCount
        : 0;
      return {
        days,
        totalCount,
        totalNight,
        totalHospitalized,
        totalDischarged,
        patientsPerDay: days > 0 ? totalCount / days : null,
        nightPerDay: days > 0 ? totalNight / days : null,
        avgTime: durationCount > 0 ? totalTime / durationCount : null,
        avgHospitalizedTime: hospitalizedDurationCount > 0 ? totalHospitalizedTime / hospitalizedDurationCount : null,
        hospitalizedPerDay: days > 0 ? totalHospitalized / days : null,
        hospitalizedShare: totalCount > 0 ? totalHospitalized / totalCount : null,
        dischargedPerDay: days > 0 ? totalDischarged / days : null,
        dischargedShare: totalCount > 0 ? totalDischarged / totalCount : null,
      };
    }

    function describePeriodLabel({ windowDays, startDateKey, endDateKey }) {
      const startDate = dateKeyToDate(startDateKey);
      const endDate = dateKeyToDate(endDateKey);
      let baseLabel = '';
      if (Number.isFinite(windowDays) && windowDays > 0) {
        if (startDate && endDate) {
          const startYear = startDate.getUTCFullYear();
          const endYear = endDate.getUTCFullYear();
          if (windowDays >= 360 && startYear === endYear) {
            baseLabel = `${startYear} m.`;
          }
        }
        if (!baseLabel) {
          baseLabel = windowDays === 1 ? 'Paskutinė diena' : `Paskutinės ${windowDays} d.`;
        }
      } else if (startDate && endDate) {
        const startYear = startDate.getUTCFullYear();
        const endYear = endDate.getUTCFullYear();
        baseLabel = startYear === endYear ? `${startYear} m.` : `${startYear}–${endYear} m.`;
      }
      if (!baseLabel) {
        baseLabel = TEXT.kpis.windowAllLabel;
      }
      let rangeLabel = '';
      if (startDate && endDate) {
        const start = shortDateFormatter.format(startDate);
        const end = shortDateFormatter.format(endDate);
        rangeLabel = start === end ? start : `${start} – ${end}`;
      }
      const metaLabel = rangeLabel ? `${baseLabel} (${rangeLabel})` : baseLabel;
      const referenceLabel = baseLabel || TEXT.kpis.yearAverageReference;
      return { metaLabel, referenceLabel };
    }

    function buildYearMonthMetrics(dailyStats, windowDays) {
      if (!Array.isArray(dailyStats) || dailyStats.length === 0) {
        return null;
      }
      const decorated = dailyStats
        .map((entry) => ({ entry, utc: dateKeyToUtc(entry?.date ?? '') }))
        .filter((item) => Number.isFinite(item.utc))
        .sort((a, b) => a.utc - b.utc);
      if (!decorated.length) {
        return null;
      }
      const earliest = decorated[0].entry;
      const latest = decorated[decorated.length - 1].entry;
      const [yearStr = '', monthStr = ''] = (latest?.date ?? '').split('-');
      const year = Number.parseInt(yearStr, 10);
      const monthKey = monthStr ? `${yearStr}-${monthStr}` : null;
      const monthEntries = monthKey
        ? dailyStats.filter((entry) => typeof entry?.date === 'string' && entry.date.startsWith(monthKey))
        : [];
      const periodEntries = decorated.map((item) => item.entry);
      const yearSummary = derivePeriodMetrics(aggregatePeriodSummary(periodEntries));
      const monthSummary = derivePeriodMetrics(aggregatePeriodSummary(monthEntries));
      const monthNumeric = Number.parseInt(monthStr, 10);
      const monthLabel = Number.isFinite(monthNumeric) && Number.isFinite(year)
        ? monthFormatter.format(new Date(year, Math.max(0, monthNumeric - 1), 1))
        : '';
      const periodLabels = describePeriodLabel({
        windowDays,
        startDateKey: earliest?.date,
        endDateKey: latest?.date,
      });
      return {
        yearLabel: periodLabels.metaLabel,
        referenceLabel: periodLabels.referenceLabel,
        monthLabel,
        yearMetrics: yearSummary,
        monthMetrics: monthSummary,
      };
    }

    function refreshKpiWindowOptions() {
      const select = selectors.kpiWindow;
      if (!select) {
        return;
      }
      const configuredWindowRaw = Number.isFinite(Number(settings?.calculations?.windowDays))
        ? Number(settings.calculations.windowDays)
        : DEFAULT_SETTINGS.calculations.windowDays;
      const configuredWindow = Number.isFinite(configuredWindowRaw) && configuredWindowRaw > 0
        ? configuredWindowRaw
        : DEFAULT_KPI_WINDOW_DAYS;
      const currentWindowRaw = Number.isFinite(Number(dashboardState.kpi?.filters?.window))
        ? Number(dashboardState.kpi.filters.window)
        : configuredWindow;
      const currentWindow = Number.isFinite(currentWindowRaw) && currentWindowRaw > 0
        ? currentWindowRaw
        : configuredWindow;
      const uniqueValues = [...new Set([...KPI_WINDOW_OPTION_BASE, configuredWindow, currentWindow])]
        .filter((value) => Number.isFinite(value) && value >= 0)
        .sort((a, b) => {
          if (a === 0) return 1;
          if (b === 0) return -1;
          return a - b;
        });
      const options = uniqueValues.map((value) => {
        const option = document.createElement('option');
        option.value = String(value);
        if (value === 0) {
          option.textContent = TEXT.kpis.windowAllLabel;
        } else if (value === 365) {
          option.textContent = `${value} d. (${TEXT.kpis.windowYearSuffix})`;
        } else {
          option.textContent = `${value} d.`;
        }
        return option;
      });
      select.replaceChildren(...options);
    }

    function syncKpiFilterControls() {
      const filters = dashboardState.kpi.filters;
      if (selectors.kpiWindow && Number.isFinite(filters.window)) {
        const windowValue = String(filters.window);
        const existing = Array.from(selectors.kpiWindow.options).some((option) => option.value === windowValue);
        if (!existing) {
          const option = document.createElement('option');
          option.value = windowValue;
          option.textContent = `${filters.window} d.`;
          selectors.kpiWindow.appendChild(option);
        }
        selectors.kpiWindow.value = windowValue;
      }
      if (selectors.kpiShift) {
        selectors.kpiShift.value = filters.shift;
      }
      if (selectors.kpiArrival) {
        selectors.kpiArrival.value = filters.arrival;
      }
      if (selectors.kpiDisposition) {
        selectors.kpiDisposition.value = filters.disposition;
      }
      if (selectors.kpiCardType) {
        selectors.kpiCardType.value = filters.cardType;
      }
    }

    function syncChartFilterControls() {
      const filters = sanitizeChartFilters(dashboardState.chartFilters);
      dashboardState.chartFilters = { ...filters };
      if (selectors.chartFilterArrival) {
        selectors.chartFilterArrival.value = filters.arrival;
      }
      if (selectors.chartFilterDisposition) {
        selectors.chartFilterDisposition.value = filters.disposition;
      }
      if (selectors.chartFilterCardType) {
        selectors.chartFilterCardType.value = filters.cardType;
      }
    }

    function updateChartFiltersSummary({ records, daily } = {}) {
      if (!selectors.chartFiltersSummary) {
        return;
      }
      const filters = sanitizeChartFilters(dashboardState.chartFilters);
      const defaults = getDefaultChartFilters();
      const summaryParts = [];
      if (filters.arrival !== defaults.arrival) {
        summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.arrival[filters.arrival]));
      }
      if (filters.disposition !== defaults.disposition) {
        summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.disposition[filters.disposition]));
      }
      if (filters.cardType !== defaults.cardType) {
        summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.cardType[filters.cardType]));
      }
      const hasRecords = Array.isArray(records) ? records.length > 0 : false;
      const hasDaily = Array.isArray(daily)
        ? daily.some((entry) => Number.isFinite(entry?.count) && entry.count > 0)
        : false;
      const hasData = hasRecords || hasDaily;
      let text = summaryParts.join(' • ');
      if (!hasData) {
        text = text ? `Įrašų nerasta • ${text}` : 'Įrašų nerasta';
      }
      if (!text) {
        selectors.chartFiltersSummary.textContent = 'Numatytieji filtrai';
        selectors.chartFiltersSummary.dataset.default = 'true';
        return;
      }
      selectors.chartFiltersSummary.textContent = text;
      selectors.chartFiltersSummary.dataset.default = 'false';
    }

    function matchesSharedPatientFilters(record, filters = {}) {
      const arrivalFilter = filters.arrival;
      if (arrivalFilter === 'ems' && !record.ems) {
        return false;
      }
      if (arrivalFilter === 'self' && record.ems) {
        return false;
      }

      const dispositionFilter = filters.disposition;
      if (dispositionFilter === 'hospitalized' && !record.hospitalized) {
        return false;
      }
      if (dispositionFilter === 'discharged' && record.hospitalized) {
        return false;
      }

      const cardTypeFilter = filters.cardType;
      if (cardTypeFilter === 't' && record.cardType !== 't') {
        return false;
      }
      if (cardTypeFilter === 'tr' && record.cardType !== 'tr') {
        return false;
      }
      if (cardTypeFilter === 'ch' && record.cardType !== 'ch') {
        return false;
      }

      return true;
    }

    function recordMatchesKpiFilters(record, filters) {
      if (!record) {
        return false;
      }
      if (filters.shift === 'day' && record.night) {
        return false;
      }
      if (filters.shift === 'night' && !record.night) {
        return false;
      }
      return matchesSharedPatientFilters(record, filters);
    }

    function recordMatchesChartFilters(record, filters) {
      if (!record) {
        return false;
      }
      return matchesSharedPatientFilters(record, filters);
    }

    function filterRecordsByChartFilters(records, filters) {
      const normalized = sanitizeChartFilters(filters);
      return (Array.isArray(records) ? records : []).filter((record) => recordMatchesChartFilters(record, normalized));
    }

    function toSentenceCase(label) {
      if (typeof label !== 'string' || !label.length) {
        return '';
      }
      return label.charAt(0).toUpperCase() + label.slice(1);
    }

    function updateKpiSummary({ records, dailyStats, windowDays }) {
      if (!selectors.kpiActiveInfo) {
        return;
      }
      const filters = dashboardState.kpi.filters;
      const defaultFilters = getDefaultKpiFilters();
      const totalRecords = Array.isArray(records) ? records.length : 0;
      const hasAggregatedData = Array.isArray(dailyStats)
        ? dailyStats.some((entry) => Number.isFinite(entry?.count) && entry.count > 0)
        : false;
      const hasData = totalRecords > 0 || hasAggregatedData;
      const summaryParts = [];
      const isWindowDefault = Number.isFinite(windowDays)
        ? windowDays === defaultFilters.window
        : false;
      const isShiftDefault = filters.shift === defaultFilters.shift;
      const isArrivalDefault = filters.arrival === defaultFilters.arrival;
      const isDispositionDefault = filters.disposition === defaultFilters.disposition;
      const isCardTypeDefault = filters.cardType === defaultFilters.cardType;

      if (Number.isFinite(windowDays) && windowDays > 0 && !isWindowDefault) {
        summaryParts.push(`${windowDays} d.`);
      }
      if (!isShiftDefault) {
        summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.shift[filters.shift]));
      }
      if (!isArrivalDefault) {
        summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.arrival[filters.arrival]));
      }
      if (!isDispositionDefault) {
        summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.disposition[filters.disposition]));
      }
      if (!isCardTypeDefault) {
        summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.cardType[filters.cardType]));
      }
      let text = summaryParts.join(' • ');
      if (!hasData) {
        text = text ? `Įrašų nerasta • ${text}` : 'Įrašų nerasta';
      }
      if (!text) {
        selectors.kpiActiveInfo.textContent = 'Numatytieji filtrai';
        selectors.kpiActiveInfo.dataset.default = 'true';
        return;
      }
      selectors.kpiActiveInfo.textContent = text;
      selectors.kpiActiveInfo.dataset.default = 'false';
    }

    function applyKpiFiltersLocally(filters) {
      const normalizedFilters = sanitizeKpiFilters(filters);
      const windowDays = Number.isFinite(normalizedFilters.window)
        ? normalizedFilters.window
        : DEFAULT_SETTINGS.calculations.windowDays;
      const hasPrimaryRecords = Array.isArray(dashboardState.primaryRecords)
        && dashboardState.primaryRecords.length > 0;
      const primaryDailyStats = Array.isArray(dashboardState.primaryDaily)
        ? dashboardState.primaryDaily
        : [];
      let filteredRecords = [];
      let filteredDailyStats = [];

      if (hasPrimaryRecords) {
        const scopedRecords = filterRecordsByShiftWindow(dashboardState.primaryRecords, windowDays);
        filteredRecords = scopedRecords.filter((record) => recordMatchesKpiFilters(record, normalizedFilters));
        filteredDailyStats = computeDailyStats(filteredRecords);
      } else {
        const scopedDaily = filterDailyStatsByWindow(primaryDailyStats, windowDays);
        filteredDailyStats = scopedDaily.slice();
      }

      return {
        filters: normalizedFilters,
        records: filteredRecords,
        dailyStats: filteredDailyStats,
        windowDays,
      };
    }

    async function applyKpiFiltersAndRender() {
      const normalizedFilters = sanitizeKpiFilters(dashboardState.kpi.filters);
      dashboardState.kpi.filters = { ...normalizedFilters };
      const defaultFilters = getDefaultKpiFilters();
      const windowDays = normalizedFilters.window;
      const workerPayload = {
        filters: normalizedFilters,
        defaultFilters,
        windowDays,
        records: Array.isArray(dashboardState.primaryRecords) ? dashboardState.primaryRecords : [],
        dailyStats: Array.isArray(dashboardState.primaryDaily) ? dashboardState.primaryDaily : [],
        calculations: settings?.calculations || {},
        calculationDefaults: DEFAULT_SETTINGS.calculations,
      };
      const jobToken = ++kpiWorkerJobToken;

      showKpiSkeleton();
      try {
        const result = await runKpiWorkerJob(workerPayload);
        if (jobToken !== kpiWorkerJobToken) {
          return;
        }
        const filteredRecords = Array.isArray(result?.records) ? result.records : [];
        const filteredDailyStats = Array.isArray(result?.dailyStats) ? result.dailyStats : [];
        const effectiveWindow = Number.isFinite(result?.windowDays) ? result.windowDays : windowDays;
        dashboardState.kpi.records = filteredRecords;
        dashboardState.kpi.daily = filteredDailyStats;
        renderKpis(filteredDailyStats);
        updateKpiSummary({
          records: filteredRecords,
          dailyStats: filteredDailyStats,
          windowDays: effectiveWindow,
        });
      } catch (error) {
        console.error('Nepavyko pritaikyti KPI filtrų worker\'yje:', error);
        if (jobToken !== kpiWorkerJobToken) {
          return;
        }
        const fallback = applyKpiFiltersLocally(normalizedFilters);
        dashboardState.kpi.records = fallback.records;
        dashboardState.kpi.daily = fallback.dailyStats;
        renderKpis(fallback.dailyStats);
        updateKpiSummary({
          records: fallback.records,
          dailyStats: fallback.dailyStats,
          windowDays: fallback.windowDays,
        });
      }
    }

    function handleKpiFilterInput(event) {
      const target = event.target;
      if (!target || !('name' in target)) {
        return;
      }
      const { name, value } = target;
      const filters = dashboardState.kpi.filters;
      if (name === 'window') {
        const numeric = Number.parseInt(value, 10);
        if (Number.isFinite(numeric) && numeric >= 0) {
          filters.window = numeric;
        }
      } else if (name === 'shift' && value in KPI_FILTER_LABELS.shift) {
        filters.shift = value;
      } else if (name === 'arrival' && value in KPI_FILTER_LABELS.arrival) {
        filters.arrival = value;
      } else if (name === 'disposition' && value in KPI_FILTER_LABELS.disposition) {
        filters.disposition = value;
      } else if (name === 'cardType' && value in KPI_FILTER_LABELS.cardType) {
        filters.cardType = value;
      }
      void applyKpiFiltersAndRender();
    }

    function handleChartFilterChange(event) {
      const target = event.target;
      if (!target || !('name' in target)) {
        return;
      }
      const { name, value } = target;
      const filters = { ...dashboardState.chartFilters };
      if (name === 'arrival' && value in KPI_FILTER_LABELS.arrival) {
        filters.arrival = value;
      } else if (name === 'disposition' && value in KPI_FILTER_LABELS.disposition) {
        filters.disposition = value;
      } else if (name === 'cardType' && value in KPI_FILTER_LABELS.cardType) {
        filters.cardType = value;
      }
      dashboardState.chartFilters = filters;
      void applyChartFilters();
    }

    function applyChartFilters() {
      const sanitized = sanitizeChartFilters(dashboardState.chartFilters);
      dashboardState.chartFilters = { ...sanitized };
      syncChartFilterControls();
      const hasBaseData = (Array.isArray(dashboardState.chartData.baseDaily) && dashboardState.chartData.baseDaily.length)
        || (Array.isArray(dashboardState.dailyStats) && dashboardState.dailyStats.length);
      if (!hasBaseData) {
        updateChartFiltersSummary({ records: [], daily: [] });
        if (selectors.dailyCaptionContext) {
          selectors.dailyCaptionContext.textContent = '';
        }
        return Promise.resolve();
      }
      const scoped = prepareChartDataForPeriod(dashboardState.chartPeriod);
      return renderCharts(scoped.daily, scoped.funnel, scoped.heatmap)
        .catch((error) => {
          console.error('Nepavyko pritaikyti grafiko filtrų:', error);
          showChartError(TEXT.charts?.errorLoading);
        });
    }

    function resetKpiFilters({ fromKeyboard } = {}) {
      dashboardState.kpi.filters = getDefaultKpiFilters();
      refreshKpiWindowOptions();
      syncKpiFilterControls();
      void applyKpiFiltersAndRender();
      if (fromKeyboard && selectors.kpiFiltersReset) {
        selectors.kpiFiltersReset.focus();
      }
    }

    function initializeKpiFilters() {
      if (!selectors.kpiFiltersForm) {
        return;
      }
      refreshKpiWindowOptions();
      syncKpiFilterControls();
      selectors.kpiFiltersForm.addEventListener('change', handleKpiFilterInput);
      selectors.kpiFiltersForm.addEventListener('submit', (event) => event.preventDefault());
      if (selectors.kpiFiltersReset) {
        selectors.kpiFiltersReset.addEventListener('click', (event) => {
          event.preventDefault();
          resetKpiFilters();
        });
      }
      if (selectors.kpiFiltersToggle && selectors.kpiControls) {
        const toggleButton = selectors.kpiFiltersToggle;
        const controlsWrapper = selectors.kpiControls;

        const setExpandedState = (expanded) => {
          const label = expanded ? KPI_FILTER_TOGGLE_LABELS.hide : KPI_FILTER_TOGGLE_LABELS.show;
          controlsWrapper.dataset.expanded = expanded ? 'true' : 'false';
          toggleButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          toggleButton.textContent = label;
          toggleButton.setAttribute('aria-label', label);
          toggleButton.setAttribute('title', label);
          controlsWrapper.hidden = !expanded;
          controlsWrapper.setAttribute('aria-hidden', expanded ? 'false' : 'true');
        };

        toggleButton.addEventListener('click', () => {
          const expanded = controlsWrapper.dataset.expanded !== 'false';
          const nextState = !expanded;
          setExpandedState(nextState);
          if (nextState && selectors.kpiFiltersForm) {
            const firstField = selectors.kpiFiltersForm.querySelector('select, button, [tabindex]');
            if (firstField && typeof firstField.focus === 'function') {
              window.requestAnimationFrame(() => {
                try {
                  firstField.focus({ preventScroll: true });
                } catch (error) {
                  firstField.focus();
                }
              });
            }
          }
          if (!nextState) {
            toggleButton.focus();
          }
        });

        setExpandedState(controlsWrapper.dataset.expanded !== 'false');
      }
      if ((dashboardState.kpi.records && dashboardState.kpi.records.length) || (dashboardState.kpi.daily && dashboardState.kpi.daily.length)) {
        updateKpiSummary({
          records: dashboardState.kpi.records,
          dailyStats: dashboardState.kpi.daily,
          windowDays: dashboardState.kpi.filters.window,
        });
      }
    }

    function formatKpiValue(value, format) {
      if (value == null || Number.isNaN(value)) {
        return '–';
      }
      if (format === 'decimal') {
        return decimalFormatter.format(value);
      }
      if (format === 'integer') {
        return numberFormatter.format(Math.round(value));
      }
      return oneDecimalFormatter.format(value);
    }

    /**
     * Escapes user-visible text fragments before injecting into HTML strings.
     * @param {unknown} value
     * @returns {string}
     */
    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }


    function buildLastShiftSummary(dailyStats) {
      const entries = Array.isArray(dailyStats) ? dailyStats.filter((entry) => entry && typeof entry.date === 'string') : [];
      if (!entries.length) {
        return null;
      }
      const decorated = entries
        .map((entry) => {
          const date = dateKeyToDate(entry.date);
          if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return null;
          }
          return { entry, date };
        })
        .filter(Boolean)
        .sort((a, b) => a.date - b.date);

      if (!decorated.length) {
        return null;
      }

      const last = decorated[decorated.length - 1];
      const lastEntry = last.entry;
      const lastDate = last.date;
      const weekdayIndex = lastDate.getDay();
      const weekdayLabel = capitalizeSentence(weekdayLongFormatter.format(lastDate));
      const sameWeekdayEntries = decorated.filter((item) => item.date.getDay() === weekdayIndex).map((item) => item.entry);

      const averageFor = (key) => {
        if (!sameWeekdayEntries.length) {
          return null;
        }
        const totals = sameWeekdayEntries.reduce((acc, item) => {
          const value = Number.isFinite(item?.[key]) ? item[key] : null;
          if (Number.isFinite(value)) {
            acc.sum += value;
            acc.count += 1;
          }
          return acc;
        }, { sum: 0, count: 0 });
        if (!totals.count) {
          return null;
        }
        return totals.sum / totals.count;
      };

      const valueFor = (key) => (Number.isFinite(lastEntry?.[key]) ? lastEntry[key] : null);

      const totalValue = valueFor('count');
      const totalAverage = averageFor('count');

      const shareOf = (value, total) => {
        if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
          return null;
        }
        return value / total;
      };

      return {
        dateLabel: capitalizeSentence(dailyDateFormatter.format(lastDate)),
        dateKey: lastEntry.date,
        weekdayLabel,
        metrics: {
          total: { value: totalValue, average: totalAverage },
          night: { value: valueFor('night'), average: averageFor('night') },
          hospitalized: {
            value: valueFor('hospitalized'),
            average: averageFor('hospitalized'),
            share: shareOf(valueFor('hospitalized'), totalValue),
            averageShare: shareOf(averageFor('hospitalized'), totalAverage),
          },
          discharged: {
            value: valueFor('discharged'),
            average: averageFor('discharged'),
            share: shareOf(valueFor('discharged'), totalValue),
            averageShare: shareOf(averageFor('discharged'), totalAverage),
          },
        },
      };
    }

    function renderKpiPeriodSummary(lastShiftSummary, periodMetrics) {
      const summaryEl = selectors.kpiSummary;
      if (!summaryEl) {
        return;
      }
      if (!lastShiftSummary) {
        summaryEl.innerHTML = `<p class="kpi-summary__empty">${TEXT.kpis.noYearData}</p>`;
        summaryEl.hidden = false;
        return;
      }

      const weekdayLabel = typeof lastShiftSummary.weekdayLabel === 'string'
        ? lastShiftSummary.weekdayLabel
        : '';
      const periodText = lastShiftSummary.dateLabel
        || TEXT.kpis.summary.periodFallback
        || TEXT.kpis.summary.unknownPeriod;
      const referenceText = weekdayLabel
        ? (typeof TEXT.kpis.summary.weekdayReference === 'function'
          ? TEXT.kpis.summary.weekdayReference(weekdayLabel)
          : `${TEXT.kpis.summary.reference} (${weekdayLabel})`)
        : (TEXT.kpis.summary.referenceFallback || TEXT.kpis.summary.reference);

      const summaryItems = [
        {
          label: TEXT.kpis.summary.period,
          value: escapeHtml(periodText),
        },
        {
          label: TEXT.kpis.summary.reference,
          value: escapeHtml(referenceText),
        },
      ];

      if (periodMetrics) {
        const monthLabel = typeof periodMetrics.monthLabel === 'string'
          ? periodMetrics.monthLabel
          : '';
        const hasMonthData = Number.isFinite(periodMetrics?.monthMetrics?.days)
          && periodMetrics.monthMetrics.days > 0;
        if (monthLabel || hasMonthData) {
          const monthContent = monthLabel
            ? escapeHtml(monthLabel)
            : `<span class="kpi-summary__muted">${escapeHtml(TEXT.kpis.summary.noMonth)}</span>`;
          summaryItems.push({
            label: TEXT.kpis.summary.month,
            value: monthContent,
          });
        }
      }

      const summaryRows = summaryItems.map((item) => `
          <div class="kpi-summary__item">
            <dt>${escapeHtml(item.label)}</dt>
            <dd>${item.value}</dd>
          </div>
        `).join('');

      summaryEl.innerHTML = `
        <p class="kpi-summary__title">${TEXT.kpis.summary.title}</p>
        <dl class="kpi-summary__list">
          ${summaryRows}
        </dl>
      `;
      summaryEl.hidden = false;
    }

    function showKpiSkeleton() {
      const grid = selectors.kpiGrid;
      if (!grid || grid.dataset.skeleton === 'true') {
        return;
      }
      const template = document.getElementById('kpiSkeleton');
      grid.setAttribute('aria-busy', 'true');
      grid.dataset.skeleton = 'true';
      if (template instanceof HTMLTemplateElement) {
        const skeletonFragment = template.content.cloneNode(true);
        grid.replaceChildren(skeletonFragment);
      } else {
        grid.replaceChildren();
      }
    }

    function hideKpiSkeleton() {
      const grid = selectors.kpiGrid;
      if (!grid) {
        return;
      }
      grid.removeAttribute('aria-busy');
      if (grid.dataset.skeleton === 'true') {
        grid.replaceChildren();
      }
      delete grid.dataset.skeleton;
    }

    function renderKpis(dailyStats) {
      hideKpiSkeleton();
      selectors.kpiGrid.replaceChildren();
      const windowDays = dashboardState.kpi?.filters?.window;
      const periodMetrics = buildYearMonthMetrics(dailyStats, windowDays);
      const lastShiftSummary = buildLastShiftSummary(dailyStats);
      renderKpiPeriodSummary(lastShiftSummary, periodMetrics);

      if (!lastShiftSummary) {
        const card = document.createElement('article');
        card.className = 'kpi-card';
        card.setAttribute('role', 'listitem');
        card.innerHTML = `
          <header class="kpi-card__header">
            <h3 class="kpi-card__title">Rodiklių nepakanka</h3>
          </header>
          <p class="kpi-mainline">
            <span class="kpi-mainline__value"><span class="kpi-empty">${TEXT.kpis.noYearData}</span></span>
          </p>
        `;
        selectors.kpiGrid.appendChild(card);
        return;
      }

      const cardsConfig = Array.isArray(TEXT.kpis.cards) ? TEXT.kpis.cards : [];
      if (!cardsConfig.length) {
        const card = document.createElement('article');
        card.className = 'kpi-card';
        card.setAttribute('role', 'listitem');
        card.innerHTML = `
          <header class="kpi-card__header">
            <h3 class="kpi-card__title">Rodiklių konfigūracija nerasta</h3>
          </header>
          <p class="kpi-mainline">
            <span class="kpi-mainline__value"><span class="kpi-empty">${TEXT.kpis.noYearData}</span></span>
          </p>
        `;
        selectors.kpiGrid.appendChild(card);
        return;
      }

      const weekdayLabel = typeof lastShiftSummary.weekdayLabel === 'string'
        ? lastShiftSummary.weekdayLabel
        : '';
      const referenceText = weekdayLabel
        ? (typeof TEXT.kpis.summary.weekdayReference === 'function'
          ? TEXT.kpis.summary.weekdayReference(weekdayLabel)
          : `${TEXT.kpis.summary.reference} (${weekdayLabel})`)
        : (TEXT.kpis.summary.referenceFallback || TEXT.kpis.summary.reference);

      const detailWrapper = (label, valueHtml, extraClass = '', ariaLabel) => {
        const aria = ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : '';
        const extra = extraClass ? ` ${extraClass}` : '';
        return `<div class="kpi-detail${extra}" role="listitem"${aria}><span class="kpi-detail__label">${escapeHtml(label)}</span><span class="kpi-detail__value">${valueHtml}</span></div>`;
      };

      cardsConfig.forEach((config) => {
        if (!config || typeof config !== 'object' || !config.metricKey) {
          return;
        }
        const metric = lastShiftSummary.metrics?.[config.metricKey] || {};
        const rawValue = Number.isFinite(metric.value) ? metric.value : null;
        const averageValue = Number.isFinite(metric.average) ? metric.average : null;
        const valueFormat = config.format || 'integer';

        const shareValue = Number.isFinite(metric.share) ? metric.share : null;
        const averageShareValue = Number.isFinite(metric.averageShare) ? metric.averageShare : null;

        const card = document.createElement('article');
        card.className = 'kpi-card';
        card.setAttribute('role', 'listitem');

        const titleText = config.label ? escapeHtml(config.label) : '';
        const mainLabel = typeof config.mainLabel === 'string'
          ? config.mainLabel
          : (typeof TEXT.kpis.mainValueLabel === 'string' ? TEXT.kpis.mainValueLabel : '');
        const mainLabelHtml = mainLabel
          ? `<span class="kpi-mainline__label">${escapeHtml(mainLabel)}</span>`
          : '';
        const shareBadge = shareValue != null
          ? `<span class="kpi-mainline__share">(${percentFormatter.format(shareValue)})</span>`
          : '';
        const mainValueHtml = Number.isFinite(rawValue)
          ? `<strong class="kpi-main-value">${formatKpiValue(rawValue, valueFormat)}</strong>${shareBadge}`
          : `<span class="kpi-empty">${TEXT.kpis.primaryNoData || TEXT.kpis.noYearData}</span>`;

        const details = [];
        const unitContext = config.unitLabel
          ? `<span class="kpi-detail__context">${escapeHtml(config.unitLabel)}</span>`
          : '';

        if (Number.isFinite(rawValue) && Number.isFinite(averageValue)) {
          const diff = rawValue - averageValue;
          let trend = 'neutral';
          let arrow = '→';
          if (diff > 0) {
            trend = 'up';
            arrow = '↑';
          } else if (diff < 0) {
            trend = 'down';
            arrow = '↓';
          }
          const sign = diff > 0 ? '+' : (diff < 0 ? '−' : '');
          const formattedDiff = formatKpiValue(Math.abs(diff), valueFormat);
          const deltaContext = typeof TEXT.kpis.deltaContext === 'function'
            ? TEXT.kpis.deltaContext(referenceText, weekdayLabel)
            : TEXT.kpis.deltaContext;
          const contextHtml = deltaContext
            ? `<span class="kpi-detail__context">${escapeHtml(deltaContext)}</span>`
            : '';
          const deltaAria = diff > 0
            ? `Skirtumas lyginant su ${referenceText}: padidėjo ${formattedDiff}${config.unitLabel ? ` ${config.unitLabel}` : ''}.`
            : diff < 0
              ? `Skirtumas lyginant su ${referenceText}: sumažėjo ${formattedDiff}${config.unitLabel ? ` ${config.unitLabel}` : ''}.`
              : `Skirtumo nėra lyginant su ${referenceText}.`;
          const deltaValueHtml = `
            <span class="kpi-detail__icon" aria-hidden="true">${arrow}</span>
            <strong>${sign}${formattedDiff}</strong>${unitContext}${contextHtml}
          `;
          details.push(detailWrapper(
            TEXT.kpis.detailLabels?.delta || 'Skirtumas',
            deltaValueHtml,
            `kpi-detail--delta-${trend}`,
            deltaAria,
          ));
        } else {
          details.push(detailWrapper(
            TEXT.kpis.detailLabels?.delta || 'Skirtumas',
            `<span class="kpi-empty">${TEXT.kpis.deltaNoData}</span>`,
            'kpi-detail--muted',
          ));
        }

        const averageLabel = typeof TEXT.kpis.detailLabels?.average === 'function'
          ? TEXT.kpis.detailLabels.average(weekdayLabel)
          : (TEXT.kpis.detailLabels?.average || 'Vidurkis');
        const averageContextRaw = typeof TEXT.kpis.detailLabels?.averageContext === 'function'
          ? TEXT.kpis.detailLabels.averageContext(weekdayLabel)
          : (TEXT.kpis.detailLabels?.averageContext || '');
        const averageContextHtml = averageContextRaw
          ? `<span class="kpi-detail__context">${escapeHtml(averageContextRaw)}</span>`
          : '';
        if (Number.isFinite(averageValue)) {
          const averageShareHtml = averageShareValue != null
            ? `<span class="kpi-detail__share">(${percentFormatter.format(averageShareValue)})</span>`
            : '';
          const averageValueHtml = `<strong>${formatKpiValue(averageValue, valueFormat)}</strong>${unitContext}${averageContextHtml}${averageShareHtml}`;
          details.push(detailWrapper(averageLabel, averageValueHtml));
        } else {
          details.push(detailWrapper(
            averageLabel,
            `<span class="kpi-empty">${TEXT.kpis.averageNoData}</span>`,
            'kpi-detail--muted',
          ));
        }

        card.innerHTML = `
          <header class="kpi-card__header">
            <h3 class="kpi-card__title">${titleText}</h3>
          </header>
          <p class="kpi-mainline">
            ${mainLabelHtml}
            <span class="kpi-mainline__value">${mainValueHtml}</span>
          </p>
          <div class="kpi-card__details" role="list">${details.join('')}</div>
        `;
        selectors.kpiGrid.appendChild(card);
      });

      const monthlySettings = TEXT.kpis.monthly || {};
      const monthlyCardsConfig = Array.isArray(monthlySettings.cards) ? monthlySettings.cards : [];
      const hasPeriodMetrics = periodMetrics && typeof periodMetrics === 'object';
      const monthMetrics = hasPeriodMetrics ? periodMetrics.monthMetrics : null;
      const yearMetrics = hasPeriodMetrics ? periodMetrics.yearMetrics : null;
      const monthHasData = Number.isFinite(monthMetrics?.days) && monthMetrics.days > 0;

      if (monthlyCardsConfig.length) {
        if (monthlySettings.title || monthlySettings.subtitle) {
          const sectionLabel = document.createElement('p');
          sectionLabel.className = 'kpi-grid__section-label';
          sectionLabel.setAttribute('role', 'presentation');
          sectionLabel.setAttribute('aria-hidden', 'true');
          sectionLabel.textContent = monthlySettings.title || 'Šio mėnesio vidurkiai';
          if (monthlySettings.subtitle) {
            const subtitleEl = document.createElement('span');
            subtitleEl.textContent = monthlySettings.subtitle;
            sectionLabel.appendChild(subtitleEl);
          }
          selectors.kpiGrid.appendChild(sectionLabel);
        }

        if (!monthHasData || !monthMetrics) {
          const emptyCard = document.createElement('article');
          emptyCard.className = 'kpi-card kpi-card--monthly';
          emptyCard.setAttribute('role', 'listitem');
          const emptyTitle = monthlySettings.emptyTitle || monthlySettings.title || TEXT.kpis.monthPrefix || 'Šio mėnesio vidurkiai';
          const emptyMessage = monthlySettings.empty || TEXT.kpis.monthNoData;
          emptyCard.innerHTML = `
            <header class="kpi-card__header">
              <h3 class="kpi-card__title">${escapeHtml(emptyTitle)}</h3>
            </header>
            <p class="kpi-mainline">
              <span class="kpi-mainline__value"><span class="kpi-empty">${escapeHtml(emptyMessage || '')}</span></span>
            </p>
          `;
          selectors.kpiGrid.appendChild(emptyCard);
          return;
        }

        const monthLabel = typeof periodMetrics?.monthLabel === 'string' ? periodMetrics.monthLabel : '';
        const monthPrefixShort = TEXT.kpis.monthPrefixShort || TEXT.kpis.monthPrefix || '';
        const monthMetaText = monthLabel
          ? `${monthPrefixShort ? `${monthPrefixShort}: ` : ''}${monthLabel}`
          : '';
        const resolvedReferenceLabel = typeof monthlySettings.referenceLabel === 'function'
          ? monthlySettings.referenceLabel(periodMetrics?.referenceLabel, periodMetrics?.yearLabel)
          : (monthlySettings.referenceLabel
            || periodMetrics?.referenceLabel
            || TEXT.kpis.summary.referenceFallback
            || TEXT.kpis.summary.reference
            || 'Metinis vidurkis');
        const accessibleReference = resolvedReferenceLabel
          || TEXT.kpis.summary.referenceFallback
          || TEXT.kpis.summary.reference
          || 'Metinis vidurkis';

        monthlyCardsConfig.forEach((config) => {
          if (!config || typeof config !== 'object' || !config.metricKey) {
            return;
          }
          const valueFormat = config.format || 'oneDecimal';
          const monthValueRaw = monthMetrics?.[config.metricKey];
          const monthValue = Number.isFinite(monthValueRaw) ? monthValueRaw : null;
          const compareKey = config.compareKey || config.metricKey;
          const yearValueRaw = yearMetrics?.[compareKey];
          const yearValue = Number.isFinite(yearValueRaw) ? yearValueRaw : null;
          const shareKey = typeof config.shareKey === 'string' ? config.shareKey : null;
          const monthShareValue = shareKey && Number.isFinite(monthMetrics?.[shareKey])
            ? monthMetrics[shareKey]
            : null;
          const yearShareValue = shareKey && Number.isFinite(yearMetrics?.[shareKey])
            ? yearMetrics[shareKey]
            : null;
          const card = document.createElement('article');
          card.className = 'kpi-card kpi-card--monthly';
          card.setAttribute('role', 'listitem');

          const titleText = config.label ? escapeHtml(config.label) : '';
          const metaHtml = monthMetaText
            ? `<span class="kpi-card__meta">${escapeHtml(monthMetaText)}</span>`
            : '';
          const mainLabel = typeof config.mainLabel === 'string'
            ? config.mainLabel
            : (typeof monthlySettings.mainLabel === 'string' ? monthlySettings.mainLabel : '');
          const mainLabelHtml = mainLabel
            ? `<span class="kpi-mainline__label">${escapeHtml(mainLabel)}</span>`
            : '';
          const unitLabel = config.unitLabel ? String(config.unitLabel) : '';
          const mainUnitHtml = unitLabel
            ? `<span class="kpi-unit">${escapeHtml(unitLabel)}</span>`
            : '';
          const noDataText = monthlySettings.primaryNoData
            || TEXT.kpis.primaryNoData
            || TEXT.kpis.monthNoDataShort
            || TEXT.kpis.monthNoData
            || 'Nėra duomenų';
          const mainShareHtml = monthShareValue != null
            ? `<span class="kpi-mainline__share">(${percentFormatter.format(monthShareValue)})</span>`
            : '';
          const mainValueHtml = Number.isFinite(monthValue)
            ? `<strong class="kpi-main-value">${formatKpiValue(monthValue, valueFormat)}</strong>${mainUnitHtml}${mainShareHtml}`
            : `<span class="kpi-empty">${escapeHtml(noDataText)}</span>`;

          const details = [];
          const unitContext = unitLabel
            ? `<span class="kpi-detail__context">${escapeHtml(unitLabel)}</span>`
            : '';

          if (Number.isFinite(monthValue) && Number.isFinite(yearValue)) {
            const diff = monthValue - yearValue;
            let trend = 'neutral';
            let arrow = '→';
            if (diff > 0) {
              trend = 'up';
              arrow = '↑';
            } else if (diff < 0) {
              trend = 'down';
              arrow = '↓';
            }
            const sign = diff > 0 ? '+' : (diff < 0 ? '−' : '');
            const formattedDiff = formatKpiValue(Math.abs(diff), valueFormat);
            const deltaContextRaw = typeof config.deltaContext === 'function'
              ? config.deltaContext(resolvedReferenceLabel, periodMetrics?.yearLabel)
              : (config.deltaContext
                ?? (typeof monthlySettings.deltaContext === 'function'
                  ? monthlySettings.deltaContext(resolvedReferenceLabel, periodMetrics?.yearLabel)
                  : monthlySettings.deltaContext));
            const deltaContextHtml = deltaContextRaw
              ? `<span class="kpi-detail__context">${escapeHtml(deltaContextRaw)}</span>`
              : '';
            const deltaAriaReference = accessibleReference || 'metiniu vidurkiu';
            const deltaAria = diff > 0
              ? `Skirtumas lyginant su ${deltaAriaReference}: padidėjo ${formattedDiff}${unitLabel ? ` ${unitLabel}` : ''}.`
              : diff < 0
                ? `Skirtumas lyginant su ${deltaAriaReference}: sumažėjo ${formattedDiff}${unitLabel ? ` ${unitLabel}` : ''}.`
                : `Skirtumo nėra lyginant su ${deltaAriaReference}.`;
            const deltaLabel = typeof config.deltaLabel === 'string'
              ? config.deltaLabel
              : (monthlySettings.deltaLabel || TEXT.kpis.detailLabels?.delta || 'Skirtumas');
            const deltaValueHtml = `
              <span class="kpi-detail__icon" aria-hidden="true">${arrow}</span>
              <strong>${sign}${formattedDiff}</strong>${unitContext}${deltaContextHtml}
            `;
            details.push(detailWrapper(
              deltaLabel,
              deltaValueHtml,
              `kpi-detail--delta-${trend}`,
              deltaAria,
            ));
          } else {
            const deltaLabel = typeof config.deltaLabel === 'string'
              ? config.deltaLabel
              : (monthlySettings.deltaLabel || TEXT.kpis.detailLabels?.delta || 'Skirtumas');
            details.push(detailWrapper(
              deltaLabel,
              `<span class="kpi-empty">${TEXT.kpis.deltaNoData}</span>`,
              'kpi-detail--muted',
            ));
          }

          const averageLabel = typeof config.averageLabel === 'string'
            ? config.averageLabel
            : (typeof monthlySettings.averageLabel === 'function'
              ? monthlySettings.averageLabel(resolvedReferenceLabel, periodMetrics?.yearLabel)
              : (monthlySettings.averageLabel || TEXT.kpis.detailLabels?.average || 'Vidurkis'));
          const averageContextRaw = typeof config.averageContext === 'function'
            ? config.averageContext(resolvedReferenceLabel, periodMetrics?.yearLabel)
            : (config.averageContext ?? (typeof monthlySettings.averageContext === 'function'
              ? monthlySettings.averageContext(resolvedReferenceLabel, periodMetrics?.yearLabel)
              : monthlySettings.averageContext));
          const averageContextHtml = averageContextRaw
            ? `<span class="kpi-detail__context">${escapeHtml(averageContextRaw)}</span>`
            : '';

          if (Number.isFinite(yearValue)) {
            const averageShareHtml = yearShareValue != null
              ? `<span class="kpi-detail__share">(${percentFormatter.format(yearShareValue)})</span>`
              : '';
            const averageValueHtml = `<strong>${formatKpiValue(yearValue, valueFormat)}</strong>${unitContext}${averageContextHtml}${averageShareHtml}`;
            details.push(detailWrapper(averageLabel, averageValueHtml));
          } else {
            details.push(detailWrapper(
              averageLabel,
              `<span class="kpi-empty">${TEXT.kpis.averageNoData}</span>`,
              'kpi-detail--muted',
            ));
          }

          card.innerHTML = `
            <header class="kpi-card__header">
              <h3 class="kpi-card__title">${titleText}</h3>
              ${metaHtml}
            </header>
            <p class="kpi-mainline">
              ${mainLabelHtml}
              <span class="kpi-mainline__value">${mainValueHtml}</span>
            </p>
            <div class="kpi-card__details" role="list">${details.join('')}</div>
          `;
          selectors.kpiGrid.appendChild(card);
        });
      }
    }
    function getThemeStyleTarget() {
      return document.body || document.documentElement;
    }

    function getThemePalette() {
      const styleTarget = getThemeStyleTarget();
      const rootStyles = getComputedStyle(styleTarget);
      return {
        accent: rootStyles.getPropertyValue('--color-accent').trim() || '#2563eb',
        accentSoft: rootStyles.getPropertyValue('--color-accent-soft').trim() || 'rgba(37, 99, 235, 0.18)',
        weekendAccent: rootStyles.getPropertyValue('--color-weekend').trim() || '#f97316',
        weekendAccentSoft: rootStyles.getPropertyValue('--color-weekend-soft').trim() || 'rgba(249, 115, 22, 0.2)',
        success: rootStyles.getPropertyValue('--color-success').trim() || '#16a34a',
        textColor: rootStyles.getPropertyValue('--color-text').trim() || '#0f172a',
        textMuted: rootStyles.getPropertyValue('--color-text-muted').trim() || '#475569',
        gridColor: rootStyles.getPropertyValue('--chart-grid').trim() || 'rgba(15, 23, 42, 0.12)',
      };
    }

    function syncChartPeriodButtons(period) {
      if (!selectors.chartPeriodButtons || !selectors.chartPeriodButtons.length) {
        return;
      }
      selectors.chartPeriodButtons.forEach((button) => {
        const buttonPeriod = Number.parseInt(button.dataset.chartPeriod, 10);
        const isActive = Number.isFinite(buttonPeriod) && buttonPeriod === period;
        button.setAttribute('aria-pressed', String(isActive));
      });
    }

    function getActiveFeedbackTrendWindow() {
      const raw = dashboardState.feedback?.trendWindow;
      if (Number.isFinite(raw) && raw > 0) {
        return Math.max(1, Math.round(raw));
      }
      return null;
    }

    function updateFeedbackTrendSubtitle() {
      if (!selectors.feedbackTrendSubtitle) {
        return;
      }
      const builder = TEXT.feedback?.trend?.subtitle;
      const activeWindow = getActiveFeedbackTrendWindow();
      if (typeof builder === 'function') {
        selectors.feedbackTrendSubtitle.textContent = builder(activeWindow);
      } else if (typeof builder === 'string') {
        selectors.feedbackTrendSubtitle.textContent = builder;
      } else if (Number.isFinite(activeWindow) && activeWindow > 0) {
        selectors.feedbackTrendSubtitle.textContent = `Paskutinių ${activeWindow} mėnesių dinamika`;
      } else {
        selectors.feedbackTrendSubtitle.textContent = 'Visų prieinamų mėnesių dinamika';
      }
    }

    function syncFeedbackTrendControls() {
      if (!selectors.feedbackTrendButtons || !selectors.feedbackTrendButtons.length) {
        return;
      }
      const activeWindow = getActiveFeedbackTrendWindow();
      selectors.feedbackTrendButtons.forEach((button) => {
        const months = Number.parseInt(button.dataset.trendMonths || '', 10);
        const isActive = Number.isFinite(months) ? months === activeWindow : activeWindow == null;
        button.setAttribute('aria-pressed', String(Boolean(isActive)));
        button.dataset.active = String(Boolean(isActive));
      });
    }

    function formatDailyCaption(period) {
      const base = TEXT.charts.dailyCaption || 'Kasdieniai pacientų srautai';
      if (!Number.isFinite(period) || period <= 0) {
        return base;
      }
      const normalized = Math.max(1, Math.round(period));
      const formattedDays = numberFormatter.format(normalized);
      const suffix = normalized === 1 ? 'paskutinė 1 diena' : `paskutinės ${formattedDays} dienos`;
      const selectedYear = Number.isFinite(dashboardState.chartYear) ? Number(dashboardState.chartYear) : null;
      const yearFragment = Number.isFinite(selectedYear) ? `, ${selectedYear} m.` : '';
      const combinedSuffix = `${suffix}${yearFragment}`;
      if (base.includes('(')) {
        return base.replace(/\(.*?\)/, `(${combinedSuffix})`);
      }
      return `${base} (${combinedSuffix})`;
    }

    function renderDailyChart(dailyStats, period, ChartLib, palette) {
      const Chart = ChartLib;
      const themePalette = palette || getThemePalette();
      const normalizedPeriod = Number.isFinite(Number(period)) && Number(period) > 0 ? Number(period) : 30;
      dashboardState.chartPeriod = normalizedPeriod;
      syncChartPeriodButtons(normalizedPeriod);
      if (selectors.dailyCaption) {
        selectors.dailyCaption.textContent = formatDailyCaption(normalizedPeriod);
      }
      const scopedData = Array.isArray(dailyStats) ? dailyStats.slice(-normalizedPeriod) : [];
      if (selectors.dailyCaptionContext) {
        const lastEntry = scopedData.length ? scopedData[scopedData.length - 1] : null;
        const dateValue = lastEntry?.date ? dateKeyToDate(lastEntry.date) : null;
        const formatted = dateValue ? shortDateFormatter.format(dateValue) : lastEntry?.date || '';
        selectors.dailyCaptionContext.textContent = TEXT.charts.dailyContext(formatted);
      }

      const canvas = document.getElementById('dailyChart');
      if (!canvas || !canvas.getContext) {
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }

      if (!Chart) {
        return;
      }

      const styleTarget = getThemeStyleTarget();
      Chart.defaults.color = themePalette.textColor;
      Chart.defaults.font.family = getComputedStyle(styleTarget).fontFamily;
      Chart.defaults.borderColor = themePalette.gridColor;

      if (dashboardState.charts.daily) {
        dashboardState.charts.daily.destroy();
      }

      if (!scopedData.length) {
        dashboardState.charts.daily = null;
        return;
      }

      const weekendFlags = scopedData.map((entry) => isWeekendDateKey(entry.date));
      // Užtikrina, kad X ašies etiketės nepersidengtų – rodome iki 8 reikšmių.
      const tickEvery = Math.max(1, Math.ceil(scopedData.length / 8));
      dashboardState.charts.daily = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: scopedData.map((entry) => entry.date),
          datasets: [
            {
              label: 'Pacientai',
              data: scopedData.map((entry) => entry.count),
              backgroundColor: weekendFlags.map((isWeekend) => (isWeekend ? themePalette.weekendAccent : themePalette.accent)),
              borderRadius: 12,
            },
            {
              label: 'Naktiniai pacientai',
              data: scopedData.map((entry) => entry.night),
              backgroundColor: weekendFlags.map((isWeekend) => (isWeekend ? themePalette.weekendAccentSoft : themePalette.accentSoft)),
              borderRadius: 12,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: {
                color: themePalette.textColor,
              },
            },
            tooltip: {
              callbacks: {
                label(context) {
                  return `${context.dataset.label}: ${numberFormatter.format(context.parsed.y)}`;
                },
              },
            },
          },
          scales: {
            x: {
              ticks: {
                autoSkip: false,
                maxRotation: 0,
                minRotation: 0,
                padding: 10,
                color: (ctxTick) => (weekendFlags[ctxTick.index] ? themePalette.weekendAccent : themePalette.textColor),
                callback(value, index) {
                  if (index % tickEvery !== 0) {
                    return '';
                  }
                  const rawLabel = this.getLabelForValue(value);
                  if (!rawLabel) {
                    return '';
                  }
                  const dateObj = dateKeyToDate(rawLabel);
                  if (dateObj instanceof Date && !Number.isNaN(dateObj.getTime())) {
                    return monthDayFormatter.format(dateObj);
                  }
                  return rawLabel.slice(5);
                },
              },
              grid: {
                color: themePalette.gridColor,
                drawBorder: false,
              },
            },
            y: {
              beginAtZero: true,
              ticks: {
                padding: 6,
                color: themePalette.textColor,
                callback(value) {
                  return numberFormatter.format(value);
                },
              },
              grid: {
                color: themePalette.gridColor,
                drawBorder: false,
              },
            },
          },
        },
      });
    }

    function formatFeedbackCardValue(value, format) {
      let numericValue = null;
      if (Number.isFinite(value)) {
        numericValue = value;
      } else if (typeof value === 'string') {
        const parsed = Number.parseFloat(value.replace(',', '.'));
        if (Number.isFinite(parsed)) {
          numericValue = parsed;
        }
      }

      if (numericValue == null) {
        return null;
      }

      switch (format) {
        case 'decimal':
          return decimalFormatter.format(numericValue);
        case 'integer':
          return numberFormatter.format(Math.round(numericValue));
        case 'percent':
          return percentFormatter.format(numericValue);
        default:
          return decimalFormatter.format(numericValue);
      }
    }

    function renderFeedbackCards(summary) {
      if (!selectors.feedbackCards) {
        return;
      }

      const cardsConfig = Array.isArray(TEXT.feedback?.cards)
        ? TEXT.feedback.cards
        : [];

      selectors.feedbackCards.replaceChildren();

      if (!cardsConfig.length) {
        const empty = document.createElement('p');
        empty.className = 'feedback-empty';
        empty.textContent = TEXT.feedback?.empty || 'Kol kas nėra apibendrintų atsiliepimų.';
        selectors.feedbackCards.appendChild(empty);
        return;
      }

      const summaryData = summary && typeof summary === 'object' ? summary : {};
      const hasValues = cardsConfig.some((card) => {
        if (!card || typeof card !== 'object') {
          return false;
        }
        const raw = summaryData[card.key];
        const formatted = formatFeedbackCardValue(raw, card.format);
        if (formatted != null) {
          return true;
        }
        if (Number.isFinite(raw)) {
          return true;
        }
        return false;
      });

      if (!hasValues) {
        const empty = document.createElement('p');
        empty.className = 'feedback-empty';
        empty.textContent = TEXT.feedback?.empty || 'Kol kas nėra apibendrintų atsiliepimų.';
        selectors.feedbackCards.appendChild(empty);
        return;
      }

      const responsesLabel = TEXT.feedback?.table?.headers?.responses || 'Atsakymai';

      cardsConfig.forEach((card) => {
        if (!card || typeof card !== 'object') {
          return;
        }

        const cardElement = document.createElement('article');
        cardElement.className = 'feedback-card';
        cardElement.setAttribute('role', 'listitem');

        const title = document.createElement('p');
        title.className = 'feedback-card__title';
        title.textContent = card.title || '';

        const valueElement = document.createElement('p');
        valueElement.className = 'feedback-card__value';
        const rawValue = summaryData[card.key];
        const formattedValue = formatFeedbackCardValue(rawValue, card.format);
        const fallbackText = card.empty || TEXT.feedback?.empty || '—';
        valueElement.textContent = formattedValue != null ? formattedValue : fallbackText;

        const metaElement = document.createElement('p');
        metaElement.className = 'feedback-card__meta';
        const metaParts = [];
        if (card.description) {
          metaParts.push(card.description);
        }
        if (card.countKey) {
          const rawCount = summaryData[card.countKey];
          let numericCount = null;
          if (Number.isFinite(rawCount)) {
            numericCount = rawCount;
          } else if (typeof rawCount === 'string') {
            const parsedCount = Number.parseFloat(rawCount.replace(',', '.'));
            if (Number.isFinite(parsedCount)) {
              numericCount = parsedCount;
            }
          }
          if (Number.isFinite(numericCount)) {
            metaParts.push(`${responsesLabel}: ${numberFormatter.format(Math.round(numericCount))}`);
          }
        }
        const nodes = [title, valueElement];
        if (metaParts.length) {
          metaElement.textContent = metaParts.join(' • ');
          nodes.push(metaElement);
        }
        nodes.forEach((node) => {
          cardElement.appendChild(node);
        });
        selectors.feedbackCards.appendChild(cardElement);
      });
    }

    function renderFeedbackTable(monthlyStats) {
      if (!selectors.feedbackTable) {
        return;
      }

      selectors.feedbackTable.replaceChildren();

      const placeholder = TEXT.feedback?.table?.placeholder || '—';

      if (!Array.isArray(monthlyStats) || !monthlyStats.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 8;
        cell.textContent = TEXT.feedback?.table?.empty || TEXT.feedback?.empty || 'Kol kas nėra apibendrintų atsiliepimų.';
        row.appendChild(cell);
        selectors.feedbackTable.appendChild(row);
        return;
      }

      const formatRating = (value) => {
        if (Number.isFinite(value)) {
          return decimalFormatter.format(value);
        }
        return placeholder;
      };

      monthlyStats
        .slice()
        .sort((a, b) => b.month.localeCompare(a.month))
        .forEach((entry) => {
          const row = document.createElement('tr');
          const monthLabel = formatMonthLabel(entry?.month || '');
          const displayMonth = monthLabel || entry?.month || placeholder;
          const responsesValue = Number.isFinite(entry?.responses) ? entry.responses : null;
          const contactResponses = Number.isFinite(entry?.contactResponses) ? entry.contactResponses : null;
          const contactShare = Number.isFinite(entry?.contactShare) ? entry.contactShare : null;
          let contactText = placeholder;
          if (contactResponses != null && contactShare != null) {
            contactText = `${numberFormatter.format(Math.round(contactResponses))} (${percentFormatter.format(contactShare)})`;
          } else if (contactResponses != null) {
            contactText = numberFormatter.format(Math.round(contactResponses));
          } else if (contactShare != null) {
            contactText = percentFormatter.format(contactShare);
          }

          row.innerHTML = `
            <td>${displayMonth}</td>
            <td>${responsesValue != null ? numberFormatter.format(Math.round(responsesValue)) : placeholder}</td>
            <td>${formatRating(entry.overallAverage)}</td>
            <td>${formatRating(entry.doctorsAverage)}</td>
            <td>${formatRating(entry.nursesAverage)}</td>
            <td>${formatRating(entry.aidesAverage)}</td>
            <td>${formatRating(entry.waitingAverage)}</td>
            <td>${contactText}</td>
          `;

          selectors.feedbackTable.appendChild(row);
        });
    }

    function renderFeedbackSection(feedbackStats) {
      const summary = feedbackStats && typeof feedbackStats.summary === 'object'
        ? feedbackStats.summary
        : null;
      const monthly = Array.isArray(feedbackStats?.monthly)
        ? feedbackStats.monthly
        : [];

      renderFeedbackCards(summary);
      renderFeedbackTable(monthly);

      renderFeedbackTrendChart(monthly).catch((error) => {
        console.error('Nepavyko atvaizduoti atsiliepimų trendo:', error);
      });
    }

    async function renderFeedbackTrendChart(monthlyStats) {
      const canvas = selectors.feedbackTrendChart || document.getElementById('feedbackTrendChart');
      const messageElement = selectors.feedbackTrendMessage || document.getElementById('feedbackTrendMessage');
      const summaryElement = selectors.feedbackTrendSummary || document.getElementById('feedbackTrendSummary');

      const updateSummary = (text) => {
        if (!summaryElement) {
          return;
        }
        if (text) {
          summaryElement.textContent = text;
          summaryElement.hidden = false;
        } else {
          summaryElement.textContent = '';
          summaryElement.hidden = true;
        }
      };

      const setTrendMessage = (text) => {
        if (messageElement) {
          if (text) {
            messageElement.textContent = text;
            messageElement.hidden = false;
          } else {
            messageElement.textContent = '';
            messageElement.hidden = true;
          }
        }
        if (canvas) {
          if (text) {
            canvas.setAttribute('aria-hidden', 'true');
            canvas.hidden = true;
          } else {
            canvas.removeAttribute('aria-hidden');
            canvas.hidden = false;
          }
        }
        if (text) {
          updateSummary('');
        }
      };

      syncFeedbackTrendControls();
      updateFeedbackTrendSubtitle();

      if (!canvas || typeof canvas.getContext !== 'function') {
        const fallbackText = TEXT.feedback?.trend?.unavailable
          || 'Nepavyko atvaizduoti trendo grafiko. Patikrinkite ryšį ir bandykite dar kartą.';
        setTrendMessage(fallbackText);
        return;
      }

      const monthlyArray = Array.isArray(monthlyStats)
        ? monthlyStats.filter((entry) => entry && typeof entry === 'object')
        : [];

      const normalized = monthlyArray
        .map((entry) => {
          const rawMonth = typeof entry.month === 'string' ? entry.month.trim() : '';
          if (!rawMonth) {
            return null;
          }
          const monthLabel = formatMonthLabel(rawMonth) || rawMonth;

          const rawAverage = entry?.overallAverage;
          let overallAverage = null;
          if (Number.isFinite(rawAverage)) {
            overallAverage = Number(rawAverage);
          } else if (typeof rawAverage === 'string') {
            const parsed = Number.parseFloat(rawAverage.replace(',', '.'));
            overallAverage = Number.isFinite(parsed) ? parsed : null;
          } else if (rawAverage != null) {
            const coerced = Number(rawAverage);
            overallAverage = Number.isFinite(coerced) ? coerced : null;
          }

          if (!Number.isFinite(overallAverage)) {
            return null;
          }

          let responses = null;
          const rawResponses = entry?.responses;
          if (Number.isFinite(rawResponses)) {
            responses = Number(rawResponses);
          } else if (typeof rawResponses === 'string') {
            const parsedResponses = Number.parseFloat(rawResponses.replace(',', '.'));
            responses = Number.isFinite(parsedResponses) ? parsedResponses : null;
          } else if (rawResponses != null) {
            const coercedResponses = Number(rawResponses);
            responses = Number.isFinite(coercedResponses) ? coercedResponses : null;
          }

          return {
            month: rawMonth,
            label: monthLabel,
            overallAverage,
            responses,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.month.localeCompare(b.month));

      if (!normalized.length) {
        if (dashboardState.charts.feedbackTrend && typeof dashboardState.charts.feedbackTrend.destroy === 'function') {
          dashboardState.charts.feedbackTrend.destroy();
        }
        dashboardState.charts.feedbackTrend = null;
        const emptyText = TEXT.feedback?.trend?.empty
          || 'Trendo grafikas bus parodytas, kai atsiras bent vienas mėnuo su bendru įvertinimu.';
        setTrendMessage(emptyText);
        return;
      }

      const scoped = (() => {
        const activeWindow = getActiveFeedbackTrendWindow();
        if (Number.isFinite(activeWindow) && activeWindow > 0) {
          const subset = normalized.slice(-Math.max(1, Math.round(activeWindow)));
          return subset.length ? subset : normalized.slice();
        }
        return normalized.slice();
      })();

      const Chart = dashboardState.chartLib ?? await loadChartJs();
      if (!Chart) {
        const unavailableText = TEXT.feedback?.trend?.unavailable
          || 'Nepavyko atvaizduoti trendo grafiko. Patikrinkite ryšį ir bandykite dar kartą.';
        if (dashboardState.charts.feedbackTrend && typeof dashboardState.charts.feedbackTrend.destroy === 'function') {
          dashboardState.charts.feedbackTrend.destroy();
        }
        dashboardState.charts.feedbackTrend = null;
        setTrendMessage(unavailableText);
        return;
      }
      if (!dashboardState.chartLib) {
        dashboardState.chartLib = Chart;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        const unavailableText = TEXT.feedback?.trend?.unavailable
          || 'Nepavyko atvaizduoti trendo grafiko. Patikrinkite ryšį ir bandykite dar kartą.';
        if (dashboardState.charts.feedbackTrend && typeof dashboardState.charts.feedbackTrend.destroy === 'function') {
          dashboardState.charts.feedbackTrend.destroy();
        }
        dashboardState.charts.feedbackTrend = null;
        setTrendMessage(unavailableText);
        return;
      }

      if (dashboardState.charts.feedbackTrend && typeof dashboardState.charts.feedbackTrend.destroy === 'function') {
        dashboardState.charts.feedbackTrend.destroy();
      }

      const palette = getThemePalette();
      const styleTarget = getThemeStyleTarget();
      Chart.defaults.color = palette.textColor;
      Chart.defaults.font.family = getComputedStyle(styleTarget).fontFamily;
      Chart.defaults.borderColor = palette.gridColor;

      const labels = scoped.map((entry) => entry.label);
      const ratingValues = scoped.map((entry) => entry.overallAverage);
      const numericRatings = ratingValues.filter((value) => Number.isFinite(value));
      if (!numericRatings.length) {
        updateSummary('');
        const emptyText = TEXT.feedback?.trend?.empty
          || 'Trendo grafikas bus parodytas, kai atsiras bent vienas mėnuo su bendru įvertinimu.';
        setTrendMessage(emptyText);
        return;
      }

      const responsesValues = scoped.map((entry) => (Number.isFinite(entry.responses) ? entry.responses : null));
      const numericResponses = responsesValues.filter((value) => Number.isFinite(value));
      const hasResponses = numericResponses.length > 0;
      const responsesLabel = TEXT.feedback?.trend?.responsesLabel || 'Atsakymų skaičius';
      const datasetLabel = TEXT.feedback?.table?.headers?.overall || 'Bendra patirtis (vid. 1–5)';
      const referenceLabel = TEXT.feedback?.trend?.averageLabel || 'Vidutinis įvertinimas';
      const chartTitle = TEXT.feedback?.trend?.title || 'Bendro vertinimo dinamika';

      let bestIndex = null;
      let worstIndex = null;
      ratingValues.forEach((value, index) => {
        if (!Number.isFinite(value)) {
          return;
        }
        if (bestIndex == null || value > ratingValues[bestIndex]) {
          bestIndex = index;
        }
        if (worstIndex == null || value < ratingValues[worstIndex]) {
          worstIndex = index;
        }
      });

      const averageValue = numericRatings.reduce((sum, value) => sum + value, 0) / numericRatings.length;
      const responsesMin = hasResponses ? Math.min(...numericResponses) : null;
      const responsesMax = hasResponses ? Math.max(...numericResponses) : null;

      const summaryInfo = {
        average: {
          raw: averageValue,
          formatted: oneDecimalFormatter.format(averageValue),
        },
        best: bestIndex != null
          ? {
              raw: ratingValues[bestIndex],
              formatted: oneDecimalFormatter.format(ratingValues[bestIndex]),
              label: labels[bestIndex] || '',
            }
          : null,
        worst: worstIndex != null
          ? {
              raw: ratingValues[worstIndex],
              formatted: oneDecimalFormatter.format(ratingValues[worstIndex]),
              label: labels[worstIndex] || '',
            }
          : null,
        responses: hasResponses
          ? {
              min: responsesMin,
              max: responsesMax,
              minFormatted: numberFormatter.format(Math.round(responsesMin)),
              maxFormatted: numberFormatter.format(Math.round(responsesMax)),
              label: responsesLabel,
            }
          : null,
      };

      const summaryBuilder = TEXT.feedback?.trend?.summary;
      const summaryText = typeof summaryBuilder === 'function'
        ? summaryBuilder(summaryInfo)
        : (() => {
            const parts = [`Vidurkis ${summaryInfo.average.formatted}`];
            if (summaryInfo.best?.label && summaryInfo.best?.formatted) {
              parts.push(`Geriausias ${summaryInfo.best.label} (${summaryInfo.best.formatted})`);
            }
            if (summaryInfo.worst?.label && summaryInfo.worst?.formatted) {
              parts.push(`Silpniausias ${summaryInfo.worst.label} (${summaryInfo.worst.formatted})`);
            }
            if (summaryInfo.responses?.minFormatted && summaryInfo.responses?.maxFormatted) {
              if (summaryInfo.responses.minFormatted === summaryInfo.responses.maxFormatted) {
                parts.push(`${responsesLabel}: ${summaryInfo.responses.minFormatted}`);
              } else {
                parts.push(`${responsesLabel}: ${summaryInfo.responses.minFormatted}–${summaryInfo.responses.maxFormatted}`);
              }
            }
            return parts.join(' • ');
          })();

      updateSummary(summaryText);
      setTrendMessage('');

      const ariaBuilder = TEXT.feedback?.trend?.aria;
      const firstLabel = labels[0] || '';
      const lastLabel = labels[labels.length - 1] || '';
      if (typeof ariaBuilder === 'function') {
        canvas.setAttribute('aria-label', ariaBuilder(chartTitle, firstLabel, lastLabel));
      } else {
        canvas.setAttribute('aria-label', `${chartTitle}: ${firstLabel}${lastLabel && firstLabel !== lastLabel ? ` – ${lastLabel}` : ''}`);
      }

      const ratingMin = Math.min(...numericRatings);
      const ratingMax = Math.max(...numericRatings);
      const ratingRange = ratingMax - ratingMin;
      const padding = numericRatings.length > 1 ? Math.max(0.2, ratingRange * 0.25) : 0.2;
      const yMin = Math.max(1, Math.floor((ratingMin - padding) * 10) / 10);
      const yMax = Math.min(5, Math.ceil((ratingMax + padding) * 10) / 10);

      const pointColors = ratingValues.map((_, index) => {
        if (index === bestIndex && palette.success) {
          return palette.success;
        }
        if (index === worstIndex) {
          return palette.weekendAccent;
        }
        return palette.accent;
      });
      const pointRadii = ratingValues.map((_, index) => (index === bestIndex || index === worstIndex ? 6 : 4));
      const pointHoverRadii = pointRadii.map((radius) => radius + 2);

      const datasets = [];

      if (hasResponses) {
        datasets.push({
          type: 'bar',
          label: responsesLabel,
          data: responsesValues,
          backgroundColor: palette.accentSoft,
          borderColor: 'transparent',
          borderRadius: 10,
          maxBarThickness: 36,
          yAxisID: 'yResponses',
          order: 0,
        });
      }

      datasets.push({
        type: 'line',
        label: datasetLabel,
        data: ratingValues,
        yAxisID: 'yRatings',
        borderColor: palette.accent,
        backgroundColor: palette.accentSoft,
        borderWidth: 2,
        tension: 0.35,
        spanGaps: true,
        fill: false,
        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,
        pointRadius: pointRadii,
        pointHoverRadius: pointHoverRadii,
        order: 2,
      });

      if (Number.isFinite(averageValue)) {
        datasets.push({
          type: 'line',
          label: referenceLabel,
          data: ratingValues.map(() => averageValue),
          yAxisID: 'yRatings',
          borderColor: palette.textMuted,
          borderWidth: 1.5,
          borderDash: [6, 6],
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 0,
          order: 1,
        });
      }

      const scales = {
        x: {
          ticks: {
            color: palette.textMuted,
          },
          grid: {
            color: palette.gridColor,
            drawBorder: false,
          },
        },
        yRatings: {
          position: 'left',
          min: yMin,
          max: yMax,
          ticks: {
            color: palette.textColor,
            callback(value) {
              return oneDecimalFormatter.format(value);
            },
          },
          grid: {
            color: palette.gridColor,
            drawBorder: false,
          },
        },
      };

      if (hasResponses) {
        const suggestedMax = responsesMax ? responsesMax * 1.15 : undefined;
        scales.yResponses = {
          position: 'right',
          beginAtZero: true,
          suggestedMax,
          grid: {
            drawOnChartArea: false,
            drawBorder: false,
          },
          ticks: {
            color: palette.textMuted,
            callback(value) {
              return numberFormatter.format(Math.round(value));
            },
          },
        };
      }

      dashboardState.charts.feedbackTrend = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets,
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            title: {
              display: false,
            },
            legend: {
              display: datasets.length > 1,
              position: 'bottom',
              labels: {
                color: palette.textMuted,
                usePointStyle: true,
                padding: 16,
              },
            },
            tooltip: {
              callbacks: {
                label(context) {
                  const value = context.parsed?.y;
                  const label = context.dataset?.label || '';
                  if (context.dataset?.yAxisID === 'yResponses') {
                    if (Number.isFinite(value)) {
                      return `${label}: ${numberFormatter.format(Math.round(value))}`;
                    }
                    return label;
                  }
                  if (Number.isFinite(value)) {
                    return `${label}: ${oneDecimalFormatter.format(value)}`;
                  }
                  return label;
                },
              },
            },
          },
          scales,
        },
      });
    }

    function setFeedbackTrendWindow(months) {
      const normalized = Number.isFinite(months) && months > 0
        ? Math.max(1, Math.round(months))
        : null;
      if (dashboardState.feedback.trendWindow === normalized) {
        return;
      }
      dashboardState.feedback.trendWindow = normalized;
      syncFeedbackTrendControls();
      updateFeedbackTrendSubtitle();
      const monthly = Array.isArray(dashboardState.feedback.monthly)
        ? dashboardState.feedback.monthly
        : [];
      renderFeedbackTrendChart(monthly).catch((error) => {
        console.error('Nepavyko atnaujinti atsiliepimų trendo laikotarpio:', error);
      });
    }

    function initializeFeedbackTrendControls() {
      if (!selectors.feedbackTrendButtons || !selectors.feedbackTrendButtons.length) {
        return;
      }
      selectors.feedbackTrendButtons.forEach((button) => {
        button.addEventListener('click', () => {
          const months = Number.parseInt(button.dataset.trendMonths || '', 10);
          if (Number.isFinite(months) && months > 0) {
            setFeedbackTrendWindow(months);
          } else {
            setFeedbackTrendWindow(null);
          }
        });
      });
    }

    function handleTabKeydown(event) {
      if (!selectors.tabButtons || !selectors.tabButtons.length) {
        return;
      }
      const controllableKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (!controllableKeys.includes(event.key)) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const buttons = selectors.tabButtons.filter(Boolean);
      if (!buttons.length) {
        return;
      }
      const currentIndex = buttons.indexOf(target);
      if (currentIndex === -1) {
        return;
      }
      event.preventDefault();
      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % buttons.length;
      } else if (event.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = buttons.length - 1;
      }
      const nextButton = buttons[nextIndex];
      if (nextButton) {
        setActiveTab(nextButton.dataset.tabTarget, { focusPanel: true });
        if (typeof nextButton.focus === 'function') {
          nextButton.focus();
        }
      }
    }

    function setActiveTab(tabId, { focusPanel = false, restoreFocus = false } = {}) {
      const normalized = tabId === 'ed' ? 'ed' : 'overview';
      dashboardState.activeTab = normalized;
      if (selectors.tabButtons && selectors.tabButtons.length) {
        selectors.tabButtons.forEach((button) => {
          if (!button) {
            return;
          }
          const isActive = button.dataset.tabTarget === normalized;
          const allowFocus = isActive || (button.dataset.tabTarget === 'overview' && normalized === 'ed');
          button.setAttribute('aria-selected', String(isActive));
          button.setAttribute('tabindex', allowFocus ? '0' : '-1');
          button.classList.toggle('is-active', isActive);
        });
      }
      if (selectors.tabPanels && selectors.tabPanels.length) {
        selectors.tabPanels.forEach((panel) => {
          if (!panel) {
            return;
          }
          const isActive = panel.dataset.tabPanel === normalized;
          if (isActive) {
            panel.removeAttribute('hidden');
            panel.removeAttribute('aria-hidden');
          } else {
            panel.setAttribute('hidden', 'hidden');
            panel.setAttribute('aria-hidden', 'true');
          }
        });
      }
      if (selectors.sectionNav) {
        if (normalized === 'overview') {
          selectors.sectionNav.removeAttribute('hidden');
          selectors.sectionNav.removeAttribute('aria-hidden');
        } else {
          selectors.sectionNav.setAttribute('hidden', 'hidden');
          selectors.sectionNav.setAttribute('aria-hidden', 'true');
        }
      }
      if (normalized !== 'ed' && dashboardState.tvMode) {
        setTvMode(false, { silent: true });
      }
      if (selectors.edNavButton) {
        const edActive = normalized === 'ed';
        selectors.edNavButton.setAttribute('aria-pressed', edActive ? 'true' : 'false');
        selectors.edNavButton.classList.toggle('is-active', edActive);
        const panelLabel = selectors.edNavButton.dataset.panelLabel
          || settings?.output?.tabEdLabel
          || TEXT.tabs.ed;
        const openLabel = selectors.edNavButton.dataset.openLabel
          || (typeof TEXT.edToggle?.open === 'function'
            ? TEXT.edToggle.open(panelLabel)
            : `Atidaryti ${panelLabel}`);
        const closeLabel = selectors.edNavButton.dataset.closeLabel
          || (typeof TEXT.edToggle?.close === 'function'
            ? TEXT.edToggle.close(panelLabel)
            : `Uždaryti ${panelLabel}`);
        const activeLabel = edActive ? closeLabel : openLabel;
        selectors.edNavButton.setAttribute('aria-label', activeLabel);
        selectors.edNavButton.title = activeLabel;
      }
      const fullscreenAvailable = normalized === 'ed';
      if (fullscreenAvailable) {
        // Atidarant ED skiltį automatiškai perjungiame į pilno ekrano režimą.
        setFullscreenMode(true);
      } else if (dashboardState.fullscreen) {
        setFullscreenMode(false, { restoreFocus });
      }
      if (focusPanel) {
        const targetPanel = normalized === 'ed' ? selectors.edPanel : selectors.overviewPanel;
        if (targetPanel && typeof targetPanel.focus === 'function') {
          if (!targetPanel.hasAttribute('tabindex')) {
            targetPanel.setAttribute('tabindex', '-1');
          }
          targetPanel.focus({ preventScroll: false });
        } else if (normalized === 'ed' && selectors.edHeading && typeof selectors.edHeading.scrollIntoView === 'function') {
          selectors.edHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      updateFullscreenControls();
      scheduleLayoutRefresh();
    }

    function initializeTabSwitcher() {
      if (!selectors.tabButtons || !selectors.tabButtons.length) {
        setActiveTab(dashboardState.activeTab || 'overview');
        return;
      }
      selectors.tabButtons.forEach((button) => {
        if (!button) {
          return;
        }
        button.addEventListener('click', () => {
          setActiveTab(button.dataset.tabTarget, { focusPanel: true });
        });
        button.addEventListener('keydown', handleTabKeydown);
      });
      setActiveTab(dashboardState.activeTab || 'overview');
    }

    function initializeTvMode() {
      if (!selectors.edTvPanel) {
        dashboardState.tvMode = false;
        document.body.removeAttribute('data-tv-mode');
        stopTvClock();
        return;
      }
      updateTvToggleControls();
      if (selectors.edTvToggleBtn) {
        selectors.edTvToggleBtn.addEventListener('click', () => {
          const isActive = dashboardState.tvMode === true && dashboardState.activeTab === 'ed';
          if (!isActive && dashboardState.activeTab !== 'ed') {
            setActiveTab('ed', { focusPanel: true });
            setTvMode(true, { force: true });
          } else {
            setTvMode(!isActive);
          }
        });
      }
      const params = new URLSearchParams(window.location.search);
      const hash = (window.location.hash || '').toLowerCase();
      const autoStart = params.has('tv') || hash === '#tv' || hash.includes('tv-mode');
      if (autoStart) {
        setActiveTab('ed', { focusPanel: false });
        setTvMode(true, { force: true, silent: true });
      }
    }

    function updateChartPeriod(period) {
      const numeric = Number.parseInt(period, 10);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return;
      }
      dashboardState.chartPeriod = numeric;
      syncChartPeriodButtons(numeric);
      if (selectors.dailyCaption) {
        selectors.dailyCaption.textContent = formatDailyCaption(numeric);
      }
      const hasBaseData = (Array.isArray(dashboardState.chartData.baseDaily) && dashboardState.chartData.baseDaily.length)
        || (Array.isArray(dashboardState.dailyStats) && dashboardState.dailyStats.length);
      if (!hasBaseData) {
        updateDailyPeriodSummary([]);
        if (selectors.dailyCaptionContext) {
          selectors.dailyCaptionContext.textContent = '';
        }
        updateChartFiltersSummary({ records: [], daily: [] });
        return;
      }
      const scoped = prepareChartDataForPeriod(numeric);
      renderCharts(scoped.daily, scoped.funnel, scoped.heatmap)
        .catch((error) => {
          console.error('Nepavyko atnaujinti grafiko laikotarpio:', error);
          showChartError(TEXT.charts?.errorLoading);
        });
    }

    function updateChartYear(year) {
      const numeric = Number.isFinite(year) ? Math.trunc(year) : Number.parseInt(String(year), 10);
      const normalized = Number.isFinite(numeric) ? numeric : null;
      dashboardState.chartYear = normalized;
      syncChartYearControl();
      if (selectors.dailyCaption) {
        selectors.dailyCaption.textContent = formatDailyCaption(dashboardState.chartPeriod);
      }
      const hasBaseData = (Array.isArray(dashboardState.chartData.baseDaily) && dashboardState.chartData.baseDaily.length)
        || (Array.isArray(dashboardState.dailyStats) && dashboardState.dailyStats.length);
      if (!hasBaseData) {
        updateDailyPeriodSummary([]);
        if (selectors.dailyCaptionContext) {
          selectors.dailyCaptionContext.textContent = '';
        }
        updateChartFiltersSummary({ records: [], daily: [] });
        return;
      }
      const scoped = prepareChartDataForPeriod(dashboardState.chartPeriod);
      renderCharts(scoped.daily, scoped.funnel, scoped.heatmap)
        .catch((error) => {
          console.error('Nepavyko atnaujinti grafiko metų filtro:', error);
          showChartError(TEXT.charts?.errorLoading);
        });
    }

    function clearChartError() {
      if (!Array.isArray(selectors.chartCards)) {
        return;
      }
      selectors.chartCards.forEach((card) => {
        if (!card) {
          return;
        }
        card.removeAttribute('data-error');
        const messageEl = card.querySelector('.chart-card__message');
        if (messageEl) {
          messageEl.remove();
        }
      });
    }

    function showChartSkeletons() {
      if (!Array.isArray(selectors.chartCards)) {
        return;
      }
      clearChartError();
      selectors.chartCards.forEach((card) => {
        if (!card) {
          return;
        }
        card.dataset.loading = 'true';
        const skeleton = card.querySelector('.chart-card__skeleton');
        if (skeleton) {
          skeleton.hidden = false;
        }
      });
    }

    function hideChartSkeletons() {
      if (!Array.isArray(selectors.chartCards)) {
        return;
      }
      selectors.chartCards.forEach((card) => {
        if (!card) {
          return;
        }
        delete card.dataset.loading;
        const skeleton = card.querySelector('.chart-card__skeleton');
        if (skeleton) {
          skeleton.hidden = true;
        }
      });
    }

    function showChartError(message) {
      if (!Array.isArray(selectors.chartCards)) {
        return;
      }
      const fallbackMessage = (TEXT?.charts?.errorLoading)
        || (TEXT?.status?.error)
        || 'Nepavyko atvaizduoti grafikų.';
      const resolvedMessage = message && String(message).trim().length
        ? String(message)
        : fallbackMessage;
      hideChartSkeletons();
      selectors.chartCards.forEach((card) => {
        if (!card) {
          return;
        }
        card.dataset.error = 'true';
        let messageEl = card.querySelector('.chart-card__message');
        if (!messageEl) {
          messageEl = document.createElement('div');
          messageEl.className = 'chart-card__message';
          messageEl.setAttribute('role', 'status');
          messageEl.setAttribute('aria-live', 'polite');
          card.appendChild(messageEl);
        }
        messageEl.textContent = resolvedMessage;
      });
    }

    function setChartCardMessage(element, message) {
      if (!element) {
        return;
      }
      const card = element.closest('.chart-card');
      if (!card) {
        return;
      }
      let messageEl = card.querySelector('.chart-card__message');
      if (!message || !String(message).trim().length) {
        if (messageEl) {
          messageEl.remove();
        }
        return;
      }
      if (!messageEl) {
        messageEl = document.createElement('div');
        messageEl.className = 'chart-card__message';
        messageEl.setAttribute('role', 'status');
        messageEl.setAttribute('aria-live', 'polite');
        card.appendChild(messageEl);
      }
      messageEl.textContent = String(message);
    }

    async function renderCharts(dailyStats, funnelTotals, heatmapData) {
      showChartSkeletons();
      const Chart = await loadChartJs();
      if (!Chart) {
        console.error('Chart.js biblioteka nepasiekiama.');
        showChartError(TEXT.charts?.errorLoading);
        return;
      }

      try {
        clearChartError();
        const palette = getThemePalette();
        const styleTarget = getThemeStyleTarget();
        Chart.defaults.color = palette.textColor;
        Chart.defaults.font.family = getComputedStyle(styleTarget).fontFamily;
        Chart.defaults.borderColor = palette.gridColor;

        if (!Number.isFinite(dashboardState.chartPeriod) || dashboardState.chartPeriod <= 0) {
          dashboardState.chartPeriod = 30;
        }

        dashboardState.chartLib = Chart;
        const scopedDaily = Array.isArray(dailyStats) ? dailyStats.slice() : [];
        dashboardState.chartData.dailyWindow = scopedDaily;

        const selectedYear = Number.isFinite(dashboardState.chartYear) ? Number(dashboardState.chartYear) : null;
        const baseDailyForFallback = Array.isArray(dashboardState.chartData.baseDaily)
          && dashboardState.chartData.baseDaily.length
          ? dashboardState.chartData.baseDaily
          : dashboardState.dailyStats;
        const fallbackDaily = filterDailyStatsByYear(baseDailyForFallback, selectedYear);
        const filteredDaily = Array.isArray(dashboardState.chartData.filteredDaily)
          ? dashboardState.chartData.filteredDaily
          : fallbackDaily;
        const funnelSource = funnelTotals ?? computeFunnelStats(scopedDaily, selectedYear, filteredDaily);
        dashboardState.chartData.funnel = funnelSource;

        let heatmapSource = heatmapData ?? null;
        if (!isValidHeatmapData(heatmapSource)) {
          let fallbackRecords = Array.isArray(dashboardState.chartData.filteredWindowRecords)
            && dashboardState.chartData.filteredWindowRecords.length
            ? dashboardState.chartData.filteredWindowRecords
            : null;
          if (!fallbackRecords || !fallbackRecords.length) {
            const baseRecords = Array.isArray(dashboardState.chartData.baseRecords)
              && dashboardState.chartData.baseRecords.length
              ? dashboardState.chartData.baseRecords
              : dashboardState.rawRecords;
            const yearScopedRecords = filterRecordsByYear(baseRecords, selectedYear);
            const filteredRecords = filterRecordsByChartFilters(yearScopedRecords, dashboardState.chartFilters || {});
            fallbackRecords = filterRecordsByWindow(filteredRecords, dashboardState.chartPeriod);
          }
          heatmapSource = computeArrivalHeatmap(fallbackRecords);
        }
        dashboardState.chartData.heatmap = heatmapSource;
        if (!HEATMAP_METRIC_KEYS.includes(dashboardState.heatmapMetric)) {
          dashboardState.heatmapMetric = DEFAULT_HEATMAP_METRIC;
        }

        hideChartSkeletons();
        renderDailyChart(scopedDaily, dashboardState.chartPeriod, Chart, palette);

        const dowLabels = ['Pir', 'Ant', 'Tre', 'Ket', 'Pen', 'Šeš', 'Sek'];
        const dowCounts = Array(7).fill(0);
        const dowTotals = Array(7).fill(0);
        const dowStayTotals = Array(7).fill(0);
        const dowStayCounts = Array(7).fill(0);
        scopedDaily.forEach((entry) => {
          const dayIndex = getWeekdayIndexFromDateKey(entry?.date);
          if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
            return;
          }
          const patientCount = Number.isFinite(entry?.count) ? entry.count : 0;
          dowCounts[dayIndex] += patientCount;
          dowTotals[dayIndex] += 1;
          const totalTime = Number.isFinite(entry?.totalTime) ? entry.totalTime : 0;
          const durations = Number.isFinite(entry?.durations) ? entry.durations : 0;
          if (totalTime > 0 && durations > 0) {
            dowStayTotals[dayIndex] += totalTime;
            dowStayCounts[dayIndex] += durations;
          }
        });
        const dowAverages = dowCounts.map((value, index) => (dowTotals[index] ? value / dowTotals[index] : 0));
        const dowStayAverages = dowStayTotals.map((value, index) => (dowStayCounts[index] ? value / dowStayCounts[index] : 0));
        const dowPointColors = dowLabels.map((_, index) => (index >= 5 ? palette.weekendAccent : palette.accent));
        const dowPointRadii = dowLabels.map((_, index) => (index >= 5 ? 6 : 4));
        const dowHoverRadii = dowLabels.map((_, index) => (index >= 5 ? 8 : 6));

        const dowCanvas = document.getElementById('dowChart');
        if (dowCanvas && dowCanvas.getContext) {
          if (dashboardState.charts.dow) {
            dashboardState.charts.dow.destroy();
          }
          const hasDowData = dowTotals.some((total) => total > 0);
          if (!hasDowData) {
            setChartCardMessage(dowCanvas, TEXT.charts?.empty);
            dashboardState.charts.dow = null;
          } else {
            setChartCardMessage(dowCanvas, null);
            const ctxDow = dowCanvas.getContext('2d');
            const isWeekendIndex = (index) => index >= 5;
            dashboardState.charts.dow = new Chart(ctxDow, {
              type: 'line',
              data: {
                labels: dowLabels,
                datasets: [
                  {
                    label: 'Vidutinis pacientų skaičius',
                    data: dowAverages,
                    fill: true,
                    tension: 0.35,
                    borderColor: palette.accent,
                    backgroundColor: palette.accentSoft,
                    pointBackgroundColor: dowPointColors,
                    pointBorderColor: dowPointColors,
                    pointRadius: dowPointRadii,
                    pointHoverRadius: dowHoverRadii,
                  },
                ],
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label(context) {
                        return `${context.dataset.label}: ${decimalFormatter.format(context.parsed.y)}`;
                      },
                    },
                  },
                },
                scales: {
                  x: {
                    ticks: {
                      color: (context) => (isWeekendIndex(context.index) ? palette.weekendAccent : palette.textColor),
                    },
                    grid: {
                      color: palette.gridColor,
                      drawBorder: false,
                    },
                  },
                  y: {
                    beginAtZero: true,
                    ticks: {
                      color: palette.textColor,
                      callback(value) {
                        return decimalFormatter.format(value);
                      },
                    },
                    grid: {
                      color: palette.gridColor,
                      drawBorder: false,
                    },
                  },
                },
              },
            });
          }
        }

        const dowStayCanvas = document.getElementById('dowStayChart');
        if (dowStayCanvas && dowStayCanvas.getContext) {
          if (dashboardState.charts.dowStay) {
            dashboardState.charts.dowStay.destroy();
          }
          const hasDowStayData = dowStayCounts.some((count) => count > 0);
          if (!hasDowStayData) {
            setChartCardMessage(dowStayCanvas, TEXT.charts?.empty);
            dashboardState.charts.dowStay = null;
          } else {
            setChartCardMessage(dowStayCanvas, null);
            const ctxDowStay = dowStayCanvas.getContext('2d');
            dashboardState.charts.dowStay = new Chart(ctxDowStay, {
              type: 'bar',
              data: {
                labels: dowLabels,
                datasets: [
                  {
                    label: TEXT.charts?.dowStayLabel || 'Vidutinė trukmė (val.)',
                    data: dowStayAverages,
                    backgroundColor: dowLabels.map((_, index) => (index >= 5 ? palette.weekendAccent : palette.accent)),
                    borderRadius: 12,
                  },
                ],
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label(context) {
                        return `${context.dataset.label}: ${decimalFormatter.format(context.parsed.y)}`;
                      },
                    },
                  },
                },
                scales: {
                  x: {
                    grid: { color: palette.gridColor, drawBorder: false },
                    ticks: {
                      color: (context) => (context.index >= 5 ? palette.weekendAccent : palette.textColor),
                    },
                  },
                  y: {
                    beginAtZero: true,
                    ticks: {
                      color: palette.textColor,
                      callback(value) {
                        return decimalFormatter.format(value);
                      },
                    },
                    grid: { color: palette.gridColor, drawBorder: false },
                  },
                },
              },
            });
          }
        }

        if (selectors.funnelCaption) {
          const funnelYear = dashboardState.chartData.funnel?.year ?? null;
          const captionText = typeof TEXT.charts.funnelCaptionWithYear === 'function'
            ? TEXT.charts.funnelCaptionWithYear(funnelYear)
            : TEXT.charts.funnelCaption;
          selectors.funnelCaption.textContent = captionText;
        }

        const funnelCanvas = document.getElementById('funnelChart');
        if (funnelCanvas) {
          if (dashboardState.charts.funnel && typeof dashboardState.charts.funnel.destroy === 'function') {
            dashboardState.charts.funnel.destroy();
          }
          dashboardState.charts.funnel = null;
          renderFunnelShape(funnelCanvas, dashboardState.chartData.funnel, palette.accent, palette.textColor);
        }

        renderArrivalHeatmap(
          selectors.heatmapContainer,
          dashboardState.chartData.heatmap,
          palette.accent,
          dashboardState.heatmapMetric,
        );
    } catch (error) {
      console.error('Nepavyko atvaizduoti grafikų:', error);
      showChartError(TEXT.charts?.errorLoading);
      throw error;
    }
    }

    function handleHeatmapMetricChange(event) {
      const candidate = event?.target?.value;
      const metrics = dashboardState.chartData?.heatmap?.metrics || {};
      const normalized = normalizeHeatmapMetricKey(candidate, metrics);
      dashboardState.heatmapMetric = normalized;
      const palette = getThemePalette();
      renderArrivalHeatmap(
        selectors.heatmapContainer,
        dashboardState.chartData.heatmap,
        palette.accent,
        dashboardState.heatmapMetric,
      );
    }

    function rerenderChartsForTheme() {
      const feedbackMonthly = Array.isArray(dashboardState.feedback?.monthly)
        ? dashboardState.feedback.monthly
        : [];
      renderFeedbackTrendChart(feedbackMonthly).catch((error) => {
        console.error('Nepavyko perpiešti atsiliepimų trendo grafiko pakeitus temą:', error);
      });
      const edData = dashboardState.ed || {};
      const edSummary = edData.summary || createEmptyEdSummary(edData.meta?.type);
      const edMode = typeof edSummary?.mode === 'string' ? edSummary.mode : (edData.meta?.type || 'legacy');
      const edHasSnapshot = Number.isFinite(edSummary?.currentPatients)
        || Number.isFinite(edSummary?.occupiedBeds)
        || Number.isFinite(edSummary?.nursePatientsPerStaff)
        || Number.isFinite(edSummary?.doctorPatientsPerStaff);
      const edVariant = edMode === 'snapshot'
        || (edMode === 'hybrid' && edHasSnapshot)
        ? 'snapshot'
        : 'legacy';
      const edDispositionsText = TEXT.ed.dispositions?.[edVariant] || TEXT.ed.dispositions?.legacy || {};
      renderEdDispositionsChart(
        Array.isArray(edData.dispositions) ? edData.dispositions : [],
        edDispositionsText,
        edVariant,
      ).catch((error) => {
        console.error('Nepavyko perpiešti pacientų kategorijų grafiko pakeitus temą:', error);
      });
      const hasAnyData = (dashboardState.chartData.dailyWindow && dashboardState.chartData.dailyWindow.length)
        || dashboardState.chartData.funnel
        || (dashboardState.chartData.heatmap && Object.keys(dashboardState.chartData.heatmap).length);
      if (!hasAnyData) {
        checkKpiContrast();
        return;
      }
      renderCharts(dashboardState.chartData.dailyWindow, dashboardState.chartData.funnel, dashboardState.chartData.heatmap)
        .catch((error) => {
          console.error('Nepavyko perpiešti grafikų pakeitus temą:', error);
          showChartError(TEXT.charts?.errorLoading);
        });
    }

    /**
     * Sugeneruoja paskutinių 7 dienų lentelę (naujausi įrašai viršuje).
     * @param {ReturnType<typeof computeDailyStats>} recentDailyStats
     */
    function formatValueWithShare(value, total) {
      const count = Number.isFinite(value) ? value : 0;
      const base = Number.isFinite(total) && total > 0 ? total : 0;
      const share = base > 0 ? count / base : 0;
      const shareText = percentFormatter.format(share);
      return `${numberFormatter.format(count)} <span class="table-percent">(${shareText})</span>`;
    }

    function formatSignedNumber(value) {
      if (!Number.isFinite(value)) {
        return '—';
      }
      if (value === 0) {
        return numberFormatter.format(0);
      }
      const formatted = numberFormatter.format(Math.abs(value));
      return `${value > 0 ? '+' : '−'}${formatted}`;
    }

    function formatSignedPercent(value) {
      if (!Number.isFinite(value)) {
        return '—';
      }
      if (value === 0) {
        return percentFormatter.format(0);
      }
      const formatted = percentFormatter.format(Math.abs(value));
      return `${value > 0 ? '+' : '−'}${formatted}`;
    }

    function createTrendChangeCell(diff, percentChange, maxAbsDiff, canCompare = true, variant = 'yearly') {
      const prefix = variant === 'monthly' ? 'monthly' : 'yearly';
      if (!canCompare || !Number.isFinite(diff)) {
        const unavailableText = (variant === 'monthly'
          ? TEXT.monthly?.comparisonUnavailable
          : TEXT.yearly?.comparisonUnavailable)
          || TEXT.yearly?.comparisonUnavailable
          || 'Nepakanka duomenų palyginimui.';
        return `
          <span class="${prefix}-trend__placeholder" aria-hidden="true">—</span>
          <span class="sr-only">${unavailableText}</span>
        `;
      }
      const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral';
      const absDiff = Math.abs(diff);
      const normalized = maxAbsDiff > 0 ? (absDiff / maxAbsDiff) * 100 : 0;
      const width = direction === 'neutral'
        ? 0
        : Math.min(100, Math.max(8, Math.round(normalized)));
      const diffText = formatSignedNumber(diff);
      const percentText = Number.isFinite(percentChange) ? formatSignedPercent(percentChange) : '—';
      const ariaLabel = direction === 'neutral'
        ? 'Pokytis nepakito (0 pacientų).'
        : `Pokytis ${direction === 'up' ? 'padidėjo' : 'sumažėjo'} ${numberFormatter.format(absDiff)} pacientais${Number.isFinite(percentChange) ? ` (${percentText})` : ''}.`;
      return `
        <div class="${prefix}-trend" role="img" aria-label="${ariaLabel}">
          <div class="${prefix}-trend__bar-wrapper" aria-hidden="true">
            <div class="${prefix}-trend__bar ${prefix}-trend__bar--${direction}" style="width: ${width}%;"></div>
          </div>
          <div class="${prefix}-trend__values">
            <span class="${prefix}-trend__diff ${prefix}-trend__diff--${direction}">${diffText}</span>
            <span class="${prefix}-trend__percent">${percentText}</span>
          </div>
        </div>
      `;
    }

    function createYearlyChangeCell(diff, percentChange, maxAbsDiff, canCompare = true) {
      return createTrendChangeCell(diff, percentChange, maxAbsDiff, canCompare, 'yearly');
    }

    function createMonthlyChangeCell(diff, percentChange, maxAbsDiff, canCompare = true) {
      return createTrendChangeCell(diff, percentChange, maxAbsDiff, canCompare, 'monthly');
    }

    function extractCompareMetricsFromRow(row) {
      if (!row || !row.dataset || !row.dataset.compareId) {
        return null;
      }
      const id = row.dataset.compareId;
      const label = row.dataset.compareLabel || row.cells?.[0]?.textContent?.trim() || id;
      const sortKey = row.dataset.compareSort || label;
      const total = Number.parseFloat(row.dataset.total || '0');
      const avgStay = Number.parseFloat(row.dataset.avgStay || '0');
      const emsShare = Number.parseFloat(row.dataset.emsShare || '0');
      const hospShare = Number.parseFloat(row.dataset.hospShare || '0');
      return {
        id,
        group: row.dataset.compareGroup || 'unknown',
        label,
        sortKey,
        total: Number.isFinite(total) ? total : 0,
        avgStay: Number.isFinite(avgStay) ? avgStay : 0,
        emsShare: Number.isFinite(emsShare) ? emsShare : 0,
        hospShare: Number.isFinite(hospShare) ? hospShare : 0,
      };
    }

    function buildMonthlySparkline(series, highlights = []) {
      const rawEntries = Array.isArray(series) ? series : [];
      const normalized = rawEntries.map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const keyCandidates = [
          typeof entry.month === 'string' ? entry.month : '',
          typeof entry.sortKey === 'string' ? entry.sortKey : '',
          typeof entry.key === 'string' ? entry.key : '',
          typeof entry.id === 'string' ? entry.id : '',
        ];
        const monthKey = keyCandidates
          .map((candidate) => (typeof candidate === 'string' ? candidate.replace(/^monthly-/, '') : ''))
          .find((candidate) => candidate);
        const valueCandidates = [
          Number.isFinite(entry.count) ? entry.count : Number.NaN,
          Number.isFinite(entry.total) ? entry.total : Number.NaN,
          Number.isFinite(entry.value) ? entry.value : Number.NaN,
        ];
        const rawValue = valueCandidates.find((candidate) => Number.isFinite(candidate));
        if (!monthKey || !Number.isFinite(rawValue)) {
          return null;
        }
        const label = typeof entry.label === 'string' && entry.label.trim()
          ? entry.label.trim()
          : formatMonthLabel(monthKey);
        return {
          month: monthKey,
          value: Math.max(0, rawValue),
          label,
        };
      }).filter(Boolean);
      if (!normalized.length) {
        return `<p class="compare-monthly__empty">${TEXT.compare.sparklineFallback}</p>`;
      }
      const seen = new Set();
      const unique = [];
      normalized.forEach((item) => {
        if (seen.has(item.month)) {
          return;
        }
        seen.add(item.month);
        unique.push(item);
      });
      const highlightKeys = Array.isArray(highlights)
        ? highlights
          .map((key) => (typeof key === 'string' ? key.replace(/^monthly-/, '') : ''))
          .filter(Boolean)
        : [];
      const compareEntries = highlightKeys
        .map((key) => unique.find((item) => item.month === key))
        .filter(Boolean)
        .slice(0, 2);
      if (compareEntries.length < 2) {
        return `<p class="compare-monthly__empty">${TEXT.compare.sparklineFallback}</p>`;
      }
      const styleTarget = document.body || document.documentElement;
      const computedStyles = getComputedStyle(styleTarget);
      const baseColor = computedStyles.getPropertyValue('--color-accent-soft').trim() || 'rgba(37, 99, 235, 0.2)';
      const highlightColor = computedStyles.getPropertyValue('--color-accent').trim() || '#2563eb';
      const axisColor = computedStyles.getPropertyValue('--color-text-muted').trim() || '#475569';
      const height = 120;
      const baseline = height - 36;
      const barWidth = 56;
      const gap = 32;
      const width = compareEntries.length * barWidth + (compareEntries.length + 1) * gap;
      const maxValue = compareEntries.reduce((max, entry) => Math.max(max, entry.value), 0);
      if (!Number.isFinite(maxValue) || maxValue < 0) {
        return `<p class="compare-monthly__empty">${TEXT.compare.sparklineFallback}</p>`;
      }
      const labelY = height - 12;
      const bars = compareEntries.map((entry, index) => {
        const ratio = maxValue > 0 ? entry.value / maxValue : 0;
        const barHeight = maxValue > 0 ? Math.round(ratio * (height - 52)) : 0;
        const x = gap + index * (barWidth + gap);
        const y = baseline - barHeight;
        const centerX = x + barWidth / 2;
        const fillColor = index === compareEntries.length - 1 ? highlightColor : baseColor || highlightColor;
        const titleValue = numberFormatter.format(Math.round(entry.value));
        const valueY = barHeight > 18 ? y - 6 : baseline + 16;
        const showValue = Number.isFinite(entry.value);
        return `
          <g aria-hidden="true">
            <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="6" fill="${fillColor}" opacity="${index === compareEntries.length - 1 ? 1 : 0.85}">
              <title>${entry.label}: ${titleValue}</title>
            </rect>
            ${showValue ? `<text x="${centerX}" y="${Math.max(20, valueY)}" text-anchor="middle" fill="${axisColor}" font-size="12" font-weight="600">${titleValue}</text>` : ''}
            <text x="${centerX}" y="${labelY}" text-anchor="middle" fill="${axisColor}" font-size="12">${entry.label}</text>
          </g>
        `;
      }).join('');
      const previousEntry = compareEntries[0];
      const currentEntry = compareEntries[compareEntries.length - 1];
      const diffValue = currentEntry.value - previousEntry.value;
      let diffDescription = 'Pokyčių nėra';
      if (Math.abs(diffValue) >= 0.5) {
        const sign = diffValue > 0 ? '+' : '−';
        diffDescription = `Pokytis ${sign}${numberFormatter.format(Math.round(Math.abs(diffValue)))} pacientų`;
      }
      const ariaLabel = TEXT.compare.sparklineAria(currentEntry.label, previousEntry.label, diffDescription);
      const escapeAttr = (value) => String(value).replace(/"/g, '&quot;');
      return `
        <svg class="compare-monthly__chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(ariaLabel)}" focusable="false">
          <g aria-hidden="true">
            <line x1="0" y1="${baseline}" x2="${width}" y2="${baseline}" stroke="${axisColor}" stroke-width="1" stroke-linecap="round" opacity="0.35"></line>
            ${bars}
          </g>
        </svg>
      `;
    }

    function renderMonthlyComparison(newer, older) {
      const monthlyEntries = Array.isArray(dashboardState?.monthly?.all)
        ? dashboardState.monthly.all.filter((item) => item && typeof item === 'object')
        : [];
      const parseSortKey = (item) => {
        const sortKey = typeof item?.sortKey === 'string' ? item.sortKey : '';
        const match = sortKey.match(/^(\d{4})-(\d{2})$/);
        if (!match) {
          return { key: sortKey, year: Number.NaN, month: Number.NaN };
        }
        return {
          key: sortKey,
          year: Number.parseInt(match[1], 10),
          month: Number.parseInt(match[2], 10),
        };
      };
      const createDiffText = (value, formatter, unit = '') => {
        if (!Number.isFinite(value) || Math.abs(value) < 0.0001) {
          return 'pokyčių nėra';
        }
        const sign = value > 0 ? '+' : '−';
        return `${sign}${formatter(Math.abs(value))}${unit}`;
      };
      const formatPercentChange = (current, previous) => {
        if (!Number.isFinite(current) || !Number.isFinite(previous) || Math.abs(previous) < 0.0001) {
          return '';
        }
        const raw = ((current - previous) / Math.abs(previous)) * 100;
        if (Math.abs(raw) < 0.0001) {
          return '';
        }
        const sign = raw > 0 ? '+' : '−';
        return `${sign}${oneDecimalFormatter.format(Math.abs(raw))}%`;
      };
      const newerMeta = parseSortKey(newer);
      const olderMeta = parseSortKey(older);
      const newerLabel = newer?.label || formatMonthLabel(newerMeta.key || '');
      const olderLabel = older?.label || formatMonthLabel(olderMeta.key || '');
      const descriptionParts = [`${newerLabel} palyginta su ${olderLabel}`];
      if (Number.isFinite(newerMeta.year) && Number.isFinite(olderMeta.year) && newerMeta.year !== olderMeta.year) {
        descriptionParts.push('tas pats mėnuo prieš metus');
      }
      const totalDiff = newer.total - older.total;
      const avgStayDiff = newer.avgStay - older.avgStay;
      const emsShareDiff = (newer.emsShare - older.emsShare) * 100;
      const hospShareDiff = (newer.hospShare - older.hospShare) * 100;
      const metrics = [
        {
          label: TEXT.compare.metrics.total,
          newValue: numberFormatter.format(newer.total),
          previousValue: numberFormatter.format(older.total),
          diffText: createDiffText(totalDiff, (val) => numberFormatter.format(Math.round(val))),
          percentText: formatPercentChange(newer.total, older.total),
        },
        {
          label: TEXT.compare.metrics.avgStay,
          newValue: `${decimalFormatter.format(newer.avgStay)} val.`,
          previousValue: `${decimalFormatter.format(older.avgStay)} val.`,
          diffText: createDiffText(avgStayDiff, (val) => decimalFormatter.format(val), ' val.'),
          percentText: formatPercentChange(newer.avgStay, older.avgStay),
        },
        {
          label: TEXT.compare.metrics.emsShare,
          newValue: percentFormatter.format(newer.emsShare),
          previousValue: percentFormatter.format(older.emsShare),
          diffText: createDiffText(emsShareDiff, (val) => oneDecimalFormatter.format(val), ' p. p.'),
          percentText: formatPercentChange(newer.emsShare, older.emsShare),
        },
        {
          label: TEXT.compare.metrics.hospShare,
          newValue: percentFormatter.format(newer.hospShare),
          previousValue: percentFormatter.format(older.hospShare),
          diffText: createDiffText(hospShareDiff, (val) => oneDecimalFormatter.format(val), ' p. p.'),
          percentText: formatPercentChange(newer.hospShare, older.hospShare),
        },
      ];
      let yoyBlock = '';
      if (Number.isFinite(newerMeta.year) && Number.isFinite(newerMeta.month)) {
        const previousYearKey = `${String(newerMeta.year - 1).padStart(4, '0')}-${String(newerMeta.month).padStart(2, '0')}`;
        const contextEntry = monthlyEntries.find((entry) => entry?.month === previousYearKey);
        if (contextEntry) {
          const contextCount = Number.isFinite(contextEntry.count) ? contextEntry.count : 0;
          const yoyDiff = newer.total - contextCount;
          const yoyDiffText = createDiffText(yoyDiff, (val) => numberFormatter.format(Math.round(val)));
          const yoyPercentText = formatPercentChange(newer.total, contextCount);
          const monthLabel = formatMonthLabel(previousYearKey);
          const details = [yoyDiffText];
          if (yoyPercentText) {
            details.push(`(${yoyPercentText})`);
          }
          yoyBlock = `
            <p class="compare-summary__hint">
              Metai-metams: ${details.join(' ')}
              <span>vs ${monthLabel} – tas pats mėnuo prieš metus</span>
            </p>
          `;
        }
      }
      const metricsHtml = metrics.map((metric) => `
        <div class="compare-summary__metric">
          <span class="compare-summary__metric-label">${metric.label}</span>
          <strong class="compare-summary__metric-value">${metric.newValue}</strong>
          <span class="compare-summary__metric-prev">vs ${metric.previousValue}</span>
          <span class="compare-summary__metric-diff">Δ ${metric.diffText}${metric.percentText ? ` (${metric.percentText})` : ''}</span>
        </div>
      `).join('');
      const description = descriptionParts.join(' – ');
      const highlightKeys = [older?.sortKey, newer?.sortKey].filter(Boolean);
      const sparklineHtml = buildMonthlySparkline(dashboardState.monthly.window, highlightKeys);
      return `
        <div class="compare-summary__monthly">
          <div class="compare-monthly">
            <div class="compare-monthly__stats">
              <p class="compare-summary__description">${description}</p>
              <div class="compare-summary__metrics">${metricsHtml}</div>
              ${yoyBlock}
            </div>
            <div class="compare-monthly__sparkline">
              <strong class="compare-monthly__sparkline-title">${TEXT.compare.sparklineTitle}</strong>
              ${sparklineHtml}
            </div>
          </div>
        </div>
      `;
    }

    function updateCompareSummary() {
      if (!selectors.compareSummary) {
        return;
      }
      if (!dashboardState.compare.active) {
        selectors.compareSummary.textContent = TEXT.compare.prompt;
        return;
      }
      const selections = dashboardState.compare.selections;
      if (!selections.length) {
        selectors.compareSummary.textContent = TEXT.compare.prompt;
        return;
      }
      if (selections.length === 1) {
        selectors.compareSummary.textContent = TEXT.compare.insufficient;
        return;
      }
      const sorted = [...selections].sort((a, b) => (a.sortKey > b.sortKey ? 1 : -1));
      const older = sorted[0];
      const newer = sorted[sorted.length - 1];
      const summaryTitle = TEXT.compare.summaryTitle(newer.label, older.label);
      if (selections.every((item) => item.group === 'monthly')) {
        selectors.compareSummary.innerHTML = `
          <strong>${summaryTitle}</strong>
          ${renderMonthlyComparison(newer, older)}
        `;
        return;
      }
      const totalDiff = newer.total - older.total;
      const avgStayDiff = newer.avgStay - older.avgStay;
      const emsShareDiff = (newer.emsShare - older.emsShare) * 100;
      const hospShareDiff = (newer.hospShare - older.hospShare) * 100;
      const diffToText = (value, formatter, unit = '') => {
        if (Math.abs(value) < 0.0001) {
          return 'pokyčių nėra';
        }
        const sign = value > 0 ? '+' : '−';
        return `${sign}${formatter(Math.abs(value))}${unit}`;
      };
      const totalDiffText = diffToText(totalDiff, (val) => numberFormatter.format(Math.round(val)));
      const avgDiffText = diffToText(avgStayDiff, (val) => decimalFormatter.format(val), ' val.');
      const emsDiffText = diffToText(emsShareDiff, (val) => oneDecimalFormatter.format(val), ' p. p.');
      const hospDiffText = diffToText(hospShareDiff, (val) => oneDecimalFormatter.format(val), ' p. p.');
      selectors.compareSummary.innerHTML = `
        <strong>${summaryTitle}</strong>
        <ul>
          <li><strong>${TEXT.compare.metrics.total}:</strong> ${numberFormatter.format(newer.total)} vs ${numberFormatter.format(older.total)} (Δ ${totalDiffText})</li>
          <li><strong>${TEXT.compare.metrics.avgStay}:</strong> ${decimalFormatter.format(newer.avgStay)} vs ${decimalFormatter.format(older.avgStay)} (Δ ${avgDiffText})</li>
          <li><strong>${TEXT.compare.metrics.emsShare}:</strong> ${percentFormatter.format(newer.emsShare)} vs ${percentFormatter.format(older.emsShare)} (Δ ${emsDiffText})</li>
          <li><strong>${TEXT.compare.metrics.hospShare}:</strong> ${percentFormatter.format(newer.hospShare)} vs ${percentFormatter.format(older.hospShare)} (Δ ${hospDiffText})</li>
        </ul>
      `;
    }

    function syncCompareActivation() {
      const active = dashboardState.compare.active;
      const rows = [];
      if (selectors.recentTable) {
        rows.push(...selectors.recentTable.querySelectorAll('tr[data-compare-id]'));
      }
      if (selectors.monthlyTable) {
        rows.push(...selectors.monthlyTable.querySelectorAll('tr[data-compare-id]'));
      }
      if (selectors.yearlyTable) {
        rows.push(...selectors.yearlyTable.querySelectorAll('tr[data-compare-id]'));
      }
      rows.forEach((row) => {
        if (!active) {
          row.classList.remove('table-row--selectable', 'table-row--selected');
          row.removeAttribute('tabindex');
          row.removeAttribute('role');
          row.removeAttribute('aria-pressed');
          return;
        }
        row.classList.add('table-row--selectable');
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        const metrics = extractCompareMetricsFromRow(row);
        const isSelected = metrics && dashboardState.compare.selections.some((item) => item.id === metrics.id);
        row.classList.toggle('table-row--selected', Boolean(isSelected));
        row.setAttribute('aria-pressed', String(Boolean(isSelected)));
      });
      updateCompareSummary();
    }

    function clearCompareSelection() {
      dashboardState.compare.selections = [];
      syncCompareActivation();
    }

    function handleCompareRowSelection(row) {
      if (!dashboardState.compare.active) {
        return;
      }
      const metrics = extractCompareMetricsFromRow(row);
      if (!metrics) {
        return;
      }
      const existingIndex = dashboardState.compare.selections.findIndex((item) => item.id === metrics.id);
      if (existingIndex >= 0) {
        dashboardState.compare.selections.splice(existingIndex, 1);
      } else {
        if (dashboardState.compare.selections.length >= 2) {
          dashboardState.compare.selections.shift();
        }
        dashboardState.compare.selections.push(metrics);
      }
      syncCompareActivation();
    }

    function setCompareMode(active) {
      const normalized = Boolean(active);
      dashboardState.compare.active = normalized;
      if (selectors.compareToggle) {
        selectors.compareToggle.textContent = normalized ? TEXT.compare.active : TEXT.compare.toggle;
        selectors.compareToggle.setAttribute('aria-pressed', String(normalized));
      }
      if (selectors.compareCard) {
        if (normalized) {
          selectors.compareCard.removeAttribute('hidden');
        } else {
          selectors.compareCard.setAttribute('hidden', 'hidden');
        }
      }
      if (!normalized) {
        clearCompareSelection();
      } else {
        syncCompareActivation();
      }
    }

    function renderRecentTable(recentDailyStats) {
      selectors.recentTable.replaceChildren();
      if (!recentDailyStats.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 7;
        cell.textContent = TEXT.recent.empty;
        row.appendChild(cell);
        selectors.recentTable.appendChild(row);
        syncCompareActivation();
        return;
      }

      [...recentDailyStats]
        .sort((a, b) => (a.date > b.date ? -1 : 1))
        .forEach((entry) => {
          const row = document.createElement('tr');
          const dateValue = dateKeyToDate(entry.date);
          const displayDate = dateValue ? dailyDateFormatter.format(dateValue) : entry.date;
          const total = Number.isFinite(entry.count) ? entry.count : 0;
          row.innerHTML = `
            <td>${displayDate}</td>
            <td>${numberFormatter.format(total)}</td>
            <td>${decimalFormatter.format(entry.durations ? entry.totalTime / entry.durations : 0)}</td>
            <td>${formatValueWithShare(entry.night, total)}</td>
            <td>${formatValueWithShare(entry.ems, total)}</td>
            <td>${formatValueWithShare(entry.hospitalized, total)}</td>
            <td>${formatValueWithShare(entry.discharged, total)}</td>
          `;
          const avgStay = entry.durations ? entry.totalTime / entry.durations : 0;
          const emsShare = total > 0 ? entry.ems / total : 0;
          const hospShare = total > 0 ? entry.hospitalized / total : 0;
          row.dataset.compareId = `recent-${entry.date}`;
          row.dataset.compareGroup = 'recent';
          row.dataset.compareLabel = displayDate;
          row.dataset.compareSort = entry.date;
          row.dataset.total = String(total);
          row.dataset.avgStay = String(avgStay);
          row.dataset.emsShare = String(emsShare);
          row.dataset.hospShare = String(hospShare);
          selectors.recentTable.appendChild(row);
        });
      syncCompareActivation();
    }

    function formatMonthLabel(monthKey) {
      if (typeof monthKey !== 'string') {
        return '';
      }
      const [yearStr, monthStr] = monthKey.split('-');
      const year = Number.parseInt(yearStr, 10);
      const monthIndex = Number.parseInt(monthStr, 10) - 1;
      if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
        return monthKey;
      }
      return monthFormatter.format(new Date(Date.UTC(year, Math.max(0, monthIndex), 1)));
    }

    function formatYearLabel(yearKey) {
      if (typeof yearKey !== 'string') {
        return '';
      }
      const year = Number.parseInt(yearKey, 10);
      if (!Number.isFinite(year)) {
        return yearKey;
      }
      return `${year} m.`;
    }

    function renderMonthlyTable(monthlyStats) {
      const scopedMonthly = Array.isArray(monthlyStats) ? monthlyStats : [];
      dashboardState.monthly.window = scopedMonthly;
      selectors.monthlyTable.replaceChildren();
      if (!scopedMonthly.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 9;
        cell.textContent = TEXT.monthly.empty;
        row.appendChild(cell);
        selectors.monthlyTable.appendChild(row);
        syncCompareActivation();
        return;
      }

      const totals = scopedMonthly.map((entry) => (Number.isFinite(entry?.count) ? entry.count : 0));
      const completeness = scopedMonthly.map((entry) => isCompleteMonthEntry(entry));
      const diffValues = totals.map((total, index) => {
        if (index === 0) {
          return Number.NaN;
        }
        if (!completeness[index] || !completeness[index - 1]) {
          return Number.NaN;
        }
        const previousTotal = totals[index - 1];
        if (!Number.isFinite(previousTotal)) {
          return Number.NaN;
        }
        return total - previousTotal;
      });
      const maxAbsDiff = diffValues.reduce((acc, value) => (Number.isFinite(value)
        ? Math.max(acc, Math.abs(value))
        : acc), 0);

      scopedMonthly.forEach((entry, index) => {
        const row = document.createElement('tr');
        const avgPerDay = entry.dayCount > 0 ? entry.count / entry.dayCount : 0;
        const total = Number.isFinite(entry.count) ? entry.count : 0;
        const previousTotal = index > 0 ? totals[index - 1] : Number.NaN;
        const isComplete = completeness[index];
        const previousComplete = index > 0 ? completeness[index - 1] : false;
        const canCompare = isComplete && previousComplete && Number.isFinite(previousTotal);
        const diff = canCompare ? total - previousTotal : Number.NaN;
        const percentChange = canCompare && previousTotal !== 0
          ? diff / previousTotal
          : Number.NaN;
        row.innerHTML = `
          <td>${formatMonthLabel(entry.month)}</td>
          <td>${numberFormatter.format(total)}</td>
          <td>${oneDecimalFormatter.format(avgPerDay)}</td>
          <td>${decimalFormatter.format(entry.durations ? entry.totalTime / entry.durations : 0)}</td>
          <td>${formatValueWithShare(entry.night, total)}</td>
          <td>${formatValueWithShare(entry.ems, total)}</td>
          <td>${formatValueWithShare(entry.hospitalized, total)}</td>
          <td>${formatValueWithShare(entry.discharged, total)}</td>
          <td>${createMonthlyChangeCell(diff, percentChange, maxAbsDiff, canCompare)}</td>
        `;
        const avgStay = entry.durations ? entry.totalTime / entry.durations : 0;
        const emsShare = total > 0 ? entry.ems / total : 0;
        const hospShare = total > 0 ? entry.hospitalized / total : 0;
        row.dataset.compareId = `monthly-${entry.month}`;
        row.dataset.compareGroup = 'monthly';
        row.dataset.compareLabel = formatMonthLabel(entry.month);
        row.dataset.compareSort = entry.month;
        row.dataset.total = String(total);
        row.dataset.avgStay = String(avgStay);
        row.dataset.emsShare = String(emsShare);
        row.dataset.hospShare = String(hospShare);
        row.dataset.change = Number.isFinite(diff) ? String(diff) : '';
        row.dataset.changePercent = Number.isFinite(percentChange) ? String(percentChange) : '';
        selectors.monthlyTable.appendChild(row);
      });
      syncCompareActivation();
    }

    function isCompleteMonthEntry(entry) {
      if (!entry) {
        return false;
      }
      const dayCount = Number.isFinite(entry?.dayCount) ? entry.dayCount : 0;
      if (!entry?.month) {
        return dayCount >= 28;
      }
      const [yearStr, monthStr] = entry.month.split('-');
      const year = Number.parseInt(yearStr, 10);
      const monthIndex = Number.parseInt(monthStr, 10) - 1;
      if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
        return dayCount >= 28;
      }
      const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
      const daysInMonth = Number.isFinite(lastDay.getUTCDate()) ? lastDay.getUTCDate() : 30;
      const threshold = Math.max(1, Math.round(daysInMonth * 0.9));
      return dayCount >= threshold;
    }

    function isCompleteYearEntry(entry) {
      if (!entry) {
        return false;
      }
      const monthCount = Number.isFinite(entry?.monthCount) ? entry.monthCount : 0;
      const dayCount = Number.isFinite(entry?.dayCount) ? entry.dayCount : 0;
      return monthCount >= 12 || dayCount >= 360;
    }

    function renderYearlyTable(yearlyStats) {
      if (!selectors.yearlyTable) {
        return;
      }
      selectors.yearlyTable.replaceChildren();
      if (!Array.isArray(yearlyStats) || !yearlyStats.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 9;
        cell.textContent = TEXT.yearly.empty;
        row.appendChild(cell);
        selectors.yearlyTable.appendChild(row);
        syncCompareActivation();
        return;
      }

      const completeEntries = yearlyStats.filter((entry) => isCompleteYearEntry(entry));

      if (!completeEntries.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 9;
        cell.textContent = TEXT.yearly.noCompleteYears || TEXT.yearly.empty;
        row.appendChild(cell);
        selectors.yearlyTable.appendChild(row);
        syncCompareActivation();
        return;
      }

      const displayLimit = 5;
      const entriesToRender = Number.isFinite(displayLimit) && displayLimit > 0
        ? completeEntries.slice(-displayLimit)
        : completeEntries;

      const totals = entriesToRender.map((item) => (Number.isFinite(item?.count) ? item.count : 0));
      const completeness = entriesToRender.map((entry) => isCompleteYearEntry(entry));
      const diffValues = totals.map((total, index) => {
        if (index === 0) {
          return Number.NaN;
        }
        if (!completeness[index] || !completeness[index - 1]) {
          return Number.NaN;
        }
        const previousTotal = totals[index - 1];
        if (!Number.isFinite(previousTotal)) {
          return Number.NaN;
        }
        return total - previousTotal;
      });
      const maxAbsDiff = diffValues.reduce((acc, value) => (Number.isFinite(value)
        ? Math.max(acc, Math.abs(value))
        : acc), 0);

      entriesToRender.forEach((entry, index) => {
        const row = document.createElement('tr');
        const total = Number.isFinite(entry.count) ? entry.count : 0;
        const avgPerDay = entry.dayCount > 0 ? total / entry.dayCount : 0;
        const avgStay = entry.durations ? entry.totalTime / entry.durations : 0;
        const previousTotal = index > 0 ? totals[index - 1] : Number.NaN;
        const isComplete = completeness[index];
        const previousComplete = index > 0 ? completeness[index - 1] : false;
        const canCompare = isComplete && previousComplete && Number.isFinite(previousTotal);
        const diff = canCompare ? total - previousTotal : Number.NaN;
        const percentChange = canCompare && previousTotal !== 0
          ? diff / previousTotal
          : Number.NaN;
        row.innerHTML = `
          <td>${formatYearLabel(entry.year)}</td>
          <td>${numberFormatter.format(total)}</td>
          <td>${oneDecimalFormatter.format(avgPerDay)}</td>
          <td>${decimalFormatter.format(avgStay)}</td>
          <td>${formatValueWithShare(entry.night, total)}</td>
          <td>${formatValueWithShare(entry.ems, total)}</td>
          <td>${formatValueWithShare(entry.hospitalized, total)}</td>
          <td>${formatValueWithShare(entry.discharged, total)}</td>
          <td>${createYearlyChangeCell(diff, percentChange, maxAbsDiff, canCompare)}</td>
        `;
        const emsShare = total > 0 ? entry.ems / total : 0;
        const hospShare = total > 0 ? entry.hospitalized / total : 0;
        row.dataset.compareId = `yearly-${entry.year}`;
        row.dataset.compareGroup = 'yearly';
        row.dataset.compareLabel = formatYearLabel(entry.year);
        row.dataset.compareSort = entry.year;
        row.dataset.total = String(total);
        row.dataset.avgStay = String(avgStay);
        row.dataset.emsShare = String(emsShare);
        row.dataset.hospShare = String(hospShare);
        row.dataset.change = Number.isFinite(diff) ? String(diff) : '';
        row.dataset.changePercent = Number.isFinite(percentChange) ? String(percentChange) : '';
        selectors.yearlyTable.appendChild(row);
      });
      syncCompareActivation();
    }

    function formatEdCardValue(rawValue, format) {
      switch (format) {
        case 'text':
          if (typeof rawValue === 'string') {
            const trimmed = rawValue.trim();
            return trimmed.length ? trimmed : null;
          }
          return null;
        case 'hours':
          if (!Number.isFinite(rawValue)) {
            return null;
          }
          return oneDecimalFormatter.format(rawValue / 60);
        case 'minutes':
          if (!Number.isFinite(rawValue)) {
            return null;
          }
          return numberFormatter.format(Math.round(rawValue));
        case 'percent':
          if (!Number.isFinite(rawValue)) {
            return null;
          }
          return percentFormatter.format(rawValue);
        case 'oneDecimal':
          if (!Number.isFinite(rawValue)) {
            return null;
          }
          return oneDecimalFormatter.format(rawValue);
        case 'ratio':
          if (!Number.isFinite(rawValue) || rawValue <= 0) {
            return null;
          }
          return `1:${oneDecimalFormatter.format(rawValue)}`;
        case 'multiplier':
          if (!Number.isFinite(rawValue)) {
            return null;
          }
          return `${oneDecimalFormatter.format(rawValue)}×`;
        case 'beds':
          if (!Number.isFinite(rawValue)) {
            return null;
          }
          {
            const totalBeds = Number.isFinite(ED_TOTAL_BEDS) ? ED_TOTAL_BEDS : 0;
            const occupied = Math.max(0, Math.round(rawValue));
            if (totalBeds > 0) {
              const share = occupied / totalBeds;
              const percentText = percentFormatter.format(share);
              return `${numberFormatter.format(occupied)}/${numberFormatter.format(totalBeds)} (${percentText})`;
            }
            return numberFormatter.format(occupied);
          }
        default:
          if (!Number.isFinite(rawValue)) {
            return null;
          }
          return numberFormatter.format(rawValue);
      }
    }

    function normalizePercentValue(rawValue) {
      if (!Number.isFinite(rawValue)) {
        return null;
      }
      if (rawValue < 0) {
        return 0;
      }
      if (rawValue <= 1) {
        return rawValue;
      }
      if (rawValue <= 100) {
        return rawValue / 100;
      }
      return 1;
    }

    function getEdCardDeltaInfo(primaryRaw, secondaryRaw, format) {
      if (!Number.isFinite(primaryRaw) || !Number.isFinite(secondaryRaw)) {
        return null;
      }
      const diff = primaryRaw - secondaryRaw;
      if (!Number.isFinite(diff)) {
        return null;
      }

      let trend = 'neutral';
      if (diff > 0) {
        trend = 'up';
      } else if (diff < 0) {
        trend = 'down';
      }

      const reference = formatEdCardValue(secondaryRaw, format);
      let valueText = '';
      let ariaValue = '';

      switch (format) {
        case 'hours': {
          const hours = Math.abs(diff) / 60;
          const rounded = Math.round(hours * 10) / 10;
          if (!rounded) {
            trend = 'neutral';
          }
          valueText = `${oneDecimalFormatter.format(rounded)} val.`;
          ariaValue = `${oneDecimalFormatter.format(rounded)} valandos`;
          break;
        }
        case 'minutes': {
          const minutes = Math.round(Math.abs(diff));
          if (!minutes) {
            trend = 'neutral';
          }
          valueText = `${numberFormatter.format(minutes)} min.`;
          ariaValue = `${numberFormatter.format(minutes)} minutės`;
          break;
        }
        case 'percent': {
          const normalized = Math.abs(diff) <= 1 ? Math.abs(diff) * 100 : Math.abs(diff);
          const rounded = Math.round(normalized * 10) / 10;
          if (!rounded) {
            trend = 'neutral';
          }
          valueText = `${oneDecimalFormatter.format(rounded)} p.p.`;
          ariaValue = `${oneDecimalFormatter.format(rounded)} procentinio punkto`;
          break;
        }
        case 'oneDecimal': {
          const absolute = Math.abs(diff);
          const rounded = Math.round(absolute * 10) / 10;
          if (!rounded) {
            trend = 'neutral';
          }
          valueText = oneDecimalFormatter.format(rounded);
          ariaValue = `${oneDecimalFormatter.format(rounded)} vienetai`;
          break;
        }
        case 'ratio':
          return null;
        default: {
          const absolute = Math.abs(diff);
          const rounded = Math.round(absolute);
          if (!rounded) {
            trend = 'neutral';
          }
          valueText = numberFormatter.format(rounded);
          ariaValue = `${numberFormatter.format(rounded)} vienetai`;
        }
      }

      if (trend === 'neutral') {
        return {
          trend: 'neutral',
          arrow: '→',
          text: 'Be pokyčio',
          reference,
          ariaLabel: reference
            ? `Pokytis lyginant su ${reference}: be pokyčio`
            : 'Pokytis: be pokyčio',
        };
      }

      const arrow = trend === 'up' ? '↑' : '↓';
      const sign = trend === 'up' ? '+' : '−';
      return {
        trend,
        arrow,
        text: `${sign}${valueText}`,
        reference,
        ariaLabel: reference
          ? `Pokytis lyginant su ${reference}: ${sign}${ariaValue}`
          : `Pokytis: ${sign}${ariaValue}`,
      };
    }

    function buildEdCardVisuals(config, primaryRaw, secondaryRaw) {
      const visuals = [];

      if (config.format === 'percent' && Number.isFinite(primaryRaw)) {
        const normalized = normalizePercentValue(primaryRaw);
        if (normalized != null) {
          const progress = document.createElement('div');
          progress.className = 'ed-dashboard__card-progress';
          progress.setAttribute('aria-hidden', 'true');
          const fill = document.createElement('div');
          fill.className = 'ed-dashboard__card-progress-fill';
          fill.setAttribute('aria-hidden', 'true');
          const width = `${Math.max(0, Math.min(100, normalized * 100))}%`;
          fill.style.setProperty('--progress-width', width);
          progress.appendChild(fill);

          if (Number.isFinite(secondaryRaw)) {
            const normalizedSecondary = normalizePercentValue(secondaryRaw);
            if (normalizedSecondary != null) {
              const marker = document.createElement('span');
              marker.className = 'ed-dashboard__card-progress-marker';
              marker.setAttribute('aria-hidden', 'true');
              marker.style.left = `${Math.max(0, Math.min(100, normalizedSecondary * 100))}%`;
              const secondaryText = formatEdCardValue(secondaryRaw, config.format);
              if (secondaryText) {
                marker.title = `Lyginamasis rodiklis: ${secondaryText}`;
              }
              progress.appendChild(marker);
            }
          }

          visuals.push(progress);
        }
      } else if (config.format === 'beds' && Number.isFinite(primaryRaw)) {
        const totalBeds = Number.isFinite(ED_TOTAL_BEDS) ? Math.max(ED_TOTAL_BEDS, 0) : 0;
        if (totalBeds > 0) {
          const occupancyShare = Math.max(0, Math.min(1, primaryRaw / totalBeds));
          const occupancyLevel = occupancyShare > 0.7
            ? 'critical'
            : occupancyShare > 0.5
              ? 'elevated'
              : 'normal';
          const progress = document.createElement('div');
          progress.className = 'ed-dashboard__card-progress';
          progress.setAttribute('aria-hidden', 'true');
          progress.dataset.occupancyLevel = occupancyLevel;
          const fill = document.createElement('div');
          fill.className = 'ed-dashboard__card-progress-fill';
          fill.setAttribute('aria-hidden', 'true');
          fill.dataset.occupancyLevel = occupancyLevel;
          const width = `${Math.round(occupancyShare * 1000) / 10}%`;
          fill.style.setProperty('--progress-width', width);
          const occupancyText = percentFormatter.format(occupancyShare);
          progress.title = `Užimtumas: ${numberFormatter.format(Math.round(primaryRaw))}/${numberFormatter.format(totalBeds)} (${occupancyText})`;
          progress.appendChild(fill);
          visuals.push(progress);
        }
      }

      if (config.secondaryKey) {
        const deltaInfo = getEdCardDeltaInfo(primaryRaw, secondaryRaw, config.format);
        if (deltaInfo) {
          const delta = document.createElement('p');
          delta.className = 'ed-dashboard__card-delta';
          delta.dataset.trend = deltaInfo.trend;
          delta.setAttribute('aria-label', deltaInfo.ariaLabel);
          const arrowSpan = document.createElement('span');
          arrowSpan.className = 'ed-dashboard__card-delta-arrow';
          arrowSpan.textContent = deltaInfo.arrow;
          const textSpan = document.createElement('span');
          textSpan.className = 'ed-dashboard__card-delta-text';
          textSpan.textContent = deltaInfo.text;
          delta.append(arrowSpan, textSpan);
          if (deltaInfo.reference) {
            const referenceSpan = document.createElement('span');
            referenceSpan.className = 'ed-dashboard__card-delta-reference';
            referenceSpan.textContent = `vs ${deltaInfo.reference}`;
            delta.appendChild(referenceSpan);
          }
          visuals.push(delta);
        }
      }

      return visuals;
    }

    function renderTvMetrics(listElement, metrics) {
      if (!listElement) {
        return;
      }
      listElement.replaceChildren();
      const entries = Array.isArray(metrics)
        ? metrics.map((item) => ({
          label: typeof item?.label === 'string' ? item.label : '',
          value: item?.value != null && item.value !== '' ? String(item.value) : '—',
          meta: item?.meta,
        }))
        : [];
      if (!entries.length) {
        return;
      }
      entries.forEach((entry) => {
        const item = document.createElement('li');
        item.className = 'ed-tv__metric';
        const labelEl = document.createElement('p');
        labelEl.className = 'ed-tv__metric-label';
        labelEl.textContent = entry.label;
        const valueEl = document.createElement('p');
        valueEl.className = 'ed-tv__metric-value';
        valueEl.textContent = entry.value;
        item.append(labelEl, valueEl);
        const metaLines = Array.isArray(entry.meta)
          ? entry.meta
          : (entry.meta != null && entry.meta !== '' ? [entry.meta] : []);
        const filteredMeta = metaLines
          .map((line) => (line != null ? String(line) : ''))
          .map((line) => line.trim())
          .filter((line) => line.length);
        if (filteredMeta.length) {
          const metaEl = document.createElement('p');
          metaEl.className = 'ed-tv__metric-meta';
          metaEl.textContent = filteredMeta.join('\n');
          item.appendChild(metaEl);
        }
        listElement.appendChild(item);
      });
    }

    function updateEdTvPanel(summary, dispositions, displayVariant, dataset, statusInfo) {
      if (!selectors.edTvPanel) {
        return;
      }
      const tvTexts = TEXT.edTv || {};
      if (selectors.edTvTitle && tvTexts.title) {
        selectors.edTvTitle.textContent = tvTexts.title;
      }
      if (selectors.edTvSubtitle) {
        selectors.edTvSubtitle.textContent = tvTexts.subtitle || '';
      }
      const toneValue = dataset?.error
        ? 'error'
        : (dataset?.usingFallback ? 'warning' : (statusInfo?.tone || 'info'));
      selectors.edTvPanel.dataset.tone = toneValue;
      if (selectors.edTvStatusText) {
        selectors.edTvStatusText.textContent = statusInfo?.message || TEXT.ed.status.loading;
      }
      if (selectors.edTvUpdated) {
        const timestampText = statusInfo?.timestamp;
        const updatedText = timestampText
          ? (typeof tvTexts.updated === 'function'
            ? tvTexts.updated(timestampText)
            : `Atnaujinta ${timestampText}`)
          : (tvTexts.updatedUnknown || TEXT.status.loading);
        selectors.edTvUpdated.textContent = updatedText;
      }
      if (selectors.edTvNotice) {
        let noticeText = '';
        let noticeTone = '';
        if (dataset?.error) {
          noticeText = tvTexts.notices?.error || '';
          noticeTone = 'error';
        } else if (dataset?.usingFallback) {
          noticeText = tvTexts.notices?.fallback || '';
          noticeTone = 'warning';
        } else if (!statusInfo?.hasEntries) {
          noticeText = tvTexts.notices?.empty || '';
          noticeTone = 'warning';
        }
        if (noticeText) {
          selectors.edTvNotice.textContent = noticeText;
          selectors.edTvNotice.dataset.tone = noticeTone || 'info';
          selectors.edTvNotice.hidden = false;
        } else {
          selectors.edTvNotice.hidden = true;
          selectors.edTvNotice.textContent = '';
          selectors.edTvNotice.removeAttribute('data-tone');
        }
      }
      const groupTexts = tvTexts.groups?.[displayVariant] || tvTexts.groups?.snapshot || {};
      if (selectors.edTvPrimaryTitle && groupTexts.now) {
        selectors.edTvPrimaryTitle.textContent = groupTexts.now;
      }
      if (selectors.edTvStaffTitle && groupTexts.staff) {
        selectors.edTvStaffTitle.textContent = groupTexts.staff;
      }
      if (selectors.edTvFlowTitle && groupTexts.flow) {
        selectors.edTvFlowTitle.textContent = groupTexts.flow;
      }
      if (selectors.edTvTriageTitle && groupTexts.triage) {
        selectors.edTvTriageTitle.textContent = groupTexts.triage;
      }

      const metricTexts = tvTexts.metrics || {};
      const totalBeds = Number.isFinite(ED_TOTAL_BEDS) ? ED_TOTAL_BEDS : null;
      const currentPatients = Number.isFinite(summary.currentPatients) ? summary.currentPatients : null;
      const occupiedBeds = Number.isFinite(summary.occupiedBeds) ? summary.occupiedBeds : null;
      const freeBeds = totalBeds != null && occupiedBeds != null
        ? Math.max(totalBeds - occupiedBeds, 0)
        : null;
      const occupancyShare = totalBeds && occupiedBeds != null ? occupiedBeds / totalBeds : null;

      let primaryMetrics = [];
      let staffMetrics = [];
      let flowMetrics = [];

      if (displayVariant === 'snapshot') {
        const occupancyPercentText = occupancyShare != null ? percentFormatter.format(occupancyShare) : null;
        const freeShare = totalBeds && freeBeds != null && totalBeds > 0 ? freeBeds / totalBeds : null;
        const bedStatusLines = [];
        if (occupiedBeds != null) {
          const occupiedParts = [];
          if (totalBeds != null) {
            occupiedParts.push(`${numberFormatter.format(occupiedBeds)} / ${numberFormatter.format(totalBeds)} lov.`);
          } else {
            occupiedParts.push(`${numberFormatter.format(occupiedBeds)} lov.`);
          }
          if (occupancyShare != null) {
            occupiedParts.push(`(${percentFormatter.format(occupancyShare)})`);
          }
          const occupiedLabel = metricTexts.bedOccupied || metricTexts.occupiedBeds || 'Užimta';
          bedStatusLines.push(`${occupiedLabel}: ${occupiedParts.join(' ')}`.trim());
        }
        if (freeBeds != null) {
          const freeParts = [`${numberFormatter.format(freeBeds)} lov.`];
          if (freeShare != null) {
            freeParts.push(`(${percentFormatter.format(freeShare)})`);
          }
          const freeLabel = metricTexts.bedFree || metricTexts.freeBeds || 'Laisvos';
          bedStatusLines.push(`${freeLabel}: ${freeParts.join(' ')}`.trim());
        }
        const occupancyValue = occupancyPercentText
          || (occupiedBeds != null && totalBeds != null
            ? `${numberFormatter.format(occupiedBeds)} / ${numberFormatter.format(totalBeds)} lov.`
            : (occupiedBeds != null ? `${numberFormatter.format(occupiedBeds)} lov.` : '—'));

        primaryMetrics = [
          {
            label: metricTexts.currentPatients || 'Šiuo metu pacientų',
            value: currentPatients != null ? numberFormatter.format(currentPatients) : '—',
          },
          {
            label: metricTexts.bedStatus || metricTexts.occupancy || 'Lovų būklė',
            value: occupancyValue,
            meta: bedStatusLines,
          },
        ];

        const nurseRatioValue = Number.isFinite(summary.nursePatientsPerStaff)
          ? summary.nursePatientsPerStaff
          : null;
        const nurseRatioText = formatEdCardValue(nurseRatioValue, 'ratio');
        const nurseStaff = currentPatients != null && nurseRatioValue && nurseRatioValue > 0
          ? currentPatients / nurseRatioValue
          : null;
        const doctorRatioValue = Number.isFinite(summary.doctorPatientsPerStaff)
          ? summary.doctorPatientsPerStaff
          : null;
        const doctorRatioText = formatEdCardValue(doctorRatioValue, 'ratio');
        const doctorStaff = currentPatients != null && doctorRatioValue && doctorRatioValue > 0
          ? currentPatients / doctorRatioValue
          : null;

        const staffValueParts = [];
        const staffMetaLines = [];
        if (nurseRatioText) {
          const shortLabel = metricTexts.nurseRatioShort || 'Sl.';
          staffValueParts.push(`${shortLabel} ${nurseRatioText}`);
          const nurseMeta = [`${metricTexts.nurseRatio || 'Slaugytojai'}: ${nurseRatioText}`];
          if (nurseStaff != null) {
            nurseMeta.push(`(~${oneDecimalFormatter.format(nurseStaff)} slaugyt.)`);
          }
          staffMetaLines.push(nurseMeta.join(' '));
        }
        if (doctorRatioText) {
          const shortLabel = metricTexts.doctorRatioShort || 'Gyd.';
          staffValueParts.push(`${shortLabel} ${doctorRatioText}`);
          const doctorMeta = [`${metricTexts.doctorRatio || 'Gydytojai'}: ${doctorRatioText}`];
          if (doctorStaff != null) {
            doctorMeta.push(`(~${oneDecimalFormatter.format(doctorStaff)} gyd.)`);
          }
          staffMetaLines.push(doctorMeta.join(' '));
        }

        const staffCardLabel = metricTexts.staffCombined || metricTexts.nurseRatio || 'Santykiai';
        const staffCardValue = staffValueParts.length ? staffValueParts.join(' · ') : '—';
        staffMetrics = [
          {
            label: staffCardLabel,
            value: staffCardValue,
            meta: staffMetaLines,
          },
        ];

        const avgLos = formatEdCardValue(summary.avgLosMinutes, 'hours');
        if (avgLos != null) {
          flowMetrics.push({
            label: metricTexts.avgLos || 'Vid. buvimas',
            value: `${avgLos} val.`,
          });
        }
        const doorMinutes = formatEdCardValue(summary.avgDoorToProviderMinutes, 'minutes');
        if (doorMinutes != null) {
          flowMetrics.push({
            label: metricTexts.door || 'Durys → gyd.',
            value: `${doorMinutes} min.`,
          });
        }
        const decisionMinutes = formatEdCardValue(summary.avgDecisionToLeaveMinutes, 'minutes');
        if (decisionMinutes != null) {
          flowMetrics.push({
            label: metricTexts.decision || 'Sprendimas → išvykimas',
            value: `${decisionMinutes} min.`,
          });
        }
        const hospShare = formatEdCardValue(summary.hospitalizedShare, 'percent');
        if (hospShare != null) {
          flowMetrics.push({
            label: metricTexts.hospitalizedShare || 'Hospitalizuojama dalis',
            value: hospShare,
          });
        }
      } else {
        const avgDaily = Number.isFinite(summary.avgDailyPatients)
          ? oneDecimalFormatter.format(summary.avgDailyPatients)
          : null;
        const totalPatients = Number.isFinite(summary.totalPatients)
          ? numberFormatter.format(summary.totalPatients)
          : null;
        const avgLos = formatEdCardValue(summary.avgLosMinutes, 'hours');
        const hospShare = formatEdCardValue(summary.hospitalizedShare, 'percent');
        primaryMetrics = [
          {
            label: metricTexts.avgDaily || 'Vid. pacientų/d.',
            value: avgDaily ?? '—',
            meta: totalPatients ? `${totalPatients} pac. analizuota` : '',
          },
          {
            label: metricTexts.avgLos || 'Vid. buvimas',
            value: avgLos != null ? `${avgLos} val.` : '—',
          },
          {
            label: metricTexts.hospitalizedShare || 'Hospitalizuojama dalis',
            value: hospShare ?? '—',
          },
        ];

        const doorMinutes = formatEdCardValue(summary.avgDoorToProviderMinutes, 'minutes');
        const decisionMinutes = formatEdCardValue(summary.avgDecisionToLeaveMinutes, 'minutes');
        staffMetrics = [
          {
            label: metricTexts.door || 'Durys → gyd.',
            value: doorMinutes != null ? `${doorMinutes} min.` : '—',
          },
          {
            label: metricTexts.decision || 'Sprendimas → išvykimas',
            value: decisionMinutes != null ? `${decisionMinutes} min.` : '—',
          },
        ];

        const monthAvg = formatEdCardValue(summary.avgLosMonthMinutes, 'hours');
        if (monthAvg != null) {
          flowMetrics.push({
            label: metricTexts.avgLos || 'Vid. buvimas',
            value: `${monthAvg} val.`,
            meta: '',
          });
        }
        const monthShare = formatEdCardValue(summary.hospitalizedMonthShare, 'percent');
        if (monthShare != null) {
          flowMetrics.push({
            label: metricTexts.hospitalizedShare || 'Hospitalizuojama dalis',
            value: monthShare,
            meta: '',
          });
        }
      }

      renderTvMetrics(selectors.edTvPrimaryMetrics, primaryMetrics);
      renderTvMetrics(selectors.edTvStaffMetrics, staffMetrics);
      renderTvMetrics(selectors.edTvFlowMetrics, flowMetrics);

      if (selectors.edTvTriageList) {
        selectors.edTvTriageList.replaceChildren();
        const list = Array.isArray(dispositions) ? dispositions : [];
        const total = list.reduce((acc, entry) => acc + (Number.isFinite(entry?.count) ? entry.count : 0), 0);
        if (!list.length || total <= 0) {
          const emptyItem = document.createElement('li');
          emptyItem.className = 'ed-tv__triage-item';
          const label = document.createElement('p');
          label.className = 'ed-tv__triage-label';
          label.textContent = tvTexts.triageEmpty || 'Pasiskirstymo duomenų nėra.';
          emptyItem.appendChild(label);
          selectors.edTvTriageList.appendChild(emptyItem);
          if (selectors.edTvTriageMeta) {
            selectors.edTvTriageMeta.textContent = '';
          }
        } else {
          list.forEach((entry) => {
            if (!entry) {
              return;
            }
            const item = document.createElement('li');
            item.className = 'ed-tv__triage-item';
            if (entry.categoryKey) {
              item.classList.add(`ed-tv__triage-item--c${entry.categoryKey}`);
            } else {
              item.classList.add('ed-tv__triage-item--other');
            }
            const label = document.createElement('p');
            label.className = 'ed-tv__triage-label';
            label.textContent = entry.label || '';
            const meta = document.createElement('div');
            meta.className = 'ed-tv__triage-meta';
            const countSpan = document.createElement('span');
            countSpan.textContent = Number.isFinite(entry.count)
              ? numberFormatter.format(entry.count)
              : '—';
            const shareValue = Number.isFinite(entry.share)
              ? entry.share
              : (total > 0 && Number.isFinite(entry.count) ? entry.count / total : null);
            const shareSpan = document.createElement('span');
            shareSpan.textContent = shareValue != null ? percentFormatter.format(shareValue) : '—';
            meta.append(countSpan, shareSpan);
            const bar = document.createElement('div');
            bar.className = 'ed-tv__triage-bar';
            const fill = document.createElement('div');
            fill.className = 'ed-tv__triage-bar-fill';
            if (shareValue != null) {
              const width = Math.max(0, Math.min(100, shareValue * 100));
              fill.style.width = `${width}%`;
            } else {
              fill.style.width = '0%';
            }
            bar.appendChild(fill);
            item.append(label, meta, bar);
            selectors.edTvTriageList.appendChild(item);
          });
          if (selectors.edTvTriageMeta) {
            const totalText = numberFormatter.format(total);
            selectors.edTvTriageMeta.textContent = typeof tvTexts.triageTotal === 'function'
              ? tvTexts.triageTotal(totalText)
              : `Iš viso: ${totalText}`;
          }
        }
      }
    }

    const MIN_STATUS_YEAR = 2000;
    const MAX_STATUS_FUTURE_OFFSET_MS = 7 * 24 * 60 * 60 * 1000;

    function normalizeStatusTimestamp(candidate, fallback) {
      const fallbackDate = fallback instanceof Date && !Number.isNaN(fallback.getTime())
        ? fallback
        : null;
      if (!(candidate instanceof Date) || Number.isNaN(candidate.getTime())) {
        return fallbackDate;
      }
      const year = candidate.getFullYear();
      const now = Date.now();
      const candidateTime = candidate.getTime();
      if (year < MIN_STATUS_YEAR || candidateTime > now + MAX_STATUS_FUTURE_OFFSET_MS) {
        console.warn('Ignoruojamas neadekvatus ED momentinio vaizdo laiko žymuo:', candidate.toISOString());
        return fallbackDate;
      }
      return candidate;
    }

    function buildEdStatus(summary, dataset, displayVariant) {
      const updatedAt = dataset?.updatedAt instanceof Date && !Number.isNaN(dataset.updatedAt.getTime())
        ? dataset.updatedAt
        : null;
      const snapshotDateRaw = summary?.latestSnapshotAt instanceof Date && !Number.isNaN(summary.latestSnapshotAt.getTime())
        ? summary.latestSnapshotAt
        : null;
      const statusDate = normalizeStatusTimestamp(snapshotDateRaw, updatedAt) || updatedAt || null;
      const timestampText = statusDate ? statusTimeFormatter.format(statusDate) : null;
      const hasEntries = displayVariant === 'snapshot'
        ? Number.isFinite(summary?.entryCount) && summary.entryCount > 0
        : Number.isFinite(summary?.totalPatients) && summary.totalPatients > 0;
      let tone = 'info';
      let message = '';
      if (dataset?.error) {
        message = TEXT.ed.status.error(dataset.error);
        tone = 'error';
      } else if (dataset?.usingFallback) {
        const reason = dataset.lastErrorMessage || TEXT.ed.status.noUrl;
        message = TEXT.ed.status.fallback(reason, timestampText);
        tone = 'warning';
      } else if (!hasEntries) {
        message = TEXT.ed.status.empty;
        tone = 'warning';
      } else {
        const successTimestamp = timestampText || statusTimeFormatter.format(new Date());
        message = TEXT.ed.status.success(successTimestamp);
        tone = 'success';
      }
    return {
      message,
      tone,
      timestamp: timestampText,
      statusDate,
      updatedAt,
      hasEntries,
    };
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';

  const edSectionIconDefinitions = {
    flow(svg) {
      [
        ['3', '3'],
        ['15', '3'],
        ['3', '15'],
        ['15', '15'],
      ].forEach(([x, y]) => {
        svg.appendChild(createSvgElement('rect', {
          x,
          y,
          width: '6',
          height: '6',
          rx: '1.6',
          fill: 'none',
        }));
      });
      svg.appendChild(createSvgElement('path', { d: 'M9 6h6' }));
      svg.appendChild(createSvgElement('path', { d: 'M12 9v6' }));
      svg.appendChild(createSvgElement('path', { d: 'M18 9v6' }));
      svg.appendChild(createSvgElement('path', { d: 'M9 18h6' }));
    },
    efficiency(svg) {
      svg.appendChild(createSvgElement('circle', { cx: '12', cy: '12', r: '9' }));
      svg.appendChild(createSvgElement('polyline', { points: '12 7 12 12 15 15' }));
    },
    staffing(svg) {
      svg.appendChild(createSvgElement('circle', { cx: '8.5', cy: '8.5', r: '3' }));
      svg.appendChild(createSvgElement('circle', { cx: '15.5', cy: '8.5', r: '3' }));
      svg.appendChild(createSvgElement('path', { d: 'M4.5 20v-1.6A4.5 4.5 0 0 1 9 13.8h0A4.5 4.5 0 0 1 13.5 18.3V20' }));
      svg.appendChild(createSvgElement('path', { d: 'M11 20v-1.2a4.5 4.5 0 0 1 4.5-4.5h0a4.5 4.5 0 0 1 4.5 4.5V20' }));
    },
    insights(svg) {
      svg.appendChild(createSvgElement('path', { d: 'M12 3a5 5 0 0 1 5 5c0 1.7-.8 3.2-2.1 4.1-.6.4-.9 1-.9 1.7V16h-4v-2.2c0-.7-.3-1.3-.9-1.7A5 5 0 0 1 7 8a5 5 0 0 1 5-5z' }));
      svg.appendChild(createSvgElement('path', { d: 'M10 18h4' }));
      svg.appendChild(createSvgElement('path', { d: 'M9 21h6' }));
    },
    default(svg) {
      svg.appendChild(createSvgElement('circle', { cx: '12', cy: '12', r: '9' }));
      svg.appendChild(createSvgElement('path', { d: 'M12 7v10' }));
      svg.appendChild(createSvgElement('path', { d: 'M7 12h10' }));
    },
  };

  function createSvgElement(type, attributes = {}) {
    const element = document.createElementNS(SVG_NS, type);
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });
    element.setAttribute('stroke-linecap', 'round');
    element.setAttribute('stroke-linejoin', 'round');
    return element;
  }

  function createEdSectionIcon(iconKey) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const iconName = iconKey && edSectionIconDefinitions[iconKey]
      ? iconKey
      : 'default';
    edSectionIconDefinitions[iconName](svg);
    return svg;
  }

  function normalizeEdSearchQuery(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim().toLowerCase();
  }

  function matchesEdSearch(record, query) {
    if (!query) {
      return true;
    }
    const haystack = [
      record?.disposition,
      record?.dispositionCategory,
      record?.nurseRatioText,
      record?.doctorRatioText,
      record?.rawTimestamp,
      record?.dateKey,
    ]
      .filter((part) => typeof part === 'string')
      .map((part) => part.toLowerCase())
      .join(' ');
    return haystack.includes(query);
  }

  function applyEdSearchFilter(query) {
    dashboardState.edSearchQuery = normalizeEdSearchQuery(query);
    renderEdDashboard(dashboardState.ed);
  }

  async function renderEdDashboard(edData) {
    if (!selectors.edPanel) {
      return;
    }
      const baseDataset = edData || {};
      const searchQuery = normalizeEdSearchQuery(dashboardState.edSearchQuery);
      const baseRecords = Array.isArray(baseDataset.records) ? baseDataset.records : [];
      let dataset = baseDataset;
      if (searchQuery) {
        const filteredRecords = baseRecords.filter((record) => matchesEdSearch(record, searchQuery));
        const aggregates = summarizeEdRecords(filteredRecords, baseDataset.meta || {});
        dataset = {
          ...baseDataset,
          records: filteredRecords,
          summary: aggregates.summary,
          dispositions: aggregates.dispositions,
          daily: aggregates.daily,
          meta: { ...(baseDataset.meta || {}), searchQuery },
        };
      }
      const summary = dataset.summary || createEmptyEdSummary(dataset.meta?.type);
      const dispositions = Array.isArray(dataset.dispositions) ? dataset.dispositions : [];
      const summaryMode = typeof summary?.mode === 'string' ? summary.mode : (dataset.meta?.type || 'legacy');
      const hasSnapshotMetrics = Number.isFinite(summary?.currentPatients)
        || Number.isFinite(summary?.occupiedBeds)
        || Number.isFinite(summary?.nursePatientsPerStaff)
        || Number.isFinite(summary?.doctorPatientsPerStaff);
      const displayVariant = summaryMode === 'snapshot'
        || (summaryMode === 'hybrid' && hasSnapshotMetrics)
        ? 'snapshot'
        : 'legacy';

      const overviewDailyStats = Array.isArray(dashboardState?.kpi?.daily) && dashboardState.kpi.daily.length
        ? dashboardState.kpi.daily
        : (Array.isArray(dashboardState.dailyStats) ? dashboardState.dailyStats : []);
      const configuredWindowRaw = Number.isFinite(Number(dashboardState?.kpi?.filters?.window))
        ? Number(dashboardState.kpi.filters.window)
        : (Number.isFinite(Number(settings?.calculations?.windowDays))
          ? Number(settings.calculations.windowDays)
          : DEFAULT_KPI_WINDOW_DAYS);
      const configuredWindow = Number.isFinite(configuredWindowRaw) && configuredWindowRaw > 0
        ? configuredWindowRaw
        : DEFAULT_KPI_WINDOW_DAYS;
      if (overviewDailyStats.length) {
        const overviewMetrics = buildYearMonthMetrics(overviewDailyStats, configuredWindow);
        if (overviewMetrics) {
          const { yearMetrics, monthMetrics } = overviewMetrics;
          const yearAvgMinutes = Number.isFinite(yearMetrics?.avgTime) ? yearMetrics.avgTime * 60 : null;
          const yearHospLosMinutes = Number.isFinite(yearMetrics?.avgHospitalizedTime)
            ? yearMetrics.avgHospitalizedTime * 60
            : null;
          const monthAvgMinutes = Number.isFinite(monthMetrics?.avgTime) ? monthMetrics.avgTime * 60 : null;
          const yearHospShare = Number.isFinite(yearMetrics?.hospitalizedShare) ? yearMetrics.hospitalizedShare : null;
          const monthHospShare = Number.isFinite(monthMetrics?.hospitalizedShare) ? monthMetrics.hospitalizedShare : null;

          summary.avgLosMinutes = yearAvgMinutes != null ? yearAvgMinutes : summary.avgLosMinutes;
          summary.avgLosHospitalizedMinutes = yearHospLosMinutes != null ? yearHospLosMinutes : summary.avgLosHospitalizedMinutes;
          summary.avgLosYearMinutes = yearAvgMinutes != null ? yearAvgMinutes : null;
          summary.avgLosMonthMinutes = monthAvgMinutes != null ? monthAvgMinutes : null;
          summary.hospitalizedShare = yearHospShare != null ? yearHospShare : summary.hospitalizedShare;
          summary.hospitalizedYearShare = yearHospShare != null ? yearHospShare : null;
          summary.hospitalizedMonthShare = monthHospShare != null ? monthHospShare : null;
        }
      }
      const overviewRecords = Array.isArray(dashboardState?.primaryRecords) && dashboardState.primaryRecords.length
        ? dashboardState.primaryRecords
        : (Array.isArray(dashboardState?.rawRecords) ? dashboardState.rawRecords : []);
      enrichSummaryWithOverviewFallback(summary, overviewRecords, overviewDailyStats, { windowDays: configuredWindow });
      const cardsConfigSource = TEXT.ed.cards || {};
      const cardConfigs = Array.isArray(cardsConfigSource[displayVariant]) ? cardsConfigSource[displayVariant] : [];
      const dispositionsText = TEXT.ed.dispositions?.[displayVariant] || TEXT.ed.dispositions?.legacy || {};
      const updatedAt = summary.generatedAt instanceof Date && !Number.isNaN(summary.generatedAt.getTime())
        ? summary.generatedAt
        : (dataset.updatedAt instanceof Date && !Number.isNaN(dataset.updatedAt.getTime()) ? dataset.updatedAt : null);

      if (selectors.edCards) {
        selectors.edCards.replaceChildren();
        const sectionDefinitions = TEXT.ed.cardSections || {};
        const sectionsMap = new Map();

        cardConfigs.forEach((config) => {
          if (!config || typeof config !== 'object') {
            return;
          }
          const sectionKey = config.section || 'default';
          if (!sectionsMap.has(sectionKey)) {
            const sectionMeta = sectionDefinitions[sectionKey] || sectionDefinitions.default || {};
            sectionsMap.set(sectionKey, {
              key: sectionKey,
              title: sectionMeta.title || '',
              description: sectionMeta.description || '',
              icon: sectionMeta.icon || '',
              cards: [],
            });
          }
          sectionsMap.get(sectionKey).cards.push(config);
        });

        const groupedSections = Array.from(sectionsMap.values());
        if (!groupedSections.length && cardConfigs.length) {
          groupedSections.push({
            key: 'default',
            title: sectionDefinitions?.default?.title || '',
            description: sectionDefinitions?.default?.description || '',
            icon: sectionDefinitions?.default?.icon || '',
            cards: cardConfigs.filter((config) => config && typeof config === 'object'),
          });
        }

        groupedSections.forEach((section, sectionIndex) => {
          if (!Array.isArray(section.cards) || !section.cards.length) {
            return;
          }
          const sectionEl = document.createElement('section');
          sectionEl.className = 'ed-dashboard__section';
          sectionEl.setAttribute('role', 'region');

          const shouldRenderHeader = Boolean(section.title || section.description || groupedSections.length > 1);
          let sectionLabelId = '';
          if (shouldRenderHeader) {
            const header = document.createElement('header');
            header.className = 'ed-dashboard__section-header';

            const iconWrapper = document.createElement('span');
            iconWrapper.className = 'ed-dashboard__section-icon';
            const iconKey = section.icon || (section.key !== 'default' ? section.key : 'default');
            iconWrapper.appendChild(createEdSectionIcon(iconKey));
            header.appendChild(iconWrapper);

            const textWrapper = document.createElement('div');
            textWrapper.className = 'ed-dashboard__section-header-text';
            const titleEl = document.createElement('h3');
            sectionLabelId = `edSectionTitle-${String(section.key || sectionIndex).replace(/[^a-z0-9_-]/gi, '') || sectionIndex}`;
            titleEl.className = 'ed-dashboard__section-title';
            titleEl.id = sectionLabelId;
            titleEl.textContent = section.title || sectionDefinitions?.default?.title || TEXT.ed.title || 'RŠL SMPS skydelis';
            textWrapper.appendChild(titleEl);

            if (section.description || sectionDefinitions?.default?.description) {
              const descriptionEl = document.createElement('p');
              descriptionEl.className = 'ed-dashboard__section-description';
              descriptionEl.textContent = section.description || sectionDefinitions?.default?.description || '';
              textWrapper.appendChild(descriptionEl);
            }

            header.appendChild(textWrapper);
            sectionEl.appendChild(header);
            sectionEl.setAttribute('aria-labelledby', sectionLabelId);
          }

          const cardsWrapper = document.createElement('div');
          cardsWrapper.className = 'ed-dashboard__section-grid';
          cardsWrapper.setAttribute('role', 'list');
          if (sectionLabelId) {
            cardsWrapper.setAttribute('aria-labelledby', sectionLabelId);
          }

          section.cards.forEach((config) => {
            if (!config || typeof config !== 'object') {
              return;
            }
            const card = document.createElement('article');
            card.className = 'ed-dashboard__card';
            card.setAttribute('role', 'listitem');

            const isDonutCard = config.type === 'donut';
            if (isDonutCard) {
              card.classList.add('ed-dashboard__card--donut');
            }

            const title = document.createElement('p');
            title.className = 'ed-dashboard__card-title';
            title.textContent = config.title;
            if (isDonutCard) {
              title.id = 'edDispositionsTitle';
            }
            card.appendChild(title);

            if (isDonutCard) {
              const chartWrapper = document.createElement('div');
              chartWrapper.className = 'ed-dashboard__donut-chart';
              const canvas = document.createElement('canvas');
              canvas.id = 'edDispositionsChart';
              canvas.setAttribute('role', 'img');
              canvas.setAttribute('aria-labelledby', 'edDispositionsTitle');
              chartWrapper.appendChild(canvas);
              card.appendChild(chartWrapper);

              const message = document.createElement('p');
              message.className = 'ed-dashboard__chart-message';
              message.id = 'edDispositionsMessage';
              message.setAttribute('role', 'status');
              message.hidden = true;
              card.appendChild(message);

              cardsWrapper.appendChild(card);
              return;
            }

            const value = document.createElement('p');
            value.className = 'ed-dashboard__card-value';
            const primaryRaw = summary?.[config.key];
            const secondaryRaw = config.secondaryKey ? summary?.[config.secondaryKey] : undefined;
            let hasValue = false;
            if (config.secondaryKey) {
              const primaryFormatted = formatEdCardValue(primaryRaw, config.format);
              const secondaryFormatted = formatEdCardValue(secondaryRaw, config.format);
              const suffix = config.format === 'hours'
                ? ' val.'
                : (config.format === 'minutes' ? ' min.' : '');
              const primaryText = primaryFormatted != null
                ? `${primaryFormatted}${suffix}`
                : '—';
              const secondaryText = secondaryFormatted != null
                ? `${secondaryFormatted}${suffix}`
                : '—';
              if (primaryFormatted != null || secondaryFormatted != null) {
                value.textContent = `${primaryText} / ${secondaryText}`;
                hasValue = true;
              }
            } else {
              const formatted = formatEdCardValue(primaryRaw, config.format);
              if (formatted != null) {
                if (config.format === 'hours') {
                  value.textContent = `${formatted} val.`;
                } else if (config.format === 'minutes') {
                  value.textContent = `${formatted} min.`;
                } else {
                  value.textContent = formatted;
                }
                hasValue = true;
              }
            }
            if (!hasValue) {
              value.textContent = config.empty ?? '—';
            }

            const meta = document.createElement('p');
            meta.className = 'ed-dashboard__card-meta';
            const metaRaw = config.metaKey ? summary?.[config.metaKey] : null;
            const metaText = typeof metaRaw === 'string'
              ? metaRaw.trim()
              : (metaRaw != null ? String(metaRaw).trim() : '');
            meta.textContent = metaText.length ? metaText : (config.description || '');

            card.appendChild(value);

            const visuals = buildEdCardVisuals(config, primaryRaw, secondaryRaw);
            visuals.forEach((node) => {
              card.appendChild(node);
            });

            card.appendChild(meta);
            cardsWrapper.appendChild(card);
          });

          sectionEl.appendChild(cardsWrapper);
          selectors.edCards.appendChild(sectionEl);
        });
      }

      selectors.edDispositionsTitle = document.getElementById('edDispositionsTitle');
      selectors.edDispositionsChart = document.getElementById('edDispositionsChart');
      selectors.edDispositionsMessage = document.getElementById('edDispositionsMessage');

      if (selectors.edDispositionsTitle) {
        selectors.edDispositionsTitle.textContent = dispositionsText.title || '';
      }
      if (selectors.edDispositionsMessage) {
        selectors.edDispositionsMessage.hidden = true;
        selectors.edDispositionsMessage.textContent = '';
      }

      try {
        await renderEdDispositionsChart(dispositions, dispositionsText, displayVariant);
      } catch (error) {
        console.error('Nepavyko atvaizduoti pacientų kategorijų grafiko:', error);
        if (selectors.edDispositionsChart) {
          selectors.edDispositionsChart.hidden = true;
          selectors.edDispositionsChart.setAttribute('aria-hidden', 'true');
        }
        if (selectors.edDispositionsMessage) {
          selectors.edDispositionsMessage.textContent = dispositionsText.empty || 'Nepavyko atvaizduoti grafiko.';
          selectors.edDispositionsMessage.hidden = false;
        }
      }

      const statusInfo = buildEdStatus(summary, dataset, displayVariant);
      if (selectors.edStatus) {
        const tone = statusInfo.tone || 'info';
        const pillText = tone === 'success'
          ? (statusInfo.timestamp || statusInfo.message || TEXT.ed.status.loading)
          : (statusInfo.message || TEXT.ed.status.loading);
        selectors.edStatus.textContent = pillText;
        selectors.edStatus.dataset.tone = tone;
      }
      updateEdTvPanel(summary, dispositions, displayVariant, dataset, statusInfo);
    }

    async function renderEdDispositionsChart(dispositions, text, displayVariant) {
      const canvas = selectors.edDispositionsChart;
      const messageEl = selectors.edDispositionsMessage || null;

      if (!canvas) {
        if (messageEl) {
          messageEl.textContent = '';
          messageEl.hidden = true;
        }
        return;
      }

      if (messageEl) {
        messageEl.textContent = '';
        messageEl.hidden = true;
      }

      if (dashboardState.charts.edDispositions && typeof dashboardState.charts.edDispositions.destroy === 'function') {
        dashboardState.charts.edDispositions.destroy();
      }
      dashboardState.charts.edDispositions = null;

      const validEntries = Array.isArray(dispositions)
        ? dispositions
          .filter((entry) => Number.isFinite(entry?.count) && entry.count >= 0)
          .map((entry, index) => ({
            ...entry,
            categoryKey: entry?.categoryKey != null ? String(entry.categoryKey) : null,
            label: entry?.label || `Kategorija ${entry?.categoryKey ?? index + 1}`,
          }))
        : [];

      if (!validEntries.length) {
        canvas.hidden = true;
        canvas.setAttribute('aria-hidden', 'true');
        if (messageEl) {
          messageEl.textContent = text?.empty || 'Nėra duomenų grafiko sudarymui.';
          messageEl.hidden = false;
        }
        return;
      }

      const Chart = await loadChartJs();
      if (!Chart) {
        throw new Error('Chart.js biblioteka nepasiekiama');
      }
      if (!dashboardState.chartLib) {
        dashboardState.chartLib = Chart;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Nepavyko gauti grafiko konteksto');
      }

      canvas.hidden = false;
      canvas.removeAttribute('aria-hidden');
      if (text?.caption) {
        canvas.setAttribute('aria-description', text.caption);
      } else {
        canvas.removeAttribute('aria-description');
      }

      const palette = getThemePalette();
      const styleTarget = getThemeStyleTarget();
      const computedStyles = getComputedStyle(styleTarget);
      const theme = styleTarget?.dataset?.theme || 'light';

      const CATEGORY_COLORS = {
        '1': '#2563eb', // mėlyna
        '2': '#ef4444', // raudona
        '3': '#f59e0b', // geltona
        '4': '#22c55e', // žalia
        '5': '#6b7280', // pilka
      };
      const accentRgb = ensureRgb(palette.accent);
      const accentSoftRgb = ensureRgb(palette.accentSoft, mixRgbColors(accentRgb, { r: 255, g: 255, b: 255 }, 0.65));
      const surfaceColor = computedStyles.getPropertyValue('--color-surface').trim() || (theme === 'dark' ? '#0f172a' : '#ffffff');
      const surfaceRgb = ensureRgb(surfaceColor, theme === 'dark' ? { r: 15, g: 23, b: 42 } : { r: 255, g: 255, b: 255 });
      const textColor = computedStyles.getPropertyValue('--color-text').trim() || (theme === 'dark' ? '#e2e8f0' : '#0f172a');
      const textRgb = ensureRgb(textColor, theme === 'dark' ? { r: 226, g: 232, b: 240 } : { r: 15, g: 23, b: 42 });
      const isDarkTheme = theme === 'dark';

      const sequentialPalette = createSequentialPalette(accentRgb, accentSoftRgb, surfaceRgb, validEntries.length, theme);
      const baseAlpha = theme === 'dark' ? 0.88 : 0.94;
      const alphaStep = theme === 'dark' ? -0.025 : -0.035;

      const backgroundColors = validEntries.map((entry, index) => {
        const key = entry?.categoryKey != null ? String(entry.categoryKey) : null;
        if (key && CATEGORY_COLORS[key]) {
          const presetRgb = ensureRgb(CATEGORY_COLORS[key]);
          return rgbToRgba(presetRgb, Math.max(0.45, baseAlpha + alphaStep * index));
        }
        const paletteIndex = sequentialPalette.length ? index % sequentialPalette.length : index;
        const fillRgb = sequentialPalette[paletteIndex] || accentRgb;
        return rgbToRgba(fillRgb, Math.max(0.45, baseAlpha + alphaStep * paletteIndex));
      });

      const values = validEntries.map((entry) => Number(entry.count) || 0);
      const total = values.reduce((sum, value) => (Number.isFinite(value) ? sum + value : sum), 0);

      const chartEntries = validEntries.map((entry, index) => {
        const count = Number(values[index]) || 0;
        const percent = total > 0 ? count / total : 0;
        return {
          ...entry,
          count,
          percent,
          color: backgroundColors[index] || palette.accent,
        };
      });

      const formatValue = (value) => {
        if (!Number.isFinite(value)) {
          return '—';
        }
        if (displayVariant === 'snapshot') {
          return numberFormatter.format(Math.round(value));
        }
        if (Math.abs(value) >= 1) {
          return oneDecimalFormatter.format(value);
        }
        return decimalFormatter.format(value);
      };

      const datasetLabel = text?.title || 'Pacientų kategorijos';
      const totalLabel = text?.centerLabel || 'Viso pacientų';

      const labels = chartEntries.map((entry) => entry.label);
      const ariaSummary = chartEntries
        .map((entry) => {
          const value = formatValue(entry.count);
          const percent = percentFormatter.format(entry.percent);
          return `${entry.label}: ${value} (${percent})`;
        })
        .filter(Boolean)
        .join('; ');
      if (ariaSummary) {
        const ariaParts = [`${datasetLabel} – ${ariaSummary}`];
        if (total > 0) {
          ariaParts.push(`${totalLabel}: ${formatValue(total)}`);
        }
        canvas.setAttribute('aria-label', ariaParts.join('. '));
      } else {
        canvas.setAttribute('aria-label', datasetLabel);
      }

      const computedFontFamily = (computedStyles.fontFamily || '').trim();

      const donutLabelsPlugin = {
        id: 'edDonutPercentLabels',
        afterDatasetsDraw(chartArg, _args, pluginOptions = {}) {
          const dataset = chartArg.data?.datasets?.[0];
          if (!dataset) {
            return;
          }
          const meta = chartArg.getDatasetMeta(0);
          if (!meta?.data?.length) {
            return;
          }
          const rawValues = Array.isArray(dataset.data) ? dataset.data : [];
          const totalValue = rawValues.reduce((sum, value) => {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? sum + numeric : sum;
          }, 0);
          if (totalValue <= 0) {
            return;
          }

          const ctx = chartArg.ctx;
          const baseColor = ensureRgb(pluginOptions.baseColor, textRgb);
          const contrastColor = ensureRgb(pluginOptions.contrastColor, surfaceRgb);
          const fallbackColor = ensureRgb(pluginOptions.fallbackColor, accentRgb);
          const minShare = Number.isFinite(pluginOptions.minShare)
            ? Math.max(0, pluginOptions.minShare)
            : 0;
          const fontWeight = pluginOptions.fontWeight || 600;
          const area = chartArg.chartArea;
          const areaSize = area ? Math.min(area.width, area.height) : Math.min(chartArg.width, chartArg.height);
          const resolvedFontSize = Number.isFinite(pluginOptions.fontSize) && pluginOptions.fontSize > 0
            ? pluginOptions.fontSize
            : Math.max(Math.round(areaSize / 7.5), 14);
          const fontFamily = pluginOptions.fontFamily
            || Chart.defaults.font.family
            || computedFontFamily
            || computedStyles.fontFamily;

          const contrastRatio = (lum1, lum2) => {
            const [lighter, darker] = lum1 >= lum2 ? [lum1, lum2] : [lum2, lum1];
            return (lighter + 0.05) / (darker + 0.05);
          };

          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const placed = [];

          meta.data.forEach((arc, index) => {
            const rawValue = Number(rawValues[index]);
            if (!Number.isFinite(rawValue) || rawValue <= 0) {
              return;
            }
            const share = rawValue / totalValue;
            if (share < minShare) {
              return;
            }

            const props = arc.getProps(['x', 'y', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius'], true);
            const angle = (props.startAngle + props.endAngle) / 2;
            const baseRadius = ((props.innerRadius || 0) + (props.outerRadius || 0)) / 2;
            const scale = share < 0.06 ? 0.82 : (share < 0.12 ? 0.94 : 1.05);
            const fontSize = Math.max(Math.round(resolvedFontSize * scale), 12);
            const percentText = `${Math.round(share * 100)}%`;

            ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

            const metrics = ctx.measureText(percentText);
            const textWidth = Math.max(metrics.width || 0, fontSize * 0.9);
            const textHeight = Math.max(
              (metrics.actualBoundingBoxAscent || 0) + (metrics.actualBoundingBoxDescent || 0),
              fontSize * 0.9,
            );

            const backgroundColor = ensureRgb(
              Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor[index] : dataset.backgroundColor,
              fallbackColor,
            );
            const backgroundLum = relativeLuminance(backgroundColor);
            const baseLum = relativeLuminance(baseColor);
            const contrastLum = relativeLuminance(contrastColor);
            const useBase = contrastRatio(backgroundLum, baseLum) >= contrastRatio(backgroundLum, contrastLum);
            const textFill = useBase ? baseColor : contrastColor;
            const haloColor = useBase ? contrastColor : baseColor;

            const minDistance = Math.max(Math.hypot(textWidth, textHeight) * 0.8, fontSize * 1.25, 16);
            let radius = baseRadius * (share < 0.12 ? 0.94 : 1.02);
            const maxRadius = (props.outerRadius || radius) * 1.1;
            const angleStep = (Math.PI / 180) * 6;

            const buildCandidate = (offsetAngle, r) => ({
              x: props.x + Math.cos(angle + offsetAngle) * r,
              y: props.y + Math.sin(angle + offsetAngle) * r,
              width: textWidth,
              height: textHeight,
            });

            const overlaps = (pos, candidate) => {
              const dx = Math.abs(pos.x - candidate.x);
              const dy = Math.abs(pos.y - candidate.y);
              const overlapX = dx < (pos.width + candidate.width) / 2;
              const overlapY = dy < (pos.height + candidate.height) / 2;
              return (overlapX && overlapY) || Math.hypot(dx, dy) < minDistance;
            };

            let attempt = 0;
            let angleOffset = 0;
            let candidate = buildCandidate(angleOffset, radius);
            while (
              attempt < 10
              && placed.some((pos) => overlaps(pos, candidate))
            ) {
              const direction = attempt % 2 === 0 ? 1 : -1;
              angleOffset += direction * angleStep;
              radius = Math.min(maxRadius, radius + Math.max(fontSize * 0.35, 4));
              candidate = buildCandidate(angleOffset, radius);
              attempt += 1;
            }
            placed.push(candidate);

            ctx.lineWidth = Math.max(Math.round(fontSize / 3.1), 3);
            ctx.strokeStyle = `rgba(${haloColor.r}, ${haloColor.g}, ${haloColor.b}, ${isDarkTheme ? 0.4 : 0.28})`;
            ctx.lineJoin = 'round';
            ctx.strokeText(percentText, candidate.x, candidate.y);

            ctx.fillStyle = `rgb(${textFill.r}, ${textFill.g}, ${textFill.b})`;
            ctx.fillText(percentText, candidate.x, candidate.y);
          });

          ctx.restore();
        },
      };

      const chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [
            {
              label: datasetLabel,
              data: chartEntries.map((entry) => entry.count),
              backgroundColor: backgroundColors,
              borderWidth: 0,
              hoverOffset: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          radius: '90%',
          animation: false,
          events: [],
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
            edDonutPercentLabels: {
              baseColor: textColor,
              contrastColor: surfaceColor,
              fallbackColor: palette.accent,
              minShare: 0,
              fontFamily: computedFontFamily || Chart.defaults.font.family,
              fontWeight: 700,
            },
          },
        },
        plugins: [donutLabelsPlugin],
      });

      dashboardState.charts.edDispositions = chartInstance;
    }
    function clampColorChannel(value) {
      return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
    }

    function parseColorToRgb(color) {
      if (typeof color !== 'string') {
        return null;
      }
      const trimmed = color.trim();
      if (!trimmed) {
        return null;
      }
      if (trimmed.startsWith('#')) {
        let hex = trimmed.slice(1);
        if (hex.length === 3 || hex.length === 4) {
          hex = hex
            .split('')
            .map((char) => char + char)
            .join('');
        }
        if (hex.length === 6 || hex.length === 8) {
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          if ([r, g, b].every((channel) => Number.isFinite(channel))) {
            return { r, g, b };
          }
        }
        return null;
      }
      const rgbMatch = trimmed.match(/rgba?\(([^)]+)\)/i);
      if (rgbMatch) {
        const parts = rgbMatch[1]
          .split(',')
          .map((part) => Number.parseFloat(part.trim()))
          .filter((value, index) => index < 3 && Number.isFinite(value));
        if (parts.length === 3) {
          const [r, g, b] = parts;
          return { r: clampColorChannel(r), g: clampColorChannel(g), b: clampColorChannel(b) };
        }
      }
      return null;
    }

    function relativeLuminance({ r, g, b }) {
      const normalize = (channel) => {
        const ratio = channel / 255;
        if (ratio <= 0.03928) {
          return ratio / 12.92;
        }
        return ((ratio + 0.055) / 1.055) ** 2.4;
      };
      const linearR = normalize(clampColorChannel(r));
      const linearG = normalize(clampColorChannel(g));
      const linearB = normalize(clampColorChannel(b));
      return 0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB;
    }

    function rgbToRgba(rgb, alpha) {
      const safeAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
      const formattedAlpha = safeAlpha === 1 ? '1' : Number(safeAlpha.toFixed(3)).toString();
      return `rgba(${clampColorChannel(rgb.r)}, ${clampColorChannel(rgb.g)}, ${clampColorChannel(rgb.b)}, ${formattedAlpha})`;
    }

    function ensureRgb(color, fallback) {
      const parsed = typeof color === 'string' ? parseColorToRgb(color) : null;
      if (parsed) {
        return parsed;
      }
      if (fallback && typeof fallback === 'object') {
        const { r, g, b } = fallback;
        if ([r, g, b].every((channel) => Number.isFinite(channel))) {
          return {
            r: clampColorChannel(r),
            g: clampColorChannel(g),
            b: clampColorChannel(b),
          };
        }
      }
      return { r: 37, g: 99, b: 235 };
    }

    function mixRgbColors(rgbA, rgbB, weight) {
      const hasA = rgbA && [rgbA.r, rgbA.g, rgbA.b].every((channel) => Number.isFinite(channel));
      const hasB = rgbB && [rgbB.r, rgbB.g, rgbB.b].every((channel) => Number.isFinite(channel));
      if (!hasA && !hasB) {
        return { r: 37, g: 99, b: 235 };
      }
      if (!hasA) {
        return {
          r: clampColorChannel(rgbB.r),
          g: clampColorChannel(rgbB.g),
          b: clampColorChannel(rgbB.b),
        };
      }
      if (!hasB) {
        return {
          r: clampColorChannel(rgbA.r),
          g: clampColorChannel(rgbA.g),
          b: clampColorChannel(rgbA.b),
        };
      }
      const ratio = Number.isFinite(weight) ? Math.max(0, Math.min(1, weight)) : 0;
      const inverse = 1 - ratio;
      return {
        r: clampColorChannel(rgbA.r * inverse + rgbB.r * ratio),
        g: clampColorChannel(rgbA.g * inverse + rgbB.g * ratio),
        b: clampColorChannel(rgbA.b * inverse + rgbB.b * ratio),
      };
    }

    function createSequentialPalette(baseRgb, softRgb, surfaceRgb, count, theme) {
      const safeCount = Math.max(1, Math.floor(Number(count)) || 1);
      const palette = [];
      const softenTarget = mixRgbColors(softRgb, surfaceRgb, theme === 'dark' ? 0.18 : 0.32);
      for (let index = 0; index < safeCount; index += 1) {
        const progress = safeCount === 1 ? 0.5 : index / (safeCount - 1);
        const softened = mixRgbColors(baseRgb, softRgb, 0.2 + progress * 0.18);
        const tinted = mixRgbColors(softened, softenTarget, theme === 'dark' ? progress * 0.16 : progress * 0.28);
        palette.push(tinted);
      }
      return palette;
    }

    function buildFunnelTextPalette(baseColor) {
      const fallbackRgb = { r: 15, g: 23, b: 42 };
      const rgb = parseColorToRgb(baseColor) || fallbackRgb;
      const luminance = relativeLuminance(rgb);
      const isLightText = luminance > 0.55;
      return {
        value: rgbToRgba(rgb, isLightText ? 0.94 : 0.98),
        label: rgbToRgba(rgb, isLightText ? 0.82 : 0.74),
        percent: rgbToRgba(rgb, isLightText ? 0.72 : 0.66),
        guide: rgbToRgba(rgb, isLightText ? 0.52 : 0.22),
        outline: rgbToRgba(rgb, isLightText ? 0.36 : 0.2),
        fallback: rgbToRgba(rgb, isLightText ? 0.9 : 0.92),
        shadow: isLightText ? 'rgba(8, 12, 32, 0.45)' : 'rgba(255, 255, 255, 0.3)',
        shadowBlur: isLightText ? 8 : 5,
      };
    }

    function drawFunnelShape(canvas, steps, accentColor, textColor) {
      if (!canvas) {
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) {
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      const rawValues = steps.map((step) => step.value || 0);
      const baselineValue = rawValues.length ? rawValues[0] : 0;
      const maxValue = Math.max(baselineValue, ...rawValues);
      const fontFamily = getComputedStyle(getThemeStyleTarget()).fontFamily;
      const textPalette = buildFunnelTextPalette(textColor);

      if (!Number.isFinite(maxValue) || maxValue <= 0) {
        ctx.fillStyle = textPalette.fallback;
        ctx.font = `500 14px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(TEXT.charts.funnelEmpty || 'Piltuvėlio duomenų nėra.', width / 2, height / 2);
        ctx.restore();
        return;
      }

      const paddingX = Math.max(24, Math.min(56, width * 0.1));
      const paddingTop = Math.max(24, height * 0.08);
      const labelAreaHeight = Math.max(72, height * 0.22);
      const paddingBottom = Math.max(32, height * 0.12);
      const funnelHeight = Math.max(48, height - paddingTop - labelAreaHeight - paddingBottom);
      const centerY = paddingTop + labelAreaHeight + funnelHeight / 2;
      const stepsCount = steps.length;
      const xSpacing = stepsCount > 1 ? (width - paddingX * 2) / (stepsCount - 1) : 0;
      const xPositions = steps.map((_, index) => (stepsCount > 1 ? paddingX + index * xSpacing : width / 2));
      const referenceValue = baselineValue > 0 ? baselineValue : maxValue;
      const maxThickness = funnelHeight;
      const minThickness = Math.max(18, maxThickness * 0.18);
      const thicknesses = steps.map((step) => {
        const value = Math.max(0, step.value || 0);
        if (!Number.isFinite(value) || referenceValue <= 0) {
          return minThickness;
        }
        const rawRatio = value / referenceValue;
        const safeRatio = Math.min(1, Math.max(0, rawRatio));
        return Math.max(minThickness, safeRatio * maxThickness);
      });

      const topPoints = xPositions.map((x, index) => ({ x, y: centerY - thicknesses[index] / 2 }));
      const bottomPoints = xPositions.map((x, index) => ({ x, y: centerY + thicknesses[index] / 2 })).reverse();

      const accentGradientColor = typeof accentColor === 'string' && accentColor.trim() ? accentColor : '#8b5cf6';
      const gradient = ctx.createLinearGradient(paddingX, topPoints[0]?.y ?? centerY, width - paddingX, bottomPoints[0]?.y ?? centerY);
      gradient.addColorStop(0, '#ffb56b');
      gradient.addColorStop(0.45, '#ff6f91');
      gradient.addColorStop(0.78, '#f472b6');
      gradient.addColorStop(1, accentGradientColor);

      ctx.beginPath();
      if (topPoints.length) {
        ctx.moveTo(topPoints[0].x, topPoints[0].y);
        for (let i = 1; i < topPoints.length; i += 1) {
          const prev = topPoints[i - 1];
          const current = topPoints[i];
          const midX = (prev.x + current.x) / 2;
          ctx.bezierCurveTo(midX, prev.y, midX, current.y, current.x, current.y);
        }
      }
      if (bottomPoints.length) {
        ctx.lineTo(bottomPoints[0].x, bottomPoints[0].y);
        for (let i = 1; i < bottomPoints.length; i += 1) {
          const prev = bottomPoints[i - 1];
          const current = bottomPoints[i];
          const midX = (prev.x + current.x) / 2;
          ctx.bezierCurveTo(midX, prev.y, midX, current.y, current.x, current.y);
        }
      }
      ctx.closePath();

      ctx.shadowColor = 'rgba(15, 23, 42, 0.5)';
      ctx.shadowBlur = 32;
      ctx.shadowOffsetY = 24;
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = textPalette.outline;
      ctx.stroke();

      const funnelTop = topPoints.length ? Math.min(...topPoints.map((point) => point.y)) : paddingTop + labelAreaHeight;
      const funnelBottom = bottomPoints.length ? Math.max(...bottomPoints.map((point) => point.y)) : centerY + maxThickness / 2;

      const valueFontSize = Math.max(22, Math.min(34, width * 0.05));
      const labelFontSize = Math.max(12, Math.min(16, valueFontSize * 0.45));
      const percentFontSize = Math.max(11, Math.min(14, valueFontSize * 0.38));
      const valueBaselineY = paddingTop + valueFontSize;
      const labelBaselineY = valueBaselineY + labelFontSize + 6;
      const percentBaselineY = labelBaselineY + percentFontSize + 6;
      const labelAreaBottom = percentBaselineY + 6;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.shadowColor = textPalette.shadow;
      ctx.shadowBlur = textPalette.shadowBlur;
      ctx.shadowOffsetY = 1;

      steps.forEach((step, index) => {
        const x = xPositions[index];
        const rawValue = Math.max(0, step.value || 0);
        const ratio = referenceValue > 0 ? Math.max(0, rawValue / referenceValue) : 0;
        ctx.fillStyle = textPalette.value;
        ctx.font = `700 ${valueFontSize}px ${fontFamily}`;
        ctx.fillText(numberFormatter.format(Math.round(rawValue)), x, valueBaselineY);
        ctx.fillStyle = textPalette.label;
        ctx.font = `500 ${labelFontSize}px ${fontFamily}`;
        ctx.fillText(step.label, x, labelBaselineY);
        ctx.fillStyle = textPalette.percent;
        ctx.font = `600 ${percentFontSize}px ${fontFamily}`;
        ctx.fillText(percentFormatter.format(ratio), x, percentBaselineY);
      });

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      if (stepsCount > 0) {
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = textPalette.guide;
        steps.forEach((_, index) => {
          const x = xPositions[index];
          const lineStartY = Math.min(funnelTop - 6, labelAreaBottom + 12);
          ctx.beginPath();
          ctx.moveTo(x, lineStartY);
          ctx.lineTo(x, funnelBottom + 18);
          ctx.stroke();
        });
      }

      ctx.restore();
    }

    function renderFunnelShape(canvas, funnelData, accentColor, textColor) {
      if (!canvas) {
        return;
      }

      const stepsConfig = Array.isArray(TEXT.charts.funnelSteps) && TEXT.charts.funnelSteps.length
        ? TEXT.charts.funnelSteps
        : [
            { key: 'arrived', label: 'Atvykę' },
            { key: 'discharged', label: 'Išleisti' },
            { key: 'hospitalized', label: 'Hospitalizuoti' },
          ];

      const steps = stepsConfig.map((step) => ({
        label: step.label,
        value: Number.isFinite(Number(funnelData?.[step.key])) ? Number(funnelData[step.key]) : 0,
      }));

      canvas.__funnelState = { steps, accentColor, textColor };

      if (!canvas.__funnelObserver && typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(() => {
          if (canvas.__funnelState) {
            const { steps: currentSteps, accentColor: currentAccent, textColor: currentText } = canvas.__funnelState;
            drawFunnelShape(canvas, currentSteps, currentAccent, currentText);
          }
        });
        observer.observe(canvas);
        canvas.__funnelObserver = observer;
      }

      drawFunnelShape(canvas, steps, accentColor, textColor);
    }

    async function loadDashboard() {
      if (dashboardState.loading) {
        dashboardState.queuedReload = true;
        return;
      }

      dashboardState.loadCounter += 1;
      const runNumber = dashboardState.loadCounter;
      const loadHandle = clientConfig.profilingEnabled
        ? perfMonitor.start('dashboard-load', { seansas: runNumber })
        : null;
      const fetchHandle = clientConfig.profilingEnabled
        ? perfMonitor.start('duomenų-atsiuntimas', { seansas: runNumber })
        : null;
      const fetchSummary = { pagrindinis: 'tinklas', istorinis: 'tinklas' };
      let fetchMeasured = false;

      dashboardState.loading = true;
      const shouldShowSkeletons = !dashboardState.hasLoadedOnce;
      if (shouldShowSkeletons && (!selectors.kpiGrid || !selectors.kpiGrid.children.length)) {
        showKpiSkeleton();
      }
      const chartsInitialized = dashboardState.charts.daily
        || dashboardState.charts.dow
        || dashboardState.charts.dowStay
        || dashboardState.charts.funnel;
      if (shouldShowSkeletons && !chartsInitialized) {
        showChartSkeletons();
      }

      try {
        setStatus('loading');
        if (selectors.edStatus) {
          selectors.edStatus.textContent = TEXT.ed.status.loading;
          selectors.edStatus.dataset.tone = 'info';
        }
        const primaryChunkReporter = createChunkReporter('Pagrindinis CSV');
        const historicalChunkReporter = createChunkReporter('Istorinis CSV');
        const workerProgressReporter = createChunkReporter('Apdorojama CSV');
        const edChunkReporter = createChunkReporter('ED CSV');
        const [dataResult, feedbackResult, edResult] = await Promise.allSettled([
          fetchData({
            onPrimaryChunk: primaryChunkReporter,
            onHistoricalChunk: historicalChunkReporter,
            onWorkerProgress: workerProgressReporter,
          }),
          fetchFeedbackData(),
          fetchEdData({ onChunk: edChunkReporter }),
        ]);

        if (clientConfig.profilingEnabled && fetchHandle) {
          const primaryCache = dataResult.status === 'fulfilled'
            ? describeCacheMeta(dataResult.value?.meta?.primary)
            : 'klaida';
          const historicalCache = dataResult.status === 'fulfilled'
            ? describeCacheMeta(dataResult.value?.meta?.historical)
            : 'klaida';
          fetchSummary.pagrindinis = primaryCache;
          fetchSummary.istorinis = historicalCache;
          perfMonitor.finish(fetchHandle, {
            pagrindinis: primaryCache,
            istorinis: historicalCache,
            fallbackas: dashboardState.usingFallback,
            šaltiniai: dataResult.status === 'fulfilled' ? dataResult.value?.meta?.sources?.length || 0 : 0,
          });
          fetchMeasured = true;
        }

        if (edResult.status === 'fulfilled') {
          dashboardState.ed = edResult.value;
        } else {
          const reason = edResult.reason ? describeError(edResult.reason) : TEXT.ed.status.error(TEXT.status.error);
          console.error('Nepavyko įkelti ED duomenų:', edResult.reason);
          const fallbackSummary = createEmptyEdSummary();
          dashboardState.ed = {
            records: [],
            summary: fallbackSummary,
            dispositions: [],
            daily: [],
            usingFallback: false,
            lastErrorMessage: reason,
            error: reason,
            updatedAt: new Date(),
          };
        }
        await renderEdDashboard(dashboardState.ed);

        if (dataResult.status !== 'fulfilled') {
          throw dataResult.reason;
        }

        const dataset = dataResult.value || {};
        const feedbackRecords = feedbackResult.status === 'fulfilled' ? feedbackResult.value : [];
        if (feedbackResult.status === 'rejected') {
          console.error('Nepavyko apdoroti atsiliepimų duomenų:', feedbackResult.reason);
          if (!dashboardState.feedback.lastErrorMessage) {
            dashboardState.feedback.lastErrorMessage = describeError(feedbackResult.reason);
          }
          dashboardState.feedback.usingFallback = false;
        }

        const combinedRecords = Array.isArray(dataset.records) ? dataset.records : [];
        const primaryRecords = Array.isArray(dataset.primaryRecords) && dataset.primaryRecords.length
          ? dataset.primaryRecords
          : combinedRecords;
        const dailyStats = Array.isArray(dataset.dailyStats) && dataset.dailyStats.length
          ? dataset.dailyStats
          : computeDailyStats(combinedRecords);
        const primaryDaily = Array.isArray(dataset.primaryDaily) && dataset.primaryDaily.length
          ? dataset.primaryDaily
          : computeDailyStats(primaryRecords);
        dashboardState.rawRecords = combinedRecords;
        dashboardState.dailyStats = dailyStats;
        dashboardState.primaryRecords = primaryRecords.slice();
        dashboardState.primaryDaily = primaryDaily.slice();
        dashboardState.dataMeta = dataset.meta || null;
        populateChartYearOptions(dailyStats);
        const windowDays = Number.isFinite(Number(settings.calculations.windowDays))
          ? Number(settings.calculations.windowDays)
          : DEFAULT_SETTINGS.calculations.windowDays;
        if (!Number.isFinite(dashboardState.kpi.filters.window) || dashboardState.kpi.filters.window <= 0) {
          dashboardState.kpi.filters.window = windowDays;
          syncKpiFilterControls();
        }
        const lastWindowDailyStats = filterDailyStatsByWindow(dailyStats, windowDays);
        const recentWindowDays = Number.isFinite(Number(settings.calculations.recentDays))
          ? Number(settings.calculations.recentDays)
          : DEFAULT_SETTINGS.calculations.recentDays;
        const effectiveRecentDays = Math.max(1, Math.min(windowDays, recentWindowDays));
        const recentDailyStats = filterDailyStatsByWindow(lastWindowDailyStats, effectiveRecentDays);
        dashboardState.chartData.baseDaily = dailyStats.slice();
        dashboardState.chartData.baseRecords = combinedRecords.slice();
        dashboardState.chartFilters = sanitizeChartFilters(dashboardState.chartFilters);
        syncChartFilterControls();
        const scopedCharts = prepareChartDataForPeriod(dashboardState.chartPeriod);
        await applyKpiFiltersAndRender();
        await renderCharts(scopedCharts.daily, scopedCharts.funnel, scopedCharts.heatmap);
        renderRecentTable(recentDailyStats);
        const monthlyStats = computeMonthlyStats(dashboardState.dailyStats);
        dashboardState.monthly.all = monthlyStats;
        // Rodyti paskutinius 12 kalendorinių mėnesių, nepriklausomai nuo KPI lango filtro.
        const monthsLimit = 12;
        const limitedMonthlyStats = Number.isFinite(monthsLimit) && monthsLimit > 0
          ? monthlyStats.slice(-monthsLimit)
          : monthlyStats;
        renderMonthlyTable(limitedMonthlyStats);
        dashboardState.monthly.window = limitedMonthlyStats;
        const datasetYearlyStats = Array.isArray(dataset.yearlyStats) ? dataset.yearlyStats : null;
        const yearlyStats = datasetYearlyStats && datasetYearlyStats.length
          ? datasetYearlyStats
          : computeYearlyStats(monthlyStats);
        renderYearlyTable(yearlyStats);
        dashboardState.feedback.records = Array.isArray(feedbackRecords) ? feedbackRecords : [];
        updateFeedbackFilterOptions(dashboardState.feedback.records);
        applyFeedbackFiltersAndRender();
        setStatus('success');
        applyFeedbackStatusNote();
        await renderEdDashboard(dashboardState.ed);
      } catch (error) {
        console.error('Nepavyko apdoroti duomenų:', error);
        dashboardState.usingFallback = false;
        const friendlyMessage = describeError(error);
        dashboardState.lastErrorMessage = friendlyMessage;
        setStatus('error', friendlyMessage);
        await renderEdDashboard(dashboardState.ed);
      } finally {
        dashboardState.loading = false;
        dashboardState.hasLoadedOnce = true;
        restartAutoRefreshTimer();
        if (dashboardState.queuedReload) {
          dashboardState.queuedReload = false;
          window.setTimeout(() => {
            loadDashboard();
          }, 0);
        }
        if (clientConfig.profilingEnabled && loadHandle) {
          if (fetchHandle && !fetchMeasured) {
            perfMonitor.finish(fetchHandle, {
              pagrindinis: fetchSummary.pagrindinis,
              istorinis: fetchSummary.istorinis,
              fallbackas: dashboardState.usingFallback,
              šaltiniai: 0,
            });
          }
          const status = dashboardState.lastErrorMessage ? 'klaida' : 'ok';
          perfMonitor.finish(loadHandle, {
            status,
            pagrindinis: fetchSummary.pagrindinis,
            istorinis: fetchSummary.istorinis,
          });
          perfMonitor.logTable();
        }
      }
    }

    function scheduleInitialLoad() {
      runAfterDomAndIdle(() => {
        if (!dashboardState.loading) {
          loadDashboard();
        }
      }, { timeout: 800 });
    }

    initializeTheme();
    applySettingsToText();
    applyTextContent();
    applyFooterSource();
    initializeSectionNavigation();
    initializeScrollTopButton();
    applySectionVisibility();
    populateSettingsForm();

    initializeKpiFilters();
    initializeFeedbackFilters();
    initializeFeedbackTrendControls();
    initializeTabSwitcher();
    initializeTvMode();
    scheduleInitialLoad();

    if (typeof window.clearDashboard === 'function') {
      const originalClearDashboard = window.clearDashboard;
      window.clearDashboard = (...args) => {
        const result = originalClearDashboard(...args);
        resetMonthlyState();
        return result;
      };
    }

    if (selectors.chartPeriodButtons && selectors.chartPeriodButtons.length) {
      selectors.chartPeriodButtons.forEach((button) => {
        button.addEventListener('click', () => {
          const period = Number.parseInt(button.dataset.chartPeriod || '', 10);
          updateChartPeriod(period);
        });
      });
    }

    if (selectors.chartYearSelect) {
      selectors.chartYearSelect.addEventListener('change', (event) => {
        const { value } = event.target;
        if (value === 'all') {
          updateChartYear(null);
        } else {
          updateChartYear(value);
        }
      });
    }

    if (selectors.heatmapMetricSelect) {
      selectors.heatmapMetricSelect.addEventListener('change', handleHeatmapMetricChange);
    }

    if (selectors.chartFiltersForm) {
      selectors.chartFiltersForm.addEventListener('change', handleChartFilterChange);
      selectors.chartFiltersForm.addEventListener('submit', (event) => event.preventDefault());
    }

    if (selectors.themeToggleBtn) {
      selectors.themeToggleBtn.addEventListener('click', () => {
        toggleTheme();
      });
    }

    if (selectors.compareToggle) {
      selectors.compareToggle.addEventListener('click', () => {
        setCompareMode(!dashboardState.compare.active);
      });
      selectors.compareToggle.setAttribute('aria-pressed', 'false');
    }

    if (selectors.compareClear) {
      selectors.compareClear.addEventListener('click', () => {
        clearCompareSelection();
        if (dashboardState.compare.active) {
          updateCompareSummary();
        }
      });
    }

    const handleCompareClick = (event) => {
      if (!dashboardState.compare.active) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const row = target.closest('tr[data-compare-id]');
      if (row) {
        handleCompareRowSelection(row);
      }
    };

    const handleCompareKeydown = (event) => {
      if (!dashboardState.compare.active) {
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const row = target.closest('tr[data-compare-id]');
      if (row) {
        event.preventDefault();
        handleCompareRowSelection(row);
      }
    };

    if (selectors.recentTable) {
      selectors.recentTable.addEventListener('click', handleCompareClick);
      selectors.recentTable.addEventListener('keydown', handleCompareKeydown);
    }

    if (selectors.monthlyTable) {
      selectors.monthlyTable.addEventListener('click', handleCompareClick);
      selectors.monthlyTable.addEventListener('keydown', handleCompareKeydown);
    }

    if (selectors.yearlyTable) {
      selectors.yearlyTable.addEventListener('click', handleCompareClick);
      selectors.yearlyTable.addEventListener('keydown', handleCompareKeydown);
    }

    if (selectors.edNavButton) {
      selectors.edNavButton.addEventListener('click', (event) => {
        event.preventDefault();
        const isActive = dashboardState.activeTab === 'ed';
        setActiveTab(isActive ? 'overview' : 'ed', {
          focusPanel: !isActive,
          restoreFocus: isActive,
        });
      });
    }

    if (selectors.closeEdPanelBtn) {
      selectors.closeEdPanelBtn.addEventListener('click', () => {
        setActiveTab('overview', { restoreFocus: true });
      });
    }

    const debouncedEdSearch = debounce((value) => {
      applyEdSearchFilter(value);
    }, 350);

    if (selectors.edSearchInput) {
      selectors.edSearchInput.addEventListener('input', (event) => {
        debouncedEdSearch(event.target.value || '');
      });
    }

    if (selectors.openSettingsBtn) {
      selectors.openSettingsBtn.addEventListener('click', () => {
        openSettingsDialog();
      });
    }

    if (selectors.settingsForm) {
      selectors.settingsForm.addEventListener('submit', handleSettingsSubmit);
    }

    if (selectors.resetSettingsBtn) {
      selectors.resetSettingsBtn.addEventListener('click', handleResetSettings);
    }

    if (selectors.clearDataBtn) {
      selectors.clearDataBtn.addEventListener('click', handleClearData);
    }

    if (selectors.cancelSettingsBtn) {
      selectors.cancelSettingsBtn.addEventListener('click', () => {
        closeSettingsDialog();
      });
    }

    if (selectors.settingsDialog) {
      selectors.settingsDialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeSettingsDialog();
      });
      selectors.settingsDialog.addEventListener('click', (event) => {
        if (event.target === selectors.settingsDialog) {
          closeSettingsDialog();
        }
      });
    }

    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault();
        openSettingsDialog();
      }
      if (!event.ctrlKey && !event.metaKey && event.shiftKey && (event.key === 'R' || event.key === 'r')) {
        const tagName = event.target && 'tagName' in event.target ? String(event.target.tagName).toUpperCase() : '';
        if (tagName && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) {
          return;
        }
        event.preventDefault();
        resetKpiFilters({ fromKeyboard: true });
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'L' || event.key === 'l')) {
        event.preventDefault();
        toggleTheme();
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'H' || event.key === 'h')) {
        event.preventDefault();
        if (selectors.heatmapMetricSelect) {
          selectors.heatmapMetricSelect.focus();
        }
      }
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === 'A' || event.key === 'a')) {
        const tagName = event.target && 'tagName' in event.target ? String(event.target.tagName).toUpperCase() : '';
        const isEditable = event.target && typeof event.target === 'object'
          && 'isContentEditable' in event.target
          && event.target.isContentEditable === true;
        if (tagName && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) {
          return;
        }
        if (isEditable) {
          return;
        }
        if (dashboardState.activeTab === 'ed') {
          event.preventDefault();
          setActiveTab('overview', { restoreFocus: true });
        }
      }
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.key === 'Escape' && dashboardState.fullscreen) {
        event.preventDefault();
        setActiveTab('overview', { restoreFocus: true });
      }
    });
