import { describe, expect, test } from 'vitest';
import { syncReportsControls } from '../../src/app/runtime/runtimes/summaries/report-controls.js';

function createFilterField(select) {
  const field = document.createElement('div');
  field.className = 'report-card__inline-filter';
  field.appendChild(select);
  return field;
}

function addOptions(select, values) {
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = String(value);
    select.appendChild(option);
  });
}

describe('summaries report controls', () => {
  test('syncs years, defaults and trend toggle state', () => {
    const yearSelect = document.createElement('select');
    const topNSelect = document.createElement('select');
    const minGroupSelect = document.createElement('select');
    const sortSelect = document.createElement('select');
    const modeSelect = document.createElement('select');
    const trendPspcSelect = document.createElement('select');
    addOptions(topNSelect, ['15', '20']);
    addOptions(minGroupSelect, ['10', '50', '100']);
    addOptions(sortSelect, ['asc', 'desc']);
    addOptions(modeSelect, ['cross', 'trend']);

    document.body.appendChild(createFilterField(sortSelect));
    document.body.appendChild(createFilterField(trendPspcSelect));

    const selectors = {
      summariesReportsYear: yearSelect,
      summariesReportsTopN: topNSelect,
      summariesReportsMinGroupSize: minGroupSelect,
      referralHospitalizedByPspcSort: sortSelect,
      referralHospitalizedByPspcMode: modeSelect,
      referralHospitalizedByPspcTrendPspc: trendPspcSelect,
    };
    const dashboardState = {
      summariesReportsYear: '2024',
      summariesReportsTopN: 20,
      summariesReportsMinGroupSize: 50,
      summariesReferralPspcSort: 'asc',
      summariesReferralPspcMode: 'trend',
      summariesReferralPspcTrendPspc: 'PSPC B',
    };

    syncReportsControls(selectors, dashboardState, ['2024', '2023'], ['PSPC A', 'PSPC B']);

    expect(yearSelect.options).toHaveLength(3);
    expect(yearSelect.value).toBe('2024');
    expect(topNSelect.value).toBe('20');
    expect(minGroupSelect.value).toBe('50');
    expect(sortSelect.value).toBe('asc');
    expect(modeSelect.value).toBe('trend');
    expect(trendPspcSelect.value).toBe('PSPC B');
    expect(sortSelect.disabled).toBe(true);
    expect(trendPspcSelect.disabled).toBe(false);
  });

  test('falls back to top3 option and cross mode defaults', () => {
    const modeSelect = document.createElement('select');
    const sortSelect = document.createElement('select');
    const trendPspcSelect = document.createElement('select');
    addOptions(modeSelect, ['cross', 'trend']);
    addOptions(sortSelect, ['asc', 'desc']);

    document.body.appendChild(createFilterField(sortSelect));
    document.body.appendChild(createFilterField(trendPspcSelect));

    const selectors = {
      referralHospitalizedByPspcMode: modeSelect,
      referralHospitalizedByPspcSort: sortSelect,
      referralHospitalizedByPspcTrendPspc: trendPspcSelect,
    };
    const dashboardState = {
      summariesReferralPspcMode: 'cross',
      summariesReferralPspcSort: 'desc',
      summariesReferralPspcTrendPspc: 'Missing PSPC',
    };

    syncReportsControls(selectors, dashboardState, [], ['PSPC X']);

    expect(modeSelect.value).toBe('cross');
    expect(sortSelect.disabled).toBe(false);
    expect(trendPspcSelect.disabled).toBe(true);
    expect(trendPspcSelect.options[0].value).toBe('__top3__');
    expect(trendPspcSelect.value).toBe('__top3__');
    expect(dashboardState.summariesReferralPspcTrendPspc).toBe('__top3__');
  });
});
