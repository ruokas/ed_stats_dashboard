export function createChartFlow({
  selectors,
  dashboardState,
  TEXT,
  DEFAULT_SETTINGS,
  getDefaultChartFilters,
  KPI_FILTER_LABELS,
  sanitizeChartFilters,
  getDatasetValue,
  setDatasetValue,
  toSentenceCase,
  showChartError,
  describeError,
  computeDailyStats,
  filterDailyStatsByWindow,
  filterDailyStatsByYear,
  filterRecordsByYear,
  filterRecordsByWindow,
  filterRecordsByChartFilters,
  computeArrivalHeatmap,
  computeFunnelStats,
  buildDailyWindowKeys,
  fillDailyStatsWindow,
  updateDailyPeriodSummary,
  syncChartPeriodButtons,
  syncChartYearControl,
  formatDailyCaption,
  renderCharts,
  getSettings,
}) {
  function syncChartSegmentedButtons(compareActive = false) {
    const filters = sanitizeChartFilters(dashboardState.chartFilters, { getDefaultChartFilters, KPI_FILTER_LABELS });
    if (Array.isArray(selectors.chartFilterArrivalButtons) && selectors.chartFilterArrivalButtons.length) {
      selectors.chartFilterArrivalButtons.forEach((button) => {
        const value = getDatasetValue(button, 'chartArrival');
        if (!value) {
          return;
        }
        const isActive = value === filters.arrival;
        button.setAttribute('aria-pressed', String(isActive));
        button.disabled = compareActive;
        button.setAttribute('aria-disabled', String(compareActive));
        if (compareActive) {
          button.title = 'Palyginimo režimas: atvykimo tipas fiksuotas';
        } else {
          button.removeAttribute('title');
        }
      });
    }
    if (Array.isArray(selectors.chartFilterDispositionButtons) && selectors.chartFilterDispositionButtons.length) {
      selectors.chartFilterDispositionButtons.forEach((button) => {
        const value = getDatasetValue(button, 'chartDisposition');
        if (!value) {
          return;
        }
        button.setAttribute('aria-pressed', String(value === filters.disposition));
      });
    }
    if (Array.isArray(selectors.chartFilterCardTypeButtons) && selectors.chartFilterCardTypeButtons.length) {
      selectors.chartFilterCardTypeButtons.forEach((button) => {
        const value = getDatasetValue(button, 'chartCardType');
        if (!value) {
          return;
        }
        button.setAttribute('aria-pressed', String(value === filters.cardType));
      });
    }
  }

  function syncChartFilterControls() {
    const filters = sanitizeChartFilters(dashboardState.chartFilters, { getDefaultChartFilters, KPI_FILTER_LABELS });
    dashboardState.chartFilters = { ...filters };
    const compareActive = Boolean(filters.compareGmp);
    if (selectors.chartFilterArrival) {
      selectors.chartFilterArrival.value = filters.arrival;
      selectors.chartFilterArrival.disabled = compareActive;
      if (compareActive) {
        selectors.chartFilterArrival.title = 'Palyginimo režimas: atvykimo tipas fiksuotas';
      } else {
        selectors.chartFilterArrival.removeAttribute('title');
      }
    }
    if (selectors.chartFilterDisposition) {
      selectors.chartFilterDisposition.value = filters.disposition;
    }
    if (selectors.chartFilterCardType) {
      selectors.chartFilterCardType.value = filters.cardType;
    }
    if (selectors.chartFilterCompareGmp) {
      selectors.chartFilterCompareGmp.checked = compareActive;
    }
    syncChartSegmentedButtons(compareActive);
  }

  function updateChartFiltersSummary({ records, daily } = {}) {
    if (!selectors.chartFiltersSummary) {
      return;
    }
    const filters = sanitizeChartFilters(dashboardState.chartFilters, { getDefaultChartFilters, KPI_FILTER_LABELS });
    const defaults = getDefaultChartFilters();
    const summaryParts = [];
    if (filters.compareGmp) {
      summaryParts.push(TEXT.charts?.compareGmpSummary || 'GMP vs be GMP');
    }
    if (!filters.compareGmp && filters.arrival !== defaults.arrival) {
      summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.arrival[filters.arrival]));
    }
    if (filters.disposition !== defaults.disposition) {
      summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.disposition[filters.disposition]));
    }
    if (filters.cardType !== defaults.cardType) {
      summaryParts.push(toSentenceCase(KPI_FILTER_LABELS.cardType[filters.cardType]));
    }
    const hasRecords = Array.isArray(records) ? records.length > 0 : false;
    const hasDaily = Array.isArray(daily)
      ? daily.some((entry) => Number.isFinite(entry?.count) && entry.count > 0)
      : false;
    const hasData = hasRecords || hasDaily;
    let text = summaryParts.join(' • ');
    if (!hasData) {
      text = text ? `Įrašų nerasta • ${text}` : 'Įrašų nerasta';
    }
    if (!text) {
      selectors.chartFiltersSummary.textContent = '';
      setDatasetValue(selectors.chartFiltersSummary, 'default', 'true');
      return;
    }
    selectors.chartFiltersSummary.textContent = text;
    setDatasetValue(selectors.chartFiltersSummary, 'default', 'false');
  }

  function applyChartFilters() {
    const sanitized = sanitizeChartFilters(dashboardState.chartFilters, { getDefaultChartFilters, KPI_FILTER_LABELS });
    dashboardState.chartFilters = { ...sanitized };
    syncChartFilterControls();
    const hasBaseData = (Array.isArray(dashboardState.chartData.baseDaily) && dashboardState.chartData.baseDaily.length)
      || (Array.isArray(dashboardState.dailyStats) && dashboardState.dailyStats.length);
    if (!hasBaseData) {
      updateChartFiltersSummary({ records: [], daily: [] });
      if (selectors.dailyCaptionContext) {
        selectors.dailyCaptionContext.textContent = '';
      }
      return Promise.resolve();
    }
    const scoped = prepareChartDataForPeriod(dashboardState.chartPeriod);
    return renderCharts(scoped.daily, scoped.funnel, scoped.heatmap)
      .catch((error) => {
        const errorInfo = describeError(error, { code: 'CHART_FILTERS', message: 'Nepavyko pritaikyti grafiko filtrų' });
        console.error(errorInfo.log, error);
        showChartError(TEXT.charts?.errorLoading);
      });
  }

  function updateChartPeriod(period) {
    const rawValue = String(period);
    const isAll = rawValue === 'all';
    const numeric = Number.parseInt(rawValue, 10);
    if (!isAll && (!Number.isFinite(numeric) || numeric < 0)) {
      return;
    }
    dashboardState.chartPeriod = isAll ? 0 : numeric;
    syncChartPeriodButtons(dashboardState.chartPeriod);
    if (selectors.dailyCaption) {
      selectors.dailyCaption.textContent = formatDailyCaption(dashboardState.chartPeriod);
    }
    const hasBaseData = (Array.isArray(dashboardState.chartData.baseDaily) && dashboardState.chartData.baseDaily.length)
      || (Array.isArray(dashboardState.dailyStats) && dashboardState.dailyStats.length);
    if (!hasBaseData) {
      updateDailyPeriodSummary([]);
      if (selectors.dailyCaptionContext) {
        selectors.dailyCaptionContext.textContent = '';
      }
      updateChartFiltersSummary({ records: [], daily: [] });
      return;
    }
    const scoped = prepareChartDataForPeriod(dashboardState.chartPeriod);
    renderCharts(scoped.daily, scoped.funnel, scoped.heatmap)
      .catch((error) => {
        const errorInfo = describeError(error, { code: 'CHART_PERIOD', message: 'Nepavyko atnaujinti grafiko laikotarpio' });
        console.error(errorInfo.log, error);
        showChartError(TEXT.charts?.errorLoading);
      });
  }

  function updateChartYear(year) {
    const numeric = Number.isFinite(year) ? Math.trunc(year) : Number.parseInt(String(year), 10);
    const normalized = Number.isFinite(numeric) ? numeric : null;
    dashboardState.chartYear = normalized;
    syncChartYearControl();
    if (normalized != null) {
      dashboardState.chartPeriod = 0;
      syncChartPeriodButtons(dashboardState.chartPeriod);
    }
    if (selectors.dailyCaption) {
      selectors.dailyCaption.textContent = formatDailyCaption(dashboardState.chartPeriod);
    }
    const hasBaseData = (Array.isArray(dashboardState.chartData.baseDaily) && dashboardState.chartData.baseDaily.length)
      || (Array.isArray(dashboardState.dailyStats) && dashboardState.dailyStats.length);
    if (!hasBaseData) {
      updateDailyPeriodSummary([]);
      if (selectors.dailyCaptionContext) {
        selectors.dailyCaptionContext.textContent = '';
      }
      updateChartFiltersSummary({ records: [], daily: [] });
      return;
    }
    const scoped = prepareChartDataForPeriod(dashboardState.chartPeriod);
    renderCharts(scoped.daily, scoped.funnel, scoped.heatmap)
      .catch((error) => {
        const errorInfo = describeError(error, { code: 'CHART_YEAR', message: 'Nepavyko atnaujinti grafiko metų filtro' });
        console.error(errorInfo.log, error);
        showChartError(TEXT.charts?.errorLoading);
      });
  }

  function prepareChartDataForPeriod(period) {
    const normalized = Number.isFinite(Number(period))
      ? Math.max(0, Number(period))
      : 30;
    const settings = getSettings();
    const baseDaily = Array.isArray(dashboardState.chartData.baseDaily) && dashboardState.chartData.baseDaily.length
      ? dashboardState.chartData.baseDaily
      : dashboardState.dailyStats;
    const baseRecords = Array.isArray(dashboardState.chartData.baseRecords) && dashboardState.chartData.baseRecords.length
      ? dashboardState.chartData.baseRecords
      : dashboardState.rawRecords;
    const selectedYear = Number.isFinite(dashboardState.chartYear) ? Number(dashboardState.chartYear) : null;
    const yearScopedRecords = filterRecordsByYear(baseRecords, selectedYear);
    const sanitizedFilters = sanitizeChartFilters(dashboardState.chartFilters, { getDefaultChartFilters, KPI_FILTER_LABELS });
    dashboardState.chartFilters = { ...sanitizedFilters };
    const effectiveFilters = sanitizedFilters.compareGmp
      ? { ...sanitizedFilters, arrival: 'all' }
      : sanitizedFilters;
    const filteredRecords = filterRecordsByChartFilters(yearScopedRecords, effectiveFilters);
    const filteredDaily = computeDailyStats(filteredRecords, settings?.calculations, DEFAULT_SETTINGS);
    let scopedDaily = filteredDaily.slice();
    let scopedRecords = filteredRecords.slice();
    if (normalized > 0) {
      const windowKeys = buildDailyWindowKeys(filteredDaily, normalized);
      scopedDaily = windowKeys.length
        ? fillDailyStatsWindow(filteredDaily, windowKeys)
        : filterDailyStatsByWindow(filteredDaily, normalized);
      scopedRecords = filterRecordsByWindow(filteredRecords, normalized);
    }
    const fallbackDaily = filteredDaily.length
      ? filteredDaily
      : filterDailyStatsByYear(baseDaily, selectedYear);
    const funnelData = computeFunnelStats(scopedDaily, selectedYear, fallbackDaily);
    const heatmapData = computeArrivalHeatmap(scopedRecords);

    dashboardState.chartData.filteredRecords = filteredRecords;
    dashboardState.chartData.filteredDaily = filteredDaily;
    dashboardState.chartData.filteredWindowRecords = scopedRecords;
    dashboardState.chartData.dailyWindow = scopedDaily;
    dashboardState.chartData.funnel = funnelData;
    dashboardState.chartData.heatmap = heatmapData;
    updateChartFiltersSummary({ records: filteredRecords, daily: filteredDaily });

    return { daily: scopedDaily, funnel: funnelData, heatmap: heatmapData };
  }

  function handleChartFilterChange(event) {
    const target = event.target;
    if (!target || !('name' in target)) {
      return;
    }
    const { name, value } = target;
    const filters = { ...dashboardState.chartFilters };
    if (name === 'arrival' && value in KPI_FILTER_LABELS.arrival) {
      filters.arrival = value;
    } else if (name === 'disposition' && value in KPI_FILTER_LABELS.disposition) {
      filters.disposition = value;
    } else if (name === 'cardType' && value in KPI_FILTER_LABELS.cardType) {
      filters.cardType = value;
    } else if (name === 'compareGmp') {
      filters.compareGmp = Boolean(target.checked);
    }
    if (filters.compareGmp) {
      filters.arrival = 'all';
    }
    dashboardState.chartFilters = filters;
    void applyChartFilters();
  }

  function handleChartSegmentedClick(event) {
    const button = event.currentTarget;
    if (!(button instanceof HTMLElement)) {
      return;
    }
    if (button.disabled) {
      return;
    }
    const arrival = getDatasetValue(button, 'chartArrival');
    if (arrival && selectors.chartFilterArrival) {
      selectors.chartFilterArrival.value = arrival;
      selectors.chartFilterArrival.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const disposition = getDatasetValue(button, 'chartDisposition');
    if (disposition && selectors.chartFilterDisposition) {
      selectors.chartFilterDisposition.value = disposition;
      selectors.chartFilterDisposition.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const cardType = getDatasetValue(button, 'chartCardType');
    if (cardType && selectors.chartFilterCardType) {
      selectors.chartFilterCardType.value = cardType;
      selectors.chartFilterCardType.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  return {
    syncChartFilterControls,
    updateChartFiltersSummary,
    applyChartFilters,
    updateChartPeriod,
    updateChartYear,
    prepareChartDataForPeriod,
    handleChartFilterChange,
    handleChartSegmentedClick,
  };
}
