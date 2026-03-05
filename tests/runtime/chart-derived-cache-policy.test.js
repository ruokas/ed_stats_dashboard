import { describe, expect, it } from 'vitest';

import {
  buildFilteredDailyStageKey,
  buildFilteredRecordsStageKey,
  buildFunnelStageKey,
  buildHeatmapPrewarmKey,
  buildHeatmapStageKey,
  buildWindowedStageKey,
  buildYearScopedStageKey,
  invalidateChartDerivedCacheByReason,
} from '../../src/app/runtime/charts/chart-derived-cache-policy.js';

describe('chart derived cache policy', () => {
  it('builds deterministic stage keys', () => {
    expect(buildYearScopedStageKey('2024')).toBe('2024');
    expect(buildFilteredRecordsStageKey('2024', 'all|all|all|0')).toBe('2024|all|all|all|0');
    expect(buildFilteredDailyStageKey('2024|all|all|all|0', '{"shiftStartHour":7}')).toBe(
      '2024|all|all|all|0|{"shiftStartHour":7}'
    );
    expect(buildWindowedStageKey('2024|all|all|all|0', '{"shiftStartHour":7}', 30, 'window')).toBe(
      '2024|all|all|all|0|{"shiftStartHour":7}|30|window'
    );
    expect(buildFunnelStageKey('a|b|c', '2024')).toBe('a|b|c|2024');
    expect(buildHeatmapStageKey('a|b|c')).toBe('a|b|c|heatmap');
    expect(buildHeatmapPrewarmKey('2024', 'filters', 'settings', 'year')).toBe('2024|filters|settings|year');
  });

  it('invalidates only descendants for period/filter/year reasons', () => {
    const cache = {
      yearScoped: { key: 'year' },
      yearDaily: { key: 'daily' },
      filteredRecords: { key: 'records' },
      filteredDaily: { key: 'filtered-daily' },
      windowed: { key: 'windowed' },
      funnel: { key: 'funnel' },
      heatmap: { key: 'heatmap' },
      windowedByKey: new Map([['x', {}]]),
      funnelByKey: new Map([['x', {}]]),
      heatmapByKey: new Map([['x', {}]]),
      heatmapPrewarmKey: 'abc',
    };

    invalidateChartDerivedCacheByReason(cache, 'period');
    expect(cache.yearScoped).toBeTruthy();
    expect(cache.filteredRecords).toBeTruthy();
    expect(cache.windowed).toBeNull();

    cache.windowed = { key: 'windowed' };
    cache.funnel = { key: 'funnel' };
    cache.heatmap = { key: 'heatmap' };
    invalidateChartDerivedCacheByReason(cache, 'filters');
    expect(cache.yearScoped).toBeTruthy();
    expect(cache.filteredRecords).toBeNull();
    expect(cache.windowed).toBeNull();

    cache.yearScoped = { key: 'year' };
    cache.yearDaily = { key: 'daily' };
    cache.filteredRecords = { key: 'records' };
    cache.filteredDaily = { key: 'filtered-daily' };
    cache.windowed = { key: 'windowed' };
    cache.funnel = { key: 'funnel' };
    cache.heatmap = { key: 'heatmap' };
    invalidateChartDerivedCacheByReason(cache, 'year');
    expect(cache.yearScoped).toBeNull();
    expect(cache.filteredDaily).toBeNull();
    expect(cache.windowed).toBeNull();
  });
});
