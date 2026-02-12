import { getDatasetValue, setDatasetValue } from '../../utils/dom.js';

export function dateKeyToUtc(dateKey) {
  if (typeof dateKey !== 'string') {
    return Number.NaN;
  }
  const parts = dateKey.split('-').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return Number.NaN;
  }
  const [year, month, day] = parts;
  return Date.UTC(year, month - 1, day);
}

export function dateKeyToDate(dateKey) {
  const utc = dateKeyToUtc(dateKey);
  if (!Number.isFinite(utc)) {
    return null;
  }
  return new Date(utc);
}

export function formatUtcDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isWeekendDateKey(dateKey) {
  const date = dateKeyToDate(dateKey);
  if (!(date instanceof Date)) {
    return false;
  }
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function getWeekdayIndexFromDateKey(dateKey) {
  const date = dateKeyToDate(dateKey);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  const weekday = date.getUTCDay();
  return (weekday + 6) % 7;
}

export function filterDailyStatsByYear(dailyStats, selectedYear) {
  if (!Array.isArray(dailyStats)) {
    return [];
  }
  if (!Number.isFinite(selectedYear)) {
    return dailyStats.slice();
  }
  return dailyStats.filter((entry) => {
    if (!entry || typeof entry.date !== 'string') {
      return false;
    }
    const date = dateKeyToDate(entry.date);
    return date instanceof Date && !Number.isNaN(date.getTime()) && date.getUTCFullYear() === selectedYear;
  });
}

export function filterRecordsByYear(records, selectedYear) {
  if (!Array.isArray(records)) {
    return [];
  }
  if (!Number.isFinite(selectedYear)) {
    return records.slice();
  }
  return records.filter((entry) => {
    const reference =
      entry?.arrival instanceof Date && !Number.isNaN(entry.arrival.getTime())
        ? entry.arrival
        : entry?.discharge instanceof Date && !Number.isNaN(entry.discharge.getTime())
          ? entry.discharge
          : null;
    return reference instanceof Date && reference.getFullYear() === selectedYear;
  });
}

export function filterDailyStatsByWindow(dailyStats, days) {
  if (!Array.isArray(dailyStats)) {
    return [];
  }
  if (!Number.isFinite(days) || days <= 0) {
    return [...dailyStats];
  }
  const decorated = dailyStats
    .map((entry) => ({ entry, utc: dateKeyToUtc(entry?.date) }))
    .filter((item) => Number.isFinite(item.utc));
  if (!decorated.length) {
    return [];
  }
  const endUtc = decorated.reduce((max, item) => Math.max(max, item.utc), decorated[0].utc);
  const startUtc = endUtc - (days - 1) * 86400000;
  return decorated.filter((item) => item.utc >= startUtc && item.utc <= endUtc).map((item) => item.entry);
}

export function buildDailyWindowKeys(dailyStats, days) {
  if (!Array.isArray(dailyStats) || !Number.isFinite(days) || days <= 0) {
    return [];
  }
  const decorated = dailyStats
    .map((entry) => ({ utc: dateKeyToUtc(entry?.date) }))
    .filter((item) => Number.isFinite(item.utc));
  if (!decorated.length) {
    return [];
  }
  const endUtc = decorated.reduce((max, item) => Math.max(max, item.utc), decorated[0].utc);
  const startUtc = endUtc - (days - 1) * 86400000;
  const keys = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(startUtc + i * 86400000);
    keys.push(formatUtcDateKey(date));
  }
  return keys;
}

export function fillDailyStatsWindow(dailyStats, windowKeys) {
  const map = new Map((Array.isArray(dailyStats) ? dailyStats : []).map((entry) => [entry?.date, entry]));
  return (Array.isArray(windowKeys) ? windowKeys : []).map((dateKey) => {
    const entry = map.get(dateKey);
    if (entry) {
      return entry;
    }
    return {
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
      avgTime: 0,
      avgHospitalizedTime: 0,
    };
  });
}

export function filterRecordsByWindow(records, days) {
  if (!Array.isArray(records)) {
    return [];
  }
  if (!Number.isFinite(days) || days <= 0) {
    return records.slice();
  }
  const decorated = records
    .map((entry) => {
      let reference = null;
      if (entry.arrival instanceof Date && !Number.isNaN(entry.arrival.getTime())) {
        reference = entry.arrival;
      } else if (entry.discharge instanceof Date && !Number.isNaN(entry.discharge.getTime())) {
        reference = entry.discharge;
      }
      if (!reference) {
        return null;
      }
      const utc = Date.UTC(reference.getFullYear(), reference.getMonth(), reference.getDate());
      if (!Number.isFinite(utc)) {
        return null;
      }
      return { entry, utc };
    })
    .filter(Boolean);
  if (!decorated.length) {
    return [];
  }
  const endUtc = decorated.reduce((max, item) => Math.max(max, item.utc), decorated[0].utc);
  const startUtc = endUtc - (days - 1) * 86400000;
  return decorated.filter((item) => item.utc >= startUtc && item.utc <= endUtc).map((item) => item.entry);
}

export function getAvailableYearsFromDaily(dailyStats) {
  const years = new Set();
  (Array.isArray(dailyStats) ? dailyStats : []).forEach((entry) => {
    const date = dateKeyToDate(entry?.date ?? '');
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      years.add(date.getUTCFullYear());
    }
  });
  return Array.from(years).sort((a, b) => b - a);
}

export function populateChartYearOptions({
  dailyStats,
  selectors,
  dashboardState,
  TEXT,
  syncChartYearControl,
}) {
  if (!selectors.chartYearSelect) {
    return;
  }
  const years = getAvailableYearsFromDaily(dailyStats);
  selectors.chartYearSelect.replaceChildren();
  const defaultOption = document.createElement('option');
  defaultOption.value = 'all';
  defaultOption.textContent = TEXT.charts.yearFilterAll;
  selectors.chartYearSelect.appendChild(defaultOption);
  years.forEach((year) => {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = `${year} m.`;
    selectors.chartYearSelect.appendChild(option);
  });
  const currentYear = Number.isFinite(dashboardState.chartYear) ? dashboardState.chartYear : null;
  const hasCurrent = Number.isFinite(currentYear) && years.includes(currentYear);
  if (hasCurrent) {
    selectors.chartYearSelect.value = String(currentYear);
  } else {
    selectors.chartYearSelect.value = 'all';
    dashboardState.chartYear = null;
  }
  if (typeof syncChartYearControl === 'function') {
    syncChartYearControl();
  }
}

export function syncChartYearControl({ selectors, dashboardState }) {
  if (!selectors.chartYearSelect || !selectors.chartYearLabel) {
    return;
  }
  const value = Number.isFinite(dashboardState.chartYear) ? `${dashboardState.chartYear} m.` : 'Visi metai';
  selectors.chartYearLabel.textContent = value;
}

export function syncChartPeriodButtons({ selectors, period }) {
  if (!selectors.chartPeriodButtons || !selectors.chartPeriodButtons.length) {
    return;
  }
  selectors.chartPeriodButtons.forEach((button) => {
    const value = Number.parseInt(getDatasetValue(button, 'chartPeriod', ''), 10);
    const isActive = Number.isFinite(value) && value === period;
    button.setAttribute('aria-pressed', String(isActive));
    setDatasetValue(button, 'active', String(isActive));
  });
}
