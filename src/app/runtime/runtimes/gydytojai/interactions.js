import { createDebouncedHandler } from '../../filters/ui-sync.js';

export function wireDoctorInteractions({
  selectors,
  dashboardState,
  rerender,
  handleReportExportClick,
  deps,
}) {
  const {
    applyGydytojaiLayoutControls,
    syncDoctorPageQueryFromState,
    setGydytojaiSectionExpanded,
    isGydytojaiSectionExpanded,
    GYDYTOJAI_SECTION_KEYS,
    applyActiveFiltersDisclosure,
    parsePositiveInt,
    normalizeGydytojaiAnnualSubview,
    normalizeAnnualMetric,
    normalizeAnnualSort,
    normalizeSpecialtyAnnualMetric,
    renderAnnualDoctorSuggestions,
    resolveAnnualDoctorAlias,
    normalizeDoctorAliasToken,
    normalizeSpecialtyToken,
    DEFAULT_GYDYTOJAI_SECTION_EXPANDED,
    storeCopyButtonBaseLabel,
  } = deps;
  const applySearchWithDebounce = createDebouncedHandler(() => {
    dashboardState.doctorsSearchDebounced = String(dashboardState.doctorsSearch || '').trim();
    rerender();
  }, 250);
  const applyLayoutAndQuerySync = () => {
    applyGydytojaiLayoutControls(selectors, dashboardState);
    syncDoctorPageQueryFromState(dashboardState);
  };
  const expandSectionAndRerender = (key) => {
    setGydytojaiSectionExpanded(dashboardState, key, true);
    rerender();
  };

  selectors.gydytojaiFiltersAdvancedToggle?.addEventListener('click', () => {
    dashboardState.gydytojaiFiltersAdvancedExpanded = !(
      dashboardState.gydytojaiFiltersAdvancedExpanded === true
    );
    applyGydytojaiLayoutControls(selectors, dashboardState);
    syncDoctorPageQueryFromState(dashboardState);
  });
  selectors.gydytojaiActiveFiltersToggle?.addEventListener('click', () => {
    dashboardState.gydytojaiActiveFiltersExpanded = !(dashboardState.gydytojaiActiveFiltersExpanded === true);
    applyActiveFiltersDisclosure(selectors, dashboardState);
  });
  selectors.gydytojaiChartsMoreToggle?.addEventListener('click', () => {
    const nextExpanded = !(dashboardState.gydytojaiChartsExpandedExtras === true);
    dashboardState.gydytojaiChartsExpandedExtras = nextExpanded;
    setGydytojaiSectionExpanded(dashboardState, 'charts', true);
    if (nextExpanded) {
      rerender();
      return;
    }
    applyLayoutAndQuerySync();
  });
  selectors.gydytojaiChartDoctorTogglesToggle?.addEventListener('click', () => {
    const nextExpanded = !(dashboardState.gydytojaiChartsDoctorTogglesExpanded === true);
    dashboardState.gydytojaiChartsDoctorTogglesExpanded = nextExpanded;
    const chartsWasExpanded = isGydytojaiSectionExpanded(dashboardState, 'charts');
    setGydytojaiSectionExpanded(dashboardState, 'charts', true);
    if (!chartsWasExpanded && nextExpanded) {
      rerender();
      return;
    }
    applyLayoutAndQuerySync();
  });
  selectors.gydytojaiSectionToggleButtons?.forEach((button) => {
    button.addEventListener('click', (event) => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const key = String(target.getAttribute('data-gydytojai-section-toggle') || '').trim();
      if (!GYDYTOJAI_SECTION_KEYS.includes(key)) {
        return;
      }
      const current = dashboardState?.gydytojaiSectionExpanded?.[key] === true;
      const nextExpanded = !current;
      setGydytojaiSectionExpanded(dashboardState, key, nextExpanded);
      const requiresDataRender =
        nextExpanded && (key === 'charts' || key === 'specialty' || key === 'annual');
      if (requiresDataRender) {
        rerender();
        return;
      }
      applyLayoutAndQuerySync();
    });
  });
  selectors.jumpLinks?.forEach((link) => {
    link.addEventListener('click', () => {
      const href = link.getAttribute('href') || '';
      if (!href.startsWith('#')) {
        return;
      }
      const targetEl = document.querySelector(href);
      const section = targetEl instanceof HTMLElement ? targetEl.closest('section[data-section]') : null;
      const sectionId = String(section?.getAttribute('data-section') || '');
      const map = {
        'gydytojai-tables': 'results',
        'gydytojai-specialty': 'specialty',
        'gydytojai-annual': 'annual',
        'gydytojai-specialty-annual': 'annual',
        'gydytojai-annual-combined': 'annual',
        'gydytojai-charts': 'charts',
      };
      const key = map[sectionId];
      if (key) {
        const alreadyExpanded = isGydytojaiSectionExpanded(dashboardState, key);
        setGydytojaiSectionExpanded(dashboardState, key, true);
        if (!alreadyExpanded && (key === 'charts' || key === 'specialty' || key === 'annual')) {
          rerender();
          return;
        }
        applyLayoutAndQuerySync();
      }
    });
  });

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
      if (String(dashboardState.doctorsSpecialtyFilter || 'all') !== 'all') {
        setGydytojaiSectionExpanded(dashboardState, 'specialty', true);
      }
      rerender();
    }
  });
  selectors.gydytojaiSpecialtySelect?.addEventListener('change', (event) => {
    const nextValue = String(event.target?.value || 'all').trim() || 'all';
    dashboardState.doctorsSpecialtyFilter = nextValue;
    if (nextValue !== 'all') {
      setGydytojaiSectionExpanded(dashboardState, 'specialty', true);
    }
    rerender();
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
  selectors.gydytojaiAnnualSubview?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest('[data-gydytojai-annual-subview]');
    if (!(button instanceof HTMLElement)) {
      return;
    }
    const next = normalizeGydytojaiAnnualSubview(
      button.getAttribute('data-gydytojai-annual-subview'),
      'doctor'
    );
    dashboardState.gydytojaiAnnualSubview = next;
    expandSectionAndRerender('annual');
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
    dashboardState.gydytojaiAnnualSubview = 'doctor';
    expandSectionAndRerender('annual');
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
    dashboardState.gydytojaiAnnualSubview = 'doctor';
    expandSectionAndRerender('annual');
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
    dashboardState.gydytojaiAnnualSubview = 'doctor';
    dashboardState.doctorsAnnualSearchInput = '';
    dashboardState.doctorsAnnualSuggestIndex = -1;
    if (selectors.gydytojaiAnnualDoctorInput) {
      selectors.gydytojaiAnnualDoctorInput.value = '';
    }
    refreshAnnualSuggestions();
    expandSectionAndRerender('annual');
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
    dashboardState.gydytojaiAnnualSubview = 'doctor';
    expandSectionAndRerender('annual');
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
    dashboardState.gydytojaiAnnualSubview = 'specialty';
    expandSectionAndRerender('annual');
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
    dashboardState.gydytojaiAnnualSubview = 'specialty';
    expandSectionAndRerender('annual');
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
    dashboardState.gydytojaiAnnualSubview = 'specialty';
    expandSectionAndRerender('annual');
  });
  selectors.gydytojaiSpecialtyAnnualClear?.addEventListener('click', () => {
    dashboardState.doctorsSpecialtyAnnualSelected = [];
    dashboardState.gydytojaiAnnualSubview = 'specialty';
    expandSectionAndRerender('annual');
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
    dashboardState.gydytojaiAnnualSubview = 'doctor';
    dashboardState.gydytojaiFiltersAdvancedExpanded = false;
    dashboardState.gydytojaiActiveFiltersExpanded = false;
    dashboardState.gydytojaiSectionExpanded = { ...DEFAULT_GYDYTOJAI_SECTION_EXPANDED };
    dashboardState.gydytojaiChartsExpandedExtras = false;
    dashboardState.gydytojaiChartsDoctorTogglesExpanded = false;
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
