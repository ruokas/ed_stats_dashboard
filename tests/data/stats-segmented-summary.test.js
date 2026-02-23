import { describe, expect, it } from 'vitest';
import { computeSegmentedSummaryStats } from '../../src/data/stats.js';

function createRecord({ pspc, arrival, discharge, hospitalized, ems = false, referred = true }) {
  return {
    pspc,
    arrival: new Date(arrival),
    discharge: new Date(discharge),
    hospitalized,
    ems,
    referred,
  };
}

describe('computeSegmentedSummaryStats insights', () => {
  it('ignores merged small-group row in insight leaders', () => {
    const records = [
      createRecord({
        pspc: 'A',
        arrival: '2026-01-01T08:00:00',
        discharge: '2026-01-01T10:00:00',
        hospitalized: true,
      }),
      createRecord({
        pspc: 'A',
        arrival: '2026-01-02T08:00:00',
        discharge: '2026-01-02T11:00:00',
        hospitalized: false,
      }),
      createRecord({
        pspc: 'B',
        arrival: '2026-01-01T09:00:00',
        discharge: '2026-01-01T14:00:00',
        hospitalized: true,
      }),
      createRecord({
        pspc: 'B',
        arrival: '2026-01-03T09:00:00',
        discharge: '2026-01-03T15:00:00',
        hospitalized: true,
      }),
      createRecord({
        pspc: 'B',
        arrival: '2026-01-04T09:00:00',
        discharge: '2026-01-04T16:00:00',
        hospitalized: false,
      }),
      createRecord({
        pspc: 'C',
        arrival: '2026-01-05T09:00:00',
        discharge: '2026-01-05T23:00:00',
        hospitalized: true,
      }),
    ];

    const result = computeSegmentedSummaryStats(records, {
      segmentBy: 'pspc',
      minGroupSize: 2,
    });

    expect(result.rows.some((row) => row.label === 'Kita / maža imtis')).toBe(true);
    expect(result.insights.largestGroup?.label).toBe('B');
    expect(result.insights.longestStay?.label).toBe('B');
    expect(result.insights.highestHospitalizedShare?.label).toBe('B');
  });
});
