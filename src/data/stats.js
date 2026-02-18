const ALLOWED_SEGMENT_BY = new Set(['ageBand', 'sex', 'addressArea', 'pspc', 'diagnosisGroup']);
const AGE_BAND_ORDER = new Map([
  ['0-17', 0],
  ['18-39', 1],
  ['40-64', 2],
  ['65-79', 3],
  ['80+', 4],
  ['unknown', 5],
  ['Nenurodyta', 5],
]);

export function formatLocalDateKey(date) {
  if (!(date instanceof Date)) {
    return '';
  }
  const time = date.getTime();
  if (Number.isNaN(time)) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveShiftStartHour(calculationSettings, defaultSettings) {
  const fallback = Number.isFinite(Number(defaultSettings?.calculations?.nightEndHour))
    ? Number(defaultSettings.calculations.nightEndHour)
    : 7;
  if (Number.isFinite(Number(calculationSettings?.shiftStartHour))) {
    return Number(calculationSettings.shiftStartHour);
  }
  if (Number.isFinite(Number(calculationSettings?.nightEndHour))) {
    return Number(calculationSettings.nightEndHour);
  }
  return fallback;
}

function computeShiftDateKey(referenceDate, shiftStartHour) {
  if (!(referenceDate instanceof Date) || Number.isNaN(referenceDate.getTime())) {
    return '';
  }
  const dayMinutes = 24 * 60;
  const startMinutesRaw = Number.isFinite(Number(shiftStartHour)) ? Number(shiftStartHour) * 60 : 7 * 60;
  const startMinutes = ((Math.round(startMinutesRaw) % dayMinutes) + dayMinutes) % dayMinutes;
  const arrivalMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
  const shiftAnchor = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  if (arrivalMinutes < startMinutes) {
    shiftAnchor.setDate(shiftAnchor.getDate() - 1);
  }
  return formatLocalDateKey(shiftAnchor);
}

function normalizeSegmentBy(value) {
  return ALLOWED_SEGMENT_BY.has(value) ? value : 'ageBand';
}

function normalizeReferralFilter(value) {
  if (value === 'referred' || value === 'notReferred' || value === 'all') {
    return value;
  }
  return 'all';
}

function formatSegmentLabel(segmentBy, rawValue) {
  const value = rawValue == null ? '' : String(rawValue).trim();
  if (!value) {
    return 'Nenurodyta';
  }
  if (segmentBy === 'sex') {
    if (value === 'female') {
      return 'Moteris';
    }
    if (value === 'male') {
      return 'Vyras';
    }
    if (value === 'other') {
      return 'Kita';
    }
    return 'Nenurodyta';
  }
  if (segmentBy === 'ageBand') {
    if (value === 'unknown') {
      return 'Nenurodyta';
    }
    return value;
  }
  return value;
}

function getSegmentValue(record, segmentBy) {
  if (!record || typeof record !== 'object') {
    return '';
  }
  const value = record[segmentBy];
  if (typeof value !== 'string') {
    return value == null ? '' : String(value);
  }
  return value.trim();
}

function hasUsableSegmentValue(record, segmentBy) {
  if (!record || typeof record !== 'object') {
    return false;
  }
  if (segmentBy === 'ageBand') {
    return (
      typeof record.ageBand === 'string' && record.ageBand !== 'unknown' && record.ageBand.trim().length > 0
    );
  }
  if (segmentBy === 'sex') {
    return typeof record.sex === 'string' && record.sex !== 'unknown' && record.sex.trim().length > 0;
  }
  if (segmentBy === 'addressArea') {
    return typeof record.addressArea === 'string' && record.addressArea.trim().length > 0;
  }
  if (segmentBy === 'pspc') {
    return typeof record.pspc === 'string' && record.pspc.trim().length > 0;
  }
  if (segmentBy === 'diagnosisGroup') {
    return typeof record.diagnosisGroup === 'string' && record.diagnosisGroup.trim().length > 0;
  }
  return false;
}

function compareSegmentRows(a, b, segmentBy) {
  if ((b?.count || 0) !== (a?.count || 0)) {
    return (b?.count || 0) - (a?.count || 0);
  }
  if (segmentBy === 'ageBand') {
    const indexA = AGE_BAND_ORDER.has(a?.groupKey) ? AGE_BAND_ORDER.get(a.groupKey) : 10;
    const indexB = AGE_BAND_ORDER.has(b?.groupKey) ? AGE_BAND_ORDER.get(b.groupKey) : 10;
    if (indexA !== indexB) {
      return indexA - indexB;
    }
  }
  return String(a?.label || '').localeCompare(String(b?.label || ''), 'lt');
}

function createInsightRows(rows) {
  const visible = Array.isArray(rows) ? rows : [];
  let largestGroup = null;
  let longestStay = null;
  let highestHospitalizedShare = null;
  for (let index = 0; index < visible.length; index += 1) {
    const row = visible[index];
    if (!row || row.label === 'Kita / maža imtis') {
      continue;
    }
    if (!largestGroup || (Number(row.count) || 0) > (Number(largestGroup.count) || 0)) {
      largestGroup = row;
    }
    if (
      Number.isFinite(row.avgStayHours) &&
      (!longestStay || Number(row.avgStayHours) > Number(longestStay.avgStayHours))
    ) {
      longestStay = row;
    }
    if (
      Number.isFinite(row.hospitalizedShare) &&
      (!highestHospitalizedShare ||
        Number(row.hospitalizedShare) > Number(highestHospitalizedShare.hospitalizedShare))
    ) {
      highestHospitalizedShare = row;
    }
  }
  if (!largestGroup && !longestStay && !highestHospitalizedShare) {
    return {
      largestGroup: null,
      longestStay: null,
      highestHospitalizedShare: null,
    };
  }
  return {
    largestGroup,
    longestStay,
    highestHospitalizedShare,
  };
}

export function computeSegmentedSummaryStats(records, options = {}) {
  const list = Array.isArray(records) ? records : [];
  const calculations = options?.calculations || {};
  const defaultSettings = options?.defaultSettings || {};
  const shiftStartHour = resolveShiftStartHour(calculations, defaultSettings);
  const segmentBy = normalizeSegmentBy(options?.segmentBy);
  const referralFilter = normalizeReferralFilter(options?.referralFilter);
  const yearFilter = options?.yearFilter == null ? 'all' : options.yearFilter;
  const minGroupSizeRaw = Number.parseInt(String(options?.minGroupSize ?? 10), 10);
  const minGroupSize = Number.isFinite(minGroupSizeRaw) && minGroupSizeRaw > 0 ? minGroupSizeRaw : 10;
  const bucketMap = new Map();
  const yearSet = new Set();
  let totalCount = 0;
  let totalDurationHours = 0;
  let totalDurationCount = 0;

  list.forEach((record) => {
    const reference =
      record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime())
        ? record.arrival
        : record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime())
          ? record.discharge
          : null;
    const dateKey = computeShiftDateKey(reference, shiftStartHour);
    if (!dateKey) {
      return;
    }
    if (referralFilter === 'referred' && record?.referred !== true) {
      return;
    }
    if (referralFilter === 'notReferred' && record?.referred !== false) {
      return;
    }
    if (!hasUsableSegmentValue(record, segmentBy)) {
      return;
    }
    const year = dateKey.slice(0, 4);
    if (year) {
      yearSet.add(year);
    }
    if (yearFilter !== 'all' && String(yearFilter) !== year) {
      return;
    }
    const groupValue = getSegmentValue(record, segmentBy);
    const groupKey = groupValue || 'unknown';
    if (!bucketMap.has(groupKey)) {
      bucketMap.set(groupKey, {
        groupKey,
        label: formatSegmentLabel(segmentBy, groupValue),
        count: 0,
        ems: 0,
        hospitalized: 0,
        discharged: 0,
        referred: 0,
        totalDurationHours: 0,
        durationCount: 0,
        daySet: new Set(),
      });
    }
    const bucket = bucketMap.get(groupKey);
    bucket.count += 1;
    bucket.ems += record?.ems ? 1 : 0;
    if (record?.hospitalized) {
      bucket.hospitalized += 1;
    } else {
      bucket.discharged += 1;
    }
    bucket.referred += record?.referred === true ? 1 : 0;
    bucket.daySet.add(dateKey);
    totalCount += 1;

    if (record?.arrival instanceof Date && record?.discharge instanceof Date) {
      const durationHours = (record.discharge.getTime() - record.arrival.getTime()) / 3600000;
      if (Number.isFinite(durationHours) && durationHours >= 0 && durationHours <= 24) {
        bucket.totalDurationHours += durationHours;
        bucket.durationCount += 1;
        totalDurationHours += durationHours;
        totalDurationCount += 1;
      }
    }
  });

  const rowsBase = Array.from(bucketMap.values()).map((bucket) => {
    const dayCount = bucket.daySet.size;
    const hospitalizedShare = bucket.count > 0 ? bucket.hospitalized / bucket.count : null;
    const dischargedShare = bucket.count > 0 ? bucket.discharged / bucket.count : null;
    const emsShare = bucket.count > 0 ? bucket.ems / bucket.count : null;
    const avgStayHours = bucket.durationCount > 0 ? bucket.totalDurationHours / bucket.durationCount : null;
    return {
      groupKey: bucket.groupKey,
      label: bucket.label,
      count: bucket.count,
      dayCount,
      daySet: bucket.daySet,
      avgPerDay: dayCount > 0 ? bucket.count / dayCount : 0,
      avgStayHours,
      emsCount: bucket.ems,
      emsShare,
      hospitalizedCount: bucket.hospitalized,
      hospitalizedShare,
      dischargedCount: bucket.discharged,
      dischargedShare,
      referredCount: bucket.referred,
      referredShare: bucket.count > 0 ? bucket.referred / bucket.count : null,
      durationCount: bucket.durationCount,
      totalDurationHours: bucket.totalDurationHours,
    };
  });

  const regularRows = rowsBase.filter((row) => row.count >= minGroupSize);
  const smallRows = rowsBase.filter((row) => row.count < minGroupSize);
  let rows = regularRows.sort((a, b) => compareSegmentRows(a, b, segmentBy));

  if (smallRows.length) {
    const mergedDaySet = new Set();
    const merged = smallRows.reduce(
      (acc, row) => {
        acc.count += row.count;
        acc.emsCount += row.emsCount;
        acc.hospitalizedCount += row.hospitalizedCount;
        acc.dischargedCount += row.dischargedCount;
        acc.referredCount += row.referredCount;
        acc.durationCount += row.durationCount;
        acc.totalDurationHours += row.totalDurationHours;
        if (row.daySet instanceof Set) {
          row.daySet.forEach((dayKey) => {
            mergedDaySet.add(dayKey);
          });
        }
        return acc;
      },
      {
        count: 0,
        emsCount: 0,
        hospitalizedCount: 0,
        dischargedCount: 0,
        referredCount: 0,
        durationCount: 0,
        totalDurationHours: 0,
      }
    );
    rows = rows.concat({
      groupKey: 'small-groups',
      label: 'Kita / maža imtis',
      count: merged.count,
      dayCount: mergedDaySet.size,
      avgPerDay: mergedDaySet.size > 0 ? merged.count / mergedDaySet.size : 0,
      avgStayHours: merged.durationCount > 0 ? merged.totalDurationHours / merged.durationCount : null,
      emsCount: merged.emsCount,
      emsShare: merged.count > 0 ? merged.emsCount / merged.count : null,
      hospitalizedCount: merged.hospitalizedCount,
      hospitalizedShare: merged.count > 0 ? merged.hospitalizedCount / merged.count : null,
      dischargedCount: merged.dischargedCount,
      dischargedShare: merged.count > 0 ? merged.dischargedCount / merged.count : null,
      referredCount: merged.referredCount,
      referredShare: merged.count > 0 ? merged.referredCount / merged.count : null,
      durationCount: merged.durationCount,
      totalDurationHours: merged.totalDurationHours,
      daySet: mergedDaySet,
    });
  }

  const rowsWithoutDaySet = rows.map(({ daySet, ...row }) => row);

  const yearOptions = Array.from(yearSet)
    .filter((year) => /^\d{4}$/.test(year))
    .sort((a, b) => (a > b ? -1 : 1));
  const insights = createInsightRows(rows);
  const overallAvgStayHours = totalDurationCount > 0 ? totalDurationHours / totalDurationCount : null;

  return {
    segmentBy,
    referralFilter,
    yearFilter,
    minGroupSize,
    totalCount,
    overallAvgStayHours,
    rows: rowsWithoutDaySet,
    yearOptions,
    insights,
  };
}

export function computeDailyStats(data, calculationSettings, defaultSettings) {
  const shiftStartHour = resolveShiftStartHour(calculationSettings, defaultSettings);
  const dailyMap = new Map();
  data.forEach((record) => {
    const reference =
      record.arrival instanceof Date && !Number.isNaN(record.arrival.getTime())
        ? record.arrival
        : record.discharge instanceof Date && !Number.isNaN(record.discharge.getTime())
          ? record.discharge
          : null;
    const dateKey = computeShiftDateKey(reference, shiftStartHour);
    if (!dateKey) {
      return;
    }

    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        date: dateKey,
        count: 0,
        night: 0,
        ems: 0,
        discharged: 0,
        hospitalized: 0,
        totalTime: 0,
        durations: 0,
        hospitalizedTime: 0,
        hospitalizedDurations: 0,
      });
    }
    const summary = dailyMap.get(dateKey);
    summary.count += 1;
    summary.night += record.night ? 1 : 0;
    summary.ems += record.ems ? 1 : 0;
    if (record.hospitalized) {
      summary.hospitalized += 1;
    } else {
      summary.discharged += 1;
    }
    if (record.arrival instanceof Date && record.discharge instanceof Date) {
      const duration = (record.discharge.getTime() - record.arrival.getTime()) / 3600000;
      if (Number.isFinite(duration) && duration >= 0 && duration <= 24) {
        // ignoruojame >24 val. buvimo laikus
        summary.totalTime += duration;
        summary.durations += 1;
        if (record.hospitalized) {
          summary.hospitalizedTime += duration;
          summary.hospitalizedDurations += 1;
        }
      }
    }
  });

  return Array.from(dailyMap.values())
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .map((item) => ({
      ...item,
      avgTime: item.durations ? item.totalTime / item.durations : 0,
      avgHospitalizedTime: item.hospitalizedDurations
        ? item.hospitalizedTime / item.hospitalizedDurations
        : 0,
    }));
}

export function computeMonthlyStats(daily) {
  const monthlyMap = new Map();
  daily.forEach((entry) => {
    if (!entry?.date) {
      return;
    }
    const monthKey = entry.date.slice(0, 7);
    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, {
        month: monthKey,
        count: 0,
        night: 0,
        ems: 0,
        discharged: 0,
        hospitalized: 0,
        totalTime: 0,
        durations: 0,
        hospitalizedTime: 0,
        hospitalizedDurations: 0,
        dayCount: 0,
      });
    }
    const summary = monthlyMap.get(monthKey);
    summary.count += entry.count;
    summary.night += entry.night;
    summary.ems += entry.ems;
    summary.discharged += entry.discharged;
    summary.hospitalized += entry.hospitalized;
    summary.totalTime += entry.totalTime;
    summary.durations += entry.durations;
    summary.hospitalizedTime += entry.hospitalizedTime;
    summary.hospitalizedDurations += entry.hospitalizedDurations;
    summary.dayCount += 1;
  });

  return Array.from(monthlyMap.values()).sort((a, b) => (a.month > b.month ? 1 : -1));
}

export function computeYearlyStats(monthlyStats) {
  const yearlyMap = new Map();
  monthlyStats.forEach((entry) => {
    if (!entry?.month) {
      return;
    }
    const yearKey = entry.month.slice(0, 4);
    if (!yearKey) {
      return;
    }
    if (!yearlyMap.has(yearKey)) {
      yearlyMap.set(yearKey, {
        year: yearKey,
        count: 0,
        night: 0,
        ems: 0,
        discharged: 0,
        hospitalized: 0,
        totalTime: 0,
        durations: 0,
        hospitalizedTime: 0,
        hospitalizedDurations: 0,
        dayCount: 0,
        monthCount: 0,
      });
    }
    const bucket = yearlyMap.get(yearKey);
    bucket.count += Number.isFinite(entry.count) ? entry.count : 0;
    bucket.night += Number.isFinite(entry.night) ? entry.night : 0;
    bucket.ems += Number.isFinite(entry.ems) ? entry.ems : 0;
    bucket.discharged += Number.isFinite(entry.discharged) ? entry.discharged : 0;
    bucket.hospitalized += Number.isFinite(entry.hospitalized) ? entry.hospitalized : 0;
    bucket.totalTime += Number.isFinite(entry.totalTime) ? entry.totalTime : 0;
    bucket.durations += Number.isFinite(entry.durations) ? entry.durations : 0;
    bucket.hospitalizedTime += Number.isFinite(entry.hospitalizedTime) ? entry.hospitalizedTime : 0;
    bucket.hospitalizedDurations += Number.isFinite(entry.hospitalizedDurations)
      ? entry.hospitalizedDurations
      : 0;
    bucket.dayCount += Number.isFinite(entry.dayCount) ? entry.dayCount : 0;
    bucket.monthCount += 1;
  });

  return Array.from(yearlyMap.values()).sort((a, b) => (a.year > b.year ? 1 : -1));
}

function getRecordShiftDateKey(record, shiftStartHour) {
  const reference =
    record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime())
      ? record.arrival
      : record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime())
        ? record.discharge
        : null;
  return computeShiftDateKey(reference, shiftStartHour);
}

function normalizeYearFilterValue(yearFilter) {
  if (yearFilter === 'all' || yearFilter == null) {
    return 'all';
  }
  const raw = String(yearFilter).trim();
  return /^\d{4}$/.test(raw) ? raw : 'all';
}

function getScopedRecords(records, options = {}) {
  const precomputedScopedMeta = options?.scopedMeta;
  if (precomputedScopedMeta && Array.isArray(precomputedScopedMeta.scoped)) {
    const coverageBase = precomputedScopedMeta.coverage || {};
    const total = Number.isFinite(coverageBase.total)
      ? coverageBase.total
      : Array.isArray(records)
        ? records.length
        : 0;
    const extended = Number.isFinite(coverageBase.extended)
      ? coverageBase.extended
      : precomputedScopedMeta.scoped.length;
    return {
      scoped: precomputedScopedMeta.scoped,
      yearOptions: Array.isArray(precomputedScopedMeta.yearOptions) ? precomputedScopedMeta.yearOptions : [],
      yearFilter: normalizeYearFilterValue(precomputedScopedMeta.yearFilter ?? options?.yearFilter),
      shiftStartHour: Number.isFinite(precomputedScopedMeta.shiftStartHour)
        ? precomputedScopedMeta.shiftStartHour
        : resolveShiftStartHour(options?.calculations || {}, options?.defaultSettings || {}),
      coverage: {
        total,
        extended,
      },
    };
  }
  const list = Array.isArray(records) ? records : [];
  const calculations = options?.calculations || {};
  const defaultSettings = options?.defaultSettings || {};
  const shiftStartHour = resolveShiftStartHour(calculations, defaultSettings);
  const yearFilter = normalizeYearFilterValue(options?.yearFilter);
  const years = new Set();
  const scoped = [];
  let extendedCount = 0;
  for (let index = 0; index < list.length; index += 1) {
    const record = list[index];
    if (!record || record.hasExtendedHistoricalFields !== true) {
      continue;
    }
    extendedCount += 1;
    const dateKey = getRecordShiftDateKey(record, shiftStartHour);
    if (!dateKey) {
      continue;
    }
    const year = dateKey.slice(0, 4);
    if (!/^\d{4}$/.test(year)) {
      continue;
    }
    years.add(year);
    if (yearFilter !== 'all' && year !== yearFilter) {
      continue;
    }
    scoped.push(record);
  }
  const yearOptions = Array.from(years).sort((a, b) => (a > b ? -1 : 1));
  return {
    scoped,
    yearOptions,
    yearFilter,
    shiftStartHour,
    coverage: {
      total: list.length,
      extended: extendedCount,
    },
  };
}

export function scopeExtendedHistoricalRecords(records, yearFilter = 'all', options = {}) {
  const scopedMeta = getScopedRecords(records, { ...options, yearFilter });
  const total = Number.isFinite(scopedMeta.coverage.total) ? scopedMeta.coverage.total : 0;
  const extended = Number.isFinite(scopedMeta.coverage.extended) ? scopedMeta.coverage.extended : 0;
  return {
    records: scopedMeta.scoped,
    yearOptions: scopedMeta.yearOptions,
    yearFilter: scopedMeta.yearFilter,
    shiftStartHour: scopedMeta.shiftStartHour,
    coverage: {
      total,
      extended,
      percent: total > 0 ? extended / total : 0,
    },
  };
}

function groupByKey(records, keyGetter) {
  const map = new Map();
  (Array.isArray(records) ? records : []).forEach((record) => {
    const key = keyGetter(record);
    const normalized = typeof key === 'string' && key.trim().length ? key.trim() : 'Nenurodyta';
    map.set(normalized, (map.get(normalized) || 0) + 1);
  });
  return map;
}

export function collapseSmallGroups(rows, minGroupSize = 10, otherLabel = 'Kita / maža imtis') {
  const list = Array.isArray(rows) ? rows : [];
  const thresholdRaw = Number.parseInt(String(minGroupSize ?? 10), 10);
  const threshold = Number.isFinite(thresholdRaw) && thresholdRaw > 0 ? thresholdRaw : 10;
  const regular = [];
  let hasSmall = false;
  let mergedCount = 0;
  for (let index = 0; index < list.length; index += 1) {
    const row = list[index];
    const count = Number.isFinite(row?.count) ? row.count : Number.NaN;
    if (Number.isFinite(count) && count >= threshold) {
      regular.push(row);
      continue;
    }
    hasSmall = true;
    if (Number.isFinite(count)) {
      mergedCount += count;
    }
  }
  if (!hasSmall) {
    return regular;
  }
  if (!mergedCount) {
    return regular;
  }
  return regular.concat({ label: otherLabel, count: mergedCount, share: null });
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
  const otherCount = tail.reduce((sum, row) => sum + row.count, 0);
  if (otherCount > 0) {
    head.push({
      label: 'Kita / maža imtis',
      count: otherCount,
      share: total > 0 ? otherCount / total : 0,
    });
  }
  return head;
}

function normalizeCategoryValue(value) {
  const text = value == null ? '' : String(value).trim();
  return text || 'Nenurodyta';
}

function computeYearlyTrend(records, getCategory, categoryOrder = null) {
  const yearly = new Map();
  const categoriesSet = new Set();
  records.forEach((record) => {
    const year = Number.parseInt(String(record?.__year || ''), 10);
    if (!Number.isFinite(year)) {
      return;
    }
    const category = normalizeCategoryValue(getCategory(record));
    categoriesSet.add(category);
    if (!yearly.has(year)) {
      yearly.set(year, { year, total: 0, values: {} });
    }
    const bucket = yearly.get(year);
    bucket.total += 1;
    bucket.values[category] = (bucket.values[category] || 0) + 1;
  });
  const categories =
    Array.isArray(categoryOrder) && categoryOrder.length
      ? categoryOrder.filter((category) => categoriesSet.has(category) || category === 'Nenurodyta')
      : Array.from(categoriesSet).sort((a, b) => String(a).localeCompare(String(b), 'lt'));
  const rows = Array.from(yearly.values())
    .sort((a, b) => a.year - b.year)
    .map((entry) => {
      const values = {};
      categories.forEach((category) => {
        values[category] = Number.isFinite(entry.values[category]) ? entry.values[category] : 0;
      });
      return {
        year: entry.year,
        total: entry.total,
        values,
      };
    });
  return { categories, rows };
}

function withYearDecorations(records, shiftStartHour) {
  return (Array.isArray(records) ? records : [])
    .map((record) => {
      const dateKey = getRecordShiftDateKey(record, shiftStartHour);
      const year = dateKey ? dateKey.slice(0, 4) : '';
      if (!/^\d{4}$/.test(year)) {
        return null;
      }
      return { ...record, __year: year };
    })
    .filter(Boolean);
}

export function computeCityDistribution(records, options = {}) {
  const scopedMeta = getScopedRecords(records, options);
  const scoped = scopedMeta.scoped;
  const cityCounts = new Map();
  const unassignedCounts = new Map();
  scoped.forEach((record) => {
    const city = normalizeCategoryValue(record?.cityNorm);
    if (city === 'Nenurodyta') {
      const raw = normalizeCategoryValue(record?.cityRaw);
      unassignedCounts.set(raw, (unassignedCounts.get(raw) || 0) + 1);
    } else {
      cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
    }
  });
  const total = scoped.length;
  const topN = Number.parseInt(String(options?.topN ?? 15), 10);
  const rows = toSortedRows(cityCounts, total, topN);
  const unassignedRows = Array.from(unassignedCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  return {
    total,
    rows,
    unassignedRows,
    yearOptions: scopedMeta.yearOptions,
    coverage: scopedMeta.coverage,
  };
}

export function computeDiagnosisFrequency(records, options = {}) {
  const scopedMeta = getScopedRecords(records, options);
  const scoped = scopedMeta.scoped;
  const totalPatients = scoped.length;
  const excludePrefixes = Array.isArray(options?.excludePrefixes)
    ? options.excludePrefixes.map((item) => String(item || '').toUpperCase()).filter(Boolean)
    : [];
  const counts = new Map();
  scoped.forEach((record) => {
    const codes = Array.isArray(record?.diagnosisCodes)
      ? record.diagnosisCodes.filter((item) => typeof item === 'string' && item.trim().length)
      : [];
    if (!codes.length) {
      counts.set('Nenurodyta', (counts.get('Nenurodyta') || 0) + 1);
      return;
    }
    const unique = new Set(codes.map((code) => String(code).trim().toUpperCase()));
    unique.forEach((code) => {
      if (excludePrefixes.some((prefix) => code.startsWith(prefix))) {
        return;
      }
      counts.set(code, (counts.get(code) || 0) + 1);
    });
  });
  const rows = toSortedRows(counts, totalPatients, Number.parseInt(String(options?.topN ?? 15), 10));
  return {
    totalPatients,
    totalDiagnoses: rows.reduce((sum, row) => sum + row.count, 0),
    rows,
    yearOptions: scopedMeta.yearOptions,
    coverage: scopedMeta.coverage,
  };
}

export function computeDiagnosisCodeYearlyShare(records, code, options = {}) {
  const scopedMeta = getScopedRecords(records, options);
  const scoped = withYearDecorations(scopedMeta.scoped, scopedMeta.shiftStartHour);
  const targetCode = String(code || '')
    .trim()
    .toUpperCase();
  const yearly = new Map();
  scoped.forEach((record) => {
    const year = Number.parseInt(String(record?.__year || ''), 10);
    if (!Number.isFinite(year)) {
      return;
    }
    if (!yearly.has(year)) {
      yearly.set(year, { year, total: 0, matched: 0 });
    }
    const bucket = yearly.get(year);
    bucket.total += 1;
    const codes = Array.isArray(record?.diagnosisCodes)
      ? record.diagnosisCodes.map((item) =>
          String(item || '')
            .trim()
            .toUpperCase()
        )
      : [];
    if (targetCode && codes.some((item) => item === targetCode || item.startsWith(`${targetCode}.`))) {
      bucket.matched += 1;
    }
  });
  const rows = Array.from(yearly.values())
    .sort((a, b) => a.year - b.year)
    .map((entry) => ({
      year: entry.year,
      total: entry.total,
      matched: entry.matched,
      share: entry.total > 0 ? entry.matched / entry.total : 0,
    }));
  return {
    code: targetCode,
    rows,
    yearOptions: scopedMeta.yearOptions,
    coverage: scopedMeta.coverage,
  };
}

export function computeReferralYearlyTrend(records, options = {}) {
  const scopedMeta = getScopedRecords(records, options);
  const scoped = withYearDecorations(scopedMeta.scoped, scopedMeta.shiftStartHour);
  const trend = computeYearlyTrend(
    scoped,
    (record) => {
      const value = normalizeCategoryValue(record?.referral);
      if (value === 'su siuntimu' || value === 'be siuntimo') {
        return value;
      }
      return 'Nenurodyta';
    },
    ['su siuntimu', 'be siuntimo', 'Nenurodyta']
  );
  return {
    ...trend,
    yearOptions: scopedMeta.yearOptions,
    coverage: scopedMeta.coverage,
  };
}

export function computeReferralDispositionYearlyTrend(records, options = {}) {
  const scopedMeta = getScopedRecords(records, options);
  const scoped = withYearDecorations(scopedMeta.scoped, scopedMeta.shiftStartHour);
  const yearly = new Map();
  scoped.forEach((record) => {
    const year = Number.parseInt(String(record?.__year || ''), 10);
    if (!Number.isFinite(year)) {
      return;
    }
    const referral =
      normalizeCategoryValue(record?.referral) === 'su siuntimu' ? 'su siuntimu' : 'be siuntimo';
    const disposition = record?.hospitalized === true ? 'hospitalizuoti' : 'isleisti';
    if (!yearly.has(year)) {
      yearly.set(year, {
        year,
        totals: { 'su siuntimu': 0, 'be siuntimo': 0 },
        values: {
          'su siuntimu': { hospitalizuoti: 0, isleisti: 0 },
          'be siuntimo': { hospitalizuoti: 0, isleisti: 0 },
        },
      });
    }
    const bucket = yearly.get(year);
    bucket.totals[referral] += 1;
    bucket.values[referral][disposition] += 1;
  });

  const rows = Array.from(yearly.values())
    .sort((a, b) => a.year - b.year)
    .map((entry) => ({
      year: entry.year,
      totals: entry.totals,
      values: entry.values,
    }));

  return {
    rows,
    referralCategories: ['su siuntimu', 'be siuntimo'],
    dispositionCategories: ['hospitalizuoti', 'isleisti'],
    yearOptions: scopedMeta.yearOptions,
    coverage: scopedMeta.coverage,
  };
}

export function computeReferralMonthlyHeatmap(records, options = {}) {
  const scopedMeta = getScopedRecords(records, options);
  const scoped = scopedMeta.scoped;
  const shiftStartHour = scopedMeta.shiftStartHour;
  const monthMap = new Map();

  scoped.forEach((record) => {
    const dateKey = getRecordShiftDateKey(record, shiftStartHour);
    if (!dateKey) {
      return;
    }
    const year = dateKey.slice(0, 4);
    const month = dateKey.slice(5, 7);
    if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) {
      return;
    }
    const monthKey = `${year}-${month}`;
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { year: Number(year), month: Number(month), total: 0, referred: 0 });
    }
    const bucket = monthMap.get(monthKey);
    bucket.total += 1;
    if (normalizeCategoryValue(record?.referral) === 'su siuntimu') {
      bucket.referred += 1;
    }
  });

  const rows = Array.from(monthMap.values())
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((entry) => ({
      year: entry.year,
      month: entry.month,
      total: entry.total,
      referred: entry.referred,
      share: entry.total > 0 ? entry.referred / entry.total : 0,
    }));

  const years = Array.from(new Set(rows.map((row) => row.year))).sort((a, b) => a - b);
  return {
    rows,
    years,
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    yearOptions: scopedMeta.yearOptions,
    coverage: scopedMeta.coverage,
  };
}

export function computeAgeDistribution(records, options = {}) {
  const scopedMeta = getScopedRecords(records, options);
  const scoped = scopedMeta.scoped;
  const ageOrder = ['0-17', '18-34', '35-49', '50-64', '65-79', '80+', 'Nenurodyta'];
  const counts = groupByKey(scoped, (record) => normalizeCategoryValue(record?.ageBand));
  const rows = ageOrder
    .filter((label) => counts.has(label))
    .map((label) => ({
      label,
      count: counts.get(label) || 0,
      share: scoped.length > 0 ? (counts.get(label) || 0) / scoped.length : 0,
    }));
  return {
    total: scoped.length,
    rows,
    yearOptions: scopedMeta.yearOptions,
    coverage: scopedMeta.coverage,
  };
}

export function computeAgeDiagnosisHeatmap(records, options = {}) {
  const scopedMeta = getScopedRecords(records, options);
  const scoped = scopedMeta.scoped;
  const ageOrder = ['0-17', '18-34', '35-49', '50-64', '65-79', '80+'];
  const excludePrefixes = Array.isArray(options?.excludePrefixes)
    ? options.excludePrefixes.map((item) => String(item || '').toUpperCase()).filter(Boolean)
    : [];
  const topNRaw = Number.parseInt(String(options?.topN ?? 12), 10);
  const topN = Number.isFinite(topNRaw) && topNRaw > 0 ? topNRaw : 12;

  const ageTotals = new Map();
  const diagnosisTotals = new Map();
  const cellCounts = new Map();

  scoped.forEach((record) => {
    const ageBand = normalizeCategoryValue(record?.ageBand);
    if (!ageOrder.includes(ageBand)) {
      return;
    }
    ageTotals.set(ageBand, (ageTotals.get(ageBand) || 0) + 1);

    const fromGroups = Array.isArray(record?.diagnosisGroups)
      ? record.diagnosisGroups.map((item) => normalizeCategoryValue(item))
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
    const groups = new Set(
      source
        .map((item) =>
          String(item || '')
            .trim()
            .toUpperCase()
        )
        .filter(Boolean)
        .filter((item) => !excludePrefixes.some((prefix) => item.startsWith(prefix)))
    );
    if (!groups.size) {
      return;
    }
    groups.forEach((group) => {
      diagnosisTotals.set(group, (diagnosisTotals.get(group) || 0) + 1);
      const cellKey = `${ageBand}|||${group}`;
      cellCounts.set(cellKey, (cellCounts.get(cellKey) || 0) + 1);
    });
  });

  const diagnosisGroups = Array.from(diagnosisTotals.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return String(a[0]).localeCompare(String(b[0]), 'lt');
    })
    .slice(0, topN)
    .map(([group]) => group);
  const diagnosisSet = new Set(diagnosisGroups);

  const rows = [];
  ageOrder.forEach((ageBand) => {
    const ageTotal = Number(ageTotals.get(ageBand) || 0);
    diagnosisGroups.forEach((group) => {
      const cellKey = `${ageBand}|||${group}`;
      const count = Number(cellCounts.get(cellKey) || 0);
      rows.push({
        ageBand,
        diagnosisGroup: group,
        count,
        ageTotal,
        percent: ageTotal > 0 ? (count / ageTotal) * 100 : 0,
      });
    });
  });

  return {
    total: scoped.length,
    ageBands: ageOrder.filter((band) => Number(ageTotals.get(band) || 0) > 0),
    diagnosisGroups: diagnosisGroups.filter((group) => diagnosisSet.has(group)),
    rows,
    yearOptions: scopedMeta.yearOptions,
    coverage: scopedMeta.coverage,
  };
}

export function computeAgeYearlyTrend(records, options = {}) {
  const scopedMeta = getScopedRecords(records, options);
  const scoped = withYearDecorations(scopedMeta.scoped, scopedMeta.shiftStartHour);
  const trend = computeYearlyTrend(scoped, (record) => normalizeCategoryValue(record?.ageBand), [
    '0-17',
    '18-34',
    '35-49',
    '50-64',
    '65-79',
    '80+',
    'Nenurodyta',
  ]);
  return {
    ...trend,
    yearOptions: scopedMeta.yearOptions,
    coverage: scopedMeta.coverage,
  };
}

export function computePspcDistribution(records, options = {}) {
  const scopedMeta = getScopedRecords(records, options);
  const scoped = scopedMeta.scoped;
  const counts = groupByKey(scoped, (record) => normalizeCategoryValue(record?.pspc));
  const topN = Number.parseInt(String(options?.topN ?? 15), 10);
  let rows = toSortedRows(counts, scoped.length, topN);
  rows = collapseSmallGroups(rows, options?.minGroupSize, 'Kita / maža imtis');
  return {
    total: scoped.length,
    rows,
    yearOptions: scopedMeta.yearOptions,
    coverage: scopedMeta.coverage,
  };
}

export function computePspcReferralHospitalizationCorrelation(records, options = {}) {
  const scopedMeta = getScopedRecords(records, options);
  const scoped = scopedMeta.scoped;
  const bucketMap = new Map();

  scoped.forEach((record) => {
    const pspc = normalizeCategoryValue(record?.pspc);
    if (!bucketMap.has(pspc)) {
      bucketMap.set(pspc, {
        total: 0,
        referred: 0,
        hospitalized: 0,
      });
    }
    const bucket = bucketMap.get(pspc);
    bucket.total += 1;
    if (normalizeCategoryValue(record?.referral) === 'su siuntimu') {
      bucket.referred += 1;
    }
    if (record?.hospitalized === true) {
      bucket.hospitalized += 1;
    }
  });

  const minGroupSizeRaw = Number.parseInt(String(options?.minGroupSize ?? 10), 10);
  const minGroupSize = Number.isFinite(minGroupSizeRaw) && minGroupSizeRaw > 0 ? minGroupSizeRaw : 10;
  const topNRaw = Number.parseInt(String(options?.topN ?? 15), 10);
  const topN = Number.isFinite(topNRaw) && topNRaw > 0 ? topNRaw : 15;

  const rows = Array.from(bucketMap.entries())
    .map(([label, bucket]) => {
      const total = Number.isFinite(bucket?.total) ? bucket.total : 0;
      const referred = Number.isFinite(bucket?.referred) ? bucket.referred : 0;
      const hospitalized = Number.isFinite(bucket?.hospitalized) ? bucket.hospitalized : 0;
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
    .filter((row) => row.total >= minGroupSize)
    .sort((a, b) => {
      if (b.total !== a.total) {
        return b.total - a.total;
      }
      return String(a.label).localeCompare(String(b.label), 'lt');
    })
    .slice(0, topN);

  return {
    total: scoped.length,
    rows,
    yearOptions: scopedMeta.yearOptions,
    coverage: scopedMeta.coverage,
  };
}

export function computeReferralHospitalizedShareByPspc(records, options = {}) {
  const scopedMeta = getScopedRecords(records, options);
  const scoped = scopedMeta.scoped.filter(
    (record) => normalizeCategoryValue(record?.referral) === 'su siuntimu'
  );
  const bucketMap = new Map();
  scoped.forEach((record) => {
    const pspc = normalizeCategoryValue(record?.pspc);
    if (!bucketMap.has(pspc)) {
      bucketMap.set(pspc, { referredTotal: 0, hospitalizedCount: 0 });
    }
    const bucket = bucketMap.get(pspc);
    bucket.referredTotal += 1;
    if (record?.hospitalized === true) {
      bucket.hospitalizedCount += 1;
    }
  });

  const minGroupSizeRaw = Number.parseInt(String(options?.minGroupSize ?? 10), 10);
  const minGroupSize = Number.isFinite(minGroupSizeRaw) && minGroupSizeRaw > 0 ? minGroupSizeRaw : 10;
  const topNRaw = Number.parseInt(String(options?.topN ?? 15), 10);
  const topN = Number.isFinite(topNRaw) && topNRaw > 0 ? topNRaw : 15;
  const sortDirection = String(options?.sortDirection || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

  const rows = Array.from(bucketMap.entries())
    .map(([label, bucket]) => {
      const referredTotal = Number.isFinite(bucket?.referredTotal) ? bucket.referredTotal : 0;
      const hospitalizedCount = Number.isFinite(bucket?.hospitalizedCount) ? bucket.hospitalizedCount : 0;
      return {
        label,
        referredTotal,
        hospitalizedCount,
        share: referredTotal > 0 ? hospitalizedCount / referredTotal : 0,
      };
    })
    .filter((row) => String(row?.label || '') !== 'Nenurodyta')
    .filter((row) => row.referredTotal >= minGroupSize)
    .sort((a, b) => {
      if (a.share !== b.share) {
        return sortDirection === 'asc' ? a.share - b.share : b.share - a.share;
      }
      if (a.referredTotal !== b.referredTotal) {
        return sortDirection === 'asc'
          ? a.referredTotal - b.referredTotal
          : b.referredTotal - a.referredTotal;
      }
      return String(a.label).localeCompare(String(b.label), 'lt');
    })
    .slice(0, topN);

  return {
    totalReferred: scoped.length,
    rows,
    yearOptions: scopedMeta.yearOptions,
    coverage: scopedMeta.coverage,
  };
}

export function computePspcYearlyTrend(records, options = {}) {
  const scopedMeta = getScopedRecords(records, options);
  const scoped = withYearDecorations(scopedMeta.scoped, scopedMeta.shiftStartHour);
  const topN = Number.parseInt(String(options?.topN ?? 15), 10);
  const counts = groupByKey(scoped, (record) => normalizeCategoryValue(record?.pspc));
  const topCategories = toSortedRows(counts, scoped.length, topN).map((row) => row.label);
  const trend = computeYearlyTrend(
    scoped,
    (record) => {
      const category = normalizeCategoryValue(record?.pspc);
      return topCategories.includes(category) ? category : 'Kita / maža imtis';
    },
    topCategories.concat('Kita / maža imtis')
  );
  return {
    ...trend,
    yearOptions: scopedMeta.yearOptions,
    coverage: scopedMeta.coverage,
  };
}

export function computeSexDistribution(records, options = {}) {
  const scopedMeta = getScopedRecords(records, options);
  const scoped = scopedMeta.scoped;
  const order = ['Vyras', 'Moteris', 'Kita/Nenurodyta'];
  const counts = groupByKey(scoped, (record) => normalizeCategoryValue(record?.sex));
  const rows = order
    .filter((label) => counts.has(label))
    .map((label) => ({
      label,
      count: counts.get(label) || 0,
      share: scoped.length > 0 ? (counts.get(label) || 0) / scoped.length : 0,
    }));
  return {
    total: scoped.length,
    rows,
    yearOptions: scopedMeta.yearOptions,
    coverage: scopedMeta.coverage,
  };
}

export function computeSexYearlyTrend(records, options = {}) {
  const scopedMeta = getScopedRecords(records, options);
  const scoped = withYearDecorations(scopedMeta.scoped, scopedMeta.shiftStartHour);
  const trend = computeYearlyTrend(scoped, (record) => normalizeCategoryValue(record?.sex), [
    'Vyras',
    'Moteris',
    'Kita/Nenurodyta',
  ]);
  return {
    ...trend,
    yearOptions: scopedMeta.yearOptions,
    coverage: scopedMeta.coverage,
  };
}

function getDoctorScopedMeta(records, options = {}) {
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
  const filtered = withDoctor.filter((record) => matchesDoctorFilters(record, options));
  return {
    scoped,
    withDoctor,
    filtered,
    diagnosisGroupOptions,
    yearOptions: Array.isArray(scopedMeta?.yearOptions) ? scopedMeta.yearOptions : [],
    coverage: {
      total: scoped.length,
      withDoctor: withDoctor.length,
      filtered: filtered.length,
      percent: scoped.length > 0 ? (withDoctor.length / scoped.length) * 100 : 0,
    },
  };
}

function matchesDoctorFilters(record, options = {}) {
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

function getDoctorKey(record) {
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

function getLosHours(record) {
  if (!(record?.arrival instanceof Date) || !(record?.discharge instanceof Date)) {
    return null;
  }
  const value = (record.discharge.getTime() - record.arrival.getTime()) / 3600000;
  if (!Number.isFinite(value) || value < 0 || value > 24) {
    return null;
  }
  return value;
}

function getLosBucket(losHours) {
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

function computeMedian(values) {
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

function sortDoctorRows(rows, sortBy = 'volume_desc') {
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

function getAllDoctorRowsForFilters(records, options = {}) {
  const baseline = computeDoctorLeaderboard(records, {
    ...options,
    minCases: 1,
    topN: Number.MAX_SAFE_INTEGER,
    sortBy: 'volume_desc',
  });
  return Array.isArray(baseline?.rows) ? baseline.rows : [];
}

function computeAverageDoctorMetrics(rows) {
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

export function computeDoctorLeaderboard(records, options = {}) {
  const meta = getDoctorScopedMeta(records, options);
  const minCasesRaw = Number.parseInt(String(options?.minCases ?? 30), 10);
  const minCases = Number.isFinite(minCasesRaw) && minCasesRaw > 0 ? minCasesRaw : 30;
  const topNRaw = Number.parseInt(String(options?.topN ?? 15), 10);
  const topN = Number.isFinite(topNRaw) && topNRaw > 0 ? topNRaw : 15;
  const byDoctor = new Map();

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

  const rows = Array.from(byDoctor.values())
    .filter((row) => row.count >= minCases)
    .map((row) => ({
      alias: row.alias,
      count: row.count,
      share: meta.filtered.length > 0 ? row.count / meta.filtered.length : 0,
      avgLosHours:
        row.losValues.length > 0
          ? row.losValues.reduce((sum, value) => sum + value, 0) / row.losValues.length
          : null,
      medianLosHours: computeMedian(row.losValues),
      hospitalizedShare: row.count > 0 ? row.hospitalized / row.count : 0,
      nightShare: row.count > 0 ? row.night / row.count : 0,
      dayShare: row.count > 0 ? row.day / row.count : 0,
      losLt4Share: row.count > 0 ? row.losLt4 / row.count : 0,
      los4to8Share: row.count > 0 ? row.los4to8 / row.count : 0,
      los8to16Share: row.count > 0 ? row.los8to16 / row.count : 0,
      losGt16Share: row.count > 0 ? row.losGt16 / row.count : 0,
    }));

  const sorted = sortDoctorRows(rows, options?.sortBy).slice(0, topN);
  const pooledLos = meta.filtered.map((record) => getLosHours(record)).filter((value) => value != null);
  return {
    rows: sorted,
    totalCasesWithDoctor: meta.filtered.length,
    coverage: meta.coverage,
    yearOptions: meta.yearOptions,
    diagnosisGroupOptions: meta.diagnosisGroupOptions,
    kpis: {
      activeDoctors: sorted.length,
      medianLosHours: computeMedian(pooledLos),
      topDoctorShare: sorted.length > 0 ? sorted[0].share : 0,
    },
  };
}

export function computeDoctorYearlyMatrix(records, options = {}) {
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

export function computeDoctorMonthlyTrend(records, options = {}) {
  const meta = getDoctorScopedMeta(records, options);
  const monthly = new Map();
  const topRows = computeDoctorLeaderboard(records, options).rows;
  const selected = String(options?.selectedDoctor || '__top3__');
  const selectedAliases = selected === '__top3__' ? topRows.slice(0, 3).map((row) => row.alias) : [selected];
  const aliasSet = new Set(selectedAliases.filter(Boolean));

  meta.filtered.forEach((record) => {
    const doctor = getDoctorKey(record);
    if (!doctor || !aliasSet.has(doctor.label)) {
      return;
    }
    const arrival =
      record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime()) ? record.arrival : null;
    if (!arrival) {
      return;
    }
    const monthKey = `${arrival.getFullYear()}-${String(arrival.getMonth() + 1).padStart(2, '0')}`;
    const key = `${doctor.label}|${monthKey}`;
    monthly.set(key, (monthly.get(key) || 0) + 1);
  });

  const months = Array.from(
    new Set(
      Array.from(monthly.keys())
        .map((key) => key.split('|')[1])
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const series = Array.from(aliasSet.values()).map((alias) => ({
    alias,
    points: months.map((month) => ({ month, count: monthly.get(`${alias}|${month}`) || 0 })),
  }));
  return { months, series, selectedAliases, coverage: meta.coverage };
}

export function computeDoctorDayNightMix(records, options = {}) {
  const rows = computeDoctorLeaderboard(records, options).rows;
  return {
    rows: rows.map((row) => ({
      alias: row.alias,
      dayShare: row.dayShare,
      nightShare: row.nightShare,
      count: row.count,
    })),
  };
}

export function computeDoctorHospitalizationShare(records, options = {}) {
  const rows = computeDoctorLeaderboard(records, options).rows;
  return {
    rows: rows.map((row) => ({
      alias: row.alias,
      hospitalizedShare: row.hospitalizedShare,
      count: row.count,
    })),
  };
}

export function computeDoctorVolumeVsLosScatter(records, options = {}) {
  const rows = computeDoctorLeaderboard(records, options).rows;
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

function getDoctorMetricValue(point, metric) {
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

function resolveDoctorTrend(metric, deltaAbs) {
  if (!Number.isFinite(deltaAbs)) {
    return 'na';
  }
  const threshold = metric === 'count' ? 1 : metric === 'avgLosHours' ? 0.1 : 0.005;
  if (Math.abs(deltaAbs) <= threshold) {
    return 'flat';
  }
  return deltaAbs > 0 ? 'up' : 'down';
}

export function computeDoctorYearlySmallMultiples(records, options = {}) {
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
    const totalEntry = totalsByDoctor.get(doctor.key);
    totalEntry.total += 1;
  });

  const years = Array.from(yearSet).sort((a, b) => a.localeCompare(b));
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

function computeMoMPercent(currentValue, previousValue) {
  const current = Number(currentValue);
  const previous = Number(previousValue);
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

export function computeDoctorMoMChanges(records, options = {}) {
  const meta = getDoctorScopedMeta(records, options);
  const topRows = computeDoctorLeaderboard(records, options).rows;
  const monthlyBuckets = new Map();

  meta.filtered.forEach((record) => {
    const doctor = getDoctorKey(record);
    const arrival =
      record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime()) ? record.arrival : null;
    if (!doctor || !arrival) {
      return;
    }
    const monthKey = `${arrival.getFullYear()}-${String(arrival.getMonth() + 1).padStart(2, '0')}`;
    const bucketKey = `${doctor.label}|${monthKey}`;
    if (!monthlyBuckets.has(bucketKey)) {
      monthlyBuckets.set(bucketKey, {
        count: 0,
        losSum: 0,
        losCount: 0,
      });
    }
    const bucket = monthlyBuckets.get(bucketKey);
    bucket.count += 1;
    const los = getLosHours(record);
    if (Number.isFinite(los)) {
      bucket.losSum += los;
      bucket.losCount += 1;
    }
  });

  const months = Array.from(
    new Set(
      Array.from(monthlyBuckets.keys())
        .map((key) => key.split('|')[1])
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
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
    const previous = monthlyBuckets.get(`${row.alias}|${previousMonth}`) || null;
    const current = monthlyBuckets.get(`${row.alias}|${currentMonth}`) || null;
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

export function computeDoctorComparisonPanel(records, options = {}) {
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

export function computeDoctorKpiDeltas(records, options = {}) {
  const current = computeDoctorLeaderboard(records, options);
  const meta = getDoctorScopedMeta(records, options);
  const baselineRows = getAllDoctorRowsForFilters(records, options);
  const pooledLos = meta.filtered.map((record) => getLosHours(record)).filter((value) => value != null);
  const baseline = {
    activeDoctors: baselineRows.length,
    medianLosHours: computeMedian(pooledLos),
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

export {
  computeHospitalizedByDepartmentAndSpsStay,
  computeHospitalizedDepartmentYearlyStayTrend,
} from './stats-hospital.js';
