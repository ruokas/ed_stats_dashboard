import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/app/default-settings.js';
import { normalizeSettings } from '../../src/app/runtime/settings.js';

describe('normalizeSettings', () => {
  it('normalizes nested sources, trims urls, and clamps numeric ranges', () => {
    const settings = normalizeSettings(
      {
        dataSource: {
          url: ' https://example.org/main.csv ',
          feedback: { url: ' https://example.org/feedback.csv ' },
          ed: { url: ' https://example.org/ed.csv ' },
          historical: { enabled: false, url: ' https://example.org/hist.csv ' },
        },
        calculations: {
          windowDays: 999,
          recentDays: 0,
        },
      },
      DEFAULT_SETTINGS
    );

    expect(settings.dataSource.url).toBe('https://example.org/main.csv');
    expect(settings.dataSource.feedback.url).toBe('https://example.org/feedback.csv');
    expect(settings.dataSource.ed.url).toBe('https://example.org/ed.csv');
    expect(settings.dataSource.historical.url).toBe('https://example.org/hist.csv');
    expect(settings.dataSource.historical.enabled).toBe(false);
    expect(settings.calculations.windowDays).toBe(365);
    expect(settings.calculations.recentDays).toBe(1);
  });
});
