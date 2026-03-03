export function isAbortError(error) {
  return Boolean(error && typeof error === 'object' && error.name === 'AbortError');
}

export function startPerfStage(perfMonitor, label, meta = {}) {
  try {
    return perfMonitor?.start?.(label, meta) ?? null;
  } catch (_error) {
    return null;
  }
}

export function finishPerfStage(perfMonitor, handle, meta = {}) {
  if (!handle) {
    return;
  }
  try {
    perfMonitor?.finish?.(handle, meta);
  } catch (_error) {
    // ignore perf instrumentation failures
  }
}

export function markBrowserMetric(name) {
  if (typeof performance?.mark !== 'function') {
    return;
  }
  try {
    performance.mark(name);
  } catch (_error) {
    // ignore perf mark failures
  }
}

export function dispatchChartsLifecycleEvent(name, detail = {}) {
  if (typeof window?.dispatchEvent !== 'function' || typeof window?.CustomEvent !== 'function') {
    return;
  }
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function ensureChartsStartupState(dashboardState) {
  if (!dashboardState.chartsStartupPhases || typeof dashboardState.chartsStartupPhases !== 'object') {
    dashboardState.chartsStartupPhases = {
      primaryVisible: false,
      secondaryComplete: false,
      hospitalRendered: false,
    };
  }
  if (
    !dashboardState.chartsSectionRenderFlags ||
    typeof dashboardState.chartsSectionRenderFlags !== 'object'
  ) {
    dashboardState.chartsSectionRenderFlags = {
      heatmapVisible: false,
      hourlyVisible: false,
      heatmapRendered: false,
      hourlyRendered: false,
      hospitalVisible: false,
    };
  }
}

export function computeMainDataSignature(dataset, cachedDailyStats) {
  if (cachedDailyStats) {
    return `session:${Array.isArray(cachedDailyStats) ? cachedDailyStats.length : 0}`;
  }
  const primarySignature =
    dataset?.meta?.primary?.signature ||
    dataset?.meta?.primary?.etag ||
    dataset?.meta?.primary?.lastModified ||
    '';
  const historicalSignature =
    dataset?.meta?.historical?.signature ||
    dataset?.meta?.historical?.etag ||
    dataset?.meta?.historical?.lastModified ||
    '';
  return `${primarySignature}|${historicalSignature}`;
}

export function computeEdRenderKey(edData) {
  if (!edData || typeof edData !== 'object') {
    return '';
  }
  const signature = String(edData?.meta?.signature || '').trim();
  const records = Array.isArray(edData.records) ? edData.records : [];
  const daily = Array.isArray(edData.daily) ? edData.daily : [];
  const summary = edData.summary && typeof edData.summary === 'object' ? edData.summary : {};
  const latestDailyKey = String(
    daily.length ? daily[daily.length - 1]?.dateKey || daily[daily.length - 1]?.date || '' : ''
  ).trim();
  const latestSnapshot = String(summary.latestSnapshotLabel || '').trim();
  const entryCount = Number.isFinite(Number(summary.entryCount))
    ? Number(summary.entryCount)
    : records.length;
  const patients = Number.isFinite(Number(summary.currentPatients))
    ? Number(summary.currentPatients).toFixed(2)
    : '';
  return [signature, records.length, daily.length, latestDailyKey, latestSnapshot, entryCount, patients].join(
    '|'
  );
}

export function logRefreshDecision(clientConfig, scope, decision, meta = {}) {
  const shouldLog = clientConfig?.debugRefresh === true || clientConfig?.profilingEnabled === true;
  if (!shouldLog) {
    return;
  }
  try {
    console.debug(`[refresh:${scope}] ${decision}`, meta);
  } catch (_error) {
    // ignore debug logger errors
  }
}

export function readDailyStatsFromSessionCache(options) {
  const { canUseDailyStatsCache, key, ttlMs } = options || {};
  if (!canUseDailyStatsCache) {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.dailyStats) || !Number.isFinite(parsed.savedAt)) {
      return null;
    }
    if (parsed.scope !== 'full') {
      return null;
    }
    if (Date.now() - parsed.savedAt > ttlMs) {
      return null;
    }
    return parsed.dailyStats;
  } catch (_error) {
    return null;
  }
}

export function writeDailyStatsToSessionCache(dailyStats, options) {
  const { key, scope = 'full' } = options || {};
  if (!Array.isArray(dailyStats) || !dailyStats.length) {
    return;
  }
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        savedAt: Date.now(),
        scope,
        dailyStats,
      })
    );
  } catch (_error) {
    // Ignore storage quota and serialization errors.
  }
}
