import { getMetricLabelOverride } from './catalog-overrides.js';
import { getMetricById, getMetricSurfaceMeta } from './index.js';

const RECENT_COMPARE_METRIC_MAP = {
  total: 'total',
  avgStay: 'avgTime',
  emsShare: 'emsShare',
  hospShare: 'hospShare',
};

/**
 * @param {string} compareMetricKey
 * @param {Record<string, string>} fallbackLabels
 * @param {Record<string, any>} [settings]
 */
export function getRecentCompareMetricLabel(compareMetricKey, fallbackLabels = {}, settings = null) {
  const metricId = RECENT_COMPARE_METRIC_MAP[compareMetricKey] || '';
  if (metricId) {
    const definition = getMetricById(metricId);
    const surfaceLabel = getMetricSurfaceMeta(definition, 'recent-compare')?.label;
    const baseLabel =
      typeof surfaceLabel === 'string' && surfaceLabel.trim()
        ? surfaceLabel
        : typeof definition?.label === 'string'
          ? definition.label
          : '';
    const overrideLabel = getMetricLabelOverride(settings, metricId, baseLabel);
    if (typeof overrideLabel === 'string' && overrideLabel.trim()) {
      return overrideLabel;
    }
  }
  const fallback =
    fallbackLabels && typeof fallbackLabels === 'object' ? fallbackLabels[compareMetricKey] : '';
  if (typeof fallback === 'string' && fallback.trim()) {
    return fallback;
  }
  return compareMetricKey;
}
