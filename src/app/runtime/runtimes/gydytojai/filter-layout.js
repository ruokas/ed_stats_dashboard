import { numberFormatter } from '../../../../utils/format.js';
import {
  DEFAULT_GYDYTOJAI_SECTION_EXPANDED,
  GYDYTOJAI_SECTION_KEYS,
  normalizeGydytojaiAnnualSubview,
} from './query-state.js';
import { normalizeDoctorAliasToken } from './annual-render.js';

function getAdvancedFilterOverrideCount(dashboardState) {
  let count = 0;
  if (Number(dashboardState?.doctorsTopN || 15) !== 15) {
    count += 1;
  }
  if (Number(dashboardState?.doctorsMinCases || 30) !== 30) {
    count += 1;
  }
  if (String(dashboardState?.doctorsSort || 'volume_desc') !== 'volume_desc') {
    count += 1;
  }
  return count;
}

export function ensureGydytojaiSectionExpandedState(dashboardState) {
  const current = dashboardState?.gydytojaiSectionExpanded || {};
  dashboardState.gydytojaiSectionExpanded = {
    ...DEFAULT_GYDYTOJAI_SECTION_EXPANDED,
    ...Object.fromEntries(GYDYTOJAI_SECTION_KEYS.map((key) => [key, current?.[key] === true])),
  };
  return dashboardState.gydytojaiSectionExpanded;
}

export function setGydytojaiSectionExpanded(dashboardState, key, expanded) {
  if (!GYDYTOJAI_SECTION_KEYS.includes(String(key || ''))) {
    return;
  }
  const state = ensureGydytojaiSectionExpandedState(dashboardState);
  state[key] = expanded === true;
}

export function isGydytojaiSectionExpanded(dashboardState, key) {
  if (!GYDYTOJAI_SECTION_KEYS.includes(String(key || ''))) {
    return false;
  }
  return dashboardState?.gydytojaiSectionExpanded?.[key] === true;
}

export function renderGydytojaiSectionSummaries(selectors, dashboardState, models) {
  if (selectors?.gydytojaiSpecialtySectionSummary instanceof HTMLElement) {
    if (dashboardState?.doctorsSpecialtyUiEnabled !== true) {
      selectors.gydytojaiSpecialtySectionSummary.textContent = 'Išjungta';
    } else {
      const rows = Array.isArray(models?.specialtyLeaderboard?.rows) ? models.specialtyLeaderboard.rows : [];
      const totalCases = rows.reduce((sum, row) => sum + Number(row?.count || 0), 0);
      if (!rows.length) {
        selectors.gydytojaiSpecialtySectionSummary.textContent = 'Nepakanka duomenų';
      } else {
        selectors.gydytojaiSpecialtySectionSummary.textContent = `${rows.length} specialybės, n=${numberFormatter.format(totalCases)}`;
      }
    }
  }
}

export function buildDoctorFilterSummary(dashboardState) {
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

export function renderDoctorSpecialtyValidation(selectors, dashboardState) {
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

export function renderActiveDoctorFilters(selectors, dashboardState) {
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

export function renderActiveDoctorFiltersSummary(selectors, dashboardState) {
  const host = selectors?.gydytojaiActiveFiltersSummary;
  if (!(host instanceof HTMLElement)) {
    return;
  }
  const chips = getActiveDoctorFilterChips(dashboardState);
  if (!chips.length) {
    host.textContent = 'Naudojami numatytieji filtrai.';
    return;
  }
  const labels = chips.map((chip) => String(chip?.label || '')).filter(Boolean);
  const preview = labels.slice(0, 3).join(', ');
  if (labels.length <= 3) {
    host.textContent = `Aktyvūs filtrai: ${labels.length} (${preview})`;
    return;
  }
  host.textContent = `Aktyvūs filtrai: ${labels.length} (${preview}, + dar ${labels.length - 3})`;
}

function renderAdvancedFiltersSummary(selectors, dashboardState) {
  const host = selectors?.gydytojaiFiltersAdvancedSummary;
  if (!(host instanceof HTMLElement)) {
    return;
  }
  const count = getAdvancedFilterOverrideCount(dashboardState);
  if (dashboardState?.gydytojaiFiltersAdvancedExpanded === true) {
    host.textContent = '';
    return;
  }
  if (!count) {
    host.textContent = 'Numatytieji nustatymai';
    return;
  }
  const sortMap = {
    volume_desc: 'Apkrova',
    avgLos_asc: 'Vid. trukmė ↑',
    avgLos_desc: 'Vid. trukmė ↓',
    hospital_desc: 'Hospitalizacija ↓',
  };
  const sortLabel =
    sortMap[String(dashboardState?.doctorsSort || 'volume_desc')] ||
    String(dashboardState?.doctorsSort || 'volume_desc');
  host.textContent = `TOP N: ${dashboardState?.doctorsTopN ?? 15} | Min. imtis: ${dashboardState?.doctorsMinCases ?? 30} | Rikiavimas: ${sortLabel}`;
}

export function applyActiveFiltersDisclosure(selectors, dashboardState) {
  const panel = selectors?.gydytojaiActiveFiltersPanel;
  const toggle = selectors?.gydytojaiActiveFiltersToggle;
  const hasActive = getActiveDoctorFilterChips(dashboardState).length > 0;
  const expanded = hasActive && dashboardState?.gydytojaiActiveFiltersExpanded === true;
  if (panel instanceof HTMLElement) {
    panel.hidden = !expanded;
  }
  if (toggle instanceof HTMLElement) {
    toggle.hidden = !hasActive;
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.textContent = expanded ? 'Slėpti aktyvių filtrų detales' : 'Rodyti aktyvių filtrų detales';
  }
}

export function applyGydytojaiLayoutControls(selectors, dashboardState) {
  ensureGydytojaiSectionExpandedState(dashboardState);
  if (selectors?.gydytojaiFiltersAdvancedPanel instanceof HTMLElement) {
    const expanded = dashboardState?.gydytojaiFiltersAdvancedExpanded === true;
    selectors.gydytojaiFiltersAdvancedPanel.hidden = !expanded;
    selectors.gydytojaiFiltersAdvancedToggle?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    const count = getAdvancedFilterOverrideCount(dashboardState);
    if (selectors?.gydytojaiFiltersAdvancedToggle instanceof HTMLElement) {
      selectors.gydytojaiFiltersAdvancedToggle.textContent = expanded
        ? 'Slėpti išplėstinius filtrus'
        : count > 0
          ? `Išplėstiniai filtrai (${count})`
          : 'Išplėstiniai filtrai';
    }
  }
  renderAdvancedFiltersSummary(selectors, dashboardState);
  applyActiveFiltersDisclosure(selectors, dashboardState);

  (Array.isArray(selectors?.gydytojaiSectionPanels) ? selectors.gydytojaiSectionPanels : []).forEach(
    (panel) => {
      if (!(panel instanceof HTMLElement)) {
        return;
      }
      const key = String(panel.getAttribute('data-gydytojai-section-panel') || '').trim();
      if (!GYDYTOJAI_SECTION_KEYS.includes(key)) {
        return;
      }
      const expanded = dashboardState?.gydytojaiSectionExpanded?.[key] === true;
      panel.hidden = !expanded;
    }
  );

  (Array.isArray(selectors?.gydytojaiSectionToggleButtons)
    ? selectors.gydytojaiSectionToggleButtons
    : []
  ).forEach((button) => {
    if (!(button instanceof HTMLElement)) {
      return;
    }
    const key = String(button.getAttribute('data-gydytojai-section-toggle') || '').trim();
    const expanded = dashboardState?.gydytojaiSectionExpanded?.[key] === true;
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    button.classList.toggle('is-expanded', expanded);
  });

  const annualSubview = normalizeGydytojaiAnnualSubview(dashboardState?.gydytojaiAnnualSubview, 'doctor');
  dashboardState.gydytojaiAnnualSubview = annualSubview;
  if (selectors?.gydytojaiAnnualSection instanceof HTMLElement) {
    selectors.gydytojaiAnnualSection.hidden = annualSubview !== 'doctor';
  }
  if (selectors?.gydytojaiSpecialtyAnnualSection instanceof HTMLElement) {
    const canShowSpecialtySubview = dashboardState?.doctorsSpecialtyUiEnabled === true;
    selectors.gydytojaiSpecialtyAnnualSection.hidden =
      annualSubview !== 'specialty' || !canShowSpecialtySubview;
    if (!canShowSpecialtySubview && annualSubview === 'specialty') {
      dashboardState.gydytojaiAnnualSubview = 'doctor';
      if (selectors?.gydytojaiAnnualSection instanceof HTMLElement) {
        selectors.gydytojaiAnnualSection.hidden = false;
      }
    }
  }
  const annualDoctorPanel =
    selectors?.gydytojaiAnnualSection instanceof HTMLElement
      ? selectors.gydytojaiAnnualSection.querySelector('[data-gydytojai-section-panel="annualDoctor"]')
      : null;
  if (annualDoctorPanel instanceof HTMLElement) {
    annualDoctorPanel.hidden = false;
  }
  const annualSpecialtyPanel =
    selectors?.gydytojaiSpecialtyAnnualSection instanceof HTMLElement
      ? selectors.gydytojaiSpecialtyAnnualSection.querySelector(
          '[data-gydytojai-section-panel="annualSpecialty"]'
        )
      : null;
  if (annualSpecialtyPanel instanceof HTMLElement) {
    annualSpecialtyPanel.hidden = false;
  }

  if (selectors?.gydytojaiChartsMorePanel instanceof HTMLElement) {
    const expanded = dashboardState?.gydytojaiChartsExpandedExtras === true;
    selectors.gydytojaiChartsMorePanel.hidden = !expanded;
    if (selectors?.gydytojaiChartsMoreToggle instanceof HTMLElement) {
      selectors.gydytojaiChartsMoreToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      selectors.gydytojaiChartsMoreToggle.textContent = expanded
        ? 'Slėpti papildomus grafikus'
        : 'Rodyti daugiau grafikų';
    }
  }

  if (selectors?.gydytojaiChartDoctorTogglesPanel instanceof HTMLElement) {
    const expanded = dashboardState?.gydytojaiChartsDoctorTogglesExpanded === true;
    selectors.gydytojaiChartDoctorTogglesPanel.hidden = !expanded;
    if (selectors?.gydytojaiChartDoctorTogglesToggle instanceof HTMLElement) {
      selectors.gydytojaiChartDoctorTogglesToggle.setAttribute(
        'aria-expanded',
        expanded ? 'true' : 'false'
      );
      selectors.gydytojaiChartDoctorTogglesToggle.textContent = expanded
        ? 'Slėpti grafikuose pasirinktus gydytojus'
        : 'Rodyti grafikuose pasirinktus gydytojus';
    }
  }
}

export function getVisibleDoctorRowsForCharts(rows, hiddenAliases) {
  const hidden = new Set(
    (Array.isArray(hiddenAliases) ? hiddenAliases : []).map((alias) => normalizeDoctorAliasToken(alias))
  );
  return (Array.isArray(rows) ? rows : []).filter(
    (row) => !hidden.has(normalizeDoctorAliasToken(row?.alias))
  );
}

export function renderDoctorChartToggles(selectors, dashboardState, rows) {
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
  const fragment = document.createDocumentFragment();
  aliases.forEach((alias) => {
    const hidden = hiddenSet.has(normalizeDoctorAliasToken(alias));
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip-button gydytojai-chart-chip${hidden ? ' is-muted' : ''}`;
    chip.setAttribute('data-chart-doctor-toggle', alias);
    chip.setAttribute('aria-pressed', hidden ? 'false' : 'true');
    chip.textContent = alias;
    fragment.appendChild(chip);
  });
  host.appendChild(fragment);
}
