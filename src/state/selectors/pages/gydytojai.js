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
    gydytojaiYear: byId('gydytojaiYear'),
    gydytojaiTopN: byId('gydytojaiTopN'),
    gydytojaiMinCases: byId('gydytojaiMinCases'),
    gydytojaiSort: byId('gydytojaiSort'),
    gydytojaiDoctorSelect: byId('gydytojaiDoctorSelect'),
    gydytojaiArrivalFilter: byId('gydytojaiArrivalFilter'),
    gydytojaiDispositionFilter: byId('gydytojaiDispositionFilter'),
    gydytojaiShiftFilter: byId('gydytojaiShiftFilter'),
    gydytojaiDiagnosisFilter: byId('gydytojaiDiagnosisFilter'),
    gydytojaiSearch: byId('gydytojaiSearch'),
    gydytojaiResetFilters: byId('gydytojaiResetFilters'),
    gydytojaiLeaderboardTable: byId('gydytojaiLeaderboardTable'),
    gydytojaiKpiActive: byId('gydytojaiKpiActive'),
    gydytojaiKpiMedianLos: byId('gydytojaiKpiMedianLos'),
    gydytojaiKpiTopShare: byId('gydytojaiKpiTopShare'),
    gydytojaiLeaderboardBody: byId('gydytojaiLeaderboardBody'),
    gydytojaiYearlyHead: byId('gydytojaiYearlyHead'),
    gydytojaiYearlyBody: byId('gydytojaiYearlyBody'),
    gydytojaiVolumeChart: byId('gydytojaiVolumeChart'),
    gydytojaiLosChart: byId('gydytojaiLosChart'),
    gydytojaiHospitalChart: byId('gydytojaiHospitalChart'),
    gydytojaiMixChart: byId('gydytojaiMixChart'),
    gydytojaiTrendChart: byId('gydytojaiTrendChart'),
    gydytojaiScatterChart: byId('gydytojaiScatterChart'),
    reportExportButtons: byQueryAllIn(main, '[data-report-export]'),
    tableDownloadButtons: byQueryAllIn(main, '[data-table-download]'),
    jumpNav,
    jumpLinks: byQueryAllIn(jumpNav, '.gydytojai-jump-nav__link'),
  };
}
