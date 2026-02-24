import { describe, expect, it, vi } from 'vitest';

import {
  computeSummariesReportViewModels,
  getCachedSummariesReportViewModels,
} from '../../src/app/runtime/runtimes/summaries-runtime-impl.js';

function createReportsFixture() {
  return {
    diagnosis: {
      totalPatients: 20,
      rows: [
        { label: 'A00', count: 10 },
        { label: 'B00', count: 5 },
        { label: 'Kita / maža imtis', count: 5 },
      ],
    },
    referralHospitalizedByPspcYearly: {
      years: ['2024'],
      rows: [
        {
          label: 'Clinic A',
          totalReferred: 180,
          yearly: [{ year: '2024', referredTotal: 180, hospitalizedCount: 80 }],
        },
        {
          label: 'Clinic B',
          totalReferred: 80,
          yearly: [{ year: '2024', referredTotal: 80, hospitalizedCount: 20 }],
        },
      ],
    },
    pspcCorrelation: {
      rows: [
        {
          label: 'Clinic A',
          referralShare: 0.4,
          hospitalizedShare: 0.25,
          total: 100,
          referred: 40,
          hospitalized: 25,
        },
      ],
    },
    pspcDistribution: {
      total: 100,
      rows: [
        { label: 'Clinic A', count: 60 },
        { label: 'Kita / maža imtis', count: 40 },
      ],
    },
    z769Trend: {
      rows: [{ year: '2024', share: 0.1 }],
    },
    referralTrend: {
      rows: [{ year: '2024', total: 100, values: { 'su siuntimu': 30 } }],
    },
  };
}

describe('summaries report view-model caching', () => {
  it('computes heavy derived models and caches by records/key', () => {
    const dashboardState = {
      summariesReportsYear: 'all',
      summariesReportsTopN: 15,
      summariesReportsMinGroupSize: 100,
      summariesReferralPspcSort: 'desc',
      summariesReportsDerivedCache: { recordsRef: null, key: '', value: null },
    };
    const settings = { calculations: { shiftStartHour: 7 } };
    const historicalRecords = [{ id: 1 }];
    const scopeMeta = { records: [{ id: 'scope-1' }, { id: 'scope-2' }] };
    const reports = createReportsFixture();
    const computeAgeDistributionBySexFn = vi.fn(() => ({
      total: 2,
      sexOrder: ['Vyras', 'Moteris', 'Kita/Nenurodyta'],
      rows: [
        { label: '18-34', total: 1, bySex: { Vyras: 1, Moteris: 0, 'Kita/Nenurodyta': 0 } },
        { label: 'Nenurodyta', total: 1, bySex: { Vyras: 0, Moteris: 0, 'Kita/Nenurodyta': 1 } },
      ],
    }));
    const computeReferralHospitalizedShareByPspcDetailedFn = vi.fn(() => ({
      rows: [
        { label: 'Clinic A', referredTotal: 180, hospitalizedCount: 80, share: 0.44, percent: 44 },
        { label: 'Clinic B', referredTotal: 80, hospitalizedCount: 20, share: 0.25, percent: 25 },
      ],
    }));

    const first = getCachedSummariesReportViewModels(
      { dashboardState, settings, historicalRecords, scopeMeta, reports },
      { computeAgeDistributionBySexFn, computeReferralHospitalizedShareByPspcDetailedFn }
    );
    const second = getCachedSummariesReportViewModels(
      { dashboardState, settings, historicalRecords, scopeMeta, reports },
      { computeAgeDistributionBySexFn, computeReferralHospitalizedShareByPspcDetailedFn }
    );

    expect(second).toBe(first);
    expect(computeAgeDistributionBySexFn).toHaveBeenCalledTimes(1);
    expect(computeReferralHospitalizedShareByPspcDetailedFn).toHaveBeenCalledTimes(1);
    expect(first.ageDistributionRows).toHaveLength(1);
    expect(first.referralHospitalizedPspcTrendOptions).toEqual(['Clinic A']);
    expect(first.pspcPercentRows).toHaveLength(1);
    expect(first.z769Rows[0].percent).toBe(10);
    expect(first.referralPercentRows[0].percent).toBe(30);
  });

  it('invalidates cached derived models when controls affecting key change', () => {
    const dashboardState = {
      summariesReportsYear: 'all',
      summariesReportsTopN: 15,
      summariesReportsMinGroupSize: 100,
      summariesReferralPspcSort: 'desc',
      summariesReportsDerivedCache: { recordsRef: null, key: '', value: null },
    };
    const settings = { calculations: { shiftStartHour: 7 } };
    const historicalRecords = [{ id: 1 }];
    const scopeMeta = { records: [{ id: 'scope-1' }] };
    const reports = createReportsFixture();
    const computeAgeDistributionBySexFn = vi.fn(() => ({ total: 0, sexOrder: [], rows: [] }));
    const computeReferralHospitalizedShareByPspcDetailedFn = vi.fn(() => ({ rows: [] }));

    const first = getCachedSummariesReportViewModels(
      { dashboardState, settings, historicalRecords, scopeMeta, reports },
      { computeAgeDistributionBySexFn, computeReferralHospitalizedShareByPspcDetailedFn }
    );
    dashboardState.summariesReportsMinGroupSize = 200;
    const second = getCachedSummariesReportViewModels(
      { dashboardState, settings, historicalRecords, scopeMeta, reports },
      { computeAgeDistributionBySexFn, computeReferralHospitalizedShareByPspcDetailedFn }
    );

    expect(second).not.toBe(first);
    expect(computeAgeDistributionBySexFn).toHaveBeenCalledTimes(2);
    expect(computeReferralHospitalizedShareByPspcDetailedFn).toHaveBeenCalledTimes(2);
  });

  it('produces stable shape without cache helper', () => {
    const model = computeSummariesReportViewModels(
      {
        dashboardState: {
          summariesReportsTopN: 10,
          summariesReportsMinGroupSize: 50,
          summariesReferralPspcSort: 'asc',
        },
        reports: createReportsFixture(),
        scopeMeta: { records: [] },
      },
      {
        computeAgeDistributionBySexFn: () => ({ total: 0, sexOrder: [], rows: [] }),
        computeReferralHospitalizedShareByPspcDetailedFn: () => ({ rows: [] }),
      }
    );

    expect(model).toMatchObject({
      diagnosisPercentRows: expect.any(Array),
      ageDistributionBySex: expect.any(Object),
      ageDistributionRows: expect.any(Array),
      referralHospitalizedPspcTrendCandidates: expect.any(Array),
      pspcCorrelationRows: expect.any(Array),
      pspcPercentRows: expect.any(Array),
      z769Rows: expect.any(Array),
      referralPercentRows: expect.any(Array),
    });
  });
});
