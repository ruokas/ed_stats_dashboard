import { describe, expect, it, vi } from 'vitest';

import { wireSummariesInteractions } from '../../src/app/runtime/runtimes/summaries/runtime-interactions.js';

function createSelect(value = '', options = [value || '']) {
  const el = document.createElement('select');
  options.forEach((optionValue) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    el.appendChild(option);
  });
  el.value = value;
  return el;
}

describe('wireSummariesInteractions', () => {
  it('wires controls and updates dashboard state on change', () => {
    const selectors = {
      yearlyTableCopyButton: document.createElement('button'),
      reportExportButtons: [document.createElement('button')],
      summariesReportsYear: createSelect('all', ['all', '2025']),
      summariesReportsTopN: createSelect('15', ['15', '7']),
      summariesReportsMinGroupSize: createSelect('100', ['100', '42']),
      referralHospitalizedByPspcSort: createSelect('desc', ['desc', 'asc']),
      referralHospitalizedByPspcMode: createSelect('cross', ['cross', 'trend']),
      referralHospitalizedByPspcTrendPspc: createSelect('__top3__', ['__top3__', 'Clinic A']),
    };
    const dashboardState = {
      summariesReportsYear: 'all',
      summariesReportsTopN: 15,
      summariesReportsMinGroupSize: 100,
      summariesReferralPspcSort: 'desc',
      summariesReferralPspcMode: 'cross',
      summariesReferralPspcTrendPspc: '__top3__',
    };
    const rerenderReports = vi.fn();
    const handleReportExportClick = vi.fn();
    const handleYearlyTableCopyClick = vi.fn();
    const handleTableDownloadClick = vi.fn();
    const storeCopyButtonBaseLabel = vi.fn();
    const initTableDownloadButtons = vi.fn();
    const initYearlyExpand = vi.fn();
    const handleYearlyToggle = vi.fn();
    const parsePositiveIntOrDefault = vi.fn((value, fallback) => {
      const parsed = Number.parseInt(String(value), 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    });

    wireSummariesInteractions({
      selectors,
      dashboardState,
      rerenderReports,
      handleReportExportClick,
      handleYearlyTableCopyClick,
      handleTableDownloadClick,
      storeCopyButtonBaseLabel,
      initTableDownloadButtons,
      initYearlyExpand,
      handleYearlyToggle,
      parsePositiveIntOrDefault,
    });

    selectors.reportExportButtons[0].click();
    selectors.yearlyTableCopyButton.click();
    selectors.summariesReportsYear.value = '2025';
    selectors.summariesReportsYear.dispatchEvent(new Event('change'));
    selectors.summariesReportsTopN.value = '7';
    selectors.summariesReportsTopN.dispatchEvent(new Event('change'));
    selectors.summariesReportsMinGroupSize.value = '42';
    selectors.summariesReportsMinGroupSize.dispatchEvent(new Event('change'));
    selectors.referralHospitalizedByPspcSort.value = 'asc';
    selectors.referralHospitalizedByPspcSort.dispatchEvent(new Event('change'));
    selectors.referralHospitalizedByPspcMode.value = 'trend';
    selectors.referralHospitalizedByPspcMode.dispatchEvent(new Event('change'));
    selectors.referralHospitalizedByPspcTrendPspc.value = 'Clinic A';
    selectors.referralHospitalizedByPspcTrendPspc.dispatchEvent(new Event('change'));

    expect(initYearlyExpand).toHaveBeenCalledTimes(1);
    expect(initTableDownloadButtons).toHaveBeenCalledTimes(1);
    expect(storeCopyButtonBaseLabel).toHaveBeenCalledWith(selectors.yearlyTableCopyButton);
    expect(handleReportExportClick).toHaveBeenCalledTimes(1);
    expect(handleYearlyTableCopyClick).toHaveBeenCalledTimes(1);
    expect(dashboardState.summariesReportsYear).toBe('2025');
    expect(dashboardState.summariesReportsTopN).toBe(7);
    expect(dashboardState.summariesReportsMinGroupSize).toBe(42);
    expect(dashboardState.summariesReferralPspcSort).toBe('asc');
    expect(dashboardState.summariesReferralPspcMode).toBe('trend');
    expect(dashboardState.summariesReferralPspcTrendPspc).toBe('Clinic A');
    expect(rerenderReports).toHaveBeenCalled();
    expect(handleTableDownloadClick).toBeTypeOf('function');
    expect(handleYearlyToggle).toBeTypeOf('function');
  });

  it('falls back to defaults for empty values', () => {
    const selectors = {
      reportExportButtons: [],
      summariesReportsTopN: createSelect(''),
      summariesReportsMinGroupSize: createSelect(''),
      referralHospitalizedByPspcSort: createSelect(''),
      referralHospitalizedByPspcMode: createSelect(''),
      referralHospitalizedByPspcTrendPspc: createSelect(''),
    };
    const dashboardState = {};
    const rerenderReports = vi.fn();

    wireSummariesInteractions({
      selectors,
      dashboardState,
      rerenderReports,
      handleReportExportClick: vi.fn(),
      handleYearlyTableCopyClick: vi.fn(),
      handleTableDownloadClick: vi.fn(),
      storeCopyButtonBaseLabel: vi.fn(),
      initTableDownloadButtons: vi.fn(),
      initYearlyExpand: vi.fn(),
      handleYearlyToggle: vi.fn(),
      parsePositiveIntOrDefault: (_value, fallback) => fallback,
    });

    selectors.summariesReportsTopN.dispatchEvent(new Event('change'));
    selectors.summariesReportsMinGroupSize.dispatchEvent(new Event('change'));
    selectors.referralHospitalizedByPspcSort.dispatchEvent(new Event('change'));
    selectors.referralHospitalizedByPspcMode.dispatchEvent(new Event('change'));
    selectors.referralHospitalizedByPspcTrendPspc.dispatchEvent(new Event('change'));

    expect(dashboardState.summariesReportsTopN).toBe(15);
    expect(dashboardState.summariesReportsMinGroupSize).toBe(100);
    expect(dashboardState.summariesReferralPspcSort).toBe('desc');
    expect(dashboardState.summariesReferralPspcMode).toBe('cross');
    expect(dashboardState.summariesReferralPspcTrendPspc).toBe('__top3__');
    expect(rerenderReports).toHaveBeenCalled();
  });
});
