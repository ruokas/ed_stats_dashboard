/*
 * Data transformation and aggregation helpers for the dashboard worker.
 */

function transformCsvWithStats(text, options = {}, progressOptions = {}) {
  if (!text) {
    throw new Error('CSV turinys tuščias.');
  }
  const { csvSettings = {}, csvDefaults = {}, calculations = {}, calculationDefaults = {} } = options;
  const progressStep =
    Number.isInteger(progressOptions.progressStep) && progressOptions.progressStep > 0
      ? progressOptions.progressStep
      : 500;
  const reportProgress =
    typeof progressOptions.reportProgress === 'function' ? progressOptions.reportProgress : null;
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
      if (
        key === 'age' ||
        key === 'sex' ||
        key === 'address' ||
        key === 'pspc' ||
        key === 'diagnosis' ||
        key === 'referral'
      ) {
        return false;
      }
      return true;
    })
    .map(([key]) => csvRuntime.labels[key]);
  if (missing.length) {
    throw new Error(`CSV faile nerasti stulpeliai: ${missing.join(', ')}`);
  }
  const dataRows = rows.slice(1).filter((row) => row.some((cell) => (cell ?? '').trim().length > 0));
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
      calculationDefaults
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
  const departmentHeaders = departmentHasValue ? toHeaderCandidates(csvSettings.department, '') : [];
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
      department: departmentHasValue
        ? csvSettings.department
        : fallback.department || hardDefaults.department,
      cardNumber: cardNumberHasValue ? csvSettings.number : fallback.number || hardDefaults.number,
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
    const match = normalizedHeader.find(
      (column) => column.foldedOriginal === foldedCandidate || column.foldedNormalized === foldedCandidate
    );
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
    const match = normalizedHeader.find(
      (column) =>
        column.foldedOriginal.includes(foldedCandidate) || column.foldedNormalized.includes(foldedCandidate)
    );
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
  const candidates =
    Array.isArray(trueValues) && trueValues.length
      ? trueValues
      : Array.isArray(fallbackTrueValues)
        ? fallbackTrueValues
        : [];
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
  const parts = raw
    .split(/[,;]+/)
    .map((part) => normalizeSimpleText(part))
    .filter(Boolean);
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
  const sequences = new Set([letterSequence, ...upper.split(/[^A-Z]+/).filter((token) => token.length > 0)]);

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
  const fallbackEnd = Number.isFinite(Number(defaults?.nightEndHour)) ? Number(defaults.nightEndHour) : 7;
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
  const slashIso = normalized.match(
    /^(\d{4})[/](\d{1,2})[/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (slashIso) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = slashIso;
    parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const euMatch = normalized.match(
    /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (euMatch) {
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = euMatch;
    parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
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
  const cardNumberRaw = indices.cardNumber >= 0 ? (normalized[indices.cardNumber] ?? '') : '';
  const ageRaw = indices.age >= 0 ? (normalized[indices.age] ?? '') : '';
  const sexRaw = indices.sex >= 0 ? (normalized[indices.sex] ?? '') : '';
  const addressRaw = indices.address >= 0 ? (normalized[indices.address] ?? '') : '';
  const pspcRaw = indices.pspc >= 0 ? (normalized[indices.pspc] ?? '') : '';
  const diagnosisRaw = indices.diagnosis >= 0 ? (normalized[indices.diagnosis] ?? '') : '';
  const referralRaw = indices.referral >= 0 ? (normalized[indices.referral] ?? '') : '';
  const hasExtendedColumns =
    indices.age >= 0 ||
    indices.sex >= 0 ||
    indices.address >= 0 ||
    indices.pspc >= 0 ||
    indices.diagnosis >= 0 ||
    indices.referral >= 0;
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
  const shiftAnchor = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
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
    const reference = hasArrival ? record.arrival : hasDischarge ? record.discharge : null;
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
  const reference = hasArrival ? record.arrival : hasDischarge ? record.discharge : null;
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
  const durationHours =
    hasArrival && hasDischarge
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

self.transformCsvWithStats = transformCsvWithStats;
self.toDateKeyFromDate = toDateKeyFromDate;
