# Refactor Safety Net

Use this checklist to keep behavior stable while refactoring.

## Baseline snapshot (before changes)
- Record a short screen capture of a full page load.
- Save a screenshot of: hero/header, KPI section, charts, ED panel, feedback section.
- Note current config: copy `config.json` to `docs/config-baseline.json`.
- Capture console output on a clean load (no filters).
- Refactor guardrail: target new or updated runtime JS modules at ~400 lines (prefer under 500).

## Smoke test (after each refactor step)
1. Open `index.html` from a local server (not file://).
2. Verify header title and status line render.
3. Wait for data load: KPI cards, charts, and tables fill in.
4. Change KPI window to 14 days and confirm values update.
5. Toggle filters (shift, GMP, disposition) and confirm summary updates.
6. Reset filters via button or Shift+R.
7. Toggle theme and verify contrast remains readable.
8. Open ED panel, search, and close it.
9. Open each page (`index.html`, `charts.html`, `recent.html`, `summaries.html`, `feedback.html`, `ed.html`) and confirm runtime initializes without console errors.
10. Run `npm run pages:check` and confirm generated page shell files are in sync.
11. Run `npm run check:refactor` and confirm strict gates pass before merge.

## Regression checklist (monthly)
- Auto refresh still runs at configured interval.
- Chart exports (copy/download) still work.
- Service worker caches CSV and offline fallback still works.
- Error messages still show when CSV is unreachable.

