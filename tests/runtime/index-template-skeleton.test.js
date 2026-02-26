import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('index template first-paint skeletons', () => {
  it('renders KPI skeleton cards directly in #kpiGrid for first paint', () => {
    const filePath = path.resolve('templates/page-shell/content/index.main.html');
    const html = fs.readFileSync(filePath, 'utf8');

    expect(html).toContain(
      '<div id="kpiGrid" class="kpi-grid" role="list" aria-busy="true" data-skeleton="true">'
    );
    expect(html).toContain('kpi-card kpi-card--skeleton');
    expect(html).toContain('<template id="kpiSkeleton">');
  });
});
