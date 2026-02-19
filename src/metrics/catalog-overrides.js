function normalizeMetricId(metricId) {
  return typeof metricId === 'string' ? metricId.trim() : '';
}

function getMetricsConfig(settings) {
  return settings?.metrics && typeof settings.metrics === 'object' ? settings.metrics : {};
}

export function isMetricEnabled(settings, metricId) {
  const id = normalizeMetricId(metricId);
  if (!id) {
    return false;
  }
  const enabled = getMetricsConfig(settings).enabledMetricIds;
  if (!Array.isArray(enabled) || !enabled.length) {
    return true;
  }
  return enabled.includes(id);
}

export function getMetricOverride(settings, metricId) {
  const id = normalizeMetricId(metricId);
  if (!id) {
    return null;
  }
  const overrides = getMetricsConfig(settings).overrides;
  if (!overrides || typeof overrides !== 'object') {
    return null;
  }
  const value = overrides[id];
  return value && typeof value === 'object' ? value : null;
}

export function getMetricLabelOverride(settings, metricId, fallbackLabel = '') {
  const override = getMetricOverride(settings, metricId);
  if (typeof override?.label === 'string' && override.label.trim()) {
    return override.label.trim();
  }
  return fallbackLabel;
}
