export function updateKpiSubtitle(deps) {
  if (!deps.selectors.kpiSubtitle) {
    return;
  }
  deps.selectors.kpiSubtitle.textContent = deps.TEXT.kpis.subtitle;
}

export function updateKpiSummary(deps, options) {
  if (!deps.selectors.kpiActiveInfo) {
    return;
  }
  const { records, dailyStats, windowDays, recordCountOverride = null } = options || {};
  const filters = deps.dashboardState.kpi.filters;
  const selectedDate = deps.normalizeKpiDateValue(deps.dashboardState.kpi?.selectedDate);
  const isDateFiltered = Boolean(selectedDate);
  const defaultFilters = deps.getDefaultKpiFilters();
  const totalRecords = Number.isFinite(Number(recordCountOverride))
    ? Number(recordCountOverride)
    : Array.isArray(records)
      ? records.length
      : 0;
  const hasAggregatedData = Array.isArray(dailyStats)
    ? dailyStats.some((entry) => Number.isFinite(entry?.count) && entry.count > 0)
    : false;
  const hasData = totalRecords > 0 || hasAggregatedData;
  const summaryParts = [];
  const isWindowDefault = Number.isFinite(windowDays) ? windowDays === defaultFilters.window : false;
  const isShiftDefault = filters.shift === defaultFilters.shift;
  const isArrivalDefault = filters.arrival === defaultFilters.arrival;
  const isDispositionDefault = filters.disposition === defaultFilters.disposition;
  const isCardTypeDefault = filters.cardType === defaultFilters.cardType;

  if (!isDateFiltered && Number.isFinite(windowDays) && windowDays > 0 && !isWindowDefault) {
    summaryParts.push(`${windowDays} d.`);
  }
  if (!isShiftDefault) {
    summaryParts.push(deps.toSentenceCase(deps.KPI_FILTER_LABELS.shift[filters.shift]));
  }
  if (!isArrivalDefault) {
    summaryParts.push(deps.toSentenceCase(deps.KPI_FILTER_LABELS.arrival[filters.arrival]));
  }
  if (!isDispositionDefault) {
    summaryParts.push(deps.toSentenceCase(deps.KPI_FILTER_LABELS.disposition[filters.disposition]));
  }
  if (!isCardTypeDefault) {
    summaryParts.push(deps.toSentenceCase(deps.KPI_FILTER_LABELS.cardType[filters.cardType]));
  }
  let text = summaryParts.join(' • ');
  if (!hasData) {
    text = text ? `Įrašų nerasta • ${text}` : 'Įrašų nerasta';
  }
  if (!text) {
    deps.selectors.kpiActiveInfo.textContent = '';
    deps.setDatasetValue(deps.selectors.kpiActiveInfo, 'default', 'true');
    return;
  }
  deps.selectors.kpiActiveInfo.textContent = text;
  deps.setDatasetValue(deps.selectors.kpiActiveInfo, 'default', 'false');
}

export function refreshKpiWindowOptions(deps) {
  const select = deps.selectors.kpiWindow;
  if (!select) {
    return;
  }
  const settings = deps.getSettings();
  const configuredWindowRaw = Number.isFinite(Number(settings?.calculations?.windowDays))
    ? Number(settings.calculations.windowDays)
    : deps.DEFAULT_SETTINGS.calculations.windowDays;
  const configuredWindow =
    Number.isFinite(configuredWindowRaw) && configuredWindowRaw > 0
      ? configuredWindowRaw
      : deps.DEFAULT_KPI_WINDOW_DAYS;
  const currentWindowRaw = Number.isFinite(Number(deps.dashboardState.kpi?.filters?.window))
    ? Number(deps.dashboardState.kpi.filters.window)
    : configuredWindow;
  const currentWindow =
    Number.isFinite(currentWindowRaw) && currentWindowRaw > 0 ? currentWindowRaw : configuredWindow;
  const uniqueValues = [...new Set([...deps.KPI_WINDOW_OPTION_BASE, configuredWindow, currentWindow])]
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => {
      if (a === 0) return 1;
      if (b === 0) return -1;
      return a - b;
    });
  const options = uniqueValues.map((value) => {
    const option = document.createElement('option');
    option.value = String(value);
    if (value === 0) {
      option.textContent = deps.TEXT.kpis.windowAllLabel;
    } else if (value === 365) {
      option.textContent = `${value} d. (${deps.TEXT.kpis.windowYearSuffix})`;
    } else {
      option.textContent = `${value} d.`;
    }
    return option;
  });
  select.replaceChildren(...options);
}

export function syncKpiSegmentedButtons(deps) {
  const filters = deps.dashboardState.kpi?.filters || deps.getDefaultKpiFilters();
  if (Array.isArray(deps.selectors.kpiArrivalButtons) && deps.selectors.kpiArrivalButtons.length) {
    deps.selectors.kpiArrivalButtons.forEach((button) => {
      const value = deps.getDatasetValue(button, 'kpiArrival');
      if (!value) {
        return;
      }
      button.setAttribute('aria-pressed', String(value === filters.arrival));
    });
  }
  if (Array.isArray(deps.selectors.kpiCardTypeButtons) && deps.selectors.kpiCardTypeButtons.length) {
    deps.selectors.kpiCardTypeButtons.forEach((button) => {
      const value = deps.getDatasetValue(button, 'kpiCardType');
      if (!value) {
        return;
      }
      button.setAttribute('aria-pressed', String(value === filters.cardType));
    });
  }
}

export function syncKpiFilterControls(deps) {
  const filters = deps.dashboardState.kpi.filters;
  if (deps.selectors.kpiWindow && Number.isFinite(filters.window)) {
    const windowValue = String(filters.window);
    const existing = Array.from(deps.selectors.kpiWindow.options).some(
      (option) => option.value === windowValue
    );
    if (!existing) {
      const option = document.createElement('option');
      option.value = windowValue;
      option.textContent = `${filters.window} d.`;
      deps.selectors.kpiWindow.appendChild(option);
    }
    deps.selectors.kpiWindow.value = windowValue;
  }
  if (deps.selectors.kpiShift) {
    deps.selectors.kpiShift.value = filters.shift;
  }
  if (deps.selectors.kpiArrival) {
    deps.selectors.kpiArrival.value = filters.arrival;
  }
  if (deps.selectors.kpiDisposition) {
    deps.selectors.kpiDisposition.value = filters.disposition;
  }
  if (deps.selectors.kpiCardType) {
    deps.selectors.kpiCardType.value = filters.cardType;
  }
  if (deps.selectors.kpiDateInput) {
    deps.selectors.kpiDateInput.value =
      deps.normalizeKpiDateValue(deps.dashboardState.kpi?.selectedDate) || '';
  }
  deps.syncKpiSegmentedButtons();
  deps.updateKpiSubtitle();
}
