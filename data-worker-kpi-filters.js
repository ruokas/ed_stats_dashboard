/*
 * KPI filtering logic extracted from the worker transform hotspot.
 * Depends on shared helpers exposed by data-worker-transforms.js.
 */

const KPI_SHIFT_VALUES = ['all', 'day', 'night'];
const KPI_ARRIVAL_VALUES = ['all', 'ems', 'self'];
const KPI_DISPOSITION_VALUES = ['all', 'hospitalized', 'discharged'];
const KPI_CARD_TYPE_VALUES = ['all', 't', 'tr', 'ch'];
const KPI_DATASET_REGISTRY = new Map();
let kpiDatasetCounter = 0;

function normalizeKpiFilters(raw, fallback = {}) {
  const defaultWindow =
    Number.isFinite(Number(fallback.window)) && Number(fallback.window) >= 0 ? Number(fallback.window) : 0;
  const defaults = {
    window: defaultWindow,
    shift: KPI_SHIFT_VALUES.includes(fallback.shift) ? fallback.shift : 'all',
    arrival: KPI_ARRIVAL_VALUES.includes(fallback.arrival) ? fallback.arrival : 'all',
    disposition: KPI_DISPOSITION_VALUES.includes(fallback.disposition) ? fallback.disposition : 'all',
    cardType: KPI_CARD_TYPE_VALUES.includes(fallback.cardType) ? fallback.cardType : 'all',
  };
  const normalizedWindow =
    Number.isFinite(Number(raw?.window)) && Number(raw.window) >= 0 ? Number(raw.window) : defaults.window;
  return {
    window: normalizedWindow,
    shift: KPI_SHIFT_VALUES.includes(raw?.shift) ? raw.shift : defaults.shift,
    arrival: KPI_ARRIVAL_VALUES.includes(raw?.arrival) ? raw.arrival : defaults.arrival,
    disposition: KPI_DISPOSITION_VALUES.includes(raw?.disposition) ? raw.disposition : defaults.disposition,
    cardType: KPI_CARD_TYPE_VALUES.includes(raw?.cardType) ? raw.cardType : defaults.cardType,
  };
}

function matchesSharedPatientFilters(record, filters = {}) {
  const arrivalFilter = filters.arrival;
  if (arrivalFilter === 'ems' && !record.ems) {
    return false;
  }
  if (arrivalFilter === 'self' && record.ems) {
    return false;
  }

  const dispositionFilter = filters.disposition;
  if (dispositionFilter === 'hospitalized' && !record.hospitalized) {
    return false;
  }
  if (dispositionFilter === 'discharged' && record.hospitalized) {
    return false;
  }

  const cardTypeFilter = filters.cardType;
  if (cardTypeFilter === 't' && record.cardType !== 't') {
    return false;
  }
  if (cardTypeFilter === 'tr' && record.cardType !== 'tr') {
    return false;
  }
  if (cardTypeFilter === 'ch' && record.cardType !== 'ch') {
    return false;
  }

  return true;
}

function recordMatchesKpiFilters(record, filters) {
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

function dateKeyToUtc(dateKey) {
  if (typeof dateKey !== 'string') {
    return Number.NaN;
  }
  const parts = dateKey.split('-').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return Number.NaN;
  }
  const [year, month, day] = parts;
  return Date.UTC(year, month - 1, day);
}

function filterRecordsByWindow(records, days, calculations = {}, calculationDefaults = {}) {
  if (!Array.isArray(records)) {
    return [];
  }
  if (!Number.isFinite(days) || days <= 0) {
    return records.slice();
  }
  const shiftStartHour = resolveShiftStartHour(calculations, calculationDefaults);
  const eligibleEntries = [];
  const eligibleUtc = [];
  let endUtc = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < records.length; index += 1) {
    const entry = records[index];
    const hasArrival = entry.arrival instanceof Date && !Number.isNaN(entry.arrival.getTime());
    const hasDischarge = entry.discharge instanceof Date && !Number.isNaN(entry.discharge.getTime());
    const reference = hasArrival ? entry.arrival : hasDischarge ? entry.discharge : null;
    if (!reference) {
      continue;
    }
    const dateKey = computeShiftDateKey(reference, shiftStartHour);
    if (!dateKey) {
      continue;
    }
    const utc = dateKeyToUtc(dateKey);
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

function filterDailyStatsByWindow(dailyStats, days) {
  if (!Array.isArray(dailyStats)) {
    return [];
  }
  if (!Number.isFinite(days) || days <= 0) {
    return dailyStats.map((entry) => ({ ...entry }));
  }
  const eligibleEntries = [];
  const eligibleUtc = [];
  let endUtc = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < dailyStats.length; index += 1) {
    const entry = dailyStats[index];
    const utc = dateKeyToUtc(entry?.date);
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
      scoped.push({ ...eligibleEntries[index] });
    }
  }
  return scoped;
}

function normalizeKpiDateValue(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function filterDailyStatsByDateKey(dailyStats, dateKey) {
  const normalized = normalizeKpiDateValue(dateKey);
  if (!normalized) {
    return Array.isArray(dailyStats) ? dailyStats.map((entry) => ({ ...entry })) : [];
  }
  return (Array.isArray(dailyStats) ? dailyStats : [])
    .filter((entry) => String(entry?.date || '') === normalized)
    .map((entry) => ({ ...entry }));
}

function listAvailableDateKeysFromDailyStats(dailyStats) {
  const keys = new Set();
  const list = Array.isArray(dailyStats) ? dailyStats : [];
  for (let index = 0; index < list.length; index += 1) {
    const dateKey = normalizeKpiDateValue(list[index]?.date);
    if (dateKey) {
      keys.add(dateKey);
    }
  }
  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

function sumDailyCounts(dailyStats) {
  const list = Array.isArray(dailyStats) ? dailyStats : [];
  let total = 0;
  for (let index = 0; index < list.length; index += 1) {
    total += Number.isFinite(Number(list[index]?.count)) ? Number(list[index].count) : 0;
  }
  return total;
}

function getLastShiftMetricLabel(metric) {
  switch (metric) {
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

function normalizeLastShiftMetric(value) {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  const allowed = ['arrivals', 'discharges', 'hospitalized', 'balance', 'census'];
  return allowed.includes(raw) ? raw : 'arrivals';
}

function buildAvailableDateKeysFromRecords(records, shiftStartHour) {
  const keys = new Set();
  const list = Array.isArray(records) ? records : [];
  for (let index = 0; index < list.length; index += 1) {
    const record = list[index];
    const hasArrival = record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime());
    const hasDischarge = record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime());
    const reference = hasArrival ? record.arrival : hasDischarge ? record.discharge : null;
    if (!reference) {
      continue;
    }
    const dateKey = computeShiftDateKey(reference, shiftStartHour);
    if (dateKey) {
      keys.add(dateKey);
    }
  }
  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

function buildKpiLastShiftHourlySeriesInWorker(
  records,
  dailyStats,
  calculations,
  calculationDefaults,
  metricKey,
  selectedDate
) {
  const metric = normalizeLastShiftMetric(metricKey);
  const shiftStartHour = resolveShiftStartHour(calculations, calculationDefaults);
  const availableDaily = Array.isArray(dailyStats) ? dailyStats : [];
  const normalizedSelectedDate = normalizeKpiDateValue(selectedDate);
  const targetDateKey =
    normalizedSelectedDate ||
    (availableDaily.length ? normalizeKpiDateValue(availableDaily[availableDaily.length - 1]?.date) : null);
  if (!targetDateKey) {
    return null;
  }
  const series = {
    total: Array(24).fill(0),
    t: Array(24).fill(0),
    tr: Array(24).fill(0),
    ch: Array(24).fill(0),
    outflow: Array(24).fill(0),
    net: Array(24).fill(0),
    census: Array(24).fill(0),
  };
  const list = Array.isArray(records) ? records : [];
  for (let index = 0; index < list.length; index += 1) {
    const record = list[index];
    const arrival = record?.arrival;
    const discharge = record?.discharge;
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
    if (metric === 'arrivals') {
      reference =
        arrivalHasTime && arrival instanceof Date && !Number.isNaN(arrival.getTime()) ? arrival : null;
    } else if (metric === 'discharges') {
      reference =
        dischargeHasTime && discharge instanceof Date && !Number.isNaN(discharge.getTime())
          ? discharge
          : null;
    } else if (metric === 'hospitalized') {
      reference =
        record?.hospitalized &&
        dischargeHasTime &&
        discharge instanceof Date &&
        !Number.isNaN(discharge.getTime())
          ? discharge
          : null;
    } else {
      reference =
        arrivalHasTime && arrival instanceof Date && !Number.isNaN(arrival.getTime()) ? arrival : null;
    }
    if (!reference) {
      continue;
    }
    const dateKey = computeShiftDateKey(reference, shiftStartHour);
    if (dateKey !== targetDateKey) {
      continue;
    }
    const hour = reference.getHours();
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
      continue;
    }
    series.total[hour] += 1;
    const rawType = typeof record?.cardType === 'string' ? record.cardType.trim().toLowerCase() : '';
    if (rawType === 't') {
      series.t[hour] += 1;
    } else if (rawType === 'tr') {
      series.tr[hour] += 1;
    } else if (rawType === 'ch') {
      series.ch[hour] += 1;
    }
  }
  if (metric === 'balance' || metric === 'census') {
    for (let index = 0; index < list.length; index += 1) {
      const record = list[index];
      const discharge = record?.discharge;
      const dischargeHasTime =
        record?.dischargeHasTime === true ||
        (record?.dischargeHasTime == null &&
          discharge instanceof Date &&
          (discharge.getHours() || discharge.getMinutes() || discharge.getSeconds()));
      if (!dischargeHasTime || !(discharge instanceof Date) || Number.isNaN(discharge.getTime())) {
        continue;
      }
      const dateKey = computeShiftDateKey(discharge, shiftStartHour);
      if (dateKey !== targetDateKey) {
        continue;
      }
      const hour = discharge.getHours();
      if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
        continue;
      }
      series.outflow[hour] += 1;
    }
    if (metric === 'balance') {
      series.net = series.total.map((value, index) => value - (series.outflow[index] || 0));
    } else {
      const orderedHours = Array.from(
        { length: 24 },
        (_, offset) => (((shiftStartHour + offset) % 24) + 24) % 24
      );
      let running = 0;
      for (let index = 0; index < orderedHours.length; index += 1) {
        const hour = orderedHours[index];
        running = Math.max(0, running + (series.total[hour] || 0) - (series.outflow[hour] || 0));
        series.census[hour] = running;
      }
    }
  }
  const hasAnyFlow = series.total.some((value) => value > 0) || series.outflow.some((value) => value > 0);
  return {
    dateKey: targetDateKey,
    dateLabel: targetDateKey,
    shiftStartHour,
    metric,
    metricLabel: getLastShiftMetricLabel(metric),
    series,
    hasData:
      metric === 'arrivals' || metric === 'discharges' || metric === 'hospitalized'
        ? series.total.some((value) => value > 0)
        : hasAnyFlow,
  };
}

function resolveKpiDatasetHandle(handle) {
  const datasetHandle = String(handle || '');
  if (!datasetHandle) {
    throw new Error('Nenurodytas KPI dataset handle.');
  }
  const stored = KPI_DATASET_REGISTRY.get(datasetHandle);
  if (!stored) {
    throw new Error(`KPI dataset handle nerastas arba pasenęs: ${datasetHandle}`);
  }
  return stored;
}

function resolveKpiFilteredDataFromDataset(data = {}, stored = null) {
  const dataset = stored || resolveKpiDatasetHandle(data.datasetHandle);
  const defaultFilters = normalizeKpiFilters(data.defaultFilters);
  const requestedFilters = normalizeKpiFilters(data.filters, defaultFilters);
  const windowFromPayload =
    Number.isFinite(Number(data.windowDays)) && Number(data.windowDays) >= 0
      ? Number(data.windowDays)
      : Number.NaN;
  const windowDays = Number.isFinite(windowFromPayload) ? windowFromPayload : requestedFilters.window;
  const calculations = data.calculations || dataset.calculations || {};
  const calculationDefaults = data.calculationDefaults || dataset.calculationDefaults || {};
  const records = Array.isArray(data.records) ? data.records : dataset.records;
  const dailyStats = Array.isArray(data.dailyStats) ? data.dailyStats : dataset.dailyStats;
  const hasRawRecords = Array.isArray(records) && records.length > 0;

  let filteredRecords = [];
  let filteredDailyStats = [];
  if (hasRawRecords) {
    const scopedRecords = filterRecordsByWindow(records, windowDays, calculations, calculationDefaults);
    filteredRecords = scopedRecords.filter((record) => recordMatchesKpiFilters(record, requestedFilters));
    const computeDailyStatsFn =
      typeof self.computeDailyStats === 'function'
        ? self.computeDailyStats
        : typeof self._computeDailyStats === 'function'
          ? self._computeDailyStats
          : null;
    if (typeof computeDailyStatsFn !== 'function') {
      throw new ReferenceError('computeDailyStats helper is not available in worker scope');
    }
    filteredDailyStats = computeDailyStatsFn(filteredRecords, calculations, calculationDefaults);
  } else if (Array.isArray(dailyStats) && dailyStats.length) {
    filteredDailyStats = filterDailyStatsByWindow(dailyStats, windowDays).map((entry) => ({ ...entry }));
  }

  return {
    dataset,
    filters: { ...requestedFilters, window: windowDays },
    windowDays,
    calculations,
    calculationDefaults,
    filteredRecords,
    filteredDailyStats,
    hasRawRecords,
  };
}

function applyKpiFiltersInWorker(data = {}) {
  const defaultFilters = normalizeKpiFilters(data.defaultFilters);
  const requestedFilters = normalizeKpiFilters(data.filters, defaultFilters);
  const windowFromPayload =
    Number.isFinite(Number(data.windowDays)) && Number(data.windowDays) >= 0
      ? Number(data.windowDays)
      : Number.NaN;
  const windowDays = Number.isFinite(windowFromPayload) ? windowFromPayload : requestedFilters.window;
  const records = Array.isArray(data.records) ? data.records : [];
  const dailyStats = Array.isArray(data.dailyStats) ? data.dailyStats : [];
  const calculations = data.calculations || {};
  const calculationDefaults = data.calculationDefaults || {};
  const resultMode = typeof data?.resultMode === 'string' ? data.resultMode : 'full';
  const selectedDate = normalizeKpiDateValue(data?.selectedDate);
  const lastShiftHourlyMetric = normalizeLastShiftMetric(data?.lastShiftHourlyMetric);
  const hasRawRecords = records.length > 0;
  const computeDailyStatsFn =
    typeof self.computeDailyStats === 'function'
      ? self.computeDailyStats
      : typeof self._computeDailyStats === 'function'
        ? self._computeDailyStats
        : null;
  let filteredRecords = [];
  let filteredDailyStats = [];

  if (hasRawRecords) {
    const scopedRecords = filterRecordsByWindow(records, windowDays, calculations, calculationDefaults);
    filteredRecords = scopedRecords.filter((record) => recordMatchesKpiFilters(record, requestedFilters));
    if (typeof computeDailyStatsFn !== 'function') {
      throw new ReferenceError('computeDailyStats helper is not available in worker scope');
    }
    filteredDailyStats = computeDailyStatsFn(filteredRecords, calculations, calculationDefaults);
  } else if (dailyStats.length) {
    filteredDailyStats = filterDailyStatsByWindow(dailyStats, windowDays).map((entry) => ({ ...entry }));
  }

  const effectiveFilters = { ...requestedFilters, window: windowDays };

  if (resultMode === 'summary+hourly') {
    const shiftStartHour = resolveShiftStartHour(calculations, calculationDefaults);
    const selectedDateDailyStats = selectedDate
      ? filterDailyStatsByDateKey(filteredDailyStats, selectedDate)
      : filteredDailyStats.map((entry) => ({ ...entry }));
    const availableDateKeys = hasRawRecords
      ? buildAvailableDateKeysFromRecords(filteredRecords, shiftStartHour)
      : listAvailableDateKeysFromDailyStats(filteredDailyStats);
    const totalFilteredRecords = hasRawRecords ? filteredRecords.length : sumDailyCounts(filteredDailyStats);
    const selectedDateRecordCount = hasRawRecords
      ? selectedDate
        ? filteredRecords.filter((record) => {
            const hasArrival = record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime());
            const hasDischarge =
              record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime());
            const reference = hasArrival ? record.arrival : hasDischarge ? record.discharge : null;
            return reference ? computeShiftDateKey(reference, shiftStartHour) === selectedDate : false;
          }).length
        : filteredRecords.length
      : sumDailyCounts(selectedDate ? selectedDateDailyStats : filteredDailyStats);
    const lastShiftHourly = hasRawRecords
      ? buildKpiLastShiftHourlySeriesInWorker(
          filteredRecords,
          selectedDate ? selectedDateDailyStats : filteredDailyStats,
          calculations,
          calculationDefaults,
          lastShiftHourlyMetric,
          selectedDate
        )
      : null;
    return {
      filters: effectiveFilters,
      windowDays,
      records: [],
      dailyStats: filteredDailyStats,
      resultMode: 'summary+hourly',
      kpiSummary: {
        totalFilteredRecords,
        selectedDate: selectedDate || null,
        selectedDateRecordCount,
        selectedDateDailyStats,
        availableDateKeys,
        lastShiftHourly,
      },
      meta: {
        totalRecords: filteredRecords.length,
        hasDailyData: filteredDailyStats.some((entry) => Number.isFinite(entry?.count) && entry.count > 0),
        resultMode: 'summary+hourly',
      },
    };
  }

  return {
    filters: effectiveFilters,
    windowDays,
    records: filteredRecords,
    dailyStats: filteredDailyStats,
    meta: {
      totalRecords: filteredRecords.length,
      hasDailyData: filteredDailyStats.some((entry) => Number.isFinite(entry?.count) && entry.count > 0),
    },
  };
}

self.storeKpiDatasetInWorker = function storeKpiDatasetInWorker(data = {}) {
  const records = Array.isArray(data.records) ? data.records : [];
  const dailyStats = Array.isArray(data.dailyStats) ? data.dailyStats : [];
  const calculations = data.calculations || {};
  const calculationDefaults = data.calculationDefaults || {};
  kpiDatasetCounter += 1;
  const datasetHandle = `kpi-dataset-${Date.now()}-${kpiDatasetCounter}`;
  KPI_DATASET_REGISTRY.set(datasetHandle, {
    records,
    dailyStats,
    calculations,
    calculationDefaults,
    datasetType: String(data.datasetType || 'kpi-primary'),
    createdAt: Date.now(),
  });
  return {
    datasetHandle,
    meta: {
      recordsCount: records.length,
      dailyStatsCount: dailyStats.length,
    },
  };
};

self.releaseKpiDatasetInWorker = function releaseKpiDatasetInWorker(data = {}) {
  const datasetHandle = String(data.datasetHandle || '');
  if (!datasetHandle) {
    return { datasetHandle: '', released: false };
  }
  const released = KPI_DATASET_REGISTRY.delete(datasetHandle);
  return { datasetHandle, released };
};

self.applyKpiFiltersByHandleInWorker = function applyKpiFiltersByHandleInWorker(data = {}) {
  const stored = resolveKpiDatasetHandle(data.datasetHandle);
  return applyKpiFiltersInWorker({
    ...data,
    records: Array.isArray(data.records) ? data.records : stored.records,
    dailyStats: Array.isArray(data.dailyStats) ? data.dailyStats : stored.dailyStats,
    calculations: data.calculations || stored.calculations || {},
    calculationDefaults: data.calculationDefaults || stored.calculationDefaults || {},
  });
};

self.getKpiDateKeysByHandleInWorker = function getKpiDateKeysByHandleInWorker(data = {}) {
  const resolved = resolveKpiFilteredDataFromDataset(data);
  const shiftStartHour = resolveShiftStartHour(resolved.calculations, resolved.calculationDefaults);
  const availableDateKeys = resolved.hasRawRecords
    ? buildAvailableDateKeysFromRecords(resolved.filteredRecords, shiftStartHour)
    : listAvailableDateKeysFromDailyStats(resolved.filteredDailyStats);
  return {
    windowDays: resolved.windowDays,
    filters: resolved.filters,
    availableDateKeys,
    resultMode: 'date-keys',
    meta: {
      totalRecords: resolved.hasRawRecords
        ? resolved.filteredRecords.length
        : sumDailyCounts(resolved.filteredDailyStats),
      resultMode: 'date-keys',
    },
  };
};

self.getKpiRecordsForDateByHandleInWorker = function getKpiRecordsForDateByHandleInWorker(data = {}) {
  const resolved = resolveKpiFilteredDataFromDataset(data);
  const selectedDate = normalizeKpiDateValue(data?.selectedDate);
  if (!resolved.hasRawRecords) {
    return {
      selectedDate: selectedDate || null,
      records: [],
      dailyStats: selectedDate ? filterDailyStatsByDateKey(resolved.filteredDailyStats, selectedDate) : [],
      resultMode: 'records-for-date',
      meta: {
        requiresFullRecords: true,
        resultMode: 'records-for-date',
      },
    };
  }
  const shiftStartHour = resolveShiftStartHour(resolved.calculations, resolved.calculationDefaults);
  const records = selectedDate
    ? resolved.filteredRecords.filter((record) => {
        const hasArrival = record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime());
        const hasDischarge = record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime());
        const reference = hasArrival ? record.arrival : hasDischarge ? record.discharge : null;
        return reference ? computeShiftDateKey(reference, shiftStartHour) === selectedDate : false;
      })
    : [];
  return {
    selectedDate: selectedDate || null,
    records,
    dailyStats: selectedDate ? filterDailyStatsByDateKey(resolved.filteredDailyStats, selectedDate) : [],
    resultMode: 'records-for-date',
    meta: {
      count: records.length,
      resultMode: 'records-for-date',
    },
  };
};

self.computeKpiLastShiftHourlyByHandleInWorker = function computeKpiLastShiftHourlyByHandleInWorker(
  data = {}
) {
  const resolved = resolveKpiFilteredDataFromDataset(data);
  const selectedDate = normalizeKpiDateValue(data?.selectedDate);
  const metric = normalizeLastShiftMetric(data?.lastShiftHourlyMetric);
  const lastShiftHourly = resolved.hasRawRecords
    ? buildKpiLastShiftHourlySeriesInWorker(
        resolved.filteredRecords,
        selectedDate
          ? filterDailyStatsByDateKey(resolved.filteredDailyStats, selectedDate)
          : resolved.filteredDailyStats,
        resolved.calculations,
        resolved.calculationDefaults,
        metric,
        selectedDate
      )
    : null;
  return {
    selectedDate: selectedDate || null,
    lastShiftHourly,
    resultMode: 'hourly-only',
    meta: {
      resultMode: 'hourly-only',
      hasRawRecords: resolved.hasRawRecords,
      totalRecords: resolved.hasRawRecords
        ? resolved.filteredRecords.length
        : sumDailyCounts(resolved.filteredDailyStats),
    },
  };
};

self.applyKpiFiltersInWorker = applyKpiFiltersInWorker;
