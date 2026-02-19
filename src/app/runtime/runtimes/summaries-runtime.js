import { runSummariesRuntime as runSummariesRuntimeCore } from './summaries-runtime-core.js';

export async function runSummariesRuntime(core) {
  // Keep this wrapper to preserve the stable module boundary for page runtimes.
  return runSummariesRuntimeCore(core);
}
