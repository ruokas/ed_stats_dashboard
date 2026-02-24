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
  let lastRenderSignature = null;
  let lastRenderMode = null;

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

  function buildKpiRenderSignature(model) {
    if (model?.emptyHtml) {
      return `empty|${model.emptyHtml}`;
    }
    const cards = Array.isArray(model?.cards) ? model.cards : [];
    return `cards|${cards
      .map((card) => `${card.titleText}::${card.mainLineHtml}::${card.detailsHtml}`)
      .join('||')}`;
  }

  function createKpiCardElement(cardModel) {
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
    return card;
  }

  function updateKpiCardElement(card, cardModel) {
    const titleEl = card.querySelector('.kpi-card__title');
    const mainlineEl = card.querySelector('.kpi-mainline--primary');
    const detailsEl = card.querySelector('.kpi-card__details--primary');
    if (
      !(titleEl instanceof HTMLElement) ||
      !(mainlineEl instanceof HTMLElement) ||
      !(detailsEl instanceof HTMLElement)
    ) {
      return false;
    }
    if (titleEl.textContent !== cardModel.titleText) {
      titleEl.textContent = cardModel.titleText;
    }
    if (mainlineEl.innerHTML !== cardModel.mainLineHtml) {
      mainlineEl.innerHTML = cardModel.mainLineHtml;
    }
    if (detailsEl.innerHTML !== cardModel.detailsHtml) {
      detailsEl.innerHTML = cardModel.detailsHtml;
    }
    return true;
  }

  function renderKpis(dailyStats, referenceDailyStats = null) {
    hideKpiSkeleton();
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
    const renderSignature = buildKpiRenderSignature(model);
    if (renderSignature === lastRenderSignature) {
      return;
    }

    if (model.emptyHtml) {
      const card = document.createElement('article');
      card.className = 'kpi-card';
      card.setAttribute('role', 'listitem');
      card.innerHTML = model.emptyHtml;
      selectors.kpiGrid.replaceChildren(card);
      lastRenderSignature = renderSignature;
      lastRenderMode = 'empty';
      return;
    }

    const existingCards = Array.from(selectors.kpiGrid.children).filter(
      (node) => node instanceof HTMLElement && node.classList.contains('kpi-card')
    );
    const canReuse =
      lastRenderMode === 'cards' &&
      existingCards.length === model.cards.length &&
      existingCards.every((node) => node instanceof HTMLElement);
    if (canReuse) {
      let updatedAll = true;
      model.cards.forEach((cardModel, index) => {
        const card = existingCards[index];
        if (!(card instanceof HTMLElement) || !updateKpiCardElement(card, cardModel)) {
          updatedAll = false;
        }
      });
      if (updatedAll) {
        lastRenderSignature = renderSignature;
        lastRenderMode = 'cards';
        return;
      }
    }

    const nextCards = model.cards.map((cardModel) => createKpiCardElement(cardModel));
    selectors.kpiGrid.replaceChildren(...nextCards);
    lastRenderSignature = renderSignature;
    lastRenderMode = 'cards';
  }
  return { renderKpis };
}
