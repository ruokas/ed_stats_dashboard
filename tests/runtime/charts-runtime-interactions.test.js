import { describe, expect, it, vi } from 'vitest';

import { wireChartsRuntimeInteractions } from '../../src/app/runtime/runtimes/charts/runtime-interactions.js';

describe('wireChartsRuntimeInteractions', () => {
  it('wires text, controls, and initial syncs', () => {
    const applyChartsText = vi.fn();
    const initChartControls = vi.fn();
    const selectors = {};
    const text = { charts: {} };
    const dashboardState = {};
    const formatDailyCaption = vi.fn();
    const updateChartsHospitalTableHeaderSortIndicators = vi.fn();
    const populateHeatmapMetricOptions = vi.fn();
    const updateHeatmapCaption = vi.fn();
    const syncHeatmapFilterControls = vi.fn();
    const chartFlow = {
      updateChartPeriod: vi.fn(),
      updateChartYear: vi.fn(),
      handleChartFilterChange: vi.fn(),
      handleChartSegmentedClick: vi.fn(),
      syncChartFilterControls: vi.fn(),
    };
    const hourlyControlsFeature = {
      syncHourlyMetricButtons: vi.fn(),
      populateHourlyWeekdayOptions: vi.fn(),
      populateHourlyStayOptions: vi.fn(),
      syncHourlyDepartmentVisibility: vi.fn(),
      updateHourlyCaption: vi.fn(),
      handleHourlyMetricClick: vi.fn(),
      handleHourlyDepartmentInput: vi.fn(),
      handleHourlyDepartmentBlur: vi.fn(),
      handleHourlyDepartmentKeydown: vi.fn(),
      handleHourlyDepartmentToggle: vi.fn(),
      handleHourlyFilterChange: vi.fn(),
      handleHourlyCompareToggle: vi.fn(),
      handleHourlyCompareYearsChange: vi.fn(),
      handleHourlyCompareSeriesClick: vi.fn(),
      handleHourlyResetFilters: vi.fn(),
      applyHourlyDepartmentSelection: vi.fn(),
    };
    const handleHeatmapMetricChange = vi.fn();
    const handleHeatmapFilterChange = vi.fn();
    const handleChartsHospitalTableYearChange = vi.fn();
    const handleChartsHospitalTableSearchInput = vi.fn();
    const handleChartsHospitalTableHeaderClick = vi.fn();
    const handleChartsHospitalTableRowClick = vi.fn();

    wireChartsRuntimeInteractions({
      applyChartsText,
      initChartControls,
      selectors,
      text,
      dashboardState,
      formatDailyCaption,
      updateChartsHospitalTableHeaderSortIndicators,
      hourlyControlsFeature,
      populateHeatmapMetricOptions,
      updateHeatmapCaption,
      chartFlow,
      handleHeatmapMetricChange,
      handleHeatmapFilterChange,
      handleChartsHospitalTableYearChange,
      handleChartsHospitalTableSearchInput,
      handleChartsHospitalTableHeaderClick,
      handleChartsHospitalTableRowClick,
      syncHeatmapFilterControls,
    });

    expect(applyChartsText).toHaveBeenCalledTimes(1);
    expect(initChartControls).toHaveBeenCalledTimes(1);
    expect(chartFlow.syncChartFilterControls).toHaveBeenCalledTimes(1);
    expect(syncHeatmapFilterControls).toHaveBeenCalledTimes(1);
    expect(updateChartsHospitalTableHeaderSortIndicators).toHaveBeenCalledTimes(1);

    const controlsArgs = initChartControls.mock.calls[0][0];
    expect(controlsArgs.handleHeatmapMetricChange).toBe(handleHeatmapMetricChange);
    expect(controlsArgs.handleHeatmapFilterChange).toBe(handleHeatmapFilterChange);
    expect(controlsArgs.handleChartsHospitalTableYearChange).toBe(handleChartsHospitalTableYearChange);
    expect(controlsArgs.handleChartsHospitalTableSearchInput).toBe(handleChartsHospitalTableSearchInput);
    expect(controlsArgs.handleChartsHospitalTableHeaderClick).toBe(handleChartsHospitalTableHeaderClick);
    expect(controlsArgs.handleChartsHospitalTableRowClick).toBe(handleChartsHospitalTableRowClick);
  });
});
