import { describe, expect, it } from 'vitest';
import { createSelectors, createSelectorsForPage } from '../../src/state/selectors.js';

describe('createSelectorsForPage', () => {
  it('normalizes page id and uses charts selector factory', () => {
    document.body.innerHTML = `
      <header class="hero"></header>
      <h1 id="pageTitle"></h1>
      <div id="status"></div>
      <div id="footerSource"></div>
      <button id="themeToggleBtn"></button>
      <button id="scrollTopBtn"></button>
      <nav class="section-nav"><a class="section-nav__link"></a></nav>
      <main class="container">
        <section data-section="chart">
          <div id="chartPeriodGroup">
            <button data-chart-period="year"></button>
          </div>
          <form id="chartFiltersForm">
            <button data-chart-arrival="all"></button>
          </form>
        </section>
      </main>
      <button data-chart-arrival="outside"></button>
    `;

    const selectors = createSelectorsForPage('  ChArTs  ');

    expect(selectors.chartPeriodButtons).toHaveLength(1);
    expect(selectors.chartFilterArrivalButtons).toHaveLength(1);
  });

  it('returns default selectors for unknown pages', () => {
    document.body.innerHTML = `
      <header class="hero"></header>
      <h1 id="pageTitle"></h1>
      <div id="status"></div>
      <div id="footerSource"></div>
      <button id="themeToggleBtn"></button>
      <button id="scrollTopBtn"></button>
      <nav class="section-nav">
        <a class="section-nav__link"></a>
        <a class="section-nav__link"></a>
      </nav>
    `;

    const selectors = createSelectorsForPage('unknown-page');

    expect(selectors.hero).not.toBeNull();
    expect(selectors.sectionNavLinks).toHaveLength(2);
    expect(selectors.chartHeading).toBeUndefined();
  });

  it('returns recent-page null placeholders for absent tables', () => {
    document.body.innerHTML = `
      <header class="hero"></header>
      <h1 id="pageTitle"></h1>
      <div id="status"></div>
      <div id="footerSource"></div>
      <button id="themeToggleBtn"></button>
      <button id="scrollTopBtn"></button>
      <nav class="section-nav"><a class="section-nav__link"></a></nav>
      <main class="container">
        <h2 id="recentHeading"></h2>
        <p id="recentSubtitle"></p>
        <p id="recentCaption"></p>
        <table id="recentTable"></table>
      </main>
    `;

    const selectors = createSelectorsForPage('recent');

    expect(selectors.recentTable).not.toBeNull();
    expect(selectors.monthlyTable).toBeNull();
    expect(selectors.yearlyTable).toBeNull();
  });
});

describe('createSelectors', () => {
  it('returns full selector map with expected shared keys', () => {
    document.body.innerHTML = `
      <header class="hero"></header>
      <h1 id="pageTitle"></h1>
      <div id="status"></div>
      <div id="footerSource"></div>
      <button id="themeToggleBtn"></button>
      <button id="scrollTopBtn"></button>
      <nav class="section-nav">
        <a class="section-nav__link"></a>
        <a class="section-nav__link"></a>
      </nav>
      <div id="tabSwitcher"></div>
      <button data-tab-target="overview"></button>
      <section data-tab-panel="overview"></section>
      <button data-chart-copy="daily"></button>
      <button data-table-download="recent"></button>
    `;

    const selectors = createSelectors();

    expect(selectors.hero).not.toBeNull();
    expect(selectors.tabButtons).toHaveLength(1);
    expect(selectors.tabPanels).toHaveLength(1);
    expect(selectors.sectionNavLinks).toHaveLength(2);
    expect(selectors.chartCopyButtons).toHaveLength(1);
    expect(selectors.tableDownloadButtons).toHaveLength(1);
  });
});
