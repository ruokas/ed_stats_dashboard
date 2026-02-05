import { getDatasetValue, setDatasetValue } from '../utils/dom.js';

export function initSectionNavigation(env) {
  const {
    selectors,
    sectionNavState,
    sectionVisibility,
    sectionNavCompactQuery,
    setLayoutRefreshAllowed,
    getLayoutResizeObserver,
    setLayoutResizeObserver,
    updateSectionNavCompactState,
    handleNavKeydown,
    scheduleLayoutRefresh,
    syncSectionNavVisibility,
    waitForFontsAndStyles,
    updateLayoutMetrics,
    refreshSectionObserver,
    updateScrollTopButtonVisibility,
    flushPendingLayoutRefresh,
  } = env;

  if (sectionNavState.initialized) {
    scheduleLayoutRefresh();
    return;
  }
  if (!selectors.sectionNav) {
    return;
  }
  setLayoutRefreshAllowed(true);
  const links = Array.from(selectors.sectionNav.querySelectorAll('.section-nav__link'));
  selectors.sectionNavLinks = links;
  sectionNavState.items = [];
  sectionNavState.itemBySection = new Map();
  sectionVisibility.clear();

  links.forEach((link) => {
    const href = link.getAttribute('href') || '';
    const headingId = href.startsWith('#') ? href.slice(1) : '';
    const headingEl = headingId ? document.getElementById(headingId) : null;
    const sectionEl = headingEl ? headingEl.closest('section[data-section]') : null;
    if (!headingId || !sectionEl) {
      link.hidden = true;
      link.setAttribute('aria-hidden', 'true');
      link.setAttribute('tabindex', '-1');
      return;
    }
    const item = { link, headingId, section: sectionEl };
    sectionNavState.items.push(item);
    sectionNavState.itemBySection.set(sectionEl, item);
    sectionVisibility.set(headingId, { ratio: 0, top: Number.POSITIVE_INFINITY });
  });

  if (!sectionNavState.items.length) {
    return;
  }

  selectors.sectionNavLinks = sectionNavState.items.map((item) => item.link);

  updateSectionNavCompactState();
  if (sectionNavCompactQuery) {
    const handleCompactChange = (event) => updateSectionNavCompactState(event.matches);
    if (typeof sectionNavCompactQuery.addEventListener === 'function') {
      sectionNavCompactQuery.addEventListener('change', handleCompactChange);
    } else if (typeof sectionNavCompactQuery.addListener === 'function') {
      sectionNavCompactQuery.addListener(handleCompactChange);
    }
  }

  sectionNavState.initialized = true;
  if (selectors.sectionNav && getDatasetValue(selectors.sectionNav, 'keyboard', '') !== 'bound') {
    selectors.sectionNav.addEventListener('keydown', handleNavKeydown);
    setDatasetValue(selectors.sectionNav, 'keyboard', 'bound');
  }

  if (typeof ResizeObserver === 'function') {
    const activeObserver = getLayoutResizeObserver();
    if (activeObserver && typeof activeObserver.disconnect === 'function') {
      activeObserver.disconnect();
    }
    const observer = new ResizeObserver(() => {
      scheduleLayoutRefresh();
    });
    setLayoutResizeObserver(observer);
    if (selectors.hero) {
      observer.observe(selectors.hero);
    }
    if (selectors.sectionNav) {
      observer.observe(selectors.sectionNav);
    }
  }

  window.addEventListener('resize', scheduleLayoutRefresh, { passive: true });
  window.addEventListener('load', scheduleLayoutRefresh);

  syncSectionNavVisibility();
  waitForFontsAndStyles().then(() => {
    updateLayoutMetrics();
    refreshSectionObserver();
    updateScrollTopButtonVisibility();
    flushPendingLayoutRefresh();
  });
}
