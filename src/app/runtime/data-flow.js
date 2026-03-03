import { normalizeCreateDataFlowArgs } from './data-flow/bootstrap.js';
import {
  computeEdRenderKey as computeEdRenderKeyHelper,
  computeMainDataSignature as computeMainDataSignatureHelper,
  dispatchChartsLifecycleEvent as dispatchChartsLifecycleEventHelper,
  ensureChartsStartupState as ensureChartsStartupStateHelper,
  finishPerfStage as finishPerfStageHelper,
  isAbortError as isAbortErrorHelper,
  logRefreshDecision as logRefreshDecisionHelper,
  markBrowserMetric as markBrowserMetricHelper,
  readDailyStatsFromSessionCache as readDailyStatsFromSessionCacheHelper,
  startPerfStage as startPerfStageHelper,
  writeDailyStatsToSessionCache as writeDailyStatsToSessionCacheHelper,
} from './data-flow/helpers.js';
import { performDashboardLoadAttempt as performDashboardLoadAttemptHelper } from './data-flow/load-cycle.js';
import {
  applyHydratedMainDataset as applyHydratedMainDatasetHelper,
  hydrateDeferredFullRecords as hydrateDeferredFullRecordsHelper,
  hydrateWithHistoricalData as hydrateWithHistoricalDataHelper,
  renderChartsPrimaryStage as renderChartsPrimaryStageHelper,
  scheduleChartsSecondaryAndHospitalRender as scheduleChartsSecondaryAndHospitalRenderHelper,
  scheduleDeferredFullRecordsHydration as scheduleDeferredFullRecordsHydrationHelper,
  scheduleDeferredHydration as scheduleDeferredHydrationHelper,
  scheduleInitialLoad as scheduleInitialLoadHelper,
} from './data-flow/orchestration.js';

export function createDataFlow(env = {}) {
  const {
    pageConfig,
    selectors,
    dashboardState,
    TEXT,
    DEFAULT_SETTINGS,
    AUTO_REFRESH_INTERVAL_MS,
    runAfterDomAndIdle,
    setDatasetValue,
    setStatus,
    showKpiSkeleton,
    showChartSkeletons,
    showEdSkeleton,
    createChunkReporter,
    fetchData,
    fetchFeedbackData,
    fetchEdData,
    perfMonitor,
    describeCacheMeta,
    createEmptyEdSummary,
    describeError,
    computeDailyStats,
    filterDailyStatsByWindow,
    mergeDailyStatsSeries,
    populateChartYearOptions,
    populateChartsHospitalTableYearOptions,
    populateHourlyCompareYearOptions,
    populateHeatmapYearOptions,
    syncHeatmapFilterControls,
    syncKpiFilterControls,
    getDefaultChartFilters,
    sanitizeChartFilters,
    KPI_FILTER_LABELS,
    syncChartFilterControls,
    prepareChartDataForPeriod,
    renderChartsPrimary,
    renderChartsSecondary,
    applyKpiFiltersAndRender,
    renderCharts,
    renderChartsHospitalTable,
    getHeatmapData,
    onPrimaryVisible,
    onSecondaryComplete,
    scheduleChartsSecondaryRender,
    renderRecentTable,
    computeMonthlyStats,
    renderMonthlyTable,
    computeYearlyStats,
    renderYearlyTable,
    supportsDeferredHistoricalHydration,
    supportsPartialPrimaryRender,
    requiresFullRecordsForPrimary,
    fetchProfile,
    supportsDeferredFullRecordsHydration,
    requiresFullRecordsForInteractions,
    updateFeedbackFilterOptions,
    applyFeedbackFiltersAndRender,
    applyFeedbackStatusNote,
    renderEdDashboard,
    getSettings,
    getClientConfig,
    getAutoRefreshTimerId,
    setAutoRefreshTimerId,
    initializeKpiDefaultWindow,
  } = normalizeCreateDataFlowArgs(env);
  const syncKpiFilterControlsSafe =
    typeof syncKpiFilterControls === 'function' ? syncKpiFilterControls : () => {};
  const DAILY_STATS_SESSION_KEY = 'ed-dashboard:daily-stats:v1';
  const DAILY_STATS_CACHE_TTL_MS = 5 * 60 * 1000;
  const activeConfig = pageConfig || {};
  const needsMainData = Boolean(
    activeConfig.kpi ||
      activeConfig.charts ||
      activeConfig.recent ||
      activeConfig.monthly ||
      activeConfig.yearly ||
      activeConfig.ed
  );
  const shouldAutoRefresh = Boolean(activeConfig.kpi || activeConfig.ed);
  const needsFeedbackData = Boolean(activeConfig.feedback || activeConfig.ed);
  const needsEdData = Boolean(activeConfig.ed);
  const canUseDailyStatsCacheOnly = Boolean(
    activeConfig.recent &&
      !activeConfig.kpi &&
      !activeConfig.charts &&
      !activeConfig.monthly &&
      !activeConfig.yearly
  );
  const isChartsOnlyPage = Boolean(
    activeConfig.charts &&
      !activeConfig.kpi &&
      !activeConfig.recent &&
      !activeConfig.monthly &&
      !activeConfig.yearly &&
      !activeConfig.feedback &&
      !activeConfig.ed
  );
  const isKpiOnlyPage = Boolean(
    activeConfig.kpi &&
      !activeConfig.charts &&
      !activeConfig.recent &&
      !activeConfig.monthly &&
      !activeConfig.yearly &&
      !activeConfig.feedback &&
      !activeConfig.ed
  );
  const isYearlyOnlyPage = Boolean(
    activeConfig.yearly &&
      !activeConfig.kpi &&
      !activeConfig.charts &&
      !activeConfig.recent &&
      !activeConfig.monthly &&
      !activeConfig.feedback &&
      !activeConfig.ed
  );
  const isEdOnlyPage = Boolean(
    activeConfig.ed &&
      !activeConfig.kpi &&
      !activeConfig.charts &&
      !activeConfig.recent &&
      !activeConfig.monthly &&
      !activeConfig.yearly &&
      !activeConfig.feedback
  );
  const supportsDeferredMainHydration =
    typeof supportsDeferredHistoricalHydration === 'boolean'
      ? supportsDeferredHistoricalHydration
      : Boolean(isKpiOnlyPage || isEdOnlyPage);
  const disableHistoricalForPage = Boolean(isEdOnlyPage);
  const canUseDailyStatsCache = Boolean(canUseDailyStatsCacheOnly);
  const mainDataFetchProfile =
    typeof fetchProfile === 'string' && fetchProfile.trim().length ? fetchProfile.trim() : 'full';
  const supportsDeferredFullRecordsMainHydration =
    typeof supportsDeferredFullRecordsHydration === 'boolean' ? supportsDeferredFullRecordsHydration : false;
  const pageRequiresFullRecordsForInteractions =
    typeof requiresFullRecordsForInteractions === 'boolean' ? requiresFullRecordsForInteractions : false;
  const hydrationState = {
    historicalHydrationInFlight: false,
    historicalHydrated: false,
    fullRecordsHydrationInFlight: false,
    fullRecordsHydrated: false,
    deferredHydrationQueued: false,
    deferredFullRecordsHydrationQueued: false,
    activeHydrationAbortController: null,
    activeFullRecordsHydrationAbortController: null,
  };
  let visibilityHandlersBound = false;
  let lastIssuedLoadToken = 0;
  let activeLoadAbortController = null;

  function isLoadTokenCurrent(token) {
    return Number.isFinite(token) && token === lastIssuedLoadToken;
  }

  const isAbortError = (error) => isAbortErrorHelper(error);
  const startPerfStage = (label, meta = {}) => startPerfStageHelper(perfMonitor, label, meta);
  const finishPerfStage = (handle, meta = {}) => finishPerfStageHelper(perfMonitor, handle, meta);
  const markBrowserMetric = (name) => markBrowserMetricHelper(name);
  const dispatchChartsLifecycleEvent = (name, detail = {}) =>
    dispatchChartsLifecycleEventHelper(name, detail);
  const ensureChartsStartupState = () => ensureChartsStartupStateHelper(dashboardState);

  async function renderChartsPrimaryStage(scopedCharts) {
    return renderChartsPrimaryStageHelper(
      {
        renderChartsPrimary,
        renderCharts,
        startPerfStage,
        finishPerfStage,
        ensureChartsStartupState,
        dashboardState,
        onPrimaryVisible,
      },
      scopedCharts
    );
  }

  function scheduleChartsSecondaryAndHospitalRender({ reason = 'load' } = {}) {
    scheduleChartsSecondaryAndHospitalRenderHelper(
      {
        activeConfig,
        scheduleChartsSecondaryRender,
        ensureChartsStartupState,
        dashboardState,
        runAfterDomAndIdle,
        startPerfStage,
        finishPerfStage,
        renderChartsSecondary,
        getHeatmapData,
        prepareChartDataForPeriod,
        renderCharts,
        onSecondaryComplete,
        markBrowserMetric,
        dispatchChartsLifecycleEvent,
        renderChartsHospitalTable,
      },
      { reason }
    );
  }

  const computeMainDataSignature = (dataset, cachedDailyStats) =>
    computeMainDataSignatureHelper(dataset, cachedDailyStats);
  const computeEdRenderKey = (edData) => computeEdRenderKeyHelper(edData);
  const logRefreshDecision = (clientConfig, scope, decision, meta = {}) =>
    logRefreshDecisionHelper(clientConfig, scope, decision, meta);
  const readDailyStatsFromSessionCache = () =>
    readDailyStatsFromSessionCacheHelper({
      canUseDailyStatsCache,
      key: DAILY_STATS_SESSION_KEY,
      ttlMs: DAILY_STATS_CACHE_TTL_MS,
    });
  const writeDailyStatsToSessionCache = (dailyStats, { scope = 'full' } = {}) =>
    writeDailyStatsToSessionCacheHelper(dailyStats, { key: DAILY_STATS_SESSION_KEY, scope });

  function restartAutoRefreshTimer() {
    const currentTimerId = getAutoRefreshTimerId();
    if (currentTimerId) {
      window.clearInterval(currentTimerId);
    }
    if (!shouldAutoRefresh) {
      setAutoRefreshTimerId(null);
      return;
    }
    if (!visibilityHandlersBound && typeof document !== 'undefined') {
      visibilityHandlersBound = true;
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible' && !dashboardState.loading) {
          loadDashboard();
        }
      };
      const onPageHide = () => {
        const activeTimerId = getAutoRefreshTimerId();
        if (activeTimerId) {
          window.clearInterval(activeTimerId);
          setAutoRefreshTimerId(null);
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange, { passive: true });
      window.addEventListener('pageshow', onVisibilityChange, { passive: true });
      window.addEventListener('pagehide', onPageHide, { passive: true });
    }
    const nextTimerId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      loadDashboard();
    }, AUTO_REFRESH_INTERVAL_MS);
    setAutoRefreshTimerId(nextTimerId);
  }

  async function applyHydratedMainDataset({ dataset, runNumber, settings, chartsReason = 'hydrate' }) {
    return applyHydratedMainDatasetHelper(
      {
        dashboardState,
        computeDailyStats,
        defaultSettings: DEFAULT_SETTINGS,
        activeConfig,
        sanitizeChartFilters,
        getDefaultChartFilters,
        KPI_FILTER_LABELS,
        syncChartFilterControls,
        populateChartYearOptions,
        populateChartsHospitalTableYearOptions,
        populateHourlyCompareYearOptions,
        populateHeatmapYearOptions,
        syncHeatmapFilterControls,
        startPerfStage,
        finishPerfStage,
        prepareChartDataForPeriod,
        renderChartsPrimaryStage,
        scheduleChartsSecondaryAndHospitalRender,
        applyKpiFiltersAndRender,
        filterDailyStatsByWindow,
        renderRecentTable,
        renderEdDashboard,
        writeDailyStatsToSessionCache,
      },
      { dataset, runNumber, settings, chartsReason }
    );
  }

  async function hydrateDeferredFullRecords({ runNumber, settings, deferredHydration }) {
    return hydrateDeferredFullRecordsHelper(
      {
        supportsDeferredFullRecordsMainHydration,
        pageRequiresFullRecordsForInteractions,
        hydrationState,
        applyHydratedMainDataset,
        isAbortError,
        describeError,
      },
      { runNumber, settings, deferredHydration }
    );
  }

  function scheduleDeferredFullRecordsHydration({ runNumber, settings, deferredHydration }) {
    scheduleDeferredFullRecordsHydrationHelper(
      {
        hydrationState,
        isKpiOnlyPage,
        runAfterDomAndIdle,
        hydrateDeferredFullRecords: (args) => hydrateDeferredFullRecords(args),
      },
      { runNumber, settings, deferredHydration }
    );
  }

  async function hydrateWithHistoricalData({
    runNumber,
    settings,
    workerProgressReporter,
    primaryChunkReporter,
    historicalChunkReporter,
  }) {
    return hydrateWithHistoricalDataHelper(
      {
        supportsDeferredMainHydration,
        hydrationState,
        isEdOnlyPage,
        fetchData,
        activeConfig,
        applyHydratedMainDataset,
        isAbortError,
        describeError,
      },
      { runNumber, settings, workerProgressReporter, primaryChunkReporter, historicalChunkReporter }
    );
  }

  function scheduleDeferredHydration({
    runNumber,
    settings,
    workerProgressReporter,
    primaryChunkReporter,
    historicalChunkReporter,
  }) {
    scheduleDeferredHydrationHelper(
      {
        hydrationState,
        runAfterDomAndIdle,
        hydrateWithHistoricalData: (args) => hydrateWithHistoricalData(args),
      },
      { runNumber, settings, workerProgressReporter, primaryChunkReporter, historicalChunkReporter }
    );
  }

  async function loadDashboard() {
    if (dashboardState.loading) {
      dashboardState.queuedReload = true;
      if (activeLoadAbortController && !activeLoadAbortController.signal.aborted) {
        activeLoadAbortController.abort();
      }
      return;
    }

    const settings = getSettings();
    const clientConfig = getClientConfig();

    dashboardState.loadCounter += 1;
    const runNumber = dashboardState.loadCounter;
    lastIssuedLoadToken += 1;
    const loadToken = lastIssuedLoadToken;
    dashboardState.activeLoadToken = loadToken;
    if (
      hydrationState.activeHydrationAbortController &&
      !hydrationState.activeHydrationAbortController.signal.aborted
    ) {
      hydrationState.activeHydrationAbortController.abort();
    }
    if (
      hydrationState.activeFullRecordsHydrationAbortController &&
      !hydrationState.activeFullRecordsHydrationAbortController.signal.aborted
    ) {
      hydrationState.activeFullRecordsHydrationAbortController.abort();
    }
    if (activeLoadAbortController && !activeLoadAbortController.signal.aborted) {
      activeLoadAbortController.abort();
    }
    const loadAbortController = new AbortController();
    activeLoadAbortController = loadAbortController;
    const loadHandle = clientConfig.profilingEnabled
      ? perfMonitor.start('dashboard-load', { seansas: runNumber })
      : null;
    const fetchHandle = clientConfig.profilingEnabled
      ? perfMonitor.start('duomenų-atsiuntimas', { seansas: runNumber })
      : null;
    const fetchSummary = { pagrindinis: 'tinklas', istorinis: 'tinklas' };
    let fetchMeasured = false;
    hydrationState.fullRecordsHydrated = false;

    dashboardState.loading = true;
    const shouldShowSkeletons = !dashboardState.hasLoadedOnce;
    if (
      shouldShowSkeletons &&
      activeConfig.kpi &&
      (!selectors.kpiGrid || !selectors.kpiGrid.children.length)
    ) {
      showKpiSkeleton();
    }
    const chartsInitialized =
      dashboardState.charts.daily ||
      dashboardState.charts.dow ||
      dashboardState.charts.dowStay ||
      dashboardState.charts.funnel;
    if (shouldShowSkeletons && activeConfig.charts && !chartsInitialized) {
      showChartSkeletons();
    }
    if (
      shouldShowSkeletons &&
      activeConfig.ed &&
      (!selectors.edCards || !selectors.edCards.children.length)
    ) {
      showEdSkeleton();
    }

    try {
      const loadOutcome = await performDashboardLoadAttemptHelper({
        setStatus,
        TEXT,
        selectors,
        setDatasetValue,
        readDailyStatsFromSessionCache,
        isEdOnlyPage,
        hydrationState,
        needsMainData,
        createChunkReporter,
        needsEdData,
        isKpiOnlyPage,
        disableHistoricalForPage,
        supportsDeferredFullRecordsMainHydration,
        pageRequiresFullRecordsForInteractions,
        mainDataFetchProfile,
        activeConfig,
        dashboardState,
        supportsPartialPrimaryRender,
        clientConfig,
        requiresFullRecordsForPrimary,
        isLoadTokenCurrent,
        loadToken,
        loadAbortController,
        mergeDailyStatsSeries,
        populateChartYearOptions,
        populateHeatmapYearOptions,
        syncHeatmapFilterControls,
        syncChartFilterControls,
        startPerfStage,
        prepareChartDataForPeriod,
        finishPerfStage,
        renderChartsPrimaryStage,
        fetchData,
        needsFeedbackData,
        fetchFeedbackData,
        fetchEdData,
        describeCacheMeta,
        perfMonitor,
        fetchHandle,
        fetchSummary,
        computeMainDataSignature,
        computeEdRenderKey,
        shouldAutoRefresh,
        logRefreshDecision,
        describeError,
        createEmptyEdSummary,
        computeDailyStats,
        defaultSettings: DEFAULT_SETTINGS,
        writeDailyStatsToSessionCache,
        populateChartsHospitalTableYearOptions,
        populateHourlyCompareYearOptions,
        filterDailyStatsByWindow,
        initializeKpiDefaultWindow,
        syncKpiFilterControlsSafe,
        sanitizeChartFilters,
        getDefaultChartFilters,
        KPI_FILTER_LABELS,
        scheduleChartsSecondaryAndHospitalRender,
        applyKpiFiltersAndRender,
        renderRecentTable,
        computeMonthlyStats,
        renderMonthlyTable,
        computeYearlyStats,
        renderYearlyTable,
        updateFeedbackFilterOptions,
        applyFeedbackFiltersAndRender,
        applyFeedbackStatusNote,
        scheduleDeferredFullRecordsHydration,
        scheduleDeferredHydration,
        supportsDeferredMainHydration,
        runNumber,
        settings,
        renderEdDashboard,
      });
      fetchMeasured = loadOutcome.fetchMeasured === true;
      if (loadOutcome.shouldStop) {
        return;
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      const errorInfo = describeError(error, { code: 'DATA_PROCESS', message: 'Nepavyko apdoroti duomenų' });
      console.error(errorInfo.log, error);
      dashboardState.usingFallback = false;
      dashboardState.lastErrorMessage = errorInfo.userMessage;
      dashboardState.chartsHospitalTableWorkerAgg = null;
      setStatus('error', { message: errorInfo.userMessage, retryable: true });
      if (activeConfig.charts) {
        if (typeof populateChartsHospitalTableYearOptions === 'function') {
          populateChartsHospitalTableYearOptions([]);
        }
        if (typeof renderChartsHospitalTable === 'function') {
          renderChartsHospitalTable([]);
        }
      }
      if (needsEdData) {
        await renderEdDashboard(dashboardState.ed);
      }
    } finally {
      const isCurrentRun = isLoadTokenCurrent(loadToken);
      if (activeLoadAbortController === loadAbortController) {
        activeLoadAbortController = null;
      }
      if (isCurrentRun) {
        dashboardState.loading = false;
        dashboardState.hasLoadedOnce = true;
        restartAutoRefreshTimer();
      }
      if (isCurrentRun && dashboardState.queuedReload) {
        dashboardState.queuedReload = false;
        window.setTimeout(() => {
          loadDashboard();
        }, 0);
      }
      if (clientConfig.profilingEnabled && loadHandle) {
        if (fetchHandle && !fetchMeasured) {
          perfMonitor.finish(fetchHandle, {
            pagrindinis: fetchSummary.pagrindinis,
            istorinis: fetchSummary.istorinis,
            fallbackas: dashboardState.usingFallback,
            šaltiniai: 0,
          });
        }
        const status = dashboardState.lastErrorMessage ? 'klaida' : 'ok';
        perfMonitor.finish(loadHandle, {
          status,
          pagrindinis: fetchSummary.pagrindinis,
          istorinis: fetchSummary.istorinis,
        });
        perfMonitor.logTable();
      }
    }
  }

  function scheduleInitialLoad() {
    scheduleInitialLoadHelper({
      isKpiOnlyPage,
      isChartsOnlyPage,
      isYearlyOnlyPage,
      dashboardState,
      loadDashboard,
      activeConfig,
      runAfterDomAndIdle,
    });
  }

  return { loadDashboard, scheduleInitialLoad };
}
