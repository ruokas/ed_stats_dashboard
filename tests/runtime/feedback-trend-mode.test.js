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

function createSelectors() {
  document.body.innerHTML = `
    <p id="feedbackTrendSubtitle"></p>
    <div id="feedbackTrendMetrics">
      <button data-trend-metric="overallAverage"></button>
      <button data-trend-metric="responses"></button>
    </div>
    <input id="feedbackTrendMultiToggle" type="checkbox" />
    <p id="feedbackTrendMetricsHint"></p>
    <div id="feedbackTrendControls">
      <button data-trend-months="3"></button>
      <button data-trend-months="6"></button>
    </div>
    <select id="feedbackTrendCompareSelect">
      <option value="none">Nelyginti</option>
      <option value="respondent">Pacientas vs artimasis</option>
    </select>
  `;
  return {
    feedbackTrendSubtitle: document.getElementById('feedbackTrendSubtitle'),
    feedbackTrendControls: document.getElementById('feedbackTrendControls'),
    feedbackTrendButtons: Array.from(document.querySelectorAll('[data-trend-months]')),
    feedbackTrendMetrics: document.getElementById('feedbackTrendMetrics'),
    feedbackTrendMetricButtons: Array.from(document.querySelectorAll('[data-trend-metric]')),
    feedbackTrendCompareSelect: document.getElementById('feedbackTrendCompareSelect'),
    feedbackTrendMultiToggle: document.getElementById('feedbackTrendMultiToggle'),
    feedbackTrendMetricsHint: document.getElementById('feedbackTrendMetricsHint'),
    feedbackCards: document.createElement('div'),
    feedbackTable: document.createElement('tbody'),
  };
}

function createFeature({ trendMetrics = ['overallAverage'], trendMultiMode = false } = {}) {
  const selectors = createSelectors();
  if (selectors.feedbackTrendMultiToggle) {
    selectors.feedbackTrendMultiToggle.checked = trendMultiMode;
  }
  const { getDatasetValue, setDatasetValue } = createDatasetHelpers();
  const dashboardState = {
    feedback: {
      trendWindow: 6,
      trendMetrics: trendMetrics.slice(),
      trendMultiMode,
      trendCompareMode: 'none',
      monthly: [],
      filteredRecords: [],
    },
  };
  const onFeedbackTrendStateChange = vi.fn();
  const renderFeedbackTrendChart = vi.fn(async () => {});

  const feature = createFeedbackRenderFeature({
    selectors,
    dashboardState,
    TEXT: {
      feedback: {
        trend: {
          compareModes: [
            { key: 'none', label: 'Nelyginti' },
            { key: 'respondent', label: 'Pacientas vs artimasis' },
          ],
          metrics: [
            { key: 'overallAverage', label: 'Bendra patirtis', enabledByDefault: true },
            { key: 'responses', label: 'Atsakymų skaičius' },
          ],
          multiModeHintSingle: 'Rodomas vienas rodiklis',
          multiModeHintMulti: 'Galite pasirinkti kelis rodiklius',
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
    onFeedbackTrendStateChange,
  });

  return { feature, dashboardState, selectors, onFeedbackTrendStateChange, renderFeedbackTrendChart };
}

describe('feedback trend metric mode behavior', () => {
  it('single mode keeps only one active metric', () => {
    const { feature } = createFeature({
      trendMetrics: ['overallAverage', 'responses'],
      trendMultiMode: false,
    });
    expect(feature.getActiveFeedbackTrendMetrics()).toEqual(['overallAverage']);
  });

  it('single mode click replaces metric selection', () => {
    const { feature, dashboardState } = createFeature({
      trendMetrics: ['overallAverage'],
      trendMultiMode: false,
    });
    feature.setFeedbackTrendMetric('responses');
    expect(feature.getActiveFeedbackTrendMetrics()).toEqual(['responses']);
    expect(dashboardState.feedback.trendMetrics).toEqual(['responses']);
  });

  it('multi mode allows many metrics but never zero', () => {
    const { feature } = createFeature({ trendMetrics: ['overallAverage'], trendMultiMode: false });
    feature.setFeedbackTrendMultiMode(true);
    feature.setFeedbackTrendMetric('responses');
    expect(feature.getActiveFeedbackTrendMetrics()).toEqual(['overallAverage', 'responses']);

    feature.setFeedbackTrendMetric('overallAverage');
    expect(feature.getActiveFeedbackTrendMetrics()).toEqual(['responses']);

    feature.setFeedbackTrendMetric('responses');
    expect(feature.getActiveFeedbackTrendMetrics()).toEqual(['responses']);
  });

  it('keeps compare mode independent from metric multi mode', () => {
    const { feature, dashboardState, selectors } = createFeature({
      trendMetrics: ['overallAverage'],
      trendMultiMode: true,
    });
    feature.setFeedbackTrendCompareMode('respondent');
    expect(dashboardState.feedback.trendCompareMode).toBe('respondent');

    feature.setFeedbackTrendMultiMode(false);
    expect(dashboardState.feedback.trendCompareMode).toBe('respondent');
    expect(selectors.feedbackTrendCompareSelect?.disabled).toBe(false);
    expect(feature.getActiveFeedbackTrendCompareMode()).toBe('respondent');
  });

  it('uses checkbox as source of truth for metric mode on click', () => {
    const { feature, dashboardState, selectors } = createFeature({
      trendMetrics: ['overallAverage', 'responses'],
      trendMultiMode: true,
    });
    if (selectors.feedbackTrendMultiToggle) {
      selectors.feedbackTrendMultiToggle.checked = false;
    }
    feature.setFeedbackTrendMetric('responses');
    expect(dashboardState.feedback.trendMultiMode).toBe(false);
    expect(feature.getActiveFeedbackTrendMetrics()).toEqual(['responses']);
  });
});
