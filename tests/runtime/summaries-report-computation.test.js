import { describe, expect, test } from 'vitest';
import {
  computeReferralHospitalizedShareByPspcDetailed,
  sortPspcRows,
} from '../../src/app/runtime/runtimes/summaries/report-computation.js';

describe('summaries report computation helpers', () => {
  test('sortPspcRows sorts by share and total with lt fallback', () => {
    const rows = [
      { label: 'B', share: 0.5, referredTotal: 10 },
      { label: 'A', share: 0.5, referredTotal: 15 },
      { label: 'C', share: 0.2, referredTotal: 30 },
    ];

    const desc = sortPspcRows(rows, 'desc').map((row) => row.label);
    const asc = sortPspcRows(rows, 'asc').map((row) => row.label);

    expect(desc).toEqual(['A', 'B', 'C']);
    expect(asc).toEqual(['C', 'B', 'A']);
  });

  test('computeReferralHospitalizedShareByPspcDetailed filters non-referral and missing labels', () => {
    const records = [
      { referral: 'su siuntimu', pspc: 'Vilniaus PSPC', hospitalized: true },
      { referral: 'su siuntimu', pspc: 'Vilniaus PSPC', hospitalized: false },
      { referral: 'be siuntimo', pspc: 'Vilniaus PSPC', hospitalized: true },
      { referral: 'su siuntimu', pspc: '', hospitalized: true },
      null,
    ];

    const result = computeReferralHospitalizedShareByPspcDetailed(records);
    const row = result.rows.find((item) => item.label === 'Vilniaus PSPC');

    expect(result.totalReferred).toBe(2);
    expect(row).toBeTruthy();
    expect(row.referredTotal).toBe(2);
    expect(row.hospitalizedCount).toBe(1);
    expect(row.percent).toBe(50);
  });
});
