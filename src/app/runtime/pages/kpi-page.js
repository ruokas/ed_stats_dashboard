import { startLegacyApp } from '../../runtime-legacy.js';

export function runKpiPage(core) {
  return startLegacyApp({ forcePageId: core?.pageId || 'kpi', skipGlobalInit: true });
}
