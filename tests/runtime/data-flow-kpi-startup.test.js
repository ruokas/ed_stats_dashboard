import { describe, expect, it, vi } from 'vitest';

import { createDataFlow } from '../../src/app/runtime/data-flow.js';

function createKpiDashboardState() {
  return {
    loading: false,
    queuedReload: false,
    hasLoadedOnce: false,
    loadCounter: 0,
    usingFallback: false,
    lastErrorMessage: '',
    lastMainDataSignature: '',
    lastEdDataSignature: '',
    rawRecords: [],
    dailyStats: [],
    primaryRecords: [],
    primaryDaily: [],
    charts: {},
    chartData: {
      baseDaily: [],
      baseRecords: [],
      filteredDaily: [],
      filteredRecords: [],
      filteredWindowRecords: [],
      dailyWindow: [],
      funnel: null,
      heatmap: null,
      cache: {},
    },
    kpi: {
      filters: { window: 0, shift: 'all', arrival: 'all', disposition: 'all', cardType: 'all' },
      selectedDate: null,
    },
    feedback: { records: [], lastErrorMessage: '', usingFallback: false },
    ed: null,
    monthly: { all: [], window: [] },
    mainData: {},
  };
}

function createDataset() {
  const records = [{ id: 1, year: 2024 }];
  const dailyStats = [
    {
      date: '2024-01-01',
      count: 1,
      night: 0,
      ems: 0,
      discharged: 0,
      hospitalized: 0,
      totalTime: 0,
      durations: 0,
      hospitalizedTime: 0,
      hospitalizedDurations: 0,
    },
  ];
  return {
    records,
    primaryRecords: records,
    dailyStats,
    primaryDaily: dailyStats,
    hospitalByDeptStayAgg: null,
    meta: { primary: {}, historical: {}, sources: [], recordsState: 'full' },
  };
}

describe('createDataFlow KPI startup scheduling', () => {
  it('starts KPI-only initial load immediately without runAfterDomAndIdle delay', async () => {
    const runAfterDomAndIdle = vi.fn();
    const fetchData = vi.fn(async () => createDataset());
    const applyKpiFiltersAndRender = vi.fn(async () => {});
    const setStatus = vi.fn();
    const flow = createDataFlow({
      pageConfig: { kpi: true },
      selectors: {},
      dashboardState: createKpiDashboardState(),
      TEXT: { status: { error: 'Klaida' }, ed: { status: { error: () => '' } } },
      DEFAULT_SETTINGS: { calculations: { windowDays: 30, recentDays: 7 } },
      AUTO_REFRESH_INTERVAL_MS: 60000,
      uiHooks: {
        runAfterDomAndIdle,
        setDatasetValue: () => {},
        setStatus,
        getSettings: () => ({ calculations: { windowDays: 30, recentDays: 7 } }),
        getClientConfig: () => ({ profilingEnabled: false }),
        getAutoRefreshTimerId: () => null,
        setAutoRefreshTimerId: () => {},
      },
      kpiHooks: {
        showKpiSkeleton: () => {},
        syncKpiFilterControls: () => {},
        applyKpiFiltersAndRender,
        initializeDefaultWindow: () => {},
      },
      dataHooks: {
        createChunkReporter: () => null,
        fetchData,
        fetchFeedbackData: async () => [],
        fetchEdData: async () => null,
        describeCacheMeta: () => ({}),
        describeError: (error, options = {}) => ({
          log: options.code || 'ERR',
          userMessage: options.message || String(error?.message || 'klaida'),
        }),
        computeDailyStats: () => [],
        filterDailyStatsByWindow: (daily) => daily,
        mergeDailyStatsSeries: (seriesList) => (Array.isArray(seriesList) ? seriesList.flat() : []),
        renderRecentTable: () => {},
        computeMonthlyStats: () => [],
        renderMonthlyTable: () => {},
        computeYearlyStats: () => [],
        renderYearlyTable: () => {},
      },
    });

    flow.scheduleInitialLoad();
    expect(runAfterDomAndIdle).not.toHaveBeenCalled();
    expect(fetchData).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchData).toHaveBeenCalledTimes(1);
    expect(applyKpiFiltersAndRender).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith(
      'loading',
      expect.objectContaining({ message: expect.any(String) })
    );
    expect(setStatus).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({ updatedAt: expect.any(Date) })
    );
  });
});
