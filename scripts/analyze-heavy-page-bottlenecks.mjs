#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { summarizeRuns } from './lib/bench-utils.mjs';

function parseArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function readJsonArray(filePath, { required = true } = {}) {
  const absolute = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolute)) {
    if (!required) return null;
    throw new Error(`Required benchmark artifact not found: ${absolute}`);
  }
  const value = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (!Array.isArray(value)) {
    throw new Error(`Expected JSON array in ${absolute}`);
  }
  return value;
}

function buildSummaryLookup(rows) {
  const summaries = summarizeRuns(rows, ['page', 'scenario', 'stage']);
  const map = new Map();
  for (const row of summaries) {
    map.set(`${row.page}|${row.scenario}|${row.stage}`, row);
  }
  return {
    summaries,
    get(page, scenario, stage) {
      return map.get(`${page}|${scenario}|${stage}`) || null;
    },
    pick(
      page,
      stages,
      preferredScenarios = ['large', 'historical-heavy', 'wide-cardinality', 'medium', 'small']
    ) {
      const stageList = Array.isArray(stages) ? stages : [stages];
      for (const scenario of preferredScenarios) {
        const matches = stageList.map((stage) => this.get(page, scenario, stage)).filter(Boolean);
        if (matches.length) {
          return { scenario, rows: matches };
        }
      }
      const anyRows = summaries.filter((row) => row.page === page && stageList.includes(row.stage));
      if (!anyRows.length) return { scenario: null, rows: [] };
      return { scenario: anyRows[0].scenario, rows: anyRows };
    },
  };
}

const RUBRIC = Object.freeze({
  measuredMedianWeight: 30,
  measuredP95Weight: 10,
  frequencyWeight: 20,
  visibleWeight: 20,
  sensitivityWeight: 10,
  leverageWeight: 10,
});

const CAUSE_CATALOG = {
  charts: [
    {
      id: 'charts-data-prep-recompute',
      title: 'Chart data preparation and cache invalidation recomputation',
      stages: [
        'stage.prepareChartData.cold',
        'stage.prepareChartData.filterChange',
        'stage.prepareChartData.reset',
        'data.computeDailyStats',
      ],
      where: ['src/app/runtime/chart-flow.js:347', 'src/data/stats.js:418'],
      why: 'This path recomputes filtered records, daily aggregates, windows, funnel, and heatmap inputs whenever filters/year/period change.',
      fixes: [
        'Split `prepareChartDataForPeriod()` outputs into independently invalidated caches (daily/funnel/heatmap) keyed by smaller inputs.',
        'Avoid recomputing `computeDailyStats()` for filter combinations that can be derived from cached year-scoped aggregates.',
        'Move heavier secondary prep (heatmap/hourly source data) off the primary visible stage when controls change rapidly.',
      ],
      frequency: 5,
      visible: 5,
      sensitivity: 5,
      leverage: 5,
      impact: 'High',
      confidence: 'High',
    },
    {
      id: 'charts-heatmap-cache-miss',
      title: 'Heatmap filtered recomputation on cache miss (secondary charts)',
      stages: ['stage.heatmapFilterCache.cold', 'stage.heatmapFilterCache.warm'],
      where: ['src/app/runtime/runtimes/charts-runtime-impl.js:193', 'src/charts/index.js:198'],
      why: 'Heatmap generation scans filtered records and builds 7x24 matrices; cache hits are cheap, but misses are expensive and user-visible when opening/changing secondary charts.',
      fixes: [
        'Precompute per-year/per-filter buckets or incremental aggregates for heatmap metrics.',
        'Warm likely heatmap variants after primary charts become visible using idle time.',
        'Persist heatmap cache keys across equivalent filter toggles where only unrelated controls changed.',
      ],
      frequency: 4,
      visible: 4,
      sensitivity: 4,
      leverage: 3,
      impact: 'Medium-High',
      confidence: 'High',
    },
    {
      id: 'charts-hospital-table-trends',
      title: 'Hospital table and department trend computations (plus large DOM table render)',
      stages: ['stage.hospitalTable.computeStats', 'stage.hospitalTable.departmentTrend'],
      where: [
        'src/app/runtime/runtimes/charts-runtime-impl.js:1635',
        'src/data/stats-hospital.js:62',
        'src/data/stats-hospital.js:196',
      ],
      why: 'The hospital section computes per-department LOS buckets and yearly trend data over the full record set before rendering a large table.',
      fixes: [
        'Memoize hospital-table stats by `recordsRef + yearFilter` and separate trend cache by `department + yearFilter`.',
        'Render table rows in chunks or virtualize when department cardinality is high.',
        'Compute trend only after explicit department selection (not on every hospital-table render).',
      ],
      frequency: 3,
      visible: 3,
      sensitivity: 4,
      leverage: 3,
      impact: 'Medium',
      confidence: 'High',
    },
  ],
  summaries: [
    {
      id: 'summaries-report-computation-pipeline',
      title: 'Summaries report computation pipeline over historical records',
      stages: [
        'reports.computeAll.cold',
        'reports.fn.computeAgeDiagnosisHeatmap',
        'reports.fn.computeReferralMonthlyHeatmap',
        'reports.fn.computeReferralDispositionYearlyTrend',
      ],
      where: [
        'src/app/runtime/runtimes/summaries/report-computation.js:53',
        'src/data/stats.js:1059',
        'src/data/stats.js:992',
        'src/data/stats.js:948',
      ],
      why: 'Cold summaries renders execute multiple historical scans (diagnosis/age/referral/PSPC) before report cards can be populated.',
      fixes: [
        'Cache shared scoped iterators/aggregates for historical records and derive multiple report outputs from one pass.',
        'Offload `getReportsComputation()` to a worker for large datasets and keep main thread focused on first visible cards.',
        'Split primary/secondary report computations more aggressively (defer heatmaps/matrix-heavy reports until visible).',
      ],
      frequency: 5,
      visible: 5,
      sensitivity: 5,
      leverage: 5,
      impact: 'High',
      confidence: 'High',
    },
    {
      id: 'summaries-yearly-table-dom',
      title: 'Yearly/monthly table DOM construction on load',
      stages: ['yearly.renderTableDom', 'yearly.renderTableDom.expandFirstYear', 'yearly.computeDailyStats'],
      where: ['src/app/runtime/features/summaries-yearly-table.js:11', 'src/data/stats.js:418'],
      why: 'The yearly table renders parent + monthly child rows with rich cell formatting, which can dominate initial visible work even before secondary reports appear.',
      fixes: [
        'Render only collapsed yearly rows initially; lazy-render monthly child rows on expand.',
        'Batch DOM row insertion using `DocumentFragment` and avoid repeated string interpolation for hidden child rows.',
        'Defer yearly table render until after first report cards if report cards are the primary user target.',
      ],
      frequency: 5,
      visible: 5,
      sensitivity: 3,
      leverage: 3,
      impact: 'High',
      confidence: 'High',
    },
    {
      id: 'summaries-scope-and-viewmodels',
      title: 'Historical scoping and derived view-model generation before chart rendering',
      stages: ['reports.scopeMeta', 'reports.viewModels.mainThread.cold', 'reports.recompute.filterChange'],
      where: [
        'src/app/runtime/runtimes/summaries/report-computation.js:298',
        'src/app/runtime/runtimes/summaries-runtime-impl.js:430',
        'src/app/runtime/runtimes/summaries-runtime-impl.js:536',
        'src/app/runtime/runtimes/summaries-runtime-impl.js:1619',
      ],
      why: 'Scoping/filter changes invalidate derived report view models and trigger additional computation before staged chart rendering can reuse data.',
      fixes: [
        'Key and reuse derived view-model cache across stage-only rerenders and theme changes more aggressively.',
        'Precompute sortable PSPC/referral structures once and reuse for mode/sort toggles.',
        'Move non-primary view-model derivations to the secondary stage with a visibility gate.',
      ],
      frequency: 4,
      visible: 4,
      sensitivity: 4,
      leverage: 4,
      impact: 'Medium-High',
      confidence: 'Medium-High',
    },
  ],
  gydytojai: [
    {
      id: 'gydytojai-repeated-doctor-aggregates',
      title: 'Repeated doctor aggregate scans across multiple widgets (baseline path)',
      stages: ['stage.totalPath.baseline', 'stage.totalPath.sharedComputeContext', 'stage.stats.leaderboard'],
      where: ['src/data/stats.js:1835', 'src/app/runtime/runtimes/gydytojai-runtime-impl.js:2734'],
      why: 'Doctor widgets reuse similar scoped doctor aggregates; without a shared compute context, the page recomputes overlapping scans many times during initial render.',
      fixes: [
        'Ensure all doctor page computations share one `createStatsComputeContext()` instance during load and rerenders.',
        'Compute a single doctor aggregate per filter state and fan out leaderboard/mix/scatter/hospitalization widgets from it.',
        'Cache yearly small-multiples inputs separately from presentation sorting/selection state.',
      ],
      frequency: 5,
      visible: 5,
      sensitivity: 5,
      leverage: 5,
      impact: 'High',
      confidence: 'High',
    },
    {
      id: 'gydytojai-specialty-pipeline',
      title: 'Specialty resolver initialization and specialty analytics passes',
      stages: [
        'stage.specialtyResolver.init',
        'stage.specialty.leaderboard',
        'stage.specialty.yearlySmallMultiples',
        'stage.specialty.yearlyComposition',
      ],
      where: [
        'src/data/doctor-specialties.js:266',
        'src/data/stats.js:1854',
        'src/data/stats.js:1982',
        'src/data/stats.js:2102',
        'src/app/runtime/runtimes/gydytojai-runtime-impl.js:2699',
      ],
      why: 'Specialty features add resolver setup plus multiple specialty-specific aggregations over the same records during the first page render.',
      fixes: [
        'Initialize specialty resolver once per settings+records version and reuse between page updates.',
        'Share specialty year buckets between specialty leaderboard and both specialty annual visualizations.',
        'Defer specialty annual charts until specialty section is expanded/visible.',
      ],
      frequency: 4,
      visible: 4,
      sensitivity: 4,
      leverage: 4,
      impact: 'High',
      confidence: 'High',
    },
    {
      id: 'gydytojai-annual-small-multiples',
      title: 'Doctor annual small-multiples computations on initial load',
      stages: ['stage.stats.yearlySmallMultiples'],
      where: ['src/data/stats.js:2381', 'src/app/runtime/runtimes/gydytojai-runtime-impl.js:2738'],
      why: 'Annual series generation builds per-doctor yearly metrics and trend metadata, which scales with doctor count and historical depth.',
      fixes: [
        'Gate annual small-multiples computation behind section visibility and render a skeleton/placeholder first.',
        'Cache year buckets for annual views and recompute only metric selection transforms on toggle.',
        'Reduce default selected doctor count/top-N for initial render, then expand on interaction.',
      ],
      frequency: 4,
      visible: 3,
      sensitivity: 5,
      leverage: 3,
      impact: 'Medium-High',
      confidence: 'High',
    },
  ],
};

function computePageStageMax(summaryLookup, page) {
  const rows = summaryLookup.summaries.filter((row) => row.page === page);
  const largeRows = rows.filter((row) => row.scenario === 'large');
  const source = largeRows.length ? largeRows : rows;
  return {
    medianMax: Math.max(...source.map((row) => Number(row.durationMedianMs || 0)), 1),
    p95Max: Math.max(...source.map((row) => Number(row.durationP95Ms || 0)), 1),
  };
}

function scoreCause(summaryLookup, page, cause) {
  const picked = summaryLookup.pick(page, cause.stages);
  const rows = picked.rows;
  const stageMetrics = rows.map((row) => ({
    stage: row.stage,
    scenario: row.scenario,
    medianMs: Number(row.durationMedianMs || 0),
    p95Ms: Number(row.durationP95Ms || 0),
    runs: Number(row.runs || 0),
  }));
  const medians = stageMetrics.map((item) => item.medianMs).filter(Number.isFinite);
  const p95s = stageMetrics.map((item) => item.p95Ms).filter(Number.isFinite);
  const representativeMedian = medians.length ? Math.max(...medians) : 0;
  const representativeP95 = p95s.length ? Math.max(...p95s) : 0;
  const pageMax = computePageStageMax(summaryLookup, page);

  const measuredMedianScore =
    Math.min(1, representativeMedian / pageMax.medianMax) * RUBRIC.measuredMedianWeight;
  const measuredP95Score = Math.min(1, representativeP95 / pageMax.p95Max) * RUBRIC.measuredP95Weight;
  const frequencyScore = (cause.frequency / 5) * RUBRIC.frequencyWeight;
  const visibleScore = (cause.visible / 5) * RUBRIC.visibleWeight;
  const sensitivityScore = (cause.sensitivity / 5) * RUBRIC.sensitivityWeight;
  const leverageScore = (cause.leverage / 5) * RUBRIC.leverageWeight;
  const totalScore = Number(
    (
      measuredMedianScore +
      measuredP95Score +
      frequencyScore +
      visibleScore +
      sensitivityScore +
      leverageScore
    ).toFixed(1)
  );

  return {
    ...cause,
    score: totalScore,
    representativeScenario: picked.scenario,
    evidenceRows: stageMetrics,
  };
}

function rankCauses(summaryLookup) {
  const ranked = {};
  for (const [page, causes] of Object.entries(CAUSE_CATALOG)) {
    ranked[page] = causes
      .map((cause) => scoreCause(summaryLookup, page, cause))
      .sort((a, b) => b.score - a.score);
  }
  return ranked;
}

function renderEvidenceRows(rows = []) {
  if (!rows.length) return '- Benchmark rows missing for mapped stages.';
  return rows
    .map(
      (row) =>
        `- \`${row.stage}\` (${row.scenario}): median ${row.medianMs.toFixed(2)} ms, p95 ${row.p95Ms.toFixed(
          2
        )} ms, runs=${row.runs}`
    )
    .join('\n');
}

function renderCause(cause, index) {
  return [
    `${index}. **${cause.title}**`,
    `Where: ${cause.where.map((entry) => `\`${entry}\``).join(', ')}`,
    `Evidence (${cause.representativeScenario || 'n/a'} scenario preference):`,
    renderEvidenceRows(cause.evidenceRows),
    `Why it hurts page load: ${cause.why}`,
    `Fix options:`,
    ...cause.fixes.map((fix) => `- ${fix}`),
    `Expected impact: ${cause.impact} | Confidence: ${cause.confidence} | Score: ${cause.score}`,
  ].join('\n');
}

function buildCrossPageSharedCauses() {
  return [
    {
      title: 'Repeated full-dataset scans before first stable UI',
      pages: ['charts', 'summaries', 'gydytojai'],
      note: 'All three pages perform multiple record scans on initial load; shared cache/context patterns can reduce main-thread work across the board.',
    },
    {
      title: 'Cold-cache derived computations vs warm-cache fast paths',
      pages: ['charts', 'summaries'],
      note: 'Heatmap/report caches collapse timings dramatically on warm paths, indicating high leverage from better cache keying and reuse.',
    },
    {
      title: 'Large visible DOM/chart stage work after compute completes',
      pages: ['charts', 'summaries'],
      note: 'Even with good compute timings, table/chart rendering remains user-visible work; staged rendering and visibility-gating reduce perceived latency.',
    },
  ];
}

function buildOptimizationOrder(_ranked) {
  const items = [
    {
      step: 'Apply shared aggregate/cache contexts for heavy compute pages',
      targets: [
        'gydytojai repeated doctor aggregates',
        'charts prepareChartData cache splits',
        'summaries report shared aggregates',
      ],
      risk: 'Low-Medium',
      impact: 'High',
    },
    {
      step: 'Visibility-gate secondary/advanced sections and charts',
      targets: [
        'charts heatmap/hospital sections',
        'summaries secondary reports',
        'gydytojai specialty/annual sections',
      ],
      risk: 'Low',
      impact: 'High perceived latency improvement',
    },
    {
      step: 'Reduce large table/chart DOM work on first paint',
      targets: ['summaries yearly table', 'charts hospital table'],
      risk: 'Medium',
      impact: 'Medium-High',
    },
    {
      step: 'Move large historical report computation to worker(s)',
      targets: ['summaries getReportsComputation/view-models', 'optional charts heatmap prep'],
      risk: 'Medium-High',
      impact: 'High on low-end devices',
    },
  ];
  return items;
}

function generateMarkdown({ ranked, generatedAt, inputs }) {
  const lines = [];
  lines.push('# Heavy Page Loading Bottlenecks Report');
  lines.push('');
  lines.push(`Generated: ${generatedAt}`);
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('- Pages: `charts`, `summaries`, `gydytojai`');
  lines.push('- Method: repo-scripted benchmarks + code-path audit (no manual DevTools captures)');
  lines.push(
    '- Note: Chart.js plugin load/canvas paint costs are only partially represented in Node benchmarks; rankings prioritize measurable compute/DOM bottlenecks.'
  );
  lines.push('');
  lines.push('## Ranking Rubric');
  lines.push('');
  lines.push(
    `- Measured time cost: median (${RUBRIC.measuredMedianWeight}) + p95 (${RUBRIC.measuredP95Weight})`
  );
  lines.push(`- Frequency on initial load path: ${RUBRIC.frequencyWeight}`);
  lines.push(`- User-visible impact on main thread: ${RUBRIC.visibleWeight}`);
  lines.push(`- Data-size sensitivity: ${RUBRIC.sensitivityWeight}`);
  lines.push(`- Optimization leverage across paths/pages: ${RUBRIC.leverageWeight}`);
  lines.push('');
  lines.push('## Inputs');
  lines.push('');
  lines.push(`- \`${inputs.charts}\``);
  lines.push(`- \`${inputs.summaries}\``);
  lines.push(`- \`${inputs.gydytojai}\``);
  lines.push('');

  for (const page of ['charts', 'summaries', 'gydytojai']) {
    lines.push(`## ${page}`);
    lines.push('');
    const top = (ranked[page] || []).slice(0, 3);
    top.forEach((cause, index) => {
      lines.push(renderCause(cause, index + 1));
      lines.push('');
    });
  }

  lines.push('## Cross-Page Bottleneck Map');
  lines.push('');
  for (const item of buildCrossPageSharedCauses()) {
    lines.push(`- **${item.title}** (${item.pages.join(', ')}): ${item.note}`);
  }
  lines.push('');
  lines.push('## Recommended Optimization Order');
  lines.push('');
  buildOptimizationOrder(ranked).forEach((item, index) => {
    lines.push(`${index + 1}. ${item.step}`);
    lines.push(`Targets: ${item.targets.join('; ')}`);
    lines.push(`Risk: ${item.risk} | Expected impact: ${item.impact}`);
  });
  lines.push('');
  lines.push('## Reproducibility');
  lines.push('');
  lines.push('- `npm run benchmark:charts-runtime`');
  lines.push('- `npm run benchmark:summaries-runtime`');
  lines.push('- `npm run benchmark:doctor-page`');
  lines.push('- `npm run perf:analyze-heavy-pages`');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const chartsPath = parseArg('charts', 'charts-bench-runs.json');
  const summariesPath = parseArg('summaries', 'summaries-bench-runs.json');
  const gydytojaiPath = parseArg('gydytojai', 'gydytojai-bench-runs.json');
  const outPath = parseArg('out', 'docs/perf-heavy-pages-report.md');
  const outJsonPath = parseArg('out-json', 'docs/perf-heavy-pages-report.json');

  const chartsRows = readJsonArray(chartsPath);
  const summariesRows = readJsonArray(summariesPath);
  const gydytojaiRows = readJsonArray(gydytojaiPath);
  const allRows = [...chartsRows, ...summariesRows, ...gydytojaiRows];
  const summaryLookup = buildSummaryLookup(allRows);
  const ranked = rankCauses(summaryLookup);

  const markdown = generateMarkdown({
    ranked,
    generatedAt: new Date().toISOString(),
    inputs: {
      charts: chartsPath,
      summaries: summariesPath,
      gydytojai: gydytojaiPath,
    },
  });

  fs.writeFileSync(path.resolve(process.cwd(), outPath), markdown);
  fs.writeFileSync(
    path.resolve(process.cwd(), outJsonPath),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        rubric: RUBRIC,
        ranked,
      },
      null,
      2
    )
  );

  console.log(`Wrote markdown report: ${path.resolve(process.cwd(), outPath)}`);
  console.log(`Wrote JSON summary: ${path.resolve(process.cwd(), outJsonPath)}`);
  for (const page of ['charts', 'summaries', 'gydytojai']) {
    const top = (ranked[page] || []).slice(0, 3);
    console.table(
      top.map((cause, index) => ({
        rank: index + 1,
        page,
        cause: cause.title,
        score: cause.score,
        scenario: cause.representativeScenario,
      }))
    );
  }
}

main();
