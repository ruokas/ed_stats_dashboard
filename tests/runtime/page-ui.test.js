import { describe, expect, it } from 'vitest';
import { applyCommonPageShellText } from '../../src/app/runtime/page-ui.js';

describe('applyCommonPageShellText', () => {
  it('applies shared shell labels from settings with fallbacks', () => {
    document.body.innerHTML =
      '<h1 id="title"></h1><span id="footer"></span><button id="scrollTopBtn"></button>';
    const selectors = {
      title: document.getElementById('title'),
      footerSource: document.getElementById('footer'),
      scrollTopBtn: document.getElementById('scrollTopBtn'),
    };

    applyCommonPageShellText({
      selectors,
      settings: {
        output: {
          title: 'Naujas pavadinimas',
          footerSource: 'Šaltinis',
          pageTitle: 'Dokumento title',
          scrollTopLabel: 'Į viršų',
        },
      },
      text: { title: 'Fallback title', scrollTop: 'Fallback scroll' },
      defaultFooterSource: 'Fallback footer',
    });

    expect(selectors.title.textContent).toBe('Naujas pavadinimas');
    expect(selectors.footerSource.textContent).toBe('Šaltinis');
    expect(selectors.scrollTopBtn.textContent).toBe('Į viršų');
    expect(document.title).toBe('Dokumento title');
  });

  it('falls back to provided defaults when output overrides are missing', () => {
    document.body.innerHTML =
      '<h1 id="title"></h1><span id="footer"></span><button id="scrollTopBtn"></button>';
    document.title = '';
    const selectors = {
      title: document.getElementById('title'),
      footerSource: document.getElementById('footer'),
      scrollTopBtn: document.getElementById('scrollTopBtn'),
    };

    applyCommonPageShellText({
      selectors,
      settings: { output: {} },
      text: { title: 'Neutralus title', scrollTop: 'Į pradžią' },
      defaultFooterSource: 'Numatytas šaltinis',
    });

    expect(selectors.title.textContent).toBe('Neutralus title');
    expect(selectors.footerSource.textContent).toBe('Numatytas šaltinis');
    expect(selectors.scrollTopBtn.textContent).toBe('Į pradžią');
  });
});
