import { initChartControls, initChartCopyButtons, initChartDownloadButtons, initTableDownloadButtons } from './charts.js';
import { initCompareControls } from './compare.js';
import { initEdPanelControls } from './ed.js';
import { initFeedbackFilters, initFeedbackTrendControls } from './feedback.js';
import { initGlobalShortcuts } from './global.js';
import { initKpiFilters } from './kpi.js';
import { initScrollTopButton } from './scroll.js';
import { initSectionNavigation } from './section-nav.js';
import { initTvMode } from './tv.js';
import { initThemeToggle } from './theme.js';
import { initYearlyExpand } from './yearly.js';
import { runAfterDomAndIdle } from '../utils/dom.js';

function runNonCritical(task) {
  runAfterDomAndIdle(() => {
    try {
      task();
    } catch (error) {
      console.warn('[UI_EVENTS] Non-critical init failed', error);
    }
  }, { timeout: 500 });
}

export function createUIEvents(env) {
  function initUI() {
    const pageConfig = env.pageConfig || {};
    initSectionNavigation(env);
    initScrollTopButton(env);
    if (pageConfig.kpi) {
      initKpiFilters(env);
    }
    if (pageConfig.feedback) {
      initFeedbackFilters(env);
      initFeedbackTrendControls(env);
    }
    if (pageConfig.monthly || pageConfig.yearly) {
      initYearlyExpand(env);
    }
    if (pageConfig.charts || pageConfig.feedback) {
      runNonCritical(() => initChartCopyButtons(env));
      runNonCritical(() => initChartDownloadButtons(env));
    }
    if (pageConfig.recent || pageConfig.monthly || pageConfig.yearly || pageConfig.feedback) {
      runNonCritical(() => initTableDownloadButtons(env));
    }
    if (pageConfig.tv) {
      initTvMode(env);
    }
    if (pageConfig.charts) {
      // Chart controls are interaction-only; defer to reduce startup main-thread contention.
      runNonCritical(() => initChartControls(env));
    }
    initThemeToggle(env);
    if (pageConfig.recent || pageConfig.monthly || pageConfig.yearly) {
      initCompareControls(env);
    }
    if (pageConfig.ed) {
      initEdPanelControls(env);
    }
    runNonCritical(() => initGlobalShortcuts(env));
  }

  return {
    initUI,
  };
}
