export function normalizeCreateDataFlowArgs(env = {}) {
  const noop = () => {};
  const noopAsync = async () => {};
  const noopArray = () => [];
  const noopAsyncArray = async () => [];
  const noopObject = () => ({});
  const noopChartData = () => ({ daily: [], funnel: null, heatmap: null });
  const defaultKpiFilterLabels = {
    arrival: { all: 'all' },
    disposition: { all: 'all' },
    cardType: { all: 'all' },
  };
  const uiHooks = env.uiHooks || {};
  const chartHooks = env.chartHooks || {};
  const kpiHooks = env.kpiHooks || {};
  const feedbackHooks = env.feedbackHooks || {};
  const edHooks = env.edHooks || {};
  const dataHooks = env.dataHooks || {};
  return {
    ...env,
    runAfterDomAndIdle: env.runAfterDomAndIdle ?? uiHooks.runAfterDomAndIdle ?? ((fn) => fn()),
    setDatasetValue: env.setDatasetValue ?? uiHooks.setDatasetValue ?? noop,
    setStatus: env.setStatus ?? uiHooks.setStatus ?? noop,
    getSettings: env.getSettings ?? uiHooks.getSettings ?? (() => ({ calculations: {} })),
    getClientConfig: env.getClientConfig ?? uiHooks.getClientConfig ?? (() => ({ profilingEnabled: false })),
    getAutoRefreshTimerId: env.getAutoRefreshTimerId ?? uiHooks.getAutoRefreshTimerId ?? (() => null),
    setAutoRefreshTimerId: env.setAutoRefreshTimerId ?? uiHooks.setAutoRefreshTimerId ?? noop,
    showChartSkeletons: env.showChartSkeletons ?? chartHooks.showChartSkeletons ?? noop,
    populateChartYearOptions: env.populateChartYearOptions ?? chartHooks.populateChartYearOptions ?? noop,
    populateChartsHospitalTableYearOptions:
      env.populateChartsHospitalTableYearOptions ?? chartHooks.populateChartsHospitalTableYearOptions ?? noop,
    populateHourlyCompareYearOptions:
      env.populateHourlyCompareYearOptions ?? chartHooks.populateHourlyCompareYearOptions ?? noop,
    populateHeatmapYearOptions:
      env.populateHeatmapYearOptions ?? chartHooks.populateHeatmapYearOptions ?? noop,
    syncHeatmapFilterControls: env.syncHeatmapFilterControls ?? chartHooks.syncHeatmapFilterControls ?? noop,
    getDefaultChartFilters: env.getDefaultChartFilters ?? chartHooks.getDefaultChartFilters ?? noopObject,
    sanitizeChartFilters: env.sanitizeChartFilters ?? chartHooks.sanitizeChartFilters ?? ((value) => value),
    KPI_FILTER_LABELS: env.KPI_FILTER_LABELS ?? chartHooks.KPI_FILTER_LABELS ?? defaultKpiFilterLabels,
    syncChartFilterControls: env.syncChartFilterControls ?? chartHooks.syncChartFilterControls ?? noop,
    prepareChartDataForPeriod:
      env.prepareChartDataForPeriod ?? chartHooks.prepareChartDataForPeriod ?? noopChartData,
    renderChartsPrimary: env.renderChartsPrimary ?? chartHooks.renderChartsPrimary ?? null,
    renderChartsSecondary: env.renderChartsSecondary ?? chartHooks.renderChartsSecondary ?? null,
    renderCharts: env.renderCharts ?? chartHooks.renderCharts ?? noopAsync,
    renderChartsHospitalTable: env.renderChartsHospitalTable ?? chartHooks.renderChartsHospitalTable ?? noop,
    getHeatmapData: env.getHeatmapData ?? chartHooks.getHeatmapData ?? (() => null),
    onPrimaryVisible: env.onPrimaryVisible ?? uiHooks.onPrimaryVisible ?? noop,
    onSecondaryComplete: env.onSecondaryComplete ?? uiHooks.onSecondaryComplete ?? noop,
    onChartsPrimaryVisible:
      env.onChartsPrimaryVisible ??
      chartHooks.onChartsPrimaryVisible ??
      env.onPrimaryVisible ??
      uiHooks.onPrimaryVisible ??
      noop,
    scheduleChartsSecondaryRender:
      env.scheduleChartsSecondaryRender ??
      chartHooks.scheduleChartsSecondaryRender ??
      env.scheduleSecondaryRender ??
      uiHooks.scheduleSecondaryRender ??
      null,
    showKpiSkeleton: env.showKpiSkeleton ?? kpiHooks.showKpiSkeleton ?? noop,
    syncKpiFilterControls: env.syncKpiFilterControls ?? kpiHooks.syncKpiFilterControls ?? noop,
    applyKpiFiltersAndRender: env.applyKpiFiltersAndRender ?? kpiHooks.applyKpiFiltersAndRender ?? noopAsync,
    initializeKpiDefaultWindow: env.initializeKpiDefaultWindow ?? kpiHooks.initializeDefaultWindow,
    updateFeedbackFilterOptions:
      env.updateFeedbackFilterOptions ?? feedbackHooks.updateFeedbackFilterOptions ?? noop,
    applyFeedbackFiltersAndRender:
      env.applyFeedbackFiltersAndRender ?? feedbackHooks.applyFeedbackFiltersAndRender ?? noop,
    applyFeedbackStatusNote: env.applyFeedbackStatusNote ?? feedbackHooks.applyFeedbackStatusNote ?? noop,
    showEdSkeleton: env.showEdSkeleton ?? edHooks.showEdSkeleton ?? noop,
    renderEdDashboard: env.renderEdDashboard ?? edHooks.renderEdDashboard ?? noopAsync,
    createEmptyEdSummary: env.createEmptyEdSummary ?? edHooks.createEmptyEdSummary ?? noopObject,
    createChunkReporter: env.createChunkReporter ?? dataHooks.createChunkReporter ?? (() => null),
    fetchData: env.fetchData ?? dataHooks.fetchData ?? (async () => ({})),
    fetchFeedbackData: env.fetchFeedbackData ?? dataHooks.fetchFeedbackData ?? noopAsyncArray,
    fetchEdData: env.fetchEdData ?? dataHooks.fetchEdData ?? (async () => null),
    perfMonitor: env.perfMonitor ??
      dataHooks.perfMonitor ?? {
        start: () => null,
        finish: () => {},
        logTable: () => {},
      },
    describeCacheMeta: env.describeCacheMeta ?? dataHooks.describeCacheMeta ?? (() => ({})),
    describeError:
      env.describeError ??
      dataHooks.describeError ??
      ((error, options = {}) => ({
        log: options?.code || 'DATA_FLOW',
        userMessage: options?.message || String(error?.message || 'Klaida'),
      })),
    computeDailyStats: env.computeDailyStats ?? dataHooks.computeDailyStats ?? noopArray,
    filterDailyStatsByWindow:
      env.filterDailyStatsByWindow ??
      dataHooks.filterDailyStatsByWindow ??
      ((daily) => (Array.isArray(daily) ? daily : [])),
    mergeDailyStatsSeries:
      env.mergeDailyStatsSeries ??
      dataHooks.mergeDailyStatsSeries ??
      ((seriesList) => (Array.isArray(seriesList?.[0]) ? seriesList[0] : [])),
    renderRecentTable: env.renderRecentTable ?? dataHooks.renderRecentTable ?? noop,
    computeMonthlyStats: env.computeMonthlyStats ?? dataHooks.computeMonthlyStats ?? noopArray,
    renderMonthlyTable: env.renderMonthlyTable ?? dataHooks.renderMonthlyTable ?? noop,
    computeYearlyStats: env.computeYearlyStats ?? dataHooks.computeYearlyStats ?? noopArray,
    renderYearlyTable: env.renderYearlyTable ?? dataHooks.renderYearlyTable ?? noop,
    supportsDeferredHistoricalHydration:
      env.supportsDeferredHistoricalHydration ?? dataHooks.supportsDeferredHistoricalHydration,
    supportsPartialPrimaryRender: env.supportsPartialPrimaryRender ?? dataHooks.supportsPartialPrimaryRender,
    requiresFullRecordsForPrimary:
      env.requiresFullRecordsForPrimary ?? dataHooks.requiresFullRecordsForPrimary,
    fetchProfile: env.fetchProfile ?? dataHooks.fetchProfile,
    supportsDeferredFullRecordsHydration:
      env.supportsDeferredFullRecordsHydration ?? dataHooks.supportsDeferredFullRecordsHydration,
    requiresFullRecordsForInteractions:
      env.requiresFullRecordsForInteractions ?? dataHooks.requiresFullRecordsForInteractions,
  };
}
