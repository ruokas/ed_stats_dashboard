import { createClientStore, PerfMonitor } from '../../app.js';
import { loadChartJs } from '../utils/chart-loader.js';
import { getDatasetValue, setDatasetValue, runAfterDomAndIdle } from '../utils/dom.js';
import { initializeLazyLoading, initializeServiceWorker, preloadChartJs } from './bootstrap.js';
import { debounce } from '../utils/debounce.js';
import { createSelectors } from '../state/selectors.js';
import { createDashboardState } from '../state/dashboardState.js';
import { createMainDataHandlers } from '../data/main-data.js?v=2026-02-08-merge-agg-fix';
import { createFeedbackHandlers } from '../data/feedback.js';
import { createEdHandlers } from '../data/ed.js';
import {
  computeDailyStats,
  computeMonthlyStats,
  computeYearlyStats,
  computeHospitalizedByDepartmentAndSpsStay,
  computeHospitalizedDepartmentYearlyStayTrend,
  formatLocalDateKey,
} from '../data/stats.js';
import { createChartRenderers } from '../charts/index.js';
import { createKpiRenderer } from '../render/kpi.js';
import { createEdRenderer } from '../render/ed.js?v=2026-02-08-ed-cards-fallback-2';
import { createUIEvents } from '../events/index.js';
import { createLayoutTools } from './runtime/layout.js';
import { createDataFlow } from './runtime/data-flow.js';
import { createChartFlow } from './runtime/chart-flow.js';
import { createKpiFlow } from './runtime/kpi-flow.js';
import { createCopyExportFeature } from './runtime/features/copy-export.js';
import { createFeedbackPanelFeature } from './runtime/features/feedback-panel.js';
import { createFeedbackRenderFeature } from './runtime/features/feedback-render.js';
import { createEdPanelCoreFeature } from './runtime/features/ed-panel-core.js';
import { createEdCommentsFeature } from './runtime/features/ed-comments.js';
import { createEdCardsFeature } from './runtime/features/ed-cards.js';
import { createEdRenderBridgeFeature } from './runtime/features/ed-render-bridge.js';
import { createTextContentFeature } from './runtime/features/text-content.js';
import { createFunnelCanvasFeature } from './runtime/features/funnel-canvas.js';
import { createHourlyControlsFeature } from './runtime/features/hourly-controls.js';
import { getThemePalette, getThemeStyleTarget } from './runtime/features/theme.js';
import {
  clampColorChannel,
  parseColorToRgb,
  relativeLuminance,
  rgbToRgba,
  ensureRgb,
  mixRgbColors,
  createSequentialPalette,
} from './runtime/utils/color.js';
import {
  createTextSignature,
  describeCacheMeta,
  describeError,
  downloadCsv,
  formatUrlForDiagnostics,
} from './runtime/network.js';
import {
  FEEDBACK_FILTER_ALL,
  FEEDBACK_FILTER_MISSING,
  KPI_FILTER_LABELS,
  KPI_FILTER_TOGGLE_LABELS,
  KPI_WINDOW_OPTION_BASE,
  createDefaultChartFilters,
  createDefaultFeedbackFilters,
  createDefaultKpiFilters,
} from './runtime/state.js';
import { sanitizeChartFilters, sanitizeKpiFilters } from './runtime/filters.js';
import {
  setCopyButtonFeedback,
  storeCopyButtonBaseLabel,
  writeBlobToClipboard,
  writeTextToClipboard,
} from './runtime/clipboard.js';
import {
  numberFormatter,
  decimalFormatter,
  oneDecimalFormatter,
  percentFormatter,
  monthFormatter,
  monthOnlyFormatter,
  shortDateFormatter,
  monthDayFormatter,
  statusTimeFormatter,
  weekdayLongFormatter,
  textCollator,
  dailyDateFormatter,
  capitalizeSentence,
} from '../utils/format.js';
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
} from './constants.js';
import { DEFAULT_SETTINGS } from './default-settings.js';

const clientStore = createClientStore(CLIENT_CONFIG_KEY);
const perfMonitor = new PerfMonitor();
let clientConfig = { profilingEnabled: true, ...clientStore.load() };
let autoRefreshTimerId = null;

export function startFullPageApp(options = {}) {
      const forcePageId = typeof options?.forcePageId === 'string'
        ? options.forcePageId.trim().toLowerCase()
        : '';
      const skipGlobalInit = options?.skipGlobalInit === true;
      if (!skipGlobalInit) {
        initializeServiceWorker({ updateClientConfig });
        initializeLazyLoading();
        preloadChartJs();
      }

      // Iškart inicijuojame įkėlimą, kad biblioteka būtų paruošta, kai prireiks piešti grafikus.

      const pageId = forcePageId || (document.body?.dataset?.page || 'kpi').toLowerCase();
      const PAGE_CONFIG = {
        kpi: { kpi: true },
        charts: { charts: true, heatmap: true, hourly: true },
        recent: { recent: true },
        summaries: { monthly: false, yearly: true },
        feedback: { feedback: true },
        ed: { ed: true },
      };
      const pageConfig = PAGE_CONFIG[pageId] || PAGE_CONFIG.kpi;

      let settings = normalizeSettings({});
      let chartRenderers = null;
      let kpiRenderer = null;
      let edRenderer = null;
      let uiEvents = null;
      const capabilityState = {
        charts: false,
        kpi: false,
        ed: false,
        feedback: false,
        ui: false,
      };
      const renderCharts = (dailyStats, funnelTotals, heatmapData) => chartRenderers
        .renderCharts(dailyStats, funnelTotals, heatmapData);
      const edRenderBridge = createEdRenderBridgeFeature({
        getEdRenderer: () => edRenderer,
        getChartRenderers: () => chartRenderers,
      });
      const {
        renderEdDashboard,
        renderEdDispositionsChart,
      } = edRenderBridge;

      const getDefaultKpiFilters = () => createDefaultKpiFilters({ settings, DEFAULT_SETTINGS, DEFAULT_KPI_WINDOW_DAYS });
      const getDefaultChartFilters = () => createDefaultChartFilters();
      const getDefaultFeedbackFilters = () => createDefaultFeedbackFilters();
      const getDefaultHeatmapFilters = () => ({
        arrival: 'all',
        disposition: 'all',
        cardType: 'all',
      });





      const copyExportFeature = createCopyExportFeature({
        getDatasetValue,
        setDatasetValue,
        setCopyButtonFeedback,
        writeBlobToClipboard,
        writeTextToClipboard,
        describeError,
      });
      const {
        handleChartCopyClick,
        handleChartDownloadClick,
        handleTableDownloadClick,
      } = copyExportFeature;
      const selectors = createSelectors();

      const layoutTools = createLayoutTools({ selectors, getDatasetValue, setDatasetValue });
      const {
        sectionNavState,
        sectionVisibility,
        sectionNavCompactQuery,
        setLayoutRefreshAllowed,
        getLayoutResizeObserver,
        setLayoutResizeObserver,
        updateSectionNavCompactState,
        handleNavKeydown,
        scheduleLayoutRefresh,
        syncSectionNavVisibility,
        waitForFontsAndStyles,
        updateLayoutMetrics,
        refreshSectionObserver,
        flushPendingLayoutRefresh,
        updateScrollTopButtonVisibility,
        scheduleScrollTopUpdate,
      } = layoutTools;

      function getHeatmapMetricLabel(metricKey) {
        const options = TEXT.charts?.heatmapMetricOptions || {};
        if (typeof options[metricKey] === 'string' && options[metricKey].trim()) {
          return options[metricKey];
        }
        if (typeof metricKey === 'string' && metricKey.trim()) {
          return metricKey.trim();
        }
        const fallbackKey = DEFAULT_HEATMAP_METRIC;
        return typeof options[fallbackKey] === 'string' ? options[fallbackKey] : 'Rodiklis';
      }

      function getHeatmapMetricUnit(metricKey) {
        const units = TEXT.charts?.heatmapMetricUnits || {};
        return typeof units[metricKey] === 'string' ? units[metricKey] : '';
      }

      function getHeatmapMetricDescription(metricKey) {
        const descriptions = TEXT.charts?.heatmapMetricDescriptions || {};
        return typeof descriptions[metricKey] === 'string' ? descriptions[metricKey] : '';
      }

      function hasHeatmapMetricData(metric) {
        if (!metric || typeof metric !== 'object') {
          return false;
        }
        if (metric.hasData) {
          return true;
        }
        const matrix = Array.isArray(metric.matrix) ? metric.matrix : [];
        return matrix.some((row) => Array.isArray(row) && row.some((value) => Number.isFinite(value) && value > 0));
      }

      function isValidHeatmapData(heatmapData) {
        if (!heatmapData || typeof heatmapData !== 'object') {
          return false;
        }
        const metrics = heatmapData.metrics;
        if (!metrics || typeof metrics !== 'object') {
          return false;
        }
        return HEATMAP_METRIC_KEYS.some((key) => Array.isArray(metrics[key]?.matrix));
      }

      function normalizeHeatmapMetricKey(metricKey, metrics = {}) {
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
      }

      function formatHeatmapMetricValue(value) {
        if (!Number.isFinite(value)) {
          return '0,0';
        }
        return oneDecimalFormatter.format(value);
      }

      function updateHeatmapCaption(metricKey) {
        if (!selectors.heatmapCaption) {
          return;
        }
        const label = getHeatmapMetricLabel(metricKey);
        const captionText = typeof TEXT.charts?.heatmapCaption === 'function'
          ? TEXT.charts.heatmapCaption(label)
          : (TEXT.charts?.heatmapCaption || 'Rodikliai pagal savaitės dieną ir valandą.');
        selectors.heatmapCaption.textContent = captionText;
      }

      function populateHeatmapMetricOptions() {
        if (!selectors.heatmapMetricSelect) {
          return;
        }
        const select = selectors.heatmapMetricSelect;
        select.innerHTML = '';
        HEATMAP_METRIC_KEYS.forEach((key) => {
          const option = document.createElement('option');
          option.value = key;
          option.textContent = getHeatmapMetricLabel(key);
          select.appendChild(option);
        });
        const current = typeof dashboardState?.heatmapMetric === 'string'
          ? dashboardState.heatmapMetric
          : DEFAULT_HEATMAP_METRIC;
        select.value = normalizeHeatmapMetricKey(current);
      }

      function populateHeatmapYearOptions(dailyStats) {
        if (!selectors.heatmapYearSelect) {
          return;
        }
        const years = getAvailableYearsFromDaily(dailyStats);
        selectors.heatmapYearSelect.replaceChildren();
        const defaultOption = document.createElement('option');
        defaultOption.value = 'all';
        defaultOption.textContent = TEXT.charts?.heatmapYearAll || 'Visi metai';
        selectors.heatmapYearSelect.appendChild(defaultOption);
        years.forEach((year) => {
          const option = document.createElement('option');
          option.value = String(year);
          option.textContent = String(year);
          selectors.heatmapYearSelect.appendChild(option);
        });
        const current = Number.isFinite(dashboardState.heatmapYear)
          ? String(dashboardState.heatmapYear)
          : 'all';
        selectors.heatmapYearSelect.value = current;
      }

      function computeHeatmapColor(accentColor, intensity) {
        const alpha = Math.min(0.85, Math.max(0.08, 0.08 + intensity * 0.75));
        const hexMatch = /^#?([a-f\d]{6})$/i.exec(accentColor.trim());
        if (hexMatch) {
          const numeric = Number.parseInt(hexMatch[1], 16);
          const r = (numeric >> 16) & 255;
          const g = (numeric >> 8) & 255;
          const b = numeric & 255;
          return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
        }
        const rgbMatch = accentColor.trim().match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (rgbMatch) {
          const [, r, g, b] = rgbMatch;
          return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
        }
        return `rgba(37, 99, 235, ${alpha.toFixed(3)})`;
      }

      function renderArrivalHeatmap(container, heatmapData, accentColor, metricKey = DEFAULT_HEATMAP_METRIC) {
        if (!container) {
          return;
        }
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
        const matrix = Array.isArray(metric.matrix) ? metric.matrix : [];
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
          empty.textContent = TEXT.charts?.heatmapEmpty || 'Šiuo metu nėra duomenų.';
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
        matrix.forEach((rowValues, dayIndex) => {
          const row = document.createElement('tr');
          const rowHeader = document.createElement('th');
          rowHeader.setAttribute('scope', 'row');
          rowHeader.textContent = HEATMAP_WEEKDAY_SHORT[dayIndex] || '';
          row.appendChild(rowHeader);
          rowValues.forEach((value, hourIndex) => {
            const numericValue = Number.isFinite(value) ? value : 0;
            const cell = document.createElement('td');
            const intensity = metric.max > 0 ? numericValue / metric.max : 0;
            const badge = document.createElement('span');
            badge.className = 'heatmap-cell';
            const color = intensity > 0 ? computeHeatmapColor(accentColor, intensity) : 'var(--color-surface-alt)';
            badge.style.backgroundColor = color;
            badge.style.color = intensity > 0.55 ? '#fff' : intensity > 0 ? 'var(--color-text)' : 'var(--color-text-muted)';
            const durationSamples = Array.isArray(countsMatrix?.[dayIndex]) ? countsMatrix[dayIndex][hourIndex] : 0;
            const hasCellData = selectedMetric === 'avgDuration'
              ? Number.isFinite(durationSamples) && durationSamples > 0
              : numericValue > 0;
            const formattedValue = formatHeatmapMetricValue(numericValue);
            badge.textContent = hasCellData ? formattedValue : '';
            badge.tabIndex = hasCellData ? 0 : -1;
            const descriptor = getHeatmapMetricDescription(selectedMetric);
            const tooltipValue = hasCellData ? formattedValue : formatHeatmapMetricValue(0);
            const tooltip = `${HEATMAP_WEEKDAY_FULL[dayIndex] || ''}, ${HEATMAP_HOURS[hourIndex]} – ${tooltipValue}${descriptor ? ` ${descriptor}` : ''}`;
            cell.setAttribute('aria-label', tooltip);
            badge.setAttribute('title', tooltip);
            cell.appendChild(badge);
            row.appendChild(cell);
          });
          tbody.appendChild(row);
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
      }

      function syncHeatmapFilterControls() {
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
      }

      function computeHeatmapDataForFilters() {
        const baseRecords = Array.isArray(dashboardState.chartData.baseRecords) && dashboardState.chartData.baseRecords.length
          ? dashboardState.chartData.baseRecords
          : dashboardState.rawRecords;
        const selectedYear = Number.isFinite(dashboardState.heatmapYear) ? Number(dashboardState.heatmapYear) : null;
        const yearScopedRecords = filterRecordsByYear(baseRecords, selectedYear);
        const filteredRecords = filterRecordsByHeatmapFilters(yearScopedRecords, dashboardState.heatmapFilters);
        const heatmapData = computeArrivalHeatmap(filteredRecords);
        dashboardState.chartData.heatmap = heatmapData;
        return heatmapData;
      }

      function applyHeatmapFiltersAndRender() {
        const palette = getThemePalette();
        const heatmapData = computeHeatmapDataForFilters();
        renderArrivalHeatmap(
          selectors.heatmapContainer,
          heatmapData,
          palette.accent,
          dashboardState.heatmapMetric,
        );
      }

      function computeShiftDateKey(referenceDate, shiftStartHour) {
        if (!(referenceDate instanceof Date) || Number.isNaN(referenceDate.getTime())) {
          return '';
        }
        const dayMinutes = 24 * 60;
        const startMinutesRaw = Number.isFinite(Number(shiftStartHour)) ? Number(shiftStartHour) * 60 : 7 * 60;
        const startMinutes = ((Math.round(startMinutesRaw) % dayMinutes) + dayMinutes) % dayMinutes;
        const arrivalMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
        const shiftAnchor = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
        if (arrivalMinutes < startMinutes) {
          shiftAnchor.setDate(shiftAnchor.getDate() - 1);
        }
        return formatLocalDateKey(shiftAnchor);
      }

      function aggregatePeriodSummary(entries) {
        if (!Array.isArray(entries)) {
          return {
            days: 0,
            totalCount: 0,
            totalNight: 0,
            totalHospitalized: 0,
            totalDischarged: 0,
            totalTime: 0,
            durationCount: 0,
            totalHospitalizedTime: 0,
            hospitalizedDurationCount: 0,
          };
        }
        return entries.reduce((acc, entry) => {
          acc.days += 1;
          const count = Number.isFinite(entry?.count) ? entry.count : 0;
          const hospitalized = Number.isFinite(entry?.hospitalized) ? entry.hospitalized : 0;
          const discharged = Number.isFinite(entry?.discharged) ? entry.discharged : 0;
          const night = Number.isFinite(entry?.night) ? entry.night : 0;
          const totalTime = Number.isFinite(entry?.totalTime) ? entry.totalTime : 0;
          const durations = Number.isFinite(entry?.durations) ? entry.durations : 0;
          const hospitalizedTime = Number.isFinite(entry?.hospitalizedTime) ? entry.hospitalizedTime : 0;
          const hospitalizedDurations = Number.isFinite(entry?.hospitalizedDurations) ? entry.hospitalizedDurations : 0;
          acc.totalCount += count;
          acc.totalNight += night;
          acc.totalHospitalized += hospitalized;
          acc.totalDischarged += discharged;
          acc.totalTime += totalTime;
          acc.durationCount += durations;
          acc.totalHospitalizedTime += hospitalizedTime;
          acc.hospitalizedDurationCount += hospitalizedDurations;
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
          totalCount,
          totalNight,
          totalHospitalized,
          totalDischarged,
          patientsPerDay: days > 0 ? totalCount / days : null,
          nightPerDay: days > 0 ? totalNight / days : null,
          avgTime: durationCount > 0 ? totalTime / durationCount : null,
          avgHospitalizedTime: hospitalizedDurationCount > 0 ? totalHospitalizedTime / hospitalizedDurationCount : null,
          hospitalizedPerDay: days > 0 ? totalHospitalized / days : null,
          hospitalizedShare: totalCount > 0 ? totalHospitalized / totalCount : null,
          dischargedPerDay: days > 0 ? totalDischarged / days : null,
          dischargedShare: totalCount > 0 ? totalDischarged / totalCount : null,
        };
      }

      function describePeriodLabel({ windowDays, startDateKey, endDateKey }) {
        const startDate = dateKeyToDate(startDateKey);
        const endDate = dateKeyToDate(endDateKey);
        let baseLabel = '';
        if (Number.isFinite(windowDays) && windowDays > 0) {
          if (startDate && endDate) {
            const startYear = startDate.getUTCFullYear();
            const endYear = endDate.getUTCFullYear();
            if (windowDays >= 360 && startYear === endYear) {
              baseLabel = `${startYear} m.`;
            }
          }
          if (!baseLabel) {
            baseLabel = windowDays === 1 ? 'Paskutinė diena' : `Paskutinės ${windowDays} d.`;
          }
        } else if (startDate && endDate) {
          const startYear = startDate.getUTCFullYear();
          const endYear = endDate.getUTCFullYear();
          baseLabel = startYear === endYear ? `${startYear} m.` : `${startYear}–${endYear} m.`;
        }
        if (!baseLabel) {
          baseLabel = TEXT.kpis.windowAllLabel;
        }
        let rangeLabel = '';
        if (startDate && endDate) {
          const start = shortDateFormatter.format(startDate);
          const end = shortDateFormatter.format(endDate);
          rangeLabel = start === end ? start : `${start} – ${end}`;
        }
        const metaLabel = rangeLabel ? `${baseLabel} (${rangeLabel})` : baseLabel;
        const referenceLabel = baseLabel || TEXT.kpis.yearAverageReference;
        return { metaLabel, referenceLabel };
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
          ? monthFormatter.format(new Date(year, Math.max(0, monthNumeric - 1), 1))
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

      function recordMatchesChartFilters(record, filters) {
        if (!record) {
          return false;
        }
        return matchesSharedPatientFilters(record, filters);
      }

      function filterRecordsByChartFilters(records, filters) {
        const normalized = sanitizeChartFilters(filters, { getDefaultChartFilters, KPI_FILTER_LABELS });
        return (Array.isArray(records) ? records : []).filter((record) => recordMatchesChartFilters(record, normalized));
      }

      function sanitizeHeatmapFilters(filters) {
        const defaults = getDefaultHeatmapFilters();
        const normalized = { ...defaults, ...(filters || {}) };
        if (!(normalized.arrival in KPI_FILTER_LABELS.arrival)) {
          normalized.arrival = defaults.arrival;
        }
        if (!(normalized.disposition in KPI_FILTER_LABELS.disposition)) {
          normalized.disposition = defaults.disposition;
        }
        if (!(normalized.cardType in KPI_FILTER_LABELS.cardType)) {
          normalized.cardType = defaults.cardType;
        }
        return normalized;
      }

      function filterRecordsByHeatmapFilters(records, filters) {
        const normalized = sanitizeHeatmapFilters(filters);
        return (Array.isArray(records) ? records : []).filter((record) => matchesSharedPatientFilters(record, normalized));
      }

      function toSentenceCase(label) {
        if (typeof label !== 'string' || !label.length) {
          return '';
        }
        return label.charAt(0).toUpperCase() + label.slice(1);
      }

      function updateDailyPeriodSummary(dailyStats) {
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
        selectors.dailyCaptionContext.textContent = startLabel === endLabel
          ? startLabel
          : `${startLabel} – ${endLabel}`;
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

      /**
       * Escapes user-visible text fragments before injecting into HTML strings.
       * @param {unknown} value
       * @returns {string}
       */
      function escapeHtml(value) {
        return String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
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
        const weekdayLabel = capitalizeSentence(weekdayLongFormatter.format(lastDate));
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
          dateLabel: capitalizeSentence(dailyDateFormatter.format(lastDate)),
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
            total: {
              ...baseSummary.metrics.total,
              average: totalAverage,
            },
            avgTime: {
              ...baseSummary.metrics.avgTime,
              average: avgTimeAverage,
            },
            night: {
              ...baseSummary.metrics.night,
              average: nightAverage,
            },
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

      function renderKpiPeriodSummary(lastShiftSummary, periodMetrics) {
        return kpiRenderer.renderKpiPeriodSummary(lastShiftSummary, periodMetrics);
      }

  function showKpiSkeleton() {
        const grid = selectors.kpiGrid;
        if (!grid || getDatasetValue(grid, 'skeleton') === 'true') {
          return;
        }
        const template = document.getElementById('kpiSkeleton');
        grid.setAttribute('aria-busy', 'true');
        setDatasetValue(grid, 'skeleton', 'true');
        if (template instanceof HTMLTemplateElement) {
          const skeletonFragment = template.content.cloneNode(true);
          grid.replaceChildren(skeletonFragment);
        } else {
          grid.replaceChildren();
        }
      }

      function hideKpiSkeleton() {
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
        const sections = Array.from(sectionsByKey.values()).filter((section) => Array.isArray(section.cards) && section.cards.length);
        sections.sort((a, b) => {
          const aIndex = sectionOrder.indexOf(a.key);
          const bIndex = sectionOrder.indexOf(b.key);
          const normalizedA = aIndex === -1 ? Number.POSITIVE_INFINITY : aIndex;
          const normalizedB = bIndex === -1 ? Number.POSITIVE_INFINITY : bIndex;
          return normalizedA - normalizedB;
        });
        return sections;
      }

      function createEdSkeletonCard(cardConfig) {
        const card = document.createElement('article');
        card.className = 'ed-dashboard__card ed-dashboard__card--skeleton';
        const type = cardConfig?.type === 'donut'
          ? 'donut'
          : (cardConfig?.type === 'comments' ? 'comments' : 'default');
        card.classList.add(`ed-dashboard__card--skeleton-${type}`);

        const title = document.createElement('div');
        title.className = 'skeleton skeleton--title';
        card.appendChild(title);

        if (type === 'donut') {
          const donut = document.createElement('div');
          donut.className = 'skeleton skeleton--donut';
          card.appendChild(donut);
          const detail = document.createElement('div');
          detail.className = 'skeleton skeleton--detail';
          card.appendChild(detail);
          return card;
        }

        if (type === 'comments') {
          const line1 = document.createElement('div');
          line1.className = 'skeleton skeleton--detail';
          const line2 = document.createElement('div');
          line2.className = 'skeleton skeleton--detail';
          const line3 = document.createElement('div');
          line3.className = 'skeleton skeleton--detail';
          const meta = document.createElement('div');
          meta.className = 'skeleton skeleton--detail';
          card.append(line1, line2, line3, meta);
          return card;
        }

        const value = document.createElement('div');
        value.className = 'skeleton skeleton--value';
        const progress = document.createElement('div');
        progress.className = 'skeleton skeleton--detail';
        const detail = document.createElement('div');
        detail.className = 'skeleton skeleton--detail';
        card.append(value, progress, detail);
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
        cards.forEach((cardConfig) => {
          grid.appendChild(createEdSkeletonCard(cardConfig));
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
        setDatasetValue(container, 'skeleton', 'true');
        const sections = buildEdSkeletonSections();
        if (!sections.length) {
          container.replaceChildren();
          return;
        }
        const fragment = document.createDocumentFragment();
        sections.forEach((section) => fragment.appendChild(createEdSkeletonSection(section)));
        container.replaceChildren(fragment);
      }

      function hideEdSkeleton() {
        const container = selectors.edCards;
        if (!container) {
          return;
        }
        if (selectors.edStandardSection) {
          selectors.edStandardSection.removeAttribute('aria-busy');
        }
        if (getDatasetValue(container, 'skeleton') === 'true') {
          container.replaceChildren();
        }
        setDatasetValue(container, 'skeleton', null);
      }

      function renderKpis(dailyStats, referenceDailyStats = null) {
        return kpiRenderer.renderKpis(dailyStats, referenceDailyStats);
      }

      function renderDailyChart(dailyStats, period, ChartLib, palette) {
        return chartRenderers.renderDailyChart(dailyStats, period, ChartLib, palette);
      }

      function renderHourlyChart(records, ChartLib, palette) {
        return chartRenderers.renderHourlyChart(records, ChartLib, palette);
      }

      function resetFeedbackCommentRotation() {
        const rotation = dashboardState?.feedback?.commentRotation;
        if (rotation?.timerId) {
          window.clearInterval(rotation.timerId);
        }
        if (dashboardState?.feedback) {
          dashboardState.feedback.commentRotation = { timerId: null, index: 0, entries: [] };
        }
      }

      function renderFeedbackCommentsCard(cardElement, cardConfig, rawComments) {
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
        rotation.entries = comments.map((item) => ({
          ...item,
          text: item.text.trim(),
        }));
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

      function handleTabKeydown(event) {
        if (!selectors.tabButtons || !selectors.tabButtons.length) {
          return;
        }
        const controllableKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (!controllableKeys.includes(event.key)) {
          return;
        }
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const buttons = selectors.tabButtons.filter(Boolean);
        if (!buttons.length) {
          return;
        }
        const currentIndex = buttons.indexOf(target);
        if (currentIndex === -1) {
          return;
        }
        event.preventDefault();
        let nextIndex = currentIndex;
        if (event.key === 'ArrowRight') {
          nextIndex = (currentIndex + 1) % buttons.length;
        } else if (event.key === 'ArrowLeft') {
          nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
        } else if (event.key === 'Home') {
          nextIndex = 0;
        } else if (event.key === 'End') {
          nextIndex = buttons.length - 1;
        }
        const nextButton = buttons[nextIndex];
        if (nextButton) {
          setActiveTab(getDatasetValue(nextButton, 'tabTarget', 'overview'), { focusPanel: true });
          if (typeof nextButton.focus === 'function') {
            nextButton.focus();
          }
        }
      }

      function setActiveTab(tabId, { focusPanel = false, restoreFocus = false } = {}) {
        const normalized = tabId === 'ed' ? 'ed' : 'overview';
        dashboardState.activeTab = normalized;
        if (selectors.tabButtons && selectors.tabButtons.length) {
          selectors.tabButtons.forEach((button) => {
            if (!button) {
              return;
            }
            const tabTarget = getDatasetValue(button, 'tabTarget', 'overview');
            const isActive = tabTarget === normalized;
            const allowFocus = isActive || (tabTarget === 'overview' && normalized === 'ed');
            button.setAttribute('aria-selected', String(isActive));
            button.setAttribute('tabindex', allowFocus ? '0' : '-1');
            button.classList.toggle('is-active', isActive);
          });
        }
        if (selectors.tabPanels && selectors.tabPanels.length) {
          selectors.tabPanels.forEach((panel) => {
            if (!panel) {
              return;
            }
            const isActive = getDatasetValue(panel, 'tabPanel', 'overview') === normalized;
            if (isActive) {
              panel.removeAttribute('hidden');
              panel.removeAttribute('aria-hidden');
            } else {
              panel.setAttribute('hidden', 'hidden');
              panel.setAttribute('aria-hidden', 'true');
            }
          });
        }
          if (selectors.sectionNav && selectors.tabPanels && selectors.tabPanels.length) {
            if (normalized === 'overview') {
              selectors.sectionNav.removeAttribute('hidden');
              selectors.sectionNav.removeAttribute('aria-hidden');
            } else {
              selectors.sectionNav.setAttribute('hidden', 'hidden');
            selectors.sectionNav.setAttribute('aria-hidden', 'true');
          }
        }
        if (selectors.edNavButton) {
          const edActive = normalized === 'ed';
          selectors.edNavButton.setAttribute('aria-pressed', edActive ? 'true' : 'false');
          selectors.edNavButton.classList.toggle('is-active', edActive);
          const panelLabel = getDatasetValue(selectors.edNavButton, 'panelLabel')
            || settings?.output?.tabEdLabel
            || TEXT.tabs.ed;
          const openLabel = getDatasetValue(selectors.edNavButton, 'openLabel')
            || (typeof TEXT.edToggle?.open === 'function'
              ? TEXT.edToggle.open(panelLabel)
              : `Atidaryti ${panelLabel}`);
          const closeLabel = getDatasetValue(selectors.edNavButton, 'closeLabel')
            || (typeof TEXT.edToggle?.close === 'function'
              ? TEXT.edToggle.close(panelLabel)
              : `Uždaryti ${panelLabel}`);
          const activeLabel = edActive ? closeLabel : openLabel;
          selectors.edNavButton.setAttribute('aria-label', activeLabel);
          selectors.edNavButton.title = activeLabel;
        }
        const fullscreenAvailable = normalized === 'ed';
        if (fullscreenAvailable) {
          // Atidarant ED skiltį automatiškai perjungiame į pilno ekrano režimą.
          setFullscreenMode(true);
        } else if (dashboardState.fullscreen) {
          setFullscreenMode(false, { restoreFocus });
        }
        if (focusPanel) {
          const targetPanel = normalized === 'ed' ? selectors.edPanel : selectors.overviewPanel;
          if (targetPanel && typeof targetPanel.focus === 'function') {
            if (!targetPanel.hasAttribute('tabindex')) {
              targetPanel.setAttribute('tabindex', '-1');
            }
            targetPanel.focus({ preventScroll: false });
          } else if (normalized === 'ed' && selectors.edHeading && typeof selectors.edHeading.scrollIntoView === 'function') {
            selectors.edHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
        updateFullscreenControls();
        scheduleLayoutRefresh();
      }

      function computeFunnelStats(dailyStats, targetYear, fallbackDailyStats) {
        const primaryEntries = Array.isArray(dailyStats) ? dailyStats : [];
        const fallbackEntries = Array.isArray(fallbackDailyStats) ? fallbackDailyStats : [];
        const entries = primaryEntries.length ? primaryEntries : fallbackEntries;
        const withYear = entries
          .map((entry) => {
            const date = typeof entry?.date === 'string' ? dateKeyToDate(entry.date) : null;
            if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
              return null;
            }
            return { entry, year: date.getUTCFullYear() };
          })
          .filter(Boolean);

        if (!withYear.length) {
          const totals = entries.reduce(
            (acc, entry) => ({
              arrived: acc.arrived + (Number.isFinite(entry?.count) ? entry.count : 0),
              hospitalized: acc.hospitalized + (Number.isFinite(entry?.hospitalized) ? entry.hospitalized : 0),
              discharged: acc.discharged + (Number.isFinite(entry?.discharged) ? entry.discharged : 0),
            }),
            { arrived: 0, hospitalized: 0, discharged: 0 }
          );
          const normalizedYear = Number.isFinite(targetYear) ? Number(targetYear) : null;
          return { ...totals, year: normalizedYear };
        }

        let effectiveYear = Number.isFinite(targetYear) ? Number(targetYear) : null;
        if (!Number.isFinite(effectiveYear)) {
          const uniqueYears = withYear.reduce((acc, item) => {
            if (!acc.includes(item.year)) {
              acc.push(item.year);
            }
            return acc;
          }, []);
          if (uniqueYears.length === 1) {
            effectiveYear = uniqueYears[0];
          } else if (!primaryEntries.length && uniqueYears.length) {
            effectiveYear = uniqueYears.reduce((latest, year) => (year > latest ? year : latest), uniqueYears[0]);
          }
        }

        let scoped = withYear;
        if (Number.isFinite(effectiveYear)) {
          scoped = withYear.filter((item) => item.year === effectiveYear);
          if (!scoped.length) {
            scoped = withYear;
          }
        }

        const aggregated = scoped.reduce(
          (acc, item) => ({
            arrived: acc.arrived + (Number.isFinite(item.entry?.count) ? item.entry.count : 0),
            hospitalized: acc.hospitalized + (Number.isFinite(item.entry?.hospitalized) ? item.entry.hospitalized : 0),
            discharged: acc.discharged + (Number.isFinite(item.entry?.discharged) ? item.entry.discharged : 0),
          }),
          { arrived: 0, hospitalized: 0, discharged: 0 }
        );

        return { ...aggregated, year: Number.isFinite(effectiveYear) ? effectiveYear : null };
      }

      function computeArrivalHeatmap(records) {
        const aggregates = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({
          arrivals: 0,
          discharges: 0,
          hospitalized: 0,
          durationSum: 0,
          durationCount: 0,
        })));
        const weekdayDays = {
          arrivals: Array.from({ length: 7 }, () => new Set()),
          discharges: Array.from({ length: 7 }, () => new Set()),
          hospitalized: Array.from({ length: 7 }, () => new Set()),
          avgDuration: Array.from({ length: 7 }, () => new Set()),
        };

        (Array.isArray(records) ? records : []).forEach((entry) => {
          const arrival = entry.arrival instanceof Date && !Number.isNaN(entry.arrival.getTime())
            ? entry.arrival
            : null;
          const discharge = entry.discharge instanceof Date && !Number.isNaN(entry.discharge.getTime())
            ? entry.discharge
            : null;
          const arrivalHasTime = entry?.arrivalHasTime === true
            || (entry?.arrivalHasTime == null && arrival && (arrival.getHours() || arrival.getMinutes() || arrival.getSeconds()));
          const dischargeHasTime = entry?.dischargeHasTime === true
            || (entry?.dischargeHasTime == null && discharge && (discharge.getHours() || discharge.getMinutes() || discharge.getSeconds()));

          if (arrival && arrivalHasTime) {
            const rawDay = arrival.getDay();
            const dayIndex = (rawDay + 6) % 7; // perkeliam, kad pirmadienis būtų pirmas
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
            const rawDay = discharge.getDay();
            const dayIndex = (rawDay + 6) % 7;
            const hour = discharge.getHours();
            if (hour >= 0 && hour <= 23) {
              const cell = aggregates[dayIndex][hour];
              if (entry.hospitalized) {
                cell.hospitalized += 1;
                const dateKey = formatLocalDateKey(discharge);
                if (dateKey) {
                  weekdayDays.hospitalized[dayIndex].add(dateKey);
                }
              } else {
                cell.discharges += 1;
                const dateKey = formatLocalDateKey(discharge);
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
          avgDuration: {
            matrix: createMatrix(),
            counts: createMatrix(),
            max: 0,
            hasData: false,
            samples: 0,
          },
        };

        aggregates.forEach((row, dayIndex) => {
          const arrivalsDiv = weekdayDays.arrivals[dayIndex].size || 1;
          const dischargesDiv = weekdayDays.discharges[dayIndex].size || 1;
          const hospitalizedDiv = weekdayDays.hospitalized[dayIndex].size || 1;
          const durationDiv = weekdayDays.avgDuration[dayIndex].size || 1;

          row.forEach((cell, hourIndex) => {
            if (cell.arrivals > 0) {
              metrics.arrivals.hasData = true;
            }
            if (cell.discharges > 0) {
              metrics.discharges.hasData = true;
            }
            if (cell.hospitalized > 0) {
              metrics.hospitalized.hasData = true;
            }
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

            if (arrivalsAvg > metrics.arrivals.max) {
              metrics.arrivals.max = arrivalsAvg;
            }
            if (dischargesAvg > metrics.discharges.max) {
              metrics.discharges.max = dischargesAvg;
            }
            if (hospitalizedAvg > metrics.hospitalized.max) {
              metrics.hospitalized.max = hospitalizedAvg;
            }
            if (averageDuration > metrics.avgDuration.max) {
              metrics.avgDuration.max = averageDuration;
            }
          });
        });

        return { metrics };
      }

      function formatHourLabel(hour) {
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
          return '';
        }
        return `${String(hour).padStart(2, '0')}:00`;
      }

      function pickTopHours(hourCounts, limit = 3) {
        if (!Array.isArray(hourCounts) || !hourCounts.length) {
          return [];
        }
        return hourCounts
          .map((count, hour) => ({ hour, count }))
          .filter((entry) => Number.isFinite(entry.count) && entry.count > 0)
          .sort((a, b) => {
            if (b.count !== a.count) {
              return b.count - a.count;
            }
            return a.hour - b.hour;
          })
          .slice(0, Math.max(0, limit));
      }

      function computePercentile(sortedValues, percentile) {
        if (!Array.isArray(sortedValues) || !sortedValues.length) {
          return null;
        }
        const clamped = Math.min(Math.max(percentile, 0), 1);
        if (sortedValues.length === 1) {
          return sortedValues[0];
        }
        const index = (sortedValues.length - 1) * clamped;
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;
        if (upper >= sortedValues.length) {
          return sortedValues[sortedValues.length - 1];
        }
        if (lower === upper) {
          return sortedValues[lower];
        }
        const lowerValue = sortedValues[lower];
        const upperValue = sortedValues[upper];
        if (!Number.isFinite(lowerValue) || !Number.isFinite(upperValue)) {
          return null;
        }
        return lowerValue + (upperValue - lowerValue) * weight;
      }

      function formatPercentPointDelta(delta) {
        if (!Number.isFinite(delta)) {
          return '';
        }
        const magnitude = Math.abs(delta) * 100;
        const rounded = Math.round(magnitude * 10) / 10;
        if (!rounded) {
          return '±0 p.p.';
        }
        const sign = delta > 0 ? '+' : '−';
        return `${sign}${oneDecimalFormatter.format(rounded)} p.p.`;
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
        const losDailyBuckets = new Map();
        const uniqueDateKeys = new Set();
        let arrivalsWithHour = 0;
        let fastCount = 0;
        let slowCount = 0;
        let losValidCount = 0;

        records.forEach((record) => {
          const arrival = record.arrival instanceof Date && !Number.isNaN(record.arrival.getTime()) ? record.arrival : null;
          const discharge = record.discharge instanceof Date && !Number.isNaN(record.discharge.getTime()) ? record.discharge : null;
          if (!arrival && !discharge) {
            return;
          }
          const reference = arrival || discharge;
          const dateKey = reference ? formatLocalDateKey(reference) : '';
          if (dateKey) {
            uniqueDateKeys.add(dateKey);
          }
          if (arrival) {
            const hour = arrival.getHours();
            if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
              arrivalHourCounts[hour] += 1;
              arrivalsWithHour += 1;
            }
          }
          if (discharge) {
            const hour = discharge.getHours();
            if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
              dischargeHourCounts[hour] += 1;
            }
          }
          if (arrival && discharge) {
            const diffMinutes = (discharge.getTime() - arrival.getTime()) / 60000;
            if (Number.isFinite(diffMinutes) && diffMinutes >= 0) {
              losValues.push(diffMinutes);
              losValidCount += 1;
              if (diffMinutes < 120) {
                fastCount += 1;
              }
              if (diffMinutes > 480) {
                slowCount += 1;
              }
              if (dateKey) {
                const bucket = losDailyBuckets.get(dateKey) || { dateKey, fastCount: 0, slowCount: 0, losCount: 0 };
                bucket.losCount += 1;
                if (diffMinutes < 120) {
                  bucket.fastCount += 1;
                }
                if (diffMinutes > 480) {
                  bucket.slowCount += 1;
                }
                losDailyBuckets.set(dateKey, bucket);
              }
            }
          }
        });

        const hasPeakWindow = typeof summary.peakWindowText === 'string' && summary.peakWindowText.trim().length;
        if (!hasPeakWindow) {
          const topArrivalHours = pickTopHours(arrivalHourCounts, 3);
          const topDepartureHours = pickTopHours(dischargeHourCounts, 3);
          if (topArrivalHours.length || topDepartureHours.length) {
            const arrivalText = topArrivalHours.length
              ? topArrivalHours.map((item) => formatHourLabel(item.hour)).filter(Boolean).join(', ')
              : '—';
            const departureText = topDepartureHours.length
              ? topDepartureHours.map((item) => formatHourLabel(item.hour)).filter(Boolean).join(', ')
              : '—';
            summary.peakWindowText = `Atvykimai: ${arrivalText} / Išvykimai: ${departureText}`;
            const hasRiskNote = typeof summary.peakWindowRiskNote === 'string' && summary.peakWindowRiskNote.trim().length;
            if (topArrivalHours.length && topDepartureHours.length) {
              const mismatch = topArrivalHours.filter((item) => !topDepartureHours.some((candidate) => candidate.hour === item.hour));
              if (mismatch.length) {
                const labels = mismatch.map((item) => formatHourLabel(item.hour)).filter(Boolean);
                summary.peakWindowRiskNote = labels.length
                  ? `Galima „boarding“ rizika: ${labels.join(', ')}`
                  : 'Galima neatitiktis tarp atvykimų ir išvykimų.';
              } else if (!hasRiskNote) {
                summary.peakWindowRiskNote = 'Pagrindiniai srautai sutampa.';
              }
            } else if (!hasRiskNote) {
              summary.peakWindowRiskNote = topArrivalHours.length
                ? 'Trūksta išvykimų valandų duomenų.'
                : 'Trūksta atvykimų valandų duomenų.';
            }
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
          if (!Number.isFinite(summary.losVariabilityIndex)
            && Number.isFinite(losMedian)
            && Number.isFinite(losP90)
            && losMedian > 0) {
            summary.losVariabilityIndex = losP90 / losMedian;
          }
          const medianHours = Number.isFinite(losMedian) ? losMedian / 60 : null;
          const p90Hours = Number.isFinite(losP90) ? losP90 / 60 : null;
          if ((!summary.losPercentilesText || !summary.losPercentilesText.trim())
            && Number.isFinite(medianHours)
            && Number.isFinite(p90Hours)) {
            summary.losPercentilesText = `P50: ${oneDecimalFormatter.format(medianHours)} val. • P90: ${oneDecimalFormatter.format(p90Hours)} val.`;
          }
          const medianLosDays = Number.isFinite(losMedian) ? losMedian / (60 * 24) : null;
          let avgDaily = Number.isFinite(summary.avgDailyPatients) ? summary.avgDailyPatients : null;
          const dailySource = Array.isArray(overviewDailyStats) ? overviewDailyStats : [];
          if (!Number.isFinite(avgDaily) && dailySource.length) {
            const windowDays = Number.isFinite(Number(options.windowDays)) && Number(options.windowDays) > 0
              ? Number(options.windowDays)
              : 30;
            const scopedDaily = filterDailyStatsByWindow(dailySource, windowDays);
            const effectiveDaily = scopedDaily.length ? scopedDaily : dailySource;
            const totals = effectiveDaily.reduce((acc, entry) => {
              if (Number.isFinite(entry?.count)) {
                acc.sum += Number(entry.count);
                acc.days += 1;
              }
              return acc;
            }, { sum: 0, days: 0 });
            if (totals.days > 0) {
              avgDaily = totals.sum / totals.days;
              if (!Number.isFinite(summary.avgDailyPatients)) {
                summary.avgDailyPatients = avgDaily;
              }
            }
          }
          if (!Number.isFinite(summary.littlesLawEstimate)
            && Number.isFinite(avgDaily)
            && Number.isFinite(medianLosDays)) {
            summary.littlesLawEstimate = avgDaily * medianLosDays;
            if ((!summary.littlesLawMeta || !summary.littlesLawMeta.trim()) && Number.isFinite(medianHours)) {
              summary.littlesLawMeta = `Vid. ${oneDecimalFormatter.format(avgDaily)} atv./d. × median ${oneDecimalFormatter.format(medianHours)} val.`;
            }
          }
        }

        const needsFastSlow = (!Number.isFinite(summary.fastLaneShare)
          || !Number.isFinite(summary.slowLaneShare)
          || !summary.fastSlowSplitValue
          || !summary.fastSlowSplitValue.trim()
          || !summary.fastSlowTrendText
          || !summary.fastSlowTrendText.trim());
        if (needsFastSlow && (losValidCount > 0 || losDailyBuckets.size > 0)) {
          const daily = Array.from(losDailyBuckets.values()).sort((a, b) => (a.dateKey > b.dateKey ? 1 : -1));
          const trendWindowSize = Math.min(30, daily.length);
          const recentWindow = trendWindowSize > 0 ? daily.slice(-trendWindowSize) : [];
          const previousWindow = trendWindowSize > 0
            ? daily.slice(Math.max(0, daily.length - trendWindowSize * 2), daily.length - trendWindowSize)
            : [];
          const reduceWindow = (list) => list.reduce((acc, item) => {
            acc.fast += Number.isFinite(item.fastCount) ? item.fastCount : 0;
            acc.slow += Number.isFinite(item.slowCount) ? item.slowCount : 0;
            acc.totalLos += Number.isFinite(item.losCount) ? item.losCount : 0;
            return acc;
          }, { fast: 0, slow: 0, totalLos: 0 });
          const recentAgg = reduceWindow(recentWindow);
          const previousAgg = reduceWindow(previousWindow);
          const recentFastShare = recentAgg.totalLos > 0
            ? recentAgg.fast / recentAgg.totalLos
            : (losValidCount > 0 ? fastCount / losValidCount : null);
          const recentSlowShare = recentAgg.totalLos > 0
            ? recentAgg.slow / recentAgg.totalLos
            : (losValidCount > 0 ? slowCount / losValidCount : null);
          if (!Number.isFinite(summary.fastLaneShare) && Number.isFinite(recentFastShare)) {
            summary.fastLaneShare = recentFastShare;
          }
          if (!Number.isFinite(summary.slowLaneShare) && Number.isFinite(recentSlowShare)) {
            summary.slowLaneShare = recentSlowShare;
          }
          if ((!summary.fastSlowSplitValue || !summary.fastSlowSplitValue.trim())
            && Number.isFinite(summary.fastLaneShare)
            && Number.isFinite(summary.slowLaneShare)) {
            summary.fastSlowSplitValue = `Greitieji: ${percentFormatter.format(summary.fastLaneShare)} • Lėtieji: ${percentFormatter.format(summary.slowLaneShare)}`;
          }
          let fastDelta = null;
          let slowDelta = null;
          if (previousAgg.totalLos > 0 && recentAgg.totalLos > 0) {
            const previousFastShare = previousAgg.fast / previousAgg.totalLos;
            const previousSlowShare = previousAgg.slow / previousAgg.totalLos;
            fastDelta = Number.isFinite(previousFastShare) && Number.isFinite(recentFastShare)
              ? recentFastShare - previousFastShare
              : null;
            slowDelta = Number.isFinite(previousSlowShare) && Number.isFinite(recentSlowShare)
              ? recentSlowShare - previousSlowShare
              : null;
          }
          if (!Number.isFinite(summary.fastLaneDelta) && Number.isFinite(fastDelta)) {
            summary.fastLaneDelta = fastDelta;
          }
          if (!Number.isFinite(summary.slowLaneDelta) && Number.isFinite(slowDelta)) {
            summary.slowLaneDelta = slowDelta;
          }
          if (!Number.isFinite(summary.fastSlowTrendWindowDays) && trendWindowSize > 0) {
            summary.fastSlowTrendWindowDays = trendWindowSize;
          }
          if ((!summary.fastSlowTrendText || !summary.fastSlowTrendText.trim()) && trendWindowSize > 0) {
            if (Number.isFinite(fastDelta) || Number.isFinite(slowDelta)) {
              const fastDeltaText = Number.isFinite(fastDelta) ? formatPercentPointDelta(fastDelta) : '—';
              const slowDeltaText = Number.isFinite(slowDelta) ? formatPercentPointDelta(slowDelta) : '—';
              summary.fastSlowTrendText = `Langas: ${trendWindowSize} d. • Pokytis vs ankst. ${trendWindowSize} d.: ${fastDeltaText} / ${slowDeltaText}`;
            } else {
              summary.fastSlowTrendText = `Langas: ${trendWindowSize} d. • Ankstesnių duomenų palyginimui nepakanka.`;
            }
          }
          if ((!summary.fastSlowTrendText || !summary.fastSlowTrendText.trim()) && losValidCount > 0) {
            summary.fastSlowTrendText = 'Langas: visi turimi duomenys • Pokyčiams apskaičiuoti reikia bent 2 langų.';
          }
        }

        return summary;
      }

      function getAvailableYearsFromDaily(dailyStats) {
        const years = new Set();
        (Array.isArray(dailyStats) ? dailyStats : []).forEach((entry) => {
          if (!entry || typeof entry.date !== 'string') {
            return;
          }
          const date = dateKeyToDate(entry.date);
          if (date instanceof Date && !Number.isNaN(date.getTime())) {
            years.add(date.getUTCFullYear());
          }
        });
        return Array.from(years).sort((a, b) => b - a);
      }

      function populateChartYearOptions(dailyStats) {
        if (!selectors.chartYearSelect) {
          return;
        }
        const years = getAvailableYearsFromDaily(dailyStats);
        selectors.chartYearSelect.replaceChildren();
        const defaultOption = document.createElement('option');
        defaultOption.value = 'all';
        defaultOption.textContent = TEXT.charts.yearFilterAll;
        selectors.chartYearSelect.appendChild(defaultOption);
        years.forEach((year) => {
          const option = document.createElement('option');
          option.value = String(year);
          option.textContent = `${year} m.`;
          selectors.chartYearSelect.appendChild(option);
        });
        const currentYear = Number.isFinite(dashboardState.chartYear) ? dashboardState.chartYear : null;
        const hasCurrent = Number.isFinite(currentYear) && years.includes(currentYear);
        if (hasCurrent) {
          selectors.chartYearSelect.value = String(currentYear);
        } else {
          selectors.chartYearSelect.value = 'all';
          dashboardState.chartYear = null;
        }
        syncChartYearControl();
      }

      function syncChartYearControl() {
        if (!selectors.chartYearSelect) {
          return;
        }
        const value = Number.isFinite(dashboardState.chartYear) ? String(dashboardState.chartYear) : 'all';
        if (selectors.chartYearSelect.value !== value) {
          selectors.chartYearSelect.value = value;
        }
      }

      /**
       * Grąžina tik paskutines N dienų įrašus (pagal vėliausią turimą datą).
       * @param {Array<{date: string}>} dailyStats
       * @param {number} days
       */
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

      function buildDailyWindowKeys(dailyStats, days) {
        if (!Array.isArray(dailyStats) || !Number.isFinite(days) || days <= 0) {
          return [];
        }
        const decorated = dailyStats
          .map((entry) => ({ utc: dateKeyToUtc(entry?.date) }))
          .filter((item) => Number.isFinite(item.utc));
        if (!decorated.length) {
          return [];
        }
        const endUtc = decorated.reduce((max, item) => Math.max(max, item.utc), decorated[0].utc);
        const startUtc = endUtc - (days - 1) * 86400000;
        const keys = [];
        for (let i = 0; i < days; i += 1) {
          const date = new Date(startUtc + i * 86400000);
          keys.push(formatUtcDateKey(date));
        }
        return keys;
      }

      function fillDailyStatsWindow(dailyStats, windowKeys) {
        const map = new Map((Array.isArray(dailyStats) ? dailyStats : []).map((entry) => [entry?.date, entry]));
        return (Array.isArray(windowKeys) ? windowKeys : []).map((dateKey) => {
          const entry = map.get(dateKey);
          if (entry) {
            return entry;
          }
          return {
            date: dateKey,
            count: 0,
            night: 0,
            ems: 0,
            discharged: 0,
            hospitalized: 0,
            totalTime: 0,
            durations: 0,
            hospitalizedTime: 0,
            hospitalizedDurations: 0,
            avgTime: 0,
            avgHospitalizedTime: 0,
          };
        });
      }

      function filterRecordsByWindow(records, days) {
        if (!Array.isArray(records)) {
          return [];
        }
        if (!Number.isFinite(days) || days <= 0) {
          return records.slice();
        }
        const decorated = records
          .map((entry) => {
            let reference = null;
            if (entry.arrival instanceof Date && !Number.isNaN(entry.arrival.getTime())) {
              reference = entry.arrival;
            } else if (entry.discharge instanceof Date && !Number.isNaN(entry.discharge.getTime())) {
              reference = entry.discharge;
            }
            if (!reference) {
              return null;
            }
            const utc = Date.UTC(reference.getFullYear(), reference.getMonth(), reference.getDate());
            if (!Number.isFinite(utc)) {
              return null;
            }
            return { entry, utc };
          })
          .filter(Boolean);
        if (!decorated.length) {
          return [];
        }
        const endUtc = decorated.reduce((max, item) => Math.max(max, item.utc), decorated[0].utc);
        const startUtc = endUtc - (days - 1) * 86400000;
        return decorated
          .filter((item) => item.utc >= startUtc && item.utc <= endUtc)
          .map((item) => item.entry);
      }

      function filterDailyStatsByYear(dailyStats, year) {
        if (!Number.isFinite(year)) {
          return Array.isArray(dailyStats) ? dailyStats.slice() : [];
        }
        const targetYear = Number(year);
        return (Array.isArray(dailyStats) ? dailyStats : []).filter((entry) => {
          if (!entry || typeof entry.date !== 'string') {
            return false;
          }
          const date = dateKeyToDate(entry.date);
          return date instanceof Date
            && !Number.isNaN(date.getTime())
            && date.getUTCFullYear() === targetYear;
        });
      }

      function filterRecordsByYear(records, year) {
        if (!Number.isFinite(year)) {
          return Array.isArray(records) ? records.slice() : [];
        }
        const targetYear = Number(year);
        return (Array.isArray(records) ? records : []).filter((entry) => {
          const arrivalYear = entry?.arrival instanceof Date && !Number.isNaN(entry.arrival.getTime())
            ? entry.arrival.getFullYear()
            : null;
          const dischargeYear = entry?.discharge instanceof Date && !Number.isNaN(entry.discharge.getTime())
            ? entry.discharge.getFullYear()
            : null;
          const referenceYear = Number.isFinite(arrivalYear) ? arrivalYear : dischargeYear;
          return Number.isFinite(referenceYear) && referenceYear === targetYear;
        });
      }

      function clearChartError() {
        if (!Array.isArray(selectors.chartCards)) {
          return;
        }
        selectors.chartCards.forEach((card) => {
          if (!card) {
            return;
          }
          card.removeAttribute('data-error');
          const messageEl = card.querySelector('.chart-card__message');
          if (messageEl) {
            messageEl.remove();
          }
        });
      }

      function showChartSkeletons() {
        if (!Array.isArray(selectors.chartCards)) {
          return;
        }
        clearChartError();
        selectors.chartCards.forEach((card) => {
          if (!card) {
            return;
          }
          setDatasetValue(card, 'loading', 'true');
          const skeleton = card.querySelector('.chart-card__skeleton');
          if (skeleton) {
            skeleton.hidden = false;
          }
        });
      }

      function hideChartSkeletons() {
        if (!Array.isArray(selectors.chartCards)) {
          return;
        }
        selectors.chartCards.forEach((card) => {
          if (!card) {
            return;
          }
          setDatasetValue(card, 'loading', null);
          const skeleton = card.querySelector('.chart-card__skeleton');
          if (skeleton) {
            skeleton.hidden = true;
          }
        });
      }

      function showChartError(message) {
        if (!Array.isArray(selectors.chartCards)) {
          return;
        }
        const fallbackMessage = (TEXT?.charts?.errorLoading)
          || (TEXT?.status?.error)
          || 'Nepavyko atvaizduoti grafikų.';
        const resolvedMessage = message && String(message).trim().length
          ? String(message)
          : fallbackMessage;
        hideChartSkeletons();
        selectors.chartCards.forEach((card) => {
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
          messageEl.textContent = resolvedMessage;
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



      function handleHeatmapMetricChange(event) {
        const candidate = event?.target?.value;
        const metrics = dashboardState.chartData?.heatmap?.metrics || {};
        const normalized = normalizeHeatmapMetricKey(candidate, metrics);
        dashboardState.heatmapMetric = normalized;
        const palette = getThemePalette();
        renderArrivalHeatmap(
          selectors.heatmapContainer,
          dashboardState.chartData.heatmap,
          palette.accent,
          dashboardState.heatmapMetric,
        );
      }

      function handleHeatmapFilterChange(event) {
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
      }


  function areStylesheetsLoaded() {
        const sheets = Array.from(document.styleSheets || []);
        if (!sheets.length) {
          return false;
        }
        return sheets.every((sheet) => {
          try {
            return sheet.cssRules != null;
          } catch (error) {
            return true;
          }
        });
      }


      function computeVisibleRatio(rect) {
        if (!rect) {
          return 0;
        }
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const elementHeight = Math.max(rect.height, 1);
        if (viewportHeight <= 0 || elementHeight <= 0) {
          return 0;
        }
        const visibleTop = Math.max(rect.top, 0);
        const visibleBottom = Math.min(rect.bottom, viewportHeight);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        return Math.max(0, Math.min(1, visibleHeight / elementHeight));
      }















      function cloneSettings(value) {
        return JSON.parse(JSON.stringify(value));
      }

      function deepMerge(target, source) {
        if (!source || typeof source !== 'object') {
          return target;
        }
        Object.entries(source).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            target[key] = value.slice();
          } else if (value && typeof value === 'object') {
            if (!target[key] || typeof target[key] !== 'object') {
              target[key] = {};
            }
            deepMerge(target[key], value);
          } else if (value !== undefined) {
            target[key] = value;
          }
        });
        return target;
      }

      function updateClientConfig(patch = {}) {
        if (!patch || typeof patch !== 'object') {
          return clientConfig;
        }
        clientConfig = { ...clientConfig, ...patch };
        clientStore.save(clientConfig);
        return clientConfig;
      }

      function clampNumber(value, min, max, fallback) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) {
          let result = parsed;
          if (Number.isFinite(min) && result < min) {
            result = min;
          }
          if (Number.isFinite(max) && result > max) {
            result = max;
          }
          return result;
        }
        return fallback;
      }

      const LEGACY_FEEDBACK_DESCRIPTION_PATTERNS = [
        'kortelės rodo bendras įžvalgas, lentelė – mėnesines suvestines.',
        'korteles rodo bendras izvalgas, lentele - menesines suvestines.',
      ];

      function normalizeLegacyFeedbackDescription(value) {
        if (value == null) {
          return '';
        }
        const text = String(value).trim();
        if (!text) {
          return '';
        }
        const normalized = text
          .toLowerCase()
          .replace(/\u2013|\u2014/g, '-')
          .replace(/[ąčęėįšųūž]/g, (char) => ({
            ą: 'a',
            č: 'c',
            ę: 'e',
            ė: 'e',
            į: 'i',
            š: 's',
            ų: 'u',
            ū: 'u',
            ž: 'z',
          })[char] || char)
          .replace(/\s+/g, ' ')
          .trim();
        if (LEGACY_FEEDBACK_DESCRIPTION_PATTERNS.includes(normalized)) {
          return '';
        }
        return text;
      }

      function normalizeSettings(rawSettings) {
        const originalSettings = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
        let sanitizedSettings = {};
        if (originalSettings && typeof originalSettings === 'object') {
          try {
            sanitizedSettings = cloneSettings(originalSettings);
          } catch (error) {
            console.warn('Nepavyko nukopijuoti išsaugotų nustatymų, naudojami tik numatytieji.', error);
            sanitizedSettings = {};
          }
        }

        const merged = deepMerge(cloneSettings(DEFAULT_SETTINGS), sanitizedSettings ?? {});
        merged.dataSource.url = (merged.dataSource.url ?? '').trim();
        if (!merged.dataSource.feedback || typeof merged.dataSource.feedback !== 'object') {
          merged.dataSource.feedback = cloneSettings(DEFAULT_SETTINGS.dataSource.feedback);
        }
        merged.dataSource.feedback.url = (merged.dataSource.feedback.url ?? '').trim();

        if (!merged.dataSource.ed || typeof merged.dataSource.ed !== 'object') {
          merged.dataSource.ed = cloneSettings(DEFAULT_SETTINGS.dataSource.ed);
        }
        merged.dataSource.ed.url = (merged.dataSource.ed.url ?? '').trim();

        if (!merged.dataSource.historical || typeof merged.dataSource.historical !== 'object') {
          merged.dataSource.historical = cloneSettings(DEFAULT_SETTINGS.dataSource.historical);
        }
        merged.dataSource.historical.enabled = merged.dataSource.historical.enabled !== false;
        merged.dataSource.historical.url = (merged.dataSource.historical.url ?? '').trim();
        merged.dataSource.historical.label = merged.dataSource.historical.label != null
          ? String(merged.dataSource.historical.label)
          : DEFAULT_SETTINGS.dataSource.historical.label;

        ['arrival', 'discharge', 'dayNight', 'gmp', 'department', 'number', 'trueValues', 'hospitalizedValues', 'nightKeywords', 'dayKeywords']
          .forEach((key) => {
            merged.csv[key] = merged.csv[key] != null
              ? String(merged.csv[key])
              : String(DEFAULT_SETTINGS.csv[key] ?? '');
          });

        merged.calculations.windowDays = clampNumber(
          merged.calculations.windowDays,
          7,
          365,
          DEFAULT_SETTINGS.calculations.windowDays,
        );
        merged.calculations.recentDays = clampNumber(
          merged.calculations.recentDays,
          1,
          60,
          DEFAULT_SETTINGS.calculations.recentDays,
        );
        merged.calculations.nightStartHour = clampNumber(
          merged.calculations.nightStartHour,
          0,
          23,
          DEFAULT_SETTINGS.calculations.nightStartHour,
        );
        merged.calculations.nightEndHour = clampNumber(
          merged.calculations.nightEndHour,
          0,
          23,
          DEFAULT_SETTINGS.calculations.nightEndHour,
        );

        merged.output.pageTitle = merged.output.pageTitle != null ? String(merged.output.pageTitle) : DEFAULT_SETTINGS.output.pageTitle;
        merged.output.title = merged.output.title != null ? String(merged.output.title) : DEFAULT_SETTINGS.output.title;
        merged.output.subtitle = merged.output.subtitle != null ? String(merged.output.subtitle) : DEFAULT_SETTINGS.output.subtitle;
        merged.output.kpiTitle = merged.output.kpiTitle != null ? String(merged.output.kpiTitle) : DEFAULT_SETTINGS.output.kpiTitle;
        merged.output.kpiSubtitle = merged.output.kpiSubtitle != null ? String(merged.output.kpiSubtitle) : DEFAULT_SETTINGS.output.kpiSubtitle;
        merged.output.chartsTitle = merged.output.chartsTitle != null ? String(merged.output.chartsTitle) : DEFAULT_SETTINGS.output.chartsTitle;
        merged.output.chartsSubtitle = merged.output.chartsSubtitle != null ? String(merged.output.chartsSubtitle) : DEFAULT_SETTINGS.output.chartsSubtitle;
        merged.output.recentTitle = merged.output.recentTitle != null ? String(merged.output.recentTitle) : DEFAULT_SETTINGS.output.recentTitle;
        merged.output.recentSubtitle = merged.output.recentSubtitle != null ? String(merged.output.recentSubtitle) : DEFAULT_SETTINGS.output.recentSubtitle;
        if (merged.output.monthlyTitle == null && merged.output.weeklyTitle != null) {
          merged.output.monthlyTitle = merged.output.weeklyTitle;
        }
        if (merged.output.monthlySubtitle == null && merged.output.weeklySubtitle != null) {
          merged.output.monthlySubtitle = merged.output.weeklySubtitle;
        }
        if (merged.output.showMonthly == null && merged.output.showWeekly != null) {
          merged.output.showMonthly = merged.output.showWeekly;
        }
        merged.output.monthlyTitle = merged.output.monthlyTitle != null ? String(merged.output.monthlyTitle) : DEFAULT_SETTINGS.output.monthlyTitle;
        merged.output.monthlySubtitle = merged.output.monthlySubtitle != null ? String(merged.output.monthlySubtitle) : DEFAULT_SETTINGS.output.monthlySubtitle;
        merged.output.yearlyTitle = merged.output.yearlyTitle != null ? String(merged.output.yearlyTitle) : DEFAULT_SETTINGS.output.yearlyTitle;
        merged.output.yearlySubtitle = merged.output.yearlySubtitle != null ? String(merged.output.yearlySubtitle) : DEFAULT_SETTINGS.output.yearlySubtitle;
        merged.output.feedbackTitle = merged.output.feedbackTitle != null ? String(merged.output.feedbackTitle) : DEFAULT_SETTINGS.output.feedbackTitle;
        merged.output.feedbackSubtitle = merged.output.feedbackSubtitle != null ? String(merged.output.feedbackSubtitle) : DEFAULT_SETTINGS.output.feedbackSubtitle;
        merged.output.feedbackDescription = normalizeLegacyFeedbackDescription(
          merged.output.feedbackDescription != null
            ? String(merged.output.feedbackDescription)
            : DEFAULT_SETTINGS.output.feedbackDescription,
        );
        merged.output.footerSource = merged.output.footerSource != null ? String(merged.output.footerSource) : DEFAULT_SETTINGS.output.footerSource;
        merged.output.scrollTopLabel = merged.output.scrollTopLabel != null ? String(merged.output.scrollTopLabel) : DEFAULT_SETTINGS.output.scrollTopLabel;
        merged.output.tabOverviewLabel = merged.output.tabOverviewLabel != null ? String(merged.output.tabOverviewLabel) : DEFAULT_SETTINGS.output.tabOverviewLabel;
        merged.output.tabEdLabel = merged.output.tabEdLabel != null ? String(merged.output.tabEdLabel) : DEFAULT_SETTINGS.output.tabEdLabel;
        merged.output.edTitle = merged.output.edTitle != null ? String(merged.output.edTitle) : DEFAULT_SETTINGS.output.edTitle;
        merged.output.showRecent = Boolean(merged.output.showRecent);
        merged.output.showMonthly = Boolean(merged.output.showMonthly);
        merged.output.showYearly = Boolean(merged.output.showYearly);
        merged.output.showFeedback = Boolean(merged.output.showFeedback);

        return merged;
      }

      function getRuntimeConfigUrl() {
        if (typeof window === 'undefined') {
          return 'config.json';
        }
        const params = new URLSearchParams(window.location.search);
        const paramUrl = params.get('config');
        if (paramUrl && paramUrl.trim().length) {
          return paramUrl.trim();
        }
        return 'config.json';
      }

      async function loadSettingsFromConfig() {
        const configUrl = getRuntimeConfigUrl();
        try {
          const response = await fetch(configUrl, { cache: 'no-store' });
          if (!response.ok) {
            throw new Error(`Nepavyko atsisiųsti konfigūracijos (${response.status})`);
          }
          const configData = await response.json();
          return normalizeSettings(configData);
        } catch (error) {
          console.warn('Nepavyko įkelti config.json, naudojami numatytieji.', error);
          return normalizeSettings({});
        }
      }

      function applySettingsToText() {
        TEXT.title = settings.output.title || DEFAULT_SETTINGS.output.title;
        TEXT.subtitle = settings.output.subtitle || DEFAULT_SETTINGS.output.subtitle;
        TEXT.tabs.overview = settings.output.tabOverviewLabel || DEFAULT_SETTINGS.output.tabOverviewLabel;
        TEXT.tabs.ed = settings.output.tabEdLabel || DEFAULT_SETTINGS.output.tabEdLabel;
        TEXT.ed.title = settings.output.edTitle || DEFAULT_SETTINGS.output.edTitle;
        TEXT.kpis.title = settings.output.kpiTitle || DEFAULT_SETTINGS.output.kpiTitle;
        TEXT.kpis.subtitle = settings.output.kpiSubtitle || DEFAULT_SETTINGS.output.kpiSubtitle;
        TEXT.charts.title = settings.output.chartsTitle || DEFAULT_SETTINGS.output.chartsTitle;
        TEXT.charts.subtitle = settings.output.chartsSubtitle || DEFAULT_SETTINGS.output.chartsSubtitle;
        TEXT.recent.title = settings.output.recentTitle || DEFAULT_SETTINGS.output.recentTitle;
        TEXT.recent.subtitle = settings.output.recentSubtitle || DEFAULT_SETTINGS.output.recentSubtitle;
        TEXT.monthly.title = settings.output.monthlyTitle || DEFAULT_SETTINGS.output.monthlyTitle;
        TEXT.monthly.subtitle = settings.output.monthlySubtitle || DEFAULT_SETTINGS.output.monthlySubtitle;
        TEXT.yearly.title = settings.output.yearlyTitle || DEFAULT_SETTINGS.output.yearlyTitle;
        TEXT.yearly.subtitle = settings.output.yearlySubtitle || DEFAULT_SETTINGS.output.yearlySubtitle;
        TEXT.feedback.title = settings.output.feedbackTitle || DEFAULT_SETTINGS.output.feedbackTitle;
        TEXT.feedback.subtitle = settings.output.feedbackSubtitle || DEFAULT_SETTINGS.output.feedbackSubtitle;
        TEXT.feedback.description = normalizeLegacyFeedbackDescription(
          settings.output.feedbackDescription ?? DEFAULT_SETTINGS.output.feedbackDescription,
        );
        TEXT.feedback.trend.title = settings.output.feedbackTrendTitle || DEFAULT_SETTINGS.output.feedbackTrendTitle;
        TEXT.scrollTop = settings.output.scrollTopLabel || DEFAULT_SETTINGS.output.scrollTopLabel;
        const pageTitle = settings.output.pageTitle || TEXT.title || DEFAULT_SETTINGS.output.pageTitle;
        document.title = pageTitle;
      }

      function applyFooterSource() {
        if (selectors.footerSource) {
          selectors.footerSource.textContent = settings.output.footerSource || DEFAULT_FOOTER_SOURCE;
        }
      }

      function toggleSectionVisibility(element, isVisible) {
        if (!element) {
          return;
        }
        if (isVisible) {
          element.removeAttribute('hidden');
          element.removeAttribute('aria-hidden');
        } else {
          element.setAttribute('hidden', 'hidden');
          element.setAttribute('aria-hidden', 'true');
        }
      }

      function applySectionVisibility() {
        toggleSectionVisibility(selectors.recentSection, settings.output.showRecent);
        toggleSectionVisibility(selectors.monthlySection, settings.output.showMonthly);
        toggleSectionVisibility(selectors.yearlySection, settings.output.showYearly);
        toggleSectionVisibility(selectors.feedbackSection, settings.output.showFeedback);
        syncSectionNavVisibility();
      }

      function parseCandidateList(value, fallback = '') {
        const base = value && String(value).trim().length ? String(value) : String(fallback ?? '');
        return base
          .replace(/\r\n/g, '\n')
          .split(/[\n,|;]+/)
          .map((part) => part.trim())
          .filter((part) => part.length > 0);
      }

      function toHeaderCandidates(value, fallback) {
        return parseCandidateList(value, fallback);
      }

      function toNormalizedList(value, fallback) {
        return parseCandidateList(value, fallback).map((token) => token.toLowerCase());
      }

      function buildCsvRuntime(csvSettings) {
        const fallback = DEFAULT_SETTINGS.csv;
        const departmentHasValue = csvSettings.department && csvSettings.department.trim().length > 0;
        const departmentHeaders = departmentHasValue
          ? toHeaderCandidates(csvSettings.department, '')
          : [];

        const runtime = {
          arrivalHeaders: toHeaderCandidates(csvSettings.arrival, fallback.arrival),
          dischargeHeaders: toHeaderCandidates(csvSettings.discharge, fallback.discharge),
          dayNightHeaders: toHeaderCandidates(csvSettings.dayNight, fallback.dayNight),
          gmpHeaders: toHeaderCandidates(csvSettings.gmp, fallback.gmp),
          departmentHeaders,
          trueValues: toNormalizedList(csvSettings.trueValues, fallback.trueValues),
          hospitalizedValues: toNormalizedList(csvSettings.hospitalizedValues, fallback.hospitalizedValues),
          nightKeywords: toNormalizedList(csvSettings.nightKeywords, fallback.nightKeywords),
          dayKeywords: toNormalizedList(csvSettings.dayKeywords, fallback.dayKeywords),
          labels: {
            arrival: csvSettings.arrival || fallback.arrival,
            discharge: csvSettings.discharge || fallback.discharge,
            dayNight: csvSettings.dayNight || fallback.dayNight,
            gmp: csvSettings.gmp || fallback.gmp,
            department: departmentHasValue ? csvSettings.department : fallback.department,
          },
        };
        runtime.hasHospitalizedValues = runtime.hospitalizedValues.length > 0;
        runtime.requireDepartment = departmentHasValue;
        return runtime;
      }

      function resolveColumnIndex(headerNormalized, candidates) {
        if (!Array.isArray(candidates) || !candidates.length) {
          return -1;
        }
        for (const candidate of candidates) {
          const trimmed = candidate.trim();
          const match = headerNormalized.find((column) => column.original === trimmed);
          if (match) {
            return match.index;
          }
        }
        for (const candidate of candidates) {
          const normalized = candidate.trim().toLowerCase();
          const match = headerNormalized.find((column) => column.normalized === normalized);
          if (match) {
            return match.index;
          }
        }
        for (const candidate of candidates) {
          const normalized = candidate.trim().toLowerCase();
          const match = headerNormalized.find((column) => column.normalized.includes(normalized));
          if (match) {
            return match.index;
          }
        }
        return -1;
      }

      function matchesWildcard(normalized, candidate) {
        if (!candidate) {
          return false;
        }
        if (candidate === '*') {
          return normalized.length > 0;
        }
        if (!candidate.includes('*')) {
          return normalized === candidate;
        }
        const parts = candidate.split('*').filter((part) => part.length > 0);
        if (!parts.length) {
          return normalized.length > 0;
        }
        return parts.every((fragment) => normalized.includes(fragment));
      }

      function detectHospitalized(value, csvRuntime) {
        const raw = value != null ? String(value).trim() : '';
        if (!raw) {
          return false;
        }
        if (!csvRuntime.hasHospitalizedValues) {
          return true;
        }
        const normalized = raw.toLowerCase();
        return csvRuntime.hospitalizedValues.some((candidate) => matchesWildcard(normalized, candidate));
      }


      /**
       * Čia saugome aktyvius grafikus, kad galėtume juos sunaikinti prieš piešiant naujus.
       */
      const HEATMAP_WEEKDAY_SHORT = ['Pir', 'Antr', 'Treč', 'Ketv', 'Penkt', 'Šešt', 'Sekm'];
      const HEATMAP_WEEKDAY_FULL = [
        'Pirmadienis',
        'Antradienis',
        'Trečiadienis',
        'Ketvirtadienis',
        'Penktadienis',
        'Šeštadienis',
        'Sekmadienis',
      ];
      const HEATMAP_HOURS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);
      const LAST_SHIFT_METRIC_ARRIVALS = 'arrivals';
      const LAST_SHIFT_METRIC_DISCHARGES = 'discharges';
      const LAST_SHIFT_METRIC_HOSPITALIZED = 'hospitalized';
      const LAST_SHIFT_METRIC_BALANCE = 'balance';
      const LAST_SHIFT_METRICS = [
        LAST_SHIFT_METRIC_ARRIVALS,
        LAST_SHIFT_METRIC_DISCHARGES,
        LAST_SHIFT_METRIC_HOSPITALIZED,
        LAST_SHIFT_METRIC_BALANCE,
      ];
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
      const HOURLY_COMPARE_SERIES = [HOURLY_COMPARE_SERIES_ALL, HOURLY_COMPARE_SERIES_EMS, HOURLY_COMPARE_SERIES_SELF];
      const HOURLY_STAY_BUCKETS = [
        { key: 'lt4', min: 0, max: 4 },
        { key: '4to8', min: 4, max: 8 },
        { key: '8to16', min: 8, max: 16 },
        { key: 'gt16', min: 16, max: Number.POSITIVE_INFINITY },
      ];
      const HEATMAP_METRIC_KEYS = ['arrivals', 'discharges', 'hospitalized', 'avgDuration'];
      const DEFAULT_HEATMAP_METRIC = HEATMAP_METRIC_KEYS[0];

      const dashboardState = createDashboardState({
        defaultChartFilters: getDefaultChartFilters,
        defaultKpiFilters: getDefaultKpiFilters,
        defaultFeedbackFilters: getDefaultFeedbackFilters,
        defaultHeatmapFilters: getDefaultHeatmapFilters,
        defaultHeatmapMetric: DEFAULT_HEATMAP_METRIC,
        hourlyMetricArrivals: HOURLY_METRIC_ARRIVALS,
        hourlyCompareSeriesAll: HOURLY_COMPARE_SERIES_ALL,
      });
      dashboardState.activeTab = pageConfig.ed ? 'ed' : 'overview';

      const edCommentsFeature = createEdCommentsFeature({
        dashboardState,
        TEXT,
        statusTimeFormatter,
      });
      const {
        resetEdCommentRotation,
        renderEdCommentsCard,
      } = edCommentsFeature;

      const edCardsFeature = createEdCardsFeature({
        ED_TOTAL_BEDS,
        numberFormatter,
        oneDecimalFormatter,
        percentFormatter,
        setDatasetValue,
      });
      const {
        formatEdCardValue,
        buildFeedbackTrendInfo,
        buildEdCardVisuals,
      } = edCardsFeature;

      const edPanelCoreFeature = createEdPanelCoreFeature({
        dashboardState,
        TEXT,
        statusTimeFormatter,
        renderEdDashboard,
      });
      const {
        buildEdStatus,
        createEdSectionIcon,
        normalizeEdSearchQuery,
        matchesEdSearch,
        applyEdSearchFilter,
      } = edPanelCoreFeature;

      const feedbackRenderFeature = createFeedbackRenderFeature({
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
        resetFeedbackCommentRotation,
        renderFeedbackCommentsCard,
      });
      const {
        renderFeedbackTrendChart,
        renderFeedbackSection,
        getActiveFeedbackTrendWindow,
        updateFeedbackTrendSubtitle,
        syncFeedbackTrendControls,
        setFeedbackTrendWindow,
      } = feedbackRenderFeature;

      const feedbackPanelFeature = createFeedbackPanelFeature({
        selectors,
        dashboardState,
        TEXT,
        FEEDBACK_RATING_MIN,
        FEEDBACK_RATING_MAX,
        getDefaultFeedbackFilters,
        FEEDBACK_FILTER_ALL,
        FEEDBACK_FILTER_MISSING,
        numberFormatter,
        textCollator,
        capitalizeSentence,
        formatLocalDateKey,
        getDatasetValue,
        setDatasetValue,
        renderFeedbackSection,
      });
      const {
        populateFeedbackFilterControls,
        syncFeedbackFilterControls,
        updateFeedbackFiltersSummary,
        applyFeedbackFiltersAndRender,
        handleFeedbackFilterChange,
        handleFeedbackFilterChipClick,
        updateFeedbackFilterOptions,
      } = feedbackPanelFeature;

      const hourlyControlsFeature = createHourlyControlsFeature({
        selectors,
        dashboardState,
        TEXT,
        settings,
        DEFAULT_SETTINGS,
        getDatasetValue,
        sanitizeChartFilters,
        getDefaultChartFilters,
        KPI_FILTER_LABELS,
        filterRecordsByYear,
        filterRecordsByChartFilters,
        filterRecordsByWindow,
        getAvailableYearsFromDaily,
        textCollator,
        formatLocalDateKey,
        describeError,
        showChartError,
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
      const {
        normalizeHourlyWeekday,
        normalizeHourlyMetric,
        normalizeHourlyDepartment,
        normalizeHourlyStayBucket,
        normalizeHourlyCompareYears,
        applyHourlyYAxisAuto,
        updateHourlyCaption,
        populateHourlyWeekdayOptions,
        syncHourlyMetricButtons,
        populateHourlyStayOptions,
        updateHourlyDepartmentOptions,
        syncHourlyDepartmentVisibility,
        computeHourlySeries,
        getHourlyChartRecords,
        populateHourlyCompareYearOptions,
        syncHourlyCompareControls,
        handleHourlyFilterChange,
        handleHourlyMetricClick,
        handleHourlyResetFilters,
        handleHourlyDepartmentInput,
        handleHourlyDepartmentBlur,
        handleHourlyDepartmentToggle,
        handleHourlyDepartmentKeydown,
        handleHourlyCompareToggle,
        handleHourlyCompareYearsChange,
        handleHourlyCompareSeriesClick,
        applyHourlyDepartmentSelection,
      } = hourlyControlsFeature;

      const textContentFeature = createTextContentFeature({
        common: {
          selectors,
          settings,
          TEXT,
          dashboardState,
          setDatasetValue,
          updateFullscreenControls,
          hideStatusNote,
        },
        kpi: {
          selectors,
          TEXT,
        },
        charts: {
          selectors,
          TEXT,
          dashboardState,
          formatDailyCaption,
          updateChartsHospitalTableHeaderSortIndicators,
          syncHourlyMetricButtons,
          populateHourlyWeekdayOptions,
          populateHourlyStayOptions,
          syncHourlyDepartmentVisibility,
          updateHourlyCaption,
          populateHeatmapMetricOptions,
          updateHeatmapCaption,
        },
        feedback: {
          selectors,
          TEXT,
          getDatasetValue,
          populateFeedbackFilterControls,
          syncFeedbackFilterControls,
          updateFeedbackFiltersSummary,
          updateFeedbackTrendSubtitle,
          syncFeedbackTrendControls,
        },
        ed: {
          selectors,
          settings,
          TEXT,
          setDatasetValue,
        },
      });
      const {
        applyTextContent,
      } = textContentFeature;

      const chartFlow = createChartFlow({
        selectors,
        dashboardState,
        TEXT,
        DEFAULT_SETTINGS,
        getDefaultChartFilters,
        KPI_FILTER_LABELS,
        sanitizeChartFilters,
        getDatasetValue,
        setDatasetValue,
        toSentenceCase,
        showChartError,
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
        syncChartPeriodButtons,
        syncChartYearControl,
        formatDailyCaption,
        renderCharts,
        getSettings: () => settings,
      });

      const {
        syncChartFilterControls,
        updateChartFiltersSummary,
        applyChartFilters,
        updateChartPeriod,
        updateChartYear,
        prepareChartDataForPeriod,
        handleChartFilterChange,
        handleChartSegmentedClick,
      } = chartFlow;

      const heatmapFlow = {
        populateHeatmapYearOptions,
        syncHeatmapFilterControls,
        applyHeatmapFiltersAndRender,
        computeHeatmapDataForFilters,
      };

      function resetMonthlyState() {
        dashboardState.monthly.all = [];
        dashboardState.monthly.window = [];
      }

      function setFullscreenMode(active, options = {}) {
        const previousState = dashboardState.fullscreen === true;
        const allowFullscreen = dashboardState.activeTab === 'ed';
        const requestedActive = Boolean(active);
        const isActive = requestedActive && allowFullscreen;
        dashboardState.fullscreen = isActive;
        if (isActive) {
          document.body.setAttribute('data-fullscreen', 'true');
        } else {
          document.body.removeAttribute('data-fullscreen');
        }
        if (selectors.tabSwitcher) {
          if (isActive) {
            selectors.tabSwitcher.setAttribute('hidden', 'hidden');
            selectors.tabSwitcher.setAttribute('aria-hidden', 'true');
          } else {
            selectors.tabSwitcher.removeAttribute('hidden');
            selectors.tabSwitcher.removeAttribute('aria-hidden');
          }
        }
        const shouldRestoreFocus = options.restoreFocus;
        if (!isActive
          && previousState
          && shouldRestoreFocus
          && selectors.edNavButton
          && typeof selectors.edNavButton.focus === 'function') {
          selectors.edNavButton.focus();
        }
        updateFullscreenControls();
      }

      function updateFullscreenControls() {
        if (!selectors.edNavButton) {
          return;
        }
        const panelLabel = getDatasetValue(selectors.edNavButton, 'panelLabel')
          || settings?.output?.tabEdLabel
          || TEXT.tabs.ed;
        const openLabel = getDatasetValue(selectors.edNavButton, 'openLabel')
          || (typeof TEXT.edToggle?.open === 'function'
            ? TEXT.edToggle.open(panelLabel)
            : `Atidaryti ${panelLabel}`);
        const closeLabel = getDatasetValue(selectors.edNavButton, 'closeLabel')
          || (typeof TEXT.edToggle?.close === 'function'
            ? TEXT.edToggle.close(panelLabel)
            : `Uždaryti ${panelLabel}`);
        const isFullscreen = dashboardState.fullscreen === true;
        const isEdActive = dashboardState.activeTab === 'ed';
        const activeLabel = isFullscreen && isEdActive ? closeLabel : openLabel;
        selectors.edNavButton.setAttribute('aria-label', activeLabel);
        selectors.edNavButton.title = activeLabel;
        setDatasetValue(selectors.edNavButton, 'fullscreenAvailable', isEdActive ? 'true' : 'false');
      }

      const statusDisplay = {
        base: '',
        note: '',
        tone: 'info',
        loading: true,
        progress: null,
        progressSmooth: null,
        progressTarget: null,
        progressFrame: null,
      };

      function applyTone(tone = 'info') {
        const normalized = tone === 'error' ? 'error' : tone === 'warning' ? 'warning' : 'info';
        if (normalized === 'error' || statusDisplay.tone === 'error') {
          statusDisplay.tone = 'error';
          return;
        }
        if (normalized === 'warning' || statusDisplay.tone === 'warning') {
          statusDisplay.tone = 'warning';
          return;
        }
        statusDisplay.tone = 'info';
      }

      function renderStatusDisplay() {
        if (!selectors.status) return;
        if (statusDisplay.loading) {
          selectors.status.textContent = '';
          selectors.status.classList.add('status--loading');
          const determinate = Number.isFinite(statusDisplay.progress);
          selectors.status.classList.toggle('status--determinate', determinate);
          if (determinate) {
            const clamped = Math.max(0, Math.min(1, statusDisplay.progress));
            selectors.status.style.setProperty('--status-progress', clamped.toFixed(4));
          } else {
            selectors.status.style.removeProperty('--status-progress');
          }
          selectors.status.classList.toggle('status--error', statusDisplay.tone === 'error');
          setDatasetValue(selectors.status, 'tone', statusDisplay.tone);
          selectors.status.setAttribute('aria-label', TEXT.status.loading);
          selectors.status.removeAttribute('hidden');
          return;
        }
        selectors.status.classList.remove('status--loading');
        selectors.status.classList.remove('status--determinate');
        selectors.status.style.removeProperty('--status-progress');
        selectors.status.removeAttribute('aria-label');
        const parts = [statusDisplay.base, statusDisplay.note].filter(Boolean);
        const message = parts.join(' · ');
        selectors.status.classList.toggle('status--error', statusDisplay.tone === 'error');
        setDatasetValue(selectors.status, 'tone', statusDisplay.tone);
        if (!message) {
          selectors.status.textContent = '';
          selectors.status.setAttribute('hidden', 'hidden');
          return;
        }
        selectors.status.textContent = message;
        selectors.status.removeAttribute('hidden');
      }

      function hideStatusNote() {
        statusDisplay.note = '';
        applyTone('info');
        renderStatusDisplay();
      }

      function showStatusNote(message, tone = 'info') {
        statusDisplay.note = message || '';
        applyTone(tone);
        renderStatusDisplay();
      }

      function stepSmoothProgress() {
        if (!statusDisplay.loading) {
          statusDisplay.progressFrame = null;
          return;
        }
        const target = Number.isFinite(statusDisplay.progressTarget) ? statusDisplay.progressTarget : null;
        if (target == null) {
          statusDisplay.progressSmooth = null;
          statusDisplay.progress = null;
          statusDisplay.progressFrame = null;
          renderStatusDisplay();
          return;
        }
        const current = Number.isFinite(statusDisplay.progressSmooth) ? statusDisplay.progressSmooth : 0;
        const delta = target - current;
        if (Math.abs(delta) < 0.002) {
          statusDisplay.progressSmooth = target;
        } else {
          statusDisplay.progressSmooth = current + delta * 0.18;
        }
        statusDisplay.progress = statusDisplay.progressSmooth;
        renderStatusDisplay();
        statusDisplay.progressFrame = window.requestAnimationFrame(stepSmoothProgress);
      }

      function setLoadingProgress(progress) {
        if (!statusDisplay.loading) {
          return;
        }
        if (!Number.isFinite(progress)) {
          statusDisplay.progress = null;
          statusDisplay.progressSmooth = null;
          statusDisplay.progressTarget = null;
          if (statusDisplay.progressFrame) {
            window.cancelAnimationFrame(statusDisplay.progressFrame);
            statusDisplay.progressFrame = null;
          }
          renderStatusDisplay();
          return;
        }
        const clamped = Math.max(0, Math.min(1, progress));
        statusDisplay.progressTarget = clamped;
        if (!Number.isFinite(statusDisplay.progressSmooth)) {
          statusDisplay.progressSmooth = clamped;
          statusDisplay.progress = clamped;
          renderStatusDisplay();
        }
        if (!statusDisplay.progressFrame) {
          statusDisplay.progressFrame = window.requestAnimationFrame(stepSmoothProgress);
        }
      }

      function createChunkReporter(label) {
        return (payload = {}) => {
          if (statusDisplay.loading) {
            const total = Number.isFinite(payload.total)
              ? payload.total
              : (Number.isFinite(payload.totalBytes) ? payload.totalBytes : 0);
            const current = Number.isFinite(payload.current)
              ? payload.current
              : (Number.isFinite(payload.receivedBytes) ? payload.receivedBytes : 0);
            if (total > 0 && current >= 0) {
              setLoadingProgress(current / total);
            }
          }
        };
      }

      function updateThemeToggleState(theme) {
        if (!selectors.themeToggleBtn) {
          return;
        }
        const isDark = theme === 'dark';
        selectors.themeToggleBtn.setAttribute('aria-pressed', String(isDark));
        setDatasetValue(selectors.themeToggleBtn, 'theme', theme);
        selectors.themeToggleBtn.title = `${TEXT.theme.toggle} (Ctrl+Shift+L)`;
      }

      function parseColorValue(value) {
        if (!value) {
          return null;
        }
        const trimmed = value.trim();
        if (trimmed.startsWith('#')) {
          const hex = trimmed.slice(1);
          if (hex.length === 3) {
            const r = parseInt(hex[0] + hex[0], 16);
            const g = parseInt(hex[1] + hex[1], 16);
            const b = parseInt(hex[2] + hex[2], 16);
            return { r, g, b };
          }
          if (hex.length === 6) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            if ([r, g, b].every((component) => Number.isFinite(component))) {
              return { r, g, b };
            }
          }
          return null;
        }
        const rgbMatch = trimmed.match(/rgba?\(([^)]+)\)/i);
        if (rgbMatch) {
          const parts = rgbMatch[1].split(',').map((part) => Number.parseFloat(part.trim()));
          if (parts.length >= 3 && parts.slice(0, 3).every((component) => Number.isFinite(component))) {
            return { r: parts[0], g: parts[1], b: parts[2] };
          }
        }
        return null;
      }

      function computeLuminance(rgb) {
        if (!rgb) {
          return null;
        }
        const normalize = (channel) => {
          const c = channel / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };
        const r = normalize(rgb.r);
        const g = normalize(rgb.g);
        const b = normalize(rgb.b);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }

      function checkKpiContrast() {
        const rootStyles = getComputedStyle(document.body);
        const surface = parseColorValue(rootStyles.getPropertyValue('--color-surface'));
        const text = parseColorValue(rootStyles.getPropertyValue('--color-text'));
        const surfaceLum = computeLuminance(surface);
        const textLum = computeLuminance(text);
        if (surfaceLum == null || textLum == null) {
          dashboardState.contrastWarning = false;
          return;
        }
        const lighter = Math.max(surfaceLum, textLum);
        const darker = Math.min(surfaceLum, textLum);
        const ratio = (lighter + 0.05) / (darker + 0.05);
        if (ratio < 4.5) {
          dashboardState.contrastWarning = true;
          const existingMessage = statusDisplay.note || '';
          if (existingMessage && existingMessage !== TEXT.theme.contrastWarning) {
            const combined = existingMessage.includes(TEXT.theme.contrastWarning)
              ? existingMessage
              : `${existingMessage} ${TEXT.theme.contrastWarning}`;
            showStatusNote(combined, 'warning');
          } else {
            showStatusNote(TEXT.theme.contrastWarning, 'warning');
          }
        } else if (dashboardState.contrastWarning) {
          dashboardState.contrastWarning = false;
          if (statusDisplay.note) {
            const cleaned = statusDisplay.note.replace(TEXT.theme.contrastWarning, '').trim();
            statusDisplay.note = cleaned;
            renderStatusDisplay();
          }
        }
      }

      function applyTheme(theme, { persist = false } = {}) {
        const normalized = theme === 'dark' ? 'dark' : 'light';
        const targets = [document.documentElement, document.body].filter(Boolean);
        targets.forEach((el) => {
          el.setAttribute('data-theme', normalized);
        });
        dashboardState.theme = normalized;
        updateThemeToggleState(normalized);
        if (persist) {
          try {
            localStorage.setItem(THEME_STORAGE_KEY, normalized);
          } catch (error) {
            console.warn('Nepavyko išsaugoti temos nustatymo:', error);
          }
        }
        if (typeof window !== 'undefined') {
          window.ED_DASHBOARD_THEME = normalized;
        }
        checkKpiContrast();
      }

      function initializeTheme() {
        const attributeTheme = (() => {
          const htmlTheme = document.documentElement.getAttribute('data-theme');
          const bodyTheme = document.body ? document.body.getAttribute('data-theme') : null;
          const candidate = htmlTheme || bodyTheme;
          return candidate === 'dark' || candidate === 'light' ? candidate : null;
        })();

        let storedTheme = null;
        try {
          storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        } catch (error) {
          storedTheme = null;
        }

        const windowTheme = typeof window !== 'undefined' ? window.ED_DASHBOARD_THEME : null;
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const resolvedTheme = attributeTheme
          || (windowTheme === 'dark' || windowTheme === 'light'
            ? windowTheme
            : storedTheme === 'dark' || storedTheme === 'light'
              ? storedTheme
              : prefersDark
                ? 'dark'
                : 'light');

        applyTheme(resolvedTheme, { persist: false });
      }

      function toggleTheme() {
        const nextTheme = dashboardState.theme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme, { persist: true });
        rerenderChartsForTheme();
      }

      function setStatus(type, details = '') {
        if (type === 'loading') {
          statusDisplay.base = '';
          statusDisplay.note = '';
          statusDisplay.tone = 'info';
          statusDisplay.loading = true;
          statusDisplay.progress = null;
          statusDisplay.progressSmooth = null;
          statusDisplay.progressTarget = null;
          if (statusDisplay.progressFrame) {
            window.cancelAnimationFrame(statusDisplay.progressFrame);
            statusDisplay.progressFrame = null;
          }
          renderStatusDisplay();
          return;
        }

        statusDisplay.loading = false;
        statusDisplay.progress = null;
        statusDisplay.progressSmooth = null;
        statusDisplay.progressTarget = null;
        if (statusDisplay.progressFrame) {
          window.cancelAnimationFrame(statusDisplay.progressFrame);
          statusDisplay.progressFrame = null;
        }
        if (type === 'error') {
          const message = details ? TEXT.status.errorDetails(details) : TEXT.status.error;
          statusDisplay.base = message;
          statusDisplay.note = TEXT.status.errorAdvice;
          statusDisplay.tone = 'error';
          renderStatusDisplay();
          return;
        }

        const formatted = statusTimeFormatter.format(new Date());
        if (dashboardState.usingFallback) {
          statusDisplay.base = TEXT.status.fallbackSuccess(formatted);
          statusDisplay.tone = 'warning';
          const warningsList = Array.isArray(dashboardState.dataMeta?.warnings)
            ? dashboardState.dataMeta.warnings.filter((item) => typeof item === 'string' && item.trim().length > 0)
            : [];
          const fallbackNote = dashboardState.lastErrorMessage
            ? TEXT.status.fallbackNote(dashboardState.lastErrorMessage)
            : TEXT.status.fallbackNote(TEXT.status.error);
          const combinedNote = warningsList.length
            ? `${fallbackNote} ${warningsList.join(' ')}`.trim()
            : fallbackNote;
          statusDisplay.note = combinedNote;
          renderStatusDisplay();
        } else {
          statusDisplay.base = '';
          statusDisplay.tone = 'info';
          const warningsList = Array.isArray(dashboardState.dataMeta?.warnings)
            ? dashboardState.dataMeta.warnings.filter((item) => typeof item === 'string' && item.trim().length > 0)
            : [];
          if (warningsList.length) {
            statusDisplay.note = warningsList.join(' ');
            statusDisplay.tone = 'warning';
            renderStatusDisplay();
          } else {
            statusDisplay.note = '';
            renderStatusDisplay();
          }
        }
      }

      function applyFeedbackStatusNote() {
        if (dashboardState.usingFallback || !settings.output.showFeedback) {
          return;
        }
        if (dashboardState.feedback.usingFallback) {
          const reason = dashboardState.feedback.lastErrorMessage || TEXT.status.error;
          showStatusNote(TEXT.feedback.status.fallback(reason), 'warning');
          return;
        }
        if (dashboardState.feedback.lastErrorMessage) {
          showStatusNote(TEXT.feedback.status.error(dashboardState.feedback.lastErrorMessage), 'warning');
        }
      }

      // CSV diagnostika, atsisiuntimas ir klaidų aprašymas perkelti į runtime/network.js.

      const { fetchData, runKpiWorkerJob } = createMainDataHandlers({
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
        formatLocalDateKey,
        computeDailyStats,
        filterDailyStatsByWindow,
        matchesSharedPatientFilters,
        describeError,
        showKpiSkeleton,
        renderKpis,
        renderLastShiftHourlyChartWithTheme: (seriesInfo) => chartRenderers.renderLastShiftHourlyChartWithTheme(seriesInfo),
        setChartCardMessage,
        getSettings: () => settings,
        runKpiWorkerJob: (...args) => runKpiWorkerJob(...args),
        buildLastShiftSummary,
        toSentenceCase,
      });

      const {
        refreshKpiWindowOptions,
        syncKpiFilterControls,
        handleKpiFilterInput,
        handleKpiDateInput,
        handleKpiDateClear,
        handleKpiSegmentedClick,
        handleLastShiftMetricClick,
        syncLastShiftHourlyMetricButtons,
        resetKpiFilters,
        applyKpiFiltersAndRender,
        updateKpiSummary,
        updateKpiSubtitle,
      } = kpiFlow;


      function toDateKeyFromDate(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
          return '';
        }
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }

      function toMonthKeyFromDate(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
          return '';
        }
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
      }

      function normalizeHourToMinutes(hour) {
        const raw = Number(hour);
        if (!Number.isFinite(raw)) {
          return null;
        }
        const dayMinutes = 24 * 60;
        const minutes = Math.round(raw * 60);
        return ((minutes % dayMinutes) + dayMinutes) % dayMinutes;
      }

      function resolveNightBoundsMinutes(calculationSettings = {}) {
        const defaultStart = Number.isFinite(Number(DEFAULT_SETTINGS?.calculations?.nightStartHour))
          ? Number(DEFAULT_SETTINGS.calculations.nightStartHour)
          : 20;
        const defaultEnd = Number.isFinite(Number(DEFAULT_SETTINGS?.calculations?.nightEndHour))
          ? Number(DEFAULT_SETTINGS.calculations.nightEndHour)
          : 7;
        const startMinutes = normalizeHourToMinutes(
          Number.isFinite(Number(calculationSettings?.nightStartHour))
            ? Number(calculationSettings.nightStartHour)
            : defaultStart
        );
        const endMinutes = normalizeHourToMinutes(
          Number.isFinite(Number(calculationSettings?.nightEndHour))
            ? Number(calculationSettings.nightEndHour)
            : defaultEnd
        );
        return {
          startMinutes: Number.isFinite(startMinutes) ? startMinutes : normalizeHourToMinutes(defaultStart),
          endMinutes: Number.isFinite(endMinutes) ? endMinutes : normalizeHourToMinutes(defaultEnd),
        };
      }

      function isNightTimestamp(date, nightStartMinutes, nightEndMinutes) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
          return null;
        }
        const minutes = date.getHours() * 60 + date.getMinutes();
        if (!Number.isFinite(nightStartMinutes) || !Number.isFinite(nightEndMinutes)) {
          return null;
        }
        if (nightStartMinutes === nightEndMinutes) {
          return false;
        }
        if (nightStartMinutes < nightEndMinutes) {
          return minutes >= nightStartMinutes && minutes < nightEndMinutes;
        }
        return minutes >= nightStartMinutes || minutes < nightEndMinutes;
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

      function formatUtcDateKey(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
          return '';
        }
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }

      function isWeekendDateKey(dateKey) {
        const date = dateKeyToDate(dateKey);
        if (!(date instanceof Date)) {
          return false;
        }
        const day = date.getUTCDay();
        return day === 0 || day === 6;
      }

      function getWeekdayIndexFromDateKey(dateKey) {
        const date = dateKeyToDate(dateKey);
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
          return null;
        }
        const weekday = date.getUTCDay();
        return (weekday + 6) % 7;
      }


      /**
       * CSV duomenų užkrovimas iš Google Sheets (ar kito šaltinio).
       */
      function rerenderChartsForTheme() {
        const feedbackMonthly = Array.isArray(dashboardState.feedback?.monthly)
          ? dashboardState.feedback.monthly
          : [];
        renderFeedbackTrendChart(feedbackMonthly).catch((error) => {
          const errorInfo = describeError(error, { code: 'FEEDBACK_TREND_THEME', message: 'Nepavyko perpiešti atsiliepimų trendo grafiko pakeitus temą' });
          console.error(errorInfo.log, error);
        });
        const edData = dashboardState.ed || {};
        const edSummary = edData.summary || createEmptyEdSummary(edData.meta?.type);
        const edMode = typeof edSummary?.mode === 'string' ? edSummary.mode : (edData.meta?.type || 'legacy');
        const edHasSnapshot = Number.isFinite(edSummary?.currentPatients)
          || Number.isFinite(edSummary?.occupiedBeds)
          || Number.isFinite(edSummary?.nursePatientsPerStaff)
          || Number.isFinite(edSummary?.doctorPatientsPerStaff);
        const edVariant = edMode === 'snapshot'
          || (edMode === 'hybrid' && edHasSnapshot)
          ? 'snapshot'
          : 'legacy';
        const edDispositionsText = TEXT.ed.dispositions?.[edVariant] || TEXT.ed.dispositions?.legacy || {};
        renderEdDispositionsChart(
          Array.isArray(edData.dispositions) ? edData.dispositions : [],
          edDispositionsText,
          edVariant,
        ).catch((error) => {
          const errorInfo = describeError(error, { code: 'ED_DISPOSITIONS_THEME', message: 'Nepavyko perpiešti pacientų kategorijų grafiko pakeitus temą' });
          console.error(errorInfo.log, error);
        });
        if (dashboardState.kpi?.lastShiftHourly) {
          chartRenderers.renderLastShiftHourlyChartWithTheme(dashboardState.kpi.lastShiftHourly).catch((error) => {
            const errorInfo = describeError(error, { code: 'LAST_SHIFT_THEME', message: 'Nepavyko perpiešti paskutinės pamainos grafiko pakeitus temą' });
            console.error(errorInfo.log, error);
          });
        }
        const hasAnyData = (dashboardState.chartData.dailyWindow && dashboardState.chartData.dailyWindow.length)
          || dashboardState.chartData.funnel
          || (dashboardState.chartData.heatmap && Object.keys(dashboardState.chartData.heatmap).length);
        if (!hasAnyData) {
          checkKpiContrast();
          return;
        }
        renderCharts(dashboardState.chartData.dailyWindow, dashboardState.chartData.funnel, dashboardState.chartData.heatmap)
          .catch((error) => {
            const errorInfo = describeError(error, { code: 'CHARTS_THEME', message: 'Nepavyko perpiešti grafikų pakeitus temą' });
            console.error(errorInfo.log, error);
            showChartError(TEXT.charts?.errorLoading);
          });
      }

      /**
       * Sugeneruoja paskutinių 7 dienų lentelę (naujausi įrašai viršuje).
       * @param {ReturnType<typeof computeDailyStats>} recentDailyStats
       */
      function formatValueWithShare(value, total) {
        const count = Number.isFinite(value) ? value : 0;
        const base = Number.isFinite(total) && total > 0 ? total : 0;
        const share = base > 0 ? count / base : 0;
        const shareText = percentFormatter.format(share);
        return `${numberFormatter.format(count)} <span class="table-percent">(${shareText})</span>`;
      }

      function formatSignedNumber(value) {
        if (!Number.isFinite(value)) {
          return '—';
        }
        if (value === 0) {
          return numberFormatter.format(0);
        }
        const formatted = numberFormatter.format(Math.abs(value));
        return `${value > 0 ? '+' : '−'}${formatted}`;
      }

      function formatSignedPercent(value) {
        if (!Number.isFinite(value)) {
          return '—';
        }
        if (value === 0) {
          return percentFormatter.format(0);
        }
        const formatted = percentFormatter.format(Math.abs(value));
        return `${value > 0 ? '+' : '−'}${formatted}`;
      }

      function createTrendChangeCell(diff, percentChange, maxAbsDiff, canCompare = true, variant = 'yearly') {
        const prefix = variant === 'monthly' ? 'monthly' : 'yearly';
        if (!canCompare || !Number.isFinite(diff)) {
          const unavailableText = (variant === 'monthly'
            ? TEXT.monthly?.comparisonUnavailable
            : TEXT.yearly?.comparisonUnavailable)
            || TEXT.yearly?.comparisonUnavailable
            || 'Nepakanka duomenų palyginimui.';
          return `
            <span class="${prefix}-trend__placeholder" aria-hidden="true">—</span>
            <span class="sr-only">${unavailableText}</span>
          `;
        }
        const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral';
        const absDiff = Math.abs(diff);
        const normalized = maxAbsDiff > 0 ? (absDiff / maxAbsDiff) * 100 : 0;
        const width = direction === 'neutral'
          ? 0
          : Math.min(100, Math.max(8, Math.round(normalized)));
        const diffText = formatSignedNumber(diff);
        const percentText = Number.isFinite(percentChange) ? formatSignedPercent(percentChange) : '—';
        const ariaLabel = direction === 'neutral'
          ? 'Pokytis nepakito (0 pacientų).'
          : `Pokytis ${direction === 'up' ? 'padidėjo' : 'sumažėjo'} ${numberFormatter.format(absDiff)} pacientais${Number.isFinite(percentChange) ? ` (${percentText})` : ''}.`;
        return `
          <div class="${prefix}-trend" role="img" aria-label="${ariaLabel}">
            <div class="${prefix}-trend__bar-wrapper" aria-hidden="true">
              <div class="${prefix}-trend__bar ${prefix}-trend__bar--${direction}" style="width: ${width}%;"></div>
            </div>
            <div class="${prefix}-trend__values">
              <span class="${prefix}-trend__diff ${prefix}-trend__diff--${direction}">${diffText}</span>
              <span class="${prefix}-trend__percent">${percentText}</span>
            </div>
          </div>
        `;
      }

      function createYearlyChangeCell(diff, percentChange, maxAbsDiff, canCompare = true) {
        return createTrendChangeCell(diff, percentChange, maxAbsDiff, canCompare, 'yearly');
      }

      function createMonthlyChangeCell(diff, percentChange, maxAbsDiff, canCompare = true) {
        return createTrendChangeCell(diff, percentChange, maxAbsDiff, canCompare, 'monthly');
      }

      function extractCompareMetricsFromRow(row) {
        const compareId = getDatasetValue(row, 'compareId');
        if (!row || !compareId) {
          return null;
        }
        const label = getDatasetValue(row, 'compareLabel') || row.cells?.[0]?.textContent?.trim() || compareId;
        const sortKey = getDatasetValue(row, 'compareSort') || label;
        const total = Number.parseFloat(getDatasetValue(row, 'total', '0'));
        const avgStay = Number.parseFloat(getDatasetValue(row, 'avgStay', '0'));
        const emsShare = Number.parseFloat(getDatasetValue(row, 'emsShare', '0'));
        const hospShare = Number.parseFloat(getDatasetValue(row, 'hospShare', '0'));
        return {
          id: compareId,
          group: getDatasetValue(row, 'compareGroup', 'unknown'),
          label,
          sortKey,
          total: Number.isFinite(total) ? total : 0,
          avgStay: Number.isFinite(avgStay) ? avgStay : 0,
          emsShare: Number.isFinite(emsShare) ? emsShare : 0,
          hospShare: Number.isFinite(hospShare) ? hospShare : 0,
        };
      }

      function buildMonthlySparkline(series, highlights = []) {
        const rawEntries = Array.isArray(series) ? series : [];
        const normalized = rawEntries.map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }
          const keyCandidates = [
            typeof entry.month === 'string' ? entry.month : '',
            typeof entry.sortKey === 'string' ? entry.sortKey : '',
            typeof entry.key === 'string' ? entry.key : '',
            typeof entry.id === 'string' ? entry.id : '',
          ];
          const monthKey = keyCandidates
            .map((candidate) => (typeof candidate === 'string' ? candidate.replace(/^monthly-/, '') : ''))
            .find((candidate) => candidate);
          const valueCandidates = [
            Number.isFinite(entry.count) ? entry.count : Number.NaN,
            Number.isFinite(entry.total) ? entry.total : Number.NaN,
            Number.isFinite(entry.value) ? entry.value : Number.NaN,
          ];
          const rawValue = valueCandidates.find((candidate) => Number.isFinite(candidate));
          if (!monthKey || !Number.isFinite(rawValue)) {
            return null;
          }
          const label = typeof entry.label === 'string' && entry.label.trim()
            ? entry.label.trim()
            : formatMonthLabel(monthKey);
          return {
            month: monthKey,
            value: Math.max(0, rawValue),
            label,
          };
        }).filter(Boolean);
        if (!normalized.length) {
          return `<p class="compare-monthly__empty">${TEXT.compare.sparklineFallback}</p>`;
        }
        const seen = new Set();
        const unique = [];
        normalized.forEach((item) => {
          if (seen.has(item.month)) {
            return;
          }
          seen.add(item.month);
          unique.push(item);
        });
        const highlightKeys = Array.isArray(highlights)
          ? highlights
            .map((key) => (typeof key === 'string' ? key.replace(/^monthly-/, '') : ''))
            .filter(Boolean)
          : [];
        const compareEntries = highlightKeys
          .map((key) => unique.find((item) => item.month === key))
          .filter(Boolean)
          .slice(0, 2);
        if (compareEntries.length < 2) {
          return `<p class="compare-monthly__empty">${TEXT.compare.sparklineFallback}</p>`;
        }
        const styleTarget = document.body || document.documentElement;
        const computedStyles = getComputedStyle(styleTarget);
        const baseColor = computedStyles.getPropertyValue('--color-accent-soft').trim() || 'rgba(37, 99, 235, 0.2)';
        const highlightColor = computedStyles.getPropertyValue('--color-accent').trim() || '#2563eb';
        const axisColor = computedStyles.getPropertyValue('--color-text-muted').trim() || '#475569';
        const height = 120;
        const baseline = height - 36;
        const barWidth = 56;
        const gap = 32;
        const width = compareEntries.length * barWidth + (compareEntries.length + 1) * gap;
        const maxValue = compareEntries.reduce((max, entry) => Math.max(max, entry.value), 0);
        if (!Number.isFinite(maxValue) || maxValue < 0) {
          return `<p class="compare-monthly__empty">${TEXT.compare.sparklineFallback}</p>`;
        }
        const labelY = height - 12;
        const bars = compareEntries.map((entry, index) => {
          const ratio = maxValue > 0 ? entry.value / maxValue : 0;
          const barHeight = maxValue > 0 ? Math.round(ratio * (height - 52)) : 0;
          const x = gap + index * (barWidth + gap);
          const y = baseline - barHeight;
          const centerX = x + barWidth / 2;
          const fillColor = index === compareEntries.length - 1 ? highlightColor : baseColor || highlightColor;
          const titleValue = numberFormatter.format(Math.round(entry.value));
          const valueY = barHeight > 18 ? y - 6 : baseline + 16;
          const showValue = Number.isFinite(entry.value);
          return `
            <g aria-hidden="true">
              <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="6" fill="${fillColor}" opacity="${index === compareEntries.length - 1 ? 1 : 0.85}">
                <title>${entry.label}: ${titleValue}</title>
              </rect>
              ${showValue ? `<text x="${centerX}" y="${Math.max(20, valueY)}" text-anchor="middle" fill="${axisColor}" font-size="12" font-weight="600">${titleValue}</text>` : ''}
              <text x="${centerX}" y="${labelY}" text-anchor="middle" fill="${axisColor}" font-size="12">${entry.label}</text>
            </g>
          `;
        }).join('');
        const previousEntry = compareEntries[0];
        const currentEntry = compareEntries[compareEntries.length - 1];
        const diffValue = currentEntry.value - previousEntry.value;
        let diffDescription = 'Pokyčių nėra';
        if (Math.abs(diffValue) >= 0.5) {
          const sign = diffValue > 0 ? '+' : '−';
          diffDescription = `Pokytis ${sign}${numberFormatter.format(Math.round(Math.abs(diffValue)))} pacientų`;
        }
        const ariaLabel = TEXT.compare.sparklineAria(currentEntry.label, previousEntry.label, diffDescription);
        const escapeAttr = (value) => String(value).replace(/"/g, '&quot;');
        return `
          <svg class="compare-monthly__chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(ariaLabel)}" focusable="false">
            <g aria-hidden="true">
              <line x1="0" y1="${baseline}" x2="${width}" y2="${baseline}" stroke="${axisColor}" stroke-width="1" stroke-linecap="round" opacity="0.35"></line>
              ${bars}
            </g>
          </svg>
        `;
      }

      function renderMonthlyComparison(newer, older) {
        const monthlyEntries = Array.isArray(dashboardState?.monthly?.all)
          ? dashboardState.monthly.all.filter((item) => item && typeof item === 'object')
          : [];
        const parseSortKey = (item) => {
          const sortKey = typeof item?.sortKey === 'string' ? item.sortKey : '';
          const match = sortKey.match(/^(\d{4})-(\d{2})$/);
          if (!match) {
            return { key: sortKey, year: Number.NaN, month: Number.NaN };
          }
          return {
            key: sortKey,
            year: Number.parseInt(match[1], 10),
            month: Number.parseInt(match[2], 10),
          };
        };
        const createDiffText = (value, formatter, unit = '') => {
          if (!Number.isFinite(value) || Math.abs(value) < 0.0001) {
            return 'pokyčių nėra';
          }
          const sign = value > 0 ? '+' : '−';
          return `${sign}${formatter(Math.abs(value))}${unit}`;
        };
        const formatPercentChange = (current, previous) => {
          if (!Number.isFinite(current) || !Number.isFinite(previous) || Math.abs(previous) < 0.0001) {
            return '';
          }
          const raw = ((current - previous) / Math.abs(previous)) * 100;
          if (Math.abs(raw) < 0.0001) {
            return '';
          }
          const sign = raw > 0 ? '+' : '−';
          return `${sign}${oneDecimalFormatter.format(Math.abs(raw))}%`;
        };
        const newerMeta = parseSortKey(newer);
        const olderMeta = parseSortKey(older);
        const newerLabel = newer?.label || formatMonthLabel(newerMeta.key || '');
        const olderLabel = older?.label || formatMonthLabel(olderMeta.key || '');
        const descriptionParts = [`${newerLabel} palyginta su ${olderLabel}`];
        if (Number.isFinite(newerMeta.year) && Number.isFinite(olderMeta.year) && newerMeta.year !== olderMeta.year) {
          descriptionParts.push('tas pats mėnuo prieš metus');
        }
        const totalDiff = newer.total - older.total;
        const avgStayDiff = newer.avgStay - older.avgStay;
        const emsShareDiff = (newer.emsShare - older.emsShare) * 100;
        const hospShareDiff = (newer.hospShare - older.hospShare) * 100;
        const metrics = [
          {
            label: TEXT.compare.metrics.total,
            newValue: numberFormatter.format(newer.total),
            previousValue: numberFormatter.format(older.total),
            diffText: createDiffText(totalDiff, (val) => numberFormatter.format(Math.round(val))),
            percentText: formatPercentChange(newer.total, older.total),
          },
          {
            label: TEXT.compare.metrics.avgStay,
            newValue: `${decimalFormatter.format(newer.avgStay)} val.`,
            previousValue: `${decimalFormatter.format(older.avgStay)} val.`,
            diffText: createDiffText(avgStayDiff, (val) => decimalFormatter.format(val), ' val.'),
            percentText: formatPercentChange(newer.avgStay, older.avgStay),
          },
          {
            label: TEXT.compare.metrics.emsShare,
            newValue: percentFormatter.format(newer.emsShare),
            previousValue: percentFormatter.format(older.emsShare),
            diffText: createDiffText(emsShareDiff, (val) => oneDecimalFormatter.format(val), ' p. p.'),
            percentText: formatPercentChange(newer.emsShare, older.emsShare),
          },
          {
            label: TEXT.compare.metrics.hospShare,
            newValue: percentFormatter.format(newer.hospShare),
            previousValue: percentFormatter.format(older.hospShare),
            diffText: createDiffText(hospShareDiff, (val) => oneDecimalFormatter.format(val), ' p. p.'),
            percentText: formatPercentChange(newer.hospShare, older.hospShare),
          },
        ];
        let yoyBlock = '';
        if (Number.isFinite(newerMeta.year) && Number.isFinite(newerMeta.month)) {
          const previousYearKey = `${String(newerMeta.year - 1).padStart(4, '0')}-${String(newerMeta.month).padStart(2, '0')}`;
          const contextEntry = monthlyEntries.find((entry) => entry?.month === previousYearKey);
          if (contextEntry) {
            const contextCount = Number.isFinite(contextEntry.count) ? contextEntry.count : 0;
            const yoyDiff = newer.total - contextCount;
            const yoyDiffText = createDiffText(yoyDiff, (val) => numberFormatter.format(Math.round(val)));
            const yoyPercentText = formatPercentChange(newer.total, contextCount);
            const monthLabel = formatMonthLabel(previousYearKey);
            const details = [yoyDiffText];
            if (yoyPercentText) {
              details.push(`(${yoyPercentText})`);
            }
            yoyBlock = `
              <p class="compare-summary__hint">
                Metai-metams: ${details.join(' ')}
                <span>vs ${monthLabel} – tas pats mėnuo prieš metus</span>
              </p>
            `;
          }
        }
        const metricsHtml = metrics.map((metric) => `
          <div class="compare-summary__metric">
            <span class="compare-summary__metric-label">${metric.label}</span>
            <strong class="compare-summary__metric-value">${metric.newValue}</strong>
            <span class="compare-summary__metric-prev">vs ${metric.previousValue}</span>
            <span class="compare-summary__metric-diff">Δ ${metric.diffText}${metric.percentText ? ` (${metric.percentText})` : ''}</span>
          </div>
        `).join('');
        const description = descriptionParts.join(' – ');
        const highlightKeys = [older?.sortKey, newer?.sortKey].filter(Boolean);
        const sparklineHtml = buildMonthlySparkline(dashboardState.monthly.window, highlightKeys);
        return `
          <div class="compare-summary__monthly">
            <div class="compare-monthly">
              <div class="compare-monthly__stats">
                <p class="compare-summary__description">${description}</p>
                <div class="compare-summary__metrics">${metricsHtml}</div>
                ${yoyBlock}
              </div>
              <div class="compare-monthly__sparkline">
                <strong class="compare-monthly__sparkline-title">${TEXT.compare.sparklineTitle}</strong>
                ${sparklineHtml}
              </div>
            </div>
          </div>
        `;
      }

      function updateCompareSummary() {
        if (!selectors.compareSummary) {
          return;
        }
        if (!dashboardState.compare.active) {
          selectors.compareSummary.textContent = TEXT.compare.prompt;
          return;
        }
        const selections = dashboardState.compare.selections;
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
        if (selections.every((item) => item.group === 'monthly')) {
          selectors.compareSummary.innerHTML = `
            <strong>${summaryTitle}</strong>
            ${renderMonthlyComparison(newer, older)}
          `;
          return;
        }
        const totalDiff = newer.total - older.total;
        const avgStayDiff = newer.avgStay - older.avgStay;
        const emsShareDiff = (newer.emsShare - older.emsShare) * 100;
        const hospShareDiff = (newer.hospShare - older.hospShare) * 100;
        const diffToText = (value, formatter, unit = '') => {
          if (Math.abs(value) < 0.0001) {
            return 'pokyčių nėra';
          }
          const sign = value > 0 ? '+' : '−';
          return `${sign}${formatter(Math.abs(value))}${unit}`;
        };
        const totalDiffText = diffToText(totalDiff, (val) => numberFormatter.format(Math.round(val)));
        const avgDiffText = diffToText(avgStayDiff, (val) => decimalFormatter.format(val), ' val.');
        const emsDiffText = diffToText(emsShareDiff, (val) => oneDecimalFormatter.format(val), ' p. p.');
        const hospDiffText = diffToText(hospShareDiff, (val) => oneDecimalFormatter.format(val), ' p. p.');
        selectors.compareSummary.innerHTML = `
          <strong>${summaryTitle}</strong>
          <ul>
            <li><strong>${TEXT.compare.metrics.total}:</strong> ${numberFormatter.format(newer.total)} vs ${numberFormatter.format(older.total)} (Δ ${totalDiffText})</li>
            <li><strong>${TEXT.compare.metrics.avgStay}:</strong> ${decimalFormatter.format(newer.avgStay)} vs ${decimalFormatter.format(older.avgStay)} (Δ ${avgDiffText})</li>
            <li><strong>${TEXT.compare.metrics.emsShare}:</strong> ${percentFormatter.format(newer.emsShare)} vs ${percentFormatter.format(older.emsShare)} (Δ ${emsDiffText})</li>
            <li><strong>${TEXT.compare.metrics.hospShare}:</strong> ${percentFormatter.format(newer.hospShare)} vs ${percentFormatter.format(older.hospShare)} (Δ ${hospDiffText})</li>
          </ul>
        `;
      }

      function syncCompareActivation() {
        const active = dashboardState.compare.active;
        const rows = [];
        if (selectors.recentTable) {
          rows.push(...selectors.recentTable.querySelectorAll('tr[data-compare-id]'));
        }
        if (selectors.monthlyTable) {
          rows.push(...selectors.monthlyTable.querySelectorAll('tr[data-compare-id]'));
        }
        if (selectors.yearlyTable) {
          rows.push(...selectors.yearlyTable.querySelectorAll('tr[data-compare-id]'));
        }
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

      function renderRecentTable(recentDailyStats) {
        selectors.recentTable.replaceChildren();
        if (!recentDailyStats.length) {
          const row = document.createElement('tr');
          const cell = document.createElement('td');
          cell.colSpan = 7;
          cell.textContent = TEXT.recent.empty;
          row.appendChild(cell);
          selectors.recentTable.appendChild(row);
          syncCompareActivation();
          return;
        }

        const sorted = [...recentDailyStats].sort((a, b) => (a.date > b.date ? -1 : 1));
        const daysCount = sorted.length;
        const totals = sorted.reduce((acc, entry) => {
          const total = Number.isFinite(entry?.count) ? entry.count : 0;
          acc.total += total;
          acc.night += Number.isFinite(entry?.night) ? entry.night : 0;
          acc.ems += Number.isFinite(entry?.ems) ? entry.ems : 0;
          acc.hospitalized += Number.isFinite(entry?.hospitalized) ? entry.hospitalized : 0;
          acc.discharged += Number.isFinite(entry?.discharged) ? entry.discharged : 0;
          acc.totalTime += Number.isFinite(entry?.totalTime) ? entry.totalTime : 0;
          acc.durations += Number.isFinite(entry?.durations) ? entry.durations : 0;
          return acc;
        }, {
          total: 0,
          night: 0,
          ems: 0,
          hospitalized: 0,
          discharged: 0,
          totalTime: 0,
          durations: 0,
        });

        const summaryRow = document.createElement('tr');
        summaryRow.classList.add('table-row--summary');
        const avgTotal = daysCount ? totals.total / daysCount : 0;
        const avgNight = daysCount ? totals.night / daysCount : 0;
        const avgEms = daysCount ? totals.ems / daysCount : 0;
        const avgHosp = daysCount ? totals.hospitalized / daysCount : 0;
        const avgDis = daysCount ? totals.discharged / daysCount : 0;
        const avgStay = totals.durations ? totals.totalTime / totals.durations : 0;
        summaryRow.innerHTML = `
          <td>7 d. vidurkis</td>
          <td>${numberFormatter.format(avgTotal)}</td>
          <td>${decimalFormatter.format(avgStay)}</td>
          <td>${formatValueWithShare(avgNight, avgTotal)}</td>
          <td>${formatValueWithShare(avgEms, avgTotal)}</td>
          <td>${formatValueWithShare(avgHosp, avgTotal)}</td>
          <td>${formatValueWithShare(avgDis, avgTotal)}</td>
        `;
        selectors.recentTable.appendChild(summaryRow);

        const totalsList = sorted.map((entry) => (Number.isFinite(entry?.count) ? entry.count : 0));
        const staysList = sorted.map((entry) => (entry?.durations ? entry.totalTime / entry.durations : 0));
        const hospShareList = sorted.map((entry) => {
          const total = Number.isFinite(entry?.count) ? entry.count : 0;
          return total > 0 ? entry.hospitalized / total : 0;
        });
          const range = (list) => {
            const values = list.filter((value) => Number.isFinite(value));
            if (!values.length) {
              return { min: 0, max: 0 };
            }
            return { min: Math.min(...values), max: Math.max(...values) };
          };
          const totalsRange = range(totalsList);
          const staysRange = range(staysList);
          const markTotals = totalsRange.max > totalsRange.min;
          const markStays = staysRange.max > staysRange.min;

        sorted.forEach((entry) => {
          const row = document.createElement('tr');
          const dateValue = dateKeyToDate(entry.date);
          const displayDate = dateValue ? dailyDateFormatter.format(dateValue) : entry.date;
          const total = Number.isFinite(entry.count) ? entry.count : 0;
          const avgStayEntry = entry.durations ? entry.totalTime / entry.durations : 0;
          const hospShare = total > 0 ? entry.hospitalized / total : 0;
          const isWeekend = dateValue instanceof Date
            && !Number.isNaN(dateValue.getTime())
            && (dateValue.getUTCDay() === 0 || dateValue.getUTCDay() === 6);
          if (isWeekend) {
            row.classList.add('table-row--weekend');
          }

            const dateCell = document.createElement('td');
            dateCell.textContent = displayDate;
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

            if (markTotals && Number.isFinite(total)) {
              if (total === totalsRange.max) {
                totalCell.classList.add('table-cell--max');
              } else if (total === totalsRange.min) {
                totalCell.classList.add('table-cell--min');
              }
            }
            if (markStays && Number.isFinite(avgStayEntry)) {
              if (avgStayEntry === staysRange.max) {
                stayCell.classList.add('table-cell--max');
              } else if (avgStayEntry === staysRange.min) {
                stayCell.classList.add('table-cell--min');
              }
            }

          row.append(dateCell, totalCell, stayCell, nightCell, emsCell, hospCell, disCell);

          const emsShare = total > 0 ? entry.ems / total : 0;
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
        syncCompareActivation();
      }

      function normalizeChartsHospitalTableSort(value) {
        const normalized = String(value || '').trim();
        if ([
          'total_desc', 'total_asc',
          'name_asc', 'name_desc',
          'lt4_desc', 'lt4_asc',
          '4to8_desc', '4to8_asc',
          '8to16_desc', '8to16_asc',
          'gt16_desc', 'gt16_asc',
          'unclassified_desc', 'unclassified_asc',
        ].includes(normalized)) {
          return normalized;
        }
        return 'total_desc';
      }

      function getChartsHospitalSortParts(sortValue) {
        const normalized = normalizeChartsHospitalTableSort(sortValue);
        const match = normalized.match(/^(name|total|lt4|4to8|8to16|gt16|unclassified)_(asc|desc)$/);
        if (match) {
          return { key: match[1], dir: match[2] };
        }
        return { key: 'total', dir: 'desc' };
      }

      function updateChartsHospitalTableHeaderSortIndicators() {
        if (!selectors.chartsHospitalTableRoot) {
          return;
        }
        const headers = selectors.chartsHospitalTableRoot.querySelectorAll('thead th[data-charts-hospital-sort]');
        const current = getChartsHospitalSortParts(dashboardState.chartsHospitalTableSort);
        headers.forEach((header) => {
          const key = String(header.getAttribute('data-charts-hospital-sort') || '').trim();
          if (!key) {
            return;
          }
          const isActive = key === current.key;
          header.classList.toggle('is-sort-active', isActive);
          header.setAttribute('aria-sort', isActive ? (current.dir === 'asc' ? 'ascending' : 'descending') : 'none');
          const baseLabel = String(header.textContent || '').replace(/\s*[↑↓]$/, '').trim();
          if (isActive) {
            header.textContent = `${baseLabel} ${current.dir === 'asc' ? '↑' : '↓'}`;
          } else {
            header.textContent = baseLabel;
          }
        });
      }

      function normalizeChartsHospitalTableDepartment(value) {
        const normalized = String(value || '').trim();
        return normalized;
      }

      function resetChartsHospitalTableStatsCache() {
        dashboardState.chartsHospitalTableStatsCache = {
          recordsRef: null,
          byYear: new Map(),
        };
      }

      function getChartsHospitalStatsFromWorkerAgg(yearFilter = 'all') {
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
        const yearsToUse = selectedYear === 'all'
          ? yearKeys
          : (yearKeys.includes(selectedYear) ? [selectedYear] : []);
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
            const dst = buckets.get(department);
            const src = yearData[departmentRaw] || {};
            dst.count_lt4 += Number.isFinite(src.count_lt4) ? src.count_lt4 : 0;
            dst.count_4_8 += Number.isFinite(src.count_4_8) ? src.count_4_8 : 0;
            dst.count_8_16 += Number.isFinite(src.count_8_16) ? src.count_8_16 : 0;
            dst.count_gt16 += Number.isFinite(src.count_gt16) ? src.count_gt16 : 0;
            dst.count_unclassified += Number.isFinite(src.count_unclassified) ? src.count_unclassified : 0;
            dst.total += Number.isFinite(src.total) ? src.total : 0;
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
        const totals = rows.reduce((acc, row) => {
          acc.count_lt4 += row.count_lt4;
          acc.count_4_8 += row.count_4_8;
          acc.count_8_16 += row.count_8_16;
          acc.count_gt16 += row.count_gt16;
          acc.count_unclassified += row.count_unclassified;
          acc.total += row.total;
          return acc;
        }, {
          count_lt4: 0,
          count_4_8: 0,
          count_8_16: 0,
          count_gt16: 0,
          count_unclassified: 0,
          total: 0,
        });
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
      }

      function getDepartmentTrendRowsFromWorkerAgg(departmentRaw) {
        const agg = dashboardState.chartsHospitalTableWorkerAgg;
        const byYear = agg?.byYear && typeof agg.byYear === 'object' ? agg.byYear : null;
        if (!byYear) {
          return [];
        }
        const department = String(departmentRaw || '').trim();
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
      }

      function getChartsHospitalTableStats(records, yearFilter = 'all') {
        const fromWorker = getChartsHospitalStatsFromWorkerAgg(yearFilter);
        if (fromWorker) {
          return fromWorker;
        }
        const normalizedYear = yearFilter == null ? 'all' : String(yearFilter);
        const cache = dashboardState.chartsHospitalTableStatsCache;
        const cacheMatches = cache && cache.recordsRef === records && cache.byYear instanceof Map;
        if (!cacheMatches) {
          resetChartsHospitalTableStatsCache();
          dashboardState.chartsHospitalTableStatsCache.recordsRef = records;
        }
        const byYear = dashboardState.chartsHospitalTableStatsCache.byYear;
        if (byYear.has(normalizedYear)) {
          return byYear.get(normalizedYear);
        }
        const computed = computeHospitalizedByDepartmentAndSpsStay(records, {
          yearFilter: normalizedYear,
          calculations: settings?.calculations || DEFAULT_SETTINGS.calculations,
          defaultSettings: DEFAULT_SETTINGS,
        });
        byYear.set(normalizedYear, computed);
        return computed;
      }

      function destroyChartsHospitalDeptTrendChart() {
        const existing = dashboardState.chartsHospitalDeptTrendChart;
        if (existing && typeof existing.destroy === 'function') {
          existing.destroy();
        }
        dashboardState.chartsHospitalDeptTrendChart = null;
        dashboardState.chartsHospitalDeptTrendKey = '';
      }

      async function renderChartsHospitalDepartmentTrend(records = dashboardState.rawRecords) {
        if (!selectors.chartsHospitalDeptTrendCanvas || !selectors.chartsHospitalDeptTrendEmpty) {
          return;
        }
        const department = normalizeChartsHospitalTableDepartment(dashboardState.chartsHospitalTableDepartment);
        if (!department) {
          destroyChartsHospitalDeptTrendChart();
          selectors.chartsHospitalDeptTrendCanvas.hidden = true;
          selectors.chartsHospitalDeptTrendEmpty.hidden = false;
          if (selectors.chartsHospitalDeptTrendSubtitle) {
            selectors.chartsHospitalDeptTrendSubtitle.textContent = TEXT?.charts?.hospitalTable?.trendSubtitle
              || 'Pasirinkite skyrių lentelėje, kad matytumėte jo SPS trukmės % dinamiką pagal metus.';
          }
          return;
        }
        const trend = computeHospitalizedDepartmentYearlyStayTrend(records, {
          department,
          calculations: settings?.calculations || DEFAULT_SETTINGS.calculations,
          defaultSettings: DEFAULT_SETTINGS,
        });
        const workerRows = getDepartmentTrendRowsFromWorkerAgg(department);
        const rows = workerRows.length ? workerRows : (Array.isArray(trend?.rows) ? trend.rows : []);
        if (rows.length < 2) {
          destroyChartsHospitalDeptTrendChart();
          selectors.chartsHospitalDeptTrendCanvas.hidden = true;
          selectors.chartsHospitalDeptTrendEmpty.hidden = false;
          if (selectors.chartsHospitalDeptTrendSubtitle) {
            selectors.chartsHospitalDeptTrendSubtitle.textContent = `${department} • nepakanka metų palyginimui`;
          }
          return;
        }
        const ChartLib = await loadChartJs();
        if (!ChartLib) {
          destroyChartsHospitalDeptTrendChart();
          selectors.chartsHospitalDeptTrendCanvas.hidden = true;
          selectors.chartsHospitalDeptTrendEmpty.hidden = false;
          if (selectors.chartsHospitalDeptTrendSubtitle) {
            selectors.chartsHospitalDeptTrendSubtitle.textContent = `${department} • nepavyko įkelti grafiko bibliotekos`;
          }
          return;
        }
        const trendKey = `${department}|${rows.map((row) => `${row.year}:${row.total}:${row.count_lt4}:${row.count_4_8}:${row.count_8_16}:${row.count_gt16}:${row.count_unclassified}`).join(';')}`;
        if (dashboardState.chartsHospitalDeptTrendChart && dashboardState.chartsHospitalDeptTrendKey === trendKey) {
          selectors.chartsHospitalDeptTrendCanvas.hidden = false;
          selectors.chartsHospitalDeptTrendEmpty.hidden = true;
          return;
        }
        if (selectors.chartsHospitalDeptTrendSubtitle) {
          selectors.chartsHospitalDeptTrendSubtitle.textContent = `${department} • 100% sudėties dinamika pagal metus`;
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
          const sum = values.pct_lt4 + values.pct_4_8 + values.pct_8_16 + values.pct_gt16 + values.pct_unclassified;
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
        destroyChartsHospitalDeptTrendChart();
        const ctx = selectors.chartsHospitalDeptTrendCanvas.getContext('2d');
        dashboardState.chartsHospitalDeptTrendChart = new ChartLib(ctx, {
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
        });
        dashboardState.chartsHospitalDeptTrendKey = trendKey;
        selectors.chartsHospitalDeptTrendCanvas.hidden = false;
        selectors.chartsHospitalDeptTrendEmpty.hidden = true;
      }

      function sortChartsHospitalTableRows(rows, sortKey) {
        const list = Array.isArray(rows) ? rows.slice() : [];
        const normalized = normalizeChartsHospitalTableSort(sortKey);
        const columnSortMap = {
          lt4: 'count_lt4',
          '4to8': 'count_4_8',
          '8to16': 'count_8_16',
          gt16: 'count_gt16',
          unclassified: 'count_unclassified',
        };
        const columnMatch = normalized.match(/^(lt4|4to8|8to16|gt16|unclassified)_(asc|desc)$/);
        list.sort((a, b) => {
          if (columnMatch) {
            const field = columnSortMap[columnMatch[1]];
            const direction = columnMatch[2];
            const valueA = Number(a?.[field] || 0);
            const valueB = Number(b?.[field] || 0);
            if (valueA !== valueB) {
              return direction === 'asc' ? valueA - valueB : valueB - valueA;
            }
            if ((a?.total || 0) !== (b?.total || 0)) {
              return (b?.total || 0) - (a?.total || 0);
            }
            return String(a?.department || '').localeCompare(String(b?.department || ''), 'lt');
          }
          if (normalized === 'name_asc') {
            return String(a?.department || '').localeCompare(String(b?.department || ''), 'lt');
          }
          if (normalized === 'name_desc') {
            return String(b?.department || '').localeCompare(String(a?.department || ''), 'lt');
          }
          if (normalized === 'total_asc') {
            if ((a?.total || 0) !== (b?.total || 0)) {
              return (a?.total || 0) - (b?.total || 0);
            }
            return String(a?.department || '').localeCompare(String(b?.department || ''), 'lt');
          }
          if ((a?.total || 0) !== (b?.total || 0)) {
            return (b?.total || 0) - (a?.total || 0);
          }
          return String(a?.department || '').localeCompare(String(b?.department || ''), 'lt');
        });
        return list;
      }

      function buildHospitalStayCell({ count, pct, unclassified = false }) {
        const normalizedCount = Number.isFinite(count) ? count : 0;
        const normalizedPct = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
        const wrapper = document.createElement('div');
        wrapper.className = unclassified ? 'charts-hospital-cell charts-hospital-cell--unclassified' : 'charts-hospital-cell';
        wrapper.style.setProperty('--cell-intensity', `${Math.max(8, Math.round(normalizedPct * 0.9))}%`);

        const countNode = document.createElement('span');
        countNode.className = 'charts-hospital-cell__count';
        countNode.textContent = numberFormatter.format(normalizedCount);

        const pctNode = document.createElement('span');
        pctNode.className = 'charts-hospital-cell__pct';
        pctNode.textContent = `${oneDecimalFormatter.format(normalizedPct)}%`;

        wrapper.append(countNode, pctNode);
        return wrapper;
      }

      function syncChartsHospitalTableControls() {
        if (selectors.chartsHospitalTableYear) {
          const yearValue = dashboardState.chartsHospitalTableYear;
          selectors.chartsHospitalTableYear.value = String(yearValue ?? 'all');
        }
        if (selectors.chartsHospitalTableSearch) {
          selectors.chartsHospitalTableSearch.value = String(dashboardState.chartsHospitalTableSearch || '');
        }
        updateChartsHospitalTableHeaderSortIndicators();
      }

      function populateChartsHospitalTableYearOptions(records) {
        if (!selectors.chartsHospitalTableYear) {
          return;
        }
        const stats = getChartsHospitalTableStats(records, 'all');
        const years = Array.isArray(stats?.yearOptions) ? stats.yearOptions : [];
        const texts = TEXT?.charts?.hospitalTable || {};
        selectors.chartsHospitalTableYear.replaceChildren();
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = texts.yearFilterAll || 'Visi metai';
        selectors.chartsHospitalTableYear.appendChild(allOption);
        years.forEach((year) => {
          const option = document.createElement('option');
          option.value = String(year);
          option.textContent = `${year} m.`;
          selectors.chartsHospitalTableYear.appendChild(option);
        });

        const selected = dashboardState.chartsHospitalTableYear;
        const selectedNumber = Number.parseInt(String(selected), 10);
        if (selected === 'all' || selected == null) {
          dashboardState.chartsHospitalTableYear = 'all';
        } else if (Number.isFinite(selectedNumber) && years.includes(selectedNumber)) {
          dashboardState.chartsHospitalTableYear = selectedNumber;
        } else {
          dashboardState.chartsHospitalTableYear = 'all';
        }
        syncChartsHospitalTableControls();
      }

      function renderChartsHospitalTable(records = dashboardState.rawRecords) {
        if (!selectors.chartsHospitalTableBody) {
          return;
        }
        const tableText = TEXT?.charts?.hospitalTable || {};
        const yearFilter = dashboardState.chartsHospitalTableYear == null ? 'all' : dashboardState.chartsHospitalTableYear;
        const sortKey = normalizeChartsHospitalTableSort(dashboardState.chartsHospitalTableSort);
        const searchQuery = String(dashboardState.chartsHospitalTableSearch || '').trim().toLocaleLowerCase('lt');
        const stats = getChartsHospitalTableStats(records, yearFilter);
        const filteredRows = (stats?.rows || []).filter((row) => {
          if (!searchQuery) {
            return true;
          }
          return String(row?.department || '').toLocaleLowerCase('lt').includes(searchQuery);
        });
        const rows = sortChartsHospitalTableRows(filteredRows, sortKey);

        selectors.chartsHospitalTableBody.replaceChildren();
        if (!rows.length) {
          const row = document.createElement('tr');
          const cell = document.createElement('td');
          cell.colSpan = 7;
          cell.textContent = tableText.empty || 'Pasirinktam laikotarpiui nėra stacionarizacijų duomenų.';
          row.appendChild(cell);
          selectors.chartsHospitalTableBody.appendChild(row);
          renderChartsHospitalDepartmentTrend(records);
          return;
        }

        rows.forEach((entry) => {
          const row = document.createElement('tr');
          setDatasetValue(row, 'department', String(entry.department || ''));
          if (normalizeChartsHospitalTableDepartment(dashboardState.chartsHospitalTableDepartment) === String(entry.department || '')) {
            row.classList.add('is-department-active');
          }

          const departmentCell = document.createElement('td');
          departmentCell.textContent = entry.department || 'Nenurodyta';

          const lt4Cell = document.createElement('td');
          lt4Cell.appendChild(buildHospitalStayCell({ count: entry.count_lt4, pct: entry.pct_lt4 }));
          const from4To8Cell = document.createElement('td');
          from4To8Cell.appendChild(buildHospitalStayCell({ count: entry.count_4_8, pct: entry.pct_4_8 }));
          const from8To16Cell = document.createElement('td');
          from8To16Cell.appendChild(buildHospitalStayCell({ count: entry.count_8_16, pct: entry.pct_8_16 }));
          const gt16Cell = document.createElement('td');
          gt16Cell.appendChild(buildHospitalStayCell({ count: entry.count_gt16, pct: entry.pct_gt16 }));
          const unclassifiedCell = document.createElement('td');
          unclassifiedCell.appendChild(buildHospitalStayCell({
            count: entry.count_unclassified,
            pct: entry.pct_unclassified,
            unclassified: true,
          }));
          const totalCell = document.createElement('td');
          totalCell.className = 'charts-hospital-total';
          totalCell.textContent = numberFormatter.format(entry.total || 0);

          row.append(
            departmentCell,
            lt4Cell,
            from4To8Cell,
            from8To16Cell,
            gt16Cell,
            unclassifiedCell,
            totalCell,
          );
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
        renderChartsHospitalDepartmentTrend(records);
      }

      function handleChartsHospitalTableYearChange(event) {
        const value = event?.target?.value;
        if (!value || value === 'all') {
          dashboardState.chartsHospitalTableYear = 'all';
        } else {
          const parsed = Number.parseInt(String(value), 10);
          dashboardState.chartsHospitalTableYear = Number.isFinite(parsed) ? parsed : 'all';
        }
        syncChartsHospitalTableControls();
        renderChartsHospitalTable(dashboardState.rawRecords);
      }

      function handleChartsHospitalTableSearchInput(event) {
        dashboardState.chartsHospitalTableSearch = String(event?.target?.value || '');
        syncChartsHospitalTableControls();
        renderChartsHospitalTable(dashboardState.rawRecords);
      }

      function handleChartsHospitalTableRowClick(event) {
        const target = event?.target;
        if (!(target instanceof Element)) {
          return;
        }
        const row = target.closest('tr[data-department]');
        if (!row) {
          return;
        }
        const department = normalizeChartsHospitalTableDepartment(getDatasetValue(row, 'department', ''));
        if (!department) {
          return;
        }
        const current = normalizeChartsHospitalTableDepartment(dashboardState.chartsHospitalTableDepartment);
        dashboardState.chartsHospitalTableDepartment = current === department ? '' : department;
        renderChartsHospitalTable(dashboardState.rawRecords);
      }

      function handleChartsHospitalTableHeaderClick(event) {
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
        const nextDir = current.key === key
          ? (current.dir === 'asc' ? 'desc' : 'asc')
          : (key === 'name' ? 'asc' : 'desc');
        dashboardState.chartsHospitalTableSort = normalizeChartsHospitalTableSort(`${key}_${nextDir}`);
        syncChartsHospitalTableControls();
        renderChartsHospitalTable(dashboardState.rawRecords);
      }

      function formatMonthLabel(monthKey) {
        if (typeof monthKey !== 'string') {
          return '';
        }
        const [yearStr, monthStr] = monthKey.split('-');
        const year = Number.parseInt(yearStr, 10);
        const monthIndex = Number.parseInt(monthStr, 10) - 1;
        if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
          return monthKey;
        }
        return monthFormatter.format(new Date(Date.UTC(year, Math.max(0, monthIndex), 1)));
      }

      function formatYearLabel(yearKey) {
        if (typeof yearKey !== 'string') {
          return '';
        }
        const year = Number.parseInt(yearKey, 10);
        if (!Number.isFinite(year)) {
          return yearKey;
        }
        return `${year} m.`;
      }

      function formatMonthlyYoYComparison(total, previousTotal, canCompare) {
        if (!canCompare || !Number.isFinite(total) || !Number.isFinite(previousTotal) || previousTotal === 0) {
          return '';
        }
        const change = (total - previousTotal) / previousTotal;
        const absText = percentFormatter.format(Math.abs(change));
        const sign = change > 0 ? '+' : (change < 0 ? '−' : '');
        return ` (${sign}${absText})`;
      }

      function renderMonthlyTable(monthlyStats) {
        const scopedMonthly = Array.isArray(monthlyStats) ? monthlyStats : [];
        dashboardState.monthly.window = scopedMonthly;
        if (!selectors.monthlyTable) {
          return;
        }
        selectors.monthlyTable.replaceChildren();
        if (!scopedMonthly.length) {
          const row = document.createElement('tr');
          const cell = document.createElement('td');
          cell.colSpan = 9;
          cell.textContent = TEXT.monthly.empty;
          row.appendChild(cell);
          selectors.monthlyTable.appendChild(row);
          syncCompareActivation();
          return;
        }

        const totals = scopedMonthly.map((entry) => (Number.isFinite(entry?.count) ? entry.count : 0));
        const completeness = scopedMonthly.map((entry) => isCompleteMonthEntry(entry));
        const allMonthly = Array.isArray(dashboardState.monthly?.all) ? dashboardState.monthly.all : [];
        const diffValues = totals.map((total, index) => {
          if (index === 0) {
            return Number.NaN;
          }
          if (!completeness[index] || !completeness[index - 1]) {
            return Number.NaN;
          }
          const previousTotal = totals[index - 1];
          if (!Number.isFinite(previousTotal)) {
            return Number.NaN;
          }
          return total - previousTotal;
        });
        const maxAbsDiff = diffValues.reduce((acc, value) => (Number.isFinite(value)
          ? Math.max(acc, Math.abs(value))
          : acc), 0);

        scopedMonthly.forEach((entry, index) => {
          const row = document.createElement('tr');
          const avgPerDay = entry.dayCount > 0 ? entry.count / entry.dayCount : 0;
          const total = Number.isFinite(entry.count) ? entry.count : 0;
          const previousTotal = index > 0 ? totals[index - 1] : Number.NaN;
          const [yearStr, monthStr] = typeof entry.month === 'string' ? entry.month.split('-') : [];
          const year = Number.parseInt(yearStr, 10);
          const previousYearKey = Number.isFinite(year) && monthStr ? `${year - 1}-${monthStr}` : '';
          const previousYearEntry = previousYearKey
            ? allMonthly.find((item) => item && item.month === previousYearKey)
            : null;
          const previousYearTotal = Number.isFinite(previousYearEntry?.count) ? previousYearEntry.count : Number.NaN;
          const isComplete = completeness[index];
          const previousComplete = index > 0 ? completeness[index - 1] : false;
          const canCompare = isComplete && previousComplete && Number.isFinite(previousTotal);
          const diff = canCompare ? total - previousTotal : Number.NaN;
          const percentChange = canCompare && previousTotal !== 0
            ? diff / previousTotal
            : Number.NaN;
          const previousYearComplete = previousYearEntry ? isCompleteMonthEntry(previousYearEntry) : false;
          const yoyComparison = formatMonthlyYoYComparison(total, previousYearTotal, isComplete && previousYearComplete);
          row.innerHTML = `
            <td>${formatMonthLabel(entry.month)}</td>
            <td>${numberFormatter.format(total)}${yoyComparison}</td>
            <td>${oneDecimalFormatter.format(avgPerDay)}</td>
            <td>${decimalFormatter.format(entry.durations ? entry.totalTime / entry.durations : 0)}</td>
            <td>${formatValueWithShare(entry.night, total)}</td>
            <td>${formatValueWithShare(entry.ems, total)}</td>
            <td>${formatValueWithShare(entry.hospitalized, total)}</td>
            <td>${formatValueWithShare(entry.discharged, total)}</td>
            <td>${createMonthlyChangeCell(diff, percentChange, maxAbsDiff, canCompare)}</td>
          `;
          const avgStay = entry.durations ? entry.totalTime / entry.durations : 0;
          const emsShare = total > 0 ? entry.ems / total : 0;
          const hospShare = total > 0 ? entry.hospitalized / total : 0;
          setDatasetValue(row, 'compareId', `monthly-${entry.month}`);
          setDatasetValue(row, 'compareGroup', 'monthly');
          setDatasetValue(row, 'compareLabel', formatMonthLabel(entry.month));
          setDatasetValue(row, 'compareSort', entry.month);
          setDatasetValue(row, 'total', String(total));
          setDatasetValue(row, 'avgStay', String(avgStay));
          setDatasetValue(row, 'emsShare', String(emsShare));
          setDatasetValue(row, 'hospShare', String(hospShare));
          setDatasetValue(row, 'change', Number.isFinite(diff) ? String(diff) : '');
          setDatasetValue(row, 'changePercent', Number.isFinite(percentChange) ? String(percentChange) : '');
          selectors.monthlyTable.appendChild(row);
        });
        syncCompareActivation();
      }

      function isCompleteMonthEntry(entry) {
        if (!entry) {
          return false;
        }
        const dayCount = Number.isFinite(entry?.dayCount) ? entry.dayCount : 0;
        if (!entry?.month) {
          return dayCount >= 28;
        }
        const [yearStr, monthStr] = entry.month.split('-');
        const year = Number.parseInt(yearStr, 10);
        const monthIndex = Number.parseInt(monthStr, 10) - 1;
        if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
          return dayCount >= 28;
        }
        const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
        const daysInMonth = Number.isFinite(lastDay.getUTCDate()) ? lastDay.getUTCDate() : 30;
        const threshold = Math.max(1, Math.round(daysInMonth * 0.9));
        return dayCount >= threshold;
      }

      function isCompleteYearEntry(entry) {
        if (!entry) {
          return false;
        }
        const monthCount = Number.isFinite(entry?.monthCount) ? entry.monthCount : 0;
        const dayCount = Number.isFinite(entry?.dayCount) ? entry.dayCount : 0;
        return monthCount >= 12 || dayCount >= 360;
      }

      function renderYearlyTable(yearlyStats) {
        if (!selectors.yearlyTable) {
          return;
        }
        selectors.yearlyTable.replaceChildren();
        if (!Array.isArray(yearlyStats) || !yearlyStats.length) {
          const row = document.createElement('tr');
          const cell = document.createElement('td');
          cell.colSpan = 9;
          cell.textContent = TEXT.yearly.empty;
          row.appendChild(cell);
          selectors.yearlyTable.appendChild(row);
          syncCompareActivation();
          return;
        }

        const displayLimit = 5;
        const entriesToRender = Number.isFinite(displayLimit) && displayLimit > 0
          ? yearlyStats.slice(-displayLimit)
          : yearlyStats;

        if (!entriesToRender.length) {
          const row = document.createElement('tr');
          const cell = document.createElement('td');
          cell.colSpan = 9;
          cell.textContent = TEXT.yearly.empty;
          row.appendChild(cell);
          selectors.yearlyTable.appendChild(row);
          syncCompareActivation();
          return;
        }

        const totals = entriesToRender.map((item) => (Number.isFinite(item?.count) ? item.count : 0));
        const completeness = entriesToRender.map((entry) => isCompleteYearEntry(entry));
        const diffValues = totals.map((total, index) => {
          if (index === 0) {
            return Number.NaN;
          }
          if (!completeness[index] || !completeness[index - 1]) {
            return Number.NaN;
          }
          const previousTotal = totals[index - 1];
          if (!Number.isFinite(previousTotal)) {
            return Number.NaN;
          }
          return total - previousTotal;
        });
        const maxAbsDiff = diffValues.reduce((acc, value) => (Number.isFinite(value)
          ? Math.max(acc, Math.abs(value))
          : acc), 0);

        const latestYear = entriesToRender.length
          ? entriesToRender[entriesToRender.length - 1].year
          : null;
        if (!Array.isArray(dashboardState.yearlyExpandedYears) || !dashboardState.yearlyExpandedYears.length) {
          dashboardState.yearlyExpandedYears = Number.isFinite(latestYear) ? [latestYear] : [];
        }
        const expandedYears = new Set(dashboardState.yearlyExpandedYears);
        const monthlyAll = Array.isArray(dashboardState.monthly?.all) ? dashboardState.monthly.all : [];

        const renderMonthlyRow = (entry, index, totals, completeness, maxAbsDiff, parentYear, allMonthly) => {
          const row = document.createElement('tr');
          row.className = 'yearly-child-row';
          setDatasetValue(row, 'parentYear', parentYear);
          const avgPerDay = entry.dayCount > 0 ? entry.count / entry.dayCount : 0;
          const total = Number.isFinite(entry.count) ? entry.count : 0;
          const previousTotal = index > 0 ? totals[index - 1] : Number.NaN;
          const [yearStr, monthStr] = typeof entry.month === 'string' ? entry.month.split('-') : [];
          const year = Number.parseInt(yearStr, 10);
          const previousYearKey = Number.isFinite(year) && monthStr ? `${year - 1}-${monthStr}` : '';
          const previousYearEntry = previousYearKey
            ? allMonthly.find((item) => item && item.month === previousYearKey)
            : null;
          const previousYearTotal = Number.isFinite(previousYearEntry?.count) ? previousYearEntry.count : Number.NaN;
          const isComplete = completeness[index];
          const previousComplete = index > 0 ? completeness[index - 1] : false;
          const canCompare = isComplete && previousComplete && Number.isFinite(previousTotal);
          const diff = canCompare ? total - previousTotal : Number.NaN;
          const percentChange = canCompare && previousTotal !== 0
            ? diff / previousTotal
            : Number.NaN;
          const previousYearComplete = previousYearEntry ? isCompleteMonthEntry(previousYearEntry) : false;
          const yoyComparison = formatMonthlyYoYComparison(total, previousYearTotal, isComplete && previousYearComplete);
          row.innerHTML = `
            <td><span class="yearly-month-label">${formatMonthLabel(entry.month)}</span></td>
            <td>${numberFormatter.format(total)}${yoyComparison}</td>
            <td>${oneDecimalFormatter.format(avgPerDay)}</td>
            <td>${decimalFormatter.format(entry.durations ? entry.totalTime / entry.durations : 0)}</td>
            <td>${formatValueWithShare(entry.night, total)}</td>
            <td>${formatValueWithShare(entry.ems, total)}</td>
            <td>${formatValueWithShare(entry.hospitalized, total)}</td>
            <td>${formatValueWithShare(entry.discharged, total)}</td>
            <td>${createMonthlyChangeCell(diff, percentChange, maxAbsDiff, canCompare)}</td>
          `;
          return row;
        };

        entriesToRender.forEach((entry, index) => {
          const row = document.createElement('tr');
          row.className = 'yearly-row';
          const total = Number.isFinite(entry.count) ? entry.count : 0;
          const avgPerDay = entry.dayCount > 0 ? total / entry.dayCount : 0;
          const avgStay = entry.durations ? entry.totalTime / entry.durations : 0;
          const previousTotal = index > 0 ? totals[index - 1] : Number.NaN;
          const isComplete = completeness[index];
          const previousComplete = index > 0 ? completeness[index - 1] : false;
          const canCompare = isComplete && previousComplete && Number.isFinite(previousTotal);
          const diff = canCompare ? total - previousTotal : Number.NaN;
          const percentChange = canCompare && previousTotal !== 0
            ? diff / previousTotal
            : Number.NaN;
          const isExpanded = expandedYears.has(entry.year);
          const yearLabel = formatYearLabel(entry.year);
          const yearDisplay = isComplete
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
            <td>${createYearlyChangeCell(diff, percentChange, maxAbsDiff, canCompare)}</td>
          `;
          const emsShare = total > 0 ? entry.ems / total : 0;
          const hospShare = total > 0 ? entry.hospitalized / total : 0;
          setDatasetValue(row, 'compareId', `yearly-${entry.year}`);
          setDatasetValue(row, 'compareGroup', 'yearly');
          setDatasetValue(row, 'compareLabel', formatYearLabel(entry.year));
          setDatasetValue(row, 'compareSort', entry.year);
          setDatasetValue(row, 'total', String(total));
          setDatasetValue(row, 'avgStay', String(avgStay));
          setDatasetValue(row, 'emsShare', String(emsShare));
          setDatasetValue(row, 'hospShare', String(hospShare));
          setDatasetValue(row, 'change', Number.isFinite(diff) ? String(diff) : '');
          setDatasetValue(row, 'changePercent', Number.isFinite(percentChange) ? String(percentChange) : '');
          setDatasetValue(row, 'year', entry.year);
          setDatasetValue(row, 'expanded', isExpanded ? 'true' : 'false');
          selectors.yearlyTable.appendChild(row);

          const monthlyForYear = monthlyAll.filter((item) => {
            if (!item || typeof item.month !== 'string') {
              return false;
            }
            return item.month.startsWith(`${entry.year}-`);
          });
          if (!monthlyForYear.length) {
            return;
          }
          const monthTotals = monthlyForYear.map((item) => (Number.isFinite(item?.count) ? item.count : 0));
          const monthCompleteness = monthlyForYear.map((item) => isCompleteMonthEntry(item));
          const monthDiffs = monthTotals.map((value, idx) => {
            if (idx === 0) {
              return Number.NaN;
            }
            if (!monthCompleteness[idx] || !monthCompleteness[idx - 1]) {
              return Number.NaN;
            }
            const prev = monthTotals[idx - 1];
            if (!Number.isFinite(prev)) {
              return Number.NaN;
            }
            return value - prev;
          });
          const monthMaxAbsDiff = monthDiffs.reduce((acc, value) => (Number.isFinite(value)
            ? Math.max(acc, Math.abs(value))
            : acc), 0);
          monthlyForYear.forEach((monthEntry, monthIndex) => {
            const monthRow = renderMonthlyRow(
              monthEntry,
              monthIndex,
              monthTotals,
              monthCompleteness,
              monthMaxAbsDiff,
              entry.year,
              monthlyAll,
            );
            monthRow.hidden = !isExpanded;
            selectors.yearlyTable.appendChild(monthRow);
          });
        });
        syncCompareActivation();
      }

      function handleYearlyToggle(event) {
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

      function formatDailyCaption(period) {
        const base = TEXT.charts.dailyCaption || 'Kasdieniai pacientų srautai';
        const normalized = Number.isFinite(period) ? Math.round(period) : null;
        const selectedYear = Number.isFinite(dashboardState.chartYear) ? Number(dashboardState.chartYear) : null;
        const yearFragment = Number.isFinite(selectedYear) ? `, ${selectedYear} m.` : '';
        if (normalized === 365) {
          const combinedSuffix = `mėnesinė dinamika (12 mėn.)${yearFragment}`;
          if (base.includes('(')) {
            return base.replace(/\(.*?\)/, `(${combinedSuffix})`);
          }
          return `${base} (${combinedSuffix})`;
        }
        if (normalized === 0) {
          const combinedSuffix = `visas laikotarpis${yearFragment}`;
          if (base.includes('(')) {
            return base.replace(/\(.*?\)/, `(${combinedSuffix})`);
          }
          return `${base} (${combinedSuffix})`;
        }
        if (!Number.isFinite(period) || period < 0) {
          return base;
        }
        const formattedDays = numberFormatter.format(normalized);
        const suffix = normalized === 1 ? 'paskutinė 1 diena' : `paskutinės ${formattedDays} dienos`;
        const combinedSuffix = `${suffix}${yearFragment}`;
        if (base.includes('(')) {
          return base.replace(/\(.*?\)/, `(${combinedSuffix})`);
        }
        return `${base} (${combinedSuffix})`;
      }

      function syncChartPeriodButtons(period) {
        if (!selectors.chartPeriodButtons || !selectors.chartPeriodButtons.length) {
          return;
        }
        selectors.chartPeriodButtons.forEach((button) => {
          const value = Number.parseInt(getDatasetValue(button, 'chartPeriod', ''), 10);
          const isActive = Number.isFinite(value) && value === period;
          button.setAttribute('aria-pressed', String(isActive));
          setDatasetValue(button, 'active', String(isActive));
        });
      }
      let renderFunnelShape = null;

        const { loadDashboard, scheduleInitialLoad } = createDataFlow({
          pageConfig,
          selectors,
          dashboardState,
        TEXT,
        DEFAULT_SETTINGS,
        AUTO_REFRESH_INTERVAL_MS,
        runAfterDomAndIdle,
        setDatasetValue,
        setStatus,
        showKpiSkeleton,
        showChartSkeletons,
        showEdSkeleton,
        createChunkReporter,
        fetchData,
        fetchFeedbackData,
        fetchEdData,
        perfMonitor,
        describeCacheMeta,
        createEmptyEdSummary,
        describeError,
        computeDailyStats,
        filterDailyStatsByWindow,
        populateChartYearOptions,
        populateChartsHospitalTableYearOptions,
        populateHourlyCompareYearOptions,
        populateHeatmapYearOptions,
        getDefaultChartFilters,
        sanitizeChartFilters,
        KPI_FILTER_LABELS,
        syncChartFilterControls,
        syncHeatmapFilterControls,
        prepareChartDataForPeriod,
        applyKpiFiltersAndRender,
        renderCharts,
        renderChartsHospitalTable,
        getHeatmapData: heatmapFlow.computeHeatmapDataForFilters,
        renderRecentTable,
        computeMonthlyStats,
        renderMonthlyTable,
        computeYearlyStats,
        renderYearlyTable,
        updateFeedbackFilterOptions,
        applyFeedbackFiltersAndRender,
        applyFeedbackStatusNote,
        renderEdDashboard,
        numberFormatter,
        getSettings: () => settings,
        getClientConfig: () => clientConfig,
        getAutoRefreshTimerId: () => autoRefreshTimerId,
        setAutoRefreshTimerId: (value) => {
          autoRefreshTimerId = value;
        },
      });

      function waitForFirstPaintAndIdle() {
        return new Promise((resolve) => {
          window.requestAnimationFrame(() => {
            runAfterDomAndIdle(resolve, { timeout: 1200 });
          });
        });
      }

      function initializeChartsCapability() {
        if (capabilityState.charts) {
          return;
        }
        const funnelCanvasFeature = createFunnelCanvasFeature({
          TEXT,
          getThemeStyleTarget,
          parseColorToRgb,
          relativeLuminance,
          rgbToRgba,
          numberFormatter,
          percentFormatter,
        });
        ({ renderFunnelShape } = funnelCanvasFeature);

        chartRenderers = createChartRenderers({
          dashboardState,
          selectors,
          TEXT,
          loadChartJs,
          getThemePalette,
          getThemeStyleTarget,
          showChartSkeletons,
          hideChartSkeletons,
          clearChartError,
          showChartError,
          setChartCardMessage,
          renderFunnelShape,
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
          computeMonthlyStats,
          formatMonthLabel,
          formatDailyCaption,
          syncChartPeriodButtons,
          HEATMAP_METRIC_KEYS,
          DEFAULT_HEATMAP_METRIC,
          HEATMAP_HOURS,
          HOURLY_STAY_BUCKET_ALL,
          HOURLY_COMPARE_SERIES,
          HOURLY_COMPARE_SERIES_ALL,
          normalizeHourlyWeekday,
          normalizeHourlyStayBucket,
          normalizeHourlyMetric,
          normalizeHourlyDepartment,
          normalizeHourlyCompareYears,
          updateHourlyCaption,
          updateHourlyDepartmentOptions,
          syncHourlyDepartmentVisibility,
          getHourlyChartRecords,
          computeHourlySeries,
          applyHourlyYAxisAuto,
          syncFeedbackTrendControls,
          updateFeedbackTrendSubtitle,
          getActiveFeedbackTrendWindow,
          formatMonthLabelForAxis: null,
        });
        capabilityState.charts = true;
      }

      function initializeKpiCapability() {
        if (capabilityState.kpi) {
          return;
        }
        kpiRenderer = createKpiRenderer({
          selectors,
          dashboardState,
          TEXT,
          escapeHtml,
          formatKpiValue,
          percentFormatter,
          numberFormatter,
          buildYearMonthMetrics,
          buildLastShiftSummary,
          hideKpiSkeleton,
        });
        capabilityState.kpi = true;
      }

      function initializeEdCapability() {
        if (capabilityState.ed) {
          return;
        }
        initializeChartsCapability();
        edRenderer = createEdRenderer({
          selectors,
          dashboardState,
          TEXT,
          DEFAULT_KPI_WINDOW_DAYS,
          settings,
          buildYearMonthMetrics,
          numberFormatter,
          resetEdCommentRotation,
          hideEdSkeleton,
          normalizeEdSearchQuery,
          matchesEdSearch,
          createEmptyEdSummary,
          summarizeEdRecords,
          formatLocalDateKey,
          formatMonthLabel,
          buildFeedbackTrendInfo,
          buildEdStatus,
          renderEdDispositionsChart,
          createEdSectionIcon,
          renderEdCommentsCard,
          formatEdCardValue,
          buildEdCardVisuals,
          enrichSummaryWithOverviewFallback,
        });
        capabilityState.ed = true;
      }

      function initializeFeedbackCapability() {
        if (capabilityState.feedback) {
          return;
        }
        // Feedback trend rendering uses shared chart renderers.
        initializeChartsCapability();
        capabilityState.feedback = true;
      }

      function initializeUiCapability() {
        if (capabilityState.ui) {
          return;
        }
        uiEvents = createUIEvents({
          pageConfig,
          selectors,
          dashboardState,
          refreshKpiWindowOptions,
          syncKpiFilterControls,
          handleKpiFilterInput,
          handleKpiDateClear,
          handleKpiDateInput,
          handleKpiSegmentedClick,
          handleLastShiftMetricClick,
          syncLastShiftHourlyMetricButtons,
          resetKpiFilters,
          KPI_FILTER_TOGGLE_LABELS,
          updateKpiSummary,
          populateFeedbackFilterControls,
          syncFeedbackFilterControls,
          updateFeedbackFiltersSummary,
          handleFeedbackFilterChange,
          handleFeedbackFilterChipClick,
          handleYearlyToggle,
          setFeedbackTrendWindow,
          storeCopyButtonBaseLabel,
          handleChartCopyClick,
          handleChartDownloadClick,
          handleTableDownloadClick,
          handleTabKeydown,
          setActiveTab,
          updateChartPeriod,
          updateChartYear,
          handleHeatmapMetricChange,
          handleHeatmapFilterChange,
          handleHourlyMetricClick,
          handleHourlyDepartmentInput,
          handleHourlyDepartmentBlur,
          handleHourlyDepartmentKeydown,
          handleHourlyDepartmentToggle,
          handleHourlyFilterChange,
          handleHourlyCompareToggle,
          handleHourlyCompareYearsChange,
          handleHourlyCompareSeriesClick,
          handleHourlyResetFilters,
          handleChartsHospitalTableYearChange,
          handleChartsHospitalTableSearchInput,
          handleChartsHospitalTableHeaderClick,
          handleChartsHospitalTableRowClick,
          handleChartFilterChange,
          handleChartSegmentedClick,
          toggleTheme,
          setCompareMode,
          clearCompareSelection,
          updateCompareSummary,
          handleCompareRowSelection,
          debounce,
          applyEdSearchFilter,
          applyHourlyDepartmentSelection,
          updateScrollTopButtonVisibility,
          scheduleScrollTopUpdate,
          sectionNavState,
          sectionVisibility,
          sectionNavCompactQuery,
          setLayoutRefreshAllowed,
          getLayoutResizeObserver,
          setLayoutResizeObserver,
          updateSectionNavCompactState,
          handleNavKeydown,
          scheduleLayoutRefresh,
          syncSectionNavVisibility,
          waitForFontsAndStyles,
          updateLayoutMetrics,
          refreshSectionObserver,
          flushPendingLayoutRefresh,
        });
        capabilityState.ui = true;
      }

      function getRequiredCapabilitiesForPage() {
        const required = [];
        const needsCharts = pageConfig.kpi || pageConfig.charts || pageConfig.feedback || pageConfig.ed;
        if (needsCharts) {
          required.push('charts');
        }
        if (pageConfig.kpi) {
          required.push('kpi');
        }
        if (pageConfig.feedback) {
          required.push('feedback');
        }
        if (pageConfig.ed) {
          required.push('ed');
        }
        required.push('ui');
        return required;
      }

      function initializeCapability(name) {
        if (name === 'charts') {
          initializeChartsCapability();
          return;
        }
        if (name === 'kpi') {
          initializeKpiCapability();
          return;
        }
        if (name === 'feedback') {
          initializeFeedbackCapability();
          return;
        }
        if (name === 'ed') {
          initializeEdCapability();
          return;
        }
        if (name === 'ui') {
          initializeUiCapability();
        }
      }

      async function ensureRuntimeCapabilities({ defer = false, required = [] } = {}) {
        if (defer) {
          await waitForFirstPaintAndIdle();
        }
        required.forEach((name) => initializeCapability(name));
      }

        async function bootstrap() {
          settings = await loadSettingsFromConfig();
          dashboardState.kpi.filters = getDefaultKpiFilters();
          dashboardState.chartFilters = getDefaultChartFilters();
          dashboardState.feedback.filters = getDefaultFeedbackFilters();
          dashboardState.heatmapFilters = getDefaultHeatmapFilters();
          dashboardState.heatmapYear = null;
          applySettingsToText();
          applyTextContent();
          applyFooterSource();
          if (pageConfig.charts) {
            syncHeatmapFilterControls();
          }
          const requiredCapabilities = getRequiredCapabilitiesForPage();
          const deferCapabilities = pageConfig.charts || pageConfig.feedback || pageConfig.ed;
          await ensureRuntimeCapabilities({ defer: deferCapabilities, required: requiredCapabilities });
          uiEvents.initUI();
          if (pageConfig.ed) {
            setActiveTab('ed', { focusPanel: false, restoreFocus: false });
            setFullscreenMode(true);
          }
          applySectionVisibility();
          scheduleInitialLoad();
        }

      initializeTheme();
      bootstrap();

      if (typeof window.clearDashboard === 'function') {
        const originalClearDashboard = window.clearDashboard;
        window.clearDashboard = (...args) => {
          const result = originalClearDashboard(...args);
          resetMonthlyState();
          return result;
        };
      }










}

