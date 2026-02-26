import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('gydytojai template first-paint loading layout', () => {
  it('keeps filters panel visible with loading state and marks chart cards as loading', () => {
    const filePath = path.resolve('templates/page-shell/content/gydytojai.main.html');
    const html = fs.readFileSync(filePath, 'utf8');

    expect(html).toContain(
      '<section id="gydytojaiFiltersPanel" class="filter-panel gydytojai-filter-panel" aria-label="Gydytojų filtrų panelė" data-loading="true">'
    );
    expect(html).toContain('<div id="gydytojaiTablesSectionPanel" data-gydytojai-section-panel="results">');
    expect(html).toContain('<tbody id="gydytojaiLeaderboardBody">');
    expect(html).toContain('<tbody id="gydytojaiSpecialtyBody">');
    expect(html).toContain('skeleton skeleton--detail skeleton--table-cell');
    const chartLoadingMatches = html.match(/<article class="report-card" data-loading="true">/g) || [];
    expect(chartLoadingMatches.length).toBeGreaterThanOrEqual(5);
  });
});
