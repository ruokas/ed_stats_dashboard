import { createSelectorsForPage } from '../../../state/selectors.js';
import { createDashboardState } from '../../../state/dashboardState.js';
import { createFeedbackHandlers } from '../../../data/feedback.js';
import { createDataFlow } from '../data-flow.js';
import { createFeedbackPanelFeature } from '../features/feedback-panel.js';
import { createFeedbackRenderFeature } from '../features/feedback-render.js';
import { loadSettingsFromConfig } from '../settings.js';
import { applyTheme, getThemePalette, getThemeStyleTarget, initializeTheme } from '../features/theme.js';
import { initFeedbackFilters, initFeedbackTableScrollAffordance, initFeedbackTrendControls } from '../../../events/feedback.js';
import { renderFeedbackTrendChart as renderFeedbackTrendChartModule } from '../../../charts/feedback-trend.js';
import { loadChartJs } from '../../../utils/chart-loader.js';
import { getDatasetValue, runAfterDomAndIdle, setDatasetValue } from '../../../utils/dom.js';
import {
  capitalizeSentence,
  decimalFormatter,
  monthFormatter,
  numberFormatter,
  oneDecimalFormatter,
  percentFormatter,
  statusTimeFormatter,
  textCollator,
} from '../../../utils/format.js';
import { describeCacheMeta, describeError, downloadCsv } from '../network.js';
import { FEEDBACK_FILTER_ALL, FEEDBACK_FILTER_MISSING, createDefaultChartFilters, createDefaultFeedbackFilters, createDefaultKpiFilters } from '../state.js';
import {
  AUTO_REFRESH_INTERVAL_MS,
  CLIENT_CONFIG_KEY,
  DEFAULT_FOOTER_SOURCE,
  DEFAULT_KPI_WINDOW_DAYS,
  FEEDBACK_LEGACY_MAX,
  FEEDBACK_RATING_MAX,
  FEEDBACK_RATING_MIN,
  TEXT,
  THEME_STORAGE_KEY,
} from '../../constants.js';
import { DEFAULT_SETTINGS } from '../../default-settings.js';
import { applyCommonPageShellText, setupSharedPageUi } from '../page-ui.js';
import { resolveRuntimeMode } from '../runtime-mode.js';
import { createRuntimeClientContext } from '../runtime-client.js';
import { createStatusSetter, matchesWildcard, parseCandidateList } from '../utils/common.js';
import { setupCopyExportControls } from '../export-controls.js';
import { runLegacyFallback } from '../legacy-fallback.js';

const runtimeClient = createRuntimeClientContext(CLIENT_CONFIG_KEY);
let autoRefreshTimerId = null;
const setStatus = createStatusSetter(TEXT.status);

function formatLocalDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMonthLabel(monthKey) {
  if (typeof monthKey !== 'string') {
    return '—';
  }
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return monthKey;
  }
  return capitalizeSentence(monthFormatter.format(new Date(year, month - 1, 1)));
}

function resetFeedbackCommentRotation(dashboardState) {
  const rotation = dashboardState?.feedback?.commentRotation;
  if (rotation?.timerId) {
    window.clearInterval(rotation.timerId);
  }
  if (dashboardState?.feedback) {
    dashboardState.feedback.commentRotation = { timerId: null, index: 0, entries: [] };
  }
}

function renderFeedbackCommentsCard(dashboardState, cardElement, cardConfig, rawComments) {
  const content = document.createElement('p');
  content.className = 'feedback-card__comment';
  content.setAttribute('aria-live', 'polite');
  const meta = document.createElement('p');
  meta.className = 'feedback-card__meta feedback-card__comment-meta';
  cardElement.append(content, meta);

  const rotation = dashboardState.feedback.commentRotation || { timerId: null, index: 0, entries: [] };
  if (rotation.timerId) {
    window.clearInterval(rotation.timerId);
  }

  const comments = Array.isArray(rawComments)
    ? rawComments.filter((item) => item && typeof item.text === 'string' && item.text.trim())
    : [];
  rotation.entries = comments.map((item) => ({ ...item, text: item.text.trim() }));
  rotation.index = 0;
  rotation.timerId = null;
  dashboardState.feedback.commentRotation = rotation;

  if (!rotation.entries.length) {
    content.textContent = cardConfig.empty || TEXT.feedback?.empty || '—';
    meta.textContent = '';
    return;
  }

  const renderEntry = (entry) => {
    content.textContent = entry?.text || (cardConfig.empty || TEXT.feedback?.empty || '—');
    const metaParts = [];
    if (entry?.receivedAt instanceof Date && !Number.isNaN(entry.receivedAt.getTime())) {
      metaParts.push(statusTimeFormatter.format(entry.receivedAt));
    }
    if (entry?.respondent) {
      metaParts.push(entry.respondent);
    }
    if (entry?.location) {
      metaParts.push(entry.location);
    }
    if (!metaParts.length && cardConfig?.description) {
      metaParts.push(cardConfig.description);
    }
    meta.textContent = metaParts.join(' • ');
  };

  const rotateMs = Number.isFinite(Number(cardConfig.rotateMs)) ? Math.max(3000, Number(cardConfig.rotateMs)) : 10000;
  const advance = () => {
    const entry = rotation.entries[rotation.index] || rotation.entries[0];
    renderEntry(entry);
    if (rotation.entries.length > 1) {
      rotation.index = (rotation.index + 1) % rotation.entries.length;
    }
  };
  advance();
  if (rotation.entries.length > 1) {
    rotation.timerId = window.setInterval(advance, rotateMs);
  }
}

export async function runFeedbackRuntime(core) {
  const mode = resolveRuntimeMode(core?.pageId || 'feedback');
  if (mode === 'legacy') {
    return runLegacyFallback(core, 'feedback');
  }

  const pageConfig = core?.pageConfig || { feedback: true };
  const selectors = createSelectorsForPage(core?.pageId || 'feedback');
  const settings = await loadSettingsFromConfig(DEFAULT_SETTINGS);
  const dashboardState = createDashboardState({
    defaultChartFilters: createDefaultChartFilters,
    defaultKpiFilters: () => createDefaultKpiFilters({ settings, DEFAULT_SETTINGS, DEFAULT_KPI_WINDOW_DAYS }),
    defaultFeedbackFilters: createDefaultFeedbackFilters,
    defaultHeatmapFilters: () => ({ arrival: 'all', disposition: 'all', cardType: 'all' }),
    defaultHeatmapMetric: 'arrivals',
    hourlyMetricArrivals: 'arrivals',
    hourlyCompareSeriesAll: 'all',
  });

  const { fetchFeedbackData } = createFeedbackHandlers({
    settings,
    DEFAULT_SETTINGS,
    TEXT,
    dashboardState,
    downloadCsv,
    describeError,
    parseCandidateList,
    matchesWildcard,
    FEEDBACK_RATING_MIN,
    FEEDBACK_RATING_MAX,
    FEEDBACK_LEGACY_MAX,
  });

  applyCommonPageShellText({ selectors, settings, text: TEXT, defaultFooterSource: DEFAULT_FOOTER_SOURCE });
  setupSharedPageUi({
    selectors,
    dashboardState,
    initializeTheme,
    applyTheme,
    themeStorageKey: THEME_STORAGE_KEY,
    onThemeChange: () => {
      const monthly = Array.isArray(dashboardState.feedback.monthly) ? dashboardState.feedback.monthly : [];
      feedbackRenderFeature.renderFeedbackTrendChart(monthly).catch((error) => {
        const info = describeError(error, { code: 'FEEDBACK_TREND_THEME' });
        console.error(info.log, error);
      });
    },
  });

  setupCopyExportControls({
    selectors,
    getDatasetValue,
    setDatasetValue,
    describeError,
  });

  let feedbackRenderFeature = null;
  const chartRenderers = {
    renderFeedbackTrendChart(monthlyStats, records) {
      return renderFeedbackTrendChartModule({
        dashboardState,
        selectors,
        TEXT,
        loadChartJs,
        getThemePalette,
        getThemeStyleTarget,
        syncFeedbackTrendControls: () => feedbackRenderFeature.syncFeedbackTrendControls(),
        updateFeedbackTrendSubtitle: () => feedbackRenderFeature.updateFeedbackTrendSubtitle(),
        getActiveFeedbackTrendWindow: () => feedbackRenderFeature.getActiveFeedbackTrendWindow(),
        getActiveFeedbackTrendMetrics: () => feedbackRenderFeature.getActiveFeedbackTrendMetrics(),
        getActiveFeedbackTrendCompareMode: () => feedbackRenderFeature.getActiveFeedbackTrendCompareMode(),
        getFeedbackTrendMetricConfig: () => feedbackRenderFeature.getFeedbackTrendMetricConfig(),
        getFeedbackTrendCompareConfig: () => feedbackRenderFeature.getFeedbackTrendCompareConfig(),
        formatMonthLabel,
        numberFormatter,
        oneDecimalFormatter,
      }, monthlyStats, records);
    },
  };

  feedbackRenderFeature = createFeedbackRenderFeature({
    selectors,
    dashboardState,
    TEXT,
    numberFormatter,
    decimalFormatter,
    percentFormatter,
    formatMonthLabel,
    getDatasetValue,
    setDatasetValue,
    describeError,
    getChartRenderers: () => chartRenderers,
    resetFeedbackCommentRotation: () => resetFeedbackCommentRotation(dashboardState),
    renderFeedbackCommentsCard: (cardElement, cardConfig, rawComments) => (
      renderFeedbackCommentsCard(dashboardState, cardElement, cardConfig, rawComments)
    ),
  });

  const feedbackPanelFeature = createFeedbackPanelFeature({
    selectors,
    dashboardState,
    TEXT,
    FEEDBACK_RATING_MIN,
    FEEDBACK_RATING_MAX,
    getDefaultFeedbackFilters: createDefaultFeedbackFilters,
    FEEDBACK_FILTER_ALL,
    FEEDBACK_FILTER_MISSING,
    numberFormatter,
    textCollator,
    capitalizeSentence,
    formatLocalDateKey,
    getDatasetValue,
    setDatasetValue,
    renderFeedbackSection: feedbackRenderFeature.renderFeedbackSection,
  });

  initFeedbackFilters({
    selectors,
    dashboardState,
    populateFeedbackFilterControls: feedbackPanelFeature.populateFeedbackFilterControls,
    syncFeedbackFilterControls: feedbackPanelFeature.syncFeedbackFilterControls,
    updateFeedbackFiltersSummary: feedbackPanelFeature.updateFeedbackFiltersSummary,
    handleFeedbackFilterChange: feedbackPanelFeature.handleFeedbackFilterChange,
    handleFeedbackFilterChipClick: feedbackPanelFeature.handleFeedbackFilterChipClick,
  });
  initFeedbackTrendControls({
    selectors,
    setFeedbackTrendWindow: feedbackRenderFeature.setFeedbackTrendWindow,
    setFeedbackTrendMetric: feedbackRenderFeature.setFeedbackTrendMetric,
    setFeedbackTrendCompareMode: feedbackRenderFeature.setFeedbackTrendCompareMode,
  });
  initFeedbackTableScrollAffordance({ selectors });
  const applyFeedbackStatusNote = () => {
    if (dashboardState.usingFallback) {
      return;
    }
    if (dashboardState.feedback.usingFallback) {
      const reason = dashboardState.feedback.lastErrorMessage || TEXT.status.error;
      setStatus(selectors, 'warning', TEXT.feedback.status.fallback(reason));
      return;
    }
    if (dashboardState.feedback.lastErrorMessage) {
      setStatus(selectors, 'warning', TEXT.feedback.status.error(dashboardState.feedback.lastErrorMessage));
    }
  };

  const dataFlow = createDataFlow({
    pageConfig,
    selectors,
    dashboardState,
    TEXT,
    DEFAULT_SETTINGS,
    AUTO_REFRESH_INTERVAL_MS,
    runAfterDomAndIdle,
    setDatasetValue,
    setStatus: (type, details) => setStatus(selectors, type, details),
    showKpiSkeleton: () => {},
    showChartSkeletons: () => {},
    showEdSkeleton: () => {},
    createChunkReporter: () => null,
    fetchData: async () => ({}),
    fetchFeedbackData,
    fetchEdData: async () => null,
    perfMonitor: runtimeClient.perfMonitor,
    describeCacheMeta,
    createEmptyEdSummary: () => ({}),
    describeError,
    computeDailyStats: () => [],
    filterDailyStatsByWindow: () => [],
    populateChartYearOptions: () => {},
    populateChartsHospitalTableYearOptions: () => {},
    populateHourlyCompareYearOptions: () => {},
    populateHeatmapYearOptions: () => {},
    syncHeatmapFilterControls: () => {},
    syncKpiFilterControls: () => {},
    getDefaultChartFilters: createDefaultChartFilters,
    sanitizeChartFilters: (value) => value,
    KPI_FILTER_LABELS: { arrival: { all: 'all' }, disposition: { all: 'all' }, cardType: { all: 'all' } },
    syncChartFilterControls: () => {},
    prepareChartDataForPeriod: () => ({ daily: [], funnel: null, heatmap: null }),
    applyKpiFiltersAndRender: async () => {},
    renderCharts: async () => {},
    renderChartsHospitalTable: () => {},
    getHeatmapData: () => null,
    renderRecentTable: () => {},
    computeMonthlyStats: () => [],
    renderMonthlyTable: () => {},
    computeYearlyStats: () => [],
    renderYearlyTable: () => {},
    updateFeedbackFilterOptions: feedbackPanelFeature.updateFeedbackFilterOptions,
    applyFeedbackFiltersAndRender: feedbackPanelFeature.applyFeedbackFiltersAndRender,
    applyFeedbackStatusNote,
    renderEdDashboard: async () => {},
    numberFormatter,
    getSettings: () => settings,
    getClientConfig: runtimeClient.getClientConfig,
    getAutoRefreshTimerId: () => autoRefreshTimerId,
    setAutoRefreshTimerId: (id) => { autoRefreshTimerId = id; },
  });

  dataFlow.scheduleInitialLoad();
}
