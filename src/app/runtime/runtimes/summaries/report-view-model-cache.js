import { computeReferralHospitalizedShareByPspcDetailed } from './report-computation.js';
import { parsePositiveIntOrDefault } from './report-filters.js';

function toPercent(value, total) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return (value / total) * 100;
}

function normalizeSexLabel(rawValue) {
  const value = String(rawValue || '')
    .trim()
    .toLowerCase();
  if (value === 'vyras' || value === 'male') {
    return 'Vyras';
  }
  if (value === 'moteris' || value === 'female') {
    return 'Moteris';
  }
  return 'Kita/Nenurodyta';
}

function computeAgeDistributionBySex(records) {
  const list = Array.isArray(records) ? records.filter(Boolean) : [];
  const ageOrder = ['0-17', '18-34', '35-49', '50-64', '65-79', '80+', 'Nenurodyta'];
  const sexOrder = ['Vyras', 'Moteris', 'Kita/Nenurodyta'];
  const buckets = new Map(
    ageOrder.map((label) => [
      label,
      {
        label,
        total: 0,
        bySex: { Vyras: 0, Moteris: 0, 'Kita/Nenurodyta': 0 },
      },
    ])
  );

  list.forEach((record) => {
    const ageRaw = String(record?.ageBand || '').trim();
    const age = ageOrder.includes(ageRaw) ? ageRaw : 'Nenurodyta';
    const sex = normalizeSexLabel(record?.sex);
    const bucket = buckets.get(age);
    if (!bucket) {
      return;
    }
    bucket.total += 1;
    bucket.bySex[sex] = Number(bucket.bySex?.[sex] || 0) + 1;
  });

  const rows = ageOrder
    .map((label) => buckets.get(label))
    .filter((row) => Number(row?.total || 0) > 0)
    .map((row) => ({
      label: row.label,
      total: row.total,
      bySex: {
        Vyras: Number(row.bySex?.Vyras || 0),
        Moteris: Number(row.bySex?.Moteris || 0),
        'Kita/Nenurodyta': Number(row.bySex?.['Kita/Nenurodyta'] || 0),
      },
    }));

  return { total: list.length, sexOrder, rows };
}

function buildSummariesReportsDerivedCacheKey(dashboardState, settings, scopeMeta) {
  return [
    String(dashboardState?.summariesReportsYear ?? 'all'),
    Number.parseInt(String(dashboardState?.summariesReportsTopN ?? 15), 10) || 15,
    Number.parseInt(String(dashboardState?.summariesReportsMinGroupSize ?? 100), 10) || 100,
    Number.isFinite(scopeMeta?.records?.length) ? scopeMeta.records.length : 0,
    Number.isFinite(settings?.calculations?.shiftStartHour) ? settings.calculations.shiftStartHour : '',
  ].join('|');
}

export function computeSummariesReportViewModels(
  { dashboardState, reports, scopeMeta },
  {
    computeAgeDistributionBySexFn = computeAgeDistributionBySex,
    computeReferralHospitalizedShareByPspcDetailedFn = computeReferralHospitalizedShareByPspcDetailed,
  } = {}
) {
  const diagnosis = reports?.diagnosis || { rows: [], totalPatients: 0 };
  const referralHospitalizedByPspcYearly = reports?.referralHospitalizedByPspcYearly || {
    rows: [],
    years: [],
  };
  const pspcCorrelation = reports?.pspcCorrelation || { rows: [] };
  const pspcDistribution = reports?.pspcDistribution || { rows: [], total: 0 };

  const diagnosisPercentRows = (Array.isArray(diagnosis.rows) ? diagnosis.rows : [])
    .filter((row) => String(row?.label || '') !== 'Kita / maža imtis')
    .map((row) => ({ ...row, percent: toPercent(row.count, diagnosis.totalPatients) }));

  const ageDistributionBySex = computeAgeDistributionBySexFn(scopeMeta?.records || []);
  const ageDistributionRows = (
    Array.isArray(ageDistributionBySex?.rows) ? ageDistributionBySex.rows : []
  ).filter((row) => String(row?.label || '') !== 'Nenurodyta');

  const minGroupSize = parsePositiveIntOrDefault(dashboardState?.summariesReportsMinGroupSize, 100);
  const topN = parsePositiveIntOrDefault(dashboardState?.summariesReportsTopN, 15);
  const precomputedPspcCrossDetailed = reports?.pspcCrossDetailed;
  const pspcCrossDetailed =
    precomputedPspcCrossDetailed && Array.isArray(precomputedPspcCrossDetailed.rows)
      ? precomputedPspcCrossDetailed
      : computeReferralHospitalizedShareByPspcDetailedFn(scopeMeta?.records || []);
  const referralHospitalizedPspcAllRows = Array.isArray(pspcCrossDetailed?.rows)
    ? pspcCrossDetailed.rows
    : [];
  const referralHospitalizedPspcYearlyRows = Array.isArray(referralHospitalizedByPspcYearly?.rows)
    ? referralHospitalizedByPspcYearly.rows
    : [];
  const referralHospitalizedPspcTrendCandidates = referralHospitalizedPspcYearlyRows.filter(
    (row) => Number(row?.totalReferred || 0) >= minGroupSize
  );
  const referralHospitalizedPspcTrendOptions = referralHospitalizedPspcTrendCandidates.map(
    (row) => row.label
  );

  const pspcCorrelationRows = (Array.isArray(pspcCorrelation?.rows) ? pspcCorrelation.rows : []).map(
    (row) => ({
      ...row,
      referralPercent: row.referralShare * 100,
      hospitalizedPercent: row.hospitalizedShare * 100,
    })
  );
  const pspcPercentRows = (Array.isArray(pspcDistribution?.rows) ? pspcDistribution.rows : [])
    .map((row) => ({ ...row, percent: toPercent(row.count, pspcDistribution.total) }))
    .filter((row) => String(row?.label || '') !== 'Kita / maža imtis');

  const z769Trend = reports?.z769Trend || { rows: [] };
  const z769Rows = (Array.isArray(z769Trend.rows) ? z769Trend.rows : []).map((row) => ({
    ...row,
    percent: row.share * 100,
  }));

  const referralTrend = reports?.referralTrend || { rows: [] };
  const referralPercentRows = (Array.isArray(referralTrend.rows) ? referralTrend.rows : []).map((row) => ({
    year: row.year,
    total: row.total,
    percent: toPercent(row.values?.['su siuntimu'] || 0, row.total || 0),
  }));

  return {
    diagnosisPercentRows,
    ageDistributionBySex,
    ageDistributionRows,
    minGroupSize,
    topN,
    pspcCrossDetailed,
    referralHospitalizedPspcAllRows,
    referralHospitalizedPspcYearlyRows,
    referralHospitalizedPspcTrendCandidates,
    referralHospitalizedPspcTrendOptions,
    pspcCorrelationRows,
    pspcPercentRows,
    z769Rows,
    referralPercentRows,
  };
}

export function getCachedSummariesReportViewModels(
  { dashboardState, settings, historicalRecords, scopeMeta, reports },
  deps
) {
  const key = buildSummariesReportsDerivedCacheKey(dashboardState, settings, scopeMeta);
  const cache = dashboardState?.summariesReportsDerivedCache || {};
  if (cache.recordsRef === historicalRecords && cache.key === key && cache.value) {
    return cache.value;
  }
  const value = computeSummariesReportViewModels({ dashboardState, reports, scopeMeta }, deps);
  dashboardState.summariesReportsDerivedCache = { recordsRef: historicalRecords, key, value };
  return value;
}

export async function getCachedSummariesReportViewModelsAsync(
  { dashboardState, settings, historicalRecords, scopeMeta, reports },
  deps = {}
) {
  const key = buildSummariesReportsDerivedCacheKey(dashboardState, settings, scopeMeta);
  const cache = dashboardState?.summariesReportsDerivedCache || {};
  if (cache.recordsRef === historicalRecords && cache.key === key && cache.value) {
    return cache.value;
  }

  const useWorker = deps?.useWorker === true && typeof deps?.runSummariesWorkerJobFn === 'function';
  if (useWorker) {
    try {
      const workerResult = await deps.runSummariesWorkerJobFn(
        {
          reports,
          scopeRecords: Array.isArray(scopeMeta?.records) ? scopeMeta.records : [],
          controls: {
            summariesReportsTopN: dashboardState?.summariesReportsTopN,
            summariesReportsMinGroupSize: dashboardState?.summariesReportsMinGroupSize,
          },
        },
        {}
      );
      const value = workerResult?.viewModels;
      if (value && typeof value === 'object' && Array.isArray(value.diagnosisPercentRows)) {
        dashboardState.summariesReportsDerivedCache = { recordsRef: historicalRecords, key, value };
        return value;
      }
    } catch (error) {
      console.warn('Summaries worker view-models fallback to main thread:', error);
    }
  }

  return getCachedSummariesReportViewModels(
    { dashboardState, settings, historicalRecords, scopeMeta, reports },
    deps
  );
}
