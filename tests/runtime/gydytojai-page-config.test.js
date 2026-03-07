import { describe, expect, test } from 'vitest';
import {
  getPageRuntimeEntry,
  PAGE_CONFIG,
  RUNTIME_MODULE_BY_PAGE,
  resolvePageId,
} from '../../src/app/runtime/page-config.js';

describe('gydytojai page config', () => {
  test('page is registered and resolvable', () => {
    expect(PAGE_CONFIG.gydytojai).toBeTruthy();
    expect(RUNTIME_MODULE_BY_PAGE.gydytojai).toContain('gydytojai-runtime-main.js');
    expect(getPageRuntimeEntry('gydytojai').exportName).toBe('runGydytojaiRuntime');
    expect(resolvePageId('gydytojai')).toBe('gydytojai');
  });
});
