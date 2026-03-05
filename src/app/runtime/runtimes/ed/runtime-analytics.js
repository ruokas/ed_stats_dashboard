function normalizeHeaderToken(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveColumnIndex(headerNormalized, candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) {
    return -1;
  }
  const normalizedHeader = headerNormalized.map((column) => ({
    ...column,
    foldedOriginal: normalizeHeaderToken(column.original),
    foldedNormalized: normalizeHeaderToken(column.normalized),
  }));
  for (const candidate of list) {
    const trimmed = String(candidate || '').trim();
    if (!trimmed) {
      continue;
    }
    const match = normalizedHeader.find((column) => column.original === trimmed);
    if (match) {
      return match.index;
    }
  }
  for (const candidate of list) {
    const trimmed = String(candidate || '')
      .trim()
      .toLowerCase();
    if (!trimmed) {
      continue;
    }
    const match = normalizedHeader.find((column) => column.normalized === trimmed);
    if (match) {
      return match.index;
    }
  }
  for (const candidate of list) {
    const folded = normalizeHeaderToken(candidate);
    if (!folded) {
      continue;
    }
    const match = normalizedHeader.find(
      (column) => column.foldedOriginal === folded || column.foldedNormalized === folded
    );
    if (match) {
      return match.index;
    }
  }
  for (const candidate of list) {
    const folded = normalizeHeaderToken(candidate);
    if (!folded) {
      continue;
    }
    const match = normalizedHeader.find(
      (column) => column.foldedOriginal.includes(folded) || column.foldedNormalized.includes(folded)
    );
    if (match) {
      return match.index;
    }
  }
  return -1;
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

export function createEdRuntimeAnalytics(deps) {
  const {
    dateKeyToUtc,
    filterDailyStatsByWindow,
    text,
    monthFormatter,
    oneDecimalFormatter,
    percentFormatter,
    computePercentile,
    formatHourLabel,
    formatPercentPointDelta,
    pickTopHours,
  } = deps;

  function buildYearMonthMetrics(dailyStats, windowDays) {
    if (!Array.isArray(dailyStats) || !dailyStats.length) {
      return null;
    }
    const decorated = dailyStats
      .map((entry) => ({ entry, utc: dateKeyToUtc(entry?.date ?? '') }))
      .filter((item) => Number.isFinite(item.utc))
      .sort((a, b) => a.utc - b.utc);
    if (!decorated.length) {
      return null;
    }
    const periodEntries = decorated.map((item) => item.entry);
    const [yearStr = '', monthStr = ''] = (periodEntries[periodEntries.length - 1]?.date ?? '').split('-');
    const monthEntries = monthStr
      ? periodEntries.filter((entry) => String(entry?.date || '').startsWith(`${yearStr}-${monthStr}`))
      : [];
    const aggregate = (entries) =>
      entries.reduce(
        (acc, entry) => {
          acc.days += 1;
          acc.totalCount += Number.isFinite(entry?.count) ? entry.count : 0;
          acc.totalHospitalized += Number.isFinite(entry?.hospitalized) ? entry.hospitalized : 0;
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
          totalHospitalized: 0,
          totalTime: 0,
          durationCount: 0,
          totalHospitalizedTime: 0,
          hospitalizedDurationCount: 0,
        }
      );
    const toMetrics = (summary) => ({
      days: summary.days,
      patientsPerDay: summary.days > 0 ? summary.totalCount / summary.days : 0,
      hospitalizedShare: summary.totalCount > 0 ? summary.totalHospitalized / summary.totalCount : null,
      avgTime: summary.durationCount > 0 ? summary.totalTime / summary.durationCount : null,
      avgHospitalizedTime:
        summary.hospitalizedDurationCount > 0
          ? summary.totalHospitalizedTime / summary.hospitalizedDurationCount
          : null,
    });
    const yearMetrics = toMetrics(aggregate(periodEntries));
    const monthMetrics = toMetrics(aggregate(monthEntries));
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);
    const monthLabel =
      Number.isFinite(year) && Number.isFinite(month)
        ? monthFormatter.format(new Date(year, month - 1, 1))
        : '';
    return {
      yearLabel:
        Number.isFinite(windowDays) && windowDays > 0
          ? `Paskutinės ${windowDays} d.`
          : text.kpis.windowAllLabel,
      monthLabel,
      yearMetrics,
      monthMetrics,
    };
  }

  function enrichSummaryWithOverviewFallback(summary, overviewRecords, overviewDailyStats, options = {}) {
    if (!summary || typeof summary !== 'object') {
      return summary;
    }
    const records = Array.isArray(overviewRecords)
      ? overviewRecords.filter(
          (record) => record && (record.arrival instanceof Date || record.discharge instanceof Date)
        )
      : [];
    if (!records.length) {
      return summary;
    }
    const arrivalHourCounts = Array.from({ length: 24 }, () => 0);
    const dischargeHourCounts = Array.from({ length: 24 }, () => 0);
    const losValues = [];
    const uniqueDateKeys = new Set();
    let arrivalsWithHour = 0;
    let fastCount = 0;
    let slowCount = 0;

    records.forEach((record) => {
      const arrival =
        record.arrival instanceof Date && !Number.isNaN(record.arrival.getTime()) ? record.arrival : null;
      const discharge =
        record.discharge instanceof Date && !Number.isNaN(record.discharge.getTime())
          ? record.discharge
          : null;
      const reference = arrival || discharge;
      const dateKey = reference ? formatLocalDateKey(reference) : '';
      if (dateKey) {
        uniqueDateKeys.add(dateKey);
      }
      if (arrival) {
        const hour = arrival.getHours();
        if (hour >= 0 && hour <= 23) {
          arrivalHourCounts[hour] += 1;
          arrivalsWithHour += 1;
        }
      }
      if (discharge) {
        const hour = discharge.getHours();
        if (hour >= 0 && hour <= 23) {
          dischargeHourCounts[hour] += 1;
        }
      }
      if (arrival && discharge) {
        const diffMinutes = (discharge.getTime() - arrival.getTime()) / 60000;
        if (Number.isFinite(diffMinutes) && diffMinutes >= 0) {
          losValues.push(diffMinutes);
          if (diffMinutes < 120) {
            fastCount += 1;
          }
          if (diffMinutes > 480) {
            slowCount += 1;
          }
        }
      }
    });

    if (!summary.peakWindowText) {
      const topArrival = pickTopHours(arrivalHourCounts, 3);
      const topDeparture = pickTopHours(dischargeHourCounts, 3);
      if (topArrival.length || topDeparture.length) {
        const arrivalText = topArrival.length
          ? topArrival.map((item) => formatHourLabel(item.hour)).join(', ')
          : '—';
        const departureText = topDeparture.length
          ? topDeparture.map((item) => formatHourLabel(item.hour)).join(', ')
          : '—';
        summary.peakWindowText = `Atvykimai: ${arrivalText} / Išvykimai: ${departureText}`;
      }
    }

    if (!Number.isFinite(summary.taktTimeMinutes) && uniqueDateKeys.size > 0 && arrivalsWithHour > 0) {
      const arrivalsPerHour = arrivalsWithHour / (uniqueDateKeys.size * 24);
      if (Number.isFinite(arrivalsPerHour) && arrivalsPerHour > 0) {
        summary.taktTimeMinutes = 60 / arrivalsPerHour;
        summary.taktTimeMeta = `~${oneDecimalFormatter.format(arrivalsPerHour)} atv./val.`;
      }
    }

    if (losValues.length) {
      const sortedLos = losValues.slice().sort((a, b) => a - b);
      const losMedian = computePercentile(sortedLos, 0.5);
      const losP90 = computePercentile(sortedLos, 0.9);
      if (!Number.isFinite(summary.losMedianMinutes) && Number.isFinite(losMedian)) {
        summary.losMedianMinutes = losMedian;
      }
      if (!Number.isFinite(summary.losP90Minutes) && Number.isFinite(losP90)) {
        summary.losP90Minutes = losP90;
      }
      if (
        !Number.isFinite(summary.losVariabilityIndex) &&
        Number.isFinite(losMedian) &&
        Number.isFinite(losP90) &&
        losMedian > 0
      ) {
        summary.losVariabilityIndex = losP90 / losMedian;
      }
      if (!summary.losPercentilesText && Number.isFinite(losMedian) && Number.isFinite(losP90)) {
        summary.losPercentilesText = `P50: ${oneDecimalFormatter.format(losMedian / 60)} val. • P90: ${oneDecimalFormatter.format(losP90 / 60)} val.`;
      }
      if (!Number.isFinite(summary.fastLaneShare) || !Number.isFinite(summary.slowLaneShare)) {
        summary.fastLaneShare = losValues.length ? fastCount / losValues.length : null;
        summary.slowLaneShare = losValues.length ? slowCount / losValues.length : null;
      }
      if (
        !summary.fastSlowSplitValue &&
        Number.isFinite(summary.fastLaneShare) &&
        Number.isFinite(summary.slowLaneShare)
      ) {
        summary.fastSlowSplitValue = `Greitieji: ${percentFormatter.format(summary.fastLaneShare)} • Lėtieji: ${percentFormatter.format(summary.slowLaneShare)}`;
      }
    }

    if (!Number.isFinite(summary.avgDailyPatients)) {
      const dailySource = Array.isArray(overviewDailyStats) ? overviewDailyStats : [];
      if (dailySource.length) {
        const windowDays =
          Number.isFinite(Number(options.windowDays)) && Number(options.windowDays) > 0
            ? Number(options.windowDays)
            : 30;
        const scoped = filterDailyStatsByWindow(dailySource, windowDays);
        const effective = scoped.length ? scoped : dailySource;
        const totals = effective.reduce(
          (acc, entry) => {
            if (Number.isFinite(entry?.count)) {
              acc.sum += Number(entry.count);
              acc.days += 1;
            }
            return acc;
          },
          { sum: 0, days: 0 }
        );
        if (totals.days > 0) {
          summary.avgDailyPatients = totals.sum / totals.days;
        }
      }
    }

    if (!Number.isFinite(summary.fastSlowTrendWindowDays) && Number.isFinite(options.windowDays)) {
      summary.fastSlowTrendWindowDays = Math.max(1, Math.round(options.windowDays));
    }
    if (!summary.fastSlowTrendText && Number.isFinite(summary.fastLaneDelta)) {
      const fastDeltaText = formatPercentPointDelta(summary.fastLaneDelta, oneDecimalFormatter);
      const slowDeltaText = formatPercentPointDelta(summary.slowLaneDelta, oneDecimalFormatter);
      summary.fastSlowTrendText = `Pokytis: ${fastDeltaText} / ${slowDeltaText}`;
    }

    return summary;
  }

  return {
    buildYearMonthMetrics,
    enrichSummaryWithOverviewFallback,
  };
}
