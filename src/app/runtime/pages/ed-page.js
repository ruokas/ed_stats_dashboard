import { startFullPageApp } from '../../full-page-app.js?v=2026-02-08-fullpage-refresh-2';

export function runEdPage(core) {
  return startFullPageApp({ forcePageId: core?.pageId || 'ed', skipGlobalInit: true });
}
