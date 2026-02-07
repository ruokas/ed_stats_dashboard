export function createDataFlow({
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
  populateChartYearOptions,
  populateHourlyCompareYearOptions,
  populateHeatmapYearOptions,
  syncHeatmapFilterControls,
  syncKpiFilterControls,
  getDefaultChartFilters,
  sanitizeChartFilters,
  KPI_FILTER_LABELS,
  syncChartFilterControls,
  prepareChartDataForPeriod,
  applyKpiFiltersAndRender,
  renderCharts,
  getHeatmapData,
  renderRecentTable,
  computeMonthlyStats,
  renderMonthlyTable,
  computeYearlyStats,
  renderYearlyTable,
  updateFeedbackFilterOptions,
  applyFeedbackFiltersAndRender,
  applyFeedbackStatusNote,
  renderEdDashboard,
  numberFormatter,
  getSettings,
  getClientConfig,
  getAutoRefreshTimerId,
  setAutoRefreshTimerId,
}) {
  const syncKpiFilterControlsSafe = typeof syncKpiFilterControls === 'function'
    ? syncKpiFilterControls
    : () => {};
  const DAILY_STATS_SESSION_KEY = 'ed-dashboard:daily-stats:v1';
  const DAILY_STATS_CACHE_TTL_MS = 5 * 60 * 1000;
  const activeConfig = pageConfig || {};
  const needsMainData = Boolean(activeConfig.kpi
    || activeConfig.charts
    || activeConfig.recent
    || activeConfig.monthly
    || activeConfig.yearly
    || activeConfig.ed);
  const shouldAutoRefresh = Boolean(activeConfig.kpi || activeConfig.ed);
  const needsFeedbackData = Boolean(activeConfig.feedback || activeConfig.ed);
  const needsEdData = Boolean(activeConfig.ed);
  const canUseDailyStatsCacheOnly = Boolean(
    activeConfig.recent
    && !activeConfig.kpi
    && !activeConfig.charts
    && !activeConfig.monthly
    && !activeConfig.yearly,
  );
  const isChartsOnlyPage = Boolean(
    activeConfig.charts
    && !activeConfig.kpi
    && !activeConfig.recent
    && !activeConfig.monthly
    && !activeConfig.yearly
    && !activeConfig.feedback
    && !activeConfig.ed,
  );
  const isKpiOnlyPage = Boolean(
    activeConfig.kpi
    && !activeConfig.charts
    && !activeConfig.recent
    && !activeConfig.monthly
    && !activeConfig.yearly
    && !activeConfig.feedback
    && !activeConfig.ed,
  );
  const canUseDailyStatsCache = Boolean(
    canUseDailyStatsCacheOnly
    || isChartsOnlyPage,
  );
  let historicalHydrationInFlight = false;
  let historicalHydrated = false;
  let visibilityHandlersBound = false;
  let deferredHydrationQueued = false;

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
      if ((Date.now() - parsed.savedAt) > DAILY_STATS_CACHE_TTL_MS) {
        return null;
      }
      return parsed.dailyStats;
    } catch (error) {
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
        }),
      );
    } catch (error) {
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

  async function hydrateWithHistoricalData({
    runNumber,
    settings,
    workerProgressReporter,
    primaryChunkReporter,
    historicalChunkReporter,
  }) {
    const supportsDeferredHistorical = isChartsOnlyPage || isKpiOnlyPage;
    if (!supportsDeferredHistorical || historicalHydrationInFlight || historicalHydrated) {
      return;
    }
    historicalHydrationInFlight = true;
    try {
      const dataset = await fetchData({
        onPrimaryChunk: primaryChunkReporter,
        onHistoricalChunk: historicalChunkReporter,
        onWorkerProgress: workerProgressReporter,
        skipHistorical: false,
      });
      if (!dataset || dashboardState.loading || runNumber !== dashboardState.loadCounter) {
        return;
      }
      const combinedRecords = Array.isArray(dataset.records) ? dataset.records : [];
      const primaryRecords = Array.isArray(dataset.primaryRecords) && dataset.primaryRecords.length
        ? dataset.primaryRecords
        : combinedRecords;
      const dailyStats = Array.isArray(dataset.dailyStats) && dataset.dailyStats.length
        ? dataset.dailyStats
        : computeDailyStats(combinedRecords, settings?.calculations, DEFAULT_SETTINGS);
      const primaryDaily = Array.isArray(dataset.primaryDaily) && dataset.primaryDaily.length
        ? dataset.primaryDaily
        : computeDailyStats(primaryRecords, settings?.calculations, DEFAULT_SETTINGS);
      dashboardState.rawRecords = combinedRecords;
      dashboardState.dailyStats = dailyStats;
      dashboardState.primaryRecords = primaryRecords.slice();
      dashboardState.primaryDaily = primaryDaily.slice();
      dashboardState.dataMeta = dataset.meta || null;
      if (activeConfig.charts) {
        dashboardState.chartData.baseDaily = dailyStats.slice();
        dashboardState.chartData.baseRecords = combinedRecords.slice();
        dashboardState.chartFilters = sanitizeChartFilters(dashboardState.chartFilters, { getDefaultChartFilters, KPI_FILTER_LABELS });
        syncChartFilterControls();
        populateChartYearOptions(dailyStats);
        populateHourlyCompareYearOptions(dailyStats);
        if (typeof populateHeatmapYearOptions === 'function') {
          populateHeatmapYearOptions(dailyStats);
          if (typeof syncHeatmapFilterControls === 'function') {
            syncHeatmapFilterControls();
          }
        }
        const scopedCharts = prepareChartDataForPeriod(dashboardState.chartPeriod);
        const heatmapData = typeof getHeatmapData === 'function' ? getHeatmapData() : scopedCharts.heatmap;
        await renderCharts(scopedCharts.daily, scopedCharts.funnel, heatmapData);
      }
      if (activeConfig.kpi) {
        await applyKpiFiltersAndRender();
      }
      writeDailyStatsToSessionCache(dailyStats, { scope: 'full' });
      historicalHydrated = true;
    } catch (error) {
      const errorInfo = describeError(error, { code: 'CHART_HISTORICAL_HYDRATE' });
      console.warn(errorInfo.log, error);
    } finally {
      historicalHydrationInFlight = false;
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
      return;
    }

    const settings = getSettings();
    const clientConfig = getClientConfig();

    dashboardState.loadCounter += 1;
    const runNumber = dashboardState.loadCounter;
    const loadHandle = clientConfig.profilingEnabled
      ? perfMonitor.start('dashboard-load', { seansas: runNumber })
      : null;
    const fetchHandle = clientConfig.profilingEnabled
      ? perfMonitor.start('duomenų-atsiuntimas', { seansas: runNumber })
      : null;
    const fetchSummary = { pagrindinis: 'tinklas', istorinis: 'tinklas' };
    let fetchMeasured = false;

    dashboardState.loading = true;
    const shouldShowSkeletons = !dashboardState.hasLoadedOnce;
    if (shouldShowSkeletons && activeConfig.kpi && (!selectors.kpiGrid || !selectors.kpiGrid.children.length)) {
      showKpiSkeleton();
    }
    const chartsInitialized = dashboardState.charts.daily
      || dashboardState.charts.dow
      || dashboardState.charts.dowStay
      || dashboardState.charts.funnel;
    if (shouldShowSkeletons && activeConfig.charts && !chartsInitialized) {
      showChartSkeletons();
    }
    if (shouldShowSkeletons && activeConfig.ed && (!selectors.edCards || !selectors.edCards.children.length)) {
      showEdSkeleton();
    }

    try {
      setStatus('loading');
      if (selectors.edStatus) {
        selectors.edStatus.textContent = '';
        setDatasetValue(selectors.edStatus, 'tone', 'info');
      }
      const cachedDailyStats = readDailyStatsFromSessionCache();
      const shouldFetchMainData = Boolean(needsMainData && !cachedDailyStats);
      const primaryChunkReporter = shouldFetchMainData ? createChunkReporter('Pagrindinis CSV') : null;
      const historicalChunkReporter = needsMainData ? createChunkReporter('Istorinis CSV') : null;
      const workerProgressReporter = shouldFetchMainData ? createChunkReporter('Apdorojama CSV') : null;
      const edChunkReporter = needsEdData ? createChunkReporter('ED CSV') : null;
      const shouldDeferHistoricalOnThisLoad = Boolean(isChartsOnlyPage || isKpiOnlyPage);
      const [dataResult, feedbackResult, edResult] = await Promise.allSettled([
        shouldFetchMainData
          ? fetchData({
              onPrimaryChunk: primaryChunkReporter,
              onHistoricalChunk: historicalChunkReporter,
              onWorkerProgress: workerProgressReporter,
              skipHistorical: shouldDeferHistoricalOnThisLoad,
            })
          : Promise.resolve(null),
        needsFeedbackData ? fetchFeedbackData() : Promise.resolve([]),
        needsEdData ? fetchEdData({ onChunk: edChunkReporter }) : Promise.resolve(null),
      ]);

      if (clientConfig.profilingEnabled && fetchHandle) {
        const primaryCache = cachedDailyStats
          ? 'session-cache'
          : (needsMainData && dataResult.status === 'fulfilled'
            ? describeCacheMeta(dataResult.value?.meta?.primary)
            : 'klaida');
        const historicalCache = cachedDailyStats
          ? 'session-cache'
          : (needsMainData && dataResult.status === 'fulfilled'
          ? describeCacheMeta(dataResult.value?.meta?.historical)
          : 'klaida');
        fetchSummary.pagrindinis = primaryCache;
        fetchSummary.istorinis = historicalCache;
        perfMonitor.finish(fetchHandle, {
          pagrindinis: primaryCache,
          istorinis: historicalCache,
          fallbackas: dashboardState.usingFallback,
          šaltiniai: cachedDailyStats
            ? 0
            : (needsMainData && dataResult.status === 'fulfilled' ? dataResult.value?.meta?.sources?.length || 0 : 0),
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
      if (needsMainData && !cachedDailyStats && dataResult.status !== 'fulfilled') {
        throw dataResult.reason;
      }

      const dataset = needsMainData && !cachedDailyStats ? (dataResult.value || {}) : {};
      const feedbackRecords = needsFeedbackData && feedbackResult.status === 'fulfilled' ? feedbackResult.value : [];
      if (needsFeedbackData && feedbackResult.status === 'rejected') {
        const errorInfo = describeError(feedbackResult.reason, { code: 'FEEDBACK_DATA', message: TEXT.status.error });
        console.error(errorInfo.log, feedbackResult.reason);
        if (!dashboardState.feedback.lastErrorMessage) {
          dashboardState.feedback.lastErrorMessage = errorInfo.userMessage;
        }
        dashboardState.feedback.usingFallback = false;
      }

      let dailyStats = [];
      if (needsMainData) {
        const combinedRecords = cachedDailyStats ? [] : (Array.isArray(dataset.records) ? dataset.records : []);
        const primaryRecords = cachedDailyStats
          ? []
          : (Array.isArray(dataset.primaryRecords) && dataset.primaryRecords.length
            ? dataset.primaryRecords
            : combinedRecords);
        dailyStats = cachedDailyStats
          || (Array.isArray(dataset.dailyStats) && dataset.dailyStats.length
            ? dataset.dailyStats
            : computeDailyStats(combinedRecords, settings?.calculations, DEFAULT_SETTINGS));
        const primaryDaily = cachedDailyStats
          ? dailyStats.slice()
          : (Array.isArray(dataset.primaryDaily) && dataset.primaryDaily.length
            ? dataset.primaryDaily
            : computeDailyStats(primaryRecords, settings?.calculations, DEFAULT_SETTINGS));
        dashboardState.rawRecords = combinedRecords;
        dashboardState.dailyStats = dailyStats;
        dashboardState.primaryRecords = primaryRecords.slice();
        dashboardState.primaryDaily = primaryDaily.slice();
        dashboardState.dataMeta = dataset.meta || null;
        if (!cachedDailyStats && !shouldDeferHistoricalOnThisLoad) {
          writeDailyStatsToSessionCache(dailyStats, { scope: 'full' });
        }

        if (activeConfig.charts) {
          populateChartYearOptions(dailyStats);
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
        if (activeConfig.kpi && (!Number.isFinite(dashboardState.kpi.filters.window) || dashboardState.kpi.filters.window <= 0)) {
          dashboardState.kpi.filters.window = windowDays;
          syncKpiFilterControlsSafe();
        }
        const lastWindowDailyStats = filterDailyStatsByWindow(dailyStats, windowDays);
        const recentWindowDays = Number.isFinite(Number(settings.calculations.recentDays))
          ? Number(settings.calculations.recentDays)
          : DEFAULT_SETTINGS.calculations.recentDays;
        const effectiveRecentDays = Math.max(1, Math.min(windowDays, recentWindowDays));
        const recentDailyStats = filterDailyStatsByWindow(lastWindowDailyStats, effectiveRecentDays);

        if (activeConfig.charts) {
          dashboardState.chartData.baseDaily = dailyStats.slice();
          dashboardState.chartData.baseRecords = combinedRecords.slice();
          dashboardState.chartFilters = sanitizeChartFilters(dashboardState.chartFilters, { getDefaultChartFilters, KPI_FILTER_LABELS });
          syncChartFilterControls();
          const scopedCharts = prepareChartDataForPeriod(dashboardState.chartPeriod);
          const heatmapData = typeof getHeatmapData === 'function' ? getHeatmapData() : scopedCharts.heatmap;
          await renderCharts(scopedCharts.daily, scopedCharts.funnel, heatmapData);
        }

        if (activeConfig.kpi) {
          await applyKpiFiltersAndRender();
        }

        if (activeConfig.recent) {
          renderRecentTable(recentDailyStats);
        }

        if (activeConfig.monthly || activeConfig.yearly) {
          // Naudojame jau paruoštus pilnus dailyStats iš workerio,
          // kad išvengtume perteklinio perskaičiavimo kiekvieno atnaujinimo metu.
          const summaryDailyStats = Array.isArray(dailyStats) && dailyStats.length
            ? dailyStats
            : dashboardState.dailyStats;
          const monthlyStats = computeMonthlyStats(summaryDailyStats);
          dashboardState.monthly.all = monthlyStats;
          // Rodyti paskutinius 12 kalendorinių mėnesių, nepriklausomai nuo KPI lango filtro.
          const monthsLimit = 12;
          const limitedMonthlyStats = Number.isFinite(monthsLimit) && monthsLimit > 0
            ? monthlyStats.slice(-monthsLimit)
            : monthlyStats;
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

      setStatus('success');
      if (shouldFetchMainData && shouldDeferHistoricalOnThisLoad) {
        scheduleDeferredHydration({
          runNumber,
          settings,
          workerProgressReporter,
          primaryChunkReporter: null,
          historicalChunkReporter: null,
        });
      }
      if (cachedDailyStats && (isChartsOnlyPage || isKpiOnlyPage)) {
        scheduleDeferredHydration({
          runNumber,
          settings,
          workerProgressReporter: null,
          primaryChunkReporter: null,
          historicalChunkReporter: null,
        });
      }
      if (needsEdData) {
        await renderEdDashboard(dashboardState.ed);
      }
    } catch (error) {
      const errorInfo = describeError(error, { code: 'DATA_PROCESS', message: 'Nepavyko apdoroti duomenų' });
      console.error(errorInfo.log, error);
      dashboardState.usingFallback = false;
      dashboardState.lastErrorMessage = errorInfo.userMessage;
      setStatus('error', errorInfo.userMessage);
      if (needsEdData) {
        await renderEdDashboard(dashboardState.ed);
      }
    } finally {
      dashboardState.loading = false;
      dashboardState.hasLoadedOnce = true;
      restartAutoRefreshTimer();
      if (dashboardState.queuedReload) {
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
    const initialTimeout = (activeConfig.kpi || activeConfig.charts || activeConfig.ed) ? 250 : 500;
    runAfterDomAndIdle(() => {
      if (!dashboardState.loading) {
        loadDashboard();
      }
    }, { timeout: initialTimeout });
  }

  return { loadDashboard, scheduleInitialLoad };
}
