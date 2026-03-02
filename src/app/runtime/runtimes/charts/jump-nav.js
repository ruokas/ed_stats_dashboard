import { initJumpStickyOffset } from '../../features/jump-sticky-offset.js';

export function initChartsJumpNavigation(selectors, options = {}) {
  const nav = selectors?.chartsJumpNav;
  const links = Array.isArray(selectors?.chartsJumpLinks) ? selectors.chartsJumpLinks : [];
  const onBeforeNavigate = typeof options?.onBeforeNavigate === 'function' ? options.onBeforeNavigate : null;
  if (!(nav instanceof HTMLElement) || !links.length) {
    return () => {};
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
    return () => {};
  }

  const applyActiveLink = (activeLink) => {
    items.forEach(({ link }) => {
      const isActive = link === activeLink;
      link.classList.toggle('active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  };

  const getStickyOffset = () => {
    const jumpNavHeight = nav instanceof HTMLElement ? nav.getBoundingClientRect().height : 0;
    const jumpNavTop = nav instanceof HTMLElement ? Number.parseFloat(getComputedStyle(nav).top) || 0 : 0;
    const safeGap = 10;
    const total = Math.ceil(
      (Number.isFinite(jumpNavTop) ? jumpNavTop : 0) +
        (Number.isFinite(jumpNavHeight) ? jumpNavHeight : 0) +
        safeGap
    );
    return Math.max(0, total);
  };

  const scrollToSectionStart = (target, { smooth = true, updateHash = true } = {}) => {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const offset = getStickyOffset();
    const targetTop = window.scrollY + target.getBoundingClientRect().top - offset;
    const nextTop = Math.max(0, Math.round(targetTop));
    window.scrollTo({
      top: nextTop,
      behavior: smooth ? 'smooth' : 'auto',
    });
    if (updateHash) {
      const hash = `#${target.id}`;
      if (window.location.hash !== hash) {
        try {
          window.history.replaceState({}, '', hash);
        } catch (_error) {
          // ignore history update errors
        }
      }
    }
  };

  const findLinkByHash = (hash) => {
    const normalized = String(hash || '')
      .trim()
      .toLowerCase();
    if (!normalized.startsWith('#')) {
      return null;
    }
    return items.find(
      ({ link }) =>
        String(link.getAttribute('href') || '')
          .trim()
          .toLowerCase() === normalized
    );
  };

  const hashMatchedLink = findLinkByHash(window.location.hash);
  if (hashMatchedLink) {
    applyActiveLink(hashMatchedLink.link);
  } else {
    applyActiveLink(items[0].link);
  }

  const clickHandlers = items.map(({ link, target }) => {
    const onClick = (event) => {
      event.preventDefault();
      if (onBeforeNavigate) {
        onBeforeNavigate({ link, target });
      }
      scrollToSectionStart(target, { smooth: true, updateHash: true });
      applyActiveLink(link);
    };
    link.addEventListener('click', onClick);
    return { link, onClick };
  });

  const onHashChange = () => {
    const hashLink = findLinkByHash(window.location.hash);
    if (!hashLink) {
      return;
    }
    applyActiveLink(hashLink.link);
  };
  window.addEventListener('hashchange', onHashChange);

  const visibility = new Map(
    items.map(({ target }) => [target, { ratio: 0, top: Number.POSITIVE_INFINITY }])
  );
  const updateActiveFromVisibility = () => {
    const sorted = items
      .map((item) => {
        const state = visibility.get(item.target);
        if (!state) {
          return { ...item, ratio: 0, top: Number.POSITIVE_INFINITY };
        }
        const ratio = Number(state.ratio) || 0;
        const top = Number(state.top);
        return {
          ...item,
          ratio,
          top: Number.isFinite(top) ? top : Number.POSITIVE_INFINITY,
        };
      })
      .sort((a, b) => {
        if (b.ratio !== a.ratio) return b.ratio - a.ratio;
        return a.top - b.top;
      });
    const best = sorted.find((item) => item.ratio > 0);
    if (best) {
      applyActiveLink(best.link);
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        visibility.set(entry.target, {
          ratio: entry.intersectionRatio,
          top: entry.boundingClientRect.top,
        });
      });
      updateActiveFromVisibility();
    },
    {
      root: null,
      rootMargin: '-20% 0px -60% 0px',
      threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
    }
  );
  items.forEach(({ target }) => {
    observer.observe(target);
  });

  return () => {
    clickHandlers.forEach(({ link, onClick }) => {
      link.removeEventListener('click', onClick);
    });
    window.removeEventListener('hashchange', onHashChange);
    observer.disconnect();
  };
}

export function initChartsJumpStickyOffset(selectors) {
  initJumpStickyOffset({
    jumpNav: selectors?.chartsJumpNav,
    jumpLinks: selectors?.chartsJumpLinks,
    bottomControls: selectors?.chartPeriodControls,
  });
}
