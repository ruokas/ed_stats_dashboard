import { setDatasetValue } from '../utils/dom.js';
import {
  buildEdDashboardModel,
  buildEdSectionsModel,
} from './ed-model.js?v=2026-02-10-feedback-location-split-1';

function formatCardDisplayValue(config, summary, formatEdCardValue) {
  const primaryRaw = summary?.[config.key];
  const secondaryRaw = config.secondaryKey ? summary?.[config.secondaryKey] : undefined;
  let hasValue = false;
  let text = config.empty ?? '—';
  if (config.secondaryKey) {
    const primaryFormatted = formatEdCardValue(primaryRaw, config.format);
    const secondaryFormatted = formatEdCardValue(secondaryRaw, config.format);
    const suffix = config.format === 'hours' ? ' val.' : config.format === 'minutes' ? ' min.' : '';
    const primaryText = primaryFormatted != null ? `${primaryFormatted}${suffix}` : '—';
    const secondaryText = secondaryFormatted != null ? `${secondaryFormatted}${suffix}` : '—';
    if (primaryFormatted != null || secondaryFormatted != null) {
      text = `${primaryText} / ${secondaryText}`;
      hasValue = true;
    }
  } else {
    const formatted = formatEdCardValue(primaryRaw, config.format);
    if (formatted != null) {
      text =
        config.format === 'hours'
          ? `${formatted} val.`
          : config.format === 'minutes'
            ? `${formatted} min.`
            : formatted;
      hasValue = true;
    }
  }
  return { text, hasValue, primaryRaw, secondaryRaw };
}

function buildCardRenderKey(cardConfigs, summary, dispositions, displayVariant) {
  const cardSnapshot = (Array.isArray(cardConfigs) ? cardConfigs : []).map((config) => ({
    key: config?.key || '',
    secondaryKey: config?.secondaryKey || '',
    metaKey: config?.metaKey || '',
    trendKey: config?.trendKey || '',
    value: config?.key ? (summary?.[config.key] ?? null) : null,
    secondary: config?.secondaryKey ? (summary?.[config.secondaryKey] ?? null) : null,
    meta: config?.metaKey ? (summary?.[config.metaKey] ?? null) : null,
    trend: config?.trendKey ? (summary?.[config.trendKey] ?? null) : null,
  }));
  const dispositionsSnapshot = (Array.isArray(dispositions) ? dispositions : []).map((item) => ({
    label: item?.label || '',
    count: Number.isFinite(item?.count) ? item.count : 0,
    key: item?.categoryKey || item?.category || '',
  }));
  return JSON.stringify({
    displayVariant,
    activeFeedbackMetricKey: summary?.feedbackCurrentMonthMetricKey ?? '',
    activeFeedbackMetricTitle: summary?.feedbackCurrentMonthMetricTitle ?? '',
    activeFeedbackLocationLeft: summary?.feedbackCurrentMonthMetricByLocation?.left?.value ?? null,
    activeFeedbackLocationRight: summary?.feedbackCurrentMonthMetricByLocation?.right?.value ?? null,
    cardSnapshot,
    dispositionsSnapshot,
  });
}

function upsertCard(card, config, summary, { renderEdCommentsCard, formatEdCardValue, buildEdCardVisuals }) {
  card.className = 'ed-dashboard__card';
  card.setAttribute('role', 'listitem');
  setDatasetValue(card, 'cardKey', config.key || config.type || 'unknown');
  const nextType =
    config.type === 'donut'
      ? 'donut'
      : config.type === 'comments'
        ? 'comments'
        : config.type === 'feedback-rotating-metric'
          ? 'feedback-rotating-metric'
          : 'default';
  const currentType = String(card.dataset?.cardType || '');
  card.classList.toggle('ed-dashboard__card--donut', nextType === 'donut');
  card.classList.toggle('ed-dashboard__card--comments', nextType === 'comments');
  card.classList.toggle('ed-dashboard__card--feedback-rotating', nextType === 'feedback-rotating-metric');
  if (currentType !== nextType) {
    card.replaceChildren();
  }
  setDatasetValue(card, 'cardType', nextType);

  let title = card.querySelector('.ed-dashboard__card-title');
  if (!title) {
    title = document.createElement('p');
    title.className = 'ed-dashboard__card-title';
    card.prepend(title);
  }
  if (nextType === 'feedback-rotating-metric') {
    title.textContent =
      String(summary?.feedbackCurrentMonthMetricTitle || config.title || '').trim() || config.title;
  } else {
    title.textContent = config.title;
  }

  if (nextType === 'donut') {
    title.id = 'edDispositionsTitle';
    let chartWrapper = card.querySelector('.ed-dashboard__donut-chart');
    if (!chartWrapper) {
      chartWrapper = document.createElement('div');
      chartWrapper.className = 'ed-dashboard__donut-chart';
      card.appendChild(chartWrapper);
    }
    let canvas = chartWrapper.querySelector('#edDispositionsChart');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'edDispositionsChart';
      canvas.setAttribute('role', 'img');
      chartWrapper.replaceChildren(canvas);
    }
    canvas.setAttribute('aria-labelledby', 'edDispositionsTitle');
    let message = card.querySelector('#edDispositionsMessage');
    if (!message) {
      message = document.createElement('p');
      message.className = 'ed-dashboard__chart-message';
      message.id = 'edDispositionsMessage';
      message.setAttribute('role', 'status');
      message.hidden = true;
      card.appendChild(message);
    }
    return;
  }

  title.removeAttribute('id');

  if (nextType === 'comments') {
    const rawComments = Array.isArray(summary?.[config.key]) ? summary[config.key] : [];
    const metaValue = config.metaKey ? summary?.[config.metaKey] : '';
    const commentsRenderKey = JSON.stringify({
      comments: rawComments.map((item) => ({
        text: String(item?.text || '').trim(),
        respondent: String(item?.respondent || '').trim(),
        location: String(item?.location || '').trim(),
        receivedAt:
          item?.receivedAt instanceof Date && !Number.isNaN(item.receivedAt.getTime())
            ? item.receivedAt.toISOString()
            : String(item?.receivedAt || ''),
      })),
      meta: typeof metaValue === 'string' ? metaValue.trim() : String(metaValue ?? ''),
      rotateMs: Number(config?.rotateMs) || 0,
      title: String(config?.title || ''),
    });
    const previousCommentsRenderKey = String(card.dataset?.commentsRenderKey || '');
    if (previousCommentsRenderKey === commentsRenderKey) {
      return;
    }
    const staleNodes = Array.from(card.children).filter((node) => node !== title);
    staleNodes.forEach((node) => {
      node.remove();
    });
    renderEdCommentsCard(card, config, rawComments, metaValue);
    setDatasetValue(card, 'commentsRenderKey', commentsRenderKey);
    return;
  }

  if (nextType === 'feedback-rotating-metric') {
    const staleDonutNodes = card.querySelector('.ed-dashboard__donut-chart');
    if (staleDonutNodes) {
      staleDonutNodes.remove();
    }
    const staleMessage = card.querySelector('#edDispositionsMessage');
    if (staleMessage) {
      staleMessage.remove();
    }
    let value = card.querySelector('.ed-dashboard__card-value');
    if (!value) {
      value = document.createElement('p');
      value.className = 'ed-dashboard__card-value';
      card.appendChild(value);
    }
    value.textContent = '';
    value.hidden = true;
    value.setAttribute('aria-hidden', 'true');

    let visualsRoot = card.querySelector('.ed-dashboard__card-visuals');
    if (!visualsRoot) {
      visualsRoot = document.createElement('div');
      visualsRoot.className = 'ed-dashboard__card-visuals';
      card.appendChild(visualsRoot);
    }
    const byLocation = summary?.feedbackCurrentMonthMetricByLocation || {};
    const left = byLocation.left || {};
    const right = byLocation.right || {};
    const buildLocationMetricNode = (entry) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'ed-dashboard__feedback-location-metric';
      const label = document.createElement('p');
      label.className = 'ed-dashboard__feedback-location-label';
      label.textContent = String(entry?.label || '');
      const metricValue = document.createElement('p');
      metricValue.className = 'ed-dashboard__feedback-location-value';
      const formatted = formatEdCardValue(entry?.value, config.format);
      metricValue.textContent = formatted != null ? formatted : config.empty || '—';
      const meta = document.createElement('p');
      meta.className = 'ed-dashboard__feedback-location-meta';
      const count = Number.isFinite(entry?.count) ? Math.max(0, Math.round(entry.count)) : null;
      meta.textContent = Number.isFinite(count) ? `n=${count}` : '';
      wrapper.append(label, metricValue, meta);
      if (entry?.trend) {
        const trendInfo = entry.trend;
        const trend = document.createElement('p');
        trend.className = 'ed-dashboard__card-delta';
        setDatasetValue(trend, 'trend', trendInfo.trend || 'neutral');
        if (trendInfo.ariaLabel) {
          trend.setAttribute('aria-label', trendInfo.ariaLabel);
        }
        const arrow = document.createElement('span');
        arrow.className = 'ed-dashboard__card-delta-arrow';
        arrow.textContent = trendInfo.arrow || '→';
        const text = document.createElement('span');
        text.className = 'ed-dashboard__card-delta-text';
        text.textContent = trendInfo.text || '';
        trend.append(arrow, text);
        wrapper.appendChild(trend);
      }
      return wrapper;
    };
    const locationGrid = document.createElement('div');
    locationGrid.className = 'ed-dashboard__feedback-location-grid';
    locationGrid.append(buildLocationMetricNode(left), buildLocationMetricNode(right));
    visualsRoot.replaceChildren(locationGrid);

    let meta = card.querySelector('.ed-dashboard__card-meta');
    if (!meta) {
      meta = document.createElement('p');
      meta.className = 'ed-dashboard__card-meta';
      card.appendChild(meta);
    }
    const metaRaw = config.metaKey ? summary?.[config.metaKey] : null;
    const metaText =
      typeof metaRaw === 'string' ? metaRaw.trim() : metaRaw != null ? String(metaRaw).trim() : '';
    meta.textContent = metaText.length ? metaText : config.description || '';

    let indicators = card.querySelector('.ed-dashboard__feedback-indicators');
    if (!indicators) {
      indicators = document.createElement('div');
      indicators.className = 'ed-dashboard__feedback-indicators';
      indicators.setAttribute('aria-hidden', 'true');
      card.appendChild(indicators);
    }
    const catalog = Array.isArray(summary?.feedbackCurrentMonthMetricCatalog)
      ? summary.feedbackCurrentMonthMetricCatalog
      : [];
    const activeKey = String(summary?.feedbackCurrentMonthMetricKey || '');
    indicators.replaceChildren(
      ...catalog.map((metric) => {
        const dot = document.createElement('span');
        dot.className = 'ed-dashboard__feedback-indicator';
        const isActive = String(metric?.key || '') === activeKey;
        if (isActive) {
          dot.classList.add('is-active');
        }
        return dot;
      })
    );
    return;
  }

  const staleDonutNodes = card.querySelector('.ed-dashboard__donut-chart');
  if (staleDonutNodes) {
    staleDonutNodes.remove();
  }
  const staleMessage = card.querySelector('#edDispositionsMessage');
  if (staleMessage) {
    staleMessage.remove();
  }

  let value = card.querySelector('.ed-dashboard__card-value');
  if (!value) {
    value = document.createElement('p');
    value.className = 'ed-dashboard__card-value';
    card.appendChild(value);
  }
  const { text, primaryRaw, secondaryRaw } = formatCardDisplayValue(config, summary, formatEdCardValue);
  value.textContent = text;

  let visualsRoot = card.querySelector('.ed-dashboard__card-visuals');
  if (!visualsRoot) {
    visualsRoot = document.createElement('div');
    visualsRoot.className = 'ed-dashboard__card-visuals';
    card.appendChild(visualsRoot);
  }
  const visuals = buildEdCardVisuals(config, primaryRaw, secondaryRaw, summary);
  visualsRoot.replaceChildren(...visuals);

  let meta = card.querySelector('.ed-dashboard__card-meta');
  if (!meta) {
    meta = document.createElement('p');
    meta.className = 'ed-dashboard__card-meta';
    card.appendChild(meta);
  }
  const metaRaw = config.metaKey ? summary?.[config.metaKey] : null;
  const metaText =
    typeof metaRaw === 'string' ? metaRaw.trim() : metaRaw != null ? String(metaRaw).trim() : '';
  meta.textContent = metaText.length ? metaText : config.description || '';
}

function upsertSection(
  container,
  section,
  sectionIndex,
  groupedSections,
  sectionDefinitions,
  TEXT,
  createEdSectionIcon,
  summary,
  deps
) {
  const sectionKey = section.key || `section-${sectionIndex}`;
  let sectionEl = container.querySelector(`.ed-dashboard__section[data-section-key="${sectionKey}"]`);
  if (!sectionEl) {
    sectionEl = document.createElement('section');
    sectionEl.className = 'ed-dashboard__section';
    sectionEl.setAttribute('role', 'region');
    setDatasetValue(sectionEl, 'sectionKey', sectionKey);
    container.appendChild(sectionEl);
  }
  const shouldRenderHeader = Boolean(section.title || section.description || groupedSections.length > 1);
  let header = sectionEl.querySelector('.ed-dashboard__section-header');
  let sectionLabelId = '';
  if (shouldRenderHeader) {
    if (!header) {
      header = document.createElement('header');
      header.className = 'ed-dashboard__section-header';
      sectionEl.prepend(header);
    }
    let iconWrapper = header.querySelector('.ed-dashboard__section-icon');
    if (!iconWrapper) {
      iconWrapper = document.createElement('span');
      iconWrapper.className = 'ed-dashboard__section-icon';
      header.prepend(iconWrapper);
    }
    iconWrapper.replaceChildren(
      createEdSectionIcon(section.icon || (section.key !== 'default' ? section.key : 'default'))
    );
    let textWrapper = header.querySelector('.ed-dashboard__section-header-text');
    if (!textWrapper) {
      textWrapper = document.createElement('div');
      textWrapper.className = 'ed-dashboard__section-header-text';
      header.appendChild(textWrapper);
    }
    let titleEl = textWrapper.querySelector('.ed-dashboard__section-title');
    if (!titleEl) {
      titleEl = document.createElement('h3');
      titleEl.className = 'ed-dashboard__section-title';
      textWrapper.prepend(titleEl);
    }
    sectionLabelId = `edSectionTitle-${String(section.key || sectionIndex).replace(/[^a-z0-9_-]/gi, '') || sectionIndex}`;
    titleEl.id = sectionLabelId;
    titleEl.textContent =
      section.title || sectionDefinitions?.default?.title || TEXT.ed.title || 'ED skydelis';
    let descriptionEl = textWrapper.querySelector('.ed-dashboard__section-description');
    if (section.description || sectionDefinitions?.default?.description) {
      if (!descriptionEl) {
        descriptionEl = document.createElement('p');
        descriptionEl.className = 'ed-dashboard__section-description';
        textWrapper.appendChild(descriptionEl);
      }
      descriptionEl.textContent = section.description || sectionDefinitions?.default?.description || '';
    } else if (descriptionEl) {
      descriptionEl.remove();
    }
    sectionEl.setAttribute('aria-labelledby', sectionLabelId);
  } else {
    if (header) {
      header.remove();
    }
    sectionEl.removeAttribute('aria-labelledby');
  }
  let cardsWrapper = sectionEl.querySelector('.ed-dashboard__section-grid');
  if (!cardsWrapper) {
    cardsWrapper = document.createElement('div');
    cardsWrapper.className = 'ed-dashboard__section-grid';
    sectionEl.appendChild(cardsWrapper);
  }
  cardsWrapper.setAttribute('role', 'list');
  if (sectionLabelId) {
    cardsWrapper.setAttribute('aria-labelledby', sectionLabelId);
  } else {
    cardsWrapper.removeAttribute('aria-labelledby');
  }
  const existingCards = new Map(
    Array.from(cardsWrapper.querySelectorAll('.ed-dashboard__card[data-card-key]')).map((node) => [
      String(node.dataset.cardKey || ''),
      node,
    ])
  );
  const nextCardKeys = new Set();
  (Array.isArray(section.cards) ? section.cards : []).forEach((config) => {
    if (!config || typeof config !== 'object') {
      return;
    }
    const cardKey = String(config.key || config.type || '');
    if (!cardKey) {
      return;
    }
    nextCardKeys.add(cardKey);
    let card = existingCards.get(cardKey);
    if (!card) {
      card = document.createElement('article');
    }
    upsertCard(card, config, summary, deps);
    cardsWrapper.appendChild(card);
  });
  existingCards.forEach((node, key) => {
    if (!nextCardKeys.has(key)) {
      node.remove();
    }
  });
}

export function createEdRenderer(env) {
  const {
    selectors,
    dashboardState,
    TEXT,
    DEFAULT_KPI_WINDOW_DAYS,
    settings,
    buildYearMonthMetrics,
    numberFormatter,
    resetEdCommentRotation,
    hideEdSkeleton,
    normalizeEdSearchQuery,
    matchesEdSearch,
    createEmptyEdSummary,
    summarizeEdRecords,
    formatLocalDateKey,
    formatMonthLabel,
    buildFeedbackTrendInfo,
    buildEdStatus,
    renderEdDispositionsChart,
    createEdSectionIcon,
    renderEdCommentsCard,
    formatEdCardValue,
    buildEdCardVisuals,
    enrichSummaryWithOverviewFallback,
  } = env;

  async function renderEdDashboard(edData) {
    if (!selectors.edCards) {
      return;
    }
    hideEdSkeleton();
    const model = buildEdDashboardModel({
      edData,
      dashboardState,
      TEXT,
      DEFAULT_KPI_WINDOW_DAYS,
      settings,
      buildYearMonthMetrics,
      numberFormatter,
      normalizeEdSearchQuery,
      matchesEdSearch,
      createEmptyEdSummary,
      summarizeEdRecords,
      formatLocalDateKey,
      formatMonthLabel,
      buildFeedbackTrendInfo,
      enrichSummaryWithOverviewFallback,
    });
    const { dataset, summary, dispositions, displayVariant, cardConfigs, dispositionsText } = model;
    if (dashboardState?.feedbackMetricCarousel && typeof dashboardState.feedbackMetricCarousel === 'object') {
      dashboardState.feedbackMetricCarousel.metricCatalog = Array.isArray(
        summary?.feedbackCurrentMonthMetricCatalog
      )
        ? summary.feedbackCurrentMonthMetricCatalog
        : [];
    }
    const renderKey = buildCardRenderKey(cardConfigs, summary, dispositions, displayVariant);
    const mustPatchCards = dashboardState.edCardsRenderKey !== renderKey;

    if (mustPatchCards) {
      const commentsCurrentlyRendered = Boolean(
        selectors.edCards.querySelector('.ed-dashboard__card[data-card-key="feedbackComments"]')
      );
      const commentsWillBeRendered = cardConfigs.some(
        (config) => String(config?.key || '') === 'feedbackComments'
      );
      if (commentsCurrentlyRendered && !commentsWillBeRendered) {
        resetEdCommentRotation();
      }
      const { sectionDefinitions, groupedSections } = buildEdSectionsModel({ TEXT, cardConfigs });
      const activeSectionKeys = new Set(
        (Array.isArray(groupedSections) ? groupedSections : []).map(
          (section, index) => section.key || `section-${index}`
        )
      );
      Array.from(selectors.edCards.querySelectorAll('.ed-dashboard__section')).forEach((sectionEl) => {
        const key = sectionEl.dataset?.sectionKey || '';
        if (!activeSectionKeys.has(key)) {
          sectionEl.remove();
        }
      });
      groupedSections.forEach((section, sectionIndex) => {
        if (!Array.isArray(section.cards) || !section.cards.length) {
          return;
        }
        upsertSection(
          selectors.edCards,
          section,
          sectionIndex,
          groupedSections,
          sectionDefinitions,
          TEXT,
          createEdSectionIcon,
          summary,
          { renderEdCommentsCard, formatEdCardValue, buildEdCardVisuals }
        );
      });
      dashboardState.edCardsRenderKey = renderKey;
    }

    selectors.edDispositionsTitle = selectors.edCards.querySelector('#edDispositionsTitle');
    selectors.edDispositionsChart = selectors.edCards.querySelector('#edDispositionsChart');
    selectors.edDispositionsMessage = selectors.edCards.querySelector('#edDispositionsMessage');
    if (selectors.edDispositionsTitle) {
      selectors.edDispositionsTitle.textContent = dispositionsText.title || '';
    }
    if (selectors.edDispositionsMessage) {
      selectors.edDispositionsMessage.hidden = true;
      selectors.edDispositionsMessage.textContent = '';
    }

    try {
      await renderEdDispositionsChart(dispositions, dispositionsText, displayVariant);
    } catch (error) {
      console.error('Nepavyko atvaizduoti pacientų kategorijų grafiko:', error);
      if (selectors.edDispositionsChart) {
        selectors.edDispositionsChart.hidden = true;
        selectors.edDispositionsChart.setAttribute('aria-hidden', 'true');
      }
      if (selectors.edDispositionsMessage) {
        selectors.edDispositionsMessage.textContent =
          dispositionsText.empty || 'Nepavyko atvaizduoti grafiko.';
        selectors.edDispositionsMessage.hidden = false;
      }
    }

    const statusInfo = buildEdStatus(summary, dataset, displayVariant);
    if (selectors.edStatus) {
      const tone = statusInfo.tone || 'info';
      const pillText = statusInfo.message || '';
      selectors.edStatus.textContent = pillText;
      setDatasetValue(selectors.edStatus, 'tone', tone);
    }
  }

  return { renderEdDashboard };
}
