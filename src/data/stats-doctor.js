import { createDoctorAggregateComputations } from './stats-doctor-aggregate.js';
import {
  buildDoctorRowFromBucket as buildDoctorRowFromBucketHelper,
  computeAverageDoctorMetrics as computeAverageDoctorMetricsHelper,
  computeMedian as computeMedianHelper,
  computeMoMPercent as computeMoMPercentHelper,
  getDoctorKey as getDoctorKeyHelper,
  getDoctorMetricValue as getDoctorMetricValueHelper,
  getDoctorMonthlyNestedBucket as getDoctorMonthlyNestedBucketHelper,
  getLosBucket as getLosBucketHelper,
  getLosHours as getLosHoursHelper,
  getSpecialtyMetricValue as getSpecialtyMetricValueHelper,
  resolveDoctorTrend as resolveDoctorTrendHelper,
  resolveLosDominant as resolveLosDominantHelper,
  sortDoctorRows as sortDoctorRowsHelper,
} from './stats-doctor-helpers.js';
import { createDoctorSpecialtyYearlyComputations } from './stats-doctor-specialty.js';

export function createDoctorStatsComputations(deps) {
  const {
    getComputeContextRecordCache,
    getDoctorScopedMetaCacheKey,
    getDoctorSpecialtyAggregateCacheKey,
    getDoctorSpecialtyYearBucketsCacheKey,
    normalizeCategoryValue,
    scopeExtendedHistoricalRecords,
  } = deps;

  function getDoctorScopedMeta(records, options = {}) {
    const precomputedDoctorScopedMeta = options?.doctorScopedMeta;
    if (precomputedDoctorScopedMeta && Array.isArray(precomputedDoctorScopedMeta.filtered)) {
      return precomputedDoctorScopedMeta;
    }
    const doctorScopedCache = getComputeContextRecordCache(
      options?.computeContext?.doctorScopedMetaByRecords,
      records
    );
    const doctorScopedCacheKey = doctorScopedCache ? getDoctorScopedMetaCacheKey(options) : '';
    if (doctorScopedCache?.has(doctorScopedCacheKey)) {
      return doctorScopedCache.get(doctorScopedCacheKey);
    }
    const scopedMeta = scopeExtendedHistoricalRecords(records, options?.yearFilter ?? 'all', options);
    const scoped = Array.isArray(scopedMeta?.records) ? scopedMeta.records : [];
    const withDoctor = scoped.filter((record) => String(record?.closingDoctorNorm || '').trim().length > 0);
    const diagnosisGroupOptions = Array.from(
      new Set(
        withDoctor
          .map((record) => normalizeCategoryValue(record?.diagnosisGroup))
          .filter((value) => value && value !== 'Nenurodyta')
      )
    ).sort((a, b) => String(a).localeCompare(String(b), 'lt'));
    const specialtyOptions = getDoctorSpecialtyOptions(withDoctor, options);
    const filtered = withDoctor.filter((record) => matchesDoctorFilters(record, options));
    const result = {
      scoped,
      withDoctor,
      filtered,
      diagnosisGroupOptions,
      specialtyOptions,
      yearOptions: Array.isArray(scopedMeta?.yearOptions) ? scopedMeta.yearOptions : [],
      coverage: {
        total: scoped.length,
        withDoctor: withDoctor.length,
        filtered: filtered.length,
        percent: scoped.length > 0 ? (withDoctor.length / scoped.length) * 100 : 0,
      },
    };
    if (doctorScopedCache) {
      doctorScopedCache.set(doctorScopedCacheKey, result);
    }
    return result;
  }

  function matchesDoctorFilters(record, options = {}) {
    const specialty = resolveDoctorSpecialtyForRecord(record, options);
    if (options?.requireMappedSpecialty === true && !specialty) {
      return false;
    }

    const arrivalFilter = String(options?.arrivalFilter || 'all');
    if (arrivalFilter === 'ems' && record?.ems !== true) {
      return false;
    }
    if (arrivalFilter === 'self' && record?.ems === true) {
      return false;
    }

    const dispositionFilter = String(options?.dispositionFilter || 'all');
    if (dispositionFilter === 'hospitalized' && record?.hospitalized !== true) {
      return false;
    }
    if (dispositionFilter === 'discharged' && record?.hospitalized === true) {
      return false;
    }

    const shiftFilter = String(options?.shiftFilter || 'all');
    if (shiftFilter === 'night' && record?.night !== true) {
      return false;
    }
    if (shiftFilter === 'day' && record?.night === true) {
      return false;
    }

    const diagnosisFilter = String(options?.diagnosisGroupFilter || 'all');
    if (diagnosisFilter !== 'all') {
      const diagnosisValue = normalizeCategoryValue(record?.diagnosisGroup);
      if (diagnosisValue !== diagnosisFilter) {
        return false;
      }
    }

    const specialtyFilter = String(options?.specialtyFilter || 'all');
    if (specialtyFilter !== 'all') {
      if (!specialty || specialty.id !== specialtyFilter) {
        return false;
      }
    }

    const searchQuery = String(options?.searchQuery || '')
      .trim()
      .toLowerCase();
    if (searchQuery) {
      const doctorLabel = String(record?.closingDoctorRaw || '')
        .trim()
        .toLowerCase();
      if (!doctorLabel.includes(searchQuery)) {
        return false;
      }
    }

    return true;
  }

  function resolveDoctorSpecialtyForRecord(record, options = {}) {
    const resolver = options?.doctorSpecialtyResolver;
    if (!resolver || typeof resolver.resolveSpecialtyForRecord !== 'function') {
      return null;
    }
    return resolver.resolveSpecialtyForRecord(record);
  }

  function getDoctorSpecialtyOptions(records, options = {}) {
    const resolver = options?.doctorSpecialtyResolver;
    if (resolver && typeof resolver.getSpecialtyOptionsForRecords === 'function') {
      return resolver.getSpecialtyOptionsForRecords(records);
    }
    const list = Array.isArray(records) ? records : [];
    const labelsById = new Map();
    list.forEach((record) => {
      const specialty = resolveDoctorSpecialtyForRecord(record, options);
      if (!specialty?.id) {
        return;
      }
      if (!labelsById.has(specialty.id)) {
        labelsById.set(specialty.id, String(specialty.label || specialty.id));
      }
    });
    const optionsList = Array.from(labelsById.entries()).map(([id, label]) => ({ id, label }));
    optionsList.sort((a, b) => String(a.label).localeCompare(String(b.label), 'lt'));
    return optionsList;
  }

  const getDoctorKey = (record) => getDoctorKeyHelper(record);
  const getLosHours = (record) => getLosHoursHelper(record);
  const getLosBucket = (losHours) => getLosBucketHelper(losHours);
  const computeMedian = (values) => computeMedianHelper(values);
  const sortDoctorRows = (rows, sortBy = 'volume_desc') => sortDoctorRowsHelper(rows, sortBy);

  const computeAverageDoctorMetrics = (rows) => computeAverageDoctorMetricsHelper(rows);
  const buildDoctorRowFromBucket = (bucket, totalFiltered) =>
    buildDoctorRowFromBucketHelper(bucket, totalFiltered);

  const getDoctorMonthlyNestedBucket = (monthlyByAlias, alias, monthKey) =>
    getDoctorMonthlyNestedBucketHelper(monthlyByAlias, alias, monthKey);

  const aggregateComputations = createDoctorAggregateComputations({
    getComputeContextRecordCache,
    getDoctorScopedMetaCacheKey,
    getDoctorSpecialtyAggregateCacheKey,
    getDoctorScopedMeta,
    resolveDoctorSpecialtyForRecord,
    getDoctorKey,
    getLosHours,
    getLosBucket,
    buildDoctorRowFromBucket,
    getDoctorMonthlyNestedBucket,
    sortDoctorRows,
  });

  function getAllDoctorRowsForFilters(records, options = {}) {
    return aggregateComputations.getAllDoctorRowsForFilters(records, options);
  }

  function getDoctorSpecialtyAggregate(records, options = {}) {
    return aggregateComputations.getDoctorSpecialtyAggregate(records, options);
  }

  function getDoctorAggregate(records, options = {}) {
    return aggregateComputations.getDoctorAggregate(records, options);
  }

  function getDoctorLeaderboardRowsFromAggregate(aggregate, options = {}) {
    return aggregateComputations.getDoctorLeaderboardRowsFromAggregate(aggregate, options);
  }

  function computeDoctorLeaderboard(records, options = {}) {
    const aggregate = getDoctorAggregate(records, options);
    const meta = aggregate.meta;
    const sorted = getDoctorLeaderboardRowsFromAggregate(aggregate, options);
    return {
      rows: sorted,
      totalCasesWithDoctor: meta.filtered.length,
      coverage: meta.coverage,
      yearOptions: meta.yearOptions,
      diagnosisGroupOptions: meta.diagnosisGroupOptions,
      specialtyOptions: meta.specialtyOptions,
      kpis: {
        activeDoctors: sorted.length,
        medianLosHours: computeMedian(aggregate.pooledLos),
        topDoctorShare: sorted.length > 0 ? sorted[0].share : 0,
      },
    };
  }

  function computeDoctorSpecialtyLeaderboard(records, options = {}) {
    const aggregate = getDoctorSpecialtyAggregate(records, options);
    const rowsAll = Array.isArray(aggregate?.rowsAll) ? aggregate.rowsAll : [];
    const rows = sortDoctorRows(rowsAll, 'volume_desc');
    const meta = aggregate?.meta || {};
    return {
      rows,
      totalCasesWithSpecialty: rowsAll.reduce((sum, row) => sum + Number(row?.count || 0), 0),
      coverage: meta.coverage || { total: 0, withDoctor: 0, filtered: 0, percent: 0 },
      yearOptions: Array.isArray(meta.yearOptions) ? meta.yearOptions : [],
      specialtyOptions: Array.isArray(meta.specialtyOptions) ? meta.specialtyOptions : [],
      kpis: {
        activeSpecialties: rows.length,
        medianLosHours: computeMedian(aggregate?.pooledLos),
        topSpecialtyShare: rows.length > 0 ? Number(rows[0]?.share || 0) : 0,
      },
    };
  }

  const getSpecialtyMetricValue = (point, metric) => getSpecialtyMetricValueHelper(point, metric);

  const resolveLosDominant = (point) => resolveLosDominantHelper(point);

  const resolveDoctorTrend = (metric, deltaAbs) => resolveDoctorTrendHelper(metric, deltaAbs);

  const specialtyYearlyComputations = createDoctorSpecialtyYearlyComputations({
    getComputeContextRecordCache,
    getDoctorSpecialtyYearBucketsCacheKey,
    getDoctorScopedMeta,
    resolveDoctorSpecialtyForRecord,
    getLosHours,
    getLosBucket,
    getSpecialtyMetricValue,
    resolveLosDominant,
    resolveDoctorTrend,
  });

  function computeDoctorSpecialtyYearlySmallMultiples(records, options = {}) {
    return specialtyYearlyComputations.computeDoctorSpecialtyYearlySmallMultiples(records, options);
  }

  function computeDoctorSpecialtyYearlyComposition(records, options = {}) {
    return specialtyYearlyComputations.computeDoctorSpecialtyYearlyComposition(records, options);
  }

  function computeDoctorYearlyMatrix(records, options = {}) {
    const meta = getDoctorScopedMeta(records, options);
    const topNRaw = Number.parseInt(String(options?.topN ?? 10), 10);
    const topN = Number.isFinite(topNRaw) && topNRaw > 0 ? topNRaw : 10;
    const yearSet = new Set();
    const bucketMap = new Map();
    meta.filtered.forEach((record) => {
      const doctor = getDoctorKey(record);
      const reference =
        record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime())
          ? record.arrival
          : record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime())
            ? record.discharge
            : null;
      const year = reference ? String(reference.getFullYear()) : '';
      if (!doctor || !/^\d{4}$/.test(year)) {
        return;
      }
      yearSet.add(year);
      const key = `${doctor.key}|${year}`;
      if (!bucketMap.has(key)) {
        bucketMap.set(key, { key: doctor.key, alias: doctor.label, year, count: 0, los: [], hosp: 0 });
      }
      const bucket = bucketMap.get(key);
      if (!bucket.alias && doctor.label) {
        bucket.alias = doctor.label;
      }
      bucket.count += 1;
      if (record?.hospitalized === true) {
        bucket.hosp += 1;
      }
      const los = getLosHours(record);
      if (Number.isFinite(los)) {
        bucket.los.push(los);
      }
    });

    const years = Array.from(yearSet).sort((a, b) => a.localeCompare(b));
    const totalsByDoctor = new Map();
    bucketMap.forEach((bucket) => {
      const current = totalsByDoctor.get(bucket.key) || { key: bucket.key, alias: bucket.alias, count: 0 };
      current.count += bucket.count;
      if (!current.alias && bucket.alias) {
        current.alias = bucket.alias;
      }
      totalsByDoctor.set(bucket.key, current);
    });
    const topDoctors = Array.from(totalsByDoctor.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, topN)
      .map((entry) => entry);

    const rows = topDoctors.map((entry) => ({
      alias: entry.alias,
      yearly: years.map((year) => {
        const bucket = bucketMap.get(`${entry.key}|${year}`);
        if (!bucket) {
          return { year, count: 0, avgLosHours: null, hospitalizedShare: null };
        }
        return {
          year,
          count: bucket.count,
          avgLosHours: bucket.los.length
            ? bucket.los.reduce((sum, value) => sum + value, 0) / bucket.los.length
            : null,
          hospitalizedShare: bucket.count > 0 ? bucket.hosp / bucket.count : null,
        };
      }),
    }));
    return { years, rows, coverage: meta.coverage, yearOptions: meta.yearOptions };
  }

  function computeDoctorMonthlyTrend(records, options = {}) {
    const aggregate = getDoctorAggregate(records, options);
    const meta = aggregate.meta;
    const topRows = getDoctorLeaderboardRowsFromAggregate(aggregate, options);
    const selected = String(options?.selectedDoctor || '__top3__');
    const selectedAliases =
      selected === '__top3__' ? topRows.slice(0, 3).map((row) => row.alias) : [selected];
    const aliasSet = new Set(selectedAliases.filter(Boolean));
    const months = aggregate.months;

    const series = Array.from(aliasSet.values()).map((alias) => ({
      alias,
      points: months.map((month) => ({
        month,
        count: Number(aggregate.monthlyByAlias.get(alias)?.get(month)?.count || 0),
      })),
    }));
    return { months, series, selectedAliases, coverage: meta.coverage };
  }

  function computeDoctorDayNightMix(records, options = {}) {
    const rows = getDoctorLeaderboardRowsFromAggregate(getDoctorAggregate(records, options), options);
    return {
      rows: rows.map((row) => ({
        alias: row.alias,
        dayShare: row.dayShare,
        nightShare: row.nightShare,
        count: row.count,
      })),
    };
  }

  function computeDoctorHospitalizationShare(records, options = {}) {
    const rows = getDoctorLeaderboardRowsFromAggregate(getDoctorAggregate(records, options), options);
    return {
      rows: rows.map((row) => ({
        alias: row.alias,
        hospitalizedShare: row.hospitalizedShare,
        count: row.count,
      })),
    };
  }

  function computeDoctorVolumeVsLosScatter(records, options = {}) {
    const rows = getDoctorLeaderboardRowsFromAggregate(getDoctorAggregate(records, options), options);
    return {
      rows: rows
        .filter((row) => Number.isFinite(row.avgLosHours))
        .map((row) => ({
          alias: row.alias,
          count: row.count,
          avgLosHours: row.avgLosHours,
          hospitalizedShare: row.hospitalizedShare,
        })),
    };
  }

  function computeDoctorDashboardModels(records, options = {}) {
    const aggregate = getDoctorAggregate(records, options);
    const leaderboardRows = getDoctorLeaderboardRowsFromAggregate(aggregate, options);
    const meta = aggregate.meta;
    const leaderboard = {
      rows: leaderboardRows,
      totalCasesWithDoctor: meta.filtered.length,
      coverage: meta.coverage,
      yearOptions: meta.yearOptions,
      diagnosisGroupOptions: meta.diagnosisGroupOptions,
      specialtyOptions: meta.specialtyOptions,
      kpis: {
        activeDoctors: leaderboardRows.length,
        medianLosHours: computeMedian(aggregate.pooledLos),
        topDoctorShare: leaderboardRows.length > 0 ? leaderboardRows[0].share : 0,
      },
    };
    const mix = {
      rows: leaderboardRows.map((row) => ({
        alias: row.alias,
        dayShare: row.dayShare,
        nightShare: row.nightShare,
        count: row.count,
      })),
    };
    const hospital = {
      rows: leaderboardRows.map((row) => ({
        alias: row.alias,
        hospitalizedShare: row.hospitalizedShare,
        count: row.count,
      })),
    };
    const scatter = {
      rows: leaderboardRows
        .filter((row) => Number.isFinite(row.avgLosHours))
        .map((row) => ({
          alias: row.alias,
          count: row.count,
          avgLosHours: row.avgLosHours,
          hospitalizedShare: row.hospitalizedShare,
        })),
    };
    return { leaderboard, mix, hospital, scatter };
  }

  const getDoctorMetricValue = (point, metric) => getDoctorMetricValueHelper(point, metric);

  function computeDoctorYearlySmallMultiples(records, options = {}) {
    const metric =
      String(options?.metric || 'count') === 'hospitalizedShare'
        ? 'hospitalizedShare'
        : String(options?.metric || 'count') === 'avgLosHours'
          ? 'avgLosHours'
          : String(options?.metric || 'count') === 'nightShare'
            ? 'nightShare'
            : 'count';
    const topNRaw = Number.parseInt(String(options?.topN ?? 12), 10);
    const topN = Number.isFinite(topNRaw) && topNRaw > 0 ? topNRaw : 12;
    const minCasesRaw = Number.parseInt(String(options?.minCases ?? 30), 10);
    const minCases = Number.isFinite(minCasesRaw) && minCasesRaw > 0 ? minCasesRaw : 30;
    const minYearCountRaw = Number.parseInt(String(options?.minYearCount ?? 2), 10);
    const minYearCount = Number.isFinite(minYearCountRaw) && minYearCountRaw > 0 ? minYearCountRaw : 2;
    const selectedDoctors = (Array.isArray(options?.selectedDoctors) ? options.selectedDoctors : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    const selectedDoctorSet = new Set(selectedDoctors.map((value) => value.toLowerCase()));
    const doctorYearBucketCache = getComputeContextRecordCache(
      options?.computeContext?.doctorYearBucketsByRecords,
      records
    );
    const doctorYearBucketCacheKey = `${getDoctorScopedMetaCacheKey({
      ...options,
      yearFilter: 'all',
    })}|doctor-annual-buckets`;
    let bucketed = doctorYearBucketCache?.get(doctorYearBucketCacheKey);
    if (!bucketed) {
      const meta = getDoctorScopedMeta(records, {
        ...options,
        yearFilter: 'all',
      });
      const yearSet = new Set();
      const bucketByDoctorYear = new Map();
      const totalsByDoctor = new Map();

      meta.filtered.forEach((record) => {
        const doctor = getDoctorKey(record);
        const arrival =
          record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime()) ? record.arrival : null;
        if (!doctor || !arrival) {
          return;
        }
        const year = String(arrival.getFullYear());
        if (!/^\d{4}$/.test(year)) {
          return;
        }
        yearSet.add(year);
        const doctorYearKey = `${doctor.key}|${year}`;
        if (!bucketByDoctorYear.has(doctorYearKey)) {
          bucketByDoctorYear.set(doctorYearKey, {
            doctorKey: doctor.key,
            alias: doctor.label,
            year,
            count: 0,
            hosp: 0,
            night: 0,
            losSum: 0,
            losCount: 0,
          });
        }
        const bucket = bucketByDoctorYear.get(doctorYearKey);
        bucket.count += 1;
        if (record?.hospitalized === true) {
          bucket.hosp += 1;
        }
        if (record?.night === true) {
          bucket.night += 1;
        }
        const los = getLosHours(record);
        if (Number.isFinite(los)) {
          bucket.losSum += los;
          bucket.losCount += 1;
        }
        if (!totalsByDoctor.has(doctor.key)) {
          totalsByDoctor.set(doctor.key, { doctorKey: doctor.key, alias: doctor.label, total: 0 });
        }
        totalsByDoctor.get(doctor.key).total += 1;
      });

      bucketed = {
        meta,
        years: Array.from(yearSet).sort((a, b) => a.localeCompare(b)),
        bucketByDoctorYear,
        totalsByDoctor,
      };
      if (doctorYearBucketCache) {
        doctorYearBucketCache.set(doctorYearBucketCacheKey, bucketed);
      }
    }
    const { meta, years, bucketByDoctorYear, totalsByDoctor } = bucketed;
    const availableDoctors = Array.from(totalsByDoctor.values())
      .filter((entry) => Number(entry?.total || 0) >= minCases)
      .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
      .map((entry) => ({
        doctorKey: entry.doctorKey,
        alias: entry.alias,
        total: Number(entry.total || 0),
      }));
    if (!selectedDoctorSet.size) {
      return {
        years,
        cards: [],
        coverage: meta.coverage,
        yearOptions: meta.yearOptions,
        meta: {
          metric,
          topN,
          minCases,
          minYearCount,
          yearScope: 'all_years',
          requiresSelection: true,
          availableDoctors,
          missingSelected: [],
        },
      };
    }
    const topDoctors = availableDoctors
      .filter((entry) => selectedDoctorSet.has(String(entry.alias || '').toLowerCase()))
      .slice(0, topN)
      .map((entry) => ({
        doctorKey: String(entry.doctorKey || '').trim(),
        alias: entry.alias,
        total: entry.total,
      }));

    const cards = topDoctors
      .map((doctor) => {
        const points = years.map((year) => {
          const bucket = bucketByDoctorYear.get(`${doctor.doctorKey}|${year}`) || null;
          const count = Number(bucket?.count || 0);
          const hospitalizedShare = count > 0 ? Number(bucket.hosp || 0) / count : null;
          const nightShare = count > 0 ? Number(bucket.night || 0) / count : null;
          const avgLosHours =
            Number(bucket?.losCount || 0) > 0 ? Number(bucket.losSum || 0) / Number(bucket.losCount) : null;
          return {
            year,
            count,
            hospitalizedShare,
            avgLosHours,
            nightShare,
            unreliable: count > 0 && count < minCases,
          };
        });
        const validPoints = points.filter((point) => Number.isFinite(getDoctorMetricValue(point, metric)));
        if (validPoints.length < minYearCount) {
          return null;
        }
        const latest = validPoints[validPoints.length - 1] || null;
        const previous = validPoints.length > 1 ? validPoints[validPoints.length - 2] : null;
        const latestValue = getDoctorMetricValue(latest, metric);
        const previousValue = getDoctorMetricValue(previous, metric);
        const yoyDeltaAbs =
          Number.isFinite(latestValue) && Number.isFinite(previousValue)
            ? Number(latestValue) - Number(previousValue)
            : null;
        const yoyDeltaPct =
          Number.isFinite(yoyDeltaAbs) && Number.isFinite(previousValue) && Number(previousValue) > 0
            ? (Number(yoyDeltaAbs) / Number(previousValue)) * 100
            : null;
        return {
          doctorKey: String(doctor.doctorKey || '').toLowerCase(),
          alias: doctor.alias,
          points,
          latestValue,
          previousValue,
          yoyDeltaAbs,
          yoyDeltaPct,
          trend: resolveDoctorTrend(metric, yoyDeltaAbs),
          sampleByYear: points.map((point) => ({ year: point.year, n: Number(point.count || 0) })),
        };
      })
      .filter(Boolean);
    const existingAliases = new Set(availableDoctors.map((entry) => String(entry.alias || '').toLowerCase()));
    const missingSelected = selectedDoctors.filter(
      (alias) => !existingAliases.has(String(alias).toLowerCase())
    );

    return {
      years,
      cards,
      coverage: meta.coverage,
      yearOptions: meta.yearOptions,
      meta: {
        metric,
        topN,
        minCases,
        minYearCount,
        yearScope: 'all_years',
        requiresSelection: false,
        availableDoctors,
        missingSelected,
      },
    };
  }

  const computeMoMPercent = (currentValue, previousValue) =>
    computeMoMPercentHelper(currentValue, previousValue);

  function computeDoctorMoMChanges(records, options = {}) {
    const aggregate = getDoctorAggregate(records, options);
    const meta = aggregate.meta;
    const topRows = getDoctorLeaderboardRowsFromAggregate(aggregate, options);
    const months = aggregate.months;
    if (months.length < 2) {
      return {
        months,
        previousMonth: null,
        currentMonth: null,
        rows: topRows.map((row) => ({
          alias: row.alias,
          prevCases: 0,
          currentCases: 0,
          casesMoMPct: null,
          prevAvgLosHours: null,
          currentAvgLosHours: null,
          avgLosMoMPct: null,
        })),
        coverage: meta.coverage,
      };
    }

    const currentMonth = months[months.length - 1];
    const previousMonth = months[months.length - 2];
    const rows = topRows.map((row) => {
      const aliasBuckets = aggregate.monthlyByAlias.get(row.alias) || null;
      const previous = aliasBuckets?.get(previousMonth) || null;
      const current = aliasBuckets?.get(currentMonth) || null;
      const prevCases = Number(previous?.count || 0);
      const currentCases = Number(current?.count || 0);
      const prevAvgLosHours =
        Number(previous?.losCount || 0) > 0 ? Number(previous.losSum || 0) / Number(previous.losCount) : null;
      const currentAvgLosHours =
        Number(current?.losCount || 0) > 0 ? Number(current.losSum || 0) / Number(current.losCount) : null;
      return {
        alias: row.alias,
        prevCases,
        currentCases,
        casesMoMPct: computeMoMPercent(currentCases, prevCases),
        prevAvgLosHours,
        currentAvgLosHours,
        avgLosMoMPct: computeMoMPercent(currentAvgLosHours, prevAvgLosHours),
      };
    });

    return {
      months,
      previousMonth,
      currentMonth,
      rows,
      coverage: meta.coverage,
    };
  }

  function computeDoctorComparisonPanel(records, options = {}) {
    const selectedDoctor = String(options?.selectedDoctor || '').trim();
    if (!selectedDoctor || selectedDoctor === '__top3__') {
      return {
        hasSelection: false,
        selectedAlias: '',
        selected: null,
        overallAverage: null,
        delta: null,
      };
    }
    const allRows = getAllDoctorRowsForFilters(records, options);
    const selected = allRows.find((row) => String(row?.alias || '') === selectedDoctor) || null;
    const overallAverage = computeAverageDoctorMetrics(allRows);
    if (!selected) {
      return {
        hasSelection: false,
        selectedAlias: selectedDoctor,
        selected: null,
        overallAverage,
        delta: null,
      };
    }
    return {
      hasSelection: true,
      selectedAlias: selected.alias,
      selected: {
        count: Number(selected.count || 0),
        avgLosHours: Number.isFinite(selected.avgLosHours) ? Number(selected.avgLosHours) : null,
        hospitalizedShare: Number.isFinite(selected.hospitalizedShare)
          ? Number(selected.hospitalizedShare)
          : null,
        nightShare: Number.isFinite(selected.nightShare) ? Number(selected.nightShare) : null,
      },
      overallAverage,
      delta: {
        count: Number(selected.count || 0) - Number(overallAverage.count || 0),
        avgLosHours:
          Number.isFinite(selected.avgLosHours) && Number.isFinite(overallAverage.avgLosHours)
            ? Number(selected.avgLosHours) - Number(overallAverage.avgLosHours)
            : null,
        hospitalizedShare:
          Number.isFinite(selected.hospitalizedShare) && Number.isFinite(overallAverage.hospitalizedShare)
            ? Number(selected.hospitalizedShare) - Number(overallAverage.hospitalizedShare)
            : null,
        nightShare:
          Number.isFinite(selected.nightShare) && Number.isFinite(overallAverage.nightShare)
            ? Number(selected.nightShare) - Number(overallAverage.nightShare)
            : null,
      },
    };
  }

  function computeDoctorKpiDeltas(records, options = {}) {
    const aggregate = getDoctorAggregate(records, options);
    const current = computeDoctorLeaderboard(records, { ...options, doctorAggregate: aggregate });
    const baselineRows = getAllDoctorRowsForFilters(records, options);
    const baseline = {
      activeDoctors: baselineRows.length,
      medianLosHours: computeMedian(aggregate.pooledLos),
      topDoctorShare: baselineRows.length > 0 ? Number(baselineRows[0]?.share || 0) : 0,
    };
    const currentKpis = current?.kpis || { activeDoctors: 0, medianLosHours: null, topDoctorShare: 0 };
    return {
      current: currentKpis,
      baseline,
      delta: {
        activeDoctors: Number(currentKpis.activeDoctors || 0) - Number(baseline.activeDoctors || 0),
        medianLosHours:
          Number.isFinite(currentKpis.medianLosHours) && Number.isFinite(baseline.medianLosHours)
            ? Number(currentKpis.medianLosHours) - Number(baseline.medianLosHours)
            : null,
        topDoctorShare:
          Number.isFinite(currentKpis.topDoctorShare) && Number.isFinite(baseline.topDoctorShare)
            ? Number(currentKpis.topDoctorShare) - Number(baseline.topDoctorShare)
            : null,
      },
    };
  }
  return {
    computeDoctorLeaderboard,
    computeDoctorSpecialtyLeaderboard,
    computeDoctorSpecialtyYearlySmallMultiples,
    computeDoctorSpecialtyYearlyComposition,
    computeDoctorYearlyMatrix,
    computeDoctorMonthlyTrend,
    computeDoctorDayNightMix,
    computeDoctorHospitalizationShare,
    computeDoctorVolumeVsLosScatter,
    computeDoctorDashboardModels,
    computeDoctorYearlySmallMultiples,
    computeDoctorMoMChanges,
    computeDoctorComparisonPanel,
    computeDoctorKpiDeltas,
  };
}
