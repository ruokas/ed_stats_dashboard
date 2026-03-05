/*
 * Summaries report view-model transforms for the dashboard worker.
 */

function normalizeLithuanianTextForWorker(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function classifyPspcAreaTypeForWorker(label) {
  const normalized = normalizeLithuanianTextForWorker(label);
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

function computeReferralHospitalizedShareByPspcDetailedForWorker(records) {
  const list = Array.isArray(records) ? records : [];
  const byPspc = new Map();
  list.forEach((record) => {
    if (!record) {
      return;
    }
    const referralValue = String(record.referral || '')
      .trim()
      .toLowerCase();
    if (referralValue !== 'su siuntimu') {
      return;
    }
    const pspc = String(record.pspc || '').trim() || 'Nenurodyta';
    if (!byPspc.has(pspc)) {
      byPspc.set(pspc, {
        label: pspc,
        pspcType: classifyPspcAreaTypeForWorker(pspc),
        referredTotal: 0,
        hospitalizedCount: 0,
      });
    }
    const bucket = byPspc.get(pspc);
    bucket.referredTotal += 1;
    if (record.hospitalized === true) {
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

function normalizeSexLabelForWorker(rawValue) {
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

function computeAgeDistributionBySexForWorker(records) {
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
    const ageRaw = String(record.ageBand || '').trim();
    const age = ageOrder.includes(ageRaw) ? ageRaw : 'Nenurodyta';
    const sex = normalizeSexLabelForWorker(record.sex);
    const bucket = buckets.get(age);
    if (!bucket) {
      return;
    }
    bucket.total += 1;
    bucket.bySex[sex] = Number(bucket.bySex[sex] || 0) + 1;
  });
  const rows = ageOrder
    .map((label) => buckets.get(label))
    .filter((row) => Number((row && row.total) || 0) > 0)
    .map((row) => ({
      label: row.label,
      total: row.total,
      bySex: {
        Vyras: Number(row.bySex.Vyras || 0),
        Moteris: Number(row.bySex.Moteris || 0),
        'Kita/Nenurodyta': Number(row.bySex['Kita/Nenurodyta'] || 0),
      },
    }));
  return { total: list.length, sexOrder, rows };
}

function toPercentForWorker(value, total) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return (value / total) * 100;
}

function parsePositiveIntForWorker(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function computeSummariesReportsInWorker(request) {
  const reports = request && typeof request.reports === 'object' ? request.reports : {};
  const scopeRecords = Array.isArray(request.scopeRecords) ? request.scopeRecords : [];
  const controls = request && typeof request.controls === 'object' ? request.controls : {};

  const diagnosis = reports.diagnosis || { rows: [], totalPatients: 0 };
  const referralHospitalizedByPspcYearly = reports.referralHospitalizedByPspcYearly || {
    rows: [],
    years: [],
  };
  const pspcCorrelation = reports.pspcCorrelation || { rows: [] };
  const pspcDistribution = reports.pspcDistribution || { rows: [], total: 0 };

  const diagnosisPercentRows = (Array.isArray(diagnosis.rows) ? diagnosis.rows : [])
    .filter((row) => String((row && row.label) || '') !== 'Kita / maža imtis')
    .map((row) => ({
      ...row,
      percent: toPercentForWorker(Number((row && row.count) || 0), Number(diagnosis.totalPatients || 0)),
    }));

  const ageDistributionBySex = computeAgeDistributionBySexForWorker(scopeRecords);
  const ageDistributionRows = (
    Array.isArray(ageDistributionBySex.rows) ? ageDistributionBySex.rows : []
  ).filter((row) => String((row && row.label) || '') !== 'Nenurodyta');

  const minGroupSize = parsePositiveIntForWorker(controls.summariesReportsMinGroupSize, 100);
  const topN = parsePositiveIntForWorker(controls.summariesReportsTopN, 15);
  const pspcCrossDetailed = computeReferralHospitalizedShareByPspcDetailedForWorker(scopeRecords);
  const referralHospitalizedPspcAllRows = Array.isArray(pspcCrossDetailed.rows) ? pspcCrossDetailed.rows : [];
  const referralHospitalizedPspcYearlyRows = Array.isArray(referralHospitalizedByPspcYearly.rows)
    ? referralHospitalizedByPspcYearly.rows
    : [];
  const referralHospitalizedPspcTrendCandidates = referralHospitalizedPspcYearlyRows.filter(
    (row) => Number((row && row.totalReferred) || 0) >= minGroupSize
  );
  const referralHospitalizedPspcTrendOptions = referralHospitalizedPspcTrendCandidates.map(
    (row) => row.label
  );

  const pspcCorrelationRows = (Array.isArray(pspcCorrelation.rows) ? pspcCorrelation.rows : []).map(
    (row) => ({
      ...row,
      referralPercent: Number((row && row.referralShare) || 0) * 100,
      hospitalizedPercent: Number((row && row.hospitalizedShare) || 0) * 100,
    })
  );

  const pspcPercentRows = (Array.isArray(pspcDistribution.rows) ? pspcDistribution.rows : [])
    .map((row) => ({
      ...row,
      percent: toPercentForWorker(Number((row && row.count) || 0), Number(pspcDistribution.total || 0)),
    }))
    .filter((row) => String((row && row.label) || '') !== 'Kita / maža imtis');

  const z769Trend = reports.z769Trend || { rows: [] };
  const z769Rows = (Array.isArray(z769Trend.rows) ? z769Trend.rows : []).map((row) => ({
    ...row,
    percent: Number((row && row.share) || 0) * 100,
  }));

  const referralTrend = reports.referralTrend || { rows: [] };
  const referralPercentRows = (Array.isArray(referralTrend.rows) ? referralTrend.rows : []).map((row) => ({
    year: row.year,
    total: row.total,
    percent: toPercentForWorker(Number(row?.values?.['su siuntimu'] || 0), Number(row?.total || 0)),
  }));

  return {
    viewModels: {
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
    },
  };
}

self.computeSummariesReportsInWorker = computeSummariesReportsInWorker;
