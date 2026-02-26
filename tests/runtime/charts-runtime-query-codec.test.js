import { describe, expect, test } from 'vitest';
import { parseFromQuery, serializeToQuery } from '../../src/app/runtime/filters/query-codec.js';

describe('charts query codec accordion fields', () => {
  test('parses csv accordion fields', () => {
    const parsed = parseFromQuery('charts', '?cp=30&cse=main,hospital&css=overview,hourly,heatmap');
    expect(parsed.chartPeriod).toBe(30);
    expect(parsed.chartsSectionsExpanded).toEqual(['main', 'hospital']);
    expect(parsed.chartsSubsectionsExpanded).toEqual(['overview', 'hourly', 'heatmap']);
  });

  test('serializes accordion fields and omits defaults', () => {
    const defaults = {
      chartPeriod: 30,
      chartYear: null,
      arrival: 'all',
      disposition: 'all',
      cardType: 'all',
      compareGmp: false,
      heatmapMetric: 'arrivals',
      heatmapArrival: 'all',
      heatmapDisposition: 'all',
      heatmapCardType: 'all',
      heatmapYear: null,
      hourlyWeekday: 'all',
      hourlyStayBucket: 'all',
      hourlyMetric: 'arrivals',
      hourlyDepartment: 'all',
      hourlyCompareEnabled: false,
      hourlyCompareYearA: null,
      hourlyCompareYearB: null,
      hourlyCompareSeries: 'all',
      hospitalYear: 'all',
      hospitalSort: 'total_desc',
      hospitalSearch: '',
      hospitalDepartment: '',
      chartsSectionsExpanded: ['main'],
      chartsSubsectionsExpanded: ['overview'],
    };
    const query = serializeToQuery(
      'charts',
      {
        ...defaults,
        chartsSectionsExpanded: ['main', 'hospital'],
        chartsSubsectionsExpanded: ['overview', 'hourly'],
      },
      defaults
    );
    expect(query).toContain('cse=main%2Chospital');
    expect(query).toContain('css=overview%2Chourly');
  });
});
