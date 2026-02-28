export function createSummariesDataFlowConfig({
  pageConfig,
  selectors,
  dashboardState,
  text,
  defaultSettings,
  autoRefreshIntervalMs,
  runAfterDomAndIdle,
  setDatasetValue,
  setStatus,
  fetchData,
  perfMonitor,
  describeCacheMeta,
  describeError,
  computeDailyStats,
  filterDailyStatsByWindow,
  getDefaultChartFilters,
  computeMonthlyStats,
  computeYearlyStats,
  renderRecentTable,
  renderYearlyTable,
  numberFormatter,
  getSettings,
  getClientConfig,
  getAutoRefreshTimerId,
  setAutoRefreshTimerId,
}) {
  const safeFilterDailyStatsByWindow =
    typeof filterDailyStatsByWindow === 'function'
      ? filterDailyStatsByWindow
      : (dailyStats) => (Array.isArray(dailyStats) ? dailyStats : []);
  const safeRenderRecentTable = typeof renderRecentTable === 'function' ? renderRecentTable : () => {};

  return {
    pageConfig,
    selectors,
    dashboardState,
    TEXT: text,
    DEFAULT_SETTINGS: defaultSettings,
    AUTO_REFRESH_INTERVAL_MS: autoRefreshIntervalMs,
    uiHooks: {
      runAfterDomAndIdle,
      setDatasetValue,
      setStatus,
      getSettings,
      getClientConfig,
      getAutoRefreshTimerId,
      setAutoRefreshTimerId,
    },
    chartHooks: {
      getDefaultChartFilters,
    },
    dataHooks: {
      fetchData,
      perfMonitor,
      describeCacheMeta,
      describeError,
      computeDailyStats,
      filterDailyStatsByWindow: safeFilterDailyStatsByWindow,
      renderRecentTable: safeRenderRecentTable,
      computeMonthlyStats,
      computeYearlyStats,
      renderYearlyTable,
    },
    numberFormatter,
  };
}
