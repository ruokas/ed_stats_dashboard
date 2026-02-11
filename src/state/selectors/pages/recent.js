import { byId, byQuery, byQueryAllIn } from '../helpers.js';

export function createRecentPageSelectors() {
  const main = byQuery('main.container');
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
    tableDownloadButtons: byQueryAllIn(main, '[data-table-download]'),
    recentHeading: byId('recentHeading'),
    recentSubtitle: byId('recentSubtitle'),
    recentCaption: byId('recentCaption'),
    recentTable: byId('recentTable'),
    compareToggle: byId('compareToggle'),
    compareCard: byId('compareCard'),
    compareSummary: byId('compareSummary'),
    compareClear: byId('compareClear'),
    monthlyTable: null,
    yearlyTable: null,
  };
}
