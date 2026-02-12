import { describe, expect, test } from 'vitest';
import {
  computeDoctorLeaderboard,
  computeDoctorMonthlyTrend,
  computeDoctorYearlyMatrix,
} from '../../src/data/stats.js';

function createRecord({
  doctor,
  arrival,
  discharge,
  hospitalized = false,
  night = false,
  ems = false,
  diagnosisGroup = 'I',
}) {
  return {
    sourceId: 'historical',
    hasExtendedHistoricalFields: true,
    closingDoctorNorm: doctor,
    closingDoctorRaw: doctor,
    arrival: new Date(arrival),
    discharge: new Date(discharge),
    hospitalized,
    night,
    ems,
    diagnosisGroup,
  };
}

describe('doctor stats', () => {
  const records = [
    createRecord({
      doctor: 'jonas jonaitis',
      arrival: '2025-01-03T08:00:00',
      discharge: '2025-01-03T10:00:00',
      hospitalized: true,
      ems: true,
      diagnosisGroup: 'I',
    }),
    createRecord({
      doctor: 'jonas jonaitis',
      arrival: '2025-01-05T20:00:00',
      discharge: '2025-01-05T22:00:00',
      night: true,
      diagnosisGroup: 'I',
    }),
    createRecord({
      doctor: 'ona onaite',
      arrival: '2025-02-10T09:00:00',
      discharge: '2025-02-10T12:00:00',
      hospitalized: true,
      diagnosisGroup: 'J',
    }),
    createRecord({
      doctor: 'ona onaite',
      arrival: '2026-01-10T09:00:00',
      discharge: '2026-01-10T11:00:00',
      diagnosisGroup: 'J',
    }),
    createRecord({
      doctor: 'jonas jonaitis',
      arrival: '2026-02-10T09:00:00',
      discharge: '2026-02-12T12:00:00',
      diagnosisGroup: 'I',
    }),
  ];

  test('computeDoctorLeaderboard returns real doctor labels and kpis', () => {
    const result = computeDoctorLeaderboard(records, {
      yearFilter: 'all',
      topN: 10,
      minCases: 1,
      calculations: { shiftStartHour: 7 },
      defaultSettings: { calculations: { nightEndHour: 7 } },
    });

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].alias).toBeTruthy();
    expect(result.rows.some((row) => String(row.alias).toLowerCase().includes('jonas'))).toBe(true);
    expect(result.kpis.activeDoctors).toBe(2);
    expect(result.coverage.total).toBe(5);
    expect(result.coverage.withDoctor).toBe(5);
    expect(result.rows[0].losGt16Share).toBeGreaterThanOrEqual(0);
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

  test('filters and empty-state scenario are handled', () => {
    const filtered = computeDoctorLeaderboard(records, {
      topN: 10,
      minCases: 1,
      arrivalFilter: 'ems',
      dispositionFilter: 'hospitalized',
      shiftFilter: 'day',
      diagnosisGroupFilter: 'I',
      searchQuery: 'jonas',
      calculations: { shiftStartHour: 7 },
      defaultSettings: { calculations: { nightEndHour: 7 } },
    });
    expect(filtered.rows).toHaveLength(1);
    expect(filtered.rows[0].alias.toLowerCase()).toContain('jonas');

    const empty = computeDoctorLeaderboard(records, {
      topN: 10,
      minCases: 1,
      arrivalFilter: 'ems',
      dispositionFilter: 'discharged',
      shiftFilter: 'night',
      diagnosisGroupFilter: 'J',
      calculations: { shiftStartHour: 7 },
      defaultSettings: { calculations: { nightEndHour: 7 } },
    });
    expect(empty.rows).toHaveLength(0);
    expect(empty.kpis.activeDoctors).toBe(0);
    expect(empty.totalCasesWithDoctor).toBe(0);
  });
});
