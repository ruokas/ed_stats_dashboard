import { renderLastShiftHourlyChartWithTheme } from '../../../charts/hourly.js';
import { createMainDataHandlers } from '../../../data/main-data.js';
import { computeDailyStats } from '../../../data/stats.js';
import { initKpiFilters } from '../../../events/kpi.js';
import { createKpiRenderer } from '../../../render/kpi.js';
import { createDashboardState } from '../../../state/dashboardState.js';
import { createSelectorsForPage } from '../../../state/selectors.js';
import { loadChartJs } from '../../../utils/chart-loader.js';
import { getDatasetValue, runAfterDomAndIdle, setDatasetValue } from '../../../utils/dom.js';
import {
  dailyDateFormatter,
  decimalFormatter,
  numberFormatter,
  oneDecimalFormatter,
  percentFormatter,
  shortDateFormatter,
  weekdayLongFormatter,
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
import { dateKeyToDate, dateKeyToUtc, filterDailyStatsByWindow } from '../chart-primitives.js';
import { createDataFlow } from '../data-flow.js';
import { applyTheme, getThemePalette, getThemeStyleTarget, initializeTheme } from '../features/theme.js';
import { parseFromQuery, replaceUrlQuery, serializeToQuery } from '../filters/query-codec.js';
import { resetToDefaults } from '../filters/reset.js';
import { sanitizePageFilters } from '../filters/sanitize.js';
import { sanitizeKpiFilters } from '../filters.js';
import { createKpiFlow } from '../kpi-flow.js';
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
  KPI_WINDOW_OPTION_BASE,
} from '../state.js';
import {
  createKpiRuntimeMetrics,
  escapeHtml,
  formatKpiValue,
  formatLocalDateKey,
  matchesSharedPatientFilters,
  toSentenceCase,
} from './kpi/runtime-metrics.js';
import { createRuntimeLifecycle } from './runtime-lifecycle.js';

const {
  runtimeClient,
  setStatus: baseSetStatus,
  getAutoRefreshTimerId,
  setAutoRefreshTimerId,
} = createRuntimeLifecycle({
  clientConfigKey: CLIENT_CONFIG_KEY,
  statusText: TEXT.status,
});

function showKpiSkeleton(selectors) {
  const grid = selectors.kpiGrid;
  if (!grid || getDatasetValue(grid, 'skeleton') === 'true') {
    return;
  }
  const template = document.getElementById('kpiSkeleton');
  grid.setAttribute('aria-busy', 'true');
  setDatasetValue(grid, 'skeleton', 'true');
  if (template instanceof HTMLTemplateElement) {
    grid.replaceChildren(template.content.cloneNode(true));
  } else {
    grid.replaceChildren();
  }
}

function hideKpiSkeleton(selectors) {
  const grid = selectors.kpiGrid;
  if (!grid) {
    return;
  }
  grid.removeAttribute('aria-busy');
  if (getDatasetValue(grid, 'skeleton') === 'true') {
    grid.replaceChildren();
  }
  setDatasetValue(grid, 'skeleton', null);
}

function showKpiHourlyChartSkeleton(selectors) {
  const chart = selectors.lastShiftHourlyChart;
  if (!chart) {
    return;
  }
  const card = chart.closest('.chart-card');
  if (!card) {
    return;
  }
  const skeleton = card.querySelector('.chart-card__skeleton');
  if (skeleton) {
    skeleton.hidden = false;
  }
  setDatasetValue(card, 'loading', 'true');
}

function hideKpiHourlyChartSkeleton(selectors) {
  const chart = selectors.lastShiftHourlyChart;
  if (!chart) {
    return;
  }
  const card = chart.closest('.chart-card');
  if (!card) {
    return;
  }
  const skeleton = card.querySelector('.chart-card__skeleton');
  if (skeleton) {
    skeleton.hidden = true;
  }
  setDatasetValue(card, 'loading', null);
}

function setChartCardMessage(element, message) {
  if (!element) {
    return;
  }
  const card = element.closest('.chart-card');
  if (!card) {
    return;
  }
  let messageEl = card.querySelector('.chart-card__message');
  if (!message || !String(message).trim().length) {
    if (messageEl) {
      messageEl.remove();
    }
    return;
  }
  if (!messageEl) {
    messageEl = document.createElement('div');
    messageEl.className = 'chart-card__message';
    messageEl.setAttribute('role', 'status');
    messageEl.setAttribute('aria-live', 'polite');
    card.appendChild(messageEl);
  }
  messageEl.hidden = false;
  messageEl.style.display = 'flex';
  messageEl.textContent = String(message);
}

function setStatus(selectors, dashboardState, type, details = '') {
  if (type !== 'loading' && type !== 'error' && dashboardState.usingFallback) {
    baseSetStatus(selectors, 'warning', TEXT.status.fallbackSuccess());
    return;
  }
  baseSetStatus(selectors, type, details);
}

export async function runKpiRuntime(core) {
  const pageId = core?.pageId || 'kpi';
  const pageConfig = core?.pageConfig || { kpi: true };
  const selectors = createSelectorsForPage(pageId);
  const settings = await loadSettingsFromConfig(DEFAULT_SETTINGS);
  const getDefaultKpiFilters = () =>
    createDefaultKpiFilters({ settings, DEFAULT_SETTINGS, DEFAULT_KPI_WINDOW_DAYS });
  const getDefaultChartFilters = () => createDefaultChartFilters();
  const getDefaultFeedbackFilters = () => createDefaultFeedbackFilters();
  const getDefaultHeatmapFilters = () => ({ arrival: 'all', disposition: 'all', cardType: 'all' });
  const dashboardState = createDashboardState({
    defaultChartFilters: getDefaultChartFilters,
    defaultKpiFilters: getDefaultKpiFilters,
    defaultFeedbackFilters: getDefaultFeedbackFilters,
    defaultHeatmapFilters: getDefaultHeatmapFilters,
    defaultHeatmapMetric: 'arrivals',
    hourlyMetricArrivals: 'arrivals',
    hourlyCompareSeriesAll: 'all',
  });
  const { buildYearMonthMetrics, buildLastShiftSummary } = createKpiRuntimeMetrics({
    dateKeyToDate,
    dateKeyToUtc,
    dailyDateFormatter,
    weekdayLongFormatter,
    shortDateFormatter,
    numberFormatter,
    text: TEXT,
  });
  const formatKpiValueBound = (value, format) =>
    formatKpiValue(value, format, { decimalFormatter, numberFormatter, oneDecimalFormatter });
  const persistKpiQuery = (nextState) => {
    const defaults = { ...getDefaultKpiFilters(), selectedDate: null };
    const query = serializeToQuery('kpi', nextState, defaults);
    replaceUrlQuery(query);
  };
  const parsedKpiQuery = parseFromQuery('kpi', window.location.search);
  const hadParsedKpiQuery = Object.keys(parsedKpiQuery).length > 0;
  if (Object.keys(parsedKpiQuery).length) {
    const normalized = sanitizePageFilters(
      'kpi',
      {
        ...parsedKpiQuery,
        window: parsedKpiQuery.window,
      },
      {
        getDefaultKpiFilters,
        KPI_FILTER_LABELS,
      }
    );
    const resetBase = resetToDefaults(
      'kpi',
      { ...getDefaultKpiFilters(), selectedDate: null },
      {
        getDefaultKpiFilters,
        KPI_FILTER_LABELS,
      }
    );
    dashboardState.kpi.filters = {
      ...dashboardState.kpi.filters,
      ...resetBase,
      window: normalized.window,
      shift: normalized.shift,
      arrival: normalized.arrival,
      disposition: normalized.disposition,
      cardType: normalized.cardType,
    };
    dashboardState.kpi.selectedDate =
      typeof parsedKpiQuery.selectedDate === 'string' && parsedKpiQuery.selectedDate.trim()
        ? parsedKpiQuery.selectedDate.trim()
        : null;
  }

  const { fetchData, runKpiWorkerJob, runKpiWorkerDetailJob } = createMainDataHandlers({
    settings,
    DEFAULT_SETTINGS,
    dashboardState,
    pageId,
    perfMonitor: runtimeClient.perfMonitor,
    downloadCsv,
    describeError: (error, options = {}) =>
      describeError(error, { ...options, fallbackMessage: TEXT.status.error }),
    createTextSignature,
    formatUrlForDiagnostics,
  });

  const kpiRenderer = createKpiRenderer({
    selectors,
    dashboardState,
    TEXT,
    escapeHtml,
    formatKpiValue: formatKpiValueBound,
    percentFormatter,
    buildYearMonthMetrics,
    buildLastShiftSummary,
    hideKpiSkeleton: () => hideKpiSkeleton(selectors),
    settings,
  });

  const renderLastShiftHourlyChartWithThemeBound = (seriesInfo) =>
    renderLastShiftHourlyChartWithTheme(
      {
        dashboardState,
        selectors,
        loadChartJs,
        getThemePalette,
        getThemeStyleTarget,
        setChartCardMessage,
        TEXT,
        HEATMAP_HOURS: Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, '0')}:00`),
        decimalFormatter,
        numberFormatter,
      },
      seriesInfo
    );

  const kpiFlow = createKpiFlow({
    selectors,
    dashboardState,
    TEXT,
    DEFAULT_SETTINGS,
    DEFAULT_KPI_WINDOW_DAYS,
    KPI_FILTER_LABELS,
    KPI_WINDOW_OPTION_BASE,
    getDefaultKpiFilters,
    sanitizeKpiFilters,
    getDatasetValue,
    setDatasetValue,
    weekdayLongFormatter,
    dateKeyToDate,
    formatLocalDateKey,
    computeDailyStats,
    filterDailyStatsByWindow,
    matchesSharedPatientFilters,
    describeError: (error, options = {}) =>
      describeError(error, { ...options, fallbackMessage: TEXT.status.error }),
    showKpiSkeleton: () => showKpiSkeleton(selectors),
    hideKpiSkeleton: () => hideKpiSkeleton(selectors),
    renderKpis: (dailyStats, referenceDailyStats) => kpiRenderer.renderKpis(dailyStats, referenceDailyStats),
    renderLastShiftHourlyChartWithTheme: renderLastShiftHourlyChartWithThemeBound,
    showLastShiftHourlyLoading: () => showKpiHourlyChartSkeleton(selectors),
    hideLastShiftHourlyLoading: () => hideKpiHourlyChartSkeleton(selectors),
    setChartCardMessage,
    getSettings: () => settings,
    runKpiWorkerJob,
    runKpiWorkerDetailJob,
    buildLastShiftSummary,
    toSentenceCase,
    onKpiStateChange: persistKpiQuery,
  });

  const dataFlow = createDataFlow({
    pageConfig,
    selectors,
    dashboardState,
    TEXT,
    DEFAULT_SETTINGS,
    AUTO_REFRESH_INTERVAL_MS,
    uiHooks: {
      runAfterDomAndIdle,
      setDatasetValue,
      setStatus: (type, details) => setStatus(selectors, dashboardState, type, details),
      getSettings: () => settings,
      getClientConfig: runtimeClient.getClientConfig,
      getAutoRefreshTimerId,
      setAutoRefreshTimerId,
    },
    kpiHooks: {
      showKpiSkeleton: () => showKpiSkeleton(selectors),
      syncKpiFilterControls: kpiFlow.syncKpiFilterControls,
      applyKpiFiltersAndRender: kpiFlow.applyKpiFiltersAndRender,
      initializeDefaultWindow: (windowDays) => {
        dashboardState.kpi.filters.window = windowDays;
        kpiFlow.syncKpiFilterControls();
      },
    },
    dataHooks: {
      fetchData,
      fetchProfile: 'daily-lite',
      supportsDeferredFullRecordsHydration: true,
      requiresFullRecordsForInteractions: true,
      perfMonitor: runtimeClient.perfMonitor,
      describeCacheMeta,
      describeError: (error, options = {}) =>
        describeError(error, { ...options, fallbackMessage: TEXT.status.error }),
      computeDailyStats,
      filterDailyStatsByWindow,
    },
  });

  applyCommonPageShellText({ selectors, settings, text: TEXT, defaultFooterSource: DEFAULT_FOOTER_SOURCE });
  if (selectors.kpiHeading) {
    selectors.kpiHeading.textContent = settings?.output?.kpiTitle || TEXT.kpis.title;
  }
  if (selectors.kpiSubtitle) {
    selectors.kpiSubtitle.textContent = settings?.output?.kpiSubtitle || TEXT.kpis.subtitle;
  }
  setupSharedPageUi({
    selectors,
    dashboardState,
    initializeTheme,
    applyTheme,
    themeStorageKey: THEME_STORAGE_KEY,
    onThemeChange: () => {
      if (dashboardState.kpi?.lastShiftHourly) {
        renderLastShiftHourlyChartWithThemeBound(dashboardState.kpi.lastShiftHourly).catch((error) => {
          const info = describeError(error, { code: 'LAST_SHIFT_THEME', fallbackMessage: TEXT.status.error });
          console.error(info.log, error);
        });
      }
    },
  });
  initKpiFilters({
    selectors,
    dashboardState,
    ...kpiFlow,
  });

  runtimeClient.updateClientConfig({ pageId });
  void loadChartJs();
  dataFlow.scheduleInitialLoad();
  if (!hadParsedKpiQuery) {
    persistKpiQuery({
      ...(dashboardState.kpi?.filters || {}),
      selectedDate: dashboardState.kpi?.selectedDate || null,
    });
  }
}

export const runKpiPage = runKpiRuntime;
