import { describe, expect, it, vi } from 'vitest';
import { createKpiFlow } from '../../src/app/runtime/kpi-flow.js';

function createEnv({
  runKpiWorkerJob,
  computeDailyStats,
  renderKpis,
  renderLastShiftHourlyChartWithTheme,
  dashboardStateOverrides,
  filterDailyStatsByWindow,
  matchesSharedPatientFilters,
}) {
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
      ...(dashboardStateOverrides || {}),
      kpi: {
        filters: { ...defaultFilters },
        selectedDate: '2026-02-10',
        records: [],
        daily: [],
        lastShiftHourlyMetric: 'arrivals',
        ...(dashboardStateOverrides?.kpi || {}),
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
    filterDailyStatsByWindow: filterDailyStatsByWindow || ((daily) => daily),
    matchesSharedPatientFilters: matchesSharedPatientFilters || (() => true),
    describeError: () => ({ log: 'err' }),
    showKpiSkeleton: () => {},
    renderKpis: renderKpis || (() => {}),
    renderLastShiftHourlyChartWithTheme: renderLastShiftHourlyChartWithTheme || (async () => {}),
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

  it('skips redundant KPI and hourly rerenders when worker result is unchanged', async () => {
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
    const renderKpis = vi.fn();
    const renderLastShiftHourlyChartWithTheme = vi.fn(async () => {});

    const flow = createKpiFlow(
      createEnv({
        runKpiWorkerJob,
        computeDailyStats: () => workerDaily,
        renderKpis,
        renderLastShiftHourlyChartWithTheme,
      })
    );
    await flow.applyKpiFiltersAndRender();
    await flow.applyKpiFiltersAndRender();

    expect(renderKpis).toHaveBeenCalledTimes(1);
    expect(renderLastShiftHourlyChartWithTheme).toHaveBeenCalledTimes(1);
  });

  it('produces equivalent rendered state for worker success and local fallback', async () => {
    const primaryDaily = [{ date: '2026-02-10', count: 1 }];
    const workerResult = {
      records: [],
      dailyStats: primaryDaily,
      windowDays: 30,
    };

    const successRenderKpis = vi.fn();
    const successHourly = vi.fn(async () => {});
    const successEnv = createEnv({
      runKpiWorkerJob: vi.fn(async () => workerResult),
      computeDailyStats: vi.fn(() => primaryDaily),
      renderKpis: successRenderKpis,
      renderLastShiftHourlyChartWithTheme: successHourly,
      dashboardStateOverrides: {
        primaryRecords: [],
        primaryDaily,
      },
    });

    const fallbackRenderKpis = vi.fn();
    const fallbackHourly = vi.fn(async () => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fallbackEnv = createEnv({
      runKpiWorkerJob: vi.fn(async () => {
        throw new Error('worker failed');
      }),
      computeDailyStats: vi.fn(() => primaryDaily),
      renderKpis: fallbackRenderKpis,
      renderLastShiftHourlyChartWithTheme: fallbackHourly,
      dashboardStateOverrides: {
        primaryRecords: [],
        primaryDaily,
      },
    });

    const successFlow = createKpiFlow(successEnv);
    const fallbackFlow = createKpiFlow(fallbackEnv);
    await successFlow.applyKpiFiltersAndRender();
    await fallbackFlow.applyKpiFiltersAndRender();

    expect(successRenderKpis).toHaveBeenCalledTimes(1);
    expect(fallbackRenderKpis).toHaveBeenCalledTimes(1);
    expect(successRenderKpis.mock.calls[0]).toEqual(fallbackRenderKpis.mock.calls[0]);
    expect(successHourly).toHaveBeenCalledTimes(1);
    expect(fallbackHourly).toHaveBeenCalledTimes(1);
    expect(successHourly.mock.calls[0][0]).toEqual(fallbackHourly.mock.calls[0][0]);
    expect(successEnv.dashboardState.kpi.records).toEqual(fallbackEnv.dashboardState.kpi.records);
    expect(successEnv.dashboardState.kpi.daily).toEqual(fallbackEnv.dashboardState.kpi.daily);
    expect(successEnv.dashboardState.kpi.lastShiftHourly).toEqual(
      fallbackEnv.dashboardState.kpi.lastShiftHourly
    );

    consoleErrorSpy.mockRestore();
  });
});
