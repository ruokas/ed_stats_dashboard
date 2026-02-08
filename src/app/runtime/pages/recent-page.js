import { startFullPageApp } from '../../full-page-app.js?v=2026-02-08-fullpage-refresh-2';

export function runRecentPage(core) {
  return startFullPageApp({ forcePageId: core?.pageId || 'recent', skipGlobalInit: true });
}
