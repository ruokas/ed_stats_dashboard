const RUNTIME_VERSION = '2026-02-25-runtime-refresh-5';

export const PAGE_CONFIG = {
  kpi: { kpi: true },
  charts: { charts: true, heatmap: true, hourly: true },
  recent: { recent: true },
  summaries: { monthly: false, yearly: true },
  gydytojai: { doctors: true },
  feedback: { feedback: true },
  ed: { ed: true, tv: false },
};

export const RUNTIME_MODULE_BY_PAGE = {
  kpi: `./runtime/pages/kpi-page.js?v=${RUNTIME_VERSION}`,
  charts: `./runtime/pages/charts-page.js?v=${RUNTIME_VERSION}`,
  recent: `./runtime/pages/recent-page.js?v=${RUNTIME_VERSION}`,
  summaries: `./runtime/pages/summaries-page.js?v=${RUNTIME_VERSION}`,
  gydytojai: `./runtime/pages/gydytojai-page.js?v=${RUNTIME_VERSION}`,
  feedback: `./runtime/pages/feedback-page.js?v=${RUNTIME_VERSION}`,
  ed: `./runtime/pages/ed-page.js?v=${RUNTIME_VERSION}`,
};

const CHART_PRELOAD_PAGES = new Set(['charts', 'ed', 'summaries', 'feedback', 'gydytojai']);

export function shouldPreloadChartJs(pageId) {
  const normalized = typeof pageId === 'string' ? pageId.trim().toLowerCase() : '';
  return CHART_PRELOAD_PAGES.has(normalized);
}

export function resolvePageId(rawPageId) {
  const normalized = typeof rawPageId === 'string' ? rawPageId.trim().toLowerCase() : '';
  return Object.hasOwn(PAGE_CONFIG, normalized) ? normalized : 'kpi';
}
