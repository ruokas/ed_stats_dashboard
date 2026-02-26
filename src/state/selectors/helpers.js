export function byId(id) {
  return document.getElementById(id);
}

export function byQuery(selector) {
  return document.querySelector(selector);
}

export function byQueryAll(selector) {
  return Array.from(document.querySelectorAll(selector));
}

export function byQueryIn(root, selector) {
  if (!root || !selector) {
    return null;
  }
  return root.querySelector(selector);
}

export function byQueryAllIn(root, selector) {
  if (!root || !selector) {
    return [];
  }
  return Array.from(root.querySelectorAll(selector));
}

export function createDefaultPageSelectors() {
  const sectionNav = byQuery('.section-nav');
  return createPageShellSelectors({ sectionNav });
}

export function createPageShellSelectors({ sectionNav = byQuery('.section-nav') } = {}) {
  return {
    hero: byQuery('header.hero'),
    title: byId('pageTitle'),
    status: byId('status'),
    footerSource: byId('footerSource'),
    globalSearchBtn: byId('globalSearchBtn'),
    themeToggleBtn: byId('themeToggleBtn'),
    scrollTopBtn: byId('scrollTopBtn'),
    sectionNav,
    sectionNavLinks: byQueryAllIn(sectionNav, '.section-nav__link'),
  };
}
