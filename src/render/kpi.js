export function createKpiRenderer(env) {
  const {
    selectors,
    dashboardState,
    TEXT,
    escapeHtml,
    formatKpiValue,
    percentFormatter,
    numberFormatter,
    buildYearMonthMetrics,
    buildLastShiftSummary,
    hideKpiSkeleton,
  } = env;

  function renderKpiPeriodSummary(lastShiftSummary, periodMetrics) {
      const summaryEl = selectors.kpiSummary;
      if (!summaryEl) {
        return;
      }
      if (!lastShiftSummary) {
        summaryEl.innerHTML = `<p class="kpi-summary__empty">${TEXT.kpis.noYearData}</p>`;
        summaryEl.hidden = false;
        return;
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

      if (periodMetrics) {
        const monthLabel = typeof periodMetrics.monthLabel === 'string'
          ? periodMetrics.monthLabel
          : '';
        const hasMonthData = Number.isFinite(periodMetrics?.monthMetrics?.days)
          && periodMetrics.monthMetrics.days > 0;
        if (monthLabel || hasMonthData) {
          const monthContent = monthLabel
            ? escapeHtml(monthLabel)
            : `<span class="kpi-summary__muted">${escapeHtml(TEXT.kpis.summary.noMonth)}</span>`;
          summaryItems.push({
            label: TEXT.kpis.summary.month,
            value: monthContent,
          });
        }
      }

      const summaryRows = summaryItems.map((item) => `
          <div class="kpi-summary__item">
            <dt>${escapeHtml(item.label)}</dt>
            <dd>${item.value}</dd>
          </div>
        `).join('');

      summaryEl.innerHTML = `
        <p class="kpi-summary__title">${TEXT.kpis.summary.title}</p>
        <dl class="kpi-summary__list">
          ${summaryRows}
        </dl>
      `;
      summaryEl.hidden = false;
    }

  function renderKpis(dailyStats) {
      hideKpiSkeleton();
      selectors.kpiGrid.replaceChildren();
      const windowDays = dashboardState.kpi?.filters?.window;
      const periodMetrics = buildYearMonthMetrics(dailyStats, windowDays);
      const lastShiftSummary = buildLastShiftSummary(dailyStats);
      renderKpiPeriodSummary(lastShiftSummary, periodMetrics);

      if (!lastShiftSummary) {
        const card = document.createElement('article');
        card.className = 'kpi-card';
        card.setAttribute('role', 'listitem');
        card.innerHTML = `
          <header class="kpi-card__header">
            <h3 class="kpi-card__title">Rodiklių nepakanka</h3>
          </header>
          <p class="kpi-mainline">
            <span class="kpi-mainline__value"><span class="kpi-empty">${TEXT.kpis.noYearData}</span></span>
          </p>
        `;
        selectors.kpiGrid.appendChild(card);
        return;
      }

      const cardsConfig = Array.isArray(TEXT.kpis.cards) ? TEXT.kpis.cards : [];
      if (!cardsConfig.length) {
        const card = document.createElement('article');
        card.className = 'kpi-card';
        card.setAttribute('role', 'listitem');
        card.innerHTML = `
          <header class="kpi-card__header">
            <h3 class="kpi-card__title">Rodiklių konfigūracija nerasta</h3>
          </header>
          <p class="kpi-mainline">
            <span class="kpi-mainline__value"><span class="kpi-empty">${TEXT.kpis.noYearData}</span></span>
          </p>
        `;
        selectors.kpiGrid.appendChild(card);
        return;
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

        const card = document.createElement('article');
        card.className = 'kpi-card';
        card.setAttribute('role', 'listitem');

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
        const mainValueHtml = Number.isFinite(rawValue)
          ? `<strong class="kpi-main-value">${formatKpiValue(rawValue, valueFormat)}</strong>${shareBadge}`
          : `<span class="kpi-empty">${TEXT.kpis.primaryNoData || TEXT.kpis.noYearData}</span>`;

        const details = [];
        const unitContext = config.unitLabel
          ? `<span class="kpi-detail__context">${escapeHtml(config.unitLabel)}</span>`
          : '';

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
            <strong>${sign}${formattedDiff}</strong>${unitContext}${contextHtml}
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
          const averageValueHtml = `<strong>${formatKpiValue(averageValue, valueFormat)}</strong>${unitContext}${averageContextHtml}${averageShareHtml}`;
          details.push(detailWrapper(averageLabel, averageValueHtml));
        } else {
          details.push(detailWrapper(
            averageLabel,
            `<span class="kpi-empty">${TEXT.kpis.averageNoData}</span>`,
            'kpi-detail--muted',
          ));
        }

        card.innerHTML = `
          <header class="kpi-card__header">
            <h3 class="kpi-card__title">${titleText}</h3>
          </header>
          <p class="kpi-mainline">
            ${mainLabelHtml}
            <span class="kpi-mainline__value">${mainValueHtml}</span>
          </p>
          <div class="kpi-card__details" role="list">${details.join('')}</div>
        `;
        selectors.kpiGrid.appendChild(card);
      });

      const monthlySettings = TEXT.kpis.monthly || {};
      const monthlyCardsConfig = Array.isArray(monthlySettings.cards) ? monthlySettings.cards : [];
      const hasPeriodMetrics = periodMetrics && typeof periodMetrics === 'object';
      const monthMetrics = hasPeriodMetrics ? periodMetrics.monthMetrics : null;
      const yearMetrics = hasPeriodMetrics ? periodMetrics.yearMetrics : null;
      const monthHasData = Number.isFinite(monthMetrics?.days) && monthMetrics.days > 0;

      if (monthlyCardsConfig.length) {
        if (monthlySettings.title || monthlySettings.subtitle) {
          const sectionLabel = document.createElement('p');
          sectionLabel.className = 'kpi-grid__section-label';
          sectionLabel.setAttribute('role', 'presentation');
          sectionLabel.setAttribute('aria-hidden', 'true');
          sectionLabel.textContent = monthlySettings.title || 'Šio mėnesio vidurkiai';
          if (monthlySettings.subtitle) {
            const subtitleEl = document.createElement('span');
            subtitleEl.textContent = monthlySettings.subtitle;
            sectionLabel.appendChild(subtitleEl);
          }
          selectors.kpiGrid.appendChild(sectionLabel);
        }

        if (!monthHasData || !monthMetrics) {
          const emptyCard = document.createElement('article');
          emptyCard.className = 'kpi-card kpi-card--monthly';
          emptyCard.setAttribute('role', 'listitem');
          const emptyTitle = monthlySettings.emptyTitle || monthlySettings.title || TEXT.kpis.monthPrefix || 'Šio mėnesio vidurkiai';
          const emptyMessage = monthlySettings.empty || TEXT.kpis.monthNoData;
          emptyCard.innerHTML = `
            <header class="kpi-card__header">
              <h3 class="kpi-card__title">${escapeHtml(emptyTitle)}</h3>
            </header>
            <p class="kpi-mainline">
              <span class="kpi-mainline__value"><span class="kpi-empty">${escapeHtml(emptyMessage || '')}</span></span>
            </p>
          `;
          selectors.kpiGrid.appendChild(emptyCard);
          return;
        }

        const monthLabel = typeof periodMetrics?.monthLabel === 'string' ? periodMetrics.monthLabel : '';
        const monthPrefixShort = TEXT.kpis.monthPrefixShort || TEXT.kpis.monthPrefix || '';
        const monthMetaText = monthLabel
          ? `${monthPrefixShort ? `${monthPrefixShort}: ` : ''}${monthLabel}`
          : '';
        const resolvedReferenceLabel = typeof monthlySettings.referenceLabel === 'function'
          ? monthlySettings.referenceLabel(periodMetrics?.referenceLabel, periodMetrics?.yearLabel)
          : (monthlySettings.referenceLabel
            || periodMetrics?.referenceLabel
            || TEXT.kpis.summary.referenceFallback
            || TEXT.kpis.summary.reference
            || 'Metinis vidurkis');
        const accessibleReference = resolvedReferenceLabel
          || TEXT.kpis.summary.referenceFallback
          || TEXT.kpis.summary.reference
          || 'Metinis vidurkis';

        monthlyCardsConfig.forEach((config) => {
          if (!config || typeof config !== 'object' || !config.metricKey) {
            return;
          }
          const valueFormat = config.format || 'oneDecimal';
          const monthValueRaw = monthMetrics?.[config.metricKey];
          const monthValue = Number.isFinite(monthValueRaw) ? monthValueRaw : null;
          const compareKey = config.compareKey || config.metricKey;
          const yearValueRaw = yearMetrics?.[compareKey];
          const yearValue = Number.isFinite(yearValueRaw) ? yearValueRaw : null;
          const shareKey = typeof config.shareKey === 'string' ? config.shareKey : null;
          const monthShareValue = shareKey && Number.isFinite(monthMetrics?.[shareKey])
            ? monthMetrics[shareKey]
            : null;
          const yearShareValue = shareKey && Number.isFinite(yearMetrics?.[shareKey])
            ? yearMetrics[shareKey]
            : null;
          const card = document.createElement('article');
          card.className = 'kpi-card kpi-card--monthly';
          card.setAttribute('role', 'listitem');

          const titleText = config.label ? escapeHtml(config.label) : '';
          const metaHtml = monthMetaText
            ? `<span class="kpi-card__meta">${escapeHtml(monthMetaText)}</span>`
            : '';
          const mainLabel = typeof config.mainLabel === 'string'
            ? config.mainLabel
            : (typeof monthlySettings.mainLabel === 'string' ? monthlySettings.mainLabel : '');
          const mainLabelHtml = mainLabel
            ? `<span class="kpi-mainline__label">${escapeHtml(mainLabel)}</span>`
            : '';
          const unitLabel = config.unitLabel ? String(config.unitLabel) : '';
          const mainUnitHtml = unitLabel
            ? `<span class="kpi-unit">${escapeHtml(unitLabel)}</span>`
            : '';
          const noDataText = monthlySettings.primaryNoData
            || TEXT.kpis.primaryNoData
            || TEXT.kpis.monthNoDataShort
            || TEXT.kpis.monthNoData
            || 'Nėra duomenų';
          const mainShareHtml = monthShareValue != null
            ? `<span class="kpi-mainline__share">(${percentFormatter.format(monthShareValue)})</span>`
            : '';
          const mainValueHtml = Number.isFinite(monthValue)
            ? `<strong class="kpi-main-value">${formatKpiValue(monthValue, valueFormat)}</strong>${mainUnitHtml}${mainShareHtml}`
            : `<span class="kpi-empty">${escapeHtml(noDataText)}</span>`;

          const details = [];
          const unitContext = unitLabel
            ? `<span class="kpi-detail__context">${escapeHtml(unitLabel)}</span>`
            : '';

          if (Number.isFinite(monthValue) && Number.isFinite(yearValue)) {
            const diff = monthValue - yearValue;
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
            const deltaContextRaw = typeof config.deltaContext === 'function'
              ? config.deltaContext(resolvedReferenceLabel, periodMetrics?.yearLabel)
              : (config.deltaContext
                ?? (typeof monthlySettings.deltaContext === 'function'
                  ? monthlySettings.deltaContext(resolvedReferenceLabel, periodMetrics?.yearLabel)
                  : monthlySettings.deltaContext));
            const deltaContextHtml = deltaContextRaw
              ? `<span class="kpi-detail__context">${escapeHtml(deltaContextRaw)}</span>`
              : '';
            const deltaAriaReference = accessibleReference || 'metiniu vidurkiu';
            const deltaAria = diff > 0
              ? `Skirtumas lyginant su ${deltaAriaReference}: padidėjo ${formattedDiff}${unitLabel ? ` ${unitLabel}` : ''}.`
              : diff < 0
                ? `Skirtumas lyginant su ${deltaAriaReference}: sumažėjo ${formattedDiff}${unitLabel ? ` ${unitLabel}` : ''}.`
                : `Skirtumo nėra lyginant su ${deltaAriaReference}.`;
            const deltaLabel = typeof config.deltaLabel === 'string'
              ? config.deltaLabel
              : (monthlySettings.deltaLabel || TEXT.kpis.detailLabels?.delta || 'Skirtumas');
            const deltaValueHtml = `
              <span class="kpi-detail__icon" aria-hidden="true">${arrow}</span>
              <strong>${sign}${formattedDiff}</strong>${unitContext}${deltaContextHtml}
            `;
            details.push(detailWrapper(
              deltaLabel,
              deltaValueHtml,
              `kpi-detail--delta-${trend}`,
              deltaAria,
            ));
          } else {
            const deltaLabel = typeof config.deltaLabel === 'string'
              ? config.deltaLabel
              : (monthlySettings.deltaLabel || TEXT.kpis.detailLabels?.delta || 'Skirtumas');
            details.push(detailWrapper(
              deltaLabel,
              `<span class="kpi-empty">${TEXT.kpis.deltaNoData}</span>`,
              'kpi-detail--muted',
            ));
          }

          const averageLabel = typeof config.averageLabel === 'string'
            ? config.averageLabel
            : (typeof monthlySettings.averageLabel === 'function'
              ? monthlySettings.averageLabel(resolvedReferenceLabel, periodMetrics?.yearLabel)
              : (monthlySettings.averageLabel || TEXT.kpis.detailLabels?.average || 'Vidurkis'));
          const averageContextRaw = typeof config.averageContext === 'function'
            ? config.averageContext(resolvedReferenceLabel, periodMetrics?.yearLabel)
            : (config.averageContext ?? (typeof monthlySettings.averageContext === 'function'
              ? monthlySettings.averageContext(resolvedReferenceLabel, periodMetrics?.yearLabel)
              : monthlySettings.averageContext));
          const averageContextHtml = averageContextRaw
            ? `<span class="kpi-detail__context">${escapeHtml(averageContextRaw)}</span>`
            : '';

          if (Number.isFinite(yearValue)) {
            const averageShareHtml = yearShareValue != null
              ? `<span class="kpi-detail__share">(${percentFormatter.format(yearShareValue)})</span>`
              : '';
            const averageValueHtml = `<strong>${formatKpiValue(yearValue, valueFormat)}</strong>${unitContext}${averageContextHtml}${averageShareHtml}`;
            details.push(detailWrapper(averageLabel, averageValueHtml));
          } else {
            details.push(detailWrapper(
              averageLabel,
              `<span class="kpi-empty">${TEXT.kpis.averageNoData}</span>`,
              'kpi-detail--muted',
            ));
          }

          card.innerHTML = `
            <header class="kpi-card__header">
              <h3 class="kpi-card__title">${titleText}</h3>
              ${metaHtml}
            </header>
            <p class="kpi-mainline">
              ${mainLabelHtml}
              <span class="kpi-mainline__value">${mainValueHtml}</span>
            </p>
            <div class="kpi-card__details" role="list">${details.join('')}</div>
          `;
          selectors.kpiGrid.appendChild(card);
        });
      }
    }
    return { renderKpiPeriodSummary, renderKpis };
}

