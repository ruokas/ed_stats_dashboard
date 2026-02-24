import { describe, expect, it, vi } from 'vitest';

import { createSummariesDataFlowConfig } from '../../src/app/runtime/runtimes/summaries/data-flow-config.js';

describe('createSummariesDataFlowConfig', () => {
  it('builds data-flow config for summaries runtime', async () => {
    const renderYearlyTable = vi.fn();
    const config = createSummariesDataFlowConfig({
      pageConfig: { yearly: true },
      selectors: {},
      dashboardState: {},
      text: { status: {}, yearly: { empty: 'empty' } },
      defaultSettings: {},
      autoRefreshIntervalMs: 5000,
      runAfterDomAndIdle: vi.fn(),
      setDatasetValue: vi.fn(),
      setStatus: vi.fn(),
      fetchData: vi.fn(),
      perfMonitor: {},
      describeCacheMeta: vi.fn(),
      describeError: vi.fn(),
      computeDailyStats: vi.fn(),
      getDefaultChartFilters: vi.fn(),
      computeMonthlyStats: vi.fn(),
      computeYearlyStats: vi.fn(),
      renderYearlyTable,
      numberFormatter: Intl.NumberFormat(),
      getSettings: vi.fn(),
      getClientConfig: vi.fn(),
      getAutoRefreshTimerId: vi.fn(),
      setAutoRefreshTimerId: vi.fn(),
    });

    expect(config.uiHooks.setStatus).toBeTypeOf('function');
    expect(config.chartHooks.getDefaultChartFilters).toBeTypeOf('function');
    expect(config.dataHooks.renderYearlyTable).toBe(renderYearlyTable);
    expect(config.dataHooks.computeMonthlyStats).toBeTypeOf('function');
    expect(config.dataHooks.computeYearlyStats).toBeTypeOf('function');
    expect(config.dataHooks.filterDailyStatsByWindow([{ x: 1 }])).toEqual([{ x: 1 }]);
    expect(config.dataHooks.filterDailyStatsByWindow(null)).toEqual([]);
  });
});
