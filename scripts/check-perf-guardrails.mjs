#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function readRows(fileName) {
  const filePath = path.resolve(ROOT, fileName);
  if (!fs.existsSync(filePath)) {
    return { filePath, rows: null };
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return { filePath, rows: Array.isArray(parsed) ? parsed : [] };
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  const sorted = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!sorted.length) {
    return null;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function computeMedianByStage(rows, scenario, stage) {
  const durations = rows
    .filter((row) => String(row?.scenario || '') === scenario && String(row?.stage || '') === stage)
    .map((row) => Number(row?.durationMs));
  return median(durations);
}

const checks = [
  {
    file: 'charts-bench-runs.json',
    scenario: 'large',
    stage: 'stage.prepareChartData.cold',
    maxMedianMs: 100,
    label: 'Charts cold prepare',
  },
  {
    file: 'charts-bench-runs.json',
    scenario: 'large',
    stage: 'stage.prepareChartData.warm',
    maxMedianMs: 1,
    label: 'Charts warm prepare',
  },
  {
    file: 'summaries-bench-runs.json',
    scenario: 'large',
    stage: 'reports.computeAll.cold',
    maxMedianMs: 170,
    label: 'Summaries cold computeAll',
  },
  {
    file: 'summaries-bench-runs.json',
    scenario: 'large',
    stage: 'reports.computeAll.warm',
    maxMedianMs: 1,
    label: 'Summaries warm computeAll',
  },
  {
    file: 'gydytojai-bench-runs.json',
    scenario: 'large',
    stage: 'stage.totalPath.baseline',
    maxMedianMs: 2200,
    label: 'Gydytojai baseline total path',
  },
  {
    file: 'gydytojai-bench-runs.json',
    scenario: 'large',
    stage: 'stage.totalPath.sharedComputeContext',
    maxMedianMs: 220,
    label: 'Gydytojai shared-context total path',
  },
];

let hasFailure = false;

for (const check of checks) {
  const { filePath, rows } = readRows(check.file);
  if (rows == null) {
    console.error(`[perf-guard] Missing artifact: ${filePath}`);
    hasFailure = true;
    continue;
  }
  const value = computeMedianByStage(rows, check.scenario, check.stage);
  if (!Number.isFinite(value)) {
    console.error(
      `[perf-guard] Missing benchmark rows for ${check.label} (${check.scenario} / ${check.stage}) in ${filePath}`
    );
    hasFailure = true;
    continue;
  }
  const ok = value <= check.maxMedianMs;
  const summary = `${check.label}: median ${value.toFixed(2)} ms (limit ${check.maxMedianMs.toFixed(2)} ms)`;
  if (!ok) {
    console.error(`[perf-guard] FAIL ${summary}`);
    hasFailure = true;
    continue;
  }
  console.log(`[perf-guard] PASS ${summary}`);
}

if (hasFailure) {
  process.exit(1);
}

console.log('[perf-guard] All performance guardrails passed.');
