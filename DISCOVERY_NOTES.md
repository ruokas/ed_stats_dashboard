# Stage 0 – Discovery Alignment Notes

## Primary User Journeys (Draft)
- **Command Center Lead**: needs up-to-the-minute KPIs, incident callouts, TV-mode parity; success = fast scan (<30s) and filter presets for shift handovers.
- **Data Analyst**: investigates multi-week trends, compares cohorts (arrival type, disposition), exports tables; success = reusable filters, annotated context, CSV download parity.
- **Patient Experience Coordinator**: monitors sentiment trends and recent comments, validates staffing impact; success = quick feedback summary, source filters, actionable alerts.

_Next step_: validate these personas/flows with product owner and ED stakeholders.

## Metric & Filter Inventory
- **Shared filters**: window (7–365 days), shift, arrival mode (GMP vs self), disposition (hospitalized vs discharged), card type (T/TR/CH).
- **KPI cards**: arrivals, LOS averages, boarding counts, shift mix, disposition breakdown, card volumes (review checkout in `updateKpiGrid` pipeline).
- **Charts**: daily arrivals, day-of-week counts, LOS by day, heatmap (hour × weekday arrivals), funnel (arrival ? disposition), year selector overlay.
- **Tables**: 7-day daily table, monthly/yearly aggregates (patients, LOS, night share, GMP share, delta vs prior period).
- **Feedback**: sentiment cards, trend chart with period buttons (3/6/12m), filters (respondent, source), monthly response table.
- **ED panel**: TV mode metrics and triage distribution drawing from same worker dataset.

_Action_: trace data dependencies through `dashboardState`, worker payload (`transformCsvWithStats`, `computeDailyStats`) to expose any gaps for new layout.

## Dependencies & Constraints Snapshot
- **Data ingestion**: Google Sheets CSV via `loadCsv`; fallback demo CSV; Web Worker handles parsing, KPI filters, aggregations.
- **Localization**: `TEXT` object holds LT strings plus EN hints; updates must keep keys and fallback parity.
- **Perf considerations**: single-page app; Chart.js loaded from CDN; current layout uses dense DOM (~17k lines) so refactor must respect bundle-free constraint.
- **Accessibility**: ARIA roles on sections, tables, filter summaries; ensure new navigation honors keyboard focus and screen-reader cues.

_To do_: diagram worker ? UI data flow, capture performance baselines (First Contentful Paint, chart render time) to monitor during refactor.

## Success Criteria Draft
- Reduce above-the-fold control clutter by 40% (measured by interactive elements on initial viewport).
- Achieve <2s response when applying global filters (kpi + charts update together).
- Positive qualitative feedback from command lead + patient experience stakeholders within first week of pilot.
- Maintain existing smoke checklist pass rate and preserve offline fallback behavior.

_Pending_: confirm with stakeholders, define quantitative telemetry (GA events or manual logging) for post-launch review.
