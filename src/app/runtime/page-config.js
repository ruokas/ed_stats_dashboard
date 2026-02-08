export const PAGE_CONFIG = {
  kpi: { kpi: true },
  charts: { charts: true, heatmap: true, hourly: true },
  recent: { recent: true },
  summaries: { monthly: false, yearly: true },
  feedback: { feedback: true },
  ed: { ed: true, tv: false },
};

export const RUNTIME_MODULE_BY_PAGE = {
  kpi: './runtime/pages/kpi-page.js?v=2026-02-08-runtime-refresh-1',
  charts: './runtime/pages/charts-page.js?v=2026-02-08-runtime-refresh-2',
  recent: './runtime/pages/recent-page.js?v=2026-02-08-runtime-refresh-1',
  summaries: './runtime/pages/summaries-page.js?v=2026-02-08-runtime-refresh-1',
  feedback: './runtime/pages/feedback-page.js?v=2026-02-08-runtime-refresh-1',
  ed: './runtime/pages/ed-page.js?v=2026-02-08-runtime-refresh-1',
};

const CHART_PRELOAD_PAGES = new Set(['charts', 'ed']);

export function shouldPreloadChartJs(pageId) {
  const normalized = typeof pageId === 'string' ? pageId.trim().toLowerCase() : '';
  return CHART_PRELOAD_PAGES.has(normalized);
}

export function resolvePageId(rawPageId) {
  const normalized = typeof rawPageId === 'string' ? rawPageId.trim().toLowerCase() : '';
  return Object.prototype.hasOwnProperty.call(PAGE_CONFIG, normalized) ? normalized : 'kpi';
}
