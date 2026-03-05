export function toSentenceCase(label) {
  if (typeof label !== 'string' || !label.length) {
    return '';
  }
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatKpiValue(value, format, formatters) {
  if (value == null || Number.isNaN(value)) {
    return '–';
  }
  if (format === 'decimal') {
    return formatters.decimalFormatter.format(value);
  }
  if (format === 'integer') {
    return formatters.numberFormatter.format(Math.round(value));
  }
  return formatters.oneDecimalFormatter.format(value);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function matchesSharedPatientFilters(record, filters = {}) {
  const arrivalFilter = filters.arrival;
  if (arrivalFilter === 'ems' && !record.ems) {
    return false;
  }
  if (arrivalFilter === 'self' && record.ems) {
    return false;
  }
  const dispositionFilter = filters.disposition;
  if (dispositionFilter === 'hospitalized' && !record.hospitalized) {
    return false;
  }
  if (dispositionFilter === 'discharged' && record.hospitalized) {
    return false;
  }
  const cardTypeFilter = filters.cardType;
  if (cardTypeFilter === 't' && record.cardType !== 't') {
    return false;
  }
  if (cardTypeFilter === 'tr' && record.cardType !== 'tr') {
    return false;
  }
  if (cardTypeFilter === 'ch' && record.cardType !== 'ch') {
    return false;
  }
  return true;
}

export function formatLocalDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function derivePeriodMetrics(summary) {
  const days = Number.isFinite(summary?.days) ? summary.days : 0;
  const totalCount = Number.isFinite(summary?.totalCount) ? summary.totalCount : 0;
  const totalNight = Number.isFinite(summary?.totalNight) ? summary.totalNight : 0;
  const totalHospitalized = Number.isFinite(summary?.totalHospitalized) ? summary.totalHospitalized : 0;
  const totalDischarged = Number.isFinite(summary?.totalDischarged) ? summary.totalDischarged : 0;
  const totalTime = Number.isFinite(summary?.totalTime) ? summary.totalTime : 0;
  const durationCount = Number.isFinite(summary?.durationCount) ? summary.durationCount : 0;
  const totalHospitalizedTime = Number.isFinite(summary?.totalHospitalizedTime)
    ? summary.totalHospitalizedTime
    : 0;
  const hospitalizedDurationCount = Number.isFinite(summary?.hospitalizedDurationCount)
    ? summary.hospitalizedDurationCount
    : 0;
  return {
    days,
    patientsPerDay: days > 0 ? totalCount / days : 0,
    nightPerDay: days > 0 ? totalNight / days : 0,
    dischargedPerDay: days > 0 ? totalDischarged / days : 0,
    hospitalizedPerDay: days > 0 ? totalHospitalized / days : 0,
    dischargedShare: totalCount > 0 ? totalDischarged / totalCount : null,
    hospitalizedShare: totalCount > 0 ? totalHospitalized / totalCount : null,
    avgTime: durationCount > 0 ? totalTime / durationCount : null,
    avgHospitalizedTime:
      hospitalizedDurationCount > 0 ? totalHospitalizedTime / hospitalizedDurationCount : null,
  };
}

function aggregatePeriodSummary(entries) {
  const list = Array.isArray(entries) ? entries : [];
  return list.reduce(
    (acc, entry) => {
      acc.days += 1;
      acc.totalCount += Number.isFinite(entry?.count) ? entry.count : 0;
      acc.totalNight += Number.isFinite(entry?.night) ? entry.night : 0;
      acc.totalHospitalized += Number.isFinite(entry?.hospitalized) ? entry.hospitalized : 0;
      acc.totalDischarged += Number.isFinite(entry?.discharged) ? entry.discharged : 0;
      acc.totalTime += Number.isFinite(entry?.totalTime) ? entry.totalTime : 0;
      acc.durationCount += Number.isFinite(entry?.durations) ? entry.durations : 0;
      acc.totalHospitalizedTime += Number.isFinite(entry?.hospitalizedTime) ? entry.hospitalizedTime : 0;
      acc.hospitalizedDurationCount += Number.isFinite(entry?.hospitalizedDurations)
        ? entry.hospitalizedDurations
        : 0;
      return acc;
    },
    {
      days: 0,
      totalCount: 0,
      totalNight: 0,
      totalHospitalized: 0,
      totalDischarged: 0,
      totalTime: 0,
      durationCount: 0,
      totalHospitalizedTime: 0,
      hospitalizedDurationCount: 0,
    }
  );
}

function describePeriodLabel({
  windowDays,
  startDateKey,
  endDateKey,
  dateKeyToDate,
  shortDateFormatter,
  text,
}) {
  const baseLabel =
    Number.isFinite(windowDays) && windowDays > 0
      ? `Paskutinės ${text.numberFormatter.format(windowDays)} d.`
      : text.windowAllLabel;
  const startDate = dateKeyToDate(startDateKey);
  const endDate = dateKeyToDate(endDateKey);
  let rangeLabel = '';
  if (startDate && endDate) {
    const start = shortDateFormatter.format(startDate);
    const end = shortDateFormatter.format(endDate);
    rangeLabel = start === end ? start : `${start} – ${end}`;
  }
  const metaLabel = rangeLabel ? `${baseLabel} (${rangeLabel})` : baseLabel;
  return { metaLabel, referenceLabel: baseLabel };
}

function buildLastShiftSummaryBase(dailyStats, deps) {
  const entries = Array.isArray(dailyStats)
    ? dailyStats.filter((entry) => entry && typeof entry.date === 'string')
    : [];
  if (!entries.length) {
    return null;
  }
  const decorated = entries
    .map((entry) => {
      const date = deps.dateKeyToDate(entry.date);
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null;
      }
      return { entry, date };
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);

  if (!decorated.length) {
    return null;
  }

  const last = decorated[decorated.length - 1];
  const lastEntry = last.entry;
  const lastDate = last.date;
  const weekdayIndex = lastDate.getDay();
  const weekdayLabel = toSentenceCase(deps.weekdayLongFormatter.format(lastDate));
  const sameWeekdayEntries = decorated
    .filter((item) => item.date.getDay() === weekdayIndex)
    .map((item) => item.entry);

  const averageFor = (key, predicate) => {
    if (!sameWeekdayEntries.length) {
      return null;
    }
    const totals = sameWeekdayEntries.reduce(
      (acc, item) => {
        if (typeof predicate === 'function' && !predicate(item)) {
          return acc;
        }
        const value = Number.isFinite(item?.[key]) ? item[key] : null;
        if (Number.isFinite(value)) {
          acc.sum += value;
          acc.count += 1;
        }
        return acc;
      },
      { sum: 0, count: 0 }
    );
    return totals.count ? totals.sum / totals.count : null;
  };

  const valueFor = (key, predicate) => {
    if (typeof predicate === 'function' && !predicate(lastEntry)) {
      return null;
    }
    return Number.isFinite(lastEntry?.[key]) ? lastEntry[key] : null;
  };

  const totalValue = valueFor('count');
  const totalAverage = averageFor('count');
  const shareOf = (value, total) => {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
      return null;
    }
    return value / total;
  };

  return {
    dateLabel: toSentenceCase(deps.dailyDateFormatter.format(lastDate)),
    dateKey: lastEntry.date,
    weekdayLabel,
    metrics: {
      total: { value: totalValue, average: totalAverage },
      avgTime: {
        value: valueFor('avgTime', (entry) => Number.isFinite(entry?.durations) && entry.durations > 0),
        average: averageFor('avgTime', (entry) => Number.isFinite(entry?.durations) && entry.durations > 0),
      },
      night: { value: valueFor('night'), average: averageFor('night') },
      hospitalized: {
        value: valueFor('hospitalized'),
        average: averageFor('hospitalized'),
        share: shareOf(valueFor('hospitalized'), totalValue),
        averageShare: shareOf(averageFor('hospitalized'), totalAverage),
      },
      discharged: {
        value: valueFor('discharged'),
        average: averageFor('discharged'),
        share: shareOf(valueFor('discharged'), totalValue),
        averageShare: shareOf(averageFor('discharged'), totalAverage),
      },
    },
  };
}

export function createKpiRuntimeMetrics(deps) {
  function buildYearMonthMetrics(dailyStats, windowDays) {
    if (!Array.isArray(dailyStats) || dailyStats.length === 0) {
      return null;
    }
    const decorated = dailyStats
      .map((entry) => ({ entry, utc: deps.dateKeyToUtc(entry?.date ?? '') }))
      .filter((item) => Number.isFinite(item.utc))
      .sort((a, b) => a.utc - b.utc);
    if (!decorated.length) {
      return null;
    }
    const earliest = decorated[0].entry;
    const latest = decorated[decorated.length - 1].entry;
    const [yearStr = '', monthStr = ''] = (latest?.date ?? '').split('-');
    const year = Number.parseInt(yearStr, 10);
    const monthKey = monthStr ? `${yearStr}-${monthStr}` : null;
    const monthEntries = monthKey
      ? dailyStats.filter((entry) => typeof entry?.date === 'string' && entry.date.startsWith(monthKey))
      : [];
    const periodEntries = decorated.map((item) => item.entry);
    const yearSummary = derivePeriodMetrics(aggregatePeriodSummary(periodEntries));
    const monthSummary = derivePeriodMetrics(aggregatePeriodSummary(monthEntries));
    const monthNumeric = Number.parseInt(monthStr, 10);
    const monthLabel =
      Number.isFinite(monthNumeric) && Number.isFinite(year)
        ? new Intl.DateTimeFormat('lt-LT', { month: 'long', year: 'numeric' }).format(
            new Date(year, Math.max(0, monthNumeric - 1), 1)
          )
        : '';
    const periodLabels = describePeriodLabel({
      windowDays,
      startDateKey: earliest?.date,
      endDateKey: latest?.date,
      dateKeyToDate: deps.dateKeyToDate,
      shortDateFormatter: deps.shortDateFormatter,
      text: { windowAllLabel: deps.text.kpis.windowAllLabel, numberFormatter: deps.numberFormatter },
    });
    return {
      yearLabel: periodLabels.metaLabel,
      referenceLabel: periodLabels.referenceLabel,
      monthLabel,
      yearMetrics: yearSummary,
      monthMetrics: monthSummary,
    };
  }

  function buildLastShiftSummary(dailyStats, referenceDailyStats = null) {
    const baseSummary = buildLastShiftSummaryBase(dailyStats, deps);
    if (!baseSummary) {
      return null;
    }
    if (!Array.isArray(referenceDailyStats) || !referenceDailyStats.length) {
      return baseSummary;
    }
    const baseDate = deps.dateKeyToDate(baseSummary.dateKey);
    if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())) {
      return baseSummary;
    }
    const weekdayIndex = baseDate.getDay();
    const referenceEntries = referenceDailyStats
      .filter((entry) => entry && typeof entry.date === 'string')
      .map((entry) => ({ entry, date: deps.dateKeyToDate(entry.date) }))
      .filter((item) => item.date instanceof Date && !Number.isNaN(item.date.getTime()))
      .filter((item) => item.date.getDay() === weekdayIndex)
      .map((item) => item.entry);
    if (!referenceEntries.length) {
      return baseSummary;
    }
    const averageFor = (key, predicate) => {
      const totals = referenceEntries.reduce(
        (acc, item) => {
          if (typeof predicate === 'function' && !predicate(item)) {
            return acc;
          }
          const value = Number.isFinite(item?.[key]) ? item[key] : null;
          if (Number.isFinite(value)) {
            acc.sum += value;
            acc.count += 1;
          }
          return acc;
        },
        { sum: 0, count: 0 }
      );
      return totals.count ? totals.sum / totals.count : null;
    };
    const shareOf = (value, total) => {
      if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
        return null;
      }
      return value / total;
    };
    const totalAverage = averageFor('count');
    const avgTimeAverage = averageFor(
      'avgTime',
      (entry) => Number.isFinite(entry?.durations) && entry.durations > 0
    );
    const nightAverage = averageFor('night');
    const hospitalizedAverage = averageFor('hospitalized');
    const dischargedAverage = averageFor('discharged');
    return {
      ...baseSummary,
      metrics: {
        ...baseSummary.metrics,
        total: { ...baseSummary.metrics.total, average: totalAverage },
        avgTime: { ...baseSummary.metrics.avgTime, average: avgTimeAverage },
        night: { ...baseSummary.metrics.night, average: nightAverage },
        hospitalized: {
          ...baseSummary.metrics.hospitalized,
          average: hospitalizedAverage,
          averageShare: shareOf(hospitalizedAverage, totalAverage),
        },
        discharged: {
          ...baseSummary.metrics.discharged,
          average: dischargedAverage,
          averageShare: shareOf(dischargedAverage, totalAverage),
        },
      },
    };
  }

  return {
    buildYearMonthMetrics,
    buildLastShiftSummary,
  };
}
