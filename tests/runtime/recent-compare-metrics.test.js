import { describe, expect, it } from 'vitest';
import { getRecentCompareMetricLabel } from '../../src/metrics/recent-compare.js';

describe('recent compare metrics labels', () => {
  it('resolves labels from metrics catalog surface metadata', () => {
    expect(getRecentCompareMetricLabel('total', {})).toBe('Pacientai');
    expect(getRecentCompareMetricLabel('avgStay', {})).toBe('Vid. buvimo trukmė (val.)');
    expect(getRecentCompareMetricLabel('emsShare', {})).toBe('GMP dalis');
    expect(getRecentCompareMetricLabel('hospShare', {})).toBe('Hospitalizacijų dalis');
  });

  it('falls back to provided labels or key', () => {
    expect(getRecentCompareMetricLabel('unknown', { unknown: 'Custom' })).toBe('Custom');
    expect(getRecentCompareMetricLabel('unknown', {})).toBe('unknown');
  });

  it('applies label override from settings.metrics.overrides', () => {
    const settings = {
      metrics: {
        overrides: {
          emsShare: { label: 'Atvykimai su GMP (%)' },
        },
      },
    };
    expect(getRecentCompareMetricLabel('emsShare', {}, settings)).toBe('Atvykimai su GMP (%)');
  });
});
