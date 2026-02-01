import { parseCsv } from './csv.js';
import { parseDate } from './date.js';
import { numberFormatter, oneDecimalFormatter, percentFormatter } from '../utils/format.js';

export function createEdHandlers(context) {
  const {
    settings,
    DEFAULT_SETTINGS,
    TEXT,
    downloadCsv,
    describeError,
    resolveColumnIndex,
  } = context;

  function parseDurationMinutes(value) {
    if (value == null) {
      return null;
    }
    const text = String(value).trim();
    if (!text) {
      return null;
    }
    const normalized = text.replace(',', '.').replace(/\s+/g, '');
    if (/^\d{1,2}:\d{2}$/.test(normalized)) {
      const [hours, minutes] = normalized.split(':').map((part) => Number.parseInt(part, 10));
      if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
        return hours * 60 + minutes;
      }
    }
    const numeric = Number.parseFloat(normalized);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function parseNumericCell(value) {
    if (value == null) {
      return null;
    }
    const raw = String(value).trim();
    if (!raw) {
      return null;
    }
    const normalized = raw.replace(/\s+/g, '').replace(',', '.');
    const numeric = Number.parseFloat(normalized);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function normalizeRatioValue(value) {
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
    if (Number.isFinite(numeric) && numeric > 0) {
      return { ratio: numeric, text };
    }
    return { ratio: null, text };
  }

  function normalizeDispositionValue(value) {
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

  function toDateKeyFromDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return '';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function createEmptyEdSummary(mode = 'legacy') {
    return {
      mode,
      totalPatients: 0,
      uniqueDates: 0,
      avgDailyPatients: null,
      avgLosMinutes: null,
      avgLosHospitalizedMinutes: null,
      avgLosMonthMinutes: null,
      avgLosYearMinutes: null,
      avgLabMinutes: null,
      avgLabMonthMinutes: null,
      avgLabYearMinutes: null,
      avgDoorToProviderMinutes: null,
      avgDecisionToLeaveMinutes: null,
      hospitalizedShare: null,
      hospitalizedMonthShare: null,
      hospitalizedYearShare: null,
      avgDaytimePatientsMonth: null,
      currentMonthKey: '',
      entryCount: 0,
      currentPatients: null,
      occupiedBeds: null,
      nursePatientsPerStaff: null,
      doctorPatientsPerStaff: null,
      latestSnapshotLabel: '',
      latestSnapshotAt: null,
      generatedAt: new Date(),
      peakWindowText: '',
      peakWindowRiskNote: '',
      losMedianMinutes: null,
      losP90Minutes: null,
      losVariabilityIndex: null,
      losPercentilesText: '',
      taktTimeMinutes: null,
      taktTimeMeta: '',
      littlesLawEstimate: null,
      littlesLawMeta: '',
      fastLaneShare: null,
      slowLaneShare: null,
      fastLaneDelta: null,
      slowLaneDelta: null,
      fastSlowSplitValue: '',
      fastSlowTrendText: '',
      fastSlowTrendWindowDays: 0,
      feedbackComments: [],
      feedbackCommentsMeta: '',
    };
  }

  function transformEdCsv(text) {
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
    const snapshotCandidates = {
      timestamp: ['timestamp', 'datetime', 'laikas', 'įrašyta', 'atnaujinta', 'data', 'created', 'updated'],
      currentPatients: ['šiuo metu pacientų', 'current patients', 'patients now', 'patients in ed'],
      occupiedBeds: ['užimta lovų', 'occupied beds', 'beds occupied'],
      nurseRatio: ['slaugytojų - pacientų santykis', 'nurse - patient ratio', 'nurse to patient ratio', 'nurse ratio'],
      doctorRatio: ['gydytojų - pacientų santykis', 'doctor - patient ratio', 'doctor to patient ratio', 'physician ratio'],
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
    const hasSnapshot = snapshotIndices.currentPatients >= 0
      || snapshotIndices.occupiedBeds >= 0
      || snapshotIndices.nurseRatio >= 0
      || snapshotIndices.doctorRatio >= 0
      || snapshotIndices.category1 >= 0
      || snapshotIndices.category2 >= 0
      || snapshotIndices.category3 >= 0
      || snapshotIndices.category4 >= 0
      || snapshotIndices.category5 >= 0;
    const hasLegacy = Object.values(legacyIndices).some((index) => index >= 0);
    const datasetType = hasSnapshot && hasLegacy ? 'hybrid' : (hasSnapshot ? 'snapshot' : 'legacy');

    const records = [];
    let syntheticCounter = 0;
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row || !row.length) {
        continue;
      }
      const normalizedRow = header.map((_, index) => {
        const cell = row[index];
        return cell != null ? String(cell).trim() : '';
      });

      const timestampRaw = snapshotIndices.timestamp >= 0 ? normalizedRow[snapshotIndices.timestamp] : '';
      const timestamp = timestampRaw ? parseDate(timestampRaw) : null;
      const arrivalValue = legacyIndices.arrival >= 0 ? normalizedRow[legacyIndices.arrival] : '';
      const departureValue = legacyIndices.departure >= 0 ? normalizedRow[legacyIndices.departure] : '';
      const dateValue = legacyIndices.date >= 0 ? normalizedRow[legacyIndices.date] : '';
      const arrivalDate = arrivalValue ? parseDate(arrivalValue) : null;
      const departureDate = departureValue ? parseDate(departureValue) : null;
      let recordDate = dateValue ? parseDate(dateValue) : null;
      if (!(recordDate instanceof Date) || Number.isNaN(recordDate.getTime())) {
        recordDate = arrivalDate || departureDate || (timestamp instanceof Date && !Number.isNaN(timestamp.getTime()) ? timestamp : null);
      }
      let dateKey = recordDate instanceof Date && !Number.isNaN(recordDate.getTime())
        ? toDateKeyFromDate(recordDate)
        : '';

      const dispositionValue = legacyIndices.disposition >= 0 ? normalizedRow[legacyIndices.disposition] : '';
      let losMinutes = legacyIndices.los >= 0 ? parseDurationMinutes(normalizedRow[legacyIndices.los]) : null;
      if (!Number.isFinite(losMinutes) && arrivalDate instanceof Date && departureDate instanceof Date) {
        const diffMinutes = (departureDate.getTime() - arrivalDate.getTime()) / 60000;
        if (Number.isFinite(diffMinutes) && diffMinutes >= 0) {
          losMinutes = diffMinutes;
        }
      }
      const doorMinutes = legacyIndices.door >= 0 ? parseDurationMinutes(normalizedRow[legacyIndices.door]) : null;
      const decisionMinutes = legacyIndices.decision >= 0 ? parseDurationMinutes(normalizedRow[legacyIndices.decision]) : null;
      const labMinutes = legacyIndices.lab >= 0 ? parseDurationMinutes(normalizedRow[legacyIndices.lab]) : null;
      const dispositionInfo = normalizeDispositionValue(dispositionValue);

      const currentPatients = snapshotIndices.currentPatients >= 0
        ? parseNumericCell(normalizedRow[snapshotIndices.currentPatients])
        : null;
      const occupiedBeds = snapshotIndices.occupiedBeds >= 0
        ? parseNumericCell(normalizedRow[snapshotIndices.occupiedBeds])
        : null;
      const nurseRatioInfo = snapshotIndices.nurseRatio >= 0
        ? normalizeRatioValue(normalizedRow[snapshotIndices.nurseRatio])
        : { ratio: null, text: '' };
      const doctorRatioInfo = snapshotIndices.doctorRatio >= 0
        ? normalizeRatioValue(normalizedRow[snapshotIndices.doctorRatio])
        : { ratio: null, text: '' };
      const snapshotLabMinutes = snapshotIndices.lab >= 0
        ? parseNumericCell(normalizedRow[snapshotIndices.lab])
        : null;
      const categories = {};
      let hasCategoryData = false;
      ['1', '2', '3', '4', '5'].forEach((key) => {
        const prop = `category${key}`;
        const index = snapshotIndices[prop];
        const value = index >= 0 ? parseNumericCell(normalizedRow[index]) : null;
        if (Number.isFinite(value) && value >= 0) {
          categories[key] = value;
          hasCategoryData = true;
        } else {
          categories[key] = null;
        }
      });
      const hasSnapshotData = Number.isFinite(currentPatients)
        || Number.isFinite(occupiedBeds)
        || Number.isFinite(nurseRatioInfo.ratio)
        || Number.isFinite(doctorRatioInfo.ratio)
        || hasCategoryData;

      if (!hasSnapshotData && datasetType === 'snapshot') {
        continue;
      }

      if (!dateKey) {
        if (datasetType === 'legacy' && !hasSnapshotData) {
          continue;
        }
        syntheticCounter += 1;
        dateKey = `snapshot-${String(syntheticCounter).padStart(3, '0')}`;
      }

      records.push({
        dateKey,
        timestamp: timestamp instanceof Date && !Number.isNaN(timestamp.getTime()) ? timestamp : null,
        rawTimestamp: timestampRaw,
        disposition: dispositionInfo.label,
        dispositionCategory: dispositionInfo.category,
        losMinutes: Number.isFinite(losMinutes) && losMinutes >= 0 ? losMinutes : null,
        doorToProviderMinutes: Number.isFinite(doorMinutes) && doorMinutes >= 0 ? doorMinutes : null,
        decisionToLeaveMinutes: Number.isFinite(decisionMinutes) && decisionMinutes >= 0 ? decisionMinutes : null,
        labMinutes: Number.isFinite(labMinutes) && labMinutes >= 0 ? labMinutes : null,
        snapshotLabMinutes: Number.isFinite(snapshotLabMinutes) && snapshotLabMinutes >= 0 ? snapshotLabMinutes : null,
        currentPatients: Number.isFinite(currentPatients) && currentPatients >= 0 ? currentPatients : null,
        occupiedBeds: Number.isFinite(occupiedBeds) && occupiedBeds >= 0 ? occupiedBeds : null,
        nurseRatio: Number.isFinite(nurseRatioInfo.ratio) && nurseRatioInfo.ratio > 0 ? nurseRatioInfo.ratio : null,
        nurseRatioText: nurseRatioInfo.text,
        doctorRatio: Number.isFinite(doctorRatioInfo.ratio) && doctorRatioInfo.ratio > 0 ? doctorRatioInfo.ratio : null,
        doctorRatioText: doctorRatioInfo.text,
        categories,
        arrivalHour: arrivalDate instanceof Date && !Number.isNaN(arrivalDate.getTime()) ? arrivalDate.getHours() : null,
        departureHour: departureDate instanceof Date && !Number.isNaN(departureDate.getTime()) ? departureDate.getHours() : null,
      });
    }

    return { records, meta: { type: datasetType } };
  }

  function formatHourLabel(hour) {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      return '';
    }
    return `${String(hour).padStart(2, '0')}:00`;
  }

  function pickTopHours(hourCounts, limit = 3) {
    if (!Array.isArray(hourCounts) || !hourCounts.length) {
      return [];
    }
    return hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter((entry) => Number.isFinite(entry.count) && entry.count > 0)
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        return a.hour - b.hour;
      })
      .slice(0, Math.max(0, limit));
  }

  function computePercentile(sortedValues, percentile) {
    if (!Array.isArray(sortedValues) || !sortedValues.length) {
      return null;
    }
    const clamped = Math.min(Math.max(percentile, 0), 1);
    if (sortedValues.length === 1) {
      return sortedValues[0];
    }
    const index = (sortedValues.length - 1) * clamped;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (upper >= sortedValues.length) {
      return sortedValues[sortedValues.length - 1];
    }
    if (lower === upper) {
      return sortedValues[lower];
    }
    const lowerValue = sortedValues[lower];
    const upperValue = sortedValues[upper];
    if (!Number.isFinite(lowerValue) || !Number.isFinite(upperValue)) {
      return null;
    }
    return lowerValue + (upperValue - lowerValue) * weight;
  }

  function formatPercentPointDelta(delta) {
    if (!Number.isFinite(delta)) {
      return '';
    }
    const magnitude = Math.abs(delta) * 100;
    const rounded = Math.round(magnitude * 10) / 10;
    if (!rounded) {
      return '±0 p.p.';
    }
    const sign = delta > 0 ? '+' : '−';
    return `${sign}${oneDecimalFormatter.format(rounded)} p.p.`;
  }

  function summarizeLegacyRecords(records) {
    const summary = createEmptyEdSummary('legacy');
    const dispositions = new Map();
    const categoryTotals = { hospitalized: 0, discharged: 0, left: 0, transfer: 0, other: 0 };
    const dailyBuckets = new Map();
    const monthBuckets = new Map();
    const arrivalHourCounts = Array.from({ length: 24 }, () => 0);
    const dischargeHourCounts = Array.from({ length: 24 }, () => 0);
    let arrivalsWithHour = 0;
    const losValues = [];
    const losPositiveValues = [];
    let losValidCount = 0;
    let fastCount = 0;
    let slowCount = 0;
    const validRecords = Array.isArray(records)
      ? records.filter((record) => record && typeof record.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.dateKey))
      : [];
    if (!validRecords.length) {
      return { summary, dispositions: [], daily: [] };
    }

    let losSum = 0;
    let losCount = 0;
    let hospitalizedLosSum = 0;
    let hospitalizedLosCount = 0;
    let doorSum = 0;
    let doorCount = 0;
    let decisionSum = 0;
    let decisionCount = 0;
    let labSum = 0;
    let labCount = 0;

    summary.totalPatients = validRecords.length;
    validRecords.forEach((record) => {
      const {
        dateKey,
        disposition,
        dispositionCategory,
        losMinutes,
        doorToProviderMinutes,
        decisionToLeaveMinutes,
        labMinutes,
        arrivalHour,
        departureHour,
      } = record;
      if (Number.isInteger(arrivalHour) && arrivalHour >= 0 && arrivalHour <= 23) {
        arrivalHourCounts[arrivalHour] += 1;
        arrivalsWithHour += 1;
      }
      if (Number.isInteger(departureHour) && departureHour >= 0 && departureHour <= 23) {
        dischargeHourCounts[departureHour] += 1;
      }
      const key = disposition && disposition.trim().length ? disposition : 'Nežinoma';
      if (!dispositions.has(key)) {
        dispositions.set(key, { label: key, count: 0, category: dispositionCategory || 'other' });
      }
      const dispositionEntry = dispositions.get(key);
      dispositionEntry.count += 1;
      const categoryKey = dispositionCategory && categoryTotals[dispositionCategory] != null ? dispositionCategory : 'other';
      categoryTotals[categoryKey] += 1;

      const bucket = dailyBuckets.get(dateKey) || {
        dateKey,
        patients: 0,
        losSum: 0,
        losCount: 0,
        doorSum: 0,
        doorCount: 0,
        labSum: 0,
        labCount: 0,
        fastCount: 0,
        slowCount: 0,
      };
      bucket.patients += 1;
      if (Number.isFinite(losMinutes)) {
        bucket.losSum += losMinutes;
        bucket.losCount += 1;
        losSum += losMinutes;
        losCount += 1;
        losValues.push(losMinutes);
        if (losMinutes > 0) {
          losPositiveValues.push(losMinutes);
        }
        losValidCount += 1;
        if (losMinutes < 120) {
          bucket.fastCount += 1;
          fastCount += 1;
        }
        if (losMinutes > 480) {
          bucket.slowCount += 1;
          slowCount += 1;
        }
        if (dispositionCategory === 'hospitalized') {
          hospitalizedLosSum += losMinutes;
          hospitalizedLosCount += 1;
        }
      }
      if (Number.isFinite(doorToProviderMinutes)) {
        bucket.doorSum += doorToProviderMinutes;
        bucket.doorCount += 1;
        doorSum += doorToProviderMinutes;
        doorCount += 1;
      }
      if (Number.isFinite(decisionToLeaveMinutes)) {
        decisionSum += decisionToLeaveMinutes;
        decisionCount += 1;
      }
      if (Number.isFinite(labMinutes)) {
        bucket.labSum += labMinutes;
        bucket.labCount += 1;
        labSum += labMinutes;
        labCount += 1;
      }
      dailyBuckets.set(dateKey, bucket);

      const monthKey = typeof dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
        ? dateKey.slice(0, 7)
        : '';
      if (monthKey) {
        const monthBucket = monthBuckets.get(monthKey) || {
          count: 0,
          hospitalized: 0,
          losSum: 0,
          losCount: 0,
          hospitalizedLosSum: 0,
          hospitalizedLosCount: 0,
          labSum: 0,
          labCount: 0,
        };
        monthBucket.count += 1;
        if (dispositionCategory === 'hospitalized') {
          monthBucket.hospitalized += 1;
        }
        if (Number.isFinite(losMinutes)) {
          monthBucket.losSum += losMinutes;
          monthBucket.losCount += 1;
          if (dispositionCategory === 'hospitalized') {
            monthBucket.hospitalizedLosSum += losMinutes;
            monthBucket.hospitalizedLosCount += 1;
          }
        }
        if (Number.isFinite(labMinutes)) {
          monthBucket.labSum += labMinutes;
          monthBucket.labCount += 1;
        }
        monthBuckets.set(monthKey, monthBucket);
      }
    });

    summary.uniqueDates = dailyBuckets.size;
    if (summary.uniqueDates > 0) {
      summary.avgDailyPatients = summary.totalPatients / summary.uniqueDates;
    }
    if (losCount > 0) {
      summary.avgLosMinutes = losSum / losCount;
    }
    if (hospitalizedLosCount > 0) {
      summary.avgLosHospitalizedMinutes = hospitalizedLosSum / hospitalizedLosCount;
    }
    if (doorCount > 0) {
      summary.avgDoorToProviderMinutes = doorSum / doorCount;
    }
    if (decisionCount > 0) {
      summary.avgDecisionToLeaveMinutes = decisionSum / decisionCount;
    }
    if (labCount > 0) {
      summary.avgLabMinutes = labSum / labCount;
    }
    if (summary.totalPatients > 0) {
      summary.hospitalizedShare = categoryTotals.hospitalized / summary.totalPatients;
    }
    summary.generatedAt = new Date();

    const monthlyDayTotals = new Map();
    dailyBuckets.forEach((bucket) => {
      if (!bucket || typeof bucket.dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(bucket.dateKey)) {
        return;
      }
      const monthKey = bucket.dateKey.slice(0, 7);
      if (!monthKey || !Number.isFinite(bucket.patients)) {
        return;
      }
      const entry = monthlyDayTotals.get(monthKey) || { patientSum: 0, dayCount: 0 };
      entry.patientSum += bucket.patients;
      entry.dayCount += 1;
      monthlyDayTotals.set(monthKey, entry);
    });

    if (monthBuckets.size > 0) {
      const sortedMonthKeys = Array.from(monthBuckets.keys()).sort();
      const latestMonthKey = sortedMonthKeys[sortedMonthKeys.length - 1];
      const currentMonth = monthBuckets.get(latestMonthKey);
      if (currentMonth) {
        summary.avgLosMonthMinutes = currentMonth.losCount > 0
          ? currentMonth.losSum / currentMonth.losCount
          : null;
        summary.hospitalizedMonthShare = currentMonth.count > 0
          ? currentMonth.hospitalized / currentMonth.count
          : null;
        summary.avgLabMonthMinutes = currentMonth.labCount > 0
          ? currentMonth.labSum / currentMonth.labCount
          : null;
        summary.currentMonthKey = latestMonthKey;
        const monthDayInfo = monthlyDayTotals.get(latestMonthKey);
        if (monthDayInfo && monthDayInfo.dayCount > 0) {
          summary.avgDaytimePatientsMonth = monthDayInfo.patientSum / monthDayInfo.dayCount;
        }
        const currentYear = typeof latestMonthKey === 'string' ? latestMonthKey.slice(0, 4) : '';
        if (currentYear) {
          const yearTotals = {
            count: 0,
            hospitalized: 0,
            losSum: 0,
            losCount: 0,
            hospitalizedLosSum: 0,
            hospitalizedLosCount: 0,
            labSum: 0,
            labCount: 0,
          };
          monthBuckets.forEach((bucket, key) => {
            if (typeof key === 'string' && key.startsWith(currentYear)) {
              yearTotals.count += bucket.count;
              yearTotals.hospitalized += bucket.hospitalized;
              yearTotals.losSum += bucket.losSum;
              yearTotals.losCount += bucket.losCount;
              yearTotals.hospitalizedLosSum += bucket.hospitalizedLosSum;
              yearTotals.hospitalizedLosCount += bucket.hospitalizedLosCount;
              yearTotals.labSum += bucket.labSum;
              yearTotals.labCount += bucket.labCount;
            }
          });
          summary.avgLosYearMinutes = yearTotals.losCount > 0
            ? yearTotals.losSum / yearTotals.losCount
            : null;
          summary.hospitalizedYearShare = yearTotals.count > 0
            ? yearTotals.hospitalized / yearTotals.count
            : null;
          if (yearTotals.hospitalizedLosCount > 0) {
            summary.avgLosHospitalizedMinutes = yearTotals.hospitalizedLosSum / yearTotals.hospitalizedLosCount;
          }
          summary.avgLabYearMinutes = yearTotals.labCount > 0
            ? yearTotals.labSum / yearTotals.labCount
            : null;
        }
      }
    }

    const topArrivalHours = pickTopHours(arrivalHourCounts, 3);
    const topDepartureHours = pickTopHours(dischargeHourCounts, 3);
    if (topArrivalHours.length || topDepartureHours.length) {
      const arrivalText = topArrivalHours.length
        ? topArrivalHours.map((item) => formatHourLabel(item.hour)).filter(Boolean).join(', ')
        : '—';
      const departureText = topDepartureHours.length
        ? topDepartureHours.map((item) => formatHourLabel(item.hour)).filter(Boolean).join(', ')
        : '—';
      summary.peakWindowText = `Atvykimai: ${arrivalText} / Išvykimai: ${departureText}`;
      if (topArrivalHours.length && topDepartureHours.length) {
        const mismatch = topArrivalHours.filter((item) => !topDepartureHours.some((candidate) => candidate.hour === item.hour));
        if (mismatch.length) {
          const labels = mismatch.map((item) => formatHourLabel(item.hour)).filter(Boolean);
          summary.peakWindowRiskNote = labels.length
            ? `Galima „boarding“ rizika: ${labels.join(', ')}`
            : 'Galima neatitiktis tarp atvykimų ir išvykimų.';
        } else {
          summary.peakWindowRiskNote = 'Pagrindiniai srautai sutampa.';
        }
      } else if (topArrivalHours.length) {
        summary.peakWindowRiskNote = 'Trūksta išvykimų valandų duomenų.';
      } else {
        summary.peakWindowRiskNote = 'Trūksta atvykimų valandų duomenų.';
      }
    }

    if (summary.uniqueDates > 0 && arrivalsWithHour > 0) {
      const arrivalsPerHour = arrivalsWithHour / (summary.uniqueDates * 24);
      if (Number.isFinite(arrivalsPerHour) && arrivalsPerHour > 0) {
        summary.taktTimeMinutes = 60 / arrivalsPerHour;
        summary.taktTimeMeta = `~${oneDecimalFormatter.format(arrivalsPerHour)} atv./val.`;
      }
    }

    const percentileValues = losPositiveValues.length ? losPositiveValues : losValues;
    if (percentileValues.length) {
      const sortedLos = [...percentileValues].sort((a, b) => a - b);
      const losMedian = computePercentile(sortedLos, 0.5);
      const losP90 = computePercentile(sortedLos, 0.9);
      if (Number.isFinite(losMedian)) {
        summary.losMedianMinutes = losMedian;
      }
      if (Number.isFinite(losP90)) {
        summary.losP90Minutes = losP90;
      }
      if (Number.isFinite(losMedian) && Number.isFinite(losP90) && losMedian > 0) {
        summary.losVariabilityIndex = losP90 / losMedian;
      }
      const medianHours = Number.isFinite(losMedian) ? losMedian / 60 : null;
      const p90Hours = Number.isFinite(losP90) ? losP90 / 60 : null;
      if (Number.isFinite(medianHours) && Number.isFinite(p90Hours)) {
        summary.losPercentilesText = `P50: ${oneDecimalFormatter.format(medianHours)} val. • P90: ${oneDecimalFormatter.format(p90Hours)} val.`;
      }
      const medianLosDays = Number.isFinite(losMedian) ? losMedian / (60 * 24) : null;
      if (Number.isFinite(summary.avgDailyPatients) && Number.isFinite(medianLosDays)) {
        summary.littlesLawEstimate = summary.avgDailyPatients * medianLosDays;
        if (Number.isFinite(medianHours)) {
          summary.littlesLawMeta = `Vid. ${oneDecimalFormatter.format(summary.avgDailyPatients)} atv./d. × median ${oneDecimalFormatter.format(medianHours)} val.`;
        }
      }
    }

    const dispositionsList = Array.from(dispositions.values())
      .map((entry) => ({
        label: entry.label,
        count: entry.count,
        category: entry.category,
        share: summary.totalPatients > 0 ? entry.count / summary.totalPatients : null,
      }))
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        return a.label.localeCompare(b.label);
      });

    const daily = Array.from(dailyBuckets.values())
      .map((bucket) => ({
        dateKey: bucket.dateKey,
        patients: bucket.patients,
        avgLosMinutes: bucket.losCount > 0 ? bucket.losSum / bucket.losCount : null,
        avgDoorMinutes: bucket.doorCount > 0 ? bucket.doorSum / bucket.doorCount : null,
        fastCount: bucket.fastCount || 0,
        slowCount: bucket.slowCount || 0,
        losCount: bucket.losCount || 0,
        fastShare: bucket.losCount > 0 ? bucket.fastCount / bucket.losCount : null,
        slowShare: bucket.losCount > 0 ? bucket.slowCount / bucket.losCount : null,
      }))
      .sort((a, b) => (a.dateKey === b.dateKey ? 0 : (a.dateKey > b.dateKey ? -1 : 1)));

    const dailyAsc = [...daily].sort((a, b) => (a.dateKey > b.dateKey ? 1 : -1));
    const trendWindowSize = Math.min(30, dailyAsc.length);
    const recentWindow = trendWindowSize > 0 ? dailyAsc.slice(-trendWindowSize) : [];
    const previousWindow = trendWindowSize > 0 ? dailyAsc.slice(Math.max(0, dailyAsc.length - trendWindowSize * 2), dailyAsc.length - trendWindowSize) : [];
    const reduceWindow = (list) => list.reduce((acc, item) => {
      acc.fast += Number.isFinite(item.fastCount) ? item.fastCount : 0;
      acc.slow += Number.isFinite(item.slowCount) ? item.slowCount : 0;
      acc.totalLos += Number.isFinite(item.losCount) ? item.losCount : 0;
      return acc;
    }, { fast: 0, slow: 0, totalLos: 0 });
    const recentAgg = reduceWindow(recentWindow);
    const previousAgg = reduceWindow(previousWindow);
    const recentFastShare = recentAgg.totalLos > 0 ? recentAgg.fast / recentAgg.totalLos : (losValidCount > 0 ? fastCount / losValidCount : null);
    const recentSlowShare = recentAgg.totalLos > 0 ? recentAgg.slow / recentAgg.totalLos : (losValidCount > 0 ? slowCount / losValidCount : null);
    summary.fastLaneShare = Number.isFinite(recentFastShare) ? recentFastShare : null;
    summary.slowLaneShare = Number.isFinite(recentSlowShare) ? recentSlowShare : null;
    if (summary.fastLaneShare != null && summary.slowLaneShare != null) {
      summary.fastSlowSplitValue = `Greitieji: ${percentFormatter.format(summary.fastLaneShare)} • Lėtieji: ${percentFormatter.format(summary.slowLaneShare)}`;
    }
    let fastDelta = null;
    let slowDelta = null;
    if (previousAgg.totalLos > 0 && recentAgg.totalLos > 0) {
      const previousFastShare = previousAgg.fast / previousAgg.totalLos;
      const previousSlowShare = previousAgg.slow / previousAgg.totalLos;
      fastDelta = summary.fastLaneShare != null ? summary.fastLaneShare - previousFastShare : null;
      slowDelta = summary.slowLaneShare != null ? summary.slowLaneShare - previousSlowShare : null;
    }
    summary.fastLaneDelta = fastDelta;
    summary.slowLaneDelta = slowDelta;
    if (fastDelta != null || slowDelta != null) {
      const deltaFastText = formatPercentPointDelta(fastDelta);
      const deltaSlowText = formatPercentPointDelta(slowDelta);
      const deltaParts = [];
      if (deltaFastText) {
        deltaParts.push(`Greitieji ${deltaFastText}`);
      }
      if (deltaSlowText) {
        deltaParts.push(`Lėtieji ${deltaSlowText}`);
      }
      summary.fastSlowTrendText = deltaParts.join(' • ');
    }
    summary.fastSlowTrendWindowDays = trendWindowSize;

    return {
      summary,
      dispositions: dispositionsList,
      daily,
    };
  }

  function summarizeSnapshotRecords(records) {
    const summary = createEmptyEdSummary('snapshot');
    const dailyBuckets = new Map();
    const categoriesSum = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let categoriesCount = 0;
    let dispositions = [];

    const validRecords = Array.isArray(records)
      ? records.filter((record) => record && typeof record.dateKey === 'string')
      : [];
    if (!validRecords.length) {
      return { summary, dispositions, daily: [] };
    }

    summary.entryCount = validRecords.length;
    validRecords.forEach((record) => {
      const dateKey = record.dateKey;
      if (!dailyBuckets.has(dateKey)) {
        dailyBuckets.set(dateKey, {
          dateKey,
          patients: 0,
          occupied: 0,
          nurseRatio: 0,
          doctorRatio: 0,
          labSum: 0,
          labCount: 0,
          count: 0,
        });
      }
      const bucket = dailyBuckets.get(dateKey);
      bucket.count += 1;
      if (Number.isFinite(record.currentPatients)) {
        bucket.patients += record.currentPatients;
      }
      if (Number.isFinite(record.occupiedBeds)) {
        bucket.occupied += record.occupiedBeds;
      }
      if (Number.isFinite(record.nurseRatio)) {
        bucket.nurseRatio += record.nurseRatio;
      }
      if (Number.isFinite(record.doctorRatio)) {
        bucket.doctorRatio += record.doctorRatio;
      }
      if (Number.isFinite(record.snapshotLabMinutes)) {
        bucket.labSum += record.snapshotLabMinutes;
        bucket.labCount += 1;
      }

      const hasCategoryData = record.categories && typeof record.categories === 'object';
      if (hasCategoryData) {
        let hasAny = false;
        Object.keys(categoriesSum).forEach((key) => {
          const value = record.categories[key];
          if (Number.isFinite(value)) {
            categoriesSum[key] += value;
            hasAny = true;
          }
        });
        if (hasAny) {
          categoriesCount += 1;
        }
      }
    });

    const sortedBuckets = Array.from(dailyBuckets.values()).sort((a, b) => (a.dateKey > b.dateKey ? 1 : -1));
    const latestBucket = sortedBuckets[sortedBuckets.length - 1];
    if (latestBucket) {
      if (latestBucket.count > 0) {
        summary.currentPatients = latestBucket.patients / latestBucket.count;
        summary.occupiedBeds = latestBucket.occupied / latestBucket.count;
        summary.nursePatientsPerStaff = latestBucket.nurseRatio / latestBucket.count;
        summary.doctorPatientsPerStaff = latestBucket.doctorRatio / latestBucket.count;
        summary.avgLabMonthMinutes = latestBucket.labCount > 0 ? latestBucket.labSum / latestBucket.labCount : null;
        summary.latestSnapshotLabel = latestBucket.dateKey || '';
      }
    }

    const daily = sortedBuckets.map((bucket) => ({
      dateKey: bucket.dateKey,
      patients: bucket.count > 0 ? bucket.patients / bucket.count : null,
      occupied: bucket.count > 0 ? bucket.occupied / bucket.count : null,
      nurseRatio: bucket.count > 0 ? bucket.nurseRatio / bucket.count : null,
      doctorRatio: bucket.count > 0 ? bucket.doctorRatio / bucket.count : null,
      avgLabMinutes: bucket.labCount > 0 ? bucket.labSum / bucket.labCount : null,
    }));

    if (categoriesCount > 0) {
      summary.categories = {
        1: categoriesSum[1] / categoriesCount,
        2: categoriesSum[2] / categoriesCount,
        3: categoriesSum[3] / categoriesCount,
        4: categoriesSum[4] / categoriesCount,
        5: categoriesSum[5] / categoriesCount,
      };
    }

    const wrapped = validRecords
      .map((record, index) => ({ record, index }))
      .filter((item) => {
        const r = item.record;
        const hasValue = Number.isFinite(r.currentPatients)
          || Number.isFinite(r.occupiedBeds)
          || Number.isFinite(r.nurseRatio)
          || Number.isFinite(r.doctorRatio)
          || (r.categories && Object.values(r.categories).some((value) => Number.isFinite(value)));
        return hasValue;
      });
    if (wrapped.length) {
      const sortedByTime = [...wrapped].sort((a, b) => {
        const timeA = a.record.timestamp instanceof Date && !Number.isNaN(a.record.timestamp.getTime())
          ? a.record.timestamp.getTime()
          : Number.NEGATIVE_INFINITY;
        const timeB = b.record.timestamp instanceof Date && !Number.isNaN(b.record.timestamp.getTime())
          ? b.record.timestamp.getTime()
          : Number.NEGATIVE_INFINITY;
        if (timeA !== timeB) {
          return timeB - timeA;
        }
        return b.index - a.index;
      });
      const latest = sortedByTime[0]?.record || null;
      if (latest?.categories && typeof latest.categories === 'object') {
        const categoryEntries = [];
        let total = 0;
        ['1', '2', '3', '4', '5'].forEach((key) => {
          const value = latest.categories[key];
          if (Number.isFinite(value) && value >= 0) {
            const label = TEXT?.ed?.triage?.[`category${key}`] || `${key} kategorija`;
            categoryEntries.push({ label, count: value, key });
            total += value;
          }
        });
        dispositions = categoryEntries.map((entry) => ({
          label: entry.label,
          count: entry.count,
          share: total > 0 ? entry.count / total : null,
          categoryKey: entry.key,
        }));
      }
    }

    return { summary, dispositions, daily };
  }

  function summarizeEdRecords(records, meta = {}) {
    const mode = typeof meta?.type === 'string' ? meta.type : 'legacy';
    const summary = createEmptyEdSummary(mode);
    let legacy = { summary: createEmptyEdSummary('legacy'), dispositions: [], daily: [] };
    let snapshot = { summary: createEmptyEdSummary('snapshot'), dispositions: [], daily: [] };
    const hasLegacy = mode === 'legacy' || mode === 'hybrid';
    const hasSnapshot = mode === 'snapshot' || mode === 'hybrid';
    if (hasLegacy) {
      legacy = summarizeLegacyRecords(records);
    }
    if (hasSnapshot) {
      snapshot = summarizeSnapshotRecords(records);
    }

    if (mode === 'snapshot') {
      return { summary: snapshot.summary, dispositions: snapshot.dispositions, daily: snapshot.daily, meta: { type: 'snapshot' } };
    }
    if (mode === 'legacy') {
      return { summary: legacy.summary, dispositions: legacy.dispositions, daily: legacy.daily, meta: { type: 'legacy' } };
    }

    const hasSnapshotMetrics = Number.isFinite(snapshot.summary?.currentPatients)
      || Number.isFinite(snapshot.summary?.occupiedBeds)
      || Number.isFinite(snapshot.summary?.nursePatientsPerStaff)
      || Number.isFinite(snapshot.summary?.doctorPatientsPerStaff);
    if (hasSnapshotMetrics) {
      return {
        summary: { ...legacy.summary, ...snapshot.summary, mode: 'hybrid' },
        dispositions: snapshot.dispositions.length ? snapshot.dispositions : legacy.dispositions,
        daily: snapshot.daily.length ? snapshot.daily : legacy.daily,
        meta: { type: 'hybrid' },
      };
    }

    return {
      summary: legacy.summary,
      dispositions: legacy.dispositions,
      daily: legacy.daily,
      meta: { type: 'legacy' },
    };
  }

  async function fetchEdData(options = {}) {
    const config = settings?.dataSource?.ed || DEFAULT_SETTINGS.dataSource.ed;
    const url = (config?.url ?? '').trim();
    const empty = {
      records: [],
      summary: createEmptyEdSummary(),
      dispositions: [],
      daily: [],
      meta: { type: 'legacy' },
      usingFallback: false,
      lastErrorMessage: '',
      error: null,
      updatedAt: new Date(),
    };

    const finalize = (result, options = {}) => {
      const payload = Array.isArray(result)
        ? { records: result, meta: {} }
        : (result && typeof result === 'object'
          ? {
            records: Array.isArray(result.records) ? result.records : [],
            meta: result.meta && typeof result.meta === 'object' ? result.meta : {},
          }
          : { records: [], meta: {} });
      const aggregates = summarizeEdRecords(payload.records, payload.meta);
      return {
        records: payload.records,
        summary: aggregates.summary,
        dispositions: aggregates.dispositions,
        daily: aggregates.daily,
        meta: { ...payload.meta, ...(aggregates.meta || {}) },
        usingFallback: Boolean(options.usingFallback),
        lastErrorMessage: options.lastErrorMessage || '',
        error: options.error || null,
        updatedAt: new Date(),
      };
    };

    if (!url) {
      return {
        ...empty,
        lastErrorMessage: TEXT.ed.status.noUrl,
        error: TEXT.ed.status.noUrl,
      };
    }

    try {
      const download = await downloadCsv(url, { onChunk: options?.onChunk });
      const result = transformEdCsv(download.text);
      return finalize(result);
    } catch (error) {
      const friendly = describeError(error);
      return {
        ...empty,
        lastErrorMessage: friendly,
        error: friendly,
      };
    }
  }

  return {
    createEmptyEdSummary,
    transformEdCsv,
    summarizeEdRecords,
    fetchEdData,
  };
}
