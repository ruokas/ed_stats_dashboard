import { describe, expect, it } from 'vitest';

import { renderRecentTable } from '../../src/app/runtime/runtimes/summaries/recent-table.js';

describe('summaries recent table', () => {
  it('renders empty state row when there are no rows', () => {
    document.body.innerHTML = '<table><tbody id="recentTable"></tbody></table>';
    const selectors = { recentTable: document.getElementById('recentTable') };

    renderRecentTable(selectors, [], 'Tuscia');

    const cells = selectors.recentTable.querySelectorAll('td');
    expect(cells).toHaveLength(1);
    expect(cells[0].textContent).toBe('Tuscia');
  });

  it('renders summary and day rows, marking weekends', () => {
    document.body.innerHTML = '<table><tbody id="recentTable"></tbody></table>';
    const selectors = { recentTable: document.getElementById('recentTable') };
    const rows = [
      {
        date: '2026-03-02',
        count: 12,
        durations: 12,
        totalTime: 36,
        night: 3,
        ems: 2,
        hospitalized: 4,
        discharged: 8,
      },
      {
        date: '2026-03-01',
        count: 8,
        durations: 8,
        totalTime: 24,
        night: 2,
        ems: 1,
        hospitalized: 3,
        discharged: 5,
      },
    ];

    renderRecentTable(selectors, rows, 'Tuscia');

    const renderedRows = selectors.recentTable.querySelectorAll('tr');
    expect(renderedRows).toHaveLength(3);
    expect(renderedRows[0].textContent).toContain('7 d. vidurkis');
    const weekendRows = selectors.recentTable.querySelectorAll('tr.table-row--weekend');
    expect(weekendRows.length).toBeGreaterThan(0);
  });

  it('highlights abnormal cells when anomaly mode is enabled', () => {
    document.body.innerHTML = '<table><tbody id="recentTable"></tbody></table>';
    const selectors = { recentTable: document.getElementById('recentTable') };
    const rows = [
      {
        date: '2026-03-01',
        count: 10,
        durations: 10,
        totalTime: 20,
        night: 2,
        ems: 2,
        hospitalized: 2,
        discharged: 8,
      },
      {
        date: '2026-03-02',
        count: 10,
        durations: 10,
        totalTime: 20,
        night: 2,
        ems: 2,
        hospitalized: 2,
        discharged: 8,
      },
      {
        date: '2026-03-03',
        count: 10,
        durations: 10,
        totalTime: 20,
        night: 2,
        ems: 2,
        hospitalized: 2,
        discharged: 8,
      },
      {
        date: '2026-03-04',
        count: 10,
        durations: 10,
        totalTime: 20,
        night: 2,
        ems: 2,
        hospitalized: 2,
        discharged: 8,
      },
      {
        date: '2026-03-05',
        count: 10,
        durations: 10,
        totalTime: 20,
        night: 2,
        ems: 2,
        hospitalized: 2,
        discharged: 8,
      },
      {
        date: '2026-03-06',
        count: 10,
        durations: 10,
        totalTime: 20,
        night: 2,
        ems: 2,
        hospitalized: 2,
        discharged: 8,
      },
      {
        date: '2026-03-07',
        count: 20,
        durations: 20,
        totalTime: 80,
        night: 8,
        ems: 10,
        hospitalized: 10,
        discharged: 10,
      },
    ];

    renderRecentTable(selectors, rows, 'Tuscia', { highlightAbnormal: true });

    expect(selectors.recentTable.querySelectorAll('.recent-table__cell--anomaly').length).toBeGreaterThan(0);
    expect(selectors.recentTable.querySelectorAll('.recent-table__anomaly-badge').length).toBeGreaterThan(0);
    expect(selectors.recentTable.querySelectorAll('.recent-table__row--anomalous').length).toBeGreaterThan(0);
  });
});
