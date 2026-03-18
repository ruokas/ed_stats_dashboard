import { describe, expect, it, vi } from 'vitest';

import {
  buildHeatmapFilterCacheKey,
  filterRecordsByHeatmapFilters,
  resolveCachedHeatmapFilterData,
} from '../../src/app/runtime/runtimes/charts-runtime-impl.js';

describe('charts heatmap filter cache helper', () => {
  it('builds stable key from year and sanitized filters', () => {
    expect(
      buildHeatmapFilterCacheKey(2024, {
        arrival: 'ems',
        disposition: 'hospitalized',
        cardType: ['ch', 't'],
      })
    ).toBe('2024|ems|hospitalized|t,ch');

    expect(
      buildHeatmapFilterCacheKey(null, {
        arrival: 'bad',
        disposition: 'bad',
        cardType: ['t', 'tr', 'ch'],
      })
    ).toBe('all|all|all|all');
  });

  it('filters combined card-type selections', () => {
    const records = [
      { cardType: 't', ems: false, hospitalized: false },
      { cardType: 'tr', ems: false, hospitalized: false },
      { cardType: 'ch', ems: false, hospitalized: false },
      { cardType: 'other', ems: false, hospitalized: false },
    ];

    expect(
      filterRecordsByHeatmapFilters(records, {
        arrival: 'all',
        disposition: 'all',
        cardType: ['ch', 't'],
      }).map((record) => record.cardType)
    ).toEqual(['t', 'ch']);

    expect(
      filterRecordsByHeatmapFilters(records, {
        arrival: 'all',
        disposition: 'all',
        cardType: ['all'],
      }).map((record) => record.cardType)
    ).toEqual(['t', 'tr', 'ch']);
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
    expect(filterRecordsByHeatmapFiltersFn).toHaveBeenCalledTimes(0);
    expect(computeArrivalHeatmapFn).toHaveBeenCalledTimes(0);
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
    expect(filterRecordsByYearFn).toHaveBeenCalledTimes(2);
    expect(computeArrivalHeatmapFn).toHaveBeenCalledTimes(0);
  });

  it('reuses aggregate cache for combined card-type selections', () => {
    const mondayArrivalA = new Date('2024-01-01T08:00:00');
    const mondayArrivalB = new Date('2024-01-01T08:30:00');
    const chartData = {
      baseRecords: [
        {
          cardType: 't',
          ems: false,
          hospitalized: false,
          arrival: mondayArrivalA,
          discharge: new Date('2024-01-01T09:00:00'),
          arrivalHasTime: true,
          dischargeHasTime: true,
        },
        {
          cardType: 'ch',
          ems: false,
          hospitalized: false,
          arrival: mondayArrivalB,
          discharge: new Date('2024-01-01T10:00:00'),
          arrivalHasTime: true,
          dischargeHasTime: true,
        },
        {
          cardType: 'other',
          ems: false,
          hospitalized: false,
          arrival: new Date('2024-01-01T08:45:00'),
          discharge: new Date('2024-01-01T09:15:00'),
          arrivalHasTime: true,
          dischargeHasTime: true,
        },
      ],
      heatmapFilterCache: { recordsRef: null, byKey: new Map() },
      heatmap: null,
    };
    const filterRecordsByYearFn = vi.fn((records) => records);
    const filterRecordsByHeatmapFiltersFn = vi.fn((records) => records);
    const computeArrivalHeatmapFn = vi.fn((records) => ({ size: records.length }));

    const data = resolveCachedHeatmapFilterData({
      chartData,
      rawRecords: [],
      heatmapYear: 2024,
      heatmapFilters: { arrival: 'all', disposition: 'all', cardType: ['ch', 't'] },
      filterRecordsByYearFn,
      filterRecordsByHeatmapFiltersFn,
      computeArrivalHeatmapFn,
    });

    expect(data.metrics.arrivals.matrix[0][8]).toBe(2);
    expect(filterRecordsByHeatmapFiltersFn).toHaveBeenCalledTimes(0);
    expect(computeArrivalHeatmapFn).toHaveBeenCalledTimes(0);
  });

  it('treats Visos as the union of visible card types in the aggregate cache', () => {
    const chartData = {
      baseRecords: [
        {
          cardType: 't',
          ems: false,
          hospitalized: false,
          arrival: new Date('2024-01-01T08:00:00'),
          discharge: new Date('2024-01-01T09:00:00'),
          arrivalHasTime: true,
          dischargeHasTime: true,
        },
        {
          cardType: 'other',
          ems: false,
          hospitalized: false,
          arrival: new Date('2024-01-01T08:30:00'),
          discharge: new Date('2024-01-01T09:30:00'),
          arrivalHasTime: true,
          dischargeHasTime: true,
        },
      ],
      heatmapFilterCache: { recordsRef: null, byKey: new Map() },
      heatmap: null,
    };

    const data = resolveCachedHeatmapFilterData({
      chartData,
      rawRecords: [],
      heatmapYear: 2024,
      heatmapFilters: { arrival: 'all', disposition: 'all', cardType: ['all'] },
    });

    expect(data.metrics.arrivals.matrix[0][8]).toBe(1);
  });
});
