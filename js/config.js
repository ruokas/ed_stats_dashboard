/**
     * Pagrindinė demonstracinė duomenų kopija, naudojama kaip rezervas, jei nepavyksta pasiekti nuotolinio CSV.
     */
export const DEFAULT_DEMO_CSV = `Atvykimo data,Išrašymo data,Diena/naktis,GMP,Nukreiptas į padalinį
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
export const DEFAULT_FEEDBACK_CSV = `Timestamp,Kas pildo formą?,Kaip vertinate savo bendrą patirtį mūsų skyriuje?,Kaip vertinate gydytojų darbą,Kaip vertinate slaugytojų darbą ?,Ar bendravote su slaugytojų padėjėjais?,Kaip vertinate slaugytojų padėjėjų darbą,Kaip vertinate laukimo laiką skyriuje?
2024-02-01T09:12:00+02:00,Pacientas,4,4,5,Taip,5,4
2024-02-02T18:40:00+02:00,Artimasis,3,4,3,Ne,,3
2024-02-03T12:05:00+02:00,Pacientas,5,5,5,Taip,5,5
2024-02-04T22:20:00+02:00,Artimasis,2,3,2,Taip,3,2
2024-02-05T08:55:00+02:00,Pacientas,4,5,4,Ne,,4`;
export const DEFAULT_ED_CSV = `Šiuo metu pacientų,Užimta lovų,Slaugytojų - pacientų santykis,Gydytojų - pacientų santykis,1 kategorijos pacientų,2 kategorijos pacientų,3 kategorijos pacientų,4 kategorijos pacientų,5 kategorijos pacientų
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
export const ED_TOTAL_BEDS = 29;
export const FEEDBACK_RATING_MIN = 1;
export const FEEDBACK_RATING_MAX = 5;
export const FEEDBACK_LEGACY_MAX = 10;
    /**
     * Konfigūracija tekstams ir greitiems pakeitimams (LT numatytasis, lengva išplėsti EN).
     */
export const TEXT = {
      title: 'RŠL SMPS statistika',
      subtitle: 'Greita statistikos apžvalga.',
      refresh: 'Perkrauti duomenis',
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
        subtitle: 'Naujausi duomenys',
        closeButton: (label) => `Grįžti į ${label}`,
        status: {
          loading: 'Kraunami ED duomenys...',
          empty: 'ED duomenų nerasta.',
          success: (timestamp) => `Duomenys atnaujinti ${timestamp}.`,
          fallback: (reason, timestamp) => `Rodomi ED demonstraciniai duomenys${timestamp ? ` (${timestamp})` : ''}. Priežastis: ${reason}`,
          error: (reason) => `Nepavyko įkelti ED duomenų: ${reason}`,
          noUrl: 'Nenurodytas ED duomenų URL. Rodomi demonstraciniai duomenys.',
        },
        cards: {
          legacy: [
            {
              key: 'avgDailyPatients',
              title: 'Vid. pacientų per dieną',
              description: 'Skaičiuojama pagal dienas, kuriose yra duomenų.',
              empty: '—',
              format: 'oneDecimal',
            },
            {
              key: 'avgLosMinutes',
              title: 'Vid. buvimo trukmė',
              description: 'Vidutinė buvimo trukmė skyriuje (val.).',
              empty: '—',
              format: 'hours',
            },
            {
              key: 'avgDoorToProviderMinutes',
              title: 'Vid. iki gydytojo',
              description: 'Vidutinis „durys iki gydytojo“ laikas (min.).',
              empty: '—',
              format: 'minutes',
            },
            {
              key: 'hospitalizedShare',
              title: 'Hospitalizacijų dalis',
              description: 'Pacientų dalis, kuriems prireikė stacionaro.',
              empty: '—',
              format: 'percent',
            },
            {
              key: 'avgLosMonthMinutes',
              secondaryKey: 'avgLosYearMinutes',
              title: 'Vid. laikas skyriuje',
              description: 'Šis mėnuo vs šie metai (val.).',
              empty: '—',
              format: 'hours',
            },
            {
              key: 'hospitalizedMonthShare',
              secondaryKey: 'hospitalizedYearShare',
              title: 'Hospitalizacijų dalis (mėn./metai)',
              description: 'Šio mėnesio ir metų palyginimas.',
              empty: '—',
              format: 'percent',
            },
          ],
          snapshot: [
            {
              key: 'currentPatients',
              title: 'Pacientai skyriuje dabar',
              description: '',
              empty: '—',
            },
            {
              key: 'occupiedBeds',
              title: 'Užimtos lovos dabar',
              description: '',
              empty: '—',
              format: 'beds',
            },
            {
              key: 'nursePatientsPerStaff',
              title: 'Slaugytojų santykis (1:n)',
              description: 'Pacientai vienai slaugytojai.',
              empty: '—',
              format: 'ratio',
            },
            {
              key: 'doctorPatientsPerStaff',
              title: 'Gydytojų santykis (1:n)',
              description: 'Pacientai vienam gydytojui.',
              empty: '—',
              format: 'ratio',
            },
            {
              key: 'avgLosMonthMinutes',
              secondaryKey: 'avgLosYearMinutes',
              title: 'Vid. laikas skyriuje',
              description: 'Šis mėnuo vs šie metai (val.).',
              empty: '—',
              format: 'hours',
            },
            {
              key: 'hospitalizedMonthShare',
              secondaryKey: 'hospitalizedYearShare',
              title: 'Hospitalizacijų dalis',
              description: 'Šis mėnuo vs šie metai.',
              empty: '—',
              format: 'percent',
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
            title: 'Pacientų pasiskirstymas pagal kategorijas',
            caption: 'Pacientų pasiskirstymas pagal naujausią įrašą.',
            empty: 'Nėra kategorijų duomenų.',
            centerLabel: 'Viso pacientų',
            centerMetaDefault: 'Pasirinkite kategoriją, kad matytumėte jos dalį.',
            centerShareSuffix: 'viso pasiskirstymo',
            legendTitle: 'Pacientų kategorijos',
            legendHint: 'Užveskite ar spauskite kategoriją, kad išryškintumėte grafike.',
            legendAction: 'Išryškinti kategoriją grafike',
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
        subtitle: 'Pasirinkto laikotarpio vidurkiai ir mėnesio palyginimas',
        yearLabel: 'Pasirinkto laikotarpio vidurkis',
        yearAverageReference: 'pasirinkto laikotarpio vidurkis',
        yearAverageReferenceShort: 'vid.',
        monthPrefix: 'Šis mėnuo',
        monthPrefixShort: 'Šis mėnuo',
        monthNoData: 'Šio mėnesio duomenų nėra.',
        monthNoDataShort: 'Šio mėn. duomenų nėra',
        monthShareLabel: 'Mėn. dalis',
        shareHeading: 'Pasirinkto laikotarpio dalis',
        shareShortLabel: 'Laikotarpio dalis',
        sharePeriodDetail: 'Laikotarpio dalis',
        shareMonthDetail: 'Šio mėnesio dalis',
        shareNoData: 'Nepavyko apskaičiuoti dalies.',
        windowAllLabel: 'Visas laikotarpis',
        windowAllShortLabel: 'viso laik.',
        windowYearSuffix: 'metai',
        noYearData: 'Pasirinktam laikotarpiui apskaičiuoti nepakanka duomenų.',
        deltaLabel: 'Pokytis vs metų vidurkis',
        deltaNoData: 'Nepavyko apskaičiuoti pokyčio.',
        summary: {
          title: 'Laikotarpio santrauka',
          period: 'Laikotarpis',
          reference: 'Lyginama su',
          month: 'Šio mėnesio duomenys',
          noMonth: 'Šio mėnesio duomenų nėra.',
          unknownPeriod: 'Nenurodytas laikotarpis',
        },
        items: {
          patientsPerDay: {
            label: 'Pacientų vidurkis per dieną',
            hint: 'Pasirinkto laikotarpio vidurkis pagal naujausius duomenis.',
            unit: 'pac./d.',
            valueFormat: 'oneDecimal',
            deltaType: 'percent',
          },
          avgTime: {
            label: 'Vidutinė buvimo trukmė',
            hint: 'Valandomis pagal įrašus su atvykimo ir išrašymo laiku.',
            unit: 'val.',
            valueFormat: 'decimal',
            deltaType: 'absolute',
          },
          hospitalized: {
            label: 'Hospitalizuoti pacientai',
            hint: 'Pasirinkto laikotarpio hospitalizuojamų skaičius per dieną ir jų dalis nuo visų atvykimų.',
            unit: 'pac./d.',
            valueFormat: 'oneDecimal',
            deltaType: 'percent',
            shareKey: 'hospitalizedShare',
            shareLabel: 'Hospitalizacijų dalis',
          },
          discharged: {
            label: 'Išleisti pacientai',
            hint: 'Pasirinkto laikotarpio išleidžiamų skaičius per dieną ir jų dalis nuo visų atvykimų.',
            unit: 'pac./d.',
            valueFormat: 'oneDecimal',
            deltaType: 'percent',
            shareKey: 'dischargedShare',
            shareLabel: 'Išleidimų dalis',
          },
        },
      },
      charts: {
        title: 'Pacientų srautai',
        subtitle: 'Kasdieniai skaičiai, srautas pagal sprendimą ir atvykimų žemėlapis',
        dailyCaption: 'Kasdieniai pacientų srautai (paskutinės 30 dienų).',
        dailyContext: () => '',
        dowCaption: 'Vidutinis pacientų skaičius pagal savaitės dieną.',
        funnelCaption: 'Pacientų srautas pagal sprendimą (atvykę → sprendimas).',
        funnelCaptionWithYear: (year) => (year
          ? `Pacientų srautas pagal sprendimą – ${year} m. (atvykę → sprendimas).`
          : 'Pacientų srautas pagal sprendimą (atvykę → sprendimas).'),
        yearFilterLabel: 'Metai',
        yearFilterAll: 'Visi metai',
        funnelSteps: [
          { key: 'arrived', label: 'Atvykę' },
          { key: 'discharged', label: 'Išleisti' },
          { key: 'hospitalized', label: 'Hospitalizuoti' },
        ],
        funnelEmpty: 'Piltuvėlio sugeneruoti nepavyko – šiuo metu nėra atvykimų duomenų.',
        heatmapCaption: 'Vidutinis pacientų atvykimų skaičius per dieną pagal savaitės dieną ir valandą.',
        heatmapEmpty: 'Šiame laikotarpyje atvykimų duomenų nėra.',
        heatmapLegend: 'Tamsesnė spalva reiškia didesnį vidutinį atvykimų skaičių per dieną.',
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
export const normalized = Math.max(1, Math.round(months));
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
export const parts = [];
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
        metrics: {
          total: 'Pacientai',
          avgStay: 'Vid. buvimo trukmė (val.)',
          emsShare: 'GMP dalis',
          hospShare: 'Hospitalizacijų dalis',
        },
      },
    };

export const SETTINGS_STORAGE_KEY = 'edDashboardSettings-v1';
export const THEME_STORAGE_KEY = 'edDashboardTheme';
export const DEFAULT_FOOTER_SOURCE = 'Duomenys: pagrindinis ir papildomas (istorinis) Google Sheets CSV (automat. nuskaitymas kaskart atnaujinant).';
export const DEFAULT_KPI_WINDOW_DAYS = 365;
export const DEFAULT_PAGE_TITLE = document.title || 'RŠL SMPS statistika';

export const DEFAULT_SETTINGS = {
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
          url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTx5aS_sRmpVE78hB57h6J2C2r3OQAKm4T2qoC4JBfY7hFm97prfSajgtQHzitrcqzQx5GZefyEY2vR/pub?gid=715561082&single=true&output=csv',
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
        edSubtitle: TEXT.ed.subtitle,
        showRecent: true,
        showMonthly: true,
        showYearly: true,
        showFeedback: true,
      },
    };

    let settings = loadSettings();

export const KPI_WINDOW_OPTION_BASE = [7, 14, 30, 60, 90, 180, 365];
export const KPI_FILTER_LABELS = {
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
    };

export const KPI_FILTER_TOGGLE_LABELS = {
      show: 'Išskleisti filtrus',
      hide: 'Sutraukti filtrus',
    };

    function getDefaultKpiFilters() {
export const configuredWindow = Number.isFinite(Number(settings?.calculations?.windowDays))
        ? Number(settings.calculations.windowDays)
        : DEFAULT_SETTINGS.calculations.windowDays;
export const defaultWindow = Number.isFinite(configuredWindow) && configuredWindow > 0
        ? configuredWindow
        : DEFAULT_KPI_WINDOW_DAYS;
      return {
        window: defaultWindow,
        shift: 'all',
        arrival: 'all',
        disposition: 'all',
      };
    }

    function sanitizeKpiFilters(filters) {
export const defaults = getDefaultKpiFilters();
export const normalized = { ...defaults, ...(filters || {}) };
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
      return normalized;
    }
