export function escapeCsvCell(value) {
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

export function createTableDownloadHandler({
  getDatasetValue,
  setCopyButtonFeedback,
  defaultTitle = 'Lentelė',
  formatFilename,
}) {
  const resolveFilename = (title, ext) =>
    typeof formatFilename === 'function' ? formatFilename(title, ext) : `${title}.${ext}`;

  return async function handleTableDownloadClick(event) {
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
      .map((row) =>
        Array.from(row.children)
          .map((cell) => escapeCsvCell(cell.textContent.trim()))
          .join(',')
      )
      .join('\n');
    const title = getDatasetValue(button, 'tableTitle', defaultTitle);
    const format = getDatasetValue(button, 'tableDownload', 'csv');

    if (format === 'csv') {
      const ok = triggerDownloadFromBlob(
        new Blob([rows], { type: 'text/csv;charset=utf-8;' }),
        resolveFilename(title, 'csv')
      );
      setCopyButtonFeedback(
        button,
        ok ? 'Lentelė parsisiųsta' : 'Klaida parsisiunčiant',
        ok ? 'success' : 'error'
      );
      return;
    }

    const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="800"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial;background:#fff;padding:16px;">${table.outerHTML}</div></foreignObject></svg>`;
    const ok = triggerDownloadFromBlob(
      new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' }),
      resolveFilename(title, 'svg')
    );
    setCopyButtonFeedback(
      button,
      ok ? 'Lentelė parsisiųsta' : 'Klaida parsisiunčiant',
      ok ? 'success' : 'error'
    );
  };
}
