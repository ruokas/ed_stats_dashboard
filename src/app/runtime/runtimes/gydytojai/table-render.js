import { numberFormatter, oneDecimalFormatter } from '../../../../utils/format.js';

export function sortLeaderboardRows(rows, tableSort) {
  const [key = 'count', direction = 'desc'] = String(tableSort || 'count_desc').split('_');
  const dir = direction === 'asc' ? 1 : -1;
  const list = Array.isArray(rows) ? rows.slice() : [];
  return list.sort((a, b) => {
    if (key === 'alias') {
      return dir * String(a?.alias || '').localeCompare(String(b?.alias || ''), 'lt');
    }
    const aValue = Number(a?.[key] || 0);
    const bValue = Number(b?.[key] || 0);
    if (aValue !== bValue) {
      return dir * (aValue - bValue);
    }
    return String(a?.alias || '').localeCompare(String(b?.alias || ''), 'lt');
  });
}

export function renderLeaderboardTable(selectors, rows, tableSort) {
  if (!selectors.gydytojaiLeaderboardBody) {
    return;
  }
  const body = selectors.gydytojaiLeaderboardBody;
  body.replaceChildren();
  if (!rows.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="11">Nepakanka duomenų.</td>';
    body.appendChild(row);
    return;
  }
  const sorted = sortLeaderboardRows(rows, tableSort);
  const fragment = document.createDocumentFragment();
  sorted.forEach((entry) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${entry.alias}</td>
      <td>${numberFormatter.format(entry.count)}</td>
      <td>${oneDecimalFormatter.format(entry.share * 100)}</td>
      <td>${Number.isFinite(entry.avgLosHours) ? oneDecimalFormatter.format(entry.avgLosHours) : '-'}</td>
      <td>${Number.isFinite(entry.medianLosHours) ? oneDecimalFormatter.format(entry.medianLosHours) : '-'}</td>
      <td>${oneDecimalFormatter.format(entry.hospitalizedShare * 100)}</td>
      <td>${oneDecimalFormatter.format(entry.losLt4Share * 100)}</td>
      <td>${oneDecimalFormatter.format(entry.los4to8Share * 100)}</td>
      <td>${oneDecimalFormatter.format(entry.los8to16Share * 100)}</td>
      <td>${oneDecimalFormatter.format(entry.losGt16Share * 100)}</td>
      <td>${oneDecimalFormatter.format(entry.nightShare * 100)}</td>
    `;
    fragment.appendChild(tr);
  });
  body.appendChild(fragment);
}

export function updateSortHeaderState(selectors, tableSort) {
  const table = selectors.gydytojaiLeaderboardTable;
  if (!(table instanceof HTMLTableElement)) {
    return;
  }
  const [activeKey, activeDirection] = String(tableSort || 'count_desc').split('_');
  Array.from(table.querySelectorAll('th[data-gydytojai-sort]')).forEach((th) => {
    const key = String(th.getAttribute('data-gydytojai-sort') || '');
    const isActive = key === activeKey;
    th.classList.toggle('is-sort-active', isActive);
    if (isActive) {
      th.setAttribute('aria-sort', activeDirection === 'asc' ? 'ascending' : 'descending');
    } else {
      th.removeAttribute('aria-sort');
    }
  });
}

export function updateSpecialtySortHeaderState(selectors, tableSort) {
  const table = selectors.gydytojaiSpecialtyTable;
  if (!(table instanceof HTMLTableElement)) {
    return;
  }
  const [activeKey, activeDirection] = String(tableSort || 'count_desc').split('_');
  Array.from(table.querySelectorAll('th[data-gydytojai-specialty-sort]')).forEach((th) => {
    const key = String(th.getAttribute('data-gydytojai-specialty-sort') || '');
    const isActive = key === activeKey;
    th.classList.toggle('is-sort-active', isActive);
    if (isActive) {
      th.setAttribute('aria-sort', activeDirection === 'asc' ? 'ascending' : 'descending');
    } else {
      th.removeAttribute('aria-sort');
    }
  });
}

export function renderSpecialtyComparisonTable(selectors, model, dashboardState) {
  const section = selectors?.gydytojaiSpecialtySection;
  const body = selectors?.gydytojaiSpecialtyBody;
  const empty = selectors?.gydytojaiSpecialtyEmpty;
  if (
    !(section instanceof HTMLElement) ||
    !(body instanceof HTMLElement) ||
    !(empty instanceof HTMLElement)
  ) {
    return;
  }
  const enabled = dashboardState?.doctorsSpecialtyUiEnabled === true;
  section.hidden = !enabled;
  if (!enabled) {
    body.replaceChildren();
    empty.hidden = true;
    return;
  }

  const rows = Array.isArray(model?.rows) ? model.rows : [];
  body.replaceChildren();
  if (!rows.length) {
    empty.hidden = false;
    updateSpecialtySortHeaderState(selectors, dashboardState?.doctorsSpecialtyTableSort);
    return;
  }
  empty.hidden = true;
  const sorted = sortLeaderboardRows(rows, dashboardState?.doctorsSpecialtyTableSort || 'count_desc');
  const fragment = document.createDocumentFragment();
  sorted.forEach((entry) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${entry.specialtyLabel || entry.alias || '-'}</td>
      <td>${numberFormatter.format(entry.count)}</td>
      <td>${oneDecimalFormatter.format(entry.share * 100)}</td>
      <td>${Number.isFinite(entry.avgLosHours) ? oneDecimalFormatter.format(entry.avgLosHours) : '-'}</td>
      <td>${Number.isFinite(entry.medianLosHours) ? oneDecimalFormatter.format(entry.medianLosHours) : '-'}</td>
      <td>${oneDecimalFormatter.format(entry.hospitalizedShare * 100)}</td>
      <td>${oneDecimalFormatter.format(entry.losLt4Share * 100)}</td>
      <td>${oneDecimalFormatter.format(entry.los4to8Share * 100)}</td>
      <td>${oneDecimalFormatter.format(entry.los8to16Share * 100)}</td>
      <td>${oneDecimalFormatter.format(entry.losGt16Share * 100)}</td>
      <td>${oneDecimalFormatter.format(entry.nightShare * 100)}</td>
    `;
    fragment.appendChild(tr);
  });
  body.appendChild(fragment);
  updateSpecialtySortHeaderState(selectors, dashboardState?.doctorsSpecialtyTableSort);
}
