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
      writeTextToClipboard: vi.fn(),
      formatExportFilename: (title, ext) => `${title}.${ext}`,
      escapeCsvCell: (value) => String(value),
    });

    await handler({ currentTarget: button });

    expect(setCopyButtonFeedback).toHaveBeenCalledWith(button, 'Nėra duomenų eksportui', 'error');
  });

  test('handler copies CSV content to clipboard for copy format', async () => {
    const button = document.createElement('button');
    const setCopyButtonFeedback = vi.fn();
    const writeTextToClipboard = vi.fn().mockResolvedValue(true);

    const handler = createReportExportClickHandler({
      exportState: {
        diagnosis: {
          title: 'Diagnozės',
          headers: ['Diagnozė', 'Procentas (%)'],
          rows: [['A00', '12.5']],
        },
      },
      getDatasetValue: (_element, key, fallback) => {
        if (key === 'reportKey') {
          return 'diagnosis';
        }
        if (key === 'reportExport') {
          return 'copy';
        }
        return fallback;
      },
      setCopyButtonFeedback,
      writeTextToClipboard,
      formatExportFilename: (title, ext) => `${title}.${ext}`,
      escapeCsvCell: (value) => String(value),
    });

    await handler({ currentTarget: button });

    expect(writeTextToClipboard).toHaveBeenCalledWith('Diagnozė,Procentas (%)\nA00,12.5');
    expect(setCopyButtonFeedback).toHaveBeenCalledWith(button, 'Ataskaita nukopijuota', 'success');
  });
});
