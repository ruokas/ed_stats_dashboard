import { describe, expect, it } from 'vitest';
import { METRICS_CATALOG } from '../../src/metrics/catalog.js';
import { validateCatalog, validateMetricDefinition } from '../../src/metrics/catalog-validate.js';

describe('metrics catalog validation', () => {
  it('accepts the project catalog', () => {
    expect(() => validateCatalog(METRICS_CATALOG)).not.toThrow();
  });

  it('rejects duplicate metric ids', () => {
    const duplicate = {
      version: 1,
      metrics: [METRICS_CATALOG.metrics[0], { ...METRICS_CATALOG.metrics[0], label: 'Kitas label' }],
    };
    expect(() => validateCatalog(duplicate)).toThrow(/Duplicate metric id/);
  });

  it('rejects invalid share format', () => {
    const invalid = {
      ...METRICS_CATALOG.metrics.find((metric) => metric.id === 'emsShare'),
      format: 'integer',
    };
    expect(() => validateMetricDefinition(invalid)).toThrow(/percent\/decimal/);
  });

  it('rejects missing compute key', () => {
    const invalid = {
      ...METRICS_CATALOG.metrics[0],
      computeKey: '',
    };
    expect(() => validateMetricDefinition(invalid)).toThrow(/computeKey/);
  });

  it('rejects invalid value type', () => {
    const invalid = {
      ...METRICS_CATALOG.metrics[0],
      valueType: 'unknown',
    };
    expect(() => validateMetricDefinition(invalid)).toThrow(/valueType/);
  });
});
