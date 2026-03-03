export async function recomputeLastShiftHourlyViaWorkerDetail(deps) {
  if (typeof deps.runKpiWorkerDetailJob !== 'function') {
    return false;
  }
  const normalizedFilters = deps.sanitizeKpiFilters(deps.dashboardState.kpi.filters, {
    getDefaultKpiFilters: deps.getDefaultKpiFilters,
    KPI_FILTER_LABELS: deps.KPI_FILTER_LABELS,
  });
  deps.dashboardState.kpi.filters = { ...normalizedFilters };
  const defaultFilters = deps.getDefaultKpiFilters();
  const settings = deps.getSettings();
  const selectedDate = deps.normalizeKpiDateValue(deps.dashboardState.kpi?.selectedDate);
  const metric = deps.normalizeLastShiftMetric(deps.dashboardState.kpi?.lastShiftHourlyMetric);
  const detailToken = deps.nextDetailToken();
  const workerTokenAtStart = deps.getWorkerToken();
  try {
    const result = await deps.runKpiWorkerDetailJob({
      type: 'computeKpiLastShiftHourlyByHandle',
      filters: normalizedFilters,
      defaultFilters,
      windowDays: normalizedFilters.window,
      selectedDate,
      lastShiftHourlyMetric: metric,
      records: Array.isArray(deps.dashboardState.primaryRecords) ? deps.dashboardState.primaryRecords : [],
      dailyStats: Array.isArray(deps.dashboardState.primaryDaily) ? deps.dashboardState.primaryDaily : [],
      calculations: settings?.calculations || {},
      calculationDefaults: deps.defaultCalculations,
    });
    if (detailToken !== deps.getDetailToken() || workerTokenAtStart !== deps.getWorkerToken()) {
      return true;
    }
    await deps.renderLastShiftHourlySeriesInfo(result?.lastShiftHourly || null, {
      forceNonBlocking: true,
    });
    return true;
  } catch (error) {
    const errorInfo = deps.describeError(error, {
      code: 'KPI_WORKER_HOURLY',
      message: "Nepavyko atnaujinti KPI paskutinės pamainos grafiko worker'yje",
    });
    console.error(errorInfo.log, error);
    return false;
  }
}
