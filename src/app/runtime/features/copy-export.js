export function createCopyExportFeature(deps) {
  const {
    getDatasetValue,
    setDatasetValue,
    setCopyButtonFeedback,
    writeBlobToClipboard,
    writeTextToClipboard,
    describeError,
  } = deps;

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
    const owner =
      node instanceof HTMLElement
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
    if (ariaLabel?.trim()) {
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
    const font =
      `${style.fontStyle && style.fontStyle !== 'normal' ? `${style.fontStyle} ` : ''}${fontWeight} ${fontSize}px ${style.fontFamily || 'sans-serif'}`.trim();
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
    const exportCanvas = backgroundColor
      ? buildCanvasWithBackground(canvas, backgroundColor, titleInfo)
      : canvas;
    if (!exportCanvas) {
      return { ok: false, reason: 'missing' };
    }
    const blob = await canvasToPngBlob(exportCanvas);
    if (blob && (await writeBlobToClipboard(blob, 'image/png'))) {
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
    const _paddingX = 18;
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
    const bgColor = card
      ? window.getComputedStyle(card).backgroundColor
      : window.getComputedStyle(container).backgroundColor;
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
    headerCells.forEach((cell) => {
      drawHeaderCell(cell);
    });

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
      let y = headerOffsetY + tableHeight + legendGap + legendLineHeight / 2;
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
      const centerX = padding + tableWidth / 2;
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
    return rows
      .map((row) => {
        const cells = Array.from(row.children);
        return cells.map((cell) => escapeCsvCell(cell.textContent.trim())).join(',');
      })
      .join('\n');
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
        const textY =
          cursorY +
          cellPaddingTop +
          Math.max(0, (rowHeight - cellPaddingTop - paddingBottom - cellFontSize) * 0.2);
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
      const exportCanvas = backgroundColor
        ? buildCanvasWithBackground(source.node, backgroundColor, titleInfo)
        : source.node;
      if (!exportCanvas) {
        return { ok: false, reason: 'missing' };
      }
      const ok = await downloadCanvasPng(exportCanvas, filename);
      return { ok, format: 'png' };
    }
    if (source.type === 'svg') {
      const exportSvg = backgroundColor
        ? buildSvgWithBackgroundAndTitle(source.node, backgroundColor, titleInfo)
        : source.node;
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
      const errorInfo = describeError(error, {
        code: 'CHART_DOWNLOAD',
        message: 'Nepavyko parsisiųsti grafiko',
      });
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
      if (format === 'copy') {
        const backgroundColor = resolveCopyBackgroundColor(table);
        const exportCanvas = buildTableExportCanvas(table, titleInfo, backgroundColor);
        const result = exportCanvas ? await copyCanvasToClipboard(exportCanvas) : { ok: false };
        ok = Boolean(result?.ok);
      } else if (format === 'png') {
        ok = await downloadTableAsPng(table, titleInfo);
      } else {
        ok = await downloadTableAsCsv(table, titleInfo);
      }
      setCopyButtonFeedback(
        button,
        ok ? (format === 'copy' ? 'Lentelė nukopijuota' : 'Lentelė parsisiųsta') : 'Klaida parsisiunčiant',
        ok ? 'success' : 'error'
      );
    } catch (error) {
      const errorInfo = describeError(error, {
        code: 'TABLE_DOWNLOAD',
        message: 'Nepavyko parsisiųsti lentelės',
      });
      console.error(errorInfo.log, error);
      setCopyButtonFeedback(button, 'Klaida parsisiunčiant', 'error');
    } finally {
      setDatasetValue(button, 'copyBusy', 'false');
      button.removeAttribute('aria-busy');
    }
  }

  return {
    handleChartCopyClick,
    handleChartDownloadClick,
    handleTableDownloadClick,
  };
}
