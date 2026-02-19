/**
 * @typedef MetricComputeContext
 * @property {string} metricId
 * @property {any} [lastShiftSummary]
 * @property {any} [heatmapData]
 * @property {any} [recentRow]
 */

/**
 * @param {MetricComputeContext} context
 */
function computeLastShiftSummaryMetric(context) {
  const summary = context?.lastShiftSummary;
  const metric = summary?.metrics?.[context.metricId];
  if (!metric || typeof metric !== 'object') {
    return null;
  }
  return metric;
}

/**
 * @param {MetricComputeContext} context
 */
function computeHeatmapMetric(context) {
  const metric = context?.heatmapData?.metrics?.[context.metricId];
  if (!metric || typeof metric !== 'object') {
    return null;
  }
  return metric;
}

/**
 * @param {MetricComputeContext} context
 */
function computeRecentMetric(context) {
  const row = context?.recentRow;
  if (!row || typeof row !== 'object') {
    return null;
  }
  const value = Number.isFinite(row[context.metricId]) ? row[context.metricId] : null;
  if (!Number.isFinite(value)) {
    return null;
  }
  return { value };
}

export const METRIC_COMPUTE_REGISTRY = {
  lastShiftSummaryMetric: computeLastShiftSummaryMetric,
  heatmapMetric: computeHeatmapMetric,
  recentMetric: computeRecentMetric,
};
