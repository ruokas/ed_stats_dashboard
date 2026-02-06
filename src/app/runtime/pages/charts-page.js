import { runLegacyPage } from './legacy-runner.js';

export function runChartsPage(core) {
  return runLegacyPage(core?.pageId || 'charts');
}
