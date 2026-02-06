import { initializeLazyLoading, initializeServiceWorker, preloadChartJs } from './bootstrap.js';
import { createRuntimeCore } from './runtime/core-context.js';
import { resolvePageId, RUNTIME_MODULE_BY_PAGE } from './runtime/page-config.js';

function getRunnerExportName(pageId) {
  switch (pageId) {
    case 'charts':
      return 'runChartsPage';
    case 'recent':
      return 'runRecentPage';
    case 'summaries':
      return 'runSummariesPage';
    case 'feedback':
      return 'runFeedbackPage';
    case 'ed':
      return 'runEdPage';
    case 'kpi':
    default:
      return 'runKpiPage';
  }
}

export async function startApp() {
  initializeServiceWorker({ updateClientConfig: () => {} });
  initializeLazyLoading();
  preloadChartJs();

  const pageId = resolvePageId(document.body?.dataset?.page);
  const core = createRuntimeCore({ pageId });
  const runtimeModulePath = RUNTIME_MODULE_BY_PAGE[pageId] || RUNTIME_MODULE_BY_PAGE.kpi;
  const runtimeModule = await import(runtimeModulePath);
  const runnerExportName = getRunnerExportName(pageId);
  const runPage = runtimeModule[runnerExportName];
  if (typeof runPage !== 'function') {
    throw new Error(`Nerastas puslapio runtime vykdytojas: ${runnerExportName}`);
  }
  await runPage(core);
}
