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

function buildYearDaily(year) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0');
    return {
      date: `${year}-${month}-15`,
      count: index + 1,
      night: 0,
      ems: 0,
      discharged: 0,
      hospitalized: 0,
      totalTime: 0,
      durations: 0,
      hospitalizedTime: 0,
      hospitalizedDurations: 0,
    };
  });
}

describe('chart flow year mode', () => {
  it('keeps full selected year daily series instead of period window', () => {
    const baseDaily = [...buildYearDaily(2023), ...buildYearDaily(2024)];
    const dashboardState = {
      chartPeriod: 365,
      chartYear: 2024,
      chartFilters: createDefaultChartFilters(),
      chartData: {
        baseDaily,
        baseRecords: [],
        filteredRecords: [],
        filteredDaily: [],
        filteredWindowRecords: [],
        dailyWindow: [],
        funnel: null,
        heatmap: null,
      },
      dailyStats: baseDaily,
      rawRecords: [],
    };

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
      computeDailyStats: () => [],
      filterDailyStatsByWindow: (daily) => daily,
      filterDailyStatsByYear: (daily, year) =>
        Array.isArray(daily) ? daily.filter((entry) => String(entry?.date || '').startsWith(`${year}-`)) : [],
      filterRecordsByYear: (records) => records,
      filterRecordsByWindow: (records) => records,
      filterRecordsByChartFilters: (records) => records,
      computeArrivalHeatmap: () => ({}),
      computeFunnelStats: () => ({}),
      buildDailyWindowKeys: () => [],
      fillDailyStatsWindow: (daily) => daily,
      updateDailyPeriodSummary: () => {},
      syncChartPeriodButtons: () => {},
      syncChartYearControl: () => {},
      formatDailyCaption: () => '',
      renderCharts: vi.fn(),
      getSettings: () => ({}),
    });

    const result = chartFlow.prepareChartDataForPeriod(365);

    expect(result.daily).toHaveLength(12);
    expect(result.daily.every((entry) => String(entry.date).startsWith('2024-'))).toBe(true);
    expect(dashboardState.chartData.filteredDaily).toHaveLength(12);
  });
});
