import { byId, byQuery, byQueryAllIn } from '../helpers.js';

export function createEdPageSelectors() {
  const sectionNav = byQuery('.section-nav');

  return {
    hero: byQuery('header.hero'),
    title: byId('pageTitle'),
    status: byId('status'),
    footerSource: byId('footerSource'),
    themeToggleBtn: byId('themeToggleBtn'),
    scrollTopBtn: byId('scrollTopBtn'),
    sectionNav,
    sectionNavLinks: byQueryAllIn(sectionNav, '.section-nav__link'),
    edHeading: byId('edHeading'),
    edStatus: byId('edStatus'),
    edSearchInput: byId('edSearchInput'),
    edCards: byId('edCards'),
    edDispositionsTitle: byId('edDispositionsTitle'),
    edDispositionsChart: byId('edDispositionsChart'),
    edDispositionsMessage: byId('edDispositionsMessage'),
    edStandardSection: byId('edStandardSection'),
    footer: byQuery('footer'),
  };
}
