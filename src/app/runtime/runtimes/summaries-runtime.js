import { createClientStore, PerfMonitor } from '../../../../app.js';
import { createSelectorsForPage } from '../../../state/selectors.js';
import { createDashboardState } from '../../../state/dashboardState.js';
import { createMainDataHandlers } from '../../../data/main-data.js?v=2026-02-08-merge-agg-fix';
import {
  computeAgeDiagnosisHeatmap,
  computeDailyStats,
  computeDiagnosisFrequency,
  computeDiagnosisCodeYearlyShare,
  computeMonthlyStats,
  computePspcDistribution,
  computePspcReferralHospitalizationCorrelation,
  computeReferralMonthlyHeatmap,
  computeReferralHospitalizedShareByPspc,
  computeReferralDispositionYearlyTrend,
  computeReferralYearlyTrend,
  computeYearlyStats,
  scopeExtendedHistoricalRecords,
} from '../../../data/stats.js?v=2026-02-07-monthly-heatmap-1';
import { getDatasetValue, runAfterDomAndIdle, setDatasetValue } from '../../../utils/dom.js';
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
import { initTableDownloadButtons } from '../../../events/charts.js';
import { loadChartJs } from '../../../utils/chart-loader.js';
import { setCopyButtonFeedback, storeCopyButtonBaseLabel } from '../clipboard.js';
import { createLayoutTools } from '../layout.js';
import { createDataFlow } from '../data-flow.js';
import {
  createDefaultChartFilters,
  createDefaultFeedbackFilters,
  createDefaultKpiFilters,
} from '../state.js';
import { loadSettingsFromConfig } from '../settings.js';
import { applyTheme, initializeTheme } from '../features/theme.js';
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
let treemapPluginPromise = null;
let matrixPluginPromise = null;

function getCssVar(name, fallback) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || fallback;
  } catch (error) {
    return fallback;
  }
}

function parseHexColor(value, fallback = { r: 239, g: 68, b: 68 }) {
  const text = String(value || '').trim();
  if (!text.startsWith('#')) {
    return fallback;
  }
  const hex = text.slice(1);
  const fullHex = hex.length === 3 ? hex.split('').map((char) => `${char}${char}`).join('') : hex;
  if (fullHex.length !== 6) {
    return fallback;
  }
  const r = Number.parseInt(fullHex.slice(0, 2), 16);
  const g = Number.parseInt(fullHex.slice(2, 4), 16);
  const b = Number.parseInt(fullHex.slice(4, 6), 16);
  if (![r, g, b].every((item) => Number.isFinite(item))) {
    return fallback;
  }
  return { r, g, b };
}

function mixRgb(start, end, t) {
  const ratio = Math.max(0, Math.min(1, Number(t) || 0));
  return {
    r: Math.round(start.r + ((end.r - start.r) * ratio)),
    g: Math.round(start.g + ((end.g - start.g) * ratio)),
    b: Math.round(start.b + ((end.b - start.b) * ratio)),
  };
}

function applyChartThemeDefaults(chartLib) {
  if (!chartLib || !chartLib.defaults) {
    return;
  }
  const textColor = getCssVar('--color-text-muted', '#9ca8c0');
  const titleColor = getCssVar('--color-text', '#e8ecf6');
  const gridColor = getCssVar('--chart-grid', 'rgba(156, 168, 192, 0.26)');
  chartLib.defaults.color = textColor;
  chartLib.defaults.borderColor = gridColor;
  chartLib.defaults.scale = chartLib.defaults.scale || {};
  chartLib.defaults.scale.ticks = { ...(chartLib.defaults.scale.ticks || {}), color: textColor };
  chartLib.defaults.scale.title = { ...(chartLib.defaults.scale.title || {}), color: titleColor };
  chartLib.defaults.plugins = chartLib.defaults.plugins || {};
  chartLib.defaults.plugins.legend = chartLib.defaults.plugins.legend || {};
  chartLib.defaults.plugins.legend.labels = {
    ...(chartLib.defaults.plugins.legend.labels || {}),
    color: textColor,
  };
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

function formatYearLabel(yearValue) {
  return Number.isFinite(Number(yearValue)) ? String(yearValue) : '—';
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function triggerDownloadFromBlob(blob, filename) {
  if (!(blob instanceof Blob) || !filename) {
    return false;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  return true;
}

function formatExportFilename(title, ext) {
  const normalized = String(title || 'ataskaita')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const date = new Date();
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `${normalized || 'ataskaita'}-${stamp}.${String(ext || 'csv').replace(/^\./, '')}`;
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

function isCompleteYearEntry(entry) {
  if (!entry) {
    return false;
  }
  const monthCount = Number.isFinite(entry?.monthCount) ? entry.monthCount : 0;
  const dayCount = Number.isFinite(entry?.dayCount) ? entry.dayCount : 0;
  return monthCount >= 12 || dayCount >= 360;
}

function formatValueWithShare(value, total) {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (!Number.isFinite(total) || total <= 0) {
    return numberFormatter.format(safeValue);
  }
  return `${numberFormatter.format(safeValue)} (${percentFormatter.format(safeValue / total)})`;
}

function formatChangeCell(diff, percent, canCompare) {
  if (!canCompare || !Number.isFinite(diff)) {
    return '—';
  }
  const sign = diff > 0 ? '+' : '';
  const percentText = Number.isFinite(percent) ? ` (${sign}${oneDecimalFormatter.format(percent * 100)}%)` : '';
  return `${sign}${numberFormatter.format(diff)}${percentText}`;
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
    const total = Number.isFinite(entry.count) ? entry.count : 0;
    const avgPerDay = entry.dayCount > 0 ? total / entry.dayCount : 0;
    const avgStay = entry.durations > 0 ? entry.totalTime / entry.durations : 0;
    const previousTotal = index > 0 ? totals[index - 1] : Number.NaN;
    const canCompare = index > 0 && completeness[index] && completeness[index - 1] && Number.isFinite(previousTotal);
    const diff = canCompare ? total - previousTotal : Number.NaN;
    const percentChange = canCompare && previousTotal !== 0 ? diff / previousTotal : Number.NaN;
    const isExpanded = expandedYears.has(entry.year);
    const yearLabel = formatYearLabel(entry.year);
    const yearDisplay = completeness[index] ? yearLabel : `${yearLabel} <span class="yearly-incomplete">(nepilni)</span>`;
    const row = document.createElement('tr');
    row.className = 'yearly-row';
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
    monthlyAll.filter((item) => item?.month?.startsWith(`${entry.year}-`)).forEach((monthEntry) => {
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
  const rows = selectors.yearlyTable ? selectors.yearlyTable.querySelectorAll(`tr[data-parent-year="${yearValue}"]`) : [];
  rows.forEach((child) => {
    child.hidden = !nextExpanded;
  });
  const expandedSet = new Set(Array.isArray(dashboardState.yearlyExpandedYears) ? dashboardState.yearlyExpandedYears : []);
  if (nextExpanded) {
    expandedSet.add(yearValue);
  } else {
    expandedSet.delete(yearValue);
  }
  dashboardState.yearlyExpandedYears = Array.from(expandedSet);
}

async function handleTableDownloadClick(event) {
  const button = event.currentTarget;
  if (!(button instanceof HTMLElement)) {
    return;
  }
  const targetSelector = getDatasetValue(button, 'tableTarget', '');
  const table = targetSelector ? document.querySelector(targetSelector) : null;
  if (!(table instanceof HTMLTableElement)) {
    setCopyButtonFeedback(button, 'Lentelė nerasta', 'error');
    return;
  }
  const rows = Array.from(table.querySelectorAll('tr'))
    .filter((row) => !row.hidden)
    .map((row) => Array.from(row.children).map((cell) => escapeCsvCell(cell.textContent.trim())).join(','))
    .join('\n');
  const title = getDatasetValue(button, 'tableTitle', 'Lentelė');
  const format = getDatasetValue(button, 'tableDownload', 'csv');
  if (format === 'csv') {
    const ok = triggerDownloadFromBlob(new Blob([rows], { type: 'text/csv;charset=utf-8;' }), formatExportFilename(title, 'csv'));
    setCopyButtonFeedback(button, ok ? 'Lentelė parsisiųsta' : 'Klaida parsisiunčiant', ok ? 'success' : 'error');
    return;
  }
  const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="800"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial;background:#fff;padding:16px;">${table.outerHTML}</div></foreignObject></svg>`;
  const ok = triggerDownloadFromBlob(new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' }), formatExportFilename(title, 'svg'));
  setCopyButtonFeedback(button, ok ? 'Lentelė parsisiųsta' : 'Klaida parsisiunčiant', ok ? 'success' : 'error');
}

function extractHistoricalRecords(dashboardState) {
  const allRecords = Array.isArray(dashboardState.rawRecords) ? dashboardState.rawRecords : [];
  const cache = dashboardState.summariesHistoricalRecordsCache || {};
  if (cache.recordsRef === allRecords && Array.isArray(cache.records)) {
    return cache.records;
  }
  const byTag = allRecords.filter((record) => record?.sourceId === 'historical');
  const records = byTag.length ? byTag : allRecords.filter((record) => record?.hasExtendedHistoricalFields === true);
  dashboardState.summariesHistoricalRecordsCache = {
    recordsRef: allRecords,
    records,
  };
  return records;
}

function buildReportsComputationKey(dashboardState, settings, scopeMeta) {
  return [
    String(dashboardState.summariesReportsYear ?? 'all'),
    Number.parseInt(String(dashboardState.summariesReportsTopN ?? 15), 10) || 15,
    Number.parseInt(String(dashboardState.summariesReportsMinGroupSize ?? 10), 10) || 10,
    String(dashboardState.summariesReferralPspcSort || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc',
    Number.isFinite(scopeMeta?.records?.length) ? scopeMeta.records.length : 0,
    Number.isFinite(settings?.calculations?.shiftStartHour) ? settings.calculations.shiftStartHour : '',
  ].join('|');
}

function getReportsComputation(dashboardState, settings, historicalRecords, scopeMeta) {
  const key = buildReportsComputationKey(dashboardState, settings, scopeMeta);
  const cache = dashboardState.summariesReportsComputationCache || {};
  if (cache.recordsRef === historicalRecords && cache.key === key && cache.value) {
    return cache.value;
  }
  const scopedMeta = {
    scoped: scopeMeta.records,
    yearOptions: scopeMeta.yearOptions,
    yearFilter: scopeMeta.yearFilter,
    shiftStartHour: scopeMeta.shiftStartHour,
    coverage: scopeMeta.coverage,
  };
  const baseOptions = {
    yearFilter: dashboardState.summariesReportsYear,
    topN: dashboardState.summariesReportsTopN,
    minGroupSize: dashboardState.summariesReportsMinGroupSize,
    sortDirection: dashboardState.summariesReferralPspcSort,
    calculations: settings?.calculations,
    defaultSettings: DEFAULT_SETTINGS,
    scopedMeta,
  };
  const value = {
    diagnosis: computeDiagnosisFrequency(historicalRecords, {
      ...baseOptions,
      excludePrefixes: ['W', 'Y', 'U', 'Z', 'X'],
    }),
    ageDiagnosisHeatmap: computeAgeDiagnosisHeatmap(historicalRecords, {
      ...baseOptions,
      excludePrefixes: ['W', 'Y', 'U', 'Z', 'X'],
    }),
    z769Trend: computeDiagnosisCodeYearlyShare(historicalRecords, 'Z76.9', baseOptions),
    referralTrend: computeReferralYearlyTrend(historicalRecords, baseOptions),
    referralDispositionYearly: computeReferralDispositionYearlyTrend(historicalRecords, baseOptions),
    referralMonthlyHeatmap: computeReferralMonthlyHeatmap(historicalRecords, baseOptions),
    referralHospitalizedByPspc: computeReferralHospitalizedShareByPspc(historicalRecords, baseOptions),
    referralHospitalizedByPspcYearly: computeReferralHospitalizedShareByPspcYearly(scopeMeta.records, {
      minGroupSize: dashboardState.summariesReportsMinGroupSize,
      yearOptions: scopeMeta.yearOptions,
      shiftStartHour: scopeMeta.shiftStartHour,
    }),
    pspcCorrelation: computePspcReferralHospitalizationCorrelation(historicalRecords, baseOptions),
    pspcDistribution: computePspcDistribution(historicalRecords, baseOptions),
  };
  dashboardState.summariesReportsComputationCache = {
    recordsRef: historicalRecords,
    key,
    value,
  };
  return value;
}

function computeReferralHospitalizedShareByPspcYearly(records, options = {}) {
  const list = Array.isArray(records) ? records.filter(Boolean) : [];
  const minGroupSizeRaw = Number.parseInt(String(options?.minGroupSize ?? 10), 10);
  const minGroupSize = Number.isFinite(minGroupSizeRaw) && minGroupSizeRaw > 0 ? minGroupSizeRaw : 10;
  const shiftStartHourRaw = Number(options?.shiftStartHour);
  const shiftStartHour = Number.isFinite(shiftStartHourRaw) ? shiftStartHourRaw : 7;
  const getShiftAdjustedYear = (record) => {
    const arrival = record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime()) ? record.arrival : null;
    const discharge = record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime()) ? record.discharge : null;
    const reference = arrival || discharge;
    if (reference) {
      const anchor = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
      if (reference.getHours() < shiftStartHour) {
        anchor.setDate(anchor.getDate() - 1);
      }
      return String(anchor.getFullYear());
    }
    const fallback = Number.parseInt(String(record?.year ?? ''), 10);
    if (Number.isFinite(fallback)) {
      return String(fallback);
    }
    return '';
  };
  const yearSet = new Set();
  const byPspc = new Map();

  list.forEach((record) => {
    const year = getShiftAdjustedYear(record);
    if (!/^\d{4}$/.test(year)) {
      return;
    }
    yearSet.add(year);
    const referralValue = String(record?.referral || '').trim().toLowerCase();
    if (referralValue !== 'su siuntimu') {
      return;
    }
    const pspc = String(record?.pspc || '').trim() || 'Nenurodyta';
    if (!byPspc.has(pspc)) {
      byPspc.set(pspc, {
        label: pspc,
        totalReferred: 0,
        totalHospitalized: 0,
        byYear: new Map(),
      });
    }
    const bucket = byPspc.get(pspc);
    bucket.totalReferred += 1;
    if (record?.hospitalized === true) {
      bucket.totalHospitalized += 1;
    }
    if (!bucket.byYear.has(year)) {
      bucket.byYear.set(year, { referredTotal: 0, hospitalizedCount: 0 });
    }
    const yearBucket = bucket.byYear.get(year);
    yearBucket.referredTotal += 1;
    if (record?.hospitalized === true) {
      yearBucket.hospitalizedCount += 1;
    }
  });

  const years = Array.from(yearSet)
    .filter((year) => /^\d{4}$/.test(year))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));

  const rows = Array.from(byPspc.values())
    .filter((row) => row.label !== 'Nenurodyta')
    .filter((row) => row.totalReferred >= minGroupSize)
    .map((row) => ({
      label: row.label,
      totalReferred: row.totalReferred,
      totalHospitalized: row.totalHospitalized,
      share: row.totalReferred > 0 ? row.totalHospitalized / row.totalReferred : 0,
      yearly: years.map((year) => {
        const yearBucket = row.byYear.get(year) || { referredTotal: 0, hospitalizedCount: 0 };
        const referredTotal = Number(yearBucket.referredTotal || 0);
        const hospitalizedCount = Number(yearBucket.hospitalizedCount || 0);
        return {
          year,
          referredTotal,
          hospitalizedCount,
          share: referredTotal > 0 ? hospitalizedCount / referredTotal : null,
        };
      }),
    }))
    .sort((a, b) => {
      if (b.totalReferred !== a.totalReferred) {
        return b.totalReferred - a.totalReferred;
      }
      return String(a.label).localeCompare(String(b.label), 'lt');
    });

  return { years, rows };
}

function getScopedReportsMeta(dashboardState, settings, historicalRecords, yearFilter) {
  const cache = dashboardState.summariesReportsScopeCache || {};
  const normalizedYearFilter = yearFilter == null ? 'all' : String(yearFilter);
  if (cache.recordsRef !== historicalRecords || !(cache.byYear instanceof Map)) {
    dashboardState.summariesReportsScopeCache = {
      recordsRef: historicalRecords,
      byYear: new Map(),
    };
  }
  const activeCache = dashboardState.summariesReportsScopeCache.byYear;
  if (activeCache.has(normalizedYearFilter)) {
    return activeCache.get(normalizedYearFilter);
  }
  const scoped = scopeExtendedHistoricalRecords(historicalRecords, yearFilter, {
    calculations: settings?.calculations,
    defaultSettings: DEFAULT_SETTINGS,
  });
  activeCache.set(normalizedYearFilter, scoped);
  return scoped;
}

function syncReportsControls(selectors, dashboardState, yearOptions, pspcTrendOptions) {
  if (selectors.summariesReportsYear) {
    const select = selectors.summariesReportsYear;
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = TEXT.summariesReports?.filters?.allYears || 'Visi metai';
    allOption.selected = String(dashboardState.summariesReportsYear) === 'all';
    select.replaceChildren(allOption);
    (Array.isArray(yearOptions) ? yearOptions : []).forEach((year) => {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      option.selected = String(dashboardState.summariesReportsYear) === String(year);
      select.appendChild(option);
    });
  }
  if (selectors.summariesReportsTopN) {
    selectors.summariesReportsTopN.value = String(dashboardState.summariesReportsTopN || 15);
  }
  if (selectors.summariesReportsMinGroupSize) {
    selectors.summariesReportsMinGroupSize.value = String(dashboardState.summariesReportsMinGroupSize || 10);
  }
  if (selectors.referralHospitalizedByPspcSort) {
    selectors.referralHospitalizedByPspcSort.value = dashboardState.summariesReferralPspcSort === 'asc' ? 'asc' : 'desc';
  }
  if (selectors.referralHospitalizedByPspcMode) {
    const mode = String(dashboardState.summariesReferralPspcMode || 'cross').toLowerCase();
    selectors.referralHospitalizedByPspcMode.value = mode === 'trend' ? 'trend' : 'cross';
  }
  if (selectors.referralHospitalizedByPspcTrendPspc && Array.isArray(pspcTrendOptions)) {
    const select = selectors.referralHospitalizedByPspcTrendPspc;
    const previous = String(dashboardState.summariesReferralPspcTrendPspc || '__top3__');
    select.replaceChildren();
    const topOption = document.createElement('option');
    topOption.value = '__top3__';
    topOption.textContent = 'TOP 3 PSPC';
    select.appendChild(topOption);
    (Array.isArray(pspcTrendOptions) ? pspcTrendOptions : []).forEach((label) => {
      if (!label) {
        return;
      }
      const option = document.createElement('option');
      option.value = label;
      option.textContent = label;
      select.appendChild(option);
    });
    const hasPrevious = Array.from(select.options).some((option) => option.value === previous);
    const nextValue = hasPrevious ? previous : '__top3__';
    select.value = nextValue;
    dashboardState.summariesReferralPspcTrendPspc = nextValue;
  }
  const isTrend = String(dashboardState.summariesReferralPspcMode || 'cross').toLowerCase() === 'trend';
  if (selectors.referralHospitalizedByPspcSort) {
    selectors.referralHospitalizedByPspcSort.disabled = isTrend;
    const sortField = selectors.referralHospitalizedByPspcSort.closest('.report-card__inline-filter');
    if (sortField) {
      sortField.hidden = isTrend;
      sortField.setAttribute('aria-hidden', String(isTrend));
    }
  }
  if (selectors.referralHospitalizedByPspcTrendPspc) {
    selectors.referralHospitalizedByPspcTrendPspc.disabled = !isTrend;
    const trendField = selectors.referralHospitalizedByPspcTrendPspc.closest('.report-card__inline-filter');
    if (trendField) {
      trendField.hidden = !isTrend;
      trendField.setAttribute('aria-hidden', String(!isTrend));
    }
  }
}

function destroyReportCharts(dashboardState) {
  const charts = dashboardState.summariesReportCharts || {};
  Object.keys(charts).forEach((key) => {
    if (charts[key] && typeof charts[key].destroy === 'function') {
      charts[key].destroy();
    }
    charts[key] = null;
  });
}

function destroyReportChartSlot(dashboardState, slot) {
  const charts = dashboardState?.summariesReportCharts || {};
  const existing = charts[slot];
  if (existing && typeof existing.destroy === 'function') {
    existing.destroy();
  }
  charts[slot] = null;
}

function updateOrCreateReportChart(slot, dashboardState, chartLib, canvas, config, options = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return null;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  const forceRecreate = options?.forceRecreate === true;
  const existing = dashboardState?.summariesReportCharts?.[slot];
  const incomingType = String(config?.type || '');
  const existingType = String(existing?.config?.type || existing?.constructor?.id || '');
  const canUpdate = (
    !forceRecreate
    && existing
    && typeof existing.update === 'function'
    && existing.canvas === canvas
    && existingType === incomingType
  );
  if (canUpdate) {
    existing.data = config?.data || { labels: [], datasets: [] };
    existing.options = config?.options || {};
    if ('plugins' in (config || {})) {
      existing.config.plugins = config.plugins;
    }
    existing.update('none');
    return existing;
  }
  if (existing && typeof existing.destroy === 'function') {
    existing.destroy();
  }
  const created = new chartLib(ctx, config);
  dashboardState.summariesReportCharts[slot] = created;
  return created;
}

function ensureCoverage(selectors, dashboardState, coverage) {
  const total = Number.isFinite(coverage?.total) ? coverage.total : 0;
  const extended = Number.isFinite(coverage?.extended) ? coverage.extended : 0;
  const percent = total > 0 ? extended / total : 0;
  dashboardState.summariesReportsCoverage = { total, extended, percent };
  if (selectors.summariesReportsCoverage) {
    if (total <= 0) {
      selectors.summariesReportsCoverage.textContent = '';
      return;
    }
    selectors.summariesReportsCoverage.textContent = TEXT.summariesReports?.coverage
      ? TEXT.summariesReports.coverage(numberFormatter.format(extended), numberFormatter.format(total), percentFormatter.format(percent))
      : `Analizėje naudojami papildomi įrašai: ${extended}/${total}.`;
  }
}

function createRowsCsv(headers, rows) {
  const lines = [headers.map((cell) => escapeCsvCell(cell)).join(',')];
  (rows || []).forEach((row) => lines.push(row.map((cell) => escapeCsvCell(cell)).join(',')));
  return lines.join('\n');
}

function toPercent(value, total) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return (value / total) * 100;
}

function formatPercentTooltip(value, count = null) {
  const base = `Reikšmė: ${oneDecimalFormatter.format(Number(value) || 0)}%`;
  if (!Number.isFinite(count) || count < 0) {
    return base;
  }
  return `${base} | Imtis: n=${numberFormatter.format(count)}`;
}

function hasTreemapController(chartLib) {
  if (!chartLib || !chartLib.registry || typeof chartLib.registry.getController !== 'function') {
    return false;
  }
  try {
    return Boolean(chartLib.registry.getController('treemap'));
  } catch (error) {
    return false;
  }
}

function hasMatrixController(chartLib) {
  if (!chartLib || !chartLib.registry || typeof chartLib.registry.getController !== 'function') {
    return false;
  }
  try {
    return Boolean(chartLib.registry.getController('matrix'));
  } catch (error) {
    return false;
  }
}

async function ensureTreemapPlugin(chartLib) {
  if (!chartLib) {
    return false;
  }
  if (hasTreemapController(chartLib)) {
    return true;
  }
  if (!treemapPluginPromise) {
    treemapPluginPromise = new Promise((resolve) => {
      const scriptSrc = 'https://cdn.jsdelivr.net/npm/chartjs-chart-treemap@3.1.0/dist/chartjs-chart-treemap.min.js';
      const existingScript = document.querySelector(`script[src="${scriptSrc}"]`);
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(true), { once: true });
        existingScript.addEventListener('error', () => resolve(false), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = scriptSrc;
      script.defer = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }
  const loaded = await treemapPluginPromise;
  if (!loaded) {
    return false;
  }
  if (hasTreemapController(chartLib)) {
    return true;
  }
  try {
    const pluginGlobal = window.ChartTreemap;
    if (pluginGlobal?.TreemapController && pluginGlobal?.TreemapElement) {
      chartLib.register(pluginGlobal.TreemapController, pluginGlobal.TreemapElement);
    }
  } catch (error) {
    console.warn('Nepavyko uzregistruoti treemap plugino:', error);
  }
  return hasTreemapController(chartLib);
}

async function ensureMatrixPlugin(chartLib) {
  if (!chartLib) {
    return false;
  }
  if (hasMatrixController(chartLib)) {
    return true;
  }
  if (!matrixPluginPromise) {
    matrixPluginPromise = new Promise((resolve) => {
      const scriptSrc = 'https://cdn.jsdelivr.net/npm/chartjs-chart-matrix@2.0.1/dist/chartjs-chart-matrix.min.js';
      const existingScript = document.querySelector(`script[src="${scriptSrc}"]`);
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(true), { once: true });
        existingScript.addEventListener('error', () => resolve(false), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = scriptSrc;
      script.defer = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }
  const loaded = await matrixPluginPromise;
  if (!loaded) {
    return false;
  }
  if (hasMatrixController(chartLib)) {
    return true;
  }
  try {
    const pluginGlobal = window.ChartMatrix;
    if (pluginGlobal?.MatrixController && pluginGlobal?.MatrixElement) {
      chartLib.register(pluginGlobal.MatrixController, pluginGlobal.MatrixElement);
    }
  } catch (error) {
    console.warn('Nepavyko uzregistruoti matrix plugino:', error);
  }
  return hasMatrixController(chartLib);
}

function renderBarChart(slot, dashboardState, chartLib, canvas, rows, color, options = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const dynamicYAxis = options?.dynamicYAxis === true;
  const values = rows.map((row) => Number(row?.percent ?? 0)).filter((value) => Number.isFinite(value));
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 0;
  const span = Math.max(0.5, maxValue - minValue);
  const padding = Math.max(0.25, span * 0.2);
  const dynamicMin = Math.max(0, minValue - padding);
  const dynamicMax = Math.min(100, maxValue + padding);
  updateOrCreateReportChart(slot, dashboardState, chartLib, canvas, {
    type: 'bar',
    data: {
      labels: rows.map((row) => row.label),
      datasets: [{ data: rows.map((row) => row.percent), backgroundColor: color }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = Number(context.parsed?.y ?? context.parsed ?? 0);
              const index = Number(context.dataIndex ?? -1);
              const row = index >= 0 ? rows[index] : null;
              const count = Number.isFinite(row?.count) ? row.count : (Number.isFinite(row?.total) ? row.total : null);
              return formatPercentTooltip(value, count);
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: !dynamicYAxis,
          min: dynamicYAxis ? dynamicMin : 0,
          max: dynamicYAxis
            ? (dynamicMax > dynamicMin ? dynamicMax : Math.min(100, dynamicMin + 1))
            : 100,
          ticks: {
            callback: (value) => `${Number(value).toFixed(0)}%`,
          },
        },
      },
    },
  });
}

function normalizeSexLabel(rawValue) {
  const value = String(rawValue || '').trim().toLowerCase();
  if (value === 'vyras' || value === 'male') {
    return 'Vyras';
  }
  if (value === 'moteris' || value === 'female') {
    return 'Moteris';
  }
  return 'Kita/Nenurodyta';
}

function computeAgeDistributionBySex(records) {
  const list = Array.isArray(records) ? records.filter(Boolean) : [];
  const ageOrder = ['0-17', '18-34', '35-49', '50-64', '65-79', '80+', 'Nenurodyta'];
  const sexOrder = ['Vyras', 'Moteris', 'Kita/Nenurodyta'];
  const buckets = new Map(ageOrder.map((label) => [label, {
    label,
    total: 0,
    bySex: {
      Vyras: 0,
      Moteris: 0,
      'Kita/Nenurodyta': 0,
    },
  }]));

  list.forEach((record) => {
    const ageRaw = String(record?.ageBand || '').trim();
    const age = ageOrder.includes(ageRaw) ? ageRaw : 'Nenurodyta';
    const sex = normalizeSexLabel(record?.sex);
    const bucket = buckets.get(age);
    if (!bucket) {
      return;
    }
    bucket.total += 1;
    bucket.bySex[sex] = Number(bucket.bySex?.[sex] || 0) + 1;
  });

  const rows = ageOrder
    .map((label) => buckets.get(label))
    .filter((row) => Number(row?.total || 0) > 0)
    .map((row) => ({
      label: row.label,
      total: row.total,
      bySex: {
        Vyras: Number(row.bySex?.Vyras || 0),
        Moteris: Number(row.bySex?.Moteris || 0),
        'Kita/Nenurodyta': Number(row.bySex?.['Kita/Nenurodyta'] || 0),
      },
    }));

  return {
    total: list.length,
    sexOrder,
    rows,
  };
}

function renderAgeDistributionStackedBySex(slot, dashboardState, chartLib, canvas, distribution, palette = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const rows = Array.isArray(distribution?.rows) ? distribution.rows : [];
  const total = Number(distribution?.total || 0);
  const sexOrder = Array.isArray(distribution?.sexOrder) && distribution.sexOrder.length
    ? distribution.sexOrder
    : ['Vyras', 'Moteris', 'Kita/Nenurodyta'];
  const colorMap = {
    Vyras: palette.Vyras || '#2563eb',
    Moteris: palette.Moteris || '#ef4444',
    'Kita/Nenurodyta': palette['Kita/Nenurodyta'] || '#94a3b8',
  };
  const datasets = sexOrder.map((sex) => ({
    label: sex,
    data: rows.map((row) => toPercent(Number(row?.bySex?.[sex] || 0), total)),
    backgroundColor: colorMap[sex] || '#94a3b8',
    borderWidth: 0,
  }));
  const totals = rows.map((row) => toPercent(Number(row?.total || 0), total));
  const maxTotal = totals.length ? Math.max(...totals) : 0;
  const yMax = Math.min(100, Math.max(2, maxTotal + Math.max(0.5, maxTotal * 0.2)));

  updateOrCreateReportChart(slot, dashboardState, chartLib, canvas, {
    type: 'bar',
    data: {
      labels: rows.map((row) => row.label),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            filter: (legendItem) => String(legendItem?.text || '') !== 'Kita/Nenurodyta',
          },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const sex = String(context.dataset?.label || '');
              const value = Number(context.parsed?.y ?? 0);
              const row = rows[Number(context.dataIndex || 0)] || null;
              const count = Number(row?.bySex?.[sex] || 0);
              return `${sex}: ${oneDecimalFormatter.format(value)}% (n=${numberFormatter.format(count)})`;
            },
            footer: (items) => {
              const index = Number(items?.[0]?.dataIndex ?? -1);
              const row = index >= 0 ? rows[index] : null;
              const totalCount = Number(row?.total || 0);
              const totalPercent = toPercent(totalCount, total);
              return `Grupė: ${oneDecimalFormatter.format(totalPercent)}% (n=${numberFormatter.format(totalCount)})`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
        },
        y: {
          stacked: true,
          beginAtZero: true,
          max: yMax,
          ticks: {
            callback: (value) => `${Number(value).toFixed(0)}%`,
          },
        },
      },
    },
  });
}

function renderPieChart(slot, dashboardState, chartLib, canvas, rows, palette) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  updateOrCreateReportChart(slot, dashboardState, chartLib, canvas, {
    type: 'pie',
    data: {
      labels: rows.map((row) => row.label),
      datasets: [{
        data: rows.map((row) => row.percent),
        backgroundColor: rows.map((_, index) => palette[index % palette.length]),
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = String(context.label || '');
              const value = Number(context.parsed ?? 0);
              const index = Number(context.dataIndex ?? -1);
              const row = index >= 0 ? rows[index] : null;
              const count = Number.isFinite(row?.count) ? row.count : (Number.isFinite(row?.total) ? row.total : null);
              return `${label} | ${formatPercentTooltip(value, count)}`;
            },
          },
        },
      },
    },
  });
}

async function renderDiagnosisTreemap(dashboardState, chartLib, canvas, rows) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return false;
  }
  const hasPlugin = await ensureTreemapPlugin(chartLib);
  if (!hasPlugin) {
    return false;
  }
  const tree = rows.map((row) => ({ code: row.label, percent: row.percent, count: row.count }));
  updateOrCreateReportChart('diagnosisFrequency', dashboardState, chartLib, canvas, {
    type: 'treemap',
    data: {
      datasets: [{
        tree,
        key: 'percent',
        groups: ['code'],
        spacing: 2,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.92)',
        backgroundColor: (context) => {
          const value = Number(context.raw?._data?.percent ?? 0);
          const alpha = Math.max(0.48, Math.min(0.92, value / 16));
            const base = getCssVar('--report-diagnosis', '#0284c7');
            if (base.startsWith('#')) {
              const hex = base.replace('#', '');
              const fullHex = hex.length === 3 ? hex.split('').map((char) => `${char}${char}`).join('') : hex;
              const r = Number.parseInt(fullHex.slice(0, 2), 16);
              const g = Number.parseInt(fullHex.slice(2, 4), 16);
              const b = Number.parseInt(fullHex.slice(4, 6), 16);
              if ([r, g, b].every((v) => Number.isFinite(v))) {
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
              }
            }
            return `rgba(2, 132, 199, ${alpha})`;
          },
        labels: {
          display: true,
          align: 'center',
          color: '#ffffff',
          font: (context) => {
            const value = Number(context.raw?._data?.percent ?? 0);
            return { size: value >= 5 ? 13 : 11, weight: '700' };
          },
          formatter: (context) => {
            const code = String(context.raw?.g || context.raw?._data?.code || '');
            const value = Number(context.raw?._data?.percent ?? 0);
            if (value < 1.2) {
              return '';
            }
            return `${code}\n${oneDecimalFormatter.format(value)}%`;
          },
        },
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => String(items?.[0]?.raw?.g || ''),
            label: (context) => {
              const value = Number(context.raw?._data?.percent ?? 0);
              const count = Number(context.raw?._data?.count ?? Number.NaN);
              return formatPercentTooltip(value, Number.isFinite(count) ? count : null);
            },
          },
        },
      },
    },
  }, { forceRecreate: true });
  return true;
}

async function renderAgeDiagnosisHeatmapChart(slot, dashboardState, chartLib, canvas, model) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return false;
  }
  const rows = Array.isArray(model?.rows) ? model.rows : [];
  const ageBands = Array.isArray(model?.ageBands) ? model.ageBands : [];
  const diagnosisGroups = Array.isArray(model?.diagnosisGroups) ? model.diagnosisGroups : [];
  if (!rows.length || !ageBands.length || !diagnosisGroups.length) {
    destroyReportChartSlot(dashboardState, slot);
    return false;
  }
  const height = Math.max(280, Math.min(760, 120 + ageBands.length * 40));
  canvas.style.setProperty('height', `${height}px`, 'important');
  canvas.style.setProperty('min-height', `${height}px`, 'important');
  canvas.style.setProperty('max-height', `${height}px`, 'important');
  const maxPercent = Math.max(...rows.map((row) => Number(row?.percent || 0)), 0);
  const hasMatrix = await ensureMatrixPlugin(chartLib);
  if (hasMatrix) {
    updateOrCreateReportChart(slot, dashboardState, chartLib, canvas, {
      type: 'matrix',
      data: {
        datasets: [{
          label: TEXT.summariesReports?.cards?.ageDiagnosisHeatmap || 'Amžiaus ir diagnozių grupių ryšys',
          data: rows.map((row) => ({
            x: row.diagnosisGroup,
            y: row.ageBand,
            v: row.percent,
            count: row.count,
            ageTotal: row.ageTotal,
          })),
          width: ({ chart }) => {
            const area = chart?.chartArea;
            if (!area || !diagnosisGroups.length) {
              return 18;
            }
            return Math.max(12, (area.width / diagnosisGroups.length) - 3);
          },
          height: ({ chart }) => {
            const area = chart?.chartArea;
            if (!area || !ageBands.length) {
              return 18;
            }
            return Math.max(16, (area.height / ageBands.length) - 4);
          },
          backgroundColor: (context) => {
            const value = Number(context.raw?.v || 0);
            const ratio = maxPercent > 0 ? value / maxPercent : 0;
            const alpha = Math.max(0.12, Math.min(0.92, ratio));
            const base = getCssVar('--report-heatmap', '#16a34a');
            if (base.startsWith('#')) {
              const hex = base.replace('#', '');
              const fullHex = hex.length === 3 ? hex.split('').map((char) => `${char}${char}`).join('') : hex;
              const r = Number.parseInt(fullHex.slice(0, 2), 16);
              const g = Number.parseInt(fullHex.slice(2, 4), 16);
              const b = Number.parseInt(fullHex.slice(4, 6), 16);
              if ([r, g, b].every((v) => Number.isFinite(v))) {
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
              }
            }
            return `rgba(22, 163, 74, ${alpha})`;
          },
          borderColor: 'rgba(255, 255, 255, 0.88)',
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'category',
            labels: diagnosisGroups,
            offset: true,
            ticks: {
              autoSkip: false,
              maxRotation: 65,
              minRotation: 35,
            },
          },
          y: {
            type: 'category',
            labels: ageBands,
            offset: true,
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                const raw = items?.[0]?.raw;
                return `${String(raw?.y || '')} × ${String(raw?.x || '')}`;
              },
              label: (context) => {
                const raw = context.raw || {};
                const percent = Number(raw.v || 0);
                const count = Number(raw.count || 0);
                const ageTotal = Number(raw.ageTotal || 0);
                return `${formatPercentTooltip(percent, count)} | Amžiaus grupėje: ${numberFormatter.format(ageTotal)}`;
              },
            },
          },
        },
      },
    });
    return true;
  }

  const fallbackData = rows.map((row) => ({
    x: row.diagnosisGroup,
    y: row.ageBand,
    r: Math.max(4, Math.min(16, row.percent / 2.2)),
    v: row.percent,
    count: row.count,
    ageTotal: row.ageTotal,
  }));
  updateOrCreateReportChart(slot, dashboardState, chartLib, canvas, {
    type: 'bubble',
    data: {
      datasets: [{
        label: 'Heatmap fallback',
        data: fallbackData,
        backgroundColor: fallbackData.map((point) => {
          const ratio = maxPercent > 0 ? point.v / maxPercent : 0;
          const alpha = Math.max(0.18, Math.min(0.88, ratio));
          const base = getCssVar('--report-heatmap', '#16a34a');
          if (base.startsWith('#')) {
            const hex = base.replace('#', '');
            const fullHex = hex.length === 3 ? hex.split('').map((char) => `${char}${char}`).join('') : hex;
            const r = Number.parseInt(fullHex.slice(0, 2), 16);
            const g = Number.parseInt(fullHex.slice(2, 4), 16);
            const b = Number.parseInt(fullHex.slice(4, 6), 16);
            if ([r, g, b].every((v) => Number.isFinite(v))) {
              return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            }
          }
          return `rgba(22, 163, 74, ${alpha})`;
        }),
        borderColor: 'rgba(15, 23, 42, 0.2)',
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { type: 'category', labels: diagnosisGroups },
        y: { type: 'category', labels: ageBands },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const raw = items?.[0]?.raw;
              return `${String(raw?.y || '')} × ${String(raw?.x || '')}`;
            },
            label: (context) => {
              const raw = context.raw || {};
              const percent = Number(raw.v || 0);
              const count = Number(raw.count || 0);
              const ageTotal = Number(raw.ageTotal || 0);
              return `${formatPercentTooltip(percent, count)} | Amžiaus grupėje: ${numberFormatter.format(ageTotal)}`;
            },
          },
        },
      },
    },
  });
  return true;
}

function renderStackedTrend(slot, dashboardState, chartLib, canvas, trend) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const palette = ['#0284c7', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b', '#d946ef'];
  updateOrCreateReportChart(slot, dashboardState, chartLib, canvas, {
    type: 'bar',
    data: {
      labels: trend.rows.map((row) => String(row.year)),
      datasets: trend.categories.map((category, index) => ({
        label: category,
        data: trend.rows.map((row) => toPercent(row.values[category] || 0, row.total || 0)),
        backgroundColor: palette[index % palette.length],
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },
        y: {
          stacked: true,
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: (value) => `${Number(value).toFixed(0)}%`,
          },
        },
      },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (context) => {
              const datasetLabel = String(context.dataset?.label || '');
              const value = Number(context.parsed?.y ?? context.parsed ?? 0);
              return `${datasetLabel}: ${oneDecimalFormatter.format(value)}%`;
            },
            footer: (items) => {
              const total = items.reduce((sum, item) => sum + Number(item.parsed?.y ?? 0), 0);
              return `Suma: ${oneDecimalFormatter.format(total)}%`;
            },
          },
        },
      },
    },
  });
}

function renderPercentLineTrend(slot, dashboardState, chartLib, canvas, rows, label, color = '#ef4444') {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const values = rows.map((row) => Number(row.percent || 0)).filter((value) => Number.isFinite(value));
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 0;
  const spread = Math.max(0.5, maxValue - minValue);
  const padding = Math.max(0.25, spread * 0.25);
  const suggestedMin = Math.max(0, minValue - padding);
  const suggestedMax = Math.min(100, maxValue + padding);
  updateOrCreateReportChart(slot, dashboardState, chartLib, canvas, {
    type: 'line',
    data: {
      labels: rows.map((row) => String(row.year)),
      datasets: [{
        label,
        data: rows.map((row) => row.percent),
        borderColor: color,
        backgroundColor: color,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.25,
        fill: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (context) => formatPercentTooltip(Number(context.parsed?.y || 0), null),
            afterLabel: (context) => {
              const index = Number(context.dataIndex ?? -1);
              const row = index >= 0 ? rows[index] : null;
              const total = Number.isFinite(row?.total) ? row.total : null;
              return Number.isFinite(total) ? `Imtis: n=${numberFormatter.format(total)}` : '';
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: false,
          min: suggestedMin,
          max: suggestedMax > suggestedMin ? suggestedMax : Math.min(100, suggestedMin + 1),
          ticks: {
            callback: (value) => `${oneDecimalFormatter.format(Number(value) || 0)}%`,
          },
        },
      },
    },
  });
}

function renderReferralDispositionYearlyChart(slot, dashboardState, chartLib, canvas, trend, colors) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const rows = Array.isArray(trend?.rows) ? trend.rows : [];
  const labelFor = (referral, disposition) => {
    if (referral === 'su siuntimu' && disposition === 'hospitalizuoti') return 'Su siuntimu: hospitalizuoti';
    if (referral === 'su siuntimu' && disposition === 'isleisti') return 'Su siuntimu: išleisti';
    if (referral === 'be siuntimo' && disposition === 'hospitalizuoti') return 'Be siuntimo: hospitalizuoti';
    return 'Be siuntimo: išleisti';
  };
  const buildSeries = (referral, disposition) => rows.map((row) => {
    const groupTotal = Number(row?.totals?.[referral] || 0);
    const count = Number(row?.values?.[referral]?.[disposition] || 0);
    return groupTotal > 0 ? (count / groupTotal) * 100 : 0;
  });
  updateOrCreateReportChart(slot, dashboardState, chartLib, canvas, {
    type: 'bar',
    data: {
      labels: rows.map((row) => String(row.year)),
      datasets: [
        {
          label: labelFor('su siuntimu', 'hospitalizuoti'),
          stack: 'su siuntimu',
          data: buildSeries('su siuntimu', 'hospitalizuoti'),
          backgroundColor: colors?.hospWithReferral || '#ef4444',
        },
        {
          label: labelFor('su siuntimu', 'isleisti'),
          stack: 'su siuntimu',
          data: buildSeries('su siuntimu', 'isleisti'),
          backgroundColor: colors?.dischargedWithReferral || 'rgba(239, 68, 68, 0.28)',
        },
        {
          label: labelFor('be siuntimo', 'hospitalizuoti'),
          stack: 'be siuntimo',
          data: buildSeries('be siuntimo', 'hospitalizuoti'),
          backgroundColor: colors?.hospWithoutReferral || '#2563eb',
        },
        {
          label: labelFor('be siuntimo', 'isleisti'),
          stack: 'be siuntimo',
          data: buildSeries('be siuntimo', 'isleisti'),
          backgroundColor: colors?.dischargedWithoutReferral || 'rgba(37, 99, 235, 0.24)',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },
        y: {
          stacked: true,
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: (value) => `${Number(value).toFixed(0)}%`,
          },
        },
      },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (context) => {
              const datasetLabel = String(context.dataset?.label || '');
              const value = Number(context.parsed?.y ?? context.parsed ?? 0);
              return `${datasetLabel}: ${oneDecimalFormatter.format(value)}%`;
            },
            afterLabel: (context) => {
              const yearIndex = Number(context.dataIndex ?? -1);
              const row = yearIndex >= 0 ? rows[yearIndex] : null;
              if (!row) {
                return '';
              }
              const stack = String(context.dataset?.stack || '');
              const total = Number(row?.totals?.[stack] || 0);
              return `Imtis (${stack}): n=${numberFormatter.format(total)}`;
            },
          },
        },
      },
    },
  });
}

async function renderReferralMonthlyHeatmapChart(slot, dashboardState, chartLib, canvas, model) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return false;
  }
  const rows = Array.isArray(model?.rows) ? model.rows : [];
  const years = Array.isArray(model?.years) ? model.years : [];
  const months = Array.isArray(model?.months) ? model.months : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (!rows.length || !years.length) {
    destroyReportChartSlot(dashboardState, slot);
    return false;
  }
  const height = Math.max(260, Math.min(820, 120 + years.length * 36));
  canvas.style.setProperty('height', `${height}px`, 'important');
  canvas.style.setProperty('min-height', `${height}px`, 'important');
  canvas.style.setProperty('max-height', `${height}px`, 'important');
  const values = rows.map((row) => Number((row?.share || 0) * 100)).filter((value) => Number.isFinite(value));
  const minPercent = values.length ? Math.min(...values) : 0;
  const maxPercent = values.length ? Math.max(...values) : 0;
  const percentRange = Math.max(0.5, maxPercent - minPercent);
  const hasMatrix = await ensureMatrixPlugin(chartLib);
  if (!hasMatrix) {
    destroyReportChartSlot(dashboardState, slot);
    return false;
  }
  const baseColor = parseHexColor(getCssVar('--report-referral', '#ef4444'), { r: 239, g: 68, b: 68 });
  const lightColor = mixRgb(baseColor, { r: 255, g: 255, b: 255 }, 0.88);
  const monthLabel = (month) => {
    const value = Number(month);
    if (!Number.isFinite(value)) {
      return String(month || '');
    }
    return capitalizeSentence(monthFormatter.format(new Date(2020, Math.max(0, value - 1), 1)));
  };
  updateOrCreateReportChart(slot, dashboardState, chartLib, canvas, {
    type: 'matrix',
    data: {
      datasets: [{
        label: TEXT.summariesReports?.cards?.referralMonthlyHeatmap || 'Siuntimų % pagal mėnesį',
        data: rows.map((row) => ({
          x: row.month,
          y: row.year,
          v: row.share * 100,
          total: row.total,
          referred: row.referred,
        })),
        width: ({ chart }) => {
          const area = chart?.chartArea;
          if (!area || !months.length) {
            return 18;
          }
          return Math.max(14, (area.width / months.length) - 3);
        },
        height: ({ chart }) => {
          const area = chart?.chartArea;
          if (!area || !years.length) {
            return 18;
          }
          return Math.max(16, (area.height / years.length) - 3);
        },
        backgroundColor: (context) => {
          const value = Number(context.raw?.v || 0);
          const normalized = Math.max(0, Math.min(1, (value - minPercent) / percentRange));
          const boosted = Math.pow(normalized, 0.72);
          const color = mixRgb(lightColor, baseColor, boosted);
          return `rgb(${color.r}, ${color.g}, ${color.b})`;
        },
        borderColor: 'rgba(255, 255, 255, 0.86)',
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'category',
          labels: months,
          offset: true,
          ticks: {
            callback: (value, index) => monthLabel(months[index]),
            maxRotation: 50,
            minRotation: 35,
          },
        },
        y: {
          type: 'category',
          labels: years,
          offset: true,
          reverse: true,
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const raw = items?.[0]?.raw;
              return `${monthLabel(raw?.x)} ${raw?.y}`;
            },
            label: (context) => {
              const raw = context.raw || {};
              const percent = Number(raw.v || 0);
              const total = Number(raw.total || 0);
              return formatPercentTooltip(percent, total);
            },
            afterLabel: (context) => {
              const raw = context.raw || {};
              const referred = Number(raw.referred || 0);
              return `Su siuntimu: ${numberFormatter.format(referred)}`;
            },
          },
        },
      },
    },
  });
  return true;
}

function renderReferralHospitalizedByPspcChart(slot, dashboardState, chartLib, canvas, rows, color) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const height = Math.max(260, Math.min(760, 90 + rows.length * 28));
  canvas.style.setProperty('height', `${height}px`, 'important');
  canvas.style.setProperty('min-height', `${height}px`, 'important');
  canvas.style.setProperty('max-height', `${height}px`, 'important');
  const valueLabelPlugin = {
    id: `${slot}-count-labels`,
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      if (!meta || !Array.isArray(meta.data)) {
        return;
      }
      const c = chart.ctx;
      c.save();
      c.fillStyle = getCssVar('--color-text', '#e8ecf6');
      c.font = '600 11px Sora, sans-serif';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      meta.data.forEach((bar, index) => {
        const row = rows[index];
        if (!row || !bar) {
          return;
        }
        const count = Number.isFinite(row.referredTotal) ? row.referredTotal : 0;
        const x = bar.x + 8;
        const y = bar.y;
        c.fillText(`n=${numberFormatter.format(count)}`, x, y);
      });
      c.restore();
    },
  };
  updateOrCreateReportChart(slot, dashboardState, chartLib, canvas, {
    type: 'bar',
    data: {
      labels: rows.map((row) => row.label),
      datasets: [{ data: rows.map((row) => row.percent), backgroundColor: color, borderRadius: 6 }],
    },
    plugins: [valueLabelPlugin],
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          right: 72,
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const index = Number(items?.[0]?.dataIndex ?? -1);
              return index >= 0 && rows[index] ? rows[index].label : '';
            },
            label: (context) => {
              const index = Number(context.dataIndex ?? -1);
              const row = index >= 0 ? rows[index] : null;
              const percent = Number(context.parsed?.x ?? context.parsed ?? 0);
              const total = Number.isFinite(row?.referredTotal) ? row.referredTotal : 0;
              return formatPercentTooltip(percent, total);
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: (value) => `${Number(value).toFixed(0)}%`,
          },
        },
        y: {
          ticks: {
            autoSkip: false,
            callback: (_value, index) => String(rows[index]?.label || ''),
          },
        },
      },
    },
  }, { forceRecreate: true });
}

function renderReferralHospitalizedByPspcTrendChart(slot, dashboardState, chartLib, canvas, trendData, color) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const years = Array.isArray(trendData?.years) ? trendData.years : [];
  const series = Array.isArray(trendData?.series) ? trendData.series : [];
  canvas.style.setProperty('height', '320px', 'important');
  canvas.style.setProperty('min-height', '320px', 'important');
  canvas.style.setProperty('max-height', '320px', 'important');

  const fallbackColors = [
    color,
    '#0284c7',
    '#16a34a',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
  ];
  const datasets = series.map((item, index) => {
    const baseColor = fallbackColors[index % fallbackColors.length];
    return {
      label: item.label,
      data: item.points.map((point) => (Number.isFinite(point?.share) ? point.share * 100 : null)),
      borderColor: baseColor,
      backgroundColor: baseColor,
      tension: 0.28,
      spanGaps: false,
      fill: false,
      borderWidth: 2.2,
      pointRadius: 3.5,
      pointHoverRadius: 5.5,
      pointBackgroundColor: baseColor,
      pointBorderColor: baseColor,
      pointBorderWidth: 1,
      __points: item.points,
    };
  });

  const allValues = datasets
    .flatMap((dataset) => (Array.isArray(dataset.data) ? dataset.data : []))
    .filter((value) => Number.isFinite(value));
  const dynamicYAxis = (() => {
    if (!allValues.length) {
      return { min: 0, max: 100 };
    }
    const rawMin = Math.min(...allValues);
    const rawMax = Math.max(...allValues);
    const range = Math.max(0.5, rawMax - rawMin);
    const pad = Math.max(0.8, range * 0.18);
    const min = Math.max(0, rawMin - pad);
    const max = Math.min(100, rawMax + pad);
    if (max - min < 2) {
      const middle = (max + min) / 2;
      return {
        min: Math.max(0, middle - 1),
        max: Math.min(100, middle + 1),
      };
    }
    return { min, max };
  })();

  updateOrCreateReportChart(slot, dashboardState, chartLib, canvas, {
    type: 'line',
    data: {
      labels: years,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = Number(context.parsed?.y ?? 0);
              const dataset = context.dataset || {};
              const points = Array.isArray(dataset.__points) ? dataset.__points : [];
              const point = points[context.dataIndex] || {};
              const referred = Number(point.referredTotal || 0);
              const hospitalized = Number(point.hospitalizedCount || 0);
              return `${dataset.label}: ${oneDecimalFormatter.format(value)}% (n=${numberFormatter.format(referred)}, hosp=${numberFormatter.format(hospitalized)})`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 0,
            autoSkip: false,
          },
        },
        y: {
          min: dynamicYAxis.min,
          max: dynamicYAxis.max,
          ticks: {
            callback: (value) => `${Number(value).toFixed(0)}%`,
          },
          title: {
            display: true,
            text: 'Hospitalizacijų dalis (%)',
          },
        },
      },
    },
  }, { forceRecreate: true });
}

function renderPspcCorrelationChart(slot, dashboardState, chartLib, canvas, rows) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const valuesX = rows.map((row) => Number(row.referralPercent || 0)).filter((value) => Number.isFinite(value));
  const valuesY = rows.map((row) => Number(row.hospitalizedPercent || 0)).filter((value) => Number.isFinite(value));
  const minX = valuesX.length ? Math.max(0, Math.min(...valuesX) - 2) : 0;
  const maxX = valuesX.length ? Math.min(100, Math.max(...valuesX) + 2) : 100;
  const minY = valuesY.length ? Math.max(0, Math.min(...valuesY) - 2) : 0;
  const maxY = valuesY.length ? Math.min(100, Math.max(...valuesY) + 2) : 100;
  const totals = rows.map((row) => Number(row.total || 0)).filter((value) => Number.isFinite(value) && value > 0);
  const minTotal = totals.length ? Math.min(...totals) : 1;
  const maxTotal = totals.length ? Math.max(...totals) : 1;
  const radiusForTotal = (total) => {
    if (!Number.isFinite(total) || total <= 0 || maxTotal <= minTotal) {
      return 8;
    }
    const normalized = (total - minTotal) / (maxTotal - minTotal);
    return 6 + (normalized * 16);
  };
  const fillColor = getCssVar('--report-correlation-fill', 'rgba(37, 99, 235, 0.38)');
  const strokeColor = getCssVar('--report-correlation-stroke', 'rgba(37, 99, 235, 0.9)');
  updateOrCreateReportChart(slot, dashboardState, chartLib, canvas, {
    type: 'bubble',
    data: {
      datasets: [{
        label: 'PSPC',
        data: rows.map((row) => ({
          x: row.referralPercent,
          y: row.hospitalizedPercent,
          r: radiusForTotal(row.total),
          label: row.label,
          total: row.total,
          referred: row.referred,
          hospitalized: row.hospitalized,
        })),
        backgroundColor: fillColor,
        borderColor: strokeColor,
        borderWidth: 1.5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => String(items?.[0]?.raw?.label || ''),
            label: (context) => {
              const raw = context.raw || {};
              const x = Number(raw.x || 0);
              const y = Number(raw.y || 0);
              const total = Number(raw.total || 0);
              return `Siuntimai: ${formatPercentTooltip(x, total)} | Hospitalizacijos: ${oneDecimalFormatter.format(y)}%`;
            },
            afterLabel: (context) => {
              const raw = context.raw || {};
              const referred = Number(raw.referred || 0);
              const hospitalized = Number(raw.hospitalized || 0);
              return `Su siuntimu: ${numberFormatter.format(referred)}, hospitalizuoti: ${numberFormatter.format(hospitalized)}`;
            },
          },
        },
      },
      scales: {
        x: {
          min: minX,
          max: maxX > minX ? maxX : Math.min(100, minX + 5),
          ticks: {
            callback: (value) => `${Number(value).toFixed(0)}%`,
          },
          title: {
            display: true,
            text: 'Pacientų su siuntimu dalis (%)',
          },
        },
        y: {
          min: minY,
          max: maxY > minY ? maxY : Math.min(100, minY + 5),
          ticks: {
            callback: (value) => `${Number(value).toFixed(0)}%`,
          },
          title: {
            display: true,
            text: 'Hospitalizacijų dalis (%)',
          },
        },
      },
    },
  });
}

async function renderReports(selectors, dashboardState, settings, exportState) {
  const historicalRecords = extractHistoricalRecords(dashboardState);
  const scopeMeta = getScopedReportsMeta(
    dashboardState,
    settings,
    historicalRecords,
    dashboardState.summariesReportsYear,
  );
  ensureCoverage(selectors, dashboardState, scopeMeta.coverage);
  syncReportsControls(selectors, dashboardState, scopeMeta.yearOptions);
  if (!scopeMeta.records.length) {
    destroyReportCharts(dashboardState);
    if (selectors.diagnosisInfo) {
      selectors.diagnosisInfo.textContent = TEXT.summariesReports?.empty || 'Duomenų nepakanka.';
    }
    return;
  }
  const reports = getReportsComputation(dashboardState, settings, historicalRecords, scopeMeta);
  const diagnosis = reports.diagnosis;
  const ageDiagnosisHeatmap = reports.ageDiagnosisHeatmap;
  const z769Trend = reports.z769Trend;
  const referralTrend = reports.referralTrend;
  const referralDispositionYearly = reports.referralDispositionYearly;
  const referralMonthlyHeatmap = reports.referralMonthlyHeatmap;
  const referralHospitalizedByPspc = reports.referralHospitalizedByPspc;
  const referralHospitalizedByPspcYearly = reports.referralHospitalizedByPspcYearly;
  const pspcCorrelation = reports.pspcCorrelation;
  const pspcDistribution = reports.pspcDistribution;
  const chartLib = dashboardState.chartLib || await loadChartJs();
  if (chartLib && !dashboardState.chartLib) {
    dashboardState.chartLib = chartLib;
  }
  if (!chartLib) {
    return;
  }
  applyChartThemeDefaults(chartLib);
  const diagnosisPercentRows = diagnosis.rows
    .filter((row) => String(row?.label || '') !== 'Kita / maža imtis')
    .map((row) => ({
    ...row,
    percent: toPercent(row.count, diagnosis.totalPatients),
  }));
  if (selectors.diagnosisInfo) {
    const topCodes = diagnosisPercentRows
      .slice(0, 6)
      .map((row) => `${row.label} (${oneDecimalFormatter.format(row.percent)}%)`)
      .join(', ');
    const baseNote = TEXT.summariesReports?.diagnosisNote || '';
    selectors.diagnosisInfo.textContent = topCodes
      ? `${baseNote} TOP kodai: ${topCodes}.`.trim()
      : baseNote;
  }
  const ageDistributionBySex = computeAgeDistributionBySex(scopeMeta.records);
  const ageDistributionRows = ageDistributionBySex.rows
    .filter((row) => String(row?.label || '') !== 'Nenurodyta');
  const referralHospitalizedPspcPercentRows = referralHospitalizedByPspc.rows.map((row) => ({
    ...row,
    percent: row.share * 100,
  }));
  const referralHospitalizedPspcYearlyRows = Array.isArray(referralHospitalizedByPspcYearly?.rows)
    ? referralHospitalizedByPspcYearly.rows
    : [];
  const referralHospitalizedPspcTrendOptions = referralHospitalizedPspcYearlyRows.map((row) => row.label);
  syncReportsControls(selectors, dashboardState, scopeMeta.yearOptions, referralHospitalizedPspcTrendOptions);
  const pspcCorrelationRows = pspcCorrelation.rows.map((row) => ({
    ...row,
    referralPercent: row.referralShare * 100,
    hospitalizedPercent: row.hospitalizedShare * 100,
  }));
  const pspcPercentRows = pspcDistribution.rows.map((row) => ({
    ...row,
    percent: toPercent(row.count, pspcDistribution.total),
  })).filter((row) => String(row?.label || '') !== 'Kita / maža imtis');
  const colors = {
    diagnosis: getCssVar('--report-diagnosis', '#0284c7'),
    referral: getCssVar('--report-referral', '#ef4444'),
    referralDisposition: {
      hospWithReferral: getCssVar('--report-disposition-hosp-with-referral', '#ef4444'),
      dischargedWithReferral: getCssVar('--report-disposition-discharged-with-referral', 'rgba(239, 68, 68, 0.28)'),
      hospWithoutReferral: getCssVar('--report-disposition-hosp-without-referral', '#2563eb'),
      dischargedWithoutReferral: getCssVar('--report-disposition-discharged-without-referral', 'rgba(37, 99, 235, 0.24)'),
    },
    age: getCssVar('--report-age', '#16a34a'),
    referralPspc: getCssVar('--report-referral-pspc', '#2563eb'),
    pspc: getCssVar('--report-pspc', '#f59e0b'),
  };
  const treemapRendered = await renderDiagnosisTreemap(dashboardState, chartLib, selectors.diagnosisChart, diagnosisPercentRows);
  if (!treemapRendered) {
    renderBarChart('diagnosisFrequency', dashboardState, chartLib, selectors.diagnosisChart, diagnosisPercentRows, colors.diagnosis);
  }
  await renderAgeDiagnosisHeatmapChart('ageDiagnosisHeatmap', dashboardState, chartLib, selectors.ageDiagnosisHeatmapChart, ageDiagnosisHeatmap);
  const z769Rows = z769Trend.rows.map((row) => ({
    ...row,
    percent: row.share * 100,
  }));
  renderPercentLineTrend('z769Trend', dashboardState, chartLib, selectors.z769TrendChart, z769Rows, 'Z76.9 dalis');
  const referralPercentRows = referralTrend.rows.map((row) => ({
    year: row.year,
    total: row.total,
    percent: toPercent(row.values['su siuntimu'] || 0, row.total || 0),
  }));
  renderPercentLineTrend('referralTrend', dashboardState, chartLib, selectors.referralTrendChart, referralPercentRows, 'Pacientai su siuntimu', colors.referral);
  renderReferralDispositionYearlyChart(
    'referralDispositionYearly',
    dashboardState,
    chartLib,
    selectors.referralDispositionYearlyChart,
    referralDispositionYearly,
    colors.referralDisposition,
  );
  await renderReferralMonthlyHeatmapChart(
    'referralMonthlyHeatmap',
    dashboardState,
    chartLib,
    selectors.referralMonthlyHeatmapChart,
    referralMonthlyHeatmap,
  );
  const referralHospitalizedPspcMode = String(dashboardState.summariesReferralPspcMode || 'cross').toLowerCase() === 'trend'
    ? 'trend'
    : 'cross';
  if (referralHospitalizedPspcMode === 'trend') {
    const selectedPspc = String(dashboardState.summariesReferralPspcTrendPspc || '__top3__');
    const trendYears = Array.isArray(referralHospitalizedByPspcYearly?.years) ? referralHospitalizedByPspcYearly.years : [];
    let selectedRows = [];
    if (selectedPspc === '__top3__') {
      selectedRows = referralHospitalizedPspcYearlyRows.slice(0, 3);
    } else {
      selectedRows = referralHospitalizedPspcYearlyRows.filter((row) => row.label === selectedPspc);
    }
    if (!selectedRows.length) {
      selectedRows = referralHospitalizedPspcYearlyRows.slice(0, 3);
    }
    const trendSeries = selectedRows.map((row) => ({
      label: row.label,
      points: Array.isArray(row.yearly) ? row.yearly : [],
    }));
    renderReferralHospitalizedByPspcTrendChart(
      'referralHospitalizedByPspc',
      dashboardState,
      chartLib,
      selectors.referralHospitalizedByPspcChart,
      { years: trendYears, series: trendSeries },
      colors.referralPspc,
    );
  } else {
    renderReferralHospitalizedByPspcChart(
      'referralHospitalizedByPspc',
      dashboardState,
      chartLib,
      selectors.referralHospitalizedByPspcChart,
      referralHospitalizedPspcPercentRows,
      colors.referralPspc,
    );
  }
  renderPspcCorrelationChart('pspcCorrelation', dashboardState, chartLib, selectors.pspcCorrelationChart, pspcCorrelationRows);
  renderAgeDistributionStackedBySex(
    'ageDistribution',
    dashboardState,
    chartLib,
    selectors.ageDistributionChart,
    {
      ...ageDistributionBySex,
      rows: ageDistributionRows,
    },
    {
      Vyras: '#2563eb',
      Moteris: '#ef4444',
      'Kita/Nenurodyta': '#94a3b8',
    },
  );
  renderBarChart('pspcDistribution', dashboardState, chartLib, selectors.pspcDistributionChart, pspcPercentRows, colors.pspc, { dynamicYAxis: true });
  exportState.diagnosis = {
    title: TEXT.summariesReports?.cards?.diagnosis || 'Diagnozės',
    headers: ['Diagnozė', 'Procentas (%)'],
    rows: diagnosisPercentRows.map((row) => [row.label, oneDecimalFormatter.format(row.percent)]),
    target: selectors.diagnosisChart,
  };
  exportState.ageDiagnosisHeatmap = {
    title: TEXT.summariesReports?.cards?.ageDiagnosisHeatmap || 'Amžiaus ir diagnozių grupių ryšys',
    headers: ['Amžiaus grupė', 'Diagnozių grupė', 'Dalis amžiaus grupėje (%)', 'Atvejų sk.', 'Amžiaus grupės pacientų sk.'],
    rows: ageDiagnosisHeatmap.rows.map((row) => [
      row.ageBand,
      row.diagnosisGroup,
      oneDecimalFormatter.format(row.percent),
      numberFormatter.format(row.count),
      numberFormatter.format(row.ageTotal),
    ]),
    target: selectors.ageDiagnosisHeatmapChart,
  };
  exportState.z769Trend = {
    title: 'Pasišalinę pacientai (Z76.9)',
    headers: ['Metai', 'Procentas (%)'],
    rows: z769Rows.map((row) => [row.year, oneDecimalFormatter.format(row.percent)]),
    target: selectors.z769TrendChart,
  };
  exportState.referralTrend = {
    title: TEXT.summariesReports?.cards?.referralTrend || 'Pacientai su siuntimu',
    headers: ['Metai', 'Pacientai su siuntimu (%)'],
    rows: referralPercentRows.map((row) => [row.year, oneDecimalFormatter.format(row.percent)]),
    target: selectors.referralTrendChart,
  };
  exportState.referralDispositionYearly = {
    title: TEXT.summariesReports?.cards?.referralDispositionYearly || 'Siuntimas × baigtis pagal metus',
    headers: ['Metai', 'Grupė', 'Hospitalizuoti (%)', 'Išleisti (%)', 'Imtis (n)'],
    rows: referralDispositionYearly.rows.flatMap((row) => {
      const suTotal = Number(row?.totals?.['su siuntimu'] || 0);
      const beTotal = Number(row?.totals?.['be siuntimo'] || 0);
      const suHosp = Number(row?.values?.['su siuntimu']?.hospitalizuoti || 0);
      const suDis = Number(row?.values?.['su siuntimu']?.isleisti || 0);
      const beHosp = Number(row?.values?.['be siuntimo']?.hospitalizuoti || 0);
      const beDis = Number(row?.values?.['be siuntimo']?.isleisti || 0);
      return [
        [
          row.year,
          'su siuntimu',
          oneDecimalFormatter.format(toPercent(suHosp, suTotal)),
          oneDecimalFormatter.format(toPercent(suDis, suTotal)),
          numberFormatter.format(suTotal),
        ],
        [
          row.year,
          'be siuntimo',
          oneDecimalFormatter.format(toPercent(beHosp, beTotal)),
          oneDecimalFormatter.format(toPercent(beDis, beTotal)),
          numberFormatter.format(beTotal),
        ],
      ];
    }),
    target: selectors.referralDispositionYearlyChart,
  };
  exportState.referralMonthlyHeatmap = {
    title: TEXT.summariesReports?.cards?.referralMonthlyHeatmap || 'Siuntimų % pagal mėnesį',
    headers: ['Metai', 'Mėnuo', 'Siuntimų dalis (%)', 'Pacientai (n)', 'Su siuntimu (n)'],
    rows: referralMonthlyHeatmap.rows.map((row) => [
      row.year,
      row.month,
      oneDecimalFormatter.format(row.share * 100),
      numberFormatter.format(row.total),
      numberFormatter.format(row.referred),
    ]),
    target: selectors.referralMonthlyHeatmapChart,
  };
  if (referralHospitalizedPspcMode === 'trend') {
    const selectedPspc = String(dashboardState.summariesReferralPspcTrendPspc || '__top3__');
    let selectedRows = selectedPspc === '__top3__'
      ? referralHospitalizedPspcYearlyRows.slice(0, 3)
      : referralHospitalizedPspcYearlyRows.filter((row) => row.label === selectedPspc);
    if (!selectedRows.length) {
      selectedRows = referralHospitalizedPspcYearlyRows.slice(0, 3);
    }
    exportState.referralHospitalizedByPspc = {
      title: `${TEXT.summariesReports?.cards?.referralHospitalizedByPspc || 'Hospitalizacijų dalis tarp pacientų su siuntimu pagal PSPC'} (metinė dinamika)`,
      headers: ['PSPC', 'Metai', 'Hospitalizuota iš su siuntimu (%)', 'Hospitalizuota (sk.)', 'Pacientai su siuntimu (sk.)'],
      rows: selectedRows.flatMap((row) => (Array.isArray(row.yearly) ? row.yearly : []).map((point) => [
        row.label,
        point.year,
        Number.isFinite(point.share) ? oneDecimalFormatter.format(point.share * 100) : '',
        numberFormatter.format(point.hospitalizedCount || 0),
        numberFormatter.format(point.referredTotal || 0),
      ])),
      target: selectors.referralHospitalizedByPspcChart,
    };
  } else {
    exportState.referralHospitalizedByPspc = {
      title: TEXT.summariesReports?.cards?.referralHospitalizedByPspc || 'Hospitalizacijų dalis tarp pacientų su siuntimu pagal PSPC',
      headers: ['PSPC', 'Hospitalizuota iš su siuntimu (%)', 'Hospitalizuota (sk.)', 'Pacientai su siuntimu (sk.)'],
      rows: referralHospitalizedPspcPercentRows.map((row) => [
        row.label,
        oneDecimalFormatter.format(row.percent),
        numberFormatter.format(row.hospitalizedCount),
        numberFormatter.format(row.referredTotal),
      ]),
      target: selectors.referralHospitalizedByPspcChart,
    };
  }
  exportState.pspcCorrelation = {
    title: TEXT.summariesReports?.cards?.pspcCorrelation || 'PSPC: siuntimų ir hospitalizacijų ryšys',
    headers: ['PSPC', 'Siuntimų dalis (%)', 'Hospitalizacijų dalis (%)', 'Pacientai (sk.)', 'Su siuntimu (sk.)', 'Hospitalizuoti (sk.)'],
    rows: pspcCorrelationRows.map((row) => [
      row.label,
      oneDecimalFormatter.format(row.referralPercent),
      oneDecimalFormatter.format(row.hospitalizedPercent),
      numberFormatter.format(row.total),
      numberFormatter.format(row.referred),
      numberFormatter.format(row.hospitalized),
    ]),
    target: selectors.pspcCorrelationChart,
  };
  exportState.ageDistribution = {
    title: TEXT.summariesReports?.cards?.ageDistribution || 'Amžius',
    headers: ['Amžiaus grupė', 'Iš viso (%)', 'Vyras (%)', 'Moteris (%)', 'Kita/Nenurodyta (%)', 'Iš viso (n)'],
    rows: ageDistributionRows.map((row) => [
      row.label,
      oneDecimalFormatter.format(toPercent(row.total, ageDistributionBySex.total)),
      oneDecimalFormatter.format(toPercent(row.bySex?.Vyras || 0, ageDistributionBySex.total)),
      oneDecimalFormatter.format(toPercent(row.bySex?.Moteris || 0, ageDistributionBySex.total)),
      oneDecimalFormatter.format(toPercent(row.bySex?.['Kita/Nenurodyta'] || 0, ageDistributionBySex.total)),
      numberFormatter.format(row.total),
    ]),
    target: selectors.ageDistributionChart,
  };
  exportState.pspcDistribution = {
    title: TEXT.summariesReports?.cards?.pspcDistribution || 'PSPC',
    headers: ['PSPC', 'Procentas (%)'],
    rows: pspcPercentRows.map((row) => [row.label, oneDecimalFormatter.format(row.percent)]),
    target: selectors.pspcDistributionChart,
  };
}

async function handleReportExportClick(event, exportState) {
  const button = event.currentTarget;
  if (!(button instanceof HTMLElement)) {
    return;
  }
  const key = getDatasetValue(button, 'reportKey', '');
  const format = getDatasetValue(button, 'reportExport', 'csv');
  const model = exportState[key];
  if (!model) {
    setCopyButtonFeedback(button, 'Nėra duomenų eksportui', 'error');
    return;
  }
  if (format === 'csv') {
    const csv = createRowsCsv(model.headers || [], model.rows || []);
    const ok = triggerDownloadFromBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), formatExportFilename(model.title, 'csv'));
    setCopyButtonFeedback(button, ok ? 'Ataskaita parsisiųsta' : 'Klaida parsisiunčiant', ok ? 'success' : 'error');
    return;
  }
  if (model.target instanceof HTMLCanvasElement) {
    const link = document.createElement('a');
    link.href = model.target.toDataURL('image/png');
    link.download = formatExportFilename(model.title, 'png');
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setCopyButtonFeedback(button, 'Ataskaita parsisiųsta', 'success');
    return;
  }
}

export async function runSummariesRuntime(core) {
  const pageConfig = core?.pageConfig || { yearly: true };
  const selectors = createSelectorsForPage(core?.pageId || 'summaries');
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
  const exportState = {};
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
  if (selectors.summariesReportsSubtitle) {
    selectors.summariesReportsSubtitle.textContent = TEXT.summariesReports?.subtitle || selectors.summariesReportsSubtitle.textContent;
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
  let rerenderReports = () => {};
  const toggleTheme = () => {
    applyTheme(dashboardState, selectors, dashboardState.theme === 'dark' ? 'light' : 'dark', {
      persist: true,
      themeStorageKey: THEME_STORAGE_KEY,
    });
    rerenderReports();
  };
  const layoutTools = createLayoutTools({ selectors });
  initSectionNavigation({ selectors, ...layoutTools });
  initScrollTopButton({ selectors, updateScrollTopButtonVisibility: layoutTools.updateScrollTopButtonVisibility, scheduleScrollTopUpdate: layoutTools.scheduleScrollTopUpdate });
  initThemeToggle({ selectors, toggleTheme });
  initYearlyExpand({ selectors, handleYearlyToggle: (event) => handleYearlyToggle(selectors, dashboardState, event) });
  initTableDownloadButtons({ selectors, storeCopyButtonBaseLabel, handleTableDownloadClick });
  if (Array.isArray(selectors.reportExportButtons)) {
    selectors.reportExportButtons.forEach((button) => {
      button.addEventListener('click', (event) => handleReportExportClick(event, exportState));
    });
  }
  rerenderReports = () => renderReports(selectors, dashboardState, settings, exportState);
  if (selectors.summariesReportsYear) {
    selectors.summariesReportsYear.addEventListener('change', (event) => {
      const value = String(event.target.value || 'all');
      dashboardState.summariesReportsYear = value === 'all' ? 'all' : value;
      rerenderReports();
    });
  }
  if (selectors.summariesReportsTopN) {
    selectors.summariesReportsTopN.addEventListener('change', (event) => {
      const value = Number.parseInt(String(event.target.value || '15'), 10);
      dashboardState.summariesReportsTopN = Number.isFinite(value) && value > 0 ? value : 15;
      rerenderReports();
    });
  }
  if (selectors.summariesReportsMinGroupSize) {
    selectors.summariesReportsMinGroupSize.addEventListener('change', (event) => {
      const value = Number.parseInt(String(event.target.value || '10'), 10);
      dashboardState.summariesReportsMinGroupSize = Number.isFinite(value) && value > 0 ? value : 10;
      rerenderReports();
    });
  }
  if (selectors.referralHospitalizedByPspcSort) {
    selectors.referralHospitalizedByPspcSort.addEventListener('change', (event) => {
      const value = String(event.target.value || 'desc').toLowerCase();
      dashboardState.summariesReferralPspcSort = value === 'asc' ? 'asc' : 'desc';
      rerenderReports();
    });
  }
  if (selectors.referralHospitalizedByPspcMode) {
    selectors.referralHospitalizedByPspcMode.addEventListener('change', (event) => {
      const value = String(event.target.value || 'cross').toLowerCase();
      dashboardState.summariesReferralPspcMode = value === 'trend' ? 'trend' : 'cross';
      rerenderReports();
    });
  }
  if (selectors.referralHospitalizedByPspcTrendPspc) {
    selectors.referralHospitalizedByPspcTrendPspc.addEventListener('change', (event) => {
      const value = String(event.target.value || '__top3__');
      dashboardState.summariesReferralPspcTrendPspc = value || '__top3__';
      rerenderReports();
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
    renderYearlyTable: (yearlyStats) => {
      renderYearlyTable(selectors, dashboardState, yearlyStats);
      rerenderReports();
    },
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
  rerenderReports();
  dataFlow.scheduleInitialLoad();
}
