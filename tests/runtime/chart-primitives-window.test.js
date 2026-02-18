import { describe, expect, it } from 'vitest';
import {
  buildDailyWindowKeys,
  filterDailyStatsByWindow,
  filterRecordsByWindow,
  syncChartPeriodButtons,
  syncChartYearControl,
} from '../../src/app/runtime/chart-primitives.js';

describe('chart primitives window helpers', () => {
  it('filters daily stats by latest valid UTC window', () => {
    const dailyStats = [
      { date: 'bad-date', count: 99 },
      { date: '2026-01-01', count: 1 },
      { date: '2026-01-03', count: 3 },
      { date: '2026-01-02', count: 2 },
    ];

    const result = filterDailyStatsByWindow(dailyStats, 2);

    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.date).sort()).toEqual(['2026-01-02', '2026-01-03']);
  });

  it('filters records by latest window using arrival/discharge fallback', () => {
    const first = { arrival: new Date('2026-01-01T08:00:00') };
    const second = { discharge: new Date('2026-01-02T10:00:00') };
    const third = { arrival: new Date('2026-01-03T12:00:00') };
    const invalid = { arrival: null, discharge: null };

    const result = filterRecordsByWindow([first, invalid, second, third], 2);

    expect(result).toEqual([second, third]);
  });

  it('builds complete daily keys window from latest valid date', () => {
    const keys = buildDailyWindowKeys(
      [{ date: 'invalid' }, { date: '2026-01-02' }, { date: '2026-01-05' }],
      3
    );
    expect(keys).toEqual(['2026-01-03', '2026-01-04', '2026-01-05']);
  });

  it('marks active period button including all-period state', () => {
    document.body.innerHTML = `
      <button data-chart-period="30" aria-pressed="false"></button>
      <button data-chart-period="90" aria-pressed="false"></button>
      <button data-chart-period="all" aria-pressed="false"></button>
    `;
    const buttons = Array.from(document.querySelectorAll('button'));
    syncChartPeriodButtons({ selectors: { chartPeriodButtons: buttons }, period: 0 });
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');

    syncChartPeriodButtons({ selectors: { chartPeriodButtons: buttons }, period: 90 });
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[2].getAttribute('aria-pressed')).toBe('false');
  });

  it('updates more-toggle label and time scope summary', () => {
    document.body.innerHTML = `
      <div id="chartPeriodGroup">
        <button data-chart-period="30" aria-pressed="false">30 d.</button>
        <details class="chart-period__more">
          <summary class="chart-period__more-toggle">Daugiau</summary>
          <div class="chart-period__more-menu">
            <button data-chart-period="365" aria-pressed="false">365 d.</button>
            <button data-chart-period="all" aria-pressed="false">Visi</button>
          </div>
        </details>
      </div>
      <select id="chartYear">
        <option value="all">Visi</option>
        <option value="2025">2025 m.</option>
      </select>
      <p id="chartTimeScopeSummary"></p>
    `;
    const periodButtons = Array.from(document.querySelectorAll('[data-chart-period]'));
    const yearSelect = document.getElementById('chartYear');
    const summary = document.getElementById('chartTimeScopeSummary');
    yearSelect.value = '2025';

    syncChartPeriodButtons({
      selectors: {
        chartPeriodButtons: periodButtons,
        chartYearSelect: yearSelect,
        chartTimeScopeSummary: summary,
      },
      period: 365,
    });

    const moreToggle = document.querySelector('.chart-period__more-toggle');
    expect(moreToggle?.textContent).toBe('Daugiau: 365 d.');
    expect(summary?.textContent).toBe('365 d. • 2025 m.');
  });

  it('syncs year chips and summary with selected year', () => {
    document.body.innerHTML = `
      <div id="chartYearGroup">
        <button data-chart-year="all" aria-pressed="false">Visi</button>
        <button data-chart-year="2025" aria-pressed="false">2025</button>
      </div>
      <select id="chartYear">
        <option value="all">Visi</option>
        <option value="2025">2025 m.</option>
      </select>
      <div id="chartPeriodGroup">
        <button data-chart-period="all" aria-pressed="true">Visi</button>
      </div>
      <p id="chartTimeScopeSummary"></p>
    `;
    const chartYearGroup = document.getElementById('chartYearGroup');
    const chartYearSelect = document.getElementById('chartYear');
    const chartTimeScopeSummary = document.getElementById('chartTimeScopeSummary');

    syncChartYearControl({
      selectors: {
        chartYearGroup,
        chartYearSelect,
        chartTimeScopeSummary,
        chartPeriodButtons: Array.from(document.querySelectorAll('[data-chart-period]')),
      },
      dashboardState: { chartYear: 2025, chartPeriod: 0 },
    });

    const yearButtons = Array.from(document.querySelectorAll('[data-chart-year]'));
    expect(yearButtons[1].getAttribute('aria-pressed')).toBe('true');
    expect(yearButtons[0].getAttribute('aria-pressed')).toBe('false');
    expect(chartYearSelect.value).toBe('2025');
    expect(chartTimeScopeSummary.textContent).toBe('Visi • 2025 m.');
  });
});
