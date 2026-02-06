import { createClientStore, PerfMonitor } from '../../../../app.js';
import { loadChartJs } from '../../../utils/chart-loader.js';
import { getDatasetValue, runAfterDomAndIdle, setDatasetValue } from '../../../utils/dom.js';
import { createSelectors } from '../../../state/selectors.js';
import { createDashboardState } from '../../../state/dashboardState.js';
import { createMainDataHandlers } from '../../../data/main-data.js';
import { computeDailyStats } from '../../../data/stats.js';
import { createKpiRenderer } from '../../../render/kpi.js';
import { createKpiFlow } from '../kpi-flow.js';
import { createDataFlow } from '../data-flow.js';
import { createLayoutTools } from '../layout.js';
import { sanitizeKpiFilters } from '../filters.js';
import {
  KPI_FILTER_LABELS,
  KPI_WINDOW_OPTION_BASE,
  createDefaultChartFilters,
  createDefaultFeedbackFilters,
  createDefaultKpiFilters,
} from '../state.js';
import { initSectionNavigation } from '../../../events/section-nav.js';
import { initScrollTopButton } from '../../../events/scroll.js';
import { initKpiFilters } from '../../../events/kpi.js';
import { initThemeToggle } from '../../../events/theme.js';
import {
  decimalFormatter,
  dailyDateFormatter,
  numberFormatter,
  oneDecimalFormatter,
  percentFormatter,
  shortDateFormatter,
  weekdayLongFormatter,
} from '../../../utils/format.js';
import { renderLastShiftHourlyChartWithTheme } from '../../../charts/hourly.js';
import {
  AUTO_REFRESH_INTERVAL_MS,
  CLIENT_CONFIG_KEY,
  DEFAULT_FOOTER_SOURCE,
  DEFAULT_KPI_WINDOW_DAYS,
  TEXT,
  THEME_STORAGE_KEY,
} from '../../constants.js';
import { DEFAULT_SETTINGS } from '../../default-settings.js';
import { loadSettingsFromConfig } from '../settings.js';
import {
  createTextSignature,
  describeCacheMeta,
  describeError,
  downloadCsv,
  formatUrlForDiagnostics,
} from '../network.js';

const clientStore = createClientStore(CLIENT_CONFIG_KEY);
const perfMonitor = new PerfMonitor();
let clientConfig = { profilingEnabled: true, ...clientStore.load() };
let autoRefreshTimerId = null;

function updateClientConfig(patch = {}) {
  if (!patch || typeof patch !== 'object') {
    return clientConfig;
  }
  clientConfig = { ...clientConfig, ...patch };
  clientStore.save(clientConfig);
  return clientConfig;
}

function getThemeStyleTarget() {
  return document.body || document.documentElement;
}

function getThemePalette() {
  const styleTarget = getThemeStyleTarget();
  const rootStyles = getComputedStyle(styleTarget);
  return {
    accent: rootStyles.getPropertyValue('--color-accent').trim() || '#2563eb',
    accentSoft: rootStyles.getPropertyValue('--color-accent-soft').trim() || 'rgba(37, 99, 235, 0.18)',
    weekendAccent: rootStyles.getPropertyValue('--color-weekend').trim() || '#f97316',
    weekendAccentSoft: rootStyles.getPropertyValue('--color-weekend-soft').trim() || 'rgba(249, 115, 22, 0.2)',
    success: rootStyles.getPropertyValue('--color-success').trim() || '#16a34a',
    danger: rootStyles.getPropertyValue('--color-danger').trim() || '#c34b55',
    dangerSoft: rootStyles.getPropertyValue('--color-danger-soft').trim() || 'rgba(195, 75, 85, 0.28)',
    textColor: rootStyles.getPropertyValue('--color-text').trim() || '#0f172a',
    textMuted: rootStyles.getPropertyValue('--color-text-muted').trim() || '#475569',
    gridColor: rootStyles.getPropertyValue('--chart-grid').trim() || 'rgba(15, 23, 42, 0.12)',
    surface: rootStyles.getPropertyValue('--color-surface').trim() || '#f8fafc',
  };
}

function dateKeyToUtc(dateKey) {
  if (typeof dateKey !== 'string') {
    return Number.NaN;
  }
  const parts = dateKey.split('-').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return Number.NaN;
  }
  const [year, month, day] = parts;
  return Date.UTC(year, month - 1, day);
}

function dateKeyToDate(dateKey) {
  const utc = dateKeyToUtc(dateKey);
  if (!Number.isFinite(utc)) {
    return null;
  }
  return new Date(utc);
}

function filterDailyStatsByWindow(dailyStats, days) {
  if (!Array.isArray(dailyStats)) {
    return [];
  }
  if (!Number.isFinite(days) || days <= 0) {
    return [...dailyStats];
  }
  const decorated = dailyStats
    .map((entry) => ({ entry, utc: dateKeyToUtc(entry?.date) }))
    .filter((item) => Number.isFinite(item.utc));
  if (!decorated.length) {
    return [];
  }
  const endUtc = decorated.reduce((max, item) => Math.max(max, item.utc), decorated[0].utc);
  const startUtc = endUtc - (days - 1) * 86400000;
  return decorated
    .filter((item) => item.utc >= startUtc && item.utc <= endUtc)
    .map((item) => item.entry);
}

function toSentenceCase(label) {
  if (typeof label !== 'string' || !label.length) {
    return '';
  }
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatKpiValue(value, format) {
  if (value == null || Number.isNaN(value)) {
    return '–';
  }
  if (format === 'decimal') {
    return decimalFormatter.format(value);
  }
  if (format === 'integer') {
    return numberFormatter.format(Math.round(value));
  }
  return oneDecimalFormatter.format(value);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function matchesSharedPatientFilters(record, filters = {}) {
  const arrivalFilter = filters.arrival;
  if (arrivalFilter === 'ems' && !record.ems) {
    return false;
  }
  if (arrivalFilter === 'self' && record.ems) {
    return false;
  }
  const dispositionFilter = filters.disposition;
  if (dispositionFilter === 'hospitalized' && !record.hospitalized) {
    return false;
  }
  if (dispositionFilter === 'discharged' && record.hospitalized) {
    return false;
  }
  const cardTypeFilter = filters.cardType;
  if (cardTypeFilter === 't' && record.cardType !== 't') {
    return false;
  }
  if (cardTypeFilter === 'tr' && record.cardType !== 'tr') {
    return false;
  }
  if (cardTypeFilter === 'ch' && record.cardType !== 'ch') {
    return false;
  }
  return true;
}

function derivePeriodMetrics(summary) {
  const days = Number.isFinite(summary?.days) ? summary.days : 0;
  const totalCount = Number.isFinite(summary?.totalCount) ? summary.totalCount : 0;
  const totalNight = Number.isFinite(summary?.totalNight) ? summary.totalNight : 0;
  const totalHospitalized = Number.isFinite(summary?.totalHospitalized) ? summary.totalHospitalized : 0;
  const totalDischarged = Number.isFinite(summary?.totalDischarged) ? summary.totalDischarged : 0;
  const totalTime = Number.isFinite(summary?.totalTime) ? summary.totalTime : 0;
  const durationCount = Number.isFinite(summary?.durationCount) ? summary.durationCount : 0;
  const totalHospitalizedTime = Number.isFinite(summary?.totalHospitalizedTime) ? summary.totalHospitalizedTime : 0;
  const hospitalizedDurationCount = Number.isFinite(summary?.hospitalizedDurationCount)
    ? summary.hospitalizedDurationCount
    : 0;
  return {
    days,
    patientsPerDay: days > 0 ? totalCount / days : 0,
    nightPerDay: days > 0 ? totalNight / days : 0,
    dischargedPerDay: days > 0 ? totalDischarged / days : 0,
    hospitalizedPerDay: days > 0 ? totalHospitalized / days : 0,
    dischargedShare: totalCount > 0 ? totalDischarged / totalCount : null,
    hospitalizedShare: totalCount > 0 ? totalHospitalized / totalCount : null,
    avgTime: durationCount > 0 ? totalTime / durationCount : null,
    avgHospitalizedTime: hospitalizedDurationCount > 0
      ? totalHospitalizedTime / hospitalizedDurationCount
      : null,
  };
}

function aggregatePeriodSummary(entries) {
  const list = Array.isArray(entries) ? entries : [];
  return list.reduce((acc, entry) => {
    acc.days += 1;
    acc.totalCount += Number.isFinite(entry?.count) ? entry.count : 0;
    acc.totalNight += Number.isFinite(entry?.night) ? entry.night : 0;
    acc.totalHospitalized += Number.isFinite(entry?.hospitalized) ? entry.hospitalized : 0;
    acc.totalDischarged += Number.isFinite(entry?.discharged) ? entry.discharged : 0;
    acc.totalTime += Number.isFinite(entry?.totalTime) ? entry.totalTime : 0;
    acc.durationCount += Number.isFinite(entry?.durations) ? entry.durations : 0;
    acc.totalHospitalizedTime += Number.isFinite(entry?.hospitalizedTime) ? entry.hospitalizedTime : 0;
    acc.hospitalizedDurationCount += Number.isFinite(entry?.hospitalizedDurations) ? entry.hospitalizedDurations : 0;
    return acc;
  }, {
    days: 0,
    totalCount: 0,
    totalNight: 0,
    totalHospitalized: 0,
    totalDischarged: 0,
    totalTime: 0,
    durationCount: 0,
    totalHospitalizedTime: 0,
    hospitalizedDurationCount: 0,
  });
}

function describePeriodLabel({ windowDays, startDateKey, endDateKey }) {
  let baseLabel = '';
  if (Number.isFinite(windowDays) && windowDays > 0) {
    baseLabel = windowDays === 365
      ? `Paskutinės ${numberFormatter.format(windowDays)} d.`
      : `Paskutinės ${numberFormatter.format(windowDays)} d.`;
  } else {
    baseLabel = TEXT.kpis.windowAllLabel;
  }
  const startDate = dateKeyToDate(startDateKey);
  const endDate = dateKeyToDate(endDateKey);
  let rangeLabel = '';
  if (startDate && endDate) {
    const start = shortDateFormatter.format(startDate);
    const end = shortDateFormatter.format(endDate);
    rangeLabel = start === end ? start : `${start} – ${end}`;
  }
  const metaLabel = rangeLabel ? `${baseLabel} (${rangeLabel})` : baseLabel;
  return { metaLabel, referenceLabel: baseLabel };
}

function buildYearMonthMetrics(dailyStats, windowDays) {
  if (!Array.isArray(dailyStats) || dailyStats.length === 0) {
    return null;
  }
  const decorated = dailyStats
    .map((entry) => ({ entry, utc: dateKeyToUtc(entry?.date ?? '') }))
    .filter((item) => Number.isFinite(item.utc))
    .sort((a, b) => a.utc - b.utc);
  if (!decorated.length) {
    return null;
  }
  const earliest = decorated[0].entry;
  const latest = decorated[decorated.length - 1].entry;
  const [yearStr = '', monthStr = ''] = (latest?.date ?? '').split('-');
  const year = Number.parseInt(yearStr, 10);
  const monthKey = monthStr ? `${yearStr}-${monthStr}` : null;
  const monthEntries = monthKey
    ? dailyStats.filter((entry) => typeof entry?.date === 'string' && entry.date.startsWith(monthKey))
    : [];
  const periodEntries = decorated.map((item) => item.entry);
  const yearSummary = derivePeriodMetrics(aggregatePeriodSummary(periodEntries));
  const monthSummary = derivePeriodMetrics(aggregatePeriodSummary(monthEntries));
  const monthNumeric = Number.parseInt(monthStr, 10);
  const monthLabel = Number.isFinite(monthNumeric) && Number.isFinite(year)
    ? new Intl.DateTimeFormat('lt-LT', { month: 'long', year: 'numeric' }).format(new Date(year, Math.max(0, monthNumeric - 1), 1))
    : '';
  const periodLabels = describePeriodLabel({
    windowDays,
    startDateKey: earliest?.date,
    endDateKey: latest?.date,
  });
  return {
    yearLabel: periodLabels.metaLabel,
    referenceLabel: periodLabels.referenceLabel,
    monthLabel,
    yearMetrics: yearSummary,
    monthMetrics: monthSummary,
  };
}

function buildLastShiftSummaryBase(dailyStats) {
  const entries = Array.isArray(dailyStats) ? dailyStats.filter((entry) => entry && typeof entry.date === 'string') : [];
  if (!entries.length) {
    return null;
  }
  const decorated = entries
    .map((entry) => {
      const date = dateKeyToDate(entry.date);
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null;
      }
      return { entry, date };
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);

  if (!decorated.length) {
    return null;
  }

  const last = decorated[decorated.length - 1];
  const lastEntry = last.entry;
  const lastDate = last.date;
  const weekdayIndex = lastDate.getDay();
  const weekdayLabel = toSentenceCase(weekdayLongFormatter.format(lastDate));
  const sameWeekdayEntries = decorated.filter((item) => item.date.getDay() === weekdayIndex).map((item) => item.entry);

  const averageFor = (key, predicate) => {
    if (!sameWeekdayEntries.length) {
      return null;
    }
    const totals = sameWeekdayEntries.reduce((acc, item) => {
      if (typeof predicate === 'function' && !predicate(item)) {
        return acc;
      }
      const value = Number.isFinite(item?.[key]) ? item[key] : null;
      if (Number.isFinite(value)) {
        acc.sum += value;
        acc.count += 1;
      }
      return acc;
    }, { sum: 0, count: 0 });
    if (!totals.count) {
      return null;
    }
    return totals.sum / totals.count;
  };

  const valueFor = (key, predicate) => {
    if (typeof predicate === 'function' && !predicate(lastEntry)) {
      return null;
    }
    return Number.isFinite(lastEntry?.[key]) ? lastEntry[key] : null;
  };

  const totalValue = valueFor('count');
  const totalAverage = averageFor('count');
  const shareOf = (value, total) => {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
      return null;
    }
    return value / total;
  };

  return {
    dateLabel: toSentenceCase(dailyDateFormatter.format(lastDate)),
    dateKey: lastEntry.date,
    weekdayLabel,
    metrics: {
      total: { value: totalValue, average: totalAverage },
      avgTime: {
        value: valueFor('avgTime', (entry) => Number.isFinite(entry?.durations) && entry.durations > 0),
        average: averageFor('avgTime', (entry) => Number.isFinite(entry?.durations) && entry.durations > 0),
      },
      night: { value: valueFor('night'), average: averageFor('night') },
      hospitalized: {
        value: valueFor('hospitalized'),
        average: averageFor('hospitalized'),
        share: shareOf(valueFor('hospitalized'), totalValue),
        averageShare: shareOf(averageFor('hospitalized'), totalAverage),
      },
      discharged: {
        value: valueFor('discharged'),
        average: averageFor('discharged'),
        share: shareOf(valueFor('discharged'), totalValue),
        averageShare: shareOf(averageFor('discharged'), totalAverage),
      },
    },
  };
}

function buildLastShiftSummary(dailyStats, referenceDailyStats = null) {
  const baseSummary = buildLastShiftSummaryBase(dailyStats);
  if (!baseSummary) {
    return null;
  }
  if (!Array.isArray(referenceDailyStats) || !referenceDailyStats.length) {
    return baseSummary;
  }
  const baseDate = dateKeyToDate(baseSummary.dateKey);
  if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())) {
    return baseSummary;
  }
  const weekdayIndex = baseDate.getDay();
  const referenceEntries = referenceDailyStats
    .filter((entry) => entry && typeof entry.date === 'string')
    .map((entry) => ({ entry, date: dateKeyToDate(entry.date) }))
    .filter((item) => item.date instanceof Date && !Number.isNaN(item.date.getTime()))
    .filter((item) => item.date.getDay() === weekdayIndex)
    .map((item) => item.entry);
  if (!referenceEntries.length) {
    return baseSummary;
  }
  const averageFor = (key, predicate) => {
    const totals = referenceEntries.reduce((acc, item) => {
      if (typeof predicate === 'function' && !predicate(item)) {
        return acc;
      }
      const value = Number.isFinite(item?.[key]) ? item[key] : null;
      if (Number.isFinite(value)) {
        acc.sum += value;
        acc.count += 1;
      }
      return acc;
    }, { sum: 0, count: 0 });
    if (!totals.count) {
      return null;
    }
    return totals.sum / totals.count;
  };
  const shareOf = (value, total) => {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
      return null;
    }
    return value / total;
  };
  const totalAverage = averageFor('count');
  const avgTimeAverage = averageFor('avgTime', (entry) => Number.isFinite(entry?.durations) && entry.durations > 0);
  const nightAverage = averageFor('night');
  const hospitalizedAverage = averageFor('hospitalized');
  const dischargedAverage = averageFor('discharged');
  return {
    ...baseSummary,
    metrics: {
      ...baseSummary.metrics,
      total: { ...baseSummary.metrics.total, average: totalAverage },
      avgTime: { ...baseSummary.metrics.avgTime, average: avgTimeAverage },
      night: { ...baseSummary.metrics.night, average: nightAverage },
      hospitalized: {
        ...baseSummary.metrics.hospitalized,
        average: hospitalizedAverage,
        averageShare: shareOf(hospitalizedAverage, totalAverage),
      },
      discharged: {
        ...baseSummary.metrics.discharged,
        average: dischargedAverage,
        averageShare: shareOf(dischargedAverage, totalAverage),
      },
    },
  };
}

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
  messageEl.textContent = String(message);
}

function setStatus(selectors, dashboardState, type, details = '') {
  const statusEl = selectors.status;
  if (!statusEl) {
    return;
  }
  statusEl.textContent = '';
  statusEl.classList.remove('status--loading', 'status--error', 'status--success', 'status--warning');
  if (type === 'loading') {
    statusEl.classList.add('status--loading');
    statusEl.setAttribute('aria-label', TEXT.status.loading);
    return;
  }
  statusEl.removeAttribute('aria-label');
  if (type === 'error') {
    statusEl.classList.add('status--error');
    statusEl.textContent = details ? TEXT.status.errorDetails(details) : TEXT.status.error;
    return;
  }
  if (dashboardState.usingFallback) {
    statusEl.classList.add('status--warning');
    statusEl.textContent = TEXT.status.fallbackSuccess();
    return;
  }
  statusEl.classList.add('status--success');
  statusEl.textContent = TEXT.status.success();
}

function updateThemeToggleState(selectors, theme) {
  if (!selectors.themeToggleBtn) {
    return;
  }
  const isDark = theme === 'dark';
  selectors.themeToggleBtn.setAttribute('aria-pressed', String(isDark));
  selectors.themeToggleBtn.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

function applyTheme(dashboardState, selectors, theme, { persist = false } = {}) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  [document.documentElement, document.body].filter(Boolean).forEach((el) => {
    el.setAttribute('data-theme', normalized);
  });
  dashboardState.theme = normalized;
  updateThemeToggleState(selectors, normalized);
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch (error) {
      console.warn('Nepavyko išsaugoti temos nustatymo:', error);
    }
  }
}

function initializeTheme(dashboardState, selectors) {
  const htmlTheme = document.documentElement.getAttribute('data-theme');
  const bodyTheme = document.body?.getAttribute('data-theme');
  const attrTheme = htmlTheme || bodyTheme;
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = attrTheme === 'dark' || attrTheme === 'light'
    ? attrTheme
    : storedTheme === 'dark' || storedTheme === 'light'
      ? storedTheme
      : (prefersDark ? 'dark' : 'light');
  applyTheme(dashboardState, selectors, resolved, { persist: false });
}

export async function runKpiPage(core) {
  const pageId = core?.pageId || 'kpi';
  const pageConfig = core?.pageConfig || { kpi: true };
  const selectors = createSelectors();
  const settings = await loadSettingsFromConfig(DEFAULT_SETTINGS);
  const getDefaultKpiFilters = () => createDefaultKpiFilters({ settings, DEFAULT_SETTINGS, DEFAULT_KPI_WINDOW_DAYS });
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

  const { fetchData, runKpiWorkerJob } = createMainDataHandlers({
    settings,
    DEFAULT_SETTINGS,
    dashboardState,
    downloadCsv,
    describeError: (error, options = {}) => describeError(error, { ...options, fallbackMessage: TEXT.status.error }),
    createTextSignature,
    formatUrlForDiagnostics,
  });

  const kpiRenderer = createKpiRenderer({
    selectors,
    dashboardState,
    TEXT,
    escapeHtml,
    formatKpiValue,
    percentFormatter,
    buildYearMonthMetrics,
    buildLastShiftSummary,
    hideKpiSkeleton: () => hideKpiSkeleton(selectors),
  });

  const renderLastShiftHourlyChartWithThemeBound = (seriesInfo) => renderLastShiftHourlyChartWithTheme({
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
  }, seriesInfo);

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
    formatLocalDateKey: (date) => {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return '';
      }
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    },
    computeDailyStats,
    filterDailyStatsByWindow,
    matchesSharedPatientFilters,
    describeError: (error, options = {}) => describeError(error, { ...options, fallbackMessage: TEXT.status.error }),
    showKpiSkeleton: () => showKpiSkeleton(selectors),
    renderKpis: (dailyStats, referenceDailyStats) => kpiRenderer.renderKpis(dailyStats, referenceDailyStats),
    renderLastShiftHourlyChartWithTheme: renderLastShiftHourlyChartWithThemeBound,
    setChartCardMessage,
    getSettings: () => settings,
    runKpiWorkerJob,
    buildLastShiftSummary,
    toSentenceCase,
  });

  const dataFlow = createDataFlow({
    pageConfig,
    selectors,
    dashboardState,
    TEXT,
    DEFAULT_SETTINGS,
    AUTO_REFRESH_INTERVAL_MS,
    runAfterDomAndIdle,
    setDatasetValue,
    setStatus: (type, details) => setStatus(selectors, dashboardState, type, details),
    showKpiSkeleton: () => showKpiSkeleton(selectors),
    showChartSkeletons: () => {},
    showEdSkeleton: () => {},
    createChunkReporter: () => null,
    fetchData,
    fetchFeedbackData: async () => [],
    fetchEdData: async () => null,
    perfMonitor,
    describeCacheMeta,
    createEmptyEdSummary: () => ({}),
    describeError: (error, options = {}) => describeError(error, { ...options, fallbackMessage: TEXT.status.error }),
    computeDailyStats,
    filterDailyStatsByWindow,
    populateChartYearOptions: () => {},
    populateHourlyCompareYearOptions: () => {},
    populateHeatmapYearOptions: () => {},
    syncHeatmapFilterControls: () => {},
    getDefaultChartFilters,
    sanitizeChartFilters: (value) => value,
    KPI_FILTER_LABELS,
    syncChartFilterControls: () => {},
    prepareChartDataForPeriod: () => ({ daily: [], funnel: null, heatmap: null }),
    applyKpiFiltersAndRender: kpiFlow.applyKpiFiltersAndRender,
    renderCharts: async () => {},
    getHeatmapData: () => null,
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
    getClientConfig: () => clientConfig,
    getAutoRefreshTimerId: () => autoRefreshTimerId,
    setAutoRefreshTimerId: (id) => { autoRefreshTimerId = id; },
  });

  if (selectors.title) {
    selectors.title.textContent = settings?.output?.title || TEXT.title;
  }
  if (selectors.kpiHeading) {
    selectors.kpiHeading.textContent = settings?.output?.kpiTitle || TEXT.kpis.title;
  }
  if (selectors.kpiSubtitle) {
    selectors.kpiSubtitle.textContent = settings?.output?.kpiSubtitle || TEXT.kpis.subtitle;
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

  initializeTheme(dashboardState, selectors);
  const toggleTheme = () => {
    const nextTheme = dashboardState.theme === 'dark' ? 'light' : 'dark';
    applyTheme(dashboardState, selectors, nextTheme, { persist: true });
    if (dashboardState.kpi?.lastShiftHourly) {
      renderLastShiftHourlyChartWithThemeBound(dashboardState.kpi.lastShiftHourly).catch((error) => {
        const info = describeError(error, { code: 'LAST_SHIFT_THEME', fallbackMessage: TEXT.status.error });
        console.error(info.log, error);
      });
    }
  };

  const layoutTools = createLayoutTools({ selectors });
  initSectionNavigation({
    selectors,
    ...layoutTools,
  });
  initScrollTopButton({
    selectors,
    updateScrollTopButtonVisibility: layoutTools.updateScrollTopButtonVisibility,
    scheduleScrollTopUpdate: layoutTools.scheduleScrollTopUpdate,
  });
  initThemeToggle({ selectors, toggleTheme });
  initKpiFilters({
    selectors,
    dashboardState,
    ...kpiFlow,
  });

  updateClientConfig({ pageId });
  dataFlow.scheduleInitialLoad();
}
