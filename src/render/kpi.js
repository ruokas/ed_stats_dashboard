import { buildKpiCardsModel, buildKpiSummaryModel } from './kpi-model.js';

export function createKpiRenderer(env) {
  const {
    selectors,
    dashboardState,
    TEXT,
    escapeHtml,
    formatKpiValue,
    percentFormatter,
    buildYearMonthMetrics,
    buildLastShiftSummary,
    hideKpiSkeleton,
  } = env;

  function renderKpiPeriodSummary(lastShiftSummary, periodMetrics) {
    const summaryEl = selectors.kpiSummary;
    if (!summaryEl) {
      return;
    }
    const model = buildKpiSummaryModel({
      lastShiftSummary,
      periodMetrics,
      TEXT,
      escapeHtml,
    });
    summaryEl.innerHTML = model.html;
    summaryEl.hidden = false;
  }

  function renderKpis(dailyStats, referenceDailyStats = null) {
      hideKpiSkeleton();
      selectors.kpiGrid.replaceChildren();
      const windowDays = dashboardState.kpi?.filters?.window;
      const periodMetrics = buildYearMonthMetrics(dailyStats, windowDays);
      const lastShiftSummary = buildLastShiftSummary(dailyStats, referenceDailyStats);
      renderKpiPeriodSummary(lastShiftSummary, periodMetrics);

      const model = buildKpiCardsModel({
        lastShiftSummary,
        TEXT,
        escapeHtml,
        formatKpiValue,
        percentFormatter,
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
          <p class="kpi-mainline">
            ${cardModel.mainLineHtml}
          </p>
          <div class="kpi-card__details" role="list">${cardModel.detailsHtml}</div>
        `;
        selectors.kpiGrid.appendChild(card);
      });
    }
    return { renderKpiPeriodSummary, renderKpis };
}

