import { describe, expect, it, vi } from 'vitest';
import { renderLastShiftHourlyChartWithTheme } from '../../src/charts/hourly.js';

describe('renderLastShiftHourlyChartWithTheme', () => {
  it('reuses existing chart with animated update', async () => {
    document.body.innerHTML = `
      <div id="lastShiftHourlyTitle"><span></span></div>
      <canvas id="lastShiftHourlyChart"></canvas>
      <div id="lastShiftHourlyContext"></div>
      <div id="lastShiftHourlyLegend"></div>
    `;
    const canvas = document.getElementById('lastShiftHourlyChart');
    canvas.getContext = vi.fn(() => ({}));

    const existingChart = {
      canvas,
      config: { type: 'line' },
      data: { labels: [], datasets: [] },
      options: {},
      update: vi.fn(),
      destroy: vi.fn(),
      isDatasetVisible: vi.fn(() => true),
      setDatasetVisibility: vi.fn(),
    };

    const env = {
      dashboardState: {
        chartLib: { defaults: { font: {} } },
        charts: { lastShiftHourly: existingChart },
      },
      selectors: {
        lastShiftHourlyChart: canvas,
        lastShiftHourlyContext: document.getElementById('lastShiftHourlyContext'),
        lastShiftHourlyLegend: document.getElementById('lastShiftHourlyLegend'),
      },
      loadChartJs: vi.fn(async () => ({ defaults: {} })),
      getThemePalette: () => ({
        textColor: '#111111',
        gridColor: 'rgba(0,0,0,0.2)',
        accent: '#2f80ed',
        accentSoft: 'rgba(47,128,237,0.2)',
      }),
      getThemeStyleTarget: () => document.body,
      setChartCardMessage: vi.fn(),
      TEXT: { charts: { hourlyDatasetTotalLabel: 'Viso' } },
      HEATMAP_HOURS: ['00:00', '01:00'],
      decimalFormatter: { format: (value) => String(value) },
      numberFormatter: { format: (value) => String(value) },
    };

    const seriesInfo = {
      hasData: true,
      metric: 'arrivals',
      series: {
        total: [1, 2],
        t: [1, 1],
        tr: [0, 1],
        ch: [0, 0],
      },
      dateLabel: '2026-02-11',
      shiftStartHour: 7,
      metricLabel: 'Atvykimai',
    };

    await renderLastShiftHourlyChartWithTheme(env, seriesInfo);
    const legendRoot = env.selectors.lastShiftHourlyLegend;
    const firstLegendNode = legendRoot.firstElementChild;

    expect(existingChart.update).toHaveBeenCalledTimes(1);
    expect(existingChart.update).toHaveBeenCalledWith();
    const tDataset = existingChart.data.datasets.find((dataset) => dataset.label === 'T');
    const trDataset = existingChart.data.datasets.find((dataset) => dataset.label === 'TR');
    const chDataset = existingChart.data.datasets.find((dataset) => dataset.label === 'CH');
    expect(tDataset?.borderDash).toEqual([6, 4]);
    expect(trDataset?.borderDash).toEqual([6, 4]);
    expect(chDataset?.borderDash).toEqual([6, 4]);

    await renderLastShiftHourlyChartWithTheme(env, {
      ...seriesInfo,
      series: {
        ...seriesInfo.series,
        total: [2, 3],
      },
    });

    expect(existingChart.update).toHaveBeenCalledTimes(2);
    expect(legendRoot.firstElementChild).toBe(firstLegendNode);
  });

  it('renders single dataset for referral arrivals metric', async () => {
    document.body.innerHTML = `
      <div id="lastShiftHourlyTitle"><span></span></div>
      <canvas id="lastShiftHourlyChart"></canvas>
      <div id="lastShiftHourlyContext"></div>
      <div id="lastShiftHourlyLegend"></div>
    `;
    const canvas = document.getElementById('lastShiftHourlyChart');
    canvas.getContext = vi.fn(() => ({}));

    const chartInstance = {
      canvas,
      config: { type: 'line' },
      data: { labels: [], datasets: [] },
      options: {},
      update: vi.fn(),
      destroy: vi.fn(),
      isDatasetVisible: vi.fn(() => true),
      setDatasetVisibility: vi.fn(),
    };
    let chartCtorCalls = 0;
    function chartCtor(_ctx, config) {
      chartCtorCalls += 1;
      chartInstance.data = config?.data || { labels: [], datasets: [] };
      chartInstance.options = config?.options || {};
      return chartInstance;
    }
    chartCtor.defaults = { font: {} };

    const env = {
      dashboardState: {
        chartLib: null,
        charts: { lastShiftHourly: null },
      },
      selectors: {
        lastShiftHourlyChart: canvas,
        lastShiftHourlyContext: document.getElementById('lastShiftHourlyContext'),
        lastShiftHourlyLegend: document.getElementById('lastShiftHourlyLegend'),
      },
      loadChartJs: vi.fn(async () => chartCtor),
      getThemePalette: () => ({
        textColor: '#111111',
        gridColor: 'rgba(0,0,0,0.2)',
        accent: '#2f80ed',
        accentSoft: 'rgba(47,128,237,0.2)',
      }),
      getThemeStyleTarget: () => document.body,
      setChartCardMessage: vi.fn(),
      TEXT: { charts: { hourlyDatasetTotalLabel: 'Viso' } },
      HEATMAP_HOURS: ['00:00', '01:00'],
      decimalFormatter: { format: (value) => String(value) },
      numberFormatter: { format: (value) => String(value) },
    };

    await renderLastShiftHourlyChartWithTheme(env, {
      hasData: true,
      metric: 'referral_arrivals',
      series: {
        total: [1, 2],
        t: [0, 0],
        tr: [0, 0],
        ch: [0, 0],
        outflow: [0, 0],
        net: [0, 0],
        census: [0, 0],
      },
      dateLabel: '2026-02-11',
      shiftStartHour: 7,
      metricLabel: 'Atvykimai su siuntimu',
    });

    expect(chartCtorCalls).toBe(1);
    expect(chartInstance.data.datasets).toHaveLength(1);
    expect(chartInstance.data.datasets[0].label).toBe('Atvykimai su siuntimu');
    expect(env.selectors.lastShiftHourlyLegend.children).toHaveLength(1);
    expect(document.querySelector('#lastShiftHourlyTitle span')?.textContent).toContain('su siuntimu');
  });
});
