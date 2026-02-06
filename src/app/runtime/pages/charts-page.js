import { startLegacyApp } from '../../runtime-legacy.js';

export function runChartsPage(core) {
  return startLegacyApp({ forcePageId: core?.pageId || 'charts', skipGlobalInit: true });
}
