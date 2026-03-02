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
    lastEdRenderKey: '',
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
    mainData: {},
  };
}

function createEdPayload({ signature = 'same-signature', recordsCount = 1, dailyKey = '2026-01-01' } = {}) {
  return {
    records: Array.from({ length: recordsCount }, (_, index) => ({ id: index + 1 })),
    summary: {
      entryCount: recordsCount,
      latestSnapshotLabel: dailyKey,
      currentPatients: recordsCount,
    },
    dispositions: [],
    daily: [{ dateKey: dailyKey }],
    meta: { type: 'snapshot', signature },
    usingFallback: false,
    lastErrorMessage: '',
    error: null,
    updatedAt: new Date(),
  };
}

describe('createDataFlow ed refresh render key', () => {
  it('re-renders ED view when payload changes even if signature matches, then skips identical payload', async () => {
    const dashboardState = createDashboardState();
    const renderEdDashboard = vi.fn(async () => {});
    const fetchEdData = vi
      .fn()
      .mockResolvedValueOnce(createEdPayload({ signature: 'sig-1', recordsCount: 1, dailyKey: '2026-01-01' }))
      .mockResolvedValueOnce(createEdPayload({ signature: 'sig-1', recordsCount: 2, dailyKey: '2026-01-02' }))
      .mockResolvedValueOnce(
        createEdPayload({ signature: 'sig-1', recordsCount: 2, dailyKey: '2026-01-02' })
      );

    const setIntervalSpy = vi.spyOn(window, 'setInterval').mockReturnValue(1);
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval').mockImplementation(() => {});
    let autoRefreshTimerId = null;

    const flow = createDataFlow({
      pageConfig: { ed: true },
      selectors: {},
      dashboardState,
      TEXT: { status: { loading: 'Kraunama...', error: 'Klaida' }, ed: { status: { error: () => '' } } },
      DEFAULT_SETTINGS: { calculations: { windowDays: 30, recentDays: 7 } },
      AUTO_REFRESH_INTERVAL_MS: 60000,
      uiHooks: {
        runAfterDomAndIdle: vi.fn(),
        setDatasetValue: () => {},
        setStatus: vi.fn(),
        getSettings: () => ({ calculations: { windowDays: 30, recentDays: 7 } }),
        getClientConfig: () => ({ profilingEnabled: false }),
        getAutoRefreshTimerId: () => autoRefreshTimerId,
        setAutoRefreshTimerId: (id) => {
          autoRefreshTimerId = id;
        },
      },
      dataHooks: {
        createChunkReporter: () => null,
        fetchData: async () => null,
        fetchFeedbackData: async () => [],
        fetchEdData,
        describeCacheMeta: () => ({}),
        describeError: (error, options = {}) => ({
          log: options.code || 'ERR',
          userMessage: options.message || String(error?.message || 'Klaida'),
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
      edHooks: {
        showEdSkeleton: () => {},
        createEmptyEdSummary: () => ({}),
        renderEdDashboard,
      },
    });

    await flow.loadDashboard();
    await flow.loadDashboard();
    await flow.loadDashboard();

    expect(fetchEdData).toHaveBeenCalledTimes(3);
    expect(renderEdDashboard).toHaveBeenCalledTimes(2);
    expect(setIntervalSpy).toHaveBeenCalled();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
