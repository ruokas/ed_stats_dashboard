export function resolveShiftStartHour(calculationSettings, defaultSettings) {
  const fallback = Number.isFinite(Number(defaultSettings?.calculations?.nightEndHour))
    ? Number(defaultSettings.calculations.nightEndHour)
    : 7;
  if (Number.isFinite(Number(calculationSettings?.shiftStartHour))) {
    return Number(calculationSettings.shiftStartHour);
  }
  if (Number.isFinite(Number(calculationSettings?.nightEndHour))) {
    return Number(calculationSettings.nightEndHour);
  }
  return fallback;
}

function computeShiftDateKeyForArrival(date, shiftStartHour, formatLocalDateKey) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const dayMinutes = 24 * 60;
  const startMinutesRaw = Number.isFinite(Number(shiftStartHour)) ? Number(shiftStartHour) * 60 : 7 * 60;
  const startMinutes = ((Math.round(startMinutesRaw) % dayMinutes) + dayMinutes) % dayMinutes;
  const arrivalMinutes = date.getHours() * 60 + date.getMinutes();
  const shiftAnchor = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (arrivalMinutes < startMinutes) {
    shiftAnchor.setDate(shiftAnchor.getDate() - 1);
  }
  return formatLocalDateKey(shiftAnchor);
}

function dateKeyToLocalDate(dateKey) {
  if (typeof dateKey !== 'string') {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) {
    return null;
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function normalizeKpiDateValue(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function getRecordShiftDateKey(record, shiftStartHour, formatLocalDateKey) {
  if (!record) {
    return '';
  }
  const arrival =
    record.arrival instanceof Date && !Number.isNaN(record.arrival.getTime()) ? record.arrival : null;
  const discharge =
    record.discharge instanceof Date && !Number.isNaN(record.discharge.getTime()) ? record.discharge : null;
  const reference = arrival || discharge;
  return reference ? computeShiftDateKeyForArrival(reference, shiftStartHour, formatLocalDateKey) : '';
}

export function filterKpiRecordsByDate(records, dateKey, shiftStartHour, formatLocalDateKey) {
  const list = Array.isArray(records) ? records : [];
  const normalized = normalizeKpiDateValue(dateKey);
  if (!normalized) {
    return list;
  }
  return list.filter(
    (record) => getRecordShiftDateKey(record, shiftStartHour, formatLocalDateKey) === normalized
  );
}

function filterRecordsByShiftWindow(records, days, dependencies) {
  if (!Array.isArray(records)) {
    return [];
  }
  if (!Number.isFinite(days) || days <= 0) {
    return records.slice();
  }
  const settings = dependencies.getSettings();
  const shiftStartHour = resolveShiftStartHour(settings?.calculations || {}, dependencies.defaultSettings);
  const eligibleEntries = [];
  const eligibleUtc = [];
  let endUtc = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < records.length; index += 1) {
    const entry = records[index];
    let reference = null;
    if (entry.arrival instanceof Date && !Number.isNaN(entry.arrival.getTime())) {
      reference = entry.arrival;
    } else if (entry.discharge instanceof Date && !Number.isNaN(entry.discharge.getTime())) {
      reference = entry.discharge;
    }
    if (!reference) {
      continue;
    }
    const dateKey = computeShiftDateKeyForArrival(reference, shiftStartHour, dependencies.formatLocalDateKey);
    const date = dateKey ? dependencies.dateKeyToDate(dateKey) : null;
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      continue;
    }
    const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    if (!Number.isFinite(utc)) {
      continue;
    }
    eligibleEntries.push(entry);
    eligibleUtc.push(utc);
    if (utc > endUtc) {
      endUtc = utc;
    }
  }
  if (!eligibleEntries.length || !Number.isFinite(endUtc)) {
    return [];
  }
  const startUtc = endUtc - (days - 1) * 86400000;
  const scoped = [];
  for (let index = 0; index < eligibleEntries.length; index += 1) {
    const utc = eligibleUtc[index];
    if (utc >= startUtc && utc <= endUtc) {
      scoped.push(eligibleEntries[index]);
    }
  }
  return scoped;
}

function recordMatchesKpiFilters(record, filters, matchesSharedPatientFilters) {
  if (!record) {
    return false;
  }
  if (filters.shift === 'day' && record.night) {
    return false;
  }
  if (filters.shift === 'night' && !record.night) {
    return false;
  }
  return matchesSharedPatientFilters(record, filters);
}

export function applyKpiFiltersLocally(filters, dependencies) {
  const normalizedFilters = dependencies.sanitizeKpiFilters(filters, {
    getDefaultKpiFilters: dependencies.getDefaultKpiFilters,
    KPI_FILTER_LABELS: dependencies.kpiFilterLabels,
  });
  const settings = dependencies.getSettings();
  const windowDays = Number.isFinite(normalizedFilters.window)
    ? normalizedFilters.window
    : dependencies.defaultSettings.calculations.windowDays;
  const hasPrimaryRecords =
    Array.isArray(dependencies.primaryRecords) && dependencies.primaryRecords.length > 0;
  const primaryDailyStats = Array.isArray(dependencies.primaryDailyStats)
    ? dependencies.primaryDailyStats
    : [];
  let filteredRecords = [];
  let filteredDailyStats = [];

  if (hasPrimaryRecords) {
    const scopedRecords = filterRecordsByShiftWindow(dependencies.primaryRecords, windowDays, dependencies);
    filteredRecords = scopedRecords.filter((record) =>
      recordMatchesKpiFilters(record, normalizedFilters, dependencies.matchesSharedPatientFilters)
    );
    filteredDailyStats = dependencies.computeDailyStats(
      filteredRecords,
      settings?.calculations,
      dependencies.defaultSettings
    );
  } else {
    const scopedDaily = dependencies.filterDailyStatsByWindow(primaryDailyStats, windowDays);
    filteredDailyStats = scopedDaily.slice();
  }

  return {
    filters: normalizedFilters,
    records: filteredRecords,
    dailyStats: filteredDailyStats,
    windowDays,
  };
}

function getLastShiftMetricLabel(metric) {
  switch (metric) {
    case 'referral_arrivals':
      return 'Atvykimai su siuntimu';
    case 'discharges':
      return 'Išleidimai';
    case 'hospitalized':
      return 'Hospitalizacijos';
    case 'balance':
      return 'Srautų balansas';
    case 'census':
      return 'Pacientų kiekis skyriuje';
    default:
      return 'Atvykimai';
  }
}

export function normalizeLastShiftMetric(value) {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  const allowed = ['arrivals', 'referral_arrivals', 'discharges', 'hospitalized', 'balance', 'census'];
  if (allowed.includes(raw)) {
    return raw;
  }
  return 'arrivals';
}

function isReferredRecord(record) {
  if (!record || typeof record !== 'object') {
    return false;
  }
  if (record.referred === true) {
    return true;
  }
  return (
    String(record.referral || '')
      .trim()
      .toLowerCase() === 'su siuntimu'
  );
}

const HOURS_IN_DAY = 24;
const UNKNOWN_TIME_HOURLY_SHARE = 1 / HOURS_IN_DAY;

function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isPlaceholderDischargeDate(date) {
  return isValidDate(date) && date.getFullYear() === 1900 && date.getMonth() === 0 && date.getDate() === 1;
}

function resolveUnknownDischargeDateKey(record, shiftStartHour, formatLocalDateKey) {
  const discharge = isValidDate(record?.discharge) ? record.discharge : null;
  if (!discharge) {
    return '';
  }
  if (!isPlaceholderDischargeDate(discharge)) {
    return formatLocalDateKey(new Date(discharge.getFullYear(), discharge.getMonth(), discharge.getDate()));
  }
  const arrival = isValidDate(record?.arrival) ? record.arrival : null;
  if (!arrival) {
    return '';
  }
  return computeShiftDateKeyForArrival(arrival, shiftStartHour, formatLocalDateKey);
}

function addUnknownTimeDistribution(series, type = '') {
  for (let hour = 0; hour < HOURS_IN_DAY; hour += 1) {
    series.total[hour] += UNKNOWN_TIME_HOURLY_SHARE;
    if (type === 't') {
      series.t[hour] += UNKNOWN_TIME_HOURLY_SHARE;
    } else if (type === 'tr') {
      series.tr[hour] += UNKNOWN_TIME_HOURLY_SHARE;
    } else if (type === 'ch') {
      series.ch[hour] += UNKNOWN_TIME_HOURLY_SHARE;
    }
  }
}

function addUnknownOutflowDistribution(series) {
  for (let hour = 0; hour < HOURS_IN_DAY; hour += 1) {
    series.outflow[hour] += UNKNOWN_TIME_HOURLY_SHARE;
  }
}

function buildTypicalArrivalsBaseline(records, targetDateKey, shiftStartHour, formatLocalDateKey) {
  const targetDate = dateKeyToLocalDate(targetDateKey);
  if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) {
    return {
      baselineAvailable: false,
      baselineSeries: null,
      baselineLabel: 'Įprastinis srautas',
      baselineSampleCount: 0,
    };
  }
  const targetYear = targetDate.getFullYear();
  const targetWeekday = targetDate.getDay();
  const byDateKey = new Map();
  (Array.isArray(records) ? records : []).forEach((record) => {
    const arrival = isValidDate(record?.arrival) ? record.arrival : null;
    const arrivalHasTime =
      record?.arrivalHasTime === true ||
      (record?.arrivalHasTime == null &&
        arrival instanceof Date &&
        (arrival.getHours() || arrival.getMinutes() || arrival.getSeconds()));
    if (!arrival || !arrivalHasTime) {
      return;
    }
    const dateKey = computeShiftDateKeyForArrival(arrival, shiftStartHour, formatLocalDateKey);
    if (!dateKey || dateKey === targetDateKey) {
      return;
    }
    const shiftDate = dateKeyToLocalDate(dateKey);
    if (!(shiftDate instanceof Date) || Number.isNaN(shiftDate.getTime())) {
      return;
    }
    if (shiftDate.getFullYear() !== targetYear || shiftDate.getDay() !== targetWeekday) {
      return;
    }
    const hour = arrival.getHours();
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
      return;
    }
    const hourly = byDateKey.get(dateKey) || Array(HOURS_IN_DAY).fill(0);
    hourly[hour] += 1;
    byDateKey.set(dateKey, hourly);
  });
  const sampleCount = byDateKey.size;
  if (!sampleCount) {
    return {
      baselineAvailable: false,
      baselineSeries: null,
      baselineLabel: 'Įprastinis srautas',
      baselineSampleCount: 0,
    };
  }
  const baselineSeries = Array(HOURS_IN_DAY).fill(0);
  byDateKey.forEach((hourly) => {
    for (let hour = 0; hour < HOURS_IN_DAY; hour += 1) {
      baselineSeries[hour] += Number(hourly[hour] || 0);
    }
  });
  for (let hour = 0; hour < HOURS_IN_DAY; hour += 1) {
    baselineSeries[hour] /= sampleCount;
  }
  return {
    baselineAvailable: true,
    baselineSeries,
    baselineLabel: 'Įprastinis srautas',
    baselineSampleCount: sampleCount,
  };
}

export function buildLastShiftHourlySeries(input, dependencies) {
  const { records, dailyStats, metricKey = 'arrivals' } = input || {};
  const lastShiftSummary = dependencies.buildLastShiftSummary(dailyStats);
  if (!lastShiftSummary?.dateKey) {
    return null;
  }
  const metric = normalizeLastShiftMetric(metricKey);
  const settings = dependencies.getSettings();
  const shiftStartHour = resolveShiftStartHour(settings?.calculations || {}, dependencies.defaultSettings);
  const targetDateKey = lastShiftSummary.dateKey;
  const series = {
    total: Array(24).fill(0),
    t: Array(24).fill(0),
    tr: Array(24).fill(0),
    ch: Array(24).fill(0),
    outflow: Array(24).fill(0),
    net: Array(24).fill(0),
    census: Array(24).fill(0),
  };
  (Array.isArray(records) ? records : []).forEach((record) => {
    const arrival = record?.arrival;
    const discharge = record?.discharge;
    const dischargeDate = isValidDate(discharge) ? discharge : null;
    const arrivalHasTime =
      record?.arrivalHasTime === true ||
      (record?.arrivalHasTime == null &&
        arrival instanceof Date &&
        (arrival.getHours() || arrival.getMinutes() || arrival.getSeconds()));
    const dischargeHasTime =
      record?.dischargeHasTime === true ||
      (record?.dischargeHasTime == null &&
        discharge instanceof Date &&
        (discharge.getHours() || discharge.getMinutes() || discharge.getSeconds()));
    let reference = null;
    if (metric === 'arrivals' || metric === 'referral_arrivals') {
      if (metric === 'referral_arrivals' && !isReferredRecord(record)) {
        return;
      }
      reference =
        arrivalHasTime && arrival instanceof Date && !Number.isNaN(arrival.getTime()) ? arrival : null;
    } else if (metric === 'discharges') {
      const hasReliableDischargeHour =
        dischargeHasTime && dischargeDate && !isPlaceholderDischargeDate(dischargeDate);
      if (hasReliableDischargeHour) {
        reference = dischargeDate;
      } else if (dischargeDate) {
        const unknownDischargeDateKey = resolveUnknownDischargeDateKey(
          record,
          shiftStartHour,
          dependencies.formatLocalDateKey
        );
        if (unknownDischargeDateKey === targetDateKey) {
          const rawType = typeof record.cardType === 'string' ? record.cardType.trim().toLowerCase() : '';
          addUnknownTimeDistribution(series, rawType);
        }
        return;
      }
    } else if (metric === 'hospitalized') {
      if (record?.hospitalized) {
        const hasReliableDischargeHour =
          dischargeHasTime && dischargeDate && !isPlaceholderDischargeDate(dischargeDate);
        if (hasReliableDischargeHour) {
          reference = dischargeDate;
        } else if (dischargeDate) {
          const unknownDischargeDateKey = resolveUnknownDischargeDateKey(
            record,
            shiftStartHour,
            dependencies.formatLocalDateKey
          );
          if (unknownDischargeDateKey === targetDateKey) {
            const rawType = typeof record.cardType === 'string' ? record.cardType.trim().toLowerCase() : '';
            addUnknownTimeDistribution(series, rawType);
          }
          return;
        }
      }
    } else if (metric === 'balance' || metric === 'census') {
      reference =
        arrivalHasTime && arrival instanceof Date && !Number.isNaN(arrival.getTime()) ? arrival : null;
    }
    if (!reference) {
      return;
    }
    const dateKey = computeShiftDateKeyForArrival(reference, shiftStartHour, dependencies.formatLocalDateKey);
    if (dateKey !== targetDateKey) {
      return;
    }
    const hour = reference.getHours();
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
      return;
    }
    series.total[hour] += 1;
    const rawType = typeof record.cardType === 'string' ? record.cardType.trim().toLowerCase() : '';
    if (rawType === 't') {
      series.t[hour] += 1;
    } else if (rawType === 'tr') {
      series.tr[hour] += 1;
    } else if (rawType === 'ch') {
      series.ch[hour] += 1;
    }
  });
  if (metric === 'balance' || metric === 'census') {
    (Array.isArray(records) ? records : []).forEach((record) => {
      const discharge = record?.discharge;
      const dischargeDate = isValidDate(discharge) ? discharge : null;
      const dischargeHasTime =
        record?.dischargeHasTime === true ||
        (record?.dischargeHasTime == null &&
          discharge instanceof Date &&
          (discharge.getHours() || discharge.getMinutes() || discharge.getSeconds()));
      const hasReliableDischargeHour =
        dischargeHasTime && dischargeDate && !isPlaceholderDischargeDate(dischargeDate);
      if (hasReliableDischargeHour) {
        const dateKey = computeShiftDateKeyForArrival(
          dischargeDate,
          shiftStartHour,
          dependencies.formatLocalDateKey
        );
        if (dateKey !== targetDateKey) {
          return;
        }
        const hour = dischargeDate.getHours();
        if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
          return;
        }
        series.outflow[hour] += 1;
        return;
      }
      if (!dischargeDate) {
        return;
      }
      const unknownDischargeDateKey = resolveUnknownDischargeDateKey(
        record,
        shiftStartHour,
        dependencies.formatLocalDateKey
      );
      if (unknownDischargeDateKey !== targetDateKey) {
        return;
      }
      addUnknownOutflowDistribution(series);
    });
    if (metric === 'balance') {
      series.net = series.total.map((value, index) => value - (series.outflow[index] || 0));
    } else {
      const orderedHours = Array.from(
        { length: 24 },
        (_, offset) => (((shiftStartHour + offset) % 24) + 24) % 24
      );
      let running = 0;
      orderedHours.forEach((hour) => {
        running = Math.max(0, running + (series.total[hour] || 0) - (series.outflow[hour] || 0));
        series.census[hour] = running;
      });
    }
  }
  const hasData = series.total.some((value) => value > 0);
  const baselineInfo =
    metric === 'arrivals'
      ? buildTypicalArrivalsBaseline(records, targetDateKey, shiftStartHour, dependencies.formatLocalDateKey)
      : {
          baselineAvailable: false,
          baselineSeries: null,
          baselineLabel: 'Įprastinis srautas',
          baselineSampleCount: 0,
        };
  return {
    dateKey: targetDateKey,
    dateLabel: lastShiftSummary.dateLabel || targetDateKey,
    shiftStartHour,
    metric,
    metricLabel: getLastShiftMetricLabel(metric),
    series,
    baselineAvailable: baselineInfo.baselineAvailable === true,
    baselineSeries: baselineInfo.baselineSeries,
    baselineLabel: baselineInfo.baselineLabel,
    baselineSampleCount: baselineInfo.baselineSampleCount,
    hasData:
      metric === 'balance'
        ? series.total.some((value) => value > 0) || series.outflow.some((value) => value > 0)
        : metric === 'census'
          ? series.total.some((value) => value > 0) || series.outflow.some((value) => value > 0)
          : hasData,
  };
}

function fingerprintKpiRecords(records) {
  const list = Array.isArray(records) ? records : [];
  if (!list.length) {
    return '0';
  }
  const first = list[0];
  const middle = list[Math.floor(list.length / 2)];
  const last = list[list.length - 1];
  const encodeRecord = (record) => {
    const arrivalMs =
      record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime())
        ? record.arrival.getTime()
        : '';
    const dischargeMs =
      record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime())
        ? record.discharge.getTime()
        : '';
    return [
      arrivalMs,
      dischargeMs,
      record?.hospitalized === true ? 1 : 0,
      record?.night === true ? 1 : 0,
      String(record?.cardType || ''),
    ].join(':');
  };
  return [list.length, encodeRecord(first), encodeRecord(middle), encodeRecord(last)].join('|');
}

function fingerprintKpiDailyStats(dailyStats) {
  const list = Array.isArray(dailyStats) ? dailyStats : [];
  if (!list.length) {
    return '0';
  }
  const first = list[0];
  const middle = list[Math.floor(list.length / 2)];
  const last = list[list.length - 1];
  const encodeDaily = (entry) =>
    [
      String(entry?.date || entry?.dateKey || ''),
      Number.isFinite(Number(entry?.count)) ? Number(entry.count) : '',
    ].join(':');
  return [list.length, encodeDaily(first), encodeDaily(middle), encodeDaily(last)].join('|');
}

export function fingerprintHourlySeriesInfo(seriesInfo) {
  if (!seriesInfo || typeof seriesInfo !== 'object') {
    return '0';
  }
  const metric = String(seriesInfo.metric || '');
  const dateKey = String(seriesInfo.dateKey || '');
  const total = Array.isArray(seriesInfo.series?.total) ? seriesInfo.series.total : [];
  const outflow = Array.isArray(seriesInfo.series?.outflow) ? seriesInfo.series.outflow : [];
  const baseline = Array.isArray(seriesInfo.baselineSeries) ? seriesInfo.baselineSeries : [];
  const sample = (list) =>
    [
      list.length,
      Number(list[0] || 0),
      Number(list[7] || 0),
      Number(list[15] || 0),
      Number(list[23] || 0),
    ].join(':');
  return [
    metric,
    dateKey,
    sample(total),
    sample(outflow),
    seriesInfo.baselineAvailable === true ? 1 : 0,
    Number(seriesInfo.baselineSampleCount || 0),
    sample(baseline),
  ].join('|');
}

export function buildKpiUiRenderSignature(input) {
  const {
    filteredRecords,
    filteredDailyStats,
    dateFilteredRecords,
    dateFilteredDailyStats,
    selectedDate,
    effectiveWindow,
    settings,
    filters,
    lastShiftMetric,
    lastShiftHourlyShowBaseline,
    filteredRecordsKeyOverride = null,
    dateFilteredRecordsKeyOverride = null,
  } = input || {};
  const windowDays = selectedDate ? null : effectiveWindow;
  const shiftStartHour = Number(
    settings?.calculations?.shiftStartHour ?? settings?.calculations?.nightEndHour ?? ''
  );
  return {
    filteredRecordsKey:
      typeof filteredRecordsKeyOverride === 'string'
        ? filteredRecordsKeyOverride
        : fingerprintKpiRecords(filteredRecords),
    filteredDailyKey: fingerprintKpiDailyStats(filteredDailyStats),
    dateFilteredRecordsKey:
      typeof dateFilteredRecordsKeyOverride === 'string'
        ? dateFilteredRecordsKeyOverride
        : fingerprintKpiRecords(dateFilteredRecords),
    dateFilteredDailyKey: fingerprintKpiDailyStats(dateFilteredDailyStats),
    selectedDate: selectedDate || '',
    windowDays: Number.isFinite(windowDays) ? Number(windowDays) : null,
    lastShiftMetric: String(lastShiftMetric || 'arrivals'),
    lastShiftHourlyShowBaseline: lastShiftHourlyShowBaseline === true,
    shiftStartHour: Number.isFinite(shiftStartHour) ? shiftStartHour : null,
    filtersKey: [
      String(filters?.shift || ''),
      String(filters?.arrival || ''),
      String(filters?.disposition || ''),
      String(filters?.cardType || ''),
      Number.isFinite(Number(filters?.window)) ? Number(filters.window) : '',
    ].join('|'),
  };
}

export function isSameKpiUiRenderSignature(a, b) {
  if (!a || !b) {
    return false;
  }
  return (
    a.filteredRecordsKey === b.filteredRecordsKey &&
    a.filteredDailyKey === b.filteredDailyKey &&
    a.dateFilteredRecordsKey === b.dateFilteredRecordsKey &&
    a.dateFilteredDailyKey === b.dateFilteredDailyKey &&
    a.selectedDate === b.selectedDate &&
    a.windowDays === b.windowDays &&
    a.lastShiftMetric === b.lastShiftMetric &&
    a.lastShiftHourlyShowBaseline === b.lastShiftHourlyShowBaseline &&
    a.shiftStartHour === b.shiftStartHour &&
    a.filtersKey === b.filtersKey
  );
}
