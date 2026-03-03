export async function renderChartsPrimaryStage(deps, scopedCharts) {
  const primaryRenderer =
    typeof deps.renderChartsPrimary === 'function'
      ? deps.renderChartsPrimary
      : async (daily, funnel) => deps.renderCharts(daily, funnel, null);
  const handle = deps.startPerfStage('charts-primary-render');
  try {
    await primaryRenderer(scopedCharts?.daily, scopedCharts?.funnel);
    deps.ensureChartsStartupState();
    deps.dashboardState.chartsStartupPhases.primaryVisible = true;
    deps.dashboardState.chartsFirstVisibleAt = Date.now();
    if (typeof deps.onPrimaryVisible === 'function') {
      deps.onPrimaryVisible({ scope: 'charts' });
    }
  } finally {
    deps.finishPerfStage(handle);
  }
}

export function scheduleChartsSecondaryAndHospitalRender(deps, { reason = 'load' } = {}) {
  if (!deps.activeConfig.charts) {
    return;
  }
  if (typeof deps.scheduleChartsSecondaryRender === 'function') {
    deps.scheduleChartsSecondaryRender({ reason });
    return;
  }
  deps.ensureChartsStartupState();
  deps.dashboardState.chartsDeferredRenderToken =
    Number(deps.dashboardState.chartsDeferredRenderToken || 0) + 1;
  const token = deps.dashboardState.chartsDeferredRenderToken;
  deps.dashboardState.chartsDeferredRenderReason = reason;
  if (deps.dashboardState.chartsSecondaryRenderScheduled) {
    return;
  }
  deps.dashboardState.chartsSecondaryRenderScheduled = true;
  deps.runAfterDomAndIdle(
    async () => {
      deps.dashboardState.chartsSecondaryRenderScheduled = false;
      if (token !== deps.dashboardState.chartsDeferredRenderToken) {
        scheduleChartsSecondaryAndHospitalRender(deps, {
          reason: deps.dashboardState.chartsDeferredRenderReason || reason,
        });
        return;
      }
      const secondaryHandle = deps.startPerfStage('charts-secondary-render', { priežastis: reason });
      try {
        if (typeof deps.renderChartsSecondary === 'function') {
          await deps.renderChartsSecondary({
            heatmapData: typeof deps.getHeatmapData === 'function' ? deps.getHeatmapData() : null,
            allowReuse: true,
          });
        } else {
          const scopedCharts = deps.prepareChartDataForPeriod(deps.dashboardState.chartPeriod);
          const heatmapData =
            typeof deps.getHeatmapData === 'function' ? deps.getHeatmapData() : scopedCharts.heatmap;
          await deps.renderCharts(scopedCharts.daily, scopedCharts.funnel, heatmapData);
        }
        deps.dashboardState.chartsStartupPhases.secondaryComplete = true;
        if (typeof deps.onSecondaryComplete === 'function') {
          deps.onSecondaryComplete({ scope: 'charts', reason });
        }
        deps.markBrowserMetric('app-charts-secondary-complete');
        deps.dispatchChartsLifecycleEvent('app:charts-secondary-complete', {
          loadCounter: deps.dashboardState.loadCounter,
        });
      } catch (_error) {
        // section-level renderer errors are already handled downstream
      } finally {
        deps.finishPerfStage(secondaryHandle);
      }

      if (deps.dashboardState.chartsHospitalRenderScheduled) {
        return;
      }
      deps.dashboardState.chartsHospitalRenderScheduled = true;
      deps.runAfterDomAndIdle(
        () => {
          deps.dashboardState.chartsHospitalRenderScheduled = false;
          if (token !== deps.dashboardState.chartsDeferredRenderToken) {
            return;
          }
          const hospitalHandle = deps.startPerfStage('charts-hospital-table-render', {
            priežastis: reason,
          });
          try {
            deps.renderChartsHospitalTable(deps.dashboardState.rawRecords);
            deps.dashboardState.chartsStartupPhases.hospitalRendered = true;
          } finally {
            deps.finishPerfStage(hospitalHandle);
          }
        },
        { timeout: 1800 }
      );
    },
    { timeout: 1200 }
  );
}

export async function applyHydratedMainDataset(
  deps,
  { dataset, runNumber, settings, chartsReason = 'hydrate' }
) {
  if (!dataset || deps.dashboardState.loading || runNumber !== deps.dashboardState.loadCounter) {
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
      : deps.computeDailyStats(combinedRecords, settings?.calculations, deps.defaultSettings);
  const primaryDaily =
    Array.isArray(dataset.primaryDaily) && dataset.primaryDaily.length
      ? dataset.primaryDaily
      : deps.computeDailyStats(primaryRecords, settings?.calculations, deps.defaultSettings);

  deps.dashboardState.rawRecords = combinedRecords;
  deps.dashboardState.dailyStats = dailyStats;
  deps.dashboardState.primaryRecords = primaryRecords.slice();
  deps.dashboardState.primaryDaily = primaryDaily.slice();
  deps.dashboardState.chartsHospitalTableWorkerAgg = dataset.hospitalByDeptStayAgg || null;
  deps.dashboardState.dataMeta = dataset.meta || null;
  if (deps.dashboardState.mainData && typeof deps.dashboardState.mainData === 'object') {
    const recordsState = String(dataset?.meta?.recordsState || '');
    deps.dashboardState.mainData.recordsHydrationState =
      recordsState === 'deferred' ? 'deferred' : combinedRecords.length > 0 ? 'full' : 'none';
    deps.dashboardState.mainData.deferredHydration = dataset?.deferredHydration || null;
  }

  if (deps.activeConfig.charts) {
    deps.dashboardState.chartData.baseDaily = dailyStats;
    deps.dashboardState.chartData.baseRecords = combinedRecords;
    deps.dashboardState.chartFilters = deps.sanitizeChartFilters(deps.dashboardState.chartFilters, {
      getDefaultChartFilters: deps.getDefaultChartFilters,
      KPI_FILTER_LABELS: deps.KPI_FILTER_LABELS,
    });
    deps.syncChartFilterControls();
    deps.populateChartYearOptions(dailyStats);
    if (typeof deps.populateChartsHospitalTableYearOptions === 'function') {
      deps.populateChartsHospitalTableYearOptions(combinedRecords);
    }
    deps.populateHourlyCompareYearOptions(dailyStats);
    if (typeof deps.populateHeatmapYearOptions === 'function') {
      deps.populateHeatmapYearOptions(dailyStats);
      if (typeof deps.syncHeatmapFilterControls === 'function') {
        deps.syncHeatmapFilterControls();
      }
    }
    const prepareHandle = deps.startPerfStage('charts-main-prepare', { etapas: chartsReason });
    const scopedCharts = deps.prepareChartDataForPeriod(deps.dashboardState.chartPeriod);
    deps.finishPerfStage(prepareHandle);
    await deps.renderChartsPrimaryStage(scopedCharts);
    deps.scheduleChartsSecondaryAndHospitalRender({ reason: chartsReason });
  }
  if (deps.activeConfig.kpi) {
    await deps.applyKpiFiltersAndRender();
  }
  if (deps.activeConfig.recent) {
    const windowDays = Number.isFinite(Number(settings.calculations.windowDays))
      ? Number(settings.calculations.windowDays)
      : deps.defaultSettings.calculations.windowDays;
    const lastWindowDailyStats = deps.filterDailyStatsByWindow(dailyStats, windowDays);
    const recentWindowDays = Number.isFinite(Number(settings.calculations.recentDays))
      ? Number(settings.calculations.recentDays)
      : deps.defaultSettings.calculations.recentDays;
    const effectiveRecentDays = Math.max(1, Math.min(windowDays, recentWindowDays));
    const recentDailyStats = deps.filterDailyStatsByWindow(lastWindowDailyStats, effectiveRecentDays);
    deps.renderRecentTable(recentDailyStats);
  }
  if (deps.activeConfig.ed && deps.dashboardState.ed) {
    await deps.renderEdDashboard(deps.dashboardState.ed);
  }
  deps.writeDailyStatsToSessionCache(dailyStats, { scope: 'full' });
  return true;
}

export async function hydrateDeferredFullRecords(deps, { runNumber, settings, deferredHydration }) {
  if (
    !deps.supportsDeferredFullRecordsMainHydration ||
    !deps.pageRequiresFullRecordsForInteractions ||
    deps.hydrationState.fullRecordsHydrationInFlight ||
    deps.hydrationState.fullRecordsHydrated ||
    !deferredHydration ||
    typeof deferredHydration.hydrate !== 'function'
  ) {
    return;
  }
  if (
    deps.hydrationState.activeFullRecordsHydrationAbortController &&
    !deps.hydrationState.activeFullRecordsHydrationAbortController.signal.aborted
  ) {
    deps.hydrationState.activeFullRecordsHydrationAbortController.abort();
  }
  const hydrationController = new AbortController();
  deps.hydrationState.activeFullRecordsHydrationAbortController = hydrationController;
  deps.hydrationState.fullRecordsHydrationInFlight = true;
  try {
    const dataset = await deferredHydration.hydrate({
      signal: hydrationController.signal,
      skipHistorical: true,
    });
    const applied = await deps.applyHydratedMainDataset({
      dataset,
      runNumber,
      settings,
      chartsReason: 'full-records-hydrate',
    });
    if (applied) {
      deps.hydrationState.fullRecordsHydrated = true;
    }
  } catch (error) {
    if (deps.isAbortError(error)) {
      return;
    }
    const errorInfo = deps.describeError(error, { code: 'MAIN_FULL_RECORDS_HYDRATE' });
    console.warn(errorInfo.log, error);
  } finally {
    deps.hydrationState.fullRecordsHydrationInFlight = false;
    if (deps.hydrationState.activeFullRecordsHydrationAbortController === hydrationController) {
      deps.hydrationState.activeFullRecordsHydrationAbortController = null;
    }
  }
}

export function scheduleDeferredFullRecordsHydration(deps, { runNumber, settings, deferredHydration }) {
  if (
    deps.hydrationState.deferredFullRecordsHydrationQueued ||
    deps.hydrationState.fullRecordsHydrationInFlight ||
    deps.hydrationState.fullRecordsHydrated ||
    !deferredHydration ||
    typeof deferredHydration.hydrate !== 'function'
  ) {
    return;
  }
  deps.hydrationState.deferredFullRecordsHydrationQueued = true;
  const execute = () => {
    deps.hydrationState.deferredFullRecordsHydrationQueued = false;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    if (typeof deps.hydrateDeferredFullRecords === 'function') {
      void deps.hydrateDeferredFullRecords({ runNumber, settings, deferredHydration });
      return;
    }
    void hydrateDeferredFullRecords(deps, { runNumber, settings, deferredHydration });
  };
  const hydrationTimeout = deps.isKpiOnlyPage ? 150 : 600;
  deps.runAfterDomAndIdle(execute, { timeout: hydrationTimeout });
}

export async function hydrateWithHistoricalData(
  deps,
  { runNumber, settings, workerProgressReporter, primaryChunkReporter, historicalChunkReporter }
) {
  if (
    !deps.supportsDeferredMainHydration ||
    deps.hydrationState.historicalHydrationInFlight ||
    deps.hydrationState.historicalHydrated
  ) {
    return;
  }
  if (
    deps.hydrationState.activeHydrationAbortController &&
    !deps.hydrationState.activeHydrationAbortController.signal.aborted
  ) {
    deps.hydrationState.activeHydrationAbortController.abort();
  }
  const hydrationController = new AbortController();
  deps.hydrationState.activeHydrationAbortController = hydrationController;
  deps.hydrationState.historicalHydrationInFlight = true;
  try {
    const skipHistoricalForHydration = Boolean(deps.isEdOnlyPage);
    const dataset = await deps.fetchData({
      onPrimaryChunk: primaryChunkReporter,
      onHistoricalChunk: historicalChunkReporter,
      onWorkerProgress: workerProgressReporter,
      skipHistorical: skipHistoricalForHydration,
      includeYearlyStats: !deps.activeConfig.charts,
      signal: hydrationController.signal,
    });
    const applied = await deps.applyHydratedMainDataset({
      dataset,
      runNumber,
      settings,
      chartsReason: 'hydrate',
    });
    if (applied) {
      deps.hydrationState.historicalHydrated = true;
    }
  } catch (error) {
    if (deps.isAbortError(error)) {
      return;
    }
    const errorInfo = deps.describeError(error, { code: 'CHART_HISTORICAL_HYDRATE' });
    console.warn(errorInfo.log, error);
  } finally {
    deps.hydrationState.historicalHydrationInFlight = false;
    if (deps.hydrationState.activeHydrationAbortController === hydrationController) {
      deps.hydrationState.activeHydrationAbortController = null;
    }
  }
}

export function scheduleDeferredHydration(
  deps,
  { runNumber, settings, workerProgressReporter, primaryChunkReporter, historicalChunkReporter }
) {
  if (
    deps.hydrationState.deferredHydrationQueued ||
    deps.hydrationState.historicalHydrationInFlight ||
    deps.hydrationState.historicalHydrated
  ) {
    return;
  }
  deps.hydrationState.deferredHydrationQueued = true;

  const execute = () => {
    deps.hydrationState.deferredHydrationQueued = false;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    if (
      deps.hydrationState.fullRecordsHydrationInFlight ||
      deps.hydrationState.deferredFullRecordsHydrationQueued
    ) {
      scheduleDeferredHydration(deps, {
        runNumber,
        settings,
        workerProgressReporter,
        primaryChunkReporter,
        historicalChunkReporter,
      });
      return;
    }
    if (typeof deps.hydrateWithHistoricalData === 'function') {
      void deps.hydrateWithHistoricalData({
        runNumber,
        settings,
        workerProgressReporter,
        primaryChunkReporter,
        historicalChunkReporter,
      });
      return;
    }
    void hydrateWithHistoricalData(deps, {
      runNumber,
      settings,
      workerProgressReporter,
      primaryChunkReporter,
      historicalChunkReporter,
    });
  };

  deps.runAfterDomAndIdle(execute, { timeout: 1800 });
}

export function scheduleInitialLoad(deps) {
  if (deps.isKpiOnlyPage || deps.isChartsOnlyPage || deps.isYearlyOnlyPage) {
    const runInitialKpiLoad = () => {
      if (!deps.dashboardState.loading) {
        void deps.loadDashboard();
      }
    };
    if (typeof document !== 'undefined' && document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runInitialKpiLoad, { once: true });
    } else {
      runInitialKpiLoad();
    }
    return;
  }
  const initialTimeout =
    deps.activeConfig.kpi || deps.activeConfig.charts || deps.activeConfig.ed ? 250 : 500;
  deps.runAfterDomAndIdle(
    () => {
      if (!deps.dashboardState.loading) {
        void deps.loadDashboard();
      }
    },
    { timeout: initialTimeout }
  );
}
