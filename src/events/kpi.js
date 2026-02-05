import { setDatasetValue } from '../utils/dom.js';

export function initKpiFilters(env) {
  const {
    selectors,
    dashboardState,
    refreshKpiWindowOptions,
    syncKpiFilterControls,
    handleKpiFilterInput,
    handleKpiDateClear,
    handleKpiDateInput,
    handleKpiSegmentedClick,
    handleLastShiftMetricClick,
    syncLastShiftHourlyMetricButtons,
    resetKpiFilters,
    updateKpiSummary,
  } = env;

  if (!selectors.kpiFiltersForm) {
    return;
  }
  refreshKpiWindowOptions();
  syncKpiFilterControls();
  selectors.kpiFiltersForm.addEventListener('change', handleKpiFilterInput);
  selectors.kpiFiltersForm.addEventListener('submit', (event) => event.preventDefault());
  if (selectors.kpiDateInput) {
    selectors.kpiDateInput.addEventListener('change', handleKpiDateInput);
  }
  if (selectors.kpiDateClear) {
    selectors.kpiDateClear.addEventListener('click', (event) => {
      event.preventDefault();
      handleKpiDateClear();
    });
  }
  if (selectors.kpiFiltersReset) {
    selectors.kpiFiltersReset.addEventListener('click', (event) => {
      event.preventDefault();
      resetKpiFilters();
    });
  }
  if (Array.isArray(selectors.kpiArrivalButtons)) {
    selectors.kpiArrivalButtons.forEach((button) => {
      button.addEventListener('click', handleKpiSegmentedClick);
    });
  }
  if (Array.isArray(selectors.kpiCardTypeButtons)) {
    selectors.kpiCardTypeButtons.forEach((button) => {
      button.addEventListener('click', handleKpiSegmentedClick);
    });
  }
  if (Array.isArray(selectors.lastShiftHourlyMetricButtons)) {
    selectors.lastShiftHourlyMetricButtons.forEach((button) => {
      button.addEventListener('click', handleLastShiftMetricClick);
    });
  }
  syncLastShiftHourlyMetricButtons();
  if (selectors.kpiControls) {
    setDatasetValue(selectors.kpiControls, 'expanded', 'true');
    selectors.kpiControls.hidden = false;
    selectors.kpiControls.setAttribute('aria-hidden', 'false');
  }
  if ((dashboardState.kpi.records && dashboardState.kpi.records.length)
    || (dashboardState.kpi.daily && dashboardState.kpi.daily.length)) {
    updateKpiSummary({
      records: dashboardState.kpi.records,
      dailyStats: dashboardState.kpi.daily,
      windowDays: dashboardState.kpi.filters.window,
    });
  }
}
