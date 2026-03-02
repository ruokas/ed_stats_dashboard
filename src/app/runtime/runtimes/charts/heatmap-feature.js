export function createChartsHeatmapFeature({
  selectors,
  dashboardState,
  TEXT,
  settings,
  KPI_FILTER_LABELS,
  oneDecimalFormatter,
  getMetricById,
  getMetricSurfaceMeta,
  getMetricLabelOverride,
  getEnabledHeatmapMetricKeys,
  getDefaultHeatmapMetric,
  sanitizeHeatmapFilters,
  getAvailableYearsFromDaily,
  resolveCachedHeatmapFilterData,
  filterRecordsByYear,
  filterRecordsByHeatmapFilters,
  computeArrivalHeatmap,
  getThemePalette,
  HEATMAP_HOURS,
  HEATMAP_WEEKDAY_FULL,
  HEATMAP_WEEKDAY_SHORT,
  persistChartsQuery,
  setDatasetValue,
  markChartsSectionVisible,
}) {
  const getHeatmapMetricDefinition = (metricKey) => {
    const key = typeof metricKey === 'string' ? metricKey.trim() : '';
    if (!key) {
      return null;
    }
    return getMetricById(key);
  };

  const getHeatmapMetricLabel = (metricKey) => {
    const definition = getHeatmapMetricDefinition(metricKey);
    const baseCatalogLabel = getMetricSurfaceMeta(definition, 'heatmap')?.label || definition?.label || '';
    const catalogLabel = getMetricLabelOverride(settings, metricKey, baseCatalogLabel);
    if (typeof catalogLabel === 'string' && catalogLabel.trim()) {
      return catalogLabel;
    }
    const options = TEXT.charts?.heatmapMetricOptions || {};
    if (typeof options[metricKey] === 'string' && options[metricKey].trim()) {
      return options[metricKey];
    }
    if (typeof metricKey === 'string' && metricKey.trim()) {
      return metricKey.trim();
    }
    const fallbackKey = getDefaultHeatmapMetric();
    return typeof options[fallbackKey] === 'string' ? options[fallbackKey] : 'Rodiklis';
  };

  const getHeatmapMetricUnit = (metricKey) => {
    const definition = getHeatmapMetricDefinition(metricKey);
    const catalogUnit = getMetricSurfaceMeta(definition, 'heatmap')?.unit || definition?.unit || '';
    if (typeof catalogUnit === 'string' && catalogUnit.trim()) {
      return catalogUnit;
    }
    const units = TEXT.charts?.heatmapMetricUnits || {};
    return typeof units[metricKey] === 'string' ? units[metricKey] : '';
  };

  const getHeatmapMetricDescription = (metricKey) => {
    const definition = getHeatmapMetricDefinition(metricKey);
    const catalogDescription =
      getMetricSurfaceMeta(definition, 'heatmap')?.description || definition?.description;
    if (typeof catalogDescription === 'string' && catalogDescription.trim()) {
      return catalogDescription;
    }
    const descriptions = TEXT.charts?.heatmapMetricDescriptions || {};
    return typeof descriptions[metricKey] === 'string' ? descriptions[metricKey] : '';
  };

  const hasHeatmapMetricData = (metric) => {
    if (!metric || typeof metric !== 'object') {
      return false;
    }
    if (metric.hasData) {
      return true;
    }
    const matrix = Array.isArray(metric.matrix) ? metric.matrix : [];
    return matrix.some(
      (row) => Array.isArray(row) && row.some((value) => Number.isFinite(value) && value > 0)
    );
  };

  const normalizeHeatmapMetricKey = (metricKey, metrics = {}) => {
    const enabledKeys = getEnabledHeatmapMetricKeys();
    const hasMetrics = metrics && typeof metrics === 'object' && Object.keys(metrics).length > 0;
    if (typeof metricKey === 'string' && enabledKeys.includes(metricKey)) {
      if (!hasMetrics || metrics[metricKey]) {
        return metricKey;
      }
    }
    if (hasMetrics) {
      const available = enabledKeys.find((key) => metrics[key]);
      if (available) {
        return available;
      }
    }
    if (typeof metricKey === 'string' && enabledKeys.includes(metricKey)) {
      return metricKey;
    }
    return getDefaultHeatmapMetric();
  };

  const formatHeatmapMetricValue = (value) => {
    if (!Number.isFinite(value)) {
      return '0,0';
    }
    return oneDecimalFormatter.format(value);
  };

  const computeHeatmapColor = (accentColor, intensity) => {
    const alpha = Math.min(0.85, Math.max(0.08, 0.08 + intensity * 0.75));
    const normalized = String(accentColor || '').trim();
    const hexMatch = /^#?([a-f\d]{6})$/i.exec(normalized);
    if (hexMatch) {
      const numeric = Number.parseInt(hexMatch[1], 16);
      const r = (numeric >> 16) & 255;
      const g = (numeric >> 8) & 255;
      const b = numeric & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
    }
    const rgbMatch = normalized.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbMatch) {
      const [, r, g, b] = rgbMatch;
      return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
    }
    return `rgba(37, 99, 235, ${alpha.toFixed(3)})`;
  };

  const updateHeatmapCaption = (metricKey) => {
    if (!selectors.heatmapCaption) {
      return;
    }
    const label = getHeatmapMetricLabel(metricKey);
    selectors.heatmapCaption.textContent =
      typeof TEXT.charts?.heatmapCaption === 'function'
        ? TEXT.charts.heatmapCaption(label)
        : TEXT.charts?.heatmapCaption || '';
  };

  const populateHeatmapMetricOptions = () => {
    if (!selectors.heatmapMetricSelect) {
      return;
    }
    selectors.heatmapMetricSelect.replaceChildren();
    getEnabledHeatmapMetricKeys().forEach((key) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = getHeatmapMetricLabel(key);
      selectors.heatmapMetricSelect.appendChild(option);
    });
    selectors.heatmapMetricSelect.value = normalizeHeatmapMetricKey(dashboardState.heatmapMetric);
  };

  const syncHeatmapFilterControls = () => {
    const filters = sanitizeHeatmapFilters(dashboardState.heatmapFilters);
    dashboardState.heatmapFilters = { ...filters };
    if (selectors.heatmapFilterArrival) {
      selectors.heatmapFilterArrival.value = filters.arrival;
    }
    if (selectors.heatmapFilterDisposition) {
      selectors.heatmapFilterDisposition.value = filters.disposition;
    }
    if (selectors.heatmapFilterCardType) {
      selectors.heatmapFilterCardType.value = filters.cardType;
    }
    if (selectors.heatmapYearSelect) {
      selectors.heatmapYearSelect.value = Number.isFinite(dashboardState.heatmapYear)
        ? String(dashboardState.heatmapYear)
        : 'all';
    }
  };

  const populateHeatmapYearOptions = (dailyStats) => {
    if (!selectors.heatmapYearSelect) {
      return;
    }
    const years = getAvailableYearsFromDaily(dailyStats);
    selectors.heatmapYearSelect.replaceChildren();
    const all = document.createElement('option');
    all.value = 'all';
    all.textContent = TEXT.charts?.heatmapYearAll || 'Visi metai';
    selectors.heatmapYearSelect.appendChild(all);
    years.forEach((year) => {
      const option = document.createElement('option');
      option.value = String(year);
      option.textContent = String(year);
      selectors.heatmapYearSelect.appendChild(option);
    });
    selectors.heatmapYearSelect.value = Number.isFinite(dashboardState.heatmapYear)
      ? String(dashboardState.heatmapYear)
      : 'all';
  };

  const computeHeatmapDataForFilters = () => {
    dashboardState.heatmapFilters = sanitizeHeatmapFilters(dashboardState.heatmapFilters);
    return resolveCachedHeatmapFilterData({
      chartData: dashboardState.chartData,
      rawRecords: dashboardState.rawRecords,
      heatmapYear: dashboardState.heatmapYear,
      heatmapFilters: dashboardState.heatmapFilters,
      filterRecordsByYearFn: filterRecordsByYear,
      filterRecordsByHeatmapFiltersFn: filterRecordsByHeatmapFilters,
      computeArrivalHeatmapFn: computeArrivalHeatmap,
    });
  };

  const renderArrivalHeatmap = (container, heatmapData, accentColor, metricKey) => {
    if (!container) return;
    container.replaceChildren();
    const metrics = heatmapData && typeof heatmapData === 'object' ? heatmapData.metrics || {} : {};
    let selectedMetric = normalizeHeatmapMetricKey(metricKey, metrics);
    if (!metrics[selectedMetric]) {
      selectedMetric = normalizeHeatmapMetricKey(getDefaultHeatmapMetric(), metrics);
    }
    if (selectors.heatmapMetricSelect) {
      selectors.heatmapMetricSelect.value = selectedMetric;
    }
    updateHeatmapCaption(selectedMetric);
    const metric = metrics[selectedMetric] || {};
    const countsMatrix = Array.isArray(metric.counts) ? metric.counts : [];
    const hasData = hasHeatmapMetricData(metric);
    const captionText = selectors.heatmapCaption?.textContent || '';
    const metricLabel = getHeatmapMetricLabel(selectedMetric);
    if (metricLabel && captionText) {
      container.setAttribute('aria-label', `${metricLabel}. ${captionText}`);
    } else {
      container.removeAttribute('aria-label');
    }
    setDatasetValue(container, 'metric', selectedMetric);
    if (!hasData) {
      const empty = document.createElement('p');
      empty.className = 'heatmap-empty';
      empty.textContent = TEXT.charts?.heatmapEmpty || 'Siuo metu nera duomenu.';
      container.appendChild(empty);
      return;
    }
    const table = document.createElement('table');
    table.className = 'heatmap-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.setAttribute('scope', 'col');
    corner.textContent = '';
    headerRow.appendChild(corner);
    HEATMAP_HOURS.forEach((label) => {
      const th = document.createElement('th');
      th.setAttribute('scope', 'col');
      th.textContent = label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    metric.matrix.forEach((rowValues, dayIdx) => {
      const tr = document.createElement('tr');
      const head = document.createElement('th');
      head.setAttribute('scope', 'row');
      head.textContent = HEATMAP_WEEKDAY_SHORT[dayIdx] || '';
      tr.appendChild(head);
      rowValues.forEach((value, hourIdx) => {
        const numericValue = Number.isFinite(value) ? value : 0;
        const td = document.createElement('td');
        const span = document.createElement('span');
        span.className = 'heatmap-cell';
        const intensity = metric.max > 0 ? numericValue / metric.max : 0;
        const color =
          intensity > 0 ? computeHeatmapColor(accentColor, intensity) : 'var(--color-surface-alt)';
        span.style.backgroundColor = color;
        span.style.color =
          intensity > 0.55 ? '#fff' : intensity > 0 ? 'var(--color-text)' : 'var(--color-text-muted)';
        const durationSamples = Array.isArray(countsMatrix?.[dayIdx]) ? countsMatrix[dayIdx][hourIdx] : 0;
        const hasCellData =
          selectedMetric === 'avgDuration'
            ? Number.isFinite(durationSamples) && durationSamples > 0
            : numericValue > 0;
        const formattedValue = formatHeatmapMetricValue(numericValue);
        span.textContent = hasCellData ? formattedValue : '';
        span.tabIndex = hasCellData ? 0 : -1;
        const descriptor = getHeatmapMetricDescription(selectedMetric);
        const tooltipValue = hasCellData ? formattedValue : formatHeatmapMetricValue(0);
        const tooltip = `${HEATMAP_WEEKDAY_FULL[dayIdx] || ''}, ${HEATMAP_HOURS[hourIdx]} – ${tooltipValue}${descriptor ? ` ${descriptor}` : ''}`;
        td.setAttribute('aria-label', tooltip);
        span.setAttribute('title', tooltip);
        td.appendChild(span);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    const legend = document.createElement('p');
    legend.className = 'heatmap-legend';
    const unit = getHeatmapMetricUnit(selectedMetric);
    const legendLabel = TEXT.charts?.heatmapMetricLabel || 'Rodiklis';
    const legendBase = TEXT.charts?.heatmapLegend || '';
    const metricInfo = `${legendLabel}: ${metricLabel}${unit ? ` (${unit})` : ''}.`;
    legend.textContent = legendBase ? `${metricInfo} ${legendBase}` : metricInfo;
    container.appendChild(legend);
  };

  const applyHeatmapFiltersAndRender = () => {
    markChartsSectionVisible('heatmap');
    const palette = getThemePalette();
    renderArrivalHeatmap(
      selectors.heatmapContainer,
      computeHeatmapDataForFilters(),
      palette.accent,
      dashboardState.heatmapMetric
    );
  };

  const handleHeatmapMetricChange = (event) => {
    markChartsSectionVisible('heatmap');
    dashboardState.heatmapMetric = normalizeHeatmapMetricKey(event?.target?.value);
    updateHeatmapCaption(dashboardState.heatmapMetric);
    persistChartsQuery();
    const palette = getThemePalette();
    const currentData = dashboardState.chartData?.heatmap || computeHeatmapDataForFilters();
    renderArrivalHeatmap(
      selectors.heatmapContainer,
      currentData,
      palette.accent,
      dashboardState.heatmapMetric
    );
  };

  const handleHeatmapFilterChange = (event) => {
    const target = event?.target;
    if (!target || !('name' in target)) {
      return;
    }
    const { name, value } = target;
    const filters = { ...dashboardState.heatmapFilters };
    if (name === 'heatmapArrival' && value in KPI_FILTER_LABELS.arrival) {
      filters.arrival = value;
    } else if (name === 'heatmapDisposition' && value in KPI_FILTER_LABELS.disposition) {
      filters.disposition = value;
    } else if (name === 'heatmapCardType' && value in KPI_FILTER_LABELS.cardType) {
      filters.cardType = value;
    } else if (name === 'heatmapYear') {
      dashboardState.heatmapYear = value === 'all' ? null : Number.parseInt(value, 10);
    }
    dashboardState.heatmapFilters = sanitizeHeatmapFilters(filters);
    syncHeatmapFilterControls();
    persistChartsQuery();
    applyHeatmapFiltersAndRender();
  };

  const isValidHeatmapData = (heatmapData) =>
    Boolean(
      heatmapData?.metrics &&
        getEnabledHeatmapMetricKeys().some((key) => Array.isArray(heatmapData.metrics[key]?.matrix))
    );

  return {
    updateHeatmapCaption,
    populateHeatmapMetricOptions,
    syncHeatmapFilterControls,
    populateHeatmapYearOptions,
    computeHeatmapDataForFilters,
    applyHeatmapFiltersAndRender,
    handleHeatmapMetricChange,
    handleHeatmapFilterChange,
    isValidHeatmapData,
    renderArrivalHeatmap,
  };
}
