import { createClientStore, PerfMonitor } from '../../../../app.js';
import { createSelectors } from '../../../state/selectors.js';
import { createDashboardState } from '../../../state/dashboardState.js';
import { createMainDataHandlers } from '../../../data/main-data.js';
import { computeDailyStats, computeMonthlyStats, computeYearlyStats } from '../../../data/stats.js';
import { runAfterDomAndIdle, setDatasetValue } from '../../../utils/dom.js';
import {
  decimalFormatter,
  numberFormatter,
  oneDecimalFormatter,
  percentFormatter,
  monthFormatter,
  capitalizeSentence,
} from '../../../utils/format.js';
import { initSectionNavigation } from '../../../events/section-nav.js';
import { initScrollTopButton } from '../../../events/scroll.js';
import { initThemeToggle } from '../../../events/theme.js';
import { initYearlyExpand } from '../../../events/yearly.js';
import { createLayoutTools } from '../layout.js';
import { createDataFlow } from '../data-flow.js';
import {
  createDefaultChartFilters,
  createDefaultFeedbackFilters,
  createDefaultKpiFilters,
} from '../state.js';
import { loadSettingsFromConfig } from '../settings.js';
import {
  createTextSignature,
  describeCacheMeta,
  describeError,
  downloadCsv,
  formatUrlForDiagnostics,
} from '../network.js';
import {
  AUTO_REFRESH_INTERVAL_MS,
  CLIENT_CONFIG_KEY,
  DEFAULT_FOOTER_SOURCE,
  DEFAULT_KPI_WINDOW_DAYS,
  TEXT,
  THEME_STORAGE_KEY,
} from '../../constants.js';
import { DEFAULT_SETTINGS } from '../../default-settings.js';

const clientStore = createClientStore(CLIENT_CONFIG_KEY);
const perfMonitor = new PerfMonitor();
let clientConfig = { profilingEnabled: true, ...clientStore.load() };
let autoRefreshTimerId = null;

function getThemeStyleTarget() {
  return document.body || document.documentElement;
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
      console.warn('Nepavyko issaugoti temos nustatymo:', error);
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
  const label = monthFormatter.format(new Date(year, month - 1, 1));
  return capitalizeSentence(label);
}

function formatYearLabel(yearValue) {
  return Number.isFinite(Number(yearValue)) ? String(yearValue) : '—';
}

function formatValueWithShare(value, total) {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (!Number.isFinite(total) || total <= 0) {
    return numberFormatter.format(safeValue);
  }
  const share = safeValue / total;
  return `${numberFormatter.format(safeValue)} (${percentFormatter.format(share)})`;
}

function formatChangeCell(diff, percent, canCompare) {
  if (!canCompare || !Number.isFinite(diff)) {
    return '—';
  }
  const sign = diff > 0 ? '+' : '';
  const percentText = Number.isFinite(percent) ? ` (${sign}${oneDecimalFormatter.format(percent * 100)}%)` : '';
  return `${sign}${numberFormatter.format(diff)}${percentText}`;
}

function isCompleteYearEntry(entry) {
  if (!entry) {
    return false;
  }
  const monthCount = Number.isFinite(entry?.monthCount) ? entry.monthCount : 0;
  const dayCount = Number.isFinite(entry?.dayCount) ? entry.dayCount : 0;
  return monthCount >= 12 || dayCount >= 360;
}

function renderYearlyTable(selectors, dashboardState, yearlyStats) {
  const table = selectors.yearlyTable;
  if (!table) {
    return;
  }
  table.replaceChildren();

  if (!Array.isArray(yearlyStats) || !yearlyStats.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 9;
    cell.textContent = TEXT.yearly.empty;
    row.appendChild(cell);
    table.appendChild(row);
    return;
  }

  const entries = yearlyStats.slice();
  const latestYear = entries.length ? entries[entries.length - 1].year : null;
  if (!Array.isArray(dashboardState.yearlyExpandedYears) || !dashboardState.yearlyExpandedYears.length) {
    dashboardState.yearlyExpandedYears = Number.isFinite(latestYear) ? [latestYear] : [];
  }
  const expandedYears = new Set(dashboardState.yearlyExpandedYears);
  const monthlyAll = Array.isArray(dashboardState.monthly?.all) ? dashboardState.monthly.all : [];
  const totals = entries.map((item) => (Number.isFinite(item?.count) ? item.count : 0));
  const completeness = entries.map((entry) => isCompleteYearEntry(entry));

  entries.forEach((entry, index) => {
    const row = document.createElement('tr');
    row.className = 'yearly-row';
    const total = Number.isFinite(entry.count) ? entry.count : 0;
    const avgPerDay = entry.dayCount > 0 ? total / entry.dayCount : 0;
    const avgStay = entry.durations > 0 ? entry.totalTime / entry.durations : 0;
    const previousTotal = index > 0 ? totals[index - 1] : Number.NaN;
    const canCompare = index > 0 && completeness[index] && completeness[index - 1] && Number.isFinite(previousTotal);
    const diff = canCompare ? total - previousTotal : Number.NaN;
    const percentChange = canCompare && previousTotal !== 0 ? diff / previousTotal : Number.NaN;
    const isExpanded = expandedYears.has(entry.year);
    const yearLabel = formatYearLabel(entry.year);
    const yearDisplay = completeness[index]
      ? yearLabel
      : `${yearLabel} <span class="yearly-incomplete">(nepilni)</span>`;

    row.innerHTML = `
      <td>
        <button type="button" class="yearly-toggle" data-year-toggle="${entry.year}" aria-expanded="${isExpanded}">
          <span class="yearly-toggle__icon" aria-hidden="true">▸</span>
          <span class="yearly-toggle__label">${yearDisplay}</span>
        </button>
      </td>
      <td>${numberFormatter.format(total)}</td>
      <td>${oneDecimalFormatter.format(avgPerDay)}</td>
      <td>${decimalFormatter.format(avgStay)}</td>
      <td>${formatValueWithShare(entry.night, total)}</td>
      <td>${formatValueWithShare(entry.ems, total)}</td>
      <td>${formatValueWithShare(entry.hospitalized, total)}</td>
      <td>${formatValueWithShare(entry.discharged, total)}</td>
      <td>${formatChangeCell(diff, percentChange, canCompare)}</td>
    `;
    setDatasetValue(row, 'year', entry.year);
    setDatasetValue(row, 'expanded', isExpanded ? 'true' : 'false');
    table.appendChild(row);

    const monthlyForYear = monthlyAll.filter((item) => item?.month?.startsWith(`${entry.year}-`));
    monthlyForYear.forEach((monthEntry) => {
      const monthTotal = Number.isFinite(monthEntry.count) ? monthEntry.count : 0;
      const monthAvg = monthEntry.dayCount > 0 ? monthTotal / monthEntry.dayCount : 0;
      const monthStay = monthEntry.durations > 0 ? monthEntry.totalTime / monthEntry.durations : 0;
      const monthRow = document.createElement('tr');
      monthRow.className = 'yearly-child-row';
      monthRow.hidden = !isExpanded;
      setDatasetValue(monthRow, 'parentYear', entry.year);
      monthRow.innerHTML = `
        <td><span class="yearly-month-label">${formatMonthLabel(monthEntry.month)}</span></td>
        <td>${numberFormatter.format(monthTotal)}</td>
        <td>${oneDecimalFormatter.format(monthAvg)}</td>
        <td>${decimalFormatter.format(monthStay)}</td>
        <td>${formatValueWithShare(monthEntry.night, monthTotal)}</td>
        <td>${formatValueWithShare(monthEntry.ems, monthTotal)}</td>
        <td>${formatValueWithShare(monthEntry.hospitalized, monthTotal)}</td>
        <td>${formatValueWithShare(monthEntry.discharged, monthTotal)}</td>
        <td>—</td>
      `;
      table.appendChild(monthRow);
    });
  });
}

function handleYearlyToggle(selectors, dashboardState, event) {
  const target = event?.target;
  if (!(target instanceof Element)) {
    return;
  }
  const button = target.closest('button[data-year-toggle]');
  if (!button) {
    return;
  }
  const yearValue = Number.parseInt(button.getAttribute('data-year-toggle') || '', 10);
  if (!Number.isFinite(yearValue)) {
    return;
  }
  const row = button.closest('tr');
  const isExpanded = button.getAttribute('aria-expanded') === 'true';
  const nextExpanded = !isExpanded;
  button.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
  if (row) {
    setDatasetValue(row, 'expanded', nextExpanded ? 'true' : 'false');
  }
  const rows = selectors.yearlyTable
    ? selectors.yearlyTable.querySelectorAll(`tr[data-parent-year="${yearValue}"]`)
    : [];
  rows.forEach((child) => {
    child.hidden = !nextExpanded;
  });
  const expandedSet = new Set(Array.isArray(dashboardState.yearlyExpandedYears)
    ? dashboardState.yearlyExpandedYears
    : []);
  if (nextExpanded) {
    expandedSet.add(yearValue);
  } else {
    expandedSet.delete(yearValue);
  }
  dashboardState.yearlyExpandedYears = Array.from(expandedSet);
}

function setStatus(selectors, type, details = '') {
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
  }
}

export async function runSummariesPage(core) {
  const pageConfig = core?.pageConfig || { yearly: true };
  const selectors = createSelectors();
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
    describeError: (error, options = {}) => describeError(error, { ...options, fallbackMessage: TEXT.status.error }),
    createTextSignature,
    formatUrlForDiagnostics,
  });

  if (selectors.title) {
    selectors.title.textContent = settings?.output?.title || TEXT.title;
  }
  if (selectors.yearlySubtitle) {
    const subtitle = settings?.output?.yearlySubtitle
      || (typeof TEXT?.yearly?.subtitle === 'string' ? TEXT.yearly.subtitle : '');
    if (subtitle) {
      selectors.yearlySubtitle.textContent = subtitle;
    }
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
  initYearlyExpand({
    selectors,
    handleYearlyToggle: (event) => handleYearlyToggle(selectors, dashboardState, event),
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
    setStatus: (type, details) => setStatus(selectors, type, details),
    showKpiSkeleton: () => {},
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
    filterDailyStatsByWindow: (daily) => (Array.isArray(daily) ? daily : []),
    populateChartYearOptions: () => {},
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
    getHeatmapData: () => null,
    renderRecentTable: () => {},
    computeMonthlyStats,
    renderMonthlyTable: () => {},
    computeYearlyStats,
    renderYearlyTable: (yearlyStats) => renderYearlyTable(selectors, dashboardState, yearlyStats),
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

  dataFlow.scheduleInitialLoad();
}
