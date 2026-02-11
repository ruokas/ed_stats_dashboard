import { byId, byQuery, byQueryAllIn, createPageShellSelectors } from '../helpers.js';

export function createRecentPageSelectors() {
  const main = byQuery('main.container');
  const sectionNav = byQuery('.section-nav');

  return {
    ...createPageShellSelectors({ sectionNav }),
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
