# Performance Harness Protocol

## Goal
Collect repeatable before/after performance runs for every page and compute medians from the same metric keys.

## Metrics
- `app:startup-total`
- `app:router-import`
- `app:page-runner`

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
