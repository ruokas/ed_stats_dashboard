function formatLocalDateKey(date) {
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

function getRecordShiftDateKey(record, shiftStartHour) {
  const referenceDate = record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime())
    ? record.arrival
    : (record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime()) ? record.discharge : null);
  return computeShiftDateKey(referenceDate, shiftStartHour);
}

function normalizeCategoryValue(value) {
  const text = value == null ? '' : String(value).trim();
  return text || 'Nenurodyta';
}

export function computeHospitalizedByDepartmentAndSpsStay(records, options = {}) {
  const list = Array.isArray(records) ? records : [];
  const calculations = options?.calculations || {};
  const defaultSettings = options?.defaultSettings || {};
  const shiftStartHour = resolveShiftStartHour(calculations, defaultSettings);
  const yearFilter = options?.yearFilter == null ? 'all' : options.yearFilter;
  const bucketMap = new Map();
  const yearSet = new Set();
  let totalHospitalized = 0;
  let unclassifiedCount = 0;

  const bucketOrder = ['lt4', '4to8', '8to16', 'gt16', 'unclassified'];
  const createBucket = (department) => ({
    department,
    count_lt4: 0,
    count_4_8: 0,
    count_8_16: 0,
    count_gt16: 0,
    count_unclassified: 0,
    total: 0,
  });
  const resolveBucket = (durationHours) => {
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
  };

  list.forEach((record) => {
    if (record?.hospitalized !== true) {
      return;
    }
    const dateKey = getRecordShiftDateKey(record, shiftStartHour);
    if (!dateKey) {
      return;
    }
    const year = dateKey.slice(0, 4);
    if (year) {
      yearSet.add(year);
    }
    if (yearFilter !== 'all' && String(yearFilter) !== year) {
      return;
    }
    const department = normalizeCategoryValue(record?.department);
    if (!bucketMap.has(department)) {
      bucketMap.set(department, createBucket(department));
    }
    const bucket = bucketMap.get(department);
    const hasArrival = record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime());
    const hasDischarge = record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime());
    const durationHours = hasArrival && hasDischarge
      ? (record.discharge.getTime() - record.arrival.getTime()) / 3600000
      : Number.NaN;
    const durationBucket = resolveBucket(durationHours);

    if (durationBucket === 'lt4') {
      bucket.count_lt4 += 1;
    } else if (durationBucket === '4to8') {
      bucket.count_4_8 += 1;
    } else if (durationBucket === '8to16') {
      bucket.count_8_16 += 1;
    } else if (durationBucket === 'gt16') {
      bucket.count_gt16 += 1;
    } else {
      bucket.count_unclassified += 1;
      unclassifiedCount += 1;
    }

    bucket.total += 1;
    totalHospitalized += 1;
  });

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

  const totals = rows.reduce((acc, row) => {
    acc.count_lt4 += row.count_lt4;
    acc.count_4_8 += row.count_4_8;
    acc.count_8_16 += row.count_8_16;
    acc.count_gt16 += row.count_gt16;
    acc.count_unclassified += row.count_unclassified;
    acc.total += row.total;
    return acc;
  }, {
    count_lt4: 0,
    count_4_8: 0,
    count_8_16: 0,
    count_gt16: 0,
    count_unclassified: 0,
    total: 0,
  });

  const yearOptions = Array.from(yearSet)
    .filter((year) => /^\d{4}$/.test(year))
    .map((year) => Number.parseInt(year, 10))
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => b - a);

  return {
    rows,
    totals,
    yearOptions,
    bucketOrder,
    meta: {
      totalHospitalized,
      unclassifiedCount,
    },
  };
}

export function computeHospitalizedDepartmentYearlyStayTrend(records, options = {}) {
  const list = Array.isArray(records) ? records : [];
  const calculations = options?.calculations || {};
  const defaultSettings = options?.defaultSettings || {};
  const shiftStartHour = resolveShiftStartHour(calculations, defaultSettings);
  const departmentTarget = normalizeCategoryValue(options?.department);
  const yearly = new Map();

  const resolveBucket = (durationHours) => {
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
  };

  list.forEach((record) => {
    if (record?.hospitalized !== true) {
      return;
    }
    const department = normalizeCategoryValue(record?.department);
    if (department !== departmentTarget) {
      return;
    }
    const dateKey = getRecordShiftDateKey(record, shiftStartHour);
    if (!dateKey) {
      return;
    }
    const year = Number.parseInt(dateKey.slice(0, 4), 10);
    if (!Number.isFinite(year)) {
      return;
    }
    if (!yearly.has(year)) {
      yearly.set(year, {
        year,
        count_lt4: 0,
        count_4_8: 0,
        count_8_16: 0,
        count_gt16: 0,
        count_unclassified: 0,
        total: 0,
      });
    }
    const bucket = yearly.get(year);
    const hasArrival = record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime());
    const hasDischarge = record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime());
    const durationHours = hasArrival && hasDischarge
      ? (record.discharge.getTime() - record.arrival.getTime()) / 3600000
      : Number.NaN;
    const durationBucket = resolveBucket(durationHours);
    if (durationBucket === 'lt4') {
      bucket.count_lt4 += 1;
    } else if (durationBucket === '4to8') {
      bucket.count_4_8 += 1;
    } else if (durationBucket === '8to16') {
      bucket.count_8_16 += 1;
    } else if (durationBucket === 'gt16') {
      bucket.count_gt16 += 1;
    } else {
      bucket.count_unclassified += 1;
    }
    bucket.total += 1;
  });

  const rows = Array.from(yearly.values())
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
