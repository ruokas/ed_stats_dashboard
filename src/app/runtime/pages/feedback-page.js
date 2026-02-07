import { startFullPageApp } from '../../runtime-full.js';

export function runFeedbackPage(core) {
  return startFullPageApp({ forcePageId: core?.pageId || 'feedback', skipGlobalInit: true });
}
