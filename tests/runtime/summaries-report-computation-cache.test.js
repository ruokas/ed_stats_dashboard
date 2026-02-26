import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  computeDiagnosisFrequency: vi.fn(() => ({ rows: [{ label: 'A00', count: 1 }] })),
  computeAgeDiagnosisHeatmap: vi.fn(() => ({ rows: [{ x: 0, y: 0, v: 1 }] })),
  computeDiagnosisCodeYearlyShare: vi.fn(() => ({ years: ['2024'], rows: [] })),
  computeReferralYearlyTrend: vi.fn(() => ({ years: ['2024'], rows: [] })),
  computeReferralDispositionYearlyTrend: vi.fn(() => ({ years: ['2024'], rows: [] })),
  computeReferralMonthlyHeatmap: vi.fn(() => ({ rows: [] })),
  computePspcReferralHospitalizationCorrelation: vi.fn(() => ({ rows: [] })),
  computePspcDistribution: vi.fn(() => ({ rows: [] })),
  collapseSmallGroups: vi.fn((rows) => rows),
  scopeExtendedHistoricalRecords: vi.fn(() => ({
    records: [{ id: 'scoped-record' }],
    yearOptions: ['2024'],
    yearFilter: '2024',
    shiftStartHour: 7,
    coverage: { total: 1, extended: 1 },
  })),
}));

vi.mock('../../src/data/stats.js', () => ({
  computeDiagnosisFrequency: mocks.computeDiagnosisFrequency,
  computeAgeDiagnosisHeatmap: mocks.computeAgeDiagnosisHeatmap,
  computeDiagnosisCodeYearlyShare: mocks.computeDiagnosisCodeYearlyShare,
  computeReferralYearlyTrend: mocks.computeReferralYearlyTrend,
  computeReferralDispositionYearlyTrend: mocks.computeReferralDispositionYearlyTrend,
  computeReferralMonthlyHeatmap: mocks.computeReferralMonthlyHeatmap,
  computePspcReferralHospitalizationCorrelation: mocks.computePspcReferralHospitalizationCorrelation,
  computePspcDistribution: mocks.computePspcDistribution,
  collapseSmallGroups: mocks.collapseSmallGroups,
  scopeExtendedHistoricalRecords: mocks.scopeExtendedHistoricalRecords,
}));

import {
  extractHistoricalRecords,
  getReportsComputation,
  getScopedReportsMeta,
} from '../../src/app/runtime/runtimes/summaries/report-computation.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('report computation caching helpers', () => {
  it('extractHistoricalRecords prefers explicit source tag and caches by rawRecords reference', () => {
    const historical = { sourceId: 'historical', id: 1 };
    const nonHistorical = { sourceId: 'primary', id: 2, hasExtendedHistoricalFields: true };
    const dashboardState = {
      rawRecords: [nonHistorical, historical],
      summariesHistoricalRecordsCache: { recordsRef: null, records: [] },
    };

    const first = extractHistoricalRecords(dashboardState);
    const second = extractHistoricalRecords(dashboardState);

    expect(first).toEqual([historical]);
    expect(second).toBe(first);
  });

  it('extractHistoricalRecords falls back to extended fields when source tags are missing', () => {
    const dashboardState = {
      rawRecords: [
        { id: 1, hasExtendedHistoricalFields: true },
        { id: 2, hasExtendedHistoricalFields: false },
      ],
      summariesHistoricalRecordsCache: { recordsRef: null, records: [] },
    };
    const records = extractHistoricalRecords(dashboardState);
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe(1);
  });

  it('getReportsComputation caches derived report models for same records+key', () => {
    const historicalRecords = [
      { referral: 'su siuntimu', pspc: 'Vilniaus PSPC', hospitalized: true, arrival: new Date('2024-01-01') },
    ];
    const dashboardState = {
      summariesReportsYear: 'all',
      summariesReportsTopN: 15,
      summariesReportsMinGroupSize: 100,
      summariesReferralPspcSort: 'desc',
      summariesReportsComputationCache: { recordsRef: null, key: '', value: null },
    };
    const settings = { calculations: { shiftStartHour: 7 } };
    const scopeMeta = {
      records: historicalRecords,
      yearOptions: ['2024'],
      yearFilter: 'all',
      shiftStartHour: 7,
      coverage: { total: 1, extended: 1 },
    };

    const first = getReportsComputation(dashboardState, settings, historicalRecords, scopeMeta);
    const second = getReportsComputation(dashboardState, settings, historicalRecords, scopeMeta);

    expect(first).toBe(second);
    expect(mocks.computeDiagnosisFrequency).toHaveBeenCalledTimes(1);
    expect(mocks.computeAgeDiagnosisHeatmap).toHaveBeenCalledTimes(1);
    expect(mocks.computeDiagnosisCodeYearlyShare).toHaveBeenCalledTimes(1);
    expect(mocks.computeReferralYearlyTrend).toHaveBeenCalledTimes(0);
    expect(mocks.computeReferralDispositionYearlyTrend).toHaveBeenCalledTimes(0);
    expect(mocks.computeReferralMonthlyHeatmap).toHaveBeenCalledTimes(0);
    expect(mocks.computePspcReferralHospitalizationCorrelation).toHaveBeenCalledTimes(0);
    expect(mocks.computePspcDistribution).toHaveBeenCalledTimes(0);
  });

  it('getReportsComputation does not invalidate cache on PSPC sort-only changes', () => {
    const historicalRecords = [
      { referral: 'su siuntimu', pspc: 'Vilniaus PSPC', hospitalized: true, arrival: new Date('2024-01-01') },
    ];
    const dashboardState = {
      summariesReportsYear: 'all',
      summariesReportsTopN: 15,
      summariesReportsMinGroupSize: 100,
      summariesReferralPspcSort: 'desc',
      summariesReportsComputationCache: { recordsRef: null, key: '', value: null },
    };
    const settings = { calculations: { shiftStartHour: 7 } };
    const scopeMeta = {
      records: historicalRecords,
      yearOptions: ['2024'],
      yearFilter: 'all',
      shiftStartHour: 7,
      coverage: { total: 1, extended: 1 },
    };

    const first = getReportsComputation(dashboardState, settings, historicalRecords, scopeMeta);
    dashboardState.summariesReferralPspcSort = 'asc';
    const second = getReportsComputation(dashboardState, settings, historicalRecords, scopeMeta);

    expect(second).toBe(first);
    expect(mocks.computeDiagnosisFrequency).toHaveBeenCalledTimes(1);
    expect(mocks.computeAgeDiagnosisHeatmap).toHaveBeenCalledTimes(1);
    expect(mocks.computeDiagnosisCodeYearlyShare).toHaveBeenCalledTimes(1);
  });

  it('getScopedReportsMeta caches by year and invalidates on records reference change', () => {
    const settings = { calculations: { shiftStartHour: 7 } };
    const historicalRecords = [{ id: 1 }];
    const dashboardState = {
      summariesReportsScopeCache: {
        recordsRef: null,
        byYear: new Map(),
      },
    };

    const first = getScopedReportsMeta(dashboardState, settings, historicalRecords, '2024');
    const second = getScopedReportsMeta(dashboardState, settings, historicalRecords, '2024');
    const third = getScopedReportsMeta(dashboardState, settings, historicalRecords, '2025');
    const nextRecords = [{ id: 2 }];
    const fourth = getScopedReportsMeta(dashboardState, settings, nextRecords, '2024');

    expect(first).toBe(second);
    expect(third).toBeTruthy();
    expect(fourth).toBeTruthy();
    expect(mocks.scopeExtendedHistoricalRecords).toHaveBeenCalledTimes(3);
  });
});
