/*
 * Data processing worker for ED dashboard: parses CSV, transforms rows and computes daily aggregates.
 */

self.addEventListener('message', (event) => {
  const { id, type } = event.data || {};
  if (!id || !type) {
    return;
  }
  try {
    let payload;
    if (type === 'transformCsv') {
      const { csvText, options, progressStep } = event.data;
      const reportProgress = Number.isInteger(progressStep) && progressStep > 0
        ? createProgressReporter(id, progressStep)
        : null;
      payload = transformCsvWithStats(csvText, options, { reportProgress, progressStep });
    } else if (type === 'applyKpiFilters') {
      payload = applyKpiFiltersInWorker(event.data);
    } else {
      return;
    }
    self.postMessage({ id, status: 'success', payload });
  } catch (error) {
    self.postMessage({
      id,
      status: 'error',
      error: serializeError(error),
    });
  }
});

function serializeError(error) {
  if (!error || typeof error !== 'object') {
    return { message: String(error ?? 'Nežinoma klaida') };
  }
  return {
    message: error.message || 'Nežinoma klaida',
    name: error.name || 'Error',
    stack: error.stack || '',
  };
}

function createProgressReporter(id, step = 500) {
  const normalizedStep = Number.isInteger(step) && step > 0 ? step : 500;
  let lastSent = 0;
  return (current = 0, total = 0) => {
    if (!id) {
      return;
    }
    const now = Date.now();
    if (current < total && now - lastSent < 100 && (current % normalizedStep !== 0)) {
      return;
    }
    lastSent = now;
    self.postMessage({ id, status: 'progress', payload: { current, total } });
  };
}

const KPI_SHIFT_VALUES = ['all', 'day', 'night'];
const KPI_ARRIVAL_VALUES = ['all', 'ems', 'self'];
const KPI_DISPOSITION_VALUES = ['all', 'hospitalized', 'discharged'];
const KPI_CARD_TYPE_VALUES = ['all', 't', 'tr', 'ch'];

function transformCsvWithStats(text, options = {}, progressOptions = {}) {
  if (!text) {
    throw new Error('CSV turinys tuščias.');
  }
  const {
    csvSettings = {},
    csvDefaults = {},
    calculations = {},
    calculationDefaults = {},
  } = options;
  const progressStep = Number.isInteger(progressOptions.progressStep) && progressOptions.progressStep > 0
    ? progressOptions.progressStep
    : 500;
  const reportProgress = typeof progressOptions.reportProgress === 'function'
    ? progressOptions.reportProgress
    : null;
  const { rows, delimiter } = parseCsv(text);
  if (!rows.length) {
    throw new Error('CSV failas tuščias.');
  }
  const header = rows[0].map((cell) => String(cell ?? '').trim());
  const headerNormalized = header.map((column, index) => ({
    original: column,
    normalized: column.toLowerCase(),
    index,
  }));
  const csvRuntime = buildCsvRuntime(csvSettings, csvDefaults);
  const columnIndices = {
    arrival: resolveColumnIndex(headerNormalized, csvRuntime.arrivalHeaders),
    discharge: resolveColumnIndex(headerNormalized, csvRuntime.dischargeHeaders),
    dayNight: resolveColumnIndex(headerNormalized, csvRuntime.dayNightHeaders),
    gmp: resolveColumnIndex(headerNormalized, csvRuntime.gmpHeaders),
    department: resolveColumnIndex(headerNormalized, csvRuntime.departmentHeaders),
    cardNumber: resolveColumnIndex(headerNormalized, csvRuntime.cardNumberHeaders),
  };
  const missing = Object.entries(columnIndices)
    .filter(([key, index]) => {
      if (index >= 0) {
        return false;
      }
      if (key === 'department' && !csvRuntime.requireDepartment) {
        return false;
      }
      if (key === 'dayNight') {
        return false;
      }
      if (key === 'cardNumber') {
        return false;
      }
      return true;
    })
    .map(([key]) => csvRuntime.labels[key]);
  if (missing.length) {
    throw new Error(`CSV faile nerasti stulpeliai: ${missing.join(', ')}`);
  }
  const dataRows = rows
    .slice(1)
    .filter((row) => row.some((cell) => (cell ?? '').trim().length > 0));
  const totalRows = dataRows.length;
  const records = dataRows.map((cols, index) => {
    const record = mapRow(
      header,
      cols,
      delimiter,
      columnIndices,
      csvRuntime,
      calculations,
      calculationDefaults,
    );
    if (reportProgress && ((index + 1) % progressStep === 0 || index + 1 === totalRows)) {
      reportProgress(index + 1, totalRows);
    }
    return record;
  });
  const dailyStats = computeDailyStats(records, calculations, calculationDefaults);
  return { records, dailyStats };
}

function applyKpiFiltersInWorker(data = {}) {
  const defaultFilters = normalizeKpiFilters(data.defaultFilters);
  const requestedFilters = normalizeKpiFilters(data.filters, defaultFilters);
  const windowFromPayload = Number.isFinite(Number(data.windowDays)) && Number(data.windowDays) >= 0
    ? Number(data.windowDays)
    : Number.NaN;
  const windowDays = Number.isFinite(windowFromPayload)
    ? windowFromPayload
    : requestedFilters.window;
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

function detectDelimiter(text) {
  const sampleLine = text.split('\n').find((line) => line.trim().length > 0) ?? '';
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestScore = -1;
  candidates.forEach((delimiter) => {
    let inQuotes = false;
    let score = 0;
    for (let i = 0; i < sampleLine.length; i += 1) {
      const char = sampleLine[i];
      if (char === '"') {
        if (inQuotes && sampleLine[i + 1] === '"') {
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (!inQuotes && char === delimiter) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  });
  return bestScore > 0 ? best : ',';
}

function normalizeKpiFilters(raw, fallback = {}) {
  const defaultWindow = Number.isFinite(Number(fallback.window)) && Number(fallback.window) >= 0
    ? Number(fallback.window)
    : 0;
  const defaults = {
    window: defaultWindow,
    shift: KPI_SHIFT_VALUES.includes(fallback.shift) ? fallback.shift : 'all',
    arrival: KPI_ARRIVAL_VALUES.includes(fallback.arrival) ? fallback.arrival : 'all',
    disposition: KPI_DISPOSITION_VALUES.includes(fallback.disposition) ? fallback.disposition : 'all',
    cardType: KPI_CARD_TYPE_VALUES.includes(fallback.cardType) ? fallback.cardType : 'all',
  };
  const normalizedWindow = Number.isFinite(Number(raw?.window)) && Number(raw.window) >= 0
    ? Number(raw.window)
    : defaults.window;
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

function filterRecordsByWindow(records, days, calculations = {}, calculationDefaults = {}) {
  if (!Array.isArray(records)) {
    return [];
  }
  if (!Number.isFinite(days) || days <= 0) {
    return records.slice();
  }
  const shiftStartHour = resolveShiftStartHour(calculations, calculationDefaults);
  const decorated = records
    .map((entry) => {
      const hasArrival = entry.arrival instanceof Date && !Number.isNaN(entry.arrival.getTime());
      const hasDischarge = entry.discharge instanceof Date && !Number.isNaN(entry.discharge.getTime());
      const reference = hasArrival ? entry.arrival : (hasDischarge ? entry.discharge : null);
      if (!reference) {
        return null;
      }
      const dateKey = computeShiftDateKey(reference, shiftStartHour);
      if (!dateKey) {
        return null;
      }
      const utc = dateKeyToUtc(dateKey);
      if (!Number.isFinite(utc)) {
        return null;
      }
      return { entry, utc };
    })
    .filter(Boolean);
  if (!decorated.length) {
    return [];
  }
  const endUtc = decorated.reduce((max, item) => Math.max(max, item.utc), decorated[0].utc);
  const startUtc = endUtc - (days - 1) * 86400000;
  return decorated
    .filter((item) => item.utc >= startUtc && item.utc <= endUtc)
    .map((item) => item.entry);
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

function filterDailyStatsByWindow(dailyStats, days) {
  if (!Array.isArray(dailyStats)) {
    return [];
  }
  if (!Number.isFinite(days) || days <= 0) {
    return dailyStats.map((entry) => ({ ...entry }));
  }
  const decorated = dailyStats
    .map((entry) => ({ entry, utc: dateKeyToUtc(entry?.date) }))
    .filter((item) => Number.isFinite(item.utc));
  if (!decorated.length) {
    return [];
  }
  const endUtc = decorated.reduce((max, item) => Math.max(max, item.utc), decorated[0].utc);
  const startUtc = endUtc - (days - 1) * 86400000;
  return decorated
    .filter((item) => item.utc >= startUtc && item.utc <= endUtc)
    .map((item) => ({ ...item.entry }));
}

function parseCsv(text) {
  const sanitized = text.replace(/\r\n?/g, '\n');
  const delimiter = detectDelimiter(sanitized);
  const rows = [];
  let current = [];
  let value = '';
  let inQuotes = false;
  for (let i = 0; i < sanitized.length; i += 1) {
    const char = sanitized[i];
    if (char === '"') {
      if (inQuotes && sanitized[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      current.push(value);
      value = '';
      continue;
    }
    if (char === '\n' && !inQuotes) {
      current.push(value);
      rows.push(current);
      current = [];
      value = '';
      continue;
    }
    value += char;
  }
  if (value.length > 0 || current.length) {
    current.push(value);
    rows.push(current);
  }
  const filteredRows = rows.filter((row) => row.some((cell) => (cell ?? '').trim().length > 0));
  return { rows: filteredRows, delimiter };
}

function parseCandidateList(value, fallback = '') {
  const base = value && String(value).trim().length ? String(value) : String(fallback ?? '');
  return base
    .replace(/\r\n/g, '\n')
    .split(/[\n,|;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function toHeaderCandidates(value, fallback) {
  return parseCandidateList(value, fallback);
}

function toNormalizedList(value, fallback) {
  return parseCandidateList(value, fallback).map((token) => token.toLowerCase());
}

function buildCsvRuntime(csvSettings = {}, csvDefaults = {}) {
  const fallback = csvDefaults || {};
  const departmentHasValue = csvSettings.department && csvSettings.department.trim().length > 0;
  const cardNumberHasValue = csvSettings.number && csvSettings.number.trim().length > 0;
  const departmentHeaders = departmentHasValue
    ? toHeaderCandidates(csvSettings.department, '')
    : [];
  const cardNumberHeaders = cardNumberHasValue
    ? toHeaderCandidates(csvSettings.number, '')
    : toHeaderCandidates('', fallback.number);
  const runtime = {
    arrivalHeaders: toHeaderCandidates(csvSettings.arrival, fallback.arrival),
    dischargeHeaders: toHeaderCandidates(csvSettings.discharge, fallback.discharge),
    dayNightHeaders: toHeaderCandidates(csvSettings.dayNight, fallback.dayNight),
    gmpHeaders: toHeaderCandidates(csvSettings.gmp, fallback.gmp),
    departmentHeaders,
    cardNumberHeaders,
    trueValues: toNormalizedList(csvSettings.trueValues, fallback.trueValues),
    fallbackTrueValues: toNormalizedList(fallback.trueValues, fallback.trueValues),
    hospitalizedValues: toNormalizedList(csvSettings.hospitalizedValues, fallback.hospitalizedValues),
    nightKeywords: toNormalizedList(csvSettings.nightKeywords, fallback.nightKeywords),
    dayKeywords: toNormalizedList(csvSettings.dayKeywords, fallback.dayKeywords),
    labels: {
      arrival: csvSettings.arrival || fallback.arrival || 'Atvykimo data',
      discharge: csvSettings.discharge || fallback.discharge || 'Išvykimo data',
      dayNight: csvSettings.dayNight || fallback.dayNight || 'Paros metas',
      gmp: csvSettings.gmp || fallback.gmp || 'GMP',
      department: departmentHasValue ? csvSettings.department : (fallback.department || 'Skyrius'),
      cardNumber: cardNumberHasValue ? csvSettings.number : (fallback.number || 'Numeris'),
    },
  };
  runtime.hasHospitalizedValues = runtime.hospitalizedValues.length > 0;
  runtime.requireDepartment = departmentHasValue;
  return runtime;
}

function resolveColumnIndex(headerNormalized, candidates) {
  if (!Array.isArray(candidates) || !candidates.length) {
    return -1;
  }
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    const match = headerNormalized.find((column) => column.original === trimmed);
    if (match) {
      return match.index;
    }
  }
  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase();
    const match = headerNormalized.find((column) => column.normalized === normalized);
    if (match) {
      return match.index;
    }
  }
  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase();
    const match = headerNormalized.find((column) => column.normalized.includes(normalized));
    if (match) {
      return match.index;
    }
  }
  return -1;
}

function matchesWildcard(normalized, candidate) {
  if (!candidate) {
    return false;
  }
  if (candidate === '*') {
    return normalized.length > 0;
  }
  if (!candidate.includes('*')) {
    return normalized === candidate;
  }
  const parts = candidate.split('*').filter((part) => part.length > 0);
  if (!parts.length) {
    return normalized.length > 0;
  }
  return parts.every((fragment) => normalized.includes(fragment));
}

function detectHospitalized(value, csvRuntime) {
  const raw = value != null ? String(value).trim() : '';
  if (!raw) {
    return false;
  }
  if (!csvRuntime.hasHospitalizedValues) {
    return true;
  }
  const normalized = raw.toLowerCase();
  return csvRuntime.hospitalizedValues.some((candidate) => matchesWildcard(normalized, candidate));
}

function parseBoolean(value, trueValues, fallbackTrueValues) {
  if (value == null) {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const candidates = Array.isArray(trueValues) && trueValues.length
    ? trueValues
    : Array.isArray(fallbackTrueValues) ? fallbackTrueValues : [];
  return candidates.some((candidate) => matchesWildcard(normalized, candidate));
}

function detectCardTypeFromNumber(value) {
  if (value == null) {
    return 'other';
  }
  const raw = String(value).trim();
  if (!raw) {
    return 'other';
  }
  const ascii = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const upper = ascii.toUpperCase();
  const letterSequence = upper.replace(/[^A-Z]/g, '');
  if (!letterSequence) {
    return 'other';
  }

  // Tikslinės sekos leidžia identifikuoti kortelės tipą net jei raidžių seka
  // turi tarpus, papildomus simbolius ar priedus prieš/po tipo žymos.
  const sequences = new Set([
    letterSequence,
    ...upper.split(/[^A-Z]+/).filter((token) => token.length > 0),
  ]);

  for (const token of sequences) {
    if (!token) {
      continue;
    }
    if (token.endsWith('TR')) {
      return 'tr';
    }
    if (token.endsWith('CH')) {
      return 'ch';
    }
    if (token.endsWith('T')) {
      return 't';
    }
  }

  return 'other';
}

function isNightByArrival(arrivalDate, calculations, defaults) {
  if (!(arrivalDate instanceof Date) || Number.isNaN(arrivalDate.getTime())) {
    return null;
  }
  const fallbackStart = Number.isFinite(Number(defaults?.nightStartHour))
    ? Number(defaults.nightStartHour)
    : 22;
  const fallbackEnd = Number.isFinite(Number(defaults?.nightEndHour))
    ? Number(defaults.nightEndHour)
    : 7;
  const startRaw = Number.isFinite(Number(calculations?.nightStartHour))
    ? Number(calculations.nightStartHour)
    : fallbackStart;
  const endRaw = Number.isFinite(Number(calculations?.nightEndHour))
    ? Number(calculations.nightEndHour)
    : fallbackEnd;
  const dayMinutes = 24 * 60;
  const normalizeMinutes = (value) => {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const minutes = Math.round(value * 60);
    const wrapped = ((minutes % dayMinutes) + dayMinutes) % dayMinutes;
    return wrapped;
  };
  const startMinutes = normalizeMinutes(startRaw);
  const endMinutes = normalizeMinutes(endRaw);
  const arrivalMinutes = arrivalDate.getHours() * 60 + arrivalDate.getMinutes();
  if (startMinutes === endMinutes) {
    return arrivalMinutes === startMinutes;
  }
  if (startMinutes < endMinutes) {
    return arrivalMinutes >= startMinutes && arrivalMinutes < endMinutes;
  }
  return arrivalMinutes >= startMinutes || arrivalMinutes < endMinutes;
}

function detectNight(dayNightValue, arrivalDate, csvRuntime, calculations, defaults) {
  const byArrival = isNightByArrival(arrivalDate, calculations, defaults);
  if (typeof byArrival === 'boolean') {
    return byArrival;
  }
  const value = dayNightValue != null ? String(dayNightValue).trim().toLowerCase() : '';
  if (value) {
    if (csvRuntime.nightKeywords.some((keyword) => keyword && value.includes(keyword))) {
      return true;
    }
    if (csvRuntime.dayKeywords.some((keyword) => keyword && value.includes(keyword))) {
      return false;
    }
  }
  return false;
}

function parseDate(value) {
  if (!value) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  const normalized = raw.replace(/\s+/g, ' ').trim();
  let isoCandidate = normalized.includes('T') ? normalized : normalized.replace(' ', 'T');
  isoCandidate = isoCandidate.replace(' T', 'T').replace(' +', '+').replace(' -', '-');
  let parsed = new Date(isoCandidate);
  if (!Number.isNaN(parsed?.getTime?.())) {
    return parsed;
  }
  const slashIso = normalized.match(/^(\d{4})[\/](\d{1,2})[\/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (slashIso) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = slashIso;
    parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const euMatch = normalized.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (euMatch) {
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = euMatch;
    parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const isoNoZone = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoNoZone) {
    const [, year, month, day] = isoNoZone;
    parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function detectHasTime(value) {
  if (value == null) {
    return false;
  }
  const raw = String(value).trim();
  if (!raw) {
    return false;
  }
  const match = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    return false;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return false;
  }
  // 00:00(:00) dažnai reiškia "nežinomas laikas"
  if (hours === 0 && minutes === 0 && seconds === 0) {
    return false;
  }
  return true;
}

function mapRow(header, cols, delimiter, indices, csvRuntime, calculations, calculationDefaults) {
  const normalized = [...cols];
  if (normalized.length < header.length) {
    normalized.push(...Array(header.length - normalized.length).fill(''));
  } else if (normalized.length > header.length) {
    const extras = normalized.splice(header.length - 1);
    normalized[header.length - 1] = [normalized[header.length - 1], ...extras].join(delimiter);
  }
  const entry = {};
  header.forEach((column, idx) => {
    entry[column] = normalized[idx] != null ? String(normalized[idx]).trim() : '';
  });
  const arrivalRaw = normalized[indices.arrival] ?? '';
  const dischargeRaw = normalized[indices.discharge] ?? '';
  const dayNightRaw = normalized[indices.dayNight] ?? '';
  const gmpRaw = normalized[indices.gmp] ?? '';
  const departmentRaw = normalized[indices.department] ?? '';
  const cardNumberRaw = indices.cardNumber >= 0 ? normalized[indices.cardNumber] ?? '' : '';
  entry.arrival = parseDate(arrivalRaw);
  entry.discharge = parseDate(dischargeRaw);
  entry.arrivalHasTime = detectHasTime(arrivalRaw);
  entry.dischargeHasTime = detectHasTime(dischargeRaw);
  entry.night = detectNight(dayNightRaw, entry.arrival, csvRuntime, calculations, calculationDefaults);
  entry.ems = parseBoolean(gmpRaw, csvRuntime.trueValues, csvRuntime.fallbackTrueValues);
  entry.department = departmentRaw != null ? String(departmentRaw).trim() : '';
  entry.hospitalized = detectHospitalized(departmentRaw, csvRuntime);
  entry.cardType = detectCardTypeFromNumber(cardNumberRaw);
  return entry;
}

function formatLocalDateKey(date) {
  if (!(date instanceof Date)) {
    return '';
  }
  const time = date.getTime();
  if (Number.isNaN(time)) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveShiftStartHour(calculations = {}, defaults = {}) {
  if (Number.isFinite(Number(calculations.shiftStartHour))) {
    return Number(calculations.shiftStartHour);
  }
  if (Number.isFinite(Number(calculations.nightEndHour))) {
    return Number(calculations.nightEndHour);
  }
  if (Number.isFinite(Number(defaults.shiftStartHour))) {
    return Number(defaults.shiftStartHour);
  }
  if (Number.isFinite(Number(defaults.nightEndHour))) {
    return Number(defaults.nightEndHour);
  }
  return 7;
}

function computeShiftDateKey(referenceDate, shiftStartHour) {
  if (!(referenceDate instanceof Date) || Number.isNaN(referenceDate.getTime())) {
    return '';
  }
  const dayMinutes = 24 * 60;
  const startMinutesRaw = Number.isFinite(Number(shiftStartHour)) ? Number(shiftStartHour) * 60 : 7 * 60;
  const startMinutes = ((Math.round(startMinutesRaw) % dayMinutes) + dayMinutes) % dayMinutes;
  const arrivalMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
  const shiftAnchor = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  if (arrivalMinutes < startMinutes) {
    shiftAnchor.setDate(shiftAnchor.getDate() - 1);
  }
  return formatLocalDateKey(shiftAnchor);
}

function computeDailyStats(data, calculations, defaults) {
  const shiftStartHour = resolveShiftStartHour(calculations, defaults);
  const dailyMap = new Map();
  data.forEach((record) => {
    const hasArrival = record.arrival instanceof Date && !Number.isNaN(record.arrival.getTime());
    const hasDischarge = record.discharge instanceof Date && !Number.isNaN(record.discharge.getTime());
    const reference = hasArrival ? record.arrival : (hasDischarge ? record.discharge : null);
    const dateKey = computeShiftDateKey(reference, shiftStartHour);
    if (!dateKey) {
      return;
    }
    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        date: dateKey,
        count: 0,
        night: 0,
        ems: 0,
        discharged: 0,
        hospitalized: 0,
        totalTime: 0,
        durations: 0,
        hospitalizedTime: 0,
        hospitalizedDurations: 0,
      });
    }
    const summary = dailyMap.get(dateKey);
    summary.count += 1;
    summary.night += record.night ? 1 : 0;
    summary.ems += record.ems ? 1 : 0;
    if (record.hospitalized) {
      summary.hospitalized += 1;
    } else {
      summary.discharged += 1;
    }
    if (hasArrival && hasDischarge) {
      const duration = (record.discharge.getTime() - record.arrival.getTime()) / 3600000;
      if (Number.isFinite(duration) && duration >= 0 && duration <= 24) {
        summary.totalTime += duration;
        summary.durations += 1;
        if (record.hospitalized) {
          summary.hospitalizedTime += duration;
          summary.hospitalizedDurations += 1;
        }
      }
    }
  });
  return Array.from(dailyMap.values())
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .map((item) => ({
      ...item,
      avgTime: item.durations ? item.totalTime / item.durations : 0,
      avgHospitalizedTime: item.hospitalizedDurations
        ? item.hospitalizedTime / item.hospitalizedDurations
        : 0,
    }));
}
