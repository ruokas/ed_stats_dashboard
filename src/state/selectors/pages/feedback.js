import { byId, byQuery, byQueryAllIn, createPageShellSelectors } from '../helpers.js';

export function createFeedbackPageSelectors() {
  const main = byQuery('main.container');
  const sectionNav = byQuery('.section-nav');
  const feedbackFilters = byId('feedbackFilters');
  const feedbackTrendControls = byId('feedbackTrendControls');
  const feedbackTrendMetrics = byId('feedbackTrendMetrics');
  const feedbackTrendCompareSelect = byId('feedbackTrendCompareSelect');

  return {
    ...createPageShellSelectors({ sectionNav }),
    feedbackHeading: byId('feedbackHeading'),
    feedbackSubtitle: byId('feedbackSubtitle'),
    feedbackDescription: byId('feedbackDescription'),
    feedbackFiltersSummary: byId('feedbackFiltersSummary'),
    feedbackRespondentFilter: byId('feedbackRespondentFilter'),
    feedbackRespondentLabel: byId('feedbackRespondentLabel'),
    feedbackRespondentChips: byId('feedbackRespondentChips'),
    feedbackLocationFilter: byId('feedbackLocationFilter'),
    feedbackLocationLabel: byId('feedbackLocationLabel'),
    feedbackLocationChips: byId('feedbackLocationChips'),
    feedbackFilterButtons: byQueryAllIn(feedbackFilters, '[data-feedback-filter]'),
    feedbackCaption: byId('feedbackCaption'),
    feedbackCards: byId('feedbackCards'),
    feedbackTrendTitle: byId('feedbackTrendTitle'),
    feedbackTrendSubtitle: byId('feedbackTrendSubtitle'),
    feedbackTrendControls,
    feedbackTrendControlsLabel: byId('feedbackTrendControlsLabel'),
    feedbackTrendButtons: byQueryAllIn(feedbackTrendControls, '[data-trend-months]'),
    feedbackTrendMetrics,
    feedbackTrendMetricsLabel: byId('feedbackTrendMetricsLabel'),
    feedbackTrendMetricButtons: byQueryAllIn(feedbackTrendMetrics, '[data-trend-metric]'),
    feedbackTrendCompareSelect,
    feedbackTrendCompareLabel: byId('feedbackTrendCompareLabel'),
    feedbackTrendSummary: byId('feedbackTrendSummary'),
    feedbackTrendSkeleton: byId('feedbackTrendSkeleton'),
    feedbackTrendMessage: byId('feedbackTrendMessage'),
    feedbackTrendChart: byId('feedbackTrendChart'),
    feedbackTableWrapper: byQuery('.table-wrapper--feedback'),
    feedbackTable: byId('feedbackTable'),
    chartCopyButtons: byQueryAllIn(main, '[data-chart-copy]'),
    chartDownloadButtons: byQueryAllIn(main, '[data-chart-download]'),
    tableDownloadButtons: byQueryAllIn(main, '[data-table-download]'),
  };
}
