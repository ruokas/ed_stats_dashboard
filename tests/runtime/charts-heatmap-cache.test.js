import { describe, expect, it, vi } from 'vitest';

import {
  buildHeatmapFilterCacheKey,
  resolveCachedHeatmapFilterData,
} from '../../src/app/runtime/runtimes/charts-runtime-impl.js';

describe('charts heatmap filter cache helper', () => {
  it('builds stable key from year and sanitized filters', () => {
    expect(
      buildHeatmapFilterCacheKey(2024, {
        arrival: 'ems',
        disposition: 'hospitalized',
        cardType: 't',
      })
    ).toBe('2024|ems|hospitalized|t');

    expect(
      buildHeatmapFilterCacheKey(null, {
        arrival: 'bad',
        disposition: 'bad',
        cardType: 'bad',
      })
    ).toBe('all|all|all|all');
  });

  it('reuses cached heatmap for same year and filters', () => {
    const chartData = {
      baseRecords: [{ id: 1 }, { id: 2 }],
      heatmapFilterCache: { recordsRef: null, byKey: new Map() },
      heatmap: null,
    };
    const filterRecordsByYearFn = vi.fn((records) => records);
    const filterRecordsByHeatmapFiltersFn = vi.fn((records) => records);
    const computeArrivalHeatmapFn = vi.fn((records) => ({ size: records.length }));

    const first = resolveCachedHeatmapFilterData({
      chartData,
      rawRecords: [],
      heatmapYear: 2024,
      heatmapFilters: { arrival: 'all', disposition: 'all', cardType: 'all' },
      filterRecordsByYearFn,
      filterRecordsByHeatmapFiltersFn,
      computeArrivalHeatmapFn,
    });
    const second = resolveCachedHeatmapFilterData({
      chartData,
      rawRecords: [],
      heatmapYear: 2024,
      heatmapFilters: { arrival: 'all', disposition: 'all', cardType: 'all' },
      filterRecordsByYearFn,
      filterRecordsByHeatmapFiltersFn,
      computeArrivalHeatmapFn,
    });

    expect(second).toBe(first);
    expect(chartData.heatmap).toBe(first);
    expect(filterRecordsByYearFn).toHaveBeenCalledTimes(1);
    expect(filterRecordsByHeatmapFiltersFn).toHaveBeenCalledTimes(1);
    expect(computeArrivalHeatmapFn).toHaveBeenCalledTimes(1);
  });

  it('invalidates cache on year or filter change', () => {
    const chartData = {
      baseRecords: [{ id: 1 }, { id: 2 }],
      heatmapFilterCache: { recordsRef: null, byKey: new Map() },
      heatmap: null,
    };
    const filterRecordsByYearFn = vi.fn((records) => records);
    const filterRecordsByHeatmapFiltersFn = vi.fn((records, filters) =>
      filters.arrival === 'ems' ? records.slice(0, 1) : records
    );
    const computeArrivalHeatmapFn = vi.fn((records) => ({ size: records.length, token: Math.random() }));

    const first = resolveCachedHeatmapFilterData({
      chartData,
      rawRecords: [],
      heatmapYear: 2024,
      heatmapFilters: { arrival: 'all', disposition: 'all', cardType: 'all' },
      filterRecordsByYearFn,
      filterRecordsByHeatmapFiltersFn,
      computeArrivalHeatmapFn,
    });
    const second = resolveCachedHeatmapFilterData({
      chartData,
      rawRecords: [],
      heatmapYear: 2025,
      heatmapFilters: { arrival: 'all', disposition: 'all', cardType: 'all' },
      filterRecordsByYearFn,
      filterRecordsByHeatmapFiltersFn,
      computeArrivalHeatmapFn,
    });
    const third = resolveCachedHeatmapFilterData({
      chartData,
      rawRecords: [],
      heatmapYear: 2025,
      heatmapFilters: { arrival: 'ems', disposition: 'all', cardType: 'all' },
      filterRecordsByYearFn,
      filterRecordsByHeatmapFiltersFn,
      computeArrivalHeatmapFn,
    });

    expect(second).not.toBe(first);
    expect(third).not.toBe(second);
    expect(computeArrivalHeatmapFn).toHaveBeenCalledTimes(3);
  });
});
