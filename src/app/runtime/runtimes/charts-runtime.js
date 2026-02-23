import { runChartsRuntime as runChartsRuntimeCore } from './charts-runtime-core.js';

export async function runChartsRuntime(core) {
  // Keep this wrapper to preserve the stable module boundary for page runtimes.
  return runChartsRuntimeCore(core);
}
