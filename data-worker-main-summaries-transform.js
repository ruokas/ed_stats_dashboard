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
    .filter((row) => Number(row?.total || 0) > 0)
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

function normalizeCategoryValueForWorker(value) {
  const text = value == null ? '' : String(value).trim();
  return text || 'Nenurodyta';
}

function buildPrefixMatcherForWorker(prefixes) {
  const list = (Array.isArray(prefixes) ? prefixes : [])
    .map((value) =>
      String(value || '')
        .trim()
        .toUpperCase()
    )
    .filter(Boolean);
  if (!list.length) {
    return function alwaysFalse() {
      return false;
    };
  }
  return function matchPrefix(value) {
    const token = String(value || '').toUpperCase();
    for (let index = 0; index < list.length; index += 1) {
      if (token.startsWith(list[index])) {
        return true;
      }
    }
    return false;
  };
}

function getShiftAdjustedDateKeyForWorker(record, shiftStartHour) {
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
  return `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}-${String(
    anchor.getDate()
  ).padStart(2, '0')}`;
}

function computeAgeDiagnosisHeatmapForWorker(records, controls) {
  const scoped = Array.isArray(records) ? records : [];
  const ageOrder = ['0-17', '18-34', '35-49', '50-64', '65-79', '80+'];
  const shouldExclude = buildPrefixMatcherForWorker(['W', 'Y', 'U', 'Z', 'X']);
  const topN = parsePositiveIntForWorker(controls?.summariesReportsTopN, 12);
  const ageTotals = new Map();
  const diagnosisTotals = new Map();
  const cellCounts = new Map();

  for (let index = 0; index < scoped.length; index += 1) {
    const record = scoped[index];
    const ageBand = normalizeCategoryValueForWorker(record?.ageBand);
    if (ageOrder.indexOf(ageBand) === -1) {
      continue;
    }
    ageTotals.set(ageBand, (ageTotals.get(ageBand) || 0) + 1);
    const fromGroups = Array.isArray(record?.diagnosisGroups)
      ? record.diagnosisGroups.map((item) => normalizeCategoryValueForWorker(item))
      : [];
    const fromCodes = Array.isArray(record?.diagnosisCodes)
      ? record.diagnosisCodes
          .map((item) =>
            String(item || '')
              .trim()
              .toUpperCase()
          )
          .filter(Boolean)
          .map((code) => code.charAt(0))
      : [];
    const source = fromGroups.length ? fromGroups : fromCodes;
    const groups = new Set();
    for (let groupIndex = 0; groupIndex < source.length; groupIndex += 1) {
      const normalized = String(source[groupIndex] || '')
        .trim()
        .toUpperCase();
      if (!normalized || shouldExclude(normalized)) {
        continue;
      }
      groups.add(normalized);
    }
    groups.forEach((group) => {
      diagnosisTotals.set(group, (diagnosisTotals.get(group) || 0) + 1);
      const cellKey = `${ageBand}|||${group}`;
      cellCounts.set(cellKey, (cellCounts.get(cellKey) || 0) + 1);
    });
  }

  const diagnosisGroups = Array.from(diagnosisTotals.entries())
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : String(a[0]).localeCompare(String(b[0]), 'lt')))
    .slice(0, topN)
    .map((entry) => entry[0]);
  const rows = [];
  for (let ageIndex = 0; ageIndex < ageOrder.length; ageIndex += 1) {
    const ageBand = ageOrder[ageIndex];
    const ageTotal = Number(ageTotals.get(ageBand) || 0);
    for (let diagnosisIndex = 0; diagnosisIndex < diagnosisGroups.length; diagnosisIndex += 1) {
      const diagnosisGroup = diagnosisGroups[diagnosisIndex];
      const count = Number(cellCounts.get(`${ageBand}|||${diagnosisGroup}`) || 0);
      rows.push({
        ageBand,
        diagnosisGroup,
        count,
        ageTotal,
        percent: ageTotal > 0 ? (count / ageTotal) * 100 : 0,
      });
    }
  }
  return {
    total: scoped.length,
    ageBands: ageOrder.filter((band) => Number(ageTotals.get(band) || 0) > 0),
    diagnosisGroups,
    rows,
  };
}

function computeSharedReferralAndPspcReportsForWorker(scopeRecords, controls) {
  const records = Array.isArray(scopeRecords) ? scopeRecords : [];
  const shiftStartHour = Number.isFinite(Number(controls?.shiftStartHour))
    ? Number(controls.shiftStartHour)
    : 7;
  const topN = parsePositiveIntForWorker(controls?.summariesReportsTopN, 15);
  const minGroupSize = parsePositiveIntForWorker(controls?.summariesReportsMinGroupSize, 100);
  const referralYearly = new Map();
  const referralDispositionYearly = new Map();
  const monthlyReferral = new Map();
  const pspcCounts = new Map();
  const pspcCorrelationBuckets = new Map();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const pspc = normalizeCategoryValueForWorker(record?.pspc);
    pspcCounts.set(pspc, (pspcCounts.get(pspc) || 0) + 1);
    if (!pspcCorrelationBuckets.has(pspc)) {
      pspcCorrelationBuckets.set(pspc, { total: 0, referred: 0, hospitalized: 0 });
    }
    const pspcBucket = pspcCorrelationBuckets.get(pspc);
    pspcBucket.total += 1;
    const referralNormalized = normalizeCategoryValueForWorker(record?.referral);
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
    const dateKey = getShiftAdjustedDateKeyForWorker(record, shiftStartHour);
    const yearText = dateKey.slice(0, 4);
    if (!/^\d{4}$/.test(yearText)) {
      continue;
    }
    const year = Number.parseInt(yearText, 10);
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

  const pspcDistributionRows = Array.from(pspcCounts.entries())
    .map(([label, count]) => ({ label, count, share: records.length > 0 ? count / records.length : 0 }))
    .sort((a, b) =>
      b.count !== a.count ? b.count - a.count : String(a.label).localeCompare(String(b.label), 'lt')
    )
    .slice(0, topN);
  const pspcCorrelationRows = Array.from(pspcCorrelationBuckets.entries())
    .map(([label, bucket]) => ({
      label,
      total: Number(bucket.total || 0),
      referred: Number(bucket.referred || 0),
      hospitalized: Number(bucket.hospitalized || 0),
      referralShare: bucket.total > 0 ? bucket.referred / bucket.total : 0,
      hospitalizedShare: bucket.total > 0 ? bucket.hospitalized / bucket.total : 0,
    }))
    .filter((row) => row.label !== 'Nenurodyta' && row.total >= minGroupSize)
    .sort((a, b) =>
      b.total !== a.total ? b.total - a.total : String(a.label).localeCompare(String(b.label), 'lt')
    )
    .slice(0, topN);
  return {
    referralDispositionYearly: {
      rows: Array.from(referralDispositionYearly.values()).sort((a, b) => a.year - b.year),
      referralCategories: ['su siuntimu', 'be siuntimo'],
      dispositionCategories: ['hospitalizuoti', 'isleisti'],
    },
    referralMonthlyHeatmap: {
      rows: Array.from(monthlyReferral.values())
        .sort((a, b) => a.year - b.year || a.month - b.month)
        .map((entry) => ({
          year: entry.year,
          month: entry.month,
          total: entry.total,
          referred: entry.referred,
          share: entry.total > 0 ? entry.referred / entry.total : 0,
        })),
      years: Array.from(new Set(Array.from(monthlyReferral.values()).map((entry) => entry.year))).sort(
        (a, b) => a - b
      ),
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    },
    pspcDistribution: { total: records.length, rows: pspcDistributionRows },
    pspcCorrelation: { total: records.length, rows: pspcCorrelationRows },
  };
}

function computeReferralHospitalizedShareByPspcYearlyForWorker(records, controls) {
  const list = Array.isArray(records) ? records : [];
  const shiftStartHour = Number.isFinite(Number(controls?.shiftStartHour))
    ? Number(controls.shiftStartHour)
    : 7;
  const yearSet = new Set();
  const byPspc = new Map();
  for (let index = 0; index < list.length; index += 1) {
    const record = list[index];
    const year = getShiftAdjustedDateKeyForWorker(record, shiftStartHour).slice(0, 4);
    if (!/^\d{4}$/.test(year)) {
      continue;
    }
    yearSet.add(year);
    const referralValue = String(record?.referral || '')
      .trim()
      .toLowerCase();
    if (referralValue !== 'su siuntimu') {
      continue;
    }
    const pspc = String(record?.pspc || '').trim() || 'Nenurodyta';
    if (!byPspc.has(pspc)) {
      byPspc.set(pspc, {
        label: pspc,
        pspcType: classifyPspcAreaTypeForWorker(pspc),
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
  }
  const years = Array.from(yearSet).sort((a, b) => Number(a) - Number(b));
  const rows = Array.from(byPspc.values())
    .filter((row) => row.label !== 'Nenurodyta')
    .map((row) => ({
      label: row.label,
      pspcType: row.pspcType,
      totalReferred: row.totalReferred,
      totalHospitalized: row.totalHospitalized,
      share: row.totalReferred > 0 ? row.totalHospitalized / row.totalReferred : 0,
      yearly: years.map((year) => {
        const bucket = row.byYear.get(year) || { referredTotal: 0, hospitalizedCount: 0 };
        return {
          year,
          referredTotal: Number(bucket.referredTotal || 0),
          hospitalizedCount: Number(bucket.hospitalizedCount || 0),
          share:
            Number(bucket.referredTotal || 0) > 0
              ? Number(bucket.hospitalizedCount || 0) / Number(bucket.referredTotal || 0)
              : null,
        };
      }),
    }))
    .sort((a, b) =>
      b.totalReferred !== a.totalReferred
        ? b.totalReferred - a.totalReferred
        : String(a.label).localeCompare(String(b.label), 'lt')
    );
  return { years, rows };
}

function computeSummariesReportsInWorker(request) {
  const reports = request && typeof request.reports === 'object' ? request.reports : {};
  const scopeRecords = Array.isArray(request.scopeRecords) ? request.scopeRecords : [];
  const historicalRecords = Array.isArray(request.historicalRecords) ? request.historicalRecords : [];
  const controls = request && typeof request.controls === 'object' ? request.controls : {};
  const includeSecondaryReports = request?.reportStage === 'all';
  let nextReports = reports;
  if (includeSecondaryReports) {
    const sharedSecondary = computeSharedReferralAndPspcReportsForWorker(scopeRecords, controls);
    nextReports = {
      ...reports,
      ageDiagnosisHeatmap: computeAgeDiagnosisHeatmapForWorker(historicalRecords, controls),
      referralDispositionYearly: sharedSecondary.referralDispositionYearly,
      referralMonthlyHeatmap: sharedSecondary.referralMonthlyHeatmap,
      referralHospitalizedByPspcYearly: computeReferralHospitalizedShareByPspcYearlyForWorker(
        scopeRecords,
        controls
      ),
      pspcCrossDetailed: computeReferralHospitalizedShareByPspcDetailedForWorker(scopeRecords),
      pspcCorrelation: sharedSecondary.pspcCorrelation,
      pspcDistribution: sharedSecondary.pspcDistribution,
    };
  }

  const diagnosis = nextReports.diagnosis || { rows: [], totalPatients: 0 };
  const referralHospitalizedByPspcYearly = nextReports.referralHospitalizedByPspcYearly || {
    rows: [],
    years: [],
  };
  const pspcCorrelation = nextReports.pspcCorrelation || { rows: [] };
  const pspcDistribution = nextReports.pspcDistribution || { rows: [], total: 0 };

  const diagnosisPercentRows = (Array.isArray(diagnosis.rows) ? diagnosis.rows : [])
    .filter((row) => String(row?.label || '') !== 'Kita / maža imtis')
    .map((row) => ({
      ...row,
      percent: toPercentForWorker(Number(row?.count || 0), Number(diagnosis.totalPatients || 0)),
    }));

  const ageDistributionBySex = computeAgeDistributionBySexForWorker(scopeRecords);
  const ageDistributionRows = (
    Array.isArray(ageDistributionBySex.rows) ? ageDistributionBySex.rows : []
  ).filter((row) => String(row?.label || '') !== 'Nenurodyta');

  const minGroupSize = parsePositiveIntForWorker(controls.summariesReportsMinGroupSize, 100);
  const topN = parsePositiveIntForWorker(controls.summariesReportsTopN, 15);
  const pspcCrossDetailed =
    nextReports.pspcCrossDetailed && Array.isArray(nextReports.pspcCrossDetailed.rows)
      ? nextReports.pspcCrossDetailed
      : computeReferralHospitalizedShareByPspcDetailedForWorker(scopeRecords);
  const referralHospitalizedPspcAllRows = Array.isArray(pspcCrossDetailed.rows) ? pspcCrossDetailed.rows : [];
  const referralHospitalizedPspcYearlyRows = Array.isArray(referralHospitalizedByPspcYearly.rows)
    ? referralHospitalizedByPspcYearly.rows
    : [];
  const referralHospitalizedPspcTrendCandidates = referralHospitalizedPspcYearlyRows.filter(
    (row) => Number(row?.totalReferred || 0) >= minGroupSize
  );
  const referralHospitalizedPspcTrendOptions = referralHospitalizedPspcTrendCandidates.map(
    (row) => row.label
  );

  const pspcCorrelationRows = (Array.isArray(pspcCorrelation.rows) ? pspcCorrelation.rows : []).map(
    (row) => ({
      ...row,
      referralPercent: Number(row?.referralShare || 0) * 100,
      hospitalizedPercent: Number(row?.hospitalizedShare || 0) * 100,
    })
  );

  const pspcPercentRows = (Array.isArray(pspcDistribution.rows) ? pspcDistribution.rows : [])
    .map((row) => ({
      ...row,
      percent: toPercentForWorker(Number(row?.count || 0), Number(pspcDistribution.total || 0)),
    }))
    .filter((row) => String(row?.label || '') !== 'Kita / maža imtis');

  const z769Trend = nextReports.z769Trend || { rows: [] };
  const z769Rows = (Array.isArray(z769Trend.rows) ? z769Trend.rows : []).map((row) => ({
    ...row,
    percent: Number(row?.share || 0) * 100,
  }));

  const referralTrend = nextReports.referralTrend || { rows: [] };
  const referralPercentRows = (Array.isArray(referralTrend.rows) ? referralTrend.rows : []).map((row) => ({
    year: row.year,
    total: row.total,
    percent: toPercentForWorker(Number(row?.values?.['su siuntimu'] || 0), Number(row?.total || 0)),
  }));

  return {
    reports: includeSecondaryReports ? nextReports : undefined,
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
