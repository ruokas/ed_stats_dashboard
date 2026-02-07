import { runLegacyPage } from './legacy-runner.js';

export function runFeedbackPage(core) {
  return runLegacyPage(core?.pageId || 'feedback');
}
