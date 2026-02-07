export function buildKpiSummaryModel({
  lastShiftSummary,
  periodMetrics,
  TEXT,
  escapeHtml,
}) {
  if (!lastShiftSummary) {
    return {
      isEmpty: true,
      html: `<p class="kpi-summary__empty">${TEXT.kpis.noYearData}</p>`,
    };
  }

  const weekdayLabel = typeof lastShiftSummary.weekdayLabel === 'string'
    ? lastShiftSummary.weekdayLabel
    : '';
  const periodText = lastShiftSummary.dateLabel
    || TEXT.kpis.summary.periodFallback
    || TEXT.kpis.summary.unknownPeriod;
  const referenceText = weekdayLabel
    ? (typeof TEXT.kpis.summary.weekdayReference === 'function'
      ? TEXT.kpis.summary.weekdayReference(weekdayLabel)
      : `${TEXT.kpis.summary.reference} (${weekdayLabel})`)
    : (TEXT.kpis.summary.referenceFallback || TEXT.kpis.summary.reference);

  const summaryItems = [
    {
      label: TEXT.kpis.summary.period,
      value: escapeHtml(periodText),
    },
    {
      label: TEXT.kpis.summary.reference,
      value: escapeHtml(referenceText),
    },
  ];

  const summaryRows = summaryItems.map((item) => `
      <div class="kpi-summary__item">
        <dt>${escapeHtml(item.label)}</dt>
        <dd>${item.value}</dd>
      </div>
    `).join('');

  return {
    isEmpty: false,
    html: `
      <p class="kpi-summary__title">${TEXT.kpis.summary.title}</p>
      <dl class="kpi-summary__list">
        ${summaryRows}
      </dl>
    `,
  };
}

export function buildKpiCardsModel({
  lastShiftSummary,
  TEXT,
  escapeHtml,
  formatKpiValue,
  percentFormatter,
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

  const cardsConfig = Array.isArray(TEXT.kpis.cards) ? TEXT.kpis.cards : [];
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

  const weekdayLabel = typeof lastShiftSummary.weekdayLabel === 'string'
    ? lastShiftSummary.weekdayLabel
    : '';
  const referenceText = weekdayLabel
    ? (typeof TEXT.kpis.summary.weekdayReference === 'function'
      ? TEXT.kpis.summary.weekdayReference(weekdayLabel)
      : `${TEXT.kpis.summary.reference} (${weekdayLabel})`)
    : (TEXT.kpis.summary.referenceFallback || TEXT.kpis.summary.reference);

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
    const metric = lastShiftSummary.metrics?.[config.metricKey] || {};
    const rawValue = Number.isFinite(metric.value) ? metric.value : null;
    const averageValue = Number.isFinite(metric.average) ? metric.average : null;
    const valueFormat = config.format || 'integer';

    const shareValue = Number.isFinite(metric.share) ? metric.share : null;
    const averageShareValue = Number.isFinite(metric.averageShare) ? metric.averageShare : null;

    const titleText = config.label ? escapeHtml(config.label) : '';
    const mainLabel = typeof config.mainLabel === 'string'
      ? config.mainLabel
      : (typeof TEXT.kpis.mainValueLabel === 'string' ? TEXT.kpis.mainValueLabel : '');
    const mainLabelHtml = mainLabel
      ? `<span class="kpi-mainline__label">${escapeHtml(mainLabel)}</span>`
      : '';
    const shareBadge = shareValue != null
      ? `<span class="kpi-mainline__share">(${percentFormatter.format(shareValue)})</span>`
      : '';
    const unitHtml = config.unitLabel
      ? `<span class="kpi-unit">${escapeHtml(config.unitLabel)}</span>`
      : '';
    const mainValueHtml = Number.isFinite(rawValue)
      ? `<strong class="kpi-main-value">${formatKpiValue(rawValue, valueFormat)}</strong>${unitHtml}${shareBadge}`
      : `<span class="kpi-empty">${TEXT.kpis.primaryNoData || TEXT.kpis.noYearData}</span>`;

    const details = [];
    if (Number.isFinite(rawValue) && Number.isFinite(averageValue)) {
      const diff = rawValue - averageValue;
      let trend = 'neutral';
      let arrow = '→';
      if (diff > 0) {
        trend = 'up';
        arrow = '↑';
      } else if (diff < 0) {
        trend = 'down';
        arrow = '↓';
      }
      const sign = diff > 0 ? '+' : (diff < 0 ? '−' : '');
      const formattedDiff = formatKpiValue(Math.abs(diff), valueFormat);
      const deltaContext = typeof TEXT.kpis.deltaContext === 'function'
        ? TEXT.kpis.deltaContext(referenceText, weekdayLabel)
        : TEXT.kpis.deltaContext;
      const contextHtml = deltaContext
        ? `<span class="kpi-detail__context">${escapeHtml(deltaContext)}</span>`
        : '';
      const deltaAria = diff > 0
        ? `Skirtumas lyginant su ${referenceText}: padidėjo ${formattedDiff}${config.unitLabel ? ` ${config.unitLabel}` : ''}.`
        : diff < 0
          ? `Skirtumas lyginant su ${referenceText}: sumažėjo ${formattedDiff}${config.unitLabel ? ` ${config.unitLabel}` : ''}.`
          : `Skirtumo nėra lyginant su ${referenceText}.`;
      const deltaValueHtml = `
        <span class="kpi-detail__icon" aria-hidden="true">${arrow}</span>
        <strong>${sign}${formattedDiff}</strong>${contextHtml}
      `;
      details.push(detailWrapper(
        TEXT.kpis.detailLabels?.delta || 'Skirtumas',
        deltaValueHtml,
        `kpi-detail--delta-${trend}`,
        deltaAria,
      ));
    } else {
      details.push(detailWrapper(
        TEXT.kpis.detailLabels?.delta || 'Skirtumas',
        `<span class="kpi-empty">${TEXT.kpis.deltaNoData}</span>`,
        'kpi-detail--muted',
      ));
    }

    const averageLabel = typeof TEXT.kpis.detailLabels?.average === 'function'
      ? TEXT.kpis.detailLabels.average(weekdayLabel)
      : (TEXT.kpis.detailLabels?.average || 'Vidurkis');
    const averageContextRaw = typeof TEXT.kpis.detailLabels?.averageContext === 'function'
      ? TEXT.kpis.detailLabels.averageContext(weekdayLabel)
      : (TEXT.kpis.detailLabels?.averageContext || '');
    const averageContextHtml = averageContextRaw
      ? `<span class="kpi-detail__context">${escapeHtml(averageContextRaw)}</span>`
      : '';
    if (Number.isFinite(averageValue)) {
      const averageShareHtml = averageShareValue != null
        ? `<span class="kpi-detail__share">(${percentFormatter.format(averageShareValue)})</span>`
        : '';
      const averageValueHtml = `<strong>${formatKpiValue(averageValue, valueFormat)}</strong>${averageContextHtml}${averageShareHtml}`;
      details.push(detailWrapper(averageLabel, averageValueHtml));
    } else {
      details.push(detailWrapper(
        averageLabel,
        `<span class="kpi-empty">${TEXT.kpis.averageNoData}</span>`,
        'kpi-detail--muted',
      ));
    }

    cards.push({
      titleText,
      mainLineHtml: `
        ${mainLabelHtml}
        <span class="kpi-mainline__value">${mainValueHtml}</span>
      `,
      detailsHtml: details.join(''),
    });
  });

  return {
    emptyHtml: '',
    cards,
  };
}
