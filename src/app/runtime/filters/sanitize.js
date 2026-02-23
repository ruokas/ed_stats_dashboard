import { sanitizeChartFilters, sanitizeKpiFilters } from '../filters.js';
import { getFilterSchema } from './definitions.js';

function sanitizeBySchema(value, config, fallback) {
  const type = config?.type;
  if (type === 'boolean') {
    return value === true || value === 'true' || value === 1 || value === '1';
  }
  if (type === 'number') {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    const min = Number.isFinite(config?.min) ? config.min : Number.NEGATIVE_INFINITY;
    const max = Number.isFinite(config?.max) ? config.max : Number.POSITIVE_INFINITY;
    if (parsed < min || parsed > max) {
      return fallback;
    }
    return parsed;
  }
  if (type === 'numberOrNull') {
    if (value == null || value === '' || value === 'all') {
      return null;
    }
    return sanitizeBySchema(value, { ...config, type: 'number' }, fallback);
  }
  if (type === 'enum') {
    const normalized = String(value ?? '').trim();
    return Array.isArray(config?.allowed) && config.allowed.includes(normalized) ? normalized : fallback;
  }
  if (type === 'csv') {
    const list = Array.isArray(value) ? value : String(value || '').split(',');
    return list.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  return String(value ?? '').trim();
}

export function sanitizeWithSchema(pageId, rawState, defaults = {}) {
  const schema = getFilterSchema(pageId);
  if (!schema) {
    return { ...(rawState || {}) };
  }
  const normalized = {};
  Object.entries(schema.filters || {}).forEach(([key, config]) => {
    const fallback = defaults[key];
    normalized[key] = sanitizeBySchema(rawState?.[key], config, fallback);
  });
  return normalized;
}

export function sanitizePageFilters(pageId, rawState, context = {}) {
  if (pageId === 'kpi') {
    return sanitizeKpiFilters(rawState, {
      getDefaultKpiFilters: context.getDefaultKpiFilters,
      KPI_FILTER_LABELS: context.KPI_FILTER_LABELS,
    });
  }
  if (pageId === 'charts') {
    return sanitizeChartFilters(rawState, {
      getDefaultChartFilters: context.getDefaultChartFilters,
      KPI_FILTER_LABELS: context.KPI_FILTER_LABELS,
    });
  }
  return sanitizeWithSchema(pageId, rawState, context.defaults || {});
}
