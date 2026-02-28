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
  const {
    selectors,
    setFeedbackTrendWindow,
    setFeedbackTrendMetric,
    setFeedbackTrendCompareMode,
    setFeedbackTrendMultiMode,
  } = env;

  const controls = selectors.feedbackTrendControls;
  if (!controls) {
    return;
  }

  controls.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest('button[data-trend-months]');
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const months = Number.parseInt(getDatasetValue(button, 'trendMonths', ''), 10);
    if (Number.isFinite(months) && months > 0) {
      setFeedbackTrendWindow(months);
      return;
    }
    setFeedbackTrendWindow(null);
  });

  const metricControls = selectors.feedbackTrendMetrics;
  if (metricControls && typeof setFeedbackTrendMetric === 'function') {
    metricControls.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const button = target.closest('button[data-trend-metric]');
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const metricKey = getDatasetValue(button, 'trendMetric', '');
      if (!metricKey) {
        return;
      }
      setFeedbackTrendMetric(metricKey);
    });
  }

  const multiToggle = selectors.feedbackTrendMultiToggle;
  if (multiToggle && typeof setFeedbackTrendMultiMode === 'function') {
    const resolveToggleValue = () => {
      if (multiToggle instanceof HTMLInputElement) {
        return Boolean(multiToggle.checked);
      }
      if (multiToggle instanceof HTMLButtonElement) {
        const next = multiToggle.getAttribute('aria-pressed') !== 'true';
        multiToggle.setAttribute('aria-pressed', String(next));
        return next;
      }
      return false;
    };
    const eventName = multiToggle instanceof HTMLInputElement ? 'change' : 'click';
    multiToggle.addEventListener(eventName, () => {
      setFeedbackTrendMultiMode(resolveToggleValue());
    });
  }

  const compareSelect = selectors.feedbackTrendCompareSelect;
  const compareControls = selectors.feedbackTrendCompareControls;
  if (compareControls && typeof setFeedbackTrendCompareMode === 'function') {
    compareControls.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const button = target.closest('button[data-trend-compare]');
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const mode = getDatasetValue(button, 'trendCompare', '').trim();
      if (!mode) {
        return;
      }
      setFeedbackTrendCompareMode(mode);
    });
  }
  if (compareSelect && typeof setFeedbackTrendCompareMode === 'function') {
    compareSelect.addEventListener('change', () => {
      const mode = String(compareSelect.value || '').trim();
      if (!mode) {
        return;
      }
      setFeedbackTrendCompareMode(mode);
    });
  }
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
