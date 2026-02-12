const FULL_PAGE_APP_MODULE = '../../full-page-app.js?v=2026-02-08-fullpage-refresh-2';

export async function runLegacyFallback(core, defaultPageId) {
  const pageId = core?.pageId || defaultPageId;
  const { startFullPageApp } = await import(FULL_PAGE_APP_MODULE);
  return startFullPageApp({ forcePageId: pageId, skipGlobalInit: true });
}
