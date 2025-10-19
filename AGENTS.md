# Repository Guidelines

## Project Structure & Module Organization
`index.html` is the single-page dashboard; it bundles markup, styling, and the main JavaScript controllers. Keep new UI fragments adjacent to the section they extend (filters, KPI cards, charts) and mirror the existing helper function layout. `data-worker.js` contains the Web Worker responsible for CSV parsing and statistic aggregation. Add heavy data transformations there rather than the UI thread. `README.md` captures behaviour notes and smoke tests; keep it synchronized with any UX change. `LICENSE` documents the MIT terms and should remain untouched unless legal updates are required.

- The settings dialog is organised as a four-section accordion (`.settings-accordion__item`). Preserve the group order (data sources → transformations → labels → toggles), reuse the existing `data-settings-label` attributes for LT/EN copy, and drive button text through `TEXT.settingsDialog` helpers.
- Static copy inside the dialog (labels, hints, legends) is localised via `data-settings-copy` attributes that map to `TEXT.settingsDialog.sections`. When editing or adding fields, define both LT and EN strings and let `applySettingsDialogCopy()` update the DOM.

## Build, Test, and Development Commands
There is no build pipeline. Serve the project locally with `python -m http.server 8000` from the repository root, then open `http://localhost:8000/index.html`. For quick checks, launching `start index.html` in Windows is acceptable, but remember that workers cache aggressively; use `Ctrl+Shift+R` to force-refresh. When debugging CSV imports, open DevTools > Network to verify the Google Sheets CSV and the worker responses.

## Coding Style & Naming Conventions
Use two-space indentation across HTML, CSS, and JS. Favor `const` for immutable bindings, `let` only when reassignment is required, and camelCase for functions, helpers, and worker messages. Configuration and copy keys remain SCREAMING_CASE within the `TEXT` and settings objects. CSS classes follow kebab-case; keep line length near 100 characters so embedded scripts stay readable. Update both Lithuanian labels and their English fallbacks whenever text changes to preserve bilingual parity.

## Testing Guidelines
Automated tests are not in place. Run through the smoke checklist in `README.md` before committing: verify KPI filter flows, CSV source overrides, TV mode toggling, and the demo-data fallback behaviour in offline mode. Note any new manual verification steps you introduce so other contributors can reproduce them.

## Commit & Pull Request Guidelines
Commit messages follow an imperative, present-tense style (`Fix LOS variability index`, `Remove scroll constraint...`). Scope commits around cohesive UI or worker changes, isolating configuration tweaks when possible. Pull requests should provide: 1) a succinct summary of user-facing changes, 2) data sources or reproduction steps, and 3) screenshots or screen recordings for layout adjustments. Reference related issues and flag follow-up tasks to keep the dashboard operational.
