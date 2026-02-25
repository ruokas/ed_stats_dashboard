import { describe, expect, test } from 'vitest';
import {
  computeDoctorComparisonPanel,
  computeDoctorKpiDeltas,
  computeDoctorLeaderboard,
  computeDoctorMoMChanges,
  computeDoctorMonthlyTrend,
  computeDoctorSpecialtyLeaderboard,
  computeDoctorYearlyMatrix,
  computeDoctorYearlySmallMultiples,
  createStatsComputeContext,
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

  const doctorSpecialtyResolver = {
    resolveSpecialtyForRecord(record) {
      const doctor = String(record?.closingDoctorNorm || '');
      const arrival = record?.arrival instanceof Date ? record.arrival : null;
      const year = arrival ? arrival.getFullYear() : null;
      if (doctor === 'jonas jonaitis') {
        return year === 2025
          ? { id: 'resident', label: 'Resident' }
          : { id: 'emergency', label: 'Emergency' };
      }
      if (doctor === 'ona onaite') {
        return { id: 'surgery', label: 'Surgery' };
      }
      return null;
    },
  };

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

  test('supports specialty grouping and specialty filter', () => {
    const grouped = computeDoctorSpecialtyLeaderboard(records, {
      minCases: 1,
      doctorSpecialtyResolver,
      calculations: { shiftStartHour: 7 },
      defaultSettings: { calculations: { nightEndHour: 7 } },
    });
    expect(grouped.rows.map((row) => row.specialtyId).sort()).toEqual(['emergency', 'resident', 'surgery']);
    expect(grouped.rows.find((row) => row.specialtyId === 'emergency')?.count).toBe(1);
    expect(grouped.rows.find((row) => row.specialtyId === 'resident')?.count).toBe(2);
    expect(grouped.rows.find((row) => row.specialtyId === 'surgery')?.count).toBe(2);

    const filtered = computeDoctorLeaderboard(records, {
      topN: 10,
      minCases: 1,
      specialtyFilter: 'resident',
      doctorSpecialtyResolver,
      calculations: { shiftStartHour: 7 },
      defaultSettings: { calculations: { nightEndHour: 7 } },
    });
    expect(filtered.rows).toHaveLength(1);
    expect(filtered.rows[0].alias.toLowerCase()).toContain('jonas');
    expect(filtered.totalCasesWithDoctor).toBe(2);
  });

  test('can exclude unmapped cases from doctor stats when specialty mode requires mapping', () => {
    const partialResolver = {
      resolveSpecialtyForRecord(record) {
        return String(record?.closingDoctorNorm || '') === 'jonas jonaitis'
          ? { id: 'emergency', label: 'Emergency' }
          : null;
      },
    };
    const result = computeDoctorLeaderboard(records, {
      topN: 10,
      minCases: 1,
      requireMappedSpecialty: true,
      doctorSpecialtyResolver: partialResolver,
      calculations: { shiftStartHour: 7 },
      defaultSettings: { calculations: { nightEndHour: 7 } },
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].alias.toLowerCase()).toContain('jonas');
    expect(result.totalCasesWithDoctor).toBe(3);
  });

  test('computes MoM for top doctors with both metrics', () => {
    const mom = computeDoctorMoMChanges(records, {
      topN: 5,
      minCases: 1,
      calculations: { shiftStartHour: 7 },
      defaultSettings: { calculations: { nightEndHour: 7 } },
    });
    expect(mom.currentMonth).toBeTruthy();
    expect(mom.previousMonth).toBeTruthy();
    expect(mom.rows.length).toBeGreaterThan(0);
    expect('casesMoMPct' in mom.rows[0]).toBe(true);
    expect('avgLosMoMPct' in mom.rows[0]).toBe(true);
  });

  test('builds selected doctor vs overall comparison model', () => {
    const comparison = computeDoctorComparisonPanel(records, {
      selectedDoctor: 'jonas jonaitis',
      minCases: 1,
      calculations: { shiftStartHour: 7 },
      defaultSettings: { calculations: { nightEndHour: 7 } },
    });
    expect(comparison.hasSelection).toBe(true);
    expect(comparison.selectedAlias.toLowerCase()).toContain('jonas');
    expect(comparison.overallAverage).toBeTruthy();
    expect(comparison.delta).toBeTruthy();
  });

  test('computes KPI deltas against baseline', () => {
    const deltaModel = computeDoctorKpiDeltas(records, {
      topN: 5,
      minCases: 1,
      calculations: { shiftStartHour: 7 },
      defaultSettings: { calculations: { nightEndHour: 7 } },
    });
    expect(deltaModel.current).toBeTruthy();
    expect(deltaModel.baseline).toBeTruthy();
    expect(deltaModel.delta).toBeTruthy();
    expect(deltaModel.delta.activeDoctors).toBeTypeOf('number');
  });

  test('reuses provided doctorAggregate without reading records', () => {
    const poisonRecords = new Proxy([], {
      get() {
        throw new Error('records should not be read when doctorAggregate is provided');
      },
    });
    const doctorAggregate = {
      meta: {
        filtered: [{}, {}],
        coverage: { total: 2, withDoctor: 2, filtered: 2, percent: 100 },
        yearOptions: ['2025'],
        diagnosisGroupOptions: ['I'],
      },
      rowsAll: [
        {
          alias: 'jonas jonaitis',
          count: 2,
          share: 1,
          avgLosHours: 2,
          medianLosHours: 2,
          hospitalizedShare: 0.5,
          nightShare: 0.5,
          dayShare: 0.5,
          losLt4Share: 1,
          los4to8Share: 0,
          los8to16Share: 0,
          losGt16Share: 0,
        },
      ],
      rowsSortedByVolume: [],
      pooledLos: [1, 3],
      monthlyByAlias: new Map(),
      months: [],
    };

    const result = computeDoctorKpiDeltas(poisonRecords, {
      doctorAggregate,
      minCases: 1,
      topN: 5,
    });

    expect(result.current.activeDoctors).toBe(1);
    expect(result.baseline.activeDoctors).toBe(1);
    expect(result.baseline.medianLosHours).toBe(2);
  });

  test('produces equivalent doctor outputs when reusing a shared compute context', () => {
    const baseOptions = {
      topN: 5,
      minCases: 1,
      calculations: { shiftStartHour: 7 },
      defaultSettings: { calculations: { nightEndHour: 7 } },
    };
    const baseline = {
      leaderboard: computeDoctorLeaderboard(records, baseOptions),
      trend: computeDoctorMonthlyTrend(records, { ...baseOptions, selectedDoctor: '__top3__' }),
      mom: computeDoctorMoMChanges(records, baseOptions),
      delta: computeDoctorKpiDeltas(records, baseOptions),
    };
    const computeContext = createStatsComputeContext();
    const sharedOptions = { ...baseOptions, computeContext };
    const reused = {
      leaderboard: computeDoctorLeaderboard(records, sharedOptions),
      trend: computeDoctorMonthlyTrend(records, { ...sharedOptions, selectedDoctor: '__top3__' }),
      mom: computeDoctorMoMChanges(records, sharedOptions),
      delta: computeDoctorKpiDeltas(records, sharedOptions),
    };

    expect(reused).toEqual(baseline);
  });

  test('computes yearly small-multiples cards with YoY metadata', () => {
    const annual = computeDoctorYearlySmallMultiples(records, {
      topN: 5,
      minCases: 1,
      minYearCount: 2,
      metric: 'count',
      yearScope: 'all_years',
      selectedDoctors: ['jonas jonaitis', 'ona onaite'],
      calculations: { shiftStartHour: 7 },
      defaultSettings: { calculations: { nightEndHour: 7 } },
    });
    expect(annual.years).toEqual(['2025', '2026']);
    expect(annual.cards.length).toBeGreaterThan(0);
    expect(annual.cards[0].points.length).toBe(2);
    expect(['up', 'down', 'flat', 'na']).toContain(annual.cards[0].trend);
    expect(annual.meta.metric).toBe('count');
  });

  test('yearly small-multiples requires explicit doctor selection', () => {
    const annual = computeDoctorYearlySmallMultiples(records, {
      topN: 5,
      minCases: 1,
      minYearCount: 2,
      metric: 'count',
      yearScope: 'all_years',
      calculations: { shiftStartHour: 7 },
      defaultSettings: { calculations: { nightEndHour: 7 } },
    });
    expect(annual.cards).toHaveLength(0);
    expect(annual.meta.requiresSelection).toBe(true);
    expect(annual.meta.availableDoctors.length).toBeGreaterThan(0);
  });
});
