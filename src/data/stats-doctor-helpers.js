export function getDoctorKey(record) {
  const doctorKey = String(record?.closingDoctorNorm || '').trim();
  if (!doctorKey) {
    return null;
  }
  const raw = String(record?.closingDoctorRaw || '')
    .trim()
    .replace(/\s+/g, ' ');
  return {
    key: doctorKey,
    label: raw || doctorKey,
  };
}

export function getLosHours(record) {
  if (!(record?.arrival instanceof Date) || !(record?.discharge instanceof Date)) {
    return null;
  }
  const value = (record.discharge.getTime() - record.arrival.getTime()) / 3600000;
  if (!Number.isFinite(value) || value < 0 || value > 24) {
    return null;
  }
  return value;
}

export function getLosBucket(losHours) {
  if (!Number.isFinite(losHours) || losHours < 0) {
    return '';
  }
  if (losHours < 4) {
    return 'lt4';
  }
  if (losHours < 8) {
    return '4to8';
  }
  if (losHours < 16) {
    return '8to16';
  }
  return 'gt16';
}

export function computeMedian(values) {
  const list = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!list.length) {
    return null;
  }
  const middle = Math.floor(list.length / 2);
  return list.length % 2 === 1 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
}

export function sortDoctorRows(rows, sortBy = 'volume_desc') {
  const list = Array.isArray(rows) ? rows.slice() : [];
  const normalizedSort = String(sortBy || 'volume_desc');
  return list.sort((a, b) => {
    if (normalizedSort === 'avgLos_asc') {
      return (a.avgLosHours || 0) - (b.avgLosHours || 0) || b.count - a.count;
    }
    if (normalizedSort === 'avgLos_desc') {
      return (b.avgLosHours || 0) - (a.avgLosHours || 0) || b.count - a.count;
    }
    if (normalizedSort === 'hospital_desc') {
      return (b.hospitalizedShare || 0) - (a.hospitalizedShare || 0) || b.count - a.count;
    }
    return b.count - a.count || String(a.alias).localeCompare(String(b.alias), 'lt');
  });
}

export function computeAverageDoctorMetrics(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return {
      count: 0,
      avgLosHours: null,
      hospitalizedShare: null,
      nightShare: null,
    };
  }
  let countSum = 0;
  let losSum = 0;
  let losCount = 0;
  let hospitalSum = 0;
  let hospitalCount = 0;
  let nightSum = 0;
  let nightCount = 0;
  list.forEach((row) => {
    countSum += Number(row?.count || 0);
    if (Number.isFinite(row?.avgLosHours)) {
      losSum += Number(row.avgLosHours);
      losCount += 1;
    }
    if (Number.isFinite(row?.hospitalizedShare)) {
      hospitalSum += Number(row.hospitalizedShare);
      hospitalCount += 1;
    }
    if (Number.isFinite(row?.nightShare)) {
      nightSum += Number(row.nightShare);
      nightCount += 1;
    }
  });
  return {
    count: countSum / list.length,
    avgLosHours: losCount > 0 ? losSum / losCount : null,
    hospitalizedShare: hospitalCount > 0 ? hospitalSum / hospitalCount : null,
    nightShare: nightCount > 0 ? nightSum / nightCount : null,
  };
}

export function buildDoctorRowFromBucket(bucket, totalFiltered) {
  const losValues = Array.isArray(bucket?.losValues) ? bucket.losValues : [];
  const losSum = losValues.reduce((sum, value) => sum + value, 0);
  const count = Number(bucket?.count || 0);
  return {
    alias: bucket?.alias || '',
    count,
    share: totalFiltered > 0 ? count / totalFiltered : 0,
    avgLosHours: losValues.length > 0 ? losSum / losValues.length : null,
    medianLosHours: computeMedian(losValues),
    hospitalizedShare: count > 0 ? Number(bucket?.hospitalized || 0) / count : 0,
    nightShare: count > 0 ? Number(bucket?.night || 0) / count : 0,
    dayShare: count > 0 ? Number(bucket?.day || 0) / count : 0,
    losLt4Share: count > 0 ? Number(bucket?.losLt4 || 0) / count : 0,
    los4to8Share: count > 0 ? Number(bucket?.los4to8 || 0) / count : 0,
    los8to16Share: count > 0 ? Number(bucket?.los8to16 || 0) / count : 0,
    losGt16Share: count > 0 ? Number(bucket?.losGt16 || 0) / count : 0,
  };
}

export function getDoctorMonthlyNestedBucket(monthlyByAlias, alias, monthKey) {
  if (!monthlyByAlias.has(alias)) {
    monthlyByAlias.set(alias, new Map());
  }
  const aliasBuckets = monthlyByAlias.get(alias);
  if (!aliasBuckets.has(monthKey)) {
    aliasBuckets.set(monthKey, {
      count: 0,
      losSum: 0,
      losCount: 0,
    });
  }
  return aliasBuckets.get(monthKey);
}

export function getSpecialtyMetricValue(point, metric) {
  if (!point || typeof point !== 'object') {
    return null;
  }
  if (metric === 'hospitalizedShare') {
    return Number.isFinite(point.hospitalizedShare) ? Number(point.hospitalizedShare) : null;
  }
  if (metric === 'avgLosHours') {
    return Number.isFinite(point.avgLosHours) ? Number(point.avgLosHours) : null;
  }
  if (metric === 'nightShare') {
    return Number.isFinite(point.nightShare) ? Number(point.nightShare) : null;
  }
  return Number.isFinite(point.count) ? Number(point.count) : null;
}

export function resolveLosDominant(point) {
  const candidates = [
    ['losLt4Share', Number(point?.losLt4Share)],
    ['los4to8Share', Number(point?.los4to8Share)],
    ['los8to16Share', Number(point?.los8to16Share)],
    ['losGt16Share', Number(point?.losGt16Share)],
  ].filter((entry) => Number.isFinite(entry[1]));
  if (!candidates.length) {
    return { key: '', value: null };
  }
  candidates.sort((a, b) => Number(b[1]) - Number(a[1]));
  return { key: candidates[0][0], value: candidates[0][1] };
}

export function getDoctorMetricValue(point, metric) {
  if (!point || typeof point !== 'object') {
    return null;
  }
  if (metric === 'hospitalizedShare') {
    return Number.isFinite(point.hospitalizedShare) ? Number(point.hospitalizedShare) : null;
  }
  if (metric === 'avgLosHours') {
    return Number.isFinite(point.avgLosHours) ? Number(point.avgLosHours) : null;
  }
  if (metric === 'nightShare') {
    return Number.isFinite(point.nightShare) ? Number(point.nightShare) : null;
  }
  return Number.isFinite(point.count) ? Number(point.count) : null;
}

export function resolveDoctorTrend(metric, deltaAbs) {
  if (!Number.isFinite(deltaAbs)) {
    return 'na';
  }
  const threshold = metric === 'count' ? 1 : metric === 'avgLosHours' ? 0.1 : 0.005;
  if (Math.abs(deltaAbs) <= threshold) {
    return 'flat';
  }
  return deltaAbs > 0 ? 'up' : 'down';
}

export function computeMoMPercent(currentValue, previousValue) {
  const current = Number(currentValue);
  const previous = Number(previousValue);
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}
