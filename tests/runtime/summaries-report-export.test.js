import { describe, expect, test, vi } from 'vitest';
import {
  createReportExportClickHandler,
  createRowsCsv,
} from '../../src/app/runtime/runtimes/summaries/report-export.js';

describe('summaries report export helpers', () => {
  test('createRowsCsv escapes values', () => {
    const csv = createRowsCsv(['A', 'B'], [['x,1', 'y']], (value) => `"${String(value)}"`);
    expect(csv).toBe('"A","B"\n"x,1","y"');
  });

  test('handler returns error feedback when model is missing', async () => {
    const setCopyButtonFeedback = vi.fn();
    const button = document.createElement('button');

    const handler = createReportExportClickHandler({
      exportState: {},
      getDatasetValue: () => 'missing',
      setCopyButtonFeedback,
      formatExportFilename: (title, ext) => `${title}.${ext}`,
      escapeCsvCell: (value) => String(value),
      triggerDownloadFromBlob: () => true,
    });

    await handler({ currentTarget: button });

    expect(setCopyButtonFeedback).toHaveBeenCalledWith(button, 'Nėra duomenų eksportui', 'error');
  });
});
