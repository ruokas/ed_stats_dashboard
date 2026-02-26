import { describe, expect, it } from 'vitest';
import {
  buildActionResults,
  buildMetricResults,
  buildPageResultsFromNavLinks,
  buildSectionResults,
} from '../../src/app/runtime/features/global-search/index-builder.js';

describe('global search index builder', () => {
  it('builds page results from nav links', () => {
    document.body.innerHTML = `
      <nav class="section-nav">
        <a class="section-nav__link" href="index.html"><span class="section-nav__label">Rodikliai</span></a>
        <a class="section-nav__link" href="charts.html"><span class="section-nav__label">Grafikai</span></a>
      </nav>`;
    const links = Array.from(document.querySelectorAll('.section-nav__link'));
    const results = buildPageResultsFromNavLinks(links, 'kpi');
    expect(results.map((item) => item.id)).toEqual(['page:kpi', 'page:charts']);
    expect(results[0].showWhenEmpty).toBe(true);
  });

  it('builds page-local actions only when selectors exist', () => {
    document.body.innerHTML = `
      <input id="chartsHospitalTableSearch">
      <input id="gydytojaiSearch">`;
    const selectors = {
      chartsHospitalTableSearch: document.getElementById('chartsHospitalTableSearch'),
      gydytojaiSearch: document.getElementById('gydytojaiSearch'),
      edSearchInput: null,
    };
    const actions = buildActionResults({ selectors, currentPageId: 'charts' });
    expect(actions.map((item) => item.target.actionKey)).toEqual(['chartsHospitalSearch', 'doctorsSearch']);
  });

  it('includes curated section routes and same-page quick visibility flags', () => {
    const sections = buildSectionResults('summaries');
    expect(sections.some((item) => item.id === 'section:summaries-pspc')).toBe(true);
    expect(sections.find((item) => item.id === 'section:summaries-pspc')?.showWhenEmpty).toBe(true);
    expect(sections.find((item) => item.id === 'section:charts-heatmap')?.showWhenEmpty).toBe(false);
  });

  it('builds metric results with mapped routes', async () => {
    const metrics = await buildMetricResults();
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics.some((item) => item.kind === 'metric' && /#/.test(item.target.href))).toBe(true);
  });
});
