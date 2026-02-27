import { parseFromQuery } from '../filters/query-codec.js';

const FILTER_LABELS = {
  kpi: {
    selectedDate: 'Data',
    arrival: 'Atvykimas',
    cardType: 'Kortelė',
    shift: 'Pamaina',
    disposition: 'Baigtis',
    window: 'Langas',
  },
  charts: {
    chartPeriod: 'Laikotarpis',
    chartYear: 'Metai',
    arrival: 'Atvykimas',
    disposition: 'Baigtis',
    cardType: 'Kortelė',
    compareGmp: 'GMP palyginimas',
    heatmapMetric: 'Heatmap rodiklis',
    heatmapArrival: 'Heatmap atvykimas',
    heatmapDisposition: 'Heatmap baigtis',
    heatmapCardType: 'Heatmap kortelė',
    heatmapYear: 'Heatmap metai',
    hourlyWeekday: 'Savaitės diena',
    hourlyStayBucket: 'Buvimo trukmė',
    hourlyMetric: 'Valandinis rodiklis',
    hourlyDepartment: 'Skyrius',
    hourlyCompareEnabled: 'Valandinis palyg.',
    hourlyCompareYearA: 'Palyg. metai A',
    hourlyCompareYearB: 'Palyg. metai B',
    hourlyCompareSeries: 'Palyg. srautas',
    hospitalYear: 'Stacion. metai',
    hospitalSort: 'Stacion. rikiavimas',
    hospitalSearch: 'Skyriaus paieška',
  },
  recent: {},
  summaries: {
    year: 'Metai',
    topN: 'TOP',
    minGroup: 'Min. imtis',
    pspcSort: 'PSPC rikiavimas',
    pspcMode: 'PSPC režimas',
    pspcTrend: 'PSPC trendas',
  },
  gydytojai: {
    year: 'Metai',
    topN: 'TOP',
    minCases: 'Min. atv.',
    sort: 'Rikiavimas',
    arrival: 'Atvykimas',
    disposition: 'Baigtis',
    shift: 'Pamaina',
    specialty: 'Specialybė',
    search: 'Paieška',
    annualMetric: 'Metinė metrika',
    annualSort: 'Metinis rikiavimas',
    annualDoctors: 'Metiniai gydytojai',
    specialtyAnnualMetric: 'Spec. metinė metrika',
    specialtyAnnualSort: 'Spec. metinis rikiavimas',
    specialtyAnnualSelected: 'Specialybės',
    gydytojaiAnnualSubview: 'Metinis vaizdas',
  },
  feedback: {
    respondent: 'Respondentas',
    location: 'Šaltinis',
    trendWindow: 'Langas',
    trendCompareMode: 'Palyginimas',
    trendMultiMode: 'Keli rodikliai',
    trendMetrics: 'Metrikos',
  },
};

const HIDDEN_KEYS = new Set([
  'chartsSectionsExpanded',
  'chartsSubsectionsExpanded',
  'gydytojaiSectionExpanded',
  'gydytojaiFiltersAdvancedExpanded',
  'tableSort',
]);

const ENUM_VALUES = {
  all: 'Visi',
  none: 'Nelyginti',
  ems: 'Tik GMP',
  self: 'Be GMP',
  hospitalized: 'Hospitalizuoti',
  discharged: 'Išleisti',
  day: 'Diena',
  night: 'Naktis',
  off: 'Išjungta',
  on: 'Įjungta',
  true: 'Taip',
  false: 'Ne',
  asc: 'Didėjanti tvarka',
  desc: 'Mažėjanti tvarka',
  cross: 'Palyginimas tarp grupių',
  trend: 'Dinamika',
  t: 'T',
  tr: 'TR',
  ch: 'CH',
};

const VALUE_MAP_BY_KEY = {
  trendCompareMode: {
    none: 'Nelyginti',
    respondent: 'Pacientas vs artimasis',
    location: 'Ambulatorija vs salė',
  },
  trendMetrics: {
    overallAverage: 'Bendra patirtis',
    doctorsAverage: 'Gydytojų darbas',
    nursesAverage: 'Slaugytojų darbas',
    aidesAverage: 'Padėjėjų darbas',
    waitingAverage: 'Laukimo vertinimas',
    responses: 'Atsakymų skaičius',
  },
  trendMultiMode: {
    true: 'Įjungta',
    false: 'Išjungta',
  },
  hourlyMetric: {
    arrivals: 'Atvykimai',
    discharges: 'Išleidimai',
    balance: 'Srautų balansas',
    hospitalized: 'Hospitalizacijos',
  },
  hourlyCompareSeries: {
    all: 'Visi',
    ems: 'GMP',
    self: 'Ne GMP',
  },
  heatmapMetric: {
    arrivals: 'Atvykimai',
    discharges: 'Išleidimai',
    hospitalized: 'Hospitalizacijos',
    avgDuration: 'Vid. trukmė',
  },
  hospitalSort: {
    total_desc: 'Atvejų sk. ↓',
    total_asc: 'Atvejų sk. ↑',
    name_asc: 'Skyrius A–Ž',
    name_desc: 'Skyrius Ž–A',
    lt4_desc: '<4 val. ↓',
    lt4_asc: '<4 val. ↑',
    '4to8_desc': '4–8 val. ↓',
    '4to8_asc': '4–8 val. ↑',
    '8to16_desc': '8–16 val. ↓',
    '8to16_asc': '8–16 val. ↑',
    gt16_desc: '>16 val. ↓',
    gt16_asc: '>16 val. ↑',
    unclassified_desc: 'Nepriskirta ↓',
    unclassified_asc: 'Nepriskirta ↑',
  },
  sort: {
    volume_desc: 'Apkrova',
    avgLos_asc: 'Vid. trukmė ↑',
    avgLos_desc: 'Vid. trukmė ↓',
    hospital_desc: 'Hosp. % ↓',
  },
  annualMetric: {
    count: 'Atvejų sk.',
    hospitalizedShare: 'Hospitalizacija %',
    avgLosHours: 'Vid. LOS (val.)',
    nightShare: 'Naktiniai %',
  },
  annualSort: {
    latest_desc: 'Paskutinių metų reikšmė',
    yoy_up: 'Didžiausias augimas (YoY)',
    yoy_down: 'Didžiausias kritimas (YoY)',
  },
  specialtyAnnualMetric: {
    count: 'Atvejų sk.',
    hospitalizedShare: 'Hospitalizacija %',
    avgLosHours: 'Vid. LOS (val.)',
    nightShare: 'Naktiniai %',
    losGroups: 'LOS grupės (%)',
  },
  specialtyAnnualSort: {
    latest_desc: 'Paskutinių metų reikšmė',
    yoy_up: 'Didžiausias augimas (YoY)',
    yoy_down: 'Didžiausias kritimas (YoY)',
  },
  pspcSort: {
    asc: 'Didėjanti tvarka',
    desc: 'Mažėjanti tvarka',
  },
  pspcMode: {
    cross: 'Palyginimas tarp grupių',
    trend: 'Dinamika',
  },
  pspcTrend: {
    __top3__: 'TOP 3 PSPC',
  },
  gydytojaiAnnualSubview: {
    doctor: 'Pagal gydytoją',
    specialty: 'Pagal specialybes',
  },
};

function formatValue(value, key) {
  if (Array.isArray(value)) {
    if (!value.length) {
      return '';
    }
    const translatedList = value.map((part) => formatValue(part, key)).filter(Boolean);
    return (
      translatedList.slice(0, 3).join(', ') +
      (translatedList.length > 3 ? ` +${translatedList.length - 3}` : '')
    );
  }
  if (typeof value === 'boolean') {
    return value ? 'Įjungta' : 'Išjungta';
  }
  if (value == null) {
    return '';
  }
  const raw = String(value).trim();
  if (!raw) {
    return '';
  }
  if (key === 'trendWindow') {
    return /^\d+$/.test(raw) ? `${raw} mėn.` : raw;
  }
  if (key === 'chartPeriod' || key === 'window') {
    return /^\d+$/.test(raw) ? `${raw} d.` : raw;
  }
  const keyMap = VALUE_MAP_BY_KEY[key];
  if (keyMap && Object.hasOwn(keyMap, raw)) {
    return keyMap[raw];
  }
  if (Object.hasOwn(ENUM_VALUES, raw)) {
    return ENUM_VALUES[raw];
  }
  return raw;
}

export function buildStateSummaryItems(pageId, search = window.location.search) {
  const parsed = parseFromQuery(pageId, search);
  if (
    pageId === 'feedback' &&
    Array.isArray(parsed.trendMetrics) &&
    parsed.trendMetrics.length > 1 &&
    parsed.trendMultiMode !== true
  ) {
    parsed.trendMetrics = [parsed.trendMetrics[0]];
  }
  const labels = FILTER_LABELS[pageId] || {};
  const entries = Object.entries(parsed);
  return entries
    .map(([key, value]) => ({
      key,
      label: labels[key] || key,
      value: formatValue(value, key),
    }))
    .filter((item) => item.value && !HIDDEN_KEYS.has(item.key));
}
