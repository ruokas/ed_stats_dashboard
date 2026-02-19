import { METRICS_CATALOG } from './catalog.js';
import { validateCatalog } from './catalog-validate.js';

validateCatalog(METRICS_CATALOG);

const metricsById = new Map(METRICS_CATALOG.metrics.map((metric) => [metric.id, metric]));

export function getMetricById(metricId) {
  if (typeof metricId !== 'string' || !metricId.trim()) {
    return null;
  }
  return metricsById.get(metricId.trim()) || null;
}

export function getMetricsBySurface(surfaceKey) {
  if (typeof surfaceKey !== 'string' || !surfaceKey.trim()) {
    return [];
  }
  return METRICS_CATALOG.metrics
    .filter((metric) => Array.isArray(metric.surfaces) && metric.surfaces.includes(surfaceKey))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function getMetricSurfaceMeta(metric, surfaceKey) {
  if (!metric || typeof metric !== 'object') {
    return {};
  }
  const meta =
    metric.surfaceMeta && typeof metric.surfaceMeta === 'object' ? metric.surfaceMeta[surfaceKey] : null;
  if (!meta || typeof meta !== 'object') {
    return {};
  }
  return meta;
}

export { METRICS_CATALOG };
