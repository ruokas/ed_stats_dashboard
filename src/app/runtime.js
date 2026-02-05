import { createClientStore, PerfMonitor } from '../../app.js';
import { loadChartJs } from '../utils/chart-loader.js';
import { getDatasetValue, setDatasetValue, runAfterDomAndIdle } from '../utils/dom.js';
import { initializeLazyLoading, initializeServiceWorker, preloadChartJs } from './bootstrap.js';
import { debounce } from '../utils/debounce.js';
import { createSelectors } from '../state/selectors.js';
import { createDashboardState } from '../state/dashboardState.js';
import { createMainDataHandlers } from '../data/main-data.js';
import { createFeedbackHandlers } from '../data/feedback.js';
import { createEdHandlers } from '../data/ed.js';
import { computeDailyStats, computeMonthlyStats, computeYearlyStats, formatLocalDateKey } from '../data/stats.js';
import { createChartRenderers } from '../charts/index.js';
import { createKpiRenderer } from '../render/kpi.js';
import { createEdRenderer } from '../render/ed.js';
import { createUIEvents } from '../events/index.js';
import { createLayoutTools } from './runtime/layout.js';
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
  tvTimeFormatter,
  tvDateFormatter,
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

export function startApp() {
      initializeServiceWorker({ updateClientConfig });
      initializeLazyLoading();
      preloadChartJs();

      // Iškart inicijuojame įkėlimą, kad biblioteka būtų paruošta, kai prireiks piešti grafikus.

      let settings = normalizeSettings({});

      const getDefaultKpiFilters = () => createDefaultKpiFilters({ settings, DEFAULT_SETTINGS, DEFAULT_KPI_WINDOW_DAYS });
      const getDefaultChartFilters = () => createDefaultChartFilters();
      const getDefaultFeedbackFilters = () => createDefaultFeedbackFilters();





      function resolveChartCopyTarget(button) {
        if (!button) {
          return null;
        }
        const selector = getDatasetValue(button, 'chartTarget');
        if (selector) {
          const target = document.querySelector(selector);
          if (target) {
            return target;
          }
        }
        const container = button.closest('.chart-card, .feedback-trend-card');
        if (!container) {
          return null;
        }
        return container.querySelector('canvas, svg');
      }

      function normalizeCopySource(target) {
        if (!target) {
          return null;
        }
        if (target instanceof HTMLCanvasElement) {
          return { type: 'canvas', node: target };
        }
        if (target instanceof SVGElement) {
          return { type: 'svg', node: target };
        }
        if (target instanceof HTMLElement && target.classList.contains('heatmap-scroll')) {
          return { type: 'heatmap', node: target };
        }
        if (target instanceof HTMLElement && target.querySelector('.heatmap-table')) {
          return { type: 'heatmap', node: target };
        }
        if (typeof target.querySelector === 'function') {
          const canvas = target.querySelector('canvas');
          if (canvas instanceof HTMLCanvasElement) {
            return { type: 'canvas', node: canvas };
          }
          const svg = target.querySelector('svg');
          if (svg instanceof SVGElement) {
            return { type: 'svg', node: svg };
          }
          const heatmap = target.querySelector('.heatmap-scroll');
          if (heatmap instanceof HTMLElement) {
            return { type: 'heatmap', node: heatmap };
          }
        }
        return null;
      }

      function resolveCopyBackgroundColor(node) {
        const owner = node instanceof HTMLElement
          ? node.closest('.chart-card, .feedback-trend-card, .feedback-graphs, .compare-card')
          : null;
        const bg = owner ? window.getComputedStyle(owner).backgroundColor : '';
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          return bg;
        }
        const bodyBg = window.getComputedStyle(document.body).backgroundColor;
        if (bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'transparent') {
          return bodyBg;
        }
        return '#ffffff';
      }

      function resolveCopyTitleInfo(node) {
        if (!(node instanceof Element)) {
          return null;
        }
        let titleEl = null;
        const figure = node.closest('figure');
        if (figure) {
          titleEl = figure.querySelector('figcaption');
        }
        if (!titleEl) {
          const labeledBy = node.getAttribute('aria-labelledby');
          if (labeledBy) {
            titleEl = document.getElementById(labeledBy);
          }
        }
        if (!titleEl) {
          const trend = node.closest('.feedback-trend-card');
          if (trend) {
            titleEl = trend.querySelector('.feedback-trend-card__title');
          }
        }
        if (titleEl && typeof titleEl.textContent === 'string') {
          const text = titleEl.textContent.trim();
          if (text) {
            return { text, styleEl: titleEl };
          }
        }
        const ariaLabel = node.getAttribute('aria-label');
        if (ariaLabel && ariaLabel.trim()) {
          return { text: ariaLabel.trim(), styleEl: node };
        }
        return null;
      }

      function resolveTitleRenderInfo(titleInfo) {
        if (!titleInfo || !titleInfo.text) {
          return null;
        }
        const styleEl = titleInfo.styleEl instanceof Element ? titleInfo.styleEl : document.body;
        const style = window.getComputedStyle(styleEl);
        const baseFontSize = Number.parseFloat(style.fontSize) || 16;
        const fontSize = Math.max(16, baseFontSize * 1.2);
        const fontWeight = 700;
        const font = `${style.fontStyle && style.fontStyle !== 'normal' ? `${style.fontStyle} ` : ''}${fontWeight} ${fontSize}px ${style.fontFamily || 'sans-serif'}`.trim();
        const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.35;
        return {
          text: titleInfo.text,
          font,
          fontSize,
          lineHeight,
          color: style.color || '#111',
          fontFamily: style.fontFamily || 'sans-serif',
          fontWeight: String(fontWeight),
          fontStyle: style.fontStyle || 'normal',
        };
      }

      function buildCanvasWithBackground(source, backgroundColor, titleInfo = null) {
        if (!source) {
          return null;
        }
        const title = resolveTitleRenderInfo(titleInfo);
        const paddingX = 18;
        const paddingY = 16;
        const titleGap = title ? 10 : 0;
        const tmpCanvas = document.createElement('canvas');
        const tmpCtx = tmpCanvas.getContext('2d');
        let titleLines = [];
        let titleHeight = 0;
        if (title && tmpCtx) {
          tmpCtx.font = title.font;
          const maxWidth = Math.max(0, source.width - paddingX * 2);
          titleLines = wrapTextLines(tmpCtx, title.text, maxWidth);
          titleHeight = titleLines.length ? titleLines.length * title.lineHeight : 0;
        }
        const contentOffsetY = paddingY + titleHeight + titleGap;
        const totalHeight = source.height + contentOffsetY + paddingY;
        const canvas = document.createElement('canvas');
        canvas.width = source.width;
        canvas.height = totalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return source;
        }
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (title && titleLines.length) {
          ctx.font = title.font;
          ctx.fillStyle = title.color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          let y = paddingY;
          titleLines.forEach((line) => {
            ctx.fillText(line, source.width / 2, y);
            y += title.lineHeight;
          });
        }

        ctx.drawImage(source, 0, contentOffsetY);
        return canvas;
      }

      function formatExportFilename(titleInfo) {
        const raw = titleInfo?.text || 'grafikas';
        const normalized = raw
          .toLowerCase()
          .replace(/[\s_]+/g, '-')
          .replace(/[^\p{L}\p{N}-]+/gu, '')
          .replace(/-+/g, '-')
          .replace(/^-+|-+$/g, '');
        const date = new Date();
        const dateStamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        return `${normalized || 'grafikas'}-${dateStamp}.png`;
      }

      async function canvasToPngBlob(canvas) {
        if (!canvas) {
          return null;
        }
        return new Promise((resolve) => {
          if (typeof canvas.toBlob === 'function') {
            canvas.toBlob((result) => resolve(result), 'image/png');
          } else {
            resolve(null);
          }
        });
      }

      function triggerDownloadFromBlob(blob, filename) {
        if (!blob) {
          return false;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        return true;
      }

      async function copyCanvasToClipboard(canvas, backgroundColor = null, titleInfo = null) {
        if (!canvas) {
          return { ok: false, reason: 'missing' };
        }
        const exportCanvas = backgroundColor ? buildCanvasWithBackground(canvas, backgroundColor, titleInfo) : canvas;
        if (!exportCanvas) {
          return { ok: false, reason: 'missing' };
        }
        const blob = await canvasToPngBlob(exportCanvas);
        if (blob && await writeBlobToClipboard(blob, 'image/png')) {
          return { ok: true, format: 'png' };
        }
        const dataUrl = exportCanvas.toDataURL('image/png');
        if (await writeTextToClipboard(dataUrl)) {
          return { ok: true, format: 'data-url' };
        }
        return { ok: false, reason: 'clipboard' };
      }

      function resolveSvgSize(svg) {
        if (!svg) {
          return { width: 0, height: 0, viewBox: null };
        }
        const viewBox = svg.getAttribute('viewBox');
        let width = Number.parseFloat(svg.getAttribute('width')) || svg.clientWidth || 0;
        let height = Number.parseFloat(svg.getAttribute('height')) || svg.clientHeight || 0;
        if ((!width || !height) && viewBox) {
          const parts = viewBox.split(/\s+/).map(Number);
          if (parts.length === 4 && parts.every((value) => Number.isFinite(value))) {
            width = parts[2];
            height = parts[3];
          }
        }
        if (!width || !height) {
          const rect = svg.getBoundingClientRect();
          width = rect.width || width;
          height = rect.height || height;
        }
        return { width, height, viewBox };
      }

      async function renderSvgToCanvas(svg, scale = 2) {
        if (!svg) {
          return null;
        }
        const { width, height } = resolveSvgSize(svg);
        if (!width || !height) {
          return null;
        }
        const serialized = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([serialized], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(width * scale);
        canvas.height = Math.ceil(height * scale);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          return null;
        }
        ctx.scale(scale, scale);
        const loaded = await new Promise((resolve) => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = url;
        });
        URL.revokeObjectURL(url);
        if (!loaded) {
          return null;
        }
        ctx.drawImage(img, 0, 0, width, height);
        return canvas;
      }

      function buildSvgWithBackground(svg, backgroundColor) {
        if (!svg || !backgroundColor) {
          return svg;
        }
        const clone = svg.cloneNode(true);
        const { width, height } = resolveSvgSize(clone);
        if (width && height) {
          if (!clone.getAttribute('width')) {
            clone.setAttribute('width', String(width));
          }
          if (!clone.getAttribute('height')) {
            clone.setAttribute('height', String(height));
          }
        }
        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bgRect.setAttribute('x', '0');
        bgRect.setAttribute('y', '0');
        bgRect.setAttribute('width', width ? String(width) : '100%');
        bgRect.setAttribute('height', height ? String(height) : '100%');
        bgRect.setAttribute('fill', backgroundColor);
        const first = clone.firstChild;
        clone.insertBefore(bgRect, first);
        return clone;
      }

      function buildSvgWithBackgroundAndTitle(svg, backgroundColor, titleInfo = null) {
        if (!svg) {
          return svg;
        }
        const title = resolveTitleRenderInfo(titleInfo);
        if (!title) {
          return buildSvgWithBackground(svg, backgroundColor);
        }
        const base = buildSvgWithBackground(svg, backgroundColor);
        const { width, height, viewBox } = resolveSvgSize(base);
        if (!width || !height) {
          return base;
        }
        const tmpCanvas = document.createElement('canvas');
        const tmpCtx = tmpCanvas.getContext('2d');
        let titleLines = [];
        if (tmpCtx) {
          tmpCtx.font = title.font;
          const maxWidth = Math.max(0, width - 36);
          titleLines = wrapTextLines(tmpCtx, title.text, maxWidth);
        }
        if (!titleLines.length) {
          return base;
        }
        const paddingX = 18;
        const paddingY = 16;
        const titleGap = 10;
        const titleHeight = titleLines.length * title.lineHeight;
        const offsetY = paddingY + titleHeight + titleGap;
        const totalHeight = height + offsetY + paddingY;
        const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        wrapper.setAttribute('width', String(width));
        wrapper.setAttribute('height', String(totalHeight));
        wrapper.setAttribute('viewBox', `0 0 ${width} ${totalHeight}`);
        wrapper.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

        if (backgroundColor) {
          const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          bgRect.setAttribute('x', '0');
          bgRect.setAttribute('y', '0');
          bgRect.setAttribute('width', String(width));
          bgRect.setAttribute('height', String(totalHeight));
          bgRect.setAttribute('fill', backgroundColor);
          wrapper.appendChild(bgRect);
        }

        titleLines.forEach((line, index) => {
          const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          textEl.setAttribute('x', String(width / 2));
          textEl.setAttribute('y', String(paddingY + title.lineHeight * index));
          textEl.setAttribute('fill', title.color);
          textEl.setAttribute('font-size', String(title.fontSize));
          textEl.setAttribute('font-family', title.fontFamily);
          textEl.setAttribute('font-weight', title.fontWeight);
          textEl.setAttribute('font-style', title.fontStyle);
          textEl.setAttribute('dominant-baseline', 'hanging');
          textEl.setAttribute('text-anchor', 'middle');
          textEl.textContent = line;
          wrapper.appendChild(textEl);
        });

        const cloned = base.cloneNode(true);
        cloned.setAttribute('x', '0');
        cloned.setAttribute('y', String(offsetY));
        if (!cloned.getAttribute('width')) {
          cloned.setAttribute('width', String(width));
        }
        if (!cloned.getAttribute('height')) {
          cloned.setAttribute('height', String(height));
        }
        if (viewBox && !cloned.getAttribute('viewBox')) {
          cloned.setAttribute('viewBox', viewBox);
        }
        wrapper.appendChild(cloned);
        return wrapper;
      }

      async function copySvgToClipboard(svg, backgroundColor = null, titleInfo = null) {
        if (!svg) {
          return { ok: false, reason: 'missing' };
        }
        const exportSvg = backgroundColor ? buildSvgWithBackgroundAndTitle(svg, backgroundColor, titleInfo) : svg;
        const serialized = new XMLSerializer().serializeToString(exportSvg);
        const svgBlob = new Blob([serialized], { type: 'image/svg+xml' });
        if (await writeBlobToClipboard(svgBlob, 'image/svg+xml')) {
          return { ok: true, format: 'svg' };
        }
        if (await writeTextToClipboard(serialized)) {
          return { ok: true, format: 'svg-text' };
        }
        const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
        if (await writeTextToClipboard(dataUrl)) {
          return { ok: true, format: 'data-url' };
        }
        return { ok: false, reason: 'clipboard' };
      }

      function getFontString(style) {
        const fontStyle = style.fontStyle && style.fontStyle !== 'normal' ? `${style.fontStyle} ` : '';
        const fontWeight = style.fontWeight && style.fontWeight !== 'normal' ? `${style.fontWeight} ` : '';
        const fontSize = style.fontSize || '14px';
        const fontFamily = style.fontFamily || 'sans-serif';
        return `${fontStyle}${fontWeight}${fontSize} ${fontFamily}`.trim();
      }

      function wrapTextLines(ctx, text, maxWidth) {
        if (!text) {
          return [];
        }
        const words = String(text).split(/\s+/).filter(Boolean);
        if (!words.length) {
          return [];
        }
        const lines = [];
        let current = words[0];
        for (let i = 1; i < words.length; i += 1) {
          const candidate = `${current} ${words[i]}`;
          if (ctx.measureText(candidate).width <= maxWidth) {
            current = candidate;
          } else {
            lines.push(current);
            current = words[i];
          }
        }
        lines.push(current);
        return lines;
      }

      function drawRoundedRect(ctx, x, y, width, height, radius) {
        const r = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + width - r, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + r);
        ctx.lineTo(x + width, y + height - r);
        ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        ctx.lineTo(x + r, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      }

      function buildHeatmapExportCanvas(container, titleInfo = null) {
        if (!container) {
          return null;
        }
        const table = container.querySelector('.heatmap-table');
        if (!table) {
          return null;
        }
        const legend = container.querySelector('.heatmap-legend');
        const scrollContainer = container;
        const tableRect = table.getBoundingClientRect();
        const originLeft = tableRect.left - (scrollContainer.scrollLeft || 0);
        const originTop = tableRect.top - (scrollContainer.scrollTop || 0);
        const tableWidth = table.scrollWidth || tableRect.width;
        const tableHeight = table.scrollHeight || tableRect.height;
        const padding = 12;
        const title = resolveTitleRenderInfo(titleInfo);
        const titleGap = title ? 12 : 0;
        let titleLines = [];
        let titleHeight = 0;
        const tmpCanvas = document.createElement('canvas');
        const tmpCtx = tmpCanvas.getContext('2d');
        if (title && tmpCtx) {
          tmpCtx.font = title.font;
          const maxWidth = Math.max(0, tableWidth - padding * 2);
          titleLines = wrapTextLines(tmpCtx, title.text, maxWidth);
          titleHeight = titleLines.length ? titleLines.length * title.lineHeight : 0;
        }
        const headerOffsetY = padding + titleHeight + titleGap;
        const legendGap = legend ? 10 : 0;
        let legendLines = [];
        let legendLineHeight = 0;
        let legendHeight = 0;
        let legendStyle = null;
        if (legend && tmpCtx) {
          legendStyle = window.getComputedStyle(legend);
          tmpCtx.font = getFontString(legendStyle);
          const maxWidth = Math.max(0, tableWidth);
          legendLines = wrapTextLines(tmpCtx, legend.textContent || '', maxWidth);
          const fontSize = Number.parseFloat(legendStyle.fontSize) || 12;
          const lineHeight = Number.parseFloat(legendStyle.lineHeight) || fontSize * 1.4;
          legendLineHeight = lineHeight;
          legendHeight = legendLines.length ? legendLineHeight * legendLines.length : 0;
        }

        const width = Math.max(1, Math.ceil(tableWidth + padding * 2));
        const height = Math.max(1, Math.ceil(tableHeight + headerOffsetY + padding + legendGap + legendHeight));
        const canvas = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.ceil(width * dpr);
        canvas.height = Math.ceil(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return null;
        }
        ctx.scale(dpr, dpr);
        ctx.textBaseline = 'middle';

        const card = container.closest('.chart-card');
        const bgColor = card ? window.getComputedStyle(card).backgroundColor : window.getComputedStyle(container).backgroundColor;
        ctx.fillStyle = bgColor || '#ffffff';
        ctx.fillRect(0, 0, width, height);

        const drawHeaderCell = (cell) => {
          const rect = cell.getBoundingClientRect();
          const style = window.getComputedStyle(cell);
          ctx.fillStyle = style.color || '#000';
          ctx.font = getFontString(style);
          const text = cell.textContent || '';
          const align = style.textAlign || 'center';
          ctx.textAlign = align;
          let x = rect.left - originLeft + padding + rect.width / 2;
          if (align === 'left') {
            const pad = Number.parseFloat(style.paddingLeft) || 0;
            x = rect.left - originLeft + padding + pad;
          } else if (align === 'right') {
            const pad = Number.parseFloat(style.paddingRight) || 0;
            x = rect.left - originLeft + padding + rect.width - pad;
          }
          const y = rect.top - originTop + headerOffsetY + rect.height / 2;
          ctx.fillText(text, x, y);
        };

        const headerCells = table.querySelectorAll('thead th, tbody th');
        headerCells.forEach((cell) => drawHeaderCell(cell));

        const dataCells = table.querySelectorAll('tbody td');
        dataCells.forEach((cell) => {
          const badge = cell.querySelector('.heatmap-cell');
          if (!badge) {
            return;
          }
          const rect = badge.getBoundingClientRect();
          const style = window.getComputedStyle(badge);
          const radius = Number.parseFloat(style.borderRadius) || 0;
          const x = rect.left - originLeft + padding;
          const y = rect.top - originTop + headerOffsetY;
          const w = rect.width;
          const h = rect.height;
          ctx.fillStyle = style.backgroundColor || 'transparent';
          drawRoundedRect(ctx, x, y, w, h, radius);
          ctx.fill();
          const text = badge.textContent || '';
          if (text) {
            ctx.fillStyle = style.color || '#000';
            ctx.font = getFontString(style);
            ctx.textAlign = 'center';
            ctx.fillText(text, x + w / 2, y + h / 2);
          }
        });

        if (legendLines.length && legendStyle) {
          ctx.font = getFontString(legendStyle);
          ctx.fillStyle = legendStyle.color || '#000';
          ctx.textAlign = 'left';
          let y = headerOffsetY + tableHeight + legendGap + (legendLineHeight / 2);
          const x = padding;
          legendLines.forEach((line) => {
            ctx.fillText(line, x, y);
            y += legendLineHeight;
          });
        }

        if (title && titleLines.length) {
          ctx.font = title.font;
          ctx.fillStyle = title.color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          let y = padding;
          const centerX = padding + (tableWidth / 2);
          titleLines.forEach((line) => {
            ctx.fillText(line, centerX, y);
            y += title.lineHeight;
          });
        }

        return canvas;
      }

      async function copyHeatmapToClipboard(container, titleInfo = null) {
        const canvas = buildHeatmapExportCanvas(container, titleInfo);
        if (!canvas) {
          return { ok: false, reason: 'missing' };
        }
        return copyCanvasToClipboard(canvas);
      }

      async function downloadCanvasPng(canvas, filename) {
        const blob = await canvasToPngBlob(canvas);
        if (!blob) {
          return false;
        }
        return triggerDownloadFromBlob(blob, filename);
      }

      function formatExportFilenameWithExt(titleInfo, ext) {
        const raw = titleInfo?.text || 'lentelė';
        const normalized = raw
          .toLowerCase()
          .replace(/[\s_]+/g, '-')
          .replace(/[^\p{L}\p{N}-]+/gu, '')
          .replace(/-+/g, '-')
          .replace(/^-+|-+$/g, '');
        const date = new Date();
        const dateStamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const suffix = String(ext || '').replace(/^\./, '') || 'csv';
        return `${normalized || 'lentele'}-${dateStamp}.${suffix}`;
      }

      function escapeCsvCell(value) {
        const text = String(value ?? '');
        if (/[",\n]/.test(text)) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      }

      function getVisibleTableRows(table) {
        if (!(table instanceof HTMLElement)) {
          return [];
        }
        return Array.from(table.querySelectorAll('tr')).filter((row) => {
          if (row.hidden) {
            return false;
          }
          const style = getComputedStyle(row);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });
      }

      function buildCsvFromTable(table) {
        if (!(table instanceof HTMLElement)) {
          return '';
        }
        const rows = getVisibleTableRows(table);
        if (!rows.length) {
          return '';
        }
        return rows.map((row) => {
          const cells = Array.from(row.children);
          return cells.map((cell) => escapeCsvCell(cell.textContent.trim())).join(',');
        }).join('\n');
      }

      function isTransparentColor(color) {
        if (!color) {
          return true;
        }
        const normalized = color.trim().toLowerCase();
        if (normalized === 'transparent') {
          return true;
        }
        const rgbaMatch = normalized.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)$/);
        return rgbaMatch ? Number.parseFloat(rgbaMatch[1]) === 0 : false;
      }

      function buildTableExportCanvas(table, titleInfo = null, backgroundColor = null) {
        if (!(table instanceof HTMLElement)) {
          return null;
        }
        const rows = getVisibleTableRows(table);
        if (!rows.length) {
          return null;
        }
        const sampleCell = table.querySelector('th, td');
        if (!sampleCell) {
          return null;
        }
        const baseStyle = getComputedStyle(sampleCell);
        const fontFamily = baseStyle.fontFamily || 'sans-serif';
        const fontSize = Number.parseFloat(baseStyle.fontSize) || 14;
        const paddingLeft = Number.parseFloat(baseStyle.paddingLeft) || 12;
        const paddingRight = Number.parseFloat(baseStyle.paddingRight) || 12;
        const paddingTop = Number.parseFloat(baseStyle.paddingTop) || 8;
        const paddingBottom = Number.parseFloat(baseStyle.paddingBottom) || 8;
        const rowHeight = Math.max(28, fontSize + paddingTop + paddingBottom);

        const columnCount = rows.reduce((max, row) => Math.max(max, row.children.length), 0);
        const colWidths = Array(columnCount).fill(0);
        const measureCanvas = document.createElement('canvas');
        const measureCtx = measureCanvas.getContext('2d');
        if (!measureCtx) {
          return null;
        }

        rows.forEach((row) => {
          Array.from(row.children).forEach((cell, index) => {
            const cellStyle = getComputedStyle(cell);
            const cellFontSize = Number.parseFloat(cellStyle.fontSize) || fontSize;
            const cellFontWeight = cellStyle.fontWeight || '400';
            measureCtx.font = `${cellFontWeight} ${cellFontSize}px ${fontFamily}`;
            const text = cell.textContent.trim();
            const textWidth = measureCtx.measureText(text).width;
            const cellPaddingLeft = Number.parseFloat(cellStyle.paddingLeft) || paddingLeft;
            const cellPaddingRight = Number.parseFloat(cellStyle.paddingRight) || paddingRight;
            const width = textWidth + cellPaddingLeft + cellPaddingRight + 6;
            if (width > colWidths[index]) {
              colWidths[index] = width;
            }
          });
        });

        const outerPadding = 24;
        const tableWidth = colWidths.reduce((sum, value) => sum + value, 0);
        const titleText = titleInfo?.text || '';
        const titleFontSize = Math.round(fontSize * 1.1);
        const titleHeight = titleText ? titleFontSize + 18 : 0;
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(tableWidth + outerPadding * 2);
        canvas.height = Math.ceil(rows.length * rowHeight + outerPadding * 2 + titleHeight);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return null;
        }
        const fallbackBg = getComputedStyle(document.body).backgroundColor || '#ffffff';
        ctx.fillStyle = backgroundColor || fallbackBg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        let cursorY = outerPadding;
        if (titleText) {
          ctx.fillStyle = getComputedStyle(document.body).color || '#111';
          ctx.font = `600 ${titleFontSize}px ${fontFamily}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(titleText, canvas.width / 2, cursorY);
          cursorY += titleHeight;
        }

        rows.forEach((row) => {
          let cursorX = outerPadding;
          const rowStyle = getComputedStyle(row);
          const rowBg = rowStyle.backgroundColor;
          if (rowBg && !isTransparentColor(rowBg)) {
            ctx.fillStyle = rowBg;
            ctx.fillRect(cursorX, cursorY, tableWidth, rowHeight);
          }
          Array.from(row.children).forEach((cell, index) => {
            const cellStyle = getComputedStyle(cell);
            const cellBg = cellStyle.backgroundColor;
            const cellColor = cellStyle.color || '#111';
            const cellFontWeight = cellStyle.fontWeight || '400';
            const cellFontSize = Number.parseFloat(cellStyle.fontSize) || fontSize;
            const cellPaddingLeft = Number.parseFloat(cellStyle.paddingLeft) || paddingLeft;
            const cellPaddingTop = Number.parseFloat(cellStyle.paddingTop) || paddingTop;
            const cellWidth = colWidths[index] || 120;

            if (cellBg && !isTransparentColor(cellBg)) {
              ctx.fillStyle = cellBg;
              ctx.fillRect(cursorX, cursorY, cellWidth, rowHeight);
            }

            ctx.fillStyle = cellColor;
            ctx.font = `${cellFontWeight} ${cellFontSize}px ${fontFamily}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            const text = cell.textContent.trim();
            const textX = cursorX + cellPaddingLeft;
            const textY = cursorY + cellPaddingTop + Math.max(0, (rowHeight - cellPaddingTop - paddingBottom - cellFontSize) * 0.2);
            ctx.fillText(text, textX, textY);
            cursorX += cellWidth;
          });
          cursorY += rowHeight;
        });

        return canvas;
      }

      async function downloadTableAsCsv(table, titleInfo) {
        const csvText = buildCsvFromTable(table);
        if (!csvText) {
          return false;
        }
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
        const filename = formatExportFilenameWithExt(titleInfo, 'csv');
        return triggerDownloadFromBlob(blob, filename);
      }

      async function downloadTableAsPng(table, titleInfo) {
        const backgroundColor = resolveCopyBackgroundColor(table);
        const exportCanvas = buildTableExportCanvas(table, titleInfo, backgroundColor);
        if (!exportCanvas) {
          return false;
        }
        const filename = formatExportFilenameWithExt(titleInfo, 'png');
        return downloadCanvasPng(exportCanvas, filename);
      }

      async function downloadChartAsPng(source, titleInfo, backgroundColor) {
        const filename = formatExportFilename(titleInfo);
        if (!source) {
          return { ok: false, reason: 'missing' };
        }
        if (source.type === 'canvas') {
          const exportCanvas = backgroundColor ? buildCanvasWithBackground(source.node, backgroundColor, titleInfo) : source.node;
          if (!exportCanvas) {
            return { ok: false, reason: 'missing' };
          }
          const ok = await downloadCanvasPng(exportCanvas, filename);
          return { ok, format: 'png' };
        }
        if (source.type === 'svg') {
          const exportSvg = backgroundColor ? buildSvgWithBackgroundAndTitle(source.node, backgroundColor, titleInfo) : source.node;
          const rendered = await renderSvgToCanvas(exportSvg, 2);
          if (!rendered) {
            return { ok: false, reason: 'render' };
          }
          const ok = await downloadCanvasPng(rendered, filename);
          return { ok, format: 'png' };
        }
        if (source.type === 'heatmap') {
          const exportCanvas = buildHeatmapExportCanvas(source.node, titleInfo);
          if (!exportCanvas) {
            return { ok: false, reason: 'missing' };
          }
          const ok = await downloadCanvasPng(exportCanvas, filename);
          return { ok, format: 'png' };
        }
        return { ok: false, reason: 'unsupported' };
      }

      async function handleChartCopyClick(event) {
        const button = event.currentTarget;
        if (!(button instanceof HTMLElement)) {
          return;
        }
        if (getDatasetValue(button, 'copyBusy') === 'true') {
          return;
        }
        setDatasetValue(button, 'copyBusy', 'true');
        button.setAttribute('aria-busy', 'true');
        try {
          const target = resolveChartCopyTarget(button);
          const source = normalizeCopySource(target);
          if (!source) {
            setCopyButtonFeedback(button, 'Kopijavimas nepalaikomas', 'error');
            return;
          }
          if (source.type === 'canvas') {
            if (source.node.hidden) {
              setCopyButtonFeedback(button, 'Grafikas dar neparuoštas', 'error');
              return;
            }
            const backgroundColor = resolveCopyBackgroundColor(source.node);
            const titleInfo = resolveCopyTitleInfo(source.node);
            const result = await copyCanvasToClipboard(source.node, backgroundColor, titleInfo);
            if (result.ok) {
              setCopyButtonFeedback(button, 'Grafikas nukopijuotas');
            } else {
              setCopyButtonFeedback(button, 'Nepavyko nukopijuoti', 'error');
            }
            return;
          }
          if (source.type === 'svg') {
            if (source.node.getAttribute('aria-hidden') === 'true') {
              setCopyButtonFeedback(button, 'Grafikas dar neparuoštas', 'error');
              return;
            }
            const backgroundColor = resolveCopyBackgroundColor(source.node);
            const titleInfo = resolveCopyTitleInfo(source.node);
            const result = await copySvgToClipboard(source.node, backgroundColor, titleInfo);
            if (result.ok) {
              setCopyButtonFeedback(button, 'Grafikas nukopijuotas');
            } else {
              setCopyButtonFeedback(button, 'Nepavyko nukopijuoti', 'error');
            }
            return;
          }
          if (source.type === 'heatmap') {
            const titleInfo = resolveCopyTitleInfo(source.node);
            const result = await copyHeatmapToClipboard(source.node, titleInfo);
            if (result.ok) {
              setCopyButtonFeedback(button, 'Grafikas nukopijuotas');
            } else {
              const message = result.reason === 'missing' ? 'Grafikas dar neparuoštas' : 'Nepavyko nukopijuoti';
              setCopyButtonFeedback(button, message, 'error');
            }
          }
        } catch (error) {
          const errorInfo = describeError(error, { code: 'CHART_COPY', message: 'Nepavyko nukopijuoti grafiko' });
          console.error(errorInfo.log, error);
          setCopyButtonFeedback(button, 'Nepavyko nukopijuoti', 'error');
        } finally {
          setDatasetValue(button, 'copyBusy', 'false');
          button.removeAttribute('aria-busy');
        }
      }

      async function handleChartDownloadClick(event) {
        const button = event.currentTarget;
        if (!(button instanceof HTMLElement)) {
          return;
        }
        if (getDatasetValue(button, 'copyBusy') === 'true') {
          return;
        }
        setDatasetValue(button, 'copyBusy', 'true');
        button.setAttribute('aria-busy', 'true');
        try {
          const target = resolveChartCopyTarget(button);
          const source = normalizeCopySource(target);
          if (!source) {
            setCopyButtonFeedback(button, 'Klaida parsisiunčiant', 'error');
            return;
          }
          const titleInfo = resolveCopyTitleInfo(source.node);
          const backgroundColor = resolveCopyBackgroundColor(source.node);
          const result = await downloadChartAsPng(source, titleInfo, backgroundColor);
          if (result.ok) {
            setCopyButtonFeedback(button, 'Grafikas parsisiųstas');
          } else {
            const message = result.reason === 'missing' ? 'Grafikas dar neparuoštas' : 'Klaida parsisiunčiant';
            setCopyButtonFeedback(button, message, 'error');
          }
        } catch (error) {
          const errorInfo = describeError(error, { code: 'CHART_DOWNLOAD', message: 'Nepavyko parsisiųsti grafiko' });
          console.error(errorInfo.log, error);
          setCopyButtonFeedback(button, 'Klaida parsisiunčiant', 'error');
        } finally {
          setDatasetValue(button, 'copyBusy', 'false');
          button.removeAttribute('aria-busy');
        }
      }

      async function handleTableDownloadClick(event) {
        const button = event.currentTarget;
        if (!(button instanceof HTMLElement)) {
          return;
        }
        if (getDatasetValue(button, 'copyBusy') === 'true') {
          return;
        }
        const targetSelector = getDatasetValue(button, 'tableTarget', '');
        const table = targetSelector ? document.querySelector(targetSelector) : null;
        if (!(table instanceof HTMLElement)) {
          setCopyButtonFeedback(button, 'Lentelė nerasta', 'error');
          return;
        }
        const titleInfo = { text: getDatasetValue(button, 'tableTitle', 'Lentelė') };
        setDatasetValue(button, 'copyBusy', 'true');
        button.setAttribute('aria-busy', 'true');
        try {
          const format = getDatasetValue(button, 'tableDownload', 'csv');
          let ok = false;
          if (format === 'png') {
            ok = await downloadTableAsPng(table, titleInfo);
          } else {
            ok = await downloadTableAsCsv(table, titleInfo);
          }
          setCopyButtonFeedback(button, ok ? 'Lentelė parsisiųsta' : 'Klaida parsisiunčiant', ok ? 'success' : 'error');
        } catch (error) {
          const errorInfo = describeError(error, { code: 'TABLE_DOWNLOAD', message: 'Nepavyko parsisiųsti lentelės' });
          console.error(errorInfo.log, error);
          setCopyButtonFeedback(button, 'Klaida parsisiunčiant', 'error');
        } finally {
          setDatasetValue(button, 'copyBusy', 'false');
          button.removeAttribute('aria-busy');
        }
      }

      function restartAutoRefreshTimer() {
        if (autoRefreshTimerId) {
          window.clearInterval(autoRefreshTimerId);
        }
        autoRefreshTimerId = window.setInterval(() => {
          loadDashboard();
        }, AUTO_REFRESH_INTERVAL_MS);
      }

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

      const tvState = { clockHandle: null };




      function normalizeHourlyWeekday(value) {
        if (value === HOURLY_WEEKDAY_ALL) {
          return HOURLY_WEEKDAY_ALL;
        }
        const numeric = Number.parseInt(String(value), 10);
        if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 6) {
          return numeric;
        }
        return HOURLY_WEEKDAY_ALL;
      }

      function getHourlyWeekdayLabel(value) {
        const normalized = normalizeHourlyWeekday(value);
        if (normalized === HOURLY_WEEKDAY_ALL) {
          return TEXT.charts?.hourlyWeekdayAll || 'Visos dienos';
        }
        return HEATMAP_WEEKDAY_FULL[normalized] || '';
      }

      function normalizeHourlyMetric(value) {
        const normalized = typeof value === 'string' ? value : String(value ?? '');
        if (HOURLY_METRICS.includes(normalized)) {
          return normalized;
        }
        return HOURLY_METRIC_ARRIVALS;
      }

      function getHourlyMetricLabel(value) {
        const normalized = normalizeHourlyMetric(value);
        const options = TEXT.charts?.hourlyMetricOptions || {};
        return typeof options[normalized] === 'string' && options[normalized].trim()
          ? options[normalized]
          : normalized;
      }

      function normalizeHourlyDepartment(value) {
        if (!value || String(value).trim().length === 0) {
          return 'all';
        }
        const raw = String(value).trim();
        const allLabel = TEXT.charts?.hourlyDepartmentAll || 'Visi skyriai';
        if (raw === 'all' || raw === allLabel) {
          return 'all';
        }
        return raw;
      }

      function isKnownHourlyDepartment(value) {
        if (!value || value === 'all') {
          return false;
        }
        const options = Array.isArray(dashboardState.hourlyDepartmentOptions)
          ? dashboardState.hourlyDepartmentOptions
          : [];
        return options.includes(value);
      }

      function applyHourlyYAxisAuto(chartInstance) {
        const chart = chartInstance || dashboardState.charts?.hourly;
        if (chart?.options?.scales?.y) {
          chart.options.scales.y.max = undefined;
          chart.options.scales.y.suggestedMax = dashboardState.hourlyYAxisSuggestedMax ?? undefined;
          chart.options.scales.y.suggestedMin = dashboardState.hourlyYAxisSuggestedMin ?? undefined;
        }
      }

      function normalizeHourlyStayBucket(value) {
        if (value === HOURLY_STAY_BUCKET_ALL) {
          return HOURLY_STAY_BUCKET_ALL;
        }
        const candidate = String(value);
        if (HOURLY_STAY_BUCKETS.some((bucket) => bucket.key === candidate)) {
          return candidate;
        }
        return HOURLY_STAY_BUCKET_ALL;
      }

      function getHourlyStayLabel(value) {
        const normalized = normalizeHourlyStayBucket(value);
        if (normalized === HOURLY_STAY_BUCKET_ALL) {
          return TEXT.charts?.hourlyStayAll || 'Visi laikai';
        }
        const labels = TEXT.charts?.hourlyStayBuckets || {};
        if (typeof labels[normalized] === 'string' && labels[normalized].trim()) {
          return labels[normalized];
        }
        const bucket = HOURLY_STAY_BUCKETS.find((item) => item.key === normalized);
        if (!bucket) {
          return '';
        }
        if (Number.isFinite(bucket.max)) {
          return `${bucket.min}–${bucket.max} val.`;
        }
        return `>${bucket.min} val.`;
      }


  function normalizeHourlyCompareYears(valueA, valueB) {
        const raw = [valueA, valueB]
          .map((value) => {
            if (value == null) {
              return null;
            }
            const trimmed = String(value).trim();
            if (!trimmed || trimmed === 'none') {
              return null;
            }
            const parsed = Number.parseInt(trimmed, 10);
            return Number.isFinite(parsed) ? parsed : null;
          })
          .filter((year) => Number.isFinite(year));
        const unique = Array.from(new Set(raw));
        return unique.slice(0, 2);
      }

      function buildHourlyCompareLabel() {
        const years = normalizeHourlyCompareYears(
          dashboardState.hourlyCompareYears?.[0],
          dashboardState.hourlyCompareYears?.[1],
        );
        if (!dashboardState.hourlyCompareEnabled || !years.length) {
          return '';
        }
        const seriesLabel = dashboardState.hourlyCompareSeries === HOURLY_COMPARE_SERIES_EMS
          ? 'GMP'
          : dashboardState.hourlyCompareSeries === HOURLY_COMPARE_SERIES_SELF
            ? 'Ne GMP'
            : '';
        const seriesSuffix = seriesLabel ? `, ${seriesLabel}` : '';
        return `Palyginimas: ${years.join(', ')} m.${seriesSuffix}`;
      }

      function buildHourlyCaptionLabel(weekdayValue, stayBucket, metricValue, departmentValue) {
        const parts = [];
        const metricLabel = getHourlyMetricLabel(metricValue);
        if (metricLabel) {
          parts.push(metricLabel);
        }
        const normalizedWeekday = normalizeHourlyWeekday(weekdayValue);
        const normalizedStay = normalizeHourlyStayBucket(stayBucket);
        if (normalizedWeekday !== HOURLY_WEEKDAY_ALL) {
          const weekdayLabel = getHourlyWeekdayLabel(normalizedWeekday);
          if (weekdayLabel) {
            parts.push(weekdayLabel);
          }
        }
        if (normalizedStay !== HOURLY_STAY_BUCKET_ALL) {
          const stayLabel = getHourlyStayLabel(normalizedStay);
          if (stayLabel) {
            parts.push(stayLabel);
          }
        }
        const normalizedMetric = normalizeHourlyMetric(metricValue);
        const normalizedDepartment = normalizeHourlyDepartment(departmentValue);
        if (normalizedMetric === HOURLY_METRIC_HOSPITALIZED && normalizedDepartment !== 'all') {
          parts.push(`Skyrius: ${normalizedDepartment}`);
        }
        const compareLabel = buildHourlyCompareLabel();
        if (compareLabel) {
          parts.push(compareLabel);
        }
        return parts.join(' • ');
      }

      function updateHourlyCaption(weekdayValue, stayBucket, metricValue, departmentValue) {
        if (!selectors.hourlyCaption) {
          return;
        }
        const label = buildHourlyCaptionLabel(weekdayValue, stayBucket, metricValue, departmentValue);
        const captionText = typeof TEXT.charts?.hourlyCaption === 'function'
          ? TEXT.charts.hourlyCaption(label)
          : (TEXT.charts?.hourlyCaption || 'Vidutinis pacientų skaičius per valandą.');
        selectors.hourlyCaption.textContent = captionText;
      }

      function populateHourlyWeekdayOptions() {
        if (!selectors.hourlyWeekdaySelect) {
          return;
        }
        const select = selectors.hourlyWeekdaySelect;
        select.innerHTML = '';
        const allOption = document.createElement('option');
        allOption.value = HOURLY_WEEKDAY_ALL;
        allOption.textContent = TEXT.charts?.hourlyWeekdayAll || 'Visos dienos';
        select.appendChild(allOption);
        HEATMAP_WEEKDAY_FULL.forEach((label, index) => {
          const option = document.createElement('option');
          option.value = String(index);
          option.textContent = label;
          select.appendChild(option);
        });
        const current = normalizeHourlyWeekday(dashboardState.hourlyWeekday);
        select.value = String(current);
      }

      function syncHourlyMetricButtons() {
        if (!Array.isArray(selectors.hourlyMetricButtons) || !selectors.hourlyMetricButtons.length) {
          return;
        }
        const current = normalizeHourlyMetric(dashboardState.hourlyMetric);
        selectors.hourlyMetricButtons.forEach((button) => {
          const metric = getDatasetValue(button, 'hourlyMetric');
          if (!metric) {
            return;
          }
          const isActive = metric === current;
          button.setAttribute('aria-pressed', String(isActive));
        });
      }

      function populateHourlyStayOptions() {
        if (!selectors.hourlyStaySelect) {
          return;
        }
        const select = selectors.hourlyStaySelect;
        select.innerHTML = '';
        const allOption = document.createElement('option');
        allOption.value = HOURLY_STAY_BUCKET_ALL;
        allOption.textContent = TEXT.charts?.hourlyStayAll || 'Visi laikai';
        select.appendChild(allOption);
        const labels = TEXT.charts?.hourlyStayBuckets || {};
        HOURLY_STAY_BUCKETS.forEach((bucket) => {
          const option = document.createElement('option');
          option.value = bucket.key;
          option.textContent = (typeof labels[bucket.key] === 'string' && labels[bucket.key].trim())
            ? labels[bucket.key]
            : getHourlyStayLabel(bucket.key);
          select.appendChild(option);
        });
        const current = normalizeHourlyStayBucket(dashboardState.hourlyStayBucket);
        select.value = String(current);
      }

      function getRecordDepartment(record) {
        const direct = record?.department;
        if (typeof direct === 'string' && direct.trim()) {
          return direct.trim();
        }
        const candidateKey = settings?.csv?.department || DEFAULT_SETTINGS.csv.department;
        if (candidateKey && record && typeof record === 'object' && candidateKey in record) {
          const raw = record[candidateKey];
          if (typeof raw === 'string' && raw.trim()) {
            return raw.trim();
          }
        }
        return '';
      }

      function updateHourlyDepartmentOptions(records) {
        if (!selectors.hourlyDepartmentInput) {
          return;
        }
        const departments = new Set();
        (Array.isArray(records) ? records : []).forEach((record) => {
          if (!record?.hospitalized) {
            return;
          }
          const label = getRecordDepartment(record);
          if (label) {
            departments.add(label);
          }
        });
        const sorted = Array.from(departments).sort((a, b) => textCollator.compare(a, b));
        const previous = Array.isArray(dashboardState.hourlyDepartmentOptions)
          ? dashboardState.hourlyDepartmentOptions
          : [];
        const isSame = previous.length === sorted.length
          && previous.every((value, index) => value === sorted[index]);
        if (isSame) {
          return;
        }
        dashboardState.hourlyDepartmentOptions = sorted.slice();
        const current = normalizeHourlyDepartment(dashboardState.hourlyDepartment);
        if (current === 'all') {
          selectors.hourlyDepartmentInput.value = '';
          return;
        }
        if (sorted.includes(current)) {
          selectors.hourlyDepartmentInput.value = current;
        }
      }

      function setHourlyDepartmentSuggestions(items) {
        const container = selectors.hourlyDepartmentSuggestions;
        if (!container) {
          return;
        }
        container.replaceChildren();
        const hasItems = Array.isArray(items) && items.length > 0;
        if (!hasItems) {
          container.setAttribute('hidden', 'hidden');
          if (selectors.hourlyDepartmentInput) {
            selectors.hourlyDepartmentInput.setAttribute('aria-expanded', 'false');
          }
          if (selectors.hourlyDepartmentToggle) {
            selectors.hourlyDepartmentToggle.setAttribute('aria-expanded', 'false');
          }
          dashboardState.hourlyDepartmentSuggestIndex = -1;
          return;
        }
        items.forEach((item, index) => {
          const option = document.createElement('div');
          option.className = 'hourly-suggestions__item';
          option.setAttribute('role', 'option');
          option.setAttribute('data-index', String(index));
          option.setAttribute('aria-selected', index === dashboardState.hourlyDepartmentSuggestIndex ? 'true' : 'false');
          option.textContent = item;
          container.appendChild(option);
        });
        container.removeAttribute('hidden');
        if (selectors.hourlyDepartmentInput) {
          selectors.hourlyDepartmentInput.setAttribute('aria-expanded', 'true');
        }
        if (selectors.hourlyDepartmentToggle) {
          selectors.hourlyDepartmentToggle.setAttribute('aria-expanded', 'true');
        }
      }

      function applyHourlyDepartmentSelection(value) {
        dashboardState.hourlyDepartment = normalizeHourlyDepartment(value);
        if (selectors.hourlyDepartmentInput) {
          selectors.hourlyDepartmentInput.value = dashboardState.hourlyDepartment === 'all'
            ? ''
            : dashboardState.hourlyDepartment;
        }
        setHourlyDepartmentSuggestions([]);
        handleHourlyFilterChange();
      }

      function updateHourlyDepartmentSuggestions(query, { force } = {}) {
        const options = Array.isArray(dashboardState.hourlyDepartmentOptions)
          ? dashboardState.hourlyDepartmentOptions
          : [];
        const normalizedQuery = String(query ?? '').trim().toLowerCase();
        if (!normalizedQuery && !force) {
          setHourlyDepartmentSuggestions([]);
          return;
        }
        const filtered = normalizedQuery
          ? options.filter((item) => item.toLowerCase().includes(normalizedQuery))
          : options.slice();
        const limited = filtered.slice(0, 24);
        if (!limited.length) {
          setHourlyDepartmentSuggestions([]);
          return;
        }
        if (dashboardState.hourlyDepartmentSuggestIndex >= limited.length) {
          dashboardState.hourlyDepartmentSuggestIndex = -1;
        }
        setHourlyDepartmentSuggestions(limited);
      }

      function syncHourlyDepartmentVisibility(metricValue) {
        if (!selectors.hourlyDepartmentInput) {
          return;
        }
        const normalizedMetric = normalizeHourlyMetric(metricValue);
        const shouldShow = normalizedMetric === HOURLY_METRIC_HOSPITALIZED;
        const field = selectors.hourlyDepartmentInput.closest('.heatmap-toolbar__field');
        if (field) {
          if (shouldShow) {
            field.removeAttribute('hidden');
          } else {
            field.setAttribute('hidden', 'hidden');
          }
        }
        selectors.hourlyDepartmentInput.disabled = !shouldShow;
        if (selectors.hourlyDepartmentToggle) {
          selectors.hourlyDepartmentToggle.disabled = !shouldShow;
        }
        const wrapper = selectors.hourlyDepartmentInput.closest('.hourly-department');
        if (wrapper) {
          wrapper.classList.toggle('is-disabled', !shouldShow);
        }
      }

      function matchesHourlyStayBucket(record, bucketKey) {
        const normalized = normalizeHourlyStayBucket(bucketKey);
        if (normalized === HOURLY_STAY_BUCKET_ALL) {
          return true;
        }
        let hours = null;
        const losMinutes = record?.losMinutes;
        if (Number.isFinite(losMinutes) && losMinutes >= 0) {
          hours = losMinutes / 60;
        } else if (record?.arrival instanceof Date && record?.discharge instanceof Date) {
          const diffMs = record.discharge.getTime() - record.arrival.getTime();
          if (Number.isFinite(diffMs) && diffMs >= 0) {
            hours = diffMs / 3600000;
          }
        }
        if (!Number.isFinite(hours) || hours < 0) {
          return false;
        }
        const bucket = HOURLY_STAY_BUCKETS.find((item) => item.key === normalized);
        if (!bucket) {
          return true;
        }
        if (Number.isFinite(bucket.max)) {
          return hours >= bucket.min && hours < bucket.max;
        }
        return hours >= bucket.min;
      }

      function matchesHourlyMetric(record, metricValue, departmentValue) {
        const metric = normalizeHourlyMetric(metricValue);
        if (metric === HOURLY_METRIC_ARRIVALS || metric === HOURLY_METRIC_DISCHARGES || metric === HOURLY_METRIC_BALANCE) {
          return true;
        }
        if (!record?.hospitalized) {
          return false;
        }
        const normalizedDepartment = normalizeHourlyDepartment(departmentValue);
        if (normalizedDepartment === 'all') {
          return true;
        }
        if (!isKnownHourlyDepartment(normalizedDepartment)) {
          return true;
        }
        const department = getRecordDepartment(record);
        return department === normalizedDepartment;
      }

      function computeHourlySeries(records, weekdayValue, stayBucket, metricValue, departmentValue) {
        const totals = {
          all: Array(24).fill(0),
          ems: Array(24).fill(0),
          self: Array(24).fill(0),
        };
        const outflowTotals = {
          all: Array(24).fill(0),
          ems: Array(24).fill(0),
          self: Array(24).fill(0),
        };
        const weekdayDays = Array.from({ length: 7 }, () => new Set());
        const allDays = new Set();
        const metric = normalizeHourlyMetric(metricValue);
        (Array.isArray(records) ? records : []).forEach((entry) => {
          const arrival = entry?.arrival instanceof Date && !Number.isNaN(entry.arrival.getTime()) ? entry.arrival : null;
          const discharge = entry?.discharge instanceof Date && !Number.isNaN(entry.discharge.getTime()) ? entry.discharge : null;
          const normalizedWeekday = normalizeHourlyWeekday(weekdayValue);
          if (!matchesHourlyStayBucket(entry, stayBucket)) {
            return;
          }
          if (!matchesHourlyMetric(entry, metricValue, departmentValue)) {
            return;
          }

          const addDay = (reference) => {
            const rawDay = reference.getDay();
            const dayIndex = (rawDay + 6) % 7;
            const dateKey = formatLocalDateKey(reference);
            if (dateKey) {
              weekdayDays[dayIndex].add(dateKey);
              allDays.add(dateKey);
            }
            return dayIndex;
          };

          if (metric === HOURLY_METRIC_BALANCE) {
            if (arrival) {
              const dayIndex = addDay(arrival);
              const hour = arrival.getHours();
              if (hour < 0 || hour > 23) {
                return;
              }
              if (normalizedWeekday === HOURLY_WEEKDAY_ALL || normalizedWeekday === dayIndex) {
                totals.all[hour] += 1;
                if (entry.ems) {
                  totals.ems[hour] += 1;
                } else {
                  totals.self[hour] += 1;
                }
              }
            }
            if (discharge) {
              const dayIndex = addDay(discharge);
              const hour = discharge.getHours();
              if (hour < 0 || hour > 23) {
                return;
              }
              if (normalizedWeekday === HOURLY_WEEKDAY_ALL || normalizedWeekday === dayIndex) {
                outflowTotals.all[hour] += 1;
                if (entry.ems) {
                  outflowTotals.ems[hour] += 1;
                } else {
                  outflowTotals.self[hour] += 1;
                }
              }
            }
            return;
          }

          let reference = null;
          if (metric === HOURLY_METRIC_ARRIVALS) {
            reference = arrival;
          } else if (metric === HOURLY_METRIC_DISCHARGES) {
            reference = entry?.hospitalized ? null : discharge;
          } else if (metric === HOURLY_METRIC_HOSPITALIZED) {
            reference = entry?.hospitalized ? arrival : null;
          } else {
            reference = arrival;
          }
          if (!reference) {
            return;
          }
          const hour = reference.getHours();
          if (hour < 0 || hour > 23) {
            return;
          }
          const dayIndex = addDay(reference);
          if (normalizedWeekday === HOURLY_WEEKDAY_ALL || normalizedWeekday === dayIndex) {
            totals.all[hour] += 1;
            if (entry.ems) {
              totals.ems[hour] += 1;
            } else {
              totals.self[hour] += 1;
            }
          }
        });
        const normalizedWeekday = normalizeHourlyWeekday(weekdayValue);
        const divisor = normalizedWeekday === HOURLY_WEEKDAY_ALL
          ? allDays.size
          : weekdayDays[normalizedWeekday]?.size || 0;
        const toAverage = (values) => values.map((value) => (divisor > 0 ? value / divisor : 0));
        const toNet = (values, outflow) => values.map((value, index) => value - (outflow[index] || 0));
        const netTotals = metric === HOURLY_METRIC_BALANCE
          ? {
            all: toNet(totals.all, outflowTotals.all),
            ems: toNet(totals.ems, outflowTotals.ems),
            self: toNet(totals.self, outflowTotals.self),
          }
          : null;
        const averages = metric === HOURLY_METRIC_BALANCE && netTotals
          ? {
            all: toAverage(netTotals.all),
            ems: toAverage(netTotals.ems),
            self: toAverage(netTotals.self),
          }
          : {
            all: toAverage(totals.all),
            ems: toAverage(totals.ems),
            self: toAverage(totals.self),
          };
        const hasData = metric === HOURLY_METRIC_BALANCE
          ? (totals.all.some((value) => value > 0) || outflowTotals.all.some((value) => value > 0))
          : totals.all.some((value) => value > 0);
        return { averages, hasData, divisor };
      }

      function getHourlyChartRecords(baseRecords, selectedYear, filters, period) {
        const sanitized = sanitizeChartFilters(filters, { getDefaultChartFilters, KPI_FILTER_LABELS });
        sanitized.arrival = 'all';
        const yearScopedRecords = filterRecordsByYear(baseRecords, selectedYear);
        const filteredRecords = filterRecordsByChartFilters(yearScopedRecords, sanitized);
        return filterRecordsByWindow(filteredRecords, period);
      }

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

      function resolveShiftStartHour(calculationSettings) {
        const fallback = Number.isFinite(Number(DEFAULT_SETTINGS?.calculations?.nightEndHour))
          ? Number(DEFAULT_SETTINGS.calculations.nightEndHour)
          : 7;
        if (Number.isFinite(Number(calculationSettings?.shiftStartHour))) {
          return Number(calculationSettings.shiftStartHour);
        }
        if (Number.isFinite(Number(calculationSettings?.nightEndHour))) {
          return Number(calculationSettings.nightEndHour);
        }
        return fallback;
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

      function computeFeedbackStats(records) {
        const list = Array.isArray(records) ? records.filter(Boolean) : [];
        const sorted = list
          .slice()
          .sort((a, b) => {
            const aTime = a?.receivedAt instanceof Date ? a.receivedAt.getTime() : -Infinity;
            const bTime = b?.receivedAt instanceof Date ? b.receivedAt.getTime() : -Infinity;
            return bTime - aTime;
          });

        const comments = sorted
          .map((entry) => {
            const text = typeof entry?.comment === 'string' ? entry.comment.trim() : '';
            if (!text) {
              return null;
            }
            const receivedAt = entry?.receivedAt instanceof Date && !Number.isNaN(entry.receivedAt.getTime())
              ? entry.receivedAt
              : null;
            return {
              text,
              receivedAt,
              respondent: typeof entry?.respondent === 'string' ? entry.respondent.trim() : '',
              location: typeof entry?.location === 'string' ? entry.location.trim() : '',
            };
          })
          .filter(Boolean);

        const totalResponses = sorted.length;
        const collectValues = (key, predicate = null) => sorted
          .filter((entry) => (typeof predicate === 'function' ? predicate(entry) : true))
          .map((entry) => {
            const value = entry?.[key];
            return Number.isFinite(value) ? Number(value) : null;
          })
          .filter((value) => Number.isFinite(value)
            && value >= FEEDBACK_RATING_MIN
            && value <= FEEDBACK_RATING_MAX);

        const overallRatings = collectValues('overallRating');
        const doctorsRatings = collectValues('doctorsRating');
        const nursesRatings = collectValues('nursesRating');
        const aidesRatings = collectValues('aidesRating', (entry) => entry?.aidesContact === true);
        const waitingRatings = collectValues('waitingRating');

        const average = (values) => (values.length
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : null);

        const contactResponses = sorted
          .filter((entry) => entry?.aidesContact === true || entry?.aidesContact === false)
          .length;
        const contactYes = sorted.filter((entry) => entry?.aidesContact === true).length;
        const contactShare = contactResponses > 0 ? contactYes / contactResponses : null;

        const monthlyMap = new Map();
        sorted.forEach((entry) => {
          if (!(entry?.receivedAt instanceof Date) || Number.isNaN(entry.receivedAt.getTime())) {
            return;
          }
          const dateKey = formatLocalDateKey(entry.receivedAt);
          if (!dateKey) {
            return;
          }
          const monthKey = dateKey.slice(0, 7);
          if (!monthKey) {
            return;
          }
          if (!monthlyMap.has(monthKey)) {
            monthlyMap.set(monthKey, {
              month: monthKey,
              responses: 0,
              overallSum: 0,
              overallCount: 0,
              doctorsSum: 0,
              doctorsCount: 0,
              nursesSum: 0,
              nursesCount: 0,
              aidesSum: 0,
              aidesCount: 0,
              waitingSum: 0,
              waitingCount: 0,
              contactResponses: 0,
              contactYes: 0,
            });
          }

          const bucket = monthlyMap.get(monthKey);
          bucket.responses += 1;

          if (Number.isFinite(entry?.overallRating)
            && entry.overallRating >= FEEDBACK_RATING_MIN
            && entry.overallRating <= FEEDBACK_RATING_MAX) {
            bucket.overallSum += Number(entry.overallRating);
            bucket.overallCount += 1;
          }
          if (Number.isFinite(entry?.doctorsRating)
            && entry.doctorsRating >= FEEDBACK_RATING_MIN
            && entry.doctorsRating <= FEEDBACK_RATING_MAX) {
            bucket.doctorsSum += Number(entry.doctorsRating);
            bucket.doctorsCount += 1;
          }
          if (Number.isFinite(entry?.nursesRating)
            && entry.nursesRating >= FEEDBACK_RATING_MIN
            && entry.nursesRating <= FEEDBACK_RATING_MAX) {
            bucket.nursesSum += Number(entry.nursesRating);
            bucket.nursesCount += 1;
          }
          if (entry?.aidesContact === true
            && Number.isFinite(entry?.aidesRating)
            && entry.aidesRating >= FEEDBACK_RATING_MIN
            && entry.aidesRating <= FEEDBACK_RATING_MAX) {
            bucket.aidesSum += Number(entry.aidesRating);
            bucket.aidesCount += 1;
          }
          if (Number.isFinite(entry?.waitingRating)
            && entry.waitingRating >= FEEDBACK_RATING_MIN
            && entry.waitingRating <= FEEDBACK_RATING_MAX) {
            bucket.waitingSum += Number(entry.waitingRating);
            bucket.waitingCount += 1;
          }
          if (entry?.aidesContact === true) {
            bucket.contactResponses += 1;
            bucket.contactYes += 1;
          } else if (entry?.aidesContact === false) {
            bucket.contactResponses += 1;
          }
        });

        const monthly = Array.from(monthlyMap.values()).map((bucket) => ({
          month: bucket.month,
          responses: bucket.responses,
          overallAverage: bucket.overallCount > 0 ? bucket.overallSum / bucket.overallCount : null,
          doctorsAverage: bucket.doctorsCount > 0 ? bucket.doctorsSum / bucket.doctorsCount : null,
          nursesAverage: bucket.nursesCount > 0 ? bucket.nursesSum / bucket.nursesCount : null,
          aidesAverage: bucket.aidesCount > 0 ? bucket.aidesSum / bucket.aidesCount : null,
          waitingAverage: bucket.waitingCount > 0 ? bucket.waitingSum / bucket.waitingCount : null,
          contactResponses: bucket.contactResponses,
          contactShare: bucket.contactResponses > 0 ? bucket.contactYes / bucket.contactResponses : null,
        }));

        const monthlySorted = monthly.slice().sort((a, b) => {
          if (a?.month === b?.month) {
            return 0;
          }
          if (!a?.month) {
            return 1;
          }
          if (!b?.month) {
            return -1;
          }
          return a.month > b.month ? 1 : -1;
        });

        return {
          summary: {
            totalResponses,
            overallAverage: average(overallRatings),
            doctorsAverage: average(doctorsRatings),
            nursesAverage: average(nursesRatings),
            aidesAverage: average(aidesRatings),
            waitingAverage: average(waitingRatings),
            overallCount: overallRatings.length,
            doctorsCount: doctorsRatings.length,
            nursesCount: nursesRatings.length,
            aidesResponses: aidesRatings.length,
            waitingCount: waitingRatings.length,
            contactResponses,
            contactYes,
            contactShare,
            comments,
          },
          monthly: monthlySorted,
        };
      }

      function sanitizeFeedbackFilters(filters, options = {}) {
        const defaults = getDefaultFeedbackFilters();
        const normalized = { ...defaults, ...(filters || {}) };
        const respondentValues = new Set([FEEDBACK_FILTER_ALL]);
        const locationValues = new Set([FEEDBACK_FILTER_ALL]);

        const respondentOptions = Array.isArray(options.respondent) ? options.respondent : [];
        respondentOptions.forEach((option) => {
          if (option && typeof option.value === 'string') {
            respondentValues.add(option.value);
          }
        });

        const locationOptions = Array.isArray(options.location) ? options.location : [];
        locationOptions.forEach((option) => {
          if (option && typeof option.value === 'string') {
            locationValues.add(option.value);
          }
        });

        if (!respondentValues.has(normalized.respondent)) {
          normalized.respondent = defaults.respondent;
        }
        if (!locationValues.has(normalized.location)) {
          normalized.location = defaults.location;
        }

        return normalized;
      }

      function normalizeFeedbackFilterValue(value) {
        if (typeof value !== 'string') {
          return '';
        }
        return value.trim().toLowerCase();
      }

      function buildFeedbackFilterOptions(records) {
        const filtersText = TEXT.feedback?.filters || {};
        const missingLabel = filtersText.missing || 'Nenurodyta';
        const respondentMap = new Map();
        const locationMap = new Map();

        const pushValue = (map, raw) => {
          const trimmed = typeof raw === 'string' ? raw.trim() : '';
          const key = trimmed ? trimmed.toLowerCase() : FEEDBACK_FILTER_MISSING;
          const existing = map.get(key) || {
            value: key,
            label: trimmed ? capitalizeSentence(trimmed) : missingLabel,
            count: 0,
            original: trimmed,
          };
          existing.count += 1;
          if (trimmed && !existing.original) {
            existing.original = trimmed;
            existing.label = capitalizeSentence(trimmed);
          }
          map.set(key, existing);
        };

        (Array.isArray(records) ? records : []).forEach((entry) => {
          pushValue(respondentMap, entry?.respondent);
          pushValue(locationMap, entry?.location);
        });

        const toOptions = (map) => Array.from(map.values())
          .filter((item) => Number.isFinite(item.count) && item.count > 0 && typeof item.value === 'string')
          .map((item) => ({
            value: item.value,
            label: item.label,
            count: item.count,
          }))
          .sort((a, b) => textCollator.compare(a.label, b.label));

        return {
          respondent: toOptions(respondentMap),
          location: toOptions(locationMap),
        };
      }

      function formatFeedbackFilterOption(option) {
        if (!option || typeof option !== 'object') {
          return '';
        }
        const label = option.label || '';
        const count = Number.isFinite(option.count) ? option.count : null;
        if (count != null && count > 0) {
          return `${label} (${numberFormatter.format(count)})`;
        }
        return label;
      }

      function buildFeedbackChipButtons(type, config, groupEl) {
        if (!groupEl) {
          return;
        }
        const filtersText = TEXT.feedback?.filters || {};
        const allLabel = type === 'respondent'
          ? (filtersText.respondent?.all || 'Visi dalyviai')
          : (filtersText.location?.all || 'Visos vietos');
        const items = [{ value: FEEDBACK_FILTER_ALL, label: allLabel }];
        (Array.isArray(config) ? config : []).forEach((option) => {
          if (!option || typeof option.value !== 'string') {
            return;
          }
          items.push({
            value: option.value,
            label: formatFeedbackFilterOption(option),
          });
        });
        const currentFilters = dashboardState.feedback.filters || getDefaultFeedbackFilters();
        const activeValue = type === 'respondent'
          ? (currentFilters.respondent || FEEDBACK_FILTER_ALL)
          : (currentFilters.location || FEEDBACK_FILTER_ALL);
        const buttons = items.map((item) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'chip-button';
          setDatasetValue(button, 'feedbackFilter', type);
          setDatasetValue(button, 'feedbackValue', item.value);
          button.textContent = item.label;
          button.setAttribute('aria-pressed', item.value === activeValue ? 'true' : 'false');
          return button;
        });
        groupEl.replaceChildren(...buttons);
      }

      function populateFeedbackFilterControls(options = dashboardState.feedback.filterOptions) {
        const config = options || { respondent: [], location: [] };
        const filtersText = TEXT.feedback?.filters || {};
        if (selectors.feedbackRespondentFilter) {
          const select = selectors.feedbackRespondentFilter;
          const items = [];
          const allOption = document.createElement('option');
          allOption.value = FEEDBACK_FILTER_ALL;
          allOption.textContent = filtersText.respondent?.all || 'Visi dalyviai';
          items.push(allOption);
          (Array.isArray(config.respondent) ? config.respondent : []).forEach((option) => {
            if (!option || typeof option.value !== 'string') {
              return;
            }
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = formatFeedbackFilterOption(option);
            items.push(opt);
          });
          select.replaceChildren(...items);
        }
        if (selectors.feedbackRespondentChips) {
          buildFeedbackChipButtons('respondent', config.respondent, selectors.feedbackRespondentChips);
        }
        if (selectors.feedbackLocationFilter) {
          const select = selectors.feedbackLocationFilter;
          const items = [];
          const allOption = document.createElement('option');
          allOption.value = FEEDBACK_FILTER_ALL;
          allOption.textContent = filtersText.location?.all || 'Visos vietos';
          items.push(allOption);
          (Array.isArray(config.location) ? config.location : []).forEach((option) => {
            if (!option || typeof option.value !== 'string') {
              return;
            }
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = formatFeedbackFilterOption(option);
            items.push(opt);
          });
          select.replaceChildren(...items);
        }
        if (selectors.feedbackLocationChips) {
          buildFeedbackChipButtons('location', config.location, selectors.feedbackLocationChips);
        }
        selectors.feedbackFilterButtons = Array.from(document.querySelectorAll('[data-feedback-filter]'));
      }

      function syncFeedbackFilterControls() {
        const filters = dashboardState.feedback.filters || getDefaultFeedbackFilters();
        if (selectors.feedbackRespondentFilter) {
          const select = selectors.feedbackRespondentFilter;
          const value = typeof filters.respondent === 'string' ? filters.respondent : FEEDBACK_FILTER_ALL;
          const hasOption = Array.from(select.options).some((option) => option.value === value);
          select.value = hasOption ? value : FEEDBACK_FILTER_ALL;
        }
        if (selectors.feedbackLocationFilter) {
          const select = selectors.feedbackLocationFilter;
          const value = typeof filters.location === 'string' ? filters.location : FEEDBACK_FILTER_ALL;
          const hasOption = Array.from(select.options).some((option) => option.value === value);
          select.value = hasOption ? value : FEEDBACK_FILTER_ALL;
        }
        if (Array.isArray(selectors.feedbackFilterButtons) && selectors.feedbackFilterButtons.length) {
          selectors.feedbackFilterButtons.forEach((button) => {
            if (!(button instanceof HTMLElement)) {
              return;
            }
            const type = getDatasetValue(button, 'feedbackFilter', '');
            const value = getDatasetValue(button, 'feedbackValue', FEEDBACK_FILTER_ALL);
            if (type !== 'respondent' && type !== 'location') {
              return;
            }
            const activeValue = type === 'respondent'
              ? (filters.respondent || FEEDBACK_FILTER_ALL)
              : (filters.location || FEEDBACK_FILTER_ALL);
            button.setAttribute('aria-pressed', value === activeValue ? 'true' : 'false');
          });
        }
      }

      function getFeedbackFilterLabel(type, value) {
        const filtersText = TEXT.feedback?.filters || {};
        if (value === FEEDBACK_FILTER_ALL || !value) {
          if (type === 'respondent') {
            return filtersText.respondent?.all || 'Visi dalyviai';
          }
          if (type === 'location') {
            return filtersText.location?.all || 'Visos vietos';
          }
          return '';
        }
        if (value === FEEDBACK_FILTER_MISSING) {
          return filtersText.missing || 'Nenurodyta';
        }
        const options = dashboardState.feedback.filterOptions?.[type];
        if (Array.isArray(options)) {
          const match = options.find((option) => option?.value === value);
          if (match) {
            return match.label || match.value;
          }
        }
        return value;
      }

      function updateFeedbackFiltersSummary(summary = dashboardState.feedback.summary) {
        const summaryElement = selectors.feedbackFiltersSummary;
        if (!summaryElement) {
          return;
        }
        const filters = dashboardState.feedback.filters || getDefaultFeedbackFilters();
        const filtersText = TEXT.feedback?.filters || {};
        const respondentLabel = getFeedbackFilterLabel('respondent', filters.respondent);
        const locationLabel = getFeedbackFilterLabel('location', filters.location);
        const parts = [];
        if (respondentLabel) {
          parts.push(respondentLabel);
        }
        if (locationLabel) {
          parts.push(locationLabel);
        }
        const baseText = parts.length
          ? (filtersText.summaryLabel ? `${filtersText.summaryLabel} ${parts.join(' • ')}` : parts.join(' • '))
          : filtersText.summaryDefault || '';
        const totalResponses = Number.isFinite(summary?.totalResponses) ? summary.totalResponses : null;
        const countLabel = filtersText.countLabel || TEXT.feedback?.table?.headers?.responses || 'Atsakymai';
        const countText = Number.isFinite(totalResponses) ? `${countLabel}: ${numberFormatter.format(totalResponses)}` : '';
        const finalText = baseText && countText ? `${baseText} • ${countText}` : (baseText || countText || filtersText.summaryDefault || '');
        summaryElement.textContent = finalText;
        const isDefault = filters.respondent === FEEDBACK_FILTER_ALL && filters.location === FEEDBACK_FILTER_ALL;
        setDatasetValue(summaryElement, 'default', isDefault ? 'true' : 'false');
      }

      function filterFeedbackRecords(records, filters) {
        const list = Array.isArray(records) ? records.filter(Boolean) : [];
        if (!filters) {
          return list;
        }
        return list.filter((entry) => {
          if (!entry) {
            return false;
          }
          const respondentValue = normalizeFeedbackFilterValue(entry.respondent);
          const locationValue = normalizeFeedbackFilterValue(entry.location);
          if (filters.respondent !== FEEDBACK_FILTER_ALL) {
            if (filters.respondent === FEEDBACK_FILTER_MISSING) {
              if (respondentValue) {
                return false;
              }
            } else if (respondentValue !== filters.respondent) {
              return false;
            }
          }
          if (filters.location !== FEEDBACK_FILTER_ALL) {
            if (filters.location === FEEDBACK_FILTER_MISSING) {
              if (locationValue) {
                return false;
              }
            } else if (locationValue !== filters.location) {
              return false;
            }
          }
          return true;
        });
      }

      function applyFeedbackFiltersAndRender() {
        const options = dashboardState.feedback.filterOptions || { respondent: [], location: [] };
        const sanitized = sanitizeFeedbackFilters(dashboardState.feedback.filters, options);
        dashboardState.feedback.filters = sanitized;
        syncFeedbackFilterControls();
        const filteredRecords = filterFeedbackRecords(dashboardState.feedback.records, sanitized);
        dashboardState.feedback.filteredRecords = filteredRecords;
        const feedbackStats = computeFeedbackStats(filteredRecords);
        dashboardState.feedback.summary = feedbackStats.summary;
        dashboardState.feedback.monthly = feedbackStats.monthly;
        renderFeedbackSection(feedbackStats);
        updateFeedbackFiltersSummary(feedbackStats.summary);
        return feedbackStats;
      }

      function handleFeedbackFilterChange(event) {
        const target = event?.target;
        if (!target || target.tagName !== 'SELECT') {
          return;
        }
        const { name, value } = target;
        if (name === 'respondent' || name === 'location') {
          dashboardState.feedback.filters = {
            ...dashboardState.feedback.filters,
            [name]: typeof value === 'string' ? value : FEEDBACK_FILTER_ALL,
          };
          applyFeedbackFiltersAndRender();
        }
      }

      function handleFeedbackFilterChipClick(event) {
        const target = event?.target;
        if (!(target instanceof Element)) {
          return;
        }
        const button = target.closest('button[data-feedback-filter][data-feedback-value]');
        if (!button) {
          return;
        }
        const type = getDatasetValue(button, 'feedbackFilter', '');
        if (type !== 'respondent' && type !== 'location') {
          return;
        }
        const value = getDatasetValue(button, 'feedbackValue', FEEDBACK_FILTER_ALL);
        dashboardState.feedback.filters = {
          ...dashboardState.feedback.filters,
          [type]: typeof value === 'string' ? value : FEEDBACK_FILTER_ALL,
        };
        applyFeedbackFiltersAndRender();
      }

      function updateFeedbackFilterOptions(records) {
        const options = buildFeedbackFilterOptions(records);
        dashboardState.feedback.filterOptions = options;
        populateFeedbackFilterControls(options);
        dashboardState.feedback.filters = sanitizeFeedbackFilters(dashboardState.feedback.filters, options);
        syncFeedbackFilterControls();
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

      function refreshKpiWindowOptions() {
        const select = selectors.kpiWindow;
        if (!select) {
          return;
        }
        const configuredWindowRaw = Number.isFinite(Number(settings?.calculations?.windowDays))
          ? Number(settings.calculations.windowDays)
          : DEFAULT_SETTINGS.calculations.windowDays;
        const configuredWindow = Number.isFinite(configuredWindowRaw) && configuredWindowRaw > 0
          ? configuredWindowRaw
          : DEFAULT_KPI_WINDOW_DAYS;
        const currentWindowRaw = Number.isFinite(Number(dashboardState.kpi?.filters?.window))
          ? Number(dashboardState.kpi.filters.window)
          : configuredWindow;
        const currentWindow = Number.isFinite(currentWindowRaw) && currentWindowRaw > 0
          ? currentWindowRaw
          : configuredWindow;
        const uniqueValues = [...new Set([...KPI_WINDOW_OPTION_BASE, configuredWindow, currentWindow])]
          .filter((value) => Number.isFinite(value) && value >= 0)
          .sort((a, b) => {
            if (a === 0) return 1;
            if (b === 0) return -1;
            return a - b;
          });
        const options = uniqueValues.map((value) => {
          const option = document.createElement('option');
          option.value = String(value);
          if (value === 0) {
            option.textContent = TEXT.kpis.windowAllLabel;
          } else if (value === 365) {
            option.textContent = `${value} d. (${TEXT.kpis.windowYearSuffix})`;
          } else {
            option.textContent = `${value} d.`;
          }
          return option;
        });
        select.replaceChildren(...options);
      }

      function syncKpiSegmentedButtons() {
        const filters = dashboardState.kpi?.filters || getDefaultKpiFilters();
        if (Array.isArray(selectors.kpiArrivalButtons) && selectors.kpiArrivalButtons.length) {
          selectors.kpiArrivalButtons.forEach((button) => {
            const value = getDatasetValue(button, 'kpiArrival');
            if (!value) {
              return;
            }
            button.setAttribute('aria-pressed', String(value === filters.arrival));
          });
        }
        if (Array.isArray(selectors.kpiCardTypeButtons) && selectors.kpiCardTypeButtons.length) {
          selectors.kpiCardTypeButtons.forEach((button) => {
            const value = getDatasetValue(button, 'kpiCardType');
            if (!value) {
              return;
            }
            button.setAttribute('aria-pressed', String(value === filters.cardType));
          });
        }
      }

      function syncKpiFilterControls() {
        const filters = dashboardState.kpi.filters;
        if (selectors.kpiWindow && Number.isFinite(filters.window)) {
          const windowValue = String(filters.window);
          const existing = Array.from(selectors.kpiWindow.options).some((option) => option.value === windowValue);
          if (!existing) {
            const option = document.createElement('option');
            option.value = windowValue;
            option.textContent = `${filters.window} d.`;
            selectors.kpiWindow.appendChild(option);
          }
          selectors.kpiWindow.value = windowValue;
        }
        if (selectors.kpiShift) {
          selectors.kpiShift.value = filters.shift;
        }
        if (selectors.kpiArrival) {
          selectors.kpiArrival.value = filters.arrival;
        }
        if (selectors.kpiDisposition) {
          selectors.kpiDisposition.value = filters.disposition;
        }
        if (selectors.kpiCardType) {
          selectors.kpiCardType.value = filters.cardType;
        }
        if (selectors.kpiDateInput) {
          selectors.kpiDateInput.value = normalizeKpiDateValue(dashboardState.kpi?.selectedDate) || '';
        }
        syncKpiSegmentedButtons();
        updateKpiSubtitle();
      }

      function syncChartFilterControls() {
        const filters = sanitizeChartFilters(dashboardState.chartFilters, { getDefaultChartFilters, KPI_FILTER_LABELS });
        dashboardState.chartFilters = { ...filters };
        const compareActive = Boolean(filters.compareGmp);
        if (selectors.chartFilterArrival) {
          selectors.chartFilterArrival.value = filters.arrival;
          selectors.chartFilterArrival.disabled = compareActive;
          if (compareActive) {
            selectors.chartFilterArrival.title = 'Palyginimo režimas: atvykimo tipas fiksuotas';
          } else {
            selectors.chartFilterArrival.removeAttribute('title');
          }
        }
        if (selectors.chartFilterDisposition) {
          selectors.chartFilterDisposition.value = filters.disposition;
        }
        if (selectors.chartFilterCardType) {
          selectors.chartFilterCardType.value = filters.cardType;
        }
        if (selectors.chartFilterCompareGmp) {
          selectors.chartFilterCompareGmp.checked = compareActive;
        }
        syncChartSegmentedButtons(compareActive);
      }

      function syncChartSegmentedButtons(compareActive = false) {
        const filters = sanitizeChartFilters(dashboardState.chartFilters, { getDefaultChartFilters, KPI_FILTER_LABELS });
        if (Array.isArray(selectors.chartFilterArrivalButtons) && selectors.chartFilterArrivalButtons.length) {
          selectors.chartFilterArrivalButtons.forEach((button) => {
            const value = getDatasetValue(button, 'chartArrival');
            if (!value) {
              return;
            }
            const isActive = value === filters.arrival;
            button.setAttribute('aria-pressed', String(isActive));
            button.disabled = compareActive;
            button.setAttribute('aria-disabled', String(compareActive));
            if (compareActive) {
              button.title = 'Palyginimo režimas: atvykimo tipas fiksuotas';
            } else {
              button.removeAttribute('title');
            }
          });
        }
        if (Array.isArray(selectors.chartFilterDispositionButtons) && selectors.chartFilterDispositionButtons.length) {
          selectors.chartFilterDispositionButtons.forEach((button) => {
            const value = getDatasetValue(button, 'chartDisposition');
            if (!value) {
              return;
            }
            button.setAttribute('aria-pressed', String(value === filters.disposition));
          });
        }
        if (Array.isArray(selectors.chartFilterCardTypeButtons) && selectors.chartFilterCardTypeButtons.length) {
          selectors.chartFilterCardTypeButtons.forEach((button) => {
            const value = getDatasetValue(button, 'chartCardType');
            if (!value) {
              return;
            }
            button.setAttribute('aria-pressed', String(value === filters.cardType));
          });
        }
      }

      function updateChartFiltersSummary({ records, daily } = {}) {
        if (!selectors.chartFiltersSummary) {
          return;
        }
        const filters = sanitizeChartFilters(dashboardState.chartFilters, { getDefaultChartFilters, KPI_FILTER_LABELS });
        const defaults = getDefaultChartFilters();
        const summaryParts = [];
        if (filters.compareGmp) {
          summaryParts.push(TEXT.charts?.compareGmpSummary || 'GMP vs be GMP');
        }
        if (!filters.compareGmp && filters.arrival !== defaults.arrival) {
          summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.arrival[filters.arrival]));
        }
        if (filters.disposition !== defaults.disposition) {
          summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.disposition[filters.disposition]));
        }
        if (filters.cardType !== defaults.cardType) {
          summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.cardType[filters.cardType]));
        }
        const hasRecords = Array.isArray(records) ? records.length > 0 : false;
        const hasDaily = Array.isArray(daily)
          ? daily.some((entry) => Number.isFinite(entry?.count) && entry.count > 0)
          : false;
        const hasData = hasRecords || hasDaily;
        let text = summaryParts.join(' • ');
        if (!hasData) {
          text = text ? `Įrašų nerasta • ${text}` : 'Įrašų nerasta';
        }
        if (!text) {
        selectors.chartFiltersSummary.textContent = '';
          setDatasetValue(selectors.chartFiltersSummary, 'default', 'true');
          return;
        }
        selectors.chartFiltersSummary.textContent = text;
        setDatasetValue(selectors.chartFiltersSummary, 'default', 'false');
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

      function recordMatchesKpiFilters(record, filters) {
        if (!record) {
          return false;
        }
        if (filters.shift === 'day' && record.night) {
          return false;
        }
        if (filters.shift === 'night' && !record.night) {
          return false;
        }
        return matchesSharedPatientFilters(record, filters);
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

      function toSentenceCase(label) {
        if (typeof label !== 'string' || !label.length) {
          return '';
        }
        return label.charAt(0).toUpperCase() + label.slice(1);
      }

      function updateKpiSummary({ records, dailyStats, windowDays }) {
        if (!selectors.kpiActiveInfo) {
          return;
        }
        const filters = dashboardState.kpi.filters;
        const selectedDate = normalizeKpiDateValue(dashboardState.kpi?.selectedDate);
        const isDateFiltered = Boolean(selectedDate);
        const defaultFilters = getDefaultKpiFilters();
        const totalRecords = Array.isArray(records) ? records.length : 0;
        const hasAggregatedData = Array.isArray(dailyStats)
          ? dailyStats.some((entry) => Number.isFinite(entry?.count) && entry.count > 0)
          : false;
        const hasData = totalRecords > 0 || hasAggregatedData;
        const summaryParts = [];
        const isWindowDefault = Number.isFinite(windowDays)
          ? windowDays === defaultFilters.window
          : false;
        const isShiftDefault = filters.shift === defaultFilters.shift;
        const isArrivalDefault = filters.arrival === defaultFilters.arrival;
        const isDispositionDefault = filters.disposition === defaultFilters.disposition;
        const isCardTypeDefault = filters.cardType === defaultFilters.cardType;

        if (!isDateFiltered && Number.isFinite(windowDays) && windowDays > 0 && !isWindowDefault) {
          summaryParts.push(`${windowDays} d.`);
        }
        if (!isShiftDefault) {
          summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.shift[filters.shift]));
        }
        if (!isArrivalDefault) {
          summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.arrival[filters.arrival]));
        }
        if (!isDispositionDefault) {
          summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.disposition[filters.disposition]));
        }
        if (!isCardTypeDefault) {
          summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.cardType[filters.cardType]));
        }
        let text = summaryParts.join(' • ');
        if (!hasData) {
          text = text ? `Įrašų nerasta • ${text}` : 'Įrašų nerasta';
        }
        if (!text) {
        selectors.kpiActiveInfo.textContent = '';
          setDatasetValue(selectors.kpiActiveInfo, 'default', 'true');
          return;
        }
        selectors.kpiActiveInfo.textContent = text;
        setDatasetValue(selectors.kpiActiveInfo, 'default', 'false');
      }

      function applyKpiFiltersLocally(filters) {
        const normalizedFilters = sanitizeKpiFilters(filters, { getDefaultKpiFilters, KPI_FILTER_LABELS });
        const windowDays = Number.isFinite(normalizedFilters.window)
          ? normalizedFilters.window
          : DEFAULT_SETTINGS.calculations.windowDays;
        const hasPrimaryRecords = Array.isArray(dashboardState.primaryRecords)
          && dashboardState.primaryRecords.length > 0;
        const primaryDailyStats = Array.isArray(dashboardState.primaryDaily)
          ? dashboardState.primaryDaily
          : [];
        let filteredRecords = [];
        let filteredDailyStats = [];

        if (hasPrimaryRecords) {
          const scopedRecords = filterRecordsByShiftWindow(dashboardState.primaryRecords, windowDays);
          filteredRecords = scopedRecords.filter((record) => recordMatchesKpiFilters(record, normalizedFilters));
          filteredDailyStats = computeDailyStats(filteredRecords);
        } else {
          const scopedDaily = filterDailyStatsByWindow(primaryDailyStats, windowDays);
          filteredDailyStats = scopedDaily.slice();
        }

        return {
          filters: normalizedFilters,
          records: filteredRecords,
          dailyStats: filteredDailyStats,
          windowDays,
        };
      }

      async function applyKpiFiltersAndRender() {
        const normalizedFilters = sanitizeKpiFilters(dashboardState.kpi.filters, { getDefaultKpiFilters, KPI_FILTER_LABELS });
        dashboardState.kpi.filters = { ...normalizedFilters };
        const defaultFilters = getDefaultKpiFilters();
        const windowDays = normalizedFilters.window;
        const workerPayload = {
          filters: normalizedFilters,
          defaultFilters,
          windowDays,
          records: Array.isArray(dashboardState.primaryRecords) ? dashboardState.primaryRecords : [],
          dailyStats: Array.isArray(dashboardState.primaryDaily) ? dashboardState.primaryDaily : [],
          calculations: settings?.calculations || {},
          calculationDefaults: DEFAULT_SETTINGS.calculations,
        };
        const jobToken = ++kpiWorkerJobToken;

        showKpiSkeleton();
        try {
          const result = await runKpiWorkerJob(workerPayload);
          if (jobToken !== kpiWorkerJobToken) {
            return;
          }
          const filteredRecords = Array.isArray(result?.records) ? result.records : [];
          const filteredDailyStats = Array.isArray(result?.dailyStats) ? result.dailyStats : [];
          const effectiveWindow = Number.isFinite(result?.windowDays) ? result.windowDays : windowDays;
          dashboardState.kpi.records = filteredRecords;
          dashboardState.kpi.daily = filteredDailyStats;
          const selectedDate = normalizeKpiDateValue(dashboardState.kpi?.selectedDate);
          const shiftStartHour = resolveShiftStartHour(settings?.calculations || {});
          const dateFilteredRecords = selectedDate
            ? filterKpiRecordsByDate(filteredRecords, selectedDate, shiftStartHour)
            : filteredRecords;
          const dateFilteredDailyStats = selectedDate
            ? computeDailyStats(dateFilteredRecords, settings?.calculations, DEFAULT_SETTINGS)
            : filteredDailyStats;
          renderKpis(dateFilteredDailyStats, filteredDailyStats);
          const lastShiftRecords = selectedDate ? dateFilteredRecords : filteredRecords;
          const lastShiftDaily = selectedDate ? dateFilteredDailyStats : filteredDailyStats;
          renderLastShiftHourlyChart(lastShiftRecords, lastShiftDaily);
          updateKpiSummary({
            records: dateFilteredRecords,
            dailyStats: dateFilteredDailyStats,
            windowDays: selectedDate ? null : effectiveWindow,
          });
          updateKpiSubtitle();
        } catch (error) {
          const errorInfo = describeError(error, { code: 'KPI_WORKER', message: 'Nepavyko pritaikyti KPI filtrų worker\'yje' });
          console.error(errorInfo.log, error);
          if (jobToken !== kpiWorkerJobToken) {
            return;
          }
          const fallback = applyKpiFiltersLocally(normalizedFilters);
          dashboardState.kpi.records = fallback.records;
          dashboardState.kpi.daily = fallback.dailyStats;
          const selectedDate = normalizeKpiDateValue(dashboardState.kpi?.selectedDate);
          const shiftStartHour = resolveShiftStartHour(settings?.calculations || {});
          const dateFilteredRecords = selectedDate
            ? filterKpiRecordsByDate(fallback.records, selectedDate, shiftStartHour)
            : fallback.records;
          const dateFilteredDailyStats = selectedDate
            ? computeDailyStats(dateFilteredRecords, settings?.calculations, DEFAULT_SETTINGS)
            : fallback.dailyStats;
          renderKpis(dateFilteredDailyStats, fallback.dailyStats);
          const lastShiftRecords = selectedDate ? dateFilteredRecords : fallback.records;
          const lastShiftDaily = selectedDate ? dateFilteredDailyStats : fallback.dailyStats;
          renderLastShiftHourlyChart(lastShiftRecords, lastShiftDaily);
          updateKpiSummary({
            records: dateFilteredRecords,
            dailyStats: dateFilteredDailyStats,
            windowDays: selectedDate ? null : fallback.windowDays,
          });
          updateKpiSubtitle();
        }
      }

      function handleKpiFilterInput(event) {
        const target = event.target;
        if (!target || !('name' in target)) {
          return;
        }
        const { name, value } = target;
        const filters = dashboardState.kpi.filters;
        if (name === 'window') {
          const numeric = Number.parseInt(value, 10);
          if (Number.isFinite(numeric) && numeric >= 0) {
            filters.window = numeric;
          }
        } else if (name === 'shift' && value in KPI_FILTER_LABELS.shift) {
          filters.shift = value;
        } else if (name === 'arrival' && value in KPI_FILTER_LABELS.arrival) {
          filters.arrival = value;
        } else if (name === 'disposition' && value in KPI_FILTER_LABELS.disposition) {
          filters.disposition = value;
        } else if (name === 'cardType' && value in KPI_FILTER_LABELS.cardType) {
          filters.cardType = value;
        }
        syncKpiSegmentedButtons();
        void applyKpiFiltersAndRender();
      }

      function handleKpiDateInput(event) {
        const target = event.target;
        if (!target || !('value' in target)) {
          return;
        }
        const normalized = normalizeKpiDateValue(target.value);
        dashboardState.kpi.selectedDate = normalized;
        updateKpiSubtitle();
        void applyKpiFiltersAndRender();
      }

      function handleKpiDateClear() {
        dashboardState.kpi.selectedDate = null;
        if (selectors.kpiDateInput) {
          selectors.kpiDateInput.value = '';
        }
        updateKpiSubtitle();
        void applyKpiFiltersAndRender();
      }

      function handleKpiSegmentedClick(event) {
        const button = event.currentTarget;
        if (!(button instanceof HTMLElement)) {
          return;
        }
        const arrival = getDatasetValue(button, 'kpiArrival');
        if (arrival && selectors.kpiArrival) {
          selectors.kpiArrival.value = arrival;
          selectors.kpiArrival.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        const cardType = getDatasetValue(button, 'kpiCardType');
        if (cardType && selectors.kpiCardType) {
          selectors.kpiCardType.value = cardType;
          selectors.kpiCardType.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      function handleLastShiftMetricClick(event) {
        const button = event.currentTarget;
        if (!(button instanceof HTMLElement)) {
          return;
        }
        const metric = normalizeLastShiftMetric(getDatasetValue(button, 'lastShiftMetric'));
        dashboardState.kpi.lastShiftHourlyMetric = metric;
        syncLastShiftHourlyMetricButtons();
        const selectedDate = normalizeKpiDateValue(dashboardState.kpi?.selectedDate);
        const baseRecords = Array.isArray(dashboardState.kpi?.records) ? dashboardState.kpi.records : [];
        const baseDaily = Array.isArray(dashboardState.kpi?.daily) ? dashboardState.kpi.daily : [];
        if (selectedDate) {
          const shiftStartHour = resolveShiftStartHour(settings?.calculations || {});
          const dateFilteredRecords = filterKpiRecordsByDate(baseRecords, selectedDate, shiftStartHour);
          const dateFilteredDailyStats = computeDailyStats(dateFilteredRecords, settings?.calculations, DEFAULT_SETTINGS);
          renderLastShiftHourlyChart(dateFilteredRecords, dateFilteredDailyStats);
          return;
        }
        renderLastShiftHourlyChart(baseRecords, baseDaily);
      }

      function syncLastShiftHourlyMetricButtons() {
        if (!Array.isArray(selectors.lastShiftHourlyMetricButtons)) {
          return;
        }
        const metric = normalizeLastShiftMetric(dashboardState.kpi.lastShiftHourlyMetric);
        selectors.lastShiftHourlyMetricButtons.forEach((btn) => {
          const btnMetric = normalizeLastShiftMetric(getDatasetValue(btn, 'lastShiftMetric'));
          btn.setAttribute('aria-pressed', btnMetric === metric ? 'true' : 'false');
        });
      }

      function handleChartFilterChange(event) {
        const target = event.target;
        if (!target || !('name' in target)) {
          return;
        }
        const { name, value } = target;
        const filters = { ...dashboardState.chartFilters };
        if (name === 'arrival' && value in KPI_FILTER_LABELS.arrival) {
          filters.arrival = value;
        } else if (name === 'disposition' && value in KPI_FILTER_LABELS.disposition) {
          filters.disposition = value;
        } else if (name === 'cardType' && value in KPI_FILTER_LABELS.cardType) {
          filters.cardType = value;
        } else if (name === 'compareGmp') {
          filters.compareGmp = Boolean(target.checked);
        }
        if (filters.compareGmp) {
          filters.arrival = 'all';
        }
        dashboardState.chartFilters = filters;
        void applyChartFilters();
      }

      function handleChartSegmentedClick(event) {
        const button = event.currentTarget;
        if (!(button instanceof HTMLElement)) {
          return;
        }
        if (button.disabled) {
          return;
        }
        const arrival = getDatasetValue(button, 'chartArrival');
        if (arrival && selectors.chartFilterArrival) {
          selectors.chartFilterArrival.value = arrival;
          selectors.chartFilterArrival.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        const disposition = getDatasetValue(button, 'chartDisposition');
        if (disposition && selectors.chartFilterDisposition) {
          selectors.chartFilterDisposition.value = disposition;
          selectors.chartFilterDisposition.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        const cardType = getDatasetValue(button, 'chartCardType');
        if (cardType && selectors.chartFilterCardType) {
          selectors.chartFilterCardType.value = cardType;
          selectors.chartFilterCardType.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      function applyChartFilters() {
        const sanitized = sanitizeChartFilters(dashboardState.chartFilters, { getDefaultChartFilters, KPI_FILTER_LABELS });
        dashboardState.chartFilters = { ...sanitized };
        syncChartFilterControls();
        const hasBaseData = (Array.isArray(dashboardState.chartData.baseDaily) && dashboardState.chartData.baseDaily.length)
          || (Array.isArray(dashboardState.dailyStats) && dashboardState.dailyStats.length);
        if (!hasBaseData) {
          updateChartFiltersSummary({ records: [], daily: [] });
          if (selectors.dailyCaptionContext) {
            selectors.dailyCaptionContext.textContent = '';
          }
          return Promise.resolve();
        }
        const scoped = prepareChartDataForPeriod(dashboardState.chartPeriod);
        return renderCharts(scoped.daily, scoped.funnel, scoped.heatmap)
          .catch((error) => {
            const errorInfo = describeError(error, { code: 'CHART_FILTERS', message: 'Nepavyko pritaikyti grafiko filtrų' });
            console.error(errorInfo.log, error);
            showChartError(TEXT.charts?.errorLoading);
          });
      }

      function resetKpiFilters({ fromKeyboard } = {}) {
        dashboardState.kpi.filters = getDefaultKpiFilters();
        refreshKpiWindowOptions();
        syncKpiFilterControls();
        void applyKpiFiltersAndRender();
        if (fromKeyboard && selectors.kpiFiltersReset) {
          selectors.kpiFiltersReset.focus();
        }
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

      function computeShiftDateKeyForArrival(date, shiftStartHour) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
          return '';
        }
        const dayMinutes = 24 * 60;
        const startMinutesRaw = Number.isFinite(Number(shiftStartHour)) ? Number(shiftStartHour) * 60 : 7 * 60;
        const startMinutes = ((Math.round(startMinutesRaw) % dayMinutes) + dayMinutes) % dayMinutes;
        const arrivalMinutes = date.getHours() * 60 + date.getMinutes();
        const shiftAnchor = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        if (arrivalMinutes < startMinutes) {
          shiftAnchor.setDate(shiftAnchor.getDate() - 1);
        }
        return formatLocalDateKey(shiftAnchor);
      }

      function normalizeKpiDateValue(value) {
        if (typeof value !== 'string') {
          return null;
        }
        const trimmed = value.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
          return null;
        }
        return trimmed;
      }

      function formatKpiDateLabel(dateKey) {
        const normalized = normalizeKpiDateValue(dateKey);
        if (!normalized) {
          return '';
        }
        const date = dateKeyToDate(normalized);
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
          return '';
        }
        const weekday = weekdayLongFormatter.format(date).toLowerCase();
        return `${normalized} (${weekday})`;
      }

      function getRecordShiftDateKey(record, shiftStartHour) {
        if (!record) {
          return '';
        }
        const arrival = record.arrival instanceof Date && !Number.isNaN(record.arrival.getTime())
          ? record.arrival
          : null;
        const discharge = record.discharge instanceof Date && !Number.isNaN(record.discharge.getTime())
          ? record.discharge
          : null;
        const reference = arrival || discharge;
        return reference ? computeShiftDateKeyForArrival(reference, shiftStartHour) : '';
      }

      function filterKpiRecordsByDate(records, dateKey, shiftStartHour) {
        const list = Array.isArray(records) ? records : [];
        const normalized = normalizeKpiDateValue(dateKey);
        if (!normalized) {
          return list;
        }
        return list.filter((record) => getRecordShiftDateKey(record, shiftStartHour) === normalized);
      }

      function updateKpiSubtitle() {
        if (!selectors.kpiSubtitle) {
          return;
        }
        const selectedDate = normalizeKpiDateValue(dashboardState.kpi?.selectedDate);
        if (selectedDate) {
          const label = formatKpiDateLabel(selectedDate);
          selectors.kpiSubtitle.textContent = label || selectedDate;
          return;
        }
        selectors.kpiSubtitle.textContent = TEXT.kpis.subtitle;
      }

      function getLastShiftMetricLabel(metric) {
        switch (metric) {
          case LAST_SHIFT_METRIC_DISCHARGES:
            return 'Išleidimai';
          case LAST_SHIFT_METRIC_HOSPITALIZED:
            return 'Hospitalizacijos';
          case LAST_SHIFT_METRIC_BALANCE:
            return 'Srautų balansas';
          default:
            return 'Atvykimai';
        }
      }

      function normalizeLastShiftMetric(value) {
        const raw = typeof value === 'string' ? value : String(value ?? '');
        if (LAST_SHIFT_METRICS.includes(raw)) {
          return raw;
        }
        return LAST_SHIFT_METRIC_ARRIVALS;
      }

      function buildLastShiftHourlySeries(records, dailyStats, metricKey = LAST_SHIFT_METRIC_ARRIVALS) {
        const lastShiftSummary = buildLastShiftSummary(dailyStats);
        if (!lastShiftSummary?.dateKey) {
          return null;
        }
        const metric = normalizeLastShiftMetric(metricKey);
        const shiftStartHour = resolveShiftStartHour(settings?.calculations || {});
        const targetDateKey = lastShiftSummary.dateKey;
        const series = {
          total: Array(24).fill(0),
          t: Array(24).fill(0),
          tr: Array(24).fill(0),
          ch: Array(24).fill(0),
          outflow: Array(24).fill(0),
          net: Array(24).fill(0),
        };
        (Array.isArray(records) ? records : []).forEach((record) => {
          const arrival = record?.arrival;
          const discharge = record?.discharge;
          let reference = null;
          if (metric === LAST_SHIFT_METRIC_ARRIVALS) {
            reference = arrival instanceof Date && !Number.isNaN(arrival.getTime()) ? arrival : null;
          } else if (metric === LAST_SHIFT_METRIC_DISCHARGES) {
            reference = discharge instanceof Date && !Number.isNaN(discharge.getTime()) ? discharge : null;
          } else if (metric === LAST_SHIFT_METRIC_HOSPITALIZED) {
            if (record?.hospitalized) {
              reference = discharge instanceof Date && !Number.isNaN(discharge.getTime()) ? discharge : null;
            }
          } else if (metric === LAST_SHIFT_METRIC_BALANCE) {
            reference = arrival instanceof Date && !Number.isNaN(arrival.getTime()) ? arrival : null;
          }
          if (!reference) {
            return;
          }
          const dateKey = computeShiftDateKeyForArrival(reference, shiftStartHour);
          if (dateKey !== targetDateKey) {
            return;
          }
          const hour = reference.getHours();
          if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
            return;
          }
          series.total[hour] += 1;
          const rawType = typeof record.cardType === 'string' ? record.cardType.trim().toLowerCase() : '';
          if (rawType === 't') {
            series.t[hour] += 1;
          } else if (rawType === 'tr') {
            series.tr[hour] += 1;
          } else if (rawType === 'ch') {
            series.ch[hour] += 1;
          }
        });
        if (metric === LAST_SHIFT_METRIC_BALANCE) {
          (Array.isArray(records) ? records : []).forEach((record) => {
            const discharge = record?.discharge;
            if (!(discharge instanceof Date) || Number.isNaN(discharge.getTime())) {
              return;
            }
            const dateKey = computeShiftDateKeyForArrival(discharge, shiftStartHour);
            if (dateKey !== targetDateKey) {
              return;
            }
            const hour = discharge.getHours();
            if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
              return;
            }
            series.outflow[hour] += 1;
          });
          series.net = series.total.map((value, index) => value - (series.outflow[index] || 0));
        }
        const hasData = series.total.some((value) => value > 0);
        return {
          dateKey: targetDateKey,
          dateLabel: lastShiftSummary.dateLabel || targetDateKey,
          shiftStartHour,
          metric,
          metricLabel: getLastShiftMetricLabel(metric),
          series,
          hasData: metric === LAST_SHIFT_METRIC_BALANCE
            ? (series.total.some((value) => value > 0) || series.outflow.some((value) => value > 0))
            : hasData,
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

      function showEdSkeleton() {
        const container = selectors.edCards;
        if (!container || getDatasetValue(container, 'skeleton') === 'true') {
          return;
        }
        const template = document.getElementById('edSkeleton');
        if (selectors.edStandardSection) {
          selectors.edStandardSection.setAttribute('aria-busy', 'true');
        }
        setDatasetValue(container, 'skeleton', 'true');
        if (template instanceof HTMLTemplateElement) {
          const skeletonFragment = template.content.cloneNode(true);
          container.replaceChildren(skeletonFragment);
        } else {
          container.replaceChildren();
        }
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

      function renderLastShiftHourlyChart(records, dailyStats) {
        const metricKey = dashboardState.kpi?.lastShiftHourlyMetric || LAST_SHIFT_METRIC_ARRIVALS;
        const seriesInfo = buildLastShiftHourlySeries(records, dailyStats, metricKey);
        dashboardState.kpi.lastShiftHourly = seriesInfo;
        chartRenderers.renderLastShiftHourlyChartWithTheme(seriesInfo).catch((error) => {
          const errorInfo = describeError(error, { code: 'LAST_SHIFT_HOURLY', message: 'Nepavyko atnaujinti paskutinės pamainos grafiko' });
          console.error(errorInfo.log, error);
          setChartCardMessage(selectors.lastShiftHourlyChart, TEXT.charts?.errorLoading);
        });
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

      function resetEdCommentRotation() {
        const rotation = dashboardState?.ed?.commentRotation;
        if (rotation?.timerId) {
          window.clearInterval(rotation.timerId);
        }
        if (dashboardState?.ed) {
          dashboardState.ed.commentRotation = { timerId: null, index: 0, entries: [] };
        }
      }

      function applyEdCommentAutoScroll(wrapper) {
        if (!wrapper) {
          return;
        }
        const scroller = wrapper.querySelector('.ed-dashboard__comment-scroller');
        if (!scroller) {
          return;
        }

        scroller.style.removeProperty('--scroll-distance');
        scroller.style.removeProperty('--scroll-duration');
        scroller.style.transform = 'translateY(0)';
        wrapper.classList.remove('is-scrollable');

        window.requestAnimationFrame(() => {
          const containerHeight = wrapper.clientHeight;
          const contentHeight = scroller.scrollHeight;
          const overflow = contentHeight - containerHeight;
          if (overflow > 4) {
            const duration = Math.min(30000, Math.max(8000, overflow * 80));
            scroller.style.setProperty('--scroll-distance', `${overflow}px`);
            scroller.style.setProperty('--scroll-duration', `${duration}ms`);
            wrapper.classList.add('is-scrollable');
          }
        });
      }

      function renderEdCommentsCard(cardElement, cardConfig, rawComments, fallbackMeta = '') {
        const wrapper = document.createElement('div');
        wrapper.className = 'ed-dashboard__comment-wrapper';

        const scroller = document.createElement('div');
        scroller.className = 'ed-dashboard__comment-scroller';

        const content = document.createElement('p');
        content.className = 'ed-dashboard__comment';
        content.setAttribute('aria-live', 'polite');

        const meta = document.createElement('p');
        meta.className = 'ed-dashboard__card-meta ed-dashboard__comment-meta';

        scroller.append(content, meta);
        wrapper.appendChild(scroller);
        cardElement.appendChild(wrapper);

        const rotation = dashboardState.ed.commentRotation || { timerId: null, index: 0, entries: [] };
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
        dashboardState.ed.commentRotation = rotation;

        if (!rotation.entries.length) {
          content.textContent = cardConfig.empty || TEXT.ed?.empty || '—';
          meta.textContent = typeof fallbackMeta === 'string' && fallbackMeta.trim().length
            ? fallbackMeta.trim()
            : (cardConfig.description || '');
          applyEdCommentAutoScroll(wrapper);
          return;
        }

        const renderEntry = (entry) => {
          content.textContent = entry?.text || (cardConfig.empty || TEXT.ed?.empty || '—');
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
          if (!metaParts.length) {
            const metaText = typeof fallbackMeta === 'string' ? fallbackMeta.trim() : '';
            if (metaText) {
              metaParts.push(metaText);
            }
          }
          if (!metaParts.length && cardConfig?.description) {
            metaParts.push(cardConfig.description);
          }
          meta.textContent = metaParts.join(' • ');
          applyEdCommentAutoScroll(wrapper);
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

      function formatFeedbackCardValue(value, format) {
        if (format === 'text') {
          if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed || null;
          }
          if (value != null) {
            const coerced = String(value).trim();
            return coerced || null;
          }
          return null;
        }

        let numericValue = null;
        if (Number.isFinite(value)) {
          numericValue = value;
        } else if (typeof value === 'string') {
          const parsed = Number.parseFloat(value.replace(',', '.'));
          if (Number.isFinite(parsed)) {
            numericValue = parsed;
          }
        }

        if (numericValue == null) {
          return null;
        }

        switch (format) {
          case 'decimal':
            return decimalFormatter.format(numericValue);
          case 'integer':
            return numberFormatter.format(Math.round(numericValue));
          case 'percent':
            return percentFormatter.format(numericValue);
          default:
            return decimalFormatter.format(numericValue);
        }
      }

      function renderFeedbackCards(summary) {
        if (!selectors.feedbackCards) {
          return;
        }

        resetFeedbackCommentRotation();

        const cardsConfig = Array.isArray(TEXT.feedback?.cards)
          ? TEXT.feedback.cards
          : [];

        selectors.feedbackCards.replaceChildren();

        if (!cardsConfig.length) {
          const empty = document.createElement('p');
          empty.className = 'feedback-empty';
          empty.textContent = TEXT.feedback?.empty || 'Kol kas nėra apibendrintų atsiliepimų.';
          selectors.feedbackCards.appendChild(empty);
          return;
        }

        const summaryData = summary && typeof summary === 'object' ? summary : {};
        const hasValues = cardsConfig.some((card) => {
          if (!card || typeof card !== 'object') {
            return false;
          }
          if (card.type === 'comments') {
            return Array.isArray(summaryData[card.key]) && summaryData[card.key].length > 0;
          }
          const raw = summaryData[card.key];
          const formatted = formatFeedbackCardValue(raw, card.format);
          if (formatted != null) {
            return true;
          }
          if (Number.isFinite(raw)) {
            return true;
          }
          return false;
        });

        if (!hasValues) {
          const empty = document.createElement('p');
          empty.className = 'feedback-empty';
          empty.textContent = TEXT.feedback?.empty || 'Kol kas nėra apibendrintų atsiliepimų.';
          selectors.feedbackCards.appendChild(empty);
          return;
        }

        const responsesLabel = TEXT.feedback?.table?.headers?.responses || 'Atsakymai';

        cardsConfig.forEach((card) => {
          if (!card || typeof card !== 'object') {
            return;
          }

          const cardElement = document.createElement('article');
          cardElement.className = 'feedback-card';
          cardElement.setAttribute('role', 'listitem');

          const title = document.createElement('p');
          title.className = 'feedback-card__title';
          title.textContent = card.title || '';

          if (card.type === 'comments') {
            cardElement.classList.add('feedback-card--comments');
            cardElement.appendChild(title);
            renderFeedbackCommentsCard(cardElement, card, summaryData[card.key]);
            selectors.feedbackCards.appendChild(cardElement);
            return;
          }

          const valueElement = document.createElement('p');
          valueElement.className = 'feedback-card__value';
          const rawValue = summaryData[card.key];
          const formattedValue = formatFeedbackCardValue(rawValue, card.format);
          const fallbackText = card.empty || TEXT.feedback?.empty || '—';
          valueElement.textContent = formattedValue != null ? formattedValue : fallbackText;

          const metaElement = document.createElement('p');
          metaElement.className = 'feedback-card__meta';
          const metaParts = [];
          if (card.description) {
            metaParts.push(card.description);
          }
          if (card.metaKey && summaryData[card.metaKey]) {
            const metaText = String(summaryData[card.metaKey]).trim();
            if (metaText) {
              metaParts.push(metaText);
            }
          }
          if (card.countKey) {
            const rawCount = summaryData[card.countKey];
            let numericCount = null;
            if (Number.isFinite(rawCount)) {
              numericCount = rawCount;
            } else if (typeof rawCount === 'string') {
              const parsedCount = Number.parseFloat(rawCount.replace(',', '.'));
              if (Number.isFinite(parsedCount)) {
                numericCount = parsedCount;
              }
            }
            if (Number.isFinite(numericCount)) {
              metaParts.push(`${responsesLabel}: ${numberFormatter.format(Math.round(numericCount))}`);
            }
          }
          const nodes = [title, valueElement];
          if (metaParts.length) {
            metaElement.textContent = metaParts.join(' • ');
            nodes.push(metaElement);
          }
            if (card.trendKey && summaryData[card.trendKey]) {
              const trendInfo = summaryData[card.trendKey];
              const trendElement = document.createElement('p');
              trendElement.className = 'feedback-card__trend';
              setDatasetValue(trendElement, 'trend', trendInfo.trend || 'neutral');
            if (trendInfo.ariaLabel) {
              trendElement.setAttribute('aria-label', trendInfo.ariaLabel);
            }
            const arrowSpan = document.createElement('span');
            arrowSpan.className = 'feedback-card__trend-arrow';
            arrowSpan.textContent = trendInfo.arrow || '→';
            const textSpan = document.createElement('span');
            textSpan.className = 'feedback-card__trend-text';
            textSpan.textContent = trendInfo.text || '';
            trendElement.append(arrowSpan, textSpan);
            nodes.push(trendElement);
          }
          nodes.forEach((node) => {
            cardElement.appendChild(node);
          });
          selectors.feedbackCards.appendChild(cardElement);
        });
      }

      function renderFeedbackTable(monthlyStats) {
        if (!selectors.feedbackTable) {
          return;
        }

        selectors.feedbackTable.replaceChildren();

        const placeholder = TEXT.feedback?.table?.placeholder || '—';

        if (!Array.isArray(monthlyStats) || !monthlyStats.length) {
          const row = document.createElement('tr');
          const cell = document.createElement('td');
          cell.colSpan = 8;
          cell.textContent = TEXT.feedback?.table?.empty || TEXT.feedback?.empty || 'Kol kas nėra apibendrintų atsiliepimų.';
          row.appendChild(cell);
          selectors.feedbackTable.appendChild(row);
          return;
        }

        const formatRating = (value) => {
          if (Number.isFinite(value)) {
            return decimalFormatter.format(value);
          }
          return placeholder;
        };

        monthlyStats
          .slice()
          .sort((a, b) => b.month.localeCompare(a.month))
          .forEach((entry) => {
            const row = document.createElement('tr');
            const monthLabel = formatMonthLabel(entry?.month || '');
            const displayMonth = monthLabel || entry?.month || placeholder;
            const responsesValue = Number.isFinite(entry?.responses) ? entry.responses : null;
            const contactResponses = Number.isFinite(entry?.contactResponses) ? entry.contactResponses : null;
            const contactShare = Number.isFinite(entry?.contactShare) ? entry.contactShare : null;
            let contactText = placeholder;
            if (contactResponses != null && contactShare != null) {
              contactText = `${numberFormatter.format(Math.round(contactResponses))} (${percentFormatter.format(contactShare)})`;
            } else if (contactResponses != null) {
              contactText = numberFormatter.format(Math.round(contactResponses));
            } else if (contactShare != null) {
              contactText = percentFormatter.format(contactShare);
            }

            row.innerHTML = `
              <td>${displayMonth}</td>
              <td>${responsesValue != null ? numberFormatter.format(Math.round(responsesValue)) : placeholder}</td>
              <td>${formatRating(entry.overallAverage)}</td>
              <td>${formatRating(entry.doctorsAverage)}</td>
              <td>${formatRating(entry.nursesAverage)}</td>
              <td>${formatRating(entry.aidesAverage)}</td>
              <td>${formatRating(entry.waitingAverage)}</td>
              <td>${contactText}</td>
            `;

            selectors.feedbackTable.appendChild(row);
          });
      }

      function renderFeedbackSection(feedbackStats) {
        const summary = feedbackStats && typeof feedbackStats.summary === 'object'
          ? feedbackStats.summary
          : null;
        const monthly = Array.isArray(feedbackStats?.monthly)
          ? feedbackStats.monthly
          : [];

        renderFeedbackCards(summary);
        renderFeedbackTable(monthly);

        renderFeedbackTrendChart(monthly).catch((error) => {
          const errorInfo = describeError(error, { code: 'FEEDBACK_TREND_RENDER', message: 'Nepavyko atvaizduoti atsiliepimų trendo' });
          console.error(errorInfo.log, error);
        });
      }

      function getActiveFeedbackTrendWindow() {
        const raw = dashboardState.feedback?.trendWindow;
        if (Number.isFinite(raw) && raw > 0) {
          return Math.max(1, Math.round(raw));
        }
        return null;
      }

      function updateFeedbackTrendSubtitle() {
        if (!selectors.feedbackTrendSubtitle) {
          return;
        }
        const builder = TEXT.feedback?.trend?.subtitle;
        const activeWindow = getActiveFeedbackTrendWindow();
        if (typeof builder === 'function') {
          selectors.feedbackTrendSubtitle.textContent = builder(activeWindow);
        } else if (typeof builder === 'string') {
          selectors.feedbackTrendSubtitle.textContent = builder;
        } else if (Number.isFinite(activeWindow) && activeWindow > 0) {
          selectors.feedbackTrendSubtitle.textContent = `Paskutinių ${activeWindow} mėnesių dinamika`;
        } else {
          selectors.feedbackTrendSubtitle.textContent = 'Visų prieinamų mėnesių dinamika';
        }
      }

      function syncFeedbackTrendControls() {
        if (!selectors.feedbackTrendButtons || !selectors.feedbackTrendButtons.length) {
          return;
        }
        const activeWindow = getActiveFeedbackTrendWindow();
        selectors.feedbackTrendButtons.forEach((button) => {
          const months = Number.parseInt(getDatasetValue(button, 'trendMonths', ''), 10);
          const isActive = Number.isFinite(months) ? months === activeWindow : activeWindow == null;
          button.setAttribute('aria-pressed', String(Boolean(isActive)));
          setDatasetValue(button, 'active', String(Boolean(isActive)));
        });
      }

      async function renderFeedbackTrendChart(monthlyStats) {
        return chartRenderers.renderFeedbackTrendChart(monthlyStats);
      }



      function setFeedbackTrendWindow(months) {
        const normalized = Number.isFinite(months) && months > 0
          ? Math.max(1, Math.round(months))
          : null;
        if (dashboardState.feedback.trendWindow === normalized) {
          return;
        }
        dashboardState.feedback.trendWindow = normalized;
        syncFeedbackTrendControls();
        updateFeedbackTrendSubtitle();
        const monthly = Array.isArray(dashboardState.feedback.monthly)
          ? dashboardState.feedback.monthly
          : [];
        renderFeedbackTrendChart(monthly).catch((error) => {
          const errorInfo = describeError(error, { code: 'FEEDBACK_TREND_WINDOW', message: 'Nepavyko atnaujinti atsiliepimų trendo laikotarpio' });
          console.error(errorInfo.log, error);
        });
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
        if (selectors.sectionNav) {
          if (normalized === 'overview') {
            selectors.sectionNav.removeAttribute('hidden');
            selectors.sectionNav.removeAttribute('aria-hidden');
          } else {
            selectors.sectionNav.setAttribute('hidden', 'hidden');
            selectors.sectionNav.setAttribute('aria-hidden', 'true');
          }
        }
        if (normalized !== 'ed' && dashboardState.tvMode) {
          setTvMode(false, { silent: true });
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

      function updateChartPeriod(period) {
        const rawValue = String(period);
        const isAll = rawValue === 'all';
        const numeric = Number.parseInt(rawValue, 10);
        if (!isAll && (!Number.isFinite(numeric) || numeric < 0)) {
          return;
        }
        dashboardState.chartPeriod = isAll ? 0 : numeric;
        syncChartPeriodButtons(dashboardState.chartPeriod);
        if (selectors.dailyCaption) {
          selectors.dailyCaption.textContent = formatDailyCaption(dashboardState.chartPeriod);
        }
        const hasBaseData = (Array.isArray(dashboardState.chartData.baseDaily) && dashboardState.chartData.baseDaily.length)
          || (Array.isArray(dashboardState.dailyStats) && dashboardState.dailyStats.length);
        if (!hasBaseData) {
          updateDailyPeriodSummary([]);
          if (selectors.dailyCaptionContext) {
            selectors.dailyCaptionContext.textContent = '';
          }
          updateChartFiltersSummary({ records: [], daily: [] });
          return;
        }
        const scoped = prepareChartDataForPeriod(dashboardState.chartPeriod);
        renderCharts(scoped.daily, scoped.funnel, scoped.heatmap)
          .catch((error) => {
            const errorInfo = describeError(error, { code: 'CHART_PERIOD', message: 'Nepavyko atnaujinti grafiko laikotarpio' });
            console.error(errorInfo.log, error);
            showChartError(TEXT.charts?.errorLoading);
          });
      }

      function updateChartYear(year) {
        const numeric = Number.isFinite(year) ? Math.trunc(year) : Number.parseInt(String(year), 10);
        const normalized = Number.isFinite(numeric) ? numeric : null;
        dashboardState.chartYear = normalized;
        syncChartYearControl();
        if (normalized != null) {
          dashboardState.chartPeriod = 0;
          syncChartPeriodButtons(dashboardState.chartPeriod);
        }
        if (selectors.dailyCaption) {
          selectors.dailyCaption.textContent = formatDailyCaption(dashboardState.chartPeriod);
        }
        const hasBaseData = (Array.isArray(dashboardState.chartData.baseDaily) && dashboardState.chartData.baseDaily.length)
          || (Array.isArray(dashboardState.dailyStats) && dashboardState.dailyStats.length);
        if (!hasBaseData) {
          updateDailyPeriodSummary([]);
          if (selectors.dailyCaptionContext) {
            selectors.dailyCaptionContext.textContent = '';
          }
          updateChartFiltersSummary({ records: [], daily: [] });
          return;
        }
        const scoped = prepareChartDataForPeriod(dashboardState.chartPeriod);
        renderCharts(scoped.daily, scoped.funnel, scoped.heatmap)
          .catch((error) => {
            const errorInfo = describeError(error, { code: 'CHART_YEAR', message: 'Nepavyko atnaujinti grafiko metų filtro' });
            console.error(errorInfo.log, error);
            showChartError(TEXT.charts?.errorLoading);
          });
      }

      function prepareChartDataForPeriod(period) {
        const normalized = Number.isFinite(Number(period))
          ? Math.max(0, Number(period))
          : 30;
        const baseDaily = Array.isArray(dashboardState.chartData.baseDaily) && dashboardState.chartData.baseDaily.length
          ? dashboardState.chartData.baseDaily
          : dashboardState.dailyStats;
        const baseRecords = Array.isArray(dashboardState.chartData.baseRecords) && dashboardState.chartData.baseRecords.length
          ? dashboardState.chartData.baseRecords
          : dashboardState.rawRecords;
        const selectedYear = Number.isFinite(dashboardState.chartYear) ? Number(dashboardState.chartYear) : null;
        const yearScopedRecords = filterRecordsByYear(baseRecords, selectedYear);
        const sanitizedFilters = sanitizeChartFilters(dashboardState.chartFilters, { getDefaultChartFilters, KPI_FILTER_LABELS });
        dashboardState.chartFilters = { ...sanitizedFilters };
        const effectiveFilters = sanitizedFilters.compareGmp
          ? { ...sanitizedFilters, arrival: 'all' }
          : sanitizedFilters;
        const filteredRecords = filterRecordsByChartFilters(yearScopedRecords, effectiveFilters);
        const filteredDaily = computeDailyStats(filteredRecords, settings?.calculations, DEFAULT_SETTINGS);
        let scopedDaily = filteredDaily.slice();
        let scopedRecords = filteredRecords.slice();
        if (normalized > 0) {
          const windowKeys = buildDailyWindowKeys(filteredDaily, normalized);
          scopedDaily = windowKeys.length
            ? fillDailyStatsWindow(filteredDaily, windowKeys)
            : filterDailyStatsByWindow(filteredDaily, normalized);
          scopedRecords = filterRecordsByWindow(filteredRecords, normalized);
        }
        const fallbackDaily = filteredDaily.length
          ? filteredDaily
          : filterDailyStatsByYear(baseDaily, selectedYear);
        const funnelData = computeFunnelStats(scopedDaily, selectedYear, fallbackDaily);
        const heatmapData = computeArrivalHeatmap(scopedRecords);

        dashboardState.chartData.filteredRecords = filteredRecords;
        dashboardState.chartData.filteredDaily = filteredDaily;
        dashboardState.chartData.filteredWindowRecords = scopedRecords;
        dashboardState.chartData.dailyWindow = scopedDaily;
        dashboardState.chartData.funnel = funnelData;
        dashboardState.chartData.heatmap = heatmapData;
        updateChartFiltersSummary({ records: filteredRecords, daily: filteredDaily });

        return { daily: scopedDaily, funnel: funnelData, heatmap: heatmapData };
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
        const weekdayDays = Array.from({ length: 7 }, () => new Set());
        (Array.isArray(records) ? records : []).forEach((entry) => {
          if (!(entry.arrival instanceof Date) || Number.isNaN(entry.arrival.getTime())) {
            return;
          }
          const rawDay = entry.arrival.getDay();
          const dayIndex = (rawDay + 6) % 7; // perkeliam, kad pirmadienis būtų pirmas
          const hour = entry.arrival.getHours();
          if (hour < 0 || hour > 23) {
            return;
          }
          const cell = aggregates[dayIndex][hour];
          cell.arrivals += 1;
          if (entry.hospitalized) {
            cell.hospitalized += 1;
          } else {
            cell.discharges += 1;
          }
          if (entry.arrival instanceof Date && entry.discharge instanceof Date) {
            const duration = (entry.discharge.getTime() - entry.arrival.getTime()) / 3600000;
            if (Number.isFinite(duration) && duration >= 0 && duration <= 24) {
              cell.durationSum += duration;
              cell.durationCount += 1;
            }
          }
          const dateKey = formatLocalDateKey(entry.arrival);
          if (dateKey) {
            weekdayDays[dayIndex].add(dateKey);
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
          const divisor = weekdayDays[dayIndex].size || 1;
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

            const arrivalsAvg = divisor ? cell.arrivals / divisor : 0;
            const dischargesAvg = divisor ? cell.discharges / divisor : 0;
            const hospitalizedAvg = divisor ? cell.hospitalized / divisor : 0;
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

      function populateHourlyCompareYearOptions(dailyStats) {
        if (!selectors.hourlyCompareYearA || !selectors.hourlyCompareYearB) {
          return;
        }
        const years = getAvailableYearsFromDaily(dailyStats);
        const buildOptions = (select) => {
          select.replaceChildren();
          const noneOption = document.createElement('option');
          noneOption.value = 'none';
          noneOption.textContent = 'Nelyginti';
          select.appendChild(noneOption);
          years.forEach((year) => {
            const option = document.createElement('option');
            option.value = String(year);
            option.textContent = `${year} m.`;
            select.appendChild(option);
          });
        };
        buildOptions(selectors.hourlyCompareYearA);
        buildOptions(selectors.hourlyCompareYearB);
        const normalized = normalizeHourlyCompareYears(
          dashboardState.hourlyCompareYears?.[0],
          dashboardState.hourlyCompareYears?.[1],
        );
        dashboardState.hourlyCompareYears = normalized;
        syncHourlyCompareControls();
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

      function syncHourlyCompareControls() {
        if (selectors.hourlyCompareToggle) {
          selectors.hourlyCompareToggle.checked = Boolean(dashboardState.hourlyCompareEnabled);
        }
        if (selectors.hourlyCompareSeriesGroup) {
          selectors.hourlyCompareSeriesGroup.hidden = !dashboardState.hourlyCompareEnabled;
        }
        if (Array.isArray(selectors.hourlyCompareSeriesButtons) && selectors.hourlyCompareSeriesButtons.length) {
          const current = HOURLY_COMPARE_SERIES.includes(dashboardState.hourlyCompareSeries)
            ? dashboardState.hourlyCompareSeries
            : HOURLY_COMPARE_SERIES_ALL;
          selectors.hourlyCompareSeriesButtons.forEach((button) => {
            const key = getDatasetValue(button, 'hourlyCompareSeries');
            if (!key) {
              return;
            }
            const isActive = key === current;
            button.setAttribute('aria-pressed', String(isActive));
          });
        }
        if (selectors.hourlyCompareYearA && selectors.hourlyCompareYearB) {
          const fieldA = selectors.hourlyCompareYearA.closest('.heatmap-toolbar__field');
          const fieldB = selectors.hourlyCompareYearB.closest('.heatmap-toolbar__field');
          if (fieldA) {
            fieldA.hidden = !dashboardState.hourlyCompareEnabled;
          }
          if (fieldB) {
            fieldB.hidden = !dashboardState.hourlyCompareEnabled;
          }
          const normalized = normalizeHourlyCompareYears(
            dashboardState.hourlyCompareYears?.[0],
            dashboardState.hourlyCompareYears?.[1],
          );
          dashboardState.hourlyCompareYears = normalized;
          const [yearA, yearB] = normalized;
          selectors.hourlyCompareYearA.value = Number.isFinite(yearA) ? String(yearA) : 'none';
          selectors.hourlyCompareYearB.value = Number.isFinite(yearB) ? String(yearB) : 'none';
        }
      }

      function handleHourlyCompareToggle(event) {
        const enabled = Boolean(event?.target?.checked);
        dashboardState.hourlyCompareEnabled = enabled;
        if (enabled && selectors.hourlyCompareYearA && selectors.hourlyCompareYearB) {
          const normalized = normalizeHourlyCompareYears(
            dashboardState.hourlyCompareYears?.[0],
            dashboardState.hourlyCompareYears?.[1],
          );
          if (!normalized.length) {
            const availableYears = Array.from(selectors.hourlyCompareYearA.options || [])
              .map((option) => option.value)
              .filter((value) => value && value !== 'none')
              .map((value) => Number.parseInt(value, 10))
              .filter((value) => Number.isFinite(value));
            if (availableYears.length) {
              selectors.hourlyCompareYearA.value = String(availableYears[0]);
              selectors.hourlyCompareYearB.value = availableYears[1] != null ? String(availableYears[1]) : 'none';
              dashboardState.hourlyCompareYears = normalizeHourlyCompareYears(
                selectors.hourlyCompareYearA.value,
                selectors.hourlyCompareYearB.value,
              );
            }
          }
        }
        syncHourlyCompareControls();
        handleHourlyFilterChange();
      }

      function handleHourlyCompareYearsChange() {
        if (!selectors.hourlyCompareYearA || !selectors.hourlyCompareYearB) {
          return;
        }
        const normalized = normalizeHourlyCompareYears(
          selectors.hourlyCompareYearA.value,
          selectors.hourlyCompareYearB.value,
        );
        dashboardState.hourlyCompareYears = normalized;
        if (normalized.length === 1) {
          const only = normalized[0];
          if (String(selectors.hourlyCompareYearA.value) === String(only)) {
            selectors.hourlyCompareYearB.value = 'none';
          } else if (String(selectors.hourlyCompareYearB.value) === String(only)) {
            selectors.hourlyCompareYearA.value = 'none';
          }
        }
        handleHourlyFilterChange();
      }

      function handleHourlyCompareSeriesClick(event) {
        const button = event?.currentTarget;
        const key = getDatasetValue(button, 'hourlyCompareSeries');
        if (!HOURLY_COMPARE_SERIES.includes(key)) {
          return;
        }
        dashboardState.hourlyCompareSeries = key;
        syncHourlyCompareControls();
        if (dashboardState.hourlyCompareEnabled) {
          handleHourlyFilterChange();
        }
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

      async function renderCharts(dailyStats, funnelTotals, heatmapData) {
        return chartRenderers.renderCharts(dailyStats, funnelTotals, heatmapData);
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
        merged.output.feedbackDescription = merged.output.feedbackDescription != null ? String(merged.output.feedbackDescription) : DEFAULT_SETTINGS.output.feedbackDescription;
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
        TEXT.feedback.description = settings.output.feedbackDescription || DEFAULT_SETTINGS.output.feedbackDescription;
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
        defaultHeatmapMetric: DEFAULT_HEATMAP_METRIC,
        hourlyMetricArrivals: HOURLY_METRIC_ARRIVALS,
        hourlyCompareSeriesAll: HOURLY_COMPARE_SERIES_ALL,
      });

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
        updateTvToggleControls();
      }

      function updateTvToggleControls() {
        if (!selectors.edTvToggleBtn) {
          return;
        }
        const toggleTexts = TEXT.edTv?.toggle || {};
        const isActive = dashboardState.tvMode === true && dashboardState.activeTab === 'ed';
        const label = isActive
          ? (toggleTexts.exit || 'Išjungti ekraną')
          : (toggleTexts.enter || 'Įjungti ekraną');
        const labelTarget = selectors.edTvToggleBtn.querySelector('[data-tv-toggle-label]');
        if (labelTarget) {
          labelTarget.textContent = label;
        }
        selectors.edTvToggleBtn.setAttribute('aria-label', `${label} (Ctrl+Shift+T)`);
        selectors.edTvToggleBtn.title = `${label} (Ctrl+Shift+T)`;
        selectors.edTvToggleBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      }

      function updateEdTvClock() {
        if (!selectors.edTvClockTime || !selectors.edTvClockDate) {
          return;
        }
        const now = new Date();
        selectors.edTvClockTime.textContent = tvTimeFormatter.format(now);
        selectors.edTvClockDate.textContent = capitalizeSentence(tvDateFormatter.format(now));
      }

      function startTvClock() {
        updateEdTvClock();
        if (tvState.clockHandle != null) {
          return;
        }
        tvState.clockHandle = window.setInterval(updateEdTvClock, 15000);
      }

      function stopTvClock() {
        if (tvState.clockHandle != null) {
          window.clearInterval(tvState.clockHandle);
          tvState.clockHandle = null;
        }
      }

      function setTvMode(active, options = {}) {
        if (!selectors.edTvPanel) {
          dashboardState.tvMode = false;
          document.body.removeAttribute('data-tv-mode');
          if (selectors.edStandardSection) {
            selectors.edStandardSection.removeAttribute('hidden');
            selectors.edStandardSection.removeAttribute('aria-hidden');
          }
          stopTvClock();
          if (!options.silent) {
            scheduleLayoutRefresh();
          }
          return;
        }
        const shouldEnable = Boolean(active);
        const previous = dashboardState.tvMode === true;
        if (shouldEnable === previous && !options.force) {
          updateTvToggleControls();
          return;
        }
        dashboardState.tvMode = shouldEnable;
        if (shouldEnable) {
          document.body.setAttribute('data-tv-mode', 'true');
          if (selectors.edStandardSection) {
            selectors.edStandardSection.setAttribute('hidden', 'hidden');
            selectors.edStandardSection.setAttribute('aria-hidden', 'true');
          }
          if (selectors.edTvPanel) {
            selectors.edTvPanel.removeAttribute('hidden');
            selectors.edTvPanel.setAttribute('aria-hidden', 'false');
          }
          startTvClock();
          setFullscreenMode(true);
          const dataset = dashboardState.ed || {};
          const summary = dataset.summary || createEmptyEdSummary(dataset.meta?.type);
          const dispositions = Array.isArray(dataset.dispositions) ? dataset.dispositions : [];
          const summaryMode = typeof summary?.mode === 'string' ? summary.mode : (dataset.meta?.type || 'legacy');
          const hasSnapshotMetrics = Number.isFinite(summary?.currentPatients)
            || Number.isFinite(summary?.occupiedBeds)
            || Number.isFinite(summary?.nursePatientsPerStaff)
            || Number.isFinite(summary?.doctorPatientsPerStaff);
          const displayVariant = summaryMode === 'snapshot'
            || (summaryMode === 'hybrid' && hasSnapshotMetrics)
            ? 'snapshot'
            : 'legacy';
          const statusInfo = buildEdStatus(summary, dataset, displayVariant);
          updateEdTvPanel(summary, dispositions, displayVariant, dataset, statusInfo);
        } else {
          document.body.removeAttribute('data-tv-mode');
          if (selectors.edStandardSection) {
            selectors.edStandardSection.removeAttribute('hidden');
            selectors.edStandardSection.removeAttribute('aria-hidden');
          }
          if (selectors.edTvPanel) {
            selectors.edTvPanel.setAttribute('hidden', 'hidden');
            selectors.edTvPanel.setAttribute('aria-hidden', 'true');
          }
          stopTvClock();
        }
        updateTvToggleControls();
        if (!options.silent) {
          scheduleLayoutRefresh();
        }
      }

      /**
       * Pirminis tekstų suleidimas iš konfigūracijos (galima perrašyti iš kitų failų).
       */
      function applyTextContent() {
        selectors.title.textContent = TEXT.title;
        selectors.subtitle.textContent = TEXT.subtitle;
        if (selectors.tabOverview) {
          selectors.tabOverview.textContent = settings.output.tabOverviewLabel || TEXT.tabs.overview;
        }
        if (selectors.edNavButton) {
          const edNavLabel = settings.output.tabEdLabel || TEXT.tabs.ed;
          const openLabel = typeof TEXT.edToggle?.open === 'function'
            ? TEXT.edToggle.open(edNavLabel)
            : `Atidaryti ${edNavLabel}`;
          const closeLabel = typeof TEXT.edToggle?.close === 'function'
            ? TEXT.edToggle.close(edNavLabel)
            : `Uždaryti ${edNavLabel}`;
          setDatasetValue(selectors.edNavButton, 'panelLabel', edNavLabel);
          setDatasetValue(selectors.edNavButton, 'openLabel', openLabel);
          setDatasetValue(selectors.edNavButton, 'closeLabel', closeLabel);
          const isActive = dashboardState.activeTab === 'ed';
          const currentLabel = isActive ? closeLabel : openLabel;
          selectors.edNavButton.setAttribute('aria-label', currentLabel);
          selectors.edNavButton.title = currentLabel;
        }
        if (selectors.closeEdPanelBtn) {
          const overviewLabel = settings.output.tabOverviewLabel || TEXT.tabs.overview;
          const closeLabel = typeof TEXT.ed?.closeButton === 'function'
            ? TEXT.ed.closeButton(overviewLabel)
            : (TEXT.ed?.closeButton || 'Grįžti');
          selectors.closeEdPanelBtn.setAttribute('aria-label', closeLabel);
          selectors.closeEdPanelBtn.title = closeLabel;
          const labelSpan = selectors.closeEdPanelBtn.querySelector('span');
          if (labelSpan) {
            labelSpan.textContent = closeLabel;
          } else {
            selectors.closeEdPanelBtn.textContent = closeLabel;
          }
        }
        if (selectors.edTvToggleBtn) {
          const toggleTexts = TEXT.edTv?.toggle || {};
          const isActive = dashboardState.tvMode === true;
          const label = isActive
            ? (toggleTexts.exit || 'Išjungti ekraną')
            : (toggleTexts.enter || 'Įjungti ekraną');
          const labelTarget = selectors.edTvToggleBtn.querySelector('[data-tv-toggle-label]');
          if (labelTarget) {
            labelTarget.textContent = label;
          }
          selectors.edTvToggleBtn.setAttribute('aria-label', `${label} (Ctrl+Shift+T)`);
          selectors.edTvToggleBtn.title = `${label} (Ctrl+Shift+T)`;
        }
        if (selectors.edTvTitle && TEXT.edTv?.title) {
          selectors.edTvTitle.textContent = TEXT.edTv.title;
        }
        if (selectors.edTvSubtitle) {
          selectors.edTvSubtitle.textContent = TEXT.edTv?.subtitle || selectors.edTvSubtitle.textContent || '';
        }
        if (selectors.themeToggleBtn) {
          selectors.themeToggleBtn.setAttribute('aria-label', TEXT.theme.toggle);
          selectors.themeToggleBtn.title = `${TEXT.theme.toggle} (Ctrl+Shift+L)`;
        }
        updateFullscreenControls();
        selectors.kpiHeading.textContent = TEXT.kpis.title;
        selectors.kpiSubtitle.textContent = TEXT.kpis.subtitle;
        selectors.chartHeading.textContent = TEXT.charts.title;
        selectors.chartSubtitle.textContent = TEXT.charts.subtitle;
        if (selectors.chartYearLabel) {
          selectors.chartYearLabel.textContent = TEXT.charts.yearFilterLabel;
        }
        if (selectors.chartYearSelect) {
          const firstOption = selectors.chartYearSelect.querySelector('option[value="all"]');
          if (firstOption) {
            firstOption.textContent = TEXT.charts.yearFilterAll;
          }
        }
        selectors.dailyCaption.textContent = formatDailyCaption(dashboardState.chartPeriod);
        if (selectors.dailyCaptionContext) {
          selectors.dailyCaptionContext.textContent = '';
        }
        selectors.dowCaption.textContent = TEXT.charts.dowCaption;
        if (selectors.dowStayCaption) {
          selectors.dowStayCaption.textContent = TEXT.charts.dowStayCaption;
        }
        if (selectors.hourlyWeekdayLabel) {
          const hourlyLabelText = TEXT.charts?.hourlyWeekdayLabel || 'Savaitės diena';
          selectors.hourlyWeekdayLabel.textContent = hourlyLabelText;
          if (selectors.hourlyWeekdaySelect) {
            selectors.hourlyWeekdaySelect.setAttribute('aria-label', hourlyLabelText);
            selectors.hourlyWeekdaySelect.title = hourlyLabelText;
          }
        }
        if (selectors.hourlyMetricLabel) {
          syncHourlyMetricButtons();
        }
        if (selectors.hourlyDepartmentLabel) {
          const departmentLabelText = TEXT.charts?.hourlyDepartmentLabel || 'Skyrius';
          selectors.hourlyDepartmentLabel.textContent = departmentLabelText;
          if (selectors.hourlyDepartmentInput) {
            selectors.hourlyDepartmentInput.setAttribute('aria-label', departmentLabelText);
            selectors.hourlyDepartmentInput.title = departmentLabelText;
            selectors.hourlyDepartmentInput.placeholder = TEXT.charts?.hourlyDepartmentAll || 'Visi skyriai';
          }
        }
        if (selectors.hourlyStayLabel) {
          const stayLabelText = TEXT.charts?.hourlyStayLabel || 'Buvimo trukmė';
          selectors.hourlyStayLabel.textContent = stayLabelText;
          if (selectors.hourlyStaySelect) {
            selectors.hourlyStaySelect.setAttribute('aria-label', stayLabelText);
            selectors.hourlyStaySelect.title = stayLabelText;
          }
        }
        populateHourlyWeekdayOptions();
        populateHourlyStayOptions();
        syncHourlyDepartmentVisibility(dashboardState.hourlyMetric);
        updateHourlyCaption(
          dashboardState.hourlyWeekday,
          dashboardState.hourlyStayBucket,
          dashboardState.hourlyMetric,
          dashboardState.hourlyDepartment,
        );
        const funnelCaptionText = typeof TEXT.charts.funnelCaptionWithYear === 'function'
          ? TEXT.charts.funnelCaptionWithYear(null)
          : TEXT.charts.funnelCaption;
        selectors.funnelCaption.textContent = funnelCaptionText;
        if (selectors.heatmapMetricLabel) {
          const heatmapLabelText = TEXT.charts?.heatmapMetricLabel || 'Rodiklis';
          selectors.heatmapMetricLabel.textContent = heatmapLabelText;
          if (selectors.heatmapMetricSelect) {
            selectors.heatmapMetricSelect.setAttribute('aria-label', heatmapLabelText);
            selectors.heatmapMetricSelect.title = `${heatmapLabelText} (Ctrl+Shift+H)`;
          }
        }
        populateHeatmapMetricOptions();
        updateHeatmapCaption(dashboardState.heatmapMetric);
        selectors.recentHeading.textContent = TEXT.recent.title;
        selectors.recentSubtitle.textContent = TEXT.recent.subtitle;
        selectors.recentCaption.textContent = TEXT.recent.caption;
        if (selectors.monthlyHeading) {
          selectors.monthlyHeading.textContent = TEXT.monthly.title;
        }
        if (selectors.monthlySubtitle) {
          selectors.monthlySubtitle.textContent = TEXT.monthly.subtitle;
        }
        if (selectors.monthlyCaption) {
          selectors.monthlyCaption.textContent = TEXT.monthly.caption;
        }
        if (selectors.yearlyHeading) {
          selectors.yearlyHeading.textContent = TEXT.yearly.title;
        }
        if (selectors.yearlySubtitle) {
          selectors.yearlySubtitle.textContent = TEXT.yearly.subtitle;
        }
        if (selectors.yearlyCaption) {
          selectors.yearlyCaption.textContent = TEXT.yearly.caption;
        }
        selectors.feedbackHeading.textContent = TEXT.feedback.title;
        selectors.feedbackSubtitle.textContent = TEXT.feedback.subtitle;
        if (selectors.feedbackDescription) {
          selectors.feedbackDescription.textContent = TEXT.feedback.description;
        }
        const feedbackFiltersText = TEXT.feedback?.filters || {};
        if (selectors.feedbackRespondentLabel) {
          selectors.feedbackRespondentLabel.textContent = feedbackFiltersText.respondent?.label || 'Kas pildo anketą';
        }
        if (selectors.feedbackLocationLabel) {
          selectors.feedbackLocationLabel.textContent = feedbackFiltersText.location?.label || 'Šaltinis';
        }
        populateFeedbackFilterControls();
        syncFeedbackFilterControls();
        updateFeedbackFiltersSummary();
        if (selectors.feedbackTrendTitle) {
          selectors.feedbackTrendTitle.textContent = TEXT.feedback.trend.title;
        }
        updateFeedbackTrendSubtitle();
        if (selectors.feedbackTrendControlsLabel) {
          selectors.feedbackTrendControlsLabel.textContent = TEXT.feedback.trend.controlsLabel;
        }
        if (selectors.feedbackTrendButtons && selectors.feedbackTrendButtons.length) {
          const periodConfig = Array.isArray(TEXT.feedback.trend.periods) ? TEXT.feedback.trend.periods : [];
          selectors.feedbackTrendButtons.forEach((button) => {
            const months = Number.parseInt(getDatasetValue(button, 'trendMonths', ''), 10);
            const config = periodConfig.find((item) => Number.parseInt(item?.months, 10) === months);
            if (config?.label) {
              button.textContent = config.label;
            }
            if (config?.hint) {
              button.title = config.hint;
            } else {
              button.removeAttribute('title');
            }
          });
        }
        syncFeedbackTrendControls();
        if (selectors.feedbackCaption) {
          selectors.feedbackCaption.textContent = TEXT.feedback.table.caption;
        }
        if (selectors.feedbackColumnMonth) {
          selectors.feedbackColumnMonth.textContent = TEXT.feedback.table.headers.month;
        }
        if (selectors.feedbackColumnResponses) {
          selectors.feedbackColumnResponses.textContent = TEXT.feedback.table.headers.responses;
        }
        if (selectors.feedbackColumnOverall) {
          selectors.feedbackColumnOverall.textContent = TEXT.feedback.table.headers.overall;
        }
        if (selectors.feedbackColumnDoctors) {
          selectors.feedbackColumnDoctors.textContent = TEXT.feedback.table.headers.doctors;
        }
        if (selectors.feedbackColumnNurses) {
          selectors.feedbackColumnNurses.textContent = TEXT.feedback.table.headers.nurses;
        }
        if (selectors.feedbackColumnAides) {
          selectors.feedbackColumnAides.textContent = TEXT.feedback.table.headers.aides;
        }
        if (selectors.feedbackColumnWaiting) {
          selectors.feedbackColumnWaiting.textContent = TEXT.feedback.table.headers.waiting;
        }
        if (selectors.feedbackColumnContact) {
          selectors.feedbackColumnContact.textContent = TEXT.feedback.table.headers.contact;
        }
        if (selectors.edHeading) {
          selectors.edHeading.textContent = settings.output.edTitle || TEXT.ed.title;
        }
        if (selectors.edStatus) {
          selectors.edStatus.textContent = TEXT.ed.status.loading;
          setDatasetValue(selectors.edStatus, 'tone', 'info');
        }
        if (selectors.compareToggle) {
          selectors.compareToggle.textContent = TEXT.compare.toggle;
        }
        if (selectors.scrollTopBtn) {
          selectors.scrollTopBtn.textContent = TEXT.scrollTop;
          selectors.scrollTopBtn.setAttribute('aria-label', TEXT.scrollTop);
          selectors.scrollTopBtn.title = `${TEXT.scrollTop} (Home)`;
        }
        if (selectors.compareSummary) {
          selectors.compareSummary.textContent = TEXT.compare.prompt;
        }
        hideStatusNote();
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
        let lastUpdate = 0;
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
          const now = performance.now();
          if (now - lastUpdate < 120) {
            return;
          }
          lastUpdate = now;
          const receivedBytes = Number.isFinite(payload.receivedBytes) ? payload.receivedBytes : 0;
          const current = Number.isFinite(payload.current) ? payload.current : 0;
          const total = Number.isFinite(payload.total) ? payload.total : 0;
          const sizeKb = receivedBytes ? `~${Math.max(1, Math.round(receivedBytes / 1024))} KB` : '';
          const percent = total > 0 ? `${Math.min(100, Math.round((current / total) * 100))}%` : '';
          const progressLabel = percent || sizeKb;
          if (!progressLabel && !label) {
            return;
          }
          const message = label ? `${label}: įkeliama ${progressLabel}`.trim() : `Įkeliama ${progressLabel}`.trim();
          showStatusNote(message, 'info');
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

      /**
       * CSV duomenų apdorojimo pagalbinės funkcijos: diagnostika, atsisiuntimas ir transformacija.
       */
      function formatUrlForDiagnostics(rawUrl) {
        if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
          return '';
        }
        try {
          const parsed = new URL(rawUrl);
          const safeParams = new URLSearchParams();
          parsed.searchParams.forEach((value, key) => {
            if (/token|key|auth|secret|signature|pass/i.test(key)) {
              safeParams.append(key, '***');
              return;
            }
            safeParams.append(key, value);
          });
          const query = safeParams.toString();
          return `${parsed.origin}${parsed.pathname}${query ? `?${query}` : ''}`;
        } catch (parseError) {
          console.warn('Nepavyko normalizuoti URL diagnostikai:', parseError);
          return rawUrl;
        }
      }

      function describeError(error, { code = 'UNKNOWN', message } = {}) {
        const normalizedCode = typeof code === 'string' && code.trim()
          ? code.trim().toUpperCase()
          : 'UNKNOWN';
        const baseMessage = message
          || (typeof error === 'string'
            ? error
            : error?.message ?? TEXT.status.error);
        const hints = [];
        const diagnostic = typeof error === 'object' && error ? error.diagnostic : null;

        if (diagnostic?.url) {
          hints.push(`URL: ${diagnostic.url}.`);
        }

        if (diagnostic?.type === 'http') {
          if (diagnostic.status === 404) {
            hints.push('Patikrinkite, ar „Google Sheet“ paskelbta per „File → Share → Publish to web → CSV“ ir kad naudojamas publikuotas CSV adresas.');
          } else if (diagnostic.status === 403) {
            hints.push('Patikrinkite bendrinimo teises – dokumentas turi būti pasiekiamas be prisijungimo.');
          } else if (diagnostic.status === 0) {
            hints.push('Gautas atsakas be statuso – tikėtina tinklo arba CORS klaida.');
          }
          if (diagnostic.statusText) {
            hints.push(`Serverio atsakymas: ${diagnostic.statusText}.`);
          }
        }

        if (/Failed to fetch/i.test(baseMessage) || /NetworkError/i.test(baseMessage)) {
          hints.push('Nepavyko pasiekti šaltinio – patikrinkite interneto ryšį ir ar serveris leidžia CORS užklausas iš šio puslapio.');
        }

        if (/HTML atsakas/i.test(baseMessage)) {
          hints.push('Gautas HTML vietoje CSV – nuorodoje turi būti „.../pub?output=csv“.');
        }

        if (diagnostic?.hint) {
          hints.push(diagnostic.hint);
        }

        const renderedHints = hints.length ? ` ${hints.join(' ')}` : '';
        let userMessage = `${baseMessage}${renderedHints}`.trim();
        if (/HTTP klaida:\s*404/.test(baseMessage)) {
          userMessage = `HTTP 404 – nuoroda nerasta arba dokumentas nepublikuotas.${renderedHints}`;
        } else if (/HTTP klaida:\s*403/.test(baseMessage)) {
          userMessage = `HTTP 403 – prieiga uždrausta.${renderedHints}`;
        } else if (/Failed to fetch/i.test(baseMessage) || /NetworkError/i.test(baseMessage)) {
          userMessage = `Nepavyko pasiekti šaltinio.${renderedHints}`;
        } else if (/HTML atsakas/i.test(baseMessage)) {
          userMessage = `Gautas HTML atsakas vietoje CSV.${renderedHints}`;
        }

        return {
          code: normalizedCode,
          message: baseMessage,
          detail: typeof error === 'string' ? '' : (error?.message ?? ''),
          diagnostic,
          userMessage,
          log: `[${normalizedCode}] ${userMessage}`,
        };
      }

      function createTextSignature(text) {
        if (typeof text !== 'string') {
          return '';
        }
        const length = text.length;
        const head = text.slice(0, 128);
        return `${length}:${head}`;
      }

      async function downloadCsv(url, { cacheInfo = null, onChunk } = {}) {
        const headers = {};
        if (cacheInfo?.etag) {
          headers['If-None-Match'] = cacheInfo.etag;
        }
        if (cacheInfo?.lastModified) {
          headers['If-Modified-Since'] = cacheInfo.lastModified;
        }
        const response = await fetch(url, { cache: 'no-store', headers });
        const statusText = response.statusText || '';
        const cacheStatusHeader = response.headers.get('x-cache-status') || '';
        if (response.status === 304) {
          return {
            status: 304,
            text: '',
            contentType: response.headers.get('content-type') ?? '',
            etag: cacheInfo?.etag || '',
            lastModified: cacheInfo?.lastModified || '',
            signature: cacheInfo?.signature || '',
            cacheStatus: cacheStatusHeader || 'not-modified',
          };
        }
        if (!response.ok) {
          const error = new Error(`HTTP klaida: ${response.status}`);
          error.diagnostic = {
            type: 'http',
            status: response.status,
            statusText,
            url: formatUrlForDiagnostics(url),
          };
          throw error;
        }
        let textContent = '';
        const totalBytesHeader = response.headers.get('content-length');
        const totalBytes = totalBytesHeader ? Number.parseInt(totalBytesHeader, 10) : 0;
        if (response.body && typeof response.body.getReader === 'function') {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let receivedBytes = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            receivedBytes += value.byteLength;
            textContent += decoder.decode(value, { stream: true });
            if (typeof onChunk === 'function') {
              onChunk({ receivedBytes, totalBytes });
            }
          }
          textContent += decoder.decode();
        } else {
          textContent = await response.text();
        }
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('text/html') || /^<!doctype html/i.test(textContent.trim())) {
          const error = new Error('HTML atsakas vietoje CSV – patikrinkite, ar nuoroda publikuota kaip CSV.');
          error.diagnostic = {
            type: 'html',
            url: formatUrlForDiagnostics(url),
            hint: 'Google Sheets lange pasirinkite „File → Share → Publish to web → CSV“ ir naudokite gautą CSV nuorodą.',
          };
          throw error;
        }
        const etag = response.headers.get('etag') ?? '';
        const lastModified = response.headers.get('last-modified') ?? '';
        return {
          status: response.status,
          text: textContent,
          contentType,
          etag,
          lastModified,
          cacheStatus: cacheStatusHeader || 'tinklas',
          signature: etag || lastModified || createTextSignature(textContent),
        };
      }

      function describeCacheMeta(meta) {
        if (!meta) {
          return 'tinklas';
        }
        if (meta.cacheStatus && /hit|revalidated/i.test(meta.cacheStatus)) {
          return meta.cacheStatus.toLowerCase();
        }
        if (meta.fromCache) {
          return 'talpykla';
        }
        return 'tinklas';
      }

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

      let kpiWorkerJobToken = 0;

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
      async function handleHourlyFilterChange() {
        const metricValue = dashboardState.hourlyMetric;
        const departmentValue = selectors.hourlyDepartmentInput?.value ?? dashboardState.hourlyDepartment;
        const weekdayValue = selectors.hourlyWeekdaySelect?.value ?? dashboardState.hourlyWeekday;
        const stayValue = selectors.hourlyStaySelect?.value ?? dashboardState.hourlyStayBucket;
        dashboardState.hourlyDepartment = normalizeHourlyDepartment(departmentValue);
        dashboardState.hourlyWeekday = normalizeHourlyWeekday(weekdayValue);
        dashboardState.hourlyStayBucket = normalizeHourlyStayBucket(stayValue);
        if (selectors.hourlyWeekdaySelect) {
          selectors.hourlyWeekdaySelect.value = String(dashboardState.hourlyWeekday);
        }
        if (selectors.hourlyStaySelect) {
          selectors.hourlyStaySelect.value = String(dashboardState.hourlyStayBucket);
        }
        if (dashboardState.hourlyMetric !== HOURLY_METRIC_HOSPITALIZED) {
          dashboardState.hourlyDepartment = 'all';
          if (selectors.hourlyDepartmentInput) {
            selectors.hourlyDepartmentInput.value = '';
          }
        }
        syncHourlyDepartmentVisibility(dashboardState.hourlyMetric);
        updateHourlyCaption(
          dashboardState.hourlyWeekday,
          dashboardState.hourlyStayBucket,
          dashboardState.hourlyMetric,
          dashboardState.hourlyDepartment,
        );
        const selectedYear = Number.isFinite(dashboardState.chartYear) ? Number(dashboardState.chartYear) : null;
        const baseRecords = Array.isArray(dashboardState.chartData.baseRecords)
          && dashboardState.chartData.baseRecords.length
          ? dashboardState.chartData.baseRecords
          : dashboardState.rawRecords;
        const hourlyRecords = getHourlyChartRecords(
          baseRecords,
          selectedYear,
          dashboardState.chartFilters || {},
          dashboardState.chartPeriod,
        );
        chartRenderers.renderHourlyChartWithTheme(hourlyRecords).catch((error) => {
          const errorInfo = describeError(error, { code: 'HOURLY_CHART', message: 'Nepavyko atnaujinti valandinio grafiko' });
          console.error(errorInfo.log, error);
          showChartError(TEXT.charts?.errorLoading);
        });
      }

      function handleHourlyMetricClick(event) {
        const button = event?.currentTarget;
        const metric = getDatasetValue(button, 'hourlyMetric');
        if (!metric) {
          return;
        }
        dashboardState.hourlyMetric = normalizeHourlyMetric(metric);
        syncHourlyMetricButtons();
        if (dashboardState.hourlyMetric !== HOURLY_METRIC_HOSPITALIZED) {
          dashboardState.hourlyDepartment = 'all';
          if (selectors.hourlyDepartmentInput) {
            selectors.hourlyDepartmentInput.value = '';
          }
        }
        handleHourlyFilterChange();
      }

      function handleHourlyResetFilters() {
        dashboardState.hourlyMetric = HOURLY_METRIC_ARRIVALS;
        dashboardState.hourlyDepartment = 'all';
        dashboardState.hourlyWeekday = HOURLY_WEEKDAY_ALL;
        dashboardState.hourlyStayBucket = HOURLY_STAY_BUCKET_ALL;
        syncHourlyMetricButtons();
        if (selectors.hourlyDepartmentInput) {
          selectors.hourlyDepartmentInput.value = '';
        }
        if (selectors.hourlyWeekdaySelect) {
          selectors.hourlyWeekdaySelect.value = String(dashboardState.hourlyWeekday);
        }
        if (selectors.hourlyStaySelect) {
          selectors.hourlyStaySelect.value = String(dashboardState.hourlyStayBucket);
        }
        syncHourlyDepartmentVisibility(dashboardState.hourlyMetric);
        handleHourlyFilterChange();
      }

      function handleHourlyDepartmentInput(event) {
        const value = event?.target?.value ?? '';
        dashboardState.hourlyDepartment = normalizeHourlyDepartment(value);
        dashboardState.hourlyDepartmentSuggestIndex = -1;
        updateHourlyDepartmentSuggestions(value);
        handleHourlyFilterChange();
      }

      function handleHourlyDepartmentBlur() {
        window.setTimeout(() => {
          const active = document.activeElement;
          if (active === selectors.hourlyDepartmentInput || active === selectors.hourlyDepartmentToggle) {
            return;
          }
          if (selectors.hourlyDepartmentSuggestions && selectors.hourlyDepartmentSuggestions.contains(active)) {
            return;
          }
          setHourlyDepartmentSuggestions([]);
        }, 120);
      }

      function handleHourlyDepartmentToggle() {
        const isOpen = selectors.hourlyDepartmentSuggestions
          && !selectors.hourlyDepartmentSuggestions.hasAttribute('hidden');
        if (isOpen) {
          setHourlyDepartmentSuggestions([]);
          if (selectors.hourlyDepartmentToggle) {
            selectors.hourlyDepartmentToggle.setAttribute('aria-expanded', 'false');
          }
          if (selectors.hourlyDepartmentInput) {
            selectors.hourlyDepartmentInput.setAttribute('aria-expanded', 'false');
          }
          return;
        }
        updateHourlyDepartmentSuggestions('', { force: true });
        if (selectors.hourlyDepartmentToggle) {
          selectors.hourlyDepartmentToggle.setAttribute('aria-expanded', 'true');
        }
        if (selectors.hourlyDepartmentInput) {
          selectors.hourlyDepartmentInput.setAttribute('aria-expanded', 'true');
          selectors.hourlyDepartmentInput.focus();
        }
      }

      function handleHourlyDepartmentKeydown(event) {
        if (!selectors.hourlyDepartmentSuggestions || selectors.hourlyDepartmentSuggestions.hasAttribute('hidden')) {
          return;
        }
        const items = Array.from(selectors.hourlyDepartmentSuggestions.querySelectorAll('.hourly-suggestions__item'));
        if (!items.length) {
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          dashboardState.hourlyDepartmentSuggestIndex = Math.min(items.length - 1, dashboardState.hourlyDepartmentSuggestIndex + 1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          dashboardState.hourlyDepartmentSuggestIndex = Math.max(0, dashboardState.hourlyDepartmentSuggestIndex - 1);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          const active = items[dashboardState.hourlyDepartmentSuggestIndex] || items[0];
          if (active) {
            applyHourlyDepartmentSelection(active.textContent || '');
          }
          return;
        } else if (event.key === 'Escape') {
          setHourlyDepartmentSuggestions([]);
          return;
        } else {
          return;
        }
        items.forEach((item, index) => {
          item.setAttribute('aria-selected', index === dashboardState.hourlyDepartmentSuggestIndex ? 'true' : 'false');
        });
      }

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
        const hospRange = range(hospShareList);
        const palette = getThemePalette();

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

          const makeHeat = (value, { min, max }) => {
            if (!Number.isFinite(value) || max <= min) {
              return '';
            }
            const intensity = Math.max(0, Math.min(1, (value - min) / (max - min)));
            return computeHeatmapColor(palette.accent, intensity);
          };

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

          const totalHeat = makeHeat(total, totalsRange);
          if (totalHeat) {
            totalCell.classList.add('table-cell--heat');
            totalCell.style.backgroundColor = totalHeat;
          }
          const stayHeat = makeHeat(avgStayEntry, staysRange);
          if (stayHeat) {
            stayCell.classList.add('table-cell--heat');
            stayCell.style.backgroundColor = stayHeat;
          }
          const hospHeat = makeHeat(hospShare, hospRange);
          if (hospHeat) {
            hospCell.classList.add('table-cell--heat');
            hospCell.style.backgroundColor = hospHeat;
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

      function formatEdCardValue(rawValue, format) {
        switch (format) {
          case 'text':
            if (typeof rawValue === 'string') {
              const trimmed = rawValue.trim();
              return trimmed.length ? trimmed : null;
            }
            return null;
          case 'hours':
            if (!Number.isFinite(rawValue)) {
              return null;
            }
            return oneDecimalFormatter.format(rawValue / 60);
          case 'minutes':
            if (!Number.isFinite(rawValue)) {
              return null;
            }
            return numberFormatter.format(Math.round(rawValue));
          case 'percent':
            if (!Number.isFinite(rawValue)) {
              return null;
            }
            return percentFormatter.format(rawValue);
          case 'oneDecimal':
            if (!Number.isFinite(rawValue)) {
              return null;
            }
            return oneDecimalFormatter.format(rawValue);
          case 'ratio':
            if (!Number.isFinite(rawValue) || rawValue <= 0) {
              return null;
            }
            return `1:${oneDecimalFormatter.format(rawValue)}`;
          case 'multiplier':
            if (!Number.isFinite(rawValue)) {
              return null;
            }
            return `${oneDecimalFormatter.format(rawValue)}×`;
          case 'beds':
            if (!Number.isFinite(rawValue)) {
              return null;
            }
            {
              const totalBeds = Number.isFinite(ED_TOTAL_BEDS) ? ED_TOTAL_BEDS : 0;
              const occupied = Math.max(0, Math.round(rawValue));
              if (totalBeds > 0) {
                const share = occupied / totalBeds;
                const percentText = percentFormatter.format(share);
                return `${numberFormatter.format(occupied)}/${numberFormatter.format(totalBeds)} (${percentText})`;
              }
              return numberFormatter.format(occupied);
            }
          default:
            if (!Number.isFinite(rawValue)) {
              return null;
            }
            return numberFormatter.format(rawValue);
        }
      }

      function normalizePercentValue(rawValue) {
        if (!Number.isFinite(rawValue)) {
          return null;
        }
        if (rawValue < 0) {
          return 0;
        }
        if (rawValue <= 1) {
          return rawValue;
        }
        if (rawValue <= 100) {
          return rawValue / 100;
        }
        return 1;
      }

      function getEdCardDeltaInfo(primaryRaw, secondaryRaw, format) {
        if (!Number.isFinite(primaryRaw) || !Number.isFinite(secondaryRaw)) {
          return null;
        }
        const diff = primaryRaw - secondaryRaw;
        if (!Number.isFinite(diff)) {
          return null;
        }

        let trend = 'neutral';
        if (diff > 0) {
          trend = 'up';
        } else if (diff < 0) {
          trend = 'down';
        }

        const reference = formatEdCardValue(secondaryRaw, format);
        let valueText = '';
        let ariaValue = '';

        switch (format) {
          case 'hours': {
            const hours = Math.abs(diff) / 60;
            const rounded = Math.round(hours * 10) / 10;
            if (!rounded) {
              trend = 'neutral';
            }
            valueText = `${oneDecimalFormatter.format(rounded)} val.`;
            ariaValue = `${oneDecimalFormatter.format(rounded)} valandos`;
            break;
          }
          case 'minutes': {
            const minutes = Math.round(Math.abs(diff));
            if (!minutes) {
              trend = 'neutral';
            }
            valueText = `${numberFormatter.format(minutes)} min.`;
            ariaValue = `${numberFormatter.format(minutes)} minutės`;
            break;
          }
          case 'percent': {
            const normalized = Math.abs(diff) <= 1 ? Math.abs(diff) * 100 : Math.abs(diff);
            const rounded = Math.round(normalized * 10) / 10;
            if (!rounded) {
              trend = 'neutral';
            }
            valueText = `${oneDecimalFormatter.format(rounded)} p.p.`;
            ariaValue = `${oneDecimalFormatter.format(rounded)} procentinio punkto`;
            break;
          }
          case 'oneDecimal': {
            const absolute = Math.abs(diff);
            const rounded = Math.round(absolute * 10) / 10;
            if (!rounded) {
              trend = 'neutral';
            }
            valueText = oneDecimalFormatter.format(rounded);
            ariaValue = `${oneDecimalFormatter.format(rounded)} vienetai`;
            break;
          }
          case 'ratio':
            return null;
          default: {
            const absolute = Math.abs(diff);
            const rounded = Math.round(absolute);
            if (!rounded) {
              trend = 'neutral';
            }
            valueText = numberFormatter.format(rounded);
            ariaValue = `${numberFormatter.format(rounded)} vienetai`;
          }
        }

        if (trend === 'neutral') {
          return {
            trend: 'neutral',
            arrow: '→',
            text: 'Be pokyčio',
            reference,
            ariaLabel: reference
              ? `Pokytis lyginant su ${reference}: be pokyčio`
              : 'Pokytis: be pokyčio',
          };
        }

        const arrow = trend === 'up' ? '↑' : '↓';
        const sign = trend === 'up' ? '+' : '−';
        return {
          trend,
          arrow,
          text: `${sign}${valueText}`,
          reference,
          ariaLabel: reference
            ? `Pokytis lyginant su ${reference}: ${sign}${ariaValue}`
            : `Pokytis: ${sign}${ariaValue}`,
        };
      }

      function buildFeedbackTrendInfo(currentValue, previousValue, { currentLabel = '', previousLabel = '' } = {}) {
        if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) {
          return null;
        }

        const diff = currentValue - previousValue;
        const absDiff = Math.round(Math.abs(diff) * 10) / 10;

        let trend = 'neutral';
        if (diff > 0) {
          trend = 'up';
        } else if (diff < 0) {
          trend = 'down';
        }

        if (!absDiff) {
          trend = 'neutral';
        }

        const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
        const sign = trend === 'down' ? '−' : '+';
        const previous = oneDecimalFormatter.format(previousValue);
        const current = oneDecimalFormatter.format(currentValue);
        const referenceLabel = previousLabel || 'praėjusiu mėnesiu';
        const changeSummary = trend === 'neutral'
          ? 'Pokyčio nėra'
          : `${sign}${oneDecimalFormatter.format(absDiff)}`;
        const rangeText = previous && current ? `(${previous} → ${current})` : '';
        const text = [changeSummary, rangeText].filter(Boolean).join(' ');
        const ariaLabel = trend === 'neutral'
          ? `Pokyčio nėra lyginant su ${referenceLabel}. Dabartinis: ${current}.`
          : `Pokytis lyginant su ${referenceLabel}: ${sign}${oneDecimalFormatter.format(absDiff)} (nuo ${previous} iki ${current}).`;

        return {
          trend,
          arrow,
          text,
          ariaLabel,
          previousValue,
          previousLabel,
          currentValue,
          currentLabel,
        };
      }

      function buildEdCardVisuals(config, primaryRaw, secondaryRaw, summary) {
        const visuals = [];

        if (config.format === 'percent' && Number.isFinite(primaryRaw)) {
          const normalized = normalizePercentValue(primaryRaw);
          if (normalized != null) {
            const progress = document.createElement('div');
            progress.className = 'ed-dashboard__card-progress';
            progress.setAttribute('aria-hidden', 'true');
            const fill = document.createElement('div');
            fill.className = 'ed-dashboard__card-progress-fill';
            fill.setAttribute('aria-hidden', 'true');
            const width = `${Math.max(0, Math.min(100, normalized * 100))}%`;
            fill.style.setProperty('--progress-width', width);
            progress.appendChild(fill);

            if (Number.isFinite(secondaryRaw)) {
              const normalizedSecondary = normalizePercentValue(secondaryRaw);
              if (normalizedSecondary != null) {
                const marker = document.createElement('span');
                marker.className = 'ed-dashboard__card-progress-marker';
                marker.setAttribute('aria-hidden', 'true');
                marker.style.left = `${Math.max(0, Math.min(100, normalizedSecondary * 100))}%`;
                const secondaryText = formatEdCardValue(secondaryRaw, config.format);
                if (secondaryText) {
                  marker.title = `Lyginamasis rodiklis: ${secondaryText}`;
                }
                progress.appendChild(marker);
              }
            }

            visuals.push(progress);
          }
        } else if (config.format === 'beds' && Number.isFinite(primaryRaw)) {
          const totalBeds = Number.isFinite(ED_TOTAL_BEDS) ? Math.max(ED_TOTAL_BEDS, 0) : 0;
          if (totalBeds > 0) {
            const occupancyShare = Math.max(0, Math.min(1, primaryRaw / totalBeds));
            const occupancyLevel = occupancyShare > 0.7
              ? 'critical'
              : occupancyShare > 0.5
                ? 'elevated'
                : 'normal';
            const progress = document.createElement('div');
            progress.className = 'ed-dashboard__card-progress';
            progress.setAttribute('aria-hidden', 'true');
            setDatasetValue(progress, 'occupancyLevel', occupancyLevel);
            const fill = document.createElement('div');
            fill.className = 'ed-dashboard__card-progress-fill';
            fill.setAttribute('aria-hidden', 'true');
            setDatasetValue(fill, 'occupancyLevel', occupancyLevel);
            const width = `${Math.round(occupancyShare * 1000) / 10}%`;
            fill.style.setProperty('--progress-width', width);
            const occupancyText = percentFormatter.format(occupancyShare);
            progress.title = `Užimtumas: ${numberFormatter.format(Math.round(primaryRaw))}/${numberFormatter.format(totalBeds)} (${occupancyText})`;
            progress.appendChild(fill);
            visuals.push(progress);
          }
        }

        if (config.secondaryKey) {
          const deltaInfo = getEdCardDeltaInfo(primaryRaw, secondaryRaw, config.format);
            if (deltaInfo) {
              const delta = document.createElement('p');
              delta.className = 'ed-dashboard__card-delta';
              setDatasetValue(delta, 'trend', deltaInfo.trend);
            delta.setAttribute('aria-label', deltaInfo.ariaLabel);
            const arrowSpan = document.createElement('span');
            arrowSpan.className = 'ed-dashboard__card-delta-arrow';
            arrowSpan.textContent = deltaInfo.arrow;
            const textSpan = document.createElement('span');
            textSpan.className = 'ed-dashboard__card-delta-text';
            textSpan.textContent = deltaInfo.text;
            delta.append(arrowSpan, textSpan);
            if (deltaInfo.reference) {
              const referenceSpan = document.createElement('span');
              referenceSpan.className = 'ed-dashboard__card-delta-reference';
              referenceSpan.textContent = `vs ${deltaInfo.reference}`;
              delta.appendChild(referenceSpan);
            }
            visuals.push(delta);
          }
        } else if (config.trendKey && summary?.[config.trendKey]) {
          const trendInfo = summary[config.trendKey];
          const delta = document.createElement('p');
          delta.className = 'ed-dashboard__card-delta';
          setDatasetValue(delta, 'trend', trendInfo.trend || 'neutral');
          if (trendInfo.ariaLabel) {
            delta.setAttribute('aria-label', trendInfo.ariaLabel);
          }

          const arrowSpan = document.createElement('span');
          arrowSpan.className = 'ed-dashboard__card-delta-arrow';
          arrowSpan.textContent = trendInfo.arrow || '→';

          const textSpan = document.createElement('span');
          textSpan.className = 'ed-dashboard__card-delta-text';
          textSpan.textContent = trendInfo.text || '';

          delta.append(arrowSpan, textSpan);

          if (trendInfo.previousLabel) {
            const referenceSpan = document.createElement('span');
            referenceSpan.className = 'ed-dashboard__card-delta-reference';
            referenceSpan.textContent = `vs ${trendInfo.previousLabel}`;
            delta.appendChild(referenceSpan);
          }

          visuals.push(delta);
        }

        return visuals;
      }

      function renderTvMetrics(listElement, metrics) {
        if (!listElement) {
          return;
        }
        listElement.replaceChildren();
        const entries = Array.isArray(metrics)
          ? metrics.map((item) => ({
            label: typeof item?.label === 'string' ? item.label : '',
            value: item?.value != null && item.value !== '' ? String(item.value) : '—',
            meta: item?.meta,
          }))
          : [];
        if (!entries.length) {
          return;
        }
        entries.forEach((entry) => {
          const item = document.createElement('li');
          item.className = 'ed-tv__metric';
          const labelEl = document.createElement('p');
          labelEl.className = 'ed-tv__metric-label';
          labelEl.textContent = entry.label;
          const valueEl = document.createElement('p');
          valueEl.className = 'ed-tv__metric-value';
          valueEl.textContent = entry.value;
          item.append(labelEl, valueEl);
          const metaLines = Array.isArray(entry.meta)
            ? entry.meta
            : (entry.meta != null && entry.meta !== '' ? [entry.meta] : []);
          const filteredMeta = metaLines
            .map((line) => (line != null ? String(line) : ''))
            .map((line) => line.trim())
            .filter((line) => line.length);
          if (filteredMeta.length) {
            const metaEl = document.createElement('p');
            metaEl.className = 'ed-tv__metric-meta';
            metaEl.textContent = filteredMeta.join('\n');
            item.appendChild(metaEl);
          }
          listElement.appendChild(item);
        });
      }

      function updateEdTvPanel(summary, dispositions, displayVariant, dataset, statusInfo) {
        if (!selectors.edTvPanel) {
          return;
        }
        const tvTexts = TEXT.edTv || {};
        if (selectors.edTvTitle && tvTexts.title) {
          selectors.edTvTitle.textContent = tvTexts.title;
        }
        if (selectors.edTvSubtitle) {
          selectors.edTvSubtitle.textContent = tvTexts.subtitle || '';
        }
        const toneValue = dataset?.error
          ? 'error'
          : (dataset?.usingFallback ? 'warning' : (statusInfo?.tone || 'info'));
        setDatasetValue(selectors.edTvPanel, 'tone', toneValue);
        if (selectors.edTvStatusText) {
          selectors.edTvStatusText.textContent = statusInfo?.message || TEXT.ed.status.loading;
        }
        if (selectors.edTvUpdated) {
          const timestampText = statusInfo?.timestamp;
          const updatedText = timestampText
            ? (typeof tvTexts.updated === 'function'
              ? tvTexts.updated(timestampText)
              : `Atnaujinta ${timestampText}`)
            : (tvTexts.updatedUnknown || TEXT.status.loading);
          selectors.edTvUpdated.textContent = updatedText;
        }
        if (selectors.edTvNotice) {
          let noticeText = '';
          let noticeTone = '';
          if (dataset?.error) {
            noticeText = tvTexts.notices?.error || '';
            noticeTone = 'error';
          } else if (dataset?.usingFallback) {
            noticeText = tvTexts.notices?.fallback || '';
            noticeTone = 'warning';
          } else if (!statusInfo?.hasEntries) {
            noticeText = tvTexts.notices?.empty || '';
            noticeTone = 'warning';
          }
          if (noticeText) {
            selectors.edTvNotice.textContent = noticeText;
            setDatasetValue(selectors.edTvNotice, 'tone', noticeTone || 'info');
            selectors.edTvNotice.hidden = false;
          } else {
            selectors.edTvNotice.hidden = true;
            selectors.edTvNotice.textContent = '';
            selectors.edTvNotice.removeAttribute('data-tone');
          }
        }
        const groupTexts = tvTexts.groups?.[displayVariant] || tvTexts.groups?.snapshot || {};
        if (selectors.edTvPrimaryTitle && groupTexts.now) {
          selectors.edTvPrimaryTitle.textContent = groupTexts.now;
        }
        if (selectors.edTvStaffTitle && groupTexts.staff) {
          selectors.edTvStaffTitle.textContent = groupTexts.staff;
        }
        if (selectors.edTvFlowTitle && groupTexts.flow) {
          selectors.edTvFlowTitle.textContent = groupTexts.flow;
        }
        if (selectors.edTvTriageTitle && groupTexts.triage) {
          selectors.edTvTriageTitle.textContent = groupTexts.triage;
        }

        const metricTexts = tvTexts.metrics || {};
        const totalBeds = Number.isFinite(ED_TOTAL_BEDS) ? ED_TOTAL_BEDS : null;
        const currentPatients = Number.isFinite(summary.currentPatients) ? summary.currentPatients : null;
        const occupiedBeds = Number.isFinite(summary.occupiedBeds) ? summary.occupiedBeds : null;
        const freeBeds = totalBeds != null && occupiedBeds != null
          ? Math.max(totalBeds - occupiedBeds, 0)
          : null;
        const occupancyShare = totalBeds && occupiedBeds != null ? occupiedBeds / totalBeds : null;

        let primaryMetrics = [];
        let staffMetrics = [];
        let flowMetrics = [];

        if (displayVariant === 'snapshot') {
          const occupancyPercentText = occupancyShare != null ? percentFormatter.format(occupancyShare) : null;
          const freeShare = totalBeds && freeBeds != null && totalBeds > 0 ? freeBeds / totalBeds : null;
          const bedStatusLines = [];
          if (occupiedBeds != null) {
            const occupiedParts = [];
            if (totalBeds != null) {
              occupiedParts.push(`${numberFormatter.format(occupiedBeds)} / ${numberFormatter.format(totalBeds)} lov.`);
            } else {
              occupiedParts.push(`${numberFormatter.format(occupiedBeds)} lov.`);
            }
            if (occupancyShare != null) {
              occupiedParts.push(`(${percentFormatter.format(occupancyShare)})`);
            }
            const occupiedLabel = metricTexts.bedOccupied || metricTexts.occupiedBeds || 'Užimta';
            bedStatusLines.push(`${occupiedLabel}: ${occupiedParts.join(' ')}`.trim());
          }
          if (freeBeds != null) {
            const freeParts = [`${numberFormatter.format(freeBeds)} lov.`];
            if (freeShare != null) {
              freeParts.push(`(${percentFormatter.format(freeShare)})`);
            }
            const freeLabel = metricTexts.bedFree || metricTexts.freeBeds || 'Laisvos';
            bedStatusLines.push(`${freeLabel}: ${freeParts.join(' ')}`.trim());
          }
          const occupancyValue = occupancyPercentText
            || (occupiedBeds != null && totalBeds != null
              ? `${numberFormatter.format(occupiedBeds)} / ${numberFormatter.format(totalBeds)} lov.`
              : (occupiedBeds != null ? `${numberFormatter.format(occupiedBeds)} lov.` : '—'));

          primaryMetrics = [
            {
              label: metricTexts.currentPatients || 'Šiuo metu pacientų',
              value: currentPatients != null ? numberFormatter.format(currentPatients) : '—',
            },
            {
              label: metricTexts.bedStatus || metricTexts.occupancy || 'Lovų būklė',
              value: occupancyValue,
              meta: bedStatusLines,
            },
          ];

          const nurseRatioValue = Number.isFinite(summary.nursePatientsPerStaff)
            ? summary.nursePatientsPerStaff
            : null;
          const nurseRatioText = formatEdCardValue(nurseRatioValue, 'ratio');
          const nurseStaff = currentPatients != null && nurseRatioValue && nurseRatioValue > 0
            ? currentPatients / nurseRatioValue
            : null;
          const doctorRatioValue = Number.isFinite(summary.doctorPatientsPerStaff)
            ? summary.doctorPatientsPerStaff
            : null;
          const doctorRatioText = formatEdCardValue(doctorRatioValue, 'ratio');
          const doctorStaff = currentPatients != null && doctorRatioValue && doctorRatioValue > 0
            ? currentPatients / doctorRatioValue
            : null;

          const staffValueParts = [];
          const staffMetaLines = [];
          if (nurseRatioText) {
            const shortLabel = metricTexts.nurseRatioShort || 'Sl.';
            staffValueParts.push(`${shortLabel} ${nurseRatioText}`);
            const nurseMeta = [`${metricTexts.nurseRatio || 'Slaugytojai'}: ${nurseRatioText}`];
            if (nurseStaff != null) {
              nurseMeta.push(`(~${oneDecimalFormatter.format(nurseStaff)} slaugyt.)`);
            }
            staffMetaLines.push(nurseMeta.join(' '));
          }
          if (doctorRatioText) {
            const shortLabel = metricTexts.doctorRatioShort || 'Gyd.';
            staffValueParts.push(`${shortLabel} ${doctorRatioText}`);
            const doctorMeta = [`${metricTexts.doctorRatio || 'Gydytojai'}: ${doctorRatioText}`];
            if (doctorStaff != null) {
              doctorMeta.push(`(~${oneDecimalFormatter.format(doctorStaff)} gyd.)`);
            }
            staffMetaLines.push(doctorMeta.join(' '));
          }

          const staffCardLabel = metricTexts.staffCombined || metricTexts.nurseRatio || 'Santykiai';
          const staffCardValue = staffValueParts.length ? staffValueParts.join(' · ') : '—';
          staffMetrics = [
            {
              label: staffCardLabel,
              value: staffCardValue,
              meta: staffMetaLines,
            },
          ];

          const avgLos = formatEdCardValue(summary.avgLosMinutes, 'hours');
          if (avgLos != null) {
            flowMetrics.push({
              label: metricTexts.avgLos || 'Vid. buvimas',
              value: `${avgLos} val.`,
            });
          }
          const doorMinutes = formatEdCardValue(summary.avgDoorToProviderMinutes, 'minutes');
          if (doorMinutes != null) {
            flowMetrics.push({
              label: metricTexts.door || 'Durys → gyd.',
              value: `${doorMinutes} min.`,
            });
          }
          const decisionMinutes = formatEdCardValue(summary.avgDecisionToLeaveMinutes, 'minutes');
          if (decisionMinutes != null) {
            flowMetrics.push({
              label: metricTexts.decision || 'Sprendimas → išvykimas',
              value: `${decisionMinutes} min.`,
            });
          }
          const hospShare = formatEdCardValue(summary.hospitalizedShare, 'percent');
          if (hospShare != null) {
            flowMetrics.push({
              label: metricTexts.hospitalizedShare || 'Hospitalizuojama dalis',
              value: hospShare,
            });
          }
        } else {
          const avgDaily = Number.isFinite(summary.avgDailyPatients)
            ? oneDecimalFormatter.format(summary.avgDailyPatients)
            : null;
          const totalPatients = Number.isFinite(summary.totalPatients)
            ? numberFormatter.format(summary.totalPatients)
            : null;
          const avgLos = formatEdCardValue(summary.avgLosMinutes, 'hours');
          const hospShare = formatEdCardValue(summary.hospitalizedShare, 'percent');
          primaryMetrics = [
            {
              label: metricTexts.avgDaily || 'Vid. pacientų/d.',
              value: avgDaily ?? '—',
              meta: totalPatients ? `${totalPatients} pac. analizuota` : '',
            },
            {
              label: metricTexts.avgLos || 'Vid. buvimas',
              value: avgLos != null ? `${avgLos} val.` : '—',
            },
            {
              label: metricTexts.hospitalizedShare || 'Hospitalizuojama dalis',
              value: hospShare ?? '—',
            },
          ];

          const doorMinutes = formatEdCardValue(summary.avgDoorToProviderMinutes, 'minutes');
          const decisionMinutes = formatEdCardValue(summary.avgDecisionToLeaveMinutes, 'minutes');
          staffMetrics = [
            {
              label: metricTexts.door || 'Durys → gyd.',
              value: doorMinutes != null ? `${doorMinutes} min.` : '—',
            },
            {
              label: metricTexts.decision || 'Sprendimas → išvykimas',
              value: decisionMinutes != null ? `${decisionMinutes} min.` : '—',
            },
          ];

          const monthAvg = formatEdCardValue(summary.avgLosMonthMinutes, 'hours');
          if (monthAvg != null) {
            flowMetrics.push({
              label: metricTexts.avgLos || 'Vid. buvimas',
              value: `${monthAvg} val.`,
              meta: '',
            });
          }
          const monthShare = formatEdCardValue(summary.hospitalizedMonthShare, 'percent');
          if (monthShare != null) {
            flowMetrics.push({
              label: metricTexts.hospitalizedShare || 'Hospitalizuojama dalis',
              value: monthShare,
              meta: '',
            });
          }
        }

        renderTvMetrics(selectors.edTvPrimaryMetrics, primaryMetrics);
        renderTvMetrics(selectors.edTvStaffMetrics, staffMetrics);
        renderTvMetrics(selectors.edTvFlowMetrics, flowMetrics);

        if (selectors.edTvTriageList) {
          selectors.edTvTriageList.replaceChildren();
          const list = Array.isArray(dispositions) ? dispositions : [];
          const total = list.reduce((acc, entry) => acc + (Number.isFinite(entry?.count) ? entry.count : 0), 0);
          if (!list.length || total <= 0) {
            const emptyItem = document.createElement('li');
            emptyItem.className = 'ed-tv__triage-item';
            const label = document.createElement('p');
            label.className = 'ed-tv__triage-label';
            label.textContent = tvTexts.triageEmpty || 'Pasiskirstymo duomenų nėra.';
            emptyItem.appendChild(label);
            selectors.edTvTriageList.appendChild(emptyItem);
            if (selectors.edTvTriageMeta) {
              selectors.edTvTriageMeta.textContent = '';
            }
          } else {
            list.forEach((entry) => {
              if (!entry) {
                return;
              }
              const item = document.createElement('li');
              item.className = 'ed-tv__triage-item';
              if (entry.categoryKey) {
                item.classList.add(`ed-tv__triage-item--c${entry.categoryKey}`);
              } else {
                item.classList.add('ed-tv__triage-item--other');
              }
              const label = document.createElement('p');
              label.className = 'ed-tv__triage-label';
              label.textContent = entry.label || '';
              const meta = document.createElement('div');
              meta.className = 'ed-tv__triage-meta';
              const countSpan = document.createElement('span');
              countSpan.textContent = Number.isFinite(entry.count)
                ? numberFormatter.format(entry.count)
                : '—';
              const shareValue = Number.isFinite(entry.share)
                ? entry.share
                : (total > 0 && Number.isFinite(entry.count) ? entry.count / total : null);
              const shareSpan = document.createElement('span');
              shareSpan.textContent = shareValue != null ? percentFormatter.format(shareValue) : '—';
              meta.append(countSpan, shareSpan);
              const bar = document.createElement('div');
              bar.className = 'ed-tv__triage-bar';
              const fill = document.createElement('div');
              fill.className = 'ed-tv__triage-bar-fill';
              if (shareValue != null) {
                const width = Math.max(0, Math.min(100, shareValue * 100));
                fill.style.width = `${width}%`;
              } else {
                fill.style.width = '0%';
              }
              bar.appendChild(fill);
              item.append(label, meta, bar);
              selectors.edTvTriageList.appendChild(item);
            });
            if (selectors.edTvTriageMeta) {
              const totalText = numberFormatter.format(total);
              selectors.edTvTriageMeta.textContent = typeof tvTexts.triageTotal === 'function'
                ? tvTexts.triageTotal(totalText)
                : `Iš viso: ${totalText}`;
            }
          }
        }
      }

      const MIN_STATUS_YEAR = 2000;
      const MAX_STATUS_FUTURE_OFFSET_MS = 7 * 24 * 60 * 60 * 1000;

      function normalizeStatusTimestamp(candidate, fallback) {
        const fallbackDate = fallback instanceof Date && !Number.isNaN(fallback.getTime())
          ? fallback
          : null;
        if (!(candidate instanceof Date) || Number.isNaN(candidate.getTime())) {
          return fallbackDate;
        }
        const year = candidate.getFullYear();
        const now = Date.now();
        const candidateTime = candidate.getTime();
        if (year < MIN_STATUS_YEAR || candidateTime > now + MAX_STATUS_FUTURE_OFFSET_MS) {
          console.warn('Ignoruojamas neadekvatus ED momentinio vaizdo laiko žymuo:', candidate.toISOString());
          return fallbackDate;
        }
        return candidate;
      }

      function buildEdStatus(summary, dataset, displayVariant) {
        const updatedAt = dataset?.updatedAt instanceof Date && !Number.isNaN(dataset.updatedAt.getTime())
          ? dataset.updatedAt
          : null;
        const snapshotDateRaw = summary?.latestSnapshotAt instanceof Date && !Number.isNaN(summary.latestSnapshotAt.getTime())
          ? summary.latestSnapshotAt
          : null;
        const statusDate = normalizeStatusTimestamp(snapshotDateRaw, updatedAt) || updatedAt || null;
        const timestampText = statusDate ? statusTimeFormatter.format(statusDate) : null;
        const hasEntries = displayVariant === 'snapshot'
          ? Number.isFinite(summary?.entryCount) && summary.entryCount > 0
          : Number.isFinite(summary?.totalPatients) && summary.totalPatients > 0;
        let tone = 'info';
        let message = '';
        if (dataset?.error) {
          message = TEXT.ed.status.error(dataset.error);
          tone = 'error';
        } else if (dataset?.usingFallback) {
          const reason = dataset.lastErrorMessage || TEXT.ed.status.noUrl;
          message = TEXT.ed.status.fallback(reason, timestampText);
          tone = 'warning';
        } else if (!hasEntries) {
          message = TEXT.ed.status.empty;
          tone = 'warning';
        } else {
          const successTimestamp = timestampText || statusTimeFormatter.format(new Date());
          message = TEXT.ed.status.success(successTimestamp);
          tone = 'success';
        }
      return {
        message,
        tone,
        timestamp: timestampText,
        statusDate,
        updatedAt,
        hasEntries,
      };
    }

    const SVG_NS = 'http://www.w3.org/2000/svg';

    const edSectionIconDefinitions = {
      flow(svg) {
        svg.appendChild(createSvgElement('path', { d: 'M6 6C10 6 13 9 18 12C13 15 10 18 6 18' }));
      },
      efficiency(svg) {
        svg.appendChild(createSvgElement('circle', { cx: '12', cy: '12', r: '8.5' }));
        svg.appendChild(createSvgElement('path', { d: 'M12 8v4.8l3 2.2' }));
      },
      feedback(svg) {
        svg.appendChild(createSvgElement('path', {
          d: 'M6 6.5h10a3 3 0 0 1 3 3v4.5a3 3 0 0 1-3 3H10l-3 2.5v-2.5H6a3 3 0 0 1-3-3V9.5a3 3 0 0 1 3-3z',
        }));
        svg.appendChild(createSvgElement('path', { d: 'M8.5 12h7' }));
      },
      insights(svg) {
        svg.appendChild(createSvgElement('path', { d: 'M5 17V7' }));
        svg.appendChild(createSvgElement('path', { d: 'M9 17V11' }));
        svg.appendChild(createSvgElement('path', { d: 'M13 17V9' }));
        svg.appendChild(createSvgElement('path', { d: 'M17 17V6' }));
      },
      default(svg) {
        svg.appendChild(createSvgElement('circle', { cx: '12', cy: '12', r: '9' }));
        svg.appendChild(createSvgElement('path', { d: 'M9 12h6' }));
        svg.appendChild(createSvgElement('path', { d: 'M12 9v6' }));
      },
    };

    function createSvgElement(type, attributes = {}) {
      const element = document.createElementNS(SVG_NS, type);
      Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, String(value));
      });
      element.setAttribute('stroke-linecap', 'round');
      element.setAttribute('stroke-linejoin', 'round');
      return element;
    }

    function createEdSectionIcon(iconKey) {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.5');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      const iconName = iconKey && edSectionIconDefinitions[iconKey]
        ? iconKey
        : 'default';
      edSectionIconDefinitions[iconName](svg);
        return svg;
      }


    function normalizeEdSearchQuery(value) {
      if (typeof value !== 'string') {
        return '';
      }
      return value.trim().toLowerCase();
    }

    function matchesEdSearch(record, query) {
      if (!query) {
        return true;
      }
      const haystack = [
        record?.disposition,
        record?.dispositionCategory,
        record?.nurseRatioText,
        record?.doctorRatioText,
        record?.rawTimestamp,
        record?.dateKey,
      ]
        .filter((part) => typeof part === 'string')
        .map((part) => part.toLowerCase())
        .join(' ');
      return haystack.includes(query);
    }

    function applyEdSearchFilter(query) {
      dashboardState.edSearchQuery = normalizeEdSearchQuery(query);
      renderEdDashboard(dashboardState.ed);
    }

      async function renderEdDashboard(edData) {
        return edRenderer.renderEdDashboard(edData);
      }

      async function renderEdDispositionsChart(dispositions, text, displayVariant) {
        return chartRenderers.renderEdDispositionsChart(dispositions, text, displayVariant);
      }




      function clampColorChannel(value) {
        return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
      }

      function parseColorToRgb(color) {
        if (typeof color !== 'string') {
          return null;
        }
        const trimmed = color.trim();
        if (!trimmed) {
          return null;
        }
        if (trimmed.startsWith('#')) {
          let hex = trimmed.slice(1);
          if (hex.length === 3 || hex.length === 4) {
            hex = hex
              .split('')
              .map((char) => char + char)
              .join('');
          }
          if (hex.length === 6 || hex.length === 8) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            if ([r, g, b].every((channel) => Number.isFinite(channel))) {
              return { r, g, b };
            }
          }
          return null;
        }
        const rgbMatch = trimmed.match(/rgba?\(([^)]+)\)/i);
        if (rgbMatch) {
          const parts = rgbMatch[1]
            .split(',')
            .map((part) => Number.parseFloat(part.trim()))
            .filter((value, index) => index < 3 && Number.isFinite(value));
          if (parts.length === 3) {
            const [r, g, b] = parts;
            return { r: clampColorChannel(r), g: clampColorChannel(g), b: clampColorChannel(b) };
          }
        }
        return null;
      }

      function relativeLuminance({ r, g, b }) {
        const normalize = (channel) => {
          const ratio = channel / 255;
          if (ratio <= 0.03928) {
            return ratio / 12.92;
          }
          return ((ratio + 0.055) / 1.055) ** 2.4;
        };
        const linearR = normalize(clampColorChannel(r));
        const linearG = normalize(clampColorChannel(g));
        const linearB = normalize(clampColorChannel(b));
        return 0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB;
      }

      function rgbToRgba(rgb, alpha) {
        const safeAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
        const formattedAlpha = safeAlpha === 1 ? '1' : Number(safeAlpha.toFixed(3)).toString();
        return `rgba(${clampColorChannel(rgb.r)}, ${clampColorChannel(rgb.g)}, ${clampColorChannel(rgb.b)}, ${formattedAlpha})`;
      }

      function ensureRgb(color, fallback) {
        const parsed = typeof color === 'string' ? parseColorToRgb(color) : null;
        if (parsed) {
          return parsed;
        }
        if (fallback && typeof fallback === 'object') {
          const { r, g, b } = fallback;
          if ([r, g, b].every((channel) => Number.isFinite(channel))) {
            return {
              r: clampColorChannel(r),
              g: clampColorChannel(g),
              b: clampColorChannel(b),
            };
          }
        }
        return { r: 37, g: 99, b: 235 };
      }

      function mixRgbColors(rgbA, rgbB, weight) {
        const hasA = rgbA && [rgbA.r, rgbA.g, rgbA.b].every((channel) => Number.isFinite(channel));
        const hasB = rgbB && [rgbB.r, rgbB.g, rgbB.b].every((channel) => Number.isFinite(channel));
        if (!hasA && !hasB) {
          return { r: 37, g: 99, b: 235 };
        }
        if (!hasA) {
          return {
            r: clampColorChannel(rgbB.r),
            g: clampColorChannel(rgbB.g),
            b: clampColorChannel(rgbB.b),
          };
        }
        if (!hasB) {
          return {
            r: clampColorChannel(rgbA.r),
            g: clampColorChannel(rgbA.g),
            b: clampColorChannel(rgbA.b),
          };
        }
        const ratio = Number.isFinite(weight) ? Math.max(0, Math.min(1, weight)) : 0;
        const inverse = 1 - ratio;
        return {
          r: clampColorChannel(rgbA.r * inverse + rgbB.r * ratio),
          g: clampColorChannel(rgbA.g * inverse + rgbB.g * ratio),
          b: clampColorChannel(rgbA.b * inverse + rgbB.b * ratio),
        };
      }

      function createSequentialPalette(baseRgb, softRgb, surfaceRgb, count, theme) {
        const safeCount = Math.max(1, Math.floor(Number(count)) || 1);
        const palette = [];
        const softenTarget = mixRgbColors(softRgb, surfaceRgb, theme === 'dark' ? 0.18 : 0.32);
        for (let index = 0; index < safeCount; index += 1) {
          const progress = safeCount === 1 ? 0.5 : index / (safeCount - 1);
          const softened = mixRgbColors(baseRgb, softRgb, 0.2 + progress * 0.18);
          const tinted = mixRgbColors(softened, softenTarget, theme === 'dark' ? progress * 0.16 : progress * 0.28);
          palette.push(tinted);
        }
        return palette;
      }

      function buildFunnelTextPalette(baseColor) {
        const fallbackRgb = { r: 15, g: 23, b: 42 };
        const rgb = parseColorToRgb(baseColor) || fallbackRgb;
        const luminance = relativeLuminance(rgb);
        const isLightText = luminance > 0.55;
        return {
          value: rgbToRgba(rgb, isLightText ? 0.94 : 0.98),
          label: rgbToRgba(rgb, isLightText ? 0.82 : 0.74),
          percent: rgbToRgba(rgb, isLightText ? 0.72 : 0.66),
          guide: rgbToRgba(rgb, isLightText ? 0.52 : 0.22),
          outline: rgbToRgba(rgb, isLightText ? 0.36 : 0.2),
          fallback: rgbToRgba(rgb, isLightText ? 0.9 : 0.92),
          shadow: isLightText ? 'rgba(8, 12, 32, 0.45)' : 'rgba(255, 255, 255, 0.3)',
          shadowBlur: isLightText ? 8 : 5,
        };
      }

      function getThemeStyleTarget() {
        return document.body || document.documentElement;
      }

      function getThemePalette() {
        const styleTarget = getThemeStyleTarget();
        const rootStyles = getComputedStyle(styleTarget);
        const danger = rootStyles.getPropertyValue('--color-danger').trim() || '#c34b55';
        return {
          accent: rootStyles.getPropertyValue('--color-accent').trim() || '#2563eb',
          accentSoft: rootStyles.getPropertyValue('--color-accent-soft').trim() || 'rgba(37, 99, 235, 0.18)',
          weekendAccent: rootStyles.getPropertyValue('--color-weekend').trim() || '#f97316',
          weekendAccentSoft: rootStyles.getPropertyValue('--color-weekend-soft').trim() || 'rgba(249, 115, 22, 0.2)',
          success: rootStyles.getPropertyValue('--color-success').trim() || '#16a34a',
          danger,
          dangerSoft: rootStyles.getPropertyValue('--color-danger-soft').trim()
            || rgbToRgba(ensureRgb(danger, { r: 195, g: 75, b: 85 }), 0.28),
          textColor: rootStyles.getPropertyValue('--color-text').trim() || '#0f172a',
          textMuted: rootStyles.getPropertyValue('--color-text-muted').trim() || '#475569',
          gridColor: rootStyles.getPropertyValue('--chart-grid').trim() || 'rgba(15, 23, 42, 0.12)',
          surface: rootStyles.getPropertyValue('--color-surface').trim() || '#f8fafc',
        };
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

      function drawFunnelShape(canvas, steps, accentColor, textColor) {
        if (!canvas) {
          return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return;
        }
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (width === 0 || height === 0) {
          return;
        }
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
          canvas.width = width * dpr;
          canvas.height = height * dpr;
        }
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.scale(dpr, dpr);

        const rawValues = steps.map((step) => step.value || 0);
        const baselineValue = rawValues.length ? rawValues[0] : 0;
        const maxValue = Math.max(baselineValue, ...rawValues);
        const fontFamily = getComputedStyle(getThemeStyleTarget()).fontFamily;
        const textPalette = buildFunnelTextPalette(textColor);

        if (!Number.isFinite(maxValue) || maxValue <= 0) {
          ctx.fillStyle = textPalette.fallback;
          ctx.font = `500 14px ${fontFamily}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(TEXT.charts.funnelEmpty || 'Piltuvėlio duomenų nėra.', width / 2, height / 2);
          ctx.restore();
          return;
        }

        const paddingX = Math.max(24, Math.min(56, width * 0.1));
        const paddingTop = Math.max(24, height * 0.08);
        const labelAreaHeight = Math.max(72, height * 0.22);
        const paddingBottom = Math.max(32, height * 0.12);
        const funnelHeight = Math.max(48, height - paddingTop - labelAreaHeight - paddingBottom);
        const centerY = paddingTop + labelAreaHeight + funnelHeight / 2;
        const stepsCount = steps.length;
        const xSpacing = stepsCount > 1 ? (width - paddingX * 2) / (stepsCount - 1) : 0;
        const xPositions = steps.map((_, index) => (stepsCount > 1 ? paddingX + index * xSpacing : width / 2));
        const referenceValue = baselineValue > 0 ? baselineValue : maxValue;
        const maxThickness = funnelHeight;
        const minThickness = Math.max(18, maxThickness * 0.18);
        const thicknesses = steps.map((step) => {
          const value = Math.max(0, step.value || 0);
          if (!Number.isFinite(value) || referenceValue <= 0) {
            return minThickness;
          }
          const rawRatio = value / referenceValue;
          const safeRatio = Math.min(1, Math.max(0, rawRatio));
          return Math.max(minThickness, safeRatio * maxThickness);
        });

        const topPoints = xPositions.map((x, index) => ({ x, y: centerY - thicknesses[index] / 2 }));
        const bottomPoints = xPositions.map((x, index) => ({ x, y: centerY + thicknesses[index] / 2 })).reverse();

        const accentGradientColor = typeof accentColor === 'string' && accentColor.trim() ? accentColor : '#8b5cf6';
        const gradient = ctx.createLinearGradient(paddingX, topPoints[0]?.y ?? centerY, width - paddingX, bottomPoints[0]?.y ?? centerY);
        gradient.addColorStop(0, '#ffb56b');
        gradient.addColorStop(0.45, '#ff6f91');
        gradient.addColorStop(0.78, '#f472b6');
        gradient.addColorStop(1, accentGradientColor);

        ctx.beginPath();
        if (topPoints.length) {
          ctx.moveTo(topPoints[0].x, topPoints[0].y);
          for (let i = 1; i < topPoints.length; i += 1) {
            const prev = topPoints[i - 1];
            const current = topPoints[i];
            const midX = (prev.x + current.x) / 2;
            ctx.bezierCurveTo(midX, prev.y, midX, current.y, current.x, current.y);
          }
        }
        if (bottomPoints.length) {
          ctx.lineTo(bottomPoints[0].x, bottomPoints[0].y);
          for (let i = 1; i < bottomPoints.length; i += 1) {
            const prev = bottomPoints[i - 1];
            const current = bottomPoints[i];
            const midX = (prev.x + current.x) / 2;
            ctx.bezierCurveTo(midX, prev.y, midX, current.y, current.x, current.y);
          }
        }
        ctx.closePath();

        ctx.shadowColor = 'rgba(15, 23, 42, 0.5)';
        ctx.shadowBlur = 32;
        ctx.shadowOffsetY = 24;
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = textPalette.outline;
        ctx.stroke();

        const funnelTop = topPoints.length ? Math.min(...topPoints.map((point) => point.y)) : paddingTop + labelAreaHeight;
        const funnelBottom = bottomPoints.length ? Math.max(...bottomPoints.map((point) => point.y)) : centerY + maxThickness / 2;

        const valueFontSize = Math.max(22, Math.min(34, width * 0.05));
        const labelFontSize = Math.max(12, Math.min(16, valueFontSize * 0.45));
        const percentFontSize = Math.max(11, Math.min(14, valueFontSize * 0.38));
        const valueBaselineY = paddingTop + valueFontSize;
        const labelBaselineY = valueBaselineY + labelFontSize + 6;
        const percentBaselineY = labelBaselineY + percentFontSize + 6;
        const labelAreaBottom = percentBaselineY + 6;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.shadowColor = textPalette.shadow;
        ctx.shadowBlur = textPalette.shadowBlur;
        ctx.shadowOffsetY = 1;

        steps.forEach((step, index) => {
          const x = xPositions[index];
          const rawValue = Math.max(0, step.value || 0);
          const ratio = referenceValue > 0 ? Math.max(0, rawValue / referenceValue) : 0;
          ctx.fillStyle = textPalette.value;
          ctx.font = `700 ${valueFontSize}px ${fontFamily}`;
          ctx.fillText(numberFormatter.format(Math.round(rawValue)), x, valueBaselineY);
          ctx.fillStyle = textPalette.label;
          ctx.font = `500 ${labelFontSize}px ${fontFamily}`;
          ctx.fillText(step.label, x, labelBaselineY);
          ctx.fillStyle = textPalette.percent;
          ctx.font = `600 ${percentFontSize}px ${fontFamily}`;
          ctx.fillText(percentFormatter.format(ratio), x, percentBaselineY);
        });

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        if (stepsCount > 0) {
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = textPalette.guide;
          steps.forEach((_, index) => {
            const x = xPositions[index];
            const lineStartY = Math.min(funnelTop - 6, labelAreaBottom + 12);
            ctx.beginPath();
            ctx.moveTo(x, lineStartY);
            ctx.lineTo(x, funnelBottom + 18);
            ctx.stroke();
          });
        }

        ctx.restore();
      }

      function renderFunnelShape(canvas, funnelData, accentColor, textColor) {
        if (!canvas) {
          return;
        }

        const stepsConfig = Array.isArray(TEXT.charts.funnelSteps) && TEXT.charts.funnelSteps.length
          ? TEXT.charts.funnelSteps
          : [
              { key: 'arrived', label: 'Atvykę' },
              { key: 'discharged', label: 'Išleisti' },
              { key: 'hospitalized', label: 'Hospitalizuoti' },
            ];

        const steps = stepsConfig.map((step) => ({
          label: step.label,
          value: Number.isFinite(Number(funnelData?.[step.key])) ? Number(funnelData[step.key]) : 0,
        }));

        canvas.__funnelState = { steps, accentColor, textColor };

        if (!canvas.__funnelObserver && typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver(() => {
            if (canvas.__funnelState) {
              const { steps: currentSteps, accentColor: currentAccent, textColor: currentText } = canvas.__funnelState;
              drawFunnelShape(canvas, currentSteps, currentAccent, currentText);
            }
          });
          observer.observe(canvas);
          canvas.__funnelObserver = observer;
        }

        drawFunnelShape(canvas, steps, accentColor, textColor);
      }

      async function loadDashboard() {
        if (dashboardState.loading) {
          dashboardState.queuedReload = true;
          return;
        }

        dashboardState.loadCounter += 1;
        const runNumber = dashboardState.loadCounter;
        const loadHandle = clientConfig.profilingEnabled
          ? perfMonitor.start('dashboard-load', { seansas: runNumber })
          : null;
        const fetchHandle = clientConfig.profilingEnabled
          ? perfMonitor.start('duomenų-atsiuntimas', { seansas: runNumber })
          : null;
        const fetchSummary = { pagrindinis: 'tinklas', istorinis: 'tinklas' };
        let fetchMeasured = false;

        dashboardState.loading = true;
        const shouldShowSkeletons = !dashboardState.hasLoadedOnce;
        if (shouldShowSkeletons && (!selectors.kpiGrid || !selectors.kpiGrid.children.length)) {
          showKpiSkeleton();
        }
        const chartsInitialized = dashboardState.charts.daily
          || dashboardState.charts.dow
          || dashboardState.charts.dowStay
          || dashboardState.charts.funnel;
        if (shouldShowSkeletons && !chartsInitialized) {
          showChartSkeletons();
        }
        if (shouldShowSkeletons && (!selectors.edCards || !selectors.edCards.children.length)) {
          showEdSkeleton();
        }

        try {
          setStatus('loading');
          if (selectors.edStatus) {
            selectors.edStatus.textContent = TEXT.ed.status.loading;
            setDatasetValue(selectors.edStatus, 'tone', 'info');
          }
          const primaryChunkReporter = createChunkReporter('Pagrindinis CSV');
          const historicalChunkReporter = createChunkReporter('Istorinis CSV');
          const workerProgressReporter = createChunkReporter('Apdorojama CSV');
          const edChunkReporter = createChunkReporter('ED CSV');
          const [dataResult, feedbackResult, edResult] = await Promise.allSettled([
            fetchData({
              onPrimaryChunk: primaryChunkReporter,
              onHistoricalChunk: historicalChunkReporter,
              onWorkerProgress: workerProgressReporter,
            }),
            fetchFeedbackData(),
            fetchEdData({ onChunk: edChunkReporter }),
          ]);

          if (clientConfig.profilingEnabled && fetchHandle) {
            const primaryCache = dataResult.status === 'fulfilled'
              ? describeCacheMeta(dataResult.value?.meta?.primary)
              : 'klaida';
            const historicalCache = dataResult.status === 'fulfilled'
              ? describeCacheMeta(dataResult.value?.meta?.historical)
              : 'klaida';
            fetchSummary.pagrindinis = primaryCache;
            fetchSummary.istorinis = historicalCache;
            perfMonitor.finish(fetchHandle, {
              pagrindinis: primaryCache,
              istorinis: historicalCache,
              fallbackas: dashboardState.usingFallback,
              šaltiniai: dataResult.status === 'fulfilled' ? dataResult.value?.meta?.sources?.length || 0 : 0,
            });
            fetchMeasured = true;
          }

          if (edResult.status === 'fulfilled') {
            dashboardState.ed = edResult.value;
          } else {
            const fallbackMessage = TEXT.ed.status.error(TEXT.status.error);
            const errorInfo = edResult.reason
              ? describeError(edResult.reason, { code: 'ED_DATA_LOAD', message: fallbackMessage })
              : { userMessage: fallbackMessage, log: `[ED_DATA_LOAD] ${fallbackMessage}` };
            console.error(errorInfo.log, edResult.reason);
            const fallbackSummary = createEmptyEdSummary();
            dashboardState.ed = {
              records: [],
              summary: fallbackSummary,
              dispositions: [],
              daily: [],
              usingFallback: false,
              lastErrorMessage: errorInfo.userMessage,
              error: errorInfo.userMessage,
              updatedAt: new Date(),
            };
          }
          if (dataResult.status !== 'fulfilled') {
            throw dataResult.reason;
          }

          const dataset = dataResult.value || {};
          const feedbackRecords = feedbackResult.status === 'fulfilled' ? feedbackResult.value : [];
          if (feedbackResult.status === 'rejected') {
            const errorInfo = describeError(feedbackResult.reason, { code: 'FEEDBACK_DATA', message: TEXT.status.error });
            console.error(errorInfo.log, feedbackResult.reason);
            if (!dashboardState.feedback.lastErrorMessage) {
              dashboardState.feedback.lastErrorMessage = errorInfo.userMessage;
            }
            dashboardState.feedback.usingFallback = false;
          }

          const combinedRecords = Array.isArray(dataset.records) ? dataset.records : [];
          const primaryRecords = Array.isArray(dataset.primaryRecords) && dataset.primaryRecords.length
            ? dataset.primaryRecords
            : combinedRecords;
          const dailyStats = Array.isArray(dataset.dailyStats) && dataset.dailyStats.length
            ? dataset.dailyStats
            : computeDailyStats(combinedRecords, settings?.calculations, DEFAULT_SETTINGS);
          const primaryDaily = Array.isArray(dataset.primaryDaily) && dataset.primaryDaily.length
            ? dataset.primaryDaily
            : computeDailyStats(primaryRecords, settings?.calculations, DEFAULT_SETTINGS);
          dashboardState.rawRecords = combinedRecords;
          dashboardState.dailyStats = dailyStats;
          dashboardState.primaryRecords = primaryRecords.slice();
          dashboardState.primaryDaily = primaryDaily.slice();
          dashboardState.dataMeta = dataset.meta || null;
          populateChartYearOptions(dailyStats);
          populateHourlyCompareYearOptions(dailyStats);
          const windowDays = Number.isFinite(Number(settings.calculations.windowDays))
            ? Number(settings.calculations.windowDays)
            : DEFAULT_SETTINGS.calculations.windowDays;
          if (!Number.isFinite(dashboardState.kpi.filters.window) || dashboardState.kpi.filters.window <= 0) {
            dashboardState.kpi.filters.window = windowDays;
            syncKpiFilterControls();
          }
          const lastWindowDailyStats = filterDailyStatsByWindow(dailyStats, windowDays);
          const recentWindowDays = Number.isFinite(Number(settings.calculations.recentDays))
            ? Number(settings.calculations.recentDays)
            : DEFAULT_SETTINGS.calculations.recentDays;
          const effectiveRecentDays = Math.max(1, Math.min(windowDays, recentWindowDays));
          const recentDailyStats = filterDailyStatsByWindow(lastWindowDailyStats, effectiveRecentDays);
          dashboardState.chartData.baseDaily = dailyStats.slice();
          dashboardState.chartData.baseRecords = combinedRecords.slice();
          dashboardState.chartFilters = sanitizeChartFilters(dashboardState.chartFilters, { getDefaultChartFilters, KPI_FILTER_LABELS });
          syncChartFilterControls();
          const scopedCharts = prepareChartDataForPeriod(dashboardState.chartPeriod);
          await applyKpiFiltersAndRender();
          await renderCharts(scopedCharts.daily, scopedCharts.funnel, scopedCharts.heatmap);
          renderRecentTable(recentDailyStats);
          const monthlyStats = computeMonthlyStats(dashboardState.dailyStats);
          dashboardState.monthly.all = monthlyStats;
          // Rodyti paskutinius 12 kalendorinių mėnesių, nepriklausomai nuo KPI lango filtro.
          const monthsLimit = 12;
          const limitedMonthlyStats = Number.isFinite(monthsLimit) && monthsLimit > 0
            ? monthlyStats.slice(-monthsLimit)
            : monthlyStats;
          renderMonthlyTable(limitedMonthlyStats);
          dashboardState.monthly.window = limitedMonthlyStats;
          const datasetYearlyStats = Array.isArray(dataset.yearlyStats) ? dataset.yearlyStats : null;
          const yearlyStats = datasetYearlyStats && datasetYearlyStats.length
            ? datasetYearlyStats
            : computeYearlyStats(monthlyStats);
          renderYearlyTable(yearlyStats);
          dashboardState.feedback.records = Array.isArray(feedbackRecords) ? feedbackRecords : [];
          updateFeedbackFilterOptions(dashboardState.feedback.records);
          const feedbackStats = applyFeedbackFiltersAndRender();
          const edSummaryForComments = dashboardState.ed.summary || createEmptyEdSummary(dashboardState.ed?.meta?.type);
          const feedbackComments = Array.isArray(feedbackStats?.summary?.comments)
            ? feedbackStats.summary.comments
            : [];
          const now = new Date();
          const cutoff = new Date(now);
          cutoff.setDate(cutoff.getDate() - 30);
          const recentFeedbackComments = feedbackComments.filter((entry) => {
            if (!(entry?.receivedAt instanceof Date) || Number.isNaN(entry.receivedAt.getTime())) {
              return false;
            }
            return entry.receivedAt >= cutoff;
          });
          edSummaryForComments.feedbackComments = recentFeedbackComments;
          const commentsMeta = recentFeedbackComments.length
            ? `Komentarai (30 d.): ${numberFormatter.format(recentFeedbackComments.length)}`
            : '';
          edSummaryForComments.feedbackCommentsMeta = commentsMeta;
          dashboardState.ed.summary = edSummaryForComments;
          setStatus('success');
          applyFeedbackStatusNote();
          await renderEdDashboard(dashboardState.ed);
        } catch (error) {
          const errorInfo = describeError(error, { code: 'DATA_PROCESS', message: 'Nepavyko apdoroti duomenų' });
          console.error(errorInfo.log, error);
          dashboardState.usingFallback = false;
          dashboardState.lastErrorMessage = errorInfo.userMessage;
          setStatus('error', errorInfo.userMessage);
          await renderEdDashboard(dashboardState.ed);
        } finally {
          dashboardState.loading = false;
          dashboardState.hasLoadedOnce = true;
          restartAutoRefreshTimer();
          if (dashboardState.queuedReload) {
            dashboardState.queuedReload = false;
            window.setTimeout(() => {
              loadDashboard();
            }, 0);
          }
          if (clientConfig.profilingEnabled && loadHandle) {
            if (fetchHandle && !fetchMeasured) {
              perfMonitor.finish(fetchHandle, {
                pagrindinis: fetchSummary.pagrindinis,
                istorinis: fetchSummary.istorinis,
                fallbackas: dashboardState.usingFallback,
                šaltiniai: 0,
              });
            }
            const status = dashboardState.lastErrorMessage ? 'klaida' : 'ok';
            perfMonitor.finish(loadHandle, {
              status,
              pagrindinis: fetchSummary.pagrindinis,
              istorinis: fetchSummary.istorinis,
            });
            perfMonitor.logTable();
          }
        }
      }

      function scheduleInitialLoad() {
        runAfterDomAndIdle(() => {
          if (!dashboardState.loading) {
            loadDashboard();
          }
        }, { timeout: 800 });
      }

      const chartRenderers = createChartRenderers({
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

      const kpiRenderer = createKpiRenderer({
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

      const edRenderer = createEdRenderer({
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
        updateEdTvPanel,
        renderEdDispositionsChart,
        createEdSectionIcon,
        renderEdCommentsCard,
        formatEdCardValue,
        buildEdCardVisuals,
        enrichSummaryWithOverviewFallback,
      });

      const uiEvents = createUIEvents({
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
        updateTvToggleControls,
        setTvMode,
        stopTvClock,
        updateChartPeriod,
        updateChartYear,
        handleHeatmapMetricChange,
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

      async function bootstrap() {
        settings = await loadSettingsFromConfig();
        dashboardState.kpi.filters = getDefaultKpiFilters();
        dashboardState.chartFilters = getDefaultChartFilters();
        dashboardState.feedback.filters = getDefaultFeedbackFilters();
        applySettingsToText();
        applyTextContent();
        applyFooterSource();
        uiEvents.initUI();
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




