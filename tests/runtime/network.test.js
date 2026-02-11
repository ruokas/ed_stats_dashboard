import { describe, expect, it } from 'vitest';
import { describeError, formatUrlForDiagnostics } from '../../src/app/runtime/network.js';

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
});
