import { describe, expect, it } from 'vitest';
import { getSummariesReportTitle } from '../../src/metrics/summaries-report.js';

describe('summaries report metrics titles', () => {
  it('resolves summaries report titles from metrics catalog', () => {
    expect(getSummariesReportTitle('diagnosis', {})).toBe('Diagnozių pasiskirstymas pagal dažnį');
    expect(getSummariesReportTitle('ageDiagnosisHeatmap', {})).toBe('Amžiaus ir diagnozių grupių ryšys');
    expect(getSummariesReportTitle('pspcDistribution', {})).toBe('Pacientų kiekiai pagal PSPC įstaigas');
  });

  it('falls back to provided card map and then key', () => {
    expect(getSummariesReportTitle('unknownCard', { unknownCard: 'Custom report' })).toBe('Custom report');
    expect(getSummariesReportTitle('unknownCard', {})).toBe('unknownCard');
  });

  it('applies settings metrics label override', () => {
    const settings = {
      metrics: {
        overrides: {
          'summaries.diagnosis': { label: 'Top diagnozės (override)' },
        },
      },
    };
    expect(getSummariesReportTitle('diagnosis', {}, settings)).toBe('Top diagnozės (override)');
  });
});
