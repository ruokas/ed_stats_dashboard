export const DEFAULT_ED_SOURCE_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTx5aS_sRmpVE78hB57h6J2C2r3OQAKm4T2qoC4JBfY7hFm97prfSajgtQHzitrcqzQx5GZefyEY2vR/pub?gid=715561082&single=true&output=csv';
export const ED_TOTAL_BEDS = 29;
export const FEEDBACK_RATING_MIN = 1;
export const FEEDBACK_RATING_MAX = 5;
export const FEEDBACK_LEGACY_MAX = 10;
export const AUTO_REFRESH_INTERVAL_MS = 3 * 60 * 1000;
export const DEFAULT_FOOTER_SOURCE = '';
export const DEFAULT_KPI_WINDOW_DAYS = 365;
export const DEFAULT_PAGE_TITLE = document.title || 'RŠL SMPS statistika';
export const THEME_STORAGE_KEY = 'edDashboardTheme';
export const CLIENT_CONFIG_KEY = 'edDashboardClientConfig-v1';

export const TEXT = {
  title: 'RŠL SMPS statistika',
  subtitle: 'Greita statistikos apžvalga.',
  theme: {
    toggle: 'Perjungti šviesią/tamsią temą',
    light: 'Šviesi tema',
    dark: 'Tamsi tema',
    contrastWarning:
      'Dėmesio: pasirinkta tema gali turėti nepakankamą KPI kortelių kontrastą. Apsvarstykite kitą temą.',
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
    success: () => '',
    fallbackSuccess: () => 'Rodomi talpyklos duomenys',
    fallbackNote: (reason) => `Nepavyko pasiekti nuotolinio šaltinio: ${reason}.`,
    errorDetails: (details) => `Nepavyko įkelti duomenų${details ? ` (${details})` : ''}.`,
    errorAdvice:
      'Patikrinkite, ar „Google Sheet“ paskelbta pasirinkus „File → Share → Publish to web → CSV“.',
  },
  footer: (timestamp) => `Atnaujinta ${timestamp}`,
  footerFallback: (timestamp) => `Rodomi talpyklos duomenys (atnaujinta ${timestamp})`,
  ed: {
    title: 'RŠL SMPS skydelis',
    closeButton: 'Grįžti',
    status: {
      loading: 'Kraunama...',
      empty: 'ED duomenų nerasta.',
      success: () => 'Duomenys sėkmingai atnaujinti',
      fallback: (reason) => `Rodomi ED talpyklos duomenys. Priežastis: ${reason}`,
      error: (reason) => `Nepavyko įkelti ED duomenų: ${reason}`,
      noUrl: 'Nenurodytas ED duomenų URL.',
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
      staffing: {
        title: 'Pacientų atsiliepimai',
        description: '',
        icon: 'feedback',
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
          title: 'Hospitalizacijų dalis šį mėn.',
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
          section: 'flow',
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
          title: 'Hospitalizacijų dalis šį mėn.',
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
        {
          key: 'feedbackCurrentMonthMetricValue',
          title: 'Bendras vertinimas šį mėn.',
          description: 'Vidutinis įvertinimas (1–5) pagal šio mėnesio atsiliepimus.',
          empty: 'Nėra vertinimų.',
          format: 'oneDecimal',
          type: 'feedback-rotating-metric',
          rotationMs: 8000,
          metrics: [
            { key: 'overallAverage', label: 'Bendra patirtis', countKey: 'overallCount' },
            { key: 'doctorsAverage', label: 'Gydytojų darbas', countKey: 'doctorsCount' },
            { key: 'nursesAverage', label: 'Slaugytojų darbas', countKey: 'nursesCount' },
            { key: 'aidesAverage', label: 'Padėjėjų darbas', countKey: 'aidesResponses' },
            { key: 'waitingAverage', label: 'Laukimo vertinimas', countKey: 'waitingCount' },
          ],
          metaKey: 'feedbackCurrentMonthMetricMeta',
          trendKey: 'feedbackCurrentMonthMetricTrend',
          section: 'staffing',
        },
        {
          key: 'feedbackComments',
          title: 'Pacientų komentarai',
          description: 'Naujausi atsiliepimai (rodymai rotuojasi kas kelias sekundes).',
          empty: 'Kol kas nėra komentarų.',
          type: 'comments',
          rotateMs: 20000,
          metaKey: 'feedbackCommentsMeta',
          section: 'staffing',
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
        title: 'Pasiskirstymas pagal kat.',
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
    subtitle: 'Paskutinė pamaina vs vidurkis',
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
      referenceFallback: 'Vidurkis',
      weekdayReference: (weekday) => `Vidurkis (${weekday})`,
      month: 'Šio mėnesio duomenys',
      noMonth: 'Šio mėnesio duomenų nėra.',
      unknownPeriod: 'Nenurodytas laikotarpis',
    },
    cards: [
      { metricKey: 'total', label: 'Atvykę', format: 'integer', unitLabel: 'pac.' },
      { metricKey: 'night', label: 'Naktiniai', format: 'integer', unitLabel: 'pac.' },
      { metricKey: 'avgTime', label: 'Vid. trukmė', format: 'oneDecimal', unitLabel: 'val.' },
      { metricKey: 'discharged', label: 'Išleisti', format: 'integer', unitLabel: 'pac.' },
      { metricKey: 'hospitalized', label: 'Hospitalizuoti', format: 'integer', unitLabel: 'pac.' },
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
        {
          metricKey: 'nightPerDay',
          label: 'Naktiniai pacientai / d.',
          format: 'oneDecimal',
          unitLabel: 'pac./d.',
        },
        {
          metricKey: 'dischargedPerDay',
          label: 'Išleisti / d.',
          format: 'oneDecimal',
          unitLabel: 'pac./d.',
          shareKey: 'dischargedShare',
        },
        {
          metricKey: 'hospitalizedPerDay',
          label: 'Hospitalizuoti / d.',
          format: 'oneDecimal',
          unitLabel: 'pac./d.',
          shareKey: 'hospitalizedShare',
        },
      ],
    },
    detailLabels: {
      delta: 'Δ',
      average: 'Vid.',
      averageContext: (weekday) => (weekday ? `(${weekday})` : ''),
    },
    deltaNoData: 'Nėra duomenų palyginimui.',
    averageNoData: 'Vidurkio nėra.',
    deltaContext: (reference) => {
      if (!reference) {
        return '';
      }
      const normalized = reference.replace(/^Metinis vidurkis/i, 'vid.').replace(/^Vidurkis/i, 'vid.');
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
    compareGmpLabel: 'Palyginti GMP',
    compareGmpHint: 'GMP / be GMP',
    compareGmpSummary: 'GMP vs be GMP',
    hourlyCaption: (weekdayLabel) =>
      weekdayLabel
        ? `Vidutinis pacientų skaičius per valandą (${weekdayLabel}).`
        : 'Vidutinis pacientų skaičius per valandą.',
    hourlyDatasetTotalLabel: 'Iš viso',
    hourlyDatasetEmsLabel: 'Tik GMP',
    hourlyDatasetSelfLabel: 'Be GMP',
    hourlyMetricLabel: 'Rodiklis',
    hourlyMetricOptions: {
      arrivals: 'Atvykimų skaičius',
      discharges: 'Išleidimų skaičius',
      balance: 'Srautų balansas',
      hospitalized: 'Hospitalizacijų skaičius',
    },
    hourlyDepartmentLabel: 'Skyrius',
    hourlyDepartmentAll: 'Visi skyriai',
    hourlyWeekdayLabel: 'Savaitės diena',
    hourlyWeekdayAll: 'Visos dienos',
    hourlyStayLabel: 'Buvimo trukmė',
    hourlyStayAll: 'Visi laikai',
    hourlyStayBuckets: {
      lt4: '<4 val.',
      '4to8': '4–8 val.',
      '8to16': '8–16 val.',
      gt16: '>16 val.',
    },
    funnelCaption: 'Pacientų srautas pagal sprendimą (atvykę → sprendimas).',
    funnelCaptionWithYear: (year) =>
      year
        ? `Pacientų srautas pagal sprendimą – ${year} m. (atvykę → sprendimas).`
        : 'Pacientų srautas pagal sprendimą (atvykę → sprendimas).',
    yearFilterLabel: 'Metai',
    yearFilterAll: 'Visi metai',
    hospitalTable: {
      title: 'Stacionarizuoti pacientai pagal skyrių ir SPS trukmę',
      subtitle: 'Pasiskirstymas pagal skyrių ir buvimo SPS intervalus',
      caption:
        'Metinis stacionarizuotų pacientų pasiskirstymas pagal skyrių ir SPS buvimo trukmės intervalus.',
      hint: '% skaičiuojami eilutėje, pagal skyrių.',
      yearFilterLabel: 'Metai',
      yearFilterAll: 'Visi metai',
      searchLabel: 'Skyriaus paieška',
      searchPlaceholder: 'Įveskite skyriaus pavadinimą',
      sortLabel: 'Rikiavimas',
      sortOptions: {
        total_desc: 'Pagal sumą (nuo didžiausio)',
        total_asc: 'Pagal sumą (nuo mažiausio)',
        name_asc: 'Pagal pavadinimą (A-Z)',
        name_desc: 'Pagal pavadinimą (Z-A)',
        lt4_desc: 'Pagal <4 (nuo didžiausio)',
        lt4_asc: 'Pagal <4 (nuo mažiausio)',
        '4to8_desc': 'Pagal 4-8 (nuo didžiausio)',
        '4to8_asc': 'Pagal 4-8 (nuo mažiausio)',
        '8to16_desc': 'Pagal 8-16 (nuo didžiausio)',
        '8to16_asc': 'Pagal 8-16 (nuo mažiausio)',
        gt16_desc: 'Pagal >16 (nuo didžiausio)',
        gt16_asc: 'Pagal >16 (nuo mažiausio)',
        unclassified_desc: 'Pagal neklasifikuota (nuo didžiausio)',
        unclassified_asc: 'Pagal neklasifikuota (nuo mažiausio)',
      },
      empty: 'Pasirinktam laikotarpiui nėra stacionarizacijų duomenų.',
      columns: {
        department: 'Nukreiptas į padalinį',
        lt4: '<4',
        from4to8: '4-8',
        from8to16: '8-16',
        gt16: '>16',
        unclassified: 'Neklasifikuota',
        total: 'Bendroji suma',
      },
      totalLabel: 'Bendroji suma',
      trendTitle: 'Skyriaus dinamika per metus',
      trendSubtitle: 'Pasirinkite skyrių lentelėje, kad matytumėte jo SPS trukmės % dinamiką pagal metus.',
      trendEmpty: 'Šiam skyriui nepakanka duomenų metinei dinamikai.',
    },
    empty: 'Šiam grafikui kol kas trūksta duomenų.',
    funnelSteps: [
      { key: 'arrived', label: 'Atvykę' },
      { key: 'discharged', label: 'Išleisti' },
      { key: 'hospitalized', label: 'Hospitalizuoti' },
    ],
    funnelEmpty: 'Piltuvėlio sugeneruoti nepavyko – šiuo metu nėra atvykimų duomenų.',
    heatmapCaption: (metricLabel) =>
      metricLabel
        ? `Pasirinkto rodiklio („${metricLabel}“) reikšmės pagal savaitės dieną ir valandą.`
        : 'Rodikliai pagal savaitės dieną ir valandą.',
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
    noCompleteYears:
      'Šiuo metu nėra pilnų kalendorinių metų rodymui. Kai tik bus sukaupti visi mėnesiai, naujausi metai atsiras automatiškai.',
    comparisonUnavailable: 'Laukiama pilnų metų duomenų palyginimui.',
  },
  summariesReports: {
    title: 'Papildomų duomenų ataskaitos',
    subtitle: '',
    filters: {
      year: 'Metai',
      allYears: 'Visi metai',
      topN: 'TOP N',
      minGroupSize: 'Min. grupės imtis',
    },
    coverage: (extended, total, percent) =>
      `Analizėje naudojami tik historical CSV įrašai su papildomais laukais: ${extended} iš ${total} (${percent}).`,
    empty: 'Papildomiems pjūviams šiuo metu duomenų nepakanka.',
    mapEmpty: 'Miestų su koordinatėmis nerasta.',
    unassignedCities: 'Nepriskirti miestai',
    diagnosisNote: 'Vienas atvejis gali turėti kelias diagnozes, todėl suma gali viršyti pacientų skaičių.',
    exportCsv: 'CSV',
    exportPng: 'PNG',
    cards: {
      diagnosis: 'Diagnozių pasiskirstymas pagal dažnį',
      ageDiagnosisHeatmap: 'Amžiaus ir diagnozių grupių ryšys',
      z769Trend: 'Pasišalinę pacientai (Z76.9)',
      referralTrend: 'Pacientai su siuntimu',
      referralDispositionYearly: 'Siuntimas × baigtis pagal metus',
      referralMonthlyHeatmap: 'Siuntimų % pagal mėnesį',
      referralHospitalizedByPspc: 'Hospitalizacijų dalis tarp pacientų su siuntimu pagal PSPC',
      pspcCorrelation: 'PSPC: siuntimų ir hospitalizacijų ryšys',
      ageDistribution: 'Pacientų pasiskirstymas pagal amžių',
      ageTrend: 'Amžiaus dinamika kas metus',
      pspcDistribution: 'Pacientų kiekiai pagal PSPC įstaigas',
      pspcTrend: 'PSPC įstaigų dinamika kas metus',
      sexDistribution: 'Pacientų pasiskirstymas pagal lytį',
      sexTrend: 'Lyties dinamika kas metus',
    },
  },
  feedback: {
    title: 'Pacientų atsiliepimai',
    subtitle: 'Apibendrinti apklausos rezultatai.',
    description: '',
    empty: 'Kol kas nėra apibendrintų atsiliepimų.',
    trend: {
      title: 'Bendro vertinimo dinamika',
      subtitle: (months, metricCount, compareLabel = '') => {
        const metricSuffix =
          Number.isFinite(metricCount) && metricCount > 0
            ? ` • ${Math.max(1, Math.round(metricCount))} rodikliai`
            : '';
        const compareSuffix = compareLabel ? ` • ${compareLabel}` : '';
        if (!Number.isFinite(months) || months <= 0) {
          return `Visų prieinamų mėnesių dinamika${metricSuffix}${compareSuffix}`;
        }
        const normalized = Math.max(1, Math.round(months));
        if (normalized === 1) {
          return `Paskutinio mėnesio dinamika${metricSuffix}${compareSuffix}`;
        }
        return `Paskutinių ${normalized} mėnesių dinamika${metricSuffix}${compareSuffix}`;
      },
      controlsLabel: 'Laikotarpis',
      metricControlsLabel: 'Rodikliai',
      compareControlsLabel: 'Palyginti pagal',
      periods: [
        { months: 3, label: '3 mėn.' },
        { months: 6, label: '6 mėn.' },
        { months: 12, label: '12 mėn.' },
      ],
      compareModes: [
        { key: 'none', label: 'Nelyginti' },
        { key: 'respondent', label: 'Pacientas vs artimasis' },
        { key: 'location', label: 'Ambulatorija vs salė' },
      ],
      compareGroups: {
        respondent: {
          left: { key: 'patient', label: 'Pacientas' },
          right: { key: 'relative', label: 'Paciento artimasis' },
        },
        location: {
          left: { key: 'ambulatory', label: 'Ambulatorija' },
          right: { key: 'hall', label: 'Salė' },
        },
      },
      metrics: [
        { key: 'overallAverage', label: 'Bendra patirtis', axis: 'rating', enabledByDefault: true },
        { key: 'doctorsAverage', label: 'Gydytojų darbas', axis: 'rating' },
        { key: 'nursesAverage', label: 'Slaugytojų darbas', axis: 'rating' },
        { key: 'aidesAverage', label: 'Padėjėjų darbas', axis: 'rating' },
        { key: 'waitingAverage', label: 'Laukimo vertinimas', axis: 'rating' },
        { key: 'responses', label: 'Atsakymų skaičius', axis: 'responses' },
      ],
      noMetricSelected: 'Pasirinkite bent vieną rodiklį trendo atvaizdavimui.',
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
        if (info.compareModeLabel) {
          parts.push(info.compareModeLabel);
        }
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
            parts.push(
              `${info.responses.label || 'Atsakymai/mėn.'}: ${info.responses.minFormatted}–${info.responses.maxFormatted}`
            );
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
        description: '',
        empty: 'Nėra vertinimų.',
        format: 'decimal',
        countKey: '',
      },
      {
        key: 'doctorsAverage',
        title: 'Gydytojų darbas',
        description: '',
        empty: 'Nėra vertinimų.',
        format: 'decimal',
        countKey: '',
      },
      {
        key: 'nursesAverage',
        title: 'Slaugytojų darbas',
        description: '',
        empty: 'Nėra vertinimų.',
        format: 'decimal',
        countKey: '',
      },
      {
        key: 'aidesAverage',
        title: 'Slaugytojų padėjėjų darbas',
        description: '',
        empty: 'Nėra duomenų.',
        format: 'decimal',
        countKey: '',
      },
      {
        key: 'waitingAverage',
        title: 'Laukimo laikas',
        description: '',
        empty: 'Nėra vertinimų.',
        format: 'decimal',
        countKey: '',
      },
      {
        key: 'totalResponses',
        title: 'Užpildytos formos',
        description: '',
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
      fallback: (reason) => `Atsiliepimai rodomi iš talpyklos: ${reason}`,
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
