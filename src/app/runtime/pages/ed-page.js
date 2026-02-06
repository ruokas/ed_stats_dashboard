import { runLegacyPage } from './legacy-runner.js';

export function runEdPage(core) {
  return runLegacyPage(core?.pageId || 'ed');
}
