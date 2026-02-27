import { describe, expect, it, vi } from 'vitest';

import { parseFromQuery, serializeToQuery } from '../../src/app/runtime/filters/query-codec.js';
import { resetToDefaults } from '../../src/app/runtime/filters/reset.js';
import { sanitizePageFilters } from '../../src/app/runtime/filters/sanitize.js';
import { buildFilterSummary } from '../../src/app/runtime/filters/summary.js';
import { createDebouncedHandler } from '../../src/app/runtime/filters/ui-sync.js';
import {
  createDefaultChartFilters,
  createDefaultKpiFilters,
  KPI_FILTER_LABELS,
} from '../../src/app/runtime/state.js';

describe('shared filter utils', () => {
  it('sanitizes kpi and charts filter payloads', () => {
    const settings = { calculations: { windowDays: 30 } };
    const defaultsKpi = () =>
      createDefaultKpiFilters({ settings, DEFAULT_SETTINGS: settings, DEFAULT_KPI_WINDOW_DAYS: 30 });
    const sanitizedKpi = sanitizePageFilters(
      'kpi',
      { window: '30', shift: 'day', arrival: 'self', disposition: 'hospitalized', cardType: 'tr' },
      { getDefaultKpiFilters: defaultsKpi, KPI_FILTER_LABELS }
    );
    expect(sanitizedKpi.shift).toBe('all');
    expect(sanitizedKpi.arrival).toBe('self');
    expect(sanitizedKpi.cardType).toBe('tr');

    const sanitizedCharts = sanitizePageFilters(
      'charts',
      { arrival: 'ems', disposition: 'discharged', cardType: 'ch', compareGmp: 'true' },
      { getDefaultChartFilters: createDefaultChartFilters, KPI_FILTER_LABELS }
    );
    expect(sanitizedCharts.compareGmp).toBe(true);
    expect(sanitizedCharts.arrival).toBe('all');
  });

  it('parses and serializes query state round-trip', () => {
    const parsedFeedback = parseFromQuery('feedback', '?ftm=overallAverage%2Cresponses&ftx=1&ftc=location');
    expect(parsedFeedback.trendMetrics).toEqual(['overallAverage', 'responses']);
    expect(parsedFeedback.trendMultiMode).toBe(true);
    expect(parsedFeedback.trendCompareMode).toBe('location');

    const parsed = parseFromQuery('summaries', '?sry=2025&srt=20&srm=150&srpm=trend');
    expect(parsed.year).toBe('2025');
    expect(parsed.topN).toBe(20);
    expect(parsed.minGroup).toBe(150);
    expect(parsed.pspcMode).toBe('trend');

    const query = serializeToQuery(
      'feedback',
      {
        respondent: 'patient',
        location: 'hall',
        trendWindow: 12,
        trendMetrics: ['overallAverage', 'responses'],
        trendMultiMode: true,
        trendCompareMode: 'location',
      },
      {
        respondent: 'all',
        location: 'all',
        trendWindow: 6,
        trendMetrics: ['overallAverage'],
        trendMultiMode: false,
        trendCompareMode: 'none',
      }
    );
    expect(query).toContain('fr=patient');
    expect(query).toContain('ftw=12');
    expect(query).toContain('ftm=overallAverage%2Cresponses');
    expect(query).toContain('ftx=1');
  });

  it('builds summary and resets to defaults', () => {
    const text = buildFilterSummary({
      entries: ['Metai: 2025', 'TOP N: 20'],
      emptyText: 'Numatytieji filtrai',
    });
    expect(text).toBe('Metai: 2025 • TOP N: 20');

    const reset = resetToDefaults('summaries', {
      year: 'all',
      topN: 15,
      minGroup: 100,
      pspcSort: 'desc',
      pspcMode: 'cross',
      pspcTrend: '__top3__',
    });
    expect(reset.topN).toBe(15);
    expect(reset.pspcMode).toBe('cross');
  });

  it('debounced handler supports cancel and flush', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = createDebouncedHandler(spy, 250);

    debounced('a');
    debounced('b');
    vi.advanceTimersByTime(249);
    expect(spy).not.toHaveBeenCalled();
    debounced.flush();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith('b');

    debounced('c');
    debounced.cancel();
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
