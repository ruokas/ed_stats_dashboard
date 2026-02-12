import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTextSignature,
  describeCacheMeta,
  describeError,
  downloadCsv,
  formatUrlForDiagnostics,
} from '../../src/app/runtime/network.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('formatUrlForDiagnostics', () => {
  it('masks sensitive query params', () => {
    const input = 'https://example.com/data.csv?token=abc123&auth=secret&sheet=ed';
    const output = formatUrlForDiagnostics(input);
    expect(output).toBe('https://example.com/data.csv?token=***&auth=***&sheet=ed');
  });

  it('returns empty string for blank input', () => {
    expect(formatUrlForDiagnostics('')).toBe('');
    expect(formatUrlForDiagnostics('   ')).toBe('');
  });

  it('returns original value for malformed url and logs warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const input = 'not-a-valid-url';
    expect(formatUrlForDiagnostics(input)).toBe(input);
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('describeError', () => {
  it('builds a user-friendly 404 message', () => {
    const error = new Error('HTTP klaida: 404');
    error.diagnostic = {
      type: 'http',
      status: 404,
      statusText: 'Not Found',
      url: 'https://example.com/data.csv',
    };

    const info = describeError(error, { code: 'DATA_FETCH' });
    expect(info.code).toBe('DATA_FETCH');
    expect(info.userMessage).toContain('HTTP 404');
    expect(info.userMessage).toContain('URL: https://example.com/data.csv.');
  });

  it('uses explicit message override when provided', () => {
    const info = describeError(new Error('ignored'), {
      code: 'custom',
      message: 'Manual error message',
    });
    expect(info.code).toBe('CUSTOM');
    expect(info.message).toBe('Manual error message');
  });

  it('normalizes network failures to user-facing network message', () => {
    const info = describeError(new Error('Failed to fetch'), { code: 'network' });
    expect(info.code).toBe('NETWORK');
    expect(info.userMessage).toContain('Nepavyko pasiekti šaltinio');
  });

  it('handles explicit html-response message with hint', () => {
    const info = describeError(new Error('HTML atsakas vietoje CSV'), {
      code: 'html',
      fallbackMessage: 'fallback',
    });
    expect(info.code).toBe('HTML');
    expect(info.userMessage).toContain('HTML atsakas');
  });
});

describe('createTextSignature', () => {
  it('returns signature for text and empty for non-text', () => {
    expect(createTextSignature('abc')).toBe('3:abc');
    expect(createTextSignature(null)).toBe('');
  });
});

describe('downloadCsv', () => {
  it('throws AbortError when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      downloadCsv('https://example.com/data.csv', { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('returns not-modified payload for 304 responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 304, headers: { 'x-cache-status': 'hit' } }))
    );

    const result = await downloadCsv('https://example.com/data.csv', {
      cacheInfo: { etag: '"v1"', lastModified: 'Tue, 01 Jan 2026 00:00:00 GMT', signature: 'sig' },
    });

    expect(result.status).toBe(304);
    expect(result.etag).toBe('"v1"');
    expect(result.lastModified).toBe('Tue, 01 Jan 2026 00:00:00 GMT');
    expect(result.signature).toBe('sig');
    expect(result.cacheStatus).toBe('hit');
  });

  it('throws diagnostic error for non-ok responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('not found', { status: 404, statusText: 'Not Found' }))
    );

    await expect(downloadCsv('https://example.com/data.csv')).rejects.toMatchObject({
      message: 'HTTP klaida: 404',
      diagnostic: {
        type: 'http',
        status: 404,
      },
    });
  });

  it('throws html diagnostic when html payload is returned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<!doctype html><html></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
      )
    );

    await expect(downloadCsv('https://example.com/data.csv')).rejects.toMatchObject({
      diagnostic: { type: 'html' },
    });
  });

  it('returns csv payload metadata and streams progress', async () => {
    const onChunk = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('a,b\n1,2', {
          status: 200,
          headers: {
            'content-type': 'text/csv',
            etag: '"csv-v2"',
            'x-cache-status': 'revalidated',
          },
        })
      )
    );

    const result = await downloadCsv('https://example.com/data.csv', { onChunk });
    expect(result.status).toBe(200);
    expect(result.text).toBe('a,b\n1,2');
    expect(result.etag).toBe('"csv-v2"');
    expect(result.cacheStatus).toBe('revalidated');
    expect(result.signature).toBe('"csv-v2"');
    expect(onChunk).toHaveBeenCalled();
  });
});

describe('describeCacheMeta', () => {
  it('returns normalized cache source labels', () => {
    expect(describeCacheMeta(null)).toBe('tinklas');
    expect(describeCacheMeta({ cacheStatus: 'HIT' })).toBe('hit');
    expect(describeCacheMeta({ cacheStatus: 'revalidated' })).toBe('revalidated');
    expect(describeCacheMeta({ fromCache: true })).toBe('talpykla');
    expect(describeCacheMeta({ fromCache: false })).toBe('tinklas');
  });
});
