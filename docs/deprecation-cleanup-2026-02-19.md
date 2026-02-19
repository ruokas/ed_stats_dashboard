# Deprecation Cleanup Audit - 2026-02-19

## Scope
- Remove deprecated browser API usage in app code.
- Remove active runtime import dependencies on `*-legacy.js`.
- Preserve runtime behavior and public runtime entrypoints.

## Baseline Before Changes
- `npm run test`: pass (35 files, 105 tests).
- `npm run lint`: pass.

## Deprecated/Legacy Findings (Before)
- Deprecated clipboard API:
  - `src/app/runtime/clipboard.js` used `document.execCommand('copy')`.
- Vendor-prefixed connection fallbacks:
  - `src/events/section-nav.js` used `navigator.mozConnection` and `navigator.webkitConnection`.
- Active runtime legacy import graph:
  - `src/app/runtime/runtimes/charts-runtime-core.js` -> `charts-runtime-legacy.js`
  - `src/app/runtime/runtimes/summaries-runtime-core.js` -> `summaries-runtime-legacy.js`
  - `src/app/runtime/runtimes/gydytojai-runtime-core.js` -> `gydytojai-runtime-legacy.js`

## Changes Implemented

### 1) Clipboard API cleanup
- Updated `src/app/runtime/clipboard.js`.
- Removed `execCommand` fallback path entirely.
- `writeTextToClipboard(text)` now:
  - returns `false` when Clipboard API is unavailable
  - returns `false` when write is rejected
  - returns `true` on successful `navigator.clipboard.writeText(text)`

### 2) Section navigation connection cleanup
- Updated `src/events/section-nav.js`.
- Prefetch decision now only reads `navigator.connection`.
- Legacy vendor-prefixed properties are no longer used.

### 3) Runtime legacy decoupling
- Renamed runtime implementation modules:
  - `src/app/runtime/runtimes/charts-runtime-legacy.js` -> `src/app/runtime/runtimes/charts-runtime-impl.js`
  - `src/app/runtime/runtimes/summaries-runtime-legacy.js` -> `src/app/runtime/runtimes/summaries-runtime-impl.js`
  - `src/app/runtime/runtimes/gydytojai-runtime-legacy.js` -> `src/app/runtime/runtimes/gydytojai-runtime-impl.js`
- Updated core import wiring:
  - `src/app/runtime/runtimes/charts-runtime-core.js` imports `charts-runtime-impl.js`
  - `src/app/runtime/runtimes/summaries-runtime-core.js` imports `summaries-runtime-impl.js`
  - `src/app/runtime/runtimes/gydytojai-runtime-core.js` imports `gydytojai-runtime-impl.js`
- Preserved stable runtime wrappers and exports:
  - `runChartsRuntime(core)`
  - `runSummariesRuntime(core)`
  - `runGydytojaiRuntime(core)`

### 4) New tests
- `tests/runtime/clipboard.test.js`
  - success path with `navigator.clipboard.writeText`
  - unavailable API returns `false`
  - rejected write returns `false`
- `tests/runtime/section-nav-mpa-prefetch.test.js`
  - verifies prefixed `mozConnection`/`webkitConnection` are not used
  - verifies `navigator.connection.saveData` disables prefetch

## Post-Change Verification Checklist
- [x] `npm run lint`
- [x] `npm run test`
- [x] `npm run depcruise`
- [ ] `npm run knip` (fails on pre-existing unused `data-worker-*.js` helper files)
- [x] grep checks:
  - no `execCommand(`
  - no `mozConnection`
  - no `webkitConnection`
  - no active imports of `*-legacy.js`

## Signoff Evidence
- `npm run lint`: pass.
- `npm run test`: pass (37 files, 110 tests).
- `npm run depcruise`: pass (no dependency violations).
- `npm query "*[deprecated]"`: `[]` (no deprecated package metadata).
- `npm run knip`: unchanged pre-existing finding of 6 unused worker helper files:
  - `data-worker-csv-parse.js`
  - `data-worker-ed-transform.js`
  - `data-worker-kpi-filters.js`
  - `data-worker-main-transform.js`
  - `data-worker-protocol.js`
  - `data-worker-transforms.js`

## Risk Assessment
- Clipboard behavior on old browsers now fails gracefully instead of deprecated fallback copy.
- Runtime behavior risk minimized by preserving implementation code and only changing module wiring.

## Rollback Steps
1. Revert the specific commit/PR for the affected scope.
2. For runtime wiring issues, restore `*-runtime-core.js` imports to previous file names.
3. Re-run targeted tests:
   - Clipboard: `tests/runtime/clipboard.test.js`
   - Section nav: `tests/runtime/section-nav-mpa-prefetch.test.js`
   - Page family runtime suites.
