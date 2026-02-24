import { afterEach, describe, expect, it } from 'vitest';
import { createMainDataHandlers } from '../../src/data/main-data.js';

class FakeWorker {
  constructor() {
    this.listeners = { message: [], error: [] };
  }

  addEventListener(type, cb) {
    if (this.listeners[type]) {
      this.listeners[type].push(cb);
    }
  }

  terminate() {}

  postMessage(message) {
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
});
