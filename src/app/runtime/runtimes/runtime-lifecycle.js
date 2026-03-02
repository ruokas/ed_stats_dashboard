import { createRuntimeClientContext } from '../runtime-client.js';
import { createStatusSetter } from '../utils/common.js';

export function createRuntimeLifecycle({ clientConfigKey, statusText, statusOptions } = {}) {
  const runtimeClient = createRuntimeClientContext(clientConfigKey);
  let autoRefreshTimerId = null;
  const setStatus = createStatusSetter(statusText, statusOptions);

  return {
    runtimeClient,
    setStatus,
    getAutoRefreshTimerId() {
      return autoRefreshTimerId;
    },
    setAutoRefreshTimerId(id) {
      autoRefreshTimerId = id;
    },
  };
}
