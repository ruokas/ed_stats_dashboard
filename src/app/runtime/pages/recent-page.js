import { startLegacyApp } from '../../runtime-legacy.js';

export function runRecentPage(core) {
  return startLegacyApp({ forcePageId: core?.pageId || 'recent', skipGlobalInit: true });
}
