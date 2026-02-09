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
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

const inputPath = process.argv[2] || 'perf-runs.json';
const absolutePath = path.resolve(process.cwd(), inputPath);
if (!fs.existsSync(absolutePath)) {
  console.error(`Nerastas failas: ${absolutePath}`);
  process.exit(1);
}

const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
if (!Array.isArray(parsed)) {
  console.error('Tikimasi masyvo formos JSON su run įrašais.');
  process.exit(1);
}

const grouped = new Map();
parsed.forEach((run) => {
  const page = typeof run?.page === 'string' ? run.page : 'unknown';
  const cacheMode = typeof run?.cacheMode === 'string' ? run.cacheMode : 'unknown';
  const key = `${page}::${cacheMode}`;
  if (!grouped.has(key)) {
    grouped.set(key, []);
  }
  grouped.get(key).push(run);
});

const summary = [];
for (const [key, runs] of grouped.entries()) {
  const [page, cacheMode] = key.split('::');
  const startup = runs.map((run) => toNumber(run?.metrics?.['app:startup-total'])).filter(Number.isFinite);
  const routerImport = runs.map((run) => toNumber(run?.metrics?.['app:router-import'])).filter(Number.isFinite);
  const pageRunner = runs.map((run) => toNumber(run?.metrics?.['app:page-runner'])).filter(Number.isFinite);
  summary.push({
    page,
    cacheMode,
    runs: runs.length,
    startupMedianMs: median(startup),
    routerImportMedianMs: median(routerImport),
    pageRunnerMedianMs: median(pageRunner),
  });
}

console.table(summary);
