const RUNTIME_MODE_STORAGE_KEY = 'edDashboard:runtimeMode:v1';

export function resolveRuntimeMode(pageId) {
  const normalizedPage = typeof pageId === 'string' ? pageId.trim().toLowerCase() : '';
  const fromQuery = (() => {
    try {
      const mode = new URLSearchParams(window.location.search).get('runtimeMode');
      return typeof mode === 'string' ? mode.trim().toLowerCase() : '';
    } catch (error) {
      return '';
    }
  })();
  if (fromQuery === 'legacy' || fromQuery === 'modular') {
    return fromQuery;
  }
  // ED puslapyje numatytai naudojame modular runtime,
  // kad veiktų naujas page-scoped loading/render kelias.
  if (normalizedPage === 'ed') {
    return 'modular';
  }
  const fromStorage = (() => {
    try {
      const mode = window.localStorage.getItem(RUNTIME_MODE_STORAGE_KEY);
      return typeof mode === 'string' ? mode.trim().toLowerCase() : '';
    } catch (error) {
      return '';
    }
  })();
  if (fromStorage === 'legacy' || fromStorage === 'modular') {
    return fromStorage;
  }
  // Keep legacy default for pages that are still being migrated.
  if (normalizedPage === 'kpi' || normalizedPage === 'charts' || normalizedPage === 'summaries' || normalizedPage === 'recent' || normalizedPage === 'feedback' || normalizedPage === 'ed') {
    return 'modular';
  }
  return 'legacy';
}
