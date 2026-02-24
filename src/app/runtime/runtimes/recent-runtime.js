import { createMainDataHandlers } from '../../../data/main-data.js?v=2026-02-08-merge-agg-fix';
import { computeDailyStats } from '../../../data/stats.js';
import { initTableDownloadButtons } from '../../../events/charts.js';
import { initCompareControls } from '../../../events/compare.js';
import { getRecentCompareMetricLabel } from '../../../metrics/recent-compare.js';
import { createDashboardState } from '../../../state/dashboardState.js';
import { createSelectorsForPage } from '../../../state/selectors.js';
import { getDatasetValue, runAfterDomAndIdle, setDatasetValue } from '../../../utils/dom.js';
import {
  dailyDateFormatter,
  decimalFormatter,
  numberFormatter,
  oneDecimalFormatter,
  percentFormatter,
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
import { dateKeyToDate, filterDailyStatsByWindow } from '../chart-primitives.js';
import { setCopyButtonFeedback, storeCopyButtonBaseLabel } from '../clipboard.js';
import { createDataFlow } from '../data-flow.js';
import { applyTheme, initializeTheme } from '../features/theme.js';
import {
  createTextSignature,
  describeCacheMeta,
  describeError,
  downloadCsv,
  formatUrlForDiagnostics,
} from '../network.js';
import { applyCommonPageShellText, setupSharedPageUi } from '../page-ui.js';
import { createRuntimeClientContext } from '../runtime-client.js';
import { loadSettingsFromConfig } from '../settings.js';
import {
  createDefaultChartFilters,
  createDefaultFeedbackFilters,
  createDefaultKpiFilters,
} from '../state.js';
import { createTableDownloadHandler } from '../table-export.js';
import { createStatusSetter } from '../utils/common.js';

const runtimeClient = createRuntimeClientContext(CLIENT_CONFIG_KEY);
let autoRefreshTimerId = null;
const setStatus = createStatusSetter(TEXT.status);

function formatValueWithShare(value, total) {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (!Number.isFinite(total) || total <= 0) {
    return numberFormatter.format(safeValue);
  }
  return `${numberFormatter.format(safeValue)} (${percentFormatter.format(safeValue / total)})`;
}

function formatRoundedValueWithShare(value, total) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const roundedValue = Math.round(safeValue);
  if (!Number.isFinite(total) || total <= 0) {
    return numberFormatter.format(roundedValue);
  }
  return `${numberFormatter.format(roundedValue)} (${percentFormatter.format(safeValue / total)})`;
}

function extractCompareMetricsFromRow(row) {
  if (!(row instanceof HTMLElement)) {
    return null;
  }
  const id = getDatasetValue(row, 'compareId', '');
  if (!id) {
    return null;
  }
  return {
    id,
    group: getDatasetValue(row, 'compareGroup', 'recent'),
    label: getDatasetValue(row, 'compareLabel', id),
    sortKey: getDatasetValue(row, 'compareSort', id),
    total: Number.parseFloat(getDatasetValue(row, 'total', '0')) || 0,
    avgStay: Number.parseFloat(getDatasetValue(row, 'avgStay', '0')) || 0,
    emsShare: Number.parseFloat(getDatasetValue(row, 'emsShare', '0')) || 0,
    hospShare: Number.parseFloat(getDatasetValue(row, 'hospShare', '0')) || 0,
  };
}

function createRecentCompareFeature({ selectors, dashboardState, settings }) {
  const compareLabels = TEXT.compare?.metrics || {};

  function updateCompareSummary() {
    if (!selectors.compareSummary) {
      return;
    }
    if (!dashboardState.compare.active) {
      selectors.compareSummary.textContent = TEXT.compare.prompt;
      return;
    }
    const selections = dashboardState.compare.selections || [];
    if (!selections.length) {
      selectors.compareSummary.textContent = TEXT.compare.prompt;
      return;
    }
    if (selections.length === 1) {
      selectors.compareSummary.textContent = TEXT.compare.insufficient;
      return;
    }
    const sorted = [...selections].sort((a, b) => (a.sortKey > b.sortKey ? 1 : -1));
    const older = sorted[0];
    const newer = sorted[sorted.length - 1];
    const summaryTitle = TEXT.compare.summaryTitle(newer.label, older.label);
    const diffToText = (value, formatter, unit = '') => {
      if (Math.abs(value) < 0.0001) {
        return 'pokyčių nėra';
      }
      const sign = value > 0 ? '+' : '−';
      return `${sign}${formatter(Math.abs(value))}${unit}`;
    };
    const totalDiff = newer.total - older.total;
    const avgStayDiff = newer.avgStay - older.avgStay;
    const emsShareDiff = (newer.emsShare - older.emsShare) * 100;
    const hospShareDiff = (newer.hospShare - older.hospShare) * 100;
    const totalLabel = getRecentCompareMetricLabel('total', compareLabels, settings);
    const avgStayLabel = getRecentCompareMetricLabel('avgStay', compareLabels, settings);
    const emsShareLabel = getRecentCompareMetricLabel('emsShare', compareLabels, settings);
    const hospShareLabel = getRecentCompareMetricLabel('hospShare', compareLabels, settings);
    selectors.compareSummary.innerHTML = `
      <strong>${summaryTitle}</strong>
      <ul>
        <li><strong>${totalLabel}:</strong> ${numberFormatter.format(newer.total)} vs ${numberFormatter.format(older.total)} (Δ ${diffToText(totalDiff, (val) => numberFormatter.format(Math.round(val)))})</li>
        <li><strong>${avgStayLabel}:</strong> ${decimalFormatter.format(newer.avgStay)} vs ${decimalFormatter.format(older.avgStay)} (Δ ${diffToText(avgStayDiff, (val) => decimalFormatter.format(val), ' val.')})</li>
        <li><strong>${emsShareLabel}:</strong> ${percentFormatter.format(newer.emsShare)} vs ${percentFormatter.format(older.emsShare)} (Δ ${diffToText(emsShareDiff, (val) => oneDecimalFormatter.format(val), ' p. p.')})</li>
        <li><strong>${hospShareLabel}:</strong> ${percentFormatter.format(newer.hospShare)} vs ${percentFormatter.format(older.hospShare)} (Δ ${diffToText(hospShareDiff, (val) => oneDecimalFormatter.format(val), ' p. p.')})</li>
      </ul>
    `;
  }

  function syncCompareActivation() {
    const active = dashboardState.compare.active;
    const rows = selectors.recentTable
      ? Array.from(selectors.recentTable.querySelectorAll('tr[data-compare-id]'))
      : [];
    rows.forEach((row) => {
      if (!active) {
        row.classList.remove('table-row--selectable', 'table-row--selected');
        row.removeAttribute('tabindex');
        row.removeAttribute('role');
        row.removeAttribute('aria-pressed');
        return;
      }
      row.classList.add('table-row--selectable');
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      const metrics = extractCompareMetricsFromRow(row);
      const isSelected = metrics && dashboardState.compare.selections.some((item) => item.id === metrics.id);
      row.classList.toggle('table-row--selected', Boolean(isSelected));
      row.setAttribute('aria-pressed', String(Boolean(isSelected)));
    });
    updateCompareSummary();
  }

  function clearCompareSelection() {
    dashboardState.compare.selections = [];
    syncCompareActivation();
  }

  function handleCompareRowSelection(row) {
    if (!dashboardState.compare.active) {
      return;
    }
    const metrics = extractCompareMetricsFromRow(row);
    if (!metrics) {
      return;
    }
    const existingIndex = dashboardState.compare.selections.findIndex((item) => item.id === metrics.id);
    if (existingIndex >= 0) {
      dashboardState.compare.selections.splice(existingIndex, 1);
    } else {
      if (dashboardState.compare.selections.length >= 2) {
        dashboardState.compare.selections.shift();
      }
      dashboardState.compare.selections.push(metrics);
    }
    syncCompareActivation();
  }

  function setCompareMode(active) {
    const normalized = Boolean(active);
    dashboardState.compare.active = normalized;
    if (selectors.compareToggle) {
      selectors.compareToggle.textContent = normalized ? TEXT.compare.active : TEXT.compare.toggle;
      selectors.compareToggle.setAttribute('aria-pressed', String(normalized));
    }
    if (selectors.compareCard) {
      if (normalized) {
        selectors.compareCard.removeAttribute('hidden');
      } else {
        selectors.compareCard.setAttribute('hidden', 'hidden');
      }
    }
    if (!normalized) {
      clearCompareSelection();
    } else {
      syncCompareActivation();
    }
  }

  return {
    updateCompareSummary,
    syncCompareActivation,
    clearCompareSelection,
    handleCompareRowSelection,
    setCompareMode,
  };
}

function renderRecentTable(selectors, compareFeature, recentDailyStats) {
  selectors.recentTable.replaceChildren();
  if (!Array.isArray(recentDailyStats) || !recentDailyStats.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.textContent = TEXT.recent.empty;
    row.appendChild(cell);
    selectors.recentTable.appendChild(row);
    compareFeature.syncCompareActivation();
    return;
  }

  const sorted = [...recentDailyStats].sort((a, b) => (a.date > b.date ? -1 : 1));
  const daysCount = sorted.length;
  const totals = sorted.reduce(
    (acc, entry) => {
      const total = Number.isFinite(entry?.count) ? entry.count : 0;
      acc.total += total;
      acc.night += Number.isFinite(entry?.night) ? entry.night : 0;
      acc.ems += Number.isFinite(entry?.ems) ? entry.ems : 0;
      acc.hospitalized += Number.isFinite(entry?.hospitalized) ? entry.hospitalized : 0;
      acc.discharged += Number.isFinite(entry?.discharged) ? entry.discharged : 0;
      acc.totalTime += Number.isFinite(entry?.totalTime) ? entry.totalTime : 0;
      acc.durations += Number.isFinite(entry?.durations) ? entry.durations : 0;
      return acc;
    },
    { total: 0, night: 0, ems: 0, hospitalized: 0, discharged: 0, totalTime: 0, durations: 0 }
  );

  const summaryRow = document.createElement('tr');
  summaryRow.classList.add('table-row--summary');
  const avgTotal = daysCount ? totals.total / daysCount : 0;
  const avgNight = daysCount ? totals.night / daysCount : 0;
  const avgEms = daysCount ? totals.ems / daysCount : 0;
  const avgHosp = daysCount ? totals.hospitalized / daysCount : 0;
  const avgDis = daysCount ? totals.discharged / daysCount : 0;
  const avgStay = totals.durations ? totals.totalTime / totals.durations : 0;
  const avgTotalRounded = Math.round(avgTotal);
  summaryRow.innerHTML = `
    <td>7 d. vidurkis</td>
    <td>${numberFormatter.format(avgTotalRounded)}</td>
    <td>${decimalFormatter.format(avgStay)}</td>
    <td>${formatRoundedValueWithShare(avgNight, avgTotal)}</td>
    <td>${formatRoundedValueWithShare(avgEms, avgTotal)}</td>
    <td>${formatRoundedValueWithShare(avgHosp, avgTotal)}</td>
    <td>${formatRoundedValueWithShare(avgDis, avgTotal)}</td>
  `;
  selectors.recentTable.appendChild(summaryRow);

  sorted.forEach((entry) => {
    const row = document.createElement('tr');
    const dateValue = dateKeyToDate(entry.date);
    const displayDate = dateValue ? dailyDateFormatter.format(dateValue) : entry.date;
    const weekday = dateValue instanceof Date ? dateValue.getDay() : null;
    const isWeekend = weekday === 0 || weekday === 6;
    const total = Number.isFinite(entry.count) ? entry.count : 0;
    const avgStayEntry = entry.durations ? entry.totalTime / entry.durations : 0;
    const hospShare = total > 0 ? entry.hospitalized / total : 0;
    const emsShare = total > 0 ? entry.ems / total : 0;

    const dateCell = document.createElement('td');
    dateCell.textContent = displayDate;
    if (isWeekend) {
      row.classList.add('table-row--weekend');
    }
    const totalCell = document.createElement('td');
    totalCell.textContent = numberFormatter.format(total);
    const stayCell = document.createElement('td');
    stayCell.textContent = decimalFormatter.format(avgStayEntry);
    const nightCell = document.createElement('td');
    nightCell.innerHTML = formatValueWithShare(entry.night, total);
    const emsCell = document.createElement('td');
    emsCell.innerHTML = formatValueWithShare(entry.ems, total);
    const hospCell = document.createElement('td');
    hospCell.innerHTML = formatValueWithShare(entry.hospitalized, total);
    const disCell = document.createElement('td');
    disCell.innerHTML = formatValueWithShare(entry.discharged, total);
    row.append(dateCell, totalCell, stayCell, nightCell, emsCell, hospCell, disCell);

    setDatasetValue(row, 'compareId', `recent-${entry.date}`);
    setDatasetValue(row, 'compareGroup', 'recent');
    setDatasetValue(row, 'compareLabel', displayDate);
    setDatasetValue(row, 'compareSort', entry.date);
    setDatasetValue(row, 'total', String(total));
    setDatasetValue(row, 'avgStay', String(avgStayEntry));
    setDatasetValue(row, 'emsShare', String(emsShare));
    setDatasetValue(row, 'hospShare', String(hospShare));
    selectors.recentTable.appendChild(row);
  });
  compareFeature.syncCompareActivation();
}

const handleTableDownloadClick = createTableDownloadHandler({
  getDatasetValue,
  setCopyButtonFeedback,
  defaultTitle: 'Paskutines-dienos',
});

export async function runRecentRuntime(core) {
  const pageConfig = core?.pageConfig || { recent: true };
  const selectors = createSelectorsForPage(core?.pageId || 'recent');
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
  const compareFeature = createRecentCompareFeature({ selectors, dashboardState, settings });

  const { fetchData } = createMainDataHandlers({
    settings,
    DEFAULT_SETTINGS,
    dashboardState,
    downloadCsv,
    describeError: (error, options = {}) =>
      describeError(error, { ...options, fallbackMessage: TEXT.status.error }),
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
  });
  initCompareControls({
    selectors,
    dashboardState,
    setCompareMode: compareFeature.setCompareMode,
    clearCompareSelection: compareFeature.clearCompareSelection,
    updateCompareSummary: compareFeature.updateCompareSummary,
    handleCompareRowSelection: compareFeature.handleCompareRowSelection,
  });
  initTableDownloadButtons({ selectors, storeCopyButtonBaseLabel, handleTableDownloadClick });

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
      getAutoRefreshTimerId: () => autoRefreshTimerId,
      setAutoRefreshTimerId: (id) => {
        autoRefreshTimerId = id;
      },
    },
    dataHooks: {
      fetchData,
      perfMonitor: runtimeClient.perfMonitor,
      describeCacheMeta,
      describeError: (error, options = {}) =>
        describeError(error, { ...options, fallbackMessage: TEXT.status.error }),
      computeDailyStats,
      filterDailyStatsByWindow,
      renderRecentTable: (recentDailyStats) => renderRecentTable(selectors, compareFeature, recentDailyStats),
    },
  });
  compareFeature.setCompareMode(false);
  dataFlow.scheduleInitialLoad();
}
