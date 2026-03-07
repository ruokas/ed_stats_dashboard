import { createMainDataHandlers } from '../../../data/main-data.js';
import { computeDailyStats, computeMonthlyStats, computeYearlyStats } from '../../../data/stats.js';
import { initTableDownloadButtons } from '../../../events/charts.js';
import { initYearlyExpand } from '../../../events/yearly.js';
import { createDashboardState } from '../../../state/dashboardState.js';
import { createSelectorsForPage } from '../../../state/selectors.js';
import { loadChartJs } from '../../../utils/chart-loader.js';
import { getDatasetValue, runAfterDomAndIdle, setDatasetValue } from '../../../utils/dom.js';
import { numberFormatter, oneDecimalFormatter } from '../../../utils/format.js';
import {
  AUTO_REFRESH_INTERVAL_MS,
  CLIENT_CONFIG_KEY,
  DEFAULT_FOOTER_SOURCE,
  DEFAULT_KPI_WINDOW_DAYS,
  TEXT,
  THEME_STORAGE_KEY,
} from '../../constants.js';
import { DEFAULT_SETTINGS } from '../../default-settings.js';
import { filterDailyStatsByWindow } from '../chart-primitives.js';
import { setCopyButtonFeedback, storeCopyButtonBaseLabel, writeTextToClipboard } from '../clipboard.js';
import { createDataFlow } from '../data-flow.js';
import {
  initSummariesJumpNavigation,
  initSummariesJumpStickyOffset,
} from '../features/summaries-jump-navigation.js';
import {
  applyChartThemeDefaults,
  formatExportFilename,
  getCssVar,
} from '../features/summaries-runtime-helpers.js';
import { handleYearlyToggle, renderYearlyTable } from '../features/summaries-yearly-table.js';
import { applyTheme, initializeTheme } from '../features/theme.js';
import { parseFromQuery, replaceUrlQuery, serializeToQuery } from '../filters/query-codec.js';
import { buildFilterSummary } from '../filters/summary.js';
import {
  createTextSignature,
  describeCacheMeta,
  describeError,
  downloadCsv,
  formatUrlForDiagnostics,
} from '../network.js';
import { applyCommonPageShellText, setupSharedPageUi } from '../page-ui.js';
import { loadSettingsFromConfig } from '../settings.js';
import {
  createDefaultChartFilters,
  createDefaultFeedbackFilters,
  createDefaultKpiFilters,
} from '../state.js';
import { createTableDownloadHandler, escapeCsvCell } from '../table-export.js';
import { createRuntimeLifecycle } from './runtime-lifecycle.js';

import { createSummariesDataFlowConfig } from './summaries/data-flow-config.js';
import { renderRecentTable } from './summaries/recent-table.js';
import {
  extractHistoricalRecords,
  getReportsComputationAsync,
  getScopedReportsMeta,
  sortPspcRows,
} from './summaries/report-computation.js';
import { syncReportsControls } from './summaries/report-controls.js';
import { createReportExportClickHandler } from './summaries/report-export.js';
import { parsePositiveIntOrDefault } from './summaries/report-filters.js';
import { getCachedSummariesReportViewModelsAsync } from './summaries/report-view-model-cache.js';
import { wireSummariesInteractions } from './summaries/runtime-interactions.js';
import { createSummariesSectionCollapseFeature } from './summaries/section-collapse.js';

const { runtimeClient, setStatus, getAutoRefreshTimerId, setAutoRefreshTimerId } = createRuntimeLifecycle({
  clientConfigKey: CLIENT_CONFIG_KEY,
  statusText: TEXT.status,
  statusOptions: { showSuccessState: false },
});

export {
  computeSummariesReportViewModels,
  getCachedSummariesReportViewModels,
  getCachedSummariesReportViewModelsAsync,
} from './summaries/report-view-model-cache.js';

let reportRuntimeHelpersPromise = null;
async function loadReportRuntimeHelpers() {
  reportRuntimeHelpersPromise =
    reportRuntimeHelpersPromise || import('./summaries/report-runtime-helpers.js');
  return reportRuntimeHelpersPromise;
}

const handleTableDownloadClick = createTableDownloadHandler({
  getDatasetValue,
  setCopyButtonFeedback,
  defaultTitle: 'Lentelė',
  formatFilename: formatExportFilename,
});

async function renderReports(
  selectors,
  dashboardState,
  settings,
  exportState,
  reason = 'data',
  options = {}
) {
  const {
    destroyReportCharts,
    getReportCardTitle,
    renderAgeDiagnosisHeatmapChart,
    renderAgeDistributionStackedBySex,
    renderBarChart,
    renderDiagnosisTreemap,
    renderPercentLineTrend,
    renderPspcCorrelationChart,
    renderReferralDispositionYearlyChart,
    renderReferralHospitalizedByPspcChart,
    renderReferralHospitalizedByPspcTrendChart,
    renderReferralMonthlyHeatmapChart,
    toPercent,
  } = await loadReportRuntimeHelpers();
  const setReportCardLoading = (target, isLoading) => {
    const node =
      target instanceof HTMLElement
        ? target
        : typeof target === 'string' && typeof document !== 'undefined'
          ? document.getElementById(target)
          : null;
    const card = node instanceof HTMLElement ? node.closest('.report-card') : null;
    if (!(card instanceof HTMLElement)) {
      return;
    }
    if (isLoading) {
      card.dataset.loading = 'true';
      return;
    }
    delete card.dataset.loading;
  };
  const setAllReportCardsLoading = (isLoading) => {
    if (typeof document === 'undefined') {
      return;
    }
    const cards = document.querySelectorAll('.summaries-report-groups .report-card');
    cards.forEach((card) => {
      if (!(card instanceof HTMLElement)) {
        return;
      }
      if (isLoading) {
        card.dataset.loading = 'true';
      } else {
        delete card.dataset.loading;
      }
    });
  };
  const stage = options?.stage === 'primary' || options?.stage === 'secondary' ? options.stage : 'all';
  const renderPrimaryStage = stage !== 'secondary';
  const renderSecondaryStage = stage !== 'primary';
  const forceSecondary = options?.forceSecondary === true;
  const shouldRenderSecondaryNow =
    renderSecondaryStage &&
    (forceSecondary || stage === 'all' || dashboardState.summariesReportsSecondaryVisible === true);
  const primaryCardTargets = [
    selectors.diagnosisChart,
    selectors.z769TrendChart,
    selectors.referralTrendChart,
  ];
  const secondaryCardTargets = [
    selectors.ageDiagnosisHeatmapChart,
    selectors.ageDistributionChart,
    selectors.referralDispositionYearlyChart,
    selectors.referralMonthlyHeatmapChart,
    selectors.referralHospitalizedByPspcChart,
    selectors.pspcCorrelationChart,
    selectors.pspcDistributionChart,
  ];
  let clearAllInFinally = false;
  let secondaryRenderAttempted = false;
  let historicalRecords;
  let scopeMeta;
  let reports;
  let viewModels;
  const currentReportsInputs = {
    year: String(dashboardState.summariesReportsYear ?? 'all'),
    topN: Number.parseInt(String(dashboardState.summariesReportsTopN ?? 15), 10) || 15,
    minGroupSize: Number.parseInt(String(dashboardState.summariesReportsMinGroupSize ?? 100), 10) || 100,
    shiftStartHour: Number.isFinite(settings?.calculations?.shiftStartHour)
      ? settings.calculations.shiftStartHour
      : '',
  };
  const lastRenderContext = dashboardState.summariesReportsLastRenderContext || null;
  const sameComputeInputs =
    lastRenderContext?.reportsInputs &&
    lastRenderContext.reportsInputs.year === currentReportsInputs.year &&
    lastRenderContext.reportsInputs.topN === currentReportsInputs.topN &&
    lastRenderContext.reportsInputs.minGroupSize === currentReportsInputs.minGroupSize &&
    lastRenderContext.reportsInputs.shiftStartHour === currentReportsInputs.shiftStartHour;
  const canReuseCachedRender =
    (reason === 'theme' || stage === 'secondary' || (reason === 'controls' && sameComputeInputs)) &&
    lastRenderContext &&
    lastRenderContext.rawRecordsRef === dashboardState.rawRecords &&
    lastRenderContext.historicalRecords &&
    lastRenderContext.scopeMeta &&
    lastRenderContext.reports &&
    (!shouldRenderSecondaryNow || lastRenderContext.viewModels);

  try {
    if (canReuseCachedRender) {
      historicalRecords = lastRenderContext.historicalRecords;
      scopeMeta = lastRenderContext.scopeMeta;
      reports = lastRenderContext.reports;
      viewModels = lastRenderContext.viewModels;
    } else {
      historicalRecords = extractHistoricalRecords(dashboardState);
      scopeMeta = getScopedReportsMeta(
        dashboardState,
        settings,
        historicalRecords,
        dashboardState.summariesReportsYear
      );
      reports = null;
      viewModels = null;
    }
    syncReportsControls(selectors, dashboardState, scopeMeta.yearOptions);
    if (!scopeMeta.records.length) {
      dashboardState.summariesReportsHasDataRender = false;
      dashboardState.summariesReportsLastRenderContext = {
        rawRecordsRef: dashboardState.rawRecords,
        reportsInputs: currentReportsInputs,
        historicalRecords,
        scopeMeta,
        reports: null,
        viewModels: null,
      };
      destroyReportCharts(dashboardState);
      if (selectors.diagnosisInfo) {
        selectors.diagnosisInfo.textContent = TEXT.summariesReports?.empty || 'Duomenų nepakanka.';
      }
      clearAllInFinally = true;
      return;
    }
    dashboardState.summariesReportsHasDataRender = true;
    reports =
      reports ||
      (await getReportsComputationAsync(
        dashboardState,
        settings,
        historicalRecords,
        scopeMeta,
        {
          stage: shouldRenderSecondaryNow ? 'all' : 'primary',
        },
        {
          useWorker: options?.useWorkerReports === true,
          runSummariesWorkerJobFn: options?.runSummariesWorkerJob,
        }
      ));
    const chartLib = dashboardState.chartLib || (await loadChartJs());
    if (chartLib && !dashboardState.chartLib) {
      dashboardState.chartLib = chartLib;
    }
    if (!chartLib) {
      clearAllInFinally = true;
      return;
    }
    applyChartThemeDefaults(chartLib);
    const diagnosisRows = Array.isArray(reports?.diagnosis?.rows) ? reports.diagnosis.rows : [];
    const diagnosisTotalPatients = Number(reports?.diagnosis?.totalPatients || 0);
    const diagnosisPercentRows = diagnosisRows
      .filter((row) => String(row?.label || '') !== 'Kita / maža imtis')
      .map((row) => ({
        ...row,
        percent: diagnosisTotalPatients > 0 ? (Number(row?.count || 0) / diagnosisTotalPatients) * 100 : 0,
      }));
    const z769Rows = (Array.isArray(reports?.z769Trend?.rows) ? reports.z769Trend.rows : []).map((row) => ({
      ...row,
      percent: Number(row?.share || 0) * 100,
    }));
    const referralPercentRows = (
      Array.isArray(reports?.referralTrend?.rows) ? reports.referralTrend.rows : []
    ).map((row) => ({
      year: row.year,
      total: row.total,
      percent:
        Number(row?.total || 0) > 0
          ? (Number(row?.values?.['su siuntimu'] || 0) / Number(row.total)) * 100
          : 0,
    }));
    if (selectors.diagnosisInfo) {
      const topCodes = diagnosisPercentRows
        .slice(0, 6)
        .map((row) => `${row.label} (${oneDecimalFormatter.format(row.percent)}%)`)
        .join(', ');
      const baseNote = TEXT.summariesReports?.diagnosisNote || '';
      selectors.diagnosisInfo.textContent = topCodes
        ? `${baseNote} TOP kodai: ${topCodes}.`.trim()
        : baseNote;
    }
    const referralHospitalizedPspcTrendOptions = Array.isArray(
      viewModels?.referralHospitalizedPspcTrendOptions
    )
      ? viewModels.referralHospitalizedPspcTrendOptions
      : [];
    syncReportsControls(
      selectors,
      dashboardState,
      scopeMeta.yearOptions,
      referralHospitalizedPspcTrendOptions
    );
    dashboardState.summariesReportsLastRenderContext = {
      rawRecordsRef: dashboardState.rawRecords,
      reportsInputs: currentReportsInputs,
      historicalRecords,
      scopeMeta,
      reports,
      viewModels,
    };
    const colors = {
      diagnosis: getCssVar('--report-diagnosis', '#0284c7'),
      referral: getCssVar('--report-referral', '#ef4444'),
      referralDisposition: {
        hospWithReferral: getCssVar('--report-disposition-hosp-with-referral', '#ef4444'),
        dischargedWithReferral: getCssVar(
          '--report-disposition-discharged-with-referral',
          'rgba(239, 68, 68, 0.28)'
        ),
        hospWithoutReferral: getCssVar('--report-disposition-hosp-without-referral', '#2563eb'),
        dischargedWithoutReferral: getCssVar(
          '--report-disposition-discharged-without-referral',
          'rgba(37, 99, 235, 0.24)'
        ),
      },
      age: getCssVar('--report-age', '#16a34a'),
      referralPspc: getCssVar('--report-referral-pspc', '#2563eb'),
      pspc: getCssVar('--report-pspc', '#f59e0b'),
    };
    if (renderPrimaryStage) {
      const treemapRendered = await renderDiagnosisTreemap(
        dashboardState,
        chartLib,
        selectors.diagnosisChart,
        diagnosisPercentRows
      );
      if (!treemapRendered) {
        renderBarChart(
          'diagnosisFrequency',
          dashboardState,
          chartLib,
          selectors.diagnosisChart,
          diagnosisPercentRows,
          colors.diagnosis
        );
      }
      renderPercentLineTrend(
        'z769Trend',
        dashboardState,
        chartLib,
        selectors.z769TrendChart,
        z769Rows,
        'Z76.9 dalis'
      );
      renderPercentLineTrend(
        'referralTrend',
        dashboardState,
        chartLib,
        selectors.referralTrendChart,
        referralPercentRows,
        'Pacientai su siuntimu',
        colors.referral
      );

      exportState.diagnosis = {
        title: getReportCardTitle('diagnosis', 'Diagnozės', settings),
        headers: ['Diagnozė', 'Procentas (%)'],
        rows: diagnosisPercentRows.map((row) => [row.label, oneDecimalFormatter.format(row.percent)]),
        target: selectors.diagnosisChart,
      };
      exportState.z769Trend = {
        title: getReportCardTitle('z769Trend', 'Pasišalinę pacientai (Z76.9)', settings),
        headers: ['Metai', 'Procentas (%)'],
        rows: z769Rows.map((row) => [row.year, oneDecimalFormatter.format(row.percent)]),
        target: selectors.z769TrendChart,
      };
      exportState.referralTrend = {
        title: getReportCardTitle('referralTrend', 'Pacientai su siuntimu', settings),
        headers: ['Metai', 'Pacientai su siuntimu (%)'],
        rows: referralPercentRows.map((row) => [row.year, oneDecimalFormatter.format(row.percent)]),
        target: selectors.referralTrendChart,
      };
      setReportCardLoading(selectors.diagnosisChart, false);
      setReportCardLoading(selectors.z769TrendChart, false);
      setReportCardLoading(selectors.referralTrendChart, false);
    }
    if (!shouldRenderSecondaryNow) {
      return;
    }
    reports =
      reports ||
      (await getReportsComputationAsync(
        dashboardState,
        settings,
        historicalRecords,
        scopeMeta,
        { stage: 'all' },
        {
          useWorker: options?.useWorkerReports === true,
          runSummariesWorkerJobFn: options?.runSummariesWorkerJob,
        }
      ));
    viewModels =
      viewModels ||
      reports?.__workerViewModels ||
      (await getCachedSummariesReportViewModelsAsync(
        { dashboardState, settings, historicalRecords, scopeMeta, reports },
        {
          useWorker: options?.useWorkerViewModels === true,
          runSummariesWorkerJobFn: options?.runSummariesWorkerJob,
        }
      ));
    const ageDiagnosisHeatmap = reports.ageDiagnosisHeatmap;
    const referralDispositionYearly = reports.referralDispositionYearly;
    const referralMonthlyHeatmap = reports.referralMonthlyHeatmap;
    const referralHospitalizedByPspcYearly = reports.referralHospitalizedByPspcYearly;
    const ageDistributionBySex = viewModels.ageDistributionBySex;
    const ageDistributionRows = viewModels.ageDistributionRows;
    const minGroupSize = viewModels.minGroupSize;
    const topN = viewModels.topN;
    const referralHospitalizedPspcAllRows = viewModels.referralHospitalizedPspcAllRows;
    const referralHospitalizedPspcTrendCandidates = viewModels.referralHospitalizedPspcTrendCandidates;
    const pspcCorrelationRows = viewModels.pspcCorrelationRows;
    const pspcPercentRows = viewModels.pspcPercentRows;
    dashboardState.summariesReportsLastRenderContext = {
      rawRecordsRef: dashboardState.rawRecords,
      reportsInputs: currentReportsInputs,
      historicalRecords,
      scopeMeta,
      reports,
      viewModels,
    };
    secondaryRenderAttempted = true;
    await renderAgeDiagnosisHeatmapChart(
      'ageDiagnosisHeatmap',
      dashboardState,
      chartLib,
      selectors.ageDiagnosisHeatmapChart,
      ageDiagnosisHeatmap
    );
    renderReferralDispositionYearlyChart(
      'referralDispositionYearly',
      dashboardState,
      chartLib,
      selectors.referralDispositionYearlyChart,
      referralDispositionYearly,
      colors.referralDisposition
    );
    await renderReferralMonthlyHeatmapChart(
      'referralMonthlyHeatmap',
      dashboardState,
      chartLib,
      selectors.referralMonthlyHeatmapChart,
      referralMonthlyHeatmap
    );
    const referralHospitalizedPspcMode =
      String(dashboardState.summariesReferralPspcMode || 'cross').toLowerCase() === 'trend'
        ? 'trend'
        : 'cross';
    const referralHospitalizedPspcSortDirection = String(dashboardState.summariesReferralPspcSort || 'desc');
    const referralHospitalizedPspcFilteredRows = referralHospitalizedPspcAllRows.filter(
      (row) => Number(row?.referredTotal || 0) >= minGroupSize
    );
    const referralHospitalizedPspcPercentRows = sortPspcRows(
      referralHospitalizedPspcFilteredRows,
      referralHospitalizedPspcSortDirection
    ).slice(0, topN);
    if (referralHospitalizedPspcMode === 'trend') {
      const selectedPspc = String(dashboardState.summariesReferralPspcTrendPspc || '__top3__');
      const trendYears = Array.isArray(referralHospitalizedByPspcYearly?.years)
        ? referralHospitalizedByPspcYearly.years
        : [];
      let selectedRows = [];
      if (selectedPspc === '__top3__') {
        selectedRows = referralHospitalizedPspcTrendCandidates.slice(0, 3);
      } else {
        selectedRows = referralHospitalizedPspcTrendCandidates.filter((row) => row.label === selectedPspc);
      }
      if (!selectedRows.length) {
        selectedRows = referralHospitalizedPspcTrendCandidates.slice(0, 3);
      }
      const trendSeries = selectedRows.map((row) => ({
        label: row.label,
        points: Array.isArray(row.yearly) ? row.yearly : [],
      }));
      renderReferralHospitalizedByPspcTrendChart(
        'referralHospitalizedByPspc',
        dashboardState,
        chartLib,
        selectors.referralHospitalizedByPspcChart,
        { years: trendYears, series: trendSeries },
        colors.referralPspc
      );
    } else {
      renderReferralHospitalizedByPspcChart(
        'referralHospitalizedByPspc',
        dashboardState,
        chartLib,
        selectors.referralHospitalizedByPspcChart,
        referralHospitalizedPspcPercentRows,
        colors.referralPspc
      );
    }
    renderPspcCorrelationChart(
      'pspcCorrelation',
      dashboardState,
      chartLib,
      selectors.pspcCorrelationChart,
      pspcCorrelationRows
    );
    renderAgeDistributionStackedBySex(
      'ageDistribution',
      dashboardState,
      chartLib,
      selectors.ageDistributionChart,
      {
        ...ageDistributionBySex,
        rows: ageDistributionRows,
      },
      {
        Vyras: '#2563eb',
        Moteris: '#ef4444',
        'Kita/Nenurodyta': '#94a3b8',
      }
    );
    renderBarChart(
      'pspcDistribution',
      dashboardState,
      chartLib,
      selectors.pspcDistributionChart,
      pspcPercentRows,
      colors.pspc,
      { dynamicYAxis: true }
    );
    exportState.diagnosis = {
      title: getReportCardTitle('diagnosis', 'Diagnozės', settings),
      headers: ['Diagnozė', 'Procentas (%)'],
      rows: diagnosisPercentRows.map((row) => [row.label, oneDecimalFormatter.format(row.percent)]),
      target: selectors.diagnosisChart,
    };
    exportState.ageDiagnosisHeatmap = {
      title: getReportCardTitle('ageDiagnosisHeatmap', 'Amžiaus ir diagnozių grupių ryšys', settings),
      headers: [
        'Amžiaus grupė',
        'Diagnozių grupė',
        'Dalis amžiaus grupėje (%)',
        'Atvejų sk.',
        'Amžiaus grupės pacientų sk.',
      ],
      rows: ageDiagnosisHeatmap.rows.map((row) => [
        row.ageBand,
        row.diagnosisGroup,
        oneDecimalFormatter.format(row.percent),
        numberFormatter.format(row.count),
        numberFormatter.format(row.ageTotal),
      ]),
      target: selectors.ageDiagnosisHeatmapChart,
    };
    exportState.z769Trend = {
      title: getReportCardTitle('z769Trend', 'Pasišalinę pacientai (Z76.9)', settings),
      headers: ['Metai', 'Procentas (%)'],
      rows: z769Rows.map((row) => [row.year, oneDecimalFormatter.format(row.percent)]),
      target: selectors.z769TrendChart,
    };
    exportState.referralTrend = {
      title: getReportCardTitle('referralTrend', 'Pacientai su siuntimu', settings),
      headers: ['Metai', 'Pacientai su siuntimu (%)'],
      rows: referralPercentRows.map((row) => [row.year, oneDecimalFormatter.format(row.percent)]),
      target: selectors.referralTrendChart,
    };
    exportState.referralDispositionYearly = {
      title: getReportCardTitle('referralDispositionYearly', 'Siuntimas × baigtis pagal metus', settings),
      headers: ['Metai', 'Grupė', 'Hospitalizuoti (%)', 'Išleisti (%)', 'Imtis (n)'],
      rows: referralDispositionYearly.rows.flatMap((row) => {
        const suTotal = Number(row?.totals?.['su siuntimu'] || 0);
        const beTotal = Number(row?.totals?.['be siuntimo'] || 0);
        const suHosp = Number(row?.values?.['su siuntimu']?.hospitalizuoti || 0);
        const suDis = Number(row?.values?.['su siuntimu']?.isleisti || 0);
        const beHosp = Number(row?.values?.['be siuntimo']?.hospitalizuoti || 0);
        const beDis = Number(row?.values?.['be siuntimo']?.isleisti || 0);
        return [
          [
            row.year,
            'su siuntimu',
            oneDecimalFormatter.format(toPercent(suHosp, suTotal)),
            oneDecimalFormatter.format(toPercent(suDis, suTotal)),
            numberFormatter.format(suTotal),
          ],
          [
            row.year,
            'be siuntimo',
            oneDecimalFormatter.format(toPercent(beHosp, beTotal)),
            oneDecimalFormatter.format(toPercent(beDis, beTotal)),
            numberFormatter.format(beTotal),
          ],
        ];
      }),
      target: selectors.referralDispositionYearlyChart,
    };
    exportState.referralMonthlyHeatmap = {
      title: getReportCardTitle('referralMonthlyHeatmap', 'Siuntimų % pagal mėnesį', settings),
      headers: ['Metai', 'Mėnuo', 'Siuntimų dalis (%)', 'Pacientai (n)', 'Su siuntimu (n)'],
      rows: referralMonthlyHeatmap.rows.map((row) => [
        row.year,
        row.month,
        oneDecimalFormatter.format(row.share * 100),
        numberFormatter.format(row.total),
        numberFormatter.format(row.referred),
      ]),
      target: selectors.referralMonthlyHeatmapChart,
    };
    if (referralHospitalizedPspcMode === 'trend') {
      const selectedPspc = String(dashboardState.summariesReferralPspcTrendPspc || '__top3__');
      let selectedRows =
        selectedPspc === '__top3__'
          ? referralHospitalizedPspcTrendCandidates.slice(0, 3)
          : referralHospitalizedPspcTrendCandidates.filter((row) => row.label === selectedPspc);
      if (!selectedRows.length) {
        selectedRows = referralHospitalizedPspcTrendCandidates.slice(0, 3);
      }
      exportState.referralHospitalizedByPspc = {
        title: `${getReportCardTitle(
          'referralHospitalizedByPspc',
          'Hospitalizacijų dalis tarp pacientų su siuntimu pagal PSPC',
          settings
        )} (metinė dinamika)`,
        headers: [
          'PSPC',
          'Metai',
          'Hospitalizuota iš su siuntimu (%)',
          'Hospitalizuota (sk.)',
          'Pacientai su siuntimu (sk.)',
        ],
        rows: selectedRows.flatMap((row) =>
          (Array.isArray(row.yearly) ? row.yearly : []).map((point) => [
            row.label,
            point.year,
            Number.isFinite(point.share) ? oneDecimalFormatter.format(point.share * 100) : '',
            numberFormatter.format(point.hospitalizedCount || 0),
            numberFormatter.format(point.referredTotal || 0),
          ])
        ),
        target: selectors.referralHospitalizedByPspcChart,
      };
    } else {
      exportState.referralHospitalizedByPspc = {
        title: getReportCardTitle(
          'referralHospitalizedByPspc',
          'Hospitalizacijų dalis tarp pacientų su siuntimu pagal PSPC',
          settings
        ),
        headers: [
          'PSPC',
          'Hospitalizuota iš su siuntimu (%)',
          'Hospitalizuota (sk.)',
          'Pacientai su siuntimu (sk.)',
        ],
        rows: referralHospitalizedPspcPercentRows.map((row) => [
          row.label,
          oneDecimalFormatter.format(row.percent),
          numberFormatter.format(row.hospitalizedCount),
          numberFormatter.format(row.referredTotal),
        ]),
        target: selectors.referralHospitalizedByPspcChart,
      };
    }
    exportState.pspcCorrelation = {
      title: getReportCardTitle('pspcCorrelation', 'PSPC: siuntimų ir hospitalizacijų ryšys', settings),
      headers: [
        'PSPC',
        'Siuntimų dalis (%)',
        'Hospitalizacijų dalis (%)',
        'Pacientai (sk.)',
        'Su siuntimu (sk.)',
        'Hospitalizuoti (sk.)',
      ],
      rows: pspcCorrelationRows.map((row) => [
        row.label,
        oneDecimalFormatter.format(row.referralPercent),
        oneDecimalFormatter.format(row.hospitalizedPercent),
        numberFormatter.format(row.total),
        numberFormatter.format(row.referred),
        numberFormatter.format(row.hospitalized),
      ]),
      target: selectors.pspcCorrelationChart,
    };
    exportState.ageDistribution = {
      title: getReportCardTitle('ageDistribution', 'Amžius', settings),
      headers: [
        'Amžiaus grupė',
        'Iš viso (%)',
        'Vyras (%)',
        'Moteris (%)',
        'Kita/Nenurodyta (%)',
        'Iš viso (n)',
      ],
      rows: ageDistributionRows.map((row) => [
        row.label,
        oneDecimalFormatter.format(toPercent(row.total, ageDistributionBySex.total)),
        oneDecimalFormatter.format(toPercent(row.bySex?.Vyras || 0, ageDistributionBySex.total)),
        oneDecimalFormatter.format(toPercent(row.bySex?.Moteris || 0, ageDistributionBySex.total)),
        oneDecimalFormatter.format(
          toPercent(row.bySex?.['Kita/Nenurodyta'] || 0, ageDistributionBySex.total)
        ),
        numberFormatter.format(row.total),
      ]),
      target: selectors.ageDistributionChart,
    };
    exportState.pspcDistribution = {
      title: getReportCardTitle('pspcDistribution', 'PSPC', settings),
      headers: ['PSPC', 'Procentas (%)'],
      rows: pspcPercentRows.map((row) => [row.label, oneDecimalFormatter.format(row.percent)]),
      target: selectors.pspcDistributionChart,
    };
    setAllReportCardsLoading(false);
  } finally {
    if (clearAllInFinally || stage === 'all') {
      setAllReportCardsLoading(false);
    } else if (stage === 'primary') {
      primaryCardTargets.forEach((target) => {
        setReportCardLoading(target, false);
      });
    } else if (stage === 'secondary' && secondaryRenderAttempted) {
      secondaryCardTargets.forEach((target) => {
        setReportCardLoading(target, false);
      });
    }
  }
}

export async function runSummariesRuntime(core) {
  const pageConfig = core?.pageConfig || { recent: true, yearly: true };
  const selectors = createSelectorsForPage(core?.pageId || 'summaries');
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
  const getSummariesDefaults = () => ({
    year: 'all',
    topN: 15,
    minGroup: 100,
    pspcSort: 'desc',
    pspcMode: 'cross',
    pspcTrend: '__top3__',
  });
  const getSummariesFiltersState = () => ({
    year: dashboardState.summariesReportsYear,
    topN: dashboardState.summariesReportsTopN,
    minGroup: dashboardState.summariesReportsMinGroupSize,
    pspcSort: dashboardState.summariesReferralPspcSort,
    pspcMode: dashboardState.summariesReferralPspcMode,
    pspcTrend: dashboardState.summariesReferralPspcTrendPspc,
  });
  const persistSummariesQuery = () => {
    replaceUrlQuery(serializeToQuery('summaries', getSummariesFiltersState(), getSummariesDefaults()));
  };
  const updateSummariesFiltersSummary = () => {
    if (!selectors.summariesReportsFiltersSummary) {
      return;
    }
    const defaults = getSummariesDefaults();
    const parts = [];
    if (dashboardState.summariesReportsYear !== defaults.year) {
      parts.push(`Metai: ${dashboardState.summariesReportsYear}`);
    }
    if (dashboardState.summariesReportsTopN !== defaults.topN) {
      parts.push(`TOP N: ${dashboardState.summariesReportsTopN}`);
    }
    if (dashboardState.summariesReportsMinGroupSize !== defaults.minGroup) {
      parts.push(`Min. imtis: ${dashboardState.summariesReportsMinGroupSize}`);
    }
    if (dashboardState.summariesReferralPspcMode !== defaults.pspcMode) {
      parts.push(`PSPC režimas: ${dashboardState.summariesReferralPspcMode}`);
    }
    const text = buildFilterSummary({
      entries: parts,
      emptyText: 'Rodomi numatytieji ataskaitų filtrai',
    });
    selectors.summariesReportsFiltersSummary.textContent = text;
    selectors.summariesReportsFiltersSummary.dataset.default = parts.length ? 'false' : 'true';
  };
  const resetSummariesFilters = () => {
    const defaults = getSummariesDefaults();
    dashboardState.summariesReportsYear = defaults.year;
    dashboardState.summariesReportsTopN = defaults.topN;
    dashboardState.summariesReportsMinGroupSize = defaults.minGroup;
    dashboardState.summariesReferralPspcSort = defaults.pspcSort;
    dashboardState.summariesReferralPspcMode = defaults.pspcMode;
    dashboardState.summariesReferralPspcTrendPspc = defaults.pspcTrend;
  };
  const parsedSummaries = parseFromQuery('summaries', window.location.search);
  if (Object.keys(parsedSummaries).length) {
    dashboardState.summariesReportsYear =
      typeof parsedSummaries.year === 'string' && parsedSummaries.year.trim()
        ? parsedSummaries.year.trim()
        : dashboardState.summariesReportsYear;
    dashboardState.summariesReportsTopN = parsePositiveIntOrDefault(parsedSummaries.topN, 15);
    dashboardState.summariesReportsMinGroupSize = parsePositiveIntOrDefault(parsedSummaries.minGroup, 100);
    dashboardState.summariesReferralPspcSort =
      parsedSummaries.pspcSort === 'asc' ? 'asc' : dashboardState.summariesReferralPspcSort;
    dashboardState.summariesReferralPspcMode =
      parsedSummaries.pspcMode === 'trend' ? 'trend' : dashboardState.summariesReferralPspcMode;
    if (typeof parsedSummaries.pspcTrend === 'string' && parsedSummaries.pspcTrend.trim()) {
      dashboardState.summariesReferralPspcTrendPspc = parsedSummaries.pspcTrend.trim();
    }
  }
  const exportState = {};
  const handleReportExportClick = createReportExportClickHandler({
    exportState,
    getDatasetValue,
    setCopyButtonFeedback,
    writeTextToClipboard,
    formatExportFilename,
    escapeCsvCell,
  });
  const { fetchData, runSummariesWorkerJob } = createMainDataHandlers({
    settings,
    DEFAULT_SETTINGS,
    dashboardState,
    downloadCsv,
    describeError: (error, options = {}) =>
      describeError(error, { ...options, fallbackMessage: TEXT.status.error }),
    createTextSignature,
    formatUrlForDiagnostics,
  });
  applyCommonPageShellText({ selectors, settings, text: TEXT, defaultFooterSource: DEFAULT_FOOTER_SOURCE });
  if (selectors.summariesReportsSubtitle) {
    selectors.summariesReportsSubtitle.textContent =
      TEXT.summariesReports?.subtitle || selectors.summariesReportsSubtitle.textContent;
  }
  const clientConfig = runtimeClient.getClientConfig();
  const enableSummariesWorkerReports = clientConfig?.experimentalSummariesWorkerReports === true;
  let rerenderReports = () => Promise.resolve();
  let reportsRenderFrameId = null;
  let scheduledReportsRenderReason = 'controls';
  let reportsSecondaryScheduledForce = false;
  let reportsSecondaryFallbackTimerId = null;
  let hydrationFallbackTimerId = null;
  let hydrationBootstrapTimerId = null;
  let summariesPrimaryVisibleMeasured = false;
  let summariesSecondaryCompleteMeasured = false;
  let requestSummariesHistoricalHydration = () => false;
  const { applySummariesDisclosure, bindSummariesDisclosureButtons, expandSummariesForTarget } =
    createSummariesSectionCollapseFeature({
      selectors,
      dashboardState,
    });
  const isSummariesHistoricalHydrationPending = () =>
    dashboardState.mainData?.recordsHydrationState !== 'full' &&
    dashboardState.mainData?.recordsHydrationState !== 'deferred';
  const clearReportsSecondaryFallback = () => {
    if (reportsSecondaryFallbackTimerId == null) {
      return;
    }
    window.clearTimeout(reportsSecondaryFallbackTimerId);
    reportsSecondaryFallbackTimerId = null;
  };
  const clearHydrationFallback = () => {
    if (hydrationFallbackTimerId == null) {
      return;
    }
    window.clearTimeout(hydrationFallbackTimerId);
    hydrationFallbackTimerId = null;
  };
  const clearHydrationBootstrap = () => {
    if (hydrationBootstrapTimerId == null) {
      return;
    }
    window.clearTimeout(hydrationBootstrapTimerId);
    hydrationBootstrapTimerId = null;
  };
  const scheduleReportsSecondaryFallback = (reason = 'data') => {
    clearReportsSecondaryFallback();
    reportsSecondaryFallbackTimerId = window.setTimeout(() => {
      reportsSecondaryFallbackTimerId = null;
      const primaryAt = Number(dashboardState.summariesReportsPrimaryRenderedAt || 0);
      const secondaryAt = Number(dashboardState.summariesReportsSecondaryCompletedAt || 0);
      if (primaryAt > 0 && secondaryAt >= primaryAt) {
        return;
      }
      scheduleReportsSecondaryRender(`fallback:${reason}`, { forceSecondary: true });
    }, 1800);
  };
  const dispatchSummariesLifecycleEvent = (name, detail = {}) => {
    if (typeof window?.dispatchEvent !== 'function' || typeof window?.CustomEvent !== 'function') {
      return;
    }
    window.dispatchEvent(new CustomEvent(name, { detail }));
  };
  const markSummariesPerfPoint = (name) => {
    if (typeof performance?.mark !== 'function') {
      return;
    }
    try {
      performance.mark(name);
    } catch (_error) {
      // ignore
    }
  };
  const requestHistoricalHydrationIfNeeded = (reason = 'visibility') => {
    if (!isSummariesHistoricalHydrationPending()) {
      clearHydrationFallback();
      clearHydrationBootstrap();
      return false;
    }
    markSummariesPerfPoint(`app-summaries-hydration-requested:${reason}`);
    return requestSummariesHistoricalHydration() === true;
  };
  const scheduleHydrationBootstrap = (reason = 'yearly-render') => {
    if (!isSummariesHistoricalHydrationPending()) {
      clearHydrationBootstrap();
      return;
    }
    if (hydrationBootstrapTimerId != null) {
      return;
    }
    hydrationBootstrapTimerId = window.setTimeout(() => {
      hydrationBootstrapTimerId = null;
      requestHistoricalHydrationIfNeeded(`bootstrap:${reason}`);
    }, 300);
  };
  const scheduleHydrationFallback = (reason = 'primary-visible') => {
    if (!isSummariesHistoricalHydrationPending()) {
      clearHydrationFallback();
      return;
    }
    if (hydrationFallbackTimerId != null) {
      return;
    }
    hydrationFallbackTimerId = window.setTimeout(() => {
      hydrationFallbackTimerId = null;
      requestHistoricalHydrationIfNeeded(`fallback:${reason}`);
    }, 1200);
  };
  const ensureSummariesPrimaryVisibilityObserver = () => {
    if (!isSummariesHistoricalHydrationPending()) {
      return;
    }
    if (dashboardState.summariesReportsPrimaryVisibilityObserver) {
      return;
    }
    const sentinelCandidates = [
      selectors.diagnosisChart,
      selectors.z769TrendChart,
      selectors.referralTrendChart,
    ];
    const sentinels = Array.from(
      new Set(
        sentinelCandidates
          .map((node) => {
            if (!(node instanceof HTMLElement)) {
              return null;
            }
            const card = node.closest('.report-card');
            return card instanceof HTMLElement ? card : node;
          })
          .filter((node) => node instanceof HTMLElement)
      )
    );
    if (!sentinels.length) {
      requestHistoricalHydrationIfNeeded('primary-sentinel-missing');
      return;
    }
    if (typeof window.IntersectionObserver !== 'function') {
      requestHistoricalHydrationIfNeeded('primary-observer-unsupported');
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0);
        if (!visible) {
          return;
        }
        requestHistoricalHydrationIfNeeded('primary-visible');
        if (dashboardState.summariesReportsPrimaryVisibilityObserver) {
          dashboardState.summariesReportsPrimaryVisibilityObserver.disconnect();
          dashboardState.summariesReportsPrimaryVisibilityObserver = null;
        }
      },
      { root: null, rootMargin: '300px 0px', threshold: [0, 0.01] }
    );
    sentinels.forEach((node) => {
      observer.observe(node);
    });
    dashboardState.summariesReportsPrimaryVisibilityObserver = observer;
  };
  const ensureSummariesSecondaryVisibilityObserver = () => {
    if (dashboardState.summariesReportsSecondaryVisible) {
      return;
    }
    if (dashboardState.summariesReportsSecondaryVisibilityObserver) {
      return;
    }
    const sentinelCandidates = [
      selectors.ageDiagnosisHeatmapChart,
      selectors.referralMonthlyHeatmapChart,
      selectors.pspcCorrelationChart,
    ];
    const sentinels = Array.from(
      new Set(
        sentinelCandidates
          .map((node) => {
            if (!(node instanceof HTMLElement)) {
              return null;
            }
            const card = node.closest('.report-card');
            return card instanceof HTMLElement ? card : node;
          })
          .filter((node) => node instanceof HTMLElement)
      )
    );
    if (!sentinels.length) {
      dashboardState.summariesReportsSecondaryVisible = true;
      return;
    }
    if (typeof window.IntersectionObserver !== 'function') {
      dashboardState.summariesReportsSecondaryVisible = true;
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0);
        if (!visible) {
          return;
        }
        dashboardState.summariesReportsSecondaryVisible = true;
        if (dashboardState.summariesReportsSecondaryVisibilityObserver) {
          dashboardState.summariesReportsSecondaryVisibilityObserver.disconnect();
          dashboardState.summariesReportsSecondaryVisibilityObserver = null;
        }
        requestHistoricalHydrationIfNeeded('secondary-visible');
        scheduleReportsSecondaryRender('visibility');
      },
      { root: null, rootMargin: '200px 0px', threshold: [0, 0.01] }
    );
    sentinels.forEach((node) => {
      observer.observe(node);
    });
    dashboardState.summariesReportsSecondaryVisibilityObserver = observer;
  };
  const scheduleReportsSecondaryRender = (reason = 'controls', options = {}) => {
    if (isSummariesHistoricalHydrationPending()) {
      requestHistoricalHydrationIfNeeded(reason);
      return;
    }
    dashboardState.summariesReportsDeferredRenderToken =
      Number(dashboardState.summariesReportsDeferredRenderToken || 0) + 1;
    const token = dashboardState.summariesReportsDeferredRenderToken;
    dashboardState.summariesReportsSecondaryRenderReason = reason;
    reportsSecondaryScheduledForce = reportsSecondaryScheduledForce || options?.forceSecondary === true;
    if (dashboardState.summariesReportsSecondaryRenderScheduled) {
      return;
    }
    const shortDelayReasons = new Set(['visibility', 'controls', 'jump-nav', 'interaction', 'data']);
    const timeoutMs = shortDelayReasons.has(String(reason || '').toLowerCase())
      ? 80
      : reportsSecondaryScheduledForce
        ? 80
        : 1400;
    dashboardState.summariesReportsSecondaryRenderScheduled = true;
    runAfterDomAndIdle(
      async () => {
        dashboardState.summariesReportsSecondaryRenderScheduled = false;
        if (token !== dashboardState.summariesReportsDeferredRenderToken) {
          scheduleReportsSecondaryRender(dashboardState.summariesReportsSecondaryRenderReason || reason, {
            forceSecondary: reportsSecondaryScheduledForce,
          });
          return;
        }
        const forceSecondary = reportsSecondaryScheduledForce;
        reportsSecondaryScheduledForce = false;
        await renderReports(selectors, dashboardState, settings, exportState, reason, {
          stage: 'secondary',
          forceSecondary,
          useWorkerReports: enableSummariesWorkerReports,
          useWorkerViewModels: enableSummariesWorkerReports,
          runSummariesWorkerJob,
        });
        if (dashboardState.summariesReportsSecondaryVisible || forceSecondary) {
          dashboardState.summariesReportsSecondaryCompletedAt = Date.now();
          clearReportsSecondaryFallback();
          if (!summariesSecondaryCompleteMeasured) {
            summariesSecondaryCompleteMeasured = true;
            markSummariesPerfPoint('app-summaries-secondary-complete');
            dispatchSummariesLifecycleEvent('app:summaries-secondary-complete', { reason });
          }
        }
      },
      { timeout: timeoutMs }
    );
  };
  const scheduleReportsRender = (reason = 'controls') => {
    scheduledReportsRenderReason = reason;
    if (reportsRenderFrameId != null) {
      return;
    }
    const raf =
      typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (callback) => setTimeout(callback, 0);
    reportsRenderFrameId = raf(() => {
      reportsRenderFrameId = null;
      const nextReason = scheduledReportsRenderReason;
      scheduledReportsRenderReason = 'controls';
      void rerenderReports(nextReason);
    });
  };
  setupSharedPageUi({
    selectors,
    dashboardState,
    initializeTheme,
    applyTheme,
    themeStorageKey: THEME_STORAGE_KEY,
    onThemeChange: () => scheduleReportsRender('theme'),
    afterSectionNavigation: () => {
      initSummariesJumpStickyOffset(selectors);
      initSummariesJumpNavigation(selectors, {
        beforeScrollToTarget: expandSummariesForTarget,
      });
    },
  });
  applySummariesDisclosure();
  bindSummariesDisclosureButtons();
  rerenderReports = (reason = 'controls') =>
    (async () => {
      if (reason === 'controls') {
        dashboardState.summariesReportsSecondaryVisible = true;
      }
      if (reason !== 'data' && isSummariesHistoricalHydrationPending()) {
        requestHistoricalHydrationIfNeeded(reason);
        return;
      }
      markSummariesPerfPoint(`app-summaries-reports-${reason}-start`);
      await renderReports(selectors, dashboardState, settings, exportState, reason, {
        stage: 'primary',
        useWorkerReports: enableSummariesWorkerReports,
        useWorkerViewModels: enableSummariesWorkerReports,
        runSummariesWorkerJob,
      });
      markSummariesPerfPoint(`app-summaries-reports-${reason}-end`);
      if (dashboardState.summariesReportsHasDataRender !== true) {
        clearReportsSecondaryFallback();
        return;
      }
      dashboardState.summariesReportsPrimaryRenderedAt = Date.now();
      if (!summariesPrimaryVisibleMeasured) {
        summariesPrimaryVisibleMeasured = true;
        markSummariesPerfPoint('app-summaries-primary-visible');
        dispatchSummariesLifecycleEvent('app:summaries-primary-visible', { reason });
      }
      ensureSummariesPrimaryVisibilityObserver();
      scheduleHydrationFallback(reason);
      ensureSummariesSecondaryVisibilityObserver();
      scheduleReportsSecondaryRender(reason, { forceSecondary: reason === 'controls' });
      scheduleReportsSecondaryFallback(reason);
    })();
  wireSummariesInteractions({
    selectors,
    dashboardState,
    rerenderReports: () => scheduleReportsRender('controls'),
    handleReportExportClick,
    handleYearlyTableCopyClick: async (event) => {
      const { handleYearlyTableCopyClick } = await loadReportRuntimeHelpers();
      return handleYearlyTableCopyClick(event);
    },
    handleTableDownloadClick,
    storeCopyButtonBaseLabel,
    initTableDownloadButtons,
    initYearlyExpand,
    handleYearlyToggle,
    parsePositiveIntOrDefault,
    onFiltersStateChange: persistSummariesQuery,
    resetSummariesFilters,
    updateSummariesFiltersSummary,
  });
  const dataFlow = createDataFlow(
    createSummariesDataFlowConfig({
      pageConfig,
      selectors,
      dashboardState,
      text: TEXT,
      defaultSettings: DEFAULT_SETTINGS,
      autoRefreshIntervalMs: AUTO_REFRESH_INTERVAL_MS,
      runAfterDomAndIdle,
      setDatasetValue,
      setStatus: (type, details) => setStatus(selectors, type, details),
      fetchData,
      perfMonitor: runtimeClient.perfMonitor,
      describeCacheMeta,
      describeError: (error, options = {}) =>
        describeError(error, { ...options, fallbackMessage: TEXT.status.error }),
      computeDailyStats,
      filterDailyStatsByWindow,
      getDefaultChartFilters: createDefaultChartFilters,
      renderRecentTable: (recentDailyStats) => {
        renderRecentTable(selectors, recentDailyStats, TEXT.recent.empty);
      },
      computeMonthlyStats,
      computeYearlyStats,
      renderYearlyTable: (yearlyStats) => {
        renderYearlyTable(selectors, dashboardState, yearlyStats, { yearlyEmptyText: TEXT.yearly.empty });
        if (
          dashboardState.mainData?.recordsHydrationState === 'full' &&
          dashboardState.summariesHydrationMarkedFull !== true
        ) {
          dashboardState.summariesHydrationMarkedFull = true;
          clearHydrationFallback();
          clearHydrationBootstrap();
          markSummariesPerfPoint('app-summaries-hydration-complete');
        }
        scheduleHydrationBootstrap('yearly-render');
        scheduleReportsRender('data');
      },
      numberFormatter,
      getSettings: () => settings,
      getClientConfig: runtimeClient.getClientConfig,
      getAutoRefreshTimerId,
      setAutoRefreshTimerId,
    })
  );
  requestSummariesHistoricalHydration = () => dataFlow.requestDeferredHydration();
  void loadChartJs();
  dashboardState.summariesReportsHasDataRender = false;
  updateSummariesFiltersSummary();
  if (Object.keys(parsedSummaries).length === 0) {
    persistSummariesQuery();
  }
  dashboardState.summariesHydrationMarkedFull = false;
  dataFlow.scheduleInitialLoad();
}

export const runSummariesPage = runSummariesRuntime;
