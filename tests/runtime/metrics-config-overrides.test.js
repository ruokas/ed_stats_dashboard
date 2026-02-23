import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/app/default-settings.js';
import { normalizeSettings } from '../../src/app/runtime/settings.js';
import {
  getMetricLabelOverride,
  getMetricOverride,
  isMetricEnabled,
} from '../../src/metrics/catalog-overrides.js';

describe('metrics config overrides', () => {
  it('normalizes metrics section from raw settings', () => {
    const settings = normalizeSettings(
      {
        metrics: {
          enabledMetricIds: [' total ', '', 'arrivals', 'total'],
          overrides: {
            total: { label: 'Atvykimai', target: '10', warnThreshold: '5' },
            '': { label: 'ignored' },
            invalid: null,
          },
        },
      },
      DEFAULT_SETTINGS
    );
    expect(settings.metrics.enabledMetricIds).toEqual(['total', 'arrivals']);
    expect(settings.metrics.overrides.total).toEqual({
      label: 'Atvykimai',
      target: 10,
      warnThreshold: 5,
    });
  });

  it('checks metric enabled list and label override', () => {
    const settings = {
      metrics: {
        enabledMetricIds: ['total'],
        overrides: {
          total: { label: 'Atvykimai (override)' },
        },
      },
    };
    expect(isMetricEnabled(settings, 'total')).toBe(true);
    expect(isMetricEnabled(settings, 'arrivals')).toBe(false);
    expect(getMetricOverride(settings, 'total')).toEqual({ label: 'Atvykimai (override)' });
    expect(getMetricLabelOverride(settings, 'total', 'Atvykę')).toBe('Atvykimai (override)');
  });

  it('treats metrics as enabled when enabledMetricIds is not set', () => {
    expect(isMetricEnabled({}, 'total')).toBe(true);
    expect(isMetricEnabled({ metrics: { enabledMetricIds: [] } }, 'total')).toBe(true);
  });
});
