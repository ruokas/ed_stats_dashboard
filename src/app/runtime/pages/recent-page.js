import { runLegacyPage } from './legacy-runner.js';

export function runRecentPage(core) {
  return runLegacyPage(core?.pageId || 'recent');
}
