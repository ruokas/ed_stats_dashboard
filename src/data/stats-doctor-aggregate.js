export function createDoctorAggregateComputations(deps) {
  const {
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
  } = deps;

  function buildDoctorAggregate(records, options = {}) {
    const meta = getDoctorScopedMeta(records, options);
    const byDoctor = new Map();
    const pooledLos = [];
    const monthlyByAlias = new Map();
    const monthSet = new Set();

    meta.filtered.forEach((record) => {
      const doctor = getDoctorKey(record);
      if (!doctor) {
        return;
      }
      if (!byDoctor.has(doctor.key)) {
        byDoctor.set(doctor.key, {
          alias: doctor.label,
          count: 0,
          losValues: [],
          hospitalized: 0,
          day: 0,
          night: 0,
          losLt4: 0,
          los4to8: 0,
          los8to16: 0,
          losGt16: 0,
        });
      }
      const bucket = byDoctor.get(doctor.key);
      if (!bucket.alias && doctor.label) {
        bucket.alias = doctor.label;
      }
      bucket.count += 1;
      if (record?.hospitalized === true) {
        bucket.hospitalized += 1;
      }
      if (record?.night === true) {
        bucket.night += 1;
      } else {
        bucket.day += 1;
      }

      const losHours = getLosHours(record);
      if (Number.isFinite(losHours)) {
        bucket.losValues.push(losHours);
        pooledLos.push(losHours);
        const losBucket = getLosBucket(losHours);
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

      const arrival =
        record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime()) ? record.arrival : null;
      if (arrival) {
        const monthKey = `${arrival.getFullYear()}-${String(arrival.getMonth() + 1).padStart(2, '0')}`;
        monthSet.add(monthKey);
        const monthlyBucket = getDoctorMonthlyNestedBucket(monthlyByAlias, doctor.label, monthKey);
        monthlyBucket.count += 1;
        if (Number.isFinite(losHours)) {
          monthlyBucket.losSum += losHours;
          monthlyBucket.losCount += 1;
        }
      }
    });

    const rowsAll = Array.from(byDoctor.values()).map((bucket) =>
      buildDoctorRowFromBucket(bucket, meta.filtered.length)
    );
    const rowsSortedByVolume = sortDoctorRows(rowsAll, 'volume_desc');
    const months = Array.from(monthSet).sort((a, b) => a.localeCompare(b));
    return {
      meta,
      rowsAll,
      rowsSortedByVolume,
      pooledLos,
      monthlyByAlias,
      months,
    };
  }

  function buildDoctorSpecialtyAggregate(records, options = {}) {
    const meta = getDoctorScopedMeta(records, options);
    const bySpecialty = new Map();
    const pooledLos = [];

    meta.filtered.forEach((record) => {
      const specialty = resolveDoctorSpecialtyForRecord(record, options);
      if (!specialty?.id) {
        return;
      }
      if (!bySpecialty.has(specialty.id)) {
        bySpecialty.set(specialty.id, {
          specialtyId: specialty.id,
          specialtyLabel: specialty.label || specialty.id,
          alias: specialty.label || specialty.id,
          count: 0,
          losValues: [],
          hospitalized: 0,
          day: 0,
          night: 0,
          losLt4: 0,
          los4to8: 0,
          los8to16: 0,
          losGt16: 0,
        });
      }
      const bucket = bySpecialty.get(specialty.id);
      if (!bucket.specialtyLabel && specialty.label) {
        bucket.specialtyLabel = specialty.label;
        bucket.alias = specialty.label;
      }
      bucket.count += 1;
      if (record?.hospitalized === true) {
        bucket.hospitalized += 1;
      }
      if (record?.night === true) {
        bucket.night += 1;
      } else {
        bucket.day += 1;
      }

      const losHours = getLosHours(record);
      if (Number.isFinite(losHours)) {
        bucket.losValues.push(losHours);
        pooledLos.push(losHours);
        const losBucket = getLosBucket(losHours);
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
    });

    const rowsAll = Array.from(bySpecialty.values()).map((bucket) => {
      const row = buildDoctorRowFromBucket(bucket, meta.filtered.length);
      row.specialtyId = bucket.specialtyId;
      row.specialtyLabel = bucket.specialtyLabel || row.alias;
      row.alias = row.specialtyLabel;
      return row;
    });
    return {
      meta,
      rowsAll,
      pooledLos,
    };
  }

  function getDoctorSpecialtyAggregate(records, options = {}) {
    const specialtyAggregateCache = getComputeContextRecordCache(
      options?.computeContext?.doctorSpecialtyAggregateByRecords,
      records
    );
    const cacheKey = specialtyAggregateCache ? getDoctorSpecialtyAggregateCacheKey(options) : '';
    if (specialtyAggregateCache?.has(cacheKey)) {
      return specialtyAggregateCache.get(cacheKey);
    }
    const aggregate = buildDoctorSpecialtyAggregate(records, options);
    if (specialtyAggregateCache) {
      specialtyAggregateCache.set(cacheKey, aggregate);
    }
    return aggregate;
  }

  function getDoctorAggregate(records, options = {}) {
    const precomputedDoctorAggregate = options?.doctorAggregate;
    if (precomputedDoctorAggregate && Array.isArray(precomputedDoctorAggregate.rowsAll)) {
      return precomputedDoctorAggregate;
    }
    const doctorAggregateCache = getComputeContextRecordCache(
      options?.computeContext?.doctorAggregateByRecords,
      records
    );
    const doctorAggregateCacheKey = doctorAggregateCache ? getDoctorScopedMetaCacheKey(options) : '';
    if (doctorAggregateCache?.has(doctorAggregateCacheKey)) {
      return doctorAggregateCache.get(doctorAggregateCacheKey);
    }
    const aggregate = buildDoctorAggregate(records, options);
    if (doctorAggregateCache) {
      doctorAggregateCache.set(doctorAggregateCacheKey, aggregate);
    }
    return aggregate;
  }

  function getDoctorLeaderboardRowsFromAggregate(aggregate, options = {}) {
    const minCasesRaw = Number.parseInt(String(options?.minCases ?? 30), 10);
    const minCases = Number.isFinite(minCasesRaw) && minCasesRaw > 0 ? minCasesRaw : 30;
    const topNRaw = Number.parseInt(String(options?.topN ?? 15), 10);
    const topN = Number.isFinite(topNRaw) && topNRaw > 0 ? topNRaw : 15;
    const filteredRows = (Array.isArray(aggregate?.rowsAll) ? aggregate.rowsAll : []).filter(
      (row) => Number(row?.count || 0) >= minCases
    );
    const sorted = sortDoctorRows(filteredRows, options?.sortBy);
    return sorted.slice(0, topN);
  }

  function getAllDoctorRowsForFilters(records, options = {}) {
    const aggregate = getDoctorAggregate(records, options);
    return getDoctorLeaderboardRowsFromAggregate(aggregate, {
      ...options,
      minCases: 1,
      topN: Number.MAX_SAFE_INTEGER,
      sortBy: 'volume_desc',
    });
  }

  return {
    getDoctorAggregate,
    getDoctorSpecialtyAggregate,
    getDoctorLeaderboardRowsFromAggregate,
    getAllDoctorRowsForFilters,
  };
}
