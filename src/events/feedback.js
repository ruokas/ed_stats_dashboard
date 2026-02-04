import { getDatasetValue } from '../utils/dom.js';

export function initFeedbackFilters(env) {
  const {
    selectors,
    dashboardState,
    populateFeedbackFilterControls,
    syncFeedbackFilterControls,
    updateFeedbackFiltersSummary,
    handleFeedbackFilterChange,
    handleFeedbackFilterChipClick,
  } = env;

  populateFeedbackFilterControls(dashboardState.feedback.filterOptions);
  syncFeedbackFilterControls();
  updateFeedbackFiltersSummary(dashboardState.feedback.summary);
  if (selectors.feedbackRespondentFilter) {
    selectors.feedbackRespondentFilter.addEventListener('change', handleFeedbackFilterChange);
  }
  if (selectors.feedbackLocationFilter) {
    selectors.feedbackLocationFilter.addEventListener('change', handleFeedbackFilterChange);
  }
  if (selectors.feedbackRespondentChips) {
    selectors.feedbackRespondentChips.addEventListener('click', handleFeedbackFilterChipClick);
  }
  if (selectors.feedbackLocationChips) {
    selectors.feedbackLocationChips.addEventListener('click', handleFeedbackFilterChipClick);
  }
}

export function initFeedbackTrendControls(env) {
  const { selectors, setFeedbackTrendWindow } = env;

  if (!selectors.feedbackTrendButtons || !selectors.feedbackTrendButtons.length) {
    return;
  }
  selectors.feedbackTrendButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const months = Number.parseInt(getDatasetValue(button, 'trendMonths', ''), 10);
      if (Number.isFinite(months) && months > 0) {
        setFeedbackTrendWindow(months);
      } else {
        setFeedbackTrendWindow(null);
      }
    });
  });
}
