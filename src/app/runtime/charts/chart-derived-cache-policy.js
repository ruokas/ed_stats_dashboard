const MAX_STAGE_CACHE_ENTRIES = 10;

export function setBoundedCacheEntry(map, key, value) {
  if (!(map instanceof Map)) {
    return;
  }
  map.set(key, value);
  while (map.size > MAX_STAGE_CACHE_ENTRIES) {
    const oldestKey = map.keys().next().value;
    map.delete(oldestKey);
  }
}

export function buildYearScopedStageKey(yearKey) {
  return String(yearKey || 'all');
}

export function buildFilteredRecordsStageKey(yearKey, filtersKey) {
  return [String(yearKey || 'all'), String(filtersKey || '')].join('|');
}

export function buildFilteredDailyStageKey(filteredRecordsStageKey, settingsKey) {
  return [String(filteredRecordsStageKey || ''), String(settingsKey || '')].join('|');
}

export function buildWindowedStageKey(filteredRecordsStageKey, settingsKey, period, mode) {
  return [
    String(filteredRecordsStageKey || ''),
    String(settingsKey || ''),
    String(period ?? 0),
    mode === 'year' ? 'year' : 'window',
  ].join('|');
}

export function buildFunnelStageKey(windowedStageKey, yearKey) {
  return [String(windowedStageKey || ''), String(yearKey || 'all')].join('|');
}

export function buildHeatmapStageKey(windowedStageKey) {
  return `${String(windowedStageKey || '')}|heatmap`;
}

export function buildHeatmapPrewarmKey(yearKey, filtersKey, settingsKey, mode) {
  return [
    String(yearKey || 'all'),
    String(filtersKey || ''),
    String(settingsKey || ''),
    mode === 'year' ? 'year' : 'window',
  ].join('|');
}

export function invalidateChartDerivedCacheByReason(cache, reason = 'all') {
  if (!cache || typeof cache !== 'object') {
    return;
  }
  if (reason === 'period') {
    cache.windowed = null;
    cache.funnel = null;
    cache.heatmap = null;
    return;
  }
  if (reason === 'filters') {
    cache.filteredRecords = null;
    cache.filteredDaily = null;
    cache.windowed = null;
    cache.funnel = null;
    cache.heatmap = null;
    return;
  }
  if (reason === 'year') {
    cache.yearScoped = null;
    cache.yearDaily = null;
    cache.filteredRecords = null;
    cache.filteredDaily = null;
    cache.windowed = null;
    cache.funnel = null;
    cache.heatmap = null;
    return;
  }
  cache.yearScoped = null;
  cache.yearDaily = null;
  cache.filteredRecords = null;
  cache.filteredDaily = null;
  cache.windowed = null;
  cache.funnel = null;
  cache.heatmap = null;
  if (cache.windowedByKey instanceof Map) {
    cache.windowedByKey.clear();
  }
  if (cache.funnelByKey instanceof Map) {
    cache.funnelByKey.clear();
  }
  if (cache.heatmapByKey instanceof Map) {
    cache.heatmapByKey.clear();
  }
  cache.heatmapPrewarmKey = '';
}
