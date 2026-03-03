export function getSelectedDateDailyCache(deps, recordsRef, selectedDate, shiftStartHour) {
  const kpiState = deps.dashboardState.kpi || {};
  const key = `${selectedDate || ''}|${shiftStartHour}`;
  if (
    kpiState.selectedDateDailyRefRecords === recordsRef &&
    kpiState.selectedDateDailyKey === key &&
    Array.isArray(kpiState.selectedDateDailyStats)
  ) {
    return kpiState.selectedDateDailyStats;
  }
  return null;
}

export function setSelectedDateDailyCache(deps, recordsRef, selectedDate, shiftStartHour, dailyStats) {
  const kpiState = deps.dashboardState.kpi || {};
  kpiState.selectedDateDailyRefRecords = recordsRef;
  kpiState.selectedDateDailyKey = `${selectedDate || ''}|${shiftStartHour}`;
  kpiState.selectedDateDailyStats = Array.isArray(dailyStats) ? dailyStats : [];
}

export function resolveDateFilteredData(deps, baseRecords, baseDailyStats, selectedDate, settings) {
  if (!selectedDate) {
    return {
      records: baseRecords,
      dailyStats: baseDailyStats,
    };
  }
  const shiftStartHour = deps.resolveShiftStartHour(settings?.calculations || {});
  const dateFilteredRecords = deps.filterKpiRecordsByDate(baseRecords, selectedDate, shiftStartHour);
  const cachedDailyStats = getSelectedDateDailyCache(deps, baseRecords, selectedDate, shiftStartHour);
  if (cachedDailyStats) {
    return {
      records: dateFilteredRecords,
      dailyStats: cachedDailyStats,
    };
  }
  const computedDailyStats = deps.computeDailyStats(
    dateFilteredRecords,
    settings?.calculations,
    deps.defaultSettings
  );
  setSelectedDateDailyCache(deps, baseRecords, selectedDate, shiftStartHour, computedDailyStats);
  return {
    records: dateFilteredRecords,
    dailyStats: computedDailyStats,
  };
}
