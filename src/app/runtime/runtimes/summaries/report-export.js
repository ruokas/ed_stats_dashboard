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
      const ok = await writeTextToClipboard(csv);
      setCopyButtonFeedback(
        button,
        ok ? 'Ataskaita nukopijuota' : 'Nepavyko nukopijuoti',
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
