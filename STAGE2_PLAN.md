# Stage 2 – Foundation Refactor Plan

## Objectives
- Unify filtering through a single controller that feeds KPIs, charts, tables, and future sections without duplicating logic.
- Replace the existing hero/header navigation with the new top-bar hierarchy and tab shell introduced in the prototype.
- Ensure state, accessibility, and loading behaviours remain stable during the structural refactor.

## Key Deliverables
1. **Global filter controller** bridging current KPI/chart filters and exposing a shared state/store.
2. **Refactored top bar** (identity, status, refresh, TV mode, settings, filter trigger) replacing the superhero banner.
3. **Tab shell implementation** with keyboard focus management, responsive behaviour, and routeable anchors.
4. **Regression safety net**: updated smoke checklist + targeted console instrumentation for filter timings.

## Architecture Notes
- `dashboardState.kpi.filters`, `dashboardState.chartFilters`, and `runKpiWorkerJob` will be merged into a single `dashboardState.filters`. Worker payloads (`transformCsvWithStats`, `applyKpiFilters`) must accept the unified filter schema.
- Filter application path: UI controls ? global controller ? worker (if raw data needed) ? `dashboardState` update ? render pipelines (`renderKpiGrid`, `renderCharts`, `renderTables`).
- Top bar replaces `.hero` and `.section-nav`; ensure sticky behaviour uses CSS vars already driving scroll offsets (`--hero-height`, `--section-nav-height`). Tabs should emit `window.history.replaceState` for deep-linking.
- Maintain fallback messaging (`dashboardState.usingFallback`, settings diagnostics) inside the new layout surface.

## Implementation Steps
1. **Prep work**
   - Introduce feature flags/scaffolding to allow incremental rollout (`DATA_LAYOUT_V2` constant or similar).
   - Snapshot current smoke checklist & telemetry hooks for before/after comparison.
2. **Global filter controller**
   - Create controller module (plain JS object or class) that normalizes filter input, debounces updates, notifies subscribers.
   - Update worker interactions: unify `runKpiWorkerJob` + chart filters, adjust message payloads, and verify `computeDailyStats` usage.
   - Refactor renderers to consume `dashboardState.filters` rather than local scope copies.
3. **Top bar + tab shell**
   - Implement markup inside `index.html` (behind feature flag if needed); remove hero nav once stable.
   - Wire accessibility: `role="tablist"`, `aria-selected`, `aria-controls`, keyboard arrow support, focus restoration.
   - Map existing section ids (`kpiHeading`, etc.) to new anchors; update `scroll-margin-top` logic for new header height.
4. **Migration of actions**
   - Move reload, TV mode, settings, filter toggle to top bar; ensure keyboard shortcuts remain.
   - Update event bindings (`handleScroll`, `sectionNavState`, `toggleTvMode`) to operate with new structure.
5. **Cleanup**
   - Remove obsolete hero styles/JS, consolidate CSS to avoid duplication.
   - Update TEXT keys for new labels (LT/EN) while preserving backwards compatibility.

## Testing & Validation
- Manual: run existing README smoke tests plus new scenarios (global filter apply, tab navigation, TV mode from top bar).
- Instrument with temporary `console.time` around filter application to hit <2s target.
- Check accessibility: keyboard tab order, screen reader announcements for tabs/filters.

## Risks & Mitigations
- **Regression in worker messaging**: add unit-esque tests by invoking worker functions with mock payloads before removal of old paths.
- **Layout shift during rollout**: keep hero markup gated until tabs verified; fall back via feature flag if issues.
- **Localization drift**: update TEXT keys + fallback strings together and run diff on LT/EN copies.

## Dependencies
- Stage 1 prototype decisions (final top bar layout, tab names) – confirmed.
- Stage 0 data flow notes for worker interfaces.
- No additional external libraries planned; reuse existing tooling (Chart.js, plain JS).

## Next Actions
1. Create feature flag scaffolding and branch workflow for Stage 2.
2. Begin global filter controller implementation with tests/instrumentation.
3. Implement top bar + tab shell in `index.html` under flag and iterate.
4. Schedule midpoint review with stakeholders to confirm behaviour before ripping out old hero nav.
