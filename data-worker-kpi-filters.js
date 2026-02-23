/*
 * KPI filtering logic extracted from the worker transform hotspot.
 * Depends on shared helpers exposed by data-worker-transforms.js.
 */

const KPI_SHIFT_VALUES = ['all', 'day', 'night'];
const KPI_ARRIVAL_VALUES = ['all', 'ems', 'self'];
const KPI_DISPOSITION_VALUES = ['all', 'hospitalized', 'discharged'];
const KPI_CARD_TYPE_VALUES = ['all', 't', 'tr', 'ch'];

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
  const hasRawRecords = records.length > 0;
  let filteredRecords = [];
  let filteredDailyStats = [];

  if (hasRawRecords) {
    const scopedRecords = filterRecordsByWindow(records, windowDays, calculations, calculationDefaults);
    filteredRecords = scopedRecords.filter((record) => recordMatchesKpiFilters(record, requestedFilters));
    filteredDailyStats = computeDailyStats(filteredRecords, calculations, calculationDefaults);
  } else if (dailyStats.length) {
    filteredDailyStats = filterDailyStatsByWindow(dailyStats, windowDays).map((entry) => ({ ...entry }));
  }

  const effectiveFilters = { ...requestedFilters, window: windowDays };

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

self.applyKpiFiltersInWorker = applyKpiFiltersInWorker;
