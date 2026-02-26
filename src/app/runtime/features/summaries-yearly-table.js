import { setDatasetValue } from '../../../utils/dom.js';
import { decimalFormatter, numberFormatter, oneDecimalFormatter } from '../../../utils/format.js';
import {
  formatChangeCell,
  formatMonthLabel,
  formatValueWithShare,
  formatYearLabel,
  isCompleteYearEntry,
} from './summaries-runtime-helpers.js';

export function renderYearlyTable(selectors, dashboardState, yearlyStats, options = {}) {
  const table = selectors?.yearlyTable;
  if (!table) {
    return;
  }
  const yearlyEmptyText = String(options?.yearlyEmptyText || 'Nera duomenu');
  table.replaceChildren();
  if (!Array.isArray(yearlyStats) || !yearlyStats.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 9;
    cell.textContent = yearlyEmptyText;
    row.appendChild(cell);
    table.appendChild(row);
    return;
  }
  const entries = yearlyStats.slice();
  const fragment = document.createDocumentFragment();
  const latestYear = entries.length ? entries[entries.length - 1].year : null;
  if (!Array.isArray(dashboardState.yearlyExpandedYears) || !dashboardState.yearlyExpandedYears.length) {
    dashboardState.yearlyExpandedYears = Number.isFinite(latestYear) ? [latestYear] : [];
  }
  const expandedYears = new Set(dashboardState.yearlyExpandedYears);
  const monthlyAll = Array.isArray(dashboardState.monthly?.all) ? dashboardState.monthly.all : [];
  const monthlyByKey = new Map(
    monthlyAll.filter((item) => item && typeof item.month === 'string').map((item) => [item.month, item])
  );
  const monthlyPayloadByYear = new Map();
  dashboardState.yearlyMonthlyRowsCache = {
    monthlyRef: monthlyAll,
    byYear: monthlyPayloadByYear,
  };
  const totals = entries.map((item) => (Number.isFinite(item?.count) ? item.count : 0));
  const completeness = entries.map((entry) => isCompleteYearEntry(entry));
  entries.forEach((entry, index) => {
    const total = Number.isFinite(entry.count) ? entry.count : 0;
    const avgPerDay = entry.dayCount > 0 ? total / entry.dayCount : 0;
    const avgStay = entry.durations > 0 ? entry.totalTime / entry.durations : 0;
    const previousTotal = index > 0 ? totals[index - 1] : Number.NaN;
    const canCompare =
      index > 0 && completeness[index] && completeness[index - 1] && Number.isFinite(previousTotal);
    const diff = canCompare ? total - previousTotal : Number.NaN;
    const percentChange = canCompare && previousTotal !== 0 ? diff / previousTotal : Number.NaN;
    const isExpanded = expandedYears.has(entry.year);
    const yearLabel = formatYearLabel(entry.year);
    const yearDisplay = completeness[index]
      ? yearLabel
      : `${yearLabel} <span class="yearly-incomplete">(nepilni)</span>`;
    const row = document.createElement('tr');
    row.className = 'yearly-row';
    row.innerHTML = `
      <td>
        <button type="button" class="yearly-toggle" data-year-toggle="${entry.year}" aria-expanded="${isExpanded}">
          <span class="yearly-toggle__icon" aria-hidden="true">▸</span>
          <span class="yearly-toggle__label">${yearDisplay}</span>
        </button>
      </td>
      <td>${numberFormatter.format(total)}</td>
      <td>${oneDecimalFormatter.format(avgPerDay)}</td>
      <td>${decimalFormatter.format(avgStay)}</td>
      <td>${formatValueWithShare(entry.night, total)}</td>
      <td>${formatValueWithShare(entry.ems, total)}</td>
      <td>${formatValueWithShare(entry.hospitalized, total)}</td>
      <td>${formatValueWithShare(entry.discharged, total)}</td>
      <td>${formatChangeCell(diff, percentChange, canCompare)}</td>
    `;
    setDatasetValue(row, 'year', entry.year);
    setDatasetValue(row, 'expanded', isExpanded ? 'true' : 'false');
    fragment.appendChild(row);
    const monthPayloads = [];
    monthlyAll
      .filter((item) => item?.month?.startsWith(`${entry.year}-`))
      .forEach((monthEntry) => {
        const [yearPart = '', monthPart = ''] = String(monthEntry?.month || '').split('-');
        const monthYear = Number.parseInt(yearPart, 10);
        const prevMonthKey = Number.isFinite(monthYear) && monthPart ? `${monthYear - 1}-${monthPart}` : '';
        const prevMonthEntry = prevMonthKey ? monthlyByKey.get(prevMonthKey) : null;
        const monthTotal = Number.isFinite(monthEntry.count) ? monthEntry.count : 0;
        const monthAvg = monthEntry.dayCount > 0 ? monthTotal / monthEntry.dayCount : 0;
        const monthStay = monthEntry.durations > 0 ? monthEntry.totalTime / monthEntry.durations : 0;
        const prevMonthTotal = Number.isFinite(prevMonthEntry?.count) ? prevMonthEntry.count : Number.NaN;
        const canCompareMonth = Number.isFinite(prevMonthTotal);
        const monthDiff = canCompareMonth ? monthTotal - prevMonthTotal : Number.NaN;
        const monthPercent =
          canCompareMonth && prevMonthTotal !== 0 ? monthDiff / prevMonthTotal : Number.NaN;
        monthPayloads.push({
          parentYear: entry.year,
          month: monthEntry.month,
          monthTotal,
          monthAvg,
          monthStay,
          night: monthEntry.night,
          ems: monthEntry.ems,
          hospitalized: monthEntry.hospitalized,
          discharged: monthEntry.discharged,
          monthDiff,
          monthPercent,
          canCompareMonth,
        });
      });
    monthlyPayloadByYear.set(entry.year, monthPayloads);
    if (isExpanded && monthPayloads.length) {
      monthPayloads.forEach((payload) => {
        fragment.appendChild(createYearlyChildRow(payload, true));
      });
    }
  });
  table.appendChild(fragment);
}

function createYearlyChildRow(payload, expanded = false) {
  const monthRow = document.createElement('tr');
  monthRow.className = 'yearly-child-row';
  monthRow.hidden = !expanded;
  setDatasetValue(monthRow, 'parentYear', payload.parentYear);
  monthRow.innerHTML = `
    <td><span class="yearly-month-label">${formatMonthLabel(payload.month)}</span></td>
    <td>${numberFormatter.format(payload.monthTotal)}</td>
    <td>${oneDecimalFormatter.format(payload.monthAvg)}</td>
    <td>${decimalFormatter.format(payload.monthStay)}</td>
    <td>${formatValueWithShare(payload.night, payload.monthTotal)}</td>
    <td>${formatValueWithShare(payload.ems, payload.monthTotal)}</td>
    <td>${formatValueWithShare(payload.hospitalized, payload.monthTotal)}</td>
    <td>${formatValueWithShare(payload.discharged, payload.monthTotal)}</td>
    <td>${formatChangeCell(payload.monthDiff, payload.monthPercent, payload.canCompareMonth)}</td>
  `;
  return monthRow;
}

function appendYearlyChildRows(table, parentRow, yearValue, payloads = []) {
  if (!(table instanceof HTMLElement) || !(parentRow instanceof HTMLElement) || !payloads.length) {
    return;
  }
  const existing = table.querySelector(`tr[data-parent-year="${yearValue}"]`);
  if (existing) {
    return;
  }
  const fragment = document.createDocumentFragment();
  payloads.forEach((payload) => {
    fragment.appendChild(createYearlyChildRow(payload, parentRow.dataset?.expanded === 'true'));
  });
  parentRow.after(fragment);
}

export function handleYearlyToggle(selectors, dashboardState, event) {
  const target = event?.target;
  if (!(target instanceof Element)) {
    return;
  }
  const button = target.closest('button[data-year-toggle]');
  if (!button) {
    return;
  }
  const yearValue = Number.parseInt(button.getAttribute('data-year-toggle') || '', 10);
  if (!Number.isFinite(yearValue)) {
    return;
  }
  const row = button.closest('tr');
  const isExpanded = button.getAttribute('aria-expanded') === 'true';
  const nextExpanded = !isExpanded;
  button.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
  if (row) {
    setDatasetValue(row, 'expanded', nextExpanded ? 'true' : 'false');
  }
  if (nextExpanded && row instanceof HTMLElement) {
    const cache = dashboardState?.yearlyMonthlyRowsCache || {};
    const payloads = cache.byYear instanceof Map ? cache.byYear.get(yearValue) : null;
    if (Array.isArray(payloads) && payloads.length && selectors?.yearlyTable instanceof HTMLElement) {
      appendYearlyChildRows(selectors.yearlyTable, row, yearValue, payloads);
    }
  }
  const rows = selectors?.yearlyTable
    ? selectors.yearlyTable.querySelectorAll(`tr[data-parent-year="${yearValue}"]`)
    : [];
  rows.forEach((child) => {
    child.hidden = !nextExpanded;
  });
  const expandedSet = new Set(
    Array.isArray(dashboardState.yearlyExpandedYears) ? dashboardState.yearlyExpandedYears : []
  );
  if (nextExpanded) {
    expandedSet.add(yearValue);
  } else {
    expandedSet.delete(yearValue);
  }
  dashboardState.yearlyExpandedYears = Array.from(expandedSet);
}
