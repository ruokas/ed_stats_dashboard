import {
  computeAgeDiagnosisHeatmap,
  computeDiagnosisCodeYearlyShare,
  computeDiagnosisFrequency,
  computePspcDistribution,
  computePspcReferralHospitalizationCorrelation,
  computeReferralDispositionYearlyTrend,
  computeReferralMonthlyHeatmap,
  computeReferralYearlyTrend,
  scopeExtendedHistoricalRecords,
} from '../../../../data/stats.js';
import { DEFAULT_SETTINGS } from '../../../default-settings.js';

export function extractHistoricalRecords(dashboardState) {
  const allRecords = Array.isArray(dashboardState.rawRecords) ? dashboardState.rawRecords : [];
  const cache = dashboardState.summariesHistoricalRecordsCache || {};
  if (cache.recordsRef === allRecords && Array.isArray(cache.records)) {
    return cache.records;
  }
  const byTag = allRecords.filter((record) => record?.sourceId === 'historical');
  const records = byTag.length
    ? byTag
    : allRecords.filter((record) => record?.hasExtendedHistoricalFields === true);
  dashboardState.summariesHistoricalRecordsCache = {
    recordsRef: allRecords,
    records,
  };
  return records;
}

function buildReportsComputationKey(dashboardState, settings, scopeMeta) {
  return [
    String(dashboardState.summariesReportsYear ?? 'all'),
    Number.parseInt(String(dashboardState.summariesReportsTopN ?? 15), 10) || 15,
    Number.parseInt(String(dashboardState.summariesReportsMinGroupSize ?? 100), 10) || 100,
    String(dashboardState.summariesReferralPspcSort || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc',
    Number.isFinite(scopeMeta?.records?.length) ? scopeMeta.records.length : 0,
    Number.isFinite(settings?.calculations?.shiftStartHour) ? settings.calculations.shiftStartHour : '',
  ].join('|');
}

export function getReportsComputation(dashboardState, settings, historicalRecords, scopeMeta) {
  const key = buildReportsComputationKey(dashboardState, settings, scopeMeta);
  const cache = dashboardState.summariesReportsComputationCache || {};
  if (cache.recordsRef === historicalRecords && cache.key === key && cache.value) {
    return cache.value;
  }
  const scopedMeta = {
    scoped: scopeMeta.records,
    yearOptions: scopeMeta.yearOptions,
    yearFilter: scopeMeta.yearFilter,
    shiftStartHour: scopeMeta.shiftStartHour,
    coverage: scopeMeta.coverage,
  };
  const baseOptions = {
    yearFilter: dashboardState.summariesReportsYear,
    topN: dashboardState.summariesReportsTopN,
    minGroupSize: dashboardState.summariesReportsMinGroupSize,
    sortDirection: dashboardState.summariesReferralPspcSort,
    calculations: settings?.calculations,
    defaultSettings: DEFAULT_SETTINGS,
    scopedMeta,
  };
  const value = {
    diagnosis: computeDiagnosisFrequency(historicalRecords, {
      ...baseOptions,
      excludePrefixes: ['W', 'Y', 'U', 'Z', 'X'],
    }),
    ageDiagnosisHeatmap: computeAgeDiagnosisHeatmap(historicalRecords, {
      ...baseOptions,
      excludePrefixes: ['W', 'Y', 'U', 'Z', 'X'],
    }),
    z769Trend: computeDiagnosisCodeYearlyShare(historicalRecords, 'Z76.9', baseOptions),
    referralTrend: computeReferralYearlyTrend(historicalRecords, baseOptions),
    referralDispositionYearly: computeReferralDispositionYearlyTrend(historicalRecords, baseOptions),
    referralMonthlyHeatmap: computeReferralMonthlyHeatmap(historicalRecords, baseOptions),
    referralHospitalizedByPspcYearly: computeReferralHospitalizedShareByPspcYearly(scopeMeta.records, {
      minGroupSize: dashboardState.summariesReportsMinGroupSize,
      yearOptions: scopeMeta.yearOptions,
      shiftStartHour: scopeMeta.shiftStartHour,
    }),
    pspcCorrelation: computePspcReferralHospitalizationCorrelation(historicalRecords, baseOptions),
    pspcDistribution: computePspcDistribution(historicalRecords, baseOptions),
  };
  dashboardState.summariesReportsComputationCache = {
    recordsRef: historicalRecords,
    key,
    value,
  };
  return value;
}

function normalizeLithuanianText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function classifyPspcAreaType(label) {
  const normalized = normalizeLithuanianText(label);
  if (!normalized || normalized === 'nenurodyta') {
    return 'unknown';
  }
  if (/\brajono\b/.test(normalized) || /\braj\.\b/.test(normalized) || /\braj\b/.test(normalized)) {
    return 'district';
  }
  if (/\bmiesto\b/.test(normalized) || /\bm\.\b/.test(normalized)) {
    return 'city';
  }
  const majorCityFragments = [
    'vilniaus',
    'kauno',
    'klaipedos',
    'siauliu',
    'panevezio',
    'alytaus',
    'marijampoles',
  ];
  if (majorCityFragments.some((fragment) => normalized.includes(fragment))) {
    return 'city';
  }
  return 'unknown';
}

export function sortPspcRows(rows, direction = 'desc') {
  const sortDirection = String(direction || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const aShare = Number(a?.share || 0);
    const bShare = Number(b?.share || 0);
    if (aShare !== bShare) {
      return sortDirection === 'asc' ? aShare - bShare : bShare - aShare;
    }
    const aTotal = Number(a?.referredTotal || 0);
    const bTotal = Number(b?.referredTotal || 0);
    if (aTotal !== bTotal) {
      return sortDirection === 'asc' ? aTotal - bTotal : bTotal - aTotal;
    }
    return String(a?.label || '').localeCompare(String(b?.label || ''), 'lt');
  });
}

function computeReferralHospitalizedShareByPspcYearly(records, options = {}) {
  const list = Array.isArray(records) ? records.filter(Boolean) : [];
  const shiftStartHourRaw = Number(options?.shiftStartHour);
  const shiftStartHour = Number.isFinite(shiftStartHourRaw) ? shiftStartHourRaw : 7;
  const getShiftAdjustedYear = (record) => {
    const arrival =
      record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime()) ? record.arrival : null;
    const discharge =
      record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime())
        ? record.discharge
        : null;
    const reference = arrival || discharge;
    if (reference) {
      const anchor = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
      if (reference.getHours() < shiftStartHour) {
        anchor.setDate(anchor.getDate() - 1);
      }
      return String(anchor.getFullYear());
    }
    const fallback = Number.parseInt(String(record?.year ?? ''), 10);
    if (Number.isFinite(fallback)) {
      return String(fallback);
    }
    return '';
  };
  const yearSet = new Set();
  const byPspc = new Map();

  list.forEach((record) => {
    const year = getShiftAdjustedYear(record);
    if (!/^\d{4}$/.test(year)) {
      return;
    }
    yearSet.add(year);
    const referralValue = String(record?.referral || '')
      .trim()
      .toLowerCase();
    if (referralValue !== 'su siuntimu') {
      return;
    }
    const pspc = String(record?.pspc || '').trim() || 'Nenurodyta';
    if (!byPspc.has(pspc)) {
      byPspc.set(pspc, {
        label: pspc,
        pspcType: classifyPspcAreaType(pspc),
        totalReferred: 0,
        totalHospitalized: 0,
        byYear: new Map(),
      });
    }
    const bucket = byPspc.get(pspc);
    bucket.totalReferred += 1;
    if (record?.hospitalized === true) {
      bucket.totalHospitalized += 1;
    }
    if (!bucket.byYear.has(year)) {
      bucket.byYear.set(year, { referredTotal: 0, hospitalizedCount: 0 });
    }
    const yearBucket = bucket.byYear.get(year);
    yearBucket.referredTotal += 1;
    if (record?.hospitalized === true) {
      yearBucket.hospitalizedCount += 1;
    }
  });

  const years = Array.from(yearSet)
    .filter((year) => /^\d{4}$/.test(year))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));

  const rows = Array.from(byPspc.values())
    .filter((row) => row.label !== 'Nenurodyta')
    .map((row) => ({
      label: row.label,
      pspcType: row.pspcType,
      totalReferred: row.totalReferred,
      totalHospitalized: row.totalHospitalized,
      share: row.totalReferred > 0 ? row.totalHospitalized / row.totalReferred : 0,
      yearly: years.map((year) => {
        const yearBucket = row.byYear.get(year) || { referredTotal: 0, hospitalizedCount: 0 };
        const referredTotal = Number(yearBucket.referredTotal || 0);
        const hospitalizedCount = Number(yearBucket.hospitalizedCount || 0);
        return {
          year,
          referredTotal,
          hospitalizedCount,
          share: referredTotal > 0 ? hospitalizedCount / referredTotal : null,
        };
      }),
    }))
    .sort((a, b) => {
      if (b.totalReferred !== a.totalReferred) {
        return b.totalReferred - a.totalReferred;
      }
      return String(a.label).localeCompare(String(b.label), 'lt');
    });

  return { years, rows };
}

export function computeReferralHospitalizedShareByPspcDetailed(records) {
  const list = Array.isArray(records) ? records.filter(Boolean) : [];
  const byPspc = new Map();
  list.forEach((record) => {
    const referralValue = String(record?.referral || '')
      .trim()
      .toLowerCase();
    if (referralValue !== 'su siuntimu') {
      return;
    }
    const pspc = String(record?.pspc || '').trim() || 'Nenurodyta';
    if (!byPspc.has(pspc)) {
      byPspc.set(pspc, {
        label: pspc,
        pspcType: classifyPspcAreaType(pspc),
        referredTotal: 0,
        hospitalizedCount: 0,
      });
    }
    const bucket = byPspc.get(pspc);
    bucket.referredTotal += 1;
    if (record?.hospitalized === true) {
      bucket.hospitalizedCount += 1;
    }
  });
  const rows = Array.from(byPspc.values())
    .filter((row) => row.label !== 'Nenurodyta')
    .map((row) => ({
      ...row,
      share: row.referredTotal > 0 ? row.hospitalizedCount / row.referredTotal : 0,
      percent: row.referredTotal > 0 ? (row.hospitalizedCount / row.referredTotal) * 100 : 0,
    }));
  return {
    rows,
    totalReferred: rows.reduce((sum, row) => sum + Number(row.referredTotal || 0), 0),
  };
}

export function getScopedReportsMeta(dashboardState, settings, historicalRecords, yearFilter) {
  const cache = dashboardState.summariesReportsScopeCache || {};
  const normalizedYearFilter = yearFilter == null ? 'all' : String(yearFilter);
  if (cache.recordsRef !== historicalRecords || !(cache.byYear instanceof Map)) {
    dashboardState.summariesReportsScopeCache = {
      recordsRef: historicalRecords,
      byYear: new Map(),
    };
  }
  const activeCache = dashboardState.summariesReportsScopeCache.byYear;
  if (activeCache.has(normalizedYearFilter)) {
    return activeCache.get(normalizedYearFilter);
  }
  const scoped = scopeExtendedHistoricalRecords(historicalRecords, yearFilter, {
    calculations: settings?.calculations,
    defaultSettings: DEFAULT_SETTINGS,
  });
  activeCache.set(normalizedYearFilter, scoped);
  return scoped;
}
