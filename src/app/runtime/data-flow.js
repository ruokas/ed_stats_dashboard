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
  applyKpiFiltersAndRender,
  renderCharts,
  renderChartsHospitalTable,
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
  const isEdOnlyPage = Boolean(
    activeConfig.ed
    && !activeConfig.kpi
    && !activeConfig.charts
    && !activeConfig.recent
    && !activeConfig.monthly
    && !activeConfig.yearly
    && !activeConfig.feedback,
  );
  const supportsDeferredMainHydration = Boolean(isKpiOnlyPage || isEdOnlyPage);
  const disableHistoricalForPage = Boolean(isEdOnlyPage);
  const canUseDailyStatsCache = Boolean(canUseDailyStatsCacheOnly);
  let historicalHydrationInFlight = false;
  let historicalHydrated = false;
  let visibilityHandlersBound = false;
  let deferredHydrationQueued = false;
  let lastIssuedLoadToken = 0;
  let activeLoadAbortController = null;
  let activeHydrationAbortController = null;

  function isLoadTokenCurrent(token) {
    return Number.isFinite(token) && token === lastIssuedLoadToken;
  }

  function isAbortError(error) {
    return Boolean(error && typeof error === 'object' && error.name === 'AbortError');
  }

  function computeMainDataSignature(dataset, cachedDailyStats) {
    if (cachedDailyStats) {
      return `session:${Array.isArray(cachedDailyStats) ? cachedDailyStats.length : 0}`;
    }
    const primarySignature = dataset?.meta?.primary?.signature || dataset?.meta?.primary?.etag || dataset?.meta?.primary?.lastModified || '';
    const historicalSignature = dataset?.meta?.historical?.signature || dataset?.meta?.historical?.etag || dataset?.meta?.historical?.lastModified || '';
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
        signal: hydrationController.signal,
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
      dashboardState.chartsHospitalTableWorkerAgg = dataset.hospitalByDeptStayAgg || null;
      dashboardState.dataMeta = dataset.meta || null;
      if (activeConfig.charts) {
        dashboardState.chartData.baseDaily = dailyStats.slice();
        dashboardState.chartData.baseRecords = combinedRecords.slice();
        dashboardState.chartFilters = sanitizeChartFilters(dashboardState.chartFilters, { getDefaultChartFilters, KPI_FILTER_LABELS });
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
        const scopedCharts = prepareChartDataForPeriod(dashboardState.chartPeriod);
        const heatmapData = typeof getHeatmapData === 'function' ? getHeatmapData() : scopedCharts.heatmap;
        await renderCharts(scopedCharts.daily, scopedCharts.funnel, heatmapData);
        if (typeof renderChartsHospitalTable === 'function') {
          renderChartsHospitalTable(combinedRecords);
        }
      }
      if (activeConfig.kpi) {
        await applyKpiFiltersAndRender();
      }
      if (activeConfig.ed && dashboardState.ed) {
        await renderEdDashboard(dashboardState.ed);
      }
      writeDailyStatsToSessionCache(dailyStats, { scope: 'full' });
      historicalHydrated = true;
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
    const loadToken = (lastIssuedLoadToken += 1);
    dashboardState.activeLoadToken = loadToken;
    if (activeHydrationAbortController && !activeHydrationAbortController.signal.aborted) {
      activeHydrationAbortController.abort();
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
      const shouldDeferAllMainDataOnThisLoad = Boolean(isEdOnlyPage && !historicalHydrated);
      const shouldFetchMainData = Boolean(needsMainData && !cachedDailyStats && !shouldDeferAllMainDataOnThisLoad);
      const primaryChunkReporter = shouldFetchMainData ? createChunkReporter('Pagrindinis CSV') : null;
      const historicalChunkReporter = needsMainData ? createChunkReporter('Istorinis CSV') : null;
      const workerProgressReporter = shouldFetchMainData ? createChunkReporter('Apdorojama CSV') : null;
      const edChunkReporter = needsEdData ? createChunkReporter('ED CSV') : null;
      const shouldDeferHistoricalOnThisLoad = Boolean(isKpiOnlyPage);
      const shouldSkipHistoricalOnMainFetch = Boolean(shouldDeferHistoricalOnThisLoad || disableHistoricalForPage);
      const [dataResult, feedbackResult, edResult] = await Promise.allSettled([
        shouldFetchMainData
          ? fetchData({
              onPrimaryChunk: primaryChunkReporter,
              onHistoricalChunk: historicalChunkReporter,
              onWorkerProgress: workerProgressReporter,
              skipHistorical: shouldSkipHistoricalOnMainFetch,
              signal: loadAbortController.signal,
            })
          : Promise.resolve(null),
        needsFeedbackData ? fetchFeedbackData({ signal: loadAbortController.signal }) : Promise.resolve([]),
        needsEdData ? fetchEdData({ onChunk: edChunkReporter, signal: loadAbortController.signal }) : Promise.resolve(null),
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
      if (shouldFetchMainData && dataResult.status !== 'fulfilled') {
        throw dataResult.reason;
      }

      const hasMainDataPayload = Boolean(
        cachedDailyStats
        || (shouldFetchMainData && dataResult.status === 'fulfilled'),
      );
      const dataset = hasMainDataPayload && !cachedDailyStats ? (dataResult.value || {}) : {};
      const feedbackRecords = needsFeedbackData && feedbackResult.status === 'fulfilled' ? feedbackResult.value : [];
      const currentMainSignature = (needsMainData && hasMainDataPayload)
        ? computeMainDataSignature(dataset, cachedDailyStats)
        : '';
      const currentEdSignature = needsEdData ? (dashboardState.ed?.meta?.signature || '') : '';
      const skipMainRender = Boolean(
        shouldAutoRefresh
        && dashboardState.hasLoadedOnce
        && currentMainSignature
        && dashboardState.lastMainDataSignature === currentMainSignature,
      );
      const skipEdRender = Boolean(
        shouldAutoRefresh
        && dashboardState.hasLoadedOnce
        && currentEdSignature
        && dashboardState.lastEdDataSignature === currentEdSignature,
      );
      if (needsFeedbackData && feedbackResult.status === 'rejected') {
        const errorInfo = describeError(feedbackResult.reason, { code: 'FEEDBACK_DATA', message: TEXT.status.error });
        console.error(errorInfo.log, feedbackResult.reason);
        if (!dashboardState.feedback.lastErrorMessage) {
          dashboardState.feedback.lastErrorMessage = errorInfo.userMessage;
        }
        dashboardState.feedback.usingFallback = false;
      }

      let dailyStats = [];
      if (needsMainData && hasMainDataPayload) {
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
        dashboardState.chartsHospitalTableWorkerAgg = dataset.hospitalByDeptStayAgg || null;
        dashboardState.dataMeta = dataset.meta || null;
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
          if (typeof renderChartsHospitalTable === 'function') {
            renderChartsHospitalTable(combinedRecords);
          }
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
      if (!isLoadTokenCurrent(loadToken)) {
        return;
      }

      setStatus('success');
      if (
        (shouldFetchMainData && shouldDeferHistoricalOnThisLoad)
        || shouldDeferAllMainDataOnThisLoad
      ) {
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
    const initialTimeout = (activeConfig.kpi || activeConfig.charts || activeConfig.ed) ? 250 : 500;
    runAfterDomAndIdle(() => {
      if (!dashboardState.loading) {
        loadDashboard();
      }
    }, { timeout: initialTimeout });
  }

  return { loadDashboard, scheduleInitialLoad };
}
