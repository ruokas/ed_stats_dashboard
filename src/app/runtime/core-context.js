import { PAGE_CONFIG } from './page-config.js';

export function createRuntimeCore({ pageId }) {
  const resolvedPageId = Object.prototype.hasOwnProperty.call(PAGE_CONFIG, pageId) ? pageId : 'kpi';
  return {
    pageId: resolvedPageId,
    pageConfig: PAGE_CONFIG[resolvedPageId],
    startedAt: Date.now(),
  };
}
