import { parseFromQuery, serializeToQuery } from '../../filters/query-codec.js';

export const GYDYTOJAI_SECTION_KEYS = ['results', 'specialty', 'annual', 'charts'];
export const DEFAULT_GYDYTOJAI_SECTION_EXPANDED = Object.freeze({
  results: true,
  specialty: false,
  annual: false,
  charts: false,
});
const DEFAULT_DOCTOR_PAGE_STATE = {
  year: 'all',
  topN: 15,
  minCases: 30,
  sort: 'volume_desc',
  arrival: 'all',
  disposition: 'all',
  shift: 'all',
  specialty: 'all',
  search: '',
  tableSort: 'count_desc',
  annualMetric: 'count',
  annualSort: 'latest_desc',
  annualDoctors: [],
  specialtyAnnualMetric: 'count',
  specialtyAnnualSort: 'latest_desc',
  specialtyAnnualSelected: [],
  gydytojaiAnnualSubview: 'doctor',
  gydytojaiFiltersAdvancedExpanded: false,
  gydytojaiSectionExpanded: ['results'],
};

export function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeAnnualMetric(value, fallback = 'count') {
  const token = String(value ?? '').trim();
  if (token === 'hospitalizedShare' || token === 'avgLosHours' || token === 'nightShare') {
    return token;
  }
  return fallback;
}

export function normalizeAnnualSort(value, fallback = 'latest_desc') {
  const token = String(value ?? '').trim();
  if (token === 'yoy_up' || token === 'yoy_down') {
    return token;
  }
  return fallback;
}

export function normalizeSpecialtyAnnualMetric(value, fallback = 'count') {
  const token = String(value ?? '').trim();
  if (
    token === 'hospitalizedShare' ||
    token === 'avgLosHours' ||
    token === 'nightShare' ||
    token === 'losGroups'
  ) {
    return token;
  }
  return fallback;
}

export function normalizeGydytojaiAnnualSubview(value, fallback = 'doctor') {
  const token = String(value ?? '').trim();
  return token === 'specialty' ? 'specialty' : fallback;
}

function parseDoctorSelectionParam(value) {
  return String(value || '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeAllowed(value, allowed, fallback) {
  const token = String(value ?? '').trim();
  return allowed.has(token) ? token : fallback;
}

function parseSectionExpandedParam(value) {
  const raw = Array.isArray(value) ? value : parseDoctorSelectionParam(value);
  const normalized = raw
    .map((entry) => {
      const token = String(entry || '').trim();
      if (token === 'annualDoctor' || token === 'annualSpecialty') {
        return 'annual';
      }
      return token;
    })
    .filter((entry) => GYDYTOJAI_SECTION_KEYS.includes(entry));
  return Array.from(new Set(normalized));
}

export function buildSectionExpandedState(entries) {
  const set = new Set(parseSectionExpandedParam(entries));
  return {
    ...DEFAULT_GYDYTOJAI_SECTION_EXPANDED,
    ...Object.fromEntries(GYDYTOJAI_SECTION_KEYS.map((key) => [key, set.has(key)])),
  };
}

export function getExpandedSectionList(sectionState) {
  return GYDYTOJAI_SECTION_KEYS.filter((key) => sectionState?.[key] === true);
}

export function getDoctorPageStateFromQuery(search, defaults = DEFAULT_DOCTOR_PAGE_STATE) {
  const parsed = parseFromQuery('gydytojai', search);
  const params = new URLSearchParams(String(search || ''));
  return {
    year: String(parsed.year || params.get('y') || defaults.year),
    topN: parsePositiveInt(parsed.topN ?? params.get('top'), defaults.topN),
    minCases: parsePositiveInt(parsed.minCases ?? params.get('min'), defaults.minCases),
    sort: normalizeAllowed(
      parsed.sort ?? params.get('sort'),
      new Set(['volume_desc', 'avgLos_asc', 'avgLos_desc', 'hospital_desc']),
      defaults.sort
    ),
    arrival: normalizeAllowed(
      parsed.arrival ?? params.get('arr'),
      new Set(['all', 'ems', 'self']),
      defaults.arrival
    ),
    disposition: normalizeAllowed(
      parsed.disposition ?? params.get('disp'),
      new Set(['all', 'hospitalized', 'discharged']),
      defaults.disposition
    ),
    shift: normalizeAllowed(
      parsed.shift ?? params.get('shift'),
      new Set(['all', 'day', 'night']),
      defaults.shift
    ),
    specialty: String((parsed.specialty ?? params.get('sp') ?? defaults.specialty) || 'all').trim() || 'all',
    search: String((parsed.search ?? params.get('q')) || defaults.search).trim(),
    tableSort: normalizeAllowed(
      parsed.tableSort ?? params.get('tsort'),
      new Set([
        'alias_asc',
        'alias_desc',
        'count_desc',
        'count_asc',
        'share_desc',
        'share_asc',
        'avgLosHours_desc',
        'avgLosHours_asc',
        'medianLosHours_desc',
        'medianLosHours_asc',
        'hospitalizedShare_desc',
        'hospitalizedShare_asc',
        'losLt4Share_desc',
        'losLt4Share_asc',
        'los4to8Share_desc',
        'los4to8Share_asc',
        'los8to16Share_desc',
        'los8to16Share_asc',
        'losGt16Share_desc',
        'losGt16Share_asc',
        'nightShare_desc',
        'nightShare_asc',
      ]),
      defaults.tableSort
    ),
    annualMetric: normalizeAnnualMetric(parsed.annualMetric ?? params.get('am'), defaults.annualMetric),
    annualSort: normalizeAnnualSort(parsed.annualSort ?? params.get('as'), defaults.annualSort),
    annualDoctors: Array.isArray(parsed.annualDoctors)
      ? parsed.annualDoctors.slice(0, 12)
      : parseDoctorSelectionParam(params.get('ad')),
    specialtyAnnualMetric: normalizeSpecialtyAnnualMetric(
      parsed.specialtyAnnualMetric ?? params.get('sam'),
      defaults.specialtyAnnualMetric
    ),
    specialtyAnnualSort: normalizeAnnualSort(
      parsed.specialtyAnnualSort ?? params.get('sas'),
      defaults.specialtyAnnualSort
    ),
    specialtyAnnualSelected: Array.isArray(parsed.specialtyAnnualSelected)
      ? parsed.specialtyAnnualSelected.slice(0, 12)
      : parseDoctorSelectionParam(params.get('sase')),
    gydytojaiAnnualSubview: normalizeGydytojaiAnnualSubview(
      parsed.gydytojaiAnnualSubview ?? params.get('ga'),
      defaults.gydytojaiAnnualSubview
    ),
    gydytojaiFiltersAdvancedExpanded:
      typeof parsed.gydytojaiFiltersAdvancedExpanded === 'boolean'
        ? parsed.gydytojaiFiltersAdvancedExpanded
        : String(params.get('gfa') || '') === '1',
    gydytojaiSectionExpanded: parseSectionExpandedParam(parsed.gydytojaiSectionExpanded ?? params.get('gse')),
  };
}

export function buildDoctorPageQuery(state) {
  return serializeToQuery(
    'gydytojai',
    {
      year: state.year,
      topN: state.topN,
      minCases: state.minCases,
      sort: state.sort,
      arrival: state.arrival,
      disposition: state.disposition,
      shift: state.shift,
      specialty: state.specialty,
      search: state.search,
      tableSort: state.tableSort,
      annualMetric: state.annualMetric,
      annualSort: state.annualSort,
      annualDoctors: state.annualDoctors,
      specialtyAnnualMetric: state.specialtyAnnualMetric,
      specialtyAnnualSort: state.specialtyAnnualSort,
      specialtyAnnualSelected: state.specialtyAnnualSelected,
      gydytojaiAnnualSubview: state.gydytojaiAnnualSubview,
      gydytojaiFiltersAdvancedExpanded: state.gydytojaiFiltersAdvancedExpanded,
      gydytojaiSectionExpanded: state.gydytojaiSectionExpanded,
    },
    DEFAULT_DOCTOR_PAGE_STATE
  );
}
