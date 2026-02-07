import { getDatasetValue, setDatasetValue } from '../utils/dom.js';
const APP_READY_EVENT = 'app:runtime-ready';

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
  const navBar = selectors.sectionNav.querySelector('.section-nav__bar');
  const navInner = selectors.sectionNav.querySelector('.section-nav__inner');
  const isMpa = links.some((link) => {
    const href = link.getAttribute('href') || '';
    return href && !href.startsWith('#');
  });
  if (isMpa) {
    setDatasetValue(selectors.sectionNav, 'navMode', 'mpa');
    const prefetched = new Set();
    const canPrefetch = () => {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (connection && connection.saveData) {
        return false;
      }
      const effectiveType = connection && typeof connection.effectiveType === 'string'
        ? connection.effectiveType.toLowerCase()
        : '';
      if (effectiveType.includes('2g')) {
        return false;
      }
      return true;
    };
    const ensureLinkAccessibility = (link) => {
      const labelText = (link.textContent || '').trim().replace(/\s+/g, ' ');
      if (!labelText) {
        return;
      }
      if (!link.getAttribute('aria-label')) {
        link.setAttribute('aria-label', labelText);
      }
      if (!link.getAttribute('title')) {
        link.setAttribute('title', labelText);
      }
    };
    const syncNavScrollable = () => {
      if (!navBar || !navInner) {
        return;
      }
      const isScrollable = navInner.scrollWidth - navInner.clientWidth > 2;
      setDatasetValue(navBar, 'scrollable', isScrollable ? 'true' : 'false');
    };
    const prefetchPage = (url) => {
      if (!(url instanceof URL)) {
        return;
      }
      const normalized = `${url.origin}${url.pathname}`;
      if (prefetched.has(normalized)) {
        return;
      }
      const currentPath = window.location.pathname || '/';
      if (url.pathname === currentPath || url.pathname === `${currentPath}index.html`) {
        return;
      }
      const existing = document.head.querySelector(`link[rel="prefetch"][href="${url.pathname}"]`);
      if (existing) {
        prefetched.add(normalized);
        return;
      }
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.as = 'document';
      link.href = url.pathname;
      document.head.appendChild(link);
      prefetched.add(normalized);
    };
    const normalizePath = (value) => {
      if (!value || value === '/') {
        return '/index.html';
      }
      return value.endsWith('/') ? `${value}index.html` : value;
    };
    const currentPath = normalizePath(window.location.pathname);
    links.forEach((link) => {
      const linkHref = link.getAttribute('href') || '';
      if (!linkHref) {
        return;
      }
      ensureLinkAccessibility(link);
      const linkUrl = new URL(linkHref, window.location.href);
      const linkPath = normalizePath(linkUrl.pathname);
      const isActive = linkPath === currentPath;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
      if (canPrefetch() && !isActive) {
        const prefetchOnIntent = () => {
          prefetchPage(linkUrl);
        };
        link.addEventListener('mouseenter', prefetchOnIntent, { passive: true });
        link.addEventListener('focus', prefetchOnIntent, { passive: true });
      }
    });
    syncNavScrollable();
    if (navInner && getDatasetValue(navInner, 'scrollWatch', '') !== 'bound') {
      navInner.addEventListener('scroll', syncNavScrollable, { passive: true });
      setDatasetValue(navInner, 'scrollWatch', 'bound');
    }
    if (getDatasetValue(selectors.sectionNav, 'scrollWatch', '') !== 'bound') {
      window.addEventListener('resize', syncNavScrollable, { passive: true });
      window.addEventListener('load', syncNavScrollable, { passive: true });
      setDatasetValue(selectors.sectionNav, 'scrollWatch', 'bound');
    }
    if (canPrefetch()) {
      const cpuCount = typeof navigator.hardwareConcurrency === 'number'
        ? navigator.hardwareConcurrency
        : 8;
      const idlePrefetchLimit = cpuCount <= 4 ? 0 : 1;
      const idle = typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback.bind(window)
        : (cb) => window.setTimeout(cb, 250);
      const runIdlePrefetch = () => {
        if (idlePrefetchLimit <= 0) {
          return;
        }
        idle(() => {
          links
            .filter((link) => link.getAttribute('aria-current') !== 'page')
            .slice(0, idlePrefetchLimit)
            .forEach((link) => {
              const href = link.getAttribute('href');
              if (!href) {
                return;
              }
              prefetchPage(new URL(href, window.location.href));
            });
        });
      };
      const ready = getDatasetValue(selectors.sectionNav, 'appReady', '') === 'true'
        || Boolean(window.__edRuntimeReady);
      if (ready) {
        runIdlePrefetch();
      } else {
        const onReady = () => {
          window.removeEventListener(APP_READY_EVENT, onReady);
          setDatasetValue(selectors.sectionNav, 'appReady', 'true');
          runIdlePrefetch();
        };
        window.addEventListener(APP_READY_EVENT, onReady, { once: true });
        window.setTimeout(() => {
          if (getDatasetValue(selectors.sectionNav, 'appReady', '') === 'true') {
            return;
          }
          setDatasetValue(selectors.sectionNav, 'appReady', 'true');
          runIdlePrefetch();
        }, 4500);
      }
    }
    sectionNavState.initialized = true;
    return;
  }
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
  window.addEventListener('orientationchange', scheduleLayoutRefresh, { passive: true });
  window.addEventListener('load', scheduleLayoutRefresh);
  if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
    window.visualViewport.addEventListener('resize', scheduleLayoutRefresh, { passive: true });
  }

  syncSectionNavVisibility();
  waitForFontsAndStyles().then(() => {
    updateLayoutMetrics();
    refreshSectionObserver();
    updateScrollTopButtonVisibility();
    flushPendingLayoutRefresh();
  });
}
