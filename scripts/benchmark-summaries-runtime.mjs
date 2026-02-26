#!/usr/bin/env node
import { JSDOM } from 'jsdom';
import { DEFAULT_SETTINGS } from '../src/app/default-settings.js';
import { handleYearlyToggle, renderYearlyTable } from '../src/app/runtime/features/summaries-yearly-table.js';
import {
  computeReferralHospitalizedShareByPspcDetailed,
  extractHistoricalRecords,
  getReportsComputation,
  getScopedReportsMeta,
} from '../src/app/runtime/runtimes/summaries/report-computation.js';
import {
  computeSummariesReportViewModels,
  getCachedSummariesReportViewModelsAsync,
} from '../src/app/runtime/runtimes/summaries-runtime-impl.js';
import {
  computeAgeDiagnosisHeatmap,
  computeDailyStats,
  computeDiagnosisFrequency,
  computeMonthlyStats,
  computePspcDistribution,
  computePspcReferralHospitalizationCorrelation,
  computeReferralDispositionYearlyTrend,
  computeReferralMonthlyHeatmap,
  computeYearlyStats,
} from '../src/data/stats.js';
import {
  createBenchRecorder,
  parseIntArg,
  parseListArg,
  summarizeRuns,
  writeJsonArtifact,
} from './lib/bench-utils.mjs';
import { createFixtureFromProfile, listPerfProfileNames } from './lib/perf-fixtures.mjs';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><table id="yearly"></table></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  return dom;
}

function createSummariesDashboardState(records) {
  return {
    rawRecords: records,
    monthly: { all: [] },
    yearlyExpandedYears: [],
    summariesReportsYear: 'all',
    summariesReportsTopN: 15,
    summariesReportsMinGroupSize: 100,
    summariesReferralPspcSort: 'desc',
    summariesReportsScopeCache: null,
    summariesReportsComputationCache: null,
    summariesReportsDerivedCache: null,
    summariesHistoricalRecordsCache: null,
  };
}

function buildScenarios(selectedNames = []) {
  const all = [
    { name: 'small', profile: 'small' },
    { name: 'medium', profile: 'medium' },
    { name: 'large', profile: 'large' },
    { name: 'wide-cardinality', profile: 'wideCardinality' },
    { name: 'historical-heavy', profile: 'historicalHeavy' },
  ];
  if (!selectedNames.length) return all;
  const selected = new Set(selectedNames.map((value) => value.toLowerCase()));
  return all.filter(
    (scenario) => selected.has(scenario.name) || selected.has(scenario.profile.toLowerCase())
  );
}

async function runScenarioBenchmark(scenario) {
  const fixture = createFixtureFromProfile(scenario.profile);
  const records = fixture.records;
  const recorder = createBenchRecorder({
    page: 'summaries',
    scenario: scenario.name,
    recordsIn: records.length,
    metadata: fixture.meta.summary,
  });
  const settings = { calculations: { shiftStartHour: 7 } };
  const dashboardState = createSummariesDashboardState(records);

  const dailyStats = recorder.measure('yearly.computeDailyStats', () =>
    computeDailyStats(records, settings.calculations, DEFAULT_SETTINGS)
  );
  const monthlyStats = recorder.measure('yearly.computeMonthlyStats', () => computeMonthlyStats(dailyStats));
  const yearlyStats = recorder.measure('yearly.computeYearlyStats', () => computeYearlyStats(monthlyStats));
  dashboardState.monthly = { all: monthlyStats };

  const dom = installDom();
  try {
    let table = null;
    recorder.measure('yearly.renderTableDom', () => {
      table = document.getElementById('yearly');
      renderYearlyTable({ yearlyTable: table }, dashboardState, yearlyStats, {});
      return table?.childElementCount || 0;
    });
    recorder.measure('yearly.renderTableDom.expandFirstYear', () => {
      const firstToggle = table?.querySelector?.('button[data-year-toggle]');
      if (!(firstToggle instanceof dom.window.HTMLElement)) {
        return 0;
      }
      handleYearlyToggle({ yearlyTable: table }, dashboardState, { target: firstToggle });
      return table?.querySelectorAll?.('tr.yearly-child-row').length || 0;
    });
  } finally {
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.Element;
    delete globalThis.HTMLElement;
  }

  const historicalRecords = recorder.measure('reports.extractHistorical', () =>
    extractHistoricalRecords(dashboardState)
  );
  const scopeMeta = recorder.measure('reports.scopeMeta', () =>
    getScopedReportsMeta(dashboardState, settings, historicalRecords, dashboardState.summariesReportsYear)
  );

  recorder.measure('reports.fn.computeDiagnosisFrequency', () =>
    computeDiagnosisFrequency(historicalRecords, {
      yearFilter: dashboardState.summariesReportsYear,
      topN: dashboardState.summariesReportsTopN,
      calculations: settings.calculations,
      defaultSettings: DEFAULT_SETTINGS,
      scopedMeta: {
        scoped: scopeMeta.records,
        yearOptions: scopeMeta.yearOptions,
        yearFilter: scopeMeta.yearFilter,
        shiftStartHour: scopeMeta.shiftStartHour,
        coverage: scopeMeta.coverage,
      },
      excludePrefixes: ['W', 'Y', 'U', 'Z', 'X'],
    })
  );
  recorder.measure('reports.fn.computeAgeDiagnosisHeatmap', () =>
    computeAgeDiagnosisHeatmap(historicalRecords, {
      yearFilter: dashboardState.summariesReportsYear,
      topN: dashboardState.summariesReportsTopN,
      calculations: settings.calculations,
      defaultSettings: DEFAULT_SETTINGS,
      scopedMeta: {
        scoped: scopeMeta.records,
        yearOptions: scopeMeta.yearOptions,
        yearFilter: scopeMeta.yearFilter,
        shiftStartHour: scopeMeta.shiftStartHour,
        coverage: scopeMeta.coverage,
      },
      excludePrefixes: ['W', 'Y', 'U', 'Z', 'X'],
    })
  );
  recorder.measure('reports.fn.computeReferralMonthlyHeatmap', () =>
    computeReferralMonthlyHeatmap(historicalRecords, {
      yearFilter: dashboardState.summariesReportsYear,
      calculations: settings.calculations,
      defaultSettings: DEFAULT_SETTINGS,
      scopedMeta: {
        scoped: scopeMeta.records,
        yearOptions: scopeMeta.yearOptions,
        yearFilter: scopeMeta.yearFilter,
        shiftStartHour: scopeMeta.shiftStartHour,
        coverage: scopeMeta.coverage,
      },
    })
  );
  recorder.measure('reports.fn.computeReferralDispositionYearlyTrend', () =>
    computeReferralDispositionYearlyTrend(historicalRecords, {
      yearFilter: dashboardState.summariesReportsYear,
      calculations: settings.calculations,
      defaultSettings: DEFAULT_SETTINGS,
      scopedMeta: {
        scoped: scopeMeta.records,
        yearOptions: scopeMeta.yearOptions,
        yearFilter: scopeMeta.yearFilter,
        shiftStartHour: scopeMeta.shiftStartHour,
        coverage: scopeMeta.coverage,
      },
    })
  );
  recorder.measure('reports.fn.computePspcCorrelation', () =>
    computePspcReferralHospitalizationCorrelation(historicalRecords, {
      topN: dashboardState.summariesReportsTopN,
      minGroupSize: dashboardState.summariesReportsMinGroupSize,
      calculations: settings.calculations,
      defaultSettings: DEFAULT_SETTINGS,
      scopedMeta: {
        scoped: scopeMeta.records,
        yearOptions: scopeMeta.yearOptions,
        yearFilter: scopeMeta.yearFilter,
        shiftStartHour: scopeMeta.shiftStartHour,
        coverage: scopeMeta.coverage,
      },
    })
  );
  recorder.measure('reports.fn.computePspcDistribution', () =>
    computePspcDistribution(historicalRecords, {
      topN: dashboardState.summariesReportsTopN,
      minGroupSize: dashboardState.summariesReportsMinGroupSize,
      calculations: settings.calculations,
      defaultSettings: DEFAULT_SETTINGS,
      scopedMeta: {
        scoped: scopeMeta.records,
        yearOptions: scopeMeta.yearOptions,
        yearFilter: scopeMeta.yearFilter,
        shiftStartHour: scopeMeta.shiftStartHour,
        coverage: scopeMeta.coverage,
      },
    })
  );
  recorder.measure('reports.fn.computeReferralPspcDetailed', () =>
    computeReferralHospitalizedShareByPspcDetailed(scopeMeta.records)
  );

  const reports = recorder.measure('reports.computeAll.cold', () =>
    getReportsComputation(dashboardState, settings, historicalRecords, scopeMeta)
  );
  recorder.measure('reports.computeAll.warm', () =>
    getReportsComputation(dashboardState, settings, historicalRecords, scopeMeta)
  );

  await recorder.measureAsync('reports.viewModels.mainThread.cold', async () =>
    getCachedSummariesReportViewModelsAsync(
      { dashboardState, settings, historicalRecords, scopeMeta, reports },
      { useWorker: false }
    )
  );
  await recorder.measureAsync('reports.viewModels.mainThread.warm', async () =>
    getCachedSummariesReportViewModelsAsync(
      { dashboardState, settings, historicalRecords, scopeMeta, reports },
      { useWorker: false }
    )
  );

  recorder.measure('reports.viewModels.workerStub', () => {
    dashboardState.summariesReportsDerivedCache = null;
    return computeSummariesReportViewModels({ dashboardState, reports, scopeMeta });
  });

  recorder.measure('reports.recompute.filterChange', () => {
    dashboardState.summariesReportsTopN = 25;
    dashboardState.summariesReportsMinGroupSize = 150;
    dashboardState.summariesReportsComputationCache = null;
    dashboardState.summariesReportsDerivedCache = null;
    const changedReports = getReportsComputation(dashboardState, settings, historicalRecords, scopeMeta);
    return computeSummariesReportViewModels({ dashboardState, reports: changedReports, scopeMeta });
  });

  return recorder.rows;
}

async function main() {
  const runs = parseIntArg('runs', 5);
  const warmup = parseIntArg('warmup', 1);
  const scenarioFilter = parseListArg('scenario');
  const outFile =
    process.argv.find((arg) => arg.startsWith('--out='))?.slice(6) || 'summaries-bench-runs.json';
  const scenarios = buildScenarios(scenarioFilter);
  if (!scenarios.length) {
    console.error(
      `No matching summaries benchmark scenarios. Available: ${listPerfProfileNames().concat(['wide-cardinality', 'historical-heavy']).join(', ')}`
    );
    process.exit(1);
  }

  const allRuns = [];
  for (const scenario of scenarios) {
    for (let index = 0; index < warmup; index += 1) {
      await runScenarioBenchmark(scenario);
    }
    for (let index = 0; index < runs; index += 1) {
      allRuns.push(...(await runScenarioBenchmark(scenario)));
    }
  }

  const artifactPath = writeJsonArtifact(outFile, allRuns);
  console.log(
    `Summaries runtime benchmark (${runs} runs, ${warmup} warmups, scenarios: ${scenarios
      .map((scenario) => scenario.name)
      .join(', ')})`
  );
  console.table(summarizeRuns(allRuns, ['page', 'scenario', 'stage']));
  console.log(`Wrote ${allRuns.length} rows to ${artifactPath}`);
}

await main();
