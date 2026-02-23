import { describe, expect, it } from 'vitest';
import { computeAgeDiagnosisHeatmap, computeDiagnosisFrequency } from '../../src/data/stats.js';

function record({ ageBand, diagnosisCodes, diagnosisGroups, arrival = '2026-02-10T08:00:00' }) {
  return {
    hasExtendedHistoricalFields: true,
    ageBand,
    diagnosisCodes,
    diagnosisGroups,
    arrival: new Date(arrival),
    discharge: new Date('2026-02-10T09:00:00'),
  };
}

describe('stats diagnosis computation', () => {
  it('deduplicates diagnosis codes per patient and applies prefix exclusion', () => {
    const result = computeDiagnosisFrequency(
      [
        record({ ageBand: '18-34', diagnosisCodes: ['a00', 'A00', 'B10', ' Z99 '] }),
        record({ ageBand: '35-49', diagnosisCodes: ['B10', 'B10'] }),
        record({ ageBand: '50-64', diagnosisCodes: [] }),
      ],
      { excludePrefixes: ['Z'], topN: 10 }
    );

    const byLabel = new Map(result.rows.map((row) => [row.label, row.count]));
    expect(byLabel.get('A00')).toBe(1);
    expect(byLabel.get('B10')).toBe(2);
    expect(byLabel.get('Nenurodyta')).toBe(1);
    expect(byLabel.has('Z99')).toBe(false);
  });

  it('builds age/diagnosis heatmap with same exclusion and dedupe behavior', () => {
    const result = computeAgeDiagnosisHeatmap(
      [
        record({
          ageBand: '18-34',
          diagnosisGroups: ['A-B', 'A-B', 'Z'],
          diagnosisCodes: ['A00'],
        }),
        record({
          ageBand: '35-49',
          diagnosisGroups: [],
          diagnosisCodes: ['C12', 'C13', 'Z20'],
        }),
      ],
      { excludePrefixes: ['Z'], topN: 10 }
    );

    const getCell = (ageBand, group) =>
      result.rows.find((row) => row.ageBand === ageBand && row.diagnosisGroup === group)?.count ?? 0;

    expect(result.diagnosisGroups).toContain('A-B');
    expect(result.diagnosisGroups).toContain('C');
    expect(getCell('18-34', 'A-B')).toBe(1);
    expect(getCell('35-49', 'C')).toBe(1);
  });
});
