import '../../shared/date-shift-shared.js';

const sharedDateShift = globalThis.__edSharedDateShift;

if (!sharedDateShift) {
  throw new Error('Nepavyko inicializuoti bendrų datos ir pamainų helperių.');
}

const resolveShiftStartHour = sharedDateShift.resolveShiftStartHour;
const computeShiftDateKey = sharedDateShift.computeShiftDateKey;

function getRecordShiftDateKey(record, shiftStartHour) {
  const referenceDate =
    record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime())
      ? record.arrival
      : record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime())
        ? record.discharge
        : null;
  return computeShiftDateKey(referenceDate, shiftStartHour);
}

function normalizeCategoryValue(value) {
  const text = value == null ? '' : String(value).trim();
  return text || 'Nenurodyta';
}

function createDepartmentBucket(department) {
  return {
    department,
    count_lt4: 0,
    count_4_8: 0,
    count_8_16: 0,
    count_gt16: 0,
    count_unclassified: 0,
    total: 0,
  };
}

function resolveStayBucket(durationHours) {
  if (!Number.isFinite(durationHours) || durationHours < 0 || durationHours > 24) {
    return 'unclassified';
  }
  if (durationHours < 4) {
    return 'lt4';
  }
  if (durationHours < 8) {
    return '4to8';
  }
  if (durationHours < 16) {
    return '8to16';
  }
  return 'gt16';
}

function applyBucketIncrement(target, durationBucket) {
  if (durationBucket === 'lt4') {
    target.count_lt4 += 1;
  } else if (durationBucket === '4to8') {
    target.count_4_8 += 1;
  } else if (durationBucket === '8to16') {
    target.count_8_16 += 1;
  } else if (durationBucket === 'gt16') {
    target.count_gt16 += 1;
  } else {
    target.count_unclassified += 1;
  }
  target.total += 1;
}

const bucketOrder = ['lt4', '4to8', '8to16', 'gt16', 'unclassified'];

export function buildHospitalByDepartmentStayAggregate(records, options = {}) {
  const list = Array.isArray(records) ? records : [];
  const calculations = options?.calculations || {};
  const defaultSettings = options?.defaultSettings || {};
  const shiftStartHour = resolveShiftStartHour(calculations, defaultSettings);
  const byYear = Object.create(null);
  let totalHospitalized = 0;
  let unclassifiedCount = 0;

  list.forEach((record) => {
    if (record?.hospitalized !== true) {
      return;
    }
    const dateKey = getRecordShiftDateKey(record, shiftStartHour);
    if (!dateKey) {
      return;
    }
    const year = dateKey.slice(0, 4);
    if (!/^\d{4}$/.test(year)) {
      return;
    }
    const department = normalizeCategoryValue(record?.department);
    if (!byYear[year]) {
      byYear[year] = Object.create(null);
    }
    if (!byYear[year][department]) {
      byYear[year][department] = createDepartmentBucket(department);
    }
    const bucket = byYear[year][department];
    const hasArrival = record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime());
    const hasDischarge = record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime());
    const durationHours =
      hasArrival && hasDischarge
        ? (record.discharge.getTime() - record.arrival.getTime()) / 3600000
        : Number.NaN;
    const durationBucket = resolveStayBucket(durationHours);
    applyBucketIncrement(bucket, durationBucket);
    if (durationBucket === 'unclassified') {
      unclassifiedCount += 1;
    }
    totalHospitalized += 1;
  });

  return {
    byYear,
    meta: {
      totalHospitalized,
      unclassifiedCount,
    },
  };
}

function deriveHospitalizedByDepartmentRows(aggregate, yearFilter = 'all') {
  const byYear = aggregate?.byYear && typeof aggregate.byYear === 'object' ? aggregate.byYear : {};
  const yearKeys = Object.keys(byYear).filter((year) => /^\d{4}$/.test(year));
  const selectedYear = yearFilter == null ? 'all' : String(yearFilter);
  const targetYears =
    selectedYear === 'all' ? yearKeys : yearKeys.includes(selectedYear) ? [selectedYear] : [];
  const bucketMap = new Map();
  for (let yearIndex = 0; yearIndex < targetYears.length; yearIndex += 1) {
    const yearData = byYear[targetYears[yearIndex]] || {};
    Object.keys(yearData).forEach((department) => {
      if (!bucketMap.has(department)) {
        bucketMap.set(department, createDepartmentBucket(department));
      }
      const target = bucketMap.get(department);
      const source = yearData[department] || {};
      target.count_lt4 += Number(source.count_lt4 || 0);
      target.count_4_8 += Number(source.count_4_8 || 0);
      target.count_8_16 += Number(source.count_8_16 || 0);
      target.count_gt16 += Number(source.count_gt16 || 0);
      target.count_unclassified += Number(source.count_unclassified || 0);
      target.total += Number(source.total || 0);
    });
  }

  const rows = Array.from(bucketMap.values())
    .map((row) => {
      const total = Number.isFinite(row.total) ? row.total : 0;
      return {
        ...row,
        pct_lt4: total > 0 ? (row.count_lt4 / total) * 100 : 0,
        pct_4_8: total > 0 ? (row.count_4_8 / total) * 100 : 0,
        pct_8_16: total > 0 ? (row.count_8_16 / total) * 100 : 0,
        pct_gt16: total > 0 ? (row.count_gt16 / total) * 100 : 0,
        pct_unclassified: total > 0 ? (row.count_unclassified / total) * 100 : 0,
      };
    })
    .filter((row) => row.total > 0);

  const totals = rows.reduce(
    (acc, row) => {
      acc.count_lt4 += row.count_lt4;
      acc.count_4_8 += row.count_4_8;
      acc.count_8_16 += row.count_8_16;
      acc.count_gt16 += row.count_gt16;
      acc.count_unclassified += row.count_unclassified;
      acc.total += row.total;
      return acc;
    },
    {
      count_lt4: 0,
      count_4_8: 0,
      count_8_16: 0,
      count_gt16: 0,
      count_unclassified: 0,
      total: 0,
    }
  );

  const yearOptions = Array.from(yearKeys)
    .filter((year) => /^\d{4}$/.test(year))
    .map((year) => Number.parseInt(year, 10))
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => b - a);

  return {
    rows,
    totals,
    yearOptions,
  };
}

export function computeHospitalizedByDepartmentAndSpsStay(records, options = {}) {
  const yearFilter = options?.yearFilter == null ? 'all' : options.yearFilter;
  const aggregate =
    options?.hospitalByDeptStayAgg && typeof options.hospitalByDeptStayAgg === 'object'
      ? options.hospitalByDeptStayAgg
      : buildHospitalByDepartmentStayAggregate(records, options);
  const derived = deriveHospitalizedByDepartmentRows(aggregate, yearFilter);

  return {
    rows: derived.rows,
    totals: derived.totals,
    yearOptions: derived.yearOptions,
    bucketOrder,
    aggregate,
    meta: {
      totalHospitalized: Number(aggregate?.meta?.totalHospitalized || 0),
      unclassifiedCount: Number(aggregate?.meta?.unclassifiedCount || 0),
    },
  };
}

export function computeHospitalizedDepartmentYearlyStayTrend(records, options = {}) {
  const aggregate =
    options?.hospitalByDeptStayAgg && typeof options.hospitalByDeptStayAgg === 'object'
      ? options.hospitalByDeptStayAgg
      : buildHospitalByDepartmentStayAggregate(records, options);
  const departmentTarget = normalizeCategoryValue(options?.department);
  const byYear = aggregate?.byYear && typeof aggregate.byYear === 'object' ? aggregate.byYear : {};
  const rows = Object.keys(byYear)
    .filter((yearKey) => /^\d{4}$/.test(String(yearKey)))
    .map((yearKey) => {
      const source = byYear[yearKey]?.[departmentTarget] || null;
      if (!source) {
        return null;
      }
      return {
        year: Number.parseInt(yearKey, 10),
        count_lt4: Number(source.count_lt4 || 0),
        count_4_8: Number(source.count_4_8 || 0),
        count_8_16: Number(source.count_8_16 || 0),
        count_gt16: Number(source.count_gt16 || 0),
        count_unclassified: Number(source.count_unclassified || 0),
        total: Number(source.total || 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.year - b.year)
    .map((entry) => {
      const total = Number(entry.total || 0);
      return {
        ...entry,
        pct_lt4: total > 0 ? (entry.count_lt4 / total) * 100 : 0,
        pct_4_8: total > 0 ? (entry.count_4_8 / total) * 100 : 0,
        pct_8_16: total > 0 ? (entry.count_8_16 / total) * 100 : 0,
        pct_gt16: total > 0 ? (entry.count_gt16 / total) * 100 : 0,
        pct_unclassified: total > 0 ? (entry.count_unclassified / total) * 100 : 0,
      };
    });

  return {
    department: departmentTarget,
    rows,
  };
}
