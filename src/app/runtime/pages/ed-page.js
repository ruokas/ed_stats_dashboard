import { startFullPageApp } from '../../runtime-full.js';

export function runEdPage(core) {
  return startFullPageApp({ forcePageId: core?.pageId || 'ed', skipGlobalInit: true });
}
