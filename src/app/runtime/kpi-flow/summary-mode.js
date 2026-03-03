export async function commitKpiSummaryModeResult(deps, options) {
  const { result, effectiveWindow, settings } = options || {};
  const filteredDailyStats = Array.isArray(result?.dailyStats) ? result.dailyStats : [];
  const summary = result?.kpiSummary && typeof result.kpiSummary === 'object' ? result.kpiSummary : {};
  const availableDateKeys = Array.isArray(summary.availableDateKeys) ? summary.availableDateKeys : [];
  const selectedDateDailyStats = Array.isArray(summary.selectedDateDailyStats)
    ? summary.selectedDateDailyStats
    : filteredDailyStats;
  const totalFilteredRecords = Number.isFinite(Number(summary.totalFilteredRecords))
    ? Number(summary.totalFilteredRecords)
    : 0;
  const selectedDateRecordCount = Number.isFinite(Number(summary.selectedDateRecordCount))
    ? Number(summary.selectedDateRecordCount)
    : totalFilteredRecords;
  let selectedDate = deps.normalizeKpiDateValue(deps.dashboardState.kpi?.selectedDate);
  const lastShiftHourly = summary.lastShiftHourly || null;

  deps.setWorkerAvailableDateKeys(availableDateKeys);
  deps.dashboardState.kpi.records = [];
  deps.dashboardState.kpi.daily = filteredDailyStats;
  deps.ensureDefaultKpiDateSelection([]);
  deps.syncKpiDateNavigation([]);
  selectedDate = deps.normalizeKpiDateValue(deps.dashboardState.kpi?.selectedDate);
  if (selectedDate) {
    void deps.ensureSummaryModeSelectedDateRecordsCache(
      deps.dashboardState.kpi.filters,
      selectedDate,
      settings
    );
  } else {
    deps.clearSummaryModeSelectedDateRecordsCache();
  }

  const nextUiSignature = deps.buildKpiUiRenderSignature({
    filteredRecords: [],
    filteredDailyStats,
    dateFilteredRecords: [],
    dateFilteredDailyStats: selectedDate ? selectedDateDailyStats : filteredDailyStats,
    selectedDate,
    effectiveWindow,
    settings,
    filteredRecordsKeyOverride: `summary:${totalFilteredRecords}`,
    dateFilteredRecordsKeyOverride: `summary-hourly:${selectedDate ? selectedDateRecordCount : totalFilteredRecords}:${deps.fingerprintHourlySeriesInfo(lastShiftHourly)}`,
  });
  if (deps.isSameKpiUiRenderSignature(deps.getLastKpiUiRenderSignature(), nextUiSignature)) {
    deps.ensureKpiSkeletonHidden();
    return;
  }

  await deps.renderLastShiftHourlySeriesInfo(lastShiftHourly);
  deps.renderKpis(selectedDate ? selectedDateDailyStats : filteredDailyStats, filteredDailyStats);
  deps.updateKpiSummary({
    records: [],
    dailyStats: selectedDate ? selectedDateDailyStats : filteredDailyStats,
    windowDays: selectedDate ? null : effectiveWindow,
    recordCountOverride: selectedDate ? selectedDateRecordCount : totalFilteredRecords,
  });
  deps.updateKpiSubtitle();
  deps.setLastKpiUiRenderSignature(nextUiSignature);
}
