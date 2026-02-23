import { createMainDataHandlers } from '../../../data/main-data.js?v=2026-02-08-merge-agg-fix';
import {
  computeDailyStats,
  computeMonthlyStats,
  computeYearlyStats,
} from '../../../data/stats.js?v=2026-02-07-monthly-heatmap-1';
import { initTableDownloadButtons } from '../../../events/charts.js';
import { initYearlyExpand } from '../../../events/yearly.js';
import { getSummariesReportTitle } from '../../../metrics/summaries-report.js';
import { createDashboardState } from '../../../state/dashboardState.js';
import { createSelectorsForPage } from '../../../state/selectors.js';
import { loadChartJs } from '../../../utils/chart-loader.js';
import { getDatasetValue, runAfterDomAndIdle, setDatasetValue } from '../../../utils/dom.js';
import {
  capitalizeSentence,
  monthFormatter,
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
import { setCopyButtonFeedback, storeCopyButtonBaseLabel, writeTextToClipboard } from '../clipboard.js';
import { createDataFlow } from '../data-flow.js';
import {
  initSummariesJumpNavigation,
  initSummariesJumpStickyOffset,
} from '../features/summaries-jump-navigation.js';
import {
  applyChartThemeDefaults,
  formatExportFilename,
  getCssVar,
  mixRgb,
  parseHexColor,
} from '../features/summaries-runtime-helpers.js';
import { handleYearlyToggle, renderYearlyTable } from '../features/summaries-yearly-table.js';
import { applyTheme, initializeTheme } from '../features/theme.js';
import { parseFromQuery, replaceUrlQuery, serializeToQuery } from '../filters/query-codec.js';
import { buildFilterSummary } from '../filters/summary.js';
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
import { createTableDownloadHandler, escapeCsvCell } from '../table-export.js';
import { createStatusSetter } from '../utils/common.js';
import { createSummariesDataFlowConfig } from './summaries/data-flow-config.js';
import { loadPluginScript } from './summaries/plugin-loader.js';
import {
  computeReferralHospitalizedShareByPspcDetailed,
  extractHistoricalRecords,
  getReportsComputation,
  getScopedReportsMeta,
  sortPspcRows,
} from './summaries/report-computation.js';
import { syncReportsControls } from './summaries/report-controls.js';
import { createReportExportClickHandler } from './summaries/report-export.js';
import { parsePositiveIntOrDefault } from './summaries/report-filters.js';
import { wireSummariesInteractions } from './summaries/runtime-interactions.js';

const runtimeClient = createRuntimeClientContext(CLIENT_CONFIG_KEY);
let autoRefreshTimerId = null;
let treemapPluginPromise = null;
let matrixPluginPromise = null;
const PLUGIN_SCRIPT_TIMEOUT_MS = 8000;
const setStatus = createStatusSetter(TEXT.status, { showSuccessState: false });

const handleTableDownloadClick = createTableDownloadHandler({
  getDatasetValue,
  setCopyButtonFeedback,
  defaultTitle: 'Lentelė',
  formatFilename: formatExportFilename,
});

function getReportCardTitle(reportKey, fallback, settings) {
  return getSummariesReportTitle(reportKey, TEXT.summariesReports?.cards || {}, settings) || fallback;
}

async function handleYearlyTableCopyClick(event) {
  const button = event?.currentTarget;
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
    .map((row) =>
      Array.from(row.children)
        .map((cell) => escapeCsvCell(cell.textContent.trim()))
        .join(',')
    )
    .join('\n');
  if (!rows) {
    setCopyButtonFeedback(button, 'Lentelė tuščia', 'error');
    return;
  }
  try {
    const ok = await writeTextToClipboard(rows);
    setCopyButtonFeedback(
      button,
      ok ? 'Lentelė nukopijuota' : 'Nepavyko nukopijuoti',
      ok ? 'success' : 'error'
    );
  } catch (_error) {
    setCopyButtonFeedback(button, 'Nepavyko nukopijuoti', 'error');
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
  const canUpdate =
    !forceRecreate &&
    existing &&
    typeof existing.update === 'function' &&
    existing.canvas === canvas &&
    existingType === incomingType;
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
      ? TEXT.summariesReports.coverage(
          numberFormatter.format(extended),
          numberFormatter.format(total),
          percentFormatter.format(percent)
        )
      : `Analizėje naudojami papildomi įrašai: ${extended}/${total}.`;
  }
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
  } catch (_error) {
    return false;
  }
}

function hasMatrixController(chartLib) {
  if (!chartLib || !chartLib.registry || typeof chartLib.registry.getController !== 'function') {
    return false;
  }
  try {
    return Boolean(chartLib.registry.getController('matrix'));
  } catch (_error) {
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
    const scriptSrc =
      'https://cdn.jsdelivr.net/npm/chartjs-chart-treemap@3.1.0/dist/chartjs-chart-treemap.min.js';
    treemapPluginPromise = loadPluginScript(scriptSrc, PLUGIN_SCRIPT_TIMEOUT_MS);
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
    const scriptSrc =
      'https://cdn.jsdelivr.net/npm/chartjs-chart-matrix@2.0.1/dist/chartjs-chart-matrix.min.js';
    matrixPluginPromise = loadPluginScript(scriptSrc, PLUGIN_SCRIPT_TIMEOUT_MS);
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
              const count = Number.isFinite(row?.count)
                ? row.count
                : Number.isFinite(row?.total)
                  ? row.total
                  : null;
              return formatPercentTooltip(value, count);
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: !dynamicYAxis,
          min: dynamicYAxis ? dynamicMin : 0,
          max: dynamicYAxis ? (dynamicMax > dynamicMin ? dynamicMax : Math.min(100, dynamicMin + 1)) : 100,
          ticks: {
            callback: (value) => `${Number(value).toFixed(0)}%`,
          },
        },
      },
    },
  });
}

function normalizeSexLabel(rawValue) {
  const value = String(rawValue || '')
    .trim()
    .toLowerCase();
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
  const buckets = new Map(
    ageOrder.map((label) => [
      label,
      {
        label,
        total: 0,
        bySex: {
          Vyras: 0,
          Moteris: 0,
          'Kita/Nenurodyta': 0,
        },
      },
    ])
  );

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

function renderAgeDistributionStackedBySex(
  slot,
  dashboardState,
  chartLib,
  canvas,
  distribution,
  palette = {}
) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const rows = Array.isArray(distribution?.rows) ? distribution.rows : [];
  const total = Number(distribution?.total || 0);
  const sexOrder =
    Array.isArray(distribution?.sexOrder) && distribution.sexOrder.length
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

function _renderPieChart(slot, dashboardState, chartLib, canvas, rows, palette) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  updateOrCreateReportChart(slot, dashboardState, chartLib, canvas, {
    type: 'pie',
    data: {
      labels: rows.map((row) => row.label),
      datasets: [
        {
          data: rows.map((row) => row.percent),
          backgroundColor: rows.map((_, index) => palette[index % palette.length]),
          borderWidth: 0,
        },
      ],
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
              const count = Number.isFinite(row?.count)
                ? row.count
                : Number.isFinite(row?.total)
                  ? row.total
                  : null;
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
  updateOrCreateReportChart(
    'diagnosisFrequency',
    dashboardState,
    chartLib,
    canvas,
    {
      type: 'treemap',
      data: {
        datasets: [
          {
            tree,
            key: 'percent',
            groups: ['code'],
            spacing: 2,
            borderWidth: 0,
            borderColor: 'rgba(255, 255, 255, 0)',
            backgroundColor: (context) => {
              const value = Number(context.raw?._data?.percent ?? 0);
              const alpha = Math.max(0.48, Math.min(0.92, value / 16));
              const base = getCssVar('--report-diagnosis', '#0284c7');
              if (base.startsWith('#')) {
                const hex = base.replace('#', '');
                const fullHex =
                  hex.length === 3
                    ? hex
                        .split('')
                        .map((char) => `${char}${char}`)
                        .join('')
                    : hex;
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
          },
        ],
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
    },
    { forceRecreate: true }
  );
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
  const height = Math.max(340, Math.min(820, 140 + ageBands.length * 44));
  canvas.style.setProperty('height', `${height}px`, 'important');
  canvas.style.setProperty('min-height', `${height}px`, 'important');
  canvas.style.setProperty('max-height', `${height}px`, 'important');
  const maxPercent = Math.max(...rows.map((row) => Number(row?.percent || 0)), 0);
  const hasMatrix = await ensureMatrixPlugin(chartLib);
  if (hasMatrix) {
    updateOrCreateReportChart(slot, dashboardState, chartLib, canvas, {
      type: 'matrix',
      data: {
        datasets: [
          {
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
              return Math.max(12, area.width / diagnosisGroups.length - 3);
            },
            height: ({ chart }) => {
              const area = chart?.chartArea;
              if (!area || !ageBands.length) {
                return 18;
              }
              return Math.max(16, area.height / ageBands.length - 4);
            },
            backgroundColor: (context) => {
              const value = Number(context.raw?.v || 0);
              const ratio = maxPercent > 0 ? value / maxPercent : 0;
              const alpha = Math.max(0.12, Math.min(0.92, ratio));
              const base = getCssVar('--report-heatmap', '#16a34a');
              if (base.startsWith('#')) {
                const hex = base.replace('#', '');
                const fullHex =
                  hex.length === 3
                    ? hex
                        .split('')
                        .map((char) => `${char}${char}`)
                        .join('')
                    : hex;
                const r = Number.parseInt(fullHex.slice(0, 2), 16);
                const g = Number.parseInt(fullHex.slice(2, 4), 16);
                const b = Number.parseInt(fullHex.slice(4, 6), 16);
                if ([r, g, b].every((v) => Number.isFinite(v))) {
                  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                }
              }
              return `rgba(22, 163, 74, ${alpha})`;
            },
            borderColor: 'rgba(255, 255, 255, 0)',
            borderWidth: 0,
          },
        ],
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
      datasets: [
        {
          label: 'Heatmap fallback',
          data: fallbackData,
          backgroundColor: fallbackData.map((point) => {
            const ratio = maxPercent > 0 ? point.v / maxPercent : 0;
            const alpha = Math.max(0.18, Math.min(0.88, ratio));
            const base = getCssVar('--report-heatmap', '#16a34a');
            if (base.startsWith('#')) {
              const hex = base.replace('#', '');
              const fullHex =
                hex.length === 3
                  ? hex
                      .split('')
                      .map((char) => `${char}${char}`)
                      .join('')
                  : hex;
              const r = Number.parseInt(fullHex.slice(0, 2), 16);
              const g = Number.parseInt(fullHex.slice(2, 4), 16);
              const b = Number.parseInt(fullHex.slice(4, 6), 16);
              if ([r, g, b].every((v) => Number.isFinite(v))) {
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
              }
            }
            return `rgba(22, 163, 74, ${alpha})`;
          }),
          borderColor: 'rgba(15, 23, 42, 0)',
          borderWidth: 0,
        },
      ],
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

function _renderStackedTrend(slot, dashboardState, chartLib, canvas, trend) {
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
      datasets: [
        {
          label,
          data: rows.map((row) => row.percent),
          borderColor: color,
          backgroundColor: color,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.25,
          fill: false,
        },
      ],
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
  const buildSeries = (referral, disposition) =>
    rows.map((row) => {
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
  const height = Math.max(320, Math.min(860, 140 + years.length * 40));
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
      datasets: [
        {
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
            return Math.max(14, area.width / months.length - 3);
          },
          height: ({ chart }) => {
            const area = chart?.chartArea;
            if (!area || !years.length) {
              return 18;
            }
            return Math.max(16, area.height / years.length - 3);
          },
          backgroundColor: (context) => {
            const value = Number(context.raw?.v || 0);
            const normalized = Math.max(0, Math.min(1, (value - minPercent) / percentRange));
            const boosted = normalized ** 0.72;
            const color = mixRgb(lightColor, baseColor, boosted);
            return `rgb(${color.r}, ${color.g}, ${color.b})`;
          },
          borderColor: 'rgba(255, 255, 255, 0.86)',
          borderWidth: 1,
        },
      ],
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
            callback: (_value, index) => monthLabel(months[index]),
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
  const height = Math.max(320, Math.min(820, 110 + rows.length * 30));
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
  updateOrCreateReportChart(
    slot,
    dashboardState,
    chartLib,
    canvas,
    {
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
    },
    { forceRecreate: true }
  );
}

function renderReferralHospitalizedByPspcTrendChart(
  slot,
  dashboardState,
  chartLib,
  canvas,
  trendData,
  color
) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const years = Array.isArray(trendData?.years) ? trendData.years : [];
  const series = Array.isArray(trendData?.series) ? trendData.series : [];
  canvas.style.setProperty('height', '380px', 'important');
  canvas.style.setProperty('min-height', '380px', 'important');
  canvas.style.setProperty('max-height', '380px', 'important');

  const fallbackColors = [color, '#0284c7', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6'];
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

  updateOrCreateReportChart(
    slot,
    dashboardState,
    chartLib,
    canvas,
    {
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
    },
    { forceRecreate: true }
  );
}

function renderPspcCorrelationChart(slot, dashboardState, chartLib, canvas, rows) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const valuesX = rows
    .map((row) => Number(row.referralPercent || 0))
    .filter((value) => Number.isFinite(value));
  const valuesY = rows
    .map((row) => Number(row.hospitalizedPercent || 0))
    .filter((value) => Number.isFinite(value));
  const minX = valuesX.length ? Math.max(0, Math.min(...valuesX) - 2) : 0;
  const maxX = valuesX.length ? Math.min(100, Math.max(...valuesX) + 2) : 100;
  const minY = valuesY.length ? Math.max(0, Math.min(...valuesY) - 2) : 0;
  const maxY = valuesY.length ? Math.min(100, Math.max(...valuesY) + 2) : 100;
  const totals = rows
    .map((row) => Number(row.total || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const minTotal = totals.length ? Math.min(...totals) : 1;
  const maxTotal = totals.length ? Math.max(...totals) : 1;
  const radiusForTotal = (total) => {
    if (!Number.isFinite(total) || total <= 0 || maxTotal <= minTotal) {
      return 8;
    }
    const normalized = (total - minTotal) / (maxTotal - minTotal);
    return 6 + normalized * 16;
  };
  const fillColor = getCssVar('--report-correlation-fill', 'rgba(37, 99, 235, 0.38)');
  const strokeColor = getCssVar('--report-correlation-stroke', 'rgba(37, 99, 235, 0.9)');
  updateOrCreateReportChart(slot, dashboardState, chartLib, canvas, {
    type: 'bubble',
    data: {
      datasets: [
        {
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
        },
      ],
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
    dashboardState.summariesReportsYear
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
  const referralHospitalizedByPspcYearly = reports.referralHospitalizedByPspcYearly;
  const pspcCorrelation = reports.pspcCorrelation;
  const pspcDistribution = reports.pspcDistribution;
  const chartLib = dashboardState.chartLib || (await loadChartJs());
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
    selectors.diagnosisInfo.textContent = topCodes ? `${baseNote} TOP kodai: ${topCodes}.`.trim() : baseNote;
  }
  const ageDistributionBySex = computeAgeDistributionBySex(scopeMeta.records);
  const ageDistributionRows = ageDistributionBySex.rows.filter(
    (row) => String(row?.label || '') !== 'Nenurodyta'
  );
  const minGroupSize = parsePositiveIntOrDefault(dashboardState.summariesReportsMinGroupSize, 100);
  const topN = parsePositiveIntOrDefault(dashboardState.summariesReportsTopN, 15);
  const pspcCrossDetailed = computeReferralHospitalizedShareByPspcDetailed(scopeMeta.records);
  const referralHospitalizedPspcAllRows = pspcCrossDetailed.rows;
  const referralHospitalizedPspcYearlyRows = Array.isArray(referralHospitalizedByPspcYearly?.rows)
    ? referralHospitalizedByPspcYearly.rows
    : [];
  const referralHospitalizedPspcTrendCandidates = referralHospitalizedPspcYearlyRows.filter(
    (row) => Number(row?.totalReferred || 0) >= minGroupSize
  );
  const referralHospitalizedPspcTrendOptions = referralHospitalizedPspcTrendCandidates.map(
    (row) => row.label
  );
  syncReportsControls(selectors, dashboardState, scopeMeta.yearOptions, referralHospitalizedPspcTrendOptions);
  const pspcCorrelationRows = pspcCorrelation.rows.map((row) => ({
    ...row,
    referralPercent: row.referralShare * 100,
    hospitalizedPercent: row.hospitalizedShare * 100,
  }));
  const pspcPercentRows = pspcDistribution.rows
    .map((row) => ({
      ...row,
      percent: toPercent(row.count, pspcDistribution.total),
    }))
    .filter((row) => String(row?.label || '') !== 'Kita / maža imtis');
  const colors = {
    diagnosis: getCssVar('--report-diagnosis', '#0284c7'),
    referral: getCssVar('--report-referral', '#ef4444'),
    referralDisposition: {
      hospWithReferral: getCssVar('--report-disposition-hosp-with-referral', '#ef4444'),
      dischargedWithReferral: getCssVar(
        '--report-disposition-discharged-with-referral',
        'rgba(239, 68, 68, 0.28)'
      ),
      hospWithoutReferral: getCssVar('--report-disposition-hosp-without-referral', '#2563eb'),
      dischargedWithoutReferral: getCssVar(
        '--report-disposition-discharged-without-referral',
        'rgba(37, 99, 235, 0.24)'
      ),
    },
    age: getCssVar('--report-age', '#16a34a'),
    referralPspc: getCssVar('--report-referral-pspc', '#2563eb'),
    pspc: getCssVar('--report-pspc', '#f59e0b'),
  };
  const treemapRendered = await renderDiagnosisTreemap(
    dashboardState,
    chartLib,
    selectors.diagnosisChart,
    diagnosisPercentRows
  );
  if (!treemapRendered) {
    renderBarChart(
      'diagnosisFrequency',
      dashboardState,
      chartLib,
      selectors.diagnosisChart,
      diagnosisPercentRows,
      colors.diagnosis
    );
  }
  await renderAgeDiagnosisHeatmapChart(
    'ageDiagnosisHeatmap',
    dashboardState,
    chartLib,
    selectors.ageDiagnosisHeatmapChart,
    ageDiagnosisHeatmap
  );
  const z769Rows = z769Trend.rows.map((row) => ({
    ...row,
    percent: row.share * 100,
  }));
  renderPercentLineTrend(
    'z769Trend',
    dashboardState,
    chartLib,
    selectors.z769TrendChart,
    z769Rows,
    'Z76.9 dalis'
  );
  const referralPercentRows = referralTrend.rows.map((row) => ({
    year: row.year,
    total: row.total,
    percent: toPercent(row.values['su siuntimu'] || 0, row.total || 0),
  }));
  renderPercentLineTrend(
    'referralTrend',
    dashboardState,
    chartLib,
    selectors.referralTrendChart,
    referralPercentRows,
    'Pacientai su siuntimu',
    colors.referral
  );
  renderReferralDispositionYearlyChart(
    'referralDispositionYearly',
    dashboardState,
    chartLib,
    selectors.referralDispositionYearlyChart,
    referralDispositionYearly,
    colors.referralDisposition
  );
  await renderReferralMonthlyHeatmapChart(
    'referralMonthlyHeatmap',
    dashboardState,
    chartLib,
    selectors.referralMonthlyHeatmapChart,
    referralMonthlyHeatmap
  );
  const referralHospitalizedPspcMode =
    String(dashboardState.summariesReferralPspcMode || 'cross').toLowerCase() === 'trend' ? 'trend' : 'cross';
  const referralHospitalizedPspcSortDirection = String(dashboardState.summariesReferralPspcSort || 'desc');
  const referralHospitalizedPspcFilteredRows = referralHospitalizedPspcAllRows.filter(
    (row) => Number(row?.referredTotal || 0) >= minGroupSize
  );
  const referralHospitalizedPspcPercentRows = sortPspcRows(
    referralHospitalizedPspcFilteredRows,
    referralHospitalizedPspcSortDirection
  ).slice(0, topN);
  if (referralHospitalizedPspcMode === 'trend') {
    const selectedPspc = String(dashboardState.summariesReferralPspcTrendPspc || '__top3__');
    const trendYears = Array.isArray(referralHospitalizedByPspcYearly?.years)
      ? referralHospitalizedByPspcYearly.years
      : [];
    let selectedRows = [];
    if (selectedPspc === '__top3__') {
      selectedRows = referralHospitalizedPspcTrendCandidates.slice(0, 3);
    } else {
      selectedRows = referralHospitalizedPspcTrendCandidates.filter((row) => row.label === selectedPspc);
    }
    if (!selectedRows.length) {
      selectedRows = referralHospitalizedPspcTrendCandidates.slice(0, 3);
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
      colors.referralPspc
    );
  } else {
    renderReferralHospitalizedByPspcChart(
      'referralHospitalizedByPspc',
      dashboardState,
      chartLib,
      selectors.referralHospitalizedByPspcChart,
      referralHospitalizedPspcPercentRows,
      colors.referralPspc
    );
  }
  renderPspcCorrelationChart(
    'pspcCorrelation',
    dashboardState,
    chartLib,
    selectors.pspcCorrelationChart,
    pspcCorrelationRows
  );
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
    }
  );
  renderBarChart(
    'pspcDistribution',
    dashboardState,
    chartLib,
    selectors.pspcDistributionChart,
    pspcPercentRows,
    colors.pspc,
    { dynamicYAxis: true }
  );
  exportState.diagnosis = {
    title: getReportCardTitle('diagnosis', 'Diagnozės', settings),
    headers: ['Diagnozė', 'Procentas (%)'],
    rows: diagnosisPercentRows.map((row) => [row.label, oneDecimalFormatter.format(row.percent)]),
    target: selectors.diagnosisChart,
  };
  exportState.ageDiagnosisHeatmap = {
    title: getReportCardTitle('ageDiagnosisHeatmap', 'Amžiaus ir diagnozių grupių ryšys', settings),
    headers: [
      'Amžiaus grupė',
      'Diagnozių grupė',
      'Dalis amžiaus grupėje (%)',
      'Atvejų sk.',
      'Amžiaus grupės pacientų sk.',
    ],
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
    title: getReportCardTitle('z769Trend', 'Pasišalinę pacientai (Z76.9)', settings),
    headers: ['Metai', 'Procentas (%)'],
    rows: z769Rows.map((row) => [row.year, oneDecimalFormatter.format(row.percent)]),
    target: selectors.z769TrendChart,
  };
  exportState.referralTrend = {
    title: getReportCardTitle('referralTrend', 'Pacientai su siuntimu', settings),
    headers: ['Metai', 'Pacientai su siuntimu (%)'],
    rows: referralPercentRows.map((row) => [row.year, oneDecimalFormatter.format(row.percent)]),
    target: selectors.referralTrendChart,
  };
  exportState.referralDispositionYearly = {
    title: getReportCardTitle('referralDispositionYearly', 'Siuntimas × baigtis pagal metus', settings),
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
    title: getReportCardTitle('referralMonthlyHeatmap', 'Siuntimų % pagal mėnesį', settings),
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
    let selectedRows =
      selectedPspc === '__top3__'
        ? referralHospitalizedPspcTrendCandidates.slice(0, 3)
        : referralHospitalizedPspcTrendCandidates.filter((row) => row.label === selectedPspc);
    if (!selectedRows.length) {
      selectedRows = referralHospitalizedPspcTrendCandidates.slice(0, 3);
    }
    exportState.referralHospitalizedByPspc = {
      title: `${getReportCardTitle(
        'referralHospitalizedByPspc',
        'Hospitalizacijų dalis tarp pacientų su siuntimu pagal PSPC',
        settings
      )} (metinė dinamika)`,
      headers: [
        'PSPC',
        'Metai',
        'Hospitalizuota iš su siuntimu (%)',
        'Hospitalizuota (sk.)',
        'Pacientai su siuntimu (sk.)',
      ],
      rows: selectedRows.flatMap((row) =>
        (Array.isArray(row.yearly) ? row.yearly : []).map((point) => [
          row.label,
          point.year,
          Number.isFinite(point.share) ? oneDecimalFormatter.format(point.share * 100) : '',
          numberFormatter.format(point.hospitalizedCount || 0),
          numberFormatter.format(point.referredTotal || 0),
        ])
      ),
      target: selectors.referralHospitalizedByPspcChart,
    };
  } else {
    exportState.referralHospitalizedByPspc = {
      title: getReportCardTitle(
        'referralHospitalizedByPspc',
        'Hospitalizacijų dalis tarp pacientų su siuntimu pagal PSPC',
        settings
      ),
      headers: [
        'PSPC',
        'Hospitalizuota iš su siuntimu (%)',
        'Hospitalizuota (sk.)',
        'Pacientai su siuntimu (sk.)',
      ],
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
    title: getReportCardTitle('pspcCorrelation', 'PSPC: siuntimų ir hospitalizacijų ryšys', settings),
    headers: [
      'PSPC',
      'Siuntimų dalis (%)',
      'Hospitalizacijų dalis (%)',
      'Pacientai (sk.)',
      'Su siuntimu (sk.)',
      'Hospitalizuoti (sk.)',
    ],
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
    title: getReportCardTitle('ageDistribution', 'Amžius', settings),
    headers: [
      'Amžiaus grupė',
      'Iš viso (%)',
      'Vyras (%)',
      'Moteris (%)',
      'Kita/Nenurodyta (%)',
      'Iš viso (n)',
    ],
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
    title: getReportCardTitle('pspcDistribution', 'PSPC', settings),
    headers: ['PSPC', 'Procentas (%)'],
    rows: pspcPercentRows.map((row) => [row.label, oneDecimalFormatter.format(row.percent)]),
    target: selectors.pspcDistributionChart,
  };
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
  const getSummariesDefaults = () => ({
    year: 'all',
    topN: 15,
    minGroup: 100,
    pspcSort: 'desc',
    pspcMode: 'cross',
    pspcTrend: '__top3__',
  });
  const getSummariesFiltersState = () => ({
    year: dashboardState.summariesReportsYear,
    topN: dashboardState.summariesReportsTopN,
    minGroup: dashboardState.summariesReportsMinGroupSize,
    pspcSort: dashboardState.summariesReferralPspcSort,
    pspcMode: dashboardState.summariesReferralPspcMode,
    pspcTrend: dashboardState.summariesReferralPspcTrendPspc,
  });
  const persistSummariesQuery = () => {
    replaceUrlQuery(serializeToQuery('summaries', getSummariesFiltersState(), getSummariesDefaults()));
  };
  const updateSummariesFiltersSummary = () => {
    if (!selectors.summariesReportsFiltersSummary) {
      return;
    }
    const defaults = getSummariesDefaults();
    const parts = [];
    if (dashboardState.summariesReportsYear !== defaults.year) {
      parts.push(`Metai: ${dashboardState.summariesReportsYear}`);
    }
    if (dashboardState.summariesReportsTopN !== defaults.topN) {
      parts.push(`TOP N: ${dashboardState.summariesReportsTopN}`);
    }
    if (dashboardState.summariesReportsMinGroupSize !== defaults.minGroup) {
      parts.push(`Min. imtis: ${dashboardState.summariesReportsMinGroupSize}`);
    }
    if (dashboardState.summariesReferralPspcMode !== defaults.pspcMode) {
      parts.push(`PSPC režimas: ${dashboardState.summariesReferralPspcMode}`);
    }
    const text = buildFilterSummary({
      entries: parts,
      emptyText: 'Rodomi numatytieji ataskaitų filtrai',
    });
    selectors.summariesReportsFiltersSummary.textContent = text;
    selectors.summariesReportsFiltersSummary.dataset.default = parts.length ? 'false' : 'true';
  };
  const resetSummariesFilters = () => {
    const defaults = getSummariesDefaults();
    dashboardState.summariesReportsYear = defaults.year;
    dashboardState.summariesReportsTopN = defaults.topN;
    dashboardState.summariesReportsMinGroupSize = defaults.minGroup;
    dashboardState.summariesReferralPspcSort = defaults.pspcSort;
    dashboardState.summariesReferralPspcMode = defaults.pspcMode;
    dashboardState.summariesReferralPspcTrendPspc = defaults.pspcTrend;
  };
  const parsedSummaries = parseFromQuery('summaries', window.location.search);
  if (Object.keys(parsedSummaries).length) {
    dashboardState.summariesReportsYear =
      typeof parsedSummaries.year === 'string' && parsedSummaries.year.trim()
        ? parsedSummaries.year.trim()
        : dashboardState.summariesReportsYear;
    dashboardState.summariesReportsTopN = parsePositiveIntOrDefault(parsedSummaries.topN, 15);
    dashboardState.summariesReportsMinGroupSize = parsePositiveIntOrDefault(parsedSummaries.minGroup, 100);
    dashboardState.summariesReferralPspcSort =
      parsedSummaries.pspcSort === 'asc' ? 'asc' : dashboardState.summariesReferralPspcSort;
    dashboardState.summariesReferralPspcMode =
      parsedSummaries.pspcMode === 'trend' ? 'trend' : dashboardState.summariesReferralPspcMode;
    if (typeof parsedSummaries.pspcTrend === 'string' && parsedSummaries.pspcTrend.trim()) {
      dashboardState.summariesReferralPspcTrendPspc = parsedSummaries.pspcTrend.trim();
    }
  }
  const exportState = {};
  const handleReportExportClick = createReportExportClickHandler({
    exportState,
    getDatasetValue,
    setCopyButtonFeedback,
    writeTextToClipboard,
    formatExportFilename,
    escapeCsvCell,
  });
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
  if (selectors.summariesReportsSubtitle) {
    selectors.summariesReportsSubtitle.textContent =
      TEXT.summariesReports?.subtitle || selectors.summariesReportsSubtitle.textContent;
  }
  let rerenderReports = () => {};
  setupSharedPageUi({
    selectors,
    dashboardState,
    initializeTheme,
    applyTheme,
    themeStorageKey: THEME_STORAGE_KEY,
    onThemeChange: () => rerenderReports(),
    afterSectionNavigation: () => {
      initSummariesJumpStickyOffset(selectors);
      initSummariesJumpNavigation(selectors);
    },
  });
  rerenderReports = () => renderReports(selectors, dashboardState, settings, exportState);
  wireSummariesInteractions({
    selectors,
    dashboardState,
    rerenderReports,
    handleReportExportClick,
    handleYearlyTableCopyClick,
    handleTableDownloadClick,
    storeCopyButtonBaseLabel,
    initTableDownloadButtons,
    initYearlyExpand,
    handleYearlyToggle,
    parsePositiveIntOrDefault,
    onFiltersStateChange: persistSummariesQuery,
    resetSummariesFilters,
    updateSummariesFiltersSummary,
  });
  const dataFlow = createDataFlow(
    createSummariesDataFlowConfig({
      pageConfig,
      selectors,
      dashboardState,
      text: TEXT,
      defaultSettings: DEFAULT_SETTINGS,
      autoRefreshIntervalMs: AUTO_REFRESH_INTERVAL_MS,
      runAfterDomAndIdle,
      setDatasetValue,
      setStatus: (type, details) => setStatus(selectors, type, details),
      fetchData,
      perfMonitor: runtimeClient.perfMonitor,
      describeCacheMeta,
      describeError: (error, options = {}) =>
        describeError(error, { ...options, fallbackMessage: TEXT.status.error }),
      computeDailyStats,
      getDefaultChartFilters: createDefaultChartFilters,
      computeMonthlyStats,
      computeYearlyStats,
      renderYearlyTable: (yearlyStats) => {
        renderYearlyTable(selectors, dashboardState, yearlyStats, { yearlyEmptyText: TEXT.yearly.empty });
        rerenderReports();
      },
      numberFormatter,
      getSettings: () => settings,
      getClientConfig: runtimeClient.getClientConfig,
      getAutoRefreshTimerId: () => autoRefreshTimerId,
      setAutoRefreshTimerId: (id) => {
        autoRefreshTimerId = id;
      },
    })
  );
  rerenderReports();
  updateSummariesFiltersSummary();
  persistSummariesQuery();
  dataFlow.scheduleInitialLoad();
}
