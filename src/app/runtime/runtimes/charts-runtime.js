import { createChartRenderers } from '../../../charts/index.js';
import { createMainDataHandlers } from '../../../data/main-data.js?v=2026-02-08-merge-agg-fix';
import {
  computeDailyStats,
  computeHospitalizedByDepartmentAndSpsStay,
  computeHospitalizedDepartmentYearlyStayTrend,
} from '../../../data/stats.js';
import { initChartControls } from '../../../events/charts.js';
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
import { runLegacyFallback } from '../legacy-fallback.js';
import {
  createTextSignature,
  describeCacheMeta,
  describeError,
  downloadCsv,
  formatUrlForDiagnostics,
} from '../network.js';
import { applyCommonPageShellText, setupSharedPageUi } from '../page-ui.js';
import { createRuntimeClientContext } from '../runtime-client.js';
import { resolveRuntimeMode } from '../runtime-mode.js';
import { loadSettingsFromConfig } from '../settings.js';
import {
  createDefaultChartFilters,
  createDefaultFeedbackFilters,
  createDefaultKpiFilters,
  KPI_FILTER_LABELS,
} from '../state.js';
import { parseColorToRgb, relativeLuminance, rgbToRgba } from '../utils/color.js';
import { createStatusSetter } from '../utils/common.js';

const runtimeClient = createRuntimeClientContext(CLIENT_CONFIG_KEY);
let autoRefreshTimerId = null;
const setStatus = createStatusSetter(TEXT.status);

const HEATMAP_HOURS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);
const HEATMAP_WEEKDAY_FULL = [
  'Pirmadienis',
  'Antradienis',
  'Treciadienis',
  'Ketvirtadienis',
  'Penktadienis',
  'Sestadienis',
  'Sekmadienis',
];
const HEATMAP_WEEKDAY_SHORT = ['Pir', 'Antr', 'Trec', 'Ketv', 'Penkt', 'Sest', 'Sekm'];
const HEATMAP_METRIC_KEYS = ['arrivals', 'discharges', 'hospitalized', 'avgDuration'];
const DEFAULT_HEATMAP_METRIC = 'arrivals';
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

function matchesSharedPatientFilters(record, filters = {}) {
  if (filters.arrival === 'ems' && !record.ems) return false;
  if (filters.arrival === 'self' && record.ems) return false;
  if (filters.disposition === 'hospitalized' && !record.hospitalized) return false;
  if (filters.disposition === 'discharged' && record.hospitalized) return false;
  if (filters.cardType === 't' && record.cardType !== 't') return false;
  if (filters.cardType === 'tr' && record.cardType !== 'tr') return false;
  if (filters.cardType === 'ch' && record.cardType !== 'ch') return false;
  return true;
}

function filterRecordsByChartFilters(records, filters) {
  const normalized = sanitizeChartFilters(filters, {
    getDefaultChartFilters: createDefaultChartFilters,
    KPI_FILTER_LABELS,
  });
  return (Array.isArray(records) ? records : []).filter((record) =>
    matchesSharedPatientFilters(record, normalized)
  );
}

function sanitizeHeatmapFilters(filters) {
  const defaults = { arrival: 'all', disposition: 'all', cardType: 'all' };
  const normalized = { ...defaults, ...(filters || {}) };
  if (!(normalized.arrival in KPI_FILTER_LABELS.arrival)) normalized.arrival = defaults.arrival;
  if (!(normalized.disposition in KPI_FILTER_LABELS.disposition))
    normalized.disposition = defaults.disposition;
  if (!(normalized.cardType in KPI_FILTER_LABELS.cardType)) normalized.cardType = defaults.cardType;
  return normalized;
}

function filterRecordsByHeatmapFilters(records, filters) {
  const normalized = sanitizeHeatmapFilters(filters);
  return (Array.isArray(records) ? records : []).filter((record) =>
    matchesSharedPatientFilters(record, normalized)
  );
}

function computeFunnelStats(dailyStats, targetYear, fallbackDailyStats) {
  const entries =
    Array.isArray(dailyStats) && dailyStats.length
      ? dailyStats
      : Array.isArray(fallbackDailyStats)
        ? fallbackDailyStats
        : [];
  return entries.reduce(
    (acc, entry) => ({
      arrived: acc.arrived + (Number.isFinite(entry?.count) ? entry.count : 0),
      hospitalized: acc.hospitalized + (Number.isFinite(entry?.hospitalized) ? entry.hospitalized : 0),
      discharged: acc.discharged + (Number.isFinite(entry?.discharged) ? entry.discharged : 0),
      year: Number.isFinite(targetYear) ? targetYear : null,
    }),
    { arrived: 0, hospitalized: 0, discharged: 0, year: Number.isFinite(targetYear) ? targetYear : null }
  );
}

function computeArrivalHeatmap(records) {
  const aggregates = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({
      arrivals: 0,
      discharges: 0,
      hospitalized: 0,
      durationSum: 0,
      durationCount: 0,
    }))
  );
  const weekdayDays = {
    arrivals: Array.from({ length: 7 }, () => new Set()),
    discharges: Array.from({ length: 7 }, () => new Set()),
    hospitalized: Array.from({ length: 7 }, () => new Set()),
    avgDuration: Array.from({ length: 7 }, () => new Set()),
  };
  const formatLocalDateKey = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  (Array.isArray(records) ? records : []).forEach((entry) => {
    const arrival =
      entry?.arrival instanceof Date && !Number.isNaN(entry.arrival.getTime()) ? entry.arrival : null;
    const discharge =
      entry?.discharge instanceof Date && !Number.isNaN(entry.discharge.getTime()) ? entry.discharge : null;
    const arrivalHasTime =
      entry?.arrivalHasTime === true ||
      (entry?.arrivalHasTime == null &&
        arrival &&
        (arrival.getHours() || arrival.getMinutes() || arrival.getSeconds()));
    const dischargeHasTime =
      entry?.dischargeHasTime === true ||
      (entry?.dischargeHasTime == null &&
        discharge &&
        (discharge.getHours() || discharge.getMinutes() || discharge.getSeconds()));

    if (arrival && arrivalHasTime) {
      const dayIndex = (arrival.getDay() + 6) % 7;
      const hour = arrival.getHours();
      if (hour >= 0 && hour <= 23) {
        const cell = aggregates[dayIndex][hour];
        cell.arrivals += 1;
        const dateKey = formatLocalDateKey(arrival);
        if (dateKey) {
          weekdayDays.arrivals[dayIndex].add(dateKey);
          weekdayDays.avgDuration[dayIndex].add(dateKey);
        }
        if (discharge) {
          const duration = (discharge.getTime() - arrival.getTime()) / 3600000;
          if (Number.isFinite(duration) && duration >= 0 && duration <= 24) {
            cell.durationSum += duration;
            cell.durationCount += 1;
          }
        }
      }
    }

    if (discharge && dischargeHasTime) {
      const dayIndex = (discharge.getDay() + 6) % 7;
      const hour = discharge.getHours();
      if (hour >= 0 && hour <= 23) {
        const cell = aggregates[dayIndex][hour];
        const dateKey = formatLocalDateKey(discharge);
        if (entry.hospitalized) {
          cell.hospitalized += 1;
          if (dateKey) {
            weekdayDays.hospitalized[dayIndex].add(dateKey);
          }
        } else {
          cell.discharges += 1;
          if (dateKey) {
            weekdayDays.discharges[dayIndex].add(dateKey);
          }
        }
      }
    }
  });

  const createMatrix = () => Array.from({ length: 7 }, () => Array(24).fill(0));
  const metrics = {
    arrivals: { matrix: createMatrix(), max: 0, hasData: false },
    discharges: { matrix: createMatrix(), max: 0, hasData: false },
    hospitalized: { matrix: createMatrix(), max: 0, hasData: false },
    avgDuration: { matrix: createMatrix(), counts: createMatrix(), max: 0, hasData: false, samples: 0 },
  };

  aggregates.forEach((row, dayIndex) => {
    const arrivalsDiv = weekdayDays.arrivals[dayIndex].size || 1;
    const dischargesDiv = weekdayDays.discharges[dayIndex].size || 1;
    const hospitalizedDiv = weekdayDays.hospitalized[dayIndex].size || 1;

    row.forEach((cell, hourIndex) => {
      if (cell.arrivals > 0) metrics.arrivals.hasData = true;
      if (cell.discharges > 0) metrics.discharges.hasData = true;
      if (cell.hospitalized > 0) metrics.hospitalized.hasData = true;
      if (cell.durationCount > 0) {
        metrics.avgDuration.hasData = true;
        metrics.avgDuration.samples += cell.durationCount;
      }

      const arrivalsAvg = arrivalsDiv ? cell.arrivals / arrivalsDiv : 0;
      const dischargesAvg = dischargesDiv ? cell.discharges / dischargesDiv : 0;
      const hospitalizedAvg = hospitalizedDiv ? cell.hospitalized / hospitalizedDiv : 0;
      const averageDuration = cell.durationCount > 0 ? cell.durationSum / cell.durationCount : 0;

      metrics.arrivals.matrix[dayIndex][hourIndex] = arrivalsAvg;
      metrics.discharges.matrix[dayIndex][hourIndex] = dischargesAvg;
      metrics.hospitalized.matrix[dayIndex][hourIndex] = hospitalizedAvg;
      metrics.avgDuration.matrix[dayIndex][hourIndex] = averageDuration;
      metrics.avgDuration.counts[dayIndex][hourIndex] = cell.durationCount;

      if (arrivalsAvg > metrics.arrivals.max) metrics.arrivals.max = arrivalsAvg;
      if (dischargesAvg > metrics.discharges.max) metrics.discharges.max = dischargesAvg;
      if (hospitalizedAvg > metrics.hospitalized.max) metrics.hospitalized.max = hospitalizedAvg;
      if (averageDuration > metrics.avgDuration.max) metrics.avgDuration.max = averageDuration;
    });
  });

  return { metrics };
}

function clearChartError(selectors) {
  (selectors.chartCards || []).forEach((card) => {
    if (!card) {
      return;
    }
    card.removeAttribute('data-error');
    const message = card.querySelector('.chart-card__message');
    if (message) {
      message.remove();
    }
  });
}

function showChartSkeletons(selectors) {
  clearChartError(selectors);
  (selectors.chartCards || []).forEach((card) => {
    if (!card) {
      return;
    }
    const skeleton = card.querySelector('.chart-card__skeleton');
    if (skeleton) {
      skeleton.hidden = false;
    }
    setDatasetValue(card, 'loading', 'true');
  });
}

function hideChartSkeletons(selectors) {
  (selectors.chartCards || []).forEach((card) => {
    if (!card) {
      return;
    }
    const skeleton = card.querySelector('.chart-card__skeleton');
    if (skeleton) {
      skeleton.hidden = true;
    }
    setDatasetValue(card, 'loading', null);
  });
}

function showChartError(selectors, message) {
  hideChartSkeletons(selectors);
  (selectors.chartCards || []).forEach((card) => {
    if (!card) {
      return;
    }
    setDatasetValue(card, 'error', 'true');
    let messageEl = card.querySelector('.chart-card__message');
    if (!messageEl) {
      messageEl = document.createElement('div');
      messageEl.className = 'chart-card__message';
      messageEl.setAttribute('role', 'status');
      messageEl.setAttribute('aria-live', 'polite');
      card.appendChild(messageEl);
    }
    messageEl.textContent = message || TEXT.charts?.errorLoading || TEXT.status.error;
  });
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
  if (!message || !String(message).trim()) {
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
  messageEl.textContent = String(message);
}

function initChartsJumpNavigation(selectors) {
  const nav = selectors?.chartsJumpNav;
  const links = Array.isArray(selectors?.chartsJumpLinks) ? selectors.chartsJumpLinks : [];
  if (!nav || !links.length) {
    return;
  }

  const items = links
    .map((link) => {
      const href = typeof link?.getAttribute === 'function' ? String(link.getAttribute('href') || '') : '';
      if (!href.startsWith('#')) {
        return null;
      }
      const target = document.getElementById(href.slice(1));
      if (!target) {
        return null;
      }
      return { link, target };
    })
    .filter(Boolean);

  if (!items.length) {
    return;
  }

  const applyActiveLink = (activeLink) => {
    items.forEach(({ link }) => {
      const isActive = link === activeLink;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  };

  const getStickyOffset = () => {
    const jumpNavHeight = nav instanceof HTMLElement ? nav.getBoundingClientRect().height : 0;
    const jumpNavTop = nav instanceof HTMLElement ? Number.parseFloat(getComputedStyle(nav).top) || 0 : 0;
    const safeGap = 10;
    const total = Math.ceil(
      (Number.isFinite(jumpNavTop) ? jumpNavTop : 0) +
        (Number.isFinite(jumpNavHeight) ? jumpNavHeight : 0) +
        safeGap
    );
    return total > 0 ? total : 160;
  };

  const scrollToSectionStart = (target, { smooth = true, updateHash = true } = {}) => {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const offset = getStickyOffset();
    const targetTop = window.scrollY + target.getBoundingClientRect().top - offset;
    const nextTop = Math.max(0, Math.round(targetTop));
    window.scrollTo({ top: nextTop, behavior: smooth ? 'smooth' : 'auto' });
    if (!updateHash || !target.id) {
      return;
    }
    const hash = `#${target.id}`;
    if (window.location.hash === hash) {
      return;
    }
    if (window.history && typeof window.history.pushState === 'function') {
      window.history.pushState(null, '', hash);
    } else {
      window.location.hash = hash;
    }
  };

  const findLinkByHash = (hash) => {
    if (!hash || hash === '#') {
      return null;
    }
    return items.find(({ link }) => link.getAttribute('href') === hash) || null;
  };

  const hashMatchedLink = findLinkByHash(window.location.hash);
  applyActiveLink(hashMatchedLink?.link || items[0].link);
  if (hashMatchedLink?.target) {
    window.setTimeout(() => {
      scrollToSectionStart(hashMatchedLink.target, { smooth: false, updateHash: false });
    }, 0);
  }

  items.forEach(({ link, target }) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      applyActiveLink(link);
      scrollToSectionStart(target, { smooth: true, updateHash: true });
    });
  });

  if (typeof IntersectionObserver !== 'function') {
    window.addEventListener('hashchange', () => {
      const hashLink = findLinkByHash(window.location.hash);
      if (hashLink?.link) {
        applyActiveLink(hashLink.link);
      }
      if (hashLink?.target) {
        scrollToSectionStart(hashLink.target, { smooth: false, updateHash: false });
      }
    });
    return;
  }

  const visibility = new Map(
    items.map(({ target }) => [target, { ratio: 0, top: Number.POSITIVE_INFINITY }])
  );
  const updateActiveFromVisibility = () => {
    let bestItem = null;
    let bestRatio = -1;
    let bestTop = Number.POSITIVE_INFINITY;
    items.forEach((item) => {
      const state = visibility.get(item.target);
      if (!state) {
        return;
      }
      const ratio = Number(state.ratio) || 0;
      const top = Number(state.top);
      if (ratio > bestRatio || (ratio === bestRatio && top < bestTop)) {
        bestRatio = ratio;
        bestTop = top;
        bestItem = item;
      }
    });
    if (bestItem && bestRatio > 0) {
      applyActiveLink(bestItem.link);
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        visibility.set(entry.target, {
          ratio: entry.isIntersecting ? entry.intersectionRatio : 0,
          top: Number(entry.boundingClientRect?.top) || Number.POSITIVE_INFINITY,
        });
      });
      updateActiveFromVisibility();
    },
    {
      root: null,
      rootMargin: '-24% 0px -54% 0px',
      threshold: [0, 0.12, 0.3, 0.55, 0.8],
    }
  );

  items.forEach(({ target }) => {
    observer.observe(target);
  });
}

function initChartsJumpStickyOffset(selectors) {
  const jumpNav = selectors?.chartsJumpNav;
  if (!(jumpNav instanceof HTMLElement)) {
    return;
  }

  const applyOffset = () => {
    const hero = selectors?.hero;
    const measuredHeroHeight = hero instanceof HTMLElement ? hero.getBoundingClientRect().height : 0;
    const cssHeroHeight =
      Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hero-height')) || 0;
    const heroHeight = measuredHeroHeight > 0 ? measuredHeroHeight : cssHeroHeight;
    const offset = Math.max(56, Math.ceil(heroHeight) + 2);
    jumpNav.style.setProperty('--charts-jump-sticky-top', `${offset}px`);
    const jumpNavHeight = jumpNav.getBoundingClientRect().height;
    if (Number.isFinite(jumpNavHeight) && jumpNavHeight > 0) {
      document.documentElement.style.setProperty('--charts-jump-nav-height', `${Math.ceil(jumpNavHeight)}px`);
    }
  };

  applyOffset();
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(applyOffset);
  } else {
    window.setTimeout(applyOffset, 0);
  }

  window.addEventListener('resize', applyOffset, { passive: true });
  window.addEventListener('orientationchange', applyOffset, { passive: true });
  window.addEventListener('load', applyOffset, { passive: true });
  if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
    window.visualViewport.addEventListener('resize', applyOffset, { passive: true });
  }
}

export async function runChartsRuntime(core) {
  const mode = resolveRuntimeMode(core?.pageId || 'charts');
  if (mode === 'legacy') {
    return runLegacyFallback(core, 'charts');
  }

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

  const { fetchData } = createMainDataHandlers({
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
      initChartsJumpNavigation(selectors);
    },
  });

  setupCopyExportControls({
    selectors,
    getDatasetValue,
    setDatasetValue,
    describeError,
  });

  const formatDailyCaption = (period) => {
    const base = TEXT.charts.dailyCaption || 'Kasdieniai pacientu srautai';
    const normalized = Number.isFinite(period) ? Math.round(period) : null;
    if (normalized === 365) return `${base} (menesine dinamika)`;
    if (normalized === 0) return `${base} (visas laikotarpis)`;
    if (!Number.isFinite(period) || period < 0) return base;
    return `${base} (paskutines ${numberFormatter.format(normalized)} dienos)`;
  };

  const getHeatmapMetricLabel = (metricKey) => {
    const options = TEXT.charts?.heatmapMetricOptions || {};
    if (typeof options[metricKey] === 'string' && options[metricKey].trim()) {
      return options[metricKey];
    }
    if (typeof metricKey === 'string' && metricKey.trim()) {
      return metricKey.trim();
    }
    const fallbackKey = DEFAULT_HEATMAP_METRIC;
    return typeof options[fallbackKey] === 'string' ? options[fallbackKey] : 'Rodiklis';
  };

  const getHeatmapMetricUnit = (metricKey) => {
    const units = TEXT.charts?.heatmapMetricUnits || {};
    return typeof units[metricKey] === 'string' ? units[metricKey] : '';
  };

  const getHeatmapMetricDescription = (metricKey) => {
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
    const hasMetrics = metrics && typeof metrics === 'object' && Object.keys(metrics).length > 0;
    if (typeof metricKey === 'string' && HEATMAP_METRIC_KEYS.includes(metricKey)) {
      if (!hasMetrics || metrics[metricKey]) {
        return metricKey;
      }
    }
    if (hasMetrics) {
      const available = HEATMAP_METRIC_KEYS.find((key) => metrics[key]);
      if (available) {
        return available;
      }
    }
    if (typeof metricKey === 'string' && HEATMAP_METRIC_KEYS.includes(metricKey)) {
      return metricKey;
    }
    return DEFAULT_HEATMAP_METRIC;
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
    HEATMAP_METRIC_KEYS.forEach((key) => {
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
    const baseRecords = (dashboardState.chartData.baseRecords || []).length
      ? dashboardState.chartData.baseRecords
      : dashboardState.rawRecords;
    const selectedYear = Number.isFinite(dashboardState.heatmapYear)
      ? Number(dashboardState.heatmapYear)
      : null;
    const yearScoped = filterRecordsByYear(baseRecords, selectedYear);
    const filtered = filterRecordsByHeatmapFilters(yearScoped, dashboardState.heatmapFilters);
    const data = computeArrivalHeatmap(filtered);
    dashboardState.chartData.heatmap = data;
    return data;
  };

  const applyHeatmapFiltersAndRender = () => {
    const palette = getThemePalette();
    renderArrivalHeatmap(
      selectors.heatmapContainer,
      computeHeatmapDataForFilters(),
      palette.accent,
      dashboardState.heatmapMetric
    );
  };

  const handleHeatmapMetricChange = (event) => {
    dashboardState.heatmapMetric = normalizeHeatmapMetricKey(event?.target?.value);
    updateHeatmapCaption(dashboardState.heatmapMetric);
    applyHeatmapFiltersAndRender();
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
    applyHeatmapFiltersAndRender();
  };

  const normalizeChartsHospitalTableSort = (value) => {
    const normalized = String(value || '').trim();
    const allowed = [
      'total_desc',
      'total_asc',
      'name_asc',
      'name_desc',
      'lt4_desc',
      'lt4_asc',
      '4to8_desc',
      '4to8_asc',
      '8to16_desc',
      '8to16_asc',
      'gt16_desc',
      'gt16_asc',
      'unclassified_desc',
      'unclassified_asc',
    ];
    return allowed.includes(normalized) ? normalized : 'total_desc';
  };

  const getChartsHospitalSortParts = (sortValue) => {
    const normalized = normalizeChartsHospitalTableSort(sortValue);
    const match = normalized.match(/^(name|total|lt4|4to8|8to16|gt16|unclassified)_(asc|desc)$/);
    return match ? { key: match[1], dir: match[2] } : { key: 'total', dir: 'desc' };
  };

  const normalizeChartsHospitalTableDepartment = (value) => String(value || '').trim();

  const updateChartsHospitalTableHeaderSortIndicators = () => {
    const headers = Array.isArray(selectors.chartsHospitalSortableHeaders)
      ? selectors.chartsHospitalSortableHeaders
      : [];
    if (!headers.length) {
      return;
    }
    const current = getChartsHospitalSortParts(dashboardState.chartsHospitalTableSort);
    headers.forEach((header) => {
      const key = String(header.getAttribute('data-charts-hospital-sort') || '').trim();
      if (!key) {
        return;
      }
      const isActive = key === current.key;
      header.classList.toggle('is-sort-active', isActive);
      header.setAttribute(
        'aria-sort',
        isActive ? (current.dir === 'asc' ? 'ascending' : 'descending') : 'none'
      );
      const baseLabel = String(header.textContent || '')
        .replace(/\s*[↑↓]$/, '')
        .trim();
      header.textContent = isActive ? `${baseLabel} ${current.dir === 'asc' ? '↑' : '↓'}` : baseLabel;
    });
  };

  const sortChartsHospitalRows = (rows, sortValue) => {
    const list = Array.isArray(rows) ? rows.slice() : [];
    const { key, dir } = getChartsHospitalSortParts(sortValue);
    const mult = dir === 'asc' ? 1 : -1;
    const metricField = {
      total: 'total',
      lt4: 'count_lt4',
      '4to8': 'count_4_8',
      '8to16': 'count_8_16',
      gt16: 'count_gt16',
      unclassified: 'count_unclassified',
    }[key];
    list.sort((a, b) => {
      if (key === 'name') {
        return textCollator.compare(String(a?.department || ''), String(b?.department || '')) * mult;
      }
      const av = Number(a?.[metricField] || 0);
      const bv = Number(b?.[metricField] || 0);
      if (av !== bv) {
        return (av - bv) * mult;
      }
      return textCollator.compare(String(a?.department || ''), String(b?.department || ''));
    });
    return list;
  };

  const getChartsHospitalStatsFromWorkerAgg = (yearFilter = 'all') => {
    const agg = dashboardState.chartsHospitalTableWorkerAgg;
    const byYear = agg?.byYear && typeof agg.byYear === 'object' ? agg.byYear : null;
    if (!byYear) {
      return null;
    }
    const yearKeys = Object.keys(byYear).filter((key) => /^\d{4}$/.test(String(key)));
    const yearOptions = yearKeys
      .map((key) => Number.parseInt(String(key), 10))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => b - a);
    const selectedYear = yearFilter == null ? 'all' : String(yearFilter);
    const yearsToUse =
      selectedYear === 'all' ? yearKeys : yearKeys.includes(selectedYear) ? [selectedYear] : [];
    const buckets = new Map();
    yearsToUse.forEach((yearKey) => {
      const yearData = byYear[yearKey] && typeof byYear[yearKey] === 'object' ? byYear[yearKey] : {};
      Object.keys(yearData).forEach((departmentRaw) => {
        const department = String(departmentRaw || '').trim() || 'Nenurodyta';
        if (!buckets.has(department)) {
          buckets.set(department, {
            department,
            count_lt4: 0,
            count_4_8: 0,
            count_8_16: 0,
            count_gt16: 0,
            count_unclassified: 0,
            total: 0,
          });
        }
        const target = buckets.get(department);
        const src = yearData[departmentRaw] || {};
        target.count_lt4 += Number.isFinite(src.count_lt4) ? src.count_lt4 : 0;
        target.count_4_8 += Number.isFinite(src.count_4_8) ? src.count_4_8 : 0;
        target.count_8_16 += Number.isFinite(src.count_8_16) ? src.count_8_16 : 0;
        target.count_gt16 += Number.isFinite(src.count_gt16) ? src.count_gt16 : 0;
        target.count_unclassified += Number.isFinite(src.count_unclassified) ? src.count_unclassified : 0;
        target.total += Number.isFinite(src.total) ? src.total : 0;
      });
    });
    const rows = Array.from(buckets.values())
      .filter((row) => row.total > 0)
      .map((row) => ({
        ...row,
        pct_lt4: row.total > 0 ? (row.count_lt4 / row.total) * 100 : 0,
        pct_4_8: row.total > 0 ? (row.count_4_8 / row.total) * 100 : 0,
        pct_8_16: row.total > 0 ? (row.count_8_16 / row.total) * 100 : 0,
        pct_gt16: row.total > 0 ? (row.count_gt16 / row.total) * 100 : 0,
        pct_unclassified: row.total > 0 ? (row.count_unclassified / row.total) * 100 : 0,
      }));
    const totals = rows.reduce(
      (acc, row) => {
        acc.count_lt4 += row.count_lt4;
        acc.count_4_8 += row.count_4_8;
        acc.count_8_16 += row.count_8_16;
        acc.count_gt16 += row.count_gt16;
        acc.count_unclassified += row.count_unclassified;
        acc.total += row.total;
        return acc;
      },
      {
        count_lt4: 0,
        count_4_8: 0,
        count_8_16: 0,
        count_gt16: 0,
        count_unclassified: 0,
        total: 0,
      }
    );
    return {
      rows,
      totals,
      yearOptions,
      bucketOrder: ['lt4', '4to8', '8to16', 'gt16', 'unclassified'],
      meta: {
        totalHospitalized: totals.total,
        unclassifiedCount: totals.count_unclassified,
      },
    };
  };

  const getDepartmentTrendRowsFromWorkerAgg = (departmentRaw) => {
    const agg = dashboardState.chartsHospitalTableWorkerAgg;
    const byYear = agg?.byYear && typeof agg.byYear === 'object' ? agg.byYear : null;
    if (!byYear) {
      return [];
    }
    const department = normalizeChartsHospitalTableDepartment(departmentRaw);
    if (!department) {
      return [];
    }
    return Object.keys(byYear)
      .filter((key) => /^\d{4}$/.test(String(key)))
      .map((yearKey) => {
        const yearData = byYear[yearKey] && typeof byYear[yearKey] === 'object' ? byYear[yearKey] : {};
        const src = yearData[department] || null;
        if (!src) {
          return null;
        }
        const total = Number.isFinite(src.total) ? src.total : 0;
        if (total <= 0) {
          return null;
        }
        const count_lt4 = Number.isFinite(src.count_lt4) ? src.count_lt4 : 0;
        const count_4_8 = Number.isFinite(src.count_4_8) ? src.count_4_8 : 0;
        const count_8_16 = Number.isFinite(src.count_8_16) ? src.count_8_16 : 0;
        const count_gt16 = Number.isFinite(src.count_gt16) ? src.count_gt16 : 0;
        const count_unclassified = Number.isFinite(src.count_unclassified) ? src.count_unclassified : 0;
        return {
          year: Number.parseInt(yearKey, 10),
          total,
          count_lt4,
          count_4_8,
          count_8_16,
          count_gt16,
          count_unclassified,
          pct_lt4: total > 0 ? (count_lt4 / total) * 100 : 0,
          pct_4_8: total > 0 ? (count_4_8 / total) * 100 : 0,
          pct_8_16: total > 0 ? (count_8_16 / total) * 100 : 0,
          pct_gt16: total > 0 ? (count_gt16 / total) * 100 : 0,
          pct_unclassified: total > 0 ? (count_unclassified / total) * 100 : 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.year - b.year);
  };

  const buildChartsHospitalStats = (records, yearFilter) =>
    getChartsHospitalStatsFromWorkerAgg(yearFilter) ||
    computeHospitalizedByDepartmentAndSpsStay(records, {
      yearFilter: yearFilter == null ? 'all' : String(yearFilter),
      calculations: settings?.calculations || DEFAULT_SETTINGS.calculations,
      defaultSettings: DEFAULT_SETTINGS,
    });

  const destroyChartsHospitalDeptTrendChart = () => {
    const existing = dashboardState.chartsHospitalDeptTrendChart;
    if (existing && typeof existing.destroy === 'function') {
      existing.destroy();
    }
    dashboardState.chartsHospitalDeptTrendChart = null;
    dashboardState.chartsHospitalDeptTrendKey = '';
  };

  const renderChartsHospitalDepartmentTrend = async (records = dashboardState.rawRecords) => {
    if (!selectors.chartsHospitalDeptTrendCanvas || !selectors.chartsHospitalDeptTrendEmpty) {
      return;
    }
    const department = normalizeChartsHospitalTableDepartment(dashboardState.chartsHospitalTableDepartment);
    if (!department) {
      destroyChartsHospitalDeptTrendChart();
      selectors.chartsHospitalDeptTrendCanvas.hidden = true;
      selectors.chartsHospitalDeptTrendEmpty.hidden = false;
      if (selectors.chartsHospitalDeptTrendSubtitle) {
        selectors.chartsHospitalDeptTrendSubtitle.textContent =
          TEXT?.charts?.hospitalTable?.trendSubtitle ||
          'Pasirinkite skyriu lenteleje, kad matytumete jo SPS trukmes % dinamika pagal metus.';
      }
      return;
    }
    const trend = computeHospitalizedDepartmentYearlyStayTrend(records, {
      department,
      calculations: settings?.calculations || DEFAULT_SETTINGS.calculations,
      defaultSettings: DEFAULT_SETTINGS,
    });
    const workerRows = getDepartmentTrendRowsFromWorkerAgg(department);
    const rows = workerRows.length ? workerRows : Array.isArray(trend?.rows) ? trend.rows : [];
    if (rows.length < 2) {
      destroyChartsHospitalDeptTrendChart();
      selectors.chartsHospitalDeptTrendCanvas.hidden = true;
      selectors.chartsHospitalDeptTrendEmpty.hidden = false;
      if (selectors.chartsHospitalDeptTrendSubtitle) {
        selectors.chartsHospitalDeptTrendSubtitle.textContent = `${department} • nepakanka metu palyginimui`;
      }
      return;
    }
    const ChartLib = await loadChartJs();
    if (!ChartLib) {
      destroyChartsHospitalDeptTrendChart();
      selectors.chartsHospitalDeptTrendCanvas.hidden = true;
      selectors.chartsHospitalDeptTrendEmpty.hidden = false;
      if (selectors.chartsHospitalDeptTrendSubtitle) {
        selectors.chartsHospitalDeptTrendSubtitle.textContent = `${department} • nepavyko ikelti grafiko bibliotekos`;
      }
      return;
    }
    const trendKey = `${department}|${rows.map((row) => `${row.year}:${row.total}:${row.count_lt4}:${row.count_4_8}:${row.count_8_16}:${row.count_gt16}:${row.count_unclassified}`).join(';')}`;
    if (
      dashboardState.chartsHospitalDeptTrendChart &&
      dashboardState.chartsHospitalDeptTrendKey === trendKey
    ) {
      selectors.chartsHospitalDeptTrendCanvas.hidden = false;
      selectors.chartsHospitalDeptTrendEmpty.hidden = true;
      return;
    }
    if (selectors.chartsHospitalDeptTrendSubtitle) {
      selectors.chartsHospitalDeptTrendSubtitle.textContent = `${department} • 100% sudeties dinamika pagal metus`;
    }
    const palette = getThemePalette();
    const years = rows.map((row) => String(row.year));
    const datasetDefs = [
      { key: 'pct_lt4', countKey: 'count_lt4', label: '<4', color: palette?.accent || '#2563eb' },
      { key: 'pct_4_8', countKey: 'count_4_8', label: '4-8', color: '#0ea5e9' },
      { key: 'pct_8_16', countKey: 'count_8_16', label: '8-16', color: '#f59e0b' },
      { key: 'pct_gt16', countKey: 'count_gt16', label: '>16', color: '#ef4444' },
      { key: 'pct_unclassified', countKey: 'count_unclassified', label: 'Neklasifikuota', color: '#94a3b8' },
    ];
    const normalizedRows = rows.map((row) => {
      const values = {
        pct_lt4: Number(row?.pct_lt4 || 0),
        pct_4_8: Number(row?.pct_4_8 || 0),
        pct_8_16: Number(row?.pct_8_16 || 0),
        pct_gt16: Number(row?.pct_gt16 || 0),
        pct_unclassified: Number(row?.pct_unclassified || 0),
      };
      const sum =
        values.pct_lt4 + values.pct_4_8 + values.pct_8_16 + values.pct_gt16 + values.pct_unclassified;
      if (!(sum > 0)) {
        return { ...row, ...values };
      }
      const scale = 100 / sum;
      return {
        ...row,
        pct_lt4: values.pct_lt4 * scale,
        pct_4_8: values.pct_4_8 * scale,
        pct_8_16: values.pct_8_16 * scale,
        pct_gt16: values.pct_gt16 * scale,
        pct_unclassified: values.pct_unclassified * scale,
      };
    });
    const datasets = datasetDefs.map((def) => ({
      label: def.label,
      data: normalizedRows.map((row) => Number(row?.[def.key] || 0)),
      borderColor: def.color,
      backgroundColor: def.color,
      borderWidth: 0,
      stack: 'stay',
      _countKey: def.countKey,
    }));
    const config = {
      type: 'bar',
      data: {
        labels: years,
        datasets,
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 120,
        plugins: {
          legend: {
            labels: {
              color: palette?.textColor || '#111827',
            },
          },
          tooltip: {
            callbacks: {
              label(context) {
                const value = Number(context?.parsed?.y || 0);
                const yearIndex = Number(context?.dataIndex || 0);
                const sourceRow = rows[yearIndex] || {};
                const dataset = context?.dataset || {};
                const countKey = dataset._countKey;
                const count = Number(sourceRow?.[countKey] || 0);
                const total = Number(sourceRow?.total || 0);
                return `${dataset.label}: ${oneDecimalFormatter.format(value)}% (${numberFormatter.format(count)}/${numberFormatter.format(total)})`;
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            ticks: {
              color: palette?.textMuted || palette?.textColor || '#6b7280',
            },
            grid: {
              color: 'rgba(148, 163, 184, 0.24)',
            },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            max: 100,
            ticks: {
              color: palette?.textMuted || palette?.textColor || '#6b7280',
              callback: (value) => `${value}%`,
            },
            grid: {
              color: 'rgba(148, 163, 184, 0.24)',
            },
          },
        },
      },
    };
    const existing = dashboardState.chartsHospitalDeptTrendChart;
    const existingType = String(existing?.config?.type || existing?.constructor?.id || '');
    if (
      existing &&
      typeof existing.update === 'function' &&
      existing.canvas === selectors.chartsHospitalDeptTrendCanvas &&
      existingType === String(config.type)
    ) {
      existing.data = config.data;
      existing.options = config.options;
      existing.update('none');
    } else {
      if (existing && typeof existing.destroy === 'function') {
        existing.destroy();
      }
      const ctx = selectors.chartsHospitalDeptTrendCanvas.getContext('2d');
      if (!ctx) {
        return;
      }
      dashboardState.chartsHospitalDeptTrendChart = new ChartLib(ctx, config);
    }
    dashboardState.chartsHospitalDeptTrendKey = trendKey;
    selectors.chartsHospitalDeptTrendCanvas.hidden = false;
    selectors.chartsHospitalDeptTrendEmpty.hidden = true;
  };

  const populateChartsHospitalTableYearOptions = (records) => {
    if (!selectors.chartsHospitalTableYear) {
      return;
    }
    const stats = buildChartsHospitalStats(records, 'all');
    const years = Array.isArray(stats?.yearOptions) ? stats.yearOptions : [];
    selectors.chartsHospitalTableYear.replaceChildren();
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = TEXT?.charts?.hospitalTable?.yearFilterAll || 'Visi metai';
    selectors.chartsHospitalTableYear.appendChild(allOption);
    years.forEach((year) => {
      const option = document.createElement('option');
      option.value = String(year);
      option.textContent = `${year} m.`;
      selectors.chartsHospitalTableYear.appendChild(option);
    });
    selectors.chartsHospitalTableYear.value = String(dashboardState.chartsHospitalTableYear ?? 'all');
  };

  const renderChartsHospitalTable = (records = dashboardState.rawRecords) => {
    if (!selectors.chartsHospitalTableBody) {
      return;
    }
    const yearFilter =
      dashboardState.chartsHospitalTableYear == null ? 'all' : dashboardState.chartsHospitalTableYear;
    const searchQuery = String(dashboardState.chartsHospitalTableSearch || '')
      .trim()
      .toLocaleLowerCase('lt');
    const stats = buildChartsHospitalStats(records, yearFilter);
    const tableText = TEXT?.charts?.hospitalTable || {};
    const filteredRows = (Array.isArray(stats?.rows) ? stats.rows : []).filter(
      (row) =>
        !searchQuery ||
        String(row?.department || '')
          .toLocaleLowerCase('lt')
          .includes(searchQuery)
    );
    const rows = sortChartsHospitalRows(filteredRows, dashboardState.chartsHospitalTableSort);

    selectors.chartsHospitalTableBody.replaceChildren();
    if (!rows.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.textContent = tableText.empty || 'Pasirinktam laikotarpiui nera stacionarizaciju duomenu.';
      row.appendChild(cell);
      selectors.chartsHospitalTableBody.appendChild(row);
      updateChartsHospitalTableHeaderSortIndicators();
      void renderChartsHospitalDepartmentTrend(records);
      return;
    }

    rows.forEach((entry) => {
      const row = document.createElement('tr');
      setDatasetValue(row, 'department', String(entry.department || ''));
      if (
        String(dashboardState.chartsHospitalTableDepartment || '').trim() ===
        String(entry.department || '').trim()
      ) {
        row.classList.add('is-department-active');
      }
      row.innerHTML = `
        <td>${entry.department || 'Nenurodyta'}</td>
        <td>${numberFormatter.format(Number(entry.count_lt4 || 0))} (${oneDecimalFormatter.format(Number(entry.pct_lt4 || 0))}%)</td>
        <td>${numberFormatter.format(Number(entry.count_4_8 || 0))} (${oneDecimalFormatter.format(Number(entry.pct_4_8 || 0))}%)</td>
        <td>${numberFormatter.format(Number(entry.count_8_16 || 0))} (${oneDecimalFormatter.format(Number(entry.pct_8_16 || 0))}%)</td>
        <td>${numberFormatter.format(Number(entry.count_gt16 || 0))} (${oneDecimalFormatter.format(Number(entry.pct_gt16 || 0))}%)</td>
        <td>${numberFormatter.format(Number(entry.count_unclassified || 0))} (${oneDecimalFormatter.format(Number(entry.pct_unclassified || 0))}%)</td>
        <td class="charts-hospital-total">${numberFormatter.format(Number(entry.total || 0))}</td>
      `;
      selectors.chartsHospitalTableBody.appendChild(row);
    });

    const totals = stats?.totals || {};
    const summaryRow = document.createElement('tr');
    summaryRow.className = 'table-row--summary';
    summaryRow.innerHTML = `
      <td>${tableText.totalLabel || 'Bendroji suma'}</td>
      <td>${numberFormatter.format(Number(totals.count_lt4 || 0))}</td>
      <td>${numberFormatter.format(Number(totals.count_4_8 || 0))}</td>
      <td>${numberFormatter.format(Number(totals.count_8_16 || 0))}</td>
      <td>${numberFormatter.format(Number(totals.count_gt16 || 0))}</td>
      <td>${numberFormatter.format(Number(totals.count_unclassified || 0))}</td>
      <td class="charts-hospital-total">${numberFormatter.format(Number(totals.total || 0))}</td>
    `;
    selectors.chartsHospitalTableBody.appendChild(summaryRow);
    updateChartsHospitalTableHeaderSortIndicators();
    void renderChartsHospitalDepartmentTrend(records);
  };

  const handleChartsHospitalTableYearChange = (event) => {
    const value = String(event?.target?.value || 'all');
    dashboardState.chartsHospitalTableYear = value === 'all' ? 'all' : Number.parseInt(value, 10);
    renderChartsHospitalTable(dashboardState.rawRecords);
  };

  const handleChartsHospitalTableSearchInput = (event) => {
    dashboardState.chartsHospitalTableSearch = String(event?.target?.value || '');
    renderChartsHospitalTable(dashboardState.rawRecords);
  };

  const handleChartsHospitalTableHeaderClick = (event) => {
    const target = event?.target;
    if (!(target instanceof Element)) {
      return;
    }
    const header = target.closest('th[data-charts-hospital-sort]');
    if (!header) {
      return;
    }
    const key = String(header.getAttribute('data-charts-hospital-sort') || '').trim();
    if (!key) {
      return;
    }
    const current = getChartsHospitalSortParts(dashboardState.chartsHospitalTableSort);
    const nextDir =
      current.key === key ? (current.dir === 'asc' ? 'desc' : 'asc') : key === 'name' ? 'asc' : 'desc';
    dashboardState.chartsHospitalTableSort = normalizeChartsHospitalTableSort(`${key}_${nextDir}`);
    renderChartsHospitalTable(dashboardState.rawRecords);
  };

  const handleChartsHospitalTableRowClick = (event) => {
    const target = event?.target;
    if (!(target instanceof Element)) {
      return;
    }
    const row = target.closest('tr[data-department]');
    if (!row) {
      return;
    }
    const department = String(getDatasetValue(row, 'department', '') || '').trim();
    if (!department) {
      return;
    }
    const current = normalizeChartsHospitalTableDepartment(dashboardState.chartsHospitalTableDepartment);
    dashboardState.chartsHospitalTableDepartment = current === department ? '' : department;
    renderChartsHospitalTable(dashboardState.rawRecords);
  };

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
        HEATMAP_METRIC_KEYS.some((key) => Array.isArray(heatmapData.metrics[key]?.matrix))
    );
  const renderArrivalHeatmap = (container, heatmapData, accentColor, metricKey) => {
    if (!container) return;
    container.replaceChildren();
    const metrics = heatmapData && typeof heatmapData === 'object' ? heatmapData.metrics || {} : {};
    let selectedMetric = normalizeHeatmapMetricKey(metricKey, metrics);
    if (!metrics[selectedMetric]) {
      selectedMetric = normalizeHeatmapMetricKey(DEFAULT_HEATMAP_METRIC, metrics);
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
    HEATMAP_METRIC_KEYS,
    DEFAULT_HEATMAP_METRIC,
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
  });

  applyChartsText({
    selectors,
    TEXT,
    dashboardState,
    formatDailyCaption,
    updateChartsHospitalTableHeaderSortIndicators,
    syncHourlyMetricButtons: hourlyControlsFeature.syncHourlyMetricButtons,
    populateHourlyWeekdayOptions: hourlyControlsFeature.populateHourlyWeekdayOptions,
    populateHourlyStayOptions: hourlyControlsFeature.populateHourlyStayOptions,
    syncHourlyDepartmentVisibility: hourlyControlsFeature.syncHourlyDepartmentVisibility,
    updateHourlyCaption: hourlyControlsFeature.updateHourlyCaption,
    populateHeatmapMetricOptions,
    updateHeatmapCaption,
  });

  initChartControls({
    selectors,
    updateChartPeriod: chartFlow.updateChartPeriod,
    updateChartYear: chartFlow.updateChartYear,
    handleHeatmapMetricChange,
    handleHeatmapFilterChange,
    handleHourlyMetricClick: hourlyControlsFeature.handleHourlyMetricClick,
    handleHourlyDepartmentInput: hourlyControlsFeature.handleHourlyDepartmentInput,
    handleHourlyDepartmentBlur: hourlyControlsFeature.handleHourlyDepartmentBlur,
    handleHourlyDepartmentKeydown: hourlyControlsFeature.handleHourlyDepartmentKeydown,
    handleHourlyDepartmentToggle: hourlyControlsFeature.handleHourlyDepartmentToggle,
    handleHourlyFilterChange: hourlyControlsFeature.handleHourlyFilterChange,
    handleHourlyCompareToggle: hourlyControlsFeature.handleHourlyCompareToggle,
    handleHourlyCompareYearsChange: hourlyControlsFeature.handleHourlyCompareYearsChange,
    handleHourlyCompareSeriesClick: hourlyControlsFeature.handleHourlyCompareSeriesClick,
    handleHourlyResetFilters: hourlyControlsFeature.handleHourlyResetFilters,
    handleChartFilterChange: chartFlow.handleChartFilterChange,
    handleChartSegmentedClick: chartFlow.handleChartSegmentedClick,
    applyHourlyDepartmentSelection: hourlyControlsFeature.applyHourlyDepartmentSelection,
    handleChartsHospitalTableYearChange,
    handleChartsHospitalTableSearchInput,
    handleChartsHospitalTableHeaderClick,
    handleChartsHospitalTableRowClick,
  });

  chartFlow.syncChartFilterControls();
  syncHeatmapFilterControls();
  updateChartsHospitalTableHeaderSortIndicators();

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
    showChartSkeletons: () => showChartSkeletons(selectors),
    showEdSkeleton: () => {},
    createChunkReporter: () => null,
    fetchData,
    fetchFeedbackData: async () => [],
    fetchEdData: async () => null,
    perfMonitor: runtimeClient.perfMonitor,
    describeCacheMeta,
    createEmptyEdSummary: () => ({}),
    describeError,
    computeDailyStats,
    filterDailyStatsByWindow,
    populateChartYearOptions: (dailyStats) =>
      populateChartYearOptions({
        dailyStats,
        selectors,
        dashboardState,
        TEXT,
        syncChartYearControl: () => syncChartYearControl({ selectors, dashboardState }),
      }),
    populateChartsHospitalTableYearOptions,
    populateHourlyCompareYearOptions: hourlyControlsFeature.populateHourlyCompareYearOptions,
    populateHeatmapYearOptions,
    syncHeatmapFilterControls,
    syncKpiFilterControls: () => {},
    getDefaultChartFilters: createDefaultChartFilters,
    sanitizeChartFilters,
    KPI_FILTER_LABELS,
    syncChartFilterControls: chartFlow.syncChartFilterControls,
    prepareChartDataForPeriod: chartFlow.prepareChartDataForPeriod,
    applyKpiFiltersAndRender: async () => {},
    renderCharts: chartRenderers.renderCharts,
    renderChartsHospitalTable,
    getHeatmapData: computeHeatmapDataForFilters,
    renderRecentTable: () => {},
    computeMonthlyStats: () => [],
    renderMonthlyTable: () => {},
    computeYearlyStats: () => [],
    renderYearlyTable: () => {},
    updateFeedbackFilterOptions: () => {},
    applyFeedbackFiltersAndRender: () => {},
    applyFeedbackStatusNote: () => {},
    renderEdDashboard: async () => {},
    numberFormatter,
    getSettings: () => settings,
    getClientConfig: runtimeClient.getClientConfig,
    getAutoRefreshTimerId: () => autoRefreshTimerId,
    setAutoRefreshTimerId: (id) => {
      autoRefreshTimerId = id;
    },
  });

  dataFlow.scheduleInitialLoad();
}
