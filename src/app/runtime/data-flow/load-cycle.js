export async function performDashboardLoadAttempt(deps) {
  const {
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
    defaultSettings,
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
  } = deps;

  let fetchMeasured = false;

  setStatus('loading', {
    message: typeof TEXT.status.loading === 'string' ? TEXT.status.loading : 'Kraunama...',
  });
  if (selectors.edStatus) {
    selectors.edStatus.textContent = '';
    setDatasetValue(selectors.edStatus, 'tone', 'info');
  }
  const cachedDailyStats = readDailyStatsFromSessionCache();
  const shouldDeferAllMainDataOnThisLoad = Boolean(isEdOnlyPage && !hydrationState.historicalHydrated);
  const shouldFetchMainData = Boolean(
    needsMainData && !cachedDailyStats && !shouldDeferAllMainDataOnThisLoad
  );
  const primaryChunkReporter = shouldFetchMainData ? createChunkReporter('Pagrindinis CSV') : null;
  const historicalChunkReporter = needsMainData ? createChunkReporter('Istorinis CSV') : null;
  const workerProgressReporter = shouldFetchMainData ? createChunkReporter('Apdorojama CSV') : null;
  const edChunkReporter = needsEdData ? createChunkReporter('ED CSV') : null;
  const shouldDeferHistoricalOnThisLoad = false;
  const shouldSkipHistoricalOnMainFetch = Boolean(
    isKpiOnlyPage || shouldDeferHistoricalOnThisLoad || disableHistoricalForPage
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
    return { shouldStop: true, fetchMeasured };
  }
  if (loadAbortController.signal.aborted) {
    return { shouldStop: true, fetchMeasured };
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
  const currentEdRenderKey = needsEdData ? computeEdRenderKey(dashboardState.ed) : '';
  const skipMainRender = Boolean(
    shouldAutoRefresh &&
      dashboardState.hasLoadedOnce &&
      currentMainSignature &&
      dashboardState.lastMainDataSignature === currentMainSignature
  );
  const skipEdRender = Boolean(
    shouldAutoRefresh &&
      dashboardState.hasLoadedOnce &&
      currentEdRenderKey &&
      dashboardState.lastEdRenderKey === currentEdRenderKey
  );
  if (needsEdData) {
    logRefreshDecision(clientConfig, 'ed', skipEdRender ? 'skipped (same-render-key)' : 'rendered', {
      hasLoadedOnce: dashboardState.hasLoadedOnce,
      signature: currentEdSignature || 'none',
      currentKey: currentEdRenderKey || 'none',
      previousKey: String(dashboardState.lastEdRenderKey || ''),
    });
  }
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
        : computeDailyStats(combinedRecords, settings?.calculations, defaultSettings));
    const primaryDaily = cachedDailyStats
      ? dailyStats.slice()
      : Array.isArray(dataset.primaryDaily) && dataset.primaryDaily.length
        ? dataset.primaryDaily
        : computeDailyStats(primaryRecords, settings?.calculations, defaultSettings);
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
      : defaultSettings.calculations.windowDays;
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
      : defaultSettings.calculations.recentDays;
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
      return { shouldStop: true, fetchMeasured };
    }

    if (activeConfig.kpi && !skipMainRender) {
      await applyKpiFiltersAndRender();
    }
    if (!isLoadTokenCurrent(loadToken)) {
      return { shouldStop: true, fetchMeasured };
    }

    if (activeConfig.recent && !skipMainRender) {
      renderRecentTable(recentDailyStats);
    }

    if ((activeConfig.monthly || activeConfig.yearly) && !skipMainRender) {
      const summaryDailyStats =
        Array.isArray(dailyStats) && dailyStats.length ? dailyStats : dashboardState.dailyStats;
      const monthlyStats = computeMonthlyStats(summaryDailyStats);
      dashboardState.monthly.all = monthlyStats;
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
    return { shouldStop: true, fetchMeasured };
  }

  const latestDataDate =
    Array.isArray(dailyStats) && dailyStats.length
      ? String(dailyStats[dailyStats.length - 1]?.date || '')
      : '';
  const usingCache = Boolean(
    dataset?.meta?.primary?.fromCache || dataset?.meta?.historical?.fromCache || cachedDailyStats
  );
  setStatus('success', {
    updatedAt: new Date(),
    latestDataDate: latestDataDate || undefined,
    usingCache,
  });
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
  if (currentEdRenderKey) {
    dashboardState.lastEdRenderKey = currentEdRenderKey;
  }
  if (!isLoadTokenCurrent(loadToken)) {
    return { shouldStop: true, fetchMeasured };
  }

  return { shouldStop: false, fetchMeasured };
}
