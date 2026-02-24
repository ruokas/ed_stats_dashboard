# Performance Harness Protocol

## Goal
Collect repeatable before/after performance runs for every page and compute medians from the same metric keys.

## Metrics
- `app:startup-total`
- `app:router-import`
- `app:page-runner`
- `app:charts-first-visible` (charts page)
- `app:charts-secondary-complete` (charts page)

## Run Matrix
- Pages: `index.html`, `charts.html`, `recent.html`, `summaries.html`, `feedback.html`, `ed.html`
- Modes:
- `cold` (DevTools: Disable cache = ON)
- `warm` (Disable cache = OFF)
- Repetitions: 3 per page per mode

## Capture Steps
1. Open the page in Chrome.
2. In console, run:
```js
performance.getEntriesByType('measure')
  .filter((entry) => entry.name.startsWith('app:'))
  .reduce((acc, entry) => {
    acc[entry.name] = Number(entry.duration.toFixed(2));
    return acc;
  }, {});
```
3. Save each run as one JSON object:
```json
{
  "page": "ed",
  "cacheMode": "cold",
  "metrics": {
    "app:startup-total": 123.45,
    "app:router-import": 34.56,
    "app:page-runner": 88.9
  }
}
```
4. Append all runs to `perf-runs.json` (array).

## Median Report
Run:
```bash
node scripts/perf-harness.mjs perf-runs.json
```

Output is grouped by `page + cacheMode` with median values for all tracked metrics.

## Charts Startup Deep-Dive (Cold-Load)

For `charts.html` cold-load optimization work, also capture:

- `app:charts-first-visible`
- `app:charts-secondary-complete`

And (when profiling is enabled) capture `PerfMonitor` rows from console for:

- `charts-data-fetch`
- `charts-main-prepare`
- `charts-primary-render`
- `charts-secondary-render`
- `charts-hospital-table-render`

Quick console helpers:

```js
performance.getEntriesByType('measure')
  .filter((entry) => entry.name.startsWith('app:'))
  .map((entry) => ({ metric: entry.name, ms: Number(entry.duration.toFixed(2)) }));
```

```js
// PerfMonitor writes console.table rows automatically when profiling is enabled.
// Copy the relevant charts-* rows for before/after comparisons.
```

## Worker Benchmark Summary

When you collect worker-level benchmark runs, aggregate them with:

```bash
node scripts/benchmark-worker.mjs worker-bench-runs.json
```

Expected input shape:

```json
[
  {
    "operation": "transformCsv",
    "durationMs": 143.5,
    "rowsIn": 18240,
    "rowsOut": 18240
  }
]
```

The script prints per-operation medians and p95 durations.

## Doctor Stats Render-Path Benchmark

To compare repeated doctor dashboard computations with and without the shared stats compute context:

```bash
npm run benchmark:doctor -- --records=50000 --runs=10
```

Optional flags:

- `--records=<n>` synthetic historical records to generate (default `50000`)
- `--runs=<n>` measured runs (default `10`)
- `--warmup=<n>` warmup runs before measuring (default `2`)

The script prints median/p95 durations for:

- `baseline` (no shared compute context)
- `sharedComputeContext` (reuses scoped + doctor aggregates across helper calls)

## KPI Renderer DOM Benchmark

To compare the legacy full-rebuild KPI renderer behavior against the current incremental renderer:

```bash
npm run benchmark:kpi-render -- --iterations=200 --runs=8
```

Optional flags:

- `--iterations=<n>` render calls per measured run (default `200`)
- `--runs=<n>` measured runs (default `8`)
- `--warmup=<n>` warmup runs (default `2`)

Scenarios reported:

- `identical` (same KPI payload repeatedly; exercises render short-circuiting)
- `alternating` (payload changes between two values; exercises node reuse/update path)

## Latest worker sample snapshot (2026-02-12)

From the current repository fixture `worker-bench-runs.json`:

- `transformCsv`: median `120.5ms`
- `transformEdCsv`: median `88.2ms`
- `applyKpiFilters`: median `17.9ms`
