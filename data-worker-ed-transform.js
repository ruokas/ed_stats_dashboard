/*
 * ED-specific transformation and summarization helpers.
 * Depends on shared CSV/date helpers loaded from data-worker-transforms.js.
 */

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
    door: [
      'door to provider (min)',
      'door to doctor (min)',
      'door to doc (min)',
      'door to physician (min)',
      'laukimo laikas (min)',
      'durys iki gydytojo (min)',
    ],
    decision: [
      'decision to depart (min)',
      'boarding (min)',
      'decision to leave (min)',
      'disposition to depart (min)',
      'sprendimo laukimas (min)',
    ],
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
    nurseRatio: [
      'slaugytojų - pacientų santykis',
      'nurse - patient ratio',
      'nurse to patient ratio',
      'nurse ratio',
    ],
    doctorRatio: [
      'gydytojų - pacientų santykis',
      'doctor - patient ratio',
      'doctor to patient ratio',
      'physician ratio',
    ],
    lab: [
      'lab',
      'avg lab turnaround (min)',
      'lab turnaround (min)',
      'vid. lab. tyrimų laikas (min)',
      'vid. lab. tyrimų laikas',
    ],
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
  const datasetType = hasSnapshot && hasLegacy ? 'hybrid' : hasSnapshot ? 'snapshot' : 'legacy';

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
    const recordDate = dateValue ? parseDate(dateValue) : arrivalDate || departureDate || timestamp;
    const dateKey = recordDate ? toDateKeyFromDate(recordDate) : '';
    const dispositionInfo = normalizeEdDisposition(
      legacyIndices.disposition >= 0 ? normalizedRow[legacyIndices.disposition] : ''
    );
    let losMinutes =
      legacyIndices.los >= 0 ? parseDurationMinutesWorker(normalizedRow[legacyIndices.los]) : null;
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
      doorToProviderMinutes:
        legacyIndices.door >= 0 ? parseDurationMinutesWorker(normalizedRow[legacyIndices.door]) : null,
      decisionToLeaveMinutes:
        legacyIndices.decision >= 0
          ? parseDurationMinutesWorker(normalizedRow[legacyIndices.decision])
          : null,
      labMinutes:
        legacyIndices.lab >= 0 ? parseDurationMinutesWorker(normalizedRow[legacyIndices.lab]) : null,
      snapshotLabMinutes:
        snapshotIndices.lab >= 0 ? parseNumericCellWorker(normalizedRow[snapshotIndices.lab]) : null,
      currentPatients:
        snapshotIndices.currentPatients >= 0
          ? parseNumericCellWorker(normalizedRow[snapshotIndices.currentPatients])
          : null,
      occupiedBeds:
        snapshotIndices.occupiedBeds >= 0
          ? parseNumericCellWorker(normalizedRow[snapshotIndices.occupiedBeds])
          : null,
      nurseRatio:
        snapshotIndices.nurseRatio >= 0
          ? parseRatioWorker(normalizedRow[snapshotIndices.nurseRatio]).ratio
          : null,
      nurseRatioText:
        snapshotIndices.nurseRatio >= 0
          ? parseRatioWorker(normalizedRow[snapshotIndices.nurseRatio]).text
          : '',
      doctorRatio:
        snapshotIndices.doctorRatio >= 0
          ? parseRatioWorker(normalizedRow[snapshotIndices.doctorRatio]).ratio
          : null,
      doctorRatioText:
        snapshotIndices.doctorRatio >= 0
          ? parseRatioWorker(normalizedRow[snapshotIndices.doctorRatio]).text
          : '',
      categories: {
        1:
          snapshotIndices.category1 >= 0
            ? parseNumericCellWorker(normalizedRow[snapshotIndices.category1])
            : null,
        2:
          snapshotIndices.category2 >= 0
            ? parseNumericCellWorker(normalizedRow[snapshotIndices.category2])
            : null,
        3:
          snapshotIndices.category3 >= 0
            ? parseNumericCellWorker(normalizedRow[snapshotIndices.category3])
            : null,
        4:
          snapshotIndices.category4 >= 0
            ? parseNumericCellWorker(normalizedRow[snapshotIndices.category4])
            : null,
        5:
          snapshotIndices.category5 >= 0
            ? parseNumericCellWorker(normalizedRow[snapshotIndices.category5])
            : null,
      },
      arrivalHour:
        arrivalDate instanceof Date && !Number.isNaN(arrivalDate.getTime()) ? arrivalDate.getHours() : null,
      departureHour:
        departureDate instanceof Date && !Number.isNaN(departureDate.getTime())
          ? departureDate.getHours()
          : null,
    };
    if (
      datasetType !== 'snapshot' ||
      Number.isFinite(record.currentPatients) ||
      Number.isFinite(record.occupiedBeds) ||
      Number.isFinite(record.snapshotLabMinutes)
    ) {
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
    const hasSnapshotMetrics =
      Number.isFinite(snapshot.summary.currentPatients) ||
      Number.isFinite(snapshot.summary.occupiedBeds) ||
      Number.isFinite(snapshot.summary.nursePatientsPerStaff) ||
      Number.isFinite(snapshot.summary.doctorPatientsPerStaff);
    if (hasSnapshotMetrics) {
      return {
        type: 'hybrid',
        summary: { ...legacy.summary, ...snapshot.summary, mode: 'hybrid' },
        dispositions: snapshot.dispositions.length ? snapshot.dispositions : legacy.dispositions,
        daily: snapshot.daily.length ? snapshot.daily : legacy.daily,
      };
    }
    return {
      type: 'legacy',
      summary: legacy.summary,
      dispositions: legacy.dispositions,
      daily: legacy.daily,
    };
  }
  return summarizeLegacyWorker(records);
}

function summarizeLegacyWorker(records) {
  const dailyMap = new Map();
  const monthMap = new Map();
  const dispositionMap = new Map();
  let totalPatients = 0;
  let labSum = 0;
  let labCount = 0;
  records.forEach((record) => {
    if (!record || !record.dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(record.dateKey)) {
      return;
    }
    totalPatients += 1;
    const existing = dailyMap.get(record.dateKey) || {
      dateKey: record.dateKey,
      patients: 0,
      losSum: 0,
      losCount: 0,
      labSum: 0,
      labCount: 0,
    };
    existing.patients += 1;
    if (Number.isFinite(record.losMinutes) && record.losMinutes >= 0) {
      existing.losSum += record.losMinutes;
      existing.losCount += 1;
    }
    if (Number.isFinite(record.labMinutes) && record.labMinutes >= 0) {
      existing.labSum += record.labMinutes;
      existing.labCount += 1;
      labSum += record.labMinutes;
      labCount += 1;
      const monthKey = String(record.dateKey).slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(monthKey)) {
        const monthExisting = monthMap.get(monthKey) || { labSum: 0, labCount: 0 };
        monthExisting.labSum += record.labMinutes;
        monthExisting.labCount += 1;
        monthMap.set(monthKey, monthExisting);
      }
    }
    dailyMap.set(record.dateKey, existing);
    const label = record.disposition || 'Nežinoma';
    const dispo = dispositionMap.get(label) || {
      label,
      count: 0,
      category: record.dispositionCategory || 'other',
    };
    dispo.count += 1;
    dispositionMap.set(label, dispo);
  });
  const daily = Array.from(dailyMap.values())
    .sort((a, b) => (a.dateKey > b.dateKey ? -1 : 1))
    .map((entry) => ({
      dateKey: entry.dateKey,
      patients: entry.patients,
      avgLosMinutes: entry.losCount > 0 ? entry.losSum / entry.losCount : null,
      avgLabMinutes: entry.labCount > 0 ? entry.labSum / entry.labCount : null,
    }));
  const latestMonthKey =
    Array.from(monthMap.keys())
      .sort((a, b) => a.localeCompare(b))
      .pop() || '';
  const latestMonth = latestMonthKey ? monthMap.get(latestMonthKey) : null;
  const dispositions = Array.from(dispositionMap.values())
    .sort((a, b) => b.count - a.count)
    .map((entry) => ({
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
      avgLabMinutes: labCount > 0 ? labSum / labCount : null,
      avgLabMonthMinutes:
        latestMonth && latestMonth.labCount > 0 ? latestMonth.labSum / latestMonth.labCount : null,
      generatedAt: new Date(),
    },
    dispositions,
    daily,
  };
}

function summarizeSnapshotWorker(records) {
  const valid = Array.isArray(records)
    ? records.filter((item) => item && typeof item.dateKey === 'string')
    : [];
  if (!valid.length) {
    return {
      type: 'snapshot',
      summary: { mode: 'snapshot', entryCount: 0, generatedAt: new Date() },
      dispositions: [],
      daily: [],
    };
  }
  const sorted = valid.slice().sort((a, b) => (a.dateKey > b.dateKey ? 1 : -1));
  const latest = sorted[sorted.length - 1];
  const dailyMap = new Map();
  valid.forEach((record) => {
    const key = String(record.dateKey || '');
    if (!key) {
      return;
    }
    const bucket = dailyMap.get(key) || { dateKey: key, labSum: 0, labCount: 0 };
    if (Number.isFinite(record.snapshotLabMinutes) && record.snapshotLabMinutes >= 0) {
      bucket.labSum += record.snapshotLabMinutes;
      bucket.labCount += 1;
    }
    dailyMap.set(key, bucket);
  });
  const dailySorted = Array.from(dailyMap.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const latestBucket = dailySorted.length ? dailySorted[dailySorted.length - 1] : null;
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
      avgLabMonthMinutes:
        latestBucket && latestBucket.labCount > 0 ? latestBucket.labSum / latestBucket.labCount : null,
      latestSnapshotLabel: latest?.dateKey || '',
      latestSnapshotAt: latest?.timestamp || null,
      generatedAt: new Date(),
    },
    dispositions,
    daily: dailySorted.map((entry) => ({
      dateKey: entry.dateKey,
      avgLabMinutes: entry.labCount > 0 ? entry.labSum / entry.labCount : null,
    })),
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
      return hours * 60 + minutes;
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

self.transformEdCsvWithSummary = transformEdCsvWithSummary;
