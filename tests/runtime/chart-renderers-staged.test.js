import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  renderDailyChart: vi.fn(),
  renderDowCharts: vi.fn(),
  renderHourlyChart: vi.fn(),
  renderHourlyChartWithTheme: vi.fn(),
  renderLastShiftHourlyChartWithTheme: vi.fn(),
  renderFeedbackTrendChart: vi.fn(),
  renderEdDispositionsChart: vi.fn(),
}));

vi.mock('../../src/charts/daily.js', () => ({
  renderDailyChart: mocks.renderDailyChart,
}));
vi.mock('../../src/charts/dow.js', () => ({
  renderDowCharts: mocks.renderDowCharts,
}));
vi.mock('../../src/charts/hourly.js', () => ({
  renderHourlyChart: mocks.renderHourlyChart,
  renderHourlyChartWithTheme: mocks.renderHourlyChartWithTheme,
  renderLastShiftHourlyChartWithTheme: mocks.renderLastShiftHourlyChartWithTheme,
}));
vi.mock('../../src/charts/feedback-trend.js', () => ({
  renderFeedbackTrendChart: mocks.renderFeedbackTrendChart,
}));
vi.mock('../../src/charts/ed-dispositions.js', () => ({
  renderEdDispositionsChart: mocks.renderEdDispositionsChart,
}));

import { createChartRenderers } from '../../src/charts/index.js';

function createEnv() {
  document.body.innerHTML = `
    <main>
      <figure class="chart-card" data-loading="true"><div class="chart-card__skeleton"></div><canvas id="dailyChart"></canvas></figure>
      <figure class="chart-card" data-loading="true"><div class="chart-card__skeleton"></div><canvas id="dowChart"></canvas></figure>
      <figure class="chart-card" data-loading="true"><div class="chart-card__skeleton"></div><canvas id="dowStayChart"></canvas></figure>
      <figure class="chart-card" data-loading="true"><div class="chart-card__skeleton"></div><canvas id="hourlyChart"></canvas></figure>
      <figure class="chart-card" data-loading="true"><div class="chart-card__skeleton"></div><div id="heatmap"></div></figure>
      <canvas id="funnelChart"></canvas>
    </main>
  `;
  const funnelCanvas = document.getElementById('funnelChart');
  funnelCanvas.getContext = vi.fn(() => ({}));
  const onChartsPrimaryVisible = vi.fn();
  const env = {
    dashboardState: {
      chartPeriod: 30,
      chartYear: null,
      chartFilters: {},
      chartLib: null,
      charts: {},
      heatmapMetric: 'arrivals',
      chartData: {
        baseDaily: [],
        baseRecords: [{ id: 1 }],
        filteredDaily: [],
        filteredWindowRecords: [{ id: 1 }],
        dailyWindow: [],
        funnel: null,
        heatmap: null,
      },
      chartsStartupPhases: {},
      chartsSectionRenderFlags: {},
      chartsSecondaryRenderSignature: '',
      chartsHeatmapRenderSignature: '',
      chartsHourlyRenderSignature: '',
    },
    selectors: {
      heatmapContainer: document.getElementById('heatmap'),
    },
    TEXT: { charts: {} },
    loadChartJs: vi.fn(async () => ({ defaults: { font: {} } })),
    getThemePalette: () => ({
      textColor: '#111',
      gridColor: '#ccc',
      accent: '#06f',
    }),
    getThemeStyleTarget: () => document.body,
    showChartSkeletons: vi.fn(),
    hideChartSkeletons: vi.fn(),
    clearChartError: vi.fn(),
    showChartError: vi.fn(),
    renderFunnelShape: vi.fn(),
    renderArrivalHeatmap: vi.fn(),
    filterDailyStatsByYear: vi.fn((daily) => daily),
    computeFunnelStats: vi.fn(() => ({ arrived: 10 })),
    isValidHeatmapData: vi.fn((value) => Boolean(value?.metrics?.arrivals?.matrix)),
    filterRecordsByYear: vi.fn((records) => records),
    filterRecordsByChartFilters: vi.fn((records) => records),
    filterRecordsByWindow: vi.fn((records) => records),
    computeArrivalHeatmap: vi.fn(() => ({
      metrics: {
        arrivals: {
          matrix: [[1]],
          max: 1,
        },
      },
    })),
    HEATMAP_METRIC_KEYS: ['arrivals'],
    DEFAULT_HEATMAP_METRIC: 'arrivals',
    onChartsPrimaryVisible,
  };
  return { env, onChartsPrimaryVisible };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('chart renderers staged startup', () => {
  it('renders primary charts before secondary charts', async () => {
    const { env, onChartsPrimaryVisible } = createEnv();
    const renderers = createChartRenderers(env);
    const daily = [{ date: '2026-02-24', count: 10 }];

    await renderers.renderChartsPrimary(daily, { arrived: 10 });

    expect(mocks.renderDailyChart).toHaveBeenCalledTimes(1);
    expect(mocks.renderDowCharts).toHaveBeenCalledTimes(1);
    expect(mocks.renderHourlyChart).not.toHaveBeenCalled();
    expect(env.renderArrivalHeatmap).not.toHaveBeenCalled();
    expect(onChartsPrimaryVisible).toHaveBeenCalledTimes(1);
    expect(env.hideChartSkeletons).not.toHaveBeenCalled();
  });

  it('renders secondary charts and supports deferred reuse short-circuit', async () => {
    const { env } = createEnv();
    const renderers = createChartRenderers(env);

    const changedFirst = await renderers.renderChartsSecondary({
      heatmapData: {
        metrics: {
          arrivals: { matrix: [[1]], max: 1 },
        },
      },
      hourlyRecords: [{ id: 1 }],
      allowReuse: true,
    });
    const changedSecond = await renderers.renderChartsSecondary({
      heatmapData: {
        metrics: {
          arrivals: { matrix: [[1]], max: 1 },
        },
      },
      hourlyRecords: [{ id: 1 }],
      allowReuse: true,
    });

    expect(changedFirst).toBe(true);
    expect(changedSecond).toBe(false);
    expect(env.renderArrivalHeatmap).toHaveBeenCalledTimes(1);
    expect(mocks.renderHourlyChart).toHaveBeenCalledTimes(1);
  });

  it('compat renderCharts wrapper renders both stages', async () => {
    const { env } = createEnv();
    const renderers = createChartRenderers(env);

    await renderers.renderCharts(
      [{ date: '2026-02-24', count: 10 }],
      { arrived: 10 },
      { metrics: { arrivals: { matrix: [[2]], max: 2 } } }
    );

    expect(mocks.renderDailyChart).toHaveBeenCalledTimes(1);
    expect(mocks.renderDowCharts).toHaveBeenCalledTimes(1);
    expect(env.renderArrivalHeatmap).toHaveBeenCalledTimes(1);
    expect(mocks.renderHourlyChart).toHaveBeenCalledTimes(1);
  });

  it('supports rendering secondary sections independently with reuse enabled', async () => {
    const { env } = createEnv();
    const renderers = createChartRenderers(env);
    const heatmapData = { metrics: { arrivals: { matrix: [[1]], max: 1 } } };
    const hourlyRecords = [{ id: 1 }];

    const heatmapChanged = await renderers.renderChartsSecondary({
      heatmapData,
      hourlyRecords,
      allowReuse: true,
      renderHeatmap: true,
      renderHourly: false,
    });
    const hourlyChanged = await renderers.renderChartsSecondary({
      heatmapData,
      hourlyRecords,
      allowReuse: true,
      renderHeatmap: false,
      renderHourly: true,
    });

    expect(heatmapChanged).toBe(true);
    expect(hourlyChanged).toBe(true);
    expect(env.renderArrivalHeatmap).toHaveBeenCalledTimes(1);
    expect(mocks.renderHourlyChart).toHaveBeenCalledTimes(1);
    expect(env.dashboardState.chartsSectionRenderFlags).toMatchObject({
      heatmapRendered: true,
      hourlyRendered: true,
    });
  });

  it('hides only primary skeletons after primary render and keeps secondary skeletons until rendered', async () => {
    const { env } = createEnv();
    const renderers = createChartRenderers(env);

    await renderers.renderChartsPrimary([{ date: '2026-02-24', count: 10 }], { arrived: 10 });

    const dailyCard = document.getElementById('dailyChart')?.closest('.chart-card');
    const dowCard = document.getElementById('dowChart')?.closest('.chart-card');
    const dowStayCard = document.getElementById('dowStayChart')?.closest('.chart-card');
    const hourlyCard = document.getElementById('hourlyChart')?.closest('.chart-card');
    const heatmapCard = document.getElementById('heatmap')?.closest('.chart-card');

    expect(dailyCard?.dataset.loading).toBeUndefined();
    expect(dowCard?.dataset.loading).toBeUndefined();
    expect(dowStayCard?.dataset.loading).toBeUndefined();
    expect(hourlyCard?.dataset.loading).toBe('true');
    expect(heatmapCard?.dataset.loading).toBe('true');

    await renderers.renderChartsSecondary({
      heatmapData: { metrics: { arrivals: { matrix: [[1]], max: 1 } } },
      hourlyRecords: [{ id: 1 }],
      allowReuse: false,
      renderHeatmap: true,
      renderHourly: true,
    });

    expect(hourlyCard?.dataset.loading).toBeUndefined();
    expect(heatmapCard?.dataset.loading).toBeUndefined();
  });
});
