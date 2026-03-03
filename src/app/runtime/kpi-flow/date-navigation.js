export function collectAvailableShiftDateKeys(deps, records) {
  const kpiState = deps.dashboardState.kpi || {};
  if (
    (!Array.isArray(records) || records.length === 0) &&
    Array.isArray(kpiState.workerSummaryModeAvailableDateKeys)
  ) {
    const keys = kpiState.workerSummaryModeAvailableDateKeys;
    const indexMap =
      kpiState.workerSummaryModeDateIndexMap instanceof Map
        ? kpiState.workerSummaryModeDateIndexMap
        : new Map(keys.map((key, index) => [key, index]));
    return { keys, indexMap };
  }
  if (
    kpiState.availableDateRecordsRef === records &&
    Array.isArray(kpiState.availableDateKeys) &&
    kpiState.availableDateIndexMap instanceof Map
  ) {
    return {
      keys: kpiState.availableDateKeys,
      indexMap: kpiState.availableDateIndexMap,
    };
  }
  const settings = deps.getSettings();
  const shiftStartHour = deps.resolveShiftStartHour(settings?.calculations || {});
  const keys = new Set();
  (Array.isArray(records) ? records : []).forEach((record) => {
    const key = deps.normalizeKpiDateValue(deps.getRecordShiftDateKey(record, shiftStartHour));
    if (key) {
      keys.add(key);
    }
  });
  const sortedKeys = Array.from(keys).sort((a, b) => a.localeCompare(b));
  const indexMap = new Map();
  for (let index = 0; index < sortedKeys.length; index += 1) {
    indexMap.set(sortedKeys[index], index);
  }
  kpiState.availableDateRecordsRef = records;
  kpiState.availableDateKeys = sortedKeys;
  kpiState.availableDateIndexMap = indexMap;
  return { keys: sortedKeys, indexMap };
}

export function syncKpiDateNavigation(deps, records = deps.dashboardState.kpi?.records) {
  const hasPrev = deps.selectors.kpiDatePrev instanceof HTMLButtonElement;
  const hasNext = deps.selectors.kpiDateNext instanceof HTMLButtonElement;
  if (!hasPrev && !hasNext) {
    return;
  }
  const availableMeta = deps.collectAvailableShiftDateKeys(records);
  const available = availableMeta.keys;
  const selectedDate = deps.normalizeKpiDateValue(deps.dashboardState.kpi?.selectedDate);
  const selectedIndex =
    selectedDate && availableMeta.indexMap.has(selectedDate) ? availableMeta.indexMap.get(selectedDate) : -1;
  const hasAny = available.length > 0;

  const prevDisabled = !hasAny || (selectedIndex >= 0 && selectedIndex <= 0);
  const nextDisabled = !hasAny || (selectedIndex >= 0 && selectedIndex >= available.length - 1);

  if (hasPrev) {
    deps.selectors.kpiDatePrev.disabled = prevDisabled;
    deps.selectors.kpiDatePrev.setAttribute('aria-disabled', prevDisabled ? 'true' : 'false');
  }
  if (hasNext) {
    deps.selectors.kpiDateNext.disabled = nextDisabled;
    deps.selectors.kpiDateNext.setAttribute('aria-disabled', nextDisabled ? 'true' : 'false');
  }
}

export function ensureDefaultKpiDateSelection(deps, records) {
  const selectedDate = deps.normalizeKpiDateValue(deps.dashboardState.kpi?.selectedDate);
  if (selectedDate) {
    return;
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = deps.normalizeKpiDateValue(deps.formatLocalDateKey(yesterday));
  if (!yesterdayKey) {
    return;
  }
  deps.dashboardState.kpi.selectedDate = yesterdayKey;
  if (deps.selectors.kpiDateInput) {
    deps.selectors.kpiDateInput.value = yesterdayKey;
  }
  deps.syncKpiDateNavigation(records);
}
