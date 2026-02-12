import { describe, expect, test } from 'vitest';
import {
  computeDoctorLeaderboard,
  computeDoctorMonthlyTrend,
  computeDoctorYearlyMatrix,
} from '../../src/data/stats.js';

function createRecord({ doctor, arrival, discharge, hospitalized = false, night = false }) {
  return {
    sourceId: 'historical',
    hasExtendedHistoricalFields: true,
    closingDoctorNorm: doctor,
    arrival: new Date(arrival),
    discharge: new Date(discharge),
    hospitalized,
    night,
  };
}

describe('doctor stats', () => {
  const records = [
    createRecord({
      doctor: 'jonas jonaitis',
      arrival: '2025-01-03T08:00:00',
      discharge: '2025-01-03T10:00:00',
      hospitalized: true,
    }),
    createRecord({
      doctor: 'jonas jonaitis',
      arrival: '2025-01-05T20:00:00',
      discharge: '2025-01-05T22:00:00',
      night: true,
    }),
    createRecord({
      doctor: 'ona onaite',
      arrival: '2025-02-10T09:00:00',
      discharge: '2025-02-10T12:00:00',
      hospitalized: true,
    }),
    createRecord({ doctor: 'ona onaite', arrival: '2026-01-10T09:00:00', discharge: '2026-01-10T11:00:00' }),
  ];

  test('computeDoctorLeaderboard returns pseudonymized aliases and kpis', () => {
    const result = computeDoctorLeaderboard(records, {
      yearFilter: 'all',
      topN: 10,
      minCases: 1,
      calculations: { shiftStartHour: 7 },
      defaultSettings: { calculations: { nightEndHour: 7 } },
    });

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].alias).toMatch(/^Gyd\. /);
    expect(result.rows[0].alias.includes('jonas')).toBe(false);
    expect(result.kpis.activeDoctors).toBe(2);
    expect(result.coverage.total).toBe(4);
    expect(result.coverage.withDoctor).toBe(4);
  });

  test('yearly matrix and monthly trend are produced', () => {
    const yearly = computeDoctorYearlyMatrix(records, {
      topN: 5,
      calculations: { shiftStartHour: 7 },
      defaultSettings: { calculations: { nightEndHour: 7 } },
    });
    expect(yearly.years).toEqual(['2025', '2026']);
    expect(yearly.rows.length).toBeGreaterThan(0);

    const trend = computeDoctorMonthlyTrend(records, {
      topN: 5,
      minCases: 1,
      selectedDoctor: '__top3__',
      calculations: { shiftStartHour: 7 },
      defaultSettings: { calculations: { nightEndHour: 7 } },
    });
    expect(trend.months).toContain('2025-01');
    expect(trend.series.length).toBeGreaterThan(0);
  });
});
