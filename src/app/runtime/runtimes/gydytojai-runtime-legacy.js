import { createMainDataHandlers } from '../../../data/main-data.js';
import {
  computeDoctorDayNightMix,
  computeDoctorHospitalizationShare,
  computeDoctorLeaderboard,
  computeDoctorMonthlyTrend,
  computeDoctorVolumeVsLosScatter,
  computeDoctorYearlyMatrix,
} from '../../../data/stats.js';
import { createDashboardState } from '../../../state/dashboardState.js';
import { createSelectorsForPage } from '../../../state/selectors.js';
import { loadChartJs } from '../../../utils/chart-loader.js';
import { numberFormatter, oneDecimalFormatter, percentFormatter } from '../../../utils/format.js';
import { DEFAULT_FOOTER_SOURCE, DEFAULT_KPI_WINDOW_DAYS, TEXT, THEME_STORAGE_KEY } from '../../constants.js';
import { DEFAULT_SETTINGS } from '../../default-settings.js';
import {
  initSummariesJumpNavigation,
  initSummariesJumpStickyOffset,
} from '../features/summaries-jump-navigation.js';
import { applyTheme, initializeTheme } from '../features/theme.js';
import { createTextSignature, describeError, downloadCsv, formatUrlForDiagnostics } from '../network.js';
import { applyCommonPageShellText, setupSharedPageUi } from '../page-ui.js';
import { loadSettingsFromConfig } from '../settings.js';
import {
  createDefaultChartFilters,
  createDefaultFeedbackFilters,
  createDefaultKpiFilters,
} from '../state.js';
import { createStatusSetter } from '../utils/common.js';

const setStatus = createStatusSetter(TEXT.status, { showSuccessState: false });
const DEFAULT_DOCTOR_PAGE_STATE = {
  year: 'all',
  topN: 15,
  minCases: 30,
  sort: 'volume_desc',
  doctor: '__top3__',
  arrival: 'all',
  disposition: 'all',
  shift: 'all',
  diagnosis: 'all',
  search: '',
  tableSort: 'count_desc',
};

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeAllowed(value, allowed, fallback) {
  const token = String(value ?? '').trim();
  return allowed.has(token) ? token : fallback;
}

export function getDoctorPageStateFromQuery(search, defaults = DEFAULT_DOCTOR_PAGE_STATE) {
  const params = new URLSearchParams(String(search || ''));
  return {
    year: params.get('y') || defaults.year,
    topN: parsePositiveInt(params.get('top'), defaults.topN),
    minCases: parsePositiveInt(params.get('min'), defaults.minCases),
    sort: normalizeAllowed(
      params.get('sort'),
      new Set(['volume_desc', 'avgLos_asc', 'avgLos_desc', 'hospital_desc']),
      defaults.sort
    ),
    doctor: params.get('doc') || defaults.doctor,
    arrival: normalizeAllowed(params.get('arr'), new Set(['all', 'ems', 'self']), defaults.arrival),
    disposition: normalizeAllowed(
      params.get('disp'),
      new Set(['all', 'hospitalized', 'discharged']),
      defaults.disposition
    ),
    shift: normalizeAllowed(params.get('shift'), new Set(['all', 'day', 'night']), defaults.shift),
    diagnosis: params.get('diag') || defaults.diagnosis,
    search: String(params.get('q') || defaults.search).trim(),
    tableSort: normalizeAllowed(
      params.get('tsort'),
      new Set([
        'alias_asc',
        'alias_desc',
        'count_desc',
        'count_asc',
        'share_desc',
        'share_asc',
        'avgLosHours_desc',
        'avgLosHours_asc',
        'medianLosHours_desc',
        'medianLosHours_asc',
        'hospitalizedShare_desc',
        'hospitalizedShare_asc',
        'nightShare_desc',
        'nightShare_asc',
      ]),
      defaults.tableSort
    ),
  };
}

export function buildDoctorPageQuery(state) {
  const params = new URLSearchParams();
  if (state.year && state.year !== 'all') {
    params.set('y', String(state.year));
  }
  if (Number(state.topN) !== DEFAULT_DOCTOR_PAGE_STATE.topN) {
    params.set('top', String(state.topN));
  }
  if (Number(state.minCases) !== DEFAULT_DOCTOR_PAGE_STATE.minCases) {
    params.set('min', String(state.minCases));
  }
  if (state.sort && state.sort !== DEFAULT_DOCTOR_PAGE_STATE.sort) {
    params.set('sort', String(state.sort));
  }
  if (state.doctor && state.doctor !== DEFAULT_DOCTOR_PAGE_STATE.doctor) {
    params.set('doc', String(state.doctor));
  }
  if (state.arrival && state.arrival !== DEFAULT_DOCTOR_PAGE_STATE.arrival) {
    params.set('arr', String(state.arrival));
  }
  if (state.disposition && state.disposition !== DEFAULT_DOCTOR_PAGE_STATE.disposition) {
    params.set('disp', String(state.disposition));
  }
  if (state.shift && state.shift !== DEFAULT_DOCTOR_PAGE_STATE.shift) {
    params.set('shift', String(state.shift));
  }
  if (state.diagnosis && state.diagnosis !== DEFAULT_DOCTOR_PAGE_STATE.diagnosis) {
    params.set('diag', String(state.diagnosis));
  }
  if (state.search) {
    params.set('q', String(state.search));
  }
  if (state.tableSort && state.tableSort !== DEFAULT_DOCTOR_PAGE_STATE.tableSort) {
    params.set('tsort', String(state.tableSort));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

function syncDoctorPageQueryFromState(dashboardState) {
  const query = buildDoctorPageQuery({
    year: dashboardState.doctorsYear,
    topN: dashboardState.doctorsTopN,
    minCases: dashboardState.doctorsMinCases,
    sort: dashboardState.doctorsSort,
    doctor: dashboardState.doctorsSelected,
    arrival: dashboardState.doctorsArrivalFilter,
    disposition: dashboardState.doctorsDispositionFilter,
    shift: dashboardState.doctorsShiftFilter,
    diagnosis: dashboardState.doctorsDiagnosisFilter,
    search: dashboardState.doctorsSearch,
    tableSort: dashboardState.doctorsTableSort,
  });
  const nextUrl = `${window.location.pathname}${query}${window.location.hash || ''}`;
  if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash || ''}`) {
    window.history.replaceState(null, '', nextUrl);
  }
}

function extractHistoricalRecords(dashboardState) {
  const all = Array.isArray(dashboardState.rawRecords) ? dashboardState.rawRecords : [];
  const tagged = all.filter((record) => record?.sourceId === 'historical');
  return tagged.length ? tagged : all.filter((record) => record?.hasExtendedHistoricalFields === true);
}

function applyDoctorControls(selectors, dashboardState, yearOptions, topRows, diagnosisOptions) {
  if (selectors.gydytojaiYear) {
    const select = selectors.gydytojaiYear;
    const previous = String(dashboardState.doctorsYear || 'all');
    select.replaceChildren();
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'Visi metai';
    select.appendChild(allOption);
    (Array.isArray(yearOptions) ? yearOptions : []).forEach((year) => {
      const option = document.createElement('option');
      option.value = String(year);
      option.textContent = String(year);
      select.appendChild(option);
    });
    const hasPrevious = Array.from(select.options).some((option) => option.value === previous);
    select.value = hasPrevious ? previous : 'all';
    dashboardState.doctorsYear = select.value;
  }

  if (selectors.gydytojaiTopN) {
    selectors.gydytojaiTopN.value = String(dashboardState.doctorsTopN || 15);
  }
  if (selectors.gydytojaiMinCases) {
    selectors.gydytojaiMinCases.value = String(dashboardState.doctorsMinCases || 30);
  }
  if (selectors.gydytojaiSort) {
    selectors.gydytojaiSort.value = String(dashboardState.doctorsSort || 'volume_desc');
  }

  if (selectors.gydytojaiDoctorSelect) {
    const select = selectors.gydytojaiDoctorSelect;
    const previous = String(dashboardState.doctorsSelected || '__top3__');
    select.replaceChildren();
    const topOption = document.createElement('option');
    topOption.value = '__top3__';
    topOption.textContent = 'TOP 3';
    select.appendChild(topOption);
    (Array.isArray(topRows) ? topRows : []).forEach((row) => {
      const alias = String(row?.alias || '').trim();
      if (!alias) {
        return;
      }
      const option = document.createElement('option');
      option.value = alias;
      option.textContent = alias;
      select.appendChild(option);
    });
    const hasPrevious = Array.from(select.options).some((option) => option.value === previous);
    select.value = hasPrevious ? previous : '__top3__';
    dashboardState.doctorsSelected = select.value;
  }

  if (selectors.gydytojaiArrivalFilter) {
    selectors.gydytojaiArrivalFilter.value = String(dashboardState.doctorsArrivalFilter || 'all');
  }
  if (selectors.gydytojaiDispositionFilter) {
    selectors.gydytojaiDispositionFilter.value = String(dashboardState.doctorsDispositionFilter || 'all');
  }
  if (selectors.gydytojaiShiftFilter) {
    selectors.gydytojaiShiftFilter.value = String(dashboardState.doctorsShiftFilter || 'all');
  }
  if (selectors.gydytojaiDiagnosisFilter) {
    const select = selectors.gydytojaiDiagnosisFilter;
    const previous = String(dashboardState.doctorsDiagnosisFilter || 'all');
    select.replaceChildren();
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'Visos';
    select.appendChild(allOption);
    (Array.isArray(diagnosisOptions) ? diagnosisOptions : []).forEach((item) => {
      const option = document.createElement('option');
      option.value = item;
      option.textContent = item;
      select.appendChild(option);
    });
    const hasPrevious = Array.from(select.options).some((option) => option.value === previous);
    select.value = hasPrevious ? previous : 'all';
    dashboardState.doctorsDiagnosisFilter = select.value;
  }
  if (selectors.gydytojaiSearch) {
    selectors.gydytojaiSearch.value = String(dashboardState.doctorsSearch || '');
  }
}

function setKpis(selectors, model) {
  const kpis = model?.kpis || {};
  if (selectors.gydytojaiKpiActive) {
    selectors.gydytojaiKpiActive.textContent = numberFormatter.format(Number(kpis.activeDoctors || 0));
  }
  if (selectors.gydytojaiKpiMedianLos) {
    selectors.gydytojaiKpiMedianLos.textContent = Number.isFinite(kpis.medianLosHours)
      ? oneDecimalFormatter.format(kpis.medianLosHours)
      : '-';
  }
  if (selectors.gydytojaiKpiTopShare) {
    selectors.gydytojaiKpiTopShare.textContent = percentFormatter.format(Number(kpis.topDoctorShare || 0));
  }
}

function setCoverage(selectors, model) {
  if (!selectors.gydytojaiCoverage) {
    return;
  }
  const coverage = model?.coverage || {};
  const total = Number(coverage.total || 0);
  const withDoctor = Number(coverage.withDoctor || 0);
  const filtered = Number(coverage.filtered || 0);
  const percent = Number(coverage.percent || 0);
  selectors.gydytojaiCoverage.textContent = `Su uždariusiu gydytoju: ${withDoctor} iš ${total} (${oneDecimalFormatter.format(percent)}%). Po aktyvių filtrų: ${filtered}.`;
}

function sortLeaderboardRows(rows, tableSort) {
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

function renderLeaderboardTable(selectors, rows, tableSort) {
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
    body.appendChild(tr);
  });
}

function renderYearlyTable(selectors, model) {
  if (!selectors.gydytojaiYearlyHead || !selectors.gydytojaiYearlyBody) {
    return;
  }
  const years = Array.isArray(model?.years) ? model.years : [];
  const rows = Array.isArray(model?.rows) ? model.rows : [];
  selectors.gydytojaiYearlyHead.innerHTML = '';
  selectors.gydytojaiYearlyBody.innerHTML = '';

  const headRow = document.createElement('tr');
  headRow.appendChild(Object.assign(document.createElement('th'), { textContent: 'Gydytojas' }));
  years.forEach((year) => {
    const th = document.createElement('th');
    th.textContent = String(year);
    headRow.appendChild(th);
  });
  selectors.gydytojaiYearlyHead.appendChild(headRow);

  if (!rows.length) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="${Math.max(1, years.length + 1)}">Nepakanka duomenų.</td>`;
    selectors.gydytojaiYearlyBody.appendChild(row);
    return;
  }

  rows.forEach((entry) => {
    const tr = document.createElement('tr');
    const label = document.createElement('td');
    label.textContent = entry.alias;
    tr.appendChild(label);
    (entry.yearly || []).forEach((yearCell) => {
      const td = document.createElement('td');
      const avg = Number.isFinite(yearCell?.avgLosHours)
        ? oneDecimalFormatter.format(yearCell.avgLosHours)
        : '-';
      td.textContent = `${numberFormatter.format(Number(yearCell?.count || 0))} / ${avg}`;
      tr.appendChild(td);
    });
    selectors.gydytojaiYearlyBody.appendChild(tr);
  });
}

function updateSortHeaderState(selectors, tableSort) {
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

function upsertChart(chartMap, slot, chartLib, canvas, config) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const existing = chartMap[slot];
  if (existing && typeof existing.destroy === 'function') {
    existing.destroy();
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  chartMap[slot] = new chartLib(ctx, config);
}

function renderCharts(dashboardState, chartLib, selectors, models) {
  const rows = models?.leaderboard?.rows || [];
  const labels = rows.map((row) => row.alias);
  upsertChart(dashboardState.doctorsCharts, 'volume', chartLib, selectors.gydytojaiVolumeChart, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Atvejai', data: rows.map((row) => row.count), backgroundColor: '#2563eb' }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });

  upsertChart(dashboardState.doctorsCharts, 'los', chartLib, selectors.gydytojaiLosChart, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: '<4 val.', data: rows.map((row) => row.losLt4Share * 100), backgroundColor: '#16a34a' },
        { label: '4-8 val.', data: rows.map((row) => row.los4to8Share * 100), backgroundColor: '#0ea5e9' },
        { label: '8-16 val.', data: rows.map((row) => row.los8to16Share * 100), backgroundColor: '#f59e0b' },
        { label: '>16 val.', data: rows.map((row) => row.losGt16Share * 100), backgroundColor: '#ef4444' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true, max: 100 } },
    },
  });

  upsertChart(dashboardState.doctorsCharts, 'hospital', chartLib, selectors.gydytojaiHospitalChart, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Hospitalizacija %',
          data: rows.map((row) => row.hospitalizedShare * 100),
          backgroundColor: '#ef4444',
        },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });

  const mixRows = models?.mix?.rows || [];
  upsertChart(dashboardState.doctorsCharts, 'mix', chartLib, selectors.gydytojaiMixChart, {
    type: 'bar',
    data: {
      labels: mixRows.map((row) => row.alias),
      datasets: [
        { label: 'Diena', data: mixRows.map((row) => row.dayShare * 100), backgroundColor: '#22c55e' },
        { label: 'Naktis', data: mixRows.map((row) => row.nightShare * 100), backgroundColor: '#64748b' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true } },
    },
  });

  const trend = models?.trend || {};
  upsertChart(dashboardState.doctorsCharts, 'trend', chartLib, selectors.gydytojaiTrendChart, {
    type: 'line',
    data: {
      labels: trend.months || [],
      datasets: (trend.series || []).map((series, index) => ({
        label: series.alias,
        data: (series.points || []).map((point) => point.count),
        borderColor: ['#2563eb', '#ef4444', '#16a34a'][index % 3],
        backgroundColor: 'transparent',
        tension: 0.3,
      })),
    },
    options: { responsive: true, maintainAspectRatio: false },
  });

  const scatter = models?.scatter?.rows || [];
  upsertChart(dashboardState.doctorsCharts, 'scatter', chartLib, selectors.gydytojaiScatterChart, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Gydytojai',
          data: scatter.map((row) => ({ x: row.count, y: row.avgLosHours, label: row.alias })),
          backgroundColor: '#f59e0b',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => {
              const point = context.raw || {};
              return `${point.label}: n=${numberFormatter.format(point.x || 0)}, LOS=${oneDecimalFormatter.format(point.y || 0)}h`;
            },
          },
        },
      },
      scales: {
        x: { title: { display: true, text: 'Atvejai' } },
        y: { title: { display: true, text: 'Vid. LOS (val.)' } },
      },
    },
  });
}

function wireInteractions(selectors, dashboardState, rerender) {
  selectors.gydytojaiYear?.addEventListener('change', (event) => {
    dashboardState.doctorsYear = String(event.target.value || 'all');
    rerender();
  });
  selectors.gydytojaiTopN?.addEventListener('change', (event) => {
    dashboardState.doctorsTopN = parsePositiveInt(event.target.value, 15);
    rerender();
  });
  selectors.gydytojaiMinCases?.addEventListener('change', (event) => {
    dashboardState.doctorsMinCases = parsePositiveInt(event.target.value, 30);
    rerender();
  });
  selectors.gydytojaiSort?.addEventListener('change', (event) => {
    dashboardState.doctorsSort = String(event.target.value || 'volume_desc');
    rerender();
  });
  selectors.gydytojaiDoctorSelect?.addEventListener('change', (event) => {
    dashboardState.doctorsSelected = String(event.target.value || '__top3__');
    rerender();
  });
  selectors.gydytojaiArrivalFilter?.addEventListener('change', (event) => {
    dashboardState.doctorsArrivalFilter = String(event.target.value || 'all');
    rerender();
  });
  selectors.gydytojaiDispositionFilter?.addEventListener('change', (event) => {
    dashboardState.doctorsDispositionFilter = String(event.target.value || 'all');
    rerender();
  });
  selectors.gydytojaiShiftFilter?.addEventListener('change', (event) => {
    dashboardState.doctorsShiftFilter = String(event.target.value || 'all');
    rerender();
  });
  selectors.gydytojaiDiagnosisFilter?.addEventListener('change', (event) => {
    dashboardState.doctorsDiagnosisFilter = String(event.target.value || 'all');
    rerender();
  });
  selectors.gydytojaiSearch?.addEventListener('input', (event) => {
    dashboardState.doctorsSearch = String(event.target.value || '').trim();
    rerender();
  });
  selectors.gydytojaiResetFilters?.addEventListener('click', () => {
    dashboardState.doctorsYear = 'all';
    dashboardState.doctorsTopN = 15;
    dashboardState.doctorsMinCases = 30;
    dashboardState.doctorsSort = 'volume_desc';
    dashboardState.doctorsSelected = '__top3__';
    dashboardState.doctorsArrivalFilter = 'all';
    dashboardState.doctorsDispositionFilter = 'all';
    dashboardState.doctorsShiftFilter = 'all';
    dashboardState.doctorsDiagnosisFilter = 'all';
    dashboardState.doctorsSearch = '';
    dashboardState.doctorsTableSort = 'count_desc';
    rerender();
  });

  const table = selectors.gydytojaiLeaderboardTable;
  if (table instanceof HTMLTableElement) {
    table.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const header = target.closest('th[data-gydytojai-sort]');
      if (!(header instanceof HTMLElement)) {
        return;
      }
      const key = String(header.getAttribute('data-gydytojai-sort') || '').trim();
      if (!key) {
        return;
      }
      const [currentKey, currentDirection] = String(dashboardState.doctorsTableSort || 'count_desc').split(
        '_'
      );
      const nextDirection = currentKey === key && currentDirection === 'desc' ? 'asc' : 'desc';
      dashboardState.doctorsTableSort = `${key}_${nextDirection}`;
      rerender();
    });
  }
}

export async function runGydytojaiRuntime(core) {
  const selectors = createSelectorsForPage(core?.pageId || 'gydytojai');
  const settings = await loadSettingsFromConfig(DEFAULT_SETTINGS);
  const dashboardState = createDashboardState({
    defaultChartFilters: createDefaultChartFilters,
    defaultKpiFilters: () => createDefaultKpiFilters({ settings, DEFAULT_SETTINGS, DEFAULT_KPI_WINDOW_DAYS }),
    defaultFeedbackFilters: createDefaultFeedbackFilters,
    defaultHeatmapFilters: () => ({ arrival: 'all', disposition: 'all', cardType: 'all' }),
    defaultHeatmapMetric: 'arrivals',
    hourlyMetricArrivals: 'arrivals',
    hourlyCompareSeriesAll: 'all',
  });

  const fromQuery = getDoctorPageStateFromQuery(window.location.search);
  dashboardState.doctorsYear = fromQuery.year;
  dashboardState.doctorsTopN = fromQuery.topN;
  dashboardState.doctorsMinCases = fromQuery.minCases;
  dashboardState.doctorsSort = fromQuery.sort;
  dashboardState.doctorsSelected = fromQuery.doctor;
  dashboardState.doctorsArrivalFilter = fromQuery.arrival;
  dashboardState.doctorsDispositionFilter = fromQuery.disposition;
  dashboardState.doctorsShiftFilter = fromQuery.shift;
  dashboardState.doctorsDiagnosisFilter = fromQuery.diagnosis;
  dashboardState.doctorsSearch = fromQuery.search;
  dashboardState.doctorsTableSort = fromQuery.tableSort;

  applyCommonPageShellText({ selectors, settings, text: TEXT, defaultFooterSource: DEFAULT_FOOTER_SOURCE });
  setupSharedPageUi({
    selectors,
    dashboardState,
    initializeTheme,
    applyTheme,
    themeStorageKey: THEME_STORAGE_KEY,
    afterSectionNavigation: () => {
      initSummariesJumpStickyOffset({
        summariesJumpNav: selectors.jumpNav,
        hero: selectors.hero,
      });
      initSummariesJumpNavigation({
        summariesJumpNav: selectors.jumpNav,
        summariesJumpLinks: selectors.jumpLinks,
      });
    },
  });

  const { fetchData } = createMainDataHandlers({
    settings,
    DEFAULT_SETTINGS,
    dashboardState,
    downloadCsv,
    describeError: (error, options = {}) =>
      describeError(error, { ...options, fallbackMessage: TEXT.status.error }),
    createTextSignature,
    formatUrlForDiagnostics,
  });

  let chartLib = null;
  const render = async () => {
    syncDoctorPageQueryFromState(dashboardState);
    const records = extractHistoricalRecords(dashboardState);
    const options = {
      yearFilter: dashboardState.doctorsYear,
      topN: dashboardState.doctorsTopN,
      minCases: dashboardState.doctorsMinCases,
      sortBy: dashboardState.doctorsSort,
      calculations: settings?.calculations,
      defaultSettings: DEFAULT_SETTINGS,
      selectedDoctor: dashboardState.doctorsSelected,
      arrivalFilter: dashboardState.doctorsArrivalFilter,
      dispositionFilter: dashboardState.doctorsDispositionFilter,
      shiftFilter: dashboardState.doctorsShiftFilter,
      diagnosisGroupFilter: dashboardState.doctorsDiagnosisFilter,
      searchQuery: dashboardState.doctorsSearch,
    };

    const leaderboard = computeDoctorLeaderboard(records, options);
    const yearly = computeDoctorYearlyMatrix(records, options);
    const mix = computeDoctorDayNightMix(records, options);
    const hospital = computeDoctorHospitalizationShare(records, options);
    const trend = computeDoctorMonthlyTrend(records, options);
    const scatter = computeDoctorVolumeVsLosScatter(records, options);

    applyDoctorControls(
      selectors,
      dashboardState,
      yearly.yearOptions,
      leaderboard.rows,
      leaderboard.diagnosisGroupOptions
    );
    setCoverage(selectors, leaderboard);
    setKpis(selectors, leaderboard);
    renderLeaderboardTable(selectors, leaderboard.rows, dashboardState.doctorsTableSort);
    updateSortHeaderState(selectors, dashboardState.doctorsTableSort);
    renderYearlyTable(selectors, yearly);

    chartLib = chartLib || (await loadChartJs());
    if (!chartLib) {
      return;
    }
    renderCharts(dashboardState, chartLib, selectors, {
      leaderboard,
      yearly,
      mix,
      hospital,
      trend,
      scatter,
    });
  };

  wireInteractions(selectors, dashboardState, () => {
    render().catch((error) => {
      console.error('Nepavyko perskaičiuoti gydytojų rodiklių:', error);
    });
  });

  try {
    setStatus(selectors, 'loading');
    const data = await fetchData({ skipHistorical: false });
    dashboardState.rawRecords = Array.isArray(data?.records) ? data.records : [];
    await render();
    setStatus(selectors, 'ready');
  } catch (error) {
    console.error('Nepavyko įkelti gydytojų puslapio:', error);
    setStatus(selectors, 'error', error?.message || TEXT.status.error);
  }
}
