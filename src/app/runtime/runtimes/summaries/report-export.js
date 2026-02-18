export function createRowsCsv(headers, rows, escapeCsvCell) {
  const lines = [headers.map((cell) => escapeCsvCell(cell)).join(',')];
  (rows || []).forEach((row) => {
    lines.push(row.map((cell) => escapeCsvCell(cell)).join(','));
  });
  return lines.join('\n');
}

function wrapTextLines(ctx, text, maxWidth) {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return [];
  }
  const words = normalized.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [];
  }
  const lines = [];
  let current = words[0];
  for (let index = 1; index < words.length; index += 1) {
    const candidate = `${current} ${words[index]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[index];
    }
  }
  lines.push(current);
  return lines;
}

function resolveReportTitle(button, model) {
  const customTitle = String(model?.exportTitle || '').trim();
  if (customTitle) {
    return customTitle;
  }
  const card = button?.closest?.('.report-card');
  const heading = card?.querySelector?.('.report-card__head h4, .report-card__head h3');
  const headingText = String(heading?.textContent || '').trim();
  if (headingText) {
    return headingText;
  }
  const modelTitle = String(model?.title || '').trim();
  return modelTitle || 'Ataskaita';
}

function resolveReportExportBackgroundColor(button) {
  const card = button?.closest?.('.report-card');
  const cardBg = card instanceof HTMLElement ? window.getComputedStyle(card).backgroundColor : '';
  if (cardBg && cardBg !== 'transparent' && cardBg !== 'rgba(0, 0, 0, 0)') {
    return cardBg;
  }
  return window.getComputedStyle(document.body).backgroundColor || '#ffffff';
}

function buildCanvasWithTitle(sourceCanvas, titleText, backgroundColor = '#ffffff') {
  if (!(sourceCanvas instanceof HTMLCanvasElement)) {
    return sourceCanvas;
  }
  const sourceWidth = Number(sourceCanvas.width || 0);
  const sourceHeight = Number(sourceCanvas.height || 0);
  if (!sourceWidth || !sourceHeight) {
    return sourceCanvas;
  }
  const canvas = document.createElement('canvas');
  canvas.width = sourceWidth;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return sourceCanvas;
  }

  const paddingX = 16;
  const paddingY = 14;
  const gap = 10;
  ctx.font = '700 18px "Sora", sans-serif';
  const lines = wrapTextLines(ctx, titleText, Math.max(0, sourceWidth - paddingX * 2));
  const lineHeight = 24;
  const titleHeight = lines.length ? lines.length * lineHeight : 0;
  const contentOffsetY = lines.length ? paddingY + titleHeight + gap : 0;
  canvas.height = sourceHeight + contentOffsetY + (lines.length ? paddingY : 0);

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (lines.length) {
    ctx.fillStyle = window.getComputedStyle(document.body).color || '#0f172a';
    ctx.font = '700 18px "Sora", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let y = paddingY;
    lines.forEach((line) => {
      ctx.fillText(line, canvas.width / 2, y);
      y += lineHeight;
    });
  }

  ctx.drawImage(sourceCanvas, 0, contentOffsetY);
  return canvas;
}

export function createReportExportClickHandler({
  exportState,
  getDatasetValue,
  setCopyButtonFeedback,
  writeTextToClipboard,
  formatExportFilename,
  escapeCsvCell,
}) {
  return async function handleReportExportClick(event) {
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
    if (format === 'copy' || format === 'csv') {
      const csv = createRowsCsv(model.headers || [], model.rows || [], escapeCsvCell);
      const prefaceLines = Array.isArray(model.prefaceLines)
        ? model.prefaceLines.map((line) => String(line || '').trim()).filter(Boolean)
        : [];
      const payload = prefaceLines.length ? `${prefaceLines.join('\n')}\n\n${csv}` : csv;
      const ok = await writeTextToClipboard(payload);
      setCopyButtonFeedback(
        button,
        ok ? 'Ataskaita nukopijuota' : 'Nepavyko nukopijuoti',
        ok ? 'success' : 'error'
      );
      return;
    }
    if (model.target instanceof HTMLCanvasElement) {
      const exportTitle = resolveReportTitle(button, model);
      const exportBackground = resolveReportExportBackgroundColor(button);
      const exportCanvas = buildCanvasWithTitle(model.target, exportTitle, exportBackground);
      const link = document.createElement('a');
      link.href = exportCanvas.toDataURL('image/png');
      link.download = formatExportFilename(model.title, 'png');
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setCopyButtonFeedback(button, 'Ataskaita parsisiųsta', 'success');
      return;
    }
  };
}
