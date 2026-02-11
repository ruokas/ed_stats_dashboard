import { createSelectorsForPage } from '../../../state/selectors.js';
import { createDashboardState } from '../../../state/dashboardState.js';
import { createMainDataHandlers } from '../../../data/main-data.js?v=2026-02-08-merge-agg-fix';
import { createFeedbackHandlers } from '../../../data/feedback.js';
import { createEdHandlers } from '../../../data/ed.js';
import { computeDailyStats } from '../../../data/stats.js';
import { computeFeedbackStats } from '../features/feedback-stats.js';
import { createDataFlow } from '../data-flow.js';
import { createLayoutTools } from '../layout.js';
import { loadSettingsFromConfig } from '../settings.js';
import { applyTheme, getThemePalette, getThemeStyleTarget, initializeTheme } from '../features/theme.js';
import { createEdPanelCoreFeature } from '../features/ed-panel-core.js';
import { createEdCardsFeature } from '../features/ed-cards.js';
import { createEdCommentsFeature } from '../features/ed-comments.js';
import { createEdRenderer } from '../../../render/ed.js';
import { renderEdDispositionsChart as renderEdDispositionsChartModule } from '../../../charts/ed-dispositions.js';
import { loadChartJs } from '../../../utils/chart-loader.js';
import { getDatasetValue, runAfterDomAndIdle, setDatasetValue } from '../../../utils/dom.js';
import { initSectionNavigation } from '../../../events/section-nav.js';
import { initScrollTopButton } from '../../../events/scroll.js';
import { initThemeToggle } from '../../../events/theme.js';
import {
  monthFormatter,
  numberFormatter,
  oneDecimalFormatter,
  percentFormatter,
  shortDateFormatter,
  statusTimeFormatter,
} from '../../../utils/format.js';
import { computePercentile, formatHourLabel, formatPercentPointDelta, pickTopHours } from '../../../data/ed-utils.js';
import { createTextSignature, describeCacheMeta, describeError, downloadCsv, formatUrlForDiagnostics } from '../network.js';
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
import { createDefaultChartFilters, createDefaultFeedbackFilters, createDefaultKpiFilters } from '../state.js';
import { resolveRuntimeMode } from '../runtime-mode.js';
import { createRuntimeClientContext } from '../runtime-client.js';
import { createStatusSetter, matchesWildcard, parseCandidateList } from '../utils/common.js';

const runtimeClient = createRuntimeClientContext(CLIENT_CONFIG_KEY);
let autoRefreshTimerId = null;
const MIN_ED_SKELETON_VISIBLE_MS = 450;
const setStatus = createStatusSetter(TEXT.status);

function normalizeHeaderToken(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveColumnIndex(headerNormalized, candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) {
    return -1;
  }
  const normalizedHeader = headerNormalized.map((column) => ({
    ...column,
    foldedOriginal: normalizeHeaderToken(column.original),
    foldedNormalized: normalizeHeaderToken(column.normalized),
  }));
  for (const candidate of list) {
    const trimmed = String(candidate || '').trim();
    if (!trimmed) {
      continue;
    }
    const match = normalizedHeader.find((column) => column.original === trimmed);
    if (match) {
      return match.index;
    }
  }
  for (const candidate of list) {
    const trimmed = String(candidate || '').trim().toLowerCase();
    if (!trimmed) {
      continue;
    }
    const match = normalizedHeader.find((column) => column.normalized === trimmed);
    if (match) {
      return match.index;
    }
  }
  for (const candidate of list) {
    const folded = normalizeHeaderToken(candidate);
    if (!folded) {
      continue;
    }
    const match = normalizedHeader.find((column) => column.foldedOriginal === folded || column.foldedNormalized === folded);
    if (match) {
      return match.index;
    }
  }
  for (const candidate of list) {
    const folded = normalizeHeaderToken(candidate);
    if (!folded) {
      continue;
    }
    const match = normalizedHeader.find((column) => column.foldedOriginal.includes(folded) || column.foldedNormalized.includes(folded));
    if (match) {
      return match.index;
    }
  }
  return -1;
}

function formatLocalDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateKeyToUtc(dateKey) {
  if (typeof dateKey !== 'string') {
    return Number.NaN;
  }
  const parts = dateKey.split('-').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return Number.NaN;
  }
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

function filterDailyStatsByWindow(dailyStats, days) {
  if (!Array.isArray(dailyStats)) {
    return [];
  }
  if (!Number.isFinite(days) || days <= 0) {
    return [...dailyStats];
  }
  const decorated = dailyStats.map((entry) => ({ entry, utc: dateKeyToUtc(entry?.date) })).filter((item) => Number.isFinite(item.utc));
  if (!decorated.length) {
    return [];
  }
  const endUtc = decorated.reduce((max, item) => Math.max(max, item.utc), decorated[0].utc);
  const startUtc = endUtc - (days - 1) * 86400000;
  return decorated.filter((item) => item.utc >= startUtc && item.utc <= endUtc).map((item) => item.entry);
}

function dateKeyToDate(dateKey) {
  const utc = dateKeyToUtc(dateKey);
  return Number.isFinite(utc) ? new Date(utc) : null;
}

function buildYearMonthMetrics(dailyStats, windowDays) {
  if (!Array.isArray(dailyStats) || !dailyStats.length) {
    return null;
  }
  const decorated = dailyStats
    .map((entry) => ({ entry, utc: dateKeyToUtc(entry?.date ?? '') }))
    .filter((item) => Number.isFinite(item.utc))
    .sort((a, b) => a.utc - b.utc);
  if (!decorated.length) {
    return null;
  }
  const periodEntries = decorated.map((item) => item.entry);
  const [yearStr = '', monthStr = ''] = (periodEntries[periodEntries.length - 1]?.date ?? '').split('-');
  const monthEntries = monthStr ? periodEntries.filter((entry) => String(entry?.date || '').startsWith(`${yearStr}-${monthStr}`)) : [];
  const aggregate = (entries) => entries.reduce((acc, entry) => {
    acc.days += 1;
    acc.totalCount += Number.isFinite(entry?.count) ? entry.count : 0;
    acc.totalHospitalized += Number.isFinite(entry?.hospitalized) ? entry.hospitalized : 0;
    acc.totalTime += Number.isFinite(entry?.totalTime) ? entry.totalTime : 0;
    acc.durationCount += Number.isFinite(entry?.durations) ? entry.durations : 0;
    acc.totalHospitalizedTime += Number.isFinite(entry?.hospitalizedTime) ? entry.hospitalizedTime : 0;
    acc.hospitalizedDurationCount += Number.isFinite(entry?.hospitalizedDurations) ? entry.hospitalizedDurations : 0;
    return acc;
  }, { days: 0, totalCount: 0, totalHospitalized: 0, totalTime: 0, durationCount: 0, totalHospitalizedTime: 0, hospitalizedDurationCount: 0 });
  const toMetrics = (summary) => ({
    days: summary.days,
    patientsPerDay: summary.days > 0 ? summary.totalCount / summary.days : 0,
    hospitalizedShare: summary.totalCount > 0 ? summary.totalHospitalized / summary.totalCount : null,
    avgTime: summary.durationCount > 0 ? summary.totalTime / summary.durationCount : null,
    avgHospitalizedTime: summary.hospitalizedDurationCount > 0 ? summary.totalHospitalizedTime / summary.hospitalizedDurationCount : null,
  });
  const yearMetrics = toMetrics(aggregate(periodEntries));
  const monthMetrics = toMetrics(aggregate(monthEntries));
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const monthLabel = Number.isFinite(year) && Number.isFinite(month)
    ? monthFormatter.format(new Date(year, month - 1, 1))
    : '';
  return {
    yearLabel: Number.isFinite(windowDays) && windowDays > 0 ? `Paskutinės ${windowDays} d.` : TEXT.kpis.windowAllLabel,
    monthLabel,
    yearMetrics,
    monthMetrics,
  };
}

function enrichSummaryWithOverviewFallback(summary, overviewRecords, overviewDailyStats, options = {}) {
  if (!summary || typeof summary !== 'object') {
    return summary;
  }
  const records = Array.isArray(overviewRecords)
    ? overviewRecords.filter((record) => record && (record.arrival instanceof Date || record.discharge instanceof Date))
    : [];
  if (!records.length) {
    return summary;
  }
  const arrivalHourCounts = Array.from({ length: 24 }, () => 0);
  const dischargeHourCounts = Array.from({ length: 24 }, () => 0);
  const losValues = [];
  const uniqueDateKeys = new Set();
  let arrivalsWithHour = 0;
  let fastCount = 0;
  let slowCount = 0;

  records.forEach((record) => {
    const arrival = record.arrival instanceof Date && !Number.isNaN(record.arrival.getTime()) ? record.arrival : null;
    const discharge = record.discharge instanceof Date && !Number.isNaN(record.discharge.getTime()) ? record.discharge : null;
    const reference = arrival || discharge;
    const dateKey = reference ? formatLocalDateKey(reference) : '';
    if (dateKey) {
      uniqueDateKeys.add(dateKey);
    }
    if (arrival) {
      const hour = arrival.getHours();
      if (hour >= 0 && hour <= 23) {
        arrivalHourCounts[hour] += 1;
        arrivalsWithHour += 1;
      }
    }
    if (discharge) {
      const hour = discharge.getHours();
      if (hour >= 0 && hour <= 23) {
        dischargeHourCounts[hour] += 1;
      }
    }
    if (arrival && discharge) {
      const diffMinutes = (discharge.getTime() - arrival.getTime()) / 60000;
      if (Number.isFinite(diffMinutes) && diffMinutes >= 0) {
        losValues.push(diffMinutes);
        if (diffMinutes < 120) {
          fastCount += 1;
        }
        if (diffMinutes > 480) {
          slowCount += 1;
        }
      }
    }
  });

  if (!summary.peakWindowText) {
    const topArrival = pickTopHours(arrivalHourCounts, 3);
    const topDeparture = pickTopHours(dischargeHourCounts, 3);
    if (topArrival.length || topDeparture.length) {
      const arrivalText = topArrival.length ? topArrival.map((item) => formatHourLabel(item.hour)).join(', ') : '—';
      const departureText = topDeparture.length ? topDeparture.map((item) => formatHourLabel(item.hour)).join(', ') : '—';
      summary.peakWindowText = `Atvykimai: ${arrivalText} / Išvykimai: ${departureText}`;
    }
  }

  if (!Number.isFinite(summary.taktTimeMinutes) && uniqueDateKeys.size > 0 && arrivalsWithHour > 0) {
    const arrivalsPerHour = arrivalsWithHour / (uniqueDateKeys.size * 24);
    if (Number.isFinite(arrivalsPerHour) && arrivalsPerHour > 0) {
      summary.taktTimeMinutes = 60 / arrivalsPerHour;
      summary.taktTimeMeta = `~${oneDecimalFormatter.format(arrivalsPerHour)} atv./val.`;
    }
  }

  if (losValues.length) {
    const sortedLos = losValues.slice().sort((a, b) => a - b);
    const losMedian = computePercentile(sortedLos, 0.5);
    const losP90 = computePercentile(sortedLos, 0.9);
    if (!Number.isFinite(summary.losMedianMinutes) && Number.isFinite(losMedian)) {
      summary.losMedianMinutes = losMedian;
    }
    if (!Number.isFinite(summary.losP90Minutes) && Number.isFinite(losP90)) {
      summary.losP90Minutes = losP90;
    }
    if (!Number.isFinite(summary.losVariabilityIndex) && Number.isFinite(losMedian) && Number.isFinite(losP90) && losMedian > 0) {
      summary.losVariabilityIndex = losP90 / losMedian;
    }
    if (!summary.losPercentilesText && Number.isFinite(losMedian) && Number.isFinite(losP90)) {
      summary.losPercentilesText = `P50: ${oneDecimalFormatter.format(losMedian / 60)} val. • P90: ${oneDecimalFormatter.format(losP90 / 60)} val.`;
    }
    if (!Number.isFinite(summary.fastLaneShare) || !Number.isFinite(summary.slowLaneShare)) {
      summary.fastLaneShare = losValues.length ? fastCount / losValues.length : null;
      summary.slowLaneShare = losValues.length ? slowCount / losValues.length : null;
    }
    if (!summary.fastSlowSplitValue && Number.isFinite(summary.fastLaneShare) && Number.isFinite(summary.slowLaneShare)) {
      summary.fastSlowSplitValue = `Greitieji: ${percentFormatter.format(summary.fastLaneShare)} • Lėtieji: ${percentFormatter.format(summary.slowLaneShare)}`;
    }
  }

  if (!Number.isFinite(summary.avgDailyPatients)) {
    const dailySource = Array.isArray(overviewDailyStats) ? overviewDailyStats : [];
    if (dailySource.length) {
      const windowDays = Number.isFinite(Number(options.windowDays)) && Number(options.windowDays) > 0 ? Number(options.windowDays) : 30;
      const scoped = filterDailyStatsByWindow(dailySource, windowDays);
      const effective = scoped.length ? scoped : dailySource;
      const totals = effective.reduce((acc, entry) => {
        if (Number.isFinite(entry?.count)) {
          acc.sum += Number(entry.count);
          acc.days += 1;
        }
        return acc;
      }, { sum: 0, days: 0 });
      if (totals.days > 0) {
        summary.avgDailyPatients = totals.sum / totals.days;
      }
    }
  }

  if (!Number.isFinite(summary.fastSlowTrendWindowDays) && Number.isFinite(options.windowDays)) {
    summary.fastSlowTrendWindowDays = Math.max(1, Math.round(options.windowDays));
  }
  if (!summary.fastSlowTrendText && Number.isFinite(summary.fastLaneDelta)) {
    const fastDeltaText = formatPercentPointDelta(summary.fastLaneDelta, oneDecimalFormatter);
    const slowDeltaText = formatPercentPointDelta(summary.slowLaneDelta, oneDecimalFormatter);
    summary.fastSlowTrendText = `Pokytis: ${fastDeltaText} / ${slowDeltaText}`;
  }

  return summary;
}

export async function runEdRuntime(core) {
  const mode = resolveRuntimeMode(core?.pageId || 'ed');
  if (mode === 'legacy') {
    const { startFullPageApp } = await import('../../full-page-app.js?v=2026-02-08-fullpage-refresh-2');
    return startFullPageApp({ forcePageId: core?.pageId || 'ed', skipGlobalInit: true });
  }

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

  if (selectors.title) {
    selectors.title.textContent = settings?.output?.title || TEXT.title;
  }
  if (selectors.footerSource) {
    selectors.footerSource.textContent = settings?.output?.footerSource || DEFAULT_FOOTER_SOURCE;
  }
  if (settings?.output?.pageTitle) {
    document.title = settings.output.pageTitle;
  }
  if (selectors.scrollTopBtn) {
    selectors.scrollTopBtn.textContent = settings?.output?.scrollTopLabel || TEXT.scrollTop;
  }

  initializeTheme(dashboardState, selectors, { themeStorageKey: THEME_STORAGE_KEY });
  const toggleTheme = () => {
    applyTheme(dashboardState, selectors, dashboardState.theme === 'dark' ? 'light' : 'dark', {
      persist: true,
      themeStorageKey: THEME_STORAGE_KEY,
    });
    const currentDispositions = Array.isArray(dashboardState.ed?.dispositions) ? dashboardState.ed.dispositions : [];
    renderEdDispositionsChartModule({
      dashboardState,
      selectors,
      loadChartJs,
      getThemePalette,
      getThemeStyleTarget,
      percentFormatter,
    }, currentDispositions, TEXT.ed.dispositions?.legacy || {}, 'legacy').catch(() => {});
  };

  const layoutTools = createLayoutTools({ selectors });
  initSectionNavigation({ selectors, ...layoutTools });
  initScrollTopButton({
    selectors,
    updateScrollTopButtonVisibility: layoutTools.updateScrollTopButtonVisibility,
    scheduleScrollTopUpdate: layoutTools.scheduleScrollTopUpdate,
  });
  initThemeToggle({ selectors, toggleTheme });

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
  let edSkeletonShownAt = 0;
  let edSkeletonHideTimerId = null;
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
      : (Array.isArray(dashboardState?.ed?.summary?.feedbackCurrentMonthMetricCatalog)
        ? dashboardState.ed.summary.feedbackCurrentMonthMetricCatalog
        : []);
    if (!carousel || catalog.length <= 1) {
      clearFeedbackMetricCarouselTimer();
      if (carousel) {
        carousel.index = 0;
      }
      return;
    }
    const normalizedIndex = ((Number.parseInt(String(carousel.index ?? 0), 10) % catalog.length) + catalog.length) % catalog.length;
    carousel.index = normalizedIndex;
    const intervalMs = Number.isFinite(Number(carousel.intervalMs)) && Number(carousel.intervalMs) >= 2000
      ? Number(carousel.intervalMs)
      : getFeedbackRotationIntervalMs();
    carousel.intervalMs = intervalMs;
    clearFeedbackMetricCarouselTimer();
    carousel.timerId = window.setInterval(async () => {
      const activeCatalog = Array.isArray(carousel?.metricCatalog)
        ? carousel.metricCatalog
        : (Array.isArray(dashboardState?.ed?.summary?.feedbackCurrentMonthMetricCatalog)
          ? dashboardState.ed.summary.feedbackCurrentMonthMetricCatalog
          : []);
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
  window.addEventListener('beforeunload', clearFeedbackMetricCarouselTimer, { once: true });
  const edPanelCoreFeature = createEdPanelCoreFeature({
    dashboardState,
    TEXT,
    statusTimeFormatter,
    renderEdDashboard: (data) => renderEdDashboardRef(data),
  });

  function buildEdSkeletonCardCatalog() {
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
    const deduped = new Map();
    catalogs.flat().forEach((card, index) => {
      if (!card || typeof card !== 'object') {
        return;
      }
      const key = `${card.section || 'default'}::${card.key || card.title || index}::${card.type || 'default'}`;
      if (!deduped.has(key)) {
        deduped.set(key, card);
      }
    });
    return Array.from(deduped.values());
  }

  function buildEdSkeletonSections() {
    const sectionMeta = TEXT?.ed?.cardSections || {};
    const sectionOrder = Object.keys(sectionMeta);
    const sectionsByKey = new Map();
    const cards = buildEdSkeletonCardCatalog();
    cards.forEach((card) => {
      const key = typeof card.section === 'string' && card.section.trim()
        ? card.section.trim()
        : 'default';
      if (!sectionsByKey.has(key)) {
        const meta = sectionMeta[key] || sectionMeta.default || {};
        sectionsByKey.set(key, {
          key,
          title: meta.title || '',
          description: meta.description || '',
          cards: [],
        });
      }
      sectionsByKey.get(key).cards.push(card);
    });
    const sections = Array.from(sectionsByKey.values())
      .filter((section) => Array.isArray(section.cards) && section.cards.length);
    sections.sort((a, b) => {
      const aIndex = sectionOrder.indexOf(a.key);
      const bIndex = sectionOrder.indexOf(b.key);
      const normalizedA = aIndex === -1 ? Number.POSITIVE_INFINITY : aIndex;
      const normalizedB = bIndex === -1 ? Number.POSITIVE_INFINITY : bIndex;
      return normalizedA - normalizedB;
    });
    return sections;
  }

  function createEdSkeletonCard() {
    const card = document.createElement('article');
    card.className = 'ed-dashboard__card ed-dashboard__card--skeleton';

    const title = document.createElement('div');
    title.className = 'skeleton skeleton--title';
    const value = document.createElement('div');
    value.className = 'skeleton skeleton--value';
    const detailPrimary = document.createElement('div');
    detailPrimary.className = 'skeleton skeleton--detail';
    const detailSecondary = document.createElement('div');
    detailSecondary.className = 'skeleton skeleton--detail';
    card.append(title, value, detailPrimary, detailSecondary);
    return card;
  }

  function createEdSkeletonSection(section) {
    const sectionEl = document.createElement('section');
    sectionEl.className = 'ed-dashboard__section ed-dashboard__section--skeleton';
    sectionEl.setAttribute('aria-hidden', 'true');
    if (section?.key) {
      setDatasetValue(sectionEl, 'sectionKey', section.key);
    }

    const header = document.createElement('div');
    header.className = 'ed-dashboard__section-header';
    const icon = document.createElement('div');
    icon.className = 'ed-dashboard__section-icon skeleton skeleton--chip';
    const textWrapper = document.createElement('div');
    textWrapper.className = 'ed-dashboard__section-header-text';
    const title = document.createElement('div');
    title.className = 'skeleton skeleton--title';
    const subtitle = document.createElement('div');
    subtitle.className = 'skeleton skeleton--detail';
    textWrapper.append(title, subtitle);
    header.append(icon, textWrapper);

    const grid = document.createElement('div');
    grid.className = 'ed-dashboard__section-grid';
    const cards = Array.isArray(section?.cards) ? section.cards : [];
    cards.forEach(() => {
      grid.appendChild(createEdSkeletonCard());
    });
    sectionEl.append(header, grid);
    return sectionEl;
  }

  function showEdSkeleton() {
    const container = selectors.edCards;
    if (!container || getDatasetValue(container, 'skeleton') === 'true') {
      return;
    }
    if (selectors.edStandardSection) {
      selectors.edStandardSection.setAttribute('aria-busy', 'true');
    }
    if (edSkeletonHideTimerId) {
      window.clearTimeout(edSkeletonHideTimerId);
      edSkeletonHideTimerId = null;
    }
    edSkeletonShownAt = Date.now();
    setDatasetValue(container, 'skeleton', 'true');
    const sections = buildEdSkeletonSections();
    if (!sections.length) {
      container.replaceChildren();
      return;
    }
    const flatCards = sections.flatMap((section) => (Array.isArray(section?.cards) ? section.cards : []));
    const limitedCards = flatCards.slice(0, 3);
    if (!limitedCards.length) {
      container.replaceChildren();
      return;
    }
    const baseSection = sections[0] || {};
    const compactSection = {
      key: baseSection.key || 'default',
      title: baseSection.title || '',
      description: baseSection.description || '',
      cards: limitedCards,
    };
    const fragment = document.createDocumentFragment();
    fragment.appendChild(createEdSkeletonSection(compactSection));
    container.replaceChildren(fragment);
  }

  function hideEdSkeleton() {
    const container = selectors.edCards;
    if (!container) {
      return;
    }
    const isSkeletonVisible = getDatasetValue(container, 'skeleton') === 'true';
    if (isSkeletonVisible && edSkeletonShownAt > 0) {
      const elapsed = Date.now() - edSkeletonShownAt;
      if (elapsed < MIN_ED_SKELETON_VISIBLE_MS) {
        if (!edSkeletonHideTimerId) {
          edSkeletonHideTimerId = window.setTimeout(() => {
            edSkeletonHideTimerId = null;
            hideEdSkeleton();
          }, MIN_ED_SKELETON_VISIBLE_MS - elapsed);
        }
        return;
      }
    }
    if (selectors.edStandardSection) {
      selectors.edStandardSection.removeAttribute('aria-busy');
    }
    if (isSkeletonVisible) {
      container.replaceChildren();
    }
    edSkeletonShownAt = 0;
    setDatasetValue(container, 'skeleton', null);
  }

  const edRenderer = createEdRenderer({
    selectors,
    dashboardState,
    TEXT,
    DEFAULT_KPI_WINDOW_DAYS,
    settings,
    buildYearMonthMetrics,
    numberFormatter,
    resetEdCommentRotation: edCommentsFeature.resetEdCommentRotation,
    hideEdSkeleton,
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
    renderEdDispositionsChart: (dispositions, text, displayVariant) => renderEdDispositionsChartModule({
      dashboardState,
      selectors,
      loadChartJs,
      getThemePalette,
      getThemeStyleTarget,
      percentFormatter,
    }, dispositions, text, displayVariant),
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
    runAfterDomAndIdle,
    setDatasetValue,
    setStatus: (type, details) => setStatus(selectors, type, details),
    showKpiSkeleton: () => {},
    showChartSkeletons: () => {},
    showEdSkeleton,
    createChunkReporter: () => null,
    fetchData,
    fetchFeedbackData,
    fetchEdData,
    perfMonitor: runtimeClient.perfMonitor,
    describeCacheMeta,
    createEmptyEdSummary,
    describeError,
    computeDailyStats,
    filterDailyStatsByWindow,
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
    updateFeedbackFilterOptions: () => {},
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
    renderEdDashboard: (edData) => renderEdDashboardRef(edData),
    numberFormatter,
    getSettings: () => settings,
    getClientConfig: runtimeClient.getClientConfig,
    getAutoRefreshTimerId: () => autoRefreshTimerId,
    setAutoRefreshTimerId: (id) => { autoRefreshTimerId = id; },
  });

  dataFlow.scheduleInitialLoad();
}
