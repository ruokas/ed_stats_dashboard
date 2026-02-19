import { METRIC_COMPUTE_REGISTRY } from './compute-registry.js';
import { getMetricById } from './index.js';

/**
 * @param {{
 *   metricId: string;
 *   context?: Record<string, any>;
 *   registry?: Record<string, (context: any) => any>;
 *   formatValue?: (value: number, format: string) => string;
 * }} params
 */
export function resolveMetric(params) {
  const metricId = typeof params?.metricId === 'string' ? params.metricId.trim() : '';
  if (!metricId) {
    return { status: 'invalid_input' };
  }
  const definition = getMetricById(metricId);
  if (!definition) {
    return { status: 'unknown_metric', metricId };
  }
  const registry = params?.registry || METRIC_COMPUTE_REGISTRY;
  const compute = registry?.[definition.computeKey];
  if (typeof compute !== 'function') {
    return { status: 'missing_compute', metricId, definition };
  }
  const computed = compute({ ...(params?.context || {}), metricId, definition });
  if (!computed || typeof computed !== 'object') {
    return { status: 'no_data', metricId, definition };
  }
  const value = Number.isFinite(computed.value) ? computed.value : null;
  const average = Number.isFinite(computed.average) ? computed.average : null;
  const share = Number.isFinite(computed.share) ? computed.share : null;
  const averageShare = Number.isFinite(computed.averageShare) ? computed.averageShare : null;
  const formatter = typeof params?.formatValue === 'function' ? params.formatValue : null;
  return {
    status: value == null && average == null ? 'no_data' : 'ok',
    metricId,
    definition,
    label: definition.label,
    unit: definition.unit,
    format: definition.format,
    value,
    average,
    share,
    averageShare,
    formattedValue: value == null || !formatter ? null : formatter(value, definition.format),
  };
}
