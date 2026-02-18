import { byId, byQuery, byQueryAllIn, byQueryIn, createPageShellSelectors } from '../helpers.js';

export function createGydytojaiPageSelectors() {
  const main = byQuery('main.container');
  const sectionNav = byQuery('.section-nav');
  const jumpNav = byQueryIn(main, '.gydytojai-jump-nav');

  return {
    ...createPageShellSelectors({ sectionNav }),
    gydytojaiHeading: byId('gydytojaiHeading'),
    gydytojaiSubtitle: byId('gydytojaiSubtitle'),
    gydytojaiCoverage: byId('gydytojaiCoverage'),
    gydytojaiLoadingInline: byId('gydytojaiLoadingInline'),
    gydytojaiLoadingState: byId('gydytojaiLoadingState'),
    gydytojaiFilterChips: byId('gydytojaiFilterChips'),
    gydytojaiYearChips: byId('gydytojaiYearChips'),
    gydytojaiTopNButtons: byQueryAllIn(main, '[data-gydytojai-topn]'),
    gydytojaiMinCasesButtons: byQueryAllIn(main, '[data-gydytojai-mincases]'),
    gydytojaiSortButtons: byQueryAllIn(main, '[data-gydytojai-sortby]'),
    gydytojaiArrivalButtons: byQueryAllIn(main, '[data-gydytojai-arrival]'),
    gydytojaiDispositionButtons: byQueryAllIn(main, '[data-gydytojai-disposition]'),
    gydytojaiShiftButtons: byQueryAllIn(main, '[data-gydytojai-shift]'),
    gydytojaiSearch: byId('gydytojaiSearch'),
    gydytojaiResetFilters: byId('gydytojaiResetFilters'),
    gydytojaiActiveFilters: byId('gydytojaiActiveFilters'),
    gydytojaiLeaderboardTable: byId('gydytojaiLeaderboardTable'),
    gydytojaiLeaderboardBody: byId('gydytojaiLeaderboardBody'),
    gydytojaiAnnualSection: byId('gydytojaiAnnualSection'),
    gydytojaiAnnualMetric: byId('gydytojaiAnnualMetric'),
    gydytojaiAnnualSort: byId('gydytojaiAnnualSort'),
    gydytojaiAnnualMetricButtons: byQueryAllIn(main, '[data-gydytojai-annual-metric]'),
    gydytojaiAnnualSortButtons: byQueryAllIn(main, '[data-gydytojai-annual-sort]'),
    gydytojaiAnnualDoctorInput: byId('gydytojaiAnnualDoctorInput'),
    gydytojaiAnnualSuggestions: byId('gydytojaiAnnualSuggestions'),
    gydytojaiAnnualAddDoctor: byId('gydytojaiAnnualAddDoctor'),
    gydytojaiAnnualClearDoctors: byId('gydytojaiAnnualClearDoctors'),
    gydytojaiAnnualSelectionHelp: byId('gydytojaiAnnualSelectionHelp'),
    gydytojaiAnnualSelected: byId('gydytojaiAnnualSelected'),
    gydytojaiAnnualCards: byId('gydytojaiAnnualCards'),
    gydytojaiAnnualEmpty: byId('gydytojaiAnnualEmpty'),
    gydytojaiVolumeChart: byId('gydytojaiVolumeChart'),
    gydytojaiLosChart: byId('gydytojaiLosChart'),
    gydytojaiHospitalChart: byId('gydytojaiHospitalChart'),
    gydytojaiMixChart: byId('gydytojaiMixChart'),
    gydytojaiScatterChart: byId('gydytojaiScatterChart'),
    gydytojaiChartDoctorToggles: byId('gydytojaiChartDoctorToggles'),
    gydytojaiChartDoctorsReset: byId('gydytojaiChartDoctorsReset'),
    reportExportButtons: byQueryAllIn(main, '[data-report-export]'),
    tableDownloadButtons: byQueryAllIn(main, '[data-table-download]'),
    jumpNav,
    jumpLinks: byQueryAllIn(jumpNav, '.gydytojai-jump-nav__link'),
  };
}
