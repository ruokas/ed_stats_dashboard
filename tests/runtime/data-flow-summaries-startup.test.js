import { describe, expect, it, vi } from 'vitest';

import { createDataFlow } from '../../src/app/runtime/data-flow.js';

function createDashboardState() {
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
    chartData: { cache: {} },
    kpi: { filters: { window: 0 } },
    feedback: { records: [], lastErrorMessage: '', usingFallback: false },
    ed: null,
    monthly: { all: [], window: [] },
    yearly: { all: [] },
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
    meta: { primary: {}, historical: {}, sources: [] },
  };
}

describe('createDataFlow summaries startup scheduling', () => {
  it('starts yearly-only initial load immediately without generic idle delay', async () => {
    const runAfterDomAndIdle = vi.fn();
    const fetchData = vi.fn(async () => createDataset());
    const renderYearlyTable = vi.fn();
    const setStatus = vi.fn();
    const flow = createDataFlow({
      pageConfig: { yearly: true },
      selectors: {},
      dashboardState: createDashboardState(),
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
        renderYearlyTable,
      },
    });

    flow.scheduleInitialLoad();

    expect(runAfterDomAndIdle).not.toHaveBeenCalled();
    expect(fetchData).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(setStatus).toHaveBeenCalledWith(
      'loading',
      expect.objectContaining({ message: expect.any(String) })
    );
    expect(setStatus).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({ updatedAt: expect.any(Date) })
    );
    expect(renderYearlyTable).toHaveBeenCalledTimes(1);
  });

  it('loads summaries from daily-lite first and hydrates historical data on demand', async () => {
    const idleQueue = [];
    const runAfterDomAndIdle = vi.fn((fn) => {
      idleQueue.push(fn);
    });
    const dailyLiteDataset = {
      records: [],
      primaryRecords: [],
      dailyStats: [
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
      ],
      primaryDaily: [
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
      ],
      hospitalByDeptStayAgg: null,
      meta: {
        primary: { signature: 'sig-1' },
        historical: { signature: 'hist-sig-1' },
        sources: [{ id: 'primary' }, { id: 'historical' }],
        recordsState: 'none',
        fetchProfile: 'daily-lite',
      },
    };
    const hydratedDataset = createDataset();
    const fetchData = vi.fn().mockResolvedValueOnce(dailyLiteDataset).mockResolvedValueOnce(hydratedDataset);
    const renderRecentTable = vi.fn();
    const renderYearlyTable = vi.fn();
    const dashboardState = createDashboardState();
    const flow = createDataFlow({
      pageConfig: { recent: true, yearly: true },
      selectors: {},
      dashboardState,
      TEXT: { status: { error: 'Klaida' }, ed: { status: { error: () => '' } } },
      DEFAULT_SETTINGS: { calculations: { windowDays: 30, recentDays: 7 } },
      AUTO_REFRESH_INTERVAL_MS: 60000,
      uiHooks: {
        runAfterDomAndIdle,
        setDatasetValue: () => {},
        setStatus: () => {},
        getSettings: () => ({ calculations: { windowDays: 30, recentDays: 7 } }),
        getClientConfig: () => ({ profilingEnabled: false }),
        getAutoRefreshTimerId: () => null,
        setAutoRefreshTimerId: () => {},
      },
      dataHooks: {
        createChunkReporter: () => null,
        fetchData,
        fetchProfile: 'daily-lite',
        supportsDeferredHistoricalHydration: true,
        autoScheduleDeferredHistoricalHydration: false,
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
        renderRecentTable,
        computeMonthlyStats: () => [],
        renderMonthlyTable: () => {},
        computeYearlyStats: () => [],
        renderYearlyTable,
      },
    });

    await flow.loadDashboard();

    expect(fetchData).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fetchProfile: 'daily-lite',
        includeYearlyStats: true,
        skipHistorical: false,
      })
    );
    expect(renderRecentTable).toHaveBeenCalledTimes(1);
    expect(renderYearlyTable).toHaveBeenCalledTimes(1);
    expect(dashboardState.rawRecords).toEqual([]);
    expect(idleQueue).toHaveLength(0);

    expect(flow.requestDeferredHydration()).toBe(true);
    expect(idleQueue.length).toBeGreaterThan(0);
    await idleQueue[0]();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchData).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        includeYearlyStats: true,
        skipHistorical: false,
      })
    );
    expect(dashboardState.rawRecords).toHaveLength(1);
    expect(renderRecentTable).toHaveBeenCalledTimes(2);
    expect(renderYearlyTable).toHaveBeenCalledTimes(2);
  });
});
