import { parseFromQuery, replaceUrlQuery, serializeToQuery } from '../../filters/query-codec.js';
import {
  buildChartsExpandedMap,
  getExpandedKeysFromMap,
  normalizeChartsSectionExpandedKeys,
} from './disclosure.js';

export function createChartsDefaults({
  getDefaultHeatmapMetric,
  hourlyWeekdayAll,
  hourlyStayBucketAll,
  hourlyMetricArrivals,
  hourlyCompareSeriesAll,
  defaultChartsSectionsExpanded,
}) {
  return {
    chartPeriod: 30,
    chartYear: null,
    arrival: 'all',
    disposition: 'all',
    cardType: 'all',
    compareGmp: false,
    heatmapMetric: getDefaultHeatmapMetric(),
    heatmapArrival: 'all',
    heatmapDisposition: 'all',
    heatmapCardType: ['all'],
    heatmapYear: null,
    hourlyWeekday: hourlyWeekdayAll,
    hourlyStayBucket: hourlyStayBucketAll,
    hourlyMetric: hourlyMetricArrivals,
    hourlyDepartment: 'all',
    hourlyCompareEnabled: false,
    hourlyCompareYearA: null,
    hourlyCompareYearB: null,
    hourlyCompareSeries: hourlyCompareSeriesAll,
    hospitalYear: 'all',
    hospitalSort: 'total_desc',
    hospitalSearch: '',
    hospitalDepartment: '',
    chartsSectionsExpanded: getExpandedKeysFromMap(
      defaultChartsSectionsExpanded,
      defaultChartsSectionsExpanded
    ),
    chartsSubsectionsExpanded: [],
  };
}

export function ensureChartsDisclosureState(dashboardState, defaultChartsSectionsExpanded) {
  dashboardState.chartsSectionsExpanded = {
    ...defaultChartsSectionsExpanded,
    ...(dashboardState.chartsSectionsExpanded && typeof dashboardState.chartsSectionsExpanded === 'object'
      ? dashboardState.chartsSectionsExpanded
      : {}),
  };
}

export function setChartsSectionExpanded({
  dashboardState,
  key,
  expanded,
  chartsSectionKeys,
  defaultChartsSectionsExpanded,
}) {
  if (!chartsSectionKeys.includes(String(key || ''))) {
    return;
  }
  ensureChartsDisclosureState(dashboardState, defaultChartsSectionsExpanded);
  dashboardState.chartsSectionsExpanded = {
    ...dashboardState.chartsSectionsExpanded,
    [key]: expanded === true,
  };
}

export function persistChartsQueryFromState({
  dashboardState,
  defaultChartsSectionsExpanded,
  getChartsDefaults,
}) {
  const state = {
    chartPeriod: dashboardState.chartPeriod,
    chartYear: dashboardState.chartYear,
    arrival: dashboardState.chartFilters?.arrival,
    disposition: dashboardState.chartFilters?.disposition,
    cardType: dashboardState.chartFilters?.cardType,
    compareGmp: dashboardState.chartFilters?.compareGmp,
    heatmapMetric: dashboardState.heatmapMetric,
    heatmapArrival: dashboardState.heatmapFilters?.arrival,
    heatmapDisposition: dashboardState.heatmapFilters?.disposition,
    heatmapCardType: dashboardState.heatmapFilters?.cardType,
    heatmapYear: dashboardState.heatmapYear,
    hourlyWeekday: dashboardState.hourlyWeekday,
    hourlyStayBucket: dashboardState.hourlyStayBucket,
    hourlyMetric: dashboardState.hourlyMetric,
    hourlyDepartment: dashboardState.hourlyDepartment,
    hourlyCompareEnabled: dashboardState.hourlyCompareEnabled,
    hourlyCompareYearA: dashboardState.hourlyCompareYears?.[0] ?? null,
    hourlyCompareYearB: dashboardState.hourlyCompareYears?.[1] ?? null,
    hourlyCompareSeries: dashboardState.hourlyCompareSeries,
    hospitalYear: dashboardState.chartsHospitalTableYear,
    hospitalSort: dashboardState.chartsHospitalTableSort,
    hospitalSearch: dashboardState.chartsHospitalTableSearch,
    hospitalDepartment: dashboardState.chartsHospitalTableDepartment,
    chartsSectionsExpanded: getExpandedKeysFromMap(
      dashboardState.chartsSectionsExpanded,
      defaultChartsSectionsExpanded
    ),
    chartsSubsectionsExpanded: [],
  };
  replaceUrlQuery(serializeToQuery('charts', state, getChartsDefaults()));
}

function applyParsedChartsQuery({
  dashboardState,
  parsedChartsQuery,
  defaultChartsSectionsExpanded,
  sanitizeChartFilters,
  createDefaultChartFilters,
  kpiFilterLabels,
  sanitizeHeatmapFilters,
}) {
  dashboardState.chartPeriod =
    Number.isFinite(parsedChartsQuery.chartPeriod) && parsedChartsQuery.chartPeriod >= 0
      ? parsedChartsQuery.chartPeriod
      : dashboardState.chartPeriod;
  dashboardState.chartYear = Number.isFinite(parsedChartsQuery.chartYear)
    ? parsedChartsQuery.chartYear
    : null;
  dashboardState.chartFilters = sanitizeChartFilters(
    {
      ...dashboardState.chartFilters,
      arrival: parsedChartsQuery.arrival ?? dashboardState.chartFilters.arrival,
      disposition: parsedChartsQuery.disposition ?? dashboardState.chartFilters.disposition,
      cardType: parsedChartsQuery.cardType ?? dashboardState.chartFilters.cardType,
      compareGmp:
        parsedChartsQuery.compareGmp != null
          ? parsedChartsQuery.compareGmp
          : dashboardState.chartFilters.compareGmp,
    },
    { getDefaultChartFilters: createDefaultChartFilters, KPI_FILTER_LABELS: kpiFilterLabels }
  );
  dashboardState.heatmapMetric = parsedChartsQuery.heatmapMetric || dashboardState.heatmapMetric;
  dashboardState.heatmapFilters = sanitizeHeatmapFilters({
    arrival: parsedChartsQuery.heatmapArrival ?? dashboardState.heatmapFilters.arrival,
    disposition: parsedChartsQuery.heatmapDisposition ?? dashboardState.heatmapFilters.disposition,
    cardType: parsedChartsQuery.heatmapCardType ?? dashboardState.heatmapFilters.cardType,
  });
  dashboardState.heatmapYear = Number.isFinite(parsedChartsQuery.heatmapYear)
    ? parsedChartsQuery.heatmapYear
    : null;
  dashboardState.hourlyWeekday =
    parsedChartsQuery.hourlyWeekday == null ? dashboardState.hourlyWeekday : parsedChartsQuery.hourlyWeekday;
  dashboardState.hourlyStayBucket =
    parsedChartsQuery.hourlyStayBucket == null
      ? dashboardState.hourlyStayBucket
      : parsedChartsQuery.hourlyStayBucket;
  dashboardState.hourlyMetric =
    parsedChartsQuery.hourlyMetric == null ? dashboardState.hourlyMetric : parsedChartsQuery.hourlyMetric;
  dashboardState.hourlyDepartment =
    parsedChartsQuery.hourlyDepartment == null
      ? dashboardState.hourlyDepartment
      : parsedChartsQuery.hourlyDepartment;
  dashboardState.hourlyCompareEnabled = Boolean(parsedChartsQuery.hourlyCompareEnabled);
  dashboardState.hourlyCompareYears = [
    parsedChartsQuery.hourlyCompareYearA,
    parsedChartsQuery.hourlyCompareYearB,
  ].filter((year) => Number.isFinite(year));
  dashboardState.hourlyCompareSeries =
    parsedChartsQuery.hourlyCompareSeries == null
      ? dashboardState.hourlyCompareSeries
      : parsedChartsQuery.hourlyCompareSeries;
  dashboardState.chartsHospitalTableYear =
    parsedChartsQuery.hospitalYear == null ? 'all' : parsedChartsQuery.hospitalYear;
  dashboardState.chartsHospitalTableSort =
    parsedChartsQuery.hospitalSort == null
      ? dashboardState.chartsHospitalTableSort
      : parsedChartsQuery.hospitalSort;
  dashboardState.chartsHospitalTableSearch = parsedChartsQuery.hospitalSearch || '';
  dashboardState.chartsHospitalTableDepartment = parsedChartsQuery.hospitalDepartment || '';
  const parsedSectionKeys = normalizeChartsSectionExpandedKeys(parsedChartsQuery.chartsSectionsExpanded);
  const legacySubsectionKeys = (
    Array.isArray(parsedChartsQuery.chartsSubsectionsExpanded)
      ? parsedChartsQuery.chartsSubsectionsExpanded
      : []
  )
    .map((value) => String(value || '').trim())
    .filter((value) => ['overview', 'hourly', 'heatmap'].includes(value));
  const expandedKeys = new Set(parsedSectionKeys);
  if (
    (Array.isArray(parsedChartsQuery.chartsSectionsExpanded)
      ? parsedChartsQuery.chartsSectionsExpanded
      : []
    ).includes('main')
  ) {
    expandedKeys.add('overview');
  }
  legacySubsectionKeys.forEach((key) => {
    expandedKeys.add(key);
  });
  if (
    (Array.isArray(parsedChartsQuery.chartsSectionsExpanded)
      ? parsedChartsQuery.chartsSectionsExpanded
      : []
    ).includes('hospital')
  ) {
    expandedKeys.add('hospital');
  }
  dashboardState.chartsSectionsExpanded = buildChartsExpandedMap(
    Array.from(expandedKeys),
    defaultChartsSectionsExpanded
  );
  dashboardState.chartsSubsectionsExpanded = [];
}

export function initializeChartsStateFromQuery({
  dashboardState,
  search,
  defaultChartsSectionsExpanded,
  sanitizeChartFilters,
  createDefaultChartFilters,
  kpiFilterLabels,
  sanitizeHeatmapFilters,
}) {
  const parsedChartsQuery = parseFromQuery('charts', search);
  const hadParsedChartsQuery = Object.keys(parsedChartsQuery).length > 0;
  if (hadParsedChartsQuery) {
    applyParsedChartsQuery({
      dashboardState,
      parsedChartsQuery,
      defaultChartsSectionsExpanded,
      sanitizeChartFilters,
      createDefaultChartFilters,
      kpiFilterLabels,
      sanitizeHeatmapFilters,
    });
  }
  ensureChartsDisclosureState(dashboardState, defaultChartsSectionsExpanded);
  return hadParsedChartsQuery;
}
