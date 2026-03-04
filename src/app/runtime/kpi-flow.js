import {
  getSelectedDateDailyCache as getSelectedDateDailyCacheHelper,
  resolveDateFilteredData as resolveDateFilteredDataHelper,
  setSelectedDateDailyCache as setSelectedDateDailyCacheHelper,
} from './kpi-flow/date-filter-cache.js';
import {
  collectAvailableShiftDateKeys as collectAvailableShiftDateKeysHelper,
  ensureDefaultKpiDateSelection as ensureDefaultKpiDateSelectionHelper,
  syncKpiDateNavigation as syncKpiDateNavigationHelper,
} from './kpi-flow/date-navigation.js';
import {
  applyKpiFiltersLocally as applyKpiFiltersLocallyHelper,
  buildKpiUiRenderSignature as buildKpiUiRenderSignatureHelper,
  buildLastShiftHourlySeries as buildLastShiftHourlySeriesHelper,
  filterKpiRecordsByDate as filterKpiRecordsByDateHelper,
  fingerprintHourlySeriesInfo as fingerprintHourlySeriesInfoHelper,
  getRecordShiftDateKey as getRecordShiftDateKeyHelper,
  isSameKpiUiRenderSignature as isSameKpiUiRenderSignatureHelper,
  normalizeKpiDateValue as normalizeKpiDateValueHelper,
  normalizeLastShiftMetric as normalizeLastShiftMetricHelper,
  resolveShiftStartHour as resolveShiftStartHourHelper,
} from './kpi-flow/helpers.js';
import {
  beginLastShiftHourlyLoading as beginLastShiftHourlyLoadingHelper,
  endLastShiftHourlyLoading as endLastShiftHourlyLoadingHelper,
} from './kpi-flow/last-shift-loading.js';
import {
  notifyKpiStateChange as notifyKpiStateChangeHelper,
  shouldShowKpiLoadingSkeleton as shouldShowKpiLoadingSkeletonHelper,
} from './kpi-flow/state-notify.js';
import {
  buildSummaryModeSelectedDateRecordsCacheKey as buildSummaryModeSelectedDateRecordsCacheKeyHelper,
  clearSummaryModeSelectedDateRecordsCache as clearSummaryModeSelectedDateRecordsCacheHelper,
  getSummaryModeSelectedDateRecordsCache as getSummaryModeSelectedDateRecordsCacheHelper,
} from './kpi-flow/summary-cache.js';
import { commitKpiSummaryModeResult as commitKpiSummaryModeResultUi } from './kpi-flow/summary-mode.js';
import {
  refreshKpiWindowOptions as refreshKpiWindowOptionsUi,
  syncKpiFilterControls as syncKpiFilterControlsUi,
  syncKpiSegmentedButtons as syncKpiSegmentedButtonsUi,
  updateKpiSubtitle as updateKpiSubtitleUi,
  updateKpiSummary as updateKpiSummaryUi,
} from './kpi-flow/ui-controls.js';
import {
  handleKpiDateClear as handleKpiDateClearUi,
  handleKpiDateInput as handleKpiDateInputUi,
  handleKpiDateStep as handleKpiDateStepUi,
  handleKpiFilterInput as handleKpiFilterInputUi,
  handleKpiSegmentedClick as handleKpiSegmentedClickUi,
  handleLastShiftMetricClick as handleLastShiftMetricClickUi,
  resetKpiFilters as resetKpiFiltersUi,
  syncLastShiftHourlyMetricButtons as syncLastShiftHourlyMetricButtonsUi,
} from './kpi-flow/ui-handlers.js';
import { recomputeLastShiftHourlyViaWorkerDetail as recomputeLastShiftHourlyViaWorkerDetailHelper } from './kpi-flow/worker-detail.js';
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
    showLastShiftHourlyLoading = null,
    hideLastShiftHourlyLoading = null,
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
  let lastShiftHourlyRenderToken = 0;
  let lastKpiUiRenderSignature = null;

  function ensureKpiSkeletonHidden() {
    if (typeof hideKpiSkeleton === 'function') hideKpiSkeleton();
  }
  function shouldShowKpiLoadingSkeleton() {
    return shouldShowKpiLoadingSkeletonHelper({ selectors, getDatasetValue });
  }
  function notifyKpiStateChange() {
    notifyKpiStateChangeHelper({ dashboardState, onKpiStateChange });
  }

  function beginLastShiftHourlyLoading(options = {}) {
    return beginLastShiftHourlyLoadingHelper(
      {
        selectors,
        dashboardState,
        showLastShiftHourlyLoading,
        setChartCardMessage,
        nextRenderToken: () => {
          lastShiftHourlyRenderToken += 1;
          return lastShiftHourlyRenderToken;
        },
      },
      options
    );
  }

  function endLastShiftHourlyLoading(renderState) {
    endLastShiftHourlyLoadingHelper(
      {
        getRenderToken: () => lastShiftHourlyRenderToken,
        hideLastShiftHourlyLoading,
      },
      renderState
    );
  }

  function setSelectedDateDailyCache(recordsRef, selectedDate, shiftStartHour, dailyStats) {
    setSelectedDateDailyCacheHelper({ dashboardState }, recordsRef, selectedDate, shiftStartHour, dailyStats);
  }

  function getSelectedDateDailyCache(recordsRef, selectedDate, shiftStartHour) {
    return getSelectedDateDailyCacheHelper({ dashboardState }, recordsRef, selectedDate, shiftStartHour);
  }

  function resolveDateFilteredData(baseRecords, baseDailyStats, selectedDate, settings) {
    return resolveDateFilteredDataHelper(
      {
        dashboardState,
        resolveShiftStartHour,
        filterKpiRecordsByDate,
        getSelectedDateDailyCache,
        setSelectedDateDailyCache,
        computeDailyStats,
        defaultSettings: DEFAULT_SETTINGS,
      },
      baseRecords,
      baseDailyStats,
      selectedDate,
      settings
    );
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

  function clearSummaryModeSelectedDateRecordsCache() {
    clearSummaryModeSelectedDateRecordsCacheHelper({ dashboardState });
  }

  function getSummaryModeSelectedDateRecordsCache(filters, selectedDate, settings) {
    return getSummaryModeSelectedDateRecordsCacheHelper(
      {
        dashboardState,
        normalizeKpiDateValue,
        resolveShiftStartHour,
      },
      filters,
      selectedDate,
      settings
    );
  }

  function buildSummaryModeSelectedDateRecordsCacheKey(filters, selectedDate, settings) {
    return buildSummaryModeSelectedDateRecordsCacheKeyHelper(
      {
        normalizeKpiDateValue,
        resolveShiftStartHour,
      },
      filters,
      selectedDate,
      settings
    );
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

  const resolveShiftStartHour = (calculationSettings) =>
    resolveShiftStartHourHelper(calculationSettings, DEFAULT_SETTINGS);
  const normalizeKpiDateValue = (value) => normalizeKpiDateValueHelper(value);
  const getRecordShiftDateKey = (record, shiftStartHour) =>
    getRecordShiftDateKeyHelper(record, shiftStartHour, formatLocalDateKey);

  function collectAvailableShiftDateKeys(records) {
    return collectAvailableShiftDateKeysHelper(
      {
        dashboardState,
        getSettings,
        resolveShiftStartHour,
        normalizeKpiDateValue,
        getRecordShiftDateKey,
      },
      records
    );
  }

  function syncKpiDateNavigation(records = dashboardState.kpi?.records) {
    syncKpiDateNavigationHelper(
      {
        selectors,
        dashboardState,
        normalizeKpiDateValue,
        collectAvailableShiftDateKeys,
      },
      records
    );
  }

  function ensureDefaultKpiDateSelection(records) {
    ensureDefaultKpiDateSelectionHelper(
      {
        selectors,
        dashboardState,
        normalizeKpiDateValue,
        formatLocalDateKey,
        syncKpiDateNavigation,
      },
      records
    );
  }

  const filterKpiRecordsByDate = (records, dateKey, shiftStartHour) =>
    filterKpiRecordsByDateHelper(records, dateKey, shiftStartHour, formatLocalDateKey);

  function updateKpiSubtitle() {
    updateKpiSubtitleUi({ selectors, TEXT });
  }

  function updateKpiSummary({ records, dailyStats, windowDays, recordCountOverride = null }) {
    updateKpiSummaryUi(
      {
        selectors,
        dashboardState,
        KPI_FILTER_LABELS,
        getDefaultKpiFilters,
        normalizeKpiDateValue,
        toSentenceCase,
        setDatasetValue,
      },
      { records, dailyStats, windowDays, recordCountOverride }
    );
  }

  function refreshKpiWindowOptions() {
    refreshKpiWindowOptionsUi({
      selectors,
      dashboardState,
      TEXT,
      DEFAULT_SETTINGS,
      DEFAULT_KPI_WINDOW_DAYS,
      KPI_WINDOW_OPTION_BASE,
      getSettings,
    });
  }

  function syncKpiSegmentedButtons() {
    syncKpiSegmentedButtonsUi({
      selectors,
      dashboardState,
      getDefaultKpiFilters,
      getDatasetValue,
    });
  }

  function syncKpiFilterControls() {
    syncKpiFilterControlsUi({
      selectors,
      dashboardState,
      getDatasetValue,
      normalizeKpiDateValue,
      syncKpiSegmentedButtons,
      updateKpiSubtitle,
    });
  }

  const applyKpiFiltersLocally = (filters) =>
    applyKpiFiltersLocallyHelper(filters, {
      sanitizeKpiFilters,
      getDefaultKpiFilters,
      kpiFilterLabels: KPI_FILTER_LABELS,
      getSettings,
      defaultSettings: DEFAULT_SETTINGS,
      primaryRecords: dashboardState.primaryRecords,
      primaryDailyStats: dashboardState.primaryDaily,
      filterDailyStatsByWindow,
      computeDailyStats,
      matchesSharedPatientFilters,
      dateKeyToDate,
      formatLocalDateKey,
    });

  const normalizeLastShiftMetric = (value) => normalizeLastShiftMetricHelper(value);
  const buildLastShiftHourlySeries = (records, dailyStats, metricKey = 'arrivals') =>
    buildLastShiftHourlySeriesHelper(
      { records, dailyStats, metricKey },
      { buildLastShiftSummary, getSettings, defaultSettings: DEFAULT_SETTINGS, formatLocalDateKey }
    );

  function isDeferredRecordsHydrationActive() {
    return String(dashboardState.mainData?.recordsHydrationState || '') === 'deferred';
  }

  function shouldKeepBlockingHourlyLoading(seriesInfo) {
    return isDeferredRecordsHydrationActive() && !seriesInfo?.hasData;
  }

  function shouldMarkHourlyChartAsRendered(seriesInfo) {
    if (seriesInfo?.hasData) {
      return true;
    }
    return !isDeferredRecordsHydrationActive();
  }

  async function renderLastShiftHourlyChart(records, dailyStats, options = {}) {
    const renderState = beginLastShiftHourlyLoading(options);
    const metricKey = dashboardState.kpi?.lastShiftHourlyMetric || 'arrivals';
    const seriesInfo = buildLastShiftHourlySeries(records, dailyStats, metricKey);
    const keepBlockingLoading = shouldKeepBlockingHourlyLoading(seriesInfo);
    let renderFailed = false;
    dashboardState.kpi.lastShiftHourly = seriesInfo;
    try {
      await renderLastShiftHourlyChartWithTheme(seriesInfo);
      if (shouldMarkHourlyChartAsRendered(seriesInfo)) {
        dashboardState.kpi.lastShiftHourlyHasRenderedOnce = true;
      }
    } catch (error) {
      renderFailed = true;
      const errorInfo = describeError(error, {
        code: 'LAST_SHIFT_HOURLY',
        message: 'Nepavyko atnaujinti paskutinės pamainos grafiko',
      });
      console.error(errorInfo.log, error);
      if (setChartCardMessage) {
        setChartCardMessage(selectors.lastShiftHourlyChart, TEXT.charts?.errorLoading);
      }
    } finally {
      if (!keepBlockingLoading || renderFailed) {
        endLastShiftHourlyLoading(renderState);
      }
    }
  }

  async function renderLastShiftHourlySeriesInfo(seriesInfo, options = {}) {
    dashboardState.kpi.lastShiftHourly = seriesInfo;
    const renderState = beginLastShiftHourlyLoading(options);
    const keepBlockingLoading = shouldKeepBlockingHourlyLoading(seriesInfo);
    let renderFailed = false;
    try {
      await renderLastShiftHourlyChartWithTheme(seriesInfo);
      if (shouldMarkHourlyChartAsRendered(seriesInfo)) {
        dashboardState.kpi.lastShiftHourlyHasRenderedOnce = true;
      }
    } catch (error) {
      renderFailed = true;
      const errorInfo = describeError(error, {
        code: 'LAST_SHIFT_HOURLY',
        message: 'Nepavyko atnaujinti paskutinės pamainos grafiko',
      });
      console.error(errorInfo.log, error);
      if (setChartCardMessage) {
        setChartCardMessage(selectors.lastShiftHourlyChart, TEXT.charts?.errorLoading);
      }
    } finally {
      if (!keepBlockingLoading || renderFailed) {
        endLastShiftHourlyLoading(renderState);
      }
    }
  }

  const fingerprintHourlySeriesInfo = (seriesInfo) => fingerprintHourlySeriesInfoHelper(seriesInfo);
  const buildKpiUiRenderSignature = (args) =>
    buildKpiUiRenderSignatureHelper({
      ...args,
      filters: dashboardState.kpi?.filters || {},
      lastShiftMetric: dashboardState.kpi?.lastShiftHourlyMetric || 'arrivals',
    });
  const isSameKpiUiRenderSignature = (a, b) => isSameKpiUiRenderSignatureHelper(a, b);

  async function commitKpiFilterResult({ filteredRecords, filteredDailyStats, effectiveWindow, settings }) {
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
    const lastShiftRecords = selectedDate ? dateFilteredRecords : filteredRecords;
    const lastShiftDaily = selectedDate ? dateFilteredDailyStats : filteredDailyStats;
    await renderLastShiftHourlyChart(lastShiftRecords, lastShiftDaily);
    renderKpis(dateFilteredDailyStats, filteredDailyStats);
    updateKpiSummary({
      records: dateFilteredRecords,
      dailyStats: dateFilteredDailyStats,
      windowDays: selectedDate ? null : effectiveWindow,
    });
    updateKpiSubtitle();
    lastKpiUiRenderSignature = nextUiSignature;
  }

  async function commitKpiSummaryModeResult({ result, effectiveWindow, settings }) {
    await commitKpiSummaryModeResultUi(
      {
        dashboardState,
        normalizeKpiDateValue,
        setWorkerAvailableDateKeys,
        ensureDefaultKpiDateSelection,
        syncKpiDateNavigation,
        ensureSummaryModeSelectedDateRecordsCache,
        clearSummaryModeSelectedDateRecordsCache,
        buildKpiUiRenderSignature,
        fingerprintHourlySeriesInfo,
        isSameKpiUiRenderSignature,
        getLastKpiUiRenderSignature: () => lastKpiUiRenderSignature,
        setLastKpiUiRenderSignature: (value) => {
          lastKpiUiRenderSignature = value;
        },
        ensureKpiSkeletonHidden,
        renderLastShiftHourlySeriesInfo,
        renderKpis,
        updateKpiSummary,
        updateKpiSubtitle,
      },
      { result, effectiveWindow, settings }
    );
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
        await commitKpiSummaryModeResult({
          result,
          effectiveWindow,
          settings,
        });
        return;
      }
      const filteredRecords = Array.isArray(result?.records) ? result.records : [];
      const filteredDailyStats = Array.isArray(result?.dailyStats) ? result.dailyStats : [];
      await commitKpiFilterResult({
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
      await commitKpiFilterResult({
        filteredRecords: fallback.records,
        filteredDailyStats: fallback.dailyStats,
        effectiveWindow: fallback.windowDays,
        settings,
      });
    }
  }

  function createUiHandlerDeps() {
    return {
      selectors,
      dashboardState,
      KPI_FILTER_LABELS,
      getDatasetValue,
      getSettings,
      getDefaultKpiFilters,
      normalizeKpiDateValue,
      normalizeLastShiftMetric,
      collectAvailableShiftDateKeys,
      getSummaryModeSelectedDateRecordsCache,
      resolveDateFilteredData,
      recomputeLastShiftHourlyViaWorkerDetail,
      renderLastShiftHourlyChart,
      notifyKpiStateChange,
      updateKpiSubtitle,
      refreshKpiWindowOptions,
      syncKpiSegmentedButtons,
      syncKpiFilterControls,
      syncKpiDateNavigation,
      syncLastShiftHourlyMetricButtons,
      applyKpiFiltersAndRender,
    };
  }

  function handleKpiFilterInput(event) {
    handleKpiFilterInputUi(createUiHandlerDeps(), event);
  }

  function handleKpiDateInput(event) {
    handleKpiDateInputUi(createUiHandlerDeps(), event);
  }

  function handleKpiDateClear() {
    handleKpiDateClearUi(createUiHandlerDeps());
  }

  function handleKpiDateStep(step) {
    handleKpiDateStepUi(createUiHandlerDeps(), step);
  }

  function handleKpiSegmentedClick(event) {
    handleKpiSegmentedClickUi(createUiHandlerDeps(), event);
  }

  async function recomputeLastShiftHourlyViaWorkerDetail() {
    return recomputeLastShiftHourlyViaWorkerDetailHelper({
      runKpiWorkerDetailJob,
      sanitizeKpiFilters,
      dashboardState,
      getDefaultKpiFilters,
      KPI_FILTER_LABELS,
      getSettings,
      normalizeKpiDateValue,
      normalizeLastShiftMetric,
      defaultCalculations: DEFAULT_SETTINGS.calculations,
      nextDetailToken: () => {
        kpiHourlyWorkerJobToken += 1;
        return kpiHourlyWorkerJobToken;
      },
      getDetailToken: () => kpiHourlyWorkerJobToken,
      getWorkerToken: () => kpiWorkerJobToken,
      renderLastShiftHourlySeriesInfo,
      describeError,
    });
  }

  function handleLastShiftMetricClick(event) {
    handleLastShiftMetricClickUi(createUiHandlerDeps(), event);
  }

  function syncLastShiftHourlyMetricButtons() {
    syncLastShiftHourlyMetricButtonsUi(createUiHandlerDeps());
  }

  function resetKpiFilters({ fromKeyboard } = {}) {
    resetKpiFiltersUi(createUiHandlerDeps(), { fromKeyboard });
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
