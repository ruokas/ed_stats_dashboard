export function buildKpiCardsModel({
  lastShiftSummary,
  TEXT,
  escapeHtml,
  formatKpiValue,
  percentFormatter,
  cardsConfig: cardsConfigOverride = null,
  resolveMetricById = null,
}) {
  if (!lastShiftSummary) {
    return {
      emptyHtml: `
        <header class="kpi-card__header">
          <h3 class="kpi-card__title">Rodiklių nepakanka</h3>
        </header>
        <p class="kpi-mainline">
          <span class="kpi-mainline__value"><span class="kpi-empty">${TEXT.kpis.noYearData}</span></span>
        </p>
      `,
      cards: [],
    };
  }

  const cardsConfig =
    Array.isArray(cardsConfigOverride) && cardsConfigOverride.length
      ? cardsConfigOverride
      : Array.isArray(TEXT.kpis.cards)
        ? TEXT.kpis.cards
        : [];
  if (!cardsConfig.length) {
    return {
      emptyHtml: `
        <header class="kpi-card__header">
          <h3 class="kpi-card__title">Rodiklių konfigūracija nerasta</h3>
        </header>
        <p class="kpi-mainline">
          <span class="kpi-mainline__value"><span class="kpi-empty">${TEXT.kpis.noYearData}</span></span>
        </p>
      `,
      cards: [],
    };
  }

  const weekdayLabel = typeof lastShiftSummary.weekdayLabel === 'string' ? lastShiftSummary.weekdayLabel : '';
  const referenceText = weekdayLabel
    ? typeof TEXT.kpis.summary.weekdayReference === 'function'
      ? TEXT.kpis.summary.weekdayReference(weekdayLabel)
      : `${TEXT.kpis.summary.reference} (${weekdayLabel})`
    : TEXT.kpis.summary.referenceFallback || TEXT.kpis.summary.reference;
  const comparisonLabel = TEXT.kpis.detailLabels?.comparison || 'Palyginimas';
  const compactDeltaLabel = 'Δ';
  const compactAverageLabel = 'Vid.';

  const detailWrapper = (label, valueHtml, extraClass = '', ariaLabel) => {
    const aria = ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : '';
    const extra = extraClass ? ` ${extraClass}` : '';
    return `<div class="kpi-detail${extra}" role="listitem"${aria}><span class="kpi-detail__label">${escapeHtml(label)}</span><span class="kpi-detail__value">${valueHtml}</span></div>`;
  };

  const cards = [];
  cardsConfig.forEach((config) => {
    if (!config || typeof config !== 'object' || !config.metricKey) {
      return;
    }

    const resolvedMetric =
      typeof resolveMetricById === 'function' ? resolveMetricById(config.metricKey, lastShiftSummary) : null;
    const metric = lastShiftSummary.metrics?.[config.metricKey] || {};
    const rawValue = Number.isFinite(resolvedMetric?.value)
      ? resolvedMetric.value
      : Number.isFinite(metric.value)
        ? metric.value
        : null;
    const averageValue = Number.isFinite(resolvedMetric?.average)
      ? resolvedMetric.average
      : Number.isFinite(metric.average)
        ? metric.average
        : null;
    const valueFormat =
      typeof resolvedMetric?.format === 'string' && resolvedMetric.format
        ? resolvedMetric.format
        : config.format || 'integer';
    const shareValue = Number.isFinite(resolvedMetric?.share)
      ? resolvedMetric.share
      : Number.isFinite(metric.share)
        ? metric.share
        : null;
    const averageShareValue = Number.isFinite(resolvedMetric?.averageShare)
      ? resolvedMetric.averageShare
      : Number.isFinite(metric.averageShare)
        ? metric.averageShare
        : null;

    const titleText = resolvedMetric?.label
      ? escapeHtml(resolvedMetric.label)
      : config.label
        ? escapeHtml(config.label)
        : '';
    const mainLabel =
      typeof config.mainLabel === 'string'
        ? config.mainLabel
        : typeof TEXT.kpis.mainValueLabel === 'string'
          ? TEXT.kpis.mainValueLabel
          : '';
    const mainLabelHtml = mainLabel
      ? `<span class="kpi-mainline__label">${escapeHtml(mainLabel)}</span>`
      : '';
    const shareBadge =
      shareValue != null
        ? `<span class="kpi-mainline__share">(${percentFormatter.format(shareValue)})</span>`
        : '';
    const unitLabel =
      typeof resolvedMetric?.unit === 'string' && resolvedMetric.unit
        ? resolvedMetric.unit
        : config.unitLabel;
    const unitHtml = unitLabel ? `<span class="kpi-unit">${escapeHtml(unitLabel)}</span>` : '';
    const mainValueHtml = Number.isFinite(rawValue)
      ? `<span class="kpi-mainline__metric"><strong class="kpi-main-value">${formatKpiValue(rawValue, valueFormat)}</strong>${unitHtml}</span>${shareBadge}`
      : `<span class="kpi-empty">${TEXT.kpis.primaryNoData || TEXT.kpis.noYearData}</span>`;

    const averageShareHtml =
      averageShareValue != null
        ? `<span class="kpi-detail__share">(${percentFormatter.format(averageShareValue)})</span>`
        : '';
    const averageTokenValueHtml = Number.isFinite(averageValue)
      ? `<span class="kpi-detail__token-value"><strong>${formatKpiValue(averageValue, valueFormat)}</strong>${averageShareHtml}</span>`
      : `<span class="kpi-detail__token-value"><span class="kpi-empty">${TEXT.kpis.averageNoData}</span></span>`;
    const referenceTokenHtml = `
      <span class="kpi-detail__token kpi-detail__token--reference">
        <span class="kpi-detail__token-label">${compactAverageLabel}</span>
        ${averageTokenValueHtml}
      </span>
    `;

    let deltaTokenHtml = '';
    let detailClass = '';
    let detailAria = '';
    if (Number.isFinite(rawValue) && Number.isFinite(averageValue)) {
      const diff = rawValue - averageValue;
      let arrow = '→';
      if (diff > 0) {
        arrow = '↑';
      } else if (diff < 0) {
        arrow = '↓';
      }
      const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
      const formattedDiff = formatKpiValue(Math.abs(diff), valueFormat);
      deltaTokenHtml = `
        <span class="kpi-detail__token kpi-detail__token--delta">
          <span class="kpi-detail__token-label">${compactDeltaLabel}</span>
          <span class="kpi-detail__token-value">
            <span class="kpi-detail__icon" aria-hidden="true">${arrow}</span>
            <strong>${sign}${formattedDiff}</strong>
          </span>
        </span>
      `;
      detailClass = 'kpi-detail--comparison';
      detailAria =
        diff > 0
          ? `Skirtumas lyginant su ${referenceText}: padidėjo ${formattedDiff}${unitLabel ? ` ${unitLabel}` : ''}. ${referenceText}: ${formatKpiValue(averageValue, valueFormat)}${unitLabel ? ` ${unitLabel}` : ''}.`
          : diff < 0
            ? `Skirtumas lyginant su ${referenceText}: sumažėjo ${formattedDiff}${unitLabel ? ` ${unitLabel}` : ''}. ${referenceText}: ${formatKpiValue(averageValue, valueFormat)}${unitLabel ? ` ${unitLabel}` : ''}.`
            : `Skirtumo nėra lyginant su ${referenceText}. ${referenceText}: ${formatKpiValue(averageValue, valueFormat)}${unitLabel ? ` ${unitLabel}` : ''}.`;
    } else {
      deltaTokenHtml = `
        <span class="kpi-detail__token kpi-detail__token--delta">
          <span class="kpi-detail__token-label">${compactDeltaLabel}</span>
          <span class="kpi-detail__token-value"><span class="kpi-empty">${TEXT.kpis.deltaNoData}</span></span>
        </span>
      `;
      detailClass = 'kpi-detail--muted';
      detailAria = `${comparisonLabel}: ${TEXT.kpis.deltaNoData} ${referenceText}: ${
        Number.isFinite(averageValue) ? formatKpiValue(averageValue, valueFormat) : TEXT.kpis.averageNoData
      }.`;
    }

    const detailValueHtml = `<span class="kpi-detail__comparison">${deltaTokenHtml}${referenceTokenHtml}</span>`;
    const details = [detailWrapper(comparisonLabel, detailValueHtml, detailClass, detailAria)];

    cards.push({
      titleText,
      mainLineHtml: `
        <span class="kpi-mainline__primary">
          ${mainLabelHtml}
          <span class="kpi-mainline__value">${mainValueHtml}</span>
        </span>
      `,
      detailsHtml: details.join(''),
    });
  });

  return {
    emptyHtml: '',
    cards,
  };
}
