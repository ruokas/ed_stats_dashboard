export const PAGE_RUNTIME_REGISTRY = {
  kpi: {
    pageConfig: { kpi: true },
    modulePath: './runtime/runtimes/kpi-runtime.js',
    exportName: 'runKpiRuntime',
  },
  charts: {
    pageConfig: { charts: true, heatmap: true, hourly: true },
    modulePath: './runtime/runtimes/charts-runtime-impl.js',
    exportName: 'runChartsRuntime',
  },
  recent: {
    pageConfig: { recent: true },
    modulePath: './runtime/runtimes/recent-runtime.js',
    exportName: 'runRecentRuntime',
  },
  summaries: {
    pageConfig: { recent: true, monthly: false, yearly: true },
    modulePath: './runtime/runtimes/summaries-runtime-main.js',
    exportName: 'runSummariesRuntime',
  },
  gydytojai: {
    pageConfig: { doctors: true },
    modulePath: './runtime/runtimes/gydytojai-runtime-main.js',
    exportName: 'runGydytojaiRuntime',
  },
  feedback: {
    pageConfig: { feedback: true },
    modulePath: './runtime/runtimes/feedback-runtime.js',
    exportName: 'runFeedbackRuntime',
  },
  ed: {
    pageConfig: { ed: true, tv: false },
    modulePath: './runtime/runtimes/ed-runtime.js',
    exportName: 'runEdRuntime',
  },
};

export const PAGE_CONFIG = Object.fromEntries(
  Object.entries(PAGE_RUNTIME_REGISTRY).map(([pageId, entry]) => [pageId, entry.pageConfig])
);

export const RUNTIME_MODULE_BY_PAGE = Object.fromEntries(
  Object.entries(PAGE_RUNTIME_REGISTRY).map(([pageId, entry]) => [pageId, entry.modulePath])
);

const CHART_PRELOAD_PAGES = new Set(['kpi', 'charts', 'ed', 'summaries', 'feedback', 'gydytojai']);

export function shouldPreloadChartJs(pageId) {
  const normalized = typeof pageId === 'string' ? pageId.trim().toLowerCase() : '';
  return CHART_PRELOAD_PAGES.has(normalized);
}

export function resolvePageId(rawPageId) {
  const normalized = typeof rawPageId === 'string' ? rawPageId.trim().toLowerCase() : '';
  return Object.hasOwn(PAGE_RUNTIME_REGISTRY, normalized) ? normalized : 'kpi';
}

export function getPageRuntimeEntry(pageId) {
  return PAGE_RUNTIME_REGISTRY[resolvePageId(pageId)];
}
