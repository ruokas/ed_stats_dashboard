# Cleanup Baseline (2026-02-07)

## Runtime Inventory
- entrypoint: `main.js` -> `src/main.js` -> `src/app/runtime.js`
- page runtimes:
- `kpi` -> `src/app/runtime/pages/kpi-page.js`
- `charts` -> `src/app/runtime/pages/charts-page.js`
- `recent` -> `src/app/runtime/pages/recent-page.js`
- `summaries` -> `src/app/runtime/pages/summaries-page.js`
- `feedback` -> `src/app/runtime/pages/feedback-page.js`
- `ed` -> `src/app/runtime/pages/ed-page.js`
- removed legacy files: `src/app/runtime-legacy.js`, `src/app/runtime/pages/legacy-runner.js`

## Static Cleanup
- removed dead file: `src/events/tabs.js`
- shared theme init extracted to: `theme-init.js`, `theme-init.css`
- cache version bumped: `service-worker.js` -> `ed-static-v9`

## Manual Performance Baseline (fill in)
- Browser: Chrome incognito
- `index.html`
- DOMContentLoaded: _TBD_
- FCP: _TBD_
- JS parse/eval: _TBD_
- transferred JS: _TBD_
- `charts.html`
- DOMContentLoaded: _TBD_
- FCP: _TBD_
- JS parse/eval: _TBD_
- transferred JS: _TBD_

## Smoke Test Checklist
- navigation between all pages
- theme toggle on all pages
- charts/kpi/feedback/recent/summaries/ed render
- service worker picks updated assets after hard refresh
