import { describe, expect, it, vi } from 'vitest';
import { createKpiFlow } from '../../src/app/runtime/kpi-flow.js';

function createEnv({
  runKpiWorkerJob,
  runKpiWorkerDetailJob,
  computeDailyStats,
  renderKpis,
  renderLastShiftHourlyChartWithTheme,
  showKpiSkeleton,
  hideKpiSkeleton,
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
    showKpiSkeleton: showKpiSkeleton || (() => {}),
    hideKpiSkeleton: hideKpiSkeleton || (() => {}),
    renderKpis: renderKpis || (() => {}),
    renderLastShiftHourlyChartWithTheme: renderLastShiftHourlyChartWithTheme || (async () => {}),
    setChartCardMessage: () => {},
    getSettings: () => ({ calculations: { shiftStartHour: 7 } }),
    runKpiWorkerJob,
    runKpiWorkerDetailJob,
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

  it('hides KPI skeleton even when worker result is unchanged and UI short-circuits', async () => {
    const workerDaily = [{ date: '2026-02-10', count: 1 }];
    const runKpiWorkerJob = vi.fn(async () => ({
      resultMode: 'summary+hourly',
      windowDays: 30,
      records: [],
      dailyStats: workerDaily,
      kpiSummary: {
        totalFilteredRecords: 1,
        selectedDate: '2026-02-10',
        selectedDateRecordCount: 1,
        selectedDateDailyStats: workerDaily,
        availableDateKeys: ['2026-02-10'],
        lastShiftHourly: {
          dateKey: '2026-02-10',
          dateLabel: '2026-02-10',
          shiftStartHour: 7,
          metric: 'arrivals',
          metricLabel: 'Atvykimai',
          hasData: true,
          series: {
            total: Array.from({ length: 24 }, (_, index) => (index === 8 ? 1 : 0)),
            t: Array(24).fill(0),
            tr: Array(24).fill(0),
            ch: Array(24).fill(0),
            outflow: Array(24).fill(0),
            net: Array(24).fill(0),
            census: Array(24).fill(0),
          },
        },
      },
      meta: { resultMode: 'summary+hourly' },
    }));
    const showKpiSkeleton = vi.fn();
    const hideKpiSkeleton = vi.fn();
    const renderKpis = vi.fn();

    const flow = createKpiFlow(
      createEnv({
        runKpiWorkerJob,
        runKpiWorkerDetailJob: vi.fn(async () => ({
          resultMode: 'records-for-date',
          selectedDate: '2026-02-10',
          records: [],
          dailyStats: workerDaily,
          meta: { requiresFullRecords: true, resultMode: 'records-for-date' },
        })),
        computeDailyStats: vi.fn(() => workerDaily),
        renderKpis,
        showKpiSkeleton,
        hideKpiSkeleton,
        dashboardStateOverrides: {
          primaryRecords: [],
          primaryDaily: workerDaily,
        },
      })
    );

    await flow.applyKpiFiltersAndRender();
    await Promise.resolve();
    await Promise.resolve();
    await flow.applyKpiFiltersAndRender();
    await Promise.resolve();
    await Promise.resolve();

    expect(showKpiSkeleton).toHaveBeenCalledTimes(2);
    expect(renderKpis).toHaveBeenCalledTimes(1);
    expect(hideKpiSkeleton).toHaveBeenCalledTimes(1);
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

  it('supports summary+hourly worker results without full filtered records payload', async () => {
    const filteredDaily = [{ date: '2026-02-10', count: 3 }];
    const workerHourly = {
      dateKey: '2026-02-10',
      dateLabel: '2026-02-10',
      shiftStartHour: 7,
      metric: 'arrivals',
      metricLabel: 'Atvykimai',
      hasData: true,
      series: {
        total: Array.from({ length: 24 }, (_, index) => (index === 8 ? 3 : 0)),
        t: Array(24).fill(0),
        tr: Array(24).fill(0),
        ch: Array(24).fill(0),
        outflow: Array(24).fill(0),
        net: Array(24).fill(0),
        census: Array(24).fill(0),
      },
    };
    const runKpiWorkerJob = vi.fn(async () => ({
      resultMode: 'summary+hourly',
      windowDays: 30,
      records: [],
      dailyStats: filteredDaily,
      kpiSummary: {
        totalFilteredRecords: 3,
        selectedDate: '2026-02-10',
        selectedDateRecordCount: 3,
        selectedDateDailyStats: filteredDaily,
        availableDateKeys: ['2026-02-10'],
        lastShiftHourly: workerHourly,
      },
      meta: { resultMode: 'summary+hourly' },
    }));
    const renderKpis = vi.fn();
    const renderLastShiftHourlyChartWithTheme = vi.fn(async () => {});
    const flow = createKpiFlow(
      createEnv({
        runKpiWorkerJob,
        computeDailyStats: vi.fn(() => filteredDaily),
        renderKpis,
        renderLastShiftHourlyChartWithTheme,
        dashboardStateOverrides: {
          primaryRecords: [{ arrival: new Date('2026-02-10T08:00:00') }],
          primaryDaily: filteredDaily,
        },
      })
    );

    await flow.applyKpiFiltersAndRender();
    await flow.applyKpiFiltersAndRender();

    expect(runKpiWorkerJob).toHaveBeenCalled();
    expect(runKpiWorkerJob.mock.calls[0][0]).toMatchObject({
      resultMode: 'summary+hourly',
      selectedDate: '2026-02-10',
      lastShiftHourlyMetric: 'arrivals',
    });
    expect(renderKpis).toHaveBeenCalledTimes(1);
    expect(renderLastShiftHourlyChartWithTheme).toHaveBeenCalledTimes(1);
    expect(renderLastShiftHourlyChartWithTheme.mock.calls[0][0]).toEqual(workerHourly);
  });

  it('uses KPI worker hourly detail job on metric toggle when selected-date cache is unavailable', async () => {
    const filteredDaily = [{ date: '2026-02-10', count: 3 }];
    const initialHourly = {
      dateKey: '2026-02-10',
      dateLabel: '2026-02-10',
      shiftStartHour: 7,
      metric: 'arrivals',
      metricLabel: 'Atvykimai',
      hasData: true,
      series: {
        total: Array.from({ length: 24 }, (_, index) => (index === 8 ? 3 : 0)),
        t: Array(24).fill(0),
        tr: Array(24).fill(0),
        ch: Array(24).fill(0),
        outflow: Array(24).fill(0),
        net: Array(24).fill(0),
        census: Array(24).fill(0),
      },
    };
    const updatedHourly = {
      ...initialHourly,
      metric: 'balance',
      metricLabel: 'Balansas',
      series: {
        ...initialHourly.series,
        net: Array.from({ length: 24 }, (_, index) => (index === 8 ? 2 : 0)),
      },
    };
    const runKpiWorkerJob = vi.fn(async () => ({
      resultMode: 'summary+hourly',
      windowDays: 30,
      records: [],
      dailyStats: filteredDaily,
      kpiSummary: {
        totalFilteredRecords: 3,
        selectedDate: '2026-02-10',
        selectedDateRecordCount: 3,
        selectedDateDailyStats: filteredDaily,
        availableDateKeys: ['2026-02-10'],
        lastShiftHourly: initialHourly,
      },
      meta: { resultMode: 'summary+hourly' },
    }));
    const runKpiWorkerDetailJob = vi.fn(async (payload) => {
      if (payload?.type === 'getKpiRecordsForDateByHandle') {
        return {
          resultMode: 'records-for-date',
          selectedDate: '2026-02-10',
          records: [],
          dailyStats: filteredDaily,
          meta: { requiresFullRecords: true, resultMode: 'records-for-date' },
        };
      }
      return {
        resultMode: 'hourly-only',
        selectedDate: '2026-02-10',
        lastShiftHourly: updatedHourly,
        meta: { resultMode: 'hourly-only', hasRawRecords: true },
      };
    });
    const renderLastShiftHourlyChartWithTheme = vi.fn(async () => {});
    const flow = createKpiFlow(
      createEnv({
        runKpiWorkerJob,
        runKpiWorkerDetailJob,
        computeDailyStats: vi.fn(() => filteredDaily),
        renderLastShiftHourlyChartWithTheme,
        dashboardStateOverrides: {
          primaryRecords: [{ arrival: new Date('2026-02-10T08:00:00') }],
          primaryDaily: filteredDaily,
        },
      })
    );

    await flow.applyKpiFiltersAndRender();
    await Promise.resolve();
    await Promise.resolve();
    const btn = document.createElement('button');
    btn.dataset.lastShiftMetric = 'balance';
    flow.handleLastShiftMetricClick({ currentTarget: btn });
    await Promise.resolve();
    await Promise.resolve();

    expect(runKpiWorkerJob).toHaveBeenCalledTimes(1);
    expect(runKpiWorkerDetailJob).toHaveBeenCalledTimes(2);
    expect(runKpiWorkerDetailJob.mock.calls[1][0]).toMatchObject({
      type: 'computeKpiLastShiftHourlyByHandle',
      selectedDate: '2026-02-10',
      lastShiftHourlyMetric: 'balance',
    });
    expect(renderLastShiftHourlyChartWithTheme).toHaveBeenCalledTimes(2);
    expect(renderLastShiftHourlyChartWithTheme.mock.calls[1][0]).toEqual(updatedHourly);
  });

  it('reuses cached selected-date records for metric toggle in summary mode', async () => {
    const filteredDaily = [{ date: '2026-02-10', count: 1 }];
    const summaryHourly = {
      dateKey: '2026-02-10',
      dateLabel: '2026-02-10',
      shiftStartHour: 7,
      metric: 'arrivals',
      metricLabel: 'Atvykimai',
      hasData: true,
      series: {
        total: Array.from({ length: 24 }, (_, index) => (index === 8 ? 1 : 0)),
        t: Array.from({ length: 24 }, (_, index) => (index === 8 ? 1 : 0)),
        tr: Array(24).fill(0),
        ch: Array(24).fill(0),
        outflow: Array(24).fill(0),
        net: Array(24).fill(0),
        census: Array(24).fill(0),
      },
    };
    const selectedDateRecords = [
      {
        arrival: new Date('2026-02-10T08:00:00'),
        discharge: new Date('2026-02-10T09:00:00'),
        arrivalHasTime: true,
        dischargeHasTime: true,
        cardType: 't',
        hospitalized: false,
      },
    ];
    const runKpiWorkerJob = vi.fn(async () => ({
      resultMode: 'summary+hourly',
      windowDays: 30,
      records: [],
      dailyStats: filteredDaily,
      kpiSummary: {
        totalFilteredRecords: 1,
        selectedDate: '2026-02-10',
        selectedDateRecordCount: 1,
        selectedDateDailyStats: filteredDaily,
        availableDateKeys: ['2026-02-10'],
        lastShiftHourly: summaryHourly,
      },
      meta: { resultMode: 'summary+hourly' },
    }));
    const runKpiWorkerDetailJob = vi.fn(async (payload) => {
      if (payload?.type === 'getKpiRecordsForDateByHandle') {
        return {
          resultMode: 'records-for-date',
          selectedDate: '2026-02-10',
          records: selectedDateRecords,
          dailyStats: filteredDaily,
          meta: { count: 1, resultMode: 'records-for-date' },
        };
      }
      throw new Error(`unexpected detail job: ${String(payload?.type || '')}`);
    });
    const renderLastShiftHourlyChartWithTheme = vi.fn(async () => {});
    const flow = createKpiFlow(
      createEnv({
        runKpiWorkerJob,
        runKpiWorkerDetailJob,
        computeDailyStats: vi.fn(() => filteredDaily),
        renderLastShiftHourlyChartWithTheme,
        dashboardStateOverrides: {
          primaryRecords: selectedDateRecords,
          primaryDaily: filteredDaily,
        },
      })
    );

    await flow.applyKpiFiltersAndRender();
    await Promise.resolve();
    await Promise.resolve();

    const btn = document.createElement('button');
    btn.dataset.lastShiftMetric = 'balance';
    flow.handleLastShiftMetricClick({ currentTarget: btn });

    expect(runKpiWorkerJob).toHaveBeenCalledTimes(1);
    expect(runKpiWorkerDetailJob).toHaveBeenCalledTimes(1);
    expect(runKpiWorkerDetailJob.mock.calls[0][0]).toMatchObject({
      type: 'getKpiRecordsForDateByHandle',
      selectedDate: '2026-02-10',
    });
    expect(renderLastShiftHourlyChartWithTheme).toHaveBeenCalledTimes(2);
    expect(renderLastShiftHourlyChartWithTheme.mock.calls[1][0]).toMatchObject({
      metric: 'balance',
      dateKey: '2026-02-10',
      hasData: true,
    });
  });
});
