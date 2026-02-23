import { describe, expect, it } from 'vitest';
import { getMetricSurfaceMeta, getMetricsBySurface } from '../../src/metrics/index.js';

describe('metrics catalog heatmap surface', () => {
  it('includes required heatmap metric keys', () => {
    const ids = getMetricsBySurface('heatmap').map((metric) => metric.id);
    expect(ids).toEqual(expect.arrayContaining(['arrivals', 'discharges', 'hospitalized', 'avgDuration']));
  });

  it('provides surface-specific labels for hospitalized heatmap metric', () => {
    const metric = getMetricsBySurface('heatmap').find((item) => item.id === 'hospitalized');
    const meta = getMetricSurfaceMeta(metric, 'heatmap');
    expect(meta.label).toContain('/ d.');
  });
});
