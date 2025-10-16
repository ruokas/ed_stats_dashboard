# Stage 2 Foundation Refactor Plan

> **Plain-language overview:** Stage 2 refreshes the dashboard shell so every view (KPIs, charts, tables) shares one set of filters and the top of the page uses the cleaner bar + tab layout that stakeholders approved in Stage 1. The work happens in small, testable chunks so the current dashboard keeps working during the refactor.

## What will change and where

| File | Planned updates |
| --- | --- |
| `index.html` | Add the new top bar markup (logo/identity, status, refresh, TV mode, settings, filter trigger) and the tab strip. Remove the old hero banner and section navigation once the new bar is verified. Update the existing sections so their headings match the new tab anchors and adjust CSS classes/variables for the new sticky header height. |
| `data-worker.js` | Merge separate KPI and chart filter handling into a single message format. Update worker functions such as `transformCsvWithStats`, `applyKpiFilters`, and any helpers so they understand the unified filter schema. Keep comments that explain how to extend filters later. |
| `index.html` (embedded script) | Introduce a shared `dashboardState.filters` object that every renderer and worker call can read. Replace duplicated filter logic in KPI/chart renderers with calls into a central controller. Update keyboard shortcuts and event listeners (reload, TV mode, settings, filter toggle) to target the new top bar elements. |
| `README.md` | Extend the smoke test checklist with new steps for the unified filters and tab navigation. Document how to toggle any temporary feature flag used during rollout. |
| `STAGE2_PLAN.md` | (This file) Clarify the plan and highlight checkpoints for non-technical reviewers. |

If we discover new helper files are needed (for example a dedicated `filters-controller.js`), they will live beside `index.html` and follow the same two-space indentation and naming rules from `AGENTS.md`.

## Objectives (why this matters)
- One source of truth for filters so numbers stay consistent across KPIs, charts, and tables.
- A top bar that matches the approved prototype, keeps key actions in one place, and improves keyboard navigation.
- Smooth rollout: fallback options stay available, and every change is easy to test manually.

## Detailed steps

1. **Set up safe rollout scaffolding**
   - Add a `DATA_LAYOUT_V2` (or similar) feature flag near the top of the main script. Default it to `false` so we can merge incremental work without breaking production.
   - Capture the current smoke test list from `README.md` and note load-time telemetry points to compare before/after.

2. **Create the global filter controller**
   - Inside the main script, define a plain object (for example `filterController`) that stores the active filters, normalises user input, and notifies listeners with a debounced update (`requestAnimationFrame` or `setTimeout` 150–200 ms).
   - Update `runKpiWorkerJob`, chart update calls, and any other worker messages so they all pass the same `dashboardState.filters` object. Confirm `computeDailyStats` and related helpers still receive the data they expect.
   - Adjust renderers (`renderKpiGrid`, `renderCharts`, `renderTables`) to read directly from `dashboardState.filters`. Remove local copies of filter state to avoid drift.

3. **Build the new top bar and tab shell**
   - Behind the feature flag, add semantic HTML for the top bar inside `index.html` and copy the current hero contents into it. Make sure the CSS keeps the bar sticky using the existing custom properties (`--hero-height`, `--section-nav-height`) so scroll behaviour stays stable.
   - Implement the tab list with proper accessibility attributes (`role="tablist"`, `aria-selected`, `aria-controls`). Support keyboard arrow keys to move between tabs and restore focus to the correct tab after navigation.
   - Map each tab to existing section IDs (for example `#kpi-section`, `#chart-section`) and update `scroll-margin-top` values to account for the new header height.

4. **Move actions into the new shell**
   - Rewire reload, TV mode, settings, and filter toggle buttons so they live in the new bar. Ensure keyboard shortcuts (e.g., `r` for refresh, `t` for TV mode) still call the same handlers.
   - Update scroll and section tracking (`handleScroll`, `sectionNavState`) so the active tab highlights correctly when the user scrolls.

5. **Clean up legacy code**
   - Once the new layout is stable under the feature flag, delete the old hero markup/styles and related JavaScript. Consolidate CSS rules to avoid duplicates.
   - Review the `TEXT` localisation object and add Lithuanian + English strings for any new labels introduced by the top bar or tabs.

## Testing & validation
- Follow the current smoke checklist, then add checks for: applying global filters, switching tabs with keyboard and mouse, and toggling TV mode from the new top bar.
- Temporarily wrap filter application in `console.time`/`console.timeEnd` to ensure updates finish within 2 seconds on typical data sets.
- Run an accessibility pass: confirm the tab order makes sense, screen readers announce active tabs, and focus indicators remain visible.

## Risks & safeguards
- **Worker message mismatches:** Before deleting the old filter paths, manually call the worker functions with mock data to ensure the new payload structure returns the same results.
- **Layout flicker during rollout:** Keep the hero markup behind the feature flag until the new bar is signed off. Roll back by flipping the flag if unexpected issues appear.
- **Translation drift:** Whenever you add or rename a label, update both Lithuanian and English strings together and spot-check the UI in each language.

## Dependencies and checkpoints
- Confirm Stage 1 prototype decisions (final top bar layout, tab names) so we build to the right design.
- Keep Stage 0 data flow notes handy for worker message formats.
- No new libraries are required; continue using the current stack (plain JS + Chart.js).
- After Steps 2, 3, and 5, hold quick reviews with stakeholders to confirm behaviour before moving forward.

## Next actions
1. Create the feature flag scaffolding and capture the baseline smoke checklist/timings.
2. Implement the global filter controller and update worker calls.
3. Build the top bar + tab shell under the flag and migrate existing actions.
4. Remove the legacy hero navigation and finalise documentation/testing updates.
