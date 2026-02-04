import { initChartControls, initChartCopyButtons, initChartDownloadButtons, initTableDownloadButtons } from './charts.js';
import { initCompareControls } from './compare.js';
import { initEdPanelControls } from './ed.js';
import { initFeedbackFilters, initFeedbackTrendControls } from './feedback.js';
import { initGlobalShortcuts } from './global.js';
import { initKpiFilters } from './kpi.js';
import { initScrollTopButton } from './scroll.js';
import { initSectionNavigation } from './section-nav.js';
import { initTabSwitcher } from './tabs.js';
import { initTvMode } from './tv.js';
import { initThemeToggle } from './theme.js';
import { initYearlyExpand } from './yearly.js';

export function createUIEvents(env) {
  function initUI() {
    initSectionNavigation(env);
    initScrollTopButton(env);
    initKpiFilters(env);
    initFeedbackFilters(env);
    initFeedbackTrendControls(env);
    initYearlyExpand(env);
    initChartCopyButtons(env);
    initChartDownloadButtons(env);
    initTableDownloadButtons(env);
    initTabSwitcher(env);
    initTvMode(env);
    initChartControls(env);
    initThemeToggle(env);
    initCompareControls(env);
    initEdPanelControls(env);
    initGlobalShortcuts(env);
  }

  return {
    initUI,
  };
}
