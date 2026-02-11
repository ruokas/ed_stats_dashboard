import { createClientStore, PerfMonitor } from '../../../app.js';

export function createRuntimeClientContext(clientConfigKey) {
  const clientStore = createClientStore(clientConfigKey);
  const perfMonitor = new PerfMonitor();
  let clientConfig = { profilingEnabled: true, ...clientStore.load() };

  function getClientConfig() {
    return clientConfig;
  }

  function updateClientConfig(patch = {}) {
    if (!patch || typeof patch !== 'object') {
      return clientConfig;
    }
    clientConfig = { ...clientConfig, ...patch };
    clientStore.save(clientConfig);
    return clientConfig;
  }

  return {
    perfMonitor,
    getClientConfig,
    updateClientConfig,
  };
}
