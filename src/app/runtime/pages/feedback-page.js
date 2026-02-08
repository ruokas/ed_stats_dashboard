import { startFullPageApp } from '../../full-page-app.js?v=2026-02-08-fullpage-refresh-2';

export function runFeedbackPage(core) {
  return startFullPageApp({ forcePageId: core?.pageId || 'feedback', skipGlobalInit: true });
}
