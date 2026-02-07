import { startFullPageApp } from '../../runtime-full.js';

export function runRecentPage(core) {
  return startFullPageApp({ forcePageId: core?.pageId || 'recent', skipGlobalInit: true });
}
