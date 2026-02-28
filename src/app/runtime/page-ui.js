import { initScrollTopButton } from '../../events/scroll.js';
import { initSectionNavigation } from '../../events/section-nav.js';
import { initThemeToggle } from '../../events/theme.js';
import { initExportMenus } from './features/export-menu.js';
import { initGlobalSearch } from './features/global-search.js';
import { initPageHelperCard } from './features/page-helper-cards.js';
import { initSearchClearButtons } from './features/search-clear-buttons.js';
import { initStateStrip } from './features/state-strip.js';
import { createLayoutTools } from './layout.js';

export function applyCommonPageShellText({ selectors, settings, text, defaultFooterSource }) {
  if (selectors?.title) {
    selectors.title.textContent = settings?.output?.title || text.title;
  }
  if (selectors?.footerSource) {
    selectors.footerSource.textContent = settings?.output?.footerSource || defaultFooterSource;
  }
  if (settings?.output?.pageTitle) {
    document.title = settings.output.pageTitle;
  }
  if (selectors?.scrollTopBtn) {
    selectors.scrollTopBtn.textContent = settings?.output?.scrollTopLabel || text.scrollTop;
  }
}

export function setupSharedPageUi({
  selectors,
  dashboardState,
  initializeTheme,
  applyTheme,
  themeStorageKey,
  onThemeChange,
  afterSectionNavigation,
}) {
  initializeTheme(dashboardState, selectors, { themeStorageKey });

  const toggleTheme = () => {
    applyTheme(dashboardState, selectors, dashboardState.theme === 'dark' ? 'light' : 'dark', {
      persist: true,
      themeStorageKey,
    });
    if (typeof onThemeChange === 'function') {
      onThemeChange();
    }
  };

  const layoutTools = createLayoutTools({ selectors });
  initSectionNavigation({ selectors, ...layoutTools });
  if (typeof afterSectionNavigation === 'function') {
    afterSectionNavigation();
  }
  initScrollTopButton({
    selectors,
    updateScrollTopButtonVisibility: layoutTools.updateScrollTopButtonVisibility,
    scheduleScrollTopUpdate: layoutTools.scheduleScrollTopUpdate,
  });
  initThemeToggle({ selectors, toggleTheme });
  initGlobalSearch({ selectors });
  initSearchClearButtons();
  initPageHelperCard();
  initExportMenus();
  initStateStrip();
}
