import { describe, expect, it } from 'vitest';

import {
  normalizeDispositionValue,
  normalizeRatioValue,
  parseDurationMinutes,
  parseNumericCell,
} from '../../src/data/ed-utils.js';

describe('ed-utils', () => {
  it('parses duration values from hh:mm and decimal strings', () => {
    expect(parseDurationMinutes('01:30')).toBe(90);
    expect(parseDurationMinutes('12,5')).toBe(12.5);
    expect(parseDurationMinutes('')).toBeNull();
  });

  it('parses localized numeric cells', () => {
    expect(parseNumericCell('1 234,5')).toBe(1234.5);
    expect(parseNumericCell('abc')).toBeNull();
  });

  it('normalizes ratio values from ratio and scalar formats', () => {
    expect(normalizeRatioValue('1:4')).toEqual({ ratio: 0.25, text: '1:4' });
    expect(normalizeRatioValue('2,5')).toEqual({ ratio: 2.5, text: '2,5' });
    expect(normalizeRatioValue(null)).toEqual({ ratio: null, text: '' });
  });

  it('normalizes disposition categories', () => {
    expect(normalizeDispositionValue('Hospitalized to ward').category).toBe('hospitalized');
    expect(normalizeDispositionValue('Išleistas namo').category).toBe('discharged');
    expect(normalizeDispositionValue('')).toEqual({ label: 'Nežinoma', category: 'unknown' });
  });
});
