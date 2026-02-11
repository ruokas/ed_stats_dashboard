import { describe, expect, it } from 'vitest';
import { setupCopyExportControls } from '../../src/app/runtime/export-controls.js';
import { getDatasetValue, setDatasetValue } from '../../src/utils/dom.js';

describe('setupCopyExportControls', () => {
  it('initializes copy/download button labels without throwing', () => {
    document.body.innerHTML = `
      <button id="copyBtn" aria-label="Copy chart"></button>
      <button id="downloadBtn" aria-label="Download chart"></button>
      <button id="tableBtn" aria-label="Download table"></button>
    `;

    const selectors = {
      chartCopyButtons: [document.getElementById('copyBtn')],
      chartDownloadButtons: [document.getElementById('downloadBtn')],
      tableDownloadButtons: [document.getElementById('tableBtn')],
    };

    setupCopyExportControls({
      selectors,
      getDatasetValue,
      setDatasetValue,
      describeError: (error) => ({ log: String(error?.message || error || 'error') }),
    });

    expect(selectors.chartCopyButtons[0].dataset.copyLabelBase).toBe('Copy chart');
    expect(selectors.chartDownloadButtons[0].dataset.copyLabelBase).toBe('Download chart');
    expect(selectors.tableDownloadButtons[0].dataset.copyLabelBase).toBe('Download table');
  });
});
