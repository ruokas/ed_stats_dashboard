import { describe, expect, it } from 'vitest';

import { syncSummariesYearlyHydrationState } from '../../src/app/runtime/runtimes/summaries-runtime-main.js';

describe('syncSummariesYearlyHydrationState', () => {
  it('shows yearly hydration notice while historical data is still loading', () => {
    document.body.innerHTML = `
      <p id="yearlySubtitle">Kalendoriniai metai (paskutiniai 5 metai)</p>
      <p id="yearlyHydrationNotice" hidden></p>
      <table id="yearlyTableRoot"></table>
      <button id="yearlyTableCopyButton" type="button"></button>
      <button id="yearlyTableDownloadButton" type="button"></button>
    `;
    const selectors = {
      yearlySubtitle: document.getElementById('yearlySubtitle'),
      yearlyHydrationNotice: document.getElementById('yearlyHydrationNotice'),
      yearlyTableRoot: document.getElementById('yearlyTableRoot'),
      yearlyTableCopyButton: document.getElementById('yearlyTableCopyButton'),
      yearlyTableDownloadButton: document.getElementById('yearlyTableDownloadButton'),
    };

    syncSummariesYearlyHydrationState(selectors, {
      mainData: { recordsHydrationState: 'deferred' },
    });

    expect(selectors.yearlySubtitle.textContent).toContain('rodoma laikina suvestinė');
    expect(selectors.yearlyHydrationNotice.hidden).toBe(false);
    expect(selectors.yearlyTableRoot.getAttribute('aria-busy')).toBe('true');
    expect(selectors.yearlyTableCopyButton.disabled).toBe(true);
    expect(selectors.yearlyTableDownloadButton.disabled).toBe(true);
  });

  it('restores yearly controls when hydration is complete', () => {
    document.body.innerHTML = `
      <p id="yearlySubtitle">Kalendoriniai metai (paskutiniai 5 metai)</p>
      <p id="yearlyHydrationNotice"></p>
      <table id="yearlyTableRoot" aria-busy="true"></table>
      <button id="yearlyTableCopyButton" type="button" disabled></button>
      <button id="yearlyTableDownloadButton" type="button" disabled></button>
    `;
    const selectors = {
      yearlySubtitle: document.getElementById('yearlySubtitle'),
      yearlyHydrationNotice: document.getElementById('yearlyHydrationNotice'),
      yearlyTableRoot: document.getElementById('yearlyTableRoot'),
      yearlyTableCopyButton: document.getElementById('yearlyTableCopyButton'),
      yearlyTableDownloadButton: document.getElementById('yearlyTableDownloadButton'),
    };

    syncSummariesYearlyHydrationState(selectors, {
      mainData: { recordsHydrationState: 'deferred' },
    });
    syncSummariesYearlyHydrationState(selectors, {
      mainData: { recordsHydrationState: 'full' },
    });

    expect(selectors.yearlySubtitle.textContent).toBe('Kalendoriniai metai (paskutiniai 5 metai)');
    expect(selectors.yearlyHydrationNotice.hidden).toBe(true);
    expect(selectors.yearlyTableRoot.hasAttribute('aria-busy')).toBe(false);
    expect(selectors.yearlyTableCopyButton.disabled).toBe(false);
    expect(selectors.yearlyTableDownloadButton.disabled).toBe(false);
  });
});
