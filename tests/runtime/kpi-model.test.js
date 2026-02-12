import { describe, expect, it } from 'vitest';
import { buildKpiCardsModel } from '../../src/render/kpi-model.js';

function createText() {
  return {
    kpis: {
      noYearData: 'Nėra duomenų',
      primaryNoData: '—',
      deltaNoData: 'Nėra pokyčio duomenų',
      averageNoData: 'Vidurkio nėra',
      mainValueLabel: 'Dabar',
      summary: {
        reference: 'Lyginama su',
        referenceFallback: 'Vidurkis',
        weekdayReference: (weekday) => `Vidurkis (${weekday})`,
      },
      detailLabels: {
        delta: 'Skirtumas',
        average: (weekday) => (weekday ? `Vid. (${weekday})` : 'Vid.'),
        averageContext: (weekday) => (weekday ? `(${weekday})` : ''),
      },
      deltaContext: (reference) => (reference ? `vs ${reference}` : ''),
      cards: [
        { metricKey: 'up', label: 'Auga', format: 'integer', unitLabel: 'pac.' },
        { metricKey: 'down', label: 'Mažėja', format: 'integer', unitLabel: 'pac.' },
        { metricKey: 'neutral', label: 'Stabilu', format: 'integer', unitLabel: 'pac.' },
      ],
    },
  };
}

describe('buildKpiCardsModel', () => {
  it('returns empty state when summary is missing', () => {
    const model = buildKpiCardsModel({
      lastShiftSummary: null,
      TEXT: createText(),
      escapeHtml: (value) => String(value),
      formatKpiValue: (value) => String(value),
      percentFormatter: { format: (value) => `${Math.round(value * 100)}%` },
    });

    expect(model.cards).toHaveLength(0);
    expect(model.emptyHtml).toContain('Nėra duomenų');
  });

  it('builds cards with compact comparison row', () => {
    const model = buildKpiCardsModel({
      lastShiftSummary: {
        weekdayLabel: 'Pirmadienis',
        metrics: {
          up: { value: 12, average: 10 },
          down: { value: 7, average: 10 },
          neutral: { value: 9, average: 9 },
        },
      },
      TEXT: createText(),
      escapeHtml: (value) => String(value),
      formatKpiValue: (value) => String(value),
      percentFormatter: { format: (value) => `${Math.round(value * 100)}%` },
    });

    expect(model.emptyHtml).toBe('');
    expect(model.cards).toHaveLength(3);
    expect(model.cards[0].detailsHtml).toContain('kpi-detail--comparison');
    expect(model.cards[1].detailsHtml).toContain('kpi-detail--comparison');
    expect(model.cards[2].detailsHtml).toContain('kpi-detail--comparison');
    model.cards.forEach((card) => {
      const detailsNode = document.createElement('div');
      detailsNode.innerHTML = card.detailsHtml;
      expect(detailsNode.querySelectorAll('.kpi-detail')).toHaveLength(1);
      expect(detailsNode.querySelector('.kpi-detail__comparison')).not.toBeNull();
    });
    const firstDetailsNode = document.createElement('div');
    firstDetailsNode.innerHTML = model.cards[0].detailsHtml;
    expect(firstDetailsNode.textContent).toContain('Δ');
    expect(firstDetailsNode.textContent).toContain('Vid.');
  });

  it('shows muted fallback when average is missing', () => {
    const model = buildKpiCardsModel({
      lastShiftSummary: {
        weekdayLabel: 'Antradienis',
        metrics: {
          up: { value: 12, average: null },
          down: { value: null, average: null },
          neutral: { value: null, average: null },
        },
      },
      TEXT: createText(),
      escapeHtml: (value) => String(value),
      formatKpiValue: (value) => String(value),
      percentFormatter: { format: (value) => `${Math.round(value * 100)}%` },
    });

    expect(model.cards[0].detailsHtml).toContain('kpi-detail--muted');
    expect(model.cards[0].detailsHtml).toContain('Vidurkio nėra');
  });
});
