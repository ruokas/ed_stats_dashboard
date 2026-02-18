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
    gydytojaiLoadingState: byId('gydytojaiLoadingState'),
    gydytojaiYear: byId('gydytojaiYear'),
    gydytojaiTopN: byId('gydytojaiTopN'),
    gydytojaiMinCases: byId('gydytojaiMinCases'),
    gydytojaiSort: byId('gydytojaiSort'),
    gydytojaiDoctorSelect: byId('gydytojaiDoctorSelect'),
    gydytojaiArrivalFilter: byId('gydytojaiArrivalFilter'),
    gydytojaiDispositionFilter: byId('gydytojaiDispositionFilter'),
    gydytojaiShiftFilter: byId('gydytojaiShiftFilter'),
    gydytojaiSearch: byId('gydytojaiSearch'),
    gydytojaiResetFilters: byId('gydytojaiResetFilters'),
    gydytojaiLeaderboardTable: byId('gydytojaiLeaderboardTable'),
    gydytojaiLeaderboardBody: byId('gydytojaiLeaderboardBody'),
    gydytojaiAnnualSection: byId('gydytojaiAnnualSection'),
    gydytojaiAnnualMetric: byId('gydytojaiAnnualMetric'),
    gydytojaiAnnualSort: byId('gydytojaiAnnualSort'),
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
    reportExportButtons: byQueryAllIn(main, '[data-report-export]'),
    tableDownloadButtons: byQueryAllIn(main, '[data-table-download]'),
    jumpNav,
    jumpLinks: byQueryAllIn(jumpNav, '.gydytojai-jump-nav__link'),
  };
}
