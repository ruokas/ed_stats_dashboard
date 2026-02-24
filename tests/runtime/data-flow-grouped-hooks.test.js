import { describe, expect, it, vi } from 'vitest';
import { createDataFlow } from '../../src/app/runtime/data-flow.js';

describe('createDataFlow grouped hooks compatibility', () => {
  it('accepts grouped hooks while omitting optional feature adapters', () => {
    const runAfterDomAndIdle = vi.fn();
    const flow = createDataFlow({
      pageConfig: {},
      selectors: {},
      dashboardState: {
        loading: false,
        queuedReload: false,
        hasLoadedOnce: false,
      },
      TEXT: { status: { error: 'klaida' } },
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
      dataHooks: {},
    });

    expect(flow).toMatchObject({
      loadDashboard: expect.any(Function),
      scheduleInitialLoad: expect.any(Function),
    });

    flow.scheduleInitialLoad();
    expect(runAfterDomAndIdle).toHaveBeenCalledTimes(1);
  });
});
