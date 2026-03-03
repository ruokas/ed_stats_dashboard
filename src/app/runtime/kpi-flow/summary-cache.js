export function buildSummaryModeSelectedDateRecordsCacheKey(deps, filters, selectedDate, settings) {
  const normalizedDate = deps.normalizeKpiDateValue(selectedDate);
  if (!normalizedDate) {
    return '';
  }
  const safeFilters = filters || {};
  const shiftStartHour = deps.resolveShiftStartHour(settings?.calculations || {});
  return [
    normalizedDate,
    String(safeFilters.shift || ''),
    String(safeFilters.arrival || ''),
    String(safeFilters.disposition || ''),
    String(safeFilters.cardType || ''),
    Number.isFinite(Number(safeFilters.window)) ? Number(safeFilters.window) : '',
    Number.isFinite(Number(shiftStartHour)) ? shiftStartHour : '',
  ].join('|');
}

export function clearSummaryModeSelectedDateRecordsCache(deps) {
  const kpiState = deps.dashboardState.kpi || {};
  kpiState.workerSummaryModeSelectedDateRecordsKey = '';
  kpiState.workerSummaryModeSelectedDateRecordsRefPrimary = null;
  kpiState.workerSummaryModeSelectedDateRecords = [];
  kpiState.workerSummaryModeSelectedDateDailyStats = [];
  kpiState.workerSummaryModeSelectedDateRecordsLoadingKey = '';
  kpiState.workerSummaryModeSelectedDateRecordsLoadingRefPrimary = null;
}

export function getSummaryModeSelectedDateRecordsCache(deps, filters, selectedDate, settings) {
  const kpiState = deps.dashboardState.kpi || {};
  const cacheKey = buildSummaryModeSelectedDateRecordsCacheKey(deps, filters, selectedDate, settings);
  if (!cacheKey) {
    return null;
  }
  const primaryRecordsRef = Array.isArray(deps.dashboardState.primaryRecords)
    ? deps.dashboardState.primaryRecords
    : null;
  if (
    kpiState.workerSummaryModeSelectedDateRecordsRefPrimary === primaryRecordsRef &&
    kpiState.workerSummaryModeSelectedDateRecordsKey === cacheKey &&
    Array.isArray(kpiState.workerSummaryModeSelectedDateRecords) &&
    Array.isArray(kpiState.workerSummaryModeSelectedDateDailyStats)
  ) {
    return {
      records: kpiState.workerSummaryModeSelectedDateRecords,
      dailyStats: kpiState.workerSummaryModeSelectedDateDailyStats,
    };
  }
  return null;
}
