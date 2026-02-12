import { getDatasetValue } from '../utils/dom.js';

export function initChartCopyButtons(env) {
  const { selectors, storeCopyButtonBaseLabel, handleChartCopyClick } = env;

  if (!Array.isArray(selectors.chartCopyButtons) || !selectors.chartCopyButtons.length) {
    return;
  }
  selectors.chartCopyButtons.forEach((button) => {
    storeCopyButtonBaseLabel(button);
    button.addEventListener('click', handleChartCopyClick);
  });
}

export function initChartDownloadButtons(env) {
  const { selectors, storeCopyButtonBaseLabel, handleChartDownloadClick } = env;

  if (!Array.isArray(selectors.chartDownloadButtons) || !selectors.chartDownloadButtons.length) {
    return;
  }
  selectors.chartDownloadButtons.forEach((button) => {
    storeCopyButtonBaseLabel(button);
    button.addEventListener('click', handleChartDownloadClick);
  });
}

export function initTableDownloadButtons(env) {
  const { selectors, storeCopyButtonBaseLabel, handleTableDownloadClick } = env;

  if (!Array.isArray(selectors.tableDownloadButtons) || !selectors.tableDownloadButtons.length) {
    return;
  }
  selectors.tableDownloadButtons.forEach((button) => {
    storeCopyButtonBaseLabel(button);
    button.addEventListener('click', handleTableDownloadClick);
  });
}

export function initChartControls(env) {
  const {
    selectors,
    updateChartPeriod,
    updateChartYear,
    handleHeatmapMetricChange,
    handleHeatmapFilterChange,
    handleHourlyMetricClick,
    handleHourlyDepartmentInput,
    handleHourlyDepartmentBlur,
    handleHourlyDepartmentKeydown,
    handleHourlyDepartmentToggle,
    handleHourlyFilterChange,
    handleHourlyCompareToggle,
    handleHourlyCompareYearsChange,
    handleHourlyCompareSeriesClick,
    handleHourlyResetFilters,
    handleChartFilterChange,
    handleChartSegmentedClick,
    applyHourlyDepartmentSelection,
    handleChartsHospitalTableYearChange,
    handleChartsHospitalTableSearchInput,
    handleChartsHospitalTableHeaderClick,
    handleChartsHospitalTableRowClick,
  } = env;

  if (selectors.chartPeriodButtons?.length) {
    selectors.chartPeriodButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const period = getDatasetValue(button, 'chartPeriod', '');
        updateChartPeriod(period);
      });
    });
  }

  if (selectors.chartYearSelect) {
    selectors.chartYearSelect.addEventListener('change', (event) => {
      const { value } = event.target;
      if (value === 'all') {
        updateChartYear(null);
      } else {
        updateChartYear(value);
      }
    });
  }

  if (selectors.chartsHospitalTableYear) {
    selectors.chartsHospitalTableYear.addEventListener('change', handleChartsHospitalTableYearChange);
  }

  if (selectors.chartsHospitalTableSearch) {
    selectors.chartsHospitalTableSearch.addEventListener('input', handleChartsHospitalTableSearchInput);
  }

  if (selectors.chartsHospitalTableRoot) {
    selectors.chartsHospitalTableRoot.addEventListener('click', handleChartsHospitalTableHeaderClick);
  }

  if (selectors.chartsHospitalTableBody) {
    selectors.chartsHospitalTableBody.addEventListener('click', handleChartsHospitalTableRowClick);
  }

  if (selectors.heatmapMetricSelect) {
    selectors.heatmapMetricSelect.addEventListener('change', handleHeatmapMetricChange);
  }
  if (selectors.heatmapFilterArrival) {
    selectors.heatmapFilterArrival.addEventListener('change', handleHeatmapFilterChange);
  }
  if (selectors.heatmapFilterDisposition) {
    selectors.heatmapFilterDisposition.addEventListener('change', handleHeatmapFilterChange);
  }
  if (selectors.heatmapFilterCardType) {
    selectors.heatmapFilterCardType.addEventListener('change', handleHeatmapFilterChange);
  }
  if (selectors.heatmapYearSelect) {
    selectors.heatmapYearSelect.addEventListener('change', handleHeatmapFilterChange);
  }

  if (Array.isArray(selectors.hourlyMetricButtons)) {
    selectors.hourlyMetricButtons.forEach((button) => {
      button.addEventListener('click', handleHourlyMetricClick);
    });
  }

  if (selectors.hourlyDepartmentInput) {
    selectors.hourlyDepartmentInput.addEventListener('input', handleHourlyDepartmentInput);
    selectors.hourlyDepartmentInput.addEventListener('change', handleHourlyDepartmentInput);
    selectors.hourlyDepartmentInput.addEventListener('blur', handleHourlyDepartmentBlur);
    selectors.hourlyDepartmentInput.addEventListener('keydown', handleHourlyDepartmentKeydown);
  }

  if (selectors.hourlyDepartmentToggle) {
    selectors.hourlyDepartmentToggle.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    selectors.hourlyDepartmentToggle.addEventListener('click', handleHourlyDepartmentToggle);
  }

  if (selectors.hourlyDepartmentSuggestions) {
    selectors.hourlyDepartmentSuggestions.addEventListener('mousedown', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const option = target.closest('.hourly-suggestions__item');
      if (!option) {
        return;
      }
      event.preventDefault();
      applyHourlyDepartmentSelection(option.textContent || '');
    });
  }

  if (selectors.hourlyWeekdaySelect) {
    selectors.hourlyWeekdaySelect.addEventListener('change', handleHourlyFilterChange);
  }

  if (selectors.hourlyStaySelect) {
    selectors.hourlyStaySelect.addEventListener('change', handleHourlyFilterChange);
  }

  if (selectors.hourlyCompareToggle) {
    selectors.hourlyCompareToggle.addEventListener('change', handleHourlyCompareToggle);
  }

  if (selectors.hourlyCompareYearA) {
    selectors.hourlyCompareYearA.addEventListener('change', handleHourlyCompareYearsChange);
  }

  if (selectors.hourlyCompareYearB) {
    selectors.hourlyCompareYearB.addEventListener('change', handleHourlyCompareYearsChange);
  }

  if (Array.isArray(selectors.hourlyCompareSeriesButtons)) {
    selectors.hourlyCompareSeriesButtons.forEach((button) => {
      button.addEventListener('click', handleHourlyCompareSeriesClick);
    });
  }

  if (selectors.hourlyResetFilters) {
    selectors.hourlyResetFilters.addEventListener('click', handleHourlyResetFilters);
  }

  if (selectors.chartFiltersForm) {
    selectors.chartFiltersForm.addEventListener('change', handleChartFilterChange);
    selectors.chartFiltersForm.addEventListener('submit', (event) => event.preventDefault());
  }
  if (Array.isArray(selectors.chartFilterArrivalButtons)) {
    selectors.chartFilterArrivalButtons.forEach((button) => {
      button.addEventListener('click', handleChartSegmentedClick);
    });
  }
  if (Array.isArray(selectors.chartFilterDispositionButtons)) {
    selectors.chartFilterDispositionButtons.forEach((button) => {
      button.addEventListener('click', handleChartSegmentedClick);
    });
  }
  if (Array.isArray(selectors.chartFilterCardTypeButtons)) {
    selectors.chartFilterCardTypeButtons.forEach((button) => {
      button.addEventListener('click', handleChartSegmentedClick);
    });
  }
}
