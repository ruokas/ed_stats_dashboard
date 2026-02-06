import { startLegacyApp } from '../../runtime-legacy.js';

export function runEdPage(core) {
  return startLegacyApp({ forcePageId: core?.pageId || 'ed', skipGlobalInit: true });
}
