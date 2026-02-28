import { describe, expect, it, vi } from 'vitest';

import { createFeedbackRenderFeature } from '../../src/app/runtime/features/feedback-render.js';

function createDatasetHelpers() {
  const getDatasetValue = (element, key, fallback = '') => {
    if (!(element instanceof HTMLElement) || !key) {
      return fallback;
    }
    const value = element.dataset[key];
    return value == null ? fallback : value;
  };
  const setDatasetValue = (element, key, value) => {
    if (!(element instanceof HTMLElement) || !key) {
      return;
    }
    if (value == null || value === '') {
      delete element.dataset[key];
      return;
    }
    element.dataset[key] = String(value);
  };
  return { getDatasetValue, setDatasetValue };
}

function buildMonthlyStats(count) {
  const rows = [];
  for (let i = 1; i <= count; i += 1) {
    const month = String(i).padStart(2, '0');
    rows.push({
      month: `2025-${month}`,
      responses: i * 10,
      overallAverage: 4.1,
      doctorsAverage: 4.0,
      nursesAverage: 4.2,
      aidesAverage: 4.3,
      waitingAverage: 3.9,
    });
  }
  return rows;
}

function createFeature(trendWindow = 6) {
  document.body.innerHTML = `
    <p id="feedbackTrendSubtitle"></p>
    <div id="feedbackTrendControls">
      <button data-trend-months="3"></button>
      <button data-trend-months="6"></button>
      <button data-trend-months="12"></button>
      <button data-trend-months="all"></button>
    </div>
    <div id="feedbackTrendMetrics">
      <button data-trend-metric="overallAverage"></button>
    </div>
    <select id="feedbackTrendCompareSelect"><option value="none">Nelyginti</option></select>
    <input id="feedbackTrendMultiToggle" type="checkbox" />
    <p id="feedbackTrendMetricsHint"></p>
    <p id="feedbackTableMeta"></p>
    <table><tbody id="feedbackTable"></tbody></table>
  `;
  const { getDatasetValue, setDatasetValue } = createDatasetHelpers();
  const renderFeedbackTrendChart = vi.fn(async () => {});
  const feature = createFeedbackRenderFeature({
    selectors: {
      feedbackTrendSubtitle: document.getElementById('feedbackTrendSubtitle'),
      feedbackTrendControls: document.getElementById('feedbackTrendControls'),
      feedbackTrendButtons: Array.from(document.querySelectorAll('[data-trend-months]')),
      feedbackTrendMetrics: document.getElementById('feedbackTrendMetrics'),
      feedbackTrendMetricButtons: Array.from(document.querySelectorAll('[data-trend-metric]')),
      feedbackTrendCompareSelect: document.getElementById('feedbackTrendCompareSelect'),
      feedbackTrendMultiToggle: document.getElementById('feedbackTrendMultiToggle'),
      feedbackTrendMetricsHint: document.getElementById('feedbackTrendMetricsHint'),
      feedbackTableMeta: document.getElementById('feedbackTableMeta'),
      feedbackTable: document.getElementById('feedbackTable'),
      feedbackCards: document.createElement('div'),
    },
    dashboardState: {
      feedback: {
        trendWindow,
        trendMetrics: ['overallAverage'],
        trendMultiMode: false,
        trendCompareMode: 'none',
        monthly: [],
        filteredRecords: [],
      },
    },
    TEXT: {
      feedback: {
        filters: { countLabel: 'Atsakymai' },
        trend: {
          metrics: [{ key: 'overallAverage', label: 'Bendra patirtis', enabledByDefault: true }],
          compareModes: [{ key: 'none', label: 'Nelyginti' }],
        },
      },
    },
    numberFormatter: new Intl.NumberFormat('lt-LT'),
    decimalFormatter: new Intl.NumberFormat('lt-LT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    percentFormatter: new Intl.NumberFormat('lt-LT', { style: 'percent', maximumFractionDigits: 1 }),
    formatMonthLabel: (value) => value,
    getDatasetValue,
    setDatasetValue,
    describeError: () => ({ log: 'ERR' }),
    getChartRenderers: () => ({ renderFeedbackTrendChart }),
    resetFeedbackCommentRotation: () => {},
    renderFeedbackCommentsCard: () => {},
    onFeedbackTrendStateChange: () => {},
  });
  return { feature };
}

describe('feedback table window scoping', () => {
  it('scopes table rows by active trend window and restores all for "Visi"', () => {
    const { feature } = createFeature(6);
    const monthly = buildMonthlyStats(12);

    feature.renderFeedbackSection({ summary: {}, monthly });
    expect(document.querySelectorAll('#feedbackTable tr')).toHaveLength(6);
    expect(document.getElementById('feedbackTableMeta')?.textContent).toContain('6 mėn.');

    feature.setFeedbackTrendWindow(3);
    expect(document.querySelectorAll('#feedbackTable tr')).toHaveLength(3);
    expect(document.getElementById('feedbackTableMeta')?.textContent).toContain('3 mėn.');

    feature.setFeedbackTrendWindow(null);
    expect(document.querySelectorAll('#feedbackTable tr')).toHaveLength(12);
    expect(document.getElementById('feedbackTableMeta')?.textContent).toContain('12 mėn.');
  });
});
