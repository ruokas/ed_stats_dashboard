import { byId, byQuery, createPageShellSelectors } from '../helpers.js';

export function createEdPageSelectors() {
  const sectionNav = byQuery('.section-nav');

  return {
    ...createPageShellSelectors({ sectionNav }),
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
