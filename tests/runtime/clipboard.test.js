import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeTextToClipboard } from '../../src/app/runtime/clipboard.js';

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function setClipboard(value) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  if (clipboardDescriptor) {
    Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, 'clipboard');
  }
});

describe('writeTextToClipboard', () => {
  it('returns true when navigator.clipboard.writeText succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    await expect(writeTextToClipboard('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('returns false when navigator.clipboard is unavailable', async () => {
    setClipboard(undefined);
    await expect(writeTextToClipboard('hello')).resolves.toBe(false);
  });

  it('returns false when navigator.clipboard.writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    setClipboard({ writeText });

    await expect(writeTextToClipboard('hello')).resolves.toBe(false);
    expect(writeText).toHaveBeenCalledWith('hello');
  });
});
