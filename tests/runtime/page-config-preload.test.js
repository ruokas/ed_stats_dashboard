import { describe, expect, it } from 'vitest';

import { shouldPreloadChartJs } from '../../src/app/runtime/page-config.js';

describe('page-config chart preload policy', () => {
  it('preloads Chart.js for all chart-heavy pages', () => {
    expect(shouldPreloadChartJs('charts')).toBe(true);
    expect(shouldPreloadChartJs('ed')).toBe(true);
    expect(shouldPreloadChartJs('summaries')).toBe(true);
    expect(shouldPreloadChartJs('feedback')).toBe(true);
    expect(shouldPreloadChartJs('gydytojai')).toBe(true);
  });

  it('does not preload Chart.js for non-chart pages', () => {
    expect(shouldPreloadChartJs('kpi')).toBe(false);
    expect(shouldPreloadChartJs('recent')).toBe(false);
    expect(shouldPreloadChartJs('unknown')).toBe(false);
  });
});
