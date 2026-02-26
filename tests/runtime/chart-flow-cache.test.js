import { describe, expect, it, vi } from 'vitest';

import { createChartFlow } from '../../src/app/runtime/chart-flow.js';

const KPI_FILTER_LABELS = {
  arrival: { all: 'visi', ems: 'gmp', self: 'be gmp' },
  disposition: { all: 'visi', hospitalized: 'hosp', discharged: 'disch' },
  cardType: { all: 'visos', t: 't', tr: 'tr', ch: 'ch' },
};

function createDefaultChartFilters() {
  return {
    arrival: 'all',
    disposition: 'all',
    cardType: 'all',
    compareGmp: false,
  };
}

function sanitizeChartFilters(filters, { getDefaultChartFilters }) {
  return { ...getDefaultChartFilters(), ...(filters || {}) };
}

function createDailyEntry(date, count) {
  return {
    date,
    count,
    night: 0,
    ems: 0,
    discharged: 0,
    hospitalized: 0,
    totalTime: 0,
    durations: 0,
    hospitalizedTime: 0,
    hospitalizedDurations: 0,
  };
}

function createChartFlowEnv(options = {}) {
  const baseRecords = [
    { id: 1, year: 2024, ems: true, hospitalized: false, cardType: 't' },
    { id: 2, year: 2024, ems: false, hospitalized: true, cardType: 'tr' },
    { id: 3, year: 2023, ems: true, hospitalized: false, cardType: 't' },
  ];
  const baseDaily = [
    createDailyEntry('2023-12-31', 1),
    createDailyEntry('2024-01-01', 2),
    createDailyEntry('2024-01-02', 3),
  ];
  const dashboardState = {
    chartPeriod: 30,
    chartYear: null,
    chartFilters: createDefaultChartFilters(),
    chartData: {
      baseDaily,
      baseRecords,
      filteredRecords: [],
      filteredDaily: [],
      filteredWindowRecords: [],
      dailyWindow: [],
      funnel: null,
      heatmap: null,
      cache: {
        yearScoped: null,
        filtered: null,
        windowed: null,
        funnel: null,
        heatmap: null,
      },
    },
    dailyStats: baseDaily,
    rawRecords: baseRecords,
    chartsSectionRenderFlags: {
      heatmapVisible: options.heatmapVisible ?? true,
      hourlyVisible: options.hourlyVisible ?? false,
    },
  };

  const computeDailyStats = vi.fn((records) => [createDailyEntry('2024-01-01', records.length)]);
  const computeArrivalHeatmap = vi.fn((records) => ({ cells: records.map((row) => row.id) }));
  const computeFunnelStats = vi.fn((daily) => ({ arrived: daily.reduce((sum, row) => sum + row.count, 0) }));
  const filterDailyStatsByYear = vi.fn((daily, year) =>
    Number.isFinite(year) ? daily.filter((row) => String(row.date).startsWith(`${year}-`)) : [...daily]
  );
  const filterRecordsByYear = vi.fn((records, year) =>
    Number.isFinite(year) ? records.filter((row) => row.year === year) : [...records]
  );
  const filterRecordsByWindow = vi.fn((records, days) => records.slice(-days));
  const filterRecordsByChartFilters = vi.fn((records, filters) =>
    filters.arrival === 'ems' ? records.filter((row) => row.ems) : [...records]
  );
  const renderCharts = vi.fn(() => Promise.resolve());

  const chartFlow = createChartFlow({
    selectors: {},
    dashboardState,
    TEXT: { charts: {} },
    DEFAULT_SETTINGS: {},
    getDefaultChartFilters: createDefaultChartFilters,
    KPI_FILTER_LABELS,
    sanitizeChartFilters,
    getDatasetValue: () => '',
    setDatasetValue: () => {},
    toSentenceCase: (value) => String(value || ''),
    showChartError: () => {},
    describeError: () => ({ log: 'error' }),
    computeDailyStats,
    filterDailyStatsByWindow: (daily, days) => daily.slice(-days),
    filterDailyStatsByYear,
    filterRecordsByYear,
    filterRecordsByWindow,
    filterRecordsByChartFilters,
    computeArrivalHeatmap,
    computeFunnelStats,
    buildDailyWindowKeys: () => [],
    fillDailyStatsWindow: (daily) => daily,
    updateDailyPeriodSummary: () => {},
    syncChartPeriodButtons: () => {},
    syncChartYearControl: () => {},
    formatDailyCaption: () => '',
    renderCharts,
    getSettings: () => ({ calculations: { shiftStartHour: 7 } }),
  });

  return {
    chartFlow,
    dashboardState,
    spies: {
      computeDailyStats,
      computeArrivalHeatmap,
      computeFunnelStats,
      filterDailyStatsByYear,
      filterRecordsByYear,
      filterRecordsByWindow,
      filterRecordsByChartFilters,
      renderCharts,
    },
  };
}

describe('chart flow derived cache', () => {
  it('reuses filtered daily and heatmap for repeated identical period requests', () => {
    const { chartFlow, spies } = createChartFlowEnv();

    const first = chartFlow.prepareChartDataForPeriod(30);
    const second = chartFlow.prepareChartDataForPeriod(30);

    expect(second).toEqual(first);
    expect(spies.computeDailyStats).toHaveBeenCalledTimes(1);
    expect(spies.filterDailyStatsByYear).toHaveBeenCalledTimes(1);
    expect(spies.computeArrivalHeatmap).toHaveBeenCalledTimes(1);
    expect(spies.computeFunnelStats).toHaveBeenCalledTimes(1);
    expect(spies.filterRecordsByYear).toHaveBeenCalledTimes(1);
    expect(spies.filterRecordsByChartFilters).toHaveBeenCalledTimes(1);
  });

  it('reuses filtered stage on period change but recomputes window/funnel/heatmap', () => {
    const { chartFlow, spies } = createChartFlowEnv();

    chartFlow.prepareChartDataForPeriod(30);
    chartFlow.updateChartPeriod(1);

    expect(spies.computeDailyStats).toHaveBeenCalledTimes(1);
    expect(spies.filterRecordsByChartFilters).toHaveBeenCalledTimes(1);
    expect(spies.filterDailyStatsByYear).toHaveBeenCalledTimes(1);
    expect(spies.computeArrivalHeatmap).toHaveBeenCalledTimes(2);
    expect(spies.computeFunnelStats).toHaveBeenCalledTimes(2);
  });

  it('skips window record slicing when secondary record-based charts are not visible', () => {
    const { chartFlow, spies } = createChartFlowEnv({ heatmapVisible: false, hourlyVisible: false });

    chartFlow.prepareChartDataForPeriod(30);

    expect(spies.filterRecordsByWindow).toHaveBeenCalledTimes(0);
    expect(spies.computeArrivalHeatmap).toHaveBeenCalledTimes(0);
    expect(spies.computeFunnelStats).toHaveBeenCalledTimes(1);
  });

  it('recomputes filtered stage on year and filter changes', async () => {
    const { chartFlow, dashboardState, spies } = createChartFlowEnv();

    chartFlow.prepareChartDataForPeriod(30);
    chartFlow.updateChartYear(2024);
    expect(spies.computeDailyStats).toHaveBeenCalledTimes(2);
    expect(spies.filterDailyStatsByYear).toHaveBeenCalledTimes(2);
    expect(spies.computeArrivalHeatmap).toHaveBeenCalledTimes(2);

    dashboardState.chartFilters = { ...dashboardState.chartFilters, arrival: 'ems' };
    await chartFlow.applyChartFilters();

    expect(spies.computeDailyStats).toHaveBeenCalledTimes(3);
    expect(spies.filterDailyStatsByYear).toHaveBeenCalledTimes(2);
    expect(spies.computeArrivalHeatmap).toHaveBeenCalledTimes(3);
    expect(spies.filterRecordsByChartFilters).toHaveBeenCalledTimes(3);
  });
});
