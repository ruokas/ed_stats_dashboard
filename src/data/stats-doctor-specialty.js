export function createDoctorSpecialtyYearlyComputations(deps) {
  const {
    getComputeContextRecordCache,
    getDoctorSpecialtyYearBucketsCacheKey,
    getDoctorScopedMeta,
    resolveDoctorSpecialtyForRecord,
    getLosHours,
    getLosBucket,
    getSpecialtyMetricValue,
    resolveLosDominant,
    resolveDoctorTrend,
  } = deps;

  function buildSpecialtyYearBuckets(records, options = {}) {
    const meta = getDoctorScopedMeta(records, {
      ...options,
      yearFilter: 'all',
    });
    const yearSet = new Set();
    const bucketBySpecialtyYear = new Map();
    const totalsBySpecialty = new Map();

    meta.filtered.forEach((record) => {
      const specialty = resolveDoctorSpecialtyForRecord(record, options);
      const arrival =
        record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime()) ? record.arrival : null;
      if (!specialty?.id || !arrival) {
        return;
      }
      const year = String(arrival.getFullYear());
      if (!/^\d{4}$/.test(year)) {
        return;
      }
      yearSet.add(year);
      const key = `${specialty.id}|${year}`;
      if (!bucketBySpecialtyYear.has(key)) {
        bucketBySpecialtyYear.set(key, {
          specialtyId: specialty.id,
          alias: specialty.label,
          year,
          count: 0,
          hosp: 0,
          night: 0,
          losSum: 0,
          losCount: 0,
          losLt4: 0,
          los4to8: 0,
          los8to16: 0,
          losGt16: 0,
        });
      }
      const bucket = bucketBySpecialtyYear.get(key);
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
        const losBucket = getLosBucket(los);
        if (losBucket === 'lt4') {
          bucket.losLt4 += 1;
        } else if (losBucket === '4to8') {
          bucket.los4to8 += 1;
        } else if (losBucket === '8to16') {
          bucket.los8to16 += 1;
        } else if (losBucket === 'gt16') {
          bucket.losGt16 += 1;
        }
      }
      if (!totalsBySpecialty.has(specialty.id)) {
        totalsBySpecialty.set(specialty.id, { specialtyId: specialty.id, alias: specialty.label, total: 0 });
      }
      totalsBySpecialty.get(specialty.id).total += 1;
    });

    const years = Array.from(yearSet).sort((a, b) => a.localeCompare(b));
    const availableSpecialties = Array.from(totalsBySpecialty.values())
      .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
      .map((entry) => ({
        specialtyId: String(entry.specialtyId || ''),
        alias: String(entry.alias || entry.specialtyId || ''),
        total: Number(entry.total || 0),
      }));

    return { meta, years, bucketBySpecialtyYear, totalsBySpecialty, availableSpecialties };
  }

  function getSpecialtyYearBuckets(records, options = {}) {
    const specialtyYearBucketsCache = getComputeContextRecordCache(
      options?.computeContext?.doctorSpecialtyYearBucketsByRecords,
      records
    );
    const cacheKey = specialtyYearBucketsCache ? getDoctorSpecialtyYearBucketsCacheKey(options) : '';
    if (specialtyYearBucketsCache?.has(cacheKey)) {
      return specialtyYearBucketsCache.get(cacheKey);
    }
    const base = buildSpecialtyYearBuckets(records, options);
    if (specialtyYearBucketsCache) {
      specialtyYearBucketsCache.set(cacheKey, base);
    }
    return base;
  }

  function computeDoctorSpecialtyYearlySmallMultiples(records, options = {}) {
    const metric =
      String(options?.metric || 'count') === 'hospitalizedShare'
        ? 'hospitalizedShare'
        : String(options?.metric || 'count') === 'avgLosHours'
          ? 'avgLosHours'
          : String(options?.metric || 'count') === 'nightShare'
            ? 'nightShare'
            : 'count';
    const minCasesRaw = Number.parseInt(String(options?.minCases ?? 30), 10);
    const minCases = Number.isFinite(minCasesRaw) && minCasesRaw > 0 ? minCasesRaw : 30;
    const minYearCountRaw = Number.parseInt(String(options?.minYearCount ?? 2), 10);
    const minYearCount = Number.isFinite(minYearCountRaw) && minYearCountRaw > 0 ? minYearCountRaw : 2;
    const topNRaw = Number.parseInt(String(options?.topN ?? 6), 10);
    const topN = Number.isFinite(topNRaw) && topNRaw > 0 ? topNRaw : 6;
    const selectedSpecialties = (
      Array.isArray(options?.selectedSpecialties) ? options.selectedSpecialties : []
    )
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    const selectedSet = new Set(selectedSpecialties.map((value) => value.toLowerCase()));

    const base = getSpecialtyYearBuckets(records, options);
    if (!selectedSet.size) {
      return {
        years: base.years,
        cards: [],
        coverage: base.meta.coverage,
        yearOptions: base.meta.yearOptions,
        meta: {
          metric,
          topN,
          minCases,
          minYearCount,
          requiresSelection: true,
          availableSpecialties: base.availableSpecialties,
          missingSelected: [],
        },
      };
    }

    const selectedRows = base.availableSpecialties
      .filter((entry) => {
        const aliasToken = String(entry.alias || '').toLowerCase();
        const idToken = String(entry.specialtyId || '').toLowerCase();
        return selectedSet.has(aliasToken) || selectedSet.has(idToken);
      })
      .slice(0, topN);

    const cards = selectedRows
      .map((specialty) => {
        const points = base.years.map((year) => {
          const bucket = base.bucketBySpecialtyYear.get(`${specialty.specialtyId}|${year}`) || null;
          const count = Number(bucket?.count || 0);
          return {
            year,
            count,
            hospitalizedShare: count > 0 ? Number(bucket?.hosp || 0) / count : null,
            avgLosHours:
              Number(bucket?.losCount || 0) > 0
                ? Number(bucket?.losSum || 0) / Number(bucket?.losCount)
                : null,
            nightShare: count > 0 ? Number(bucket?.night || 0) / count : null,
            unreliable: count > 0 && count < minCases,
          };
        });
        const validPoints = points.filter((point) => Number.isFinite(getSpecialtyMetricValue(point, metric)));
        if (validPoints.length < minYearCount) {
          return null;
        }
        const latest = validPoints[validPoints.length - 1] || null;
        const previous = validPoints.length > 1 ? validPoints[validPoints.length - 2] : null;
        const latestValue = getSpecialtyMetricValue(latest, metric);
        const previousValue = getSpecialtyMetricValue(previous, metric);
        const yoyDeltaAbs =
          Number.isFinite(latestValue) && Number.isFinite(previousValue)
            ? Number(latestValue) - Number(previousValue)
            : null;
        const yoyDeltaPct =
          Number.isFinite(yoyDeltaAbs) && Number.isFinite(previousValue) && Number(previousValue) > 0
            ? (Number(yoyDeltaAbs) / Number(previousValue)) * 100
            : null;
        return {
          specialtyId: String(specialty.specialtyId || ''),
          doctorKey: String(specialty.specialtyId || ''),
          alias: specialty.alias,
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

    const existingAliases = new Set(
      base.availableSpecialties.map((entry) => String(entry.alias || '').toLowerCase())
    );
    const existingIds = new Set(
      base.availableSpecialties.map((entry) => String(entry.specialtyId || '').toLowerCase())
    );
    const missingSelected = selectedSpecialties.filter(
      (alias) =>
        !existingAliases.has(String(alias).toLowerCase()) && !existingIds.has(String(alias).toLowerCase())
    );
    return {
      years: base.years,
      cards,
      coverage: base.meta.coverage,
      yearOptions: base.meta.yearOptions,
      meta: {
        metric,
        topN,
        minCases,
        minYearCount,
        requiresSelection: false,
        availableSpecialties: base.availableSpecialties,
        missingSelected,
      },
    };
  }

  function computeDoctorSpecialtyYearlyComposition(records, options = {}) {
    const minCasesRaw = Number.parseInt(String(options?.minCases ?? 30), 10);
    const minCases = Number.isFinite(minCasesRaw) && minCasesRaw > 0 ? minCasesRaw : 30;
    const minYearCountRaw = Number.parseInt(String(options?.minYearCount ?? 2), 10);
    const minYearCount = Number.isFinite(minYearCountRaw) && minYearCountRaw > 0 ? minYearCountRaw : 2;
    const topNRaw = Number.parseInt(String(options?.topN ?? 6), 10);
    const topN = Number.isFinite(topNRaw) && topNRaw > 0 ? topNRaw : 6;
    const selectedSpecialties = (
      Array.isArray(options?.selectedSpecialties) ? options.selectedSpecialties : []
    )
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    const selectedSet = new Set(selectedSpecialties.map((value) => value.toLowerCase()));

    const base = getSpecialtyYearBuckets(records, options);
    if (!selectedSet.size) {
      return {
        years: base.years,
        cards: [],
        coverage: base.meta.coverage,
        yearOptions: base.meta.yearOptions,
        meta: {
          metric: 'losGroups',
          topN,
          minCases,
          minYearCount,
          requiresSelection: true,
          availableSpecialties: base.availableSpecialties,
          missingSelected: [],
        },
      };
    }

    const selectedRows = base.availableSpecialties
      .filter((entry) => {
        const aliasToken = String(entry.alias || '').toLowerCase();
        const idToken = String(entry.specialtyId || '').toLowerCase();
        return selectedSet.has(aliasToken) || selectedSet.has(idToken);
      })
      .slice(0, topN);

    const cards = selectedRows
      .map((specialty) => {
        const points = base.years.map((year) => {
          const bucket = base.bucketBySpecialtyYear.get(`${specialty.specialtyId}|${year}`) || null;
          const count = Number(bucket?.count || 0);
          const point = {
            year,
            count,
            losLt4Share: count > 0 ? Number(bucket?.losLt4 || 0) / count : null,
            los4to8Share: count > 0 ? Number(bucket?.los4to8 || 0) / count : null,
            los8to16Share: count > 0 ? Number(bucket?.los8to16 || 0) / count : null,
            losGt16Share: count > 0 ? Number(bucket?.losGt16 || 0) / count : null,
            unreliable: count > 0 && count < minCases,
          };
          const dominant = resolveLosDominant(point);
          point.dominantBucketKey = dominant.key;
          point.dominantBucketShare = dominant.value;
          return point;
        });
        const validPoints = points.filter((point) => Number(point?.count || 0) > 0);
        if (validPoints.length < minYearCount) {
          return null;
        }
        const latest = validPoints[validPoints.length - 1] || null;
        const previous = validPoints.length > 1 ? validPoints[validPoints.length - 2] : null;
        const latestDominantKey = String(latest?.dominantBucketKey || '');
        const latestValue = Number.isFinite(latest?.dominantBucketShare)
          ? Number(latest.dominantBucketShare)
          : null;
        const previousValue =
          previous && latestDominantKey && Number.isFinite(previous?.[latestDominantKey])
            ? Number(previous[latestDominantKey])
            : null;
        const yoyDeltaAbs =
          Number.isFinite(latestValue) && Number.isFinite(previousValue)
            ? Number(latestValue) - Number(previousValue)
            : null;
        const yoyDeltaPct =
          Number.isFinite(yoyDeltaAbs) && Number.isFinite(previousValue) && Number(previousValue) > 0
            ? (Number(yoyDeltaAbs) / Number(previousValue)) * 100
            : null;
        return {
          specialtyId: String(specialty.specialtyId || ''),
          doctorKey: String(specialty.specialtyId || ''),
          alias: specialty.alias,
          points,
          latestValue,
          previousValue,
          latestDominantBucketKey: latestDominantKey,
          previousDominantBucketKey: String(previous?.dominantBucketKey || ''),
          yoyDeltaAbs,
          yoyDeltaPct,
          trend: resolveDoctorTrend('hospitalizedShare', yoyDeltaAbs),
          sampleByYear: points.map((point) => ({ year: point.year, n: Number(point.count || 0) })),
        };
      })
      .filter(Boolean);

    const existingAliases = new Set(
      base.availableSpecialties.map((entry) => String(entry.alias || '').toLowerCase())
    );
    const existingIds = new Set(
      base.availableSpecialties.map((entry) => String(entry.specialtyId || '').toLowerCase())
    );
    const missingSelected = selectedSpecialties.filter(
      (alias) =>
        !existingAliases.has(String(alias).toLowerCase()) && !existingIds.has(String(alias).toLowerCase())
    );
    return {
      years: base.years,
      cards,
      coverage: base.meta.coverage,
      yearOptions: base.meta.yearOptions,
      meta: {
        metric: 'losGroups',
        topN,
        minCases,
        minYearCount,
        requiresSelection: false,
        availableSpecialties: base.availableSpecialties,
        missingSelected,
      },
    };
  }

  return {
    computeDoctorSpecialtyYearlySmallMultiples,
    computeDoctorSpecialtyYearlyComposition,
  };
}
