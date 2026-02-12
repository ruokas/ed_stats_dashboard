import { createFullSelectors } from './selectors/full.js';
import { createChartsPageSelectors } from './selectors/pages/charts.js';
import { createEdPageSelectors } from './selectors/pages/ed.js';
import { createFallbackPageSelectors } from './selectors/pages/fallback.js';
import { createFeedbackPageSelectors } from './selectors/pages/feedback.js';
import { createGydytojaiPageSelectors } from './selectors/pages/gydytojai.js';
import { createKpiPageSelectors } from './selectors/pages/kpi.js';
import { createRecentPageSelectors } from './selectors/pages/recent.js';
import { createSummariesPageSelectors } from './selectors/pages/summaries.js';

export function createSelectors() {
  return createFullSelectors();
}

const pageSelectorFactories = {
  kpi: createKpiPageSelectors,
  charts: createChartsPageSelectors,
  summaries: createSummariesPageSelectors,
  gydytojai: createGydytojaiPageSelectors,
  recent: createRecentPageSelectors,
  feedback: createFeedbackPageSelectors,
  ed: createEdPageSelectors,
};

export function createSelectorsForPage(pageId) {
  const normalizedPage = typeof pageId === 'string' ? pageId.trim().toLowerCase() : '';
  const factory = pageSelectorFactories[normalizedPage] || createFallbackPageSelectors;
  return factory();
}
