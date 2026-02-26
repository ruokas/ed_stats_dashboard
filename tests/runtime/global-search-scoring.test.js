import { describe, expect, it } from 'vitest';
import { normalizeSearchText } from '../../src/app/runtime/features/global-search/normalize.js';
import { rankGlobalSearchResults } from '../../src/app/runtime/features/global-search/scoring.js';

describe('global search normalization', () => {
  it('normalizes case, spacing and diacritics', () => {
    expect(normalizeSearchText('  Įžvalgos   PSPČ  ')).toBe('izvalgos pspc');
  });
});

describe('global search scoring', () => {
  const sample = [
    {
      id: 'page:charts',
      kind: 'page',
      title: 'Grafikai',
      subtitle: 'Atidaryti puslapį',
      aliases: ['charts'],
      rankBase: 10,
      showWhenEmpty: true,
      target: { type: 'navigate', href: 'charts.html' },
    },
    {
      id: 'section:heatmap',
      kind: 'section',
      title: 'Intensyvumo žemėlapis',
      subtitle: 'Sekcijos nuoroda',
      aliases: ['heatmap'],
      rankBase: 100,
      showWhenEmpty: false,
      target: {
        type: 'navigate',
        href: 'charts.html#chartsHeatmapHeading',
        anchorId: 'chartsHeatmapHeading',
      },
    },
    {
      id: 'metric:hosp',
      kind: 'metric',
      title: 'Hospitalizacijų skaičius / d.',
      subtitle: 'heatmap',
      aliases: ['hospitalized', 'hosp', 'Hospitalizacijų skaičius / d.'],
      rankBase: 200,
      showWhenEmpty: false,
      target: {
        type: 'navigate',
        href: 'charts.html#chartsHeatmapHeading',
        anchorId: 'chartsHeatmapHeading',
      },
    },
  ];

  it('returns quick results only for empty query', () => {
    const ranked = rankGlobalSearchResults(sample, '');
    expect(ranked.map((item) => item.id)).toEqual(['page:charts']);
  });

  it('prefers exact title matches over broader matches', () => {
    const ranked = rankGlobalSearchResults(sample, 'Grafikai');
    expect(ranked[0]?.id).toBe('page:charts');
  });

  it('matches by aliases and normalized text', () => {
    const ranked = rankGlobalSearchResults(sample, 'zemelapis');
    expect(ranked.some((item) => item.id === 'section:heatmap')).toBe(true);
  });
});
