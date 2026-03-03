export function handleKpiFilterInput(deps, event) {
  const target = event.target;
  if (!target || !('name' in target)) {
    return;
  }
  const { name, value } = target;
  const filters = deps.dashboardState.kpi.filters;
  if (name === 'window') {
    const numeric = Number.parseInt(value, 10);
    if (Number.isFinite(numeric) && numeric >= 0) {
      filters.window = numeric;
    }
  } else if (name === 'shift' && value in deps.KPI_FILTER_LABELS.shift) {
    filters.shift = value;
  } else if (name === 'arrival' && value in deps.KPI_FILTER_LABELS.arrival) {
    filters.arrival = value;
  } else if (name === 'disposition' && value in deps.KPI_FILTER_LABELS.disposition) {
    filters.disposition = value;
  } else if (name === 'cardType' && value in deps.KPI_FILTER_LABELS.cardType) {
    filters.cardType = value;
  }
  deps.syncKpiSegmentedButtons();
  void deps.applyKpiFiltersAndRender();
}

export function handleKpiDateInput(deps, event) {
  const target = event.target;
  if (!target || !('value' in target)) {
    return;
  }
  const normalized = deps.normalizeKpiDateValue(target.value);
  deps.dashboardState.kpi.selectedDate = normalized;
  deps.notifyKpiStateChange();
  deps.syncKpiDateNavigation();
  deps.updateKpiSubtitle();
  void deps.applyKpiFiltersAndRender();
}

export function handleKpiDateClear(deps) {
  deps.dashboardState.kpi.selectedDate = null;
  deps.notifyKpiStateChange();
  if (deps.selectors.kpiDateInput) {
    deps.selectors.kpiDateInput.value = '';
  }
  deps.syncKpiDateNavigation();
  deps.updateKpiSubtitle();
  void deps.applyKpiFiltersAndRender();
}

export function handleKpiDateStep(deps, step) {
  const direction = Number(step) < 0 ? -1 : 1;
  const availableMeta = deps.collectAvailableShiftDateKeys(deps.dashboardState.kpi?.records);
  const available = availableMeta.keys;
  if (!available.length) {
    deps.syncKpiDateNavigation(deps.dashboardState.kpi?.records);
    return;
  }
  const selectedDate = deps.normalizeKpiDateValue(deps.dashboardState.kpi?.selectedDate);
  const selectedIndex =
    selectedDate && availableMeta.indexMap.has(selectedDate) ? availableMeta.indexMap.get(selectedDate) : -1;
  let nextIndex;
  if (selectedIndex < 0) {
    nextIndex = direction < 0 ? available.length - 1 : 0;
  } else {
    nextIndex = Math.min(Math.max(selectedIndex + direction, 0), available.length - 1);
  }
  if (nextIndex === selectedIndex) {
    deps.syncKpiDateNavigation(deps.dashboardState.kpi?.records);
    return;
  }
  const nextDate = available[nextIndex];
  deps.dashboardState.kpi.selectedDate = nextDate;
  deps.notifyKpiStateChange();
  if (deps.selectors.kpiDateInput) {
    deps.selectors.kpiDateInput.value = nextDate;
  }
  deps.syncKpiDateNavigation(deps.dashboardState.kpi?.records);
  deps.updateKpiSubtitle();
  void deps.applyKpiFiltersAndRender();
}

export function handleKpiSegmentedClick(deps, event) {
  const button = event.currentTarget;
  if (!(button instanceof HTMLElement)) {
    return;
  }
  const arrival = deps.getDatasetValue(button, 'kpiArrival');
  if (arrival && deps.selectors.kpiArrival) {
    deps.selectors.kpiArrival.value = arrival;
    deps.selectors.kpiArrival.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  const cardType = deps.getDatasetValue(button, 'kpiCardType');
  if (cardType && deps.selectors.kpiCardType) {
    deps.selectors.kpiCardType.value = cardType;
    deps.selectors.kpiCardType.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

export function handleLastShiftMetricClick(deps, event) {
  const button = event.currentTarget;
  if (!(button instanceof HTMLElement)) {
    return;
  }
  const metric = deps.normalizeLastShiftMetric(deps.getDatasetValue(button, 'lastShiftMetric'));
  deps.dashboardState.kpi.lastShiftHourlyMetric = metric;
  deps.syncLastShiftHourlyMetricButtons();
  const selectedDate = deps.normalizeKpiDateValue(deps.dashboardState.kpi?.selectedDate);
  const baseRecords = Array.isArray(deps.dashboardState.kpi?.records) ? deps.dashboardState.kpi.records : [];
  const baseDaily = Array.isArray(deps.dashboardState.kpi?.daily) ? deps.dashboardState.kpi.daily : [];
  const hasWorkerSummaryDates =
    Array.isArray(deps.dashboardState.kpi?.workerSummaryModeAvailableDateKeys) &&
    deps.dashboardState.kpi.workerSummaryModeAvailableDateKeys.length > 0;
  if (!baseRecords.length && hasWorkerSummaryDates) {
    const settings = deps.getSettings();
    const cachedSelectedDate = selectedDate
      ? deps.getSummaryModeSelectedDateRecordsCache(deps.dashboardState.kpi?.filters, selectedDate, settings)
      : null;
    if (selectedDate && cachedSelectedDate) {
      void deps.renderLastShiftHourlyChart(cachedSelectedDate.records, cachedSelectedDate.dailyStats);
      return;
    }
    void (async () => {
      const handled = await deps.recomputeLastShiftHourlyViaWorkerDetail();
      if (!handled) {
        void deps.applyKpiFiltersAndRender();
      }
    })();
    return;
  }
  if (selectedDate) {
    const settings = deps.getSettings();
    const dateFiltered = deps.resolveDateFilteredData(baseRecords, baseDaily, selectedDate, settings);
    void deps.renderLastShiftHourlyChart(dateFiltered.records, dateFiltered.dailyStats);
    return;
  }
  void deps.renderLastShiftHourlyChart(baseRecords, baseDaily);
}

export function syncLastShiftHourlyMetricButtons(deps) {
  if (!Array.isArray(deps.selectors.lastShiftHourlyMetricButtons)) {
    return;
  }
  const metric = deps.normalizeLastShiftMetric(deps.dashboardState.kpi.lastShiftHourlyMetric);
  deps.selectors.lastShiftHourlyMetricButtons.forEach((btn) => {
    const btnMetric = deps.normalizeLastShiftMetric(deps.getDatasetValue(btn, 'lastShiftMetric'));
    btn.setAttribute('aria-pressed', btnMetric === metric ? 'true' : 'false');
  });
}

export function resetKpiFilters(deps, options = {}) {
  const { fromKeyboard } = options;
  deps.dashboardState.kpi.filters = deps.getDefaultKpiFilters();
  deps.notifyKpiStateChange();
  deps.refreshKpiWindowOptions();
  deps.syncKpiFilterControls();
  void deps.applyKpiFiltersAndRender();
  if (fromKeyboard && deps.selectors.kpiFiltersReset) {
    deps.selectors.kpiFiltersReset.focus();
  }
}
