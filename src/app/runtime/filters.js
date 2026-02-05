export function sanitizeKpiFilters(filters, { getDefaultKpiFilters, KPI_FILTER_LABELS }) {
  const defaults = getDefaultKpiFilters();
  const normalized = { ...defaults, ...(filters || {}) };
  normalized.window = defaults.window;
  normalized.shift = defaults.shift;
  if (!(normalized.arrival in KPI_FILTER_LABELS.arrival)) {
    normalized.arrival = defaults.arrival;
  }
  normalized.disposition = defaults.disposition;
  if (!(normalized.cardType in KPI_FILTER_LABELS.cardType)) {
    normalized.cardType = defaults.cardType;
  }
  return normalized;
}

export function sanitizeChartFilters(filters, { getDefaultChartFilters, KPI_FILTER_LABELS }) {
  const defaults = getDefaultChartFilters();
  const normalized = { ...defaults, ...(filters || {}) };
  if (!(normalized.arrival in KPI_FILTER_LABELS.arrival)) {
    normalized.arrival = defaults.arrival;
  }
  if (!(normalized.disposition in KPI_FILTER_LABELS.disposition)) {
    normalized.disposition = defaults.disposition;
  }
  if (!(normalized.cardType in KPI_FILTER_LABELS.cardType)) {
    normalized.cardType = defaults.cardType;
  }
  normalized.compareGmp = normalized.compareGmp === true || normalized.compareGmp === 'true';
  if (normalized.compareGmp) {
    normalized.arrival = defaults.arrival;
  }
  return normalized;
}
