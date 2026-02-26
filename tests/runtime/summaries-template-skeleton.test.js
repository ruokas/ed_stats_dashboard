import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('summaries template report-card loading placeholders', () => {
  it('marks report cards as loading on first paint and reserves larger heatmap canvas height', () => {
    const filePath = path.resolve('templates/page-shell/content/summaries.main.html');
    const html = fs.readFileSync(filePath, 'utf8');

    const reportCardLoadingMatches =
      html.match(/<article class="report-card[^"]*" data-loading="true">/g) || [];
    expect(reportCardLoadingMatches.length).toBeGreaterThanOrEqual(10);
    expect(html).toContain('<canvas id="ageDiagnosisHeatmapChart" height="360"></canvas>');
    expect(html).toContain('<canvas id="referralMonthlyHeatmapChart" height="360"></canvas>');
  });
});
