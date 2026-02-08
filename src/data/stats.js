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
  const shiftAnchor = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  if (arrivalMinutes < startMinutes) {
    shiftAnchor.setDate(shiftAnchor.getDate() - 1);
  }
  return formatLocalDateKey(shiftAnchor);
}

function normalizeSegmentBy(value) {
  const allowed = new Set(['ageBand', 'sex', 'addressArea', 'pspc', 'diagnosisGroup']);
  return allowed.has(value) ? value : 'ageBand';
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
    return typeof record.ageBand === 'string' && record.ageBand !== 'unknown' && record.ageBand.trim().length > 0;
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
    const order = new Map([
      ['0-17', 0],
      ['18-39', 1],
      ['40-64', 2],
      ['65-79', 3],
      ['80+', 4],
      ['unknown', 5],
      ['Nenurodyta', 5],
    ]);
    const indexA = order.has(a?.groupKey) ? order.get(a.groupKey) : 10;
    const indexB = order.has(b?.groupKey) ? order.get(b.groupKey) : 10;
    if (indexA !== indexB) {
      return indexA - indexB;
    }
  }
  return String(a?.label || '').localeCompare(String(b?.label || ''), 'lt');
}

function createInsightRows(rows) {
  const visible = Array.isArray(rows) ? rows.filter((row) => row && row.label !== 'Kita / maža imtis') : [];
  if (!visible.length) {
    return {
      largestGroup: null,
      longestStay: null,
      highestHospitalizedShare: null,
    };
  }
  const largestGroup = [...visible].sort((a, b) => (b.count || 0) - (a.count || 0))[0] || null;
  const longestStay = [...visible]
    .filter((row) => Number.isFinite(row.avgStayHours))
    .sort((a, b) => (b.avgStayHours || 0) - (a.avgStayHours || 0))[0] || null;
  const highestHospitalizedShare = [...visible]
    .filter((row) => Number.isFinite(row.hospitalizedShare))
    .sort((a, b) => (b.hospitalizedShare || 0) - (a.hospitalizedShare || 0))[0] || null;
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
    const reference = record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime())
      ? record.arrival
      : (record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime()) ? record.discharge : null);
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
    const merged = smallRows.reduce((acc, row) => {
      acc.count += row.count;
      acc.emsCount += row.emsCount;
      acc.hospitalizedCount += row.hospitalizedCount;
      acc.dischargedCount += row.dischargedCount;
      acc.referredCount += row.referredCount;
      acc.durationCount += row.durationCount;
      acc.totalDurationHours += row.totalDurationHours;
      if (row.daySet instanceof Set) {
        row.daySet.forEach((dayKey) => mergedDaySet.add(dayKey));
      }
      return acc;
    }, {
      count: 0,
      emsCount: 0,
      hospitalizedCount: 0,
      dischargedCount: 0,
      referredCount: 0,
      durationCount: 0,
      totalDurationHours: 0,
    });
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

  rows = rows.map(({ daySet, ...row }) => row);

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
    rows,
    yearOptions,
    insights,
  };
}

export function computeDailyStats(data, calculationSettings, defaultSettings) {
  const shiftStartHour = resolveShiftStartHour(calculationSettings, defaultSettings);
  const dailyMap = new Map();
  data.forEach((record) => {
    const reference = record.arrival instanceof Date && !Number.isNaN(record.arrival.getTime())
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
      if (Number.isFinite(duration) && duration >= 0 && duration <= 24) { // ignoruojame >24 val. buvimo laikus
        summary.totalTime += duration;
        summary.durations += 1;
        if (record.hospitalized) {
          summary.hospitalizedTime += duration;
          summary.hospitalizedDurations += 1;
        }
      }
    }
  });

  return Array.from(dailyMap.values()).sort((a, b) => (a.date > b.date ? 1 : -1)).map((item) => ({
    ...item,
    avgTime: item.durations ? item.totalTime / item.durations : 0,
    avgHospitalizedTime: item.hospitalizedDurations ? item.hospitalizedTime / item.hospitalizedDurations : 0,
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
    bucket.hospitalizedDurations += Number.isFinite(entry.hospitalizedDurations) ? entry.hospitalizedDurations : 0;
    bucket.dayCount += Number.isFinite(entry.dayCount) ? entry.dayCount : 0;
    bucket.monthCount += 1;
  });

  return Array.from(yearlyMap.values()).sort((a, b) => (a.year > b.year ? 1 : -1));
}

function getRecordShiftDateKey(record, shiftStartHour) {
  const reference = record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime())
    ? record.arrival
    : (record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime()) ? record.discharge : null);
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
    const total = Number.isFinite(coverageBase.total) ? coverageBase.total : (Array.isArray(records) ? records.length : 0);
    const extended = Number.isFinite(coverageBase.extended) ? coverageBase.extended : precomputedScopedMeta.scoped.length;
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
  const scoped = list.filter((record) => {
    if (!record || record.hasExtendedHistoricalFields !== true) {
      return false;
    }
    const dateKey = getRecordShiftDateKey(record, shiftStartHour);
    if (!dateKey) {
      return false;
    }
    const year = dateKey.slice(0, 4);
    if (!/^\d{4}$/.test(year)) {
      return false;
    }
    years.add(year);
    if (yearFilter !== 'all' && year !== yearFilter) {
      return false;
    }
    return true;
  });
  const yearOptions = Array.from(years).sort((a, b) => (a > b ? -1 : 1));
  return {
    scoped,
    yearOptions,
    yearFilter,
    shiftStartHour,
    coverage: {
      total: list.length,
      extended: list.filter((record) => record?.hasExtendedHistoricalFields === true).length,
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
  const regular = list.filter((row) => Number.isFinite(row?.count) && row.count >= threshold);
  const small = list.filter((row) => !Number.isFinite(row?.count) || row.count < threshold);
  if (!small.length) {
    return regular;
  }
  const mergedCount = small.reduce((sum, row) => sum + (Number.isFinite(row?.count) ? row.count : 0), 0);
  if (!mergedCount) {
    return regular;
  }
  return regular.concat({ label: otherLabel, count: mergedCount, share: null, collapsed: true });
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
      collapsed: true,
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
  const categories = Array.isArray(categoryOrder) && categoryOrder.length
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
  const targetCode = String(code || '').trim().toUpperCase();
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
      ? record.diagnosisCodes.map((item) => String(item || '').trim().toUpperCase())
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
  const trend = computeYearlyTrend(scoped, (record) => {
    const value = normalizeCategoryValue(record?.referral);
    if (value === 'su siuntimu' || value === 'be siuntimo') {
      return value;
    }
    return 'Nenurodyta';
  }, ['su siuntimu', 'be siuntimo', 'Nenurodyta']);
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
    const referral = normalizeCategoryValue(record?.referral) === 'su siuntimu' ? 'su siuntimu' : 'be siuntimo';
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
    .sort((a, b) => (a.year - b.year) || (a.month - b.month))
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
        .map((item) => String(item || '').trim().toUpperCase())
        .filter(Boolean)
        .map((code) => code.charAt(0))
      : [];
    const source = fromGroups.length ? fromGroups : fromCodes;
    const groups = new Set(
      source
        .map((item) => String(item || '').trim().toUpperCase())
        .filter(Boolean)
        .filter((item) => !excludePrefixes.some((prefix) => item.startsWith(prefix))),
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
  const trend = computeYearlyTrend(scoped, (record) => normalizeCategoryValue(record?.ageBand), ['0-17', '18-34', '35-49', '50-64', '65-79', '80+', 'Nenurodyta']);
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
  const scoped = scopedMeta.scoped.filter((record) => normalizeCategoryValue(record?.referral) === 'su siuntimu');
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
        return sortDirection === 'asc' ? a.referredTotal - b.referredTotal : b.referredTotal - a.referredTotal;
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
  const trend = computeYearlyTrend(scoped, (record) => {
    const category = normalizeCategoryValue(record?.pspc);
    return topCategories.includes(category) ? category : 'Kita / maža imtis';
  }, topCategories.concat('Kita / maža imtis'));
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
  const trend = computeYearlyTrend(scoped, (record) => normalizeCategoryValue(record?.sex), ['Vyras', 'Moteris', 'Kita/Nenurodyta']);
  return {
    ...trend,
    yearOptions: scopedMeta.yearOptions,
    coverage: scopedMeta.coverage,
  };
}

export {
  computeHospitalizedByDepartmentAndSpsStay,
  computeHospitalizedDepartmentYearlyStayTrend,
} from './stats-hospital.js';
