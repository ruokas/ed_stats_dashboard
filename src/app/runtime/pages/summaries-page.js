import { startLegacyApp } from '../../runtime-legacy.js';

export function runSummariesPage(core) {
  return startLegacyApp({ forcePageId: core?.pageId || 'summaries', skipGlobalInit: true });
}
