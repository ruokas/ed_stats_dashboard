import { getDatasetValue, setDatasetValue } from './utils/dom.js';

export function createUIEvents(env) {
  const {
    selectors,
    dashboardState,
    refreshKpiWindowOptions,
    syncKpiFilterControls,
    handleKpiFilterInput,
    resetKpiFilters,
    KPI_FILTER_TOGGLE_LABELS,
    updateKpiSummary,
    populateFeedbackFilterControls,
    syncFeedbackFilterControls,
    updateFeedbackFiltersSummary,
    handleFeedbackFilterChange,
    setFeedbackTrendWindow,
    storeCopyButtonBaseLabel,
    handleChartCopyClick,
    handleChartDownloadClick,
    handleTableDownloadClick,
    handleTabKeydown,
    setActiveTab,
    updateTvToggleControls,
    setTvMode,
    stopTvClock,
    updateChartPeriod,
    updateChartYear,
    handleHeatmapMetricChange,
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
    toggleTheme,
    setCompareMode,
    clearCompareSelection,
    updateCompareSummary,
    handleCompareRowSelection,
    debounce,
    applyEdSearchFilter,
    applyHourlyDepartmentSelection,
    updateScrollTopButtonVisibility,
    scheduleScrollTopUpdate,
    sectionNavState,
    sectionVisibility,
    sectionNavCompactQuery,
    setLayoutRefreshAllowed,
    getLayoutResizeObserver,
    setLayoutResizeObserver,
    updateSectionNavCompactState,
    handleNavKeydown,
    scheduleLayoutRefresh,
    syncSectionNavVisibility,
    waitForFontsAndStyles,
    updateLayoutMetrics,
    refreshSectionObserver,
    flushPendingLayoutRefresh,
  } = env;

  function initChartCopyButtons() {
    if (!Array.isArray(selectors.chartCopyButtons) || !selectors.chartCopyButtons.length) {
      return;
    }
    selectors.chartCopyButtons.forEach((button) => {
      storeCopyButtonBaseLabel(button);
      button.addEventListener('click', handleChartCopyClick);
    });
  }

  function initChartDownloadButtons() {
    if (!Array.isArray(selectors.chartDownloadButtons) || !selectors.chartDownloadButtons.length) {
      return;
    }
    selectors.chartDownloadButtons.forEach((button) => {
      storeCopyButtonBaseLabel(button);
      button.addEventListener('click', handleChartDownloadClick);
    });
  }

  function initTableDownloadButtons() {
    if (!Array.isArray(selectors.tableDownloadButtons) || !selectors.tableDownloadButtons.length) {
      return;
    }
    selectors.tableDownloadButtons.forEach((button) => {
      storeCopyButtonBaseLabel(button);
      button.addEventListener('click', handleTableDownloadClick);
    });
  }

  function initFeedbackFilters() {
    populateFeedbackFilterControls(dashboardState.feedback.filterOptions);
    syncFeedbackFilterControls();
    updateFeedbackFiltersSummary(dashboardState.feedback.summary);
    if (selectors.feedbackRespondentFilter) {
      selectors.feedbackRespondentFilter.addEventListener('change', handleFeedbackFilterChange);
    }
    if (selectors.feedbackLocationFilter) {
      selectors.feedbackLocationFilter.addEventListener('change', handleFeedbackFilterChange);
    }
  }

  function initKpiFilters() {
    if (!selectors.kpiFiltersForm) {
      return;
    }
    refreshKpiWindowOptions();
    syncKpiFilterControls();
    selectors.kpiFiltersForm.addEventListener('change', handleKpiFilterInput);
    selectors.kpiFiltersForm.addEventListener('submit', (event) => event.preventDefault());
    if (selectors.kpiFiltersReset) {
      selectors.kpiFiltersReset.addEventListener('click', (event) => {
        event.preventDefault();
        resetKpiFilters();
      });
    }
    if (selectors.kpiControls) {
      setDatasetValue(selectors.kpiControls, 'expanded', 'true');
      selectors.kpiControls.hidden = false;
      selectors.kpiControls.setAttribute('aria-hidden', 'false');
    }
    if ((dashboardState.kpi.records && dashboardState.kpi.records.length) || (dashboardState.kpi.daily && dashboardState.kpi.daily.length)) {
      updateKpiSummary({
        records: dashboardState.kpi.records,
        dailyStats: dashboardState.kpi.daily,
        windowDays: dashboardState.kpi.filters.window,
      });
    }
  }

  function initFeedbackTrendControls() {
    if (!selectors.feedbackTrendButtons || !selectors.feedbackTrendButtons.length) {
      return;
    }
    selectors.feedbackTrendButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const months = Number.parseInt(getDatasetValue(button, 'trendMonths', ''), 10);
        if (Number.isFinite(months) && months > 0) {
          setFeedbackTrendWindow(months);
        } else {
          setFeedbackTrendWindow(null);
        }
      });
    });
  }

  function initTabSwitcher() {
    if (!selectors.tabButtons || !selectors.tabButtons.length) {
      setActiveTab(dashboardState.activeTab || 'overview');
      return;
    }
    selectors.tabButtons.forEach((button) => {
      if (!button) {
        return;
      }
      button.addEventListener('click', () => {
        setActiveTab(getDatasetValue(button, 'tabTarget', 'overview'), { focusPanel: true });
      });
      button.addEventListener('keydown', handleTabKeydown);
    });
    setActiveTab(dashboardState.activeTab || 'overview');
  }

  function initTvMode() {
    if (!selectors.edTvPanel) {
      dashboardState.tvMode = false;
      document.body.removeAttribute('data-tv-mode');
      stopTvClock();
      return;
    }
    updateTvToggleControls();
    if (selectors.edTvToggleBtn) {
      selectors.edTvToggleBtn.addEventListener('click', () => {
        const isActive = dashboardState.tvMode === true && dashboardState.activeTab === 'ed';
        if (!isActive && dashboardState.activeTab !== 'ed') {
          setActiveTab('ed', { focusPanel: true });
          setTvMode(true, { force: true });
        } else {
          setTvMode(!isActive);
        }
      });
    }
    const params = new URLSearchParams(window.location.search);
    const hash = (window.location.hash || '').toLowerCase();
    const autoStart = params.has('tv') || hash === '#tv' || hash.includes('tv-mode');
    if (autoStart) {
      setActiveTab('ed', { focusPanel: false });
      setTvMode(true, { force: true, silent: true });
    }
  }

  function initScrollTopButton() {
    const button = selectors.scrollTopBtn;
    if (!button) {
      return;
    }
    button.setAttribute('aria-hidden', 'true');
    button.setAttribute('tabindex', '-1');
    updateScrollTopButtonVisibility();
    button.addEventListener('click', () => {
      const prefersReduced = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (typeof window.scrollTo === 'function') {
        if (!prefersReduced && 'scrollBehavior' in document.documentElement.style) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          window.scrollTo(0, 0);
        }
      } else {
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
    });
    window.addEventListener('scroll', scheduleScrollTopUpdate, { passive: true });
    window.addEventListener('resize', scheduleScrollTopUpdate, { passive: true });
  }

  function initSectionNavigation() {
    if (sectionNavState.initialized) {
      scheduleLayoutRefresh();
      return;
    }
    if (!selectors.sectionNav) {
      return;
    }
    setLayoutRefreshAllowed(true);
    const links = Array.from(selectors.sectionNav.querySelectorAll('.section-nav__link'));
    selectors.sectionNavLinks = links;
    sectionNavState.items = [];
    sectionNavState.itemBySection = new Map();
    sectionVisibility.clear();

    links.forEach((link) => {
      const href = link.getAttribute('href') || '';
      const headingId = href.startsWith('#') ? href.slice(1) : '';
      const headingEl = headingId ? document.getElementById(headingId) : null;
      const sectionEl = headingEl ? headingEl.closest('section[data-section]') : null;
      if (!headingId || !sectionEl) {
        link.hidden = true;
        link.setAttribute('aria-hidden', 'true');
        link.setAttribute('tabindex', '-1');
        return;
      }
      const item = { link, headingId, section: sectionEl };
      sectionNavState.items.push(item);
      sectionNavState.itemBySection.set(sectionEl, item);
      sectionVisibility.set(headingId, { ratio: 0, top: Number.POSITIVE_INFINITY });
    });

    if (!sectionNavState.items.length) {
      return;
    }

    selectors.sectionNavLinks = sectionNavState.items.map((item) => item.link);

    updateSectionNavCompactState();
    if (sectionNavCompactQuery) {
      const handleCompactChange = (event) => updateSectionNavCompactState(event.matches);
      if (typeof sectionNavCompactQuery.addEventListener === 'function') {
        sectionNavCompactQuery.addEventListener('change', handleCompactChange);
      } else if (typeof sectionNavCompactQuery.addListener === 'function') {
        sectionNavCompactQuery.addListener(handleCompactChange);
      }
    }

    sectionNavState.initialized = true;
    if (selectors.sectionNav && getDatasetValue(selectors.sectionNav, 'keyboard', '') !== 'bound') {
      selectors.sectionNav.addEventListener('keydown', handleNavKeydown);
      setDatasetValue(selectors.sectionNav, 'keyboard', 'bound');
    }

    if (typeof ResizeObserver === 'function') {
      const activeObserver = getLayoutResizeObserver();
      if (activeObserver && typeof activeObserver.disconnect === 'function') {
        activeObserver.disconnect();
      }
      const observer = new ResizeObserver(() => {
        scheduleLayoutRefresh();
      });
      setLayoutResizeObserver(observer);
      if (selectors.hero) {
        observer.observe(selectors.hero);
      }
      if (selectors.sectionNav) {
        observer.observe(selectors.sectionNav);
      }
    }

    window.addEventListener('resize', scheduleLayoutRefresh, { passive: true });
    window.addEventListener('load', scheduleLayoutRefresh);

    syncSectionNavVisibility();
    waitForFontsAndStyles().then(() => {
      updateLayoutMetrics();
      refreshSectionObserver();
      updateScrollTopButtonVisibility();
      flushPendingLayoutRefresh();
    });
  }

  function initChartControls() {
    if (selectors.chartPeriodButtons && selectors.chartPeriodButtons.length) {
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

    if (selectors.heatmapMetricSelect) {
      selectors.heatmapMetricSelect.addEventListener('change', handleHeatmapMetricChange);
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
  }

  function initThemeToggle() {
    if (selectors.themeToggleBtn) {
      selectors.themeToggleBtn.addEventListener('click', () => {
        toggleTheme();
      });
    }
  }

  function initCompareControls() {
    if (selectors.compareToggle) {
      selectors.compareToggle.addEventListener('click', () => {
        setCompareMode(!dashboardState.compare.active);
      });
      selectors.compareToggle.setAttribute('aria-pressed', 'false');
    }

    if (selectors.compareClear) {
      selectors.compareClear.addEventListener('click', () => {
        clearCompareSelection();
        if (dashboardState.compare.active) {
          updateCompareSummary();
        }
      });
    }

    const handleCompareClick = (event) => {
      if (!dashboardState.compare.active) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const row = target.closest('tr[data-compare-id]');
      if (row) {
        handleCompareRowSelection(row);
      }
    };

    const handleCompareKeydown = (event) => {
      if (!dashboardState.compare.active) {
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const row = target.closest('tr[data-compare-id]');
      if (row) {
        event.preventDefault();
        handleCompareRowSelection(row);
      }
    };

    if (selectors.recentTable) {
      selectors.recentTable.addEventListener('click', handleCompareClick);
      selectors.recentTable.addEventListener('keydown', handleCompareKeydown);
    }

    if (selectors.monthlyTable) {
      selectors.monthlyTable.addEventListener('click', handleCompareClick);
      selectors.monthlyTable.addEventListener('keydown', handleCompareKeydown);
    }

    if (selectors.yearlyTable) {
      selectors.yearlyTable.addEventListener('click', handleCompareClick);
      selectors.yearlyTable.addEventListener('keydown', handleCompareKeydown);
    }
  }

  function initEdPanelControls() {
    if (selectors.edNavButton) {
      selectors.edNavButton.addEventListener('click', (event) => {
        event.preventDefault();
        const isActive = dashboardState.activeTab === 'ed';
        setActiveTab(isActive ? 'overview' : 'ed', {
          focusPanel: !isActive,
          restoreFocus: isActive,
        });
      });
    }

    if (selectors.closeEdPanelBtn) {
      selectors.closeEdPanelBtn.addEventListener('click', () => {
        setActiveTab('overview', { restoreFocus: true });
      });
    }

    const debouncedEdSearch = debounce((value) => {
      applyEdSearchFilter(value);
    }, 350);

    if (selectors.edSearchInput) {
      selectors.edSearchInput.addEventListener('input', (event) => {
        debouncedEdSearch(event.target.value || '');
      });
    }
  }

  function initGlobalShortcuts() {
    document.addEventListener('keydown', (event) => {
      if (!event.ctrlKey && !event.metaKey && event.shiftKey && (event.key === 'R' || event.key === 'r')) {
        const tagName = event.target && 'tagName' in event.target ? String(event.target.tagName).toUpperCase() : '';
        if (tagName && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) {
          return;
        }
        event.preventDefault();
        resetKpiFilters({ fromKeyboard: true });
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'L' || event.key === 'l')) {
        event.preventDefault();
        toggleTheme();
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'H' || event.key === 'h')) {
        event.preventDefault();
        if (selectors.heatmapMetricSelect) {
          selectors.heatmapMetricSelect.focus();
        }
      }
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === 'A' || event.key === 'a')) {
        const tagName = event.target && 'tagName' in event.target ? String(event.target.tagName).toUpperCase() : '';
        const isEditable = event.target && typeof event.target === 'object'
          && 'isContentEditable' in event.target
          && event.target.isContentEditable === true;
        if (tagName && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) {
          return;
        }
        if (isEditable) {
          return;
        }
        if (dashboardState.activeTab === 'ed') {
          event.preventDefault();
          setActiveTab('overview', { restoreFocus: true });
        }
      }
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.key === 'Escape' && dashboardState.fullscreen) {
        event.preventDefault();
        setActiveTab('overview', { restoreFocus: true });
      }
    });
  }

  function initUI() {
    initSectionNavigation();
    initScrollTopButton();
    initKpiFilters();
    initFeedbackFilters();
    initFeedbackTrendControls();
    initChartCopyButtons();
    initChartDownloadButtons();
    initTableDownloadButtons();
    initTabSwitcher();
    initTvMode();
    initChartControls();
    initThemeToggle();
    initCompareControls();
    initEdPanelControls();
    initGlobalShortcuts();
  }

  return {
    initUI,
  };
}
