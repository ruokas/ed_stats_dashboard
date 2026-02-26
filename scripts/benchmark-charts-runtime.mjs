#!/usr/bin/env node
import { DEFAULT_SETTINGS } from '../src/app/default-settings.js';
import { createChartFlow } from '../src/app/runtime/chart-flow.js';
import {
  buildDailyWindowKeys,
  fillDailyStatsWindow,
  filterDailyStatsByWindow,
  filterDailyStatsByYear,
  filterRecordsByWindow,
  filterRecordsByYear,
} from '../src/app/runtime/chart-primitives.js';
import { sanitizeChartFilters } from '../src/app/runtime/filters.js';
import {
  computeArrivalHeatmap,
  computeFunnelStats,
  filterRecordsByChartFilters,
  filterRecordsByHeatmapFilters,
  resolveCachedHeatmapFilterData,
} from '../src/app/runtime/runtimes/charts-runtime-impl.js';
import { createDefaultChartFilters, KPI_FILTER_LABELS } from '../src/app/runtime/state.js';
import {
  computeDailyStats,
  computeHospitalizedByDepartmentAndSpsStay,
  computeHospitalizedDepartmentYearlyStayTrend,
} from '../src/data/stats.js';
import {
  createBenchRecorder,
  parseIntArg,
  parseListArg,
  summarizeRuns,
  writeJsonArtifact,
} from './lib/bench-utils.mjs';
import { createFixtureFromProfile, listPerfProfileNames } from './lib/perf-fixtures.mjs';

function createChartsFlowHarness(records, dailyStats) {
  const dashboardState = {
    rawRecords: records,
    dailyStats,
    chartPeriod: 30,
    chartYear: null,
    chartFilters: createDefaultChartFilters(),
    chartData: {
      baseRecords: records,
      baseDaily: dailyStats,
    },
  };
  const selectors = {
    chartFiltersSummary: null,
    dailyCaptionContext: null,
    dailyCaption: null,
    chartFilterArrival: null,
    chartFilterDisposition: null,
    chartFilterCardType: null,
    chartFilterCompareGmp: null,
    chartFilterArrivalButtons: [],
    chartFilterDispositionButtons: [],
    chartFilterCardTypeButtons: [],
    chartFilterCompareButtons: [],
  };
  const chartFlow = createChartFlow({
    selectors,
    dashboardState,
    TEXT: {},
    DEFAULT_SETTINGS,
    getDefaultChartFilters: createDefaultChartFilters,
    KPI_FILTER_LABELS,
    sanitizeChartFilters,
    getDatasetValue: () => '',
    setDatasetValue: () => {},
    toSentenceCase: (value) => value,
    showChartError: () => {},
    describeError: (error) => ({ log: String(error?.message || error || '') }),
    computeDailyStats,
    filterDailyStatsByWindow,
    filterDailyStatsByYear,
    filterRecordsByYear,
    filterRecordsByWindow,
    filterRecordsByChartFilters,
    computeArrivalHeatmap,
    computeFunnelStats,
    buildDailyWindowKeys,
    fillDailyStatsWindow,
    updateDailyPeriodSummary: () => {},
    syncChartPeriodButtons: () => {},
    syncChartYearControl: () => {},
    formatDailyCaption: () => '',
    renderCharts: async () => {},
    getSettings: () => ({ calculations: { shiftStartHour: 7 } }),
  });
  return { dashboardState, chartFlow };
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

function runScenarioBenchmark(scenario) {
  const fixture = createFixtureFromProfile(scenario.profile);
  const records = fixture.records;
  const recorder = createBenchRecorder({
    page: 'charts',
    scenario: scenario.name,
    recordsIn: records.length,
    metadata: fixture.meta.summary,
  });

  const dailyStats = recorder.measure('data.computeDailyStats', () =>
    computeDailyStats(records, { shiftStartHour: 7 }, DEFAULT_SETTINGS)
  );
  const { dashboardState, chartFlow } = createChartsFlowHarness(records, dailyStats);

  recorder.measure('stage.prepareChartData.cold', () => {
    chartFlow.invalidateChartDerivedCache('all');
    return chartFlow.prepareChartDataForPeriod(30);
  });
  recorder.measure('stage.prepareChartData.warm', () => chartFlow.prepareChartDataForPeriod(30));

  recorder.measure('stage.prepareChartData.filterChange', () => {
    dashboardState.chartFilters = { ...dashboardState.chartFilters, disposition: 'hospitalized' };
    return chartFlow.prepareChartDataForPeriod(30);
  });

  recorder.measure('stage.prepareChartData.yearFilter', () => {
    dashboardState.chartYear = 2024;
    return chartFlow.prepareChartDataForPeriod(0);
  });

  recorder.measure('stage.prepareChartData.reset', () => {
    dashboardState.chartYear = null;
    dashboardState.chartFilters = createDefaultChartFilters();
    return chartFlow.prepareChartDataForPeriod(30);
  });

  const chartData = {
    baseRecords: records,
    heatmapFilterCache: null,
  };
  recorder.measure('stage.heatmapFilterCache.cold', () =>
    resolveCachedHeatmapFilterData({
      chartData,
      rawRecords: records,
      filterRecordsByYearFn: filterRecordsByYear,
      filterRecordsByHeatmapFiltersFn: filterRecordsByHeatmapFilters,
      computeArrivalHeatmapFn: computeArrivalHeatmap,
      heatmapYear: 2024,
      heatmapFilters: { arrival: 'all', disposition: 'hospitalized', cardType: 'all' },
    })
  );
  recorder.measure('stage.heatmapFilterCache.warm', () =>
    resolveCachedHeatmapFilterData({
      chartData,
      rawRecords: records,
      filterRecordsByYearFn: filterRecordsByYear,
      filterRecordsByHeatmapFiltersFn: filterRecordsByHeatmapFilters,
      computeArrivalHeatmapFn: computeArrivalHeatmap,
      heatmapYear: 2024,
      heatmapFilters: { arrival: 'all', disposition: 'hospitalized', cardType: 'all' },
    })
  );

  const hospitalStats = recorder.measure('stage.hospitalTable.computeStats', () =>
    computeHospitalizedByDepartmentAndSpsStay(records, {
      calculations: { shiftStartHour: 7 },
      defaultSettings: DEFAULT_SETTINGS,
      yearFilter: 'all',
    })
  );
  const trendDepartment = hospitalStats?.rows?.[0]?.department || fixture.meta.departments[0] || 'Chirurgija';
  recorder.measure('stage.hospitalTable.departmentTrend', () =>
    computeHospitalizedDepartmentYearlyStayTrend(records, {
      calculations: { shiftStartHour: 7 },
      defaultSettings: DEFAULT_SETTINGS,
      department: trendDepartment,
    })
  );

  return recorder.rows;
}

function main() {
  const runs = parseIntArg('runs', 6);
  const warmup = parseIntArg('warmup', 1);
  const scenarioFilter = parseListArg('scenario');
  const outFile = process.argv.find((arg) => arg.startsWith('--out='))?.slice(6) || 'charts-bench-runs.json';
  const scenarios = buildScenarios(scenarioFilter);
  if (!scenarios.length) {
    console.error(
      `No matching charts benchmark scenarios. Available: ${listPerfProfileNames().concat(['wide-cardinality', 'historical-heavy']).join(', ')}`
    );
    process.exit(1);
  }

  const allRuns = [];
  for (const scenario of scenarios) {
    for (let index = 0; index < warmup; index += 1) {
      runScenarioBenchmark(scenario);
    }
    for (let index = 0; index < runs; index += 1) {
      allRuns.push(...runScenarioBenchmark(scenario));
    }
  }

  const artifactPath = writeJsonArtifact(outFile, allRuns);
  console.log(
    `Charts runtime benchmark (${runs} runs, ${warmup} warmups, scenarios: ${scenarios
      .map((scenario) => scenario.name)
      .join(', ')})`
  );
  console.table(summarizeRuns(allRuns, ['page', 'scenario', 'stage']));
  console.log(`Wrote ${allRuns.length} rows to ${artifactPath}`);
}

main();
