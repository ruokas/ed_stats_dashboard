# Refactor Safety Net

Use this checklist to keep behavior stable while refactoring.

## Baseline snapshot (before changes)
- Record a short screen capture of a full page load.
- Save a screenshot of: hero/header, KPI section, charts, ED panel, feedback section.
- Note current config: copy `config.json` to `docs/config-baseline.json`.
- Capture console output on a clean load (no filters).

## Smoke test (after each refactor step)
1. Open `index.html` from a local server (not file://).
2. Verify header title and status line render.
3. Wait for data load: KPI cards, charts, and tables fill in.
4. Change KPI window to 14 days and confirm values update.
5. Toggle filters (shift, GMP, disposition) and confirm summary updates.
6. Reset filters via button or Shift+R.
7. Toggle theme and verify contrast remains readable.
8. Open ED panel, search, and close it.
9. Enable TV mode (Ctrl+Shift+T) and disable it.

## Regression checklist (monthly)
- Auto refresh still runs at configured interval.
- Chart exports (copy/download) still work.
- Service worker caches CSV and offline fallback still works.
- Error messages still show when CSV is unreachable.

