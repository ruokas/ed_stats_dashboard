/* c8 ignore file */
import { getSummariesReportTitle } from '../../../../metrics/summaries-report.js';
import { getDatasetValue } from '../../../../utils/dom.js';
import {
  capitalizeSentence,
  monthFormatter,
  numberFormatter,
  oneDecimalFormatter,
  percentFormatter,
} from '../../../../utils/format.js';
import { TEXT } from '../../../constants.js';
import { setCopyButtonFeedback, writeTextToClipboard } from '../../clipboard.js';
import { getCssVar, mixRgb, parseHexColor } from '../../features/summaries-runtime-helpers.js';
import { escapeCsvCell } from '../../table-export.js';
import { loadPluginScript } from './plugin-loader.js';

const PLUGIN_SCRIPT_TIMEOUT_MS = 8000;
let treemapPluginPromise = null;
let matrixPluginPromise = null;

export function getReportCardTitle(reportKey, fallback, settings) {
  return getSummariesReportTitle(reportKey, TEXT.summariesReports?.cards || {}, settings) || fallback;
}

export async function handleYearlyTableCopyClick(event) {
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

export function destroyReportCharts(dashboardState) {
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

export function ensureCoverage(selectors, dashboardState, coverage) {
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

export function toPercent(value, total) {
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

export function renderBarChart(slot, dashboardState, chartLib, canvas, rows, color, options = {}) {
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

export function renderAgeDistributionStackedBySex(
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

export async function renderDiagnosisTreemap(dashboardState, chartLib, canvas, rows) {
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

export async function renderAgeDiagnosisHeatmapChart(slot, dashboardState, chartLib, canvas, model) {
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

export function renderPercentLineTrend(
  slot,
  dashboardState,
  chartLib,
  canvas,
  rows,
  label,
  color = '#ef4444'
) {
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

export function renderReferralDispositionYearlyChart(slot, dashboardState, chartLib, canvas, trend, colors) {
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

export async function renderReferralMonthlyHeatmapChart(slot, dashboardState, chartLib, canvas, model) {
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

export function renderReferralHospitalizedByPspcChart(slot, dashboardState, chartLib, canvas, rows, color) {
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

export function renderReferralHospitalizedByPspcTrendChart(
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

export function renderPspcCorrelationChart(slot, dashboardState, chartLib, canvas, rows) {
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
