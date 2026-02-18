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
  const eligibleEntries = [];
  const eligibleUtc = [];
  let endUtc = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < dailyStats.length; index += 1) {
    const entry = dailyStats[index];
    const utc = dateKeyToUtc(entry?.date);
    if (!Number.isFinite(utc)) {
      continue;
    }
    eligibleEntries.push(entry);
    eligibleUtc.push(utc);
    if (utc > endUtc) {
      endUtc = utc;
    }
  }
  if (!eligibleEntries.length || !Number.isFinite(endUtc)) {
    return [];
  }
  const startUtc = endUtc - (days - 1) * 86400000;
  const scoped = [];
  for (let index = 0; index < eligibleEntries.length; index += 1) {
    const utc = eligibleUtc[index];
    if (utc >= startUtc && utc <= endUtc) {
      scoped.push(eligibleEntries[index]);
    }
  }
  return scoped;
}

export function buildDailyWindowKeys(dailyStats, days) {
  if (!Array.isArray(dailyStats) || !Number.isFinite(days) || days <= 0) {
    return [];
  }
  let endUtc = Number.NEGATIVE_INFINITY;
  let hasValid = false;
  for (let index = 0; index < dailyStats.length; index += 1) {
    const utc = dateKeyToUtc(dailyStats[index]?.date);
    if (!Number.isFinite(utc)) {
      continue;
    }
    hasValid = true;
    if (utc > endUtc) {
      endUtc = utc;
    }
  }
  if (!hasValid || !Number.isFinite(endUtc)) {
    return [];
  }
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
  const eligibleEntries = [];
  const eligibleUtc = [];
  let endUtc = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < records.length; index += 1) {
    const entry = records[index];
    let reference = null;
    if (entry.arrival instanceof Date && !Number.isNaN(entry.arrival.getTime())) {
      reference = entry.arrival;
    } else if (entry.discharge instanceof Date && !Number.isNaN(entry.discharge.getTime())) {
      reference = entry.discharge;
    }
    if (!reference) {
      continue;
    }
    const utc = Date.UTC(reference.getFullYear(), reference.getMonth(), reference.getDate());
    if (!Number.isFinite(utc)) {
      continue;
    }
    eligibleEntries.push(entry);
    eligibleUtc.push(utc);
    if (utc > endUtc) {
      endUtc = utc;
    }
  }
  if (!eligibleEntries.length || !Number.isFinite(endUtc)) {
    return [];
  }
  const startUtc = endUtc - (days - 1) * 86400000;
  const scoped = [];
  for (let index = 0; index < eligibleEntries.length; index += 1) {
    const utc = eligibleUtc[index];
    if (utc >= startUtc && utc <= endUtc) {
      scoped.push(eligibleEntries[index]);
    }
  }
  return scoped;
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

export function populateChartYearOptions({ dailyStats, selectors, dashboardState, syncChartYearControl }) {
  if (!selectors.chartYearSelect) {
    return;
  }
  const years = getAvailableYearsFromDaily(dailyStats);
  selectors.chartYearSelect.replaceChildren();
  const defaultOption = document.createElement('option');
  defaultOption.value = 'all';
  defaultOption.textContent = 'Visi';
  selectors.chartYearSelect.appendChild(defaultOption);
  years.forEach((year) => {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = `${year} m.`;
    selectors.chartYearSelect.appendChild(option);
  });
  if (selectors.chartYearGroup) {
    selectors.chartYearGroup.replaceChildren();
    const allButton = document.createElement('button');
    allButton.type = 'button';
    allButton.className = 'chip-button';
    setDatasetValue(allButton, 'chartYear', 'all');
    allButton.setAttribute('aria-pressed', 'false');
    allButton.textContent = 'Visi';
    selectors.chartYearGroup.appendChild(allButton);
    years.forEach((year) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip-button';
      setDatasetValue(button, 'chartYear', String(year));
      button.setAttribute('aria-pressed', 'false');
      button.textContent = `${year}`;
      selectors.chartYearGroup.appendChild(button);
    });
  }
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
  if (!selectors.chartYearSelect) {
    return;
  }
  const selectedYear = Number.isFinite(dashboardState.chartYear) ? dashboardState.chartYear : null;
  selectors.chartYearSelect.value = selectedYear == null ? 'all' : String(selectedYear);
  const yearButtons = Array.from(selectors.chartYearGroup?.querySelectorAll('[data-chart-year]') || []);
  yearButtons.forEach((button) => {
    const value = String(getDatasetValue(button, 'chartYear', '') || '').trim();
    const isActive =
      (value === 'all' && selectedYear == null) ||
      (value !== 'all' && Number.parseInt(value, 10) === selectedYear);
    button.setAttribute('aria-pressed', String(isActive));
    setDatasetValue(button, 'active', String(isActive));
  });
  syncChartTimeScopeSummary({
    selectors,
    period: Number.isFinite(dashboardState.chartPeriod) ? dashboardState.chartPeriod : 0,
    year: selectedYear,
  });
}

export function syncChartPeriodButtons({ selectors, period }) {
  if (!selectors.chartPeriodButtons || !selectors.chartPeriodButtons.length) {
    return;
  }
  const normalizedPeriod = Number.isFinite(Number(period)) ? Number(period) : 0;
  let activeMoreLabel = '';
  selectors.chartPeriodButtons.forEach((button) => {
    const rawValue = String(getDatasetValue(button, 'chartPeriod', '') || '').trim();
    const numericValue = Number.parseInt(rawValue, 10);
    const isAll = rawValue === 'all';
    const isActive = isAll
      ? normalizedPeriod === 0
      : Number.isFinite(numericValue) && numericValue === normalizedPeriod;
    button.setAttribute('aria-pressed', String(isActive));
    setDatasetValue(button, 'active', String(isActive));
    if (
      isActive &&
      button.closest('.chart-period__more-menu') &&
      typeof button.textContent === 'string' &&
      button.textContent.trim()
    ) {
      activeMoreLabel = button.textContent.trim();
    }
  });
  const periodRoot = selectors.chartPeriodButtons[0]?.closest?.('#chartPeriodGroup');
  if (!(periodRoot instanceof HTMLElement)) {
    return;
  }
  const moreToggle = periodRoot.querySelector('.chart-period__more-toggle');
  if (!(moreToggle instanceof HTMLElement)) {
    return;
  }
  const hasActiveMore = Boolean(activeMoreLabel);
  moreToggle.textContent = hasActiveMore ? `Daugiau: ${activeMoreLabel}` : 'Daugiau';
  moreToggle.setAttribute('aria-pressed', String(hasActiveMore));
  setDatasetValue(moreToggle, 'active', String(hasActiveMore));
  syncChartTimeScopeSummary({
    selectors,
    period: normalizedPeriod,
    year: Number.isFinite(selectors.chartYearSelect?.valueAsNumber)
      ? selectors.chartYearSelect.valueAsNumber
      : Number.parseInt(String(selectors.chartYearSelect?.value || ''), 10),
  });
}

function resolvePeriodSummaryLabel(selectors, period) {
  const normalizedPeriod = Number.isFinite(Number(period)) ? Number(period) : 0;
  const activeButton = Array.isArray(selectors.chartPeriodButtons)
    ? selectors.chartPeriodButtons.find((button) => button.getAttribute('aria-pressed') === 'true')
    : null;
  if (activeButton && typeof activeButton.textContent === 'string' && activeButton.textContent.trim()) {
    return activeButton.textContent.trim();
  }
  return normalizedPeriod === 0 ? 'Visi' : `${normalizedPeriod} d.`;
}

function syncChartTimeScopeSummary({ selectors, period, year }) {
  if (!selectors.chartTimeScopeSummary) {
    return;
  }
  const periodLabel = resolvePeriodSummaryLabel(selectors, period);
  const numericYear = Number.isFinite(Number(year)) ? Number(year) : null;
  const yearLabel = numericYear == null ? 'Visi metai' : `${numericYear} m.`;
  selectors.chartTimeScopeSummary.textContent = `${periodLabel} • ${yearLabel}`;
}
