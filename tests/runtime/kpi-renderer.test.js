import { describe, expect, it, vi } from 'vitest';
import { createKpiRenderer } from '../../src/render/kpi.js';

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
      cards: [{ metricKey: 'total', label: 'Atvykę', format: 'integer', unitLabel: 'pac.' }],
    },
  };
}

describe('createKpiRenderer', () => {
  it('renders KPI cards with one combined detail row and preserves list roles', () => {
    document.body.innerHTML = '<div id="kpiGrid"></div><div id="kpiSummary"></div>';
    const selectors = {
      kpiGrid: document.getElementById('kpiGrid'),
      kpiSummary: document.getElementById('kpiSummary'),
    };
    const hideKpiSkeleton = vi.fn();

    const renderer = createKpiRenderer({
      selectors,
      TEXT: createText(),
      escapeHtml: (value) => String(value),
      formatKpiValue: (value) => String(Math.round(value)),
      percentFormatter: { format: (value) => `${Math.round(value * 100)}%` },
      buildLastShiftSummary: () => ({
        weekdayLabel: 'Trečiadienis',
        metrics: {
          total: { value: 11, average: 9 },
        },
      }),
      hideKpiSkeleton,
    });

    renderer.renderKpis([]);

    expect(hideKpiSkeleton).toHaveBeenCalledOnce();
    expect(selectors.kpiGrid.querySelectorAll('.kpi-card')).toHaveLength(1);
    expect(selectors.kpiGrid.querySelectorAll('.kpi-detail')).toHaveLength(1);
    expect(selectors.kpiGrid.querySelectorAll('.kpi-card [role="list"]')).toHaveLength(1);
    expect(selectors.kpiGrid.textContent).toContain('Atvykę');
    expect(selectors.kpiGrid.textContent).toContain('Vid.');
  });

  it('renders no-data card when summary is not available', () => {
    document.body.innerHTML = '<div id="kpiGrid"></div><div id="kpiSummary"></div>';
    const selectors = {
      kpiGrid: document.getElementById('kpiGrid'),
      kpiSummary: document.getElementById('kpiSummary'),
    };

    const renderer = createKpiRenderer({
      selectors,
      TEXT: createText(),
      escapeHtml: (value) => String(value),
      formatKpiValue: (value) => String(Math.round(value)),
      percentFormatter: { format: (value) => `${Math.round(value * 100)}%` },
      buildLastShiftSummary: () => null,
      hideKpiSkeleton: () => {},
    });

    renderer.renderKpis([]);

    expect(selectors.kpiGrid.querySelectorAll('.kpi-card')).toHaveLength(1);
    expect(selectors.kpiGrid.textContent).toContain('Nėra duomenų');
  });
});
