import { createDoctorSpecialtyResolver } from '../../../data/doctor-specialties.js';
import { createMainDataHandlers } from '../../../data/main-data.js';
import {
  computeDoctorDayNightMix,
  computeDoctorHospitalizationShare,
  computeDoctorLeaderboard,
  computeDoctorSpecialtyLeaderboard,
  computeDoctorSpecialtyYearlyComposition,
  computeDoctorSpecialtyYearlySmallMultiples,
  computeDoctorVolumeVsLosScatter,
  computeDoctorYearlySmallMultiples,
  createStatsComputeContext,
} from '../../../data/stats.js';
import { createDashboardState } from '../../../state/dashboardState.js';
import { createSelectorsForPage } from '../../../state/selectors.js';
import { loadChartJs } from '../../../utils/chart-loader.js';
import { getDatasetValue } from '../../../utils/dom.js';
import { numberFormatter, oneDecimalFormatter } from '../../../utils/format.js';
import { DEFAULT_FOOTER_SOURCE, DEFAULT_KPI_WINDOW_DAYS, TEXT, THEME_STORAGE_KEY } from '../../constants.js';
import { DEFAULT_SETTINGS } from '../../default-settings.js';
import { setCopyButtonFeedback, storeCopyButtonBaseLabel, writeTextToClipboard } from '../clipboard.js';
import {
  initSummariesJumpNavigation,
  initSummariesJumpStickyOffset,
} from '../features/summaries-jump-navigation.js';
import { formatExportFilename } from '../features/summaries-runtime-helpers.js';
import { applyTheme, initializeTheme } from '../features/theme.js';
import { parseFromQuery, replaceUrlQuery, serializeToQuery } from '../filters/query-codec.js';
import { createDebouncedHandler, syncAriaPressed } from '../filters/ui-sync.js';
import { createTextSignature, describeError, downloadCsv, formatUrlForDiagnostics } from '../network.js';
import { applyCommonPageShellText, setupSharedPageUi } from '../page-ui.js';
import { loadSettingsFromConfig } from '../settings.js';
import {
  createDefaultChartFilters,
  createDefaultFeedbackFilters,
  createDefaultKpiFilters,
} from '../state.js';
import { escapeCsvCell } from '../table-export.js';
import { createStatusSetter } from '../utils/common.js';
import { createReportExportClickHandler } from './summaries/report-export.js';

const setStatus = createStatusSetter(TEXT.status, { showSuccessState: false });
const DEFAULT_DOCTOR_PAGE_STATE = {
  year: 'all',
  topN: 15,
  minCases: 30,
  sort: 'volume_desc',
  arrival: 'all',
  disposition: 'all',
  shift: 'all',
  specialty: 'all',
  search: '',
  tableSort: 'count_desc',
  annualMetric: 'count',
  annualSort: 'latest_desc',
  annualDoctors: [],
  specialtyAnnualMetric: 'count',
  specialtyAnnualSort: 'latest_desc',
  specialtyAnnualSelected: [],
};

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeAnnualMetric(value, fallback = 'count') {
  const token = String(value ?? '').trim();
  if (token === 'hospitalizedShare' || token === 'avgLosHours' || token === 'nightShare') {
    return token;
  }
  return fallback;
}

function normalizeAnnualSort(value, fallback = 'latest_desc') {
  const token = String(value ?? '').trim();
  if (token === 'yoy_up' || token === 'yoy_down') {
    return token;
  }
  return fallback;
}

function normalizeSpecialtyAnnualMetric(value, fallback = 'count') {
  const token = String(value ?? '').trim();
  if (
    token === 'hospitalizedShare' ||
    token === 'avgLosHours' ||
    token === 'nightShare' ||
    token === 'losGroups'
  ) {
    return token;
  }
  return fallback;
}

function parseDoctorSelectionParam(value) {
  return String(value || '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeAllowed(value, allowed, fallback) {
  const token = String(value ?? '').trim();
  return allowed.has(token) ? token : fallback;
}

export function getDoctorPageStateFromQuery(search, defaults = DEFAULT_DOCTOR_PAGE_STATE) {
  const parsed = parseFromQuery('gydytojai', search);
  const params = new URLSearchParams(String(search || ''));
  return {
    year: String(parsed.year || params.get('y') || defaults.year),
    topN: parsePositiveInt(parsed.topN ?? params.get('top'), defaults.topN),
    minCases: parsePositiveInt(parsed.minCases ?? params.get('min'), defaults.minCases),
    sort: normalizeAllowed(
      parsed.sort ?? params.get('sort'),
      new Set(['volume_desc', 'avgLos_asc', 'avgLos_desc', 'hospital_desc']),
      defaults.sort
    ),
    arrival: normalizeAllowed(
      parsed.arrival ?? params.get('arr'),
      new Set(['all', 'ems', 'self']),
      defaults.arrival
    ),
    disposition: normalizeAllowed(
      parsed.disposition ?? params.get('disp'),
      new Set(['all', 'hospitalized', 'discharged']),
      defaults.disposition
    ),
    shift: normalizeAllowed(
      parsed.shift ?? params.get('shift'),
      new Set(['all', 'day', 'night']),
      defaults.shift
    ),
    specialty: String((parsed.specialty ?? params.get('sp') ?? defaults.specialty) || 'all').trim() || 'all',
    search: String((parsed.search ?? params.get('q')) || defaults.search).trim(),
    tableSort: normalizeAllowed(
      parsed.tableSort ?? params.get('tsort'),
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
        'losLt4Share_desc',
        'losLt4Share_asc',
        'los4to8Share_desc',
        'los4to8Share_asc',
        'los8to16Share_desc',
        'los8to16Share_asc',
        'losGt16Share_desc',
        'losGt16Share_asc',
        'nightShare_desc',
        'nightShare_asc',
      ]),
      defaults.tableSort
    ),
    annualMetric: normalizeAnnualMetric(parsed.annualMetric ?? params.get('am'), defaults.annualMetric),
    annualSort: normalizeAnnualSort(parsed.annualSort ?? params.get('as'), defaults.annualSort),
    annualDoctors: Array.isArray(parsed.annualDoctors)
      ? parsed.annualDoctors.slice(0, 12)
      : parseDoctorSelectionParam(params.get('ad')),
    specialtyAnnualMetric: normalizeSpecialtyAnnualMetric(
      parsed.specialtyAnnualMetric ?? params.get('sam'),
      defaults.specialtyAnnualMetric
    ),
    specialtyAnnualSort: normalizeAnnualSort(
      parsed.specialtyAnnualSort ?? params.get('sas'),
      defaults.specialtyAnnualSort
    ),
    specialtyAnnualSelected: Array.isArray(parsed.specialtyAnnualSelected)
      ? parsed.specialtyAnnualSelected.slice(0, 12)
      : parseDoctorSelectionParam(params.get('sase')),
  };
}

export function buildDoctorPageQuery(state) {
  return serializeToQuery(
    'gydytojai',
    {
      year: state.year,
      topN: state.topN,
      minCases: state.minCases,
      sort: state.sort,
      arrival: state.arrival,
      disposition: state.disposition,
      shift: state.shift,
      specialty: state.specialty,
      search: state.search,
      tableSort: state.tableSort,
      annualMetric: state.annualMetric,
      annualSort: state.annualSort,
      annualDoctors: state.annualDoctors,
      specialtyAnnualMetric: state.specialtyAnnualMetric,
      specialtyAnnualSort: state.specialtyAnnualSort,
      specialtyAnnualSelected: state.specialtyAnnualSelected,
    },
    DEFAULT_DOCTOR_PAGE_STATE
  );
}

function syncDoctorPageQueryFromState(dashboardState) {
  const query = buildDoctorPageQuery({
    year: dashboardState.doctorsYear,
    topN: dashboardState.doctorsTopN,
    minCases: dashboardState.doctorsMinCases,
    sort: dashboardState.doctorsSort,
    arrival: dashboardState.doctorsArrivalFilter,
    disposition: dashboardState.doctorsDispositionFilter,
    shift: dashboardState.doctorsShiftFilter,
    specialty: dashboardState.doctorsSpecialtyFilter,
    search: dashboardState.doctorsSearch,
    tableSort: dashboardState.doctorsTableSort,
    annualMetric: dashboardState.doctorsAnnualMetric,
    annualSort: dashboardState.doctorsAnnualSort,
    annualDoctors: dashboardState.doctorsAnnualSelected,
    specialtyAnnualMetric: dashboardState.doctorsSpecialtyAnnualMetric,
    specialtyAnnualSort: dashboardState.doctorsSpecialtyAnnualSort,
    specialtyAnnualSelected: dashboardState.doctorsSpecialtyAnnualSelected,
  });
  replaceUrlQuery(query);
}

function extractHistoricalRecords(dashboardState) {
  const all = Array.isArray(dashboardState.rawRecords) ? dashboardState.rawRecords : [];
  const tagged = all.filter((record) => record?.sourceId === 'historical');
  return tagged.length ? tagged : all.filter((record) => record?.hasExtendedHistoricalFields === true);
}

function applyDoctorControls(selectors, dashboardState, yearOptions) {
  const previousYear = String(dashboardState.doctorsYear || 'all');
  const allowedYears = new Set(['all']);
  (Array.isArray(yearOptions) ? yearOptions : []).forEach((year) => {
    const normalizedYear = String(year).trim();
    if (/^\d{4}$/.test(normalizedYear)) {
      allowedYears.add(normalizedYear);
    }
  });
  dashboardState.doctorsYear = allowedYears.has(previousYear) ? previousYear : 'all';

  if (selectors.gydytojaiYearChips instanceof HTMLElement) {
    selectors.gydytojaiYearChips.replaceChildren();
    const allButton = document.createElement('button');
    allButton.type = 'button';
    allButton.className = 'chip-button';
    allButton.setAttribute('data-gydytojai-year', 'all');
    allButton.textContent = 'Visi metai';
    selectors.gydytojaiYearChips.appendChild(allButton);
    (Array.isArray(yearOptions) ? yearOptions : []).forEach((year) => {
      const normalizedYear = String(year).trim();
      if (!/^\d{4}$/.test(normalizedYear)) {
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip-button';
      button.setAttribute('data-gydytojai-year', normalizedYear);
      button.textContent = normalizedYear;
      selectors.gydytojaiYearChips.appendChild(button);
    });
  }

  const setPressed = (buttons, currentValue, getValue) =>
    syncAriaPressed(buttons, (button) => String(getValue(button) || ''), String(currentValue));
  if (selectors.gydytojaiYearChips instanceof HTMLElement) {
    setPressed(
      Array.from(selectors.gydytojaiYearChips.querySelectorAll('[data-gydytojai-year]')),
      dashboardState.doctorsYear,
      (button) => button.getAttribute('data-gydytojai-year')
    );
  }
  setPressed(selectors.gydytojaiTopNButtons, dashboardState.doctorsTopN, (button) =>
    button.getAttribute('data-gydytojai-topn')
  );
  setPressed(selectors.gydytojaiMinCasesButtons, dashboardState.doctorsMinCases, (button) =>
    button.getAttribute('data-gydytojai-mincases')
  );
  setPressed(selectors.gydytojaiSortButtons, dashboardState.doctorsSort, (button) =>
    button.getAttribute('data-gydytojai-sortby')
  );
  setPressed(selectors.gydytojaiArrivalButtons, dashboardState.doctorsArrivalFilter, (button) =>
    button.getAttribute('data-gydytojai-arrival')
  );
  setPressed(selectors.gydytojaiDispositionButtons, dashboardState.doctorsDispositionFilter, (button) =>
    button.getAttribute('data-gydytojai-disposition')
  );
  setPressed(selectors.gydytojaiShiftButtons, dashboardState.doctorsShiftFilter, (button) =>
    button.getAttribute('data-gydytojai-shift')
  );
  if (selectors.gydytojaiSearch) {
    selectors.gydytojaiSearch.value = String(dashboardState.doctorsSearch || '');
  }
  setPressed(selectors.gydytojaiAnnualMetricButtons, dashboardState.doctorsAnnualMetric, (button) =>
    button.getAttribute('data-gydytojai-annual-metric')
  );
  setPressed(selectors.gydytojaiAnnualSortButtons, dashboardState.doctorsAnnualSort, (button) =>
    button.getAttribute('data-gydytojai-annual-sort')
  );
  if (selectors.gydytojaiAnnualDoctorInput) {
    selectors.gydytojaiAnnualDoctorInput.value = String(dashboardState.doctorsAnnualSearchInput || '');
  }
  setPressed(
    selectors.gydytojaiSpecialtyAnnualMetricButtons,
    dashboardState.doctorsSpecialtyAnnualMetric,
    (button) => button.getAttribute('data-gydytojai-specialty-annual-metric')
  );
  setPressed(
    selectors.gydytojaiSpecialtyAnnualSortButtons,
    dashboardState.doctorsSpecialtyAnnualSort,
    (button) => button.getAttribute('data-gydytojai-specialty-annual-sort')
  );
}

function applyDoctorSpecialtyControls(selectors, dashboardState, specialtyValidation, specialtyOptions) {
  const host = selectors?.gydytojaiSpecialtyChips;
  if (!(host instanceof HTMLElement)) {
    return;
  }
  const validation = specialtyValidation || {};
  const enabled = validation.enabled === true;
  const uiEnabled = dashboardState?.doctorsSpecialtyUiEnabled === true && enabled;
  host.replaceChildren();
  host.hidden = !enabled;
  host.setAttribute('aria-disabled', uiEnabled ? 'false' : 'true');
  if (!enabled) {
    return;
  }

  const groups = Array.isArray(specialtyOptions) ? specialtyOptions : [];
  const allowed = new Set(['all', ...groups.map((group) => String(group?.id || '').trim()).filter(Boolean)]);
  const current = String(dashboardState?.doctorsSpecialtyFilter || 'all');
  dashboardState.doctorsSpecialtyFilter = allowed.has(current) ? current : 'all';

  const items = [{ id: 'all', label: 'Visos' }, ...groups];
  items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip-button';
    button.setAttribute('data-gydytojai-specialty', String(item.id || 'all'));
    button.setAttribute(
      'aria-pressed',
      String(dashboardState.doctorsSpecialtyFilter) === String(item.id) ? 'true' : 'false'
    );
    if (!uiEnabled) {
      button.disabled = true;
    }
    button.textContent = String(item.label || item.id || '');
    host.appendChild(button);
  });
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

function setLoadingVisualState(selectors, isLoading) {
  if (selectors.gydytojaiLoadingState instanceof HTMLElement) {
    selectors.gydytojaiLoadingState.hidden = !isLoading;
  }
  if (selectors.gydytojaiLoadingInline instanceof HTMLElement) {
    selectors.gydytojaiLoadingInline.hidden = !isLoading;
  }
  const main = document.querySelector('main.container');
  if (main instanceof HTMLElement) {
    if (isLoading) {
      main.setAttribute('aria-busy', 'true');
    } else {
      main.removeAttribute('aria-busy');
    }
  }
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

function renderSpecialtyComparisonTable(selectors, model, dashboardState) {
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
    body.appendChild(tr);
  });
  updateSpecialtySortHeaderState(selectors, dashboardState?.doctorsSpecialtyTableSort);
}

function buildDoctorFilterSummary(dashboardState) {
  const year = dashboardState.doctorsYear === 'all' ? 'Visi metai' : String(dashboardState.doctorsYear);
  const base = `Metai: ${year} | TOP N: ${dashboardState.doctorsTopN} | Min. imtis: ${dashboardState.doctorsMinCases} | Rikiavimas: ${dashboardState.doctorsSort}`;
  if (dashboardState?.doctorsSpecialtyUiEnabled !== true) {
    return base;
  }
  const specialty =
    String(dashboardState?.doctorsSpecialtyFilter || 'all') === 'all'
      ? 'Visos'
      : String(dashboardState.doctorsSpecialtyFilter);
  return `${base} | Specialybė: ${specialty}`;
}

function getActiveDoctorFilterChips(dashboardState) {
  const chips = [];
  if (String(dashboardState?.doctorsYear || 'all') !== 'all') {
    chips.push({
      key: 'year',
      label: `Metai: ${dashboardState.doctorsYear}`,
    });
  }
  if (Number(dashboardState?.doctorsTopN || 15) !== 15) {
    chips.push({
      key: 'topN',
      label: `TOP N: ${dashboardState.doctorsTopN}`,
    });
  }
  if (Number(dashboardState?.doctorsMinCases || 30) !== 30) {
    chips.push({
      key: 'minCases',
      label: `Min. imtis: ${dashboardState.doctorsMinCases}`,
    });
  }
  if (String(dashboardState?.doctorsSort || 'volume_desc') !== 'volume_desc') {
    const sortMap = {
      volume_desc: 'Apkrova',
      avgLos_asc: 'Vid. trukmė didėjančiai',
      avgLos_desc: 'Vid. trukmė mažėjančiai',
      hospital_desc: 'Hospitalizacija mažėjančiai',
    };
    const label = sortMap[String(dashboardState.doctorsSort)] || String(dashboardState.doctorsSort);
    chips.push({
      key: 'sort',
      label: `Rikiavimas: ${label}`,
    });
  }
  if (String(dashboardState?.doctorsArrivalFilter || 'all') !== 'all') {
    const arrivalMap = { ems: 'Tik GMP', self: 'Be GMP' };
    chips.push({
      key: 'arrival',
      label: `Atvykimas: ${arrivalMap[String(dashboardState.doctorsArrivalFilter)] || dashboardState.doctorsArrivalFilter}`,
    });
  }
  if (String(dashboardState?.doctorsDispositionFilter || 'all') !== 'all') {
    const dispositionMap = { hospitalized: 'Hospitalizuoti', discharged: 'Išleisti' };
    chips.push({
      key: 'disposition',
      label: `Baigtis: ${dispositionMap[String(dashboardState.doctorsDispositionFilter)] || dashboardState.doctorsDispositionFilter}`,
    });
  }
  if (String(dashboardState?.doctorsShiftFilter || 'all') !== 'all') {
    const shiftMap = { day: 'Diena', night: 'Naktis' };
    chips.push({
      key: 'shift',
      label: `Pamaina: ${shiftMap[String(dashboardState.doctorsShiftFilter)] || dashboardState.doctorsShiftFilter}`,
    });
  }
  if (
    dashboardState?.doctorsSpecialtyUiEnabled === true &&
    String(dashboardState?.doctorsSpecialtyFilter || 'all') !== 'all'
  ) {
    const groups = Array.isArray(dashboardState?.doctorsSpecialtyValidation?.groups)
      ? dashboardState.doctorsSpecialtyValidation.groups
      : [];
    const group = groups.find(
      (entry) => String(entry?.id || '') === String(dashboardState.doctorsSpecialtyFilter)
    );
    chips.push({
      key: 'specialty',
      label: `Specialybė: ${group?.label || dashboardState.doctorsSpecialtyFilter}`,
    });
  }
  const search = String(dashboardState?.doctorsSearchDebounced || dashboardState?.doctorsSearch || '').trim();
  if (search) {
    chips.push({
      key: 'search',
      label: `Paieška: ${search}`,
    });
  }
  return chips;
}

function renderDoctorSpecialtyValidation(selectors, dashboardState) {
  const host = selectors?.gydytojaiSpecialtyWarning;
  if (!(host instanceof HTMLElement)) {
    return;
  }
  const validation = dashboardState?.doctorsSpecialtyValidation || {};
  if (validation.enabled !== true) {
    host.hidden = true;
    host.textContent = '';
    return;
  }
  const errors = Array.isArray(validation.errors) ? validation.errors : [];
  const warnings = Array.isArray(validation.warnings) ? validation.warnings : [];
  if (!errors.length && !warnings.length) {
    host.hidden = true;
    host.textContent = '';
    return;
  }
  const messages = [];
  if (errors.length) {
    messages.push(`Specialybių grupavimas išjungtas: ${errors.join(' ')}`);
  } else if (warnings.length) {
    messages.push(`Specialybių įspėjimai: ${warnings.join(' ')}`);
  }
  host.hidden = false;
  host.textContent = messages.join(' ');
}

function renderActiveDoctorFilters(selectors, dashboardState) {
  const host = selectors?.gydytojaiActiveFilters;
  if (!(host instanceof HTMLElement)) {
    return;
  }
  const chips = getActiveDoctorFilterChips(dashboardState);
  host.replaceChildren();
  if (!chips.length) {
    const empty = document.createElement('p');
    empty.className = 'summaries-reports-coverage';
    empty.textContent = 'Aktyvių filtrų nėra.';
    host.appendChild(empty);
    return;
  }
  chips.forEach((chip) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip-button gydytojai-filter-chip';
    button.setAttribute('data-filter-remove', chip.key);
    button.textContent = `${chip.label} ×`;
    host.appendChild(button);
  });
}

function getVisibleDoctorRowsForCharts(rows, hiddenAliases) {
  const hidden = new Set(
    (Array.isArray(hiddenAliases) ? hiddenAliases : []).map((alias) => normalizeDoctorAliasToken(alias))
  );
  return (Array.isArray(rows) ? rows : []).filter(
    (row) => !hidden.has(normalizeDoctorAliasToken(row?.alias))
  );
}

function renderDoctorChartToggles(selectors, dashboardState, rows) {
  const host = selectors?.gydytojaiChartDoctorToggles;
  if (!(host instanceof HTMLElement)) {
    return;
  }
  const aliases = (Array.isArray(rows) ? rows : [])
    .map((row) => String(row?.alias || '').trim())
    .filter(Boolean);
  const aliasSet = new Set(aliases.map((alias) => normalizeDoctorAliasToken(alias)));
  dashboardState.doctorsChartsHiddenAliases = (dashboardState.doctorsChartsHiddenAliases || []).filter(
    (alias) => aliasSet.has(normalizeDoctorAliasToken(alias))
  );
  const hiddenSet = new Set(
    (dashboardState.doctorsChartsHiddenAliases || []).map((alias) => normalizeDoctorAliasToken(alias))
  );
  host.replaceChildren();
  aliases.forEach((alias) => {
    const hidden = hiddenSet.has(normalizeDoctorAliasToken(alias));
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip-button gydytojai-chart-chip${hidden ? ' is-muted' : ''}`;
    chip.setAttribute('data-chart-doctor-toggle', alias);
    chip.setAttribute('aria-pressed', hidden ? 'false' : 'true');
    chip.textContent = alias;
    host.appendChild(chip);
  });
}

function setDoctorExportState(exportState, selectors, dashboardState, models) {
  const filterSummary = buildDoctorFilterSummary(dashboardState);
  const prefaceLines = [`# Filtrai: ${filterSummary}`];
  const leaderboardRows = Array.isArray(models?.leaderboard?.rows) ? models.leaderboard.rows : [];
  const mixRows = Array.isArray(models?.mix?.rows) ? models.mix.rows : [];
  const scatterRows = Array.isArray(models?.scatter?.rows) ? models.scatter.rows : [];

  exportState.volume = {
    title: 'Atvejų skaičius pagal gydytoją',
    exportTitle: `Atvejų skaičius pagal gydytoją | ${filterSummary}`,
    prefaceLines,
    headers: ['Gydytojas', 'Atvejai'],
    rows: leaderboardRows.map((row) => [row.alias, numberFormatter.format(row.count)]),
    target: selectors.gydytojaiVolumeChart,
  };
  exportState.los = {
    title: 'LOS intervalų pasiskirstymas pagal gydytoją',
    exportTitle: `LOS intervalų pasiskirstymas pagal gydytoją | ${filterSummary}`,
    prefaceLines,
    headers: ['Gydytojas', 'LOS <4 (%)', 'LOS 4-8 (%)', 'LOS 8-16 (%)', 'LOS >16 (%)'],
    rows: leaderboardRows.map((row) => [
      row.alias,
      oneDecimalFormatter.format(row.losLt4Share * 100),
      oneDecimalFormatter.format(row.los4to8Share * 100),
      oneDecimalFormatter.format(row.los8to16Share * 100),
      oneDecimalFormatter.format(row.losGt16Share * 100),
    ]),
    target: selectors.gydytojaiLosChart,
  };
  exportState.hospital = {
    title: 'Hospitalizacijų dalis pagal gydytoją',
    exportTitle: `Hospitalizacijų dalis pagal gydytoją | ${filterSummary}`,
    prefaceLines,
    headers: ['Gydytojas', 'Hospitalizacija (%)'],
    rows: leaderboardRows.map((row) => [row.alias, oneDecimalFormatter.format(row.hospitalizedShare * 100)]),
    target: selectors.gydytojaiHospitalChart,
  };
  exportState.mix = {
    title: 'Diena/Naktis pagal gydytoją',
    exportTitle: `Diena/Naktis pagal gydytoją | ${filterSummary}`,
    prefaceLines,
    headers: ['Gydytojas', 'Diena (%)', 'Naktis (%)'],
    rows: mixRows.map((row) => [
      row.alias,
      oneDecimalFormatter.format(row.dayShare * 100),
      oneDecimalFormatter.format(row.nightShare * 100),
    ]),
    target: selectors.gydytojaiMixChart,
  };
  delete exportState.trend;
  exportState.scatter = {
    title: 'Apimtis vs LOS',
    exportTitle: `Apimtis vs LOS | ${filterSummary}`,
    prefaceLines,
    headers: ['Gydytojas', 'Atvejai', 'Vid. LOS (val.)'],
    rows: scatterRows.map((row) => [
      row.alias,
      numberFormatter.format(row.count),
      oneDecimalFormatter.format(row.avgLosHours),
    ]),
    target: selectors.gydytojaiScatterChart,
  };
}

function getAnnualMetricConfig(metric) {
  if (metric === 'hospitalizedShare') {
    return {
      label: 'Hospitalizacija',
      format: (value) => `${oneDecimalFormatter.format(Number(value) * 100)}%`,
      short: '%',
    };
  }
  if (metric === 'avgLosHours') {
    return {
      label: 'Vid. LOS',
      format: (value) => `${oneDecimalFormatter.format(value)} val.`,
      short: 'val.',
    };
  }
  if (metric === 'nightShare') {
    return {
      label: 'Naktiniai',
      format: (value) => `${oneDecimalFormatter.format(Number(value) * 100)}%`,
      short: '%',
    };
  }
  return {
    label: 'Atvejų sk.',
    format: (value) => numberFormatter.format(Number(value || 0)),
    short: '',
  };
}

function formatAnnualDelta(metric, deltaAbs, deltaPct) {
  if (!Number.isFinite(deltaAbs)) {
    return 'YoY: N/A';
  }
  const absPrefix = deltaAbs > 0 ? '+' : '';
  if (metric === 'count') {
    const pctLabel = Number.isFinite(deltaPct)
      ? ` (${deltaPct >= 0 ? '+' : ''}${oneDecimalFormatter.format(deltaPct)}%)`
      : '';
    return `YoY: ${absPrefix}${numberFormatter.format(Math.round(deltaAbs))}${pctLabel}`;
  }
  const scaledAbs = metric === 'avgLosHours' ? deltaAbs : deltaAbs * 100;
  const unit = metric === 'avgLosHours' ? ' val.' : ' p.p.';
  const pctLabel = Number.isFinite(deltaPct)
    ? ` (${deltaPct >= 0 ? '+' : ''}${oneDecimalFormatter.format(deltaPct)}%)`
    : '';
  return `YoY: ${scaledAbs >= 0 ? '+' : ''}${oneDecimalFormatter.format(scaledAbs)}${unit}${pctLabel}`;
}

function getTrendSymbol(trend) {
  if (trend === 'up') {
    return '↑';
  }
  if (trend === 'down') {
    return '↓';
  }
  if (trend === 'flat') {
    return '↔';
  }
  return '·';
}

function sortAnnualCards(cards, mode) {
  const list = Array.isArray(cards) ? cards.slice() : [];
  const toNumberOr = (value, fallback) => (Number.isFinite(value) ? Number(value) : fallback);
  if (mode === 'yoy_up') {
    return list.sort((a, b) => toNumberOr(b?.yoyDeltaPct, -Infinity) - toNumberOr(a?.yoyDeltaPct, -Infinity));
  }
  if (mode === 'yoy_down') {
    return list.sort((a, b) => toNumberOr(a?.yoyDeltaPct, Infinity) - toNumberOr(b?.yoyDeltaPct, Infinity));
  }
  return list.sort((a, b) => toNumberOr(b?.latestValue, -Infinity) - toNumberOr(a?.latestValue, -Infinity));
}

function buildAnnualExportPreface(dashboardState, metricLabel) {
  const selected = Array.isArray(dashboardState.doctorsAnnualSelected)
    ? dashboardState.doctorsAnnualSelected
    : [];
  return [
    `# Filtrai: ${buildDoctorFilterSummary(dashboardState)}`,
    `# Metinė dinamika: metrika=${metricLabel}; rikiavimas=${dashboardState.doctorsAnnualSort}; pasirinkta=${selected.join('; ')}`,
  ];
}

function normalizeDoctorAliasToken(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function resolveAnnualDoctorAlias(inputValue, availableDoctors) {
  const query = normalizeDoctorAliasToken(inputValue);
  if (!query) {
    return '';
  }
  const list = Array.isArray(availableDoctors) ? availableDoctors : [];
  const exact = list.find((entry) => normalizeDoctorAliasToken(entry?.alias) === query);
  if (exact?.alias) {
    return String(exact.alias);
  }
  const startsWith = list.find((entry) => normalizeDoctorAliasToken(entry?.alias).startsWith(query));
  if (startsWith?.alias) {
    return String(startsWith.alias);
  }
  const contains = list.find((entry) => normalizeDoctorAliasToken(entry?.alias).includes(query));
  return contains?.alias ? String(contains.alias) : '';
}

function getAnnualDoctorSuggestions(dashboardState, limit = 8) {
  const query = normalizeDoctorAliasToken(dashboardState?.doctorsAnnualSearchInput);
  const selected = Array.isArray(dashboardState?.doctorsAnnualSelected)
    ? dashboardState.doctorsAnnualSelected
    : [];
  const selectedSet = new Set(selected.map((value) => normalizeDoctorAliasToken(value)));
  const available = Array.isArray(dashboardState?.doctorsAnnualAvailable)
    ? dashboardState.doctorsAnnualAvailable
    : [];
  const list = available
    .filter((entry) => {
      const alias = String(entry?.alias || '').trim();
      if (!alias || selectedSet.has(normalizeDoctorAliasToken(alias))) {
        return false;
      }
      if (!query) {
        return true;
      }
      return normalizeDoctorAliasToken(alias).includes(query);
    })
    .map((entry) => {
      const alias = String(entry?.alias || '').trim();
      const normalized = normalizeDoctorAliasToken(alias);
      let rank = 2;
      if (query && normalized === query) {
        rank = 0;
      } else if (query && normalized.startsWith(query)) {
        rank = 1;
      }
      return {
        alias,
        total: Number(entry?.total || 0),
        rank,
      };
    })
    .sort((a, b) => {
      if (a.rank !== b.rank) {
        return a.rank - b.rank;
      }
      if (a.total !== b.total) {
        return b.total - a.total;
      }
      return a.alias.localeCompare(b.alias, 'lt');
    });
  return list.slice(0, Math.max(1, Number(limit) || 8));
}

function renderAnnualDoctorSuggestions(selectors, dashboardState) {
  const host = selectors?.gydytojaiAnnualSuggestions;
  if (!(host instanceof HTMLElement)) {
    return [];
  }
  const input = selectors?.gydytojaiAnnualDoctorInput;
  const query = normalizeDoctorAliasToken(dashboardState?.doctorsAnnualSearchInput);
  const shouldShow = query.length > 0 || (input instanceof HTMLElement && document.activeElement === input);
  if (!shouldShow) {
    host.replaceChildren();
    host.hidden = true;
    dashboardState.doctorsAnnualSuggestIndex = -1;
    return [];
  }
  const suggestions = getAnnualDoctorSuggestions(dashboardState);
  host.replaceChildren();
  if (!suggestions.length) {
    host.hidden = true;
    dashboardState.doctorsAnnualSuggestIndex = -1;
    return suggestions;
  }
  const currentIndex = Number.isFinite(dashboardState.doctorsAnnualSuggestIndex)
    ? Number(dashboardState.doctorsAnnualSuggestIndex)
    : 0;
  const nextIndex = currentIndex >= 0 && currentIndex < suggestions.length ? currentIndex : 0;
  dashboardState.doctorsAnnualSuggestIndex = nextIndex;
  suggestions.forEach((entry, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `gydytojai-annual-suggestion${index === nextIndex ? ' is-active' : ''}`;
    option.setAttribute('data-annual-suggest', entry.alias);
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', index === nextIndex ? 'true' : 'false');
    option.textContent = `${entry.alias} (n=${numberFormatter.format(entry.total)})`;
    host.appendChild(option);
  });
  host.hidden = false;
  return suggestions;
}

function renderAnnualSelectedChips(selectors, dashboardState, annualModel) {
  if (!selectors.gydytojaiAnnualSelected || !selectors.gydytojaiAnnualSelectionHelp) {
    return;
  }
  const selected = Array.isArray(dashboardState.doctorsAnnualSelected)
    ? dashboardState.doctorsAnnualSelected
    : [];
  selectors.gydytojaiAnnualSelected.replaceChildren();
  const missingSelected = Array.isArray(annualModel?.meta?.missingSelected)
    ? annualModel.meta.missingSelected
    : [];
  selected.forEach((alias) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip-button gydytojai-annual-chip${missingSelected.includes(alias) ? ' is-error' : ''}`;
    chip.setAttribute('data-annual-remove', alias);
    chip.textContent = alias;
    selectors.gydytojaiAnnualSelected.appendChild(chip);
  });
  if (!selected.length) {
    selectors.gydytojaiAnnualSelectionHelp.textContent = 'Įveskite bent 1 gydytoją metinei dinamikai.';
  } else if (missingSelected.length) {
    selectors.gydytojaiAnnualSelectionHelp.textContent = `Nerasta pagal filtrus: ${missingSelected.join(', ')}`;
  } else {
    selectors.gydytojaiAnnualSelectionHelp.textContent = `Pasirinkta gydytojų: ${selected.length}.`;
  }
}

function destroyAnnualCardCharts(dashboardState) {
  const refs = dashboardState?.doctorsAnnualCardsChartRefs || {};
  Object.keys(refs).forEach((key) => {
    const chart = refs[key];
    if (chart && typeof chart.destroy === 'function') {
      chart.destroy();
    }
    refs[key] = null;
  });
}

function renderDoctorAnnualSmallMultiples(
  selectors,
  dashboardState,
  chartLib,
  annualModel,
  exportState,
  handleReportExportClick
) {
  if (!selectors.gydytojaiAnnualCards || !selectors.gydytojaiAnnualEmpty) {
    return;
  }
  const metric = String(dashboardState.doctorsAnnualMetric || 'count');
  const metricConfig = getAnnualMetricConfig(metric);
  const cards = sortAnnualCards(annualModel?.cards || [], dashboardState.doctorsAnnualSort);
  const selected = Array.isArray(dashboardState.doctorsAnnualSelected)
    ? dashboardState.doctorsAnnualSelected
    : [];
  selectors.gydytojaiAnnualCards.replaceChildren();
  if (!selected.length) {
    selectors.gydytojaiAnnualEmpty.hidden = true;
    destroyAnnualCardCharts(dashboardState);
    Object.keys(exportState)
      .filter((key) => key.startsWith('annual:'))
      .forEach((key) => {
        delete exportState[key];
      });
    return;
  }
  if (!cards.length) {
    selectors.gydytojaiAnnualEmpty.hidden = false;
    selectors.gydytojaiAnnualEmpty.textContent = 'Nepakanka bent 2 metų duomenų pagal aktyvius filtrus.';
    destroyAnnualCardCharts(dashboardState);
    Object.keys(exportState)
      .filter((key) => key.startsWith('annual:'))
      .forEach((key) => {
        delete exportState[key];
      });
    return;
  }
  selectors.gydytojaiAnnualEmpty.hidden = true;
  destroyAnnualCardCharts(dashboardState);
  Object.keys(exportState)
    .filter((key) => key.startsWith('annual:'))
    .forEach((key) => {
      delete exportState[key];
    });

  const refs = dashboardState.doctorsAnnualCardsChartRefs || {};
  dashboardState.doctorsAnnualCardsChartRefs = refs;
  cards.forEach((card, index) => {
    const key = `annual:${String(card?.doctorKey || index)}`;
    const latestLabel = Number.isFinite(card?.latestValue) ? metricConfig.format(card.latestValue) : 'N/A';
    const wrapper = document.createElement('article');
    wrapper.className = 'report-card gydytojai-annual-card';
    wrapper.innerHTML = `
      <div class="report-card__head">
        <h4>${card.alias}</h4>
        <div class="report-card__actions">
          <button type="button" class="chart-copy-btn" data-report-export="copy" data-report-key="${key}" data-tooltip="Kopijuoti grafiką" aria-label="Kopijuoti metinę kortelę" title="Kopijuoti metinę kortelę"><svg viewBox="0 0 24 24" fill="none" role="img" aria-hidden="true" focusable="false" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"></rect><rect x="4" y="4" width="11" height="11" rx="2"></rect></svg></button>
          <button type="button" class="chart-download-btn" data-report-export="png" data-report-key="${key}" data-tooltip="Parsisiųsti PNG" aria-label="Parsisiųsti metinę kortelę PNG" title="Parsisiųsti metinę kortelę PNG"><svg viewBox="0 0 24 24" fill="none" role="img" aria-hidden="true" focusable="false" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"></path><path d="M8 11l4 4 4-4"></path><path d="M4 21h16"></path></svg></button>
        </div>
      </div>
      <p class="gydytojai-annual-card__meta">
        <strong>${latestLabel}</strong>
        <span>${formatAnnualDelta(metric, card?.yoyDeltaAbs, card?.yoyDeltaPct)}</span>
        <span>${getTrendSymbol(card?.trend)}</span>
      </p>
      <canvas class="gydytojai-annual-card__chart" height="120"></canvas>
      <p class="report-card__hint">Metai: ${(card.points || []).map((point) => point.year).join(', ')}</p>
    `;
    selectors.gydytojaiAnnualCards.appendChild(wrapper);

    const canvas = wrapper.querySelector('canvas');
    if (canvas instanceof HTMLCanvasElement) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        refs[key] = new chartLib(ctx, {
          type: 'line',
          data: {
            labels: (card.points || []).map((point) => point.year),
            datasets: [
              {
                label: metricConfig.label,
                data: (card.points || []).map((point) => {
                  const value = point?.[metric];
                  if (!Number.isFinite(value)) {
                    return null;
                  }
                  return metric === 'count' || metric === 'avgLosHours' ? Number(value) : Number(value) * 100;
                }),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.16)',
                fill: true,
                tension: 0.3,
                pointRadius: 2,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
              y: { ticks: { maxTicksLimit: 5 } },
            },
          },
        });
      }
    }

    exportState[key] = {
      title: `Metinė dinamika - ${card.alias}`,
      exportTitle: `Metinė dinamika - ${card.alias}`,
      prefaceLines: buildAnnualExportPreface(dashboardState, metricConfig.label),
      headers: ['Metai', metricConfig.label, 'Imtis (n)'],
      rows: (card.points || []).map((point) => {
        const metricValue = point?.[metric];
        const renderedValue = Number.isFinite(metricValue) ? metricConfig.format(metricValue) : 'N/A';
        return [point.year, renderedValue, numberFormatter.format(Number(point?.count || 0))];
      }),
      target: canvas,
    };

    Array.from(wrapper.querySelectorAll('[data-report-export]')).forEach((button) => {
      storeCopyButtonBaseLabel(button);
      button.addEventListener('click', handleReportExportClick);
    });
  });
}

function getSpecialtyAnnualMetricConfig(metric) {
  if (metric === 'losGroups') {
    return {
      label: 'LOS grupės (%)',
      format: (value) =>
        Number.isFinite(value) ? `${oneDecimalFormatter.format(Number(value) * 100)}%` : 'N/A',
      summaryFormat: (card, value) => {
        const bucketLabel = getLosBucketLabel(card?.latestDominantBucketKey);
        return Number.isFinite(value)
          ? `${bucketLabel}: ${oneDecimalFormatter.format(Number(value) * 100)}%`
          : 'N/A';
      },
    };
  }
  return {
    ...getAnnualMetricConfig(metric),
    summaryFormat: (_card, value) =>
      Number.isFinite(value) ? getAnnualMetricConfig(metric).format(value) : 'N/A',
  };
}

function getLosBucketLabel(key) {
  const map = {
    losLt4Share: '<4h',
    los4to8Share: '4-8h',
    los8to16Share: '8-16h',
    losGt16Share: '>16h',
  };
  return map[String(key || '')] || 'LOS';
}

function formatSpecialtyAnnualDelta(metric, card) {
  if (metric === 'losGroups') {
    if (!Number.isFinite(card?.yoyDeltaAbs)) {
      return 'YoY: N/A';
    }
    const pctLabel = Number.isFinite(card?.yoyDeltaPct)
      ? ` (${card.yoyDeltaPct >= 0 ? '+' : ''}${oneDecimalFormatter.format(card.yoyDeltaPct)}%)`
      : '';
    return `YoY: ${card.yoyDeltaAbs >= 0 ? '+' : ''}${oneDecimalFormatter.format(
      Number(card.yoyDeltaAbs) * 100
    )} p.p.${pctLabel}`;
  }
  return formatAnnualDelta(metric, card?.yoyDeltaAbs, card?.yoyDeltaPct);
}

function formatSpecialtyAnnualDeltaAbs(metric, deltaAbs) {
  if (!Number.isFinite(deltaAbs)) {
    return 'N/A';
  }
  if (metric === 'count') {
    return `${deltaAbs >= 0 ? '+' : ''}${numberFormatter.format(Math.round(Number(deltaAbs)))}`;
  }
  const scaled = metric === 'avgLosHours' ? Number(deltaAbs) : Number(deltaAbs) * 100;
  const unit = metric === 'avgLosHours' ? ' val.' : ' p.p.';
  return `${scaled >= 0 ? '+' : ''}${oneDecimalFormatter.format(scaled)}${unit}`;
}

function normalizeSpecialtyToken(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function syncSpecialtyAnnualSelection(dashboardState, availableSpecialties) {
  const available = Array.isArray(availableSpecialties) ? availableSpecialties : [];
  dashboardState.doctorsSpecialtyAnnualAvailable = available;
  const current = Array.isArray(dashboardState.doctorsSpecialtyAnnualSelected)
    ? dashboardState.doctorsSpecialtyAnnualSelected
    : [];
  const seen = new Set();
  dashboardState.doctorsSpecialtyAnnualSelected = current.filter((value) => {
    const token = normalizeSpecialtyToken(value);
    if (!token || seen.has(token)) {
      return false;
    }
    seen.add(token);
    return true;
  });
}

function renderSpecialtyAnnualControls(selectors, dashboardState, annualModel) {
  const section = selectors?.gydytojaiSpecialtyAnnualSection;
  const selectedHost = selectors?.gydytojaiSpecialtyAnnualSelected;
  const clearButton = selectors?.gydytojaiSpecialtyAnnualClear;
  if (
    !(section instanceof HTMLElement) ||
    !(selectedHost instanceof HTMLElement) ||
    !(clearButton instanceof HTMLElement)
  ) {
    return;
  }
  const enabled = dashboardState?.doctorsSpecialtyUiEnabled === true;
  section.hidden = !enabled;
  if (!enabled) {
    selectedHost.replaceChildren();
    clearButton.disabled = true;
    return;
  }

  syncAriaPressed(
    selectors?.gydytojaiSpecialtyAnnualMetricButtons || [],
    (button) => String(button.getAttribute('data-gydytojai-specialty-annual-metric') || ''),
    String(dashboardState?.doctorsSpecialtyAnnualMetric || 'count')
  );
  syncAriaPressed(
    selectors?.gydytojaiSpecialtyAnnualSortButtons || [],
    (button) => String(button.getAttribute('data-gydytojai-specialty-annual-sort') || ''),
    String(dashboardState?.doctorsSpecialtyAnnualSort || 'latest_desc')
  );

  const available = Array.isArray(annualModel?.meta?.availableSpecialties)
    ? annualModel.meta.availableSpecialties
    : [];
  const selected = Array.isArray(dashboardState?.doctorsSpecialtyAnnualSelected)
    ? dashboardState.doctorsSpecialtyAnnualSelected
    : [];
  const selectedSet = new Set(selected.map((value) => normalizeSpecialtyToken(value)));
  selectedHost.replaceChildren();
  available.forEach((entry) => {
    const specialtyId = String(entry?.specialtyId || '').trim();
    const alias = String(entry?.alias || specialtyId).trim();
    if (!specialtyId || !alias) {
      return;
    }
    const pressed =
      selectedSet.has(normalizeSpecialtyToken(specialtyId)) ||
      selectedSet.has(normalizeSpecialtyToken(alias));
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip-button gydytojai-annual-chip${pressed ? '' : ' chip-button--ghost'}`;
    chip.setAttribute('data-gydytojai-specialty-annual-select', specialtyId);
    chip.setAttribute('data-gydytojai-specialty-annual-label', alias);
    chip.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    chip.textContent = `${alias} (n=${numberFormatter.format(Number(entry?.total || 0))})`;
    selectedHost.appendChild(chip);
  });
  clearButton.disabled = !selected.length;
}

function destroySpecialtyAnnualCardCharts(dashboardState) {
  const refs = dashboardState?.doctorsSpecialtyAnnualCardsChartRefs || {};
  Object.keys(refs).forEach((key) => {
    const chart = refs[key];
    if (chart && typeof chart.destroy === 'function') {
      chart.destroy();
    }
    refs[key] = null;
  });
}

function renderSpecialtyAnnualSummary(selectors, dashboardState, annualModel) {
  const body = selectors?.gydytojaiSpecialtyAnnualSummaryBody;
  if (!(body instanceof HTMLElement)) {
    return;
  }
  body.replaceChildren();
  if (dashboardState?.doctorsSpecialtyUiEnabled !== true) {
    return;
  }
  const metric = String(dashboardState?.doctorsSpecialtyAnnualMetric || 'count');
  const metricConfig = getSpecialtyAnnualMetricConfig(metric);
  const cards = sortAnnualCards(
    annualModel?.cards || [],
    dashboardState?.doctorsSpecialtyAnnualSort || 'latest_desc'
  );
  cards.forEach((card) => {
    const latestPoint = Array.isArray(card?.points)
      ? [...card.points].reverse().find((point) => Number(point?.count || 0) > 0) || null
      : null;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${card?.alias || '-'}</td>
      <td>${metricConfig.summaryFormat(card, card?.latestValue)}</td>
      <td>${metricConfig.summaryFormat(card, card?.previousValue)}</td>
      <td>${formatSpecialtyAnnualDeltaAbs(metric, card?.yoyDeltaAbs)}</td>
      <td>${Number.isFinite(card?.yoyDeltaPct) ? `${card.yoyDeltaPct >= 0 ? '+' : ''}${oneDecimalFormatter.format(card.yoyDeltaPct)}%` : 'N/A'}</td>
      <td>${numberFormatter.format(Number(latestPoint?.count || 0))}</td>
    `;
    body.appendChild(tr);
  });
}

function buildSpecialtyAnnualExportPreface(dashboardState, metricLabel) {
  const selected = Array.isArray(dashboardState.doctorsSpecialtyAnnualSelected)
    ? dashboardState.doctorsSpecialtyAnnualSelected
    : [];
  return [
    `# Filtrai: ${buildDoctorFilterSummary(dashboardState)}`,
    `# Specialybių metinė dinamika: metrika=${metricLabel}; rikiavimas=${dashboardState.doctorsSpecialtyAnnualSort}; pasirinkta=${selected.join('; ')}`,
  ];
}

function renderSpecialtyAnnualSmallMultiples(
  selectors,
  dashboardState,
  chartLib,
  annualModel,
  exportState,
  handleReportExportClick
) {
  const host = selectors?.gydytojaiSpecialtyAnnualCards;
  const empty = selectors?.gydytojaiSpecialtyAnnualEmpty;
  if (!(host instanceof HTMLElement) || !(empty instanceof HTMLElement)) {
    return;
  }
  if (dashboardState?.doctorsSpecialtyUiEnabled !== true) {
    host.replaceChildren();
    empty.hidden = true;
    destroySpecialtyAnnualCardCharts(dashboardState);
    Object.keys(exportState)
      .filter((key) => key.startsWith('specialty-annual:'))
      .forEach((key) => {
        delete exportState[key];
      });
    return;
  }

  const metric = String(dashboardState?.doctorsSpecialtyAnnualMetric || 'count');
  const metricConfig = getSpecialtyAnnualMetricConfig(metric);
  const cards = sortAnnualCards(
    annualModel?.cards || [],
    dashboardState?.doctorsSpecialtyAnnualSort || 'latest_desc'
  );
  const selected = Array.isArray(dashboardState?.doctorsSpecialtyAnnualSelected)
    ? dashboardState.doctorsSpecialtyAnnualSelected
    : [];
  host.replaceChildren();
  destroySpecialtyAnnualCardCharts(dashboardState);
  Object.keys(exportState)
    .filter((key) => key.startsWith('specialty-annual:'))
    .forEach((key) => {
      delete exportState[key];
    });

  if (!selected.length) {
    empty.hidden = false;
    empty.textContent = 'Pasirinkite bent 1 specialybę metinei dinamikai.';
    return;
  }
  if (!cards.length) {
    empty.hidden = false;
    empty.textContent = 'Nepakanka bent 2 metų duomenų pasirinktoms specialybėms pagal aktyvius filtrus.';
    return;
  }

  empty.hidden = true;
  const refs = dashboardState.doctorsSpecialtyAnnualCardsChartRefs || {};
  dashboardState.doctorsSpecialtyAnnualCardsChartRefs = refs;
  const losPalette = {
    losLt4Share: '#10b981',
    los4to8Share: '#f59e0b',
    los8to16Share: '#f97316',
    losGt16Share: '#ef4444',
  };
  cards.forEach((card, index) => {
    const key = `specialty-annual:${String(card?.specialtyId || card?.doctorKey || index)}`;
    const latestLabel =
      metric === 'losGroups'
        ? metricConfig.summaryFormat(card, card?.latestValue)
        : Number.isFinite(card?.latestValue)
          ? metricConfig.summaryFormat(card, card?.latestValue)
          : 'N/A';
    const wrapper = document.createElement('article');
    wrapper.className = 'report-card gydytojai-annual-card';
    wrapper.innerHTML = `
      <div class="report-card__head">
        <h4>${card?.alias || 'Specialybė'}</h4>
        <div class="report-card__actions">
          <button type="button" class="chart-copy-btn" data-report-export="copy" data-report-key="${key}" data-tooltip="Kopijuoti grafiką" aria-label="Kopijuoti specialybės metinę kortelę" title="Kopijuoti specialybės metinę kortelę"><svg viewBox="0 0 24 24" fill="none" role="img" aria-hidden="true" focusable="false" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"></rect><rect x="4" y="4" width="11" height="11" rx="2"></rect></svg></button>
          <button type="button" class="chart-download-btn" data-report-export="png" data-report-key="${key}" data-tooltip="Parsisiųsti PNG" aria-label="Parsisiųsti specialybės metinę kortelę PNG" title="Parsisiųsti specialybės metinę kortelę PNG"><svg viewBox="0 0 24 24" fill="none" role="img" aria-hidden="true" focusable="false" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"></path><path d="M8 11l4 4 4-4"></path><path d="M4 21h16"></path></svg></button>
        </div>
      </div>
      <p class="gydytojai-annual-card__meta">
        <strong>${latestLabel}</strong>
        <span>${formatSpecialtyAnnualDelta(metric, card)}</span>
        <span>${getTrendSymbol(card?.trend)}</span>
      </p>
      <canvas class="gydytojai-annual-card__chart" height="120"></canvas>
      <p class="report-card__hint">Metai: ${(card?.points || []).map((point) => point.year).join(', ')}</p>
    `;
    host.appendChild(wrapper);

    const canvas = wrapper.querySelector('canvas');
    if (canvas instanceof HTMLCanvasElement) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (metric === 'losGroups') {
          refs[key] = new chartLib(ctx, {
            type: 'bar',
            data: {
              labels: (card.points || []).map((point) => point.year),
              datasets: ['losLt4Share', 'los4to8Share', 'los8to16Share', 'losGt16Share'].map((bucketKey) => ({
                label: getLosBucketLabel(bucketKey),
                data: (card.points || []).map((point) =>
                  Number.isFinite(point?.[bucketKey]) ? Number(point[bucketKey]) * 100 : 0
                ),
                backgroundColor: losPalette[bucketKey],
                borderWidth: 0,
                stack: 'los',
              })),
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: true, position: 'bottom' } },
              scales: {
                x: { stacked: true, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
                y: {
                  stacked: true,
                  min: 0,
                  max: 100,
                  ticks: {
                    maxTicksLimit: 5,
                    callback: (value) => `${value}%`,
                  },
                },
              },
            },
          });
        } else {
          refs[key] = new chartLib(ctx, {
            type: 'line',
            data: {
              labels: (card.points || []).map((point) => point.year),
              datasets: [
                {
                  label: metricConfig.label,
                  data: (card.points || []).map((point) => {
                    const value = point?.[metric];
                    if (!Number.isFinite(value)) {
                      return null;
                    }
                    return metric === 'count' || metric === 'avgLosHours'
                      ? Number(value)
                      : Number(value) * 100;
                  }),
                  borderColor: '#0f766e',
                  backgroundColor: 'rgba(15, 118, 110, 0.14)',
                  fill: true,
                  tension: 0.3,
                  pointRadius: 2,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
                y: {
                  ticks: {
                    maxTicksLimit: 5,
                    callback:
                      metric === 'hospitalizedShare' || metric === 'nightShare'
                        ? (value) => `${value}%`
                        : undefined,
                  },
                },
              },
            },
          });
        }
      }
    }

    exportState[key] = {
      title: `Specialybės metinė dinamika - ${card?.alias || 'Specialybė'}`,
      exportTitle: `Specialybės metinė dinamika - ${card?.alias || 'Specialybė'}`,
      prefaceLines: buildSpecialtyAnnualExportPreface(dashboardState, metricConfig.label),
      headers:
        metric === 'losGroups'
          ? ['Metai', '<4h %', '4-8h %', '8-16h %', '>16h %', 'Imtis (n)']
          : ['Metai', metricConfig.label, 'Imtis (n)'],
      rows:
        metric === 'losGroups'
          ? (card.points || []).map((point) => [
              point.year,
              Number.isFinite(point?.losLt4Share)
                ? `${oneDecimalFormatter.format(point.losLt4Share * 100)}%`
                : 'N/A',
              Number.isFinite(point?.los4to8Share)
                ? `${oneDecimalFormatter.format(point.los4to8Share * 100)}%`
                : 'N/A',
              Number.isFinite(point?.los8to16Share)
                ? `${oneDecimalFormatter.format(point.los8to16Share * 100)}%`
                : 'N/A',
              Number.isFinite(point?.losGt16Share)
                ? `${oneDecimalFormatter.format(point.losGt16Share * 100)}%`
                : 'N/A',
              numberFormatter.format(Number(point?.count || 0)),
            ])
          : (card.points || []).map((point) => {
              const metricValue = point?.[metric];
              const renderedValue = Number.isFinite(metricValue) ? metricConfig.format(metricValue) : 'N/A';
              return [point.year, renderedValue, numberFormatter.format(Number(point?.count || 0))];
            }),
      target: canvas,
    };

    Array.from(wrapper.querySelectorAll('[data-report-export]')).forEach((button) => {
      storeCopyButtonBaseLabel(button);
      button.addEventListener('click', handleReportExportClick);
    });
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

function updateSpecialtySortHeaderState(selectors, tableSort) {
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

function upsertChart(chartMap, slot, chartLib, canvas, config) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return null;
  }
  const existing = chartMap[slot];
  if (existing && typeof existing.destroy === 'function') {
    existing.destroy();
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  chartMap[slot] = new chartLib(ctx, config);
  return chartMap[slot];
}

function sortLosRowsByVisibleGroups(rows, visibleKeys) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  const keys = Array.isArray(visibleKeys) && visibleKeys.length ? visibleKeys : ['losGt16Share'];
  return list.sort((a, b) => {
    const scoreA = keys.reduce((sum, key) => sum + Number(a?.[key] || 0), 0);
    const scoreB = keys.reduce((sum, key) => sum + Number(b?.[key] || 0), 0);
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    return Number(b?.losGt16Share || 0) - Number(a?.losGt16Share || 0);
  });
}

function applyLosChartDynamicSort(chart, sourceRows) {
  if (!chart || !Array.isArray(sourceRows) || !sourceRows.length) {
    return;
  }
  const datasets = Array.isArray(chart.data?.datasets) ? chart.data.datasets : [];
  const visibleKeys = datasets
    .map((dataset, index) =>
      typeof chart.isDatasetVisible === 'function' && chart.isDatasetVisible(index)
        ? String(dataset?.losKey || '').trim()
        : ''
    )
    .filter(Boolean);
  const sortedRows = sortLosRowsByVisibleGroups(sourceRows, visibleKeys);
  chart.data.labels = sortedRows.map((row) => row.alias);
  datasets.forEach((dataset) => {
    const key = String(dataset?.losKey || '').trim();
    if (!key) {
      return;
    }
    dataset.data = sortedRows.map((row) => Number(row?.[key] || 0) * 100);
  });
}

function renderCharts(dashboardState, chartLib, selectors, models) {
  const rows = models?.leaderboard?.rows || [];
  const labels = rows.map((row) => row.alias);
  const losSortedRows = [...rows].sort((a, b) => {
    const aValue = Number(a?.losGt16Share || 0);
    const bValue = Number(b?.losGt16Share || 0);
    if (aValue !== bValue) {
      return bValue - aValue;
    }
    return Number(b?.los8to16Share || 0) - Number(a?.los8to16Share || 0);
  });
  const hospitalSortedRows = [...rows].sort(
    (a, b) => (b.hospitalizedShare || 0) - (a.hospitalizedShare || 0)
  );
  const mixSortedRows = [...rows].sort((a, b) => (b.nightShare || 0) - (a.nightShare || 0));
  upsertChart(dashboardState.doctorsCharts, 'volume', chartLib, selectors.gydytojaiVolumeChart, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Atvejai', data: rows.map((row) => row.count), backgroundColor: '#2563eb' }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });

  const losChart = upsertChart(dashboardState.doctorsCharts, 'los', chartLib, selectors.gydytojaiLosChart, {
    type: 'bar',
    data: {
      labels: losSortedRows.map((row) => row.alias),
      datasets: [
        {
          label: '<4 val.',
          losKey: 'losLt4Share',
          data: losSortedRows.map((row) => row.losLt4Share * 100),
          backgroundColor: '#16a34a',
        },
        {
          label: '4-8 val.',
          losKey: 'los4to8Share',
          data: losSortedRows.map((row) => row.los4to8Share * 100),
          backgroundColor: '#0ea5e9',
        },
        {
          label: '8-16 val.',
          losKey: 'los8to16Share',
          data: losSortedRows.map((row) => row.los8to16Share * 100),
          backgroundColor: '#f59e0b',
        },
        {
          label: '>16 val.',
          losKey: 'losGt16Share',
          data: losSortedRows.map((row) => row.losGt16Share * 100),
          backgroundColor: '#ef4444',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          onClick: (event, legendItem, legend) => {
            const defaultClick = chartLib?.defaults?.plugins?.legend?.onClick;
            if (typeof defaultClick === 'function') {
              defaultClick(event, legendItem, legend);
            }
            const legendChart = legend?.chart;
            if (!legendChart) {
              return;
            }
            applyLosChartDynamicSort(legendChart, rows);
            legendChart.update();
          },
        },
      },
      scales: { x: { stacked: true }, y: { stacked: true, max: 100 } },
    },
  });
  applyLosChartDynamicSort(losChart, rows);

  upsertChart(dashboardState.doctorsCharts, 'hospital', chartLib, selectors.gydytojaiHospitalChart, {
    type: 'bar',
    data: {
      labels: hospitalSortedRows.map((row) => row.alias),
      datasets: [
        {
          label: 'Hospitalizacija %',
          data: hospitalSortedRows.map((row) => row.hospitalizedShare * 100),
          backgroundColor: '#ef4444',
        },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });

  const mixRows = mixSortedRows;
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

function wireInteractions(selectors, dashboardState, rerender, handleReportExportClick) {
  const applySearchWithDebounce = createDebouncedHandler(() => {
    dashboardState.doctorsSearchDebounced = String(dashboardState.doctorsSearch || '').trim();
    rerender();
  }, 250);

  selectors.gydytojaiFilterChips?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const yearChip = target.closest('[data-gydytojai-year]');
    if (yearChip instanceof HTMLElement) {
      dashboardState.doctorsYear = String(yearChip.getAttribute('data-gydytojai-year') || 'all');
      rerender();
      return;
    }
    const topNChip = target.closest('[data-gydytojai-topn]');
    if (topNChip instanceof HTMLElement) {
      dashboardState.doctorsTopN = parsePositiveInt(topNChip.getAttribute('data-gydytojai-topn'), 15);
      rerender();
      return;
    }
    const minCasesChip = target.closest('[data-gydytojai-mincases]');
    if (minCasesChip instanceof HTMLElement) {
      dashboardState.doctorsMinCases = parsePositiveInt(
        minCasesChip.getAttribute('data-gydytojai-mincases'),
        30
      );
      rerender();
      return;
    }
    const sortChip = target.closest('[data-gydytojai-sortby]');
    if (sortChip instanceof HTMLElement) {
      dashboardState.doctorsSort = String(sortChip.getAttribute('data-gydytojai-sortby') || 'volume_desc');
      rerender();
      return;
    }
    const arrivalChip = target.closest('[data-gydytojai-arrival]');
    if (arrivalChip instanceof HTMLElement) {
      dashboardState.doctorsArrivalFilter = String(
        arrivalChip.getAttribute('data-gydytojai-arrival') || 'all'
      );
      rerender();
      return;
    }
    const dispositionChip = target.closest('[data-gydytojai-disposition]');
    if (dispositionChip instanceof HTMLElement) {
      dashboardState.doctorsDispositionFilter = String(
        dispositionChip.getAttribute('data-gydytojai-disposition') || 'all'
      );
      rerender();
      return;
    }
    const shiftChip = target.closest('[data-gydytojai-shift]');
    if (shiftChip instanceof HTMLElement) {
      dashboardState.doctorsShiftFilter = String(shiftChip.getAttribute('data-gydytojai-shift') || 'all');
      rerender();
      return;
    }
    const specialtyChip = target.closest('[data-gydytojai-specialty]');
    if (specialtyChip instanceof HTMLElement) {
      dashboardState.doctorsSpecialtyFilter = String(
        specialtyChip.getAttribute('data-gydytojai-specialty') || 'all'
      );
      rerender();
    }
  });
  selectors.gydytojaiSearch?.addEventListener('input', (event) => {
    dashboardState.doctorsSearch = String(event.target.value || '').trim();
    applySearchWithDebounce();
  });
  selectors.gydytojaiSearch?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    applySearchWithDebounce.cancel?.();
    dashboardState.doctorsSearch = String(selectors.gydytojaiSearch?.value || '').trim();
    dashboardState.doctorsSearchDebounced = dashboardState.doctorsSearch;
    rerender();
  });
  selectors.gydytojaiAnnualMetric?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest('[data-gydytojai-annual-metric]');
    if (!(button instanceof HTMLElement)) {
      return;
    }
    dashboardState.doctorsAnnualMetric = normalizeAnnualMetric(
      button.getAttribute('data-gydytojai-annual-metric'),
      'count'
    );
    rerender();
  });
  selectors.gydytojaiAnnualSort?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest('[data-gydytojai-annual-sort]');
    if (!(button instanceof HTMLElement)) {
      return;
    }
    dashboardState.doctorsAnnualSort = normalizeAnnualSort(
      button.getAttribute('data-gydytojai-annual-sort'),
      'latest_desc'
    );
    rerender();
  });
  const refreshAnnualSuggestions = () => renderAnnualDoctorSuggestions(selectors, dashboardState);
  selectors.gydytojaiAnnualDoctorInput?.addEventListener('input', (event) => {
    dashboardState.doctorsAnnualSearchInput = String(event.target.value || '');
    dashboardState.doctorsAnnualSuggestIndex = 0;
    refreshAnnualSuggestions();
  });
  selectors.gydytojaiAnnualDoctorInput?.addEventListener('focus', () => {
    refreshAnnualSuggestions();
  });
  selectors.gydytojaiAnnualDoctorInput?.addEventListener('blur', () => {
    window.setTimeout(() => {
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        selectors.gydytojaiAnnualSuggestions instanceof HTMLElement &&
        selectors.gydytojaiAnnualSuggestions.contains(active)
      ) {
        return;
      }
      if (selectors.gydytojaiAnnualSuggestions instanceof HTMLElement) {
        selectors.gydytojaiAnnualSuggestions.replaceChildren();
        selectors.gydytojaiAnnualSuggestions.hidden = true;
      }
      dashboardState.doctorsAnnualSuggestIndex = -1;
    }, 100);
  });
  selectors.gydytojaiAnnualSuggestions?.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  const addAnnualDoctor = (overrideAlias = '') => {
    const alias =
      String(overrideAlias || '').trim() ||
      resolveAnnualDoctorAlias(
        dashboardState.doctorsAnnualSearchInput || selectors.gydytojaiAnnualDoctorInput?.value,
        dashboardState.doctorsAnnualAvailable
      );
    if (!alias) {
      if (selectors.gydytojaiAnnualSelectionHelp) {
        selectors.gydytojaiAnnualSelectionHelp.textContent = 'Nerasta gydytojo pagal įvestį.';
      }
      refreshAnnualSuggestions();
      return;
    }
    const selected = Array.isArray(dashboardState.doctorsAnnualSelected)
      ? dashboardState.doctorsAnnualSelected.slice()
      : [];
    if (selected.some((entry) => normalizeDoctorAliasToken(entry) === normalizeDoctorAliasToken(alias))) {
      return;
    }
    if (selected.length >= 12) {
      if (selectors.gydytojaiAnnualSelectionHelp) {
        selectors.gydytojaiAnnualSelectionHelp.textContent = 'Pasiektas maksimalus 12 gydytojų limitas.';
      }
      return;
    }
    selected.push(alias);
    dashboardState.doctorsAnnualSelected = selected;
    dashboardState.doctorsAnnualSearchInput = '';
    dashboardState.doctorsAnnualSuggestIndex = -1;
    if (selectors.gydytojaiAnnualDoctorInput) {
      selectors.gydytojaiAnnualDoctorInput.value = '';
    }
    refreshAnnualSuggestions();
    rerender();
  };
  selectors.gydytojaiAnnualAddDoctor?.addEventListener('click', () => addAnnualDoctor());
  selectors.gydytojaiAnnualDoctorInput?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const suggestions = refreshAnnualSuggestions();
      if (!suggestions.length) {
        return;
      }
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const current = Number.isFinite(dashboardState.doctorsAnnualSuggestIndex)
        ? Number(dashboardState.doctorsAnnualSuggestIndex)
        : 0;
      dashboardState.doctorsAnnualSuggestIndex = (current + delta + suggestions.length) % suggestions.length;
      refreshAnnualSuggestions();
      return;
    }
    if (event.key === 'Escape') {
      if (selectors.gydytojaiAnnualSuggestions instanceof HTMLElement) {
        selectors.gydytojaiAnnualSuggestions.replaceChildren();
        selectors.gydytojaiAnnualSuggestions.hidden = true;
      }
      dashboardState.doctorsAnnualSuggestIndex = -1;
      return;
    }
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    const suggestions = refreshAnnualSuggestions();
    const index = Number.isFinite(dashboardState.doctorsAnnualSuggestIndex)
      ? Number(dashboardState.doctorsAnnualSuggestIndex)
      : -1;
    const picked = index >= 0 && index < suggestions.length ? suggestions[index].alias : '';
    addAnnualDoctor(picked);
  });
  selectors.gydytojaiAnnualSuggestions?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const option = target.closest('[data-annual-suggest]');
    if (!(option instanceof HTMLElement)) {
      return;
    }
    const alias = String(option.getAttribute('data-annual-suggest') || '').trim();
    if (!alias) {
      return;
    }
    addAnnualDoctor(alias);
  });
  selectors.gydytojaiAnnualClearDoctors?.addEventListener('click', () => {
    dashboardState.doctorsAnnualSelected = [];
    dashboardState.doctorsAnnualSearchInput = '';
    dashboardState.doctorsAnnualSuggestIndex = -1;
    if (selectors.gydytojaiAnnualDoctorInput) {
      selectors.gydytojaiAnnualDoctorInput.value = '';
    }
    refreshAnnualSuggestions();
    rerender();
  });
  selectors.gydytojaiAnnualSelected?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const chip = target.closest('[data-annual-remove]');
    if (!(chip instanceof HTMLElement)) {
      return;
    }
    const alias = String(chip.getAttribute('data-annual-remove') || '').trim();
    if (!alias) {
      return;
    }
    dashboardState.doctorsAnnualSelected = (dashboardState.doctorsAnnualSelected || []).filter(
      (entry) => normalizeDoctorAliasToken(entry) !== normalizeDoctorAliasToken(alias)
    );
    rerender();
  });
  selectors.gydytojaiSpecialtyAnnualMetric?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest('[data-gydytojai-specialty-annual-metric]');
    if (!(button instanceof HTMLElement)) {
      return;
    }
    dashboardState.doctorsSpecialtyAnnualMetric = normalizeSpecialtyAnnualMetric(
      button.getAttribute('data-gydytojai-specialty-annual-metric'),
      'count'
    );
    rerender();
  });
  selectors.gydytojaiSpecialtyAnnualSort?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest('[data-gydytojai-specialty-annual-sort]');
    if (!(button instanceof HTMLElement)) {
      return;
    }
    dashboardState.doctorsSpecialtyAnnualSort = normalizeAnnualSort(
      button.getAttribute('data-gydytojai-specialty-annual-sort'),
      'latest_desc'
    );
    rerender();
  });
  selectors.gydytojaiSpecialtyAnnualSelected?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const chip = target.closest('[data-gydytojai-specialty-annual-select]');
    if (!(chip instanceof HTMLElement)) {
      return;
    }
    const specialtyId = String(chip.getAttribute('data-gydytojai-specialty-annual-select') || '').trim();
    if (!specialtyId) {
      return;
    }
    const selected = Array.isArray(dashboardState.doctorsSpecialtyAnnualSelected)
      ? dashboardState.doctorsSpecialtyAnnualSelected.slice()
      : [];
    const token = normalizeSpecialtyToken(specialtyId);
    const existingIndex = selected.findIndex((value) => normalizeSpecialtyToken(value) === token);
    if (existingIndex >= 0) {
      selected.splice(existingIndex, 1);
    } else {
      if (selected.length >= 12) {
        return;
      }
      selected.push(specialtyId);
    }
    dashboardState.doctorsSpecialtyAnnualSelected = selected;
    rerender();
  });
  selectors.gydytojaiSpecialtyAnnualClear?.addEventListener('click', () => {
    dashboardState.doctorsSpecialtyAnnualSelected = [];
    rerender();
  });
  selectors.gydytojaiActiveFilters?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest('[data-filter-remove]');
    if (!(button instanceof HTMLElement)) {
      return;
    }
    const key = String(button.getAttribute('data-filter-remove') || '').trim();
    if (key === 'year') {
      dashboardState.doctorsYear = 'all';
    } else if (key === 'topN') {
      dashboardState.doctorsTopN = 15;
    } else if (key === 'minCases') {
      dashboardState.doctorsMinCases = 30;
    } else if (key === 'sort') {
      dashboardState.doctorsSort = 'volume_desc';
    } else if (key === 'arrival') {
      dashboardState.doctorsArrivalFilter = 'all';
    } else if (key === 'disposition') {
      dashboardState.doctorsDispositionFilter = 'all';
    } else if (key === 'shift') {
      dashboardState.doctorsShiftFilter = 'all';
    } else if (key === 'specialty') {
      dashboardState.doctorsSpecialtyFilter = 'all';
    } else if (key === 'search') {
      dashboardState.doctorsSearch = '';
      dashboardState.doctorsSearchDebounced = '';
      applySearchWithDebounce.cancel?.();
      if (selectors.gydytojaiSearch instanceof HTMLInputElement) {
        selectors.gydytojaiSearch.value = '';
      }
    }
    rerender();
  });
  selectors.gydytojaiChartDoctorToggles?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest('[data-chart-doctor-toggle]');
    if (!(button instanceof HTMLElement)) {
      return;
    }
    const alias = String(button.getAttribute('data-chart-doctor-toggle') || '').trim();
    if (!alias) {
      return;
    }
    const hidden = Array.isArray(dashboardState.doctorsChartsHiddenAliases)
      ? dashboardState.doctorsChartsHiddenAliases.slice()
      : [];
    const normalized = normalizeDoctorAliasToken(alias);
    const index = hidden.findIndex((entry) => normalizeDoctorAliasToken(entry) === normalized);
    if (index >= 0) {
      hidden.splice(index, 1);
    } else {
      hidden.push(alias);
    }
    dashboardState.doctorsChartsHiddenAliases = hidden;
    rerender();
  });
  selectors.gydytojaiChartDoctorsReset?.addEventListener('click', () => {
    dashboardState.doctorsChartsHiddenAliases = [];
    rerender();
  });
  selectors.gydytojaiResetFilters?.addEventListener('click', () => {
    dashboardState.doctorsYear = 'all';
    dashboardState.doctorsTopN = 15;
    dashboardState.doctorsMinCases = 30;
    dashboardState.doctorsSort = 'volume_desc';
    dashboardState.doctorsArrivalFilter = 'all';
    dashboardState.doctorsDispositionFilter = 'all';
    dashboardState.doctorsShiftFilter = 'all';
    dashboardState.doctorsSpecialtyFilter = 'all';
    dashboardState.doctorsSearch = '';
    dashboardState.doctorsSearchDebounced = '';
    applySearchWithDebounce.cancel?.();
    dashboardState.doctorsTableSort = 'count_desc';
    dashboardState.doctorsSpecialtyTableSort = 'count_desc';
    dashboardState.doctorsChartsHiddenAliases = [];
    dashboardState.doctorsAnnualMetric = 'count';
    dashboardState.doctorsAnnualSort = 'latest_desc';
    dashboardState.doctorsAnnualSelected = [];
    dashboardState.doctorsAnnualSearchInput = '';
    dashboardState.doctorsAnnualSuggestIndex = -1;
    dashboardState.doctorsSpecialtyAnnualMetric = 'count';
    dashboardState.doctorsSpecialtyAnnualSort = 'latest_desc';
    dashboardState.doctorsSpecialtyAnnualSelected = [];
    rerender();
  });

  if (Array.isArray(selectors.reportExportButtons)) {
    selectors.reportExportButtons.forEach((button) => {
      storeCopyButtonBaseLabel(button);
      button.addEventListener('click', handleReportExportClick);
    });
  }

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

  const specialtyTable = selectors.gydytojaiSpecialtyTable;
  if (specialtyTable instanceof HTMLTableElement) {
    specialtyTable.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const header = target.closest('th[data-gydytojai-specialty-sort]');
      if (!(header instanceof HTMLElement)) {
        return;
      }
      const key = String(header.getAttribute('data-gydytojai-specialty-sort') || '').trim();
      if (!key) {
        return;
      }
      const [currentKey, currentDirection] = String(
        dashboardState.doctorsSpecialtyTableSort || 'count_desc'
      ).split('_');
      const nextDirection = currentKey === key && currentDirection === 'desc' ? 'asc' : 'desc';
      dashboardState.doctorsSpecialtyTableSort = `${key}_${nextDirection}`;
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
  dashboardState.doctorsArrivalFilter = fromQuery.arrival;
  dashboardState.doctorsDispositionFilter = fromQuery.disposition;
  dashboardState.doctorsShiftFilter = fromQuery.shift;
  dashboardState.doctorsSpecialtyFilter = fromQuery.specialty;
  dashboardState.doctorsSearch = fromQuery.search;
  dashboardState.doctorsSearchDebounced = fromQuery.search;
  dashboardState.doctorsTableSort = fromQuery.tableSort;
  dashboardState.doctorsAnnualMetric = fromQuery.annualMetric;
  dashboardState.doctorsAnnualSort = fromQuery.annualSort;
  dashboardState.doctorsAnnualSelected = Array.isArray(fromQuery.annualDoctors)
    ? fromQuery.annualDoctors
    : [];
  dashboardState.doctorsSpecialtyAnnualMetric = fromQuery.specialtyAnnualMetric;
  dashboardState.doctorsSpecialtyAnnualSort = fromQuery.specialtyAnnualSort;
  dashboardState.doctorsSpecialtyAnnualSelected = Array.isArray(fromQuery.specialtyAnnualSelected)
    ? fromQuery.specialtyAnnualSelected
    : [];
  const exportState = dashboardState.doctorsExportState || {};
  dashboardState.doctorsExportState = exportState;
  const handleReportExportClick = createReportExportClickHandler({
    exportState,
    getDatasetValue,
    setCopyButtonFeedback,
    writeTextToClipboard,
    formatExportFilename,
    escapeCsvCell,
  });

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
  let initialLoadPending = true;
  let loadingStartedAt = 0;
  const minLoadingVisibleMs = 250;
  const render = async () => {
    if (
      initialLoadPending &&
      (!Array.isArray(dashboardState.rawRecords) || dashboardState.rawRecords.length === 0)
    ) {
      return;
    }
    syncDoctorPageQueryFromState(dashboardState);
    const records = extractHistoricalRecords(dashboardState);
    const options = {
      yearFilter: dashboardState.doctorsYear,
      topN: dashboardState.doctorsTopN,
      minCases: dashboardState.doctorsMinCases,
      sortBy: dashboardState.doctorsSort,
      calculations: settings?.calculations,
      defaultSettings: DEFAULT_SETTINGS,
      arrivalFilter: dashboardState.doctorsArrivalFilter,
      dispositionFilter: dashboardState.doctorsDispositionFilter,
      shiftFilter: dashboardState.doctorsShiftFilter,
      specialtyFilter: dashboardState.doctorsSpecialtyFilter,
      searchQuery: dashboardState.doctorsSearchDebounced,
    };
    const specialtyModel = createDoctorSpecialtyResolver(settings, records);
    dashboardState.doctorsSpecialtyValidation = specialtyModel.validation;
    dashboardState.doctorsSpecialtyUiEnabled = Boolean(
      specialtyModel.validation?.enabled && specialtyModel.validation?.valid
    );
    const allowedSpecialtyIds = new Set([
      'all',
      ...(Array.isArray(specialtyModel.validation?.groups)
        ? specialtyModel.validation.groups.map((group) => String(group?.id || '').trim()).filter(Boolean)
        : []),
    ]);
    if (!allowedSpecialtyIds.has(String(dashboardState.doctorsSpecialtyFilter || 'all'))) {
      dashboardState.doctorsSpecialtyFilter = 'all';
    }
    const specialtyFilterApplied = dashboardState.doctorsSpecialtyUiEnabled
      ? dashboardState.doctorsSpecialtyFilter
      : 'all';
    const excludeUnmappedFromStats =
      dashboardState.doctorsSpecialtyUiEnabled &&
      specialtyModel.validation?.excludeUnmappedFromStats === true;
    const statsComputeContext = createStatsComputeContext();
    const sharedOptions = {
      ...options,
      specialtyFilter: specialtyFilterApplied,
      requireMappedSpecialty: excludeUnmappedFromStats,
      doctorSpecialtyResolver: specialtyModel.resolver,
      computeContext: statsComputeContext,
    };
    const specialtyLeaderboard = dashboardState.doctorsSpecialtyUiEnabled
      ? computeDoctorSpecialtyLeaderboard(records, {
          ...sharedOptions,
          specialtyFilter: 'all',
        })
      : null;

    const leaderboard = computeDoctorLeaderboard(records, sharedOptions);
    const mix = computeDoctorDayNightMix(records, sharedOptions);
    const hospital = computeDoctorHospitalizationShare(records, sharedOptions);
    const scatter = computeDoctorVolumeVsLosScatter(records, sharedOptions);
    const annual = computeDoctorYearlySmallMultiples(records, {
      ...sharedOptions,
      yearScope: 'all_years',
      yearFilter: 'all',
      metric: dashboardState.doctorsAnnualMetric,
      topN: Math.max(
        1,
        Array.isArray(dashboardState.doctorsAnnualSelected) ? dashboardState.doctorsAnnualSelected.length : 1
      ),
      minYearCount: dashboardState.doctorsAnnualMinYearCount,
      selectedDoctors: dashboardState.doctorsAnnualSelected,
    });
    dashboardState.doctorsAnnualAvailable = Array.isArray(annual?.meta?.availableDoctors)
      ? annual.meta.availableDoctors
      : [];
    const specialtyAnnualMetric = normalizeSpecialtyAnnualMetric(
      dashboardState.doctorsSpecialtyAnnualMetric,
      'count'
    );
    dashboardState.doctorsSpecialtyAnnualMetric = specialtyAnnualMetric;
    const specialtyAnnualModel =
      dashboardState.doctorsSpecialtyUiEnabled === true
        ? specialtyAnnualMetric === 'losGroups'
          ? computeDoctorSpecialtyYearlyComposition(records, {
              ...sharedOptions,
              yearScope: 'all_years',
              yearFilter: 'all',
              topN: dashboardState.doctorsSpecialtyAnnualTopN,
              minYearCount: dashboardState.doctorsSpecialtyAnnualMinYearCount,
              selectedSpecialties: dashboardState.doctorsSpecialtyAnnualSelected,
            })
          : computeDoctorSpecialtyYearlySmallMultiples(records, {
              ...sharedOptions,
              yearScope: 'all_years',
              yearFilter: 'all',
              metric: specialtyAnnualMetric,
              topN: dashboardState.doctorsSpecialtyAnnualTopN,
              minYearCount: dashboardState.doctorsSpecialtyAnnualMinYearCount,
              selectedSpecialties: dashboardState.doctorsSpecialtyAnnualSelected,
            })
        : null;
    syncSpecialtyAnnualSelection(
      dashboardState,
      Array.isArray(specialtyAnnualModel?.meta?.availableSpecialties)
        ? specialtyAnnualModel.meta.availableSpecialties
        : []
    );
    applyDoctorControls(selectors, dashboardState, leaderboard.yearOptions);
    applyDoctorSpecialtyControls(
      selectors,
      dashboardState,
      dashboardState.doctorsSpecialtyValidation,
      dashboardState.doctorsSpecialtyValidation?.groups
    );
    renderDoctorSpecialtyValidation(selectors, dashboardState);
    renderActiveDoctorFilters(selectors, dashboardState);
    renderSpecialtyComparisonTable(selectors, specialtyLeaderboard, dashboardState);
    renderSpecialtyAnnualControls(selectors, dashboardState, specialtyAnnualModel);
    renderSpecialtyAnnualSummary(selectors, dashboardState, specialtyAnnualModel);
    renderDoctorChartToggles(selectors, dashboardState, leaderboard.rows);
    const visibleLeaderboardRows = getVisibleDoctorRowsForCharts(
      leaderboard.rows,
      dashboardState.doctorsChartsHiddenAliases
    );
    const visibleAliases = new Set(
      visibleLeaderboardRows.map((row) => normalizeDoctorAliasToken(row?.alias))
    );
    const chartModels = {
      leaderboard: { ...leaderboard, rows: visibleLeaderboardRows },
      mix: {
        ...mix,
        rows: (mix.rows || []).filter((row) => visibleAliases.has(normalizeDoctorAliasToken(row?.alias))),
      },
      hospital: {
        ...hospital,
        rows: (hospital.rows || []).filter((row) =>
          visibleAliases.has(normalizeDoctorAliasToken(row?.alias))
        ),
      },
      scatter: {
        ...scatter,
        rows: (scatter.rows || []).filter((row) => visibleAliases.has(normalizeDoctorAliasToken(row?.alias))),
      },
    };
    setCoverage(selectors, leaderboard);
    renderLeaderboardTable(selectors, leaderboard.rows, dashboardState.doctorsTableSort);
    updateSortHeaderState(selectors, dashboardState.doctorsTableSort);
    setDoctorExportState(exportState, selectors, dashboardState, chartModels);

    chartLib = chartLib || (await loadChartJs());
    if (!chartLib) {
      return;
    }
    renderCharts(dashboardState, chartLib, selectors, chartModels);
    renderAnnualSelectedChips(selectors, dashboardState, annual);
    renderAnnualDoctorSuggestions(selectors, dashboardState);
    renderDoctorAnnualSmallMultiples(
      selectors,
      dashboardState,
      chartLib,
      annual,
      exportState,
      handleReportExportClick
    );
    renderSpecialtyAnnualSmallMultiples(
      selectors,
      dashboardState,
      chartLib,
      specialtyAnnualModel,
      exportState,
      handleReportExportClick
    );
  };

  let renderToken = 0;
  const rerender = () => {
    renderToken += 1;
    const token = renderToken;
    loadingStartedAt = Date.now();
    setLoadingVisualState(selectors, true);
    const schedule =
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 0);
    schedule(() => {
      render()
        .catch((error) => {
          console.error('Nepavyko perskaičiuoti gydytojų rodiklių:', error);
        })
        .finally(() => {
          if (token === renderToken && !initialLoadPending) {
            const elapsed = Date.now() - loadingStartedAt;
            const waitMs = Math.max(0, minLoadingVisibleMs - elapsed);
            window.setTimeout(() => {
              if (token === renderToken && !initialLoadPending) {
                setLoadingVisualState(selectors, false);
              }
            }, waitMs);
          }
        });
    });
  };

  wireInteractions(selectors, dashboardState, rerender, handleReportExportClick);

  try {
    void loadChartJs();
    setStatus(selectors, 'loading');
    setLoadingVisualState(selectors, true);
    const data = await fetchData({ skipHistorical: false });
    dashboardState.rawRecords = Array.isArray(data?.records) ? data.records : [];
    await render();
    initialLoadPending = false;
    dashboardState.hasLoadedOnce = true;
    setLoadingVisualState(selectors, false);
    setStatus(selectors, 'ready');
  } catch (error) {
    console.error('Nepavyko įkelti gydytojų puslapio:', error);
    initialLoadPending = false;
    setLoadingVisualState(selectors, false);
    setStatus(selectors, 'error', error?.message || TEXT.status.error);
  }
}
