import { byId, byQuery, byQueryAllIn, byQueryIn, createPageShellSelectors } from '../helpers.js';

export function createSummariesPageSelectors() {
  const main = byQuery('main.container');
  const sectionNav = byQuery('.section-nav');
  const summariesJumpNav = byQueryIn(main, '.summaries-jump-nav');

  return {
    ...createPageShellSelectors({ sectionNav }),
    yearlyTable: byId('yearlyTable'),
    summariesReportsHeading: byId('summariesReportsHeading'),
    summariesReportsSubtitle: byId('summariesReportsSubtitle'),
    summariesReportsYear: byId('summariesReportsYear'),
    summariesReportsTopN: byId('summariesReportsTopN'),
    summariesReportsMinGroupSize: byId('summariesReportsMinGroupSize'),
    referralHospitalizedByPspcMode: byId('referralHospitalizedByPspcMode'),
    referralHospitalizedByPspcTrendPspc: byId('referralHospitalizedByPspcTrendPspc'),
    referralHospitalizedByPspcSort: byId('referralHospitalizedByPspcSort'),
    summariesReportsCoverage: byId('summariesReportsCoverage'),
    summariesJumpNav,
    summariesJumpLinks: byQueryAllIn(summariesJumpNav, '.summaries-jump-nav__link'),
    diagnosisChart: byId('diagnosisChart'),
    ageDiagnosisHeatmapChart: byId('ageDiagnosisHeatmapChart'),
    diagnosisInfo: byId('diagnosisInfo'),
    z769TrendChart: byId('z769TrendChart'),
    referralTrendChart: byId('referralTrendChart'),
    referralDispositionYearlyChart: byId('referralDispositionYearlyChart'),
    referralMonthlyHeatmapChart: byId('referralMonthlyHeatmapChart'),
    referralHospitalizedByPspcChart: byId('referralHospitalizedByPspcChart'),
    pspcCorrelationChart: byId('pspcCorrelationChart'),
    ageDistributionChart: byId('ageDistributionChart'),
    pspcDistributionChart: byId('pspcDistributionChart'),
    reportExportButtons: byQueryAllIn(main, '[data-report-export]'),
    tableDownloadButtons: byQueryAllIn(main, '[data-table-download]'),
    monthlyHeading: byId('monthlyHeading'),
    monthlySubtitle: byId('monthlySubtitle'),
    monthlyCaption: byId('monthlyCaption'),
    monthlyTable: byId('monthlyTable'),
    yearlyHeading: byId('yearlyHeading'),
    yearlySubtitle: byId('yearlySubtitle'),
    yearlyCaption: byId('yearlyCaption'),
  };
}
