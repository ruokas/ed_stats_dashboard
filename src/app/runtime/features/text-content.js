import { applyCommonText } from './text-common.js';
import { applyKpiText } from './text-kpi.js';
import { applyChartsText } from './text-charts.js';
import { applyFeedbackText } from './text-feedback.js';
import { applyEdText } from './text-ed.js';

export function createTextContentFeature(deps) {
  const { common, kpi, charts, feedback, ed } = deps;

  function applyTextContent() {
    applyCommonText(common);
    applyKpiText(kpi);
    applyChartsText(charts);
    applyFeedbackText(feedback);
    applyEdText(ed);
  }

  return { applyTextContent };
}
