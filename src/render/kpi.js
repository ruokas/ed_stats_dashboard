import { getMetricLabelOverride, isMetricEnabled } from '../metrics/catalog-overrides.js';
import { getMetricsBySurface } from '../metrics/index.js';
import { resolveMetric } from '../metrics/resolve-metric.js';
import { buildKpiCardsModel } from './kpi-model.js';

export function createKpiRenderer(env) {
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

  function resolveKpiMetricById(metricId, lastShiftSummary) {
    return resolveMetric({
      metricId,
      context: { lastShiftSummary },
      formatValue: formatKpiValue,
    });
  }

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
