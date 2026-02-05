import { renderDailyChart } from './daily.js';
import { renderHourlyChart, renderHourlyChartWithTheme, renderLastShiftHourlyChartWithTheme } from './hourly.js';
import { renderDowCharts } from './dow.js';
import { renderFeedbackTrendChart } from './feedback-trend.js';
import { renderEdDispositionsChart } from './ed-dispositions.js';

export function createChartRenderers(env) {
  const {
    dashboardState,
    selectors,
    TEXT,
    loadChartJs,
    getThemePalette,
    getThemeStyleTarget,
    showChartSkeletons,
    hideChartSkeletons,
    clearChartError,
    showChartError,
    renderFunnelShape,
    renderArrivalHeatmap,
    filterDailyStatsByYear,
    computeFunnelStats,
    isValidHeatmapData,
    filterRecordsByYear,
    filterRecordsByChartFilters,
    filterRecordsByWindow,
    computeArrivalHeatmap,
    HEATMAP_METRIC_KEYS,
    DEFAULT_HEATMAP_METRIC,
  } = env;

  const renderDailyChartWithEnv = (...args) => renderDailyChart(env, ...args);
  const renderHourlyChartWithEnv = (...args) => renderHourlyChart(env, ...args);
  const renderHourlyChartWithThemeBound = (records) => renderHourlyChartWithTheme(env, records);
  const renderLastShiftHourlyChartWithThemeBound = (seriesInfo) => renderLastShiftHourlyChartWithTheme(env, seriesInfo);
  const renderFeedbackTrendChartBound = (monthlyStats) => renderFeedbackTrendChart(env, monthlyStats);
  const renderEdDispositionsChartBound = (dispositions, text, displayVariant) => (
    renderEdDispositionsChart(env, dispositions, text, displayVariant)
  );

  async function renderCharts(dailyStats, funnelTotals, heatmapData) {
    showChartSkeletons();
    const Chart = await loadChartJs();
    if (!Chart) {
      console.error('Chart.js biblioteka nepasiekiama.');
      showChartError(TEXT.charts?.errorLoading);
      return;
    }

    try {
      clearChartError();
      const palette = getThemePalette();
      const styleTarget = getThemeStyleTarget();
      Chart.defaults.color = palette.textColor;
      Chart.defaults.font.family = getComputedStyle(styleTarget).fontFamily;
      Chart.defaults.borderColor = palette.gridColor;

      if (!Number.isFinite(dashboardState.chartPeriod) || dashboardState.chartPeriod < 0) {
        dashboardState.chartPeriod = 30;
      }

      dashboardState.chartLib = Chart;
      const scopedDaily = Array.isArray(dailyStats) ? dailyStats.slice() : [];
      dashboardState.chartData.dailyWindow = scopedDaily;

      const selectedYear = Number.isFinite(dashboardState.chartYear) ? Number(dashboardState.chartYear) : null;
      const baseDailyForFallback = Array.isArray(dashboardState.chartData.baseDaily)
        && dashboardState.chartData.baseDaily.length
        ? dashboardState.chartData.baseDaily
        : dashboardState.dailyStats;
      const fallbackDaily = filterDailyStatsByYear(baseDailyForFallback, selectedYear);
      const filteredDaily = Array.isArray(dashboardState.chartData.filteredDaily)
        ? dashboardState.chartData.filteredDaily
        : fallbackDaily;
      const funnelSource = funnelTotals ?? computeFunnelStats(scopedDaily, selectedYear, filteredDaily);
      dashboardState.chartData.funnel = funnelSource;

      let heatmapSource = heatmapData ?? null;
      if (!isValidHeatmapData(heatmapSource)) {
        let fallbackRecords = Array.isArray(dashboardState.chartData.filteredWindowRecords)
          && dashboardState.chartData.filteredWindowRecords.length
          ? dashboardState.chartData.filteredWindowRecords
          : null;
        if (!fallbackRecords || !fallbackRecords.length) {
          const baseRecords = Array.isArray(dashboardState.chartData.baseRecords)
            && dashboardState.chartData.baseRecords.length
            ? dashboardState.chartData.baseRecords
            : dashboardState.rawRecords;
          const yearScopedRecords = filterRecordsByYear(baseRecords, selectedYear);
          const filteredRecords = filterRecordsByChartFilters(yearScopedRecords, dashboardState.chartFilters || {});
          fallbackRecords = filterRecordsByWindow(filteredRecords, dashboardState.chartPeriod);
        }
        heatmapSource = computeArrivalHeatmap(fallbackRecords);
      }
      dashboardState.chartData.heatmap = heatmapSource;
      if (!HEATMAP_METRIC_KEYS.includes(dashboardState.heatmapMetric)) {
        dashboardState.heatmapMetric = DEFAULT_HEATMAP_METRIC;
      }

      hideChartSkeletons();
      renderDailyChartWithEnv(scopedDaily, dashboardState.chartPeriod, Chart, palette);

      const funnelCanvas = document.getElementById('funnelChart');
      if (funnelCanvas) {
        if (typeof renderFunnelShape === 'function') {
          renderFunnelShape(funnelCanvas, funnelSource, palette.accent, palette.textColor);
          dashboardState.charts.funnel = funnelCanvas;
        }
      }

      renderDowCharts(env, Chart, palette, scopedDaily);

      if (selectors.heatmapContainer && typeof renderArrivalHeatmap === 'function') {
        renderArrivalHeatmap(
          selectors.heatmapContainer,
          heatmapSource,
          palette.accent,
          dashboardState.heatmapMetric,
        );
        dashboardState.charts.heatmap = selectors.heatmapContainer;
      }

      const hourlyRecords = Array.isArray(dashboardState.chartData.filteredWindowRecords)
        && dashboardState.chartData.filteredWindowRecords.length
        ? dashboardState.chartData.filteredWindowRecords
        : (Array.isArray(dashboardState.rawRecords) ? dashboardState.rawRecords : []);
      renderHourlyChartWithEnv(hourlyRecords, Chart, palette);
    } catch (error) {
      console.error('Nepavyko atvaizduoti grafikų:', error);
      showChartError(TEXT.charts?.errorLoading);
    }
  }

  return {
    renderCharts,
    renderDailyChart: renderDailyChartWithEnv,
    renderHourlyChart: renderHourlyChartWithEnv,
    renderHourlyChartWithTheme: renderHourlyChartWithThemeBound,
    renderLastShiftHourlyChartWithTheme: renderLastShiftHourlyChartWithThemeBound,
    renderFeedbackTrendChart: renderFeedbackTrendChartBound,
    renderEdDispositionsChart: renderEdDispositionsChartBound,
  };
}
