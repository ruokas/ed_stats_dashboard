import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

export function parseIntArg(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  if (!arg) return fallback;
  const parsed = Number.parseInt(arg.slice(prefix.length), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseStringArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  if (!arg) return fallback;
  return String(arg.slice(prefix.length));
}

export function parseListArg(name) {
  const raw = parseStringArg(name, '');
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function median(values) {
  const list = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!list.length) return null;
  const middle = Math.floor(list.length / 2);
  if (list.length % 2 === 0) {
    return Number(((list[middle - 1] + list[middle]) / 2).toFixed(2));
  }
  return Number(list[middle].toFixed(2));
}

export function p95(values) {
  const list = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!list.length) return null;
  const index = Math.max(0, Math.ceil(list.length * 0.95) - 1);
  return Number(list[index].toFixed(2));
}

export function summarizeRuns(rows, groupKeys = ['page', 'scenario', 'stage']) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = groupKeys.map((groupKey) => String(row?.[groupKey] ?? '')).join('||');
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  }
  const summaries = [];
  for (const [compoundKey, entries] of groups.entries()) {
    const values = compoundKey.split('||');
    const summary = Object.fromEntries(groupKeys.map((key, index) => [key, values[index] || '']));
    const durations = entries.map((entry) => entry?.durationMs);
    const recordsIn = entries.map((entry) => entry?.recordsIn).filter(Number.isFinite);
    summaries.push({
      ...summary,
      runs: entries.length,
      durationMedianMs: median(durations),
      durationP95Ms: p95(durations),
      recordsInMedian: median(recordsIn),
    });
  }
  return summaries.sort((a, b) =>
    `${a.page}|${a.scenario}|${a.stage}`.localeCompare(`${b.page}|${b.scenario}|${b.stage}`)
  );
}

export function writeJsonArtifact(outputPath, payload) {
  const absolute = path.resolve(process.cwd(), outputPath);
  fs.writeFileSync(absolute, JSON.stringify(payload, null, 2));
  return absolute;
}

export function createBenchRecorder({ page, scenario, recordsIn, metadata = {} }) {
  const rows = [];
  const record = (stage, durationMs, extra = {}) => {
    rows.push({
      page,
      scenario,
      stage,
      durationMs: Number(Number(durationMs).toFixed(3)),
      recordsIn,
      metadata: { ...metadata, ...extra },
    });
  };
  const measure = (stage, fn, extra = {}) => {
    const started = performance.now();
    const result = fn();
    record(stage, performance.now() - started, extra);
    return result;
  };
  const measureAsync = async (stage, fn, extra = {}) => {
    const started = performance.now();
    const result = await fn();
    record(stage, performance.now() - started, extra);
    return result;
  };
  return { rows, record, measure, measureAsync };
}
