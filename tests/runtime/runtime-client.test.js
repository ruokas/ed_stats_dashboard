import { beforeEach, describe, expect, it } from 'vitest';
import { CLIENT_CONFIG_KEY } from '../../src/app/constants.js';
import { createRuntimeClientContext } from '../../src/app/runtime/runtime-client.js';

describe('createRuntimeClientContext', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults profiling to disabled when there is no persisted config', () => {
    const context = createRuntimeClientContext(CLIENT_CONFIG_KEY);
    expect(context.getClientConfig().profilingEnabled).toBe(false);
  });

  it('honors persisted profiling flag from storage', () => {
    window.localStorage.setItem(CLIENT_CONFIG_KEY, JSON.stringify({ profilingEnabled: true }));
    const context = createRuntimeClientContext(CLIENT_CONFIG_KEY);
    expect(context.getClientConfig().profilingEnabled).toBe(true);
  });
});
