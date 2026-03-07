import { createChartRenderers } from '../../../charts/index.js';
import { createMainDataHandlers } from '../../../data/main-data.js';
import {
  computeDailyStats,
  computeHospitalizedByDepartmentAndSpsStay,
  computeHospitalizedDepartmentYearlyStayTrend,
} from '../../../data/stats.js';
import { initChartControls } from '../../../events/charts.js';
import { getMetricLabelOverride, isMetricEnabled } from '../../../metrics/catalog-overrides.js';
import { getMetricById, getMetricSurfaceMeta, getMetricsBySurface } from '../../../metrics/index.js';
import { createDashboardState } from '../../../state/dashboardState.js';
import { createSelectorsForPage } from '../../../state/selectors.js';
import { loadChartJs } from '../../../utils/chart-loader.js';
import { getDatasetValue, runAfterDomAndIdle, setDatasetValue } from '../../../utils/dom.js';
import {
  decimalFormatter,
  monthDayFormatter,
  monthOnlyFormatter,
  numberFormatter,
  oneDecimalFormatter,
  percentFormatter,
  shortDateFormatter,
  textCollator,
} from '../../../utils/format.js';
import {
  AUTO_REFRESH_INTERVAL_MS,
  CLIENT_CONFIG_KEY,
  DEFAULT_FOOTER_SOURCE,
  DEFAULT_KPI_WINDOW_DAYS,
  TEXT,
  THEME_STORAGE_KEY,
} from '../../constants.js';
import { DEFAULT_SETTINGS } from '../../default-settings.js';
import { createChartFlow } from '../chart-flow.js';
import {
  buildDailyWindowKeys,
  dateKeyToDate,
  fillDailyStatsWindow,
  filterDailyStatsByWindow,
  filterDailyStatsByYear,
  filterRecordsByWindow,
  filterRecordsByYear,
  getAvailableYearsFromDaily,
  getWeekdayIndexFromDateKey,
  isWeekendDateKey,
  populateChartYearOptions,
  syncChartPeriodButtons,
  syncChartYearControl,
} from '../chart-primitives.js';
import { createDataFlow } from '../data-flow.js';
import { setupCopyExportControls } from '../export-controls.js';
import { createFunnelCanvasFeature } from '../features/funnel-canvas.js';
import { createHourlyControlsFeature } from '../features/hourly-controls.js';
import { applyChartsText } from '../features/text-charts.js';
import { applyTheme, getThemePalette, getThemeStyleTarget, initializeTheme } from '../features/theme.js';
import { sanitizeChartFilters } from '../filters.js';
import {
  createTextSignature,
  describeCacheMeta,
  describeError,
  downloadCsv,
  formatUrlForDiagnostics,
} from '../network.js';
import { applyCommonPageShellText, setupSharedPageUi } from '../page-ui.js';
import { loadSettingsFromConfig } from '../settings.js';
import {
  createDefaultChartFilters,
  createDefaultFeedbackFilters,
  createDefaultKpiFilters,
  KPI_FILTER_LABELS,
} from '../state.js';
import { parseColorToRgb, relativeLuminance, rgbToRgba } from '../utils/color.js';
import {
  clearChartError,
  hideChartSkeletons,
  setChartCardMessage,
  showChartError,
  showChartSkeletons,
} from './charts/chart-cards.js';
import { createChartsDataFlowConfig } from './charts/data-flow-config.js';
import { CHARTS_SECTION_KEYS, DEFAULT_CHARTS_SECTIONS_EXPANDED } from './charts/disclosure.js';
import {
  computeArrivalHeatmap,
  computeFunnelStats,
  filterRecordsByChartFilters,
  filterRecordsByHeatmapFilters,
  HEATMAP_HOURS,
  HEATMAP_WEEKDAY_FULL,
  HEATMAP_WEEKDAY_SHORT,
  resolveCachedHeatmapFilterData,
  sanitizeHeatmapFilters,
} from './charts/heatmap.js';
import { createChartsHeatmapFeature } from './charts/heatmap-feature.js';
import { createChartsHospitalTableFeature } from './charts/hospital-table.js';
import {
  HOURLY_COMPARE_SERIES,
  HOURLY_COMPARE_SERIES_ALL,
  HOURLY_COMPARE_SERIES_EMS,
  HOURLY_COMPARE_SERIES_SELF,
  HOURLY_METRIC_ARRIVALS,
  HOURLY_METRIC_BALANCE,
  HOURLY_METRIC_DISCHARGES,
  HOURLY_METRIC_HOSPITALIZED,
  HOURLY_METRICS,
  HOURLY_STAY_BUCKET_ALL,
  HOURLY_STAY_BUCKETS,
  HOURLY_WEEKDAY_ALL,
} from './charts/hourly-constants.js';
import { initChartsJumpNavigation, initChartsJumpStickyOffset } from './charts/jump-nav.js';
import { createChartsLifecycleFeature } from './charts/lifecycle.js';
import { syncDailyPeriodSummary } from './charts/runtime-caption.js';
import { createChartsRuntimeHelpers } from './charts/runtime-helpers.js';
import { wireChartsRuntimeInteractions } from './charts/runtime-interactions.js';
import { initializeChartsStateFromQuery } from './charts/runtime-query.js';
import { createChartsRuntimeUiControls } from './charts/runtime-ui-controls.js';
import { createChartsSectionDisclosureFeature } from './charts/section-disclosure-feature.js';
import { createRuntimeLifecycle } from './runtime-lifecycle.js';

const { runtimeClient, setStatus, getAutoRefreshTimerId, setAutoRefreshTimerId } = createRuntimeLifecycle({
  clientConfigKey: CLIENT_CONFIG_KEY,
  statusText: TEXT.status,
});

const HEATMAP_METRICS = getMetricsBySurface('heatmap');
const HEATMAP_METRIC_KEYS = HEATMAP_METRICS.map((metric) => metric.id);
const DEFAULT_HEATMAP_METRIC = HEATMAP_METRIC_KEYS.includes('arrivals')
  ? 'arrivals'
  : HEATMAP_METRIC_KEYS[0] || 'arrivals';

export {
  buildHeatmapFilterCacheKey,
  computeArrivalHeatmap,
  computeFunnelStats,
  filterRecordsByChartFilters,
  filterRecordsByHeatmapFilters,
  matchesSharedPatientFilters,
  resolveCachedHeatmapFilterData,
  sanitizeHeatmapFilters,
} from './charts/heatmap.js';

export async function runChartsRuntime(core) {
  const pageConfig = core?.pageConfig || { charts: true, heatmap: true, hourly: true };
  const selectors = createSelectorsForPage(core?.pageId || 'charts');
  const settings = await loadSettingsFromConfig(DEFAULT_SETTINGS);
  const dashboardState = createDashboardState({
    defaultChartFilters: createDefaultChartFilters,
    defaultKpiFilters: () => createDefaultKpiFilters({ settings, DEFAULT_SETTINGS, DEFAULT_KPI_WINDOW_DAYS }),
    defaultFeedbackFilters: createDefaultFeedbackFilters,
    defaultHeatmapFilters: () => ({ arrival: 'all', disposition: 'all', cardType: 'all' }),
    defaultHeatmapMetric: DEFAULT_HEATMAP_METRIC,
    hourlyMetricArrivals: HOURLY_METRIC_ARRIVALS,
    hourlyCompareSeriesAll: HOURLY_COMPARE_SERIES_ALL,
  });
  let initialLoadPending = true;
  let chartsJumpBeforeNavigate = () => {};
  const {
    getEnabledHeatmapMetricKeys,
    getDefaultHeatmapMetric,
    getChartsDefaults,
    ensureChartsDisclosure,
    setChartsSectionExpanded,
    persistChartsQuery,
    applyChartsLoadingLayout,
    formatDailyCaption,
  } = createChartsRuntimeHelpers({
    settings,
    selectors,
    dashboardState,
    isMetricEnabled,
    heatmapMetricKeys: HEATMAP_METRIC_KEYS,
    defaultHeatmapMetric: DEFAULT_HEATMAP_METRIC,
    hourlyWeekdayAll: HOURLY_WEEKDAY_ALL,
    hourlyStayBucketAll: HOURLY_STAY_BUCKET_ALL,
    hourlyMetricArrivals: HOURLY_METRIC_ARRIVALS,
    hourlyCompareSeriesAll: HOURLY_COMPARE_SERIES_ALL,
    defaultChartsSectionsExpanded: DEFAULT_CHARTS_SECTIONS_EXPANDED,
    chartsSectionKeys: CHARTS_SECTION_KEYS,
    text: TEXT,
    numberFormatter,
  });
  const hadParsedChartsQuery = initializeChartsStateFromQuery({
    dashboardState,
    search: window.location.search,
    defaultChartsSectionsExpanded: DEFAULT_CHARTS_SECTIONS_EXPANDED,
    sanitizeChartFilters,
    createDefaultChartFilters,
    kpiFilterLabels: KPI_FILTER_LABELS,
    sanitizeHeatmapFilters,
  });
  ensureChartsDisclosure();
  dashboardState.heatmapMetric = getEnabledHeatmapMetricKeys().includes(dashboardState.heatmapMetric)
    ? dashboardState.heatmapMetric
    : getDefaultHeatmapMetric();

  const { fetchData, mergeDailyStatsSeries } = createMainDataHandlers({
    settings,
    DEFAULT_SETTINGS,
    dashboardState,
    downloadCsv,
    describeError,
    createTextSignature,
    formatUrlForDiagnostics,
  });

  applyCommonPageShellText({ selectors, settings, text: TEXT, defaultFooterSource: DEFAULT_FOOTER_SOURCE });
  setupSharedPageUi({
    selectors,
    dashboardState,
    initializeTheme,
    applyTheme,
    themeStorageKey: THEME_STORAGE_KEY,
    afterSectionNavigation: () => {
      initChartsJumpStickyOffset(selectors);
      initChartsJumpNavigation(selectors, {
        onBeforeNavigate: (target) => chartsJumpBeforeNavigate(target),
      });
    },
  });

  setupCopyExportControls({
    selectors,
    getDatasetValue,
    setDatasetValue,
    describeError,
  });

  const {
    markChartsSectionVisible,
    applyChartsSectionDisclosure,
    setRenderChartsHospitalTable,
    setScheduleChartsSecondaryRender,
  } = createChartsSectionDisclosureFeature({
    selectors,
    dashboardState,
    chartsSectionKeys: CHARTS_SECTION_KEYS,
    defaultChartsSectionsExpanded: DEFAULT_CHARTS_SECTIONS_EXPANDED,
    ensureChartsDisclosure,
  });

  const {
    updateHeatmapCaption,
    populateHeatmapMetricOptions,
    syncHeatmapFilterControls,
    populateHeatmapYearOptions,
    computeHeatmapDataForFilters,
    applyHeatmapFiltersAndRender,
    handleHeatmapMetricChange,
    handleHeatmapFilterChange,
    isValidHeatmapData,
    renderArrivalHeatmap,
  } = createChartsHeatmapFeature({
    selectors,
    dashboardState,
    TEXT,
    settings,
    KPI_FILTER_LABELS,
    oneDecimalFormatter,
    getMetricById,
    getMetricSurfaceMeta,
    getMetricLabelOverride,
    getEnabledHeatmapMetricKeys,
    getDefaultHeatmapMetric,
    sanitizeHeatmapFilters,
    getAvailableYearsFromDaily,
    resolveCachedHeatmapFilterData,
    filterRecordsByYear,
    filterRecordsByHeatmapFilters,
    computeArrivalHeatmap,
    getThemePalette,
    HEATMAP_HOURS,
    HEATMAP_WEEKDAY_FULL,
    HEATMAP_WEEKDAY_SHORT,
    persistChartsQuery,
    setDatasetValue,
    markChartsSectionVisible,
  });

  const {
    updateChartsHospitalTableHeaderSortIndicators,
    populateChartsHospitalTableYearOptions,
    renderChartsHospitalTable,
    handleChartsHospitalTableYearChange,
    handleChartsHospitalTableSearchInput,
    handleChartsHospitalTableHeaderClick,
    handleChartsHospitalTableRowClick,
  } = createChartsHospitalTableFeature({
    selectors,
    dashboardState,
    TEXT,
    settings,
    DEFAULT_SETTINGS,
    textCollator,
    numberFormatter,
    oneDecimalFormatter,
    setDatasetValue,
    getDatasetValue,
    computeHospitalizedByDepartmentAndSpsStay,
    computeHospitalizedDepartmentYearlyStayTrend,
    loadChartJs,
    getThemePalette,
    persistChartsQuery,
  });
  setRenderChartsHospitalTable(renderChartsHospitalTable);

  const updateDailyPeriodSummary = (dailyStats) =>
    syncDailyPeriodSummary({
      selectors,
      dateKeyToDate,
      shortDateFormatter,
      dailyStats,
    });

  const chartFlow = createChartFlow({
    selectors,
    dashboardState,
    TEXT,
    DEFAULT_SETTINGS,
    getDefaultChartFilters: createDefaultChartFilters,
    KPI_FILTER_LABELS,
    sanitizeChartFilters,
    getDatasetValue,
    setDatasetValue,
    toSentenceCase: (value) =>
      typeof value === 'string' ? value.charAt(0).toUpperCase() + value.slice(1) : '',
    showChartError: (message) => showChartError(selectors, message),
    describeError,
    computeDailyStats,
    filterDailyStatsByWindow,
    filterDailyStatsByYear,
    filterRecordsByYear,
    filterRecordsByWindow,
    filterRecordsByChartFilters,
    computeArrivalHeatmap,
    computeFunnelStats,
    buildDailyWindowKeys,
    fillDailyStatsWindow,
    updateDailyPeriodSummary,
    syncChartPeriodButtons: (period) => syncChartPeriodButtons({ selectors, period }),
    syncChartYearControl: () => syncChartYearControl({ selectors, dashboardState }),
    formatDailyCaption,
    renderCharts: (...args) => chartRenderers.renderCharts(...args),
    getSettings: () => settings,
    onFiltersStateChange: () => persistChartsQuery(),
  });

  const hourlyControlsFeature = createHourlyControlsFeature({
    selectors,
    dashboardState,
    TEXT,
    settings,
    DEFAULT_SETTINGS,
    getDatasetValue,
    sanitizeChartFilters,
    getDefaultChartFilters: createDefaultChartFilters,
    KPI_FILTER_LABELS,
    filterRecordsByYear,
    filterRecordsByChartFilters,
    filterRecordsByWindow,
    getAvailableYearsFromDaily,
    textCollator,
    formatLocalDateKey: (date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    describeError,
    showChartError: (message) => showChartError(selectors, message),
    getChartRenderers: () => chartRenderers,
    HOURLY_WEEKDAY_ALL,
    HOURLY_STAY_BUCKET_ALL,
    HOURLY_METRIC_ARRIVALS,
    HOURLY_METRIC_DISCHARGES,
    HOURLY_METRIC_BALANCE,
    HOURLY_METRIC_HOSPITALIZED,
    HOURLY_METRICS,
    HOURLY_COMPARE_SERIES_ALL,
    HOURLY_COMPARE_SERIES_EMS,
    HOURLY_COMPARE_SERIES_SELF,
    HOURLY_COMPARE_SERIES,
    HOURLY_STAY_BUCKETS,
    HEATMAP_WEEKDAY_FULL,
  });

  const funnelCanvasFeature = createFunnelCanvasFeature({
    TEXT,
    getThemeStyleTarget,
    parseColorToRgb,
    relativeLuminance,
    rgbToRgba,
    numberFormatter,
    percentFormatter,
  });

  const chartRenderers = createChartRenderers({
    dashboardState,
    selectors,
    TEXT,
    loadChartJs,
    getThemePalette,
    getThemeStyleTarget,
    showChartSkeletons: () => showChartSkeletons(selectors),
    hideChartSkeletons: () => hideChartSkeletons(selectors),
    clearChartError: () => clearChartError(selectors),
    showChartError: (message) => showChartError(selectors, message),
    setChartCardMessage,
    renderFunnelShape: funnelCanvasFeature.renderFunnelShape,
    filterDailyStatsByYear,
    computeFunnelStats,
    isValidHeatmapData,
    filterRecordsByYear,
    filterRecordsByChartFilters,
    filterRecordsByWindow,
    computeArrivalHeatmap,
    renderArrivalHeatmap,
    getWeekdayIndexFromDateKey,
    numberFormatter,
    decimalFormatter,
    oneDecimalFormatter,
    percentFormatter,
    monthOnlyFormatter,
    monthDayFormatter,
    shortDateFormatter,
    dateKeyToDate,
    isWeekendDateKey,
    computeMonthlyStats: () => [],
    formatMonthLabel: (monthKey) => monthKey,
    formatDailyCaption,
    syncChartPeriodButtons: (period) => syncChartPeriodButtons({ selectors, period }),
    HEATMAP_METRIC_KEYS: getEnabledHeatmapMetricKeys(),
    DEFAULT_HEATMAP_METRIC: getDefaultHeatmapMetric(),
    HEATMAP_HOURS,
    HOURLY_STAY_BUCKET_ALL,
    HOURLY_COMPARE_SERIES,
    HOURLY_COMPARE_SERIES_ALL,
    normalizeHourlyWeekday: hourlyControlsFeature.normalizeHourlyWeekday,
    normalizeHourlyStayBucket: hourlyControlsFeature.normalizeHourlyStayBucket,
    normalizeHourlyMetric: hourlyControlsFeature.normalizeHourlyMetric,
    normalizeHourlyDepartment: hourlyControlsFeature.normalizeHourlyDepartment,
    normalizeHourlyCompareYears: hourlyControlsFeature.normalizeHourlyCompareYears,
    updateHourlyCaption: hourlyControlsFeature.updateHourlyCaption,
    updateHourlyDepartmentOptions: hourlyControlsFeature.updateHourlyDepartmentOptions,
    syncHourlyDepartmentVisibility: hourlyControlsFeature.syncHourlyDepartmentVisibility,
    getHourlyChartRecords: hourlyControlsFeature.getHourlyChartRecords,
    computeHourlySeries: hourlyControlsFeature.computeHourlySeries,
    applyHourlyYAxisAuto: hourlyControlsFeature.applyHourlyYAxisAuto,
    syncFeedbackTrendControls: () => {},
    updateFeedbackTrendSubtitle: () => {},
    getActiveFeedbackTrendWindow: () => 6,
    formatMonthLabelForAxis: null,
    onChartsPrimaryVisible: () => handleChartsPrimaryVisible(),
  });

  const {
    ensureChartsHospitalVisibilityObserver,
    ensureChartsSecondaryVisibilityObserver,
    scheduleChartsSecondaryRender,
    handleChartsPrimaryVisible,
  } = createChartsLifecycleFeature({
    selectors,
    dashboardState,
    runtimeClient,
    runAfterDomAndIdle,
    chartRenderers,
    computeHeatmapDataForFilters,
    renderChartsHospitalTable,
    markChartsSectionVisible,
  });
  setScheduleChartsSecondaryRender(scheduleChartsSecondaryRender);
  const {
    hourlyControlsWithPersistence,
    handleChartFiltersReset,
    expandChartsForTarget,
    applyInitialHashExpansion,
    bindChartsSectionToggleButtons,
  } = createChartsRuntimeUiControls({
    selectors,
    dashboardState,
    chartsSectionKeys: CHARTS_SECTION_KEYS,
    getChartsDefaults,
    createDefaultChartFilters,
    sanitizeHeatmapFilters,
    chartFlow,
    syncChartPeriodButtons,
    syncChartYearControl,
    populateHeatmapMetricOptions,
    updateHeatmapCaption,
    syncHeatmapFilterControls,
    hourlyControlsFeature,
    markChartsSectionVisible,
    applyHeatmapFiltersAndRender,
    renderChartsHospitalTable,
    persistChartsQuery,
    setChartsSectionExpanded,
    applyChartsSectionDisclosure,
  });
  chartsJumpBeforeNavigate = expandChartsForTarget;
  applyInitialHashExpansion();
  bindChartsSectionToggleButtons();

  wireChartsRuntimeInteractions({
    applyChartsText,
    initChartControls,
    selectors,
    text: TEXT,
    dashboardState,
    formatDailyCaption,
    updateChartsHospitalTableHeaderSortIndicators,
    hourlyControlsFeature: hourlyControlsWithPersistence,
    populateHeatmapMetricOptions,
    updateHeatmapCaption,
    chartFlow,
    handleHeatmapMetricChange,
    handleHeatmapFilterChange,
    handleChartFiltersReset,
    handleChartsHospitalTableYearChange,
    handleChartsHospitalTableSearchInput,
    handleChartsHospitalTableHeaderClick,
    handleChartsHospitalTableRowClick,
    syncHeatmapFilterControls,
  });

  const dataFlow = createDataFlow(
    createChartsDataFlowConfig({
      pageConfig,
      selectors,
      dashboardState,
      text: TEXT,
      defaultSettings: DEFAULT_SETTINGS,
      autoRefreshIntervalMs: AUTO_REFRESH_INTERVAL_MS,
      runAfterDomAndIdle,
      setDatasetValue,
      setStatus: (type, details) => {
        setStatus(selectors, type, details);
        if (type === 'loading') {
          applyChartsLoadingLayout({ isLoading: true, initialLoadPending });
          return;
        }
        if (initialLoadPending) {
          initialLoadPending = false;
        }
        applyChartsLoadingLayout({ isLoading: false, initialLoadPending });
      },
      showChartSkeletons: () => {
        applyChartsLoadingLayout({ isLoading: true, initialLoadPending });
        showChartSkeletons(selectors);
      },
      fetchData,
      perfMonitor: runtimeClient.perfMonitor,
      describeCacheMeta,
      describeError,
      computeDailyStats,
      filterDailyStatsByWindow,
      mergeDailyStatsSeries,
      populateChartYearOptions: (dailyStats) =>
        populateChartYearOptions({
          dailyStats,
          selectors,
          dashboardState,
          syncChartYearControl: () => syncChartYearControl({ selectors, dashboardState }),
        }),
      populateChartsHospitalTableYearOptions,
      populateHourlyCompareYearOptions: hourlyControlsFeature.populateHourlyCompareYearOptions,
      populateHeatmapYearOptions,
      syncHeatmapFilterControls,
      getDefaultChartFilters: createDefaultChartFilters,
      sanitizeChartFilters,
      kpiFilterLabels: KPI_FILTER_LABELS,
      syncChartFilterControls: chartFlow.syncChartFilterControls,
      prepareChartDataForPeriod: chartFlow.prepareChartDataForPeriod,
      renderChartsPrimary: chartRenderers.renderChartsPrimary,
      renderChartsSecondary: chartRenderers.renderChartsSecondary,
      renderCharts: chartRenderers.renderCharts,
      renderChartsHospitalTable,
      getHeatmapData: computeHeatmapDataForFilters,
      onChartsPrimaryVisible: handleChartsPrimaryVisible,
      scheduleChartsSecondaryRender,
      numberFormatter,
      getSettings: () => settings,
      getClientConfig: runtimeClient.getClientConfig,
      getAutoRefreshTimerId,
      setAutoRefreshTimerId,
    })
  );

  void loadChartJs();
  applyChartsSectionDisclosure({ reason: 'init', triggerRender: false });
  applyChartsLoadingLayout({ isLoading: true, initialLoadPending });
  ensureChartsSecondaryVisibilityObserver();
  ensureChartsHospitalVisibilityObserver();
  dataFlow.scheduleInitialLoad();
  if (!hadParsedChartsQuery) {
    persistChartsQuery();
  }
}

export const runChartsPage = runChartsRuntime;
