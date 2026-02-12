import { TEXT } from '../../../constants.js';

export function syncReportsControls(selectors, dashboardState, yearOptions, pspcTrendOptions) {
  if (selectors.summariesReportsYear) {
    const select = selectors.summariesReportsYear;
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = TEXT.summariesReports?.filters?.allYears || 'Visi metai';
    allOption.selected = String(dashboardState.summariesReportsYear) === 'all';
    select.replaceChildren(allOption);
    (Array.isArray(yearOptions) ? yearOptions : []).forEach((year) => {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      option.selected = String(dashboardState.summariesReportsYear) === String(year);
      select.appendChild(option);
    });
  }
  if (selectors.summariesReportsTopN) {
    selectors.summariesReportsTopN.value = String(dashboardState.summariesReportsTopN || 15);
  }
  if (selectors.summariesReportsMinGroupSize) {
    selectors.summariesReportsMinGroupSize.value = String(dashboardState.summariesReportsMinGroupSize || 100);
  }
  if (selectors.referralHospitalizedByPspcSort) {
    selectors.referralHospitalizedByPspcSort.value =
      dashboardState.summariesReferralPspcSort === 'asc' ? 'asc' : 'desc';
  }
  if (selectors.referralHospitalizedByPspcMode) {
    const mode = String(dashboardState.summariesReferralPspcMode || 'cross').toLowerCase();
    selectors.referralHospitalizedByPspcMode.value = mode === 'trend' ? 'trend' : 'cross';
  }
  if (selectors.referralHospitalizedByPspcTrendPspc && Array.isArray(pspcTrendOptions)) {
    const select = selectors.referralHospitalizedByPspcTrendPspc;
    const previous = String(dashboardState.summariesReferralPspcTrendPspc || '__top3__');
    select.replaceChildren();
    const topOption = document.createElement('option');
    topOption.value = '__top3__';
    topOption.textContent = 'TOP 3 PSPC';
    select.appendChild(topOption);
    (Array.isArray(pspcTrendOptions) ? pspcTrendOptions : []).forEach((label) => {
      if (!label) {
        return;
      }
      const option = document.createElement('option');
      option.value = label;
      option.textContent = label;
      select.appendChild(option);
    });
    const hasPrevious = Array.from(select.options).some((option) => option.value === previous);
    const nextValue = hasPrevious ? previous : '__top3__';
    select.value = nextValue;
    dashboardState.summariesReferralPspcTrendPspc = nextValue;
  }
  const isTrend = String(dashboardState.summariesReferralPspcMode || 'cross').toLowerCase() === 'trend';
  if (selectors.referralHospitalizedByPspcSort) {
    selectors.referralHospitalizedByPspcSort.disabled = isTrend;
    const sortField = selectors.referralHospitalizedByPspcSort.closest('.report-card__inline-filter');
    if (sortField) {
      sortField.hidden = isTrend;
      sortField.setAttribute('aria-hidden', String(isTrend));
    }
  }
  if (selectors.referralHospitalizedByPspcTrendPspc) {
    selectors.referralHospitalizedByPspcTrendPspc.disabled = !isTrend;
    const trendField = selectors.referralHospitalizedByPspcTrendPspc.closest('.report-card__inline-filter');
    if (trendField) {
      trendField.hidden = !isTrend;
      trendField.setAttribute('aria-hidden', String(!isTrend));
    }
  }
}
