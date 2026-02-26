import { describe, expect, it, vi } from 'vitest';

import { createDataFlow } from '../../src/app/runtime/data-flow.js';

function createDataset() {
  const records = [
    { id: 1, date: '2024-01-01', year: 2024 },
    { id: 2, date: '2024-01-02', year: 2024 },
  ];
  const dailyStats = [
    {
      date: '2024-01-01',
      count: 2,
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

function createChartsDashboardState() {
  return {
    loading: false,
    queuedReload: false,
    hasLoadedOnce: false,
    loadCounter: 0,
    usingFallback: false,
    lastErrorMessage: '',
    lastMainDataSignature: '',
    lastEdDataSignature: '',
    chartPeriod: 30,
    chartYear: null,
    chartFilters: {},
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
    kpi: { filters: { window: 0 } },
    feedback: { records: [], lastErrorMessage: '', usingFallback: false },
    ed: null,
    monthly: { all: [], window: [] },
    chartSections: {},
  };
}

function createEnv(overrides = {}) {
  const runAfterDomAndIdle =
    overrides.runAfterDomAndIdle ??
    vi.fn((fn) => {
      fn();
    });
  const setStatus = vi.fn();
  const fetchData = vi.fn(async () => createDataset());
  const renderChartsPrimary = vi.fn(async () => null);
  const renderChartsSecondary = vi.fn(async () => true);
  const renderChartsHospitalTable = vi.fn();
  const prepareChartDataForPeriod = vi.fn(() => ({ daily: [], funnel: { arrived: 1 }, heatmap: null }));
  const scheduleChartsSecondaryRender = Object.hasOwn(overrides, 'scheduleChartsSecondaryRender')
    ? overrides.scheduleChartsSecondaryRender
    : null;
  const dashboardState = overrides.dashboardState ?? createChartsDashboardState();

  const flow = createDataFlow({
    pageConfig: { charts: true },
    selectors: {},
    dashboardState,
    TEXT: {
      status: { error: 'Klaida' },
      charts: { errorLoading: 'Err' },
      ed: { status: { error: () => '' } },
    },
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
    chartHooks: {
      showChartSkeletons: () => {},
      populateChartYearOptions: () => {},
      populateChartsHospitalTableYearOptions: () => {},
      populateHourlyCompareYearOptions: () => {},
      populateHeatmapYearOptions: () => {},
      syncHeatmapFilterControls: () => {},
      getDefaultChartFilters: () => ({ arrival: 'all', disposition: 'all', cardType: 'all' }),
      sanitizeChartFilters: (value) => value || { arrival: 'all', disposition: 'all', cardType: 'all' },
      KPI_FILTER_LABELS: {
        arrival: { all: 'all' },
        disposition: { all: 'all' },
        cardType: { all: 'all' },
      },
      syncChartFilterControls: () => {},
      prepareChartDataForPeriod,
      renderChartsPrimary,
      renderChartsSecondary,
      renderCharts: vi.fn(async () => {}),
      renderChartsHospitalTable,
      getHeatmapData: () => ({ metrics: {} }),
      onChartsPrimaryVisible: () => {},
      scheduleChartsSecondaryRender,
    },
    dataHooks: {
      createChunkReporter: () => null,
      fetchData,
      fetchFeedbackData: async () => [],
      fetchEdData: async () => null,
      describeCacheMeta: () => ({}),
      describeError: (error, options = {}) => ({
        log: options.code || 'ERR',
        userMessage: options.message || String(error?.message || 'Klaida'),
      }),
      computeDailyStats: () => [],
      filterDailyStatsByWindow: (daily) => daily,
      mergeDailyStatsSeries: (seriesList) => seriesList.flat(),
      renderRecentTable: () => {},
      computeMonthlyStats: () => [],
      renderMonthlyTable: () => {},
      computeYearlyStats: () => [],
      renderYearlyTable: () => {},
    },
  });

  return {
    flow,
    spies: {
      runAfterDomAndIdle,
      setStatus,
      fetchData,
      renderChartsPrimary,
      renderChartsSecondary,
      renderChartsHospitalTable,
      prepareChartDataForPeriod,
      scheduleChartsSecondaryRender,
    },
    dashboardState,
  };
}

describe('createDataFlow charts staged startup', () => {
  it('starts charts-only initial load immediately without runAfterDomAndIdle startup delay', async () => {
    const runAfterDomAndIdle = vi.fn();
    const { flow, spies } = createEnv({ runAfterDomAndIdle });

    flow.scheduleInitialLoad();
    expect(spies.runAfterDomAndIdle).not.toHaveBeenCalled();
    expect(spies.fetchData).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(spies.renderChartsPrimary).toHaveBeenCalledTimes(1);
  });

  it('awaits primary charts render and schedules secondary render without awaiting it', async () => {
    const scheduleChartsSecondaryRender = vi.fn(() => new Promise(() => {}));
    const { flow, spies } = createEnv({ scheduleChartsSecondaryRender });

    await flow.loadDashboard();

    expect(spies.fetchData).toHaveBeenCalledWith(expect.objectContaining({ includeYearlyStats: false }));
    expect(spies.renderChartsPrimary).toHaveBeenCalledTimes(1);
    expect(spies.scheduleChartsSecondaryRender).toHaveBeenCalledTimes(1);
    expect(spies.renderChartsSecondary).toHaveBeenCalledTimes(0);
    expect(spies.renderChartsHospitalTable).toHaveBeenCalledTimes(0);
    expect(spies.setStatus).toHaveBeenCalledWith('success');
  });

  it('keeps primary charts successful when deferred secondary render throws', async () => {
    const idleQueue = [];
    const runAfterDomAndIdle = vi.fn((fn) => {
      idleQueue.push(fn);
    });
    const { flow, spies } = createEnv({
      runAfterDomAndIdle,
      scheduleChartsSecondaryRender: null,
    });
    spies.renderChartsSecondary.mockImplementation(async () => {
      throw new Error('secondary failed');
    });

    await flow.loadDashboard();

    expect(spies.renderChartsPrimary).toHaveBeenCalledTimes(1);
    expect(spies.setStatus).toHaveBeenCalledWith('success');
    expect(spies.renderChartsHospitalTable).toHaveBeenCalledTimes(0);
    expect(idleQueue.length).toBeGreaterThan(0);

    await expect(idleQueue.shift()()).resolves.toBeUndefined();
    expect(spies.renderChartsSecondary).toHaveBeenCalledTimes(1);

    idleQueue.shift()();
    expect(spies.renderChartsHospitalTable).toHaveBeenCalledTimes(1);
  });

  it('coalesces repeated deferred secondary requests and renders latest request once', async () => {
    const idleQueue = [];
    const runAfterDomAndIdle = vi.fn((fn) => {
      idleQueue.push(fn);
    });
    const { flow, spies } = createEnv({
      runAfterDomAndIdle,
      scheduleChartsSecondaryRender: null,
    });

    await flow.loadDashboard();
    await flow.loadDashboard();

    expect(idleQueue).toHaveLength(1);
    expect(spies.renderChartsSecondary).toHaveBeenCalledTimes(0);

    await expect(idleQueue.shift()()).resolves.toBeUndefined();
    expect(spies.renderChartsSecondary).toHaveBeenCalledTimes(0);
    expect(idleQueue).toHaveLength(1);

    await expect(idleQueue.shift()()).resolves.toBeUndefined();
    expect(spies.renderChartsSecondary).toHaveBeenCalledTimes(1);
  });
});
