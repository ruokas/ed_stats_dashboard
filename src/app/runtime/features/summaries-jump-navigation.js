import { initJumpStickyOffset } from './jump-sticky-offset.js';

export function initSummariesJumpNavigation(selectors) {
  const nav = selectors?.summariesJumpNav;
  const links = Array.isArray(selectors?.summariesJumpLinks) ? selectors.summariesJumpLinks : [];
  if (!(nav instanceof HTMLElement) || !links.length) {
    return;
  }

  const items = links
    .map((link) => {
      const href = typeof link?.getAttribute === 'function' ? String(link.getAttribute('href') || '') : '';
      if (!href.startsWith('#')) {
        return null;
      }
      const target = document.getElementById(href.slice(1));
      if (!target) {
        return null;
      }
      return { link, target };
    })
    .filter(Boolean);
  if (!items.length) {
    return;
  }

  const applyActiveLink = (activeLink) => {
    items.forEach(({ link }) => {
      const isActive = link === activeLink;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  };

  const getStickyOffset = () => {
    const navHeight = nav instanceof HTMLElement ? nav.getBoundingClientRect().height : 0;
    const navTop = nav instanceof HTMLElement ? Number.parseFloat(getComputedStyle(nav).top) || 0 : 0;
    const safeGap = 10;
    const total = Math.ceil(
      (Number.isFinite(navTop) ? navTop : 0) + (Number.isFinite(navHeight) ? navHeight : 0) + safeGap
    );
    return total > 0 ? total : 160;
  };

  const scrollToSectionStart = (target, { smooth = true, updateHash = true } = {}) => {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const offset = getStickyOffset();
    const targetTop = window.scrollY + target.getBoundingClientRect().top - offset;
    const nextTop = Math.max(0, Math.round(targetTop));
    window.scrollTo({ top: nextTop, behavior: smooth ? 'smooth' : 'auto' });
    if (!updateHash || !target.id) {
      return;
    }
    const hash = `#${target.id}`;
    if (window.location.hash === hash) {
      return;
    }
    if (window.history && typeof window.history.pushState === 'function') {
      window.history.pushState(null, '', hash);
    } else {
      window.location.hash = hash;
    }
  };

  const findLinkByHash = (hash) => {
    if (!hash || hash === '#') {
      return null;
    }
    return items.find(({ link }) => link.getAttribute('href') === hash) || null;
  };

  const hashMatchedLink = findLinkByHash(window.location.hash);
  applyActiveLink(hashMatchedLink?.link || items[0].link);
  if (hashMatchedLink?.target) {
    window.setTimeout(() => {
      scrollToSectionStart(hashMatchedLink.target, { smooth: false, updateHash: false });
    }, 0);
  }

  items.forEach(({ link, target }) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      applyActiveLink(link);
      scrollToSectionStart(target, { smooth: true, updateHash: true });
    });
  });

  if (typeof IntersectionObserver !== 'function') {
    window.addEventListener('hashchange', () => {
      const hashLink = findLinkByHash(window.location.hash);
      if (hashLink?.link) {
        applyActiveLink(hashLink.link);
      }
      if (hashLink?.target) {
        scrollToSectionStart(hashLink.target, { smooth: false, updateHash: false });
      }
    });
    return;
  }

  const visibility = new Map(
    items.map(({ target }) => [target, { ratio: 0, top: Number.POSITIVE_INFINITY }])
  );
  const updateActiveFromVisibility = () => {
    let bestItem = null;
    let bestRatio = -1;
    let bestTop = Number.POSITIVE_INFINITY;
    items.forEach((item) => {
      const state = visibility.get(item.target);
      if (!state) {
        return;
      }
      const ratio = Number(state.ratio) || 0;
      const top = Number(state.top);
      if (ratio > bestRatio || (ratio === bestRatio && top < bestTop)) {
        bestRatio = ratio;
        bestTop = top;
        bestItem = item;
      }
    });
    if (bestItem && bestRatio > 0) {
      applyActiveLink(bestItem.link);
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        visibility.set(entry.target, {
          ratio: entry.isIntersecting ? entry.intersectionRatio : 0,
          top: Number(entry.boundingClientRect?.top) || Number.POSITIVE_INFINITY,
        });
      });
      updateActiveFromVisibility();
    },
    {
      root: null,
      rootMargin: '-24% 0px -54% 0px',
      threshold: [0, 0.12, 0.3, 0.55, 0.8],
    }
  );

  items.forEach(({ target }) => {
    observer.observe(target);
  });
}

export function initSummariesJumpStickyOffset(selectors) {
  initJumpStickyOffset({
    jumpNav: selectors?.summariesJumpNav,
    hero: selectors?.hero,
    jumpNavStickyTopVar: '--summaries-jump-sticky-top',
    documentStickyTopVar: '--summaries-jump-sticky-top',
    documentJumpNavHeightVar: '--summaries-jump-nav-height',
  });
}
