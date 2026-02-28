import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_TITLE, TEXT } from '../../src/app/constants.js';

describe('neutral fallback branding', () => {
  it('uses neutral runtime defaults instead of hospital-specific branding', () => {
    expect(TEXT.title).toBe('ED statistika');
    expect(TEXT.ed.title).toBe('Gyvi duomenys');
    expect(TEXT.tabs.ed).toBe('Gyvi duomenys');
    expect(DEFAULT_PAGE_TITLE).not.toContain('RŠL');
    expect(DEFAULT_PAGE_TITLE).not.toContain('SMPS');
  });

  it('keeps page-shell templates free from hard-coded hospital branding', () => {
    const heroTemplate = fs.readFileSync('templates/page-shell/partials/hero.html', 'utf8');
    const headTemplate = fs.readFileSync('templates/page-shell/partials/head-shared.html', 'utf8');
    expect(heroTemplate).not.toContain('RŠL');
    expect(heroTemplate).not.toContain('SMPS skydelis');
    expect(headTemplate).not.toContain('RŠL');
  });
});
