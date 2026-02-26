import { afterEach, describe, expect, it } from 'vitest';
import { createMainDataHandlers } from '../../src/data/main-data.js';

class FakeWorker {
  constructor() {
    this.listeners = { message: [], error: [] };
    this.kpiDatasets = new Map();
  }

  addEventListener(type, cb) {
    if (this.listeners[type]) {
      this.listeners[type].push(cb);
    }
  }

  terminate() {}

  postMessage(message) {
    if (!Array.isArray(FakeWorker.postedMessages)) {
      FakeWorker.postedMessages = [];
    }
    FakeWorker.postedMessages.push(message);
    if (message?.type === 'storeDataset') {
      FakeWorker.nextDatasetId = (FakeWorker.nextDatasetId || 0) + 1;
      const handle = `fake-kpi-dataset-${FakeWorker.nextDatasetId}`;
      this.kpiDatasets.set(handle, {
        records: Array.isArray(message.records) ? message.records : [],
        dailyStats: Array.isArray(message.dailyStats) ? message.dailyStats : [],
        calculations: message.calculations || {},
        calculationDefaults: message.calculationDefaults || {},
      });
      setTimeout(() => {
        this.listeners.message.forEach((cb) => {
          cb({
            data: {
              id: message.id,
              status: 'success',
              payload: { datasetHandle: handle, meta: { recordsCount: message.records?.length || 0 } },
              meta: { datasetHandle: handle },
            },
          });
        });
      }, 0);
      return;
    }
    if (message?.type === 'releaseDataset') {
      const handle = String(message.datasetHandle || '');
      this.kpiDatasets.delete(handle);
      setTimeout(() => {
        this.listeners.message.forEach((cb) => {
          cb({
            data: {
              id: message.id,
              status: 'success',
              payload: { datasetHandle: handle, released: true },
              meta: { datasetHandle: handle },
            },
          });
        });
      }, 0);
      return;
    }
    if (message?.type === 'applyKpiFiltersByHandle') {
      const handle = String(message.datasetHandle || '');
      const dataset = this.kpiDatasets.get(handle) || { records: [], dailyStats: [] };
      setTimeout(() => {
        this.listeners.message.forEach((cb) => {
          cb({
            data: {
              id: message.id,
              status: 'success',
              payload: {
                filters: message.filters || {},
                windowDays: Number.isFinite(message.windowDays) ? message.windowDays : 0,
                records: dataset.records,
                dailyStats: dataset.dailyStats,
                meta: { totalRecords: dataset.records.length },
              },
              meta: {
                recordsCount: dataset.records.length,
                dailyStatsCount: dataset.dailyStats.length,
                computeDurationMs: 1,
              },
            },
          });
        });
      }, 0);
      return;
    }
    if (message?.type === 'computeKpiLastShiftHourlyByHandle') {
      const handle = String(message.datasetHandle || '');
      const dataset = this.kpiDatasets.get(handle) || { records: [], dailyStats: [] };
      setTimeout(() => {
        this.listeners.message.forEach((cb) => {
          cb({
            data: {
              id: message.id,
              status: 'success',
              payload: {
                resultMode: 'hourly-only',
                selectedDate: message.selectedDate || null,
                lastShiftHourly: {
                  dateKey: message.selectedDate || null,
                  dateLabel: message.selectedDate || null,
                  shiftStartHour: 7,
                  metric: message.lastShiftHourlyMetric || 'arrivals',
                  metricLabel: message.lastShiftHourlyMetric || 'arrivals',
                  hasData: dataset.records.length > 0 || dataset.dailyStats.length > 0,
                  series: {
                    total: Array(24).fill(0),
                    t: Array(24).fill(0),
                    tr: Array(24).fill(0),
                    ch: Array(24).fill(0),
                    outflow: Array(24).fill(0),
                    net: Array(24).fill(0),
                    census: Array(24).fill(0),
                  },
                },
              },
              meta: {
                recordsCount: 0,
                dailyStatsCount: 0,
                computeDurationMs: 1,
              },
            },
          });
        });
      }, 0);
      return;
    }
    if (message?.type === 'computeSummariesReports') {
      setTimeout(() => {
        const event = {
          data: {
            id: message.id,
            status: 'success',
            payload: FakeWorker.summariesPayload || { viewModels: { diagnosisPercentRows: [] } },
          },
        };
        this.listeners.message.forEach((cb) => {
          cb(event);
        });
      }, 0);
      return;
    }
    if (message?.type !== 'transformCsv') {
      return;
    }
    const payload = message.csvText.includes('PRIMARY')
      ? FakeWorker.primaryPayload
      : FakeWorker.historicalPayload;
    setTimeout(() => {
      if (FakeWorker.emitPartial === true) {
        const partial = {
          data: {
            id: message.id,
            status: 'partial',
            phase: 'dailyStatsReady',
            payload: { dailyStats: payload.dailyStats },
          },
        };
        this.listeners.message.forEach((cb) => {
          cb(partial);
        });
      }
      const event = { data: { id: message.id, status: 'success', payload } };
      this.listeners.message.forEach((cb) => {
        cb(event);
      });
    }, 0);
  }
}

describe('main-data sourceId tagging', () => {
  const originalWorker = globalThis.Worker;

  afterEach(() => {
    globalThis.Worker = originalWorker;
    FakeWorker.emitPartial = false;
    FakeWorker.summariesPayload = undefined;
    FakeWorker.postedMessages = [];
    FakeWorker.nextDatasetId = 0;
  });

  it('reuses record object when sourceId already matches and clones only when needed', async () => {
    const primaryExisting = {
      sourceId: 'primary',
      arrival: new Date('2026-02-10T08:00:00'),
      discharge: new Date('2026-02-10T09:00:00'),
    };
    const primaryNeedsTag = {
      arrival: new Date('2026-02-10T10:00:00'),
      discharge: new Date('2026-02-10T11:00:00'),
    };
    const historicalExisting = {
      sourceId: 'historical',
      arrival: new Date('2026-02-11T08:00:00'),
      discharge: new Date('2026-02-11T09:00:00'),
    };
    const historicalNeedsTag = {
      arrival: new Date('2026-02-11T10:00:00'),
      discharge: new Date('2026-02-11T11:00:00'),
    };

    FakeWorker.primaryPayload = {
      records: [primaryExisting, primaryNeedsTag],
      dailyStats: [{ date: '2026-02-10', count: 2 }],
      hospitalByDeptStayAgg: null,
    };
    FakeWorker.historicalPayload = {
      records: [historicalExisting, historicalNeedsTag],
      dailyStats: [{ date: '2026-02-11', count: 2 }],
      hospitalByDeptStayAgg: null,
    };
    globalThis.Worker = FakeWorker;

    const settings = {
      csv: {},
      calculations: { shiftStartHour: 7, nightEndHour: 7 },
      dataSource: {
        url: 'https://example.test/primary.csv',
        historical: {
          enabled: true,
          url: 'https://example.test/historical.csv',
          label: 'Istorinis CSV',
        },
      },
    };
    const DEFAULT_SETTINGS = {
      csv: {},
      calculations: { shiftStartHour: 7, nightEndHour: 7 },
      dataSource: settings.dataSource,
    };
    const handlers = createMainDataHandlers({
      settings,
      DEFAULT_SETTINGS,
      dashboardState: {},
      describeError: () => ({ log: 'err', userMessage: 'err' }),
      downloadCsv: async (url) => ({
        status: 200,
        text: url.includes('primary') ? 'PRIMARY' : 'HISTORICAL',
        etag: '',
        lastModified: '',
        signature: '',
        cacheStatus: 'network',
      }),
    });

    const result = await handlers.fetchData();

    expect(result.primaryRecords).toHaveLength(2);
    expect(result.records).toHaveLength(4);
    expect(result.records[0]).toBe(primaryExisting);
    expect(result.records[1]).not.toBe(primaryNeedsTag);
    expect(result.records[1].sourceId).toBe('primary');
    expect(result.records[2]).toBe(historicalExisting);
    expect(result.records[3]).not.toBe(historicalNeedsTag);
    expect(result.records[3].sourceId).toBe('historical');
  });

  it('supports worker partial callbacks and can skip yearly stats aggregation', async () => {
    FakeWorker.primaryPayload = {
      records: [{ arrival: new Date('2026-02-10T08:00:00'), discharge: new Date('2026-02-10T09:00:00') }],
      dailyStats: [
        {
          date: '2026-02-10',
          count: 1,
          night: 0,
          ems: 0,
          discharged: 1,
          hospitalized: 0,
          totalTime: 1,
          durations: 1,
          hospitalizedTime: 0,
          hospitalizedDurations: 0,
          avgTime: 1,
          avgHospitalizedTime: 0,
        },
      ],
      hospitalByDeptStayAgg: null,
    };
    FakeWorker.historicalPayload = {
      records: [],
      dailyStats: [],
      hospitalByDeptStayAgg: null,
    };
    FakeWorker.emitPartial = true;
    globalThis.Worker = FakeWorker;

    const settings = {
      csv: {},
      calculations: { shiftStartHour: 7, nightEndHour: 7 },
      dataSource: {
        url: 'https://example.test/primary.csv',
        historical: { enabled: true, url: 'https://example.test/historical.csv', label: 'Istorinis CSV' },
      },
    };
    const handlers = createMainDataHandlers({
      settings,
      DEFAULT_SETTINGS: {
        csv: {},
        calculations: { shiftStartHour: 7, nightEndHour: 7 },
        dataSource: settings.dataSource,
      },
      dashboardState: {},
      describeError: () => ({ log: 'err', userMessage: 'err' }),
      downloadCsv: async (url) => ({
        status: 200,
        text: url.includes('primary') ? 'PRIMARY' : 'HISTORICAL',
        etag: '',
        lastModified: '',
        signature: '',
        cacheStatus: 'network',
      }),
    });

    const primaryPartials = [];
    const historicalPartials = [];
    const result = await handlers.fetchData({
      includeYearlyStats: false,
      onPrimaryPartial: (payload) => primaryPartials.push(payload),
      onHistoricalPartial: (payload) => historicalPartials.push(payload),
    });

    expect(primaryPartials).toHaveLength(1);
    expect(primaryPartials[0]).toMatchObject({
      sourceId: 'primary',
      phase: 'dailyStatsReady',
    });
    expect(historicalPartials).toHaveLength(1);
    expect(result.yearlyStats).toEqual([]);
  });

  it('returns a deferred full-records hydrator when deferFullRecords is enabled for lite fetch profiles', async () => {
    FakeWorker.primaryPayload = {
      records: [{ arrival: new Date('2026-02-10T08:00:00'), discharge: new Date('2026-02-10T09:00:00') }],
      dailyStats: [{ date: '2026-02-10', count: 1 }],
      hospitalByDeptStayAgg: null,
    };
    FakeWorker.historicalPayload = { records: [], dailyStats: [], hospitalByDeptStayAgg: null };
    globalThis.Worker = FakeWorker;

    const settings = {
      csv: {},
      calculations: { shiftStartHour: 7, nightEndHour: 7 },
      dataSource: {
        url: 'https://example.test/primary.csv',
        historical: { enabled: false, url: '', label: 'Istorinis CSV' },
      },
    };
    const DEFAULT_SETTINGS = {
      csv: {},
      calculations: { shiftStartHour: 7, nightEndHour: 7 },
      dataSource: settings.dataSource,
    };
    const handlers = createMainDataHandlers({
      settings,
      DEFAULT_SETTINGS,
      dashboardState: {},
      describeError: () => ({ log: 'err', userMessage: 'err' }),
      downloadCsv: async () => ({
        status: 200,
        text: 'PRIMARY',
        etag: 'etag-defer-1',
        lastModified: 'lm-defer-1',
        signature: 'sig-defer-1',
        cacheStatus: 'network',
      }),
    });

    const lite = await handlers.fetchData({ fetchProfile: 'daily-lite', deferFullRecords: true });
    expect(lite.records).toEqual([]);
    expect(lite.meta.recordsState).toBe('deferred');
    expect(lite.meta.fetchProfile).toBe('daily-lite');
    expect(lite.deferredHydration).toMatchObject({
      kind: 'full-records',
      fetchProfile: 'full',
    });
    expect(typeof lite.deferredHydration.hydrate).toBe('function');

    const full = await lite.deferredHydration.hydrate();
    expect(full.records).toHaveLength(1);
    expect(full.meta.recordsState).toBe('full');
    expect(full.meta.fetchProfile).toBe('full');
  });

  it('reuses persistent transformed cache across handler instances on 304 responses', async () => {
    FakeWorker.primaryPayload = {
      records: [{ arrival: new Date('2026-02-10T08:00:00'), discharge: new Date('2026-02-10T09:00:00') }],
      dailyStats: [{ date: '2026-02-10', count: 1 }],
      hospitalByDeptStayAgg: null,
    };
    FakeWorker.historicalPayload = {
      records: [],
      dailyStats: [],
      hospitalByDeptStayAgg: null,
    };
    globalThis.Worker = FakeWorker;

    const persistentStore = new Map();
    const persistentDataCache = {
      async get(key) {
        return persistentStore.has(key) ? persistentStore.get(key) : null;
      },
      async set(key, value) {
        persistentStore.set(key, value);
      },
      async delete(key) {
        persistentStore.delete(key);
      },
    };
    const settings = {
      csv: {},
      calculations: { shiftStartHour: 7, nightEndHour: 7 },
      dataSource: {
        url: 'https://example.test/primary.csv',
        historical: { enabled: false, url: '', label: 'Istorinis CSV' },
      },
    };
    const DEFAULT_SETTINGS = {
      csv: {},
      calculations: { shiftStartHour: 7, nightEndHour: 7 },
      dataSource: settings.dataSource,
    };

    const handlers1 = createMainDataHandlers({
      settings,
      DEFAULT_SETTINGS,
      dashboardState: {},
      persistentDataCache,
      describeError: () => ({ log: 'err', userMessage: 'err' }),
      downloadCsv: async () => ({
        status: 200,
        text: 'PRIMARY',
        etag: 'etag-1',
        lastModified: 'lm-1',
        signature: 'sig-1',
        cacheStatus: 'network',
      }),
    });

    const first = await handlers1.fetchData();
    expect(first.meta.primary.cacheTier).toBe('network');
    expect(persistentStore.size).toBe(1);

    globalThis.Worker = undefined;
    const handlers2 = createMainDataHandlers({
      settings,
      DEFAULT_SETTINGS,
      dashboardState: {},
      persistentDataCache,
      describeError: () => ({ log: 'err', userMessage: 'err' }),
      downloadCsv: async (_url, { cacheInfo } = {}) => {
        expect(cacheInfo).toMatchObject({
          etag: 'etag-1',
          signature: 'sig-1',
          cacheTier: 'persistent',
        });
        return {
          status: 304,
          text: '',
          etag: 'etag-1',
          lastModified: 'lm-1',
          signature: 'sig-1',
          cacheStatus: 'not-modified',
        };
      },
    });

    const second = await handlers2.fetchData();
    expect(second.records).toHaveLength(1);
    expect(second.meta.primary.cacheTier).toBe('persistent');
    expect(second.meta.primary.schemaVersion).toBe(2);
    expect(second.meta.schemaVersion).toBe(2);
  });

  it('stores and reuses daily-lite persistent artifacts without records materialization', async () => {
    FakeWorker.primaryPayload = {
      records: [{ arrival: new Date('2026-02-10T08:00:00'), discharge: new Date('2026-02-10T09:00:00') }],
      dailyStats: [{ date: '2026-02-10', count: 1 }],
      hospitalByDeptStayAgg: { byYear: { 2026: { VIDAUS: { total: 1 } } } },
    };
    FakeWorker.historicalPayload = {
      records: [],
      dailyStats: [],
      hospitalByDeptStayAgg: null,
    };
    globalThis.Worker = FakeWorker;

    const persistentStore = new Map();
    const persistentDataCache = {
      async get(key) {
        return persistentStore.has(key) ? persistentStore.get(key) : null;
      },
      async set(key, value) {
        persistentStore.set(key, value);
      },
      async delete(key) {
        persistentStore.delete(key);
      },
    };
    const settings = {
      csv: {},
      calculations: { shiftStartHour: 7, nightEndHour: 7 },
      dataSource: {
        url: 'https://example.test/primary.csv',
        historical: { enabled: false, url: '', label: 'Istorinis CSV' },
      },
    };
    const DEFAULT_SETTINGS = {
      csv: {},
      calculations: { shiftStartHour: 7, nightEndHour: 7 },
      dataSource: settings.dataSource,
    };

    const handlers1 = createMainDataHandlers({
      settings,
      DEFAULT_SETTINGS,
      dashboardState: {},
      persistentDataCache,
      describeError: () => ({ log: 'err', userMessage: 'err' }),
      downloadCsv: async () => ({
        status: 200,
        text: 'PRIMARY',
        etag: 'etag-lite-1',
        lastModified: 'lm-lite-1',
        signature: 'sig-lite-1',
        cacheStatus: 'network',
      }),
    });

    const first = await handlers1.fetchData({ fetchProfile: 'daily-lite' });
    expect(first.records).toEqual([]);
    expect(first.dailyStats).toHaveLength(1);
    expect(first.meta.recordsState).toBe('none');
    expect(first.meta.artifactKind).toBe('daily-lite');
    expect([...persistentStore.keys()]).toEqual([
      'edDashboard:dataCache:https%3A%2F%2Fexample.test%2Fprimary.csv::daily-lite',
    ]);
    const liteEntry = persistentStore.values().next().value;
    expect(liteEntry).toMatchObject({
      schemaVersion: 2,
      artifactKind: 'daily-lite',
      records: [],
      dailyStats: [{ date: '2026-02-10', count: 1 }],
      hospitalByDeptStayAgg: null,
    });

    globalThis.Worker = undefined;
    const handlers2 = createMainDataHandlers({
      settings,
      DEFAULT_SETTINGS,
      dashboardState: {},
      persistentDataCache,
      describeError: () => ({ log: 'err', userMessage: 'err' }),
      downloadCsv: async (_url, { cacheInfo } = {}) => {
        expect(cacheInfo).toMatchObject({
          cacheTier: 'persistent',
          artifactKind: 'daily-lite',
          etag: 'etag-lite-1',
        });
        return {
          status: 304,
          text: '',
          etag: 'etag-lite-1',
          lastModified: 'lm-lite-1',
          signature: 'sig-lite-1',
          cacheStatus: 'not-modified',
        };
      },
    });

    const second = await handlers2.fetchData({ fetchProfile: 'daily-lite' });
    expect(second.records).toEqual([]);
    expect(second.dailyStats).toHaveLength(1);
    expect(second.meta.primary.cacheTier).toBe('persistent');
    expect(second.meta.primary.artifactKind).toBe('daily-lite');
    expect(second.meta.recordsState).toBe('none');
  });

  it('exposes summaries worker job helper for report view-model computation', async () => {
    FakeWorker.summariesPayload = {
      viewModels: {
        diagnosisPercentRows: [{ label: 'A00', percent: 12.5 }],
      },
    };
    globalThis.Worker = FakeWorker;

    const settings = {
      csv: {},
      calculations: { shiftStartHour: 7, nightEndHour: 7 },
      dataSource: {
        url: 'https://example.test/primary.csv',
        historical: { enabled: false, url: '', label: 'Istorinis CSV' },
      },
    };
    const handlers = createMainDataHandlers({
      settings,
      DEFAULT_SETTINGS: {
        csv: {},
        calculations: { shiftStartHour: 7, nightEndHour: 7 },
        dataSource: settings.dataSource,
      },
      dashboardState: {},
      describeError: () => ({ log: 'err', userMessage: 'err' }),
      downloadCsv: async () => ({
        status: 200,
        text: 'PRIMARY',
        etag: '',
        lastModified: '',
        signature: '',
        cacheStatus: 'network',
      }),
    });

    const result = await handlers.runSummariesWorkerJob({
      reports: { diagnosis: { totalPatients: 1, rows: [] } },
      scopeRecords: [],
      controls: { summariesReportsTopN: 15, summariesReportsMinGroupSize: 100 },
    });

    expect(result).toEqual(FakeWorker.summariesPayload);
  });

  it('reuses a stored KPI dataset handle across repeated KPI worker requests', async () => {
    globalThis.Worker = FakeWorker;
    const settings = {
      csv: {},
      calculations: { shiftStartHour: 7, nightEndHour: 7 },
      dataSource: {
        url: 'https://example.test/primary.csv',
        historical: { enabled: false, url: '', label: 'Istorinis CSV' },
      },
    };
    const handlers = createMainDataHandlers({
      settings,
      DEFAULT_SETTINGS: {
        csv: {},
        calculations: { shiftStartHour: 7, nightEndHour: 7 },
        dataSource: settings.dataSource,
      },
      dashboardState: {},
      describeError: () => ({ log: 'err', userMessage: 'err' }),
      downloadCsv: async () => ({
        status: 200,
        text: 'PRIMARY',
        etag: '',
        lastModified: '',
        signature: '',
        cacheStatus: 'network',
      }),
    });
    const records = [
      { arrival: new Date('2026-02-10T08:00:00'), discharge: new Date('2026-02-10T09:00:00') },
    ];
    const dailyStats = [{ date: '2026-02-10', count: 1 }];
    const basePayload = {
      filters: { window: 30, shift: 'all', arrival: 'all', disposition: 'all', cardType: 'all' },
      defaultFilters: { window: 30, shift: 'all', arrival: 'all', disposition: 'all', cardType: 'all' },
      windowDays: 30,
      selectedDate: '2026-02-10',
      lastShiftHourlyMetric: 'balance',
      records,
      dailyStats,
      calculations: { shiftStartHour: 7 },
      calculationDefaults: { shiftStartHour: 7, nightEndHour: 7 },
    };

    await handlers.runKpiWorkerJob(basePayload);
    await handlers.runKpiWorkerJob(basePayload);

    const storeMessages = FakeWorker.postedMessages.filter((msg) => msg?.type === 'storeDataset');
    const handleMessages = FakeWorker.postedMessages.filter((msg) => msg?.type === 'applyKpiFiltersByHandle');
    const legacyMessages = FakeWorker.postedMessages.filter((msg) => msg?.type === 'applyKpiFilters');

    expect(storeMessages).toHaveLength(1);
    expect(handleMessages).toHaveLength(2);
    expect(legacyMessages).toHaveLength(0);
    expect(handleMessages[0]).not.toHaveProperty('records');
    expect(handleMessages[0]).not.toHaveProperty('dailyStats');
    expect(handleMessages[0].selectedDate).toBe('2026-02-10');
    expect(handleMessages[0].lastShiftHourlyMetric).toBe('balance');
  });

  it('reuses a stored KPI dataset handle across KPI worker detail jobs', async () => {
    globalThis.Worker = FakeWorker;
    const settings = {
      csv: {},
      calculations: { shiftStartHour: 7, nightEndHour: 7 },
      dataSource: {
        url: 'https://example.test/primary.csv',
        historical: { enabled: false, url: '', label: 'Istorinis CSV' },
      },
    };
    const handlers = createMainDataHandlers({
      settings,
      DEFAULT_SETTINGS: {
        csv: {},
        calculations: { shiftStartHour: 7, nightEndHour: 7 },
        dataSource: settings.dataSource,
      },
      dashboardState: {},
      describeError: () => ({ log: 'err', userMessage: 'err' }),
      downloadCsv: async () => ({
        status: 200,
        text: 'PRIMARY',
        etag: '',
        lastModified: '',
        signature: '',
        cacheStatus: 'network',
      }),
    });
    const records = [
      { arrival: new Date('2026-02-10T08:00:00'), discharge: new Date('2026-02-10T09:00:00') },
    ];
    const dailyStats = [{ date: '2026-02-10', count: 1 }];
    const basePayload = {
      filters: { window: 30, shift: 'all', arrival: 'all', disposition: 'all', cardType: 'all' },
      defaultFilters: { window: 30, shift: 'all', arrival: 'all', disposition: 'all', cardType: 'all' },
      windowDays: 30,
      records,
      dailyStats,
      calculations: { shiftStartHour: 7 },
      calculationDefaults: { shiftStartHour: 7, nightEndHour: 7 },
      selectedDate: '2026-02-10',
      lastShiftHourlyMetric: 'arrivals',
    };

    await handlers.runKpiWorkerDetailJob({
      type: 'computeKpiLastShiftHourlyByHandle',
      ...basePayload,
    });
    await handlers.runKpiWorkerDetailJob({
      type: 'computeKpiLastShiftHourlyByHandle',
      ...basePayload,
      lastShiftHourlyMetric: 'balance',
    });

    const storeMessages = FakeWorker.postedMessages.filter((msg) => msg?.type === 'storeDataset');
    const detailMessages = FakeWorker.postedMessages.filter(
      (msg) => msg?.type === 'computeKpiLastShiftHourlyByHandle'
    );

    expect(storeMessages).toHaveLength(1);
    expect(detailMessages).toHaveLength(2);
    expect(detailMessages[0]).not.toHaveProperty('records');
    expect(detailMessages[0]).not.toHaveProperty('dailyStats');
    expect(detailMessages[1].lastShiftHourlyMetric).toBe('balance');
  });
});
