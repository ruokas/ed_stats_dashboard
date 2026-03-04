import { describe, expect, it } from 'vitest';
import {
  buildLastShiftHourlySeries,
  normalizeLastShiftMetric,
} from '../../src/app/runtime/kpi-flow/helpers.js';

function createDeps(dateKey = '2026-03-01') {
  return {
    buildLastShiftSummary: () => ({ dateKey, dateLabel: dateKey }),
    getSettings: () => ({ calculations: { shiftStartHour: 7 } }),
    defaultSettings: { calculations: { nightEndHour: 7 } },
    formatLocalDateKey: (date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
  };
}

function sum(values = []) {
  return values.reduce((acc, value) => acc + Number(value || 0), 0);
}

describe('normalizeLastShiftMetric', () => {
  it('accepts referral arrivals metric key', () => {
    expect(normalizeLastShiftMetric('referral_arrivals')).toBe('referral_arrivals');
  });

  it('falls back to arrivals for unknown value', () => {
    expect(normalizeLastShiftMetric('unknown')).toBe('arrivals');
  });
});

describe('buildLastShiftHourlySeries unknown discharge time handling', () => {
  it('distributes discharges without exact time evenly across all day hours', () => {
    const records = [
      {
        arrival: new Date('2026-03-01T08:30:00'),
        discharge: new Date('2026-03-01T00:00:00'),
        arrivalHasTime: true,
        dischargeHasTime: false,
        cardType: 'tr',
      },
    ];
    const dailyStats = [{ date: '2026-03-01', count: 1 }];

    const result = buildLastShiftHourlySeries(
      { records, dailyStats, metricKey: 'discharges' },
      createDeps('2026-03-01')
    );

    expect(result).not.toBeNull();
    expect(sum(result?.series?.total || [])).toBeCloseTo(1, 8);
    expect((result?.series?.total || []).every((value) => Math.abs(value - 1 / 24) < 1e-10)).toBe(true);
    expect((result?.series?.tr || [])[0]).toBeCloseTo(1 / 24, 10);
  });

  it('treats 1900-01-01 discharge as unknown-time and distributes outflow by arrival shift day', () => {
    const records = [
      {
        arrival: new Date('2026-03-01T12:15:00'),
        discharge: new Date('1900-01-01T00:00:00'),
        arrivalHasTime: true,
        dischargeHasTime: false,
        cardType: 't',
      },
    ];
    const dailyStats = [{ date: '2026-03-01', count: 1 }];

    const result = buildLastShiftHourlySeries(
      { records, dailyStats, metricKey: 'balance' },
      createDeps('2026-03-01')
    );

    expect(result).not.toBeNull();
    expect(sum(result?.series?.outflow || [])).toBeCloseTo(1, 8);
    expect((result?.series?.outflow || []).every((value) => Math.abs(value - 1 / 24) < 1e-10)).toBe(true);
  });
});
