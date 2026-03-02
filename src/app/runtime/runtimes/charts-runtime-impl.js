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
import { parseFromQuery, replaceUrlQuery, serializeToQuery } from '../filters/query-codec.js';
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
import {
  buildChartsExpandedMap,
  CHARTS_SECTION_KEYS,
  DEFAULT_CHARTS_SECTIONS_EXPANDED,
  getExpandedKeysFromMap,
  normalizeChartsSectionExpandedKeys,
} from './charts/disclosure.js';
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
import { createChartsHospitalTableFeature } from './charts/hospital-table.js';
import { initChartsJumpNavigation, initChartsJumpStickyOffset } from './charts/jump-nav.js';
import { wireChartsRuntimeInteractions } from './charts/runtime-interactions.js';
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
const HOURLY_WEEKDAY_ALL = 'all';
const HOURLY_STAY_BUCKET_ALL = 'all';
const HOURLY_METRIC_ARRIVALS = 'arrivals';
const HOURLY_METRIC_DISCHARGES = 'discharges';
const HOURLY_METRIC_BALANCE = 'balance';
const HOURLY_METRIC_HOSPITALIZED = 'hospitalized';
const HOURLY_METRICS = [
  HOURLY_METRIC_ARRIVALS,
  HOURLY_METRIC_DISCHARGES,
  HOURLY_METRIC_BALANCE,
  HOURLY_METRIC_HOSPITALIZED,
];
const HOURLY_COMPARE_SERIES_ALL = 'all';
const HOURLY_COMPARE_SERIES_EMS = 'ems';
const HOURLY_COMPARE_SERIES_SELF = 'self';
const HOURLY_COMPARE_SERIES = [
  HOURLY_COMPARE_SERIES_ALL,
  HOURLY_COMPARE_SERIES_EMS,
  HOURLY_COMPARE_SERIES_SELF,
];
const HOURLY_STAY_BUCKETS = [
  { key: 'lt4', min: 0, max: 4 },
  { key: '4to8', min: 4, max: 8 },
  { key: '8to16', min: 8, max: 16 },
  { key: 'gt16', min: 16, max: Number.POSITIVE_INFINITY },
];

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
  const getEnabledHeatmapMetricKeys = () => {
    const enabled = HEATMAP_METRIC_KEYS.filter((metricId) => isMetricEnabled(settings, metricId));
    return enabled.length ? enabled : HEATMAP_METRIC_KEYS;
  };
  const getDefaultHeatmapMetric = () => {
    const enabled = getEnabledHeatmapMetricKeys();
    return enabled.includes('arrivals') ? 'arrivals' : enabled[0] || DEFAULT_HEATMAP_METRIC;
  };
  const getChartsDefaults = () => ({
    chartPeriod: 30,
    chartYear: null,
    arrival: 'all',
    disposition: 'all',
    cardType: 'all',
    compareGmp: false,
    heatmapMetric: getDefaultHeatmapMetric(),
    heatmapArrival: 'all',
    heatmapDisposition: 'all',
    heatmapCardType: 'all',
    heatmapYear: null,
    hourlyWeekday: HOURLY_WEEKDAY_ALL,
    hourlyStayBucket: HOURLY_STAY_BUCKET_ALL,
    hourlyMetric: HOURLY_METRIC_ARRIVALS,
    hourlyDepartment: 'all',
    hourlyCompareEnabled: false,
    hourlyCompareYearA: null,
    hourlyCompareYearB: null,
    hourlyCompareSeries: HOURLY_COMPARE_SERIES_ALL,
    hospitalYear: 'all',
    hospitalSort: 'total_desc',
    hospitalSearch: '',
    hospitalDepartment: '',
    chartsSectionsExpanded: getExpandedKeysFromMap(
      DEFAULT_CHARTS_SECTIONS_EXPANDED,
      DEFAULT_CHARTS_SECTIONS_EXPANDED
    ),
    chartsSubsectionsExpanded: [],
  });
  const ensureChartsDisclosureState = () => {
    dashboardState.chartsSectionsExpanded = {
      ...DEFAULT_CHARTS_SECTIONS_EXPANDED,
      ...(dashboardState.chartsSectionsExpanded && typeof dashboardState.chartsSectionsExpanded === 'object'
        ? dashboardState.chartsSectionsExpanded
        : {}),
    };
  };
  const setChartsSectionExpanded = (key, expanded) => {
    if (!CHARTS_SECTION_KEYS.includes(String(key || ''))) {
      return;
    }
    ensureChartsDisclosureState();
    dashboardState.chartsSectionsExpanded = {
      ...dashboardState.chartsSectionsExpanded,
      [key]: expanded === true,
    };
  };
  const applyChartsLoadingLayout = ({ isLoading, initialLoadPending }) => {
    if (!(selectors?.chartsMainFiltersPanel instanceof HTMLElement)) {
      return;
    }
    selectors.chartsMainFiltersPanel.hidden = Boolean(isLoading && initialLoadPending);
  };
  const persistChartsQuery = () => {
    const state = {
      chartPeriod: dashboardState.chartPeriod,
      chartYear: dashboardState.chartYear,
      arrival: dashboardState.chartFilters?.arrival,
      disposition: dashboardState.chartFilters?.disposition,
      cardType: dashboardState.chartFilters?.cardType,
      compareGmp: dashboardState.chartFilters?.compareGmp,
      heatmapMetric: dashboardState.heatmapMetric,
      heatmapArrival: dashboardState.heatmapFilters?.arrival,
      heatmapDisposition: dashboardState.heatmapFilters?.disposition,
      heatmapCardType: dashboardState.heatmapFilters?.cardType,
      heatmapYear: dashboardState.heatmapYear,
      hourlyWeekday: dashboardState.hourlyWeekday,
      hourlyStayBucket: dashboardState.hourlyStayBucket,
      hourlyMetric: dashboardState.hourlyMetric,
      hourlyDepartment: dashboardState.hourlyDepartment,
      hourlyCompareEnabled: dashboardState.hourlyCompareEnabled,
      hourlyCompareYearA: dashboardState.hourlyCompareYears?.[0] ?? null,
      hourlyCompareYearB: dashboardState.hourlyCompareYears?.[1] ?? null,
      hourlyCompareSeries: dashboardState.hourlyCompareSeries,
      hospitalYear: dashboardState.chartsHospitalTableYear,
      hospitalSort: dashboardState.chartsHospitalTableSort,
      hospitalSearch: dashboardState.chartsHospitalTableSearch,
      hospitalDepartment: dashboardState.chartsHospitalTableDepartment,
      chartsSectionsExpanded: getExpandedKeysFromMap(
        dashboardState.chartsSectionsExpanded,
        DEFAULT_CHARTS_SECTIONS_EXPANDED
      ),
      chartsSubsectionsExpanded: [],
    };
    replaceUrlQuery(serializeToQuery('charts', state, getChartsDefaults()));
  };
  const parsedChartsQuery = parseFromQuery('charts', window.location.search);
  const hadParsedChartsQuery = Object.keys(parsedChartsQuery).length > 0;
  if (hadParsedChartsQuery) {
    dashboardState.chartPeriod =
      Number.isFinite(parsedChartsQuery.chartPeriod) && parsedChartsQuery.chartPeriod >= 0
        ? parsedChartsQuery.chartPeriod
        : dashboardState.chartPeriod;
    dashboardState.chartYear = Number.isFinite(parsedChartsQuery.chartYear)
      ? parsedChartsQuery.chartYear
      : null;
    dashboardState.chartFilters = sanitizeChartFilters(
      {
        ...dashboardState.chartFilters,
        arrival: parsedChartsQuery.arrival ?? dashboardState.chartFilters.arrival,
        disposition: parsedChartsQuery.disposition ?? dashboardState.chartFilters.disposition,
        cardType: parsedChartsQuery.cardType ?? dashboardState.chartFilters.cardType,
        compareGmp:
          parsedChartsQuery.compareGmp != null
            ? parsedChartsQuery.compareGmp
            : dashboardState.chartFilters.compareGmp,
      },
      { getDefaultChartFilters: createDefaultChartFilters, KPI_FILTER_LABELS }
    );
    dashboardState.heatmapMetric = parsedChartsQuery.heatmapMetric || dashboardState.heatmapMetric;
    dashboardState.heatmapFilters = sanitizeHeatmapFilters({
      arrival: parsedChartsQuery.heatmapArrival ?? dashboardState.heatmapFilters.arrival,
      disposition: parsedChartsQuery.heatmapDisposition ?? dashboardState.heatmapFilters.disposition,
      cardType: parsedChartsQuery.heatmapCardType ?? dashboardState.heatmapFilters.cardType,
    });
    dashboardState.heatmapYear = Number.isFinite(parsedChartsQuery.heatmapYear)
      ? parsedChartsQuery.heatmapYear
      : null;
    dashboardState.hourlyWeekday =
      parsedChartsQuery.hourlyWeekday == null
        ? dashboardState.hourlyWeekday
        : parsedChartsQuery.hourlyWeekday;
    dashboardState.hourlyStayBucket =
      parsedChartsQuery.hourlyStayBucket == null
        ? dashboardState.hourlyStayBucket
        : parsedChartsQuery.hourlyStayBucket;
    dashboardState.hourlyMetric =
      parsedChartsQuery.hourlyMetric == null ? dashboardState.hourlyMetric : parsedChartsQuery.hourlyMetric;
    dashboardState.hourlyDepartment =
      parsedChartsQuery.hourlyDepartment == null
        ? dashboardState.hourlyDepartment
        : parsedChartsQuery.hourlyDepartment;
    dashboardState.hourlyCompareEnabled = Boolean(parsedChartsQuery.hourlyCompareEnabled);
    dashboardState.hourlyCompareYears = [
      parsedChartsQuery.hourlyCompareYearA,
      parsedChartsQuery.hourlyCompareYearB,
    ].filter((year) => Number.isFinite(year));
    dashboardState.hourlyCompareSeries =
      parsedChartsQuery.hourlyCompareSeries == null
        ? dashboardState.hourlyCompareSeries
        : parsedChartsQuery.hourlyCompareSeries;
    dashboardState.chartsHospitalTableYear =
      parsedChartsQuery.hospitalYear == null ? 'all' : parsedChartsQuery.hospitalYear;
    dashboardState.chartsHospitalTableSort =
      parsedChartsQuery.hospitalSort == null
        ? dashboardState.chartsHospitalTableSort
        : parsedChartsQuery.hospitalSort;
    dashboardState.chartsHospitalTableSearch = parsedChartsQuery.hospitalSearch || '';
    dashboardState.chartsHospitalTableDepartment = parsedChartsQuery.hospitalDepartment || '';
    const parsedSectionKeys = normalizeChartsSectionExpandedKeys(parsedChartsQuery.chartsSectionsExpanded);
    const legacySubsectionKeys = (
      Array.isArray(parsedChartsQuery.chartsSubsectionsExpanded)
        ? parsedChartsQuery.chartsSubsectionsExpanded
        : []
    )
      .map((value) => String(value || '').trim())
      .filter((value) => ['overview', 'hourly', 'heatmap'].includes(value));
    const expandedKeys = new Set(parsedSectionKeys);
    if (
      (Array.isArray(parsedChartsQuery.chartsSectionsExpanded)
        ? parsedChartsQuery.chartsSectionsExpanded
        : []
      ).includes('main')
    ) {
      expandedKeys.add('overview');
    }
    legacySubsectionKeys.forEach((key) => {
      expandedKeys.add(key);
    });
    if (
      (Array.isArray(parsedChartsQuery.chartsSectionsExpanded)
        ? parsedChartsQuery.chartsSectionsExpanded
        : []
      ).includes('hospital')
    ) {
      expandedKeys.add('hospital');
    }
    dashboardState.chartsSectionsExpanded = buildChartsExpandedMap(
      Array.from(expandedKeys),
      DEFAULT_CHARTS_SECTIONS_EXPANDED
    );
    dashboardState.chartsSubsectionsExpanded = [];
  }
  ensureChartsDisclosureState();
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

  const formatDailyCaption = (period) => {
    const base = String(TEXT.charts.dailyCaption || 'Kasdieniai pacientu srautai')
      .replace(/\s*\([^)]*\)\s*$/u, '')
      .trim();
    const normalized = Number.isFinite(period) ? Math.round(period) : null;
    if (normalized === 365) return `${base} (menesine dinamika)`;
    if (normalized === 0) return `${base} (visas laikotarpis)`;
    if (!Number.isFinite(period) || period < 0) return base;
    return `${base} (paskutines ${numberFormatter.format(normalized)} dienos)`;
  };

  const getHeatmapMetricDefinition = (metricKey) => {
    const key = typeof metricKey === 'string' ? metricKey.trim() : '';
    if (!key) {
      return null;
    }
    return getMetricById(key);
  };

  const getHeatmapMetricLabel = (metricKey) => {
    const definition = getHeatmapMetricDefinition(metricKey);
    const baseCatalogLabel = getMetricSurfaceMeta(definition, 'heatmap')?.label || definition?.label || '';
    const catalogLabel = getMetricLabelOverride(settings, metricKey, baseCatalogLabel);
    if (typeof catalogLabel === 'string' && catalogLabel.trim()) {
      return catalogLabel;
    }
    const options = TEXT.charts?.heatmapMetricOptions || {};
    if (typeof options[metricKey] === 'string' && options[metricKey].trim()) {
      return options[metricKey];
    }
    if (typeof metricKey === 'string' && metricKey.trim()) {
      return metricKey.trim();
    }
    const fallbackKey = getDefaultHeatmapMetric();
    return typeof options[fallbackKey] === 'string' ? options[fallbackKey] : 'Rodiklis';
  };

  const getHeatmapMetricUnit = (metricKey) => {
    const definition = getHeatmapMetricDefinition(metricKey);
    const catalogUnit = getMetricSurfaceMeta(definition, 'heatmap')?.unit || definition?.unit || '';
    if (typeof catalogUnit === 'string' && catalogUnit.trim()) {
      return catalogUnit;
    }
    const units = TEXT.charts?.heatmapMetricUnits || {};
    return typeof units[metricKey] === 'string' ? units[metricKey] : '';
  };

  const getHeatmapMetricDescription = (metricKey) => {
    const definition = getHeatmapMetricDefinition(metricKey);
    const catalogDescription =
      getMetricSurfaceMeta(definition, 'heatmap')?.description || definition?.description;
    if (typeof catalogDescription === 'string' && catalogDescription.trim()) {
      return catalogDescription;
    }
    const descriptions = TEXT.charts?.heatmapMetricDescriptions || {};
    return typeof descriptions[metricKey] === 'string' ? descriptions[metricKey] : '';
  };

  const hasHeatmapMetricData = (metric) => {
    if (!metric || typeof metric !== 'object') {
      return false;
    }
    if (metric.hasData) {
      return true;
    }
    const matrix = Array.isArray(metric.matrix) ? metric.matrix : [];
    return matrix.some(
      (row) => Array.isArray(row) && row.some((value) => Number.isFinite(value) && value > 0)
    );
  };

  const normalizeHeatmapMetricKey = (metricKey, metrics = {}) => {
    const enabledKeys = getEnabledHeatmapMetricKeys();
    const hasMetrics = metrics && typeof metrics === 'object' && Object.keys(metrics).length > 0;
    if (typeof metricKey === 'string' && enabledKeys.includes(metricKey)) {
      if (!hasMetrics || metrics[metricKey]) {
        return metricKey;
      }
    }
    if (hasMetrics) {
      const available = enabledKeys.find((key) => metrics[key]);
      if (available) {
        return available;
      }
    }
    if (typeof metricKey === 'string' && enabledKeys.includes(metricKey)) {
      return metricKey;
    }
    return getDefaultHeatmapMetric();
  };

  const formatHeatmapMetricValue = (value) => {
    if (!Number.isFinite(value)) {
      return '0,0';
    }
    return oneDecimalFormatter.format(value);
  };

  const computeHeatmapColor = (accentColor, intensity) => {
    const alpha = Math.min(0.85, Math.max(0.08, 0.08 + intensity * 0.75));
    const normalized = String(accentColor || '').trim();
    const hexMatch = /^#?([a-f\d]{6})$/i.exec(normalized);
    if (hexMatch) {
      const numeric = Number.parseInt(hexMatch[1], 16);
      const r = (numeric >> 16) & 255;
      const g = (numeric >> 8) & 255;
      const b = numeric & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
    }
    const rgbMatch = normalized.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbMatch) {
      const [, r, g, b] = rgbMatch;
      return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
    }
    return `rgba(37, 99, 235, ${alpha.toFixed(3)})`;
  };

  const updateHeatmapCaption = (metricKey) => {
    if (!selectors.heatmapCaption) {
      return;
    }
    const label = getHeatmapMetricLabel(metricKey);
    selectors.heatmapCaption.textContent =
      typeof TEXT.charts?.heatmapCaption === 'function'
        ? TEXT.charts.heatmapCaption(label)
        : TEXT.charts?.heatmapCaption || '';
  };

  const populateHeatmapMetricOptions = () => {
    if (!selectors.heatmapMetricSelect) {
      return;
    }
    selectors.heatmapMetricSelect.replaceChildren();
    getEnabledHeatmapMetricKeys().forEach((key) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = getHeatmapMetricLabel(key);
      selectors.heatmapMetricSelect.appendChild(option);
    });
    selectors.heatmapMetricSelect.value = normalizeHeatmapMetricKey(dashboardState.heatmapMetric);
  };

  const syncHeatmapFilterControls = () => {
    const filters = sanitizeHeatmapFilters(dashboardState.heatmapFilters);
    dashboardState.heatmapFilters = { ...filters };
    if (selectors.heatmapFilterArrival) {
      selectors.heatmapFilterArrival.value = filters.arrival;
    }
    if (selectors.heatmapFilterDisposition) {
      selectors.heatmapFilterDisposition.value = filters.disposition;
    }
    if (selectors.heatmapFilterCardType) {
      selectors.heatmapFilterCardType.value = filters.cardType;
    }
    if (selectors.heatmapYearSelect) {
      selectors.heatmapYearSelect.value = Number.isFinite(dashboardState.heatmapYear)
        ? String(dashboardState.heatmapYear)
        : 'all';
    }
  };

  const populateHeatmapYearOptions = (dailyStats) => {
    if (!selectors.heatmapYearSelect) {
      return;
    }
    const years = getAvailableYearsFromDaily(dailyStats);
    selectors.heatmapYearSelect.replaceChildren();
    const all = document.createElement('option');
    all.value = 'all';
    all.textContent = TEXT.charts?.heatmapYearAll || 'Visi metai';
    selectors.heatmapYearSelect.appendChild(all);
    years.forEach((year) => {
      const option = document.createElement('option');
      option.value = String(year);
      option.textContent = String(year);
      selectors.heatmapYearSelect.appendChild(option);
    });
    selectors.heatmapYearSelect.value = Number.isFinite(dashboardState.heatmapYear)
      ? String(dashboardState.heatmapYear)
      : 'all';
  };

  const computeHeatmapDataForFilters = () => {
    dashboardState.heatmapFilters = sanitizeHeatmapFilters(dashboardState.heatmapFilters);
    return resolveCachedHeatmapFilterData({
      chartData: dashboardState.chartData,
      rawRecords: dashboardState.rawRecords,
      heatmapYear: dashboardState.heatmapYear,
      heatmapFilters: dashboardState.heatmapFilters,
      filterRecordsByYearFn: filterRecordsByYear,
      filterRecordsByHeatmapFiltersFn: filterRecordsByHeatmapFilters,
      computeArrivalHeatmapFn: computeArrivalHeatmap,
    });
  };

  const markChartsSectionVisible = (section, { scheduleSecondary = false, reason = 'interaction' } = {}) => {
    const key =
      section === 'heatmap'
        ? 'heatmapVisible'
        : section === 'hourly'
          ? 'hourlyVisible'
          : section === 'hospital'
            ? 'hospitalVisible'
            : null;
    if (!key) {
      return false;
    }
    const previousFlags = dashboardState.chartsSectionRenderFlags || {};
    const changed = !previousFlags[key];
    if (changed) {
      dashboardState.chartsSectionRenderFlags = {
        ...previousFlags,
        [key]: true,
      };
    }
    if (
      (section === 'heatmap' || section === 'hourly') &&
      dashboardState.chartsSecondaryVisibilityObserver &&
      dashboardState.chartsSectionRenderFlags?.heatmapVisible &&
      dashboardState.chartsSectionRenderFlags?.hourlyVisible
    ) {
      dashboardState.chartsSecondaryVisibilityObserver.disconnect();
      dashboardState.chartsSecondaryVisibilityObserver = null;
    }
    if (scheduleSecondary) {
      scheduleChartsSecondaryRender({ reason });
    }
    return changed;
  };

  const applyChartsSectionDisclosure = ({ reason = 'state-sync', triggerRender = false } = {}) => {
    ensureChartsDisclosureState();
    const sectionExpanded = dashboardState.chartsSectionsExpanded || DEFAULT_CHARTS_SECTIONS_EXPANDED;

    (Array.isArray(selectors?.chartsSectionPanels) ? selectors.chartsSectionPanels : []).forEach((panel) => {
      if (!(panel instanceof HTMLElement)) {
        return;
      }
      const key = String(panel.getAttribute('data-charts-section-panel') || '').trim();
      if (!CHARTS_SECTION_KEYS.includes(key)) {
        return;
      }
      panel.hidden = sectionExpanded[key] !== true;
    });
    (Array.isArray(selectors?.chartsSectionToggleButtons)
      ? selectors.chartsSectionToggleButtons
      : []
    ).forEach((button) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      const key = String(button.getAttribute('data-charts-section-toggle') || '').trim();
      if (!CHARTS_SECTION_KEYS.includes(key)) {
        return;
      }
      const expanded = sectionExpanded[key] === true;
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      button.classList.toggle('is-expanded', expanded);
    });

    if (!triggerRender) {
      return;
    }
    if (sectionExpanded.hospital === true) {
      dashboardState.chartsSectionRenderFlags = {
        ...(dashboardState.chartsSectionRenderFlags || {}),
        hospitalVisible: true,
      };
      if (Array.isArray(dashboardState.rawRecords) && dashboardState.rawRecords.length) {
        renderChartsHospitalTable(dashboardState.rawRecords, { force: true });
      }
    }
    const shouldRenderHourly = sectionExpanded.hourly === true;
    const shouldRenderHeatmap = sectionExpanded.heatmap === true;
    let shouldScheduleSecondary = false;
    if (shouldRenderHourly) {
      shouldScheduleSecondary = markChartsSectionVisible('hourly') || shouldScheduleSecondary;
    }
    if (shouldRenderHeatmap) {
      shouldScheduleSecondary = markChartsSectionVisible('heatmap') || shouldScheduleSecondary;
    }
    if (shouldScheduleSecondary) {
      scheduleChartsSecondaryRender({ reason });
    }
  };

  const applyHeatmapFiltersAndRender = () => {
    markChartsSectionVisible('heatmap');
    const palette = getThemePalette();
    renderArrivalHeatmap(
      selectors.heatmapContainer,
      computeHeatmapDataForFilters(),
      palette.accent,
      dashboardState.heatmapMetric
    );
  };

  const handleHeatmapMetricChange = (event) => {
    markChartsSectionVisible('heatmap');
    dashboardState.heatmapMetric = normalizeHeatmapMetricKey(event?.target?.value);
    updateHeatmapCaption(dashboardState.heatmapMetric);
    persistChartsQuery();
    const palette = getThemePalette();
    const currentData = dashboardState.chartData?.heatmap || computeHeatmapDataForFilters();
    renderArrivalHeatmap(
      selectors.heatmapContainer,
      currentData,
      palette.accent,
      dashboardState.heatmapMetric
    );
  };

  const handleHeatmapFilterChange = (event) => {
    const target = event?.target;
    if (!target || !('name' in target)) {
      return;
    }
    const { name, value } = target;
    const filters = { ...dashboardState.heatmapFilters };
    if (name === 'heatmapArrival' && value in KPI_FILTER_LABELS.arrival) {
      filters.arrival = value;
    } else if (name === 'heatmapDisposition' && value in KPI_FILTER_LABELS.disposition) {
      filters.disposition = value;
    } else if (name === 'heatmapCardType' && value in KPI_FILTER_LABELS.cardType) {
      filters.cardType = value;
    } else if (name === 'heatmapYear') {
      dashboardState.heatmapYear = value === 'all' ? null : Number.parseInt(value, 10);
    }
    dashboardState.heatmapFilters = sanitizeHeatmapFilters(filters);
    syncHeatmapFilterControls();
    persistChartsQuery();
    applyHeatmapFiltersAndRender();
  };

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

  const updateDailyPeriodSummary = (dailyStats) => {
    if (!selectors.dailyCaptionContext) {
      return;
    }
    const entries = Array.isArray(dailyStats)
      ? dailyStats.filter((entry) => entry && typeof entry.date === 'string')
      : [];
    if (!entries.length) {
      selectors.dailyCaptionContext.textContent = '';
      return;
    }
    const dates = entries
      .map((entry) => dateKeyToDate(entry.date))
      .filter((date) => date instanceof Date && !Number.isNaN(date.getTime()));
    if (!dates.length) {
      selectors.dailyCaptionContext.textContent = '';
      return;
    }
    const startDate = new Date(Math.min(...dates.map((date) => date.getTime())));
    const endDate = new Date(Math.max(...dates.map((date) => date.getTime())));
    const startLabel = shortDateFormatter.format(startDate);
    const endLabel = shortDateFormatter.format(endDate);
    selectors.dailyCaptionContext.textContent =
      startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
  };

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

  const isValidHeatmapData = (heatmapData) =>
    Boolean(
      heatmapData?.metrics &&
        getEnabledHeatmapMetricKeys().some((key) => Array.isArray(heatmapData.metrics[key]?.matrix))
    );
  const renderArrivalHeatmap = (container, heatmapData, accentColor, metricKey) => {
    if (!container) return;
    container.replaceChildren();
    const metrics = heatmapData && typeof heatmapData === 'object' ? heatmapData.metrics || {} : {};
    let selectedMetric = normalizeHeatmapMetricKey(metricKey, metrics);
    if (!metrics[selectedMetric]) {
      selectedMetric = normalizeHeatmapMetricKey(getDefaultHeatmapMetric(), metrics);
    }
    if (selectors.heatmapMetricSelect) {
      selectors.heatmapMetricSelect.value = selectedMetric;
    }
    updateHeatmapCaption(selectedMetric);
    const metric = metrics[selectedMetric] || {};
    const _matrix = Array.isArray(metric.matrix) ? metric.matrix : [];
    const countsMatrix = Array.isArray(metric.counts) ? metric.counts : [];
    const hasData = hasHeatmapMetricData(metric);
    const captionText = selectors.heatmapCaption?.textContent || '';
    const metricLabel = getHeatmapMetricLabel(selectedMetric);
    if (metricLabel && captionText) {
      container.setAttribute('aria-label', `${metricLabel}. ${captionText}`);
    } else {
      container.removeAttribute('aria-label');
    }
    setDatasetValue(container, 'metric', selectedMetric);
    if (!hasData) {
      const empty = document.createElement('p');
      empty.className = 'heatmap-empty';
      empty.textContent = TEXT.charts?.heatmapEmpty || 'Siuo metu nera duomenu.';
      container.appendChild(empty);
      return;
    }
    const table = document.createElement('table');
    table.className = 'heatmap-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.setAttribute('scope', 'col');
    corner.textContent = '';
    headerRow.appendChild(corner);
    HEATMAP_HOURS.forEach((label) => {
      const th = document.createElement('th');
      th.setAttribute('scope', 'col');
      th.textContent = label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    metric.matrix.forEach((rowValues, dayIdx) => {
      const tr = document.createElement('tr');
      const head = document.createElement('th');
      head.setAttribute('scope', 'row');
      head.textContent = HEATMAP_WEEKDAY_SHORT[dayIdx] || '';
      tr.appendChild(head);
      rowValues.forEach((value, hourIdx) => {
        const numericValue = Number.isFinite(value) ? value : 0;
        const td = document.createElement('td');
        const span = document.createElement('span');
        span.className = 'heatmap-cell';
        const intensity = metric.max > 0 ? numericValue / metric.max : 0;
        const color =
          intensity > 0 ? computeHeatmapColor(accentColor, intensity) : 'var(--color-surface-alt)';
        span.style.backgroundColor = color;
        span.style.color =
          intensity > 0.55 ? '#fff' : intensity > 0 ? 'var(--color-text)' : 'var(--color-text-muted)';
        const durationSamples = Array.isArray(countsMatrix?.[dayIdx]) ? countsMatrix[dayIdx][hourIdx] : 0;
        const hasCellData =
          selectedMetric === 'avgDuration'
            ? Number.isFinite(durationSamples) && durationSamples > 0
            : numericValue > 0;
        const formattedValue = formatHeatmapMetricValue(numericValue);
        span.textContent = hasCellData ? formattedValue : '';
        span.tabIndex = hasCellData ? 0 : -1;
        const descriptor = getHeatmapMetricDescription(selectedMetric);
        const tooltipValue = hasCellData ? formattedValue : formatHeatmapMetricValue(0);
        const tooltip = `${HEATMAP_WEEKDAY_FULL[dayIdx] || ''}, ${HEATMAP_HOURS[hourIdx]} – ${tooltipValue}${descriptor ? ` ${descriptor}` : ''}`;
        td.setAttribute('aria-label', tooltip);
        span.setAttribute('title', tooltip);
        td.appendChild(span);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    const legend = document.createElement('p');
    legend.className = 'heatmap-legend';
    const unit = getHeatmapMetricUnit(selectedMetric);
    const legendLabel = TEXT.charts?.heatmapMetricLabel || 'Rodiklis';
    const legendBase = TEXT.charts?.heatmapLegend || '';
    const metricInfo = `${legendLabel}: ${metricLabel}${unit ? ` (${unit})` : ''}.`;
    legend.textContent = legendBase ? `${metricInfo} ${legendBase}` : metricInfo;
    container.appendChild(legend);
  };

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

  const dispatchChartsLifecycleEvent = (name, detail = {}) => {
    if (typeof window?.dispatchEvent !== 'function' || typeof window?.CustomEvent !== 'function') {
      return;
    }
    window.dispatchEvent(new CustomEvent(name, { detail }));
  };

  const markChartsPerfPoint = (name) => {
    if (typeof performance?.mark !== 'function') {
      return;
    }
    try {
      performance.mark(name);
    } catch (_error) {
      // ignore
    }
  };

  const ensureChartsHospitalVisibilityObserver = () => {
    if (!(selectors.chartsHospitalTableRoot instanceof HTMLElement)) {
      return;
    }
    if (dashboardState.chartsHospitalTableVisibilityObserver) {
      return;
    }
    if (typeof window.IntersectionObserver !== 'function') {
      dashboardState.chartsSectionRenderFlags = {
        ...(dashboardState.chartsSectionRenderFlags || {}),
        hospitalVisible: true,
      };
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0);
        if (!visible) {
          return;
        }
        dashboardState.chartsSectionRenderFlags = {
          ...(dashboardState.chartsSectionRenderFlags || {}),
          hospitalVisible: true,
        };
        renderChartsHospitalTable(dashboardState.rawRecords, { force: true });
        if (dashboardState.chartsHospitalTableVisibilityObserver) {
          dashboardState.chartsHospitalTableVisibilityObserver.disconnect();
          dashboardState.chartsHospitalTableVisibilityObserver = null;
        }
      },
      { root: null, rootMargin: '200px 0px', threshold: [0, 0.01] }
    );
    observer.observe(selectors.chartsHospitalTableRoot);
    dashboardState.chartsHospitalTableVisibilityObserver = observer;
  };

  const ensureChartsSecondaryVisibilityObserver = () => {
    const heatmapTarget = selectors.heatmapContainer;
    const hourlyTarget = document.getElementById('hourlyChart');
    if (
      dashboardState.chartsSectionRenderFlags?.heatmapVisible &&
      dashboardState.chartsSectionRenderFlags?.hourlyVisible
    ) {
      return;
    }
    if (!(heatmapTarget instanceof HTMLElement) && !(hourlyTarget instanceof HTMLElement)) {
      return;
    }
    if (dashboardState.chartsSecondaryVisibilityObserver) {
      return;
    }
    if (typeof window.IntersectionObserver !== 'function') {
      dashboardState.chartsSectionRenderFlags = {
        ...(dashboardState.chartsSectionRenderFlags || {}),
        heatmapVisible: true,
        hourlyVisible: true,
      };
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        let didReveal = false;
        for (const entry of entries) {
          if (!(entry.isIntersecting || entry.intersectionRatio > 0)) {
            continue;
          }
          if (entry.target === heatmapTarget) {
            didReveal = markChartsSectionVisible('heatmap') || didReveal;
          } else if (entry.target === hourlyTarget) {
            didReveal = markChartsSectionVisible('hourly') || didReveal;
          }
        }
        if (didReveal) {
          scheduleChartsSecondaryRender({ reason: 'visibility' });
        }
      },
      { root: null, rootMargin: '200px 0px', threshold: [0, 0.01] }
    );
    if (heatmapTarget instanceof HTMLElement) {
      observer.observe(heatmapTarget);
    }
    if (hourlyTarget instanceof HTMLElement) {
      observer.observe(hourlyTarget);
    }
    dashboardState.chartsSecondaryVisibilityObserver = observer;
  };

  const scheduleChartsSecondaryRender = ({ reason = 'runtime' } = {}) => {
    const interactiveReason =
      reason === 'visibility' ||
      reason === 'section-toggle' ||
      reason === 'jump-nav' ||
      reason === 'interaction';
    const secondaryTimeout = interactiveReason ? 80 : 1200;
    const hospitalTimeout = interactiveReason ? 120 : 2000;
    dashboardState.chartsDeferredRenderToken = Number(dashboardState.chartsDeferredRenderToken || 0) + 1;
    const token = dashboardState.chartsDeferredRenderToken;
    dashboardState.chartsDeferredRenderReason = reason;
    if (dashboardState.chartsSecondaryRenderScheduled) {
      return;
    }
    dashboardState.chartsSecondaryRenderScheduled = true;
    runAfterDomAndIdle(
      async () => {
        dashboardState.chartsSecondaryRenderScheduled = false;
        if (token !== dashboardState.chartsDeferredRenderToken) {
          scheduleChartsSecondaryRender({
            reason: dashboardState.chartsDeferredRenderReason || reason,
          });
          return;
        }
        ensureChartsSecondaryVisibilityObserver();
        const sectionFlags = dashboardState.chartsSectionRenderFlags || {};
        const renderHeatmap = Boolean(sectionFlags.heatmapVisible);
        const renderHourly = Boolean(sectionFlags.hourlyVisible);
        if (!renderHeatmap && !renderHourly) {
          return;
        }
        const secondaryPerfHandle =
          runtimeClient?.perfMonitor?.start?.('charts-secondary-render', { priežastis: reason }) || null;
        await chartRenderers.renderChartsSecondary({
          heatmapData: renderHeatmap ? computeHeatmapDataForFilters() : null,
          allowReuse: true,
          renderHeatmap,
          renderHourly,
        });
        runtimeClient?.perfMonitor?.finish?.(secondaryPerfHandle, { priežastis: reason });
        const updatedFlags = dashboardState.chartsSectionRenderFlags || {};
        const secondaryComplete = Boolean(updatedFlags.heatmapRendered && updatedFlags.hourlyRendered);
        dashboardState.chartsStartupPhases = {
          ...(dashboardState.chartsStartupPhases || {}),
          secondaryComplete,
        };
        if (secondaryComplete) {
          markChartsPerfPoint('app-charts-secondary-complete');
          dispatchChartsLifecycleEvent('app:charts-secondary-complete', {
            reason,
          });
        }
        if (dashboardState.chartsHospitalRenderScheduled) {
          return;
        }
        dashboardState.chartsHospitalRenderScheduled = true;
        runAfterDomAndIdle(
          () => {
            dashboardState.chartsHospitalRenderScheduled = false;
            if (token !== dashboardState.chartsDeferredRenderToken) {
              return;
            }
            ensureChartsHospitalVisibilityObserver();
            if (dashboardState.chartsSectionRenderFlags?.hospitalVisible) {
              const hospitalPerfHandle =
                runtimeClient?.perfMonitor?.start?.('charts-hospital-table-render', { priežastis: reason }) ||
                null;
              renderChartsHospitalTable(dashboardState.rawRecords, { force: true });
              runtimeClient?.perfMonitor?.finish?.(hospitalPerfHandle, { priežastis: reason });
            }
          },
          { timeout: hospitalTimeout }
        );
      },
      { timeout: secondaryTimeout }
    );
  };

  const handleChartsPrimaryVisible = () => {
    if (dashboardState.chartsStartupPhases?.primaryVisible) {
      return;
    }
    dashboardState.chartsStartupPhases = {
      ...(dashboardState.chartsStartupPhases || {}),
      primaryVisible: true,
    };
    dashboardState.chartsFirstVisibleAt = Date.now();
    markChartsPerfPoint('app-charts-primary-visible');
    dispatchChartsLifecycleEvent('app:charts-primary-visible', {});
  };

  const persistAfter =
    (handler, { section = null } = {}) =>
    (...args) => {
      if (section) {
        markChartsSectionVisible(section);
      }
      const result = handler(...args);
      persistChartsQuery();
      return result;
    };

  const hourlyControlsWithPersistence = {
    ...hourlyControlsFeature,
    handleHourlyMetricClick: persistAfter(hourlyControlsFeature.handleHourlyMetricClick, {
      section: 'hourly',
    }),
    handleHourlyDepartmentInput: persistAfter(hourlyControlsFeature.handleHourlyDepartmentInput, {
      section: 'hourly',
    }),
    handleHourlyFilterChange: persistAfter(hourlyControlsFeature.handleHourlyFilterChange, {
      section: 'hourly',
    }),
    handleHourlyCompareToggle: persistAfter(hourlyControlsFeature.handleHourlyCompareToggle, {
      section: 'hourly',
    }),
    handleHourlyCompareYearsChange: persistAfter(hourlyControlsFeature.handleHourlyCompareYearsChange, {
      section: 'hourly',
    }),
    handleHourlyCompareSeriesClick: persistAfter(hourlyControlsFeature.handleHourlyCompareSeriesClick, {
      section: 'hourly',
    }),
    handleHourlyResetFilters: persistAfter(hourlyControlsFeature.handleHourlyResetFilters, {
      section: 'hourly',
    }),
    applyHourlyDepartmentSelection: persistAfter(hourlyControlsFeature.applyHourlyDepartmentSelection, {
      section: 'hourly',
    }),
  };

  const handleChartFiltersReset = () => {
    const defaults = getChartsDefaults();
    dashboardState.chartPeriod = defaults.chartPeriod;
    dashboardState.chartYear = defaults.chartYear;
    dashboardState.chartFilters = createDefaultChartFilters();
    dashboardState.heatmapMetric = defaults.heatmapMetric;
    dashboardState.heatmapFilters = sanitizeHeatmapFilters({
      arrival: defaults.heatmapArrival,
      disposition: defaults.heatmapDisposition,
      cardType: defaults.heatmapCardType,
    });
    dashboardState.heatmapYear = defaults.heatmapYear;
    dashboardState.hourlyWeekday = defaults.hourlyWeekday;
    dashboardState.hourlyStayBucket = defaults.hourlyStayBucket;
    dashboardState.hourlyMetric = defaults.hourlyMetric;
    dashboardState.hourlyDepartment = defaults.hourlyDepartment;
    dashboardState.hourlyCompareEnabled = defaults.hourlyCompareEnabled;
    dashboardState.hourlyCompareYears = [];
    dashboardState.hourlyCompareSeries = defaults.hourlyCompareSeries;
    dashboardState.chartsHospitalTableYear = defaults.hospitalYear;
    dashboardState.chartsHospitalTableSort = defaults.hospitalSort;
    dashboardState.chartsHospitalTableSearch = defaults.hospitalSearch;
    dashboardState.chartsHospitalTableDepartment = defaults.hospitalDepartment;
    if (selectors.chartsHospitalTableSearch instanceof HTMLInputElement) {
      selectors.chartsHospitalTableSearch.value = '';
    }
    chartFlow.syncChartFilterControls();
    syncChartPeriodButtons({ selectors, period: dashboardState.chartPeriod });
    syncChartYearControl({ selectors, dashboardState });
    populateHeatmapMetricOptions();
    updateHeatmapCaption(dashboardState.heatmapMetric);
    syncHeatmapFilterControls();
    hourlyControlsFeature.syncHourlyMetricButtons();
    hourlyControlsFeature.syncHourlyCompareControls();
    hourlyControlsFeature.syncHourlyDepartmentVisibility(dashboardState.hourlyMetric);
    hourlyControlsFeature.updateHourlyCaption(
      dashboardState.hourlyWeekday,
      dashboardState.hourlyStayBucket,
      dashboardState.hourlyMetric,
      dashboardState.hourlyDepartment
    );
    chartFlow.applyChartFilters();
    markChartsSectionVisible('heatmap');
    applyHeatmapFiltersAndRender();
    markChartsSectionVisible('hourly');
    hourlyControlsFeature.handleHourlyFilterChange();
    dashboardState.chartsSectionRenderFlags = {
      ...(dashboardState.chartsSectionRenderFlags || {}),
      hospitalVisible: true,
    };
    renderChartsHospitalTable(dashboardState.rawRecords, { force: true });
    persistChartsQuery();
  };

  const expandChartsForTarget = (target) => {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const targetId = String(target.id || '').trim();
    if (!targetId) {
      return;
    }
    if (targetId === 'chartsHospitalTableHeading') {
      setChartsSectionExpanded('hospital', true);
    } else if (targetId === 'chartsHourlyHeading') {
      setChartsSectionExpanded('hourly', true);
    } else if (targetId === 'chartsHeatmapHeading') {
      setChartsSectionExpanded('heatmap', true);
    } else if (targetId === 'chartHeading') {
      setChartsSectionExpanded('overview', true);
    } else if (target.closest?.('[data-charts-section-panel="hourly"]')) {
      setChartsSectionExpanded('hourly', true);
    } else if (target.closest?.('[data-charts-section-panel="heatmap"]')) {
      setChartsSectionExpanded('heatmap', true);
    } else if (target.closest?.('[data-charts-section-panel="overview"]')) {
      setChartsSectionExpanded('overview', true);
    } else if (target.closest?.('[data-charts-section-panel="hospital"]')) {
      setChartsSectionExpanded('hospital', true);
    }
    applyChartsSectionDisclosure({ reason: 'jump-nav', triggerRender: true });
    persistChartsQuery();
  };
  chartsJumpBeforeNavigate = expandChartsForTarget;
  if (String(window.location.hash || '').startsWith('#')) {
    const target = document.getElementById(String(window.location.hash).slice(1));
    if (target instanceof HTMLElement) {
      expandChartsForTarget(target);
    }
  }

  selectors.chartsSectionToggleButtons?.forEach((button) => {
    button.addEventListener('click', (event) => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const key = String(target.getAttribute('data-charts-section-toggle') || '').trim();
      if (!CHARTS_SECTION_KEYS.includes(key)) {
        return;
      }
      const current = dashboardState.chartsSectionsExpanded?.[key] === true;
      setChartsSectionExpanded(key, !current);
      applyChartsSectionDisclosure({ reason: 'section-toggle', triggerRender: true });
      persistChartsQuery();
    });
  });

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
