# Stage 0 - Discovery Alignment Notes

## Primary User Journeys (Draft)
- **Command Center Lead**: needs up-to-the-minute KPIs, incident callouts, TV-mode parity; success = fast scan (<30s) and filter presets.
- **Data Analyst**: investigates multi-week trends, compares cohorts (arrival type, disposition), exports tables; success = reusable filters, annotated context.
- **Patient Experience Coordinator**: monitors sentiment trends and recent comments, validates staffing impact; success = quick feedback summary, source filters, actionable alerts.

_Next step_: validate these personas/flows with product owner and ED stakeholders.

## Metric & Filter Inventory
- **Shared filters**: window (7-365 days), shift, arrival mode (GMP vs self), disposition (hospitalized vs discharged), card type (T/TR/CH).
- **KPI cards**: arrivals, LOS averages, boarding counts, shift mix, disposition breakdown, card volumes (review checkout in `updateKpiGrid` pipeline).
- **Charts**: daily arrivals, day-of-week counts, LOS by day, heatmap (hour x weekday arrivals), funnel (arrival -> disposition), year selector overlay.
- **Tables**: 7-day daily table, monthly/yearly aggregates (patients, LOS, night share, GMP share, delta vs prior period).
- **Feedback**: sentiment cards, trend chart with period buttons (3/6/12m), filters (respondent, source), monthly response table.
- **ED panel**: TV mode metrics and triage distribution drawing from same worker dataset.

_Action_: trace data dependencies through `dashboardState`, worker payload (`transformCsvWithStats`, `computeDailyStats`) to expose any gaps for new layout.

## Dependencies & Constraints Snapshot
- **Data ingestion**: Google Sheets CSV via `loadCsv` -> `runDataWorker`; Web Worker handles parsing, KPI filters, aggregations.
- **Localization**: `TEXT` object holds LT strings plus EN hints; updates must keep keys and fallback parity.
- **Perf considerations**: single-page app; Chart.js loaded from CDN; current layout uses dense DOM (~17k lines) so refactor must respect bundle-free constraint.
- **Accessibility**: ARIA roles on sections, tables, filter summaries; ensure new navigation honors keyboard focus and screen-reader cues.

_To do_: diagram worker -> UI data flow, capture performance baselines (First Contentful Paint, chart render time) to monitor during refactor.

## Data Flow Overview (Current)
1. **Fetch layer** (`fetchData` / `fetchFeedbackData` / `fetchEdData` in `index.html:8775`, `index.html:9233`): builds source configs from settings, handles historical + fallback CSVs, and reads cache metadata.
2. **Download & caching** (`loadCsvSource`, `downloadCsv`, `readDataCache`, `writeDataCache`): normalizes URLs, validates fallbacks, and stores records/daily stats per source.
3. **Worker transform** (`runDataWorker` -> `transformCsvWithStats` in `data-worker.js`): parses CSV, resolves column mappings, applies calculation defaults, returns normalized records plus daily aggregates.
4. **State hydration** (`dashboardState` at `index.html:7414`): stores raw records, derived windows, filter presets, chart configuration, TV mode snapshots.
5. **Derived views**:
   - KPI filters updated via `runKpiWorkerJob` to recalc daily stats without blocking UI.
   - Chart data shaped in `prepareChartData` helpers (daily/dow/funnel) before Chart.js render.
   - Tables derive from `dashboardState.dailyStats`, `monthly`, `yearly` slices.
   - Feedback and ED panels mirror the same pattern with their respective worker payloads.
6. **Rendering**: `renderKpiGrid`, `renderCharts`, `renderTables`, and `renderFeedback` read from `dashboardState`, update DOM nodes, and refresh filter summaries.
7. **Fallback signalling**: worker/loader errors bubble into `dashboardState.usingFallback` and manifest in status banners + settings diagnostics.

_Note_: Consolidating filters later will require merging `dashboardState.kpi.filters` and `dashboardState.chartFilters` pathways and adjusting worker payload schemas accordingly.

## Performance Baseline Plan
- **Metrics to capture**:
  - First Contentful Paint and Largest Contentful Paint (Chrome Lighthouse, median of 3 desktop runs).
  - Time-to-data-ready (navigation start -> `dashboardState.loading=false` after primary CSV load) via `performance.mark` wrappers.
  - Filter response latency (global filter apply -> KPI + chart repaint) measured with `performance.now()` in `applyKpiFilters` / chart update callbacks; target <2s.
  - Chart render throughput (frames per second during heatmap scroll) using Chrome Performance profiler.
  - Memory footprint of `dashboardState.rawRecords` and worker payload (monitor via Chrome heap snapshots when loading 5-year CSV).
- **Tools & setup**:
  - Use Chromium-based browser with network throttled to Fast 3G and CPU 4x slowdown to simulate worst-case command-center hardware.
  - Capture Lighthouse reports before refactor and store in `docs/perf/YYYYMMDD/` for comparison.
  - Add temporary `console.table` instrumentation (behind `DEBUG_PERF=true`) to log filter timings; remove post-baseline.
  - Record video (or use Replay) of applying filters and navigating sections to verify perceived responsiveness.
- **Risks & mitigations**:
  - CDN Chart.js load variability -> consider local mirror during tests.
  - Worker instantiation overhead for large files -> profile `runDataWorker` spin-up, explore single persistent worker if needed.
  - DOM mutation cost in tables -> benchmark virtualized table prototypes if monthly/yearly data grows (>2k rows).

## Success Criteria Draft
- Reduce above-the-fold control clutter by 40% (measured by interactive elements on initial viewport).
- Achieve <2s response when applying global filters (kpi + charts update together).
- Positive qualitative feedback from command lead + patient experience stakeholders within first week of pilot.
- Maintain existing smoke checklist pass rate and preserve offline fallback behavior.

_Pending_: confirm with stakeholders, define quantitative telemetry (GA events or manual logging) for post-launch review.
