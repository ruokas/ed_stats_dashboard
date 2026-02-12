import { describe, expect, test, vi } from 'vitest';
import {
  loadPluginScript,
  resolveScriptLoadWithTimeout,
} from '../../src/app/runtime/runtimes/summaries/plugin-loader.js';

describe('summaries plugin loader', () => {
  test('returns true immediately when existing script is marked as loaded', async () => {
    const script = document.createElement('script');
    script.src = 'https://cdn.example.com/plugin.js';
    script.dataset.loaded = 'true';
    document.head.appendChild(script);

    await expect(loadPluginScript(script.src, 100)).resolves.toBe(true);
  });

  test('returns false immediately when existing script is marked as failed', async () => {
    const script = document.createElement('script');
    script.src = 'https://cdn.example.com/plugin-failed.js';
    script.dataset.failed = 'true';
    document.head.appendChild(script);

    await expect(loadPluginScript(script.src, 100)).resolves.toBe(false);
  });

  test('resolves false by timeout when script never fires load/error', async () => {
    vi.useFakeTimers();
    const script = document.createElement('script');
    script.src = 'https://cdn.example.com/stuck-plugin.js';
    document.head.appendChild(script);

    const promise = resolveScriptLoadWithTimeout(script, 8000, (callback, ms) => setTimeout(callback, ms));
    vi.advanceTimersByTime(8000);
    await expect(promise).resolves.toBe(false);
    vi.useRealTimers();
  });

  test('marks new script as loaded after load event', async () => {
    const src = 'https://cdn.example.com/new-plugin.js';
    const promise = loadPluginScript(src, 1000);
    const script = document.querySelector(`script[src="${src}"]`);
    expect(script).toBeInstanceOf(HTMLScriptElement);
    script.dispatchEvent(new Event('load'));
    await expect(promise).resolves.toBe(true);
    expect(script.dataset.loaded).toBe('true');
    expect(script.dataset.failed).toBe('false');
  });
});
