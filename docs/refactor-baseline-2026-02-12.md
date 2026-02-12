# Refactor Baseline (2026-02-12)

This snapshot records repository quality and scale before the aggressive maintainability refactor.

## Commands

```bash
npm run check:strict
npm run typecheck
npm run test:coverage
npm run depcruise
npm run knip:exports
npm run css:metrics
```

## Baseline Results

- `check:strict`: fails due formatter drift (`src/render/kpi-model.js`, `src/render/kpi.js`, `styles.css`, `tests/runtime/kpi-model.test.js`, `tests/runtime/kpi-renderer.test.js`).
- `typecheck`: pass.
- `test:coverage`: pass.
- `depcruise`: pass (`no dependency violations`).
- `knip:exports`: pass.

## Coverage Summary

- lines: `59.03`
- statements: `59.43`
- functions: `69.5`
- branches: `45.33`

Lowest coverage hotspots from current include set:

- `src/app/runtime/runtimes/summaries/report-export.js` (lines `19.35`)
- `src/app/runtime/runtimes/summaries/report-computation.js` (lines `30.08`)
- `src/app/runtime/network.js` (lines `33`)
- `src/app/runtime/page-ui.js` (lines `42.10`)
- `src/state/dashboardState.js` (lines `0`)
- `src/state/selectors/pages/{kpi,feedback,ed,summaries}.js` (lines `0`)

## Size / Complexity Snapshot

Top JS hotspots by lines:

- `src/app/runtime/runtimes/summaries-runtime.js` - `2025`
- `src/app/runtime/runtimes/charts-runtime.js` - `1731`
- `data-worker.js` - `1692`
- `src/data/stats.js` - `1247`
- `src/data/ed.js` - `1241`
- `src/app/runtime/features/copy-export.js` - `1019`
- `src/app/runtime/features/hourly-controls.js` - `946`

HTML duplication:

- Shared navigation/hero shell is identical across:
  - `index.html`
  - `charts.html`
  - `recent.html`
  - `summaries.html`
  - `feedback.html`
  - `ed.html`

## CSS Metrics

`npm run css:metrics`:

- total bytes: `154567`
- total lines: `7055`
- media queries: `29`
- approx selectors: `1003`

Per file:

- `styles.css`: `128257` bytes
- `css/navigation.css`: `7198` bytes
- `css/export-controls.css`: `2828` bytes
- `css/hero.css`: `9375` bytes
- `css/feedback.css`: `6909` bytes
