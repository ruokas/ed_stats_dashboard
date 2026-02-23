export function wireSummariesInteractions({
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
  onFiltersStateChange = null,
  resetSummariesFilters = null,
  updateSummariesFiltersSummary = null,
}) {
  const emitFiltersChanged = () => {
    if (typeof onFiltersStateChange === 'function') {
      onFiltersStateChange();
    }
    if (typeof updateSummariesFiltersSummary === 'function') {
      updateSummariesFiltersSummary();
    }
  };
  initYearlyExpand({
    selectors,
    handleYearlyToggle: (event) => handleYearlyToggle(selectors, dashboardState, event),
  });
  initTableDownloadButtons({ selectors, storeCopyButtonBaseLabel, handleTableDownloadClick });
  if (selectors.yearlyTableCopyButton) {
    storeCopyButtonBaseLabel(selectors.yearlyTableCopyButton);
    selectors.yearlyTableCopyButton.addEventListener('click', handleYearlyTableCopyClick);
  }
  if (Array.isArray(selectors.reportExportButtons)) {
    selectors.reportExportButtons.forEach((button) => {
      button.addEventListener('click', handleReportExportClick);
    });
  }
  if (selectors.summariesReportsYear) {
    selectors.summariesReportsYear.addEventListener('change', (event) => {
      const value = String(event.target.value || 'all');
      dashboardState.summariesReportsYear = value === 'all' ? 'all' : value;
      emitFiltersChanged();
      rerenderReports();
    });
  }
  if (selectors.summariesReportsTopN) {
    selectors.summariesReportsTopN.addEventListener('change', (event) => {
      dashboardState.summariesReportsTopN = parsePositiveIntOrDefault(event.target.value, 15);
      emitFiltersChanged();
      rerenderReports();
    });
  }
  if (selectors.summariesReportsMinGroupSize) {
    selectors.summariesReportsMinGroupSize.addEventListener('change', (event) => {
      dashboardState.summariesReportsMinGroupSize = parsePositiveIntOrDefault(event.target.value, 100);
      emitFiltersChanged();
      rerenderReports();
    });
  }
  if (selectors.referralHospitalizedByPspcSort) {
    selectors.referralHospitalizedByPspcSort.addEventListener('change', (event) => {
      const value = String(event.target.value || 'desc').toLowerCase();
      dashboardState.summariesReferralPspcSort = value === 'asc' ? 'asc' : 'desc';
      emitFiltersChanged();
      rerenderReports();
    });
  }
  if (selectors.referralHospitalizedByPspcMode) {
    selectors.referralHospitalizedByPspcMode.addEventListener('change', (event) => {
      const value = String(event.target.value || 'cross').toLowerCase();
      dashboardState.summariesReferralPspcMode = value === 'trend' ? 'trend' : 'cross';
      emitFiltersChanged();
      rerenderReports();
    });
  }
  if (selectors.referralHospitalizedByPspcTrendPspc) {
    selectors.referralHospitalizedByPspcTrendPspc.addEventListener('change', (event) => {
      const value = String(event.target.value || '__top3__');
      dashboardState.summariesReferralPspcTrendPspc = value || '__top3__';
      emitFiltersChanged();
      rerenderReports();
    });
  }
  if (selectors.summariesReportsReset && typeof resetSummariesFilters === 'function') {
    selectors.summariesReportsReset.addEventListener('click', () => {
      resetSummariesFilters();
      emitFiltersChanged();
      rerenderReports();
    });
  }
  emitFiltersChanged();
}
