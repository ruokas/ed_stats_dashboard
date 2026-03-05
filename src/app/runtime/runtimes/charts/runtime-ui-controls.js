export function createChartsRuntimeUiControls({
  selectors,
  dashboardState,
  chartsSectionKeys,
  getChartsDefaults,
  createDefaultChartFilters,
  sanitizeHeatmapFilters,
  chartFlow,
  syncChartPeriodButtons,
  syncChartYearControl,
  populateHeatmapMetricOptions,
  updateHeatmapCaption,
  syncHeatmapFilterControls,
  hourlyControlsFeature,
  markChartsSectionVisible,
  applyHeatmapFiltersAndRender,
  renderChartsHospitalTable,
  persistChartsQuery,
  setChartsSectionExpanded,
  applyChartsSectionDisclosure,
}) {
  const persistAfter =
    (handler, { section = null } = {}) =>
    (...args) => {
      if (section) {
        markChartsSectionVisible(section);
      }
      const result = handler(...args);
      persistChartsQuery();
      return result;
    };

  const hourlyControlsWithPersistence = {
    ...hourlyControlsFeature,
    handleHourlyMetricClick: persistAfter(hourlyControlsFeature.handleHourlyMetricClick, {
      section: 'hourly',
    }),
    handleHourlyDepartmentInput: persistAfter(hourlyControlsFeature.handleHourlyDepartmentInput, {
      section: 'hourly',
    }),
    handleHourlyFilterChange: persistAfter(hourlyControlsFeature.handleHourlyFilterChange, {
      section: 'hourly',
    }),
    handleHourlyCompareToggle: persistAfter(hourlyControlsFeature.handleHourlyCompareToggle, {
      section: 'hourly',
    }),
    handleHourlyCompareYearsChange: persistAfter(hourlyControlsFeature.handleHourlyCompareYearsChange, {
      section: 'hourly',
    }),
    handleHourlyCompareSeriesClick: persistAfter(hourlyControlsFeature.handleHourlyCompareSeriesClick, {
      section: 'hourly',
    }),
    handleHourlyResetFilters: persistAfter(hourlyControlsFeature.handleHourlyResetFilters, {
      section: 'hourly',
    }),
    applyHourlyDepartmentSelection: persistAfter(hourlyControlsFeature.applyHourlyDepartmentSelection, {
      section: 'hourly',
    }),
  };

  const handleChartFiltersReset = () => {
    const defaults = getChartsDefaults();
    dashboardState.chartPeriod = defaults.chartPeriod;
    dashboardState.chartYear = defaults.chartYear;
    dashboardState.chartFilters = createDefaultChartFilters();
    dashboardState.heatmapMetric = defaults.heatmapMetric;
    dashboardState.heatmapFilters = sanitizeHeatmapFilters({
      arrival: defaults.heatmapArrival,
      disposition: defaults.heatmapDisposition,
      cardType: defaults.heatmapCardType,
    });
    dashboardState.heatmapYear = defaults.heatmapYear;
    dashboardState.hourlyWeekday = defaults.hourlyWeekday;
    dashboardState.hourlyStayBucket = defaults.hourlyStayBucket;
    dashboardState.hourlyMetric = defaults.hourlyMetric;
    dashboardState.hourlyDepartment = defaults.hourlyDepartment;
    dashboardState.hourlyCompareEnabled = defaults.hourlyCompareEnabled;
    dashboardState.hourlyCompareYears = [];
    dashboardState.hourlyCompareSeries = defaults.hourlyCompareSeries;
    dashboardState.chartsHospitalTableYear = defaults.hospitalYear;
    dashboardState.chartsHospitalTableSort = defaults.hospitalSort;
    dashboardState.chartsHospitalTableSearch = defaults.hospitalSearch;
    dashboardState.chartsHospitalTableDepartment = defaults.hospitalDepartment;
    if (selectors.chartsHospitalTableSearch instanceof HTMLInputElement) {
      selectors.chartsHospitalTableSearch.value = '';
    }
    chartFlow.syncChartFilterControls();
    syncChartPeriodButtons({ selectors, period: dashboardState.chartPeriod });
    syncChartYearControl({ selectors, dashboardState });
    populateHeatmapMetricOptions();
    updateHeatmapCaption(dashboardState.heatmapMetric);
    syncHeatmapFilterControls();
    hourlyControlsFeature.syncHourlyMetricButtons();
    hourlyControlsFeature.syncHourlyCompareControls();
    hourlyControlsFeature.syncHourlyDepartmentVisibility(dashboardState.hourlyMetric);
    hourlyControlsFeature.updateHourlyCaption(
      dashboardState.hourlyWeekday,
      dashboardState.hourlyStayBucket,
      dashboardState.hourlyMetric,
      dashboardState.hourlyDepartment
    );
    chartFlow.applyChartFilters();
    markChartsSectionVisible('heatmap');
    applyHeatmapFiltersAndRender();
    markChartsSectionVisible('hourly');
    hourlyControlsFeature.handleHourlyFilterChange();
    dashboardState.chartsSectionRenderFlags = {
      ...(dashboardState.chartsSectionRenderFlags || {}),
      hospitalVisible: true,
    };
    renderChartsHospitalTable(dashboardState.rawRecords, { force: true });
    persistChartsQuery();
  };

  const expandChartsForTarget = (target) => {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const targetId = String(target.id || '').trim();
    if (!targetId) {
      return;
    }
    if (targetId === 'chartsHospitalTableHeading') {
      setChartsSectionExpanded('hospital', true);
    } else if (targetId === 'chartsHourlyHeading') {
      setChartsSectionExpanded('hourly', true);
    } else if (targetId === 'chartsHeatmapHeading') {
      setChartsSectionExpanded('heatmap', true);
    } else if (targetId === 'chartHeading') {
      setChartsSectionExpanded('overview', true);
    } else if (target.closest?.('[data-charts-section-panel="hourly"]')) {
      setChartsSectionExpanded('hourly', true);
    } else if (target.closest?.('[data-charts-section-panel="heatmap"]')) {
      setChartsSectionExpanded('heatmap', true);
    } else if (target.closest?.('[data-charts-section-panel="overview"]')) {
      setChartsSectionExpanded('overview', true);
    } else if (target.closest?.('[data-charts-section-panel="hospital"]')) {
      setChartsSectionExpanded('hospital', true);
    }
    applyChartsSectionDisclosure({ reason: 'jump-nav', triggerRender: true });
    persistChartsQuery();
  };

  const applyInitialHashExpansion = () => {
    if (!String(window.location.hash || '').startsWith('#')) {
      return;
    }
    const target = document.getElementById(String(window.location.hash).slice(1));
    if (target instanceof HTMLElement) {
      expandChartsForTarget(target);
    }
  };

  const bindChartsSectionToggleButtons = () => {
    selectors.chartsSectionToggleButtons?.forEach((button) => {
      button.addEventListener('click', (event) => {
        const target = event.currentTarget;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const key = String(target.getAttribute('data-charts-section-toggle') || '').trim();
        if (!chartsSectionKeys.includes(key)) {
          return;
        }
        const current = dashboardState.chartsSectionsExpanded?.[key] === true;
        setChartsSectionExpanded(key, !current);
        applyChartsSectionDisclosure({ reason: 'section-toggle', triggerRender: true });
        persistChartsQuery();
      });
    });
  };

  return {
    hourlyControlsWithPersistence,
    handleChartFiltersReset,
    expandChartsForTarget,
    applyInitialHashExpansion,
    bindChartsSectionToggleButtons,
  };
}
