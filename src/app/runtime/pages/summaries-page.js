import { runLegacyPage } from './legacy-runner.js';

export function runSummariesPage(core) {
  return runLegacyPage(core?.pageId || 'summaries');
}
