import { renderEdDispositionsChart as renderEdDispositionsChartModule } from '../../../charts/ed-dispositions.js';
import { createEdHandlers } from '../../../data/ed.js';
import {
  computePercentile,
  formatHourLabel,
  formatPercentPointDelta,
  pickTopHours,
} from '../../../data/ed-utils.js';
import { createFeedbackHandlers } from '../../../data/feedback.js';
import { createMainDataHandlers } from '../../../data/main-data.js';
import { computeDailyStats } from '../../../data/stats.js';
import { createEdRenderer } from '../../../render/ed.js';
import { createDashboardState } from '../../../state/dashboardState.js';
import { createSelectorsForPage } from '../../../state/selectors.js';
import { loadChartJs } from '../../../utils/chart-loader.js';
import { getDatasetValue, runAfterDomAndIdle, setDatasetValue } from '../../../utils/dom.js';
import {
  monthFormatter,
  numberFormatter,
  oneDecimalFormatter,
  percentFormatter,
  statusTimeFormatter,
} from '../../../utils/format.js';
import {
  AUTO_REFRESH_INTERVAL_MS,
  CLIENT_CONFIG_KEY,
  DEFAULT_FOOTER_SOURCE,
  DEFAULT_KPI_WINDOW_DAYS,
  ED_TOTAL_BEDS,
  FEEDBACK_LEGACY_MAX,
  FEEDBACK_RATING_MAX,
  FEEDBACK_RATING_MIN,
  TEXT,
  THEME_STORAGE_KEY,
} from '../../constants.js';
import { DEFAULT_SETTINGS } from '../../default-settings.js';
import { dateKeyToUtc, filterDailyStatsByWindow } from '../chart-primitives.js';
import { createDataFlow } from '../data-flow.js';
import { createEdCardsFeature } from '../features/ed-cards.js';
import { createEdCommentsFeature } from '../features/ed-comments.js';
import { createEdPanelCoreFeature } from '../features/ed-panel-core.js';
import { computeFeedbackStats } from '../features/feedback-stats.js';
import { applyTheme, getThemePalette, getThemeStyleTarget, initializeTheme } from '../features/theme.js';
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
} from '../state.js';
import { matchesWildcard, parseCandidateList } from '../utils/common.js';
import { createEdRuntimeAnalytics, formatLocalDateKey, resolveColumnIndex } from './ed/runtime-analytics.js';
import { createEdSkeletonFeature } from './ed/skeleton-feature.js';
import { createRuntimeLifecycle } from './runtime-lifecycle.js';

const MIN_ED_SKELETON_VISIBLE_MS = 450;
const { runtimeClient, setStatus, getAutoRefreshTimerId, setAutoRefreshTimerId } = createRuntimeLifecycle({
  clientConfigKey: CLIENT_CONFIG_KEY,
  statusText: TEXT.status,
});

export async function runEdRuntime(core) {
  const pageConfig = core?.pageConfig || { ed: true };
  const selectors = createSelectorsForPage(core?.pageId || 'ed');
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

  const { fetchData } = createMainDataHandlers({
    settings,
    DEFAULT_SETTINGS,
    dashboardState,
    downloadCsv,
    describeError,
    createTextSignature,
    formatUrlForDiagnostics,
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
  const { createEmptyEdSummary, summarizeEdRecords, fetchEdData } = createEdHandlers({
    settings,
    DEFAULT_SETTINGS,
    TEXT,
    downloadCsv,
    describeError,
    resolveColumnIndex,
  });
  const { buildYearMonthMetrics, enrichSummaryWithOverviewFallback } = createEdRuntimeAnalytics({
    dateKeyToUtc,
    filterDailyStatsByWindow,
    text: TEXT,
    monthFormatter,
    oneDecimalFormatter,
    percentFormatter,
    computePercentile,
    formatHourLabel,
    formatPercentPointDelta,
    pickTopHours,
  });

  applyCommonPageShellText({ selectors, settings, text: TEXT, defaultFooterSource: DEFAULT_FOOTER_SOURCE });
  setupSharedPageUi({
    selectors,
    dashboardState,
    initializeTheme,
    applyTheme,
    themeStorageKey: THEME_STORAGE_KEY,
    onThemeChange: () => {
      const currentDispositions = Array.isArray(dashboardState.ed?.dispositions)
        ? dashboardState.ed.dispositions
        : [];
      renderEdDispositionsChartModule(
        {
          dashboardState,
          selectors,
          loadChartJs,
          getThemePalette,
          getThemeStyleTarget,
          percentFormatter,
        },
        currentDispositions,
        TEXT.ed.dispositions?.legacy || {},
        'legacy'
      ).catch(() => {});
    },
  });

  const edCommentsFeature = createEdCommentsFeature({
    dashboardState,
    TEXT,
    statusTimeFormatter,
  });
  const edCardsFeature = createEdCardsFeature({
    ED_TOTAL_BEDS,
    numberFormatter,
    oneDecimalFormatter,
    percentFormatter,
    setDatasetValue,
  });
  let renderEdDashboardRef = () => Promise.resolve();
  const edSkeletonFeature = createEdSkeletonFeature({
    selectors,
    text: TEXT,
    setDatasetValue,
    getDatasetValue,
    minVisibleMs: MIN_ED_SKELETON_VISIBLE_MS,
  });
  const getFeedbackRotationIntervalMs = () => {
    const cardsRoot = TEXT?.ed?.cards;
    const catalogs = [];
    if (Array.isArray(cardsRoot)) {
      catalogs.push(cardsRoot);
    } else if (cardsRoot && typeof cardsRoot === 'object') {
      if (Array.isArray(cardsRoot.snapshot)) {
        catalogs.push(cardsRoot.snapshot);
      }
      if (Array.isArray(cardsRoot.legacy)) {
        catalogs.push(cardsRoot.legacy);
      }
    }
    const rotatingCard = catalogs.flat().find((card) => card?.type === 'feedback-rotating-metric');
    const configured = Number(rotatingCard?.rotationMs);
    return Number.isFinite(configured) && configured >= 2000 ? configured : 8000;
  };
  const clearFeedbackMetricCarouselTimer = () => {
    const timerId = dashboardState?.feedbackMetricCarousel?.timerId;
    if (timerId) {
      window.clearInterval(timerId);
    }
    if (dashboardState?.feedbackMetricCarousel) {
      dashboardState.feedbackMetricCarousel.timerId = null;
    }
  };
  const ensureFeedbackMetricCarouselTimer = () => {
    const carousel = dashboardState?.feedbackMetricCarousel;
    const catalog = Array.isArray(carousel?.metricCatalog)
      ? carousel.metricCatalog
      : Array.isArray(dashboardState?.ed?.summary?.feedbackCurrentMonthMetricCatalog)
        ? dashboardState.ed.summary.feedbackCurrentMonthMetricCatalog
        : [];
    if (!carousel || catalog.length <= 1) {
      clearFeedbackMetricCarouselTimer();
      if (carousel) {
        carousel.index = 0;
      }
      return;
    }
    const normalizedIndex =
      ((Number.parseInt(String(carousel.index ?? 0), 10) % catalog.length) + catalog.length) % catalog.length;
    carousel.index = normalizedIndex;
    const intervalMs =
      Number.isFinite(Number(carousel.intervalMs)) && Number(carousel.intervalMs) >= 2000
        ? Number(carousel.intervalMs)
        : getFeedbackRotationIntervalMs();
    carousel.intervalMs = intervalMs;
    clearFeedbackMetricCarouselTimer();
    carousel.timerId = window.setInterval(async () => {
      const activeCatalog = Array.isArray(carousel?.metricCatalog)
        ? carousel.metricCatalog
        : Array.isArray(dashboardState?.ed?.summary?.feedbackCurrentMonthMetricCatalog)
          ? dashboardState.ed.summary.feedbackCurrentMonthMetricCatalog
          : [];
      if (activeCatalog.length <= 1) {
        clearFeedbackMetricCarouselTimer();
        return;
      }
      const currentIndex = Number.parseInt(String(carousel.index ?? 0), 10);
      const safeIndex = Number.isFinite(currentIndex) ? currentIndex : 0;
      carousel.index = (safeIndex + 1) % activeCatalog.length;
      await renderEdDashboardRef(dashboardState.ed);
    }, intervalMs);
  };
  window.addEventListener(
    'beforeunload',
    () => {
      clearFeedbackMetricCarouselTimer();
      edSkeletonFeature.cleanupEdSkeletonTimers();
    },
    { once: true }
  );
  const edPanelCoreFeature = createEdPanelCoreFeature({
    dashboardState,
    TEXT,
    statusTimeFormatter,
    renderEdDashboard: (data) => renderEdDashboardRef(data),
  });

  const edRenderer = createEdRenderer({
    selectors,
    dashboardState,
    TEXT,
    DEFAULT_KPI_WINDOW_DAYS,
    settings,
    buildYearMonthMetrics,
    numberFormatter,
    resetEdCommentRotation: edCommentsFeature.resetEdCommentRotation,
    hideEdSkeleton: edSkeletonFeature.hideEdSkeleton,
    normalizeEdSearchQuery: edPanelCoreFeature.normalizeEdSearchQuery,
    matchesEdSearch: edPanelCoreFeature.matchesEdSearch,
    createEmptyEdSummary,
    summarizeEdRecords,
    formatLocalDateKey,
    formatMonthLabel: (monthKey) => {
      if (typeof monthKey !== 'string') {
        return '';
      }
      const [yearStr, monthStr] = monthKey.split('-');
      const year = Number.parseInt(yearStr, 10);
      const month = Number.parseInt(monthStr, 10);
      if (!Number.isFinite(year) || !Number.isFinite(month)) {
        return monthKey;
      }
      return monthFormatter.format(new Date(year, month - 1, 1));
    },
    buildFeedbackTrendInfo: edCardsFeature.buildFeedbackTrendInfo,
    buildEdStatus: edPanelCoreFeature.buildEdStatus,
    renderEdDispositionsChart: (dispositions, text, displayVariant) =>
      renderEdDispositionsChartModule(
        {
          dashboardState,
          selectors,
          loadChartJs,
          getThemePalette,
          getThemeStyleTarget,
          percentFormatter,
        },
        dispositions,
        text,
        displayVariant
      ),
    createEdSectionIcon: edPanelCoreFeature.createEdSectionIcon,
    renderEdCommentsCard: edCommentsFeature.renderEdCommentsCard,
    formatEdCardValue: edCardsFeature.formatEdCardValue,
    buildEdCardVisuals: edCardsFeature.buildEdCardVisuals,
    enrichSummaryWithOverviewFallback,
  });
  renderEdDashboardRef = async (data) => {
    await edRenderer.renderEdDashboard(data);
    ensureFeedbackMetricCarouselTimer();
  };

  if (selectors.edSearchInput) {
    selectors.edSearchInput.addEventListener('input', (event) => {
      edPanelCoreFeature.applyEdSearchFilter(event?.target?.value || '');
    });
  }

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
      setStatus: (type, details) => setStatus(selectors, type, details),
      getSettings: () => settings,
      getClientConfig: runtimeClient.getClientConfig,
      getAutoRefreshTimerId,
      setAutoRefreshTimerId,
    },
    feedbackHooks: {
      applyFeedbackFiltersAndRender: () => {
        const records = Array.isArray(dashboardState.feedback.records) ? dashboardState.feedback.records : [];
        const stats = computeFeedbackStats(records, {
          FEEDBACK_RATING_MIN,
          FEEDBACK_RATING_MAX,
          formatLocalDateKey,
        });
        dashboardState.feedback.summary = stats.summary;
        dashboardState.feedback.monthly = stats.monthly;
      },
      applyFeedbackStatusNote: () => {
        if (dashboardState.feedback.usingFallback) {
          const reason = dashboardState.feedback.lastErrorMessage || TEXT.status.error;
          setStatus(selectors, 'warning', TEXT.feedback.status.fallback(reason));
        }
      },
    },
    edHooks: {
      showEdSkeleton: edSkeletonFeature.showEdSkeleton,
      createEmptyEdSummary,
      renderEdDashboard: (edData) => renderEdDashboardRef(edData),
    },
    dataHooks: {
      fetchData,
      fetchFeedbackData,
      fetchEdData,
      perfMonitor: runtimeClient.perfMonitor,
      describeCacheMeta,
      describeError,
      computeDailyStats,
      filterDailyStatsByWindow,
    },
    numberFormatter,
  });

  dataFlow.scheduleInitialLoad();
}
