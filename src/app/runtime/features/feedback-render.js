export function createFeedbackRenderFeature(deps) {
  const {
    selectors,
    dashboardState,
    TEXT,
    numberFormatter,
    decimalFormatter,
    percentFormatter,
    formatMonthLabel,
    getDatasetValue,
    setDatasetValue,
    describeError,
    getChartRenderers,
    resetFeedbackCommentRotation,
    renderFeedbackCommentsCard,
  } = deps;

  function formatFeedbackCardValue(value, format) {
    if (format === 'text') {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed || null;
      }
      if (value != null) {
        const coerced = String(value).trim();
        return coerced || null;
      }
      return null;
    }

    let numericValue = null;
    if (Number.isFinite(value)) {
      numericValue = value;
    } else if (typeof value === 'string') {
      const parsed = Number.parseFloat(value.replace(',', '.'));
      if (Number.isFinite(parsed)) {
        numericValue = parsed;
      }
    }

    if (numericValue == null) {
      return null;
    }

    switch (format) {
      case 'decimal':
        return decimalFormatter.format(numericValue);
      case 'integer':
        return numberFormatter.format(Math.round(numericValue));
      case 'percent':
        return percentFormatter.format(numericValue);
      default:
        return decimalFormatter.format(numericValue);
    }
  }

  function renderFeedbackCards(summary) {
    if (!selectors.feedbackCards) {
      return;
    }

    resetFeedbackCommentRotation();

    const cardsConfig = Array.isArray(TEXT.feedback?.cards)
      ? TEXT.feedback.cards
      : [];

    selectors.feedbackCards.replaceChildren();

    if (!cardsConfig.length) {
      const empty = document.createElement('p');
      empty.className = 'feedback-empty';
      empty.textContent = TEXT.feedback?.empty || 'Kol kas nėra apibendrintų atsiliepimų.';
      selectors.feedbackCards.appendChild(empty);
      return;
    }

    const summaryData = summary && typeof summary === 'object' ? summary : {};
    const hasValues = cardsConfig.some((card) => {
      if (!card || typeof card !== 'object') {
        return false;
      }
      if (card.type === 'comments') {
        return Array.isArray(summaryData[card.key]) && summaryData[card.key].length > 0;
      }
      const raw = summaryData[card.key];
      const formatted = formatFeedbackCardValue(raw, card.format);
      if (formatted != null) {
        return true;
      }
      if (Number.isFinite(raw)) {
        return true;
      }
      return false;
    });

    if (!hasValues) {
      const empty = document.createElement('p');
      empty.className = 'feedback-empty';
      empty.textContent = TEXT.feedback?.empty || 'Kol kas nėra apibendrintų atsiliepimų.';
      selectors.feedbackCards.appendChild(empty);
      return;
    }

    const responsesLabel = TEXT.feedback?.table?.headers?.responses || 'Atsakymai';

    cardsConfig.forEach((card) => {
      if (!card || typeof card !== 'object') {
        return;
      }

      const cardElement = document.createElement('article');
      cardElement.className = 'feedback-card';
      cardElement.setAttribute('role', 'listitem');

      const title = document.createElement('p');
      title.className = 'feedback-card__title';
      title.textContent = card.title || '';

      if (card.type === 'comments') {
        cardElement.classList.add('feedback-card--comments');
        cardElement.appendChild(title);
        renderFeedbackCommentsCard(cardElement, card, summaryData[card.key]);
        selectors.feedbackCards.appendChild(cardElement);
        return;
      }

      const valueElement = document.createElement('p');
      valueElement.className = 'feedback-card__value';
      const rawValue = summaryData[card.key];
      const formattedValue = formatFeedbackCardValue(rawValue, card.format);
      const fallbackText = card.empty || TEXT.feedback?.empty || '—';
      valueElement.textContent = formattedValue != null ? formattedValue : fallbackText;

      const metaElement = document.createElement('p');
      metaElement.className = 'feedback-card__meta';
      const metaParts = [];
      if (card.description) {
        metaParts.push(card.description);
      }
      if (card.metaKey && summaryData[card.metaKey]) {
        const metaText = String(summaryData[card.metaKey]).trim();
        if (metaText) {
          metaParts.push(metaText);
        }
      }
      if (card.countKey) {
        const rawCount = summaryData[card.countKey];
        let numericCount = null;
        if (Number.isFinite(rawCount)) {
          numericCount = rawCount;
        } else if (typeof rawCount === 'string') {
          const parsedCount = Number.parseFloat(rawCount.replace(',', '.'));
          if (Number.isFinite(parsedCount)) {
            numericCount = parsedCount;
          }
        }
        if (Number.isFinite(numericCount)) {
          metaParts.push(`${responsesLabel}: ${numberFormatter.format(Math.round(numericCount))}`);
        }
      }
      const nodes = [title, valueElement];
      if (metaParts.length) {
        metaElement.textContent = metaParts.join(' • ');
        nodes.push(metaElement);
      }
      if (card.trendKey && summaryData[card.trendKey]) {
        const trendInfo = summaryData[card.trendKey];
        const trendElement = document.createElement('p');
        trendElement.className = 'feedback-card__trend';
        setDatasetValue(trendElement, 'trend', trendInfo.trend || 'neutral');
        if (trendInfo.ariaLabel) {
          trendElement.setAttribute('aria-label', trendInfo.ariaLabel);
        }
        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'feedback-card__trend-arrow';
        arrowSpan.textContent = trendInfo.arrow || '→';
        const textSpan = document.createElement('span');
        textSpan.className = 'feedback-card__trend-text';
        textSpan.textContent = trendInfo.text || '';
        trendElement.append(arrowSpan, textSpan);
        nodes.push(trendElement);
      }
      nodes.forEach((node) => {
        cardElement.appendChild(node);
      });
      selectors.feedbackCards.appendChild(cardElement);
    });
  }

  function renderFeedbackTable(monthlyStats) {
    if (!selectors.feedbackTable) {
      return;
    }

    selectors.feedbackTable.replaceChildren();

    const placeholder = TEXT.feedback?.table?.placeholder || '—';

    if (!Array.isArray(monthlyStats) || !monthlyStats.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 8;
      cell.textContent = TEXT.feedback?.table?.empty || TEXT.feedback?.empty || 'Kol kas nėra apibendrintų atsiliepimų.';
      row.appendChild(cell);
      selectors.feedbackTable.appendChild(row);
      return;
    }

    const formatRating = (value) => {
      if (Number.isFinite(value)) {
        return decimalFormatter.format(value);
      }
      return placeholder;
    };

    monthlyStats
      .slice()
      .sort((a, b) => b.month.localeCompare(a.month))
      .forEach((entry) => {
        const row = document.createElement('tr');
        const monthLabel = formatMonthLabel(entry?.month || '');
        const displayMonth = monthLabel || entry?.month || placeholder;
        const responsesValue = Number.isFinite(entry?.responses) ? entry.responses : null;
        const contactResponses = Number.isFinite(entry?.contactResponses) ? entry.contactResponses : null;
        const contactShare = Number.isFinite(entry?.contactShare) ? entry.contactShare : null;
        let contactText = placeholder;
        if (contactResponses != null && contactShare != null) {
          contactText = `${numberFormatter.format(Math.round(contactResponses))} (${percentFormatter.format(contactShare)})`;
        } else if (contactResponses != null) {
          contactText = numberFormatter.format(Math.round(contactResponses));
        } else if (contactShare != null) {
          contactText = percentFormatter.format(contactShare);
        }

        row.innerHTML = `
          <td>${displayMonth}</td>
          <td>${responsesValue != null ? numberFormatter.format(Math.round(responsesValue)) : placeholder}</td>
          <td>${formatRating(entry.overallAverage)}</td>
          <td>${formatRating(entry.doctorsAverage)}</td>
          <td>${formatRating(entry.nursesAverage)}</td>
          <td>${formatRating(entry.aidesAverage)}</td>
          <td>${formatRating(entry.waitingAverage)}</td>
          <td>${contactText}</td>
        `;

        selectors.feedbackTable.appendChild(row);
      });
  }

  async function renderFeedbackTrendChart(monthlyStats) {
    const renderers = getChartRenderers();
    if (!renderers || typeof renderers.renderFeedbackTrendChart !== 'function') {
      return Promise.resolve();
    }
    return renderers.renderFeedbackTrendChart(monthlyStats);
  }

  function renderFeedbackSection(feedbackStats) {
    const summary = feedbackStats && typeof feedbackStats.summary === 'object'
      ? feedbackStats.summary
      : null;
    const monthly = Array.isArray(feedbackStats?.monthly)
      ? feedbackStats.monthly
      : [];

    renderFeedbackCards(summary);
    renderFeedbackTable(monthly);

    renderFeedbackTrendChart(monthly).catch((error) => {
      const errorInfo = describeError(error, { code: 'FEEDBACK_TREND_RENDER', message: 'Nepavyko atvaizduoti atsiliepimų trendo' });
      console.error(errorInfo.log, error);
    });
  }

  function getActiveFeedbackTrendWindow() {
    const raw = dashboardState.feedback?.trendWindow;
    if (Number.isFinite(raw) && raw > 0) {
      return Math.max(1, Math.round(raw));
    }
    return null;
  }

  function updateFeedbackTrendSubtitle() {
    if (!selectors.feedbackTrendSubtitle) {
      return;
    }
    const builder = TEXT.feedback?.trend?.subtitle;
    const activeWindow = getActiveFeedbackTrendWindow();
    if (typeof builder === 'function') {
      selectors.feedbackTrendSubtitle.textContent = builder(activeWindow);
    } else if (typeof builder === 'string') {
      selectors.feedbackTrendSubtitle.textContent = builder;
    } else if (Number.isFinite(activeWindow) && activeWindow > 0) {
      selectors.feedbackTrendSubtitle.textContent = `Paskutinių ${activeWindow} mėnesių dinamika`;
    } else {
      selectors.feedbackTrendSubtitle.textContent = 'Visų prieinamų mėnesių dinamika';
    }
  }

  function syncFeedbackTrendControls() {
    if (!selectors.feedbackTrendButtons || !selectors.feedbackTrendButtons.length) {
      return;
    }
    const activeWindow = getActiveFeedbackTrendWindow();
    selectors.feedbackTrendButtons.forEach((button) => {
      const months = Number.parseInt(getDatasetValue(button, 'trendMonths', ''), 10);
      const isActive = Number.isFinite(months) ? months === activeWindow : activeWindow == null;
      button.setAttribute('aria-pressed', String(Boolean(isActive)));
      setDatasetValue(button, 'active', String(Boolean(isActive)));
    });
  }

  function setFeedbackTrendWindow(months) {
    const normalized = Number.isFinite(months) && months > 0
      ? Math.max(1, Math.round(months))
      : null;
    if (dashboardState.feedback.trendWindow === normalized) {
      return;
    }
    dashboardState.feedback.trendWindow = normalized;
    syncFeedbackTrendControls();
    updateFeedbackTrendSubtitle();
    const monthly = Array.isArray(dashboardState.feedback.monthly)
      ? dashboardState.feedback.monthly
      : [];
    renderFeedbackTrendChart(monthly).catch((error) => {
      const errorInfo = describeError(error, { code: 'FEEDBACK_TREND_WINDOW', message: 'Nepavyko atnaujinti atsiliepimų trendo laikotarpio' });
      console.error(errorInfo.log, error);
    });
  }

  return {
    renderFeedbackTrendChart,
    renderFeedbackSection,
    getActiveFeedbackTrendWindow,
    updateFeedbackTrendSubtitle,
    syncFeedbackTrendControls,
    setFeedbackTrendWindow,
  };
}
