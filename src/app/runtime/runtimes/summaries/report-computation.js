import {
  collapseSmallGroups,
  computeAgeDiagnosisHeatmap,
  computeDiagnosisCodeYearlyShare,
  computeDiagnosisFrequency,
  scopeExtendedHistoricalRecords,
} from '../../../../data/stats.js';
import { DEFAULT_SETTINGS } from '../../../default-settings.js';

export function extractHistoricalRecords(dashboardState) {
  const allRecords = Array.isArray(dashboardState.rawRecords) ? dashboardState.rawRecords : [];
  const cache = dashboardState.summariesHistoricalRecordsCache || {};
  if (cache.recordsRef === allRecords && Array.isArray(cache.records)) {
    return cache.records;
  }
  const byTag = [];
  const byExtended = [];
  for (let index = 0; index < allRecords.length; index += 1) {
    const record = allRecords[index];
    if (!record) {
      continue;
    }
    if (record.sourceId === 'historical') {
      byTag.push(record);
    }
    if (record.hasExtendedHistoricalFields === true) {
      byExtended.push(record);
    }
  }
  const records = byTag.length ? byTag : byExtended;
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
    Number.isFinite(scopeMeta?.records?.length) ? scopeMeta.records.length : 0,
    Number.isFinite(settings?.calculations?.shiftStartHour) ? settings.calculations.shiftStartHour : '',
  ].join('|');
}

function normalizeCategoryValue(value) {
  const text = value == null ? '' : String(value).trim();
  return text || 'Nenurodyta';
}

function getShiftAdjustedDateKey(record, shiftStartHour = 7) {
  const arrival =
    record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime()) ? record.arrival : null;
  const discharge =
    record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime()) ? record.discharge : null;
  const reference = arrival || discharge;
  if (!reference) {
    return '';
  }
  const anchor = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  if (reference.getHours() < shiftStartHour) {
    anchor.setDate(anchor.getDate() - 1);
  }
  const year = anchor.getFullYear();
  const month = String(anchor.getMonth() + 1).padStart(2, '0');
  const day = String(anchor.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toSortedRows(map, total, topN) {
  const rows = Array.from(map.entries())
    .map(([label, count]) => ({
      label,
      count,
      share: total > 0 ? count / total : 0,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return String(a.label).localeCompare(String(b.label), 'lt');
    });
  if (!Number.isFinite(topN) || topN <= 0 || rows.length <= topN) {
    return rows;
  }
  const head = rows.slice(0, topN);
  const tail = rows.slice(topN);
  const otherCount = tail.reduce((sum, row) => sum + Number(row?.count || 0), 0);
  if (otherCount > 0) {
    head.push({
      label: 'Kita / maža imtis',
      count: otherCount,
      share: total > 0 ? otherCount / total : 0,
    });
  }
  return head;
}

function computeSharedReferralAndPspcReports(scopeMeta, dashboardState) {
  const records = Array.isArray(scopeMeta?.records) ? scopeMeta.records : [];
  const shiftStartHour = Number.isFinite(Number(scopeMeta?.shiftStartHour))
    ? Number(scopeMeta.shiftStartHour)
    : 7;
  const topNRaw = Number.parseInt(String(dashboardState?.summariesReportsTopN ?? 15), 10);
  const topN = Number.isFinite(topNRaw) && topNRaw > 0 ? topNRaw : 15;
  const minGroupSizeRaw = Number.parseInt(String(dashboardState?.summariesReportsMinGroupSize ?? 100), 10);
  const minGroupSize = Number.isFinite(minGroupSizeRaw) && minGroupSizeRaw > 0 ? minGroupSizeRaw : 100;

  const referralYearly = new Map();
  const referralDispositionYearly = new Map();
  const monthlyReferral = new Map();
  const pspcCounts = new Map();
  const pspcCorrelationBuckets = new Map();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) {
      continue;
    }

    const pspc = normalizeCategoryValue(record?.pspc);
    pspcCounts.set(pspc, (pspcCounts.get(pspc) || 0) + 1);
    if (!pspcCorrelationBuckets.has(pspc)) {
      pspcCorrelationBuckets.set(pspc, { total: 0, referred: 0, hospitalized: 0 });
    }
    const pspcBucket = pspcCorrelationBuckets.get(pspc);
    pspcBucket.total += 1;

    const referralNormalized = normalizeCategoryValue(record?.referral);
    const referralCategory =
      referralNormalized === 'su siuntimu' || referralNormalized === 'be siuntimo'
        ? referralNormalized
        : 'Nenurodyta';
    if (referralCategory === 'su siuntimu') {
      pspcBucket.referred += 1;
    }
    if (record?.hospitalized === true) {
      pspcBucket.hospitalized += 1;
    }

    const dateKey = getShiftAdjustedDateKey(record, shiftStartHour);
    const yearText = dateKey.slice(0, 4);
    if (!/^\d{4}$/.test(yearText)) {
      continue;
    }
    const year = Number.parseInt(yearText, 10);
    if (!Number.isFinite(year)) {
      continue;
    }

    if (!referralYearly.has(year)) {
      referralYearly.set(year, { year, total: 0, values: {} });
    }
    const yearlyBucket = referralYearly.get(year);
    yearlyBucket.total += 1;
    yearlyBucket.values[referralCategory] = (yearlyBucket.values[referralCategory] || 0) + 1;

    const referral2 = referralCategory === 'su siuntimu' ? 'su siuntimu' : 'be siuntimo';
    const disposition = record?.hospitalized === true ? 'hospitalizuoti' : 'isleisti';
    if (!referralDispositionYearly.has(year)) {
      referralDispositionYearly.set(year, {
        year,
        totals: { 'su siuntimu': 0, 'be siuntimo': 0 },
        values: {
          'su siuntimu': { hospitalizuoti: 0, isleisti: 0 },
          'be siuntimo': { hospitalizuoti: 0, isleisti: 0 },
        },
      });
    }
    const dispositionBucket = referralDispositionYearly.get(year);
    dispositionBucket.totals[referral2] += 1;
    dispositionBucket.values[referral2][disposition] += 1;

    const monthText = dateKey.slice(5, 7);
    if (/^\d{2}$/.test(monthText)) {
      const month = Number.parseInt(monthText, 10);
      if (Number.isFinite(month)) {
        const monthKey = `${year}-${monthText}`;
        if (!monthlyReferral.has(monthKey)) {
          monthlyReferral.set(monthKey, { year, month, total: 0, referred: 0 });
        }
        const monthBucket = monthlyReferral.get(monthKey);
        monthBucket.total += 1;
        if (referralCategory === 'su siuntimu') {
          monthBucket.referred += 1;
        }
      }
    }
  }

  const referralCategoriesSet = new Set();
  referralYearly.forEach((entry) => {
    Object.keys(entry.values || {}).forEach((key) => {
      referralCategoriesSet.add(key);
    });
  });
  const referralCategories = ['su siuntimu', 'be siuntimo', 'Nenurodyta'].filter(
    (category) => referralCategoriesSet.has(category) || category === 'Nenurodyta'
  );
  const referralTrendRows = Array.from(referralYearly.values())
    .sort((a, b) => a.year - b.year)
    .map((entry) => ({
      year: entry.year,
      total: entry.total,
      values: Object.fromEntries(
        referralCategories.map((category) => [category, Number(entry.values?.[category] || 0)])
      ),
    }));

  const referralDispositionYearlyRows = Array.from(referralDispositionYearly.values())
    .sort((a, b) => a.year - b.year)
    .map((entry) => ({
      year: entry.year,
      totals: entry.totals,
      values: entry.values,
    }));

  const referralMonthlyRows = Array.from(monthlyReferral.values())
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((entry) => ({
      year: entry.year,
      month: entry.month,
      total: entry.total,
      referred: entry.referred,
      share: entry.total > 0 ? entry.referred / entry.total : 0,
    }));
  const monthlyYears = Array.from(new Set(referralMonthlyRows.map((row) => row.year))).sort((a, b) => a - b);

  let pspcDistributionRows = toSortedRows(pspcCounts, records.length, topN);
  pspcDistributionRows = collapseSmallGroups(pspcDistributionRows, minGroupSize, 'Kita / maža imtis');

  const pspcCorrelationRows = Array.from(pspcCorrelationBuckets.entries())
    .map(([label, bucket]) => {
      const total = Number(bucket?.total || 0);
      const referred = Number(bucket?.referred || 0);
      const hospitalized = Number(bucket?.hospitalized || 0);
      return {
        label,
        total,
        referred,
        hospitalized,
        referralShare: total > 0 ? referred / total : 0,
        hospitalizedShare: total > 0 ? hospitalized / total : 0,
      };
    })
    .filter((row) => String(row?.label || '') !== 'Nenurodyta')
    .filter((row) => Number(row.total || 0) >= minGroupSize)
    .sort((a, b) => {
      if (Number(b.total || 0) !== Number(a.total || 0)) {
        return Number(b.total || 0) - Number(a.total || 0);
      }
      return String(a.label || '').localeCompare(String(b.label || ''), 'lt');
    })
    .slice(0, topN);

  return {
    referralTrend: {
      categories: referralCategories,
      rows: referralTrendRows,
      yearOptions: scopeMeta?.yearOptions || [],
      coverage: scopeMeta?.coverage || { total: 0, extended: 0, percent: 0 },
    },
    referralDispositionYearly: {
      rows: referralDispositionYearlyRows,
      referralCategories: ['su siuntimu', 'be siuntimo'],
      dispositionCategories: ['hospitalizuoti', 'isleisti'],
      yearOptions: scopeMeta?.yearOptions || [],
      coverage: scopeMeta?.coverage || { total: 0, extended: 0, percent: 0 },
    },
    referralMonthlyHeatmap: {
      rows: referralMonthlyRows,
      years: monthlyYears,
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      yearOptions: scopeMeta?.yearOptions || [],
      coverage: scopeMeta?.coverage || { total: 0, extended: 0, percent: 0 },
    },
    pspcDistribution: {
      total: records.length,
      rows: pspcDistributionRows,
      yearOptions: scopeMeta?.yearOptions || [],
      coverage: scopeMeta?.coverage || { total: 0, extended: 0, percent: 0 },
    },
    pspcCorrelation: {
      total: records.length,
      rows: pspcCorrelationRows,
      yearOptions: scopeMeta?.yearOptions || [],
      coverage: scopeMeta?.coverage || { total: 0, extended: 0, percent: 0 },
    },
  };
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
  const sharedReferralAndPspc = computeSharedReferralAndPspcReports(scopeMeta, dashboardState);
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
    referralTrend: sharedReferralAndPspc.referralTrend,
    referralDispositionYearly: sharedReferralAndPspc.referralDispositionYearly,
    referralMonthlyHeatmap: sharedReferralAndPspc.referralMonthlyHeatmap,
    referralHospitalizedByPspcYearly: computeReferralHospitalizedShareByPspcYearly(scopeMeta.records, {
      minGroupSize: dashboardState.summariesReportsMinGroupSize,
      yearOptions: scopeMeta.yearOptions,
      shiftStartHour: scopeMeta.shiftStartHour,
    }),
    pspcCorrelation: sharedReferralAndPspc.pspcCorrelation,
    pspcDistribution: sharedReferralAndPspc.pspcDistribution,
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
  const list = Array.isArray(records) ? records : [];
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
    if (!record) {
      return;
    }
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
  const list = Array.isArray(records) ? records : [];
  const byPspc = new Map();
  list.forEach((record) => {
    if (!record) {
      return;
    }
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
