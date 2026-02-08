import { startFullPageApp } from '../../full-page-app.js?v=2026-02-08-fullpage-refresh-1';

export function createFullPageRunner(defaultPageId) {
  return function runFullPageComposition(core) {
    return startFullPageApp({
      forcePageId: core?.pageId || defaultPageId,
      skipGlobalInit: true,
    });
  };
}
