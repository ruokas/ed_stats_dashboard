import { renderDailyChart } from './daily.js';
import { renderDowCharts } from './dow.js';
import { renderEdDispositionsChart } from './ed-dispositions.js';
import { renderFeedbackTrendChart } from './feedback-trend.js';
import {
  renderHourlyChart,
  renderHourlyChartWithTheme,
  renderLastShiftHourlyChartWithTheme,
} from './hourly.js';

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
    onChartsPrimaryVisible,
  } = env;

  const renderDailyChartWithEnv = (...args) => renderDailyChart(env, ...args);
  const renderHourlyChartWithEnv = (...args) => renderHourlyChart(env, ...args);
  const renderHourlyChartWithThemeBound = (records) => renderHourlyChartWithTheme(env, records);
  const renderLastShiftHourlyChartWithThemeBound = (seriesInfo) =>
    renderLastShiftHourlyChartWithTheme(env, seriesInfo);
  const renderFeedbackTrendChartBound = (monthlyStats) => renderFeedbackTrendChart(env, monthlyStats);
  const renderEdDispositionsChartBound = (dispositions, text, displayVariant) =>
    renderEdDispositionsChart(env, dispositions, text, displayVariant);

  async function resolveChartRenderContext({ showSkeletons = false } = {}) {
    if (showSkeletons) {
      showChartSkeletons();
    }
    const Chart = dashboardState.chartLib ?? (await loadChartJs());
    if (!Chart) {
      console.error('Chart.js biblioteka nepasiekiama.');
      showChartError(TEXT.charts?.errorLoading);
      return null;
    }
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
    return { Chart, palette };
  }

  function resolvePrimaryChartInputs(dailyStats, funnelTotals) {
    const scopedDaily = Array.isArray(dailyStats) ? dailyStats.slice() : [];
    dashboardState.chartData.dailyWindow = scopedDaily;
    const selectedYear = Number.isFinite(dashboardState.chartYear) ? Number(dashboardState.chartYear) : null;
    const baseDailyForFallback =
      Array.isArray(dashboardState.chartData.baseDaily) && dashboardState.chartData.baseDaily.length
        ? dashboardState.chartData.baseDaily
        : dashboardState.dailyStats;
    const fallbackDaily = filterDailyStatsByYear(baseDailyForFallback, selectedYear);
    const filteredDaily = Array.isArray(dashboardState.chartData.filteredDaily)
      ? dashboardState.chartData.filteredDaily
      : fallbackDaily;
    const funnelSource = funnelTotals ?? computeFunnelStats(scopedDaily, selectedYear, filteredDaily);
    dashboardState.chartData.funnel = funnelSource;
    return { scopedDaily, funnelSource, selectedYear };
  }

  function resolveHeatmapSource(heatmapData, selectedYear) {
    let heatmapSource = heatmapData ?? null;
    if (!isValidHeatmapData(heatmapSource)) {
      let fallbackRecords =
        Array.isArray(dashboardState.chartData.filteredWindowRecords) &&
        dashboardState.chartData.filteredWindowRecords.length
          ? dashboardState.chartData.filteredWindowRecords
          : null;
      if (!fallbackRecords || !fallbackRecords.length) {
        const baseRecords =
          Array.isArray(dashboardState.chartData.baseRecords) && dashboardState.chartData.baseRecords.length
            ? dashboardState.chartData.baseRecords
            : dashboardState.rawRecords;
        const yearScopedRecords = filterRecordsByYear(baseRecords, selectedYear);
        const filteredRecords = filterRecordsByChartFilters(
          yearScopedRecords,
          dashboardState.chartFilters || {}
        );
        fallbackRecords = filterRecordsByWindow(filteredRecords, dashboardState.chartPeriod);
      }
      heatmapSource = computeArrivalHeatmap(fallbackRecords);
    }
    dashboardState.chartData.heatmap = heatmapSource;
    if (!HEATMAP_METRIC_KEYS.includes(dashboardState.heatmapMetric)) {
      dashboardState.heatmapMetric = DEFAULT_HEATMAP_METRIC;
    }
    return heatmapSource;
  }

  function resolveHourlyRecords(hourlyRecords) {
    if (Array.isArray(hourlyRecords)) {
      return hourlyRecords;
    }
    if (
      Array.isArray(dashboardState.chartData.filteredWindowRecords) &&
      dashboardState.chartData.filteredWindowRecords.length
    ) {
      return dashboardState.chartData.filteredWindowRecords;
    }
    return Array.isArray(dashboardState.rawRecords) ? dashboardState.rawRecords : [];
  }

  function buildHeatmapRenderSignature({ heatmapSource }) {
    const selectedMetric = String(dashboardState.heatmapMetric || DEFAULT_HEATMAP_METRIC);
    const metric = heatmapSource?.metrics?.[selectedMetric] || {};
    const max = Number.isFinite(metric?.max) ? metric.max : 0;
    const rowCount = Array.isArray(metric?.matrix) ? metric.matrix.length : 0;
    return [
      'heatmap',
      Number.isFinite(dashboardState.chartYear) ? dashboardState.chartYear : 'all',
      Number.isFinite(dashboardState.chartPeriod) ? dashboardState.chartPeriod : 'all',
      selectedMetric,
      dashboardState.heatmapYear ?? 'all',
      dashboardState.heatmapFilters?.arrival ?? 'all',
      dashboardState.heatmapFilters?.disposition ?? 'all',
      dashboardState.heatmapFilters?.cardType ?? 'all',
      max,
      rowCount,
    ].join('|');
  }

  function buildHourlyRenderSignature({ hourlyRecords }) {
    const hourlyCount = Array.isArray(hourlyRecords) ? hourlyRecords.length : 0;
    return [
      'hourly',
      Number.isFinite(dashboardState.chartYear) ? dashboardState.chartYear : 'all',
      Number.isFinite(dashboardState.chartPeriod) ? dashboardState.chartPeriod : 'all',
      dashboardState.hourlyWeekday ?? 'all',
      dashboardState.hourlyStayBucket ?? 'all',
      dashboardState.hourlyMetric ?? 'arrivals',
      dashboardState.hourlyDepartment ?? 'all',
      dashboardState.hourlyCompareEnabled ? 'compare-on' : 'compare-off',
      Array.isArray(dashboardState.hourlyCompareYears) ? dashboardState.hourlyCompareYears.join(',') : '',
      dashboardState.hourlyCompareSeries ?? 'all',
      hourlyCount,
    ].join('|');
  }

  async function renderChartsPrimary(dailyStats, funnelTotals) {
    const context = await resolveChartRenderContext({ showSkeletons: true });
    if (!context) {
      return null;
    }
    try {
      const { Chart, palette } = context;
      const { scopedDaily, funnelSource } = resolvePrimaryChartInputs(dailyStats, funnelTotals);

      renderDailyChartWithEnv(scopedDaily, dashboardState.chartPeriod, Chart, palette);

      const funnelCanvas = document.getElementById('funnelChart');
      if (funnelCanvas && typeof renderFunnelShape === 'function') {
        renderFunnelShape(funnelCanvas, funnelSource, palette.accent, palette.textColor);
        dashboardState.charts.funnel = funnelCanvas;
      }

      renderDowCharts(env, Chart, palette, scopedDaily);
      hideChartSkeletons();
      dashboardState.chartsStartupPhases = {
        ...(dashboardState.chartsStartupPhases || {}),
        primaryVisible: true,
      };
      if (typeof onChartsPrimaryVisible === 'function') {
        onChartsPrimaryVisible({ dailyStats: scopedDaily, funnelTotals: funnelSource });
      }
      return { daily: scopedDaily, funnel: funnelSource };
    } catch (error) {
      console.error('Nepavyko atvaizduoti pirminių grafikų:', error);
      showChartError(TEXT.charts?.errorLoading);
      return null;
    }
  }

  async function renderChartsSecondary({
    heatmapData = null,
    hourlyRecords = null,
    allowReuse = false,
    renderHeatmap = true,
    renderHourly = true,
  } = {}) {
    const context = await resolveChartRenderContext({ showSkeletons: false });
    if (!context) {
      return false;
    }
    try {
      const { Chart, palette } = context;
      const selectedYear = Number.isFinite(dashboardState.chartYear)
        ? Number(dashboardState.chartYear)
        : null;
      const shouldRenderHeatmap = Boolean(renderHeatmap && selectors.heatmapContainer);
      const shouldRenderHourly = Boolean(renderHourly);
      if (!shouldRenderHeatmap && !shouldRenderHourly) {
        return false;
      }
      const heatmapSource = shouldRenderHeatmap ? resolveHeatmapSource(heatmapData, selectedYear) : null;
      const resolvedHourlyRecords = shouldRenderHourly ? resolveHourlyRecords(hourlyRecords) : [];
      const heatmapSignature = shouldRenderHeatmap
        ? buildHeatmapRenderSignature({ heatmapSource })
        : dashboardState.chartsHeatmapRenderSignature || '';
      const hourlySignature = shouldRenderHourly
        ? buildHourlyRenderSignature({ hourlyRecords: resolvedHourlyRecords })
        : dashboardState.chartsHourlyRenderSignature || '';
      const canReuseHeatmap =
        !shouldRenderHeatmap || dashboardState.chartsHeatmapRenderSignature === heatmapSignature;
      const canReuseHourly =
        !shouldRenderHourly || dashboardState.chartsHourlyRenderSignature === hourlySignature;
      if (allowReuse && canReuseHeatmap && canReuseHourly) {
        return false;
      }

      if (shouldRenderHeatmap && typeof renderArrivalHeatmap === 'function') {
        renderArrivalHeatmap(
          selectors.heatmapContainer,
          heatmapSource,
          palette.accent,
          dashboardState.heatmapMetric
        );
        dashboardState.charts.heatmap = selectors.heatmapContainer;
        dashboardState.chartsHeatmapRenderSignature = heatmapSignature;
      }
      if (shouldRenderHourly) {
        renderHourlyChartWithEnv(resolvedHourlyRecords, Chart, palette);
        dashboardState.chartsHourlyRenderSignature = hourlySignature;
      }
      dashboardState.chartsSecondaryRenderSignature = [
        dashboardState.chartsHeatmapRenderSignature || '',
        dashboardState.chartsHourlyRenderSignature || '',
      ].join('||');
      const previousSectionFlags = dashboardState.chartsSectionRenderFlags || {};
      dashboardState.chartsStartupPhases = {
        ...(dashboardState.chartsStartupPhases || {}),
        secondaryComplete: Boolean(
          (previousSectionFlags.heatmapRendered || shouldRenderHeatmap) &&
            (previousSectionFlags.hourlyRendered || shouldRenderHourly)
        ),
      };
      dashboardState.chartsSectionRenderFlags = {
        ...previousSectionFlags,
        heatmapRendered: previousSectionFlags.heatmapRendered || shouldRenderHeatmap,
        hourlyRendered: previousSectionFlags.hourlyRendered || shouldRenderHourly,
      };
      return true;
    } catch (error) {
      console.error('Nepavyko atvaizduoti antrinių grafikų:', error);
      showChartError(TEXT.charts?.errorLoading);
      return false;
    }
  }

  async function renderCharts(dailyStats, funnelTotals, heatmapData) {
    await renderChartsPrimary(dailyStats, funnelTotals);
    await renderChartsSecondary({ heatmapData });
  }

  return {
    renderChartsPrimary,
    renderChartsSecondary,
    renderCharts,
    renderDailyChart: renderDailyChartWithEnv,
    renderHourlyChart: renderHourlyChartWithEnv,
    renderHourlyChartWithTheme: renderHourlyChartWithThemeBound,
    renderLastShiftHourlyChartWithTheme: renderLastShiftHourlyChartWithThemeBound,
    renderFeedbackTrendChart: renderFeedbackTrendChartBound,
    renderEdDispositionsChart: renderEdDispositionsChartBound,
  };
}
