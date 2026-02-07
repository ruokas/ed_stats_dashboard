import { getDatasetValue, setDatasetValue } from '../utils/dom.js';

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

export function initFeedbackTableScrollAffordance(env) {
  const { selectors } = env;
  const wrapper = selectors.feedbackTableWrapper;
  const table = wrapper ? wrapper.querySelector('table') : null;

  if (!wrapper || !table) {
    return;
  }

  const syncState = () => {
    const maxScrollLeft = Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
    const isScrollable = maxScrollLeft > 2;
    const isAtStart = wrapper.scrollLeft <= 2;
    const isAtEnd = wrapper.scrollLeft >= maxScrollLeft - 2;

    setDatasetValue(wrapper, 'scrollable', isScrollable ? 'true' : 'false');
    setDatasetValue(wrapper, 'scrollStart', isAtStart ? 'true' : 'false');
    setDatasetValue(wrapper, 'scrollEnd', isAtEnd ? 'true' : 'false');
  };

  wrapper.addEventListener('scroll', syncState, { passive: true });
  window.addEventListener('resize', syncState, { passive: true });

  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(syncState);
    observer.observe(wrapper);
    observer.observe(table);
  }

  syncState();
}
