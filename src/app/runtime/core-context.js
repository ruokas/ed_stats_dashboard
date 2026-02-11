import { PAGE_CONFIG } from './page-config.js';

export function createPageBootstrapContext({ pageId }) {
  const resolvedPageId = Object.hasOwn(PAGE_CONFIG, pageId) ? pageId : 'kpi';
  return {
    pageId: resolvedPageId,
    pageConfig: PAGE_CONFIG[resolvedPageId],
    startedAt: Date.now(),
  };
}

export function createRuntimeCore(options) {
  return createPageBootstrapContext(options || {});
}
