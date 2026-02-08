import { startFullPageApp } from '../../full-page-app.js?v=2026-02-08-fullpage-refresh-2';

export function runChartsPage(core) {
  return startFullPageApp({ forcePageId: core?.pageId || 'charts', skipGlobalInit: true });
}
