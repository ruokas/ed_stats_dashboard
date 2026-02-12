import { describe, expect, it } from 'vitest';
import {
  handleYearlyToggle,
  renderYearlyTable,
} from '../../src/app/runtime/features/summaries-yearly-table.js';

describe('summaries yearly table', () => {
  it('renders empty state row when there is no yearly data', () => {
    document.body.innerHTML = '<table><tbody id="yearlyTable"></tbody></table>';
    const selectors = { yearlyTable: document.getElementById('yearlyTable') };
    const dashboardState = {};

    renderYearlyTable(selectors, dashboardState, [], { yearlyEmptyText: 'Tuscia' });

    const cells = selectors.yearlyTable.querySelectorAll('td');
    expect(cells).toHaveLength(1);
    expect(cells[0].textContent).toBe('Tuscia');
  });

  it('toggles child month rows and persists expanded years', () => {
    document.body.innerHTML = '<table><tbody id="yearlyTable"></tbody></table>';
    const selectors = { yearlyTable: document.getElementById('yearlyTable') };
    const dashboardState = {
      monthly: {
        all: [
          {
            month: '2025-01',
            count: 30,
            dayCount: 31,
            durations: 30,
            totalTime: 120,
            night: 3,
            ems: 4,
            hospitalized: 2,
            discharged: 26,
          },
        ],
      },
    };
    const yearlyStats = [
      {
        year: 2025,
        count: 300,
        dayCount: 365,
        durations: 300,
        totalTime: 1500,
        monthCount: 12,
        night: 30,
        ems: 25,
        hospitalized: 40,
        discharged: 250,
      },
    ];

    renderYearlyTable(selectors, dashboardState, yearlyStats, { yearlyEmptyText: 'Tuscia' });

    const button = selectors.yearlyTable.querySelector('button[data-year-toggle="2025"]');
    const childRow = selectors.yearlyTable.querySelector('tr[data-parent-year="2025"]');
    expect(button).not.toBeNull();
    expect(childRow).not.toBeNull();
    expect(childRow.hidden).toBe(false);

    handleYearlyToggle(selectors, dashboardState, { target: button });

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(childRow.hidden).toBe(true);
    expect(dashboardState.yearlyExpandedYears).toEqual([]);
  });

  it('shows month change vs same month of previous year', () => {
    document.body.innerHTML = '<table><tbody id="yearlyTable"></tbody></table>';
    const selectors = { yearlyTable: document.getElementById('yearlyTable') };
    const dashboardState = {
      monthly: {
        all: [
          {
            month: '2024-01',
            count: 20,
            dayCount: 31,
            durations: 20,
            totalTime: 80,
            night: 2,
            ems: 3,
            hospitalized: 4,
            discharged: 16,
          },
          {
            month: '2025-01',
            count: 30,
            dayCount: 31,
            durations: 30,
            totalTime: 120,
            night: 3,
            ems: 4,
            hospitalized: 5,
            discharged: 25,
          },
        ],
      },
    };
    const yearlyStats = [
      {
        year: 2024,
        count: 240,
        dayCount: 366,
        durations: 240,
        totalTime: 960,
        monthCount: 12,
        night: 24,
        ems: 36,
        hospitalized: 48,
        discharged: 192,
      },
      {
        year: 2025,
        count: 300,
        dayCount: 365,
        durations: 300,
        totalTime: 1200,
        monthCount: 12,
        night: 30,
        ems: 45,
        hospitalized: 60,
        discharged: 240,
      },
    ];

    renderYearlyTable(selectors, dashboardState, yearlyStats, { yearlyEmptyText: 'Tuscia' });

    const january2025Row = selectors.yearlyTable.querySelector('tr[data-parent-year="2025"]');
    expect(january2025Row).not.toBeNull();
    const cells = january2025Row.querySelectorAll('td');
    expect(cells).toHaveLength(9);
    expect(cells[8].textContent).toContain('+10');
  });
});
