import { describe, expect, it, vi } from 'vitest';
import { createTableDownloadHandler, escapeCsvCell } from '../../src/app/runtime/table-export.js';
import { getDatasetValue } from '../../src/utils/dom.js';

describe('escapeCsvCell', () => {
  it('escapes commas and quotes', () => {
    expect(escapeCsvCell('A,B')).toBe('"A,B"');
    expect(escapeCsvCell('He said "ok"')).toBe('"He said ""ok"""');
  });
});

describe('createTableDownloadHandler', () => {
  it('exports table and reports success', async () => {
    document.body.innerHTML = `
      <table id="tbl">
        <tr><th>Col</th></tr>
        <tr><td>Value</td></tr>
      </table>
      <button id="btn" data-table-target="#tbl" data-table-title="Test"></button>
    `;

    const button = document.getElementById('btn');
    const feedbackSpy = vi.fn();
    const hadCreateObjectUrl = typeof URL.createObjectURL === 'function';
    const hadRevokeObjectUrl = typeof URL.revokeObjectURL === 'function';
    if (!hadCreateObjectUrl) {
      URL.createObjectURL = () => 'blob:mock';
    }
    if (!hadRevokeObjectUrl) {
      URL.revokeObjectURL = () => {};
    }
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const handler = createTableDownloadHandler({
      getDatasetValue,
      setCopyButtonFeedback: feedbackSpy,
      defaultTitle: 'Lentelė',
    });

    await handler({ currentTarget: button });

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(feedbackSpy).toHaveBeenCalledWith(button, 'Lentelė parsisiųsta', 'success');

    clickSpy.mockRestore();
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    if (!hadCreateObjectUrl) {
      delete URL.createObjectURL;
    }
    if (!hadRevokeObjectUrl) {
      delete URL.revokeObjectURL;
    }
  });
});
