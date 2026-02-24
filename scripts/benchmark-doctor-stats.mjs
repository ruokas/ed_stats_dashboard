#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import {
  computeDoctorComparisonPanel,
  computeDoctorDayNightMix,
  computeDoctorHospitalizationShare,
  computeDoctorKpiDeltas,
  computeDoctorLeaderboard,
  computeDoctorMoMChanges,
  computeDoctorMonthlyTrend,
  computeDoctorVolumeVsLosScatter,
  createStatsComputeContext,
} from '../src/data/stats.js';

function parseArg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value.slice(prefix.length), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function median(values) {
  const list = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!list.length) {
    return null;
  }
  const middle = Math.floor(list.length / 2);
  if (list.length % 2 === 0) {
    return Number(((list[middle - 1] + list[middle]) / 2).toFixed(2));
  }
  return Number(list[middle].toFixed(2));
}

function p95(values) {
  const list = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!list.length) {
    return null;
  }
  const index = Math.max(0, Math.ceil(list.length * 0.95) - 1);
  return Number(list[index].toFixed(2));
}

function createRng(seed = 123456789) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function choose(rng, values) {
  return values[Math.floor(rng() * values.length)] || values[0];
}

function createSyntheticDoctorRecords(count) {
  const rng = createRng(20260224);
  const doctors = Array.from({ length: 24 }, (_, index) => `gydytojas_${String(index + 1).padStart(2, '0')}`);
  const diagnosisGroups = ['I', 'J', 'K', 'N', 'S', 'R', 'A'];
  const records = [];
  const baseUtc = Date.UTC(2024, 0, 1, 0, 0, 0);

  for (let index = 0; index < count; index += 1) {
    const dayOffset = Math.floor(rng() * 760);
    const hour = Math.floor(rng() * 24);
    const minute = Math.floor(rng() * 60);
    const arrivalMs = baseUtc + dayOffset * 24 * 3600000 + hour * 3600000 + minute * 60000;
    const losHours = Math.max(0.25, Math.min(23.5, 0.5 + rng() * 20 + (rng() > 0.95 ? 4 : 0)));
    const dischargeMs = arrivalMs + Math.round(losHours * 3600000);
    const doctor = choose(rng, doctors);
    const hospitalized = rng() > 0.67;
    const night = hour < 7 || hour >= 19;
    const ems = rng() > 0.55;
    records.push({
      sourceId: 'historical',
      hasExtendedHistoricalFields: true,
      closingDoctorNorm: doctor,
      closingDoctorRaw: doctor.replaceAll('_', ' '),
      arrival: new Date(arrivalMs),
      discharge: new Date(dischargeMs),
      hospitalized,
      night,
      ems,
      diagnosisGroup: choose(rng, diagnosisGroups),
    });
  }

  return records;
}

function benchmarkDoctorRenderPath(records, options, { useComputeContext }) {
  const sharedOptions = useComputeContext
    ? { ...options, computeContext: createStatsComputeContext() }
    : options;
  const leaderboard = computeDoctorLeaderboard(records, sharedOptions);
  const mix = computeDoctorDayNightMix(records, sharedOptions);
  const hospital = computeDoctorHospitalizationShare(records, sharedOptions);
  const scatter = computeDoctorVolumeVsLosScatter(records, sharedOptions);
  const trend = computeDoctorMonthlyTrend(records, { ...sharedOptions, selectedDoctor: '__top3__' });
  const mom = computeDoctorMoMChanges(records, sharedOptions);
  const comparison = computeDoctorComparisonPanel(records, {
    ...sharedOptions,
    selectedDoctor: leaderboard.rows[0]?.alias || '',
  });
  const deltas = computeDoctorKpiDeltas(records, sharedOptions);
  return {
    leaderboardRows: leaderboard.rows.length,
    mixRows: mix.rows.length,
    hospitalRows: hospital.rows.length,
    scatterRows: scatter.rows.length,
    trendSeries: trend.series.length,
    momRows: mom.rows.length,
    comparisonSelected: comparison.hasSelection,
    deltaActiveDoctors: deltas.delta.activeDoctors,
  };
}

const recordCount = parseArg('records', 50000);
const runs = parseArg('runs', 10);
const warmupRuns = parseArg('warmup', 2);
const records = createSyntheticDoctorRecords(recordCount);
const baseOptions = {
  yearFilter: 'all',
  topN: 15,
  minCases: 10,
  sortBy: 'volume_desc',
  calculations: { shiftStartHour: 7 },
  defaultSettings: { calculations: { nightEndHour: 7 } },
  arrivalFilter: 'all',
  dispositionFilter: 'all',
  shiftFilter: 'all',
  searchQuery: '',
};

for (let index = 0; index < warmupRuns; index += 1) {
  benchmarkDoctorRenderPath(records, baseOptions, { useComputeContext: false });
  benchmarkDoctorRenderPath(records, baseOptions, { useComputeContext: true });
}

const baselineDurations = [];
const sharedDurations = [];
let sampleOutput = null;
for (let index = 0; index < runs; index += 1) {
  let started = performance.now();
  sampleOutput = benchmarkDoctorRenderPath(records, baseOptions, { useComputeContext: false });
  baselineDurations.push(performance.now() - started);

  started = performance.now();
  sampleOutput = benchmarkDoctorRenderPath(records, baseOptions, { useComputeContext: true });
  sharedDurations.push(performance.now() - started);
}

const baselineMedian = median(baselineDurations);
const sharedMedian = median(sharedDurations);
const speedup =
  Number.isFinite(baselineMedian) && Number.isFinite(sharedMedian) && sharedMedian > 0
    ? Number((baselineMedian / sharedMedian).toFixed(2))
    : null;
const savingsPct =
  Number.isFinite(baselineMedian) && Number.isFinite(sharedMedian) && baselineMedian > 0
    ? Number((((baselineMedian - sharedMedian) / baselineMedian) * 100).toFixed(1))
    : null;

console.log(
  `Doctor stats benchmark (${recordCount} synthetic records, ${runs} measured runs, ${warmupRuns} warmups)`
);
console.table([
  {
    mode: 'baseline',
    medianMs: baselineMedian,
    p95Ms: p95(baselineDurations),
    runs,
  },
  {
    mode: 'sharedComputeContext',
    medianMs: sharedMedian,
    p95Ms: p95(sharedDurations),
    runs,
  },
]);
console.log(
  `Speedup: ${speedup == null ? 'n/a' : `${speedup}x`} | Median savings: ${
    savingsPct == null ? 'n/a' : `${savingsPct}%`
  }`
);
if (sampleOutput) {
  console.log('Sample output shape check:', sampleOutput);
}
