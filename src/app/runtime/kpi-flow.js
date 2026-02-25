export function createKpiFlow(env) {
  const {
    selectors,
    dashboardState,
    TEXT,
    DEFAULT_SETTINGS,
    DEFAULT_KPI_WINDOW_DAYS,
    KPI_FILTER_LABELS,
    KPI_WINDOW_OPTION_BASE,
    getDefaultKpiFilters,
    sanitizeKpiFilters,
    getDatasetValue,
    setDatasetValue,
    dateKeyToDate,
    formatLocalDateKey,
    computeDailyStats,
    filterDailyStatsByWindow,
    matchesSharedPatientFilters,
    describeError,
    showKpiSkeleton,
    hideKpiSkeleton = null,
    renderKpis,
    renderLastShiftHourlyChartWithTheme,
    setChartCardMessage,
    getSettings,
    runKpiWorkerJob,
    runKpiWorkerDetailJob = null,
    buildLastShiftSummary,
    toSentenceCase,
    onKpiStateChange = null,
  } = env;

  let kpiWorkerJobToken = 0;
  let kpiHourlyWorkerJobToken = 0;
  let kpiDateRecordsWorkerJobToken = 0;
  let lastKpiUiRenderSignature = null;

  function ensureKpiSkeletonHidden() {
    if (typeof hideKpiSkeleton === 'function') {
      hideKpiSkeleton();
    }
  }

  function shouldShowKpiLoadingSkeleton() {
    const grid = selectors?.kpiGrid;
    if (!(grid instanceof HTMLElement)) {
      return true;
    }
    if (getDatasetValue(grid, 'skeleton') === 'true') {
      return true;
    }
    return grid.children.length === 0;
  }

  function notifyKpiStateChange() {
    if (typeof onKpiStateChange !== 'function') {
      return;
    }
    onKpiStateChange({
      ...(dashboardState.kpi?.filters || {}),
      selectedDate: dashboardState.kpi?.selectedDate || null,
    });
  }

  function getSelectedDateDailyCache(recordsRef, selectedDate, shiftStartHour) {
    const kpiState = dashboardState.kpi || {};
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

  function setSelectedDateDailyCache(recordsRef, selectedDate, shiftStartHour, dailyStats) {
    const kpiState = dashboardState.kpi || {};
    kpiState.selectedDateDailyRefRecords = recordsRef;
    kpiState.selectedDateDailyKey = `${selectedDate || ''}|${shiftStartHour}`;
    kpiState.selectedDateDailyStats = Array.isArray(dailyStats) ? dailyStats : [];
  }

  function resolveDateFilteredData(baseRecords, baseDailyStats, selectedDate, settings) {
    if (!selectedDate) {
      return {
        records: baseRecords,
        dailyStats: baseDailyStats,
      };
    }
    const shiftStartHour = resolveShiftStartHour(settings?.calculations || {});
    const dateFilteredRecords = filterKpiRecordsByDate(baseRecords, selectedDate, shiftStartHour);
    const cachedDailyStats = getSelectedDateDailyCache(baseRecords, selectedDate, shiftStartHour);
    if (cachedDailyStats) {
      return {
        records: dateFilteredRecords,
        dailyStats: cachedDailyStats,
      };
    }
    const computedDailyStats = computeDailyStats(
      dateFilteredRecords,
      settings?.calculations,
      DEFAULT_SETTINGS
    );
    setSelectedDateDailyCache(baseRecords, selectedDate, shiftStartHour, computedDailyStats);
    return {
      records: dateFilteredRecords,
      dailyStats: computedDailyStats,
    };
  }

  function setWorkerAvailableDateKeys(keys) {
    const normalizedKeys = Array.isArray(keys)
      ? keys.filter((value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
      : [];
    const deduped = [...new Set(normalizedKeys)].sort((a, b) => a.localeCompare(b));
    dashboardState.kpi.workerSummaryModeAvailableDateKeys = deduped;
    const indexMap = new Map();
    for (let index = 0; index < deduped.length; index += 1) {
      indexMap.set(deduped[index], index);
    }
    dashboardState.kpi.workerSummaryModeDateIndexMap = indexMap;
  }

  function clearWorkerAvailableDateKeys() {
    dashboardState.kpi.workerSummaryModeAvailableDateKeys = [];
    dashboardState.kpi.workerSummaryModeDateIndexMap = new Map();
  }

  function buildSummaryModeSelectedDateRecordsCacheKey(filters, selectedDate, settings) {
    const normalizedDate = normalizeKpiDateValue(selectedDate);
    if (!normalizedDate) {
      return '';
    }
    const safeFilters = filters || {};
    const shiftStartHour = resolveShiftStartHour(settings?.calculations || {});
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

  function clearSummaryModeSelectedDateRecordsCache() {
    const kpiState = dashboardState.kpi || {};
    kpiState.workerSummaryModeSelectedDateRecordsKey = '';
    kpiState.workerSummaryModeSelectedDateRecordsRefPrimary = null;
    kpiState.workerSummaryModeSelectedDateRecords = [];
    kpiState.workerSummaryModeSelectedDateDailyStats = [];
    kpiState.workerSummaryModeSelectedDateRecordsLoadingKey = '';
    kpiState.workerSummaryModeSelectedDateRecordsLoadingRefPrimary = null;
  }

  function getSummaryModeSelectedDateRecordsCache(filters, selectedDate, settings) {
    const kpiState = dashboardState.kpi || {};
    const cacheKey = buildSummaryModeSelectedDateRecordsCacheKey(filters, selectedDate, settings);
    if (!cacheKey) {
      return null;
    }
    const primaryRecordsRef = Array.isArray(dashboardState.primaryRecords)
      ? dashboardState.primaryRecords
      : null;
    if (
      kpiState.workerSummaryModeSelectedDateRecordsKey !== cacheKey ||
      kpiState.workerSummaryModeSelectedDateRecordsRefPrimary !== primaryRecordsRef
    ) {
      return null;
    }
    if (!Array.isArray(kpiState.workerSummaryModeSelectedDateRecords)) {
      return null;
    }
    return {
      key: cacheKey,
      records: kpiState.workerSummaryModeSelectedDateRecords,
      dailyStats: Array.isArray(kpiState.workerSummaryModeSelectedDateDailyStats)
        ? kpiState.workerSummaryModeSelectedDateDailyStats
        : [],
    };
  }

  async function ensureSummaryModeSelectedDateRecordsCache(filters, selectedDate, settings) {
    if (typeof runKpiWorkerDetailJob !== 'function') {
      return false;
    }
    const normalizedDate = normalizeKpiDateValue(selectedDate);
    if (!normalizedDate) {
      clearSummaryModeSelectedDateRecordsCache();
      return false;
    }
    const hasWorkerSummaryDates =
      Array.isArray(dashboardState.kpi?.workerSummaryModeAvailableDateKeys) &&
      dashboardState.kpi.workerSummaryModeAvailableDateKeys.length > 0;
    if (!hasWorkerSummaryDates) {
      return false;
    }
    const currentCache = getSummaryModeSelectedDateRecordsCache(filters, normalizedDate, settings);
    if (currentCache) {
      return true;
    }

    const kpiState = dashboardState.kpi || {};
    const primaryRecordsRef = Array.isArray(dashboardState.primaryRecords)
      ? dashboardState.primaryRecords
      : null;
    const cacheKey = buildSummaryModeSelectedDateRecordsCacheKey(filters, normalizedDate, settings);
    if (!cacheKey) {
      return false;
    }
    if (
      kpiState.workerSummaryModeSelectedDateRecordsLoadingKey === cacheKey &&
      kpiState.workerSummaryModeSelectedDateRecordsLoadingRefPrimary === primaryRecordsRef
    ) {
      return false;
    }

    const normalizedFilters = sanitizeKpiFilters(filters, {
      getDefaultKpiFilters,
      KPI_FILTER_LABELS,
    });
    dashboardState.kpi.filters = { ...normalizedFilters };
    const defaultFilters = getDefaultKpiFilters();
    const detailToken = ++kpiDateRecordsWorkerJobToken;
    const workerTokenAtStart = kpiWorkerJobToken;
    kpiState.workerSummaryModeSelectedDateRecordsLoadingKey = cacheKey;
    kpiState.workerSummaryModeSelectedDateRecordsLoadingRefPrimary = primaryRecordsRef;
    try {
      const result = await runKpiWorkerDetailJob({
        type: 'getKpiRecordsForDateByHandle',
        filters: normalizedFilters,
        defaultFilters,
        windowDays: normalizedFilters.window,
        selectedDate: normalizedDate,
        records: Array.isArray(dashboardState.primaryRecords) ? dashboardState.primaryRecords : [],
        dailyStats: Array.isArray(dashboardState.primaryDaily) ? dashboardState.primaryDaily : [],
        calculations: settings?.calculations || {},
        calculationDefaults: DEFAULT_SETTINGS.calculations,
      });
      if (detailToken !== kpiDateRecordsWorkerJobToken || workerTokenAtStart !== kpiWorkerJobToken) {
        return false;
      }
      if (normalizeKpiDateValue(dashboardState.kpi?.selectedDate) !== normalizedDate) {
        return false;
      }
      if (kpiState.workerSummaryModeSelectedDateRecordsLoadingKey !== cacheKey) {
        return false;
      }
      const requiresFullRecords = result?.meta?.requiresFullRecords === true;
      if (requiresFullRecords) {
        return false;
      }
      kpiState.workerSummaryModeSelectedDateRecordsKey = cacheKey;
      kpiState.workerSummaryModeSelectedDateRecordsRefPrimary = primaryRecordsRef;
      kpiState.workerSummaryModeSelectedDateRecords = Array.isArray(result?.records) ? result.records : [];
      kpiState.workerSummaryModeSelectedDateDailyStats = Array.isArray(result?.dailyStats)
        ? result.dailyStats
        : [];
      return true;
    } catch (error) {
      const errorInfo = describeError(error, {
        code: 'KPI_WORKER_DATE_RECORDS',
        message: "Nepavyko gauti KPI pasirinktai datai įrašų worker'yje",
      });
      console.error(errorInfo.log, error);
      return false;
    } finally {
      if (kpiState.workerSummaryModeSelectedDateRecordsLoadingKey === cacheKey) {
        kpiState.workerSummaryModeSelectedDateRecordsLoadingKey = '';
        kpiState.workerSummaryModeSelectedDateRecordsLoadingRefPrimary = null;
      }
    }
  }

  function resolveShiftStartHour(calculationSettings) {
    const fallback = Number.isFinite(Number(DEFAULT_SETTINGS?.calculations?.nightEndHour))
      ? Number(DEFAULT_SETTINGS.calculations.nightEndHour)
      : 7;
    if (Number.isFinite(Number(calculationSettings?.shiftStartHour))) {
      return Number(calculationSettings.shiftStartHour);
    }
    if (Number.isFinite(Number(calculationSettings?.nightEndHour))) {
      return Number(calculationSettings.nightEndHour);
    }
    return fallback;
  }

  function computeShiftDateKeyForArrival(date, shiftStartHour) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return '';
    }
    const dayMinutes = 24 * 60;
    const startMinutesRaw = Number.isFinite(Number(shiftStartHour)) ? Number(shiftStartHour) * 60 : 7 * 60;
    const startMinutes = ((Math.round(startMinutesRaw) % dayMinutes) + dayMinutes) % dayMinutes;
    const arrivalMinutes = date.getHours() * 60 + date.getMinutes();
    const shiftAnchor = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (arrivalMinutes < startMinutes) {
      shiftAnchor.setDate(shiftAnchor.getDate() - 1);
    }
    return formatLocalDateKey(shiftAnchor);
  }

  function normalizeKpiDateValue(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return null;
    }
    return trimmed;
  }

  function getRecordShiftDateKey(record, shiftStartHour) {
    if (!record) {
      return '';
    }
    const arrival =
      record.arrival instanceof Date && !Number.isNaN(record.arrival.getTime()) ? record.arrival : null;
    const discharge =
      record.discharge instanceof Date && !Number.isNaN(record.discharge.getTime()) ? record.discharge : null;
    const reference = arrival || discharge;
    return reference ? computeShiftDateKeyForArrival(reference, shiftStartHour) : '';
  }

  function collectAvailableShiftDateKeys(records) {
    const kpiState = dashboardState.kpi || {};
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
    const settings = getSettings();
    const shiftStartHour = resolveShiftStartHour(settings?.calculations || {});
    const keys = new Set();
    (Array.isArray(records) ? records : []).forEach((record) => {
      const key = normalizeKpiDateValue(getRecordShiftDateKey(record, shiftStartHour));
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

  function syncKpiDateNavigation(records = dashboardState.kpi?.records) {
    const hasPrev = selectors.kpiDatePrev instanceof HTMLButtonElement;
    const hasNext = selectors.kpiDateNext instanceof HTMLButtonElement;
    if (!hasPrev && !hasNext) {
      return;
    }
    const availableMeta = collectAvailableShiftDateKeys(records);
    const available = availableMeta.keys;
    const selectedDate = normalizeKpiDateValue(dashboardState.kpi?.selectedDate);
    const selectedIndex =
      selectedDate && availableMeta.indexMap.has(selectedDate)
        ? availableMeta.indexMap.get(selectedDate)
        : -1;
    const hasAny = available.length > 0;

    const prevDisabled = !hasAny || (selectedIndex >= 0 && selectedIndex <= 0);
    const nextDisabled = !hasAny || (selectedIndex >= 0 && selectedIndex >= available.length - 1);

    if (hasPrev) {
      selectors.kpiDatePrev.disabled = prevDisabled;
      selectors.kpiDatePrev.setAttribute('aria-disabled', prevDisabled ? 'true' : 'false');
    }
    if (hasNext) {
      selectors.kpiDateNext.disabled = nextDisabled;
      selectors.kpiDateNext.setAttribute('aria-disabled', nextDisabled ? 'true' : 'false');
    }
  }

  function ensureDefaultKpiDateSelection(records) {
    const selectedDate = normalizeKpiDateValue(dashboardState.kpi?.selectedDate);
    if (selectedDate) {
      return;
    }
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = normalizeKpiDateValue(formatLocalDateKey(yesterday));
    if (!yesterdayKey) {
      return;
    }
    dashboardState.kpi.selectedDate = yesterdayKey;
    if (selectors.kpiDateInput) {
      selectors.kpiDateInput.value = yesterdayKey;
    }
    syncKpiDateNavigation(records);
  }

  function filterKpiRecordsByDate(records, dateKey, shiftStartHour) {
    const list = Array.isArray(records) ? records : [];
    const normalized = normalizeKpiDateValue(dateKey);
    if (!normalized) {
      return list;
    }
    return list.filter((record) => getRecordShiftDateKey(record, shiftStartHour) === normalized);
  }

  function filterRecordsByShiftWindow(records, days) {
    if (!Array.isArray(records)) {
      return [];
    }
    if (!Number.isFinite(days) || days <= 0) {
      return records.slice();
    }
    const settings = getSettings();
    const shiftStartHour = resolveShiftStartHour(settings?.calculations || {});
    const eligibleEntries = [];
    const eligibleUtc = [];
    let endUtc = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < records.length; index += 1) {
      const entry = records[index];
      let reference = null;
      if (entry.arrival instanceof Date && !Number.isNaN(entry.arrival.getTime())) {
        reference = entry.arrival;
      } else if (entry.discharge instanceof Date && !Number.isNaN(entry.discharge.getTime())) {
        reference = entry.discharge;
      }
      if (!reference) {
        continue;
      }
      const dateKey = computeShiftDateKeyForArrival(reference, shiftStartHour);
      const date = dateKey ? dateKeyToDate(dateKey) : null;
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        continue;
      }
      const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
      if (!Number.isFinite(utc)) {
        continue;
      }
      eligibleEntries.push(entry);
      eligibleUtc.push(utc);
      if (utc > endUtc) {
        endUtc = utc;
      }
    }
    if (!eligibleEntries.length || !Number.isFinite(endUtc)) {
      return [];
    }
    const startUtc = endUtc - (days - 1) * 86400000;
    const scoped = [];
    for (let index = 0; index < eligibleEntries.length; index += 1) {
      const utc = eligibleUtc[index];
      if (utc >= startUtc && utc <= endUtc) {
        scoped.push(eligibleEntries[index]);
      }
    }
    return scoped;
  }

  function updateKpiSubtitle() {
    if (!selectors.kpiSubtitle) {
      return;
    }
    selectors.kpiSubtitle.textContent = TEXT.kpis.subtitle;
  }

  function updateKpiSummary({ records, dailyStats, windowDays, recordCountOverride = null }) {
    if (!selectors.kpiActiveInfo) {
      return;
    }
    const filters = dashboardState.kpi.filters;
    const selectedDate = normalizeKpiDateValue(dashboardState.kpi?.selectedDate);
    const isDateFiltered = Boolean(selectedDate);
    const defaultFilters = getDefaultKpiFilters();
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
      summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.shift[filters.shift]));
    }
    if (!isArrivalDefault) {
      summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.arrival[filters.arrival]));
    }
    if (!isDispositionDefault) {
      summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.disposition[filters.disposition]));
    }
    if (!isCardTypeDefault) {
      summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.cardType[filters.cardType]));
    }
    let text = summaryParts.join(' • ');
    if (!hasData) {
      text = text ? `Įrašų nerasta • ${text}` : 'Įrašų nerasta';
    }
    if (!text) {
      selectors.kpiActiveInfo.textContent = '';
      setDatasetValue(selectors.kpiActiveInfo, 'default', 'true');
      return;
    }
    selectors.kpiActiveInfo.textContent = text;
    setDatasetValue(selectors.kpiActiveInfo, 'default', 'false');
  }

  function refreshKpiWindowOptions() {
    const select = selectors.kpiWindow;
    if (!select) {
      return;
    }
    const settings = getSettings();
    const configuredWindowRaw = Number.isFinite(Number(settings?.calculations?.windowDays))
      ? Number(settings.calculations.windowDays)
      : DEFAULT_SETTINGS.calculations.windowDays;
    const configuredWindow =
      Number.isFinite(configuredWindowRaw) && configuredWindowRaw > 0
        ? configuredWindowRaw
        : DEFAULT_KPI_WINDOW_DAYS;
    const currentWindowRaw = Number.isFinite(Number(dashboardState.kpi?.filters?.window))
      ? Number(dashboardState.kpi.filters.window)
      : configuredWindow;
    const currentWindow =
      Number.isFinite(currentWindowRaw) && currentWindowRaw > 0 ? currentWindowRaw : configuredWindow;
    const uniqueValues = [...new Set([...KPI_WINDOW_OPTION_BASE, configuredWindow, currentWindow])]
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
        option.textContent = TEXT.kpis.windowAllLabel;
      } else if (value === 365) {
        option.textContent = `${value} d. (${TEXT.kpis.windowYearSuffix})`;
      } else {
        option.textContent = `${value} d.`;
      }
      return option;
    });
    select.replaceChildren(...options);
  }

  function syncKpiSegmentedButtons() {
    const filters = dashboardState.kpi?.filters || getDefaultKpiFilters();
    if (Array.isArray(selectors.kpiArrivalButtons) && selectors.kpiArrivalButtons.length) {
      selectors.kpiArrivalButtons.forEach((button) => {
        const value = getDatasetValue(button, 'kpiArrival');
        if (!value) {
          return;
        }
        button.setAttribute('aria-pressed', String(value === filters.arrival));
      });
    }
    if (Array.isArray(selectors.kpiCardTypeButtons) && selectors.kpiCardTypeButtons.length) {
      selectors.kpiCardTypeButtons.forEach((button) => {
        const value = getDatasetValue(button, 'kpiCardType');
        if (!value) {
          return;
        }
        button.setAttribute('aria-pressed', String(value === filters.cardType));
      });
    }
  }

  function syncKpiFilterControls() {
    const filters = dashboardState.kpi.filters;
    if (selectors.kpiWindow && Number.isFinite(filters.window)) {
      const windowValue = String(filters.window);
      const existing = Array.from(selectors.kpiWindow.options).some((option) => option.value === windowValue);
      if (!existing) {
        const option = document.createElement('option');
        option.value = windowValue;
        option.textContent = `${filters.window} d.`;
        selectors.kpiWindow.appendChild(option);
      }
      selectors.kpiWindow.value = windowValue;
    }
    if (selectors.kpiShift) {
      selectors.kpiShift.value = filters.shift;
    }
    if (selectors.kpiArrival) {
      selectors.kpiArrival.value = filters.arrival;
    }
    if (selectors.kpiDisposition) {
      selectors.kpiDisposition.value = filters.disposition;
    }
    if (selectors.kpiCardType) {
      selectors.kpiCardType.value = filters.cardType;
    }
    if (selectors.kpiDateInput) {
      selectors.kpiDateInput.value = normalizeKpiDateValue(dashboardState.kpi?.selectedDate) || '';
    }
    syncKpiSegmentedButtons();
    updateKpiSubtitle();
  }

  function recordMatchesKpiFilters(record, filters) {
    if (!record) {
      return false;
    }
    if (filters.shift === 'day' && record.night) {
      return false;
    }
    if (filters.shift === 'night' && !record.night) {
      return false;
    }
    return matchesSharedPatientFilters(record, filters);
  }

  function applyKpiFiltersLocally(filters) {
    const normalizedFilters = sanitizeKpiFilters(filters, { getDefaultKpiFilters, KPI_FILTER_LABELS });
    const settings = getSettings();
    const windowDays = Number.isFinite(normalizedFilters.window)
      ? normalizedFilters.window
      : DEFAULT_SETTINGS.calculations.windowDays;
    const hasPrimaryRecords =
      Array.isArray(dashboardState.primaryRecords) && dashboardState.primaryRecords.length > 0;
    const primaryDailyStats = Array.isArray(dashboardState.primaryDaily) ? dashboardState.primaryDaily : [];
    let filteredRecords = [];
    let filteredDailyStats = [];

    if (hasPrimaryRecords) {
      const scopedRecords = filterRecordsByShiftWindow(dashboardState.primaryRecords, windowDays);
      filteredRecords = scopedRecords.filter((record) => recordMatchesKpiFilters(record, normalizedFilters));
      filteredDailyStats = computeDailyStats(filteredRecords, settings?.calculations, DEFAULT_SETTINGS);
    } else {
      const scopedDaily = filterDailyStatsByWindow(primaryDailyStats, windowDays);
      filteredDailyStats = scopedDaily.slice();
    }

    return {
      filters: normalizedFilters,
      records: filteredRecords,
      dailyStats: filteredDailyStats,
      windowDays,
    };
  }

  function getLastShiftMetricLabel(metric) {
    switch (metric) {
      case 'discharges':
        return 'Išleidimai';
      case 'hospitalized':
        return 'Hospitalizacijos';
      case 'balance':
        return 'Srautų balansas';
      case 'census':
        return 'Pacientų kiekis skyriuje';
      default:
        return 'Atvykimai';
    }
  }

  function normalizeLastShiftMetric(value) {
    const raw = typeof value === 'string' ? value : String(value ?? '');
    const allowed = ['arrivals', 'discharges', 'hospitalized', 'balance', 'census'];
    if (allowed.includes(raw)) {
      return raw;
    }
    return 'arrivals';
  }

  function buildLastShiftHourlySeries(records, dailyStats, metricKey = 'arrivals') {
    const lastShiftSummary = buildLastShiftSummary(dailyStats);
    if (!lastShiftSummary?.dateKey) {
      return null;
    }
    const metric = normalizeLastShiftMetric(metricKey);
    const settings = getSettings();
    const shiftStartHour = resolveShiftStartHour(settings?.calculations || {});
    const targetDateKey = lastShiftSummary.dateKey;
    const series = {
      total: Array(24).fill(0),
      t: Array(24).fill(0),
      tr: Array(24).fill(0),
      ch: Array(24).fill(0),
      outflow: Array(24).fill(0),
      net: Array(24).fill(0),
      census: Array(24).fill(0),
    };
    (Array.isArray(records) ? records : []).forEach((record) => {
      const arrival = record?.arrival;
      const discharge = record?.discharge;
      const arrivalHasTime =
        record?.arrivalHasTime === true ||
        (record?.arrivalHasTime == null &&
          arrival instanceof Date &&
          (arrival.getHours() || arrival.getMinutes() || arrival.getSeconds()));
      const dischargeHasTime =
        record?.dischargeHasTime === true ||
        (record?.dischargeHasTime == null &&
          discharge instanceof Date &&
          (discharge.getHours() || discharge.getMinutes() || discharge.getSeconds()));
      let reference = null;
      if (metric === 'arrivals') {
        reference =
          arrivalHasTime && arrival instanceof Date && !Number.isNaN(arrival.getTime()) ? arrival : null;
      } else if (metric === 'discharges') {
        reference =
          dischargeHasTime && discharge instanceof Date && !Number.isNaN(discharge.getTime())
            ? discharge
            : null;
      } else if (metric === 'hospitalized') {
        if (record?.hospitalized) {
          reference =
            dischargeHasTime && discharge instanceof Date && !Number.isNaN(discharge.getTime())
              ? discharge
              : null;
        }
      } else if (metric === 'balance' || metric === 'census') {
        reference =
          arrivalHasTime && arrival instanceof Date && !Number.isNaN(arrival.getTime()) ? arrival : null;
      }
      if (!reference) {
        return;
      }
      const dateKey = computeShiftDateKeyForArrival(reference, shiftStartHour);
      if (dateKey !== targetDateKey) {
        return;
      }
      const hour = reference.getHours();
      if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
        return;
      }
      series.total[hour] += 1;
      const rawType = typeof record.cardType === 'string' ? record.cardType.trim().toLowerCase() : '';
      if (rawType === 't') {
        series.t[hour] += 1;
      } else if (rawType === 'tr') {
        series.tr[hour] += 1;
      } else if (rawType === 'ch') {
        series.ch[hour] += 1;
      }
    });
    if (metric === 'balance' || metric === 'census') {
      (Array.isArray(records) ? records : []).forEach((record) => {
        const discharge = record?.discharge;
        const dischargeHasTime =
          record?.dischargeHasTime === true ||
          (record?.dischargeHasTime == null &&
            discharge instanceof Date &&
            (discharge.getHours() || discharge.getMinutes() || discharge.getSeconds()));
        if (!dischargeHasTime || !(discharge instanceof Date) || Number.isNaN(discharge.getTime())) {
          return;
        }
        const dateKey = computeShiftDateKeyForArrival(discharge, shiftStartHour);
        if (dateKey !== targetDateKey) {
          return;
        }
        const hour = discharge.getHours();
        if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
          return;
        }
        series.outflow[hour] += 1;
      });
      if (metric === 'balance') {
        series.net = series.total.map((value, index) => value - (series.outflow[index] || 0));
      } else {
        const orderedHours = Array.from(
          { length: 24 },
          (_, offset) => (((shiftStartHour + offset) % 24) + 24) % 24
        );
        let running = 0;
        orderedHours.forEach((hour) => {
          running = Math.max(0, running + (series.total[hour] || 0) - (series.outflow[hour] || 0));
          series.census[hour] = running;
        });
      }
    }
    const hasData = series.total.some((value) => value > 0);
    return {
      dateKey: targetDateKey,
      dateLabel: lastShiftSummary.dateLabel || targetDateKey,
      shiftStartHour,
      metric,
      metricLabel: getLastShiftMetricLabel(metric),
      series,
      hasData:
        metric === 'balance'
          ? series.total.some((value) => value > 0) || series.outflow.some((value) => value > 0)
          : metric === 'census'
            ? series.total.some((value) => value > 0) || series.outflow.some((value) => value > 0)
            : hasData,
    };
  }

  function renderLastShiftHourlyChart(records, dailyStats) {
    const metricKey = dashboardState.kpi?.lastShiftHourlyMetric || 'arrivals';
    const seriesInfo = buildLastShiftHourlySeries(records, dailyStats, metricKey);
    dashboardState.kpi.lastShiftHourly = seriesInfo;
    renderLastShiftHourlyChartWithTheme(seriesInfo).catch((error) => {
      const errorInfo = describeError(error, {
        code: 'LAST_SHIFT_HOURLY',
        message: 'Nepavyko atnaujinti paskutinės pamainos grafiko',
      });
      console.error(errorInfo.log, error);
      if (setChartCardMessage) {
        setChartCardMessage(selectors.lastShiftHourlyChart, TEXT.charts?.errorLoading);
      }
    });
  }

  function renderLastShiftHourlySeriesInfo(seriesInfo) {
    dashboardState.kpi.lastShiftHourly = seriesInfo;
    renderLastShiftHourlyChartWithTheme(seriesInfo).catch((error) => {
      const errorInfo = describeError(error, {
        code: 'LAST_SHIFT_HOURLY',
        message: 'Nepavyko atnaujinti paskutinės pamainos grafiko',
      });
      console.error(errorInfo.log, error);
      if (setChartCardMessage) {
        setChartCardMessage(selectors.lastShiftHourlyChart, TEXT.charts?.errorLoading);
      }
    });
  }

  function fingerprintKpiRecords(records) {
    const list = Array.isArray(records) ? records : [];
    if (!list.length) {
      return '0';
    }
    const first = list[0];
    const middle = list[Math.floor(list.length / 2)];
    const last = list[list.length - 1];
    const encodeRecord = (record) => {
      const arrivalMs =
        record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime())
          ? record.arrival.getTime()
          : '';
      const dischargeMs =
        record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime())
          ? record.discharge.getTime()
          : '';
      return [
        arrivalMs,
        dischargeMs,
        record?.hospitalized === true ? 1 : 0,
        record?.night === true ? 1 : 0,
        String(record?.cardType || ''),
      ].join(':');
    };
    return [list.length, encodeRecord(first), encodeRecord(middle), encodeRecord(last)].join('|');
  }

  function fingerprintKpiDailyStats(dailyStats) {
    const list = Array.isArray(dailyStats) ? dailyStats : [];
    if (!list.length) {
      return '0';
    }
    const first = list[0];
    const middle = list[Math.floor(list.length / 2)];
    const last = list[list.length - 1];
    const encodeDaily = (entry) =>
      [
        String(entry?.date || entry?.dateKey || ''),
        Number.isFinite(Number(entry?.count)) ? Number(entry.count) : '',
      ].join(':');
    return [list.length, encodeDaily(first), encodeDaily(middle), encodeDaily(last)].join('|');
  }

  function fingerprintHourlySeriesInfo(seriesInfo) {
    if (!seriesInfo || typeof seriesInfo !== 'object') {
      return '0';
    }
    const metric = String(seriesInfo.metric || '');
    const dateKey = String(seriesInfo.dateKey || '');
    const total = Array.isArray(seriesInfo.series?.total) ? seriesInfo.series.total : [];
    const outflow = Array.isArray(seriesInfo.series?.outflow) ? seriesInfo.series.outflow : [];
    const sample = (list) =>
      [
        list.length,
        Number(list[0] || 0),
        Number(list[7] || 0),
        Number(list[15] || 0),
        Number(list[23] || 0),
      ].join(':');
    return [metric, dateKey, sample(total), sample(outflow)].join('|');
  }

  function buildKpiUiRenderSignature({
    filteredRecords,
    filteredDailyStats,
    dateFilteredRecords,
    dateFilteredDailyStats,
    selectedDate,
    effectiveWindow,
    settings,
    filteredRecordsKeyOverride = null,
    dateFilteredRecordsKeyOverride = null,
  }) {
    const filters = dashboardState.kpi?.filters || {};
    const windowDays = selectedDate ? null : effectiveWindow;
    const shiftStartHour = Number(
      settings?.calculations?.shiftStartHour ?? settings?.calculations?.nightEndHour ?? ''
    );
    return {
      filteredRecordsKey:
        typeof filteredRecordsKeyOverride === 'string'
          ? filteredRecordsKeyOverride
          : fingerprintKpiRecords(filteredRecords),
      filteredDailyKey: fingerprintKpiDailyStats(filteredDailyStats),
      dateFilteredRecordsKey:
        typeof dateFilteredRecordsKeyOverride === 'string'
          ? dateFilteredRecordsKeyOverride
          : fingerprintKpiRecords(dateFilteredRecords),
      dateFilteredDailyKey: fingerprintKpiDailyStats(dateFilteredDailyStats),
      selectedDate: selectedDate || '',
      windowDays: Number.isFinite(windowDays) ? Number(windowDays) : null,
      lastShiftMetric: String(dashboardState.kpi?.lastShiftHourlyMetric || 'arrivals'),
      shiftStartHour: Number.isFinite(shiftStartHour) ? shiftStartHour : null,
      filtersKey: [
        String(filters.shift || ''),
        String(filters.arrival || ''),
        String(filters.disposition || ''),
        String(filters.cardType || ''),
        Number.isFinite(Number(filters.window)) ? Number(filters.window) : '',
      ].join('|'),
    };
  }

  function isSameKpiUiRenderSignature(a, b) {
    if (!a || !b) {
      return false;
    }
    return (
      a.filteredRecordsKey === b.filteredRecordsKey &&
      a.filteredDailyKey === b.filteredDailyKey &&
      a.dateFilteredRecordsKey === b.dateFilteredRecordsKey &&
      a.dateFilteredDailyKey === b.dateFilteredDailyKey &&
      a.selectedDate === b.selectedDate &&
      a.windowDays === b.windowDays &&
      a.lastShiftMetric === b.lastShiftMetric &&
      a.shiftStartHour === b.shiftStartHour &&
      a.filtersKey === b.filtersKey
    );
  }

  function commitKpiFilterResult({ filteredRecords, filteredDailyStats, effectiveWindow, settings }) {
    clearWorkerAvailableDateKeys();
    clearSummaryModeSelectedDateRecordsCache();
    dashboardState.kpi.records = filteredRecords;
    dashboardState.kpi.daily = filteredDailyStats;
    ensureDefaultKpiDateSelection(filteredRecords);
    syncKpiDateNavigation(filteredRecords);
    const selectedDate = normalizeKpiDateValue(dashboardState.kpi?.selectedDate);
    const dateFiltered = resolveDateFilteredData(filteredRecords, filteredDailyStats, selectedDate, settings);
    const dateFilteredRecords = dateFiltered.records;
    const dateFilteredDailyStats = dateFiltered.dailyStats;
    const nextUiSignature = buildKpiUiRenderSignature({
      filteredRecords,
      filteredDailyStats,
      dateFilteredRecords,
      dateFilteredDailyStats,
      selectedDate,
      effectiveWindow,
      settings,
    });
    if (isSameKpiUiRenderSignature(lastKpiUiRenderSignature, nextUiSignature)) {
      ensureKpiSkeletonHidden();
      return;
    }
    renderKpis(dateFilteredDailyStats, filteredDailyStats);
    const lastShiftRecords = selectedDate ? dateFilteredRecords : filteredRecords;
    const lastShiftDaily = selectedDate ? dateFilteredDailyStats : filteredDailyStats;
    renderLastShiftHourlyChart(lastShiftRecords, lastShiftDaily);
    updateKpiSummary({
      records: dateFilteredRecords,
      dailyStats: dateFilteredDailyStats,
      windowDays: selectedDate ? null : effectiveWindow,
    });
    updateKpiSubtitle();
    lastKpiUiRenderSignature = nextUiSignature;
  }

  function commitKpiSummaryModeResult({ result, effectiveWindow, settings }) {
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
    let selectedDate = normalizeKpiDateValue(dashboardState.kpi?.selectedDate);
    const lastShiftHourly = summary.lastShiftHourly || null;

    setWorkerAvailableDateKeys(availableDateKeys);
    dashboardState.kpi.records = [];
    dashboardState.kpi.daily = filteredDailyStats;
    ensureDefaultKpiDateSelection([]);
    syncKpiDateNavigation([]);
    selectedDate = normalizeKpiDateValue(dashboardState.kpi?.selectedDate);
    if (selectedDate) {
      void ensureSummaryModeSelectedDateRecordsCache(dashboardState.kpi.filters, selectedDate, settings);
    } else {
      clearSummaryModeSelectedDateRecordsCache();
    }

    const nextUiSignature = buildKpiUiRenderSignature({
      filteredRecords: [],
      filteredDailyStats,
      dateFilteredRecords: [],
      dateFilteredDailyStats: selectedDate ? selectedDateDailyStats : filteredDailyStats,
      selectedDate,
      effectiveWindow,
      settings,
      filteredRecordsKeyOverride: `summary:${totalFilteredRecords}`,
      dateFilteredRecordsKeyOverride: `summary-hourly:${selectedDate ? selectedDateRecordCount : totalFilteredRecords}:${fingerprintHourlySeriesInfo(lastShiftHourly)}`,
    });
    if (isSameKpiUiRenderSignature(lastKpiUiRenderSignature, nextUiSignature)) {
      ensureKpiSkeletonHidden();
      return;
    }

    renderKpis(selectedDate ? selectedDateDailyStats : filteredDailyStats, filteredDailyStats);
    renderLastShiftHourlySeriesInfo(lastShiftHourly);
    updateKpiSummary({
      records: [],
      dailyStats: selectedDate ? selectedDateDailyStats : filteredDailyStats,
      windowDays: selectedDate ? null : effectiveWindow,
      recordCountOverride: selectedDate ? selectedDateRecordCount : totalFilteredRecords,
    });
    updateKpiSubtitle();
    lastKpiUiRenderSignature = nextUiSignature;
  }

  async function applyKpiFiltersAndRender() {
    notifyKpiStateChange();
    const normalizedFilters = sanitizeKpiFilters(dashboardState.kpi.filters, {
      getDefaultKpiFilters,
      KPI_FILTER_LABELS,
    });
    dashboardState.kpi.filters = { ...normalizedFilters };
    const defaultFilters = getDefaultKpiFilters();
    const windowDays = normalizedFilters.window;
    const settings = getSettings();
    const workerPayload = {
      filters: normalizedFilters,
      defaultFilters,
      windowDays,
      selectedDate: normalizeKpiDateValue(dashboardState.kpi?.selectedDate),
      records: Array.isArray(dashboardState.primaryRecords) ? dashboardState.primaryRecords : [],
      dailyStats: Array.isArray(dashboardState.primaryDaily) ? dashboardState.primaryDaily : [],
      calculations: settings?.calculations || {},
      calculationDefaults: DEFAULT_SETTINGS.calculations,
      lastShiftHourlyMetric: normalizeLastShiftMetric(dashboardState.kpi?.lastShiftHourlyMetric),
      resultMode: 'summary+hourly',
    };
    const jobToken = ++kpiWorkerJobToken;

    if (shouldShowKpiLoadingSkeleton()) {
      showKpiSkeleton();
    }
    try {
      const result = await runKpiWorkerJob(workerPayload);
      if (jobToken !== kpiWorkerJobToken) {
        ensureKpiSkeletonHidden();
        return;
      }
      const effectiveWindow = Number.isFinite(result?.windowDays) ? result.windowDays : windowDays;
      if (String(result?.resultMode || result?.meta?.resultMode || '') === 'summary+hourly') {
        commitKpiSummaryModeResult({
          result,
          effectiveWindow,
          settings,
        });
        return;
      }
      const filteredRecords = Array.isArray(result?.records) ? result.records : [];
      const filteredDailyStats = Array.isArray(result?.dailyStats) ? result.dailyStats : [];
      commitKpiFilterResult({
        filteredRecords,
        filteredDailyStats,
        effectiveWindow,
        settings,
      });
    } catch (error) {
      const errorInfo = describeError(error, {
        code: 'KPI_WORKER',
        message: "Nepavyko pritaikyti KPI filtrų worker'yje",
      });
      console.error(errorInfo.log, error);
      if (jobToken !== kpiWorkerJobToken) {
        ensureKpiSkeletonHidden();
        return;
      }
      const fallback = applyKpiFiltersLocally(normalizedFilters);
      commitKpiFilterResult({
        filteredRecords: fallback.records,
        filteredDailyStats: fallback.dailyStats,
        effectiveWindow: fallback.windowDays,
        settings,
      });
    }
  }

  function handleKpiFilterInput(event) {
    const target = event.target;
    if (!target || !('name' in target)) {
      return;
    }
    const { name, value } = target;
    const filters = dashboardState.kpi.filters;
    if (name === 'window') {
      const numeric = Number.parseInt(value, 10);
      if (Number.isFinite(numeric) && numeric >= 0) {
        filters.window = numeric;
      }
    } else if (name === 'shift' && value in KPI_FILTER_LABELS.shift) {
      filters.shift = value;
    } else if (name === 'arrival' && value in KPI_FILTER_LABELS.arrival) {
      filters.arrival = value;
    } else if (name === 'disposition' && value in KPI_FILTER_LABELS.disposition) {
      filters.disposition = value;
    } else if (name === 'cardType' && value in KPI_FILTER_LABELS.cardType) {
      filters.cardType = value;
    }
    syncKpiSegmentedButtons();
    void applyKpiFiltersAndRender();
  }

  function handleKpiDateInput(event) {
    const target = event.target;
    if (!target || !('value' in target)) {
      return;
    }
    const normalized = normalizeKpiDateValue(target.value);
    dashboardState.kpi.selectedDate = normalized;
    notifyKpiStateChange();
    syncKpiDateNavigation();
    updateKpiSubtitle();
    void applyKpiFiltersAndRender();
  }

  function handleKpiDateClear() {
    dashboardState.kpi.selectedDate = null;
    notifyKpiStateChange();
    if (selectors.kpiDateInput) {
      selectors.kpiDateInput.value = '';
    }
    syncKpiDateNavigation();
    updateKpiSubtitle();
    void applyKpiFiltersAndRender();
  }

  function handleKpiDateStep(step) {
    const direction = Number(step) < 0 ? -1 : 1;
    const availableMeta = collectAvailableShiftDateKeys(dashboardState.kpi?.records);
    const available = availableMeta.keys;
    if (!available.length) {
      syncKpiDateNavigation(dashboardState.kpi?.records);
      return;
    }
    const selectedDate = normalizeKpiDateValue(dashboardState.kpi?.selectedDate);
    const selectedIndex =
      selectedDate && availableMeta.indexMap.has(selectedDate)
        ? availableMeta.indexMap.get(selectedDate)
        : -1;
    let nextIndex;
    if (selectedIndex < 0) {
      nextIndex = direction < 0 ? available.length - 1 : 0;
    } else {
      nextIndex = Math.min(Math.max(selectedIndex + direction, 0), available.length - 1);
    }
    if (nextIndex === selectedIndex) {
      syncKpiDateNavigation(dashboardState.kpi?.records);
      return;
    }
    const nextDate = available[nextIndex];
    dashboardState.kpi.selectedDate = nextDate;
    notifyKpiStateChange();
    if (selectors.kpiDateInput) {
      selectors.kpiDateInput.value = nextDate;
    }
    syncKpiDateNavigation(dashboardState.kpi?.records);
    updateKpiSubtitle();
    void applyKpiFiltersAndRender();
  }

  function handleKpiSegmentedClick(event) {
    const button = event.currentTarget;
    if (!(button instanceof HTMLElement)) {
      return;
    }
    const arrival = getDatasetValue(button, 'kpiArrival');
    if (arrival && selectors.kpiArrival) {
      selectors.kpiArrival.value = arrival;
      selectors.kpiArrival.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const cardType = getDatasetValue(button, 'kpiCardType');
    if (cardType && selectors.kpiCardType) {
      selectors.kpiCardType.value = cardType;
      selectors.kpiCardType.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  async function recomputeLastShiftHourlyViaWorkerDetail() {
    if (typeof runKpiWorkerDetailJob !== 'function') {
      return false;
    }
    const normalizedFilters = sanitizeKpiFilters(dashboardState.kpi.filters, {
      getDefaultKpiFilters,
      KPI_FILTER_LABELS,
    });
    dashboardState.kpi.filters = { ...normalizedFilters };
    const defaultFilters = getDefaultKpiFilters();
    const settings = getSettings();
    const selectedDate = normalizeKpiDateValue(dashboardState.kpi?.selectedDate);
    const metric = normalizeLastShiftMetric(dashboardState.kpi?.lastShiftHourlyMetric);
    const detailToken = ++kpiHourlyWorkerJobToken;
    const workerTokenAtStart = kpiWorkerJobToken;
    try {
      const result = await runKpiWorkerDetailJob({
        type: 'computeKpiLastShiftHourlyByHandle',
        filters: normalizedFilters,
        defaultFilters,
        windowDays: normalizedFilters.window,
        selectedDate,
        lastShiftHourlyMetric: metric,
        records: Array.isArray(dashboardState.primaryRecords) ? dashboardState.primaryRecords : [],
        dailyStats: Array.isArray(dashboardState.primaryDaily) ? dashboardState.primaryDaily : [],
        calculations: settings?.calculations || {},
        calculationDefaults: DEFAULT_SETTINGS.calculations,
      });
      if (detailToken !== kpiHourlyWorkerJobToken || workerTokenAtStart !== kpiWorkerJobToken) {
        return true;
      }
      renderLastShiftHourlySeriesInfo(result?.lastShiftHourly || null);
      return true;
    } catch (error) {
      const errorInfo = describeError(error, {
        code: 'KPI_WORKER_HOURLY',
        message: "Nepavyko atnaujinti KPI paskutinės pamainos grafiko worker'yje",
      });
      console.error(errorInfo.log, error);
      return false;
    }
  }

  function handleLastShiftMetricClick(event) {
    const button = event.currentTarget;
    if (!(button instanceof HTMLElement)) {
      return;
    }
    const metric = normalizeLastShiftMetric(getDatasetValue(button, 'lastShiftMetric'));
    dashboardState.kpi.lastShiftHourlyMetric = metric;
    syncLastShiftHourlyMetricButtons();
    const selectedDate = normalizeKpiDateValue(dashboardState.kpi?.selectedDate);
    const baseRecords = Array.isArray(dashboardState.kpi?.records) ? dashboardState.kpi.records : [];
    const baseDaily = Array.isArray(dashboardState.kpi?.daily) ? dashboardState.kpi.daily : [];
    const hasWorkerSummaryDates =
      Array.isArray(dashboardState.kpi?.workerSummaryModeAvailableDateKeys) &&
      dashboardState.kpi.workerSummaryModeAvailableDateKeys.length > 0;
    if (!baseRecords.length && hasWorkerSummaryDates) {
      const settings = getSettings();
      const cachedSelectedDate = selectedDate
        ? getSummaryModeSelectedDateRecordsCache(dashboardState.kpi?.filters, selectedDate, settings)
        : null;
      if (selectedDate && cachedSelectedDate) {
        renderLastShiftHourlyChart(cachedSelectedDate.records, cachedSelectedDate.dailyStats);
        return;
      }
      void (async () => {
        const handled = await recomputeLastShiftHourlyViaWorkerDetail();
        if (!handled) {
          void applyKpiFiltersAndRender();
        }
      })();
      return;
    }
    if (selectedDate) {
      const settings = getSettings();
      const dateFiltered = resolveDateFilteredData(baseRecords, baseDaily, selectedDate, settings);
      renderLastShiftHourlyChart(dateFiltered.records, dateFiltered.dailyStats);
      return;
    }
    renderLastShiftHourlyChart(baseRecords, baseDaily);
  }

  function syncLastShiftHourlyMetricButtons() {
    if (!Array.isArray(selectors.lastShiftHourlyMetricButtons)) {
      return;
    }
    const metric = normalizeLastShiftMetric(dashboardState.kpi.lastShiftHourlyMetric);
    selectors.lastShiftHourlyMetricButtons.forEach((btn) => {
      const btnMetric = normalizeLastShiftMetric(getDatasetValue(btn, 'lastShiftMetric'));
      btn.setAttribute('aria-pressed', btnMetric === metric ? 'true' : 'false');
    });
  }

  function resetKpiFilters({ fromKeyboard } = {}) {
    dashboardState.kpi.filters = getDefaultKpiFilters();
    notifyKpiStateChange();
    refreshKpiWindowOptions();
    syncKpiFilterControls();
    void applyKpiFiltersAndRender();
    if (fromKeyboard && selectors.kpiFiltersReset) {
      selectors.kpiFiltersReset.focus();
    }
  }

  return {
    refreshKpiWindowOptions,
    syncKpiFilterControls,
    handleKpiFilterInput,
    handleKpiDateInput,
    handleKpiDateClear,
    handleKpiDateStep,
    handleKpiSegmentedClick,
    handleLastShiftMetricClick,
    syncLastShiftHourlyMetricButtons,
    resetKpiFilters,
    applyKpiFiltersAndRender,
    updateKpiSummary,
    updateKpiSubtitle,
    syncKpiDateNavigation,
  };
}
