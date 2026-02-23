import { runGydytojaiRuntime as runGydytojaiRuntimeCore } from './gydytojai-runtime-core.js';

export async function runGydytojaiRuntime(core) {
  // Keep this wrapper to preserve the stable module boundary for page runtimes.
  return runGydytojaiRuntimeCore(core);
}
