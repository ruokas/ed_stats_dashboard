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
} from '../../../data/stats.js';
import { createDashboardState } from '../../../state/dashboardState.js';
import { createSelectorsForPage } from '../../../state/selectors.js';
import { loadChartJs } from '../../../utils/chart-loader.js';
import { getDatasetValue } from '../../../utils/dom.js';
import { oneDecimalFormatter } from '../../../utils/format.js';
import { DEFAULT_FOOTER_SOURCE, DEFAULT_KPI_WINDOW_DAYS, TEXT, THEME_STORAGE_KEY } from '../../constants.js';
import { DEFAULT_SETTINGS } from '../../default-settings.js';
import { setCopyButtonFeedback, storeCopyButtonBaseLabel, writeTextToClipboard } from '../clipboard.js';
import {
  initSummariesJumpNavigation,
  initSummariesJumpStickyOffset,
} from '../features/summaries-jump-navigation.js';
import { formatExportFilename } from '../features/summaries-runtime-helpers.js';
import { applyTheme, initializeTheme } from '../features/theme.js';
import { replaceUrlQuery } from '../filters/query-codec.js';
import { syncAriaPressed } from '../filters/ui-sync.js';
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
import {
  normalizeDoctorAliasToken,
  normalizeSpecialtyToken,
  renderAnnualDoctorSuggestions,
  renderAnnualSelectedChips,
  renderDoctorAnnualSmallMultiples,
  renderSpecialtyAnnualControls,
  renderSpecialtyAnnualSmallMultiples,
  renderSpecialtyAnnualSummary,
  resolveAnnualDoctorAlias,
  syncSpecialtyAnnualSelection,
} from './gydytojai/annual-render.js';
import { renderCharts } from './gydytojai/chart-render.js';
import { setDoctorExportState } from './gydytojai/export-state.js';
import {
  applyActiveFiltersDisclosure,
  applyGydytojaiLayoutControls,
  buildDoctorFilterSummary,
  getVisibleDoctorRowsForCharts,
  isGydytojaiSectionExpanded,
  renderActiveDoctorFilters,
  renderActiveDoctorFiltersSummary,
  renderDoctorChartToggles,
  renderDoctorSpecialtyValidation,
  renderGydytojaiSectionSummaries,
  setGydytojaiSectionExpanded,
} from './gydytojai/filter-layout.js';
import { wireDoctorInteractions } from './gydytojai/interactions.js';
import {
  buildDoctorSpecialtyConfigSignature,
  getCachedDoctorAnnualModel,
  getCachedDoctorBaseModels,
  getCachedDoctorSpecialtyAnnualModel,
  getCachedDoctorSpecialtyLeaderboardModel,
  getCachedDoctorSpecialtyModel,
  getCachedDoctorStatsComputeContext,
} from './gydytojai/model-cache.js';
import {
  buildDoctorPageQuery,
  buildSectionExpandedState,
  DEFAULT_GYDYTOJAI_SECTION_EXPANDED,
  GYDYTOJAI_SECTION_KEYS,
  getDoctorPageStateFromQuery,
  getExpandedSectionList,
  normalizeAnnualMetric,
  normalizeAnnualSort,
  normalizeGydytojaiAnnualSubview,
  normalizeSpecialtyAnnualMetric,
  parsePositiveInt,
} from './gydytojai/query-state.js';
import {
  renderLeaderboardTable,
  renderSpecialtyComparisonTable,
  updateSortHeaderState,
} from './gydytojai/table-render.js';
import { createReportExportClickHandler } from './summaries/report-export.js';

export { buildDoctorPageQuery, getDoctorPageStateFromQuery } from './gydytojai/query-state.js';

const setStatus = createStatusSetter(TEXT.status, { showSuccessState: false });

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
    gydytojaiAnnualSubview: dashboardState.gydytojaiAnnualSubview,
    gydytojaiFiltersAdvancedExpanded: dashboardState.gydytojaiFiltersAdvancedExpanded,
    gydytojaiSectionExpanded: getExpandedSectionList(dashboardState.gydytojaiSectionExpanded),
  });
  if (dashboardState?.gydytojaiLastQueryString === query) {
    return;
  }
  dashboardState.gydytojaiLastQueryString = query;
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
  setPressed(selectors.gydytojaiAnnualSubviewButtons, dashboardState.gydytojaiAnnualSubview, (button) =>
    button.getAttribute('data-gydytojai-annual-subview')
  );
}

function applyDoctorSpecialtyControls(selectors, dashboardState, specialtyValidation, specialtyOptions) {
  const select = selectors?.gydytojaiSpecialtySelect;
  const field =
    selectors?.gydytojaiSpecialtyField instanceof HTMLElement
      ? selectors.gydytojaiSpecialtyField
      : select instanceof HTMLElement
        ? select.closest('.summaries-reports-controls__field')
        : null;
  if (!(select instanceof HTMLSelectElement)) {
    return;
  }
  const validation = specialtyValidation || {};
  const enabled = validation.enabled === true;
  const uiEnabled = dashboardState?.doctorsSpecialtyUiEnabled === true && enabled;
  if (field instanceof HTMLElement) {
    field.hidden = !enabled;
  }
  select.disabled = !uiEnabled;
  if (!enabled) {
    select.replaceChildren();
    const option = document.createElement('option');
    option.value = 'all';
    option.textContent = 'Visos';
    select.appendChild(option);
    select.value = 'all';
    return;
  }

  const groups = Array.isArray(specialtyOptions) ? specialtyOptions : [];
  const allowed = new Set(['all', ...groups.map((group) => String(group?.id || '').trim()).filter(Boolean)]);
  const current = String(dashboardState?.doctorsSpecialtyFilter || 'all');
  dashboardState.doctorsSpecialtyFilter = allowed.has(current) ? current : 'all';

  select.replaceChildren();
  [{ id: 'all', label: 'Visos' }, ...groups].forEach((item) => {
    const option = document.createElement('option');
    option.value = String(item?.id || 'all');
    option.textContent = String(item?.label || item?.id || '');
    select.appendChild(option);
  });
  select.value = allowed.has(String(dashboardState.doctorsSpecialtyFilter || 'all'))
    ? String(dashboardState.doctorsSpecialtyFilter || 'all')
    : 'all';
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

function setLoadingVisualState(selectors, isLoading, options = {}) {
  const initialLoadPending = options?.initialLoadPending === true;
  const showFullSkeleton = false;
  const showInline = isLoading && !initialLoadPending;
  if (selectors.gydytojaiFiltersPanel instanceof HTMLElement) {
    selectors.gydytojaiFiltersPanel.hidden = false;
    selectors.gydytojaiFiltersPanel.dataset.loading = showFullSkeleton ? 'true' : 'false';
    selectors.gydytojaiFiltersPanel.setAttribute('aria-busy', showFullSkeleton ? 'true' : 'false');
    const controls = selectors.gydytojaiFiltersPanel.querySelectorAll('button, input, select, textarea');
    controls.forEach((control) => {
      if (
        control instanceof HTMLButtonElement ||
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) {
        control.disabled = showFullSkeleton;
      }
    });
  }
  if (selectors.gydytojaiLoadingState instanceof HTMLElement) {
    selectors.gydytojaiLoadingState.hidden = !showFullSkeleton;
  }
  if (selectors.gydytojaiLoadingInline instanceof HTMLElement) {
    selectors.gydytojaiLoadingInline.hidden = !showInline;
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
  dashboardState.gydytojaiAnnualSubview = normalizeGydytojaiAnnualSubview(
    fromQuery.gydytojaiAnnualSubview,
    'doctor'
  );
  dashboardState.gydytojaiFiltersAdvancedExpanded = Boolean(fromQuery.gydytojaiFiltersAdvancedExpanded);
  dashboardState.gydytojaiSectionExpanded = {
    ...buildSectionExpandedState(fromQuery.gydytojaiSectionExpanded),
    results: true,
  };
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
  let deferredVisualRenderToken = 0;
  const scheduleDeferredVisualRender = (callback) => {
    deferredVisualRenderToken += 1;
    const token = deferredVisualRenderToken;
    const scheduleFrame =
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (fn) => window.setTimeout(fn, 0);
    scheduleFrame(() => {
      window.setTimeout(async () => {
        if (token !== deferredVisualRenderToken) {
          return;
        }
        try {
          await callback();
        } catch (error) {
          console.error('Nepavyko atvaizduoti gydytojų papildomų blokų:', error);
        }
      }, 0);
    });
  };
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
    const specialtyModel = getCachedDoctorSpecialtyModel(dashboardState, settings, records);
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
    const specialtyConfigSignature = buildDoctorSpecialtyConfigSignature(settings);
    const statsComputeContext = getCachedDoctorStatsComputeContext(dashboardState, records, {
      specialtyConfigSignature,
    });
    const sharedOptions = {
      ...options,
      specialtyFilter: specialtyFilterApplied,
      requireMappedSpecialty: excludeUnmappedFromStats,
      doctorSpecialtyResolver: specialtyModel.resolver,
      computeContext: statsComputeContext,
    };
    const specialtySectionExpanded = isGydytojaiSectionExpanded(dashboardState, 'specialty');
    const specialtyFilterForcesSection = String(dashboardState.doctorsSpecialtyFilter || 'all') !== 'all';
    const shouldComputeSpecialtyLeaderboard =
      dashboardState.doctorsSpecialtyUiEnabled && (specialtySectionExpanded || specialtyFilterForcesSection);
    const specialtyLeaderboard = shouldComputeSpecialtyLeaderboard
      ? getCachedDoctorSpecialtyLeaderboardModel(
          dashboardState,
          records,
          {
            ...sharedOptions,
            specialtyFilter: 'all',
          },
          () =>
            computeDoctorSpecialtyLeaderboard(records, {
              ...sharedOptions,
              specialtyFilter: 'all',
            })
        )
      : null;

    const baseModels = getCachedDoctorBaseModels(dashboardState, records, sharedOptions, () => ({
      leaderboard: computeDoctorLeaderboard(records, sharedOptions),
      mix: computeDoctorDayNightMix(records, sharedOptions),
      hospital: computeDoctorHospitalizationShare(records, sharedOptions),
      scatter: computeDoctorVolumeVsLosScatter(records, sharedOptions),
    }));
    const leaderboard = baseModels?.leaderboard || { rows: [], yearOptions: [], coverage: {} };
    const mix = baseModels?.mix || { rows: [] };
    const hospital = baseModels?.hospital || { rows: [] };
    const scatter = baseModels?.scatter || { rows: [] };
    const annualSectionExpanded = isGydytojaiSectionExpanded(dashboardState, 'annual');
    const annualDoctorVisible =
      annualSectionExpanded &&
      normalizeGydytojaiAnnualSubview(dashboardState.gydytojaiAnnualSubview, 'doctor') === 'doctor';
    let annual = null;
    if (annualDoctorVisible) {
      annual = getCachedDoctorAnnualModel(dashboardState, records, sharedOptions, () =>
        computeDoctorYearlySmallMultiples(records, {
          ...sharedOptions,
          yearScope: 'all_years',
          yearFilter: 'all',
          metric: dashboardState.doctorsAnnualMetric,
          topN: Math.max(
            1,
            Array.isArray(dashboardState.doctorsAnnualSelected)
              ? dashboardState.doctorsAnnualSelected.length
              : 1
          ),
          minYearCount: dashboardState.doctorsAnnualMinYearCount,
          selectedDoctors: dashboardState.doctorsAnnualSelected,
        })
      );
    } else {
      annual =
        dashboardState?.doctorsAnnualModelCache?.recordsRef === records
          ? dashboardState.doctorsAnnualModelCache.model
          : null;
    }
    dashboardState.doctorsAnnualAvailable = Array.isArray(annual?.meta?.availableDoctors)
      ? annual.meta.availableDoctors
      : Array.isArray(dashboardState.doctorsAnnualAvailable)
        ? dashboardState.doctorsAnnualAvailable
        : [];
    const specialtyAnnualMetric = normalizeSpecialtyAnnualMetric(
      dashboardState.doctorsSpecialtyAnnualMetric,
      'count'
    );
    dashboardState.doctorsSpecialtyAnnualMetric = specialtyAnnualMetric;
    const annualSpecialtyVisible =
      annualSectionExpanded &&
      dashboardState.doctorsSpecialtyUiEnabled === true &&
      normalizeGydytojaiAnnualSubview(dashboardState.gydytojaiAnnualSubview, 'doctor') === 'specialty';
    const specialtyAnnualModel =
      dashboardState.doctorsSpecialtyUiEnabled === true
        ? annualSpecialtyVisible
          ? getCachedDoctorSpecialtyAnnualModel(dashboardState, records, sharedOptions, () =>
              specialtyAnnualMetric === 'losGroups'
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
            )
          : dashboardState?.doctorsSpecialtyAnnualModelCache?.recordsRef === records
            ? dashboardState.doctorsSpecialtyAnnualModelCache.model
            : null
        : null;
    if (dashboardState.doctorsSpecialtyUiEnabled === true && specialtyFilterForcesSection) {
      setGydytojaiSectionExpanded(dashboardState, 'specialty', true);
    }
    syncSpecialtyAnnualSelection(
      dashboardState,
      Array.isArray(specialtyAnnualModel?.meta?.availableSpecialties)
        ? specialtyAnnualModel.meta.availableSpecialties
        : Array.isArray(dashboardState?.doctorsSpecialtyAnnualAvailable)
          ? dashboardState.doctorsSpecialtyAnnualAvailable
          : Array.isArray(dashboardState?.doctorsSpecialtyValidation?.groups)
            ? dashboardState.doctorsSpecialtyValidation.groups.map((group) => ({
                specialtyId: String(group?.id || '').trim(),
                alias: String(group?.label || group?.id || '').trim(),
                total: Number(group?.count || 0),
              }))
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
    renderActiveDoctorFiltersSummary(selectors, dashboardState);
    if (specialtySectionExpanded || specialtyFilterForcesSection) {
      renderSpecialtyComparisonTable(selectors, specialtyLeaderboard, dashboardState);
    }
    renderGydytojaiSectionSummaries(selectors, dashboardState, { specialtyLeaderboard });
    applyGydytojaiLayoutControls(selectors, dashboardState);
    setCoverage(selectors, leaderboard);
    renderLeaderboardTable(selectors, leaderboard.rows, dashboardState.doctorsTableSort);
    updateSortHeaderState(selectors, dashboardState.doctorsTableSort);
    const chartsSectionExpanded = isGydytojaiSectionExpanded(dashboardState, 'charts');
    const annualSectionStillExpanded = isGydytojaiSectionExpanded(dashboardState, 'annual');
    const annualSubview = normalizeGydytojaiAnnualSubview(dashboardState.gydytojaiAnnualSubview, 'doctor');
    const shouldRenderDeferredVisuals =
      chartsSectionExpanded ||
      annualSectionStillExpanded ||
      (dashboardState.doctorsSpecialtyUiEnabled === true &&
        annualSectionStillExpanded &&
        annualSubview === 'specialty');
    if (shouldRenderDeferredVisuals) {
      scheduleDeferredVisualRender(async () => {
        renderSpecialtyAnnualControls(selectors, dashboardState, specialtyAnnualModel);
        renderSpecialtyAnnualSummary(selectors, dashboardState, specialtyAnnualModel);

        let chartModels = null;
        if (chartsSectionExpanded) {
          renderDoctorChartToggles(selectors, dashboardState, leaderboard.rows);
          const visibleLeaderboardRows = getVisibleDoctorRowsForCharts(
            leaderboard.rows,
            dashboardState.doctorsChartsHiddenAliases
          );
          const visibleAliases = new Set(
            visibleLeaderboardRows.map((row) => normalizeDoctorAliasToken(row?.alias))
          );
          chartModels = {
            leaderboard: { ...leaderboard, rows: visibleLeaderboardRows },
            mix: {
              ...mix,
              rows: (mix.rows || []).filter((row) =>
                visibleAliases.has(normalizeDoctorAliasToken(row?.alias))
              ),
            },
            hospital: {
              ...hospital,
              rows: (hospital.rows || []).filter((row) =>
                visibleAliases.has(normalizeDoctorAliasToken(row?.alias))
              ),
            },
            scatter: {
              ...scatter,
              rows: (scatter.rows || []).filter((row) =>
                visibleAliases.has(normalizeDoctorAliasToken(row?.alias))
              ),
            },
          };
          setDoctorExportState(exportState, selectors, dashboardState, chartModels, buildDoctorFilterSummary);
          chartLib = chartLib || (await loadChartJs());
          if (chartLib) {
            renderCharts(dashboardState, chartLib, selectors, chartModels);
          }
        }

        if (annualSectionStillExpanded) {
          chartLib = chartLib || (await loadChartJs());
          if (!chartLib) {
            return;
          }
          renderAnnualSelectedChips(selectors, dashboardState, annual);
          renderAnnualDoctorSuggestions(selectors, dashboardState);
          renderDoctorAnnualSmallMultiples(
            selectors,
            dashboardState,
            chartLib,
            annual,
            buildDoctorFilterSummary,
            exportState,
            handleReportExportClick
          );
          renderSpecialtyAnnualSmallMultiples(
            selectors,
            dashboardState,
            chartLib,
            specialtyAnnualModel,
            buildDoctorFilterSummary,
            exportState,
            handleReportExportClick
          );
        }
      });
    }
  };

  let renderToken = 0;
  const rerender = () => {
    renderToken += 1;
    const token = renderToken;
    loadingStartedAt = Date.now();
    setLoadingVisualState(selectors, true, { initialLoadPending });
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
                setLoadingVisualState(selectors, false, { initialLoadPending });
              }
            }, waitMs);
          }
        });
    });
  };

  wireDoctorInteractions({
    selectors,
    dashboardState,
    rerender,
    handleReportExportClick,
    deps: {
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
    },
  });

  try {
    void loadChartJs();
    setStatus(selectors, 'loading');
    setLoadingVisualState(selectors, true, { initialLoadPending });
    const data = await fetchData({ skipHistorical: false });
    dashboardState.rawRecords = Array.isArray(data?.records) ? data.records : [];
    await render();
    initialLoadPending = false;
    dashboardState.hasLoadedOnce = true;
    setLoadingVisualState(selectors, false, { initialLoadPending });
    setStatus(selectors, 'ready');
  } catch (error) {
    console.error('Nepavyko įkelti gydytojų puslapio:', error);
    initialLoadPending = false;
    setLoadingVisualState(selectors, false, { initialLoadPending });
    setStatus(selectors, 'error', error?.message || TEXT.status.error);
  }
}
