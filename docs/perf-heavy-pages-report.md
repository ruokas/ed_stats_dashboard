# Heavy Page Loading Bottlenecks Report

Generated: 2026-03-05T18:30:43.707Z

## Scope

- Pages: `charts`, `summaries`, `gydytojai`
- Method: repo-scripted benchmarks + code-path audit (no manual DevTools captures)
- Note: Chart.js plugin load/canvas paint costs are only partially represented in Node benchmarks; rankings prioritize measurable compute/DOM bottlenecks.

## Ranking Rubric

- Measured time cost: median (30) + p95 (10)
- Frequency on initial load path: 20
- User-visible impact on main thread: 20
- Data-size sensitivity: 10
- Optimization leverage across paths/pages: 10

## Inputs

- `charts-bench-runs.json`
- `summaries-bench-runs.json`
- `gydytojai-bench-runs.json`

## charts

1. **Chart data preparation and cache invalidation recomputation**
Where: `src/app/runtime/chart-flow.js:347`, `src/data/stats.js:418`
Evidence (large scenario preference):
- `stage.prepareChartData.cold` (large): median 1.07 ms, p95 2.04 ms, runs=6
- `stage.prepareChartData.filterChange` (large): median 29.41 ms, p95 31.20 ms, runs=6
- `stage.prepareChartData.reset` (large): median 1.02 ms, p95 1.60 ms, runs=6
- `data.computeDailyStats` (large): median 71.50 ms, p95 81.39 ms, runs=6
Why it hurts page load: This path recomputes filtered records, daily aggregates, windows, funnel, and heatmap inputs whenever filters/year/period change.
Fix options:
- Split `prepareChartDataForPeriod()` outputs into independently invalidated caches (daily/funnel/heatmap) keyed by smaller inputs.
- Avoid recomputing `computeDailyStats()` for filter combinations that can be derived from cached year-scoped aggregates.
- Move heavier secondary prep (heatmap/hourly source data) off the primary visible stage when controls change rapidly.
Expected impact: High | Confidence: High | Score: 100

2. **Heatmap filtered recomputation on cache miss (secondary charts)**
Where: `src/app/runtime/runtimes/charts-runtime-impl.js:193`, `src/charts/index.js:198`
Evidence (large scenario preference):
- `stage.heatmapFilterCache.cold` (large): median 16.47 ms, p95 22.37 ms, runs=6
- `stage.heatmapFilterCache.warm` (large): median 0.02 ms, p95 0.03 ms, runs=6
Why it hurts page load: Heatmap generation scans filtered records and builds 7x24 matrices; cache hits are cheap, but misses are expensive and user-visible when opening/changing secondary charts.
Fix options:
- Precompute per-year/per-filter buckets or incremental aggregates for heatmap metrics.
- Warm likely heatmap variants after primary charts become visible using idle time.
- Persist heatmap cache keys across equivalent filter toggles where only unrelated controls changed.
Expected impact: Medium-High | Confidence: High | Score: 55.7

3. **Hospital table and department trend computations (plus large DOM table render)**
Where: `src/app/runtime/runtimes/charts-runtime-impl.js:1635`, `src/data/stats-hospital.js:62`, `src/data/stats-hospital.js:196`
Evidence (large scenario preference):
- `stage.hospitalTable.computeStats` (large): median 27.33 ms, p95 32.25 ms, runs=6
- `stage.hospitalTable.departmentTrend` (large): median 5.41 ms, p95 6.25 ms, runs=6
Why it hurts page load: The hospital section computes per-department LOS buckets and yearly trend data over the full record set before rendering a large table.
Fix options:
- Memoize hospital-table stats by `recordsRef + yearFilter` and separate trend cache by `department + yearFilter`.
- Render table rows in chunks or virtualize when department cardinality is high.
- Compute trend only after explicit department selection (not on every hospital-table render).
Expected impact: Medium | Confidence: High | Score: 53.4

## summaries

1. **Summaries report computation pipeline over historical records**
Where: `src/app/runtime/runtimes/summaries/report-computation.js:53`, `src/data/stats.js:1059`, `src/data/stats.js:992`, `src/data/stats.js:948`
Evidence (large scenario preference):
- `reports.computeAll.cold` (large): median 153.05 ms, p95 162.46 ms, runs=5
- `reports.fn.computeAgeDiagnosisHeatmap` (large): median 33.79 ms, p95 42.69 ms, runs=5
- `reports.fn.computeReferralMonthlyHeatmap` (large): median 37.65 ms, p95 47.79 ms, runs=5
- `reports.fn.computeReferralDispositionYearlyTrend` (large): median 44.00 ms, p95 58.36 ms, runs=5
Why it hurts page load: Cold summaries renders execute multiple historical scans (diagnosis/age/referral/PSPC) before report cards can be populated.
Fix options:
- Cache shared scoped iterators/aggregates for historical records and derive multiple report outputs from one pass.
- Offload `getReportsComputation()` to a worker for large datasets and keep main thread focused on first visible cards.
- Split primary/secondary report computations more aggressively (defer heatmaps/matrix-heavy reports until visible).
Expected impact: High | Confidence: High | Score: 99.2

2. **Historical scoping and derived view-model generation before chart rendering**
Where: `src/app/runtime/runtimes/summaries/report-computation.js:298`, `src/app/runtime/runtimes/summaries-runtime-impl.js:430`, `src/app/runtime/runtimes/summaries-runtime-impl.js:536`, `src/app/runtime/runtimes/summaries-runtime-impl.js:1619`
Evidence (large scenario preference):
- `reports.scopeMeta` (large): median 45.06 ms, p95 52.40 ms, runs=5
- `reports.viewModels.mainThread.cold` (large): median 10.82 ms, p95 11.98 ms, runs=5
- `reports.recompute.filterChange` (large): median 142.81 ms, p95 176.15 ms, runs=5
Why it hurts page load: Scoping/filter changes invalidate derived report view models and trigger additional computation before staged chart rendering can reuse data.
Fix options:
- Key and reuse derived view-model cache across stage-only rerenders and theme changes more aggressively.
- Precompute sortable PSPC/referral structures once and reuse for mode/sort toggles.
- Move non-primary view-model derivations to the secondary stage with a visibility gate.
Expected impact: Medium-High | Confidence: Medium-High | Score: 86

3. **Yearly/monthly table DOM construction on load**
Where: `src/app/runtime/features/summaries-yearly-table.js:11`, `src/data/stats.js:418`
Evidence (large scenario preference):
- `yearly.renderTableDom` (large): median 5.83 ms, p95 6.96 ms, runs=5
- `yearly.renderTableDom.expandFirstYear` (large): median 3.05 ms, p95 16.51 ms, runs=5
- `yearly.computeDailyStats` (large): median 99.45 ms, p95 123.03 ms, runs=5
Why it hurts page load: The yearly table renders parent + monthly child rows with rich cell formatting, which can dominate initial visible work even before secondary reports appear.
Fix options:
- Render only collapsed yearly rows initially; lazy-render monthly child rows on expand.
- Batch DOM row insertion using `DocumentFragment` and avoid repeated string interpolation for hidden child rows.
- Defer yearly table render until after first report cards if report cards are the primary user target.
Expected impact: High | Confidence: High | Score: 78.5

## gydytojai

1. **Repeated doctor aggregate scans across multiple widgets (baseline path)**
Where: `src/data/stats.js:1835`, `src/app/runtime/runtimes/gydytojai-runtime-impl.js:2734`
Evidence (large scenario preference):
- `stage.totalPath.baseline` (large): median 1902.68 ms, p95 1966.43 ms, runs=6
- `stage.totalPath.sharedComputeContext` (large): median 142.33 ms, p95 169.68 ms, runs=6
- `stage.stats.leaderboard` (large): median 289.01 ms, p95 351.52 ms, runs=6
Why it hurts page load: Doctor widgets reuse similar scoped doctor aggregates; without a shared compute context, the page recomputes overlapping scans many times during initial render.
Fix options:
- Ensure all doctor page computations share one `createStatsComputeContext()` instance during load and rerenders.
- Compute a single doctor aggregate per filter state and fan out leaderboard/mix/scatter/hospitalization widgets from it.
- Cache yearly small-multiples inputs separately from presentation sorting/selection state.
Expected impact: High | Confidence: High | Score: 100

2. **Specialty resolver initialization and specialty analytics passes**
Where: `src/data/doctor-specialties.js:266`, `src/data/stats.js:1854`, `src/data/stats.js:1982`, `src/data/stats.js:2102`, `src/app/runtime/runtimes/gydytojai-runtime-impl.js:2699`
Evidence (large scenario preference):
- `stage.specialtyResolver.init` (large): median 50.98 ms, p95 66.53 ms, runs=6
- `stage.specialty.leaderboard` (large): median 116.82 ms, p95 122.38 ms, runs=6
- `stage.specialty.yearlySmallMultiples` (large): median 57.96 ms, p95 70.21 ms, runs=6
- `stage.specialty.yearlyComposition` (large): median 0.05 ms, p95 0.10 ms, runs=6
Why it hurts page load: Specialty features add resolver setup plus multiple specialty-specific aggregations over the same records during the first page render.
Fix options:
- Initialize specialty resolver once per settings+records version and reuse between page updates.
- Share specialty year buckets between specialty leaderboard and both specialty annual visualizations.
- Defer specialty annual charts until specialty section is expanded/visible.
Expected impact: High | Confidence: High | Score: 50.5

3. **Doctor annual small-multiples computations on initial load**
Where: `src/data/stats.js:2381`, `src/app/runtime/runtimes/gydytojai-runtime-impl.js:2738`
Evidence (large scenario preference):
- `stage.stats.yearlySmallMultiples` (large): median 65.66 ms, p95 70.69 ms, runs=6
Why it hurts page load: Annual series generation builds per-doctor yearly metrics and trend metadata, which scales with doctor count and historical depth.
Fix options:
- Gate annual small-multiples computation behind section visibility and render a skeleton/placeholder first.
- Cache year buckets for annual views and recompute only metric selection transforms on toggle.
- Reduce default selected doctor count/top-N for initial render, then expand on interaction.
Expected impact: Medium-High | Confidence: High | Score: 45.4

## Cross-Page Bottleneck Map

- **Repeated full-dataset scans before first stable UI** (charts, summaries, gydytojai): All three pages perform multiple record scans on initial load; shared cache/context patterns can reduce main-thread work across the board.
- **Cold-cache derived computations vs warm-cache fast paths** (charts, summaries): Heatmap/report caches collapse timings dramatically on warm paths, indicating high leverage from better cache keying and reuse.
- **Large visible DOM/chart stage work after compute completes** (charts, summaries): Even with good compute timings, table/chart rendering remains user-visible work; staged rendering and visibility-gating reduce perceived latency.

## Recommended Optimization Order

1. Apply shared aggregate/cache contexts for heavy compute pages
Targets: gydytojai repeated doctor aggregates; charts prepareChartData cache splits; summaries report shared aggregates
Risk: Low-Medium | Expected impact: High
2. Visibility-gate secondary/advanced sections and charts
Targets: charts heatmap/hospital sections; summaries secondary reports; gydytojai specialty/annual sections
Risk: Low | Expected impact: High perceived latency improvement
3. Reduce large table/chart DOM work on first paint
Targets: summaries yearly table; charts hospital table
Risk: Medium | Expected impact: Medium-High
4. Move large historical report computation to worker(s)
Targets: summaries getReportsComputation/view-models; optional charts heatmap prep
Risk: Medium-High | Expected impact: High on low-end devices

## Reproducibility

- `npm run benchmark:charts-runtime`
- `npm run benchmark:summaries-runtime`
- `npm run benchmark:doctor-page`
- `npm run perf:analyze-heavy-pages`

