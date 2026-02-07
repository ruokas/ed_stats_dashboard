let legacyRuntimePromise = null;

function loadLegacyRuntime() {
  if (!legacyRuntimePromise) {
    legacyRuntimePromise = import('../../runtime-legacy.js');
  }
  return legacyRuntimePromise;
}

export async function runLegacyPage(pageId) {
  const runtime = await loadLegacyRuntime();
  if (typeof runtime?.startLegacyApp !== 'function') {
    throw new Error('Nerastas startLegacyApp runtime-legacy modulyje.');
  }
  return runtime.startLegacyApp({ forcePageId: pageId, skipGlobalInit: true });
}

