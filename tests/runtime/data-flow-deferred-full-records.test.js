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
    charts: {
      daily: null,
      dow: null,
      dowStay: null,
      funnel: null,
    },
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
      filters: {
        window: 30,
        shift: 'all',
        arrival: 'all',
        disposition: 'all',
        cardType: 'all',
      },
      selectedDate: null,
      records: [],
      daily: [],
    },
    feedback: { records: [], lastErrorMessage: '', usingFallback: false },
    ed: null,
    monthly: { all: [], window: [] },
    mainData: {
      recordsHydrationState: 'none',
      deferredHydrationToken: 0,
      deferredHydration: null,
    },
  };
}

describe('createDataFlow deferred full-record hydration', () => {
  it('loads KPI with daily-lite first and hydrates full records later', async () => {
    const idleQueue = [];
    const runAfterDomAndIdle = vi.fn((fn) => {
      idleQueue.push(fn);
    });
    const applyKpiFiltersAndRender = vi.fn(async () => {});
    const deferredHydrate = vi.fn(async () => ({
      records: [{ id: 1, arrival: new Date('2026-02-10T08:00:00') }],
      primaryRecords: [{ id: 1, arrival: new Date('2026-02-10T08:00:00') }],
      dailyStats: [{ date: '2026-02-10', count: 1 }],
      primaryDaily: [{ date: '2026-02-10', count: 1 }],
      hospitalByDeptStayAgg: null,
      meta: {
        primary: { signature: 'sig-1' },
        historical: null,
        sources: [],
        recordsState: 'full',
        fetchProfile: 'full',
      },
    }));
    const fetchData = vi.fn(async () => ({
      records: [],
      primaryRecords: [],
      dailyStats: [{ date: '2026-02-10', count: 1 }],
      primaryDaily: [{ date: '2026-02-10', count: 1 }],
      hospitalByDeptStayAgg: null,
      meta: {
        primary: { signature: 'sig-1', cacheTier: 'network' },
        historical: null,
        sources: [{ id: 'primary' }],
        recordsState: 'deferred',
        fetchProfile: 'daily-lite',
      },
      deferredHydration: {
        token: 'defer-1',
        kind: 'full-records',
        fetchProfile: 'full',
        hydrate: deferredHydrate,
      },
    }));
    const dashboardState = createKpiDashboardState();

    const flow = createDataFlow({
      pageConfig: { kpi: true },
      selectors: {},
      dashboardState,
      TEXT: {
        status: { error: 'Klaida' },
        ed: { status: { error: () => '' } },
      },
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
      kpiHooks: {
        showKpiSkeleton: () => {},
        syncKpiFilterControls: () => {},
        applyKpiFiltersAndRender,
      },
      dataHooks: {
        createChunkReporter: () => null,
        fetchData,
        fetchProfile: 'daily-lite',
        supportsDeferredHistoricalHydration: false,
        supportsDeferredFullRecordsHydration: true,
        requiresFullRecordsForInteractions: true,
        fetchFeedbackData: async () => [],
        fetchEdData: async () => null,
        describeCacheMeta: () => 'tinklas',
        describeError: (error, options = {}) => ({
          log: options.code || 'ERR',
          userMessage: options.message || String(error?.message || 'Klaida'),
        }),
        computeDailyStats: () => [],
        filterDailyStatsByWindow: (daily) => daily,
        mergeDailyStatsSeries: (seriesList) => (Array.isArray(seriesList?.[0]) ? seriesList[0] : []),
        renderRecentTable: () => {},
        computeMonthlyStats: () => [],
        renderMonthlyTable: () => {},
        computeYearlyStats: () => [],
        renderYearlyTable: () => {},
      },
    });

    await flow.loadDashboard();

    expect(fetchData).toHaveBeenCalledWith(
      expect.objectContaining({
        fetchProfile: 'daily-lite',
        deferFullRecords: true,
        skipHistorical: true,
      })
    );
    expect(applyKpiFiltersAndRender).toHaveBeenCalledTimes(1);
    expect(dashboardState.mainData.recordsHydrationState).toBe('deferred');
    expect(dashboardState.rawRecords).toEqual([]);

    expect(idleQueue.length).toBeGreaterThan(0);
    await idleQueue[0]();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(deferredHydrate).toHaveBeenCalledWith(
      expect.objectContaining({
        skipHistorical: true,
        signal: expect.any(AbortSignal),
      })
    );
    expect(applyKpiFiltersAndRender).toHaveBeenCalledTimes(2);
    expect(dashboardState.mainData.recordsHydrationState).toBe('full');
    expect(dashboardState.rawRecords).toHaveLength(1);
    expect(dashboardState.primaryRecords).toHaveLength(1);
  });
});
