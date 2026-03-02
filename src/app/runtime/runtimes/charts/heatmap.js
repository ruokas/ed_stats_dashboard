import { filterRecordsByYear } from '../../chart-primitives.js';
import { sanitizeChartFilters } from '../../filters.js';
import { createDefaultChartFilters, KPI_FILTER_LABELS } from '../../state.js';

export const HEATMAP_HOURS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);

export const HEATMAP_WEEKDAY_FULL = [
  'Pirmadienis',
  'Antradienis',
  'Treciadienis',
  'Ketvirtadienis',
  'Penktadienis',
  'Sestadienis',
  'Sekmadienis',
];

export const HEATMAP_WEEKDAY_SHORT = ['Pir', 'Antr', 'Trec', 'Ketv', 'Penkt', 'Sest', 'Sekm'];

export function matchesSharedPatientFilters(record, filters = {}) {
  if (filters.arrival === 'ems' && !record.ems) return false;
  if (filters.arrival === 'self' && record.ems) return false;
  if (filters.disposition === 'hospitalized' && !record.hospitalized) return false;
  if (filters.disposition === 'discharged' && record.hospitalized) return false;
  if (filters.cardType === 't' && record.cardType !== 't') return false;
  if (filters.cardType === 'tr' && record.cardType !== 'tr') return false;
  if (filters.cardType === 'ch' && record.cardType !== 'ch') return false;
  return true;
}

export function filterRecordsByChartFilters(records, filters) {
  const normalized = sanitizeChartFilters(filters, {
    getDefaultChartFilters: createDefaultChartFilters,
    KPI_FILTER_LABELS,
  });
  return (Array.isArray(records) ? records : []).filter((record) =>
    matchesSharedPatientFilters(record, normalized)
  );
}

export function sanitizeHeatmapFilters(filters) {
  const defaults = { arrival: 'all', disposition: 'all', cardType: 'all' };
  const normalized = { ...defaults, ...(filters || {}) };
  if (!(normalized.arrival in KPI_FILTER_LABELS.arrival)) normalized.arrival = defaults.arrival;
  if (!(normalized.disposition in KPI_FILTER_LABELS.disposition))
    normalized.disposition = defaults.disposition;
  if (!(normalized.cardType in KPI_FILTER_LABELS.cardType)) normalized.cardType = defaults.cardType;
  return normalized;
}

export function buildHeatmapFilterCacheKey(year, filters = {}) {
  const normalized = sanitizeHeatmapFilters(filters);
  const yearKey = Number.isFinite(year) ? String(Math.trunc(year)) : 'all';
  return [yearKey, normalized.arrival, normalized.disposition, normalized.cardType].join('|');
}

export function resolveCachedHeatmapFilterData({
  chartData,
  rawRecords,
  filterRecordsByYearFn = filterRecordsByYear,
  filterRecordsByHeatmapFiltersFn = filterRecordsByHeatmapFilters,
  computeArrivalHeatmapFn = computeArrivalHeatmap,
  heatmapYear = null,
  heatmapFilters = {},
}) {
  const safeChartData = chartData && typeof chartData === 'object' ? chartData : {};
  const baseRecords =
    Array.isArray(safeChartData.baseRecords) && safeChartData.baseRecords.length
      ? safeChartData.baseRecords
      : Array.isArray(rawRecords)
        ? rawRecords
        : [];
  const selectedYear = Number.isFinite(heatmapYear) ? Number(heatmapYear) : null;
  const normalizedFilters = sanitizeHeatmapFilters(heatmapFilters);
  const key = buildHeatmapFilterCacheKey(selectedYear, normalizedFilters);
  const cache =
    safeChartData.heatmapFilterCache &&
    typeof safeChartData.heatmapFilterCache === 'object' &&
    safeChartData.heatmapFilterCache.byKey instanceof Map
      ? safeChartData.heatmapFilterCache
      : null;
  if (!cache || cache.recordsRef !== baseRecords) {
    safeChartData.heatmapFilterCache = {
      recordsRef: baseRecords,
      byKey: new Map(),
    };
  }
  const activeCache = safeChartData.heatmapFilterCache;
  if (activeCache.byKey.has(key)) {
    const cached = activeCache.byKey.get(key);
    safeChartData.heatmap = cached;
    return cached;
  }
  const yearScoped = filterRecordsByYearFn(baseRecords, selectedYear);
  const filtered = filterRecordsByHeatmapFiltersFn(yearScoped, normalizedFilters);
  const data = computeArrivalHeatmapFn(filtered);
  activeCache.byKey.set(key, data);
  safeChartData.heatmap = data;
  return data;
}

export function filterRecordsByHeatmapFilters(records, filters) {
  const normalized = sanitizeHeatmapFilters(filters);
  return (Array.isArray(records) ? records : []).filter((record) =>
    matchesSharedPatientFilters(record, normalized)
  );
}

export function computeFunnelStats(dailyStats, targetYear, fallbackDailyStats) {
  const entries =
    Array.isArray(dailyStats) && dailyStats.length
      ? dailyStats
      : Array.isArray(fallbackDailyStats)
        ? fallbackDailyStats
        : [];
  return entries.reduce(
    (acc, entry) => ({
      arrived: acc.arrived + (Number.isFinite(entry?.count) ? entry.count : 0),
      hospitalized: acc.hospitalized + (Number.isFinite(entry?.hospitalized) ? entry.hospitalized : 0),
      discharged: acc.discharged + (Number.isFinite(entry?.discharged) ? entry.discharged : 0),
      year: Number.isFinite(targetYear) ? targetYear : null,
    }),
    { arrived: 0, hospitalized: 0, discharged: 0, year: Number.isFinite(targetYear) ? targetYear : null }
  );
}

export function computeArrivalHeatmap(records) {
  const aggregates = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({
      arrivals: 0,
      discharges: 0,
      hospitalized: 0,
      durationSum: 0,
      durationCount: 0,
    }))
  );
  const weekdayDays = {
    arrivals: Array.from({ length: 7 }, () => new Set()),
    discharges: Array.from({ length: 7 }, () => new Set()),
    hospitalized: Array.from({ length: 7 }, () => new Set()),
    avgDuration: Array.from({ length: 7 }, () => new Set()),
  };
  const formatLocalDateKey = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  (Array.isArray(records) ? records : []).forEach((entry) => {
    const arrival =
      entry?.arrival instanceof Date && !Number.isNaN(entry.arrival.getTime()) ? entry.arrival : null;
    const discharge =
      entry?.discharge instanceof Date && !Number.isNaN(entry.discharge.getTime()) ? entry.discharge : null;
    const arrivalHasTime =
      entry?.arrivalHasTime === true ||
      (entry?.arrivalHasTime == null &&
        arrival &&
        (arrival.getHours() || arrival.getMinutes() || arrival.getSeconds()));
    const dischargeHasTime =
      entry?.dischargeHasTime === true ||
      (entry?.dischargeHasTime == null &&
        discharge &&
        (discharge.getHours() || discharge.getMinutes() || discharge.getSeconds()));

    if (arrival && arrivalHasTime) {
      const dayIndex = (arrival.getDay() + 6) % 7;
      const hour = arrival.getHours();
      if (hour >= 0 && hour <= 23) {
        const cell = aggregates[dayIndex][hour];
        cell.arrivals += 1;
        const dateKey = formatLocalDateKey(arrival);
        if (dateKey) {
          weekdayDays.arrivals[dayIndex].add(dateKey);
          weekdayDays.avgDuration[dayIndex].add(dateKey);
        }
        if (discharge) {
          const duration = (discharge.getTime() - arrival.getTime()) / 3600000;
          if (Number.isFinite(duration) && duration >= 0 && duration <= 24) {
            cell.durationSum += duration;
            cell.durationCount += 1;
          }
        }
      }
    }

    if (discharge && dischargeHasTime) {
      const dayIndex = (discharge.getDay() + 6) % 7;
      const hour = discharge.getHours();
      if (hour >= 0 && hour <= 23) {
        const cell = aggregates[dayIndex][hour];
        const dateKey = formatLocalDateKey(discharge);
        if (entry.hospitalized) {
          cell.hospitalized += 1;
          if (dateKey) {
            weekdayDays.hospitalized[dayIndex].add(dateKey);
          }
        } else {
          cell.discharges += 1;
          if (dateKey) {
            weekdayDays.discharges[dayIndex].add(dateKey);
          }
        }
      }
    }
  });

  const createMatrix = () => Array.from({ length: 7 }, () => Array(24).fill(0));
  const metrics = {
    arrivals: { matrix: createMatrix(), max: 0, hasData: false },
    discharges: { matrix: createMatrix(), max: 0, hasData: false },
    hospitalized: { matrix: createMatrix(), max: 0, hasData: false },
    avgDuration: { matrix: createMatrix(), counts: createMatrix(), max: 0, hasData: false, samples: 0 },
  };

  aggregates.forEach((row, dayIndex) => {
    const arrivalsDiv = weekdayDays.arrivals[dayIndex].size || 1;
    const dischargesDiv = weekdayDays.discharges[dayIndex].size || 1;
    const hospitalizedDiv = weekdayDays.hospitalized[dayIndex].size || 1;

    row.forEach((cell, hourIndex) => {
      if (cell.arrivals > 0) metrics.arrivals.hasData = true;
      if (cell.discharges > 0) metrics.discharges.hasData = true;
      if (cell.hospitalized > 0) metrics.hospitalized.hasData = true;
      if (cell.durationCount > 0) {
        metrics.avgDuration.hasData = true;
        metrics.avgDuration.samples += cell.durationCount;
      }

      const arrivalsAvg = arrivalsDiv ? cell.arrivals / arrivalsDiv : 0;
      const dischargesAvg = dischargesDiv ? cell.discharges / dischargesDiv : 0;
      const hospitalizedAvg = hospitalizedDiv ? cell.hospitalized / hospitalizedDiv : 0;
      const averageDuration = cell.durationCount > 0 ? cell.durationSum / cell.durationCount : 0;

      metrics.arrivals.matrix[dayIndex][hourIndex] = arrivalsAvg;
      metrics.discharges.matrix[dayIndex][hourIndex] = dischargesAvg;
      metrics.hospitalized.matrix[dayIndex][hourIndex] = hospitalizedAvg;
      metrics.avgDuration.matrix[dayIndex][hourIndex] = averageDuration;
      metrics.avgDuration.counts[dayIndex][hourIndex] = cell.durationCount;

      if (arrivalsAvg > metrics.arrivals.max) metrics.arrivals.max = arrivalsAvg;
      if (dischargesAvg > metrics.discharges.max) metrics.discharges.max = dischargesAvg;
      if (hospitalizedAvg > metrics.hospitalized.max) metrics.hospitalized.max = hospitalizedAvg;
      if (averageDuration > metrics.avgDuration.max) metrics.avgDuration.max = averageDuration;
    });
  });

  return { metrics };
}
