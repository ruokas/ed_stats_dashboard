import { describe, expect, it, vi } from 'vitest';

import { createChartsDataFlowConfig } from '../../src/app/runtime/runtimes/charts/data-flow-config.js';

describe('createChartsDataFlowConfig', () => {
  it('builds data-flow config with provided handlers', async () => {
    const setStatus = vi.fn();
    const showChartSkeletons = vi.fn();
    const fetchData = vi.fn();
    const describeError = vi.fn();
    const computeDailyStats = vi.fn();
    const filterDailyStatsByWindow = vi.fn();
    const populateChartYearOptions = vi.fn();
    const populateChartsHospitalTableYearOptions = vi.fn();
    const populateHourlyCompareYearOptions = vi.fn();
    const populateHeatmapYearOptions = vi.fn();
    const syncHeatmapFilterControls = vi.fn();
    const sanitizeChartFilters = vi.fn();
    const syncChartFilterControls = vi.fn();
    const prepareChartDataForPeriod = vi.fn();
    const renderCharts = vi.fn();
    const renderChartsHospitalTable = vi.fn();
    const getHeatmapData = vi.fn();
    const getSettings = vi.fn();
    const getClientConfig = vi.fn();
    const getAutoRefreshTimerId = vi.fn();
    const setAutoRefreshTimerId = vi.fn();

    const config = createChartsDataFlowConfig({
      pageConfig: { charts: true },
      selectors: {},
      dashboardState: {},
      text: { status: {} },
      defaultSettings: {},
      autoRefreshIntervalMs: 5000,
      runAfterDomAndIdle: vi.fn(),
      setDatasetValue: vi.fn(),
      setStatus,
      showChartSkeletons,
      fetchData,
      perfMonitor: {},
      describeCacheMeta: vi.fn(),
      describeError,
      computeDailyStats,
      filterDailyStatsByWindow,
      populateChartYearOptions,
      populateChartsHospitalTableYearOptions,
      populateHourlyCompareYearOptions,
      populateHeatmapYearOptions,
      syncHeatmapFilterControls,
      getDefaultChartFilters: vi.fn(),
      sanitizeChartFilters,
      kpiFilterLabels: { arrival: { all: 'all' }, disposition: { all: 'all' }, cardType: { all: 'all' } },
      syncChartFilterControls,
      prepareChartDataForPeriod,
      renderCharts,
      renderChartsHospitalTable,
      getHeatmapData,
      numberFormatter: Intl.NumberFormat(),
      getSettings,
      getClientConfig,
      getAutoRefreshTimerId,
      setAutoRefreshTimerId,
    });

    expect(config.fetchData).toBe(fetchData);
    expect(config.describeError).toBe(describeError);
    expect(config.computeDailyStats).toBe(computeDailyStats);
    expect(config.filterDailyStatsByWindow).toBe(filterDailyStatsByWindow);
    expect(config.populateChartYearOptions).toBe(populateChartYearOptions);
    expect(config.renderCharts).toBe(renderCharts);
    expect(config.renderChartsHospitalTable).toBe(renderChartsHospitalTable);
    expect(config.getHeatmapData).toBe(getHeatmapData);
    expect(config.syncChartFilterControls).toBe(syncChartFilterControls);
    expect(config.prepareChartDataForPeriod).toBe(prepareChartDataForPeriod);
    expect(config.getSettings).toBe(getSettings);
    expect(config.getClientConfig).toBe(getClientConfig);
    expect(config.getAutoRefreshTimerId).toBe(getAutoRefreshTimerId);
    expect(config.setAutoRefreshTimerId).toBe(setAutoRefreshTimerId);
    expect(config.showChartSkeletons).toBe(showChartSkeletons);
    expect(config.setStatus).toBe(setStatus);

    await config.fetchFeedbackData();
    await config.fetchEdData();
    await config.applyKpiFiltersAndRender();
    await config.renderEdDashboard();

    expect(config.fetchFeedbackData).toBeTypeOf('function');
    expect(config.fetchEdData).toBeTypeOf('function');
    expect(config.applyKpiFiltersAndRender).toBeTypeOf('function');
    expect(config.renderEdDashboard).toBeTypeOf('function');
  });
});
