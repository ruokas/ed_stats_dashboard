export function createDataFlow({
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
  function restartAutoRefreshTimer() {
    const currentTimerId = getAutoRefreshTimerId();
    if (currentTimerId) {
      window.clearInterval(currentTimerId);
    }
    const nextTimerId = window.setInterval(() => {
      loadDashboard();
    }, AUTO_REFRESH_INTERVAL_MS);
    setAutoRefreshTimerId(nextTimerId);
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
    if (shouldShowSkeletons && (!selectors.kpiGrid || !selectors.kpiGrid.children.length)) {
      showKpiSkeleton();
    }
    const chartsInitialized = dashboardState.charts.daily
      || dashboardState.charts.dow
      || dashboardState.charts.dowStay
      || dashboardState.charts.funnel;
    if (shouldShowSkeletons && !chartsInitialized) {
      showChartSkeletons();
    }
    if (shouldShowSkeletons && (!selectors.edCards || !selectors.edCards.children.length)) {
      showEdSkeleton();
    }

    try {
      setStatus('loading');
      if (selectors.edStatus) {
        selectors.edStatus.textContent = TEXT.ed.status.loading;
        setDatasetValue(selectors.edStatus, 'tone', 'info');
      }
      const primaryChunkReporter = createChunkReporter('Pagrindinis CSV');
      const historicalChunkReporter = createChunkReporter('Istorinis CSV');
      const workerProgressReporter = createChunkReporter('Apdorojama CSV');
      const edChunkReporter = createChunkReporter('ED CSV');
      const [dataResult, feedbackResult, edResult] = await Promise.allSettled([
        fetchData({
          onPrimaryChunk: primaryChunkReporter,
          onHistoricalChunk: historicalChunkReporter,
          onWorkerProgress: workerProgressReporter,
        }),
        fetchFeedbackData(),
        fetchEdData({ onChunk: edChunkReporter }),
      ]);

      if (clientConfig.profilingEnabled && fetchHandle) {
        const primaryCache = dataResult.status === 'fulfilled'
          ? describeCacheMeta(dataResult.value?.meta?.primary)
          : 'klaida';
        const historicalCache = dataResult.status === 'fulfilled'
          ? describeCacheMeta(dataResult.value?.meta?.historical)
          : 'klaida';
        fetchSummary.pagrindinis = primaryCache;
        fetchSummary.istorinis = historicalCache;
        perfMonitor.finish(fetchHandle, {
          pagrindinis: primaryCache,
          istorinis: historicalCache,
          fallbackas: dashboardState.usingFallback,
          šaltiniai: dataResult.status === 'fulfilled' ? dataResult.value?.meta?.sources?.length || 0 : 0,
        });
        fetchMeasured = true;
      }

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
      if (dataResult.status !== 'fulfilled') {
        throw dataResult.reason;
      }

      const dataset = dataResult.value || {};
      const feedbackRecords = feedbackResult.status === 'fulfilled' ? feedbackResult.value : [];
      if (feedbackResult.status === 'rejected') {
        const errorInfo = describeError(feedbackResult.reason, { code: 'FEEDBACK_DATA', message: TEXT.status.error });
        console.error(errorInfo.log, feedbackResult.reason);
        if (!dashboardState.feedback.lastErrorMessage) {
          dashboardState.feedback.lastErrorMessage = errorInfo.userMessage;
        }
        dashboardState.feedback.usingFallback = false;
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
      populateChartYearOptions(dailyStats);
      populateHourlyCompareYearOptions(dailyStats);
      if (typeof populateHeatmapYearOptions === 'function') {
        populateHeatmapYearOptions(dailyStats);
        if (typeof syncHeatmapFilterControls === 'function') {
          syncHeatmapFilterControls();
        }
      }
      const windowDays = Number.isFinite(Number(settings.calculations.windowDays))
        ? Number(settings.calculations.windowDays)
        : DEFAULT_SETTINGS.calculations.windowDays;
      if (!Number.isFinite(dashboardState.kpi.filters.window) || dashboardState.kpi.filters.window <= 0) {
        dashboardState.kpi.filters.window = windowDays;
        syncKpiFilterControls();
      }
      const lastWindowDailyStats = filterDailyStatsByWindow(dailyStats, windowDays);
      const recentWindowDays = Number.isFinite(Number(settings.calculations.recentDays))
        ? Number(settings.calculations.recentDays)
        : DEFAULT_SETTINGS.calculations.recentDays;
      const effectiveRecentDays = Math.max(1, Math.min(windowDays, recentWindowDays));
      const recentDailyStats = filterDailyStatsByWindow(lastWindowDailyStats, effectiveRecentDays);
      dashboardState.chartData.baseDaily = dailyStats.slice();
      dashboardState.chartData.baseRecords = combinedRecords.slice();
      dashboardState.chartFilters = sanitizeChartFilters(dashboardState.chartFilters, { getDefaultChartFilters, KPI_FILTER_LABELS });
      syncChartFilterControls();
      const scopedCharts = prepareChartDataForPeriod(dashboardState.chartPeriod);
      const heatmapData = typeof getHeatmapData === 'function' ? getHeatmapData() : scopedCharts.heatmap;
      await applyKpiFiltersAndRender();
      await renderCharts(scopedCharts.daily, scopedCharts.funnel, heatmapData);
      renderRecentTable(recentDailyStats);
      const monthlyStats = computeMonthlyStats(dashboardState.dailyStats);
      dashboardState.monthly.all = monthlyStats;
      // Rodyti paskutinius 12 kalendorinių mėnesių, nepriklausomai nuo KPI lango filtro.
      const monthsLimit = 12;
      const limitedMonthlyStats = Number.isFinite(monthsLimit) && monthsLimit > 0
        ? monthlyStats.slice(-monthsLimit)
        : monthlyStats;
      renderMonthlyTable(limitedMonthlyStats);
      dashboardState.monthly.window = limitedMonthlyStats;
      const datasetYearlyStats = Array.isArray(dataset.yearlyStats) ? dataset.yearlyStats : null;
      const yearlyStats = datasetYearlyStats && datasetYearlyStats.length
        ? datasetYearlyStats
        : computeYearlyStats(monthlyStats);
      renderYearlyTable(yearlyStats);
      dashboardState.feedback.records = Array.isArray(feedbackRecords) ? feedbackRecords : [];
      updateFeedbackFilterOptions(dashboardState.feedback.records);
      const feedbackStats = applyFeedbackFiltersAndRender();
      const edSummaryForComments = dashboardState.ed.summary || createEmptyEdSummary(dashboardState.ed?.meta?.type);
      const feedbackComments = Array.isArray(feedbackStats?.summary?.comments)
        ? feedbackStats.summary.comments
        : [];
      const now = new Date();
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 30);
      const recentFeedbackComments = feedbackComments.filter((entry) => {
        if (!(entry?.receivedAt instanceof Date) || Number.isNaN(entry.receivedAt.getTime())) {
          return false;
        }
        return entry.receivedAt >= cutoff;
      });
      edSummaryForComments.feedbackComments = recentFeedbackComments;
      const commentsMeta = recentFeedbackComments.length
        ? `Komentarai (30 d.): ${numberFormatter.format(recentFeedbackComments.length)}`
        : '';
      edSummaryForComments.feedbackCommentsMeta = commentsMeta;
      dashboardState.ed.summary = edSummaryForComments;
      setStatus('success');
      applyFeedbackStatusNote();
      await renderEdDashboard(dashboardState.ed);
    } catch (error) {
      const errorInfo = describeError(error, { code: 'DATA_PROCESS', message: 'Nepavyko apdoroti duomenų' });
      console.error(errorInfo.log, error);
      dashboardState.usingFallback = false;
      dashboardState.lastErrorMessage = errorInfo.userMessage;
      setStatus('error', errorInfo.userMessage);
      await renderEdDashboard(dashboardState.ed);
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
    runAfterDomAndIdle(() => {
      if (!dashboardState.loading) {
        loadDashboard();
      }
    }, { timeout: 800 });
  }

  return { loadDashboard, scheduleInitialLoad };
}
