import { startLegacyApp } from '../../runtime-legacy.js';

export function runFeedbackPage(core) {
  return startLegacyApp({ forcePageId: core?.pageId || 'feedback', skipGlobalInit: true });
}
