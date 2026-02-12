import { describe, expect, it } from 'vitest';
import { createDashboardState } from '../../src/state/dashboardState.js';
import { createEdPageSelectors } from '../../src/state/selectors/pages/ed.js';
import { createFeedbackPageSelectors } from '../../src/state/selectors/pages/feedback.js';
import { createKpiPageSelectors } from '../../src/state/selectors/pages/kpi.js';
import { createSummariesPageSelectors } from '../../src/state/selectors/pages/summaries.js';

function renderShell(innerMain = '', extra = '') {
  document.body.innerHTML = `
    <header class="hero"></header>
    <h1 id="pageTitle"></h1>
    <p id="status"></p>
    <span id="footerSource"></span>
    <button id="themeToggleBtn"></button>
    <button id="scrollTopBtn"></button>
    <nav class="section-nav">
      <a class="section-nav__link"></a>
    </nav>
    <main class="container">${innerMain}</main>
    ${extra}
  `;
}

describe('createDashboardState', () => {
  it('creates expected defaults and cache structures', () => {
    const state = createDashboardState({
      defaultChartFilters: () => ({ arrival: 'all' }),
      defaultKpiFilters: () => ({ window: 30 }),
      defaultFeedbackFilters: () => ({ respondent: 'all' }),
      defaultHeatmapFilters: () => ({ arrival: 'all', disposition: 'all', cardType: 'all' }),
      defaultHeatmapMetric: 'arrivals',
      hourlyMetricArrivals: 'arrivals',
      hourlyCompareSeriesAll: 'all',
    });

    expect(state.loading).toBe(false);
    expect(state.summariesReportsScopeCache.byYear).toBeInstanceOf(Map);
    expect(state.summariesReportsComputationCache.value).toBeNull();
    expect(state.heatmapMetric).toBe('arrivals');
    expect(state.kpi.filters.window).toBe(30);
    expect(state.feedback.filters.respondent).toBe('all');
  });
});

describe('page selector factories', () => {
  it('creates KPI page selectors', () => {
    renderShell(`
      <section data-section="kpi">
        <div class="kpi-controls"></div>
        <div class="kpi-hourly-controls">
          <button data-last-shift-metric="arrivals"></button>
        </div>
      </section>
      <form id="kpiFiltersForm">
        <button data-kpi-arrival="all"></button>
        <button data-kpi-card-type="all"></button>
      </form>
      <h2 id="kpiHeading"></h2>
      <p id="kpiSubtitle"></p>
      <button id="kpiDatePrev"></button>
      <input id="kpiDateInput" />
      <button id="kpiDateNext"></button>
      <button id="kpiDateClear"></button>
      <div id="kpiSummary"></div>
      <div id="kpiGrid"></div>
      <select id="kpiWindow"></select>
      <select id="kpiShift"></select>
      <select id="kpiArrival"></select>
      <select id="kpiDisposition"></select>
      <select id="kpiCardType"></select>
      <button id="kpiFiltersReset"></button>
      <button id="kpiFiltersToggle"></button>
      <p id="kpiActiveFilters"></p>
      <canvas id="lastShiftHourlyChart"></canvas>
      <p id="lastShiftHourlyContext"></p>
      <div id="lastShiftHourlyLegend"></div>
      <button data-table-download="kpi"></button>
    `);

    const selectors = createKpiPageSelectors();
    expect(selectors.kpiHeading).not.toBeNull();
    expect(selectors.kpiArrivalButtons).toHaveLength(1);
    expect(selectors.kpiCardTypeButtons).toHaveLength(1);
    expect(selectors.lastShiftHourlyMetricButtons).toHaveLength(1);
    expect(selectors.tableDownloadButtons).toHaveLength(1);
  });

  it('creates summaries page selectors', () => {
    renderShell(`
      <h2 id="monthlyHeading"></h2>
      <p id="monthlySubtitle"></p>
      <p id="monthlyCaption"></p>
      <table id="monthlyTable"></table>
      <h2 id="yearlyHeading"></h2>
      <p id="yearlySubtitle"></p>
      <p id="yearlyCaption"></p>
      <table id="yearlyTable"></table>
      <h2 id="summariesReportsHeading"></h2>
      <p id="summariesReportsSubtitle"></p>
      <select id="summariesReportsYear"></select>
      <select id="summariesReportsTopN"></select>
      <select id="summariesReportsMinGroupSize"></select>
      <select id="referralHospitalizedByPspcMode"></select>
      <select id="referralHospitalizedByPspcTrendPspc"></select>
      <select id="referralHospitalizedByPspcSort"></select>
      <p id="summariesReportsCoverage"></p>
      <nav class="summaries-jump-nav">
        <a class="summaries-jump-nav__link"></a>
      </nav>
      <canvas id="diagnosisChart"></canvas>
      <canvas id="ageDiagnosisHeatmapChart"></canvas>
      <p id="diagnosisInfo"></p>
      <canvas id="z769TrendChart"></canvas>
      <canvas id="referralTrendChart"></canvas>
      <canvas id="referralDispositionYearlyChart"></canvas>
      <canvas id="referralMonthlyHeatmapChart"></canvas>
      <canvas id="referralHospitalizedByPspcChart"></canvas>
      <canvas id="pspcCorrelationChart"></canvas>
      <canvas id="ageDistributionChart"></canvas>
      <canvas id="pspcDistributionChart"></canvas>
      <button data-report-export="copy"></button>
      <button data-table-download="yearly"></button>
      <button id="yearlyTableCopyButton"></button>
      <button id="yearlyTableDownloadButton"></button>
    `);

    const selectors = createSummariesPageSelectors();
    expect(selectors.summariesReportsHeading).not.toBeNull();
    expect(selectors.summariesJumpLinks).toHaveLength(1);
    expect(selectors.reportExportButtons).toHaveLength(1);
    expect(selectors.tableDownloadButtons).toHaveLength(1);
  });

  it('creates feedback page selectors', () => {
    renderShell(`
      <h2 id="feedbackHeading"></h2>
      <p id="feedbackSubtitle"></p>
      <p id="feedbackDescription"></p>
      <p id="feedbackFiltersSummary"></p>
      <select id="feedbackRespondentFilter"></select>
      <label id="feedbackRespondentLabel"></label>
      <div id="feedbackRespondentChips"></div>
      <select id="feedbackLocationFilter"></select>
      <label id="feedbackLocationLabel"></label>
      <div id="feedbackLocationChips"></div>
      <form id="feedbackFilters">
        <button data-feedback-filter="respondent"></button>
      </form>
      <p id="feedbackCaption"></p>
      <div id="feedbackCards"></div>
      <h3 id="feedbackTrendTitle"></h3>
      <p id="feedbackTrendSubtitle"></p>
      <div id="feedbackTrendControls">
        <button data-trend-months="6"></button>
      </div>
      <label id="feedbackTrendControlsLabel"></label>
      <div id="feedbackTrendMetrics">
        <button data-trend-metric="overallAverage"></button>
      </div>
      <label id="feedbackTrendMetricsLabel"></label>
      <select id="feedbackTrendCompareSelect"></select>
      <label id="feedbackTrendCompareLabel"></label>
      <p id="feedbackTrendSummary"></p>
      <div id="feedbackTrendSkeleton"></div>
      <div id="feedbackTrendMessage"></div>
      <canvas id="feedbackTrendChart"></canvas>
      <div class="table-wrapper--feedback"></div>
      <table id="feedbackTable"></table>
      <button data-chart-copy="feedback"></button>
      <button data-chart-download="feedback"></button>
      <button data-table-download="feedback"></button>
    `);

    const selectors = createFeedbackPageSelectors();
    expect(selectors.feedbackHeading).not.toBeNull();
    expect(selectors.feedbackFilterButtons).toHaveLength(1);
    expect(selectors.feedbackTrendButtons).toHaveLength(1);
    expect(selectors.feedbackTrendMetricButtons).toHaveLength(1);
    expect(selectors.chartCopyButtons).toHaveLength(1);
    expect(selectors.chartDownloadButtons).toHaveLength(1);
  });

  it('creates ED page selectors', () => {
    renderShell(
      `
        <h2 id="edHeading"></h2>
        <p id="edStatus"></p>
        <input id="edSearchInput" />
        <div id="edCards"></div>
        <h3 id="edDispositionsTitle"></h3>
        <canvas id="edDispositionsChart"></canvas>
        <p id="edDispositionsMessage"></p>
        <section id="edStandardSection"></section>
      `,
      '<footer></footer>'
    );

    const selectors = createEdPageSelectors();
    expect(selectors.edHeading).not.toBeNull();
    expect(selectors.edCards).not.toBeNull();
    expect(selectors.footer).not.toBeNull();
  });
});
