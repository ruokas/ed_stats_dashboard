import { initializeLazyLoading, initializeServiceWorker, preloadChartJs } from './bootstrap.js';
import { createPageBootstrapContext } from './runtime/core-context.js';
import { RUNTIME_MODULE_BY_PAGE, resolvePageId, shouldPreloadChartJs } from './runtime/page-config.js';

function getRunnerExportName(pageId) {
  switch (pageId) {
    case 'charts':
      return 'runChartsPage';
    case 'recent':
      return 'runRecentPage';
    case 'summaries':
      return 'runSummariesPage';
    case 'gydytojai':
      return 'runGydytojaiPage';
    case 'feedback':
      return 'runFeedbackPage';
    case 'ed':
      return 'runEdPage';
    default:
      return 'runKpiPage';
  }
}

function isProfilingEnabled() {
  try {
    const raw = window.localStorage.getItem('edDashboardClientConfig-v1');
    if (!raw) {
      return false;
    }
    const parsed = JSON.parse(raw);
    return parsed?.profilingEnabled === true;
  } catch (_error) {
    return false;
  }
}

export async function startApp() {
  const profilingEnabled = isProfilingEnabled();
  const chartsLifecycleMeasureState = {
    firstVisibleMeasured: false,
    secondaryMeasured: false,
  };
  const summariesLifecycleMeasureState = {
    firstVisibleMeasured: false,
    secondaryMeasured: false,
  };
  const mark = (name) => {
    if (!profilingEnabled || typeof performance?.mark !== 'function') {
      return;
    }
    performance.mark(name);
  };
  const measure = (name, start, end) => {
    if (!profilingEnabled || typeof performance?.measure !== 'function') {
      return;
    }
    performance.measure(name, start, end);
  };

  mark('app-start-entered');
  initializeServiceWorker({ updateClientConfig: () => {} });
  initializeLazyLoading();

  const pageId = resolvePageId(document.body?.dataset?.page);
  if (profilingEnabled && pageId === 'charts' && typeof window?.addEventListener === 'function') {
    window.addEventListener(
      'app:charts-primary-visible',
      () => {
        if (chartsLifecycleMeasureState.firstVisibleMeasured) {
          return;
        }
        chartsLifecycleMeasureState.firstVisibleMeasured = true;
        mark('app-charts-primary-visible');
        measure('app:charts-first-visible', 'app-start-entered', 'app-charts-primary-visible');
      },
      { once: true }
    );
    window.addEventListener(
      'app:charts-secondary-complete',
      () => {
        if (chartsLifecycleMeasureState.secondaryMeasured) {
          return;
        }
        chartsLifecycleMeasureState.secondaryMeasured = true;
        mark('app-charts-secondary-complete');
        measure('app:charts-secondary-complete', 'app-start-entered', 'app-charts-secondary-complete');
      },
      { once: true }
    );
  }
  if (profilingEnabled && pageId === 'summaries' && typeof window?.addEventListener === 'function') {
    window.addEventListener(
      'app:summaries-primary-visible',
      () => {
        if (summariesLifecycleMeasureState.firstVisibleMeasured) {
          return;
        }
        summariesLifecycleMeasureState.firstVisibleMeasured = true;
        mark('app-summaries-primary-visible');
        measure('app:summaries-first-visible', 'app-start-entered', 'app-summaries-primary-visible');
      },
      { once: true }
    );
    window.addEventListener(
      'app:summaries-secondary-complete',
      () => {
        if (summariesLifecycleMeasureState.secondaryMeasured) {
          return;
        }
        summariesLifecycleMeasureState.secondaryMeasured = true;
        mark('app-summaries-secondary-complete');
        measure('app:summaries-secondary-complete', 'app-start-entered', 'app-summaries-secondary-complete');
      },
      { once: true }
    );
  }
  if (shouldPreloadChartJs(pageId)) {
    preloadChartJs();
  }
  // Yield one frame so hero/nav can paint before heavier runtime work begins.
  if (typeof window.requestAnimationFrame === 'function') {
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }
  const core = createPageBootstrapContext({ pageId });
  const runtimeModulePath = RUNTIME_MODULE_BY_PAGE[pageId] || RUNTIME_MODULE_BY_PAGE.kpi;
  const runtimeModule = await import(runtimeModulePath);
  mark('app-runtime-module-imported');
  const runnerExportName = getRunnerExportName(pageId);
  const runPage = runtimeModule[runnerExportName];
  if (typeof runPage !== 'function') {
    throw new Error(`Nerastas puslapio runtime vykdytojas: ${runnerExportName}`);
  }
  await runPage(core);
  mark('app-page-runner-complete');
  mark('app-first-meaningful-render');
  window.__edRuntimeReady = pageId;
  if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('app:runtime-ready', { detail: { pageId } }));
  }

  if (profilingEnabled) {
    measure('app:router-import', 'app-start-entered', 'app-runtime-module-imported');
    measure('app:page-runner', 'app-runtime-module-imported', 'app-page-runner-complete');
    measure('app:startup-total', 'app-start-entered', 'app-first-meaningful-render');
    const rows = performance
      .getEntriesByType('measure')
      .filter((entry) => entry.name.startsWith('app:'))
      .map((entry) => ({ metric: entry.name, ms: Number(entry.duration.toFixed(2)) }));
    if (rows.length) {
      console.table(rows);
    }
  }
}
