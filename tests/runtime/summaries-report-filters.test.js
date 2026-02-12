import { describe, expect, test } from 'vitest';
import { parsePositiveIntOrDefault } from '../../src/app/runtime/runtimes/summaries/report-filters.js';

describe('summaries report filters', () => {
  test('returns parsed positive integers', () => {
    expect(parsePositiveIntOrDefault('7', 100)).toBe(7);
    expect(parsePositiveIntOrDefault(42, 100)).toBe(42);
  });

  test('returns fallback for invalid, empty or non-positive values', () => {
    expect(parsePositiveIntOrDefault('', 100)).toBe(100);
    expect(parsePositiveIntOrDefault('abc', 100)).toBe(100);
    expect(parsePositiveIntOrDefault('0', 100)).toBe(100);
    expect(parsePositiveIntOrDefault('-5', 100)).toBe(100);
  });
});
