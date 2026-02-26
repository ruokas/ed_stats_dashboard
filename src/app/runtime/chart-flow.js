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
  onFiltersStateChange = null,
}) {
  function ensureChartDerivedCache() {
    if (!dashboardState.chartData || typeof dashboardState.chartData !== 'object') {
      dashboardState.chartData = {};
    }
    const chartData = dashboardState.chartData;
    if (!chartData.cache || typeof chartData.cache !== 'object') {
      chartData.cache = {
        yearScoped: null,
        yearDaily: null,
        filteredRecords: null,
        filteredDaily: null,
        windowed: null,
        funnel: null,
        heatmap: null,
      };
    }
    return chartData.cache;
  }

  function buildChartFilterCacheKey(filters = {}) {
    return [
      String(filters.arrival || 'all'),
      String(filters.disposition || 'all'),
      String(filters.cardType || 'all'),
      filters.compareGmp ? '1' : '0',
    ].join('|');
  }

  function buildChartSettingsCacheKey(settings) {
    try {
      return JSON.stringify(settings?.calculations || {});
    } catch (_error) {
      return '';
    }
  }

  function invalidateChartDerivedCache(reason = 'all') {
    const cache = ensureChartDerivedCache();
    if (reason === 'period') {
      cache.windowed = null;
      cache.funnel = null;
      cache.heatmap = null;
      return;
    }
    if (reason === 'filters') {
      cache.filteredRecords = null;
      cache.filteredDaily = null;
      cache.windowed = null;
      cache.funnel = null;
      cache.heatmap = null;
      return;
    }
    if (reason === 'year') {
      cache.yearScoped = null;
      cache.yearDaily = null;
      cache.filteredRecords = null;
      cache.filteredDaily = null;
      cache.windowed = null;
      cache.funnel = null;
      cache.heatmap = null;
      return;
    }
    cache.yearScoped = null;
    cache.yearDaily = null;
    cache.filteredRecords = null;
    cache.filteredDaily = null;
    cache.windowed = null;
    cache.funnel = null;
    cache.heatmap = null;
  }

  function notifyFiltersStateChange() {
    if (typeof onFiltersStateChange !== 'function') {
      return;
    }
    onFiltersStateChange({
      chartPeriod: dashboardState.chartPeriod,
      chartYear: dashboardState.chartYear,
      chartFilters: { ...(dashboardState.chartFilters || {}) },
    });
  }

  function syncChartSegmentedButtons(compareActive = false) {
    const filters = sanitizeChartFilters(dashboardState.chartFilters, {
      getDefaultChartFilters,
      KPI_FILTER_LABELS,
    });
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
    if (
      Array.isArray(selectors.chartFilterDispositionButtons) &&
      selectors.chartFilterDispositionButtons.length
    ) {
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
    if (Array.isArray(selectors.chartFilterCompareButtons) && selectors.chartFilterCompareButtons.length) {
      selectors.chartFilterCompareButtons.forEach((button) => {
        const mode = String(getDatasetValue(button, 'chartCompareGmp', '') || '').trim();
        if (!mode) {
          return;
        }
        const isActive = mode === 'on' ? compareActive : !compareActive;
        button.setAttribute('aria-pressed', String(isActive));
      });
    }
  }

  function syncChartFilterControls() {
    const filters = sanitizeChartFilters(dashboardState.chartFilters, {
      getDefaultChartFilters,
      KPI_FILTER_LABELS,
    });
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
    const filters = sanitizeChartFilters(dashboardState.chartFilters, {
      getDefaultChartFilters,
      KPI_FILTER_LABELS,
    });
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
    const previousSanitized = sanitizeChartFilters(dashboardState.chartFilters, {
      getDefaultChartFilters,
      KPI_FILTER_LABELS,
    });
    const previousFilterKey = buildChartFilterCacheKey(previousSanitized);
    const sanitized = sanitizeChartFilters(dashboardState.chartFilters, {
      getDefaultChartFilters,
      KPI_FILTER_LABELS,
    });
    dashboardState.chartFilters = { ...sanitized };
    if (buildChartFilterCacheKey(sanitized) !== previousFilterKey) {
      invalidateChartDerivedCache('filters');
    }
    notifyFiltersStateChange();
    syncChartFilterControls();
    const hasBaseData =
      (Array.isArray(dashboardState.chartData.baseDaily) && dashboardState.chartData.baseDaily.length) ||
      (Array.isArray(dashboardState.dailyStats) && dashboardState.dailyStats.length);
    if (!hasBaseData) {
      updateChartFiltersSummary({ records: [], daily: [] });
      if (selectors.dailyCaptionContext) {
        selectors.dailyCaptionContext.textContent = '';
      }
      return Promise.resolve();
    }
    const scoped = prepareChartDataForPeriod(dashboardState.chartPeriod);
    return renderCharts(scoped.daily, scoped.funnel, scoped.heatmap).catch((error) => {
      const errorInfo = describeError(error, {
        code: 'CHART_FILTERS',
        message: 'Nepavyko pritaikyti grafiko filtrų',
      });
      console.error(errorInfo.log, error);
      showChartError(TEXT.charts?.errorLoading);
    });
  }

  function updateChartPeriod(period) {
    const previousPeriod = Number.isFinite(Number(dashboardState.chartPeriod))
      ? Math.max(0, Number(dashboardState.chartPeriod))
      : 30;
    const rawValue = String(period);
    const isAll = rawValue === 'all';
    const numeric = Number.parseInt(rawValue, 10);
    if (!isAll && (!Number.isFinite(numeric) || numeric < 0)) {
      return;
    }
    dashboardState.chartPeriod = isAll ? 0 : numeric;
    if (dashboardState.chartPeriod !== previousPeriod) {
      invalidateChartDerivedCache('period');
    }
    notifyFiltersStateChange();
    syncChartPeriodButtons(dashboardState.chartPeriod);
    if (selectors.dailyCaption) {
      selectors.dailyCaption.textContent = formatDailyCaption(dashboardState.chartPeriod);
    }
    const hasBaseData =
      (Array.isArray(dashboardState.chartData.baseDaily) && dashboardState.chartData.baseDaily.length) ||
      (Array.isArray(dashboardState.dailyStats) && dashboardState.dailyStats.length);
    if (!hasBaseData) {
      updateDailyPeriodSummary([]);
      if (selectors.dailyCaptionContext) {
        selectors.dailyCaptionContext.textContent = '';
      }
      updateChartFiltersSummary({ records: [], daily: [] });
      return;
    }
    const scoped = prepareChartDataForPeriod(dashboardState.chartPeriod);
    renderCharts(scoped.daily, scoped.funnel, scoped.heatmap).catch((error) => {
      const errorInfo = describeError(error, {
        code: 'CHART_PERIOD',
        message: 'Nepavyko atnaujinti grafiko laikotarpio',
      });
      console.error(errorInfo.log, error);
      showChartError(TEXT.charts?.errorLoading);
    });
  }

  function updateChartYear(year) {
    const previousYear = Number.isFinite(dashboardState.chartYear) ? Number(dashboardState.chartYear) : null;
    const numeric = Number.isFinite(year) ? Math.trunc(year) : Number.parseInt(String(year), 10);
    const normalized = Number.isFinite(numeric) ? numeric : null;
    dashboardState.chartYear = normalized;
    if (normalized !== previousYear) {
      invalidateChartDerivedCache('year');
    }
    notifyFiltersStateChange();
    syncChartYearControl();
    if (normalized != null) {
      dashboardState.chartPeriod = 0;
      syncChartPeriodButtons(dashboardState.chartPeriod);
    }
    if (selectors.dailyCaption) {
      selectors.dailyCaption.textContent = formatDailyCaption(dashboardState.chartPeriod);
    }
    const hasBaseData =
      (Array.isArray(dashboardState.chartData.baseDaily) && dashboardState.chartData.baseDaily.length) ||
      (Array.isArray(dashboardState.dailyStats) && dashboardState.dailyStats.length);
    if (!hasBaseData) {
      updateDailyPeriodSummary([]);
      if (selectors.dailyCaptionContext) {
        selectors.dailyCaptionContext.textContent = '';
      }
      updateChartFiltersSummary({ records: [], daily: [] });
      return;
    }
    const scoped = prepareChartDataForPeriod(dashboardState.chartPeriod);
    renderCharts(scoped.daily, scoped.funnel, scoped.heatmap).catch((error) => {
      const errorInfo = describeError(error, {
        code: 'CHART_YEAR',
        message: 'Nepavyko atnaujinti grafiko metų filtro',
      });
      console.error(errorInfo.log, error);
      showChartError(TEXT.charts?.errorLoading);
    });
  }

  function prepareChartDataForPeriod(period) {
    const normalized = Number.isFinite(Number(period)) ? Math.max(0, Number(period)) : 30;
    const settings = getSettings();
    const cache = ensureChartDerivedCache();
    const baseDaily =
      Array.isArray(dashboardState.chartData.baseDaily) && dashboardState.chartData.baseDaily.length
        ? dashboardState.chartData.baseDaily
        : dashboardState.dailyStats;
    const baseRecords =
      Array.isArray(dashboardState.chartData.baseRecords) && dashboardState.chartData.baseRecords.length
        ? dashboardState.chartData.baseRecords
        : dashboardState.rawRecords;
    const selectedYear = Number.isFinite(dashboardState.chartYear) ? Number(dashboardState.chartYear) : null;
    const isYearMode = Number.isFinite(selectedYear);
    const sanitizedFilters = sanitizeChartFilters(dashboardState.chartFilters, {
      getDefaultChartFilters,
      KPI_FILTER_LABELS,
    });
    dashboardState.chartFilters = { ...sanitizedFilters };
    const effectiveFilters = sanitizedFilters.compareGmp
      ? { ...sanitizedFilters, arrival: 'all' }
      : sanitizedFilters;
    const yearKey = selectedYear == null ? 'all' : String(selectedYear);
    const filtersKey = buildChartFilterCacheKey(effectiveFilters);
    const settingsKey = buildChartSettingsCacheKey(settings);

    const yearScopedStageKey = `${yearKey}`;
    let yearScopedRecords;
    if (
      cache.yearScoped &&
      cache.yearScoped.baseRecordsRef === baseRecords &&
      cache.yearScoped.key === yearScopedStageKey
    ) {
      yearScopedRecords = cache.yearScoped.records;
    } else {
      yearScopedRecords = filterRecordsByYear(baseRecords, selectedYear);
      cache.yearScoped = {
        baseRecordsRef: baseRecords,
        key: yearScopedStageKey,
        records: yearScopedRecords,
      };
    }

    const yearDailyStageKey = yearKey;
    let fallbackDaily;
    if (
      cache.yearDaily &&
      cache.yearDaily.baseDailyRef === baseDaily &&
      cache.yearDaily.key === yearDailyStageKey
    ) {
      fallbackDaily = cache.yearDaily.value;
    } else {
      fallbackDaily = filterDailyStatsByYear(baseDaily, selectedYear);
      cache.yearDaily = {
        baseDailyRef: baseDaily,
        key: yearDailyStageKey,
        value: fallbackDaily,
      };
    }

    const filteredRecordsStageKey = [yearKey, filtersKey].join('|');
    let filteredRecords;
    if (
      cache.filteredRecords &&
      cache.filteredRecords.baseRecordsRef === baseRecords &&
      cache.filteredRecords.yearScopedRef === yearScopedRecords &&
      cache.filteredRecords.key === filteredRecordsStageKey
    ) {
      filteredRecords = cache.filteredRecords.value;
    } else {
      filteredRecords = filterRecordsByChartFilters(yearScopedRecords, effectiveFilters);
      cache.filteredRecords = {
        baseRecordsRef: baseRecords,
        yearScopedRef: yearScopedRecords,
        key: filteredRecordsStageKey,
        value: filteredRecords,
      };
    }

    const filteredDailyStageKey = [filteredRecordsStageKey, settingsKey].join('|');
    let filteredDailyFromRecords;
    if (
      cache.filteredDaily &&
      cache.filteredDaily.filteredRecordsRef === filteredRecords &&
      cache.filteredDaily.key === filteredDailyStageKey
    ) {
      filteredDailyFromRecords = cache.filteredDaily.value;
    } else {
      filteredDailyFromRecords = computeDailyStats(filteredRecords, settings?.calculations, DEFAULT_SETTINGS);
      cache.filteredDaily = {
        filteredRecordsRef: filteredRecords,
        key: filteredDailyStageKey,
        value: filteredDailyFromRecords,
      };
    }

    const hasActivePatientFilters =
      sanitizedFilters.compareGmp === true ||
      sanitizedFilters.arrival !== 'all' ||
      sanitizedFilters.disposition !== 'all' ||
      sanitizedFilters.cardType !== 'all';
    const needsWindowScopedRecords =
      sanitizedFilters.compareGmp === true ||
      dashboardState?.chartsSectionRenderFlags?.heatmapVisible === true ||
      dashboardState?.chartsSectionRenderFlags?.hourlyVisible === true;
    const filteredDaily = isYearMode
      ? hasActivePatientFilters
        ? filteredDailyFromRecords
        : fallbackDaily.length
          ? fallbackDaily
          : filteredDailyFromRecords
      : filteredDailyFromRecords.length || hasActivePatientFilters
        ? filteredDailyFromRecords
        : fallbackDaily;
    const windowedStageKey = [
      filteredRecordsStageKey,
      settingsKey,
      String(normalized),
      isYearMode ? 'year' : 'window',
    ].join('|');
    let scopedDaily;
    let scopedRecords;
    if (
      cache.windowed &&
      cache.windowed.filteredRecordsRef === filteredRecords &&
      cache.windowed.filteredDailyRef === filteredDaily &&
      cache.windowed.key === windowedStageKey
    ) {
      scopedDaily = cache.windowed.scopedDaily;
      scopedRecords =
        Array.isArray(cache.windowed.scopedRecords) || cache.windowed.scopedRecords === null
          ? cache.windowed.scopedRecords
          : null;
      if (needsWindowScopedRecords && !Array.isArray(scopedRecords)) {
        scopedRecords =
          normalized > 0 && !isYearMode
            ? filterRecordsByWindow(filteredRecords, normalized)
            : filteredRecords.slice();
        cache.windowed.scopedRecords = scopedRecords;
      }
    } else {
      scopedDaily = filteredDaily.slice();
      scopedRecords = null;
      if (normalized > 0 && !isYearMode) {
        const windowKeys = buildDailyWindowKeys(filteredDaily, normalized);
        scopedDaily = windowKeys.length
          ? fillDailyStatsWindow(filteredDaily, windowKeys)
          : filterDailyStatsByWindow(filteredDaily, normalized);
        if (!scopedDaily.length && Array.isArray(filteredDaily) && filteredDaily.length) {
          scopedDaily = filteredDaily.slice(-normalized);
        }
        if (needsWindowScopedRecords) {
          scopedRecords = filterRecordsByWindow(filteredRecords, normalized);
        }
      } else if (needsWindowScopedRecords) {
        scopedRecords = filteredRecords.slice();
      }
      cache.windowed = {
        filteredRecordsRef: filteredRecords,
        filteredDailyRef: filteredDaily,
        key: windowedStageKey,
        scopedDaily,
        scopedRecords,
      };
    }

    const funnelStageKey = [windowedStageKey, yearKey].join('|');
    let funnelData;
    if (
      cache.funnel &&
      cache.funnel.scopedDailyRef === scopedDaily &&
      cache.funnel.fallbackDailyRef === fallbackDaily &&
      cache.funnel.key === funnelStageKey
    ) {
      funnelData = cache.funnel.value;
    } else {
      funnelData = computeFunnelStats(scopedDaily, selectedYear, fallbackDaily);
      cache.funnel = {
        scopedDailyRef: scopedDaily,
        fallbackDailyRef: fallbackDaily,
        key: funnelStageKey,
        value: funnelData,
      };
    }

    const shouldComputeHeatmap =
      dashboardState?.chartsSectionRenderFlags?.heatmapVisible === true ||
      (cache.heatmap && cache.heatmap.scopedRecordsRef === scopedRecords);
    let heatmapData = null;
    if (shouldComputeHeatmap) {
      if (cache.heatmap && cache.heatmap.scopedRecordsRef === scopedRecords) {
        heatmapData = cache.heatmap.value;
      } else {
        heatmapData = computeArrivalHeatmap(scopedRecords);
        cache.heatmap = {
          scopedRecordsRef: scopedRecords,
          value: heatmapData,
        };
      }
    }

    dashboardState.chartData.filteredRecords = filteredRecords;
    dashboardState.chartData.filteredDaily = filteredDaily;
    dashboardState.chartData.filteredWindowRecords = scopedRecords;
    if (!Array.isArray(dashboardState.chartData.filteredWindowRecords)) {
      dashboardState.chartData.filteredWindowRecords = [];
    }
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
    notifyFiltersStateChange();
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
      return;
    }
    const compareMode = String(getDatasetValue(button, 'chartCompareGmp', '') || '').trim();
    if (compareMode && selectors.chartFilterCompareGmp) {
      selectors.chartFilterCompareGmp.checked = compareMode === 'on';
      selectors.chartFilterCompareGmp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  return {
    buildChartFilterCacheKey,
    buildChartSettingsCacheKey,
    invalidateChartDerivedCache,
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
