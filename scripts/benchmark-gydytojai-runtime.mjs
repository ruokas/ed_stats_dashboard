#!/usr/bin/env node
import {
  buildDoctorPageQuery,
  getDoctorPageStateFromQuery,
} from '../src/app/runtime/runtimes/gydytojai-runtime-impl.js';
import { createDoctorSpecialtyResolver } from '../src/data/doctor-specialties.js';
import {
  computeDoctorDayNightMix,
  computeDoctorHospitalizationShare,
  computeDoctorLeaderboard,
  computeDoctorSpecialtyLeaderboard,
  computeDoctorSpecialtyYearlyComposition,
  computeDoctorSpecialtyYearlySmallMultiples,
  computeDoctorVolumeVsLosScatter,
  computeDoctorYearlySmallMultiples,
  createStatsComputeContext,
} from '../src/data/stats.js';
import {
  createBenchRecorder,
  parseIntArg,
  parseListArg,
  summarizeRuns,
  writeJsonArtifact,
} from './lib/bench-utils.mjs';
import { createFixtureFromProfile, listPerfProfileNames } from './lib/perf-fixtures.mjs';

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

function createDoctorOptions(fixtureMeta, useComputeContext) {
  const specialtySettings = fixtureMeta.specialtySettings;
  const resolverBundle = createDoctorSpecialtyResolver(specialtySettings, []);
  const options = {
    yearFilter: 'all',
    topN: 15,
    minCases: 30,
    sortBy: 'volume_desc',
    calculations: { shiftStartHour: 7 },
    defaultSettings: { calculations: { nightEndHour: 7 } },
    arrivalFilter: 'all',
    dispositionFilter: 'all',
    shiftFilter: 'all',
    diagnosisGroupFilter: 'all',
    specialtyFilter: 'all',
    requireMappedSpecialty: false,
    searchQuery: '',
    doctorSpecialtyResolver: resolverBundle.resolver,
  };
  if (useComputeContext) {
    options.computeContext = createStatsComputeContext();
  }
  return { options, resolverBundle };
}

function measureTotalPath(records, options, fixtureMeta) {
  const specialtyAliases = fixtureMeta.specialtySettings.doctors.specialties.groups.map(
    (group) => group.label
  );
  const selectedSpecialties = specialtyAliases.slice(0, 4);
  const selectedDoctors = fixtureMeta.doctors.slice(0, 6);
  const leaderboard = computeDoctorLeaderboard(records, options);
  computeDoctorDayNightMix(records, options);
  computeDoctorHospitalizationShare(records, options);
  computeDoctorVolumeVsLosScatter(records, options);
  computeDoctorYearlySmallMultiples(records, {
    ...options,
    metric: 'count',
    selectedDoctors,
    topN: 8,
    minCases: 20,
  });
  computeDoctorSpecialtyLeaderboard(records, options);
  computeDoctorSpecialtyYearlySmallMultiples(records, {
    ...options,
    metric: 'count',
    selectedSpecialties,
    topN: 6,
    minCases: 20,
  });
  computeDoctorSpecialtyYearlyComposition(records, {
    ...options,
    selectedSpecialties,
    topN: 6,
    minCases: 20,
  });
  return leaderboard.rows.length;
}

function runScenarioBenchmark(scenario) {
  const fixture = createFixtureFromProfile(scenario.profile);
  const records = fixture.records;
  const recorder = createBenchRecorder({
    page: 'gydytojai',
    scenario: scenario.name,
    recordsIn: records.length,
    metadata: fixture.meta.summary,
  });

  const resolverNoData = recorder.measure('stage.specialtyResolver.init', () =>
    createDoctorSpecialtyResolver(fixture.meta.specialtySettings, records)
  );
  const { options: baselineOptions } = createDoctorOptions(fixture.meta, false);
  baselineOptions.doctorSpecialtyResolver = resolverNoData.resolver;
  const { options: sharedOptions } = createDoctorOptions(fixture.meta, true);
  sharedOptions.doctorSpecialtyResolver = resolverNoData.resolver;
  const selectedSpecialties = fixture.meta.specialtySettings.doctors.specialties.groups
    .map((group) => group.label)
    .slice(0, 4);
  const selectedDoctors = fixture.meta.doctors.slice(0, 6);

  recorder.measure('stage.stats.leaderboard', () => computeDoctorLeaderboard(records, sharedOptions));
  recorder.measure('stage.stats.dayNightMix', () => computeDoctorDayNightMix(records, sharedOptions));
  recorder.measure('stage.stats.hospitalizationShare', () =>
    computeDoctorHospitalizationShare(records, sharedOptions)
  );
  recorder.measure('stage.stats.scatter', () => computeDoctorVolumeVsLosScatter(records, sharedOptions));
  recorder.measure('stage.stats.yearlySmallMultiples', () =>
    computeDoctorYearlySmallMultiples(records, {
      ...sharedOptions,
      metric: 'count',
      selectedDoctors,
      topN: 8,
      minCases: 20,
    })
  );
  recorder.measure('stage.specialty.leaderboard', () =>
    computeDoctorSpecialtyLeaderboard(records, sharedOptions)
  );
  recorder.measure('stage.specialty.yearlySmallMultiples', () =>
    computeDoctorSpecialtyYearlySmallMultiples(records, {
      ...sharedOptions,
      metric: 'count',
      selectedSpecialties,
      topN: 6,
      minCases: 20,
    })
  );
  recorder.measure('stage.specialty.yearlyComposition', () =>
    computeDoctorSpecialtyYearlyComposition(records, {
      ...sharedOptions,
      selectedSpecialties,
      topN: 6,
      minCases: 20,
    })
  );

  const sampleQuery = buildDoctorPageQuery({
    year: 'all',
    topN: 15,
    minCases: 30,
    sort: 'volume_desc',
    arrival: 'all',
    disposition: 'all',
    shift: 'all',
    specialty: 'all',
    search: '',
    tableSort: 'count_desc',
    annualMetric: 'count',
    annualSort: 'latest_desc',
    annualDoctors: selectedDoctors,
    specialtyAnnualMetric: 'count',
    specialtyAnnualSort: 'latest_desc',
    specialtyAnnualSelected: selectedSpecialties,
    gydytojaiAnnualSubview: 'doctor',
    gydytojaiFiltersAdvancedExpanded: false,
    gydytojaiSectionExpanded: ['results'],
  });
  recorder.measure('stage.query.parseBuild', () => {
    const parsed = getDoctorPageStateFromQuery(`?${sampleQuery}`);
    return buildDoctorPageQuery(parsed);
  });

  recorder.measure('stage.totalPath.baseline', () =>
    measureTotalPath(records, baselineOptions, fixture.meta)
  );
  recorder.measure('stage.totalPath.sharedComputeContext', () =>
    measureTotalPath(records, sharedOptions, fixture.meta)
  );

  return recorder.rows;
}

function main() {
  const runs = parseIntArg('runs', 6);
  const warmup = parseIntArg('warmup', 1);
  const scenarioFilter = parseListArg('scenario');
  const outFile =
    process.argv.find((arg) => arg.startsWith('--out='))?.slice(6) || 'gydytojai-bench-runs.json';
  const scenarios = buildScenarios(scenarioFilter);
  if (!scenarios.length) {
    console.error(
      `No matching gydytojai benchmark scenarios. Available: ${listPerfProfileNames().concat(['wide-cardinality', 'historical-heavy']).join(', ')}`
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
    `Gydytojai runtime benchmark (${runs} runs, ${warmup} warmups, scenarios: ${scenarios
      .map((scenario) => scenario.name)
      .join(', ')})`
  );
  console.table(summarizeRuns(allRuns, ['page', 'scenario', 'stage']));

  const grouped = new Map();
  for (const row of allRuns) {
    if (!String(row.stage).startsWith('stage.totalPath.')) continue;
    if (!grouped.has(row.stage)) grouped.set(row.stage, []);
    grouped.get(row.stage).push(row.durationMs);
  }
  const baseline = grouped.get('stage.totalPath.baseline') || [];
  const shared = grouped.get('stage.totalPath.sharedComputeContext') || [];
  const baselineMedian = baseline.slice().sort((a, b) => a - b)[Math.floor(baseline.length / 2)] ?? null;
  const sharedMedian = shared.slice().sort((a, b) => a - b)[Math.floor(shared.length / 2)] ?? null;
  if (Number.isFinite(baselineMedian) && Number.isFinite(sharedMedian) && sharedMedian > 0) {
    const speedup = Number((baselineMedian / sharedMedian).toFixed(2));
    console.log(`Shared compute context total-path speedup: ${speedup}x`);
  }
  console.log(`Wrote ${allRuns.length} rows to ${artifactPath}`);
}

main();
