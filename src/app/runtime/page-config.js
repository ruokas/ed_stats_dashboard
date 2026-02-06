export const PAGE_CONFIG = {
  kpi: { kpi: true },
  charts: { charts: true, heatmap: true, hourly: true },
  recent: { recent: true },
  summaries: { monthly: false, yearly: true },
  feedback: { feedback: true },
  ed: { ed: true, tv: false },
};

export const RUNTIME_MODULE_BY_PAGE = {
  kpi: './runtime/pages/kpi-page.js',
  charts: './runtime/pages/charts-page.js',
  recent: './runtime/pages/recent-page.js',
  summaries: './runtime/pages/summaries-page.js',
  feedback: './runtime/pages/feedback-page.js',
  ed: './runtime/pages/ed-page.js',
};

export function resolvePageId(rawPageId) {
  const normalized = typeof rawPageId === 'string' ? rawPageId.trim().toLowerCase() : '';
  return Object.prototype.hasOwnProperty.call(PAGE_CONFIG, normalized) ? normalized : 'kpi';
}
