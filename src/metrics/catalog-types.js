/**
 * @typedef {'kpi' | 'charts' | 'recent' | 'summaries' | 'feedback' | 'ed'} MetricDomain
 * @typedef {'shift' | 'daily' | 'monthly' | 'yearly' | 'hourly' | 'aggregate'} MetricAggregationLevel
 * @typedef {'count' | 'duration' | 'share' | 'rate' | 'score' | 'text'} MetricValueType
 * @typedef {'public' | 'internal' | 'experimental'} MetricVisibility
 * @typedef {'integer' | 'oneDecimal' | 'decimal' | 'percent' | 'hours' | 'minutes' | 'text'} MetricFormat
 */

/**
 * @typedef MetricDefinition
 * @property {string} id
 * @property {number} version
 * @property {MetricDomain} domain
 * @property {MetricAggregationLevel} aggregationLevel
 * @property {MetricValueType} valueType
 * @property {string} unit
 * @property {string} label
 * @property {string} description
 * @property {MetricFormat} format
 * @property {string[]} dependencies
 * @property {string} computeKey
 * @property {MetricVisibility} visibility
 * @property {string[]} tags
 * @property {string[]} surfaces
 * @property {number} order
 * @property {Record<string, { label?: string; unit?: string; description?: string }>} [surfaceMeta]
 */

/**
 * @typedef MetricsCatalog
 * @property {number} version
 * @property {MetricDefinition[]} metrics
 */

export {};
