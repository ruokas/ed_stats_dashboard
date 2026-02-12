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

    expect(existingChart.update).toHaveBeenCalledTimes(1);
    expect(existingChart.update).toHaveBeenCalledWith();
    const tDataset = existingChart.data.datasets.find((dataset) => dataset.label === 'T');
    const trDataset = existingChart.data.datasets.find((dataset) => dataset.label === 'TR');
    const chDataset = existingChart.data.datasets.find((dataset) => dataset.label === 'CH');
    expect(tDataset?.borderDash).toEqual([6, 4]);
    expect(trDataset?.borderDash).toEqual([6, 4]);
    expect(chDataset?.borderDash).toEqual([6, 4]);
  });
});
