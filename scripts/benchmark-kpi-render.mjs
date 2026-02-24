#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import { JSDOM } from 'jsdom';
import { getMetricLabelOverride, isMetricEnabled } from '../src/metrics/catalog-overrides.js';
import { getMetricsBySurface } from '../src/metrics/index.js';
import { resolveMetric } from '../src/metrics/resolve-metric.js';
import { createKpiRenderer } from '../src/render/kpi.js';
import { buildKpiCardsModel } from '../src/render/kpi-model.js';

function parseArg(name, fallback) {
  const prefix = `--${name}=`;
  const token = process.argv.find((arg) => arg.startsWith(prefix));
  if (!token) {
    return fallback;
  }
  const parsed = Number.parseInt(token.slice(prefix.length), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function median(values) {
  const list = values.slice().sort((a, b) => a - b);
  if (!list.length) {
    return null;
  }
  const middle = Math.floor(list.length / 2);
  return list.length % 2 === 0
    ? Number(((list[middle - 1] + list[middle]) / 2).toFixed(2))
    : Number(list[middle].toFixed(2));
}

function p95(values) {
  const list = values.slice().sort((a, b) => a - b);
  if (!list.length) {
    return null;
  }
  const index = Math.max(0, Math.ceil(list.length * 0.95) - 1);
  return Number(list[index].toFixed(2));
}

function installDomGlobals(dom) {
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
}

function createText() {
  return {
    kpis: {
      noYearData: 'Nėra duomenų',
      primaryNoData: '—',
      deltaNoData: 'Nėra pokyčio duomenų',
      averageNoData: 'Vidurkio nėra',
      mainValueLabel: 'Dabar',
      summary: {
        reference: 'Lyginama su',
        referenceFallback: 'Vidurkis',
        weekdayReference: (weekday) => `Vidurkis (${weekday})`,
      },
      detailLabels: {
        delta: 'Skirtumas',
        average: (weekday) => (weekday ? `Vid. (${weekday})` : 'Vid.'),
        averageContext: (weekday) => (weekday ? `(${weekday})` : ''),
      },
      deltaContext: (reference) => (reference ? `vs ${reference}` : ''),
      cards: [{ metricKey: 'total', label: 'Atvykę', format: 'integer', unitLabel: 'pac.' }],
    },
  };
}

function buildBenchmarkSummary(dailyStats, referenceDailyStats = null) {
  const variant = Number(Array.isArray(dailyStats) ? dailyStats[0]?.variant || 0 : 0);
  const referenceVariant = Number(
    Array.isArray(referenceDailyStats) ? referenceDailyStats[0]?.variant || 0 : 0
  );
  const value = 10 + variant;
  const average = 8 + (referenceVariant % 2);
  return {
    weekdayLabel: 'Trečiadienis',
    metrics: {
      total: { value, average },
    },
  };
}

function createLegacyKpiRenderer(env) {
  const {
    selectors,
    TEXT,
    escapeHtml,
    formatKpiValue,
    percentFormatter,
    buildLastShiftSummary,
    hideKpiSkeleton,
    settings,
  } = env;

  const catalogKpiCards = getMetricsBySurface('kpi-card')
    .filter((metric) => isMetricEnabled(settings, metric.id))
    .map((metric) => ({
      metricKey: metric.id,
      label: getMetricLabelOverride(settings, metric.id, metric.label),
      format: metric.format,
      unitLabel: metric.unit,
    }));

  const resolveKpiMetricById = (metricId, lastShiftSummary) =>
    resolveMetric({
      metricId,
      context: { lastShiftSummary },
      formatValue: formatKpiValue,
    });

  function hideKpiPeriodSummary() {
    const summaryEl = selectors.kpiSummary;
    if (!summaryEl) {
      return;
    }
    summaryEl.innerHTML = '';
    summaryEl.hidden = true;
  }

  function renderKpis(dailyStats, referenceDailyStats = null) {
    hideKpiSkeleton();
    selectors.kpiGrid.replaceChildren();
    const lastShiftSummary = buildLastShiftSummary(dailyStats, referenceDailyStats);
    hideKpiPeriodSummary();

    const model = buildKpiCardsModel({
      lastShiftSummary,
      TEXT,
      escapeHtml,
      formatKpiValue,
      percentFormatter,
      cardsConfig: catalogKpiCards,
      resolveMetricById: resolveKpiMetricById,
    });

    if (model.emptyHtml) {
      const card = document.createElement('article');
      card.className = 'kpi-card';
      card.setAttribute('role', 'listitem');
      card.innerHTML = model.emptyHtml;
      selectors.kpiGrid.appendChild(card);
      return;
    }

    model.cards.forEach((cardModel) => {
      const card = document.createElement('article');
      card.className = 'kpi-card';
      card.setAttribute('role', 'listitem');
      card.innerHTML = `
          <header class="kpi-card__header">
            <h3 class="kpi-card__title">${cardModel.titleText}</h3>
          </header>
          <p class="kpi-mainline kpi-mainline--primary">
            ${cardModel.mainLineHtml}
          </p>
          <div class="kpi-card__details kpi-card__details--primary" role="list">${cardModel.detailsHtml}</div>
        `;
      selectors.kpiGrid.appendChild(card);
    });
  }

  return { renderKpis };
}

function createRendererHarness({ kind }) {
  const dom = new JSDOM('<div id="kpiGrid"></div><div id="kpiSummary"></div>');
  installDomGlobals(dom);
  const selectors = {
    kpiGrid: document.getElementById('kpiGrid'),
    kpiSummary: document.getElementById('kpiSummary'),
  };
  const env = {
    selectors,
    TEXT: createText(),
    escapeHtml: (value) => String(value),
    formatKpiValue: (value) => String(Math.round(Number(value || 0))),
    percentFormatter: { format: (value) => `${Math.round(Number(value || 0) * 100)}%` },
    buildLastShiftSummary: buildBenchmarkSummary,
    hideKpiSkeleton: () => {},
    settings: undefined,
  };
  const renderer = kind === 'legacy' ? createLegacyKpiRenderer(env) : createKpiRenderer(env);
  return { dom, renderer, selectors };
}

function runScenario({ kind, scenario, iterations }) {
  const { dom, renderer } = createRendererHarness({ kind });
  const durations = [];
  const payloadA = [{ variant: 0 }];
  const payloadB = [{ variant: 1 }];

  for (let index = 0; index < iterations; index += 1) {
    const daily = scenario === 'alternating' && index % 2 === 1 ? payloadB : payloadA;
    const reference = scenario === 'alternating' ? payloadA : payloadA;
    const started = performance.now();
    renderer.renderKpis(daily, reference);
    durations.push(performance.now() - started);
  }
  dom.window.close();
  return durations;
}

const iterations = parseArg('iterations', 200);
const runs = parseArg('runs', 8);
const warmup = parseArg('warmup', 2);
const scenarios = ['identical', 'alternating'];
const kinds = ['legacy', 'optimized'];

for (let index = 0; index < warmup; index += 1) {
  for (const scenario of scenarios) {
    for (const kind of kinds) {
      runScenario({ kind, scenario, iterations: Math.min(iterations, 50) });
    }
  }
}

const rows = [];
for (const scenario of scenarios) {
  for (const kind of kinds) {
    const totals = [];
    for (let run = 0; run < runs; run += 1) {
      const durations = runScenario({ kind, scenario, iterations });
      totals.push(durations.reduce((sum, value) => sum + value, 0));
    }
    rows.push({
      scenario,
      mode: kind,
      iterations,
      runs,
      totalMedianMs: median(totals),
      totalP95Ms: p95(totals),
      perRenderMedianUs:
        Number.isFinite(median(totals)) && iterations > 0
          ? Number(((median(totals) * 1000) / iterations).toFixed(2))
          : null,
    });
  }
}

console.log(`KPI renderer benchmark (${iterations} renders/run, ${runs} runs, ${warmup} warmups)`);
console.table(rows);

for (const scenario of scenarios) {
  const legacy = rows.find((row) => row.scenario === scenario && row.mode === 'legacy');
  const optimized = rows.find((row) => row.scenario === scenario && row.mode === 'optimized');
  const speedup =
    Number.isFinite(legacy?.totalMedianMs) &&
    Number.isFinite(optimized?.totalMedianMs) &&
    optimized.totalMedianMs > 0
      ? Number((legacy.totalMedianMs / optimized.totalMedianMs).toFixed(2))
      : null;
  const savings =
    Number.isFinite(legacy?.totalMedianMs) &&
    Number.isFinite(optimized?.totalMedianMs) &&
    legacy.totalMedianMs > 0
      ? Number((((legacy.totalMedianMs - optimized.totalMedianMs) / legacy.totalMedianMs) * 100).toFixed(1))
      : null;
  console.log(
    `${scenario}: speedup ${speedup == null ? 'n/a' : `${speedup}x`} | median savings ${
      savings == null ? 'n/a' : `${savings}%`
    }`
  );
}
