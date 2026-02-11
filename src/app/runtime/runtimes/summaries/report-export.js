export function createRowsCsv(headers, rows, escapeCsvCell) {
  const lines = [headers.map((cell) => escapeCsvCell(cell)).join(',')];
  (rows || []).forEach((row) => {
    lines.push(row.map((cell) => escapeCsvCell(cell)).join(','));
  });
  return lines.join('\n');
}

export function createReportExportClickHandler({
  exportState,
  getDatasetValue,
  setCopyButtonFeedback,
  formatExportFilename,
  escapeCsvCell,
  triggerDownloadFromBlob,
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
    if (format === 'csv') {
      const csv = createRowsCsv(model.headers || [], model.rows || [], escapeCsvCell);
      const ok = triggerDownloadFromBlob(
        new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
        formatExportFilename(model.title, 'csv')
      );
      setCopyButtonFeedback(
        button,
        ok ? 'Ataskaita parsisiųsta' : 'Klaida parsisiunčiant',
        ok ? 'success' : 'error'
      );
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
  };
}
