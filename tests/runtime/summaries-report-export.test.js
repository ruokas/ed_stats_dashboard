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

  test('handler prefixes copy payload with preface lines when provided', async () => {
    const button = document.createElement('button');
    const writeTextToClipboard = vi.fn().mockResolvedValue(true);
    const handler = createReportExportClickHandler({
      exportState: {
        diagnosis: {
          title: 'Diagnozės',
          headers: ['Diagnozė'],
          rows: [['A00']],
          prefaceLines: ['# Filtrai: Metai=2025'],
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
      setCopyButtonFeedback: vi.fn(),
      writeTextToClipboard,
      formatExportFilename: (title, ext) => `${title}.${ext}`,
      escapeCsvCell: (value) => String(value),
    });
    await handler({ currentTarget: button });
    expect(writeTextToClipboard).toHaveBeenCalledWith('# Filtrai: Metai=2025\n\nDiagnozė\nA00');
  });

  test('handler reports clipboard failure for csv export mode', async () => {
    const button = document.createElement('button');
    const setCopyButtonFeedback = vi.fn();
    const writeTextToClipboard = vi.fn().mockResolvedValue(false);

    const handler = createReportExportClickHandler({
      exportState: {
        diagnosis: {
          title: 'Diagnozės',
          headers: ['Diagnozė'],
          rows: [['A00']],
        },
      },
      getDatasetValue: (_element, key, fallback) => {
        if (key === 'reportKey') {
          return 'diagnosis';
        }
        if (key === 'reportExport') {
          return 'csv';
        }
        return fallback;
      },
      setCopyButtonFeedback,
      writeTextToClipboard,
      formatExportFilename: (title, ext) => `${title}.${ext}`,
      escapeCsvCell: (value) => String(value),
    });

    await handler({ currentTarget: button });
    expect(writeTextToClipboard).toHaveBeenCalledWith('Diagnozė\nA00');
    expect(setCopyButtonFeedback).toHaveBeenCalledWith(button, 'Nepavyko nukopijuoti', 'error');
  });

  test('handler downloads png for canvas export mode', async () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalToDataUrl = HTMLCanvasElement.prototype.toDataURL;
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      measureText: (value) => ({ width: String(value).length * 5 }),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillText: vi.fn(),
      set fillStyle(_value) {},
      set font(_value) {},
      set textAlign(_value) {},
      set textBaseline(_value) {},
    }));
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,abc');

    const reportCard = document.createElement('article');
    reportCard.className = 'report-card';
    reportCard.style.backgroundColor = 'rgb(250, 250, 250)';
    reportCard.innerHTML = '<div class="report-card__head"><h4>Diagnozių kortelė</h4></div>';
    const button = document.createElement('button');
    reportCard.appendChild(button);
    document.body.appendChild(reportCard);

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    reportCard.appendChild(canvas);

    const setCopyButtonFeedback = vi.fn();
    const handler = createReportExportClickHandler({
      exportState: {
        diagnosis: {
          title: 'Diagnozės',
          headers: ['Diagnozė'],
          rows: [['A00']],
          target: canvas,
        },
      },
      getDatasetValue: (_element, key, fallback) => {
        if (key === 'reportKey') {
          return 'diagnosis';
        }
        if (key === 'reportExport') {
          return 'png';
        }
        return fallback;
      },
      setCopyButtonFeedback,
      writeTextToClipboard: vi.fn(),
      formatExportFilename: (title, ext) => `${title}.${ext}`,
      escapeCsvCell: (value) => String(value),
    });

    await handler({ currentTarget: button });
    expect(anchorClickSpy).toHaveBeenCalled();
    expect(setCopyButtonFeedback).toHaveBeenCalledWith(button, 'Ataskaita parsisiųsta', 'success');

    anchorClickSpy.mockRestore();
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toDataURL = originalToDataUrl;
  });
});
