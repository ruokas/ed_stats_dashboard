import { describe, expect, it, vi } from 'vitest';
import { createKpiFlow } from '../../src/app/runtime/kpi-flow.js';

function createEnv({ runKpiWorkerJob, computeDailyStats }) {
  const defaultFilters = {
    window: 30,
    shift: 'all',
    arrival: 'all',
    disposition: 'all',
    cardType: 'all',
  };
  return {
    selectors: {
      lastShiftHourlyMetricButtons: [],
      kpiArrivalButtons: [],
      kpiCardTypeButtons: [],
      kpiDateInput: null,
    },
    dashboardState: {
      primaryRecords: [],
      primaryDaily: [],
      kpi: {
        filters: { ...defaultFilters },
        selectedDate: '2026-02-10',
        records: [],
        daily: [],
        lastShiftHourlyMetric: 'arrivals',
      },
    },
    TEXT: { kpis: { subtitle: 'KPI' }, charts: {} },
    DEFAULT_SETTINGS: { calculations: { nightEndHour: 7, shiftStartHour: 7, windowDays: 30 } },
    DEFAULT_KPI_WINDOW_DAYS: 30,
    KPI_FILTER_LABELS: {
      shift: { all: 'Visos pamainos' },
      arrival: { all: 'Visi atvykimai' },
      disposition: { all: 'Visos baigtys' },
      cardType: { all: 'Visi tipai' },
    },
    KPI_WINDOW_OPTION_BASE: [7, 30, 365, 0],
    getDefaultKpiFilters: () => ({ ...defaultFilters }),
    sanitizeKpiFilters: (filters) => ({ ...defaultFilters, ...filters }),
    getDatasetValue: (el, key) => el?.dataset?.[key] || '',
    setDatasetValue: () => {},
    dateKeyToDate: (dateKey) => new Date(`${dateKey}T00:00:00`),
    formatLocalDateKey: (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    },
    computeDailyStats,
    filterDailyStatsByWindow: (daily) => daily,
    matchesSharedPatientFilters: () => true,
    describeError: () => ({ log: 'err' }),
    showKpiSkeleton: () => {},
    renderKpis: () => {},
    renderLastShiftHourlyChartWithTheme: async () => {},
    setChartCardMessage: () => {},
    getSettings: () => ({ calculations: { shiftStartHour: 7 } }),
    runKpiWorkerJob,
    buildLastShiftSummary: () => ({ dateKey: '2026-02-10', dateLabel: '2026-02-10' }),
    toSentenceCase: (value) => value,
  };
}

describe('kpi-flow selectedDate daily cache', () => {
  it('reuses selected-date daily stats across repeated apply and metric toggle', async () => {
    const workerRecords = [
      {
        arrival: new Date('2026-02-10T08:30:00'),
        discharge: new Date('2026-02-10T09:30:00'),
        arrivalHasTime: true,
        dischargeHasTime: true,
        cardType: 't',
        hospitalized: false,
      },
    ];
    const workerDaily = [{ date: '2026-02-10', count: 1 }];
    const runKpiWorkerJob = vi.fn(async () => ({
      records: workerRecords,
      dailyStats: workerDaily,
      windowDays: 30,
    }));
    const computeDailyStats = vi.fn(() => workerDaily);

    const flow = createKpiFlow(createEnv({ runKpiWorkerJob, computeDailyStats }));
    await flow.applyKpiFiltersAndRender();
    await flow.applyKpiFiltersAndRender();

    const btn = document.createElement('button');
    btn.dataset.lastShiftMetric = 'arrivals';
    flow.handleLastShiftMetricClick({ currentTarget: btn });

    expect(computeDailyStats).toHaveBeenCalledTimes(1);
  });
});
