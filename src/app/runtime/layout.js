import { getDatasetValue, setDatasetValue } from '../../utils/dom.js';

export function createLayoutTools({ selectors }) {
  const sectionNavState = {
    initialized: false,
    items: [],
    itemBySection: new Map(),
    activeHeadingId: '',
  };

  const sectionNavCompactQuery =
    typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 640px)') : null;

  const sectionVisibility = new Map();
  const layoutMetrics = { hero: 0, nav: 0 };
  let sectionObserver = null;
  let layoutRefreshHandle = null;
  let layoutResizeObserver = null;
  let layoutStylesReady = false;
  let layoutStylesReadyPromise = null;
  let layoutRefreshAllowed = false;
  let pendingLayoutRefresh = false;
  const scrollTopState = { visible: false, rafHandle: null };

  function setLayoutRefreshAllowed(value) {
    layoutRefreshAllowed = Boolean(value);
  }

  function getLayoutResizeObserver() {
    return layoutResizeObserver;
  }

  function setLayoutResizeObserver(observer) {
    layoutResizeObserver = observer;
  }

  function updateLayoutMetrics() {
    const heroElement = selectors.hero;
    const navElement = selectors.sectionNav;
    const heroHeight = heroElement ? heroElement.getBoundingClientRect().height : 0;
    const navHeight = navElement ? navElement.getBoundingClientRect().height : 0;
    layoutMetrics.hero = heroHeight;
    layoutMetrics.nav = navHeight;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--hero-height', `${Math.max(0, heroHeight).toFixed(2)}px`);
    rootStyle.setProperty('--section-nav-height', `${Math.max(0, navHeight).toFixed(2)}px`);
  }

  function getScrollOffset() {
    if (typeof window.scrollY === 'number') {
      return window.scrollY;
    }
    if (typeof window.pageYOffset === 'number') {
      return window.pageYOffset;
    }
    return document.documentElement?.scrollTop || document.body?.scrollTop || 0;
  }

  function updateScrollTopButtonVisibility() {
    const button = selectors.scrollTopBtn;
    if (!button) {
      return;
    }
    const threshold = Math.max(160, Math.round(layoutMetrics.hero + layoutMetrics.nav + 40));
    const offset = getScrollOffset();
    const shouldShow = offset > threshold;
    if (scrollTopState.visible !== shouldShow) {
      scrollTopState.visible = shouldShow;
      setDatasetValue(button, 'visible', shouldShow ? 'true' : 'false');
    }
    button.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    button.setAttribute('tabindex', shouldShow ? '0' : '-1');
  }

  function scheduleScrollTopUpdate() {
    if (scrollTopState.rafHandle) {
      return;
    }
    const raf =
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (cb) => window.setTimeout(cb, 16);
    scrollTopState.rafHandle = raf(() => {
      scrollTopState.rafHandle = null;
      updateScrollTopButtonVisibility();
    });
  }

  function updateActiveNavLink(headingId) {
    sectionNavState.activeHeadingId = headingId;
    sectionNavState.items.forEach((item) => {
      const isActive = Boolean(headingId) && item.headingId === headingId && !item.link.hidden;
      if (isActive) {
        item.link.setAttribute('aria-current', 'true');
      } else {
        item.link.removeAttribute('aria-current');
      }
      item.link.classList.toggle('is-active', isActive);
    });
  }

  function evaluateActiveSection() {
    if (!sectionNavState.initialized) {
      return;
    }
    const visibleItems = sectionNavState.items.filter(
      (item) => item.section && !item.section.hasAttribute('hidden') && !item.link.hidden
    );
    if (!visibleItems.length) {
      updateActiveNavLink('');
      return;
    }
    const sorted = visibleItems
      .map((item) => {
        const data = sectionVisibility.get(item.headingId) || { ratio: 0, top: Number.POSITIVE_INFINITY };
        return { item, ratio: data.ratio, top: data.top };
      })
      .sort((a, b) => {
        const ratioDiff = b.ratio - a.ratio;
        if (Math.abs(ratioDiff) > 0.0001) {
          return ratioDiff;
        }
        return a.top - b.top;
      });
    const best =
      sorted.find((candidate) => candidate.ratio > 0) ??
      sorted.find((candidate) => candidate.top >= 0) ??
      sorted[0];
    if (best && best.item.headingId !== sectionNavState.activeHeadingId) {
      updateActiveNavLink(best.item.headingId);
    }
  }

  function updateSectionNavCompactState(forceCompact) {
    if (!selectors.sectionNav) {
      return;
    }

    const isCompact =
      typeof forceCompact === 'boolean' ? forceCompact : Boolean(sectionNavCompactQuery?.matches);

    selectors.sectionNav.classList.toggle('section-nav--compact', isCompact);

    selectors.sectionNavLinks.forEach((link) => {
      const labelText = (link.querySelector('.section-nav__label')?.textContent || '').trim();
      if (!labelText) {
        link.removeAttribute('aria-label');
        link.removeAttribute('title');
        return;
      }

      if (isCompact) {
        link.setAttribute('aria-label', labelText);
        link.setAttribute('title', labelText);
      } else {
        link.removeAttribute('aria-label');
        link.removeAttribute('title');
      }
    });
  }

  function waitForFontsAndStyles() {
    if (layoutStylesReadyPromise) {
      return layoutStylesReadyPromise;
    }
    layoutStylesReadyPromise = new Promise((resolve) => {
      if (layoutStylesReady) {
        resolve();
        return;
      }
      if (document.readyState === 'complete') {
        layoutStylesReady = true;
        resolve();
        return;
      }
      window.addEventListener(
        'load',
        () => {
          layoutStylesReady = true;
          resolve();
        },
        { once: true }
      );
    });
    return layoutStylesReadyPromise;
  }

  function refreshSectionObserver() {
    if (!sectionNavState.initialized) {
      return;
    }
    if (sectionObserver) {
      sectionObserver.disconnect();
      sectionObserver = null;
    }
    const observedItems = sectionNavState.items.filter(
      (item) => item.section && !item.section.hasAttribute('hidden')
    );
    if (!observedItems.length) {
      return;
    }
    sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const item = sectionNavState.itemBySection.get(entry.target);
          if (!item) {
            return;
          }
          if (!entry.isIntersecting) {
            sectionVisibility.set(item.headingId, { ratio: 0, top: Number.POSITIVE_INFINITY });
            return;
          }
          sectionVisibility.set(item.headingId, {
            ratio: entry.intersectionRatio,
            top: entry.boundingClientRect.top,
          });
        });
        evaluateActiveSection();
      },
      { rootMargin: '-40% 0px -40% 0px', threshold: [0, 0.1, 0.25, 0.5, 1] }
    );
    observedItems.forEach((item) => {
      sectionObserver.observe(item.section);
    });
  }

  function scheduleLayoutRefresh() {
    if (!sectionNavState.initialized) {
      return;
    }
    if (!layoutRefreshAllowed) {
      pendingLayoutRefresh = true;
      return;
    }
    if (layoutRefreshHandle) {
      return;
    }
    if (typeof window.requestAnimationFrame !== 'function') {
      updateLayoutMetrics();
      refreshSectionObserver();
      updateScrollTopButtonVisibility();
      return;
    }
    layoutRefreshHandle = window.requestAnimationFrame(() => {
      layoutRefreshHandle = null;
      updateLayoutMetrics();
      refreshSectionObserver();
      updateScrollTopButtonVisibility();
    });
  }

  function flushPendingLayoutRefresh() {
    if (pendingLayoutRefresh && layoutRefreshAllowed && layoutStylesReady) {
      pendingLayoutRefresh = false;
      scheduleLayoutRefresh();
    }
  }

  function handleNavKeydown(event) {
    if (!event || !event.target) {
      return;
    }
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }
    event.preventDefault();
    const visibleLinks = sectionNavState.items
      .map((item) => item.link)
      .filter(
        (link) =>
          link && !link.hidden && !link.hasAttribute('hidden') && link.getAttribute('aria-hidden') !== 'true'
      );
    if (!visibleLinks.length) {
      return;
    }
    const current = event.target.closest('.section-nav__link');
    const currentIndex = current ? visibleLinks.indexOf(current) : -1;
    let nextIndex = 0;
    if (event.key === 'ArrowLeft') {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : visibleLinks.length - 1;
    } else if (event.key === 'ArrowRight') {
      nextIndex = currentIndex >= 0 && currentIndex < visibleLinks.length - 1 ? currentIndex + 1 : 0;
    } else if (event.key === 'End') {
      nextIndex = visibleLinks.length - 1;
    }
    const nextLink = visibleLinks[nextIndex];
    if (nextLink && typeof nextLink.focus === 'function') {
      nextLink.focus();
    }
  }

  function syncSectionNavVisibility() {
    if (!sectionNavState.initialized) {
      return;
    }
    if (selectors.sectionNav && getDatasetValue(selectors.sectionNav, 'navMode') === 'mpa') {
      selectors.sectionNav.removeAttribute('hidden');
      selectors.sectionNav.removeAttribute('aria-hidden');
      return;
    }
    sectionNavState.items.forEach((item) => {
      if (!item.section || item.section.hasAttribute('hidden')) {
        item.link.hidden = true;
        item.link.setAttribute('aria-hidden', 'true');
        item.link.setAttribute('tabindex', '-1');
        sectionVisibility.set(item.headingId, { ratio: 0, top: Number.POSITIVE_INFINITY });
      } else {
        item.link.hidden = false;
        item.link.removeAttribute('aria-hidden');
        item.link.removeAttribute('tabindex');
      }
    });

    if (sectionNavState.items.every((item) => item.link.hidden)) {
      if (selectors.sectionNav) {
        selectors.sectionNav.setAttribute('hidden', 'hidden');
        selectors.sectionNav.setAttribute('aria-hidden', 'true');
      }
      return;
    }

    if (selectors.sectionNav) {
      selectors.sectionNav.removeAttribute('hidden');
      selectors.sectionNav.removeAttribute('aria-hidden');
    }

    if (!sectionNavState.activeHeadingId) {
      const firstVisible = sectionNavState.items.find((item) => !item.link.hidden);
      updateActiveNavLink(firstVisible?.headingId || '');
    } else {
      const activeItem = sectionNavState.items.find(
        (item) => item.headingId === sectionNavState.activeHeadingId
      );
      if (!activeItem || activeItem.link.hidden) {
        const firstVisible = sectionNavState.items.find((item) => !item.link.hidden);
        updateActiveNavLink(firstVisible?.headingId || '');
      }
    }
  }

  return {
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
    flushPendingLayoutRefresh,
    updateScrollTopButtonVisibility,
    scheduleScrollTopUpdate,
  };
}
