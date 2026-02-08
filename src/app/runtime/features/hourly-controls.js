export function createHourlyControlsFeature(deps) {
  const {
    selectors,
    dashboardState,
    TEXT,
    settings,
    DEFAULT_SETTINGS,
    getDatasetValue,
    sanitizeChartFilters,
    getDefaultChartFilters,
    KPI_FILTER_LABELS,
    filterRecordsByYear,
    filterRecordsByChartFilters,
    filterRecordsByWindow,
    getAvailableYearsFromDaily,
    textCollator,
    formatLocalDateKey,
    describeError,
    showChartError,
    getChartRenderers,
    HOURLY_WEEKDAY_ALL,
    HOURLY_STAY_BUCKET_ALL,
    HOURLY_METRIC_ARRIVALS,
    HOURLY_METRIC_DISCHARGES,
    HOURLY_METRIC_BALANCE,
    HOURLY_METRIC_HOSPITALIZED,
    HOURLY_METRICS,
    HOURLY_COMPARE_SERIES_ALL,
    HOURLY_COMPARE_SERIES_EMS,
    HOURLY_COMPARE_SERIES_SELF,
    HOURLY_COMPARE_SERIES,
    HOURLY_STAY_BUCKETS,
    HEATMAP_WEEKDAY_FULL,
  } = deps;

  function normalizeHourlyWeekday(value) {
    if (value === HOURLY_WEEKDAY_ALL) {
      return HOURLY_WEEKDAY_ALL;
    }
    const numeric = Number.parseInt(String(value), 10);
    if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 6) {
      return numeric;
    }
    return HOURLY_WEEKDAY_ALL;
  }

  function getHourlyWeekdayLabel(value) {
    const normalized = normalizeHourlyWeekday(value);
    if (normalized === HOURLY_WEEKDAY_ALL) {
      return TEXT.charts?.hourlyWeekdayAll || 'Visos dienos';
    }
    return HEATMAP_WEEKDAY_FULL[normalized] || '';
  }

  function normalizeHourlyMetric(value) {
    const normalized = typeof value === 'string' ? value : String(value ?? '');
    if (HOURLY_METRICS.includes(normalized)) {
      return normalized;
    }
    return HOURLY_METRIC_ARRIVALS;
  }

  function getHourlyMetricLabel(value) {
    const normalized = normalizeHourlyMetric(value);
    const options = TEXT.charts?.hourlyMetricOptions || {};
    return typeof options[normalized] === 'string' && options[normalized].trim()
      ? options[normalized]
      : normalized;
  }

  function normalizeHourlyDepartment(value) {
    if (!value || String(value).trim().length === 0) {
      return 'all';
    }
    const raw = String(value).trim();
    const allLabel = TEXT.charts?.hourlyDepartmentAll || 'Visi skyriai';
    if (raw === 'all' || raw === allLabel) {
      return 'all';
    }
    return raw;
  }

  function isKnownHourlyDepartment(value) {
    if (!value || value === 'all') {
      return false;
    }
    const options = Array.isArray(dashboardState.hourlyDepartmentOptions)
      ? dashboardState.hourlyDepartmentOptions
      : [];
    return options.includes(value);
  }

  function applyHourlyYAxisAuto(chartInstance) {
    const chart = chartInstance || dashboardState.charts?.hourly;
    if (chart?.options?.scales?.y) {
      chart.options.scales.y.max = undefined;
      chart.options.scales.y.suggestedMax = dashboardState.hourlyYAxisSuggestedMax ?? undefined;
      chart.options.scales.y.suggestedMin = dashboardState.hourlyYAxisSuggestedMin ?? undefined;
    }
  }

  function normalizeHourlyStayBucket(value) {
    if (value === HOURLY_STAY_BUCKET_ALL) {
      return HOURLY_STAY_BUCKET_ALL;
    }
    const candidate = String(value);
    if (HOURLY_STAY_BUCKETS.some((bucket) => bucket.key === candidate)) {
      return candidate;
    }
    return HOURLY_STAY_BUCKET_ALL;
  }

  function getHourlyStayLabel(value) {
    const normalized = normalizeHourlyStayBucket(value);
    if (normalized === HOURLY_STAY_BUCKET_ALL) {
      return TEXT.charts?.hourlyStayAll || 'Visi laikai';
    }
    const labels = TEXT.charts?.hourlyStayBuckets || {};
    if (typeof labels[normalized] === 'string' && labels[normalized].trim()) {
      return labels[normalized];
    }
    const bucket = HOURLY_STAY_BUCKETS.find((item) => item.key === normalized);
    if (!bucket) {
      return '';
    }
    if (Number.isFinite(bucket.max)) {
      return `${bucket.min}–${bucket.max} val.`;
    }
    return `>${bucket.min} val.`;
  }

  function normalizeHourlyCompareYears(valueA, valueB) {
    const raw = [valueA, valueB]
      .map((value) => {
        if (value == null) {
          return null;
        }
        const trimmed = String(value).trim();
        if (!trimmed || trimmed === 'none') {
          return null;
        }
        const parsed = Number.parseInt(trimmed, 10);
        return Number.isFinite(parsed) ? parsed : null;
      })
      .filter((year) => Number.isFinite(year));
    const unique = Array.from(new Set(raw));
    return unique.slice(0, 2);
  }

  function buildHourlyCompareLabel() {
    const years = normalizeHourlyCompareYears(
      dashboardState.hourlyCompareYears?.[0],
      dashboardState.hourlyCompareYears?.[1],
    );
    if (!dashboardState.hourlyCompareEnabled || !years.length) {
      return '';
    }
    const seriesLabel = dashboardState.hourlyCompareSeries === HOURLY_COMPARE_SERIES_EMS
      ? 'GMP'
      : dashboardState.hourlyCompareSeries === HOURLY_COMPARE_SERIES_SELF
        ? 'Ne GMP'
        : '';
    const seriesSuffix = seriesLabel ? `, ${seriesLabel}` : '';
    return `Palyginimas: ${years.join(', ')} m.${seriesSuffix}`;
  }

  function buildHourlyCaptionLabel(weekdayValue, stayBucket, metricValue, departmentValue) {
    const parts = [];
    const metricLabel = getHourlyMetricLabel(metricValue);
    if (metricLabel) {
      parts.push(metricLabel);
    }
    const normalizedWeekday = normalizeHourlyWeekday(weekdayValue);
    const normalizedStay = normalizeHourlyStayBucket(stayBucket);
    if (normalizedWeekday !== HOURLY_WEEKDAY_ALL) {
      const weekdayLabel = getHourlyWeekdayLabel(normalizedWeekday);
      if (weekdayLabel) {
        parts.push(weekdayLabel);
      }
    }
    if (normalizedStay !== HOURLY_STAY_BUCKET_ALL) {
      const stayLabel = getHourlyStayLabel(normalizedStay);
      if (stayLabel) {
        parts.push(stayLabel);
      }
    }
    const normalizedMetric = normalizeHourlyMetric(metricValue);
    const normalizedDepartment = normalizeHourlyDepartment(departmentValue);
    if (normalizedMetric === HOURLY_METRIC_HOSPITALIZED && normalizedDepartment !== 'all') {
      parts.push(`Skyrius: ${normalizedDepartment}`);
    }
    const compareLabel = buildHourlyCompareLabel();
    if (compareLabel) {
      parts.push(compareLabel);
    }
    return parts.join(' • ');
  }

  function updateHourlyCaption(weekdayValue, stayBucket, metricValue, departmentValue) {
    if (!selectors.hourlyCaption) {
      return;
    }
    const label = buildHourlyCaptionLabel(weekdayValue, stayBucket, metricValue, departmentValue);
    const captionText = typeof TEXT.charts?.hourlyCaption === 'function'
      ? TEXT.charts.hourlyCaption(label)
      : (TEXT.charts?.hourlyCaption || 'Vidutinis pacientų skaičius per valandą.');
    selectors.hourlyCaption.textContent = captionText;
  }

  function populateHourlyWeekdayOptions() {
    if (!selectors.hourlyWeekdaySelect) {
      return;
    }
    const select = selectors.hourlyWeekdaySelect;
    select.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = HOURLY_WEEKDAY_ALL;
    allOption.textContent = TEXT.charts?.hourlyWeekdayAll || 'Visos dienos';
    select.appendChild(allOption);
    HEATMAP_WEEKDAY_FULL.forEach((label, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = label;
      select.appendChild(option);
    });
    const current = normalizeHourlyWeekday(dashboardState.hourlyWeekday);
    select.value = String(current);
  }

  function syncHourlyMetricButtons() {
    if (!Array.isArray(selectors.hourlyMetricButtons) || !selectors.hourlyMetricButtons.length) {
      return;
    }
    const current = normalizeHourlyMetric(dashboardState.hourlyMetric);
    selectors.hourlyMetricButtons.forEach((button) => {
      const metric = getDatasetValue(button, 'hourlyMetric');
      if (!metric) {
        return;
      }
      const isActive = metric === current;
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  function populateHourlyStayOptions() {
    if (!selectors.hourlyStaySelect) {
      return;
    }
    const select = selectors.hourlyStaySelect;
    select.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = HOURLY_STAY_BUCKET_ALL;
    allOption.textContent = TEXT.charts?.hourlyStayAll || 'Visi laikai';
    select.appendChild(allOption);
    const labels = TEXT.charts?.hourlyStayBuckets || {};
    HOURLY_STAY_BUCKETS.forEach((bucket) => {
      const option = document.createElement('option');
      option.value = bucket.key;
      option.textContent = (typeof labels[bucket.key] === 'string' && labels[bucket.key].trim())
        ? labels[bucket.key]
        : getHourlyStayLabel(bucket.key);
      select.appendChild(option);
    });
    const current = normalizeHourlyStayBucket(dashboardState.hourlyStayBucket);
    select.value = String(current);
  }

  function getRecordDepartment(record) {
    const direct = record?.department;
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim();
    }
    const candidateKey = settings?.csv?.department || DEFAULT_SETTINGS.csv.department;
    if (candidateKey && record && typeof record === 'object' && candidateKey in record) {
      const raw = record[candidateKey];
      if (typeof raw === 'string' && raw.trim()) {
        return raw.trim();
      }
    }
    return '';
  }

  function updateHourlyDepartmentOptions(records) {
    if (!selectors.hourlyDepartmentInput) {
      return;
    }
    const departments = new Set();
    (Array.isArray(records) ? records : []).forEach((record) => {
      if (!record?.hospitalized) {
        return;
      }
      const label = getRecordDepartment(record);
      if (label) {
        departments.add(label);
      }
    });
    const sorted = Array.from(departments).sort((a, b) => textCollator.compare(a, b));
    const previous = Array.isArray(dashboardState.hourlyDepartmentOptions)
      ? dashboardState.hourlyDepartmentOptions
      : [];
    const isSame = previous.length === sorted.length
      && previous.every((value, index) => value === sorted[index]);
    if (isSame) {
      return;
    }
    dashboardState.hourlyDepartmentOptions = sorted.slice();
    const current = normalizeHourlyDepartment(dashboardState.hourlyDepartment);
    if (current === 'all') {
      selectors.hourlyDepartmentInput.value = '';
      return;
    }
    if (sorted.includes(current)) {
      selectors.hourlyDepartmentInput.value = current;
    }
  }

  function setHourlyDepartmentSuggestions(items) {
    const container = selectors.hourlyDepartmentSuggestions;
    if (!container) {
      return;
    }
    container.replaceChildren();
    const hasItems = Array.isArray(items) && items.length > 0;
    if (!hasItems) {
      container.setAttribute('hidden', 'hidden');
      if (selectors.hourlyDepartmentInput) {
        selectors.hourlyDepartmentInput.setAttribute('aria-expanded', 'false');
      }
      if (selectors.hourlyDepartmentToggle) {
        selectors.hourlyDepartmentToggle.setAttribute('aria-expanded', 'false');
      }
      dashboardState.hourlyDepartmentSuggestIndex = -1;
      return;
    }
    items.forEach((item, index) => {
      const option = document.createElement('div');
      option.className = 'hourly-suggestions__item';
      option.setAttribute('role', 'option');
      option.setAttribute('data-index', String(index));
      option.setAttribute('aria-selected', index === dashboardState.hourlyDepartmentSuggestIndex ? 'true' : 'false');
      option.textContent = item;
      container.appendChild(option);
    });
    container.removeAttribute('hidden');
    if (selectors.hourlyDepartmentInput) {
      selectors.hourlyDepartmentInput.setAttribute('aria-expanded', 'true');
    }
    if (selectors.hourlyDepartmentToggle) {
      selectors.hourlyDepartmentToggle.setAttribute('aria-expanded', 'true');
    }
  }

  function updateHourlyDepartmentSuggestions(query, { force } = {}) {
    const options = Array.isArray(dashboardState.hourlyDepartmentOptions)
      ? dashboardState.hourlyDepartmentOptions
      : [];
    const normalizedQuery = String(query ?? '').trim().toLowerCase();
    if (!normalizedQuery && !force) {
      setHourlyDepartmentSuggestions([]);
      return;
    }
    const filtered = normalizedQuery
      ? options.filter((item) => item.toLowerCase().includes(normalizedQuery))
      : options.slice();
    const limited = filtered.slice(0, 24);
    if (!limited.length) {
      setHourlyDepartmentSuggestions([]);
      return;
    }
    if (dashboardState.hourlyDepartmentSuggestIndex >= limited.length) {
      dashboardState.hourlyDepartmentSuggestIndex = -1;
    }
    setHourlyDepartmentSuggestions(limited);
  }

  function syncHourlyDepartmentVisibility(metricValue) {
    if (!selectors.hourlyDepartmentInput) {
      return;
    }
    const normalizedMetric = normalizeHourlyMetric(metricValue);
    const shouldShow = normalizedMetric === HOURLY_METRIC_HOSPITALIZED;
    const field = selectors.hourlyDepartmentInput.closest('.heatmap-toolbar__field');
    if (field) {
      if (shouldShow) {
        field.removeAttribute('hidden');
      } else {
        field.setAttribute('hidden', 'hidden');
      }
    }
    selectors.hourlyDepartmentInput.disabled = !shouldShow;
    if (selectors.hourlyDepartmentToggle) {
      selectors.hourlyDepartmentToggle.disabled = !shouldShow;
    }
    const wrapper = selectors.hourlyDepartmentInput.closest('.hourly-department');
    if (wrapper) {
      wrapper.classList.toggle('is-disabled', !shouldShow);
    }
  }

  function matchesHourlyStayBucket(record, bucketKey) {
    const normalized = normalizeHourlyStayBucket(bucketKey);
    if (normalized === HOURLY_STAY_BUCKET_ALL) {
      return true;
    }
    let hours = null;
    const losMinutes = record?.losMinutes;
    if (Number.isFinite(losMinutes) && losMinutes >= 0) {
      hours = losMinutes / 60;
    } else if (record?.arrival instanceof Date && record?.discharge instanceof Date) {
      const diffMs = record.discharge.getTime() - record.arrival.getTime();
      if (Number.isFinite(diffMs) && diffMs >= 0) {
        hours = diffMs / 3600000;
      }
    }
    if (!Number.isFinite(hours) || hours < 0) {
      return false;
    }
    const bucket = HOURLY_STAY_BUCKETS.find((item) => item.key === normalized);
    if (!bucket) {
      return true;
    }
    if (Number.isFinite(bucket.max)) {
      return hours >= bucket.min && hours < bucket.max;
    }
    return hours >= bucket.min;
  }

  function matchesHourlyMetric(record, metricValue, departmentValue) {
    const metric = normalizeHourlyMetric(metricValue);
    if (metric === HOURLY_METRIC_ARRIVALS || metric === HOURLY_METRIC_DISCHARGES || metric === HOURLY_METRIC_BALANCE) {
      return true;
    }
    if (!record?.hospitalized) {
      return false;
    }
    const normalizedDepartment = normalizeHourlyDepartment(departmentValue);
    if (normalizedDepartment === 'all') {
      return true;
    }
    if (!isKnownHourlyDepartment(normalizedDepartment)) {
      return true;
    }
    const department = getRecordDepartment(record);
    return department === normalizedDepartment;
  }

  function computeHourlySeries(records, weekdayValue, stayBucket, metricValue, departmentValue) {
    const totals = {
      all: Array(24).fill(0),
      ems: Array(24).fill(0),
      self: Array(24).fill(0),
    };
    const outflowTotals = {
      all: Array(24).fill(0),
      ems: Array(24).fill(0),
      self: Array(24).fill(0),
    };
    const weekdayDays = Array.from({ length: 7 }, () => new Set());
    const allDays = new Set();
    const metric = normalizeHourlyMetric(metricValue);
    (Array.isArray(records) ? records : []).forEach((entry) => {
      const arrival = entry?.arrival instanceof Date && !Number.isNaN(entry.arrival.getTime()) ? entry.arrival : null;
      const discharge = entry?.discharge instanceof Date && !Number.isNaN(entry.discharge.getTime()) ? entry.discharge : null;
      const arrivalHasTime = entry?.arrivalHasTime === true
        || (entry?.arrivalHasTime == null && arrival && (arrival.getHours() || arrival.getMinutes() || arrival.getSeconds()));
      const dischargeHasTime = entry?.dischargeHasTime === true
        || (entry?.dischargeHasTime == null && discharge && (discharge.getHours() || discharge.getMinutes() || discharge.getSeconds()));
      const normalizedWeekday = normalizeHourlyWeekday(weekdayValue);
      if (!matchesHourlyStayBucket(entry, stayBucket)) {
        return;
      }
      if (!matchesHourlyMetric(entry, metricValue, departmentValue)) {
        return;
      }

      const addDay = (reference) => {
        const rawDay = reference.getDay();
        const dayIndex = (rawDay + 6) % 7;
        const dateKey = formatLocalDateKey(reference);
        if (dateKey) {
          weekdayDays[dayIndex].add(dateKey);
          allDays.add(dateKey);
        }
        return dayIndex;
      };

      if (metric === HOURLY_METRIC_BALANCE) {
        if (arrival && arrivalHasTime) {
          const dayIndex = addDay(arrival);
          const hour = arrival.getHours();
          if (hour < 0 || hour > 23) {
            return;
          }
          if (normalizedWeekday === HOURLY_WEEKDAY_ALL || normalizedWeekday === dayIndex) {
            totals.all[hour] += 1;
            if (entry.ems) {
              totals.ems[hour] += 1;
            } else {
              totals.self[hour] += 1;
            }
          }
        }
        if (discharge && dischargeHasTime) {
          const dayIndex = addDay(discharge);
          const hour = discharge.getHours();
          if (hour < 0 || hour > 23) {
            return;
          }
          if (normalizedWeekday === HOURLY_WEEKDAY_ALL || normalizedWeekday === dayIndex) {
            outflowTotals.all[hour] += 1;
            if (entry.ems) {
              outflowTotals.ems[hour] += 1;
            } else {
              outflowTotals.self[hour] += 1;
            }
          }
        }
        return;
      }

      const reference = metric === HOURLY_METRIC_ARRIVALS ? arrival : discharge;
      const hasTime = metric === HOURLY_METRIC_ARRIVALS ? arrivalHasTime : dischargeHasTime;
      if (!(reference instanceof Date) || !hasTime) {
        return;
      }
      const hour = reference.getHours();
      if (hour < 0 || hour > 23) {
        return;
      }
      const dayIndex = addDay(reference);
      if (normalizedWeekday === HOURLY_WEEKDAY_ALL || normalizedWeekday === dayIndex) {
        totals.all[hour] += 1;
        if (entry.ems) {
          totals.ems[hour] += 1;
        } else {
          totals.self[hour] += 1;
        }
      }
    });

    const normalizedWeekday = normalizeHourlyWeekday(weekdayValue);
    const divisor = normalizedWeekday === HOURLY_WEEKDAY_ALL
      ? Math.max(1, allDays.size)
      : Math.max(1, weekdayDays[normalizedWeekday]?.size || 0);

    const toAverage = (series) => series.map((value) => value / divisor);
    const netTotals = metric === HOURLY_METRIC_BALANCE
      ? {
          all: totals.all.map((value, index) => value - outflowTotals.all[index]),
          ems: totals.ems.map((value, index) => value - outflowTotals.ems[index]),
          self: totals.self.map((value, index) => value - outflowTotals.self[index]),
        }
      : null;
    const averages = metric === HOURLY_METRIC_BALANCE && netTotals
      ? {
          all: toAverage(netTotals.all),
          ems: toAverage(netTotals.ems),
          self: toAverage(netTotals.self),
        }
      : {
          all: toAverage(totals.all),
          ems: toAverage(totals.ems),
          self: toAverage(totals.self),
        };
    const hasData = metric === HOURLY_METRIC_BALANCE
      ? (totals.all.some((value) => value > 0) || outflowTotals.all.some((value) => value > 0))
      : totals.all.some((value) => value > 0);
    return { averages, hasData, divisor };
  }

  function getHourlyChartRecords(baseRecords, selectedYear, filters, period) {
    const sanitized = sanitizeChartFilters(filters, { getDefaultChartFilters, KPI_FILTER_LABELS });
    sanitized.arrival = 'all';
    const yearScopedRecords = filterRecordsByYear(baseRecords, selectedYear);
    const filteredRecords = filterRecordsByChartFilters(yearScopedRecords, sanitized);
    return filterRecordsByWindow(filteredRecords, period);
  }

  function populateHourlyCompareYearOptions(dailyStats) {
    if (!selectors.hourlyCompareYearA || !selectors.hourlyCompareYearB) {
      return;
    }
    const years = getAvailableYearsFromDaily(dailyStats);
    const buildOptions = (select) => {
      select.replaceChildren();
      const noneOption = document.createElement('option');
      noneOption.value = 'none';
      noneOption.textContent = 'Nelyginti';
      select.appendChild(noneOption);
      years.forEach((year) => {
        const option = document.createElement('option');
        option.value = String(year);
        option.textContent = `${year} m.`;
        select.appendChild(option);
      });
    };
    buildOptions(selectors.hourlyCompareYearA);
    buildOptions(selectors.hourlyCompareYearB);
    const normalized = normalizeHourlyCompareYears(
      dashboardState.hourlyCompareYears?.[0],
      dashboardState.hourlyCompareYears?.[1],
    );
    dashboardState.hourlyCompareYears = normalized;
    syncHourlyCompareControls();
  }

  function syncHourlyCompareControls() {
    if (selectors.hourlyCompareToggle) {
      selectors.hourlyCompareToggle.checked = Boolean(dashboardState.hourlyCompareEnabled);
    }
    if (selectors.hourlyCompareSeriesGroup) {
      selectors.hourlyCompareSeriesGroup.hidden = !dashboardState.hourlyCompareEnabled;
    }
    if (Array.isArray(selectors.hourlyCompareSeriesButtons) && selectors.hourlyCompareSeriesButtons.length) {
      const current = HOURLY_COMPARE_SERIES.includes(dashboardState.hourlyCompareSeries)
        ? dashboardState.hourlyCompareSeries
        : HOURLY_COMPARE_SERIES_ALL;
      selectors.hourlyCompareSeriesButtons.forEach((button) => {
        const key = getDatasetValue(button, 'hourlyCompareSeries');
        if (!key) {
          return;
        }
        const isActive = key === current;
        button.setAttribute('aria-pressed', String(isActive));
      });
    }
    if (selectors.hourlyCompareYearA && selectors.hourlyCompareYearB) {
      const fieldA = selectors.hourlyCompareYearA.closest('.heatmap-toolbar__field');
      const fieldB = selectors.hourlyCompareYearB.closest('.heatmap-toolbar__field');
      if (fieldA) {
        fieldA.hidden = !dashboardState.hourlyCompareEnabled;
      }
      if (fieldB) {
        fieldB.hidden = !dashboardState.hourlyCompareEnabled;
      }
      const normalized = normalizeHourlyCompareYears(
        dashboardState.hourlyCompareYears?.[0],
        dashboardState.hourlyCompareYears?.[1],
      );
      dashboardState.hourlyCompareYears = normalized;
      const [yearA, yearB] = normalized;
      selectors.hourlyCompareYearA.value = Number.isFinite(yearA) ? String(yearA) : 'none';
      selectors.hourlyCompareYearB.value = Number.isFinite(yearB) ? String(yearB) : 'none';
    }
  }

  async function handleHourlyFilterChange() {
    const metricValue = dashboardState.hourlyMetric;
    const departmentValue = selectors.hourlyDepartmentInput?.value ?? dashboardState.hourlyDepartment;
    const weekdayValue = selectors.hourlyWeekdaySelect?.value ?? dashboardState.hourlyWeekday;
    const stayValue = selectors.hourlyStaySelect?.value ?? dashboardState.hourlyStayBucket;
    dashboardState.hourlyDepartment = normalizeHourlyDepartment(departmentValue);
    dashboardState.hourlyWeekday = normalizeHourlyWeekday(weekdayValue);
    dashboardState.hourlyStayBucket = normalizeHourlyStayBucket(stayValue);
    if (selectors.hourlyWeekdaySelect) {
      selectors.hourlyWeekdaySelect.value = String(dashboardState.hourlyWeekday);
    }
    if (selectors.hourlyStaySelect) {
      selectors.hourlyStaySelect.value = String(dashboardState.hourlyStayBucket);
    }
    if (dashboardState.hourlyMetric !== HOURLY_METRIC_HOSPITALIZED) {
      dashboardState.hourlyDepartment = 'all';
      if (selectors.hourlyDepartmentInput) {
        selectors.hourlyDepartmentInput.value = '';
      }
    }
    syncHourlyDepartmentVisibility(dashboardState.hourlyMetric);
    updateHourlyCaption(
      dashboardState.hourlyWeekday,
      dashboardState.hourlyStayBucket,
      dashboardState.hourlyMetric,
      dashboardState.hourlyDepartment,
    );
    const selectedYear = Number.isFinite(dashboardState.chartYear) ? Number(dashboardState.chartYear) : null;
    const baseRecords = Array.isArray(dashboardState.chartData.baseRecords)
      && dashboardState.chartData.baseRecords.length
      ? dashboardState.chartData.baseRecords
      : dashboardState.rawRecords;
    const hourlyRecords = getHourlyChartRecords(
      baseRecords,
      selectedYear,
      dashboardState.chartFilters || {},
      dashboardState.chartPeriod,
    );
    const chartRenderers = getChartRenderers();
    chartRenderers.renderHourlyChartWithTheme(hourlyRecords).catch((error) => {
      const errorInfo = describeError(error, { code: 'HOURLY_CHART', message: 'Nepavyko atnaujinti valandinio grafiko' });
      console.error(errorInfo.log, error);
      showChartError(TEXT.charts?.errorLoading);
    });
  }

  function applyHourlyDepartmentSelection(value) {
    dashboardState.hourlyDepartment = normalizeHourlyDepartment(value);
    if (selectors.hourlyDepartmentInput) {
      selectors.hourlyDepartmentInput.value = dashboardState.hourlyDepartment === 'all'
        ? ''
        : dashboardState.hourlyDepartment;
    }
    setHourlyDepartmentSuggestions([]);
    handleHourlyFilterChange();
  }

  function handleHourlyCompareToggle(event) {
    const enabled = Boolean(event?.target?.checked);
    dashboardState.hourlyCompareEnabled = enabled;
    if (enabled && selectors.hourlyCompareYearA && selectors.hourlyCompareYearB) {
      const normalized = normalizeHourlyCompareYears(
        dashboardState.hourlyCompareYears?.[0],
        dashboardState.hourlyCompareYears?.[1],
      );
      if (!normalized.length) {
        const availableYears = Array.from(selectors.hourlyCompareYearA.options || [])
          .map((option) => option.value)
          .filter((value) => value && value !== 'none')
          .map((value) => Number.parseInt(value, 10))
          .filter((value) => Number.isFinite(value));
        if (availableYears.length) {
          selectors.hourlyCompareYearA.value = String(availableYears[0]);
          selectors.hourlyCompareYearB.value = availableYears[1] != null ? String(availableYears[1]) : 'none';
          dashboardState.hourlyCompareYears = normalizeHourlyCompareYears(
            selectors.hourlyCompareYearA.value,
            selectors.hourlyCompareYearB.value,
          );
        }
      }
    }
    syncHourlyCompareControls();
    handleHourlyFilterChange();
  }

  function handleHourlyCompareYearsChange() {
    if (!selectors.hourlyCompareYearA || !selectors.hourlyCompareYearB) {
      return;
    }
    const normalized = normalizeHourlyCompareYears(
      selectors.hourlyCompareYearA.value,
      selectors.hourlyCompareYearB.value,
    );
    dashboardState.hourlyCompareYears = normalized;
    if (normalized.length === 1) {
      const only = normalized[0];
      if (String(selectors.hourlyCompareYearA.value) === String(only)) {
        selectors.hourlyCompareYearB.value = 'none';
      } else if (String(selectors.hourlyCompareYearB.value) === String(only)) {
        selectors.hourlyCompareYearA.value = 'none';
      }
    }
    handleHourlyFilterChange();
  }

  function handleHourlyCompareSeriesClick(event) {
    const button = event?.currentTarget;
    const key = getDatasetValue(button, 'hourlyCompareSeries');
    if (!HOURLY_COMPARE_SERIES.includes(key)) {
      return;
    }
    dashboardState.hourlyCompareSeries = key;
    syncHourlyCompareControls();
    if (dashboardState.hourlyCompareEnabled) {
      handleHourlyFilterChange();
    }
  }

  function handleHourlyMetricClick(event) {
    const button = event?.currentTarget;
    const metric = getDatasetValue(button, 'hourlyMetric');
    if (!metric) {
      return;
    }
    dashboardState.hourlyMetric = normalizeHourlyMetric(metric);
    syncHourlyMetricButtons();
    if (dashboardState.hourlyMetric !== HOURLY_METRIC_HOSPITALIZED) {
      dashboardState.hourlyDepartment = 'all';
      if (selectors.hourlyDepartmentInput) {
        selectors.hourlyDepartmentInput.value = '';
      }
    }
    handleHourlyFilterChange();
  }

  function handleHourlyResetFilters() {
    dashboardState.hourlyMetric = HOURLY_METRIC_ARRIVALS;
    dashboardState.hourlyDepartment = 'all';
    dashboardState.hourlyWeekday = HOURLY_WEEKDAY_ALL;
    dashboardState.hourlyStayBucket = HOURLY_STAY_BUCKET_ALL;
    syncHourlyMetricButtons();
    if (selectors.hourlyDepartmentInput) {
      selectors.hourlyDepartmentInput.value = '';
    }
    if (selectors.hourlyWeekdaySelect) {
      selectors.hourlyWeekdaySelect.value = String(dashboardState.hourlyWeekday);
    }
    if (selectors.hourlyStaySelect) {
      selectors.hourlyStaySelect.value = String(dashboardState.hourlyStayBucket);
    }
    syncHourlyDepartmentVisibility(dashboardState.hourlyMetric);
    handleHourlyFilterChange();
  }

  function handleHourlyDepartmentInput(event) {
    const value = event?.target?.value ?? '';
    dashboardState.hourlyDepartment = normalizeHourlyDepartment(value);
    dashboardState.hourlyDepartmentSuggestIndex = -1;
    updateHourlyDepartmentSuggestions(value);
    handleHourlyFilterChange();
  }

  function handleHourlyDepartmentBlur() {
    window.setTimeout(() => {
      const active = document.activeElement;
      if (active === selectors.hourlyDepartmentInput || active === selectors.hourlyDepartmentToggle) {
        return;
      }
      if (selectors.hourlyDepartmentSuggestions && selectors.hourlyDepartmentSuggestions.contains(active)) {
        return;
      }
      setHourlyDepartmentSuggestions([]);
    }, 120);
  }

  function handleHourlyDepartmentToggle() {
    const isOpen = selectors.hourlyDepartmentSuggestions
      && !selectors.hourlyDepartmentSuggestions.hasAttribute('hidden');
    if (isOpen) {
      setHourlyDepartmentSuggestions([]);
      if (selectors.hourlyDepartmentToggle) {
        selectors.hourlyDepartmentToggle.setAttribute('aria-expanded', 'false');
      }
      if (selectors.hourlyDepartmentInput) {
        selectors.hourlyDepartmentInput.setAttribute('aria-expanded', 'false');
      }
      return;
    }
    updateHourlyDepartmentSuggestions('', { force: true });
    if (selectors.hourlyDepartmentToggle) {
      selectors.hourlyDepartmentToggle.setAttribute('aria-expanded', 'true');
    }
    if (selectors.hourlyDepartmentInput) {
      selectors.hourlyDepartmentInput.setAttribute('aria-expanded', 'true');
      selectors.hourlyDepartmentInput.focus();
    }
  }

  function handleHourlyDepartmentKeydown(event) {
    if (!selectors.hourlyDepartmentSuggestions || selectors.hourlyDepartmentSuggestions.hasAttribute('hidden')) {
      return;
    }
    const items = Array.from(selectors.hourlyDepartmentSuggestions.querySelectorAll('.hourly-suggestions__item'));
    if (!items.length) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      dashboardState.hourlyDepartmentSuggestIndex = Math.min(items.length - 1, dashboardState.hourlyDepartmentSuggestIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      dashboardState.hourlyDepartmentSuggestIndex = Math.max(0, dashboardState.hourlyDepartmentSuggestIndex - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const active = items[dashboardState.hourlyDepartmentSuggestIndex] || items[0];
      if (active) {
        applyHourlyDepartmentSelection(active.textContent || '');
      }
      return;
    } else if (event.key === 'Escape') {
      setHourlyDepartmentSuggestions([]);
      return;
    } else {
      return;
    }
    items.forEach((item, index) => {
      item.setAttribute('aria-selected', index === dashboardState.hourlyDepartmentSuggestIndex ? 'true' : 'false');
    });
  }

  return {
    normalizeHourlyWeekday,
    normalizeHourlyMetric,
    normalizeHourlyDepartment,
    normalizeHourlyStayBucket,
    normalizeHourlyCompareYears,
    applyHourlyYAxisAuto,
    updateHourlyCaption,
    populateHourlyWeekdayOptions,
    syncHourlyMetricButtons,
    populateHourlyStayOptions,
    updateHourlyDepartmentOptions,
    syncHourlyDepartmentVisibility,
    computeHourlySeries,
    getHourlyChartRecords,
    populateHourlyCompareYearOptions,
    syncHourlyCompareControls,
    handleHourlyFilterChange,
    handleHourlyMetricClick,
    handleHourlyResetFilters,
    handleHourlyDepartmentInput,
    handleHourlyDepartmentBlur,
    handleHourlyDepartmentToggle,
    handleHourlyDepartmentKeydown,
    handleHourlyCompareToggle,
    handleHourlyCompareYearsChange,
    handleHourlyCompareSeriesClick,
    applyHourlyDepartmentSelection,
  };
}
