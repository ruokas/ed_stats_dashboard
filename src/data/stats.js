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
