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
    } else if (type === 'transformEdCsv') {
      const { csvText, options } = event.data;
      payload = transformEdCsvWithSummary(csvText, options || {});
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
    age: resolveColumnIndex(headerNormalized, csvRuntime.ageHeaders),
    sex: resolveColumnIndex(headerNormalized, csvRuntime.sexHeaders),
    address: resolveColumnIndex(headerNormalized, csvRuntime.addressHeaders),
    pspc: resolveColumnIndex(headerNormalized, csvRuntime.pspcHeaders),
    diagnosis: resolveColumnIndex(headerNormalized, csvRuntime.diagnosisHeaders),
    referral: resolveColumnIndex(headerNormalized, csvRuntime.referralHeaders),
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
      if (key === 'age' || key === 'sex' || key === 'address' || key === 'pspc' || key === 'diagnosis' || key === 'referral') {
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
  const shiftStartHour = resolveShiftStartHour(calculations, calculationDefaults);
  const hospitalByDeptStayAgg = createHospitalizedDeptStayAgg();
  const records = [];
  for (let index = 0; index < dataRows.length; index += 1) {
    const cols = dataRows[index];
    const record = mapRow(
      header,
      cols,
      delimiter,
      columnIndices,
      csvRuntime,
      calculations,
      calculationDefaults,
    );
    records.push(record);
    accumulateHospitalizedDeptStayAgg(hospitalByDeptStayAgg, record, shiftStartHour);
    if (reportProgress && ((index + 1) % progressStep === 0 || index + 1 === totalRows)) {
      reportProgress(index + 1, totalRows);
    }
  }
  const dailyStats = computeDailyStats(records, calculations, calculationDefaults);
  return { records, dailyStats, hospitalByDeptStayAgg };
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

function transformEdCsvWithSummary(text, options = {}) {
  void options;
  if (!text) {
    throw new Error('ED CSV turinys tuščias.');
  }
  const { rows } = parseCsv(text);
  if (!rows.length) {
    throw new Error('ED CSV neturi jokių eilučių.');
  }
  const header = rows[0].map((cell) => String(cell ?? '').trim());
  const headerNormalized = header.map((column, index) => ({
    original: column,
    normalized: column.toLowerCase(),
    index,
  }));
  const legacyCandidates = {
    date: ['date', 'data', 'service date', 'diena', 'atvykimo data'],
    arrival: ['arrival', 'arrival time', 'atvykimo laikas', 'atvykimo data', 'registered'],
    departure: ['departure', 'departure time', 'discharge', 'išrašymo data', 'išvykimo laikas', 'completion'],
    disposition: ['disposition', 'outcome', 'sprendimas', 'status', 'būsena', 'dispo'],
    los: ['length of stay (min)', 'los (min)', 'stay (min)', 'trukmė (min)', 'los minutes', 'los_min'],
    door: ['door to provider (min)', 'door to doctor (min)', 'door to doc (min)', 'door to physician (min)', 'laukimo laikas (min)', 'durys iki gydytojo (min)'],
    decision: ['decision to depart (min)', 'boarding (min)', 'decision to leave (min)', 'disposition to depart (min)', 'sprendimo laukimas (min)'],
    lab: [
      'avg lab turnaround (min)',
      'lab turnaround (min)',
      'vid. lab. tyrimų laikas (min)',
      'vid. lab. tyrimų laikas',
      'vid. lab. tyrimu laikas (min)',
      'vid. lab. tyrimu laikas',
      'lab',
      'laboratorijos trukmė (min)',
    ],
  };
  const snapshotCandidates = {
    timestamp: ['timestamp', 'datetime', 'laikas', 'įrašyta', 'atnaujinta', 'data', 'created', 'updated'],
    currentPatients: ['šiuo metu pacientų', 'current patients', 'patients now', 'patients in ed'],
    occupiedBeds: ['užimta lovų', 'occupied beds', 'beds occupied'],
    nurseRatio: ['slaugytojų - pacientų santykis', 'nurse - patient ratio', 'nurse to patient ratio', 'nurse ratio'],
    doctorRatio: ['gydytojų - pacientų santykis', 'doctor - patient ratio', 'doctor to patient ratio', 'physician ratio'],
    lab: ['lab', 'avg lab turnaround (min)', 'lab turnaround (min)', 'vid. lab. tyrimų laikas (min)', 'vid. lab. tyrimų laikas'],
    category1: ['1 kategorijos pacientų', 'category 1 patients', 'patients category 1', 'c1'],
    category2: ['2 kategorijos pacientų', 'category 2 patients', 'patients category 2', 'c2'],
    category3: ['3 kategorijos pacientų', 'category 3 patients', 'patients category 3', 'c3'],
    category4: ['4 kategorijos pacientų', 'category 4 patients', 'patients category 4', 'c4'],
    category5: ['5 kategorijos pacientų', 'category 5 patients', 'patients category 5', 'c5'],
  };
  const legacyIndices = {
    date: resolveColumnIndex(headerNormalized, legacyCandidates.date),
    arrival: resolveColumnIndex(headerNormalized, legacyCandidates.arrival),
    departure: resolveColumnIndex(headerNormalized, legacyCandidates.departure),
    disposition: resolveColumnIndex(headerNormalized, legacyCandidates.disposition),
    los: resolveColumnIndex(headerNormalized, legacyCandidates.los),
    door: resolveColumnIndex(headerNormalized, legacyCandidates.door),
    decision: resolveColumnIndex(headerNormalized, legacyCandidates.decision),
    lab: resolveColumnIndex(headerNormalized, legacyCandidates.lab),
  };
  const snapshotIndices = {
    timestamp: resolveColumnIndex(headerNormalized, snapshotCandidates.timestamp),
    currentPatients: resolveColumnIndex(headerNormalized, snapshotCandidates.currentPatients),
    occupiedBeds: resolveColumnIndex(headerNormalized, snapshotCandidates.occupiedBeds),
    nurseRatio: resolveColumnIndex(headerNormalized, snapshotCandidates.nurseRatio),
    doctorRatio: resolveColumnIndex(headerNormalized, snapshotCandidates.doctorRatio),
    lab: resolveColumnIndex(headerNormalized, snapshotCandidates.lab),
    category1: resolveColumnIndex(headerNormalized, snapshotCandidates.category1),
    category2: resolveColumnIndex(headerNormalized, snapshotCandidates.category2),
    category3: resolveColumnIndex(headerNormalized, snapshotCandidates.category3),
    category4: resolveColumnIndex(headerNormalized, snapshotCandidates.category4),
    category5: resolveColumnIndex(headerNormalized, snapshotCandidates.category5),
  };
  const hasSnapshot = Object.values(snapshotIndices).some((index) => index >= 0);
  const hasLegacy = Object.values(legacyIndices).some((index) => index >= 0);
  const datasetType = hasSnapshot && hasLegacy ? 'hybrid' : (hasSnapshot ? 'snapshot' : 'legacy');

  const records = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || !row.length) {
      continue;
    }
    const normalizedRow = header.map((_, index) => String(row[index] ?? '').trim());
    const timestampRaw = snapshotIndices.timestamp >= 0 ? normalizedRow[snapshotIndices.timestamp] : '';
    const timestamp = timestampRaw ? parseDate(timestampRaw) : null;
    const arrivalValue = legacyIndices.arrival >= 0 ? normalizedRow[legacyIndices.arrival] : '';
    const departureValue = legacyIndices.departure >= 0 ? normalizedRow[legacyIndices.departure] : '';
    const dateValue = legacyIndices.date >= 0 ? normalizedRow[legacyIndices.date] : '';
    const arrivalDate = arrivalValue ? parseDate(arrivalValue) : null;
    const departureDate = departureValue ? parseDate(departureValue) : null;
    const recordDate = dateValue ? parseDate(dateValue) : (arrivalDate || departureDate || timestamp);
    const dateKey = recordDate ? toDateKeyFromDate(recordDate) : '';
    const dispositionInfo = normalizeEdDisposition(legacyIndices.disposition >= 0 ? normalizedRow[legacyIndices.disposition] : '');
    let losMinutes = legacyIndices.los >= 0 ? parseDurationMinutesWorker(normalizedRow[legacyIndices.los]) : null;
    if (!Number.isFinite(losMinutes) && arrivalDate instanceof Date && departureDate instanceof Date) {
      const diffMinutes = (departureDate.getTime() - arrivalDate.getTime()) / 60000;
      losMinutes = Number.isFinite(diffMinutes) && diffMinutes >= 0 ? diffMinutes : null;
    }
    const record = {
      dateKey,
      timestamp: timestamp instanceof Date && !Number.isNaN(timestamp.getTime()) ? timestamp : null,
      rawTimestamp: timestampRaw,
      disposition: dispositionInfo.label,
      dispositionCategory: dispositionInfo.category,
      losMinutes: Number.isFinite(losMinutes) && losMinutes >= 0 ? losMinutes : null,
      doorToProviderMinutes: legacyIndices.door >= 0 ? parseDurationMinutesWorker(normalizedRow[legacyIndices.door]) : null,
      decisionToLeaveMinutes: legacyIndices.decision >= 0 ? parseDurationMinutesWorker(normalizedRow[legacyIndices.decision]) : null,
      labMinutes: legacyIndices.lab >= 0 ? parseDurationMinutesWorker(normalizedRow[legacyIndices.lab]) : null,
      snapshotLabMinutes: snapshotIndices.lab >= 0 ? parseNumericCellWorker(normalizedRow[snapshotIndices.lab]) : null,
      currentPatients: snapshotIndices.currentPatients >= 0 ? parseNumericCellWorker(normalizedRow[snapshotIndices.currentPatients]) : null,
      occupiedBeds: snapshotIndices.occupiedBeds >= 0 ? parseNumericCellWorker(normalizedRow[snapshotIndices.occupiedBeds]) : null,
      nurseRatio: snapshotIndices.nurseRatio >= 0 ? parseRatioWorker(normalizedRow[snapshotIndices.nurseRatio]).ratio : null,
      nurseRatioText: snapshotIndices.nurseRatio >= 0 ? parseRatioWorker(normalizedRow[snapshotIndices.nurseRatio]).text : '',
      doctorRatio: snapshotIndices.doctorRatio >= 0 ? parseRatioWorker(normalizedRow[snapshotIndices.doctorRatio]).ratio : null,
      doctorRatioText: snapshotIndices.doctorRatio >= 0 ? parseRatioWorker(normalizedRow[snapshotIndices.doctorRatio]).text : '',
      categories: {
        1: snapshotIndices.category1 >= 0 ? parseNumericCellWorker(normalizedRow[snapshotIndices.category1]) : null,
        2: snapshotIndices.category2 >= 0 ? parseNumericCellWorker(normalizedRow[snapshotIndices.category2]) : null,
        3: snapshotIndices.category3 >= 0 ? parseNumericCellWorker(normalizedRow[snapshotIndices.category3]) : null,
        4: snapshotIndices.category4 >= 0 ? parseNumericCellWorker(normalizedRow[snapshotIndices.category4]) : null,
        5: snapshotIndices.category5 >= 0 ? parseNumericCellWorker(normalizedRow[snapshotIndices.category5]) : null,
      },
      arrivalHour: arrivalDate instanceof Date && !Number.isNaN(arrivalDate.getTime()) ? arrivalDate.getHours() : null,
      departureHour: departureDate instanceof Date && !Number.isNaN(departureDate.getTime()) ? departureDate.getHours() : null,
    };
    if (datasetType !== 'snapshot' || Number.isFinite(record.currentPatients) || Number.isFinite(record.occupiedBeds)) {
      records.push(record);
    }
  }
  const summary = summarizeEdRecordsWorker(records, datasetType);
  return {
    records,
    summary: summary.summary,
    dispositions: summary.dispositions,
    daily: summary.daily,
    meta: { type: summary.type },
  };
}

function summarizeEdRecordsWorker(records, mode = 'legacy') {
  if (mode === 'snapshot') {
    return summarizeSnapshotWorker(records);
  }
  if (mode === 'hybrid') {
    const legacy = summarizeLegacyWorker(records);
    const snapshot = summarizeSnapshotWorker(records);
    const hasSnapshotMetrics = Number.isFinite(snapshot.summary.currentPatients)
      || Number.isFinite(snapshot.summary.occupiedBeds)
      || Number.isFinite(snapshot.summary.nursePatientsPerStaff)
      || Number.isFinite(snapshot.summary.doctorPatientsPerStaff);
    if (hasSnapshotMetrics) {
      return {
        type: 'hybrid',
        summary: { ...legacy.summary, ...snapshot.summary, mode: 'hybrid' },
        dispositions: snapshot.dispositions.length ? snapshot.dispositions : legacy.dispositions,
        daily: snapshot.daily.length ? snapshot.daily : legacy.daily,
      };
    }
    return { type: 'legacy', summary: legacy.summary, dispositions: legacy.dispositions, daily: legacy.daily };
  }
  return summarizeLegacyWorker(records);
}

function summarizeLegacyWorker(records) {
  const dailyMap = new Map();
  const dispositionMap = new Map();
  let totalPatients = 0;
  records.forEach((record) => {
    if (!record || !record.dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(record.dateKey)) {
      return;
    }
    totalPatients += 1;
    const existing = dailyMap.get(record.dateKey) || { dateKey: record.dateKey, patients: 0, losSum: 0, losCount: 0 };
    existing.patients += 1;
    if (Number.isFinite(record.losMinutes) && record.losMinutes >= 0) {
      existing.losSum += record.losMinutes;
      existing.losCount += 1;
    }
    dailyMap.set(record.dateKey, existing);
    const label = record.disposition || 'Nežinoma';
    const dispo = dispositionMap.get(label) || { label, count: 0, category: record.dispositionCategory || 'other' };
    dispo.count += 1;
    dispositionMap.set(label, dispo);
  });
  const daily = Array.from(dailyMap.values()).sort((a, b) => (a.dateKey > b.dateKey ? -1 : 1)).map((entry) => ({
    dateKey: entry.dateKey,
    patients: entry.patients,
    avgLosMinutes: entry.losCount > 0 ? entry.losSum / entry.losCount : null,
  }));
  const dispositions = Array.from(dispositionMap.values()).sort((a, b) => b.count - a.count).map((entry) => ({
    ...entry,
    share: totalPatients > 0 ? entry.count / totalPatients : null,
  }));
  return {
    type: 'legacy',
    summary: {
      mode: 'legacy',
      totalPatients,
      uniqueDates: dailyMap.size,
      avgDailyPatients: dailyMap.size > 0 ? totalPatients / dailyMap.size : null,
      generatedAt: new Date(),
    },
    dispositions,
    daily,
  };
}

function summarizeSnapshotWorker(records) {
  const valid = Array.isArray(records) ? records.filter((item) => item && typeof item.dateKey === 'string') : [];
  if (!valid.length) {
    return { type: 'snapshot', summary: { mode: 'snapshot', entryCount: 0, generatedAt: new Date() }, dispositions: [], daily: [] };
  }
  const sorted = valid.slice().sort((a, b) => (a.dateKey > b.dateKey ? 1 : -1));
  const latest = sorted[sorted.length - 1];
  const categoryTotals = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let categorySum = 0;
  ['1', '2', '3', '4', '5'].forEach((key) => {
    const value = latest?.categories?.[key];
    if (Number.isFinite(value) && value >= 0) {
      categoryTotals[key] = value;
      categorySum += value;
    }
  });
  const dispositions = ['1', '2', '3', '4', '5']
    .filter((key) => Number.isFinite(categoryTotals[key]) && categoryTotals[key] > 0)
    .map((key) => ({
      label: `${key} kategorija`,
      count: categoryTotals[key],
      share: categorySum > 0 ? categoryTotals[key] / categorySum : null,
      categoryKey: key,
    }));
  return {
    type: 'snapshot',
    summary: {
      mode: 'snapshot',
      entryCount: valid.length,
      currentPatients: Number.isFinite(latest?.currentPatients) ? latest.currentPatients : null,
      occupiedBeds: Number.isFinite(latest?.occupiedBeds) ? latest.occupiedBeds : null,
      nursePatientsPerStaff: Number.isFinite(latest?.nurseRatio) ? latest.nurseRatio : null,
      doctorPatientsPerStaff: Number.isFinite(latest?.doctorRatio) ? latest.doctorRatio : null,
      latestSnapshotLabel: latest?.dateKey || '',
      latestSnapshotAt: latest?.timestamp || null,
      generatedAt: new Date(),
    },
    dispositions,
    daily: [],
  };
}

function parseDurationMinutesWorker(value) {
  if (value == null) {
    return null;
  }
  const normalized = String(value).trim().replace(',', '.').replace(/\s+/g, '');
  if (!normalized) {
    return null;
  }
  if (/^\d{1,2}:\d{2}$/.test(normalized)) {
    const [hours, minutes] = normalized.split(':').map((part) => Number.parseInt(part, 10));
    if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
      return (hours * 60) + minutes;
    }
  }
  const valueFloat = Number.parseFloat(normalized);
  return Number.isFinite(valueFloat) ? valueFloat : null;
}

function parseNumericCellWorker(value) {
  if (value == null) {
    return null;
  }
  const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  if (!normalized) {
    return null;
  }
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseRatioWorker(value) {
  if (value == null) {
    return { ratio: null, text: '' };
  }
  const text = String(value).trim();
  if (!text) {
    return { ratio: null, text: '' };
  }
  const normalized = text.replace(',', '.').replace(/\s+/g, '');
  if (normalized.includes(':')) {
    const [left, right] = normalized.split(':');
    const numerator = Number.parseFloat(left);
    const denominator = Number.parseFloat(right);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      return { ratio: numerator / denominator, text };
    }
  }
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? { ratio: numeric, text } : { ratio: null, text };
}

function normalizeEdDisposition(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    return { label: 'Nežinoma', category: 'unknown' };
  }
  const lower = raw.toLowerCase();
  if (/(hospital|stacion|admit|ward|perkel|stacionar|stac\.|priimtuvas)/i.test(lower)) {
    return { label: raw, category: 'hospitalized' };
  }
  if (/(discharg|nam|ambulator|released|outpatient|home|išle)/i.test(lower)) {
    return { label: raw, category: 'discharged' };
  }
  if (/(transfer|perkeltas|perkelta|pervež|perkėlimo)/i.test(lower)) {
    return { label: raw, category: 'transfer' };
  }
  if (/(left|atsisak|neatvyko|nedalyv|amoa|dnw|did not wait|lwbs|lwt|pabėg|walked)/i.test(lower)) {
    return { label: raw, category: 'left' };
  }
  return { label: raw, category: 'other' };
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

function normalizeHeaderToken(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCsvRuntime(csvSettings = {}, csvDefaults = {}) {
  const fallback = csvDefaults || {};
  const hardDefaults = {
    arrival: 'Atvykimo data',
    discharge: 'Išrašymo data',
    dayNight: 'Diena/naktis',
    gmp: 'GMP',
    department: 'Nukreiptas į padalinį',
    number: 'Numeris',
    age: 'Amžius;Amzius',
    sex: 'Lytis;Litis',
    address: 'Adresas;Miestas;Gyvenamoji vieta',
    pspc: 'PSPC įstaiga;PSPC istaiga;PSPC',
    diagnosis: 'Galutinės diagnozės;Galutines diagnozes;Galutinė diagnozė;Galutine diagnoze',
    referral: 'Siuntimas;Siuntimas iš;Siuntimo tipas',
  };
  const departmentHasValue = csvSettings.department && csvSettings.department.trim().length > 0;
  const cardNumberHasValue = csvSettings.number && csvSettings.number.trim().length > 0;
  const departmentHeaders = departmentHasValue
    ? toHeaderCandidates(csvSettings.department, '')
    : [];
  const cardNumberHeaders = cardNumberHasValue
    ? toHeaderCandidates(csvSettings.number, '')
    : toHeaderCandidates('', fallback.number);
  const runtime = {
    arrivalHeaders: toHeaderCandidates(csvSettings.arrival, fallback.arrival || hardDefaults.arrival),
    dischargeHeaders: toHeaderCandidates(csvSettings.discharge, fallback.discharge || hardDefaults.discharge),
    dayNightHeaders: toHeaderCandidates(csvSettings.dayNight, fallback.dayNight || hardDefaults.dayNight),
    gmpHeaders: toHeaderCandidates(csvSettings.gmp, fallback.gmp || hardDefaults.gmp),
    departmentHeaders,
    cardNumberHeaders,
    ageHeaders: toHeaderCandidates(csvSettings.age, fallback.age || hardDefaults.age),
    sexHeaders: toHeaderCandidates(csvSettings.sex, fallback.sex || hardDefaults.sex),
    addressHeaders: toHeaderCandidates(csvSettings.address, fallback.address || hardDefaults.address),
    pspcHeaders: toHeaderCandidates(csvSettings.pspc, fallback.pspc || hardDefaults.pspc),
    diagnosisHeaders: toHeaderCandidates(csvSettings.diagnosis, fallback.diagnosis || hardDefaults.diagnosis),
    referralHeaders: toHeaderCandidates(csvSettings.referral, fallback.referral || hardDefaults.referral),
    trueValues: toNormalizedList(csvSettings.trueValues, fallback.trueValues),
    fallbackTrueValues: toNormalizedList(fallback.trueValues, fallback.trueValues),
    hospitalizedValues: toNormalizedList(csvSettings.hospitalizedValues, fallback.hospitalizedValues),
    nightKeywords: toNormalizedList(csvSettings.nightKeywords, fallback.nightKeywords),
    dayKeywords: toNormalizedList(csvSettings.dayKeywords, fallback.dayKeywords),
    labels: {
      arrival: csvSettings.arrival || fallback.arrival || hardDefaults.arrival,
      discharge: csvSettings.discharge || fallback.discharge || hardDefaults.discharge,
      dayNight: csvSettings.dayNight || fallback.dayNight || hardDefaults.dayNight,
      gmp: csvSettings.gmp || fallback.gmp || hardDefaults.gmp,
      department: departmentHasValue ? csvSettings.department : (fallback.department || hardDefaults.department),
      cardNumber: cardNumberHasValue ? csvSettings.number : (fallback.number || hardDefaults.number),
      age: csvSettings.age || fallback.age || hardDefaults.age,
      sex: csvSettings.sex || fallback.sex || hardDefaults.sex,
      address: csvSettings.address || fallback.address || hardDefaults.address,
      pspc: csvSettings.pspc || fallback.pspc || hardDefaults.pspc,
      diagnosis: csvSettings.diagnosis || fallback.diagnosis || hardDefaults.diagnosis,
      referral: csvSettings.referral || fallback.referral || hardDefaults.referral,
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
  const normalizedHeader = headerNormalized.map((column) => ({
    ...column,
    foldedOriginal: normalizeHeaderToken(column.original),
    foldedNormalized: normalizeHeaderToken(column.normalized),
  }));
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    const match = normalizedHeader.find((column) => column.original === trimmed);
    if (match) {
      return match.index;
    }
  }
  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase();
    const match = normalizedHeader.find((column) => column.normalized === normalized);
    if (match) {
      return match.index;
    }
  }
  for (const candidate of candidates) {
    const foldedCandidate = normalizeHeaderToken(candidate);
    const match = normalizedHeader.find((column) => column.foldedOriginal === foldedCandidate || column.foldedNormalized === foldedCandidate);
    if (match) {
      return match.index;
    }
  }
  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase();
    const match = normalizedHeader.find((column) => column.normalized.includes(normalized));
    if (match) {
      return match.index;
    }
  }
  for (const candidate of candidates) {
    const foldedCandidate = normalizeHeaderToken(candidate);
    const match = normalizedHeader.find((column) => column.foldedOriginal.includes(foldedCandidate) || column.foldedNormalized.includes(foldedCandidate));
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

function parseAgeYears(value) {
  if (value == null) {
    return null;
  }
  const normalized = String(value).trim().replace(',', '.');
  if (!normalized) {
    return null;
  }
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 120) {
    return null;
  }
  return Math.round(parsed);
}

function resolveAgeBand(ageYears) {
  if (!Number.isFinite(ageYears)) {
    return 'Nenurodyta';
  }
  if (ageYears <= 17) {
    return '0-17';
  }
  if (ageYears <= 34) {
    return '18-34';
  }
  if (ageYears <= 49) {
    return '35-49';
  }
  if (ageYears <= 64) {
    return '50-64';
  }
  if (ageYears <= 79) {
    return '65-79';
  }
  return '80+';
}

function normalizeSexValue(value) {
  if (value == null) {
    return 'Kita/Nenurodyta';
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return 'Kita/Nenurodyta';
  }
  if (['f', 'female', 'moteris', 'motr', 'mot'].includes(normalized)) {
    return 'Moteris';
  }
  if (['m', 'male', 'vyras', 'vyr'].includes(normalized)) {
    return 'Vyras';
  }
  return 'Kita/Nenurodyta';
}

function normalizeAddressArea(value) {
  if (value == null) {
    return '';
  }
  const raw = String(value).trim();
  if (!raw) {
    return '';
  }
  const firstPart = raw.split(/[,;]+/)[0] || raw;
  return firstPart.replace(/\s+/g, ' ').trim();
}

function normalizeSimpleText(value) {
  if (value == null) {
    return '';
  }
  return String(value).trim().replace(/\s+/g, ' ');
}

function normalizeDiacritics(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeCityToken(value) {
  return normalizeDiacritics(String(value ?? ''))
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCityName(value) {
  const raw = normalizeSimpleText(value);
  if (!raw) {
    return '';
  }
  const parts = raw.split(/[,;]+/).map((part) => normalizeSimpleText(part)).filter(Boolean);
  const candidates = parts.length ? parts : [raw];
  const stopWords = ['g.', 'gatve', 'gatvė', 'pr.', 'prospektas', 'al.', 'aleja', 'raj.', 'rajonas'];
  let chosen = candidates[candidates.length - 1];
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const token = candidates[i];
    const normalized = normalizeCityToken(token);
    const hasStop = stopWords.some((word) => normalized.includes(word));
    if (!hasStop && /[A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž]/.test(token)) {
      chosen = token;
      break;
    }
  }
  const cleaned = chosen
    .replace(/\b(LT-?\d{3,5}|Lietuva|Lithuania)\b/gi, '')
    .replace(/\b(m\.?|miestas|m\.)\b/gi, '')
    .replace(/\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) {
    return '';
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function parseReferralValue(value) {
  const normalized = normalizeSimpleText(value).toLowerCase();
  if (!normalized) {
    return 'Nenurodyta';
  }
  if (normalized === 'su siuntimu') {
    return 'su siuntimu';
  }
  if (normalized === 'be siuntimo') {
    return 'be siuntimo';
  }
  if (normalized.includes('su') && normalized.includes('siunt')) {
    return 'su siuntimu';
  }
  if (normalized.includes('be') && normalized.includes('siunt')) {
    return 'be siuntimo';
  }
  return 'Nenurodyta';
}

function extractDiagnosisCodes(value) {
  const raw = normalizeSimpleText(value).toUpperCase();
  if (!raw) {
    return [];
  }
  const regex = /[A-Z]\d{2}(?:\.\d{1,2})?/g;
  const matches = raw.match(regex) || [];
  const unique = [];
  const seen = new Set();
  matches.forEach((code) => {
    const normalized = String(code || '').trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    unique.push(normalized);
  });
  return unique;
}

function resolveDiagnosisGroup(code) {
  if (!code) {
    return '';
  }
  const match = code.match(/^([A-Z])(\d{2})/);
  if (!match) {
    return '';
  }
  const letter = match[1];
  if (letter >= 'A' && letter <= 'B') {
    return 'A-B';
  }
  if (letter >= 'C' && letter <= 'D') {
    return 'C-D';
  }
  if (letter === 'E') {
    return 'E';
  }
  if (letter >= 'F' && letter <= 'F') {
    return 'F';
  }
  if (letter >= 'G' && letter <= 'G') {
    return 'G';
  }
  if (letter >= 'H' && letter <= 'H') {
    return 'H';
  }
  if (letter >= 'I' && letter <= 'I') {
    return 'I';
  }
  if (letter >= 'J' && letter <= 'J') {
    return 'J';
  }
  if (letter >= 'K' && letter <= 'K') {
    return 'K';
  }
  if (letter >= 'L' && letter <= 'L') {
    return 'L';
  }
  if (letter >= 'M' && letter <= 'M') {
    return 'M';
  }
  if (letter >= 'N' && letter <= 'N') {
    return 'N';
  }
  if (letter >= 'O' && letter <= 'O') {
    return 'O';
  }
  if (letter >= 'P' && letter <= 'P') {
    return 'P';
  }
  if (letter >= 'Q' && letter <= 'Q') {
    return 'Q';
  }
  if (letter >= 'R' && letter <= 'R') {
    return 'R';
  }
  if (letter >= 'S' && letter <= 'T') {
    return 'S-T';
  }
  if (letter >= 'V' && letter <= 'Y') {
    return 'V-Y';
  }
  if (letter >= 'Z' && letter <= 'Z') {
    return 'Z';
  }
  return letter;
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
  const ageRaw = indices.age >= 0 ? normalized[indices.age] ?? '' : '';
  const sexRaw = indices.sex >= 0 ? normalized[indices.sex] ?? '' : '';
  const addressRaw = indices.address >= 0 ? normalized[indices.address] ?? '' : '';
  const pspcRaw = indices.pspc >= 0 ? normalized[indices.pspc] ?? '' : '';
  const diagnosisRaw = indices.diagnosis >= 0 ? normalized[indices.diagnosis] ?? '' : '';
  const referralRaw = indices.referral >= 0 ? normalized[indices.referral] ?? '' : '';
  const hasExtendedColumns = indices.age >= 0
    || indices.sex >= 0
    || indices.address >= 0
    || indices.pspc >= 0
    || indices.diagnosis >= 0
    || indices.referral >= 0;
  entry.arrival = parseDate(arrivalRaw);
  entry.discharge = parseDate(dischargeRaw);
  entry.arrivalHasTime = detectHasTime(arrivalRaw);
  entry.dischargeHasTime = detectHasTime(dischargeRaw);
  entry.night = detectNight(dayNightRaw, entry.arrival, csvRuntime, calculations, calculationDefaults);
  entry.ems = parseBoolean(gmpRaw, csvRuntime.trueValues, csvRuntime.fallbackTrueValues);
  entry.department = departmentRaw != null ? String(departmentRaw).trim() : '';
  entry.hospitalized = detectHospitalized(departmentRaw, csvRuntime);
  entry.cardType = detectCardTypeFromNumber(cardNumberRaw);
  entry.ageYears = parseAgeYears(ageRaw);
  entry.ageBand = resolveAgeBand(entry.ageYears);
  entry.sex = normalizeSexValue(sexRaw);
  entry.cityRaw = normalizeSimpleText(addressRaw);
  entry.cityNorm = normalizeCityName(addressRaw);
  entry.addressArea = entry.cityNorm || normalizeAddressArea(addressRaw);
  entry.pspc = normalizeSimpleText(pspcRaw);
  entry.diagnosisCodes = extractDiagnosisCodes(diagnosisRaw);
  entry.diagnosisCode = entry.diagnosisCodes[0] || '';
  entry.diagnosisGroups = entry.diagnosisCodes
    .map((code) => resolveDiagnosisGroup(code))
    .filter((group, index, list) => group && list.indexOf(group) === index);
  entry.diagnosisGroup = entry.diagnosisGroups[0] || 'Nenurodyta';
  entry.referral = parseReferralValue(referralRaw);
  entry.referred = entry.referral === 'su siuntimu';
  entry.hasExtendedHistoricalFields = hasExtendedColumns;
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

function toDateKeyFromDate(date) {
  return formatLocalDateKey(date);
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

function createHospitalizedDeptStayAgg() {
  return { byYear: Object.create(null) };
}

function ensureHospitalAggBucket(agg, year, department) {
  if (!agg.byYear[year]) {
    agg.byYear[year] = Object.create(null);
  }
  if (!agg.byYear[year][department]) {
    agg.byYear[year][department] = {
      count_lt4: 0,
      count_4_8: 0,
      count_8_16: 0,
      count_gt16: 0,
      count_unclassified: 0,
      total: 0,
    };
  }
  return agg.byYear[year][department];
}

function resolveHospitalStayBucket(durationHours) {
  if (!Number.isFinite(durationHours) || durationHours < 0 || durationHours > 24) {
    return 'unclassified';
  }
  if (durationHours < 4) {
    return 'lt4';
  }
  if (durationHours < 8) {
    return '4to8';
  }
  if (durationHours < 16) {
    return '8to16';
  }
  return 'gt16';
}

function accumulateHospitalizedDeptStayAgg(agg, record, shiftStartHour) {
  if (!agg || !record || record.hospitalized !== true) {
    return;
  }
  const hasArrival = record.arrival instanceof Date && !Number.isNaN(record.arrival.getTime());
  const hasDischarge = record.discharge instanceof Date && !Number.isNaN(record.discharge.getTime());
  const reference = hasArrival ? record.arrival : (hasDischarge ? record.discharge : null);
  const dateKey = computeShiftDateKey(reference, shiftStartHour);
  if (!dateKey) {
    return;
  }
  const year = dateKey.slice(0, 4);
  if (!/^\d{4}$/.test(year)) {
    return;
  }
  const department = String(record.department || '').trim() || 'Nenurodyta';
  const bucket = ensureHospitalAggBucket(agg, year, department);
  const durationHours = hasArrival && hasDischarge
    ? (record.discharge.getTime() - record.arrival.getTime()) / 3600000
    : Number.NaN;
  const stayBucket = resolveHospitalStayBucket(durationHours);
  if (stayBucket === 'lt4') {
    bucket.count_lt4 += 1;
  } else if (stayBucket === '4to8') {
    bucket.count_4_8 += 1;
  } else if (stayBucket === '8to16') {
    bucket.count_8_16 += 1;
  } else if (stayBucket === 'gt16') {
    bucket.count_gt16 += 1;
  } else {
    bucket.count_unclassified += 1;
  }
  bucket.total += 1;
}
