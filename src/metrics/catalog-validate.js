const ALLOWED_DOMAINS = new Set(['kpi', 'charts', 'recent', 'summaries', 'feedback', 'ed']);
const ALLOWED_AGGREGATION = new Set(['shift', 'daily', 'monthly', 'yearly', 'hourly', 'aggregate']);
const ALLOWED_VALUE_TYPES = new Set(['count', 'duration', 'share', 'rate', 'score', 'text']);
const ALLOWED_VISIBILITY = new Set(['public', 'internal', 'experimental']);
const ALLOWED_FORMATS = new Set(['integer', 'oneDecimal', 'decimal', 'percent', 'hours', 'minutes', 'text']);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateFormatVsValueType(metric) {
  if (metric.valueType === 'share') {
    assert(
      metric.format === 'percent' || metric.format === 'decimal',
      `Metric "${metric.id}" must use percent/decimal format for share valueType.`
    );
  }
  if (metric.valueType === 'text') {
    assert(metric.format === 'text', `Metric "${metric.id}" must use text format for text valueType.`);
  }
}

/**
 * @param {import('./catalog-types.js').MetricDefinition} metric
 */
export function validateMetricDefinition(metric) {
  assert(metric && typeof metric === 'object', 'Metric definition must be an object.');
  assert(isNonEmptyString(metric.id), 'Metric id is required.');
  assert(Number.isInteger(metric.version) && metric.version > 0, `Metric "${metric.id}" version is invalid.`);
  assert(ALLOWED_DOMAINS.has(metric.domain), `Metric "${metric.id}" domain is invalid.`);
  assert(
    ALLOWED_AGGREGATION.has(metric.aggregationLevel),
    `Metric "${metric.id}" aggregationLevel is invalid.`
  );
  assert(ALLOWED_VALUE_TYPES.has(metric.valueType), `Metric "${metric.id}" valueType is invalid.`);
  assert(ALLOWED_VISIBILITY.has(metric.visibility), `Metric "${metric.id}" visibility is invalid.`);
  assert(ALLOWED_FORMATS.has(metric.format), `Metric "${metric.id}" format is invalid.`);
  assert(isNonEmptyString(metric.label), `Metric "${metric.id}" label is required.`);
  assert(isNonEmptyString(metric.description), `Metric "${metric.id}" description is required.`);
  assert(isNonEmptyString(metric.computeKey), `Metric "${metric.id}" computeKey is required.`);
  assert(Array.isArray(metric.dependencies), `Metric "${metric.id}" dependencies must be an array.`);
  assert(Array.isArray(metric.tags), `Metric "${metric.id}" tags must be an array.`);
  assert(Array.isArray(metric.surfaces), `Metric "${metric.id}" surfaces must be an array.`);
  assert(Number.isInteger(metric.order) && metric.order >= 0, `Metric "${metric.id}" order is invalid.`);
  validateFormatVsValueType(metric);
}

/**
 * @param {import('./catalog-types.js').MetricsCatalog} catalog
 */
export function validateCatalog(catalog) {
  assert(catalog && typeof catalog === 'object', 'Catalog must be an object.');
  assert(Number.isInteger(catalog.version) && catalog.version > 0, 'Catalog version is invalid.');
  assert(Array.isArray(catalog.metrics), 'Catalog metrics must be an array.');
  const seenIds = new Set();
  catalog.metrics.forEach((metric) => {
    validateMetricDefinition(metric);
    assert(!seenIds.has(metric.id), `Duplicate metric id "${metric.id}".`);
    seenIds.add(metric.id);
  });
}
