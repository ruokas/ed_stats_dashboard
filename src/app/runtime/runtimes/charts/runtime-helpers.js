import {
  createChartsDefaults,
  ensureChartsDisclosureState,
  persistChartsQueryFromState,
  setChartsSectionExpanded as setChartsSectionExpandedInState,
} from './runtime-query.js';

export function createChartsRuntimeHelpers({
  settings,
  selectors,
  dashboardState,
  isMetricEnabled,
  heatmapMetricKeys,
  defaultHeatmapMetric,
  hourlyWeekdayAll,
  hourlyStayBucketAll,
  hourlyMetricArrivals,
  hourlyCompareSeriesAll,
  defaultChartsSectionsExpanded,
  chartsSectionKeys,
  text,
  numberFormatter,
}) {
  const getEnabledHeatmapMetricKeys = () => {
    const enabled = heatmapMetricKeys.filter((metricId) => isMetricEnabled(settings, metricId));
    return enabled.length ? enabled : heatmapMetricKeys;
  };
  const getDefaultHeatmapMetric = () => {
    const enabled = getEnabledHeatmapMetricKeys();
    return enabled.includes('arrivals') ? 'arrivals' : enabled[0] || defaultHeatmapMetric;
  };
  const getChartsDefaults = () =>
    createChartsDefaults({
      getDefaultHeatmapMetric,
      hourlyWeekdayAll,
      hourlyStayBucketAll,
      hourlyMetricArrivals,
      hourlyCompareSeriesAll,
      defaultChartsSectionsExpanded,
    });
  const ensureChartsDisclosure = () =>
    ensureChartsDisclosureState(dashboardState, defaultChartsSectionsExpanded);
  const setChartsSectionExpanded = (key, expanded) =>
    setChartsSectionExpandedInState({
      dashboardState,
      key,
      expanded,
      chartsSectionKeys,
      defaultChartsSectionsExpanded,
    });
  const persistChartsQuery = () =>
    persistChartsQueryFromState({
      dashboardState,
      defaultChartsSectionsExpanded,
      getChartsDefaults,
    });
  const applyChartsLoadingLayout = ({ isLoading, initialLoadPending }) => {
    if (!(selectors?.chartsMainFiltersPanel instanceof HTMLElement)) {
      return;
    }
    selectors.chartsMainFiltersPanel.hidden = Boolean(isLoading && initialLoadPending);
  };
  const formatDailyCaption = (period) => {
    const base = String(text.charts.dailyCaption || 'Kasdieniai pacientu srautai')
      .replace(/\s*\([^)]*\)\s*$/u, '')
      .trim();
    const normalized = Number.isFinite(period) ? Math.round(period) : null;
    if (normalized === 365) return `${base} (menesine dinamika)`;
    if (normalized === 0) return `${base} (visas laikotarpis)`;
    if (!Number.isFinite(period) || period < 0) return base;
    return `${base} (paskutines ${numberFormatter.format(normalized)} dienos)`;
  };

  return {
    getEnabledHeatmapMetricKeys,
    getDefaultHeatmapMetric,
    getChartsDefaults,
    ensureChartsDisclosure,
    setChartsSectionExpanded,
    persistChartsQuery,
    applyChartsLoadingLayout,
    formatDailyCaption,
  };
}
