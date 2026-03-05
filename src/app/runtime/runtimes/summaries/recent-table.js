import {
  dailyDateFormatter,
  decimalFormatter,
  numberFormatter,
  percentFormatter,
} from '../../../../utils/format.js';

function formatValueWithShare(value, total) {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (!Number.isFinite(total) || total <= 0) {
    return numberFormatter.format(safeValue);
  }
  return `${numberFormatter.format(safeValue)} (${percentFormatter.format(safeValue / total)})`;
}

function formatRoundedValueWithShare(value, total) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const roundedValue = Math.round(safeValue);
  if (!Number.isFinite(total) || total <= 0) {
    return numberFormatter.format(roundedValue);
  }
  return `${numberFormatter.format(roundedValue)} (${percentFormatter.format(safeValue / total)})`;
}

export function renderRecentTable(selectors, recentDailyStats, emptyText = '') {
  if (!(selectors?.recentTable instanceof HTMLElement)) {
    return;
  }
  selectors.recentTable.replaceChildren();
  if (!Array.isArray(recentDailyStats) || !recentDailyStats.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.textContent = emptyText;
    row.appendChild(cell);
    selectors.recentTable.appendChild(row);
    return;
  }

  const sorted = [...recentDailyStats].sort((a, b) => (a.date > b.date ? -1 : 1));
  const daysCount = sorted.length;
  const totals = sorted.reduce(
    (acc, entry) => {
      const total = Number.isFinite(entry?.count) ? entry.count : 0;
      acc.total += total;
      acc.night += Number.isFinite(entry?.night) ? entry.night : 0;
      acc.ems += Number.isFinite(entry?.ems) ? entry.ems : 0;
      acc.hospitalized += Number.isFinite(entry?.hospitalized) ? entry.hospitalized : 0;
      acc.discharged += Number.isFinite(entry?.discharged) ? entry.discharged : 0;
      acc.totalTime += Number.isFinite(entry?.totalTime) ? entry.totalTime : 0;
      acc.durations += Number.isFinite(entry?.durations) ? entry.durations : 0;
      return acc;
    },
    { total: 0, night: 0, ems: 0, hospitalized: 0, discharged: 0, totalTime: 0, durations: 0 }
  );

  const summaryRow = document.createElement('tr');
  summaryRow.classList.add('table-row--summary');
  const avgTotal = daysCount ? totals.total / daysCount : 0;
  const avgNight = daysCount ? totals.night / daysCount : 0;
  const avgEms = daysCount ? totals.ems / daysCount : 0;
  const avgHosp = daysCount ? totals.hospitalized / daysCount : 0;
  const avgDis = daysCount ? totals.discharged / daysCount : 0;
  const avgStay = totals.durations ? totals.totalTime / totals.durations : 0;
  const avgTotalRounded = Math.round(avgTotal);
  summaryRow.innerHTML = `
    <td>7 d. vidurkis</td>
    <td>${numberFormatter.format(avgTotalRounded)}</td>
    <td>${decimalFormatter.format(avgStay)}</td>
    <td>${formatRoundedValueWithShare(avgNight, avgTotal)}</td>
    <td>${formatRoundedValueWithShare(avgEms, avgTotal)}</td>
    <td>${formatRoundedValueWithShare(avgHosp, avgTotal)}</td>
    <td>${formatRoundedValueWithShare(avgDis, avgTotal)}</td>
  `;
  selectors.recentTable.appendChild(summaryRow);

  sorted.forEach((entry) => {
    const row = document.createElement('tr');
    const dateValue = entry?.date ? new Date(`${entry.date}T00:00:00`) : null;
    const isValidDate = dateValue instanceof Date && !Number.isNaN(dateValue.getTime());
    const displayDate = isValidDate ? dailyDateFormatter.format(dateValue) : String(entry?.date || '');
    const weekday = isValidDate ? dateValue.getDay() : null;
    const isWeekend = weekday === 0 || weekday === 6;
    const total = Number.isFinite(entry?.count) ? entry.count : 0;
    const avgStayEntry = entry?.durations ? entry.totalTime / entry.durations : 0;

    const dateCell = document.createElement('td');
    dateCell.textContent = displayDate;
    if (isWeekend) {
      row.classList.add('table-row--weekend');
    }
    const totalCell = document.createElement('td');
    totalCell.textContent = numberFormatter.format(total);
    const stayCell = document.createElement('td');
    stayCell.textContent = decimalFormatter.format(avgStayEntry);
    const nightCell = document.createElement('td');
    nightCell.innerHTML = formatValueWithShare(entry?.night, total);
    const emsCell = document.createElement('td');
    emsCell.innerHTML = formatValueWithShare(entry?.ems, total);
    const hospCell = document.createElement('td');
    hospCell.innerHTML = formatValueWithShare(entry?.hospitalized, total);
    const disCell = document.createElement('td');
    disCell.innerHTML = formatValueWithShare(entry?.discharged, total);
    row.append(dateCell, totalCell, stayCell, nightCell, emsCell, hospCell, disCell);
    selectors.recentTable.appendChild(row);
  });
}
