import { describe, expect, it } from 'vitest';
import { resolveMetric } from '../../src/metrics/resolve-metric.js';

describe('resolveMetric', () => {
  it('returns metric values from lastShiftSummary registry', () => {
    const result = resolveMetric({
      metricId: 'total',
      context: {
        lastShiftSummary: {
          metrics: {
            total: { value: 12, average: 10, share: null, averageShare: null },
          },
        },
      },
      formatValue: (value) => String(value),
    });

    expect(result.status).toBe('ok');
    expect(result.value).toBe(12);
    expect(result.average).toBe(10);
    expect(result.label).toBe('Atvykę');
  });

  it('returns unknown_metric for unknown ids', () => {
    const result = resolveMetric({ metricId: 'does-not-exist' });
    expect(result.status).toBe('unknown_metric');
  });

  it('returns no_data when summary has no value', () => {
    const result = resolveMetric({
      metricId: 'total',
      context: { lastShiftSummary: { metrics: {} } },
    });
    expect(result.status).toBe('no_data');
  });
});
