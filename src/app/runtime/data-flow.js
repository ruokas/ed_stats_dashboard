function normalizeCreateDataFlowArgs(env = {}) {
  const noop = () => {};
  const noopAsync = async () => {};
  const noopArray = () => [];
  const noopAsyncArray = async () => [];
  const noopObject = () => ({});
  const noopChartData = () => ({ daily: [], funnel: null, heatmap: null });
  const defaultKpiFilterLabels = {
    arrival: { all: 'all' },
    disposition: { all: 'all' },
    cardType: { all: 'all' },
  };
  const uiHooks = env.uiHooks || {};
  const chartHooks = env.chartHooks || {};
  const kpiHooks = env.kpiHooks || {};
  const feedbackHooks = env.feedbackHooks || {};
  const edHooks = env.edHooks || {};
  const dataHooks = env.dataHooks || {};
  return {
    ...env,
    runAfterDomAndIdle: env.runAfterDomAndIdle ?? uiHooks.runAfterDomAndIdle ?? ((fn) => fn()),
    setDatasetValue: env.setDatasetValue ?? uiHooks.setDatasetValue ?? noop,
    setStatus: env.setStatus ?? uiHooks.setStatus ?? noop,
    getSettings: env.getSettings ?? uiHooks.getSettings ?? (() => ({ calculations: {} })),
    getClientConfig: env.getClientConfig ?? uiHooks.getClientConfig ?? (() => ({ profilingEnabled: false })),
    getAutoRefreshTimerId: env.getAutoRefreshTimerId ?? uiHooks.getAutoRefreshTimerId ?? (() => null),
    setAutoRefreshTimerId: env.setAutoRefreshTimerId ?? uiHooks.setAutoRefreshTimerId ?? noop,
    showChartSkeletons: env.showChartSkeletons ?? chartHooks.showChartSkeletons ?? noop,
    populateChartYearOptions: env.populateChartYearOptions ?? chartHooks.populateChartYearOptions ?? noop,
    populateChartsHospitalTableYearOptions:
      env.populateChartsHospitalTableYearOptions ?? chartHooks.populateChartsHospitalTableYearOptions ?? noop,
    populateHourlyCompareYearOptions:
      env.populateHourlyCompareYearOptions ?? chartHooks.populateHourlyCompareYearOptions ?? noop,
    populateHeatmapYearOptions:
      env.populateHeatmapYearOptions ?? chartHooks.populateHeatmapYearOptions ?? noop,
    syncHeatmapFilterControls: env.syncHeatmapFilterControls ?? chartHooks.syncHeatmapFilterControls ?? noop,
    getDefaultChartFilters: env.getDefaultChartFilters ?? chartHooks.getDefaultChartFilters ?? noopObject,
    sanitizeChartFilters: env.sanitizeChartFilters ?? chartHooks.sanitizeChartFilters ?? ((value) => value),
    KPI_FILTER_LABELS: env.KPI_FILTER_LABELS ?? chartHooks.KPI_FILTER_LABELS ?? defaultKpiFilterLabels,
    syncChartFilterControls: env.syncChartFilterControls ?? chartHooks.syncChartFilterControls ?? noop,
    prepareChartDataForPeriod:
      env.prepareChartDataForPeriod ?? chartHooks.prepareChartDataForPeriod ?? noopChartData,
    renderChartsPrimary: env.renderChartsPrimary ?? chartHooks.renderChartsPrimary ?? null,
    renderChartsSecondary: env.renderChartsSecondary ?? chartHooks.renderChartsSecondary ?? null,
    renderCharts: env.renderCharts ?? chartHooks.renderCharts ?? noopAsync,
    renderChartsHospitalTable: env.renderChartsHospitalTable ?? chartHooks.renderChartsHospitalTable ?? noop,
    getHeatmapData: env.getHeatmapData ?? chartHooks.getHeatmapData ?? (() => null),
    onPrimaryVisible: env.onPrimaryVisible ?? uiHooks.onPrimaryVisible ?? noop,
    onSecondaryComplete: env.onSecondaryComplete ?? uiHooks.onSecondaryComplete ?? noop,
    onChartsPrimaryVisible:
      env.onChartsPrimaryVisible ??
      chartHooks.onChartsPrimaryVisible ??
      env.onPrimaryVisible ??
      uiHooks.onPrimaryVisible ??
      noop,
    scheduleChartsSecondaryRender:
      env.scheduleChartsSecondaryRender ??
      chartHooks.scheduleChartsSecondaryRender ??
      env.scheduleSecondaryRender ??
      uiHooks.scheduleSecondaryRender ??
      null,
    showKpiSkeleton: env.showKpiSkeleton ?? kpiHooks.showKpiSkeleton ?? noop,
    syncKpiFilterControls: env.syncKpiFilterControls ?? kpiHooks.syncKpiFilterControls ?? noop,
    applyKpiFiltersAndRender: env.applyKpiFiltersAndRender ?? kpiHooks.applyKpiFiltersAndRender ?? noopAsync,
    initializeKpiDefaultWindow: env.initializeKpiDefaultWindow ?? kpiHooks.initializeDefaultWindow,
    updateFeedbackFilterOptions:
      env.updateFeedbackFilterOptions ?? feedbackHooks.updateFeedbackFilterOptions ?? noop,
    applyFeedbackFiltersAndRender:
      env.applyFeedbackFiltersAndRender ?? feedbackHooks.applyFeedbackFiltersAndRender ?? noop,
    applyFeedbackStatusNote: env.applyFeedbackStatusNote ?? feedbackHooks.applyFeedbackStatusNote ?? noop,
    showEdSkeleton: env.showEdSkeleton ?? edHooks.showEdSkeleton ?? noop,
    renderEdDashboard: env.renderEdDashboard ?? edHooks.renderEdDashboard ?? noopAsync,
    createEmptyEdSummary: env.createEmptyEdSummary ?? edHooks.createEmptyEdSummary ?? noopObject,
    createChunkReporter: env.createChunkReporter ?? dataHooks.createChunkReporter ?? (() => null),
    fetchData: env.fetchData ?? dataHooks.fetchData ?? (async () => ({})),
    fetchFeedbackData: env.fetchFeedbackData ?? dataHooks.fetchFeedbackData ?? noopAsyncArray,
    fetchEdData: env.fetchEdData ?? dataHooks.fetchEdData ?? (async () => null),
    perfMonitor: env.perfMonitor ??
      dataHooks.perfMonitor ?? {
        start: () => null,
        finish: () => {},
        logTable: () => {},
      },
    describeCacheMeta: env.describeCacheMeta ?? dataHooks.describeCacheMeta ?? (() => ({})),
    describeError:
      env.describeError ??
      dataHooks.describeError ??
      ((error, options = {}) => ({
        log: options?.code || 'DATA_FLOW',
        userMessage: options?.message || String(error?.message || 'Klaida'),
      })),
    computeDailyStats: env.computeDailyStats ?? dataHooks.computeDailyStats ?? noopArray,
    filterDailyStatsByWindow:
      env.filterDailyStatsByWindow ??
      dataHooks.filterDailyStatsByWindow ??
      ((daily) => (Array.isArray(daily) ? daily : [])),
    mergeDailyStatsSeries:
      env.mergeDailyStatsSeries ??
      dataHooks.mergeDailyStatsSeries ??
      ((seriesList) => (Array.isArray(seriesList?.[0]) ? seriesList[0] : [])),
    renderRecentTable: env.renderRecentTable ?? dataHooks.renderRecentTable ?? noop,
    computeMonthlyStats: env.computeMonthlyStats ?? dataHooks.computeMonthlyStats ?? noopArray,
    renderMonthlyTable: env.renderMonthlyTable ?? dataHooks.renderMonthlyTable ?? noop,
    computeYearlyStats: env.computeYearlyStats ?? dataHooks.computeYearlyStats ?? noopArray,
    renderYearlyTable: env.renderYearlyTable ?? dataHooks.renderYearlyTable ?? noop,
    supportsDeferredHistoricalHydration:
      env.supportsDeferredHistoricalHydration ?? dataHooks.supportsDeferredHistoricalHydration,
    supportsPartialPrimaryRender: env.supportsPartialPrimaryRender ?? dataHooks.supportsPartialPrimaryRender,
    requiresFullRecordsForPrimary:
      env.requiresFullRecordsForPrimary ?? dataHooks.requiresFullRecordsForPrimary,
    fetchProfile: env.fetchProfile ?? dataHooks.fetchProfile,
    supportsDeferredFullRecordsHydration:
      env.supportsDeferredFullRecordsHydration ?? dataHooks.supportsDeferredFullRecordsHydration,
    requiresFullRecordsForInteractions:
      env.requiresFullRecordsForInteractions ?? dataHooks.requiresFullRecordsForInteractions,
  };
}

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
  let historicalHydrationInFlight = false;
  let historicalHydrated = false;
  let fullRecordsHydrationInFlight = false;
  let fullRecordsHydrated = false;
  let visibilityHandlersBound = false;
  let deferredHydrationQueued = false;
  let deferredFullRecordsHydrationQueued = false;
  let lastIssuedLoadToken = 0;
  let activeLoadAbortController = null;
  let activeHydrationAbortController = null;
  let activeFullRecordsHydrationAbortController = null;

  function isLoadTokenCurrent(token) {
    return Number.isFinite(token) && token === lastIssuedLoadToken;
  }

  function isAbortError(error) {
    return Boolean(error && typeof error === 'object' && error.name === 'AbortError');
  }

  function startPerfStage(label, meta = {}) {
    try {
      return perfMonitor?.start?.(label, meta) ?? null;
    } catch (_error) {
      return null;
    }
  }

  function finishPerfStage(handle, meta = {}) {
    if (!handle) {
      return;
    }
    try {
      perfMonitor?.finish?.(handle, meta);
    } catch (_error) {
      // ignore perf instrumentation failures
    }
  }

  function markBrowserMetric(name) {
    if (typeof performance?.mark !== 'function') {
      return;
    }
    try {
      performance.mark(name);
    } catch (_error) {
      // ignore perf mark failures
    }
  }

  function dispatchChartsLifecycleEvent(name, detail = {}) {
    if (typeof window?.dispatchEvent !== 'function' || typeof window?.CustomEvent !== 'function') {
      return;
    }
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function ensureChartsStartupState() {
    if (!dashboardState.chartsStartupPhases || typeof dashboardState.chartsStartupPhases !== 'object') {
      dashboardState.chartsStartupPhases = {
        primaryVisible: false,
        secondaryComplete: false,
        hospitalRendered: false,
      };
    }
    if (
      !dashboardState.chartsSectionRenderFlags ||
      typeof dashboardState.chartsSectionRenderFlags !== 'object'
    ) {
      dashboardState.chartsSectionRenderFlags = {
        heatmapVisible: false,
        hourlyVisible: false,
        heatmapRendered: false,
        hourlyRendered: false,
        hospitalVisible: false,
      };
    }
  }

  async function renderChartsPrimaryStage(scopedCharts) {
    const primaryRenderer =
      typeof renderChartsPrimary === 'function'
        ? renderChartsPrimary
        : async (daily, funnel) => renderCharts(daily, funnel, null);
    const handle = startPerfStage('charts-primary-render');
    try {
      await primaryRenderer(scopedCharts?.daily, scopedCharts?.funnel);
      ensureChartsStartupState();
      dashboardState.chartsStartupPhases.primaryVisible = true;
      dashboardState.chartsFirstVisibleAt = Date.now();
      if (typeof onPrimaryVisible === 'function') {
        onPrimaryVisible({ scope: 'charts' });
      }
    } finally {
      finishPerfStage(handle);
    }
  }

  function scheduleChartsSecondaryAndHospitalRender({ reason = 'load' } = {}) {
    if (!activeConfig.charts) {
      return;
    }
    if (typeof scheduleChartsSecondaryRender === 'function') {
      scheduleChartsSecondaryRender({ reason });
      return;
    }
    ensureChartsStartupState();
    dashboardState.chartsDeferredRenderToken = Number(dashboardState.chartsDeferredRenderToken || 0) + 1;
    const token = dashboardState.chartsDeferredRenderToken;
    dashboardState.chartsDeferredRenderReason = reason;
    if (dashboardState.chartsSecondaryRenderScheduled) {
      return;
    }
    dashboardState.chartsSecondaryRenderScheduled = true;
    runAfterDomAndIdle(
      async () => {
        dashboardState.chartsSecondaryRenderScheduled = false;
        if (token !== dashboardState.chartsDeferredRenderToken) {
          scheduleChartsSecondaryAndHospitalRender({
            reason: dashboardState.chartsDeferredRenderReason || reason,
          });
          return;
        }
        const secondaryHandle = startPerfStage('charts-secondary-render', { priežastis: reason });
        try {
          if (typeof renderChartsSecondary === 'function') {
            await renderChartsSecondary({
              heatmapData: typeof getHeatmapData === 'function' ? getHeatmapData() : null,
              allowReuse: true,
            });
          } else {
            const scopedCharts = prepareChartDataForPeriod(dashboardState.chartPeriod);
            const heatmapData =
              typeof getHeatmapData === 'function' ? getHeatmapData() : scopedCharts.heatmap;
            await renderCharts(scopedCharts.daily, scopedCharts.funnel, heatmapData);
          }
          dashboardState.chartsStartupPhases.secondaryComplete = true;
          if (typeof onSecondaryComplete === 'function') {
            onSecondaryComplete({ scope: 'charts', reason });
          }
          markBrowserMetric('app-charts-secondary-complete');
          dispatchChartsLifecycleEvent('app:charts-secondary-complete', {
            loadCounter: dashboardState.loadCounter,
          });
        } catch (_error) {
          // section-level renderer errors are already handled downstream
        } finally {
          finishPerfStage(secondaryHandle);
        }

        if (dashboardState.chartsHospitalRenderScheduled) {
          return;
        }
        dashboardState.chartsHospitalRenderScheduled = true;
        runAfterDomAndIdle(
          () => {
            dashboardState.chartsHospitalRenderScheduled = false;
            if (token !== dashboardState.chartsDeferredRenderToken) {
              return;
            }
            const hospitalHandle = startPerfStage('charts-hospital-table-render', { priežastis: reason });
            try {
              renderChartsHospitalTable(dashboardState.rawRecords);
              dashboardState.chartsStartupPhases.hospitalRendered = true;
            } finally {
              finishPerfStage(hospitalHandle);
            }
          },
          { timeout: 1800 }
        );
      },
      { timeout: 1200 }
    );
  }

  function computeMainDataSignature(dataset, cachedDailyStats) {
    if (cachedDailyStats) {
      return `session:${Array.isArray(cachedDailyStats) ? cachedDailyStats.length : 0}`;
    }
    const primarySignature =
      dataset?.meta?.primary?.signature ||
      dataset?.meta?.primary?.etag ||
      dataset?.meta?.primary?.lastModified ||
      '';
    const historicalSignature =
      dataset?.meta?.historical?.signature ||
      dataset?.meta?.historical?.etag ||
      dataset?.meta?.historical?.lastModified ||
      '';
    return `${primarySignature}|${historicalSignature}`;
  }

  function readDailyStatsFromSessionCache() {
    if (!canUseDailyStatsCache) {
      return null;
    }
    try {
      const raw = window.sessionStorage.getItem(DAILY_STATS_SESSION_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.dailyStats) || !Number.isFinite(parsed.savedAt)) {
        return null;
      }
      if (parsed.scope !== 'full') {
        return null;
      }
      if (Date.now() - parsed.savedAt > DAILY_STATS_CACHE_TTL_MS) {
        return null;
      }
      return parsed.dailyStats;
    } catch (_error) {
      return null;
    }
  }

  function writeDailyStatsToSessionCache(dailyStats, { scope = 'full' } = {}) {
    if (!Array.isArray(dailyStats) || !dailyStats.length) {
      return;
    }
    try {
      window.sessionStorage.setItem(
        DAILY_STATS_SESSION_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          scope,
          dailyStats,
        })
      );
    } catch (_error) {
      // Ignore storage quota and serialization errors.
    }
  }

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
    if (!dataset || dashboardState.loading || runNumber !== dashboardState.loadCounter) {
      return false;
    }
    const combinedRecords = Array.isArray(dataset.records) ? dataset.records : [];
    const primaryRecords =
      Array.isArray(dataset.primaryRecords) && dataset.primaryRecords.length
        ? dataset.primaryRecords
        : combinedRecords;
    const dailyStats =
      Array.isArray(dataset.dailyStats) && dataset.dailyStats.length
        ? dataset.dailyStats
        : computeDailyStats(combinedRecords, settings?.calculations, DEFAULT_SETTINGS);
    const primaryDaily =
      Array.isArray(dataset.primaryDaily) && dataset.primaryDaily.length
        ? dataset.primaryDaily
        : computeDailyStats(primaryRecords, settings?.calculations, DEFAULT_SETTINGS);

    dashboardState.rawRecords = combinedRecords;
    dashboardState.dailyStats = dailyStats;
    dashboardState.primaryRecords = primaryRecords.slice();
    dashboardState.primaryDaily = primaryDaily.slice();
    dashboardState.chartsHospitalTableWorkerAgg = dataset.hospitalByDeptStayAgg || null;
    dashboardState.dataMeta = dataset.meta || null;
    if (dashboardState.mainData && typeof dashboardState.mainData === 'object') {
      const recordsState = String(dataset?.meta?.recordsState || '');
      dashboardState.mainData.recordsHydrationState =
        recordsState === 'deferred' ? 'deferred' : combinedRecords.length > 0 ? 'full' : 'none';
      dashboardState.mainData.deferredHydration = dataset?.deferredHydration || null;
    }

    if (activeConfig.charts) {
      dashboardState.chartData.baseDaily = dailyStats;
      dashboardState.chartData.baseRecords = combinedRecords;
      dashboardState.chartFilters = sanitizeChartFilters(dashboardState.chartFilters, {
        getDefaultChartFilters,
        KPI_FILTER_LABELS,
      });
      syncChartFilterControls();
      populateChartYearOptions(dailyStats);
      if (typeof populateChartsHospitalTableYearOptions === 'function') {
        populateChartsHospitalTableYearOptions(combinedRecords);
      }
      populateHourlyCompareYearOptions(dailyStats);
      if (typeof populateHeatmapYearOptions === 'function') {
        populateHeatmapYearOptions(dailyStats);
        if (typeof syncHeatmapFilterControls === 'function') {
          syncHeatmapFilterControls();
        }
      }
      const prepareHandle = startPerfStage('charts-main-prepare', { etapas: chartsReason });
      const scopedCharts = prepareChartDataForPeriod(dashboardState.chartPeriod);
      finishPerfStage(prepareHandle);
      await renderChartsPrimaryStage(scopedCharts);
      scheduleChartsSecondaryAndHospitalRender({ reason: chartsReason });
    }
    if (activeConfig.kpi) {
      await applyKpiFiltersAndRender();
    }
    if (activeConfig.recent) {
      const windowDays = Number.isFinite(Number(settings.calculations.windowDays))
        ? Number(settings.calculations.windowDays)
        : DEFAULT_SETTINGS.calculations.windowDays;
      const lastWindowDailyStats = filterDailyStatsByWindow(dailyStats, windowDays);
      const recentWindowDays = Number.isFinite(Number(settings.calculations.recentDays))
        ? Number(settings.calculations.recentDays)
        : DEFAULT_SETTINGS.calculations.recentDays;
      const effectiveRecentDays = Math.max(1, Math.min(windowDays, recentWindowDays));
      const recentDailyStats = filterDailyStatsByWindow(lastWindowDailyStats, effectiveRecentDays);
      renderRecentTable(recentDailyStats);
    }
    if (activeConfig.ed && dashboardState.ed) {
      await renderEdDashboard(dashboardState.ed);
    }
    writeDailyStatsToSessionCache(dailyStats, { scope: 'full' });
    return true;
  }

  async function hydrateDeferredFullRecords({ runNumber, settings, deferredHydration }) {
    if (
      !supportsDeferredFullRecordsMainHydration ||
      !pageRequiresFullRecordsForInteractions ||
      fullRecordsHydrationInFlight ||
      fullRecordsHydrated ||
      !deferredHydration ||
      typeof deferredHydration.hydrate !== 'function'
    ) {
      return;
    }
    if (
      activeFullRecordsHydrationAbortController &&
      !activeFullRecordsHydrationAbortController.signal.aborted
    ) {
      activeFullRecordsHydrationAbortController.abort();
    }
    const hydrationController = new AbortController();
    activeFullRecordsHydrationAbortController = hydrationController;
    fullRecordsHydrationInFlight = true;
    try {
      const dataset = await deferredHydration.hydrate({
        signal: hydrationController.signal,
        skipHistorical: true,
      });
      const applied = await applyHydratedMainDataset({
        dataset,
        runNumber,
        settings,
        chartsReason: 'full-records-hydrate',
      });
      if (applied) {
        fullRecordsHydrated = true;
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      const errorInfo = describeError(error, { code: 'MAIN_FULL_RECORDS_HYDRATE' });
      console.warn(errorInfo.log, error);
    } finally {
      fullRecordsHydrationInFlight = false;
      if (activeFullRecordsHydrationAbortController === hydrationController) {
        activeFullRecordsHydrationAbortController = null;
      }
    }
  }

  function scheduleDeferredFullRecordsHydration({ runNumber, settings, deferredHydration }) {
    if (
      deferredFullRecordsHydrationQueued ||
      fullRecordsHydrationInFlight ||
      fullRecordsHydrated ||
      !deferredHydration ||
      typeof deferredHydration.hydrate !== 'function'
    ) {
      return;
    }
    deferredFullRecordsHydrationQueued = true;
    const execute = () => {
      deferredFullRecordsHydrationQueued = false;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void hydrateDeferredFullRecords({ runNumber, settings, deferredHydration });
    };
    runAfterDomAndIdle(execute, { timeout: 600 });
  }

  async function hydrateWithHistoricalData({
    runNumber,
    settings,
    workerProgressReporter,
    primaryChunkReporter,
    historicalChunkReporter,
  }) {
    if (!supportsDeferredMainHydration || historicalHydrationInFlight || historicalHydrated) {
      return;
    }
    if (activeHydrationAbortController && !activeHydrationAbortController.signal.aborted) {
      activeHydrationAbortController.abort();
    }
    const hydrationController = new AbortController();
    activeHydrationAbortController = hydrationController;
    historicalHydrationInFlight = true;
    try {
      const skipHistoricalForHydration = Boolean(isEdOnlyPage);
      const dataset = await fetchData({
        onPrimaryChunk: primaryChunkReporter,
        onHistoricalChunk: historicalChunkReporter,
        onWorkerProgress: workerProgressReporter,
        skipHistorical: skipHistoricalForHydration,
        includeYearlyStats: !activeConfig.charts,
        signal: hydrationController.signal,
      });
      const applied = await applyHydratedMainDataset({
        dataset,
        runNumber,
        settings,
        chartsReason: 'hydrate',
      });
      if (applied) {
        historicalHydrated = true;
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      const errorInfo = describeError(error, { code: 'CHART_HISTORICAL_HYDRATE' });
      console.warn(errorInfo.log, error);
    } finally {
      historicalHydrationInFlight = false;
      if (activeHydrationAbortController === hydrationController) {
        activeHydrationAbortController = null;
      }
    }
  }

  function scheduleDeferredHydration({
    runNumber,
    settings,
    workerProgressReporter,
    primaryChunkReporter,
    historicalChunkReporter,
  }) {
    if (deferredHydrationQueued || historicalHydrationInFlight || historicalHydrated) {
      return;
    }
    deferredHydrationQueued = true;

    const execute = () => {
      deferredHydrationQueued = false;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      if (fullRecordsHydrationInFlight || deferredFullRecordsHydrationQueued) {
        scheduleDeferredHydration({
          runNumber,
          settings,
          workerProgressReporter,
          primaryChunkReporter,
          historicalChunkReporter,
        });
        return;
      }
      hydrateWithHistoricalData({
        runNumber,
        settings,
        workerProgressReporter,
        primaryChunkReporter,
        historicalChunkReporter,
      });
    };

    runAfterDomAndIdle(execute, { timeout: 1800 });
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
    if (activeHydrationAbortController && !activeHydrationAbortController.signal.aborted) {
      activeHydrationAbortController.abort();
    }
    if (
      activeFullRecordsHydrationAbortController &&
      !activeFullRecordsHydrationAbortController.signal.aborted
    ) {
      activeFullRecordsHydrationAbortController.abort();
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
    fullRecordsHydrated = false;

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
      setStatus('loading');
      if (selectors.edStatus) {
        selectors.edStatus.textContent = '';
        setDatasetValue(selectors.edStatus, 'tone', 'info');
      }
      const cachedDailyStats = readDailyStatsFromSessionCache();
      const shouldDeferAllMainDataOnThisLoad = Boolean(isEdOnlyPage && !historicalHydrated);
      const shouldFetchMainData = Boolean(
        needsMainData && !cachedDailyStats && !shouldDeferAllMainDataOnThisLoad
      );
      const primaryChunkReporter = shouldFetchMainData ? createChunkReporter('Pagrindinis CSV') : null;
      const historicalChunkReporter = needsMainData ? createChunkReporter('Istorinis CSV') : null;
      const workerProgressReporter = shouldFetchMainData ? createChunkReporter('Apdorojama CSV') : null;
      const edChunkReporter = needsEdData ? createChunkReporter('ED CSV') : null;
      const shouldDeferHistoricalOnThisLoad = Boolean(isKpiOnlyPage);
      const shouldSkipHistoricalOnMainFetch = Boolean(
        shouldDeferHistoricalOnThisLoad || disableHistoricalForPage
      );
      const shouldDeferFullRecordsOnMainFetch = Boolean(
        supportsDeferredFullRecordsMainHydration &&
          pageRequiresFullRecordsForInteractions &&
          mainDataFetchProfile !== 'full' &&
          !cachedDailyStats
      );
      const enableChartsPartialStartup = Boolean(
        activeConfig.charts &&
          !dashboardState.hasLoadedOnce &&
          (typeof supportsPartialPrimaryRender === 'boolean'
            ? supportsPartialPrimaryRender
            : clientConfig?.experimentalChartsPartialStartup === true) &&
          requiresFullRecordsForPrimary !== true
      );
      const chartsPartialState = {
        renderedPrimary: false,
        dailyBySource: { primary: null, historical: null },
      };
      const maybeRenderChartsPrimaryFromPartial = async (sourcePartial) => {
        if (!enableChartsPartialStartup || !sourcePartial || chartsPartialState.renderedPrimary) {
          return;
        }
        if (!isLoadTokenCurrent(loadToken) || loadAbortController.signal.aborted) {
          return;
        }
        const sourceId = String(sourcePartial.sourceId || '');
        const phase = String(sourcePartial.phase || '');
        if (phase !== 'dailyStatsReady') {
          return;
        }
        const partialDaily = Array.isArray(sourcePartial?.payload?.dailyStats)
          ? sourcePartial.payload.dailyStats
          : [];
        if (!partialDaily.length) {
          return;
        }
        if (sourceId === 'primary' || sourceId === 'historical') {
          chartsPartialState.dailyBySource[sourceId] = partialDaily;
        }
        const mergedPartialDaily = mergeDailyStatsSeries([
          chartsPartialState.dailyBySource.primary || [],
          chartsPartialState.dailyBySource.historical || [],
        ]);
        if (!mergedPartialDaily.length) {
          return;
        }
        dashboardState.dailyStats = mergedPartialDaily;
        dashboardState.chartData.baseDaily = mergedPartialDaily;
        dashboardState.chartData.baseRecords = Array.isArray(dashboardState.chartData.baseRecords)
          ? dashboardState.chartData.baseRecords
          : [];
        populateChartYearOptions(mergedPartialDaily);
        if (typeof populateHeatmapYearOptions === 'function') {
          populateHeatmapYearOptions(mergedPartialDaily);
          if (typeof syncHeatmapFilterControls === 'function') {
            syncHeatmapFilterControls();
          }
        }
        syncChartFilterControls();
        const prepareHandle = startPerfStage('charts-main-prepare', { etapas: 'partial' });
        const scopedCharts = prepareChartDataForPeriod(dashboardState.chartPeriod);
        finishPerfStage(prepareHandle);
        await renderChartsPrimaryStage(scopedCharts);
        chartsPartialState.renderedPrimary = true;
      };
      const [dataResult, feedbackResult, edResult] = await Promise.allSettled([
        shouldFetchMainData
          ? (() => {
              const chartsFetchHandle = activeConfig.charts ? startPerfStage('charts-data-fetch') : null;
              return fetchData({
                onPrimaryChunk: primaryChunkReporter,
                onHistoricalChunk: historicalChunkReporter,
                onWorkerProgress: workerProgressReporter,
                skipHistorical: shouldSkipHistoricalOnMainFetch,
                includeYearlyStats: !activeConfig.charts,
                fetchProfile: mainDataFetchProfile,
                deferFullRecords: shouldDeferFullRecordsOnMainFetch,
                onPrimaryPartial: enableChartsPartialStartup
                  ? (payload) => {
                      void maybeRenderChartsPrimaryFromPartial(payload);
                    }
                  : null,
                onHistoricalPartial: enableChartsPartialStartup
                  ? (payload) => {
                      void maybeRenderChartsPrimaryFromPartial(payload);
                    }
                  : null,
                signal: loadAbortController.signal,
              }).finally(() => {
                finishPerfStage(chartsFetchHandle);
              });
            })()
          : Promise.resolve(null),
        needsFeedbackData ? fetchFeedbackData({ signal: loadAbortController.signal }) : Promise.resolve([]),
        needsEdData
          ? fetchEdData({ onChunk: edChunkReporter, signal: loadAbortController.signal })
          : Promise.resolve(null),
      ]);
      if (!isLoadTokenCurrent(loadToken)) {
        return;
      }
      if (loadAbortController.signal.aborted) {
        return;
      }

      if (clientConfig.profilingEnabled && fetchHandle) {
        const primaryCache = cachedDailyStats
          ? 'session-cache'
          : needsMainData && dataResult.status === 'fulfilled'
            ? describeCacheMeta(dataResult.value?.meta?.primary)
            : 'klaida';
        const historicalCache = cachedDailyStats
          ? 'session-cache'
          : needsMainData && dataResult.status === 'fulfilled'
            ? describeCacheMeta(dataResult.value?.meta?.historical)
            : 'klaida';
        fetchSummary.pagrindinis = primaryCache;
        fetchSummary.istorinis = historicalCache;
        perfMonitor.finish(fetchHandle, {
          pagrindinis: primaryCache,
          istorinis: historicalCache,
          fallbackas: dashboardState.usingFallback,
          šaltiniai: cachedDailyStats
            ? 0
            : needsMainData && dataResult.status === 'fulfilled'
              ? dataResult.value?.meta?.sources?.length || 0
              : 0,
        });
        fetchMeasured = true;
      }

      if (needsEdData) {
        if (edResult.status === 'fulfilled') {
          dashboardState.ed = edResult.value;
        } else {
          const fallbackMessage = TEXT.ed.status.error(TEXT.status.error);
          const errorInfo = edResult.reason
            ? describeError(edResult.reason, { code: 'ED_DATA_LOAD', message: fallbackMessage })
            : { userMessage: fallbackMessage, log: `[ED_DATA_LOAD] ${fallbackMessage}` };
          console.error(errorInfo.log, edResult.reason);
          const fallbackSummary = createEmptyEdSummary();
          dashboardState.ed = {
            records: [],
            summary: fallbackSummary,
            dispositions: [],
            daily: [],
            usingFallback: false,
            lastErrorMessage: errorInfo.userMessage,
            error: errorInfo.userMessage,
            updatedAt: new Date(),
          };
        }
      }
      if (shouldFetchMainData && dataResult.status !== 'fulfilled') {
        throw dataResult.reason;
      }

      const hasMainDataPayload = Boolean(
        cachedDailyStats || (shouldFetchMainData && dataResult.status === 'fulfilled')
      );
      const dataset = hasMainDataPayload && !cachedDailyStats ? dataResult.value || {} : {};
      const feedbackRecords =
        needsFeedbackData && feedbackResult.status === 'fulfilled' ? feedbackResult.value : [];
      const currentMainSignature =
        needsMainData && hasMainDataPayload ? computeMainDataSignature(dataset, cachedDailyStats) : '';
      const currentEdSignature = needsEdData ? dashboardState.ed?.meta?.signature || '' : '';
      const skipMainRender = Boolean(
        shouldAutoRefresh &&
          dashboardState.hasLoadedOnce &&
          currentMainSignature &&
          dashboardState.lastMainDataSignature === currentMainSignature
      );
      const skipEdRender = Boolean(
        shouldAutoRefresh &&
          dashboardState.hasLoadedOnce &&
          currentEdSignature &&
          dashboardState.lastEdDataSignature === currentEdSignature
      );
      if (needsFeedbackData && feedbackResult.status === 'rejected') {
        const errorInfo = describeError(feedbackResult.reason, {
          code: 'FEEDBACK_DATA',
          message: TEXT.status.error,
        });
        console.error(errorInfo.log, feedbackResult.reason);
        if (!dashboardState.feedback.lastErrorMessage) {
          dashboardState.feedback.lastErrorMessage = errorInfo.userMessage;
        }
        dashboardState.feedback.usingFallback = false;
      }

      let dailyStats = [];
      if (needsMainData && hasMainDataPayload) {
        const combinedRecords = cachedDailyStats ? [] : Array.isArray(dataset.records) ? dataset.records : [];
        const primaryRecords = cachedDailyStats
          ? []
          : Array.isArray(dataset.primaryRecords) && dataset.primaryRecords.length
            ? dataset.primaryRecords
            : combinedRecords;
        dailyStats =
          cachedDailyStats ||
          (Array.isArray(dataset.dailyStats) && dataset.dailyStats.length
            ? dataset.dailyStats
            : computeDailyStats(combinedRecords, settings?.calculations, DEFAULT_SETTINGS));
        const primaryDaily = cachedDailyStats
          ? dailyStats.slice()
          : Array.isArray(dataset.primaryDaily) && dataset.primaryDaily.length
            ? dataset.primaryDaily
            : computeDailyStats(primaryRecords, settings?.calculations, DEFAULT_SETTINGS);
        dashboardState.rawRecords = combinedRecords;
        dashboardState.dailyStats = dailyStats;
        dashboardState.primaryRecords = primaryRecords.slice();
        dashboardState.primaryDaily = primaryDaily.slice();
        dashboardState.chartsHospitalTableWorkerAgg = dataset.hospitalByDeptStayAgg || null;
        dashboardState.dataMeta = dataset.meta || null;
        if (dashboardState.mainData && typeof dashboardState.mainData === 'object') {
          const recordsState = String(dataset?.meta?.recordsState || '');
          dashboardState.mainData.recordsHydrationState =
            recordsState === 'deferred' ? 'deferred' : combinedRecords.length > 0 ? 'full' : 'none';
          dashboardState.mainData.deferredHydration = dataset?.deferredHydration || null;
        }
        if (!cachedDailyStats && !shouldDeferHistoricalOnThisLoad) {
          writeDailyStatsToSessionCache(dailyStats, { scope: 'full' });
        }

        if (activeConfig.charts && !skipMainRender) {
          populateChartYearOptions(dailyStats);
          if (typeof populateChartsHospitalTableYearOptions === 'function') {
            populateChartsHospitalTableYearOptions(combinedRecords);
          }
          populateHourlyCompareYearOptions(dailyStats);
          if (typeof populateHeatmapYearOptions === 'function') {
            populateHeatmapYearOptions(dailyStats);
            if (typeof syncHeatmapFilterControls === 'function') {
              syncHeatmapFilterControls();
            }
          }
        }

        const windowDays = Number.isFinite(Number(settings.calculations.windowDays))
          ? Number(settings.calculations.windowDays)
          : DEFAULT_SETTINGS.calculations.windowDays;
        if (
          activeConfig.kpi &&
          (!Number.isFinite(dashboardState.kpi.filters.window) || dashboardState.kpi.filters.window <= 0)
        ) {
          if (typeof initializeKpiDefaultWindow === 'function') {
            initializeKpiDefaultWindow(windowDays);
          } else {
            dashboardState.kpi.filters.window = windowDays;
            syncKpiFilterControlsSafe();
          }
        }
        const lastWindowDailyStats = filterDailyStatsByWindow(dailyStats, windowDays);
        const recentWindowDays = Number.isFinite(Number(settings.calculations.recentDays))
          ? Number(settings.calculations.recentDays)
          : DEFAULT_SETTINGS.calculations.recentDays;
        const effectiveRecentDays = Math.max(1, Math.min(windowDays, recentWindowDays));
        const recentDailyStats = filterDailyStatsByWindow(lastWindowDailyStats, effectiveRecentDays);

        if (activeConfig.charts) {
          dashboardState.chartData.baseDaily = dailyStats;
          dashboardState.chartData.baseRecords = combinedRecords;
          dashboardState.chartFilters = sanitizeChartFilters(dashboardState.chartFilters, {
            getDefaultChartFilters,
            KPI_FILTER_LABELS,
          });
          syncChartFilterControls();
          const prepareHandle = startPerfStage('charts-main-prepare', { etapas: 'load' });
          const scopedCharts = prepareChartDataForPeriod(dashboardState.chartPeriod);
          finishPerfStage(prepareHandle);
          await renderChartsPrimaryStage(scopedCharts);
          scheduleChartsSecondaryAndHospitalRender({ reason: 'load' });
        }
        if (!isLoadTokenCurrent(loadToken)) {
          return;
        }

        if (activeConfig.kpi && !skipMainRender) {
          await applyKpiFiltersAndRender();
        }
        if (!isLoadTokenCurrent(loadToken)) {
          return;
        }

        if (activeConfig.recent && !skipMainRender) {
          renderRecentTable(recentDailyStats);
        }

        if ((activeConfig.monthly || activeConfig.yearly) && !skipMainRender) {
          // Naudojame jau paruoštus pilnus dailyStats iš workerio,
          // kad išvengtume perteklinio perskaičiavimo kiekvieno atnaujinimo metu.
          const summaryDailyStats =
            Array.isArray(dailyStats) && dailyStats.length ? dailyStats : dashboardState.dailyStats;
          const monthlyStats = computeMonthlyStats(summaryDailyStats);
          dashboardState.monthly.all = monthlyStats;
          // Rodyti paskutinius 12 kalendorinių mėnesių, nepriklausomai nuo KPI lango filtro.
          const monthsLimit = 12;
          const limitedMonthlyStats =
            Number.isFinite(monthsLimit) && monthsLimit > 0 ? monthlyStats.slice(-monthsLimit) : monthlyStats;
          if (activeConfig.monthly) {
            renderMonthlyTable(limitedMonthlyStats);
          }
          dashboardState.monthly.window = limitedMonthlyStats;
          const yearlyStats = computeYearlyStats(monthlyStats);
          if (activeConfig.yearly) {
            renderYearlyTable(yearlyStats);
          }
        }
      }

      if (needsFeedbackData) {
        dashboardState.feedback.records = Array.isArray(feedbackRecords) ? feedbackRecords : [];
        updateFeedbackFilterOptions(dashboardState.feedback.records);
        applyFeedbackFiltersAndRender();
        applyFeedbackStatusNote();
      }
      if (!isLoadTokenCurrent(loadToken)) {
        return;
      }

      setStatus('success');
      if (
        shouldFetchMainData &&
        !cachedDailyStats &&
        dataset?.deferredHydration &&
        typeof dataset.deferredHydration.hydrate === 'function'
      ) {
        scheduleDeferredFullRecordsHydration({
          runNumber,
          settings,
          deferredHydration: dataset.deferredHydration,
        });
      }
      if ((shouldFetchMainData && shouldDeferHistoricalOnThisLoad) || shouldDeferAllMainDataOnThisLoad) {
        scheduleDeferredHydration({
          runNumber,
          settings,
          workerProgressReporter,
          primaryChunkReporter: null,
          historicalChunkReporter: null,
        });
      }
      if (cachedDailyStats && supportsDeferredMainHydration) {
        scheduleDeferredHydration({
          runNumber,
          settings,
          workerProgressReporter: null,
          primaryChunkReporter: null,
          historicalChunkReporter: null,
        });
      }
      if (needsEdData && !skipEdRender) {
        await renderEdDashboard(dashboardState.ed);
      }
      if (currentMainSignature) {
        dashboardState.lastMainDataSignature = currentMainSignature;
      }
      if (currentEdSignature) {
        dashboardState.lastEdDataSignature = currentEdSignature;
      }
      if (!isLoadTokenCurrent(loadToken)) {
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
      setStatus('error', errorInfo.userMessage);
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
    if (isKpiOnlyPage || isChartsOnlyPage || isYearlyOnlyPage) {
      const runInitialKpiLoad = () => {
        if (!dashboardState.loading) {
          void loadDashboard();
        }
      };
      if (typeof document !== 'undefined' && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runInitialKpiLoad, { once: true });
      } else {
        runInitialKpiLoad();
      }
      return;
    }
    const initialTimeout = activeConfig.kpi || activeConfig.charts || activeConfig.ed ? 250 : 500;
    runAfterDomAndIdle(
      () => {
        if (!dashboardState.loading) {
          void loadDashboard();
        }
      },
      { timeout: initialTimeout }
    );
  }

  return { loadDashboard, scheduleInitialLoad };
}
