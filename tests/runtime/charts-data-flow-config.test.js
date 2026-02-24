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
    const mergeDailyStatsSeries = vi.fn();
    const populateChartYearOptions = vi.fn();
    const populateChartsHospitalTableYearOptions = vi.fn();
    const populateHourlyCompareYearOptions = vi.fn();
    const populateHeatmapYearOptions = vi.fn();
    const syncHeatmapFilterControls = vi.fn();
    const sanitizeChartFilters = vi.fn();
    const syncChartFilterControls = vi.fn();
    const prepareChartDataForPeriod = vi.fn();
    const renderChartsPrimary = vi.fn();
    const renderChartsSecondary = vi.fn();
    const renderCharts = vi.fn();
    const renderChartsHospitalTable = vi.fn();
    const getHeatmapData = vi.fn();
    const onChartsPrimaryVisible = vi.fn();
    const scheduleChartsSecondaryRender = vi.fn();
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
      mergeDailyStatsSeries,
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
      renderChartsPrimary,
      renderChartsSecondary,
      renderCharts,
      renderChartsHospitalTable,
      getHeatmapData,
      onChartsPrimaryVisible,
      scheduleChartsSecondaryRender,
      numberFormatter: Intl.NumberFormat(),
      getSettings,
      getClientConfig,
      getAutoRefreshTimerId,
      setAutoRefreshTimerId,
    });

    expect(config.uiHooks.setStatus).toBe(setStatus);
    expect(config.uiHooks.getSettings).toBe(getSettings);
    expect(config.uiHooks.getClientConfig).toBe(getClientConfig);
    expect(config.uiHooks.getAutoRefreshTimerId).toBe(getAutoRefreshTimerId);
    expect(config.uiHooks.setAutoRefreshTimerId).toBe(setAutoRefreshTimerId);
    expect(config.chartHooks.showChartSkeletons).toBe(showChartSkeletons);
    expect(config.chartHooks.populateChartYearOptions).toBe(populateChartYearOptions);
    expect(config.chartHooks.syncChartFilterControls).toBe(syncChartFilterControls);
    expect(config.chartHooks.prepareChartDataForPeriod).toBe(prepareChartDataForPeriod);
    expect(config.chartHooks.renderChartsPrimary).toBe(renderChartsPrimary);
    expect(config.chartHooks.renderChartsSecondary).toBe(renderChartsSecondary);
    expect(config.chartHooks.renderCharts).toBe(renderCharts);
    expect(config.chartHooks.renderChartsHospitalTable).toBe(renderChartsHospitalTable);
    expect(config.chartHooks.getHeatmapData).toBe(getHeatmapData);
    expect(config.chartHooks.onChartsPrimaryVisible).toBe(onChartsPrimaryVisible);
    expect(config.chartHooks.scheduleChartsSecondaryRender).toBe(scheduleChartsSecondaryRender);
    expect(config.dataHooks.fetchData).toBe(fetchData);
    expect(config.dataHooks.describeError).toBe(describeError);
    expect(config.dataHooks.computeDailyStats).toBe(computeDailyStats);
    expect(config.dataHooks.filterDailyStatsByWindow).toBe(filterDailyStatsByWindow);
    expect(config.dataHooks.mergeDailyStatsSeries).toBe(mergeDailyStatsSeries);
  });
});
