#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function median(values) {
  if (!Array.isArray(values) || !values.length) {
    return null;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2));
  }
  return Number(sorted[middle].toFixed(2));
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

const inputPath = process.argv[2] || 'worker-bench-runs.json';
const absoluteInput = path.resolve(process.cwd(), inputPath);

if (!fs.existsSync(absoluteInput)) {
  console.error(`Benchmark input not found: ${absoluteInput}`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(absoluteInput, 'utf8'));
if (!Array.isArray(payload)) {
  console.error('Expected an array of benchmark run entries.');
  process.exit(1);
}

const grouped = new Map();
for (const run of payload) {
  const operation = typeof run?.operation === 'string' ? run.operation : 'unknown';
  if (!grouped.has(operation)) {
    grouped.set(operation, []);
  }
  grouped.get(operation).push(run);
}

const rows = [];
for (const [operation, runs] of grouped.entries()) {
  const durations = runs.map((run) => toNumber(run?.durationMs)).filter((value) => Number.isFinite(value));
  const rowsIn = runs.map((run) => toNumber(run?.rowsIn)).filter((value) => Number.isFinite(value));
  const rowsOut = runs.map((run) => toNumber(run?.rowsOut)).filter((value) => Number.isFinite(value));

  rows.push({
    operation,
    runs: runs.length,
    durationMedianMs: median(durations),
    durationP95Ms:
      durations.length > 0
        ? Number(
            durations
              .slice()
              .sort((a, b) => a - b)
              [Math.max(0, Math.ceil(durations.length * 0.95) - 1)].toFixed(2)
          )
        : null,
    rowsInMedian: median(rowsIn),
    rowsOutMedian: median(rowsOut),
  });
}

console.table(rows);
