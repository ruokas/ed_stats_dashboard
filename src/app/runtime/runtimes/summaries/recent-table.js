import {
  dailyDateFormatter,
  decimalFormatter,
  numberFormatter,
  percentFormatter,
} from '../../../../utils/format.js';

const RECENT_ANOMALY_THRESHOLDS = {
  count: 0.15,
  avgStay: 0.2,
  nightShare: 0.08,
  emsShare: 0.08,
  hospitalizedShare: 0.08,
  dischargedShare: 0.08,
};

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

function formatPercentDelta(ratio) {
  const percent = Math.abs(ratio) * 100;
  const rounded = percent >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10;
  return `${ratio >= 0 ? '+' : '-'}${numberFormatter.format(rounded)}%`;
}

function formatPercentagePointsDelta(delta) {
  const points = Math.abs(delta) * 100;
  const rounded = points >= 10 ? Math.round(points) : Math.round(points * 10) / 10;
  return `${delta >= 0 ? '+' : '-'}${numberFormatter.format(rounded)} p. p.`;
}

function buildDeviationMeta(value, baseline, threshold, mode) {
  if (!Number.isFinite(value) || !Number.isFinite(baseline)) {
    return null;
  }
  if (mode === 'share') {
    const delta = value - baseline;
    if (Math.abs(delta) < threshold) {
      return null;
    }
    const formatted = formatPercentagePointsDelta(delta);
    return {
      direction: delta > 0 ? 'high' : 'low',
      badge: formatted,
      title: `${delta > 0 ? 'Virš' : 'Žemiau'} 7 d. vidurkio per ${formatted.replace(/^[+-]/, '').trim()}.`,
    };
  }
  if (baseline <= 0) {
    return null;
  }
  const ratio = (value - baseline) / baseline;
  if (Math.abs(ratio) < threshold) {
    return null;
  }
  const formatted = formatPercentDelta(ratio);
  return {
    direction: ratio > 0 ? 'high' : 'low',
    badge: formatted,
    title: `${ratio > 0 ? 'Virš' : 'Žemiau'} 7 d. vidurkio ${formatted.replace(/^[+-]/, '').trim()}.`,
  };
}

function appendValueContent(cell, primaryText, anomalyMeta = null) {
  const value = document.createElement('span');
  value.className = 'recent-table__value';
  value.textContent = primaryText;
  cell.appendChild(value);
  if (!anomalyMeta) {
    return;
  }
  cell.classList.add('recent-table__cell--anomaly', `recent-table__cell--${anomalyMeta.direction}`);
  cell.title = anomalyMeta.title;
  cell.setAttribute('aria-label', `${primaryText}. ${anomalyMeta.title}`);
  const badge = document.createElement('span');
  badge.className = `recent-table__anomaly-badge recent-table__anomaly-badge--${anomalyMeta.direction}`;
  badge.textContent = anomalyMeta.badge;
  badge.setAttribute('aria-hidden', 'true');
  cell.appendChild(badge);
}

export function renderRecentTable(selectors, recentDailyStats, emptyText = '', options = {}) {
  if (!(selectors?.recentTable instanceof HTMLElement)) {
    return;
  }
  selectors.recentTable.replaceChildren();
  const highlightAbnormal = options?.highlightAbnormal === true;
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
  const avgNightShare = avgTotal > 0 ? avgNight / avgTotal : 0;
  const avgEmsShare = avgTotal > 0 ? avgEms / avgTotal : 0;
  const avgHospShare = avgTotal > 0 ? avgHosp / avgTotal : 0;
  const avgDisShare = avgTotal > 0 ? avgDis / avgTotal : 0;
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
    appendValueContent(
      totalCell,
      numberFormatter.format(total),
      highlightAbnormal ? buildDeviationMeta(total, avgTotal, RECENT_ANOMALY_THRESHOLDS.count, 'ratio') : null
    );
    const stayCell = document.createElement('td');
    appendValueContent(
      stayCell,
      decimalFormatter.format(avgStayEntry),
      highlightAbnormal
        ? buildDeviationMeta(avgStayEntry, avgStay, RECENT_ANOMALY_THRESHOLDS.avgStay, 'ratio')
        : null
    );
    const nightCell = document.createElement('td');
    appendValueContent(
      nightCell,
      formatValueWithShare(entry?.night, total),
      highlightAbnormal
        ? buildDeviationMeta(
            total > 0 ? Number(entry?.night || 0) / total : 0,
            avgNightShare,
            RECENT_ANOMALY_THRESHOLDS.nightShare,
            'share'
          )
        : null
    );
    const emsCell = document.createElement('td');
    appendValueContent(
      emsCell,
      formatValueWithShare(entry?.ems, total),
      highlightAbnormal
        ? buildDeviationMeta(
            total > 0 ? Number(entry?.ems || 0) / total : 0,
            avgEmsShare,
            RECENT_ANOMALY_THRESHOLDS.emsShare,
            'share'
          )
        : null
    );
    const hospCell = document.createElement('td');
    appendValueContent(
      hospCell,
      formatValueWithShare(entry?.hospitalized, total),
      highlightAbnormal
        ? buildDeviationMeta(
            total > 0 ? Number(entry?.hospitalized || 0) / total : 0,
            avgHospShare,
            RECENT_ANOMALY_THRESHOLDS.hospitalizedShare,
            'share'
          )
        : null
    );
    const disCell = document.createElement('td');
    appendValueContent(
      disCell,
      formatValueWithShare(entry?.discharged, total),
      highlightAbnormal
        ? buildDeviationMeta(
            total > 0 ? Number(entry?.discharged || 0) / total : 0,
            avgDisShare,
            RECENT_ANOMALY_THRESHOLDS.dischargedShare,
            'share'
          )
        : null
    );
    row.append(dateCell, totalCell, stayCell, nightCell, emsCell, hospCell, disCell);
    if (highlightAbnormal && row.querySelector('.recent-table__cell--anomaly')) {
      row.classList.add('recent-table__row--anomalous');
    }
    selectors.recentTable.appendChild(row);
  });
}
