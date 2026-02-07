import { startFullPageApp } from '../../runtime-full.js';

export function runChartsPage(core) {
  return startFullPageApp({ forcePageId: core?.pageId || 'charts', skipGlobalInit: true });
}
