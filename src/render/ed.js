import { setDatasetValue } from '../utils/dom.js';
import { buildEdDashboardModel, buildEdSectionsModel } from './ed-model.js?v=2026-02-08-ed-cards-fallback-1';

function formatCardDisplayValue(config, summary, formatEdCardValue) {
  const primaryRaw = summary?.[config.key];
  const secondaryRaw = config.secondaryKey ? summary?.[config.secondaryKey] : undefined;
  let hasValue = false;
  let text = config.empty ?? '—';
  if (config.secondaryKey) {
    const primaryFormatted = formatEdCardValue(primaryRaw, config.format);
    const secondaryFormatted = formatEdCardValue(secondaryRaw, config.format);
    const suffix = config.format === 'hours' ? ' val.' : (config.format === 'minutes' ? ' min.' : '');
    const primaryText = primaryFormatted != null ? `${primaryFormatted}${suffix}` : '—';
    const secondaryText = secondaryFormatted != null ? `${secondaryFormatted}${suffix}` : '—';
    if (primaryFormatted != null || secondaryFormatted != null) {
      text = `${primaryText} / ${secondaryText}`;
      hasValue = true;
    }
  } else {
    const formatted = formatEdCardValue(primaryRaw, config.format);
    if (formatted != null) {
      text = config.format === 'hours'
        ? `${formatted} val.`
        : (config.format === 'minutes' ? `${formatted} min.` : formatted);
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
    value: config?.key ? summary?.[config.key] ?? null : null,
    secondary: config?.secondaryKey ? summary?.[config.secondaryKey] ?? null : null,
    meta: config?.metaKey ? summary?.[config.metaKey] ?? null : null,
    trend: config?.trendKey ? summary?.[config.trendKey] ?? null : null,
  }));
  const dispositionsSnapshot = (Array.isArray(dispositions) ? dispositions : []).map((item) => ({
    label: item?.label || '',
    count: Number.isFinite(item?.count) ? item.count : 0,
    key: item?.categoryKey || item?.category || '',
  }));
  return JSON.stringify({ displayVariant, cardSnapshot, dispositionsSnapshot });
}

function upsertCard(card, config, summary, {
  renderEdCommentsCard,
  formatEdCardValue,
  buildEdCardVisuals,
}) {
  card.className = 'ed-dashboard__card';
  card.setAttribute('role', 'listitem');
  setDatasetValue(card, 'cardKey', config.key || config.type || 'unknown');
  card.classList.toggle('ed-dashboard__card--donut', config.type === 'donut');
  card.classList.toggle('ed-dashboard__card--comments', config.type === 'comments');
  card.replaceChildren();

  const title = document.createElement('p');
  title.className = 'ed-dashboard__card-title';
  title.textContent = config.title;
  if (config.type === 'donut') {
    title.id = 'edDispositionsTitle';
  }
  card.appendChild(title);

  if (config.type === 'donut') {
    const chartWrapper = document.createElement('div');
    chartWrapper.className = 'ed-dashboard__donut-chart';
    const canvas = document.createElement('canvas');
    canvas.id = 'edDispositionsChart';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-labelledby', 'edDispositionsTitle');
    chartWrapper.appendChild(canvas);
    card.appendChild(chartWrapper);
    const message = document.createElement('p');
    message.className = 'ed-dashboard__chart-message';
    message.id = 'edDispositionsMessage';
    message.setAttribute('role', 'status');
    message.hidden = true;
    card.appendChild(message);
    return;
  }

  if (config.type === 'comments') {
    const rawComments = Array.isArray(summary?.[config.key]) ? summary[config.key] : [];
    const metaValue = config.metaKey ? summary?.[config.metaKey] : '';
    renderEdCommentsCard(card, config, rawComments, metaValue);
    return;
  }

  const value = document.createElement('p');
  value.className = 'ed-dashboard__card-value';
  const { text, primaryRaw, secondaryRaw } = formatCardDisplayValue(config, summary, formatEdCardValue);
  value.textContent = text;
  card.appendChild(value);
  const visuals = buildEdCardVisuals(config, primaryRaw, secondaryRaw, summary);
  visuals.forEach((node) => card.appendChild(node));

  const meta = document.createElement('p');
  meta.className = 'ed-dashboard__card-meta';
  const metaRaw = config.metaKey ? summary?.[config.metaKey] : null;
  const metaText = typeof metaRaw === 'string' ? metaRaw.trim() : (metaRaw != null ? String(metaRaw).trim() : '');
  meta.textContent = metaText.length ? metaText : (config.description || '');
  card.appendChild(meta);
}

function upsertSection(container, section, sectionIndex, groupedSections, sectionDefinitions, TEXT, createEdSectionIcon, summary, deps) {
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
  sectionEl.replaceChildren();
  let sectionLabelId = '';
  if (shouldRenderHeader) {
    const header = document.createElement('header');
    header.className = 'ed-dashboard__section-header';
    const iconWrapper = document.createElement('span');
    iconWrapper.className = 'ed-dashboard__section-icon';
    iconWrapper.appendChild(createEdSectionIcon(section.icon || (section.key !== 'default' ? section.key : 'default')));
    header.appendChild(iconWrapper);
    const textWrapper = document.createElement('div');
    textWrapper.className = 'ed-dashboard__section-header-text';
    const titleEl = document.createElement('h3');
    sectionLabelId = `edSectionTitle-${String(section.key || sectionIndex).replace(/[^a-z0-9_-]/gi, '') || sectionIndex}`;
    titleEl.className = 'ed-dashboard__section-title';
    titleEl.id = sectionLabelId;
    titleEl.textContent = section.title || sectionDefinitions?.default?.title || TEXT.ed.title || 'RŠL SMPS skydelis';
    textWrapper.appendChild(titleEl);
    if (section.description || sectionDefinitions?.default?.description) {
      const descriptionEl = document.createElement('p');
      descriptionEl.className = 'ed-dashboard__section-description';
      descriptionEl.textContent = section.description || sectionDefinitions?.default?.description || '';
      textWrapper.appendChild(descriptionEl);
    }
    header.appendChild(textWrapper);
    sectionEl.appendChild(header);
    sectionEl.setAttribute('aria-labelledby', sectionLabelId);
  } else {
    sectionEl.removeAttribute('aria-labelledby');
  }
  const cardsWrapper = document.createElement('div');
  cardsWrapper.className = 'ed-dashboard__section-grid';
  cardsWrapper.setAttribute('role', 'list');
  if (sectionLabelId) {
    cardsWrapper.setAttribute('aria-labelledby', sectionLabelId);
  }
  (Array.isArray(section.cards) ? section.cards : []).forEach((config) => {
    if (!config || typeof config !== 'object') {
      return;
    }
    const card = document.createElement('article');
    upsertCard(card, config, summary, deps);
    cardsWrapper.appendChild(card);
  });
  sectionEl.appendChild(cardsWrapper);
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
    resetEdCommentRotation();
    const renderKey = buildCardRenderKey(cardConfigs, summary, dispositions, displayVariant);
    const mustPatchCards = dashboardState.edCardsRenderKey !== renderKey;

    if (mustPatchCards) {
      const { sectionDefinitions, groupedSections } = buildEdSectionsModel({ TEXT, cardConfigs });
      const activeSectionKeys = new Set((Array.isArray(groupedSections) ? groupedSections : []).map((section, index) => section.key || `section-${index}`));
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
          { renderEdCommentsCard, formatEdCardValue, buildEdCardVisuals },
        );
      });
      dashboardState.edCardsRenderKey = renderKey;
    }

    selectors.edDispositionsTitle = document.getElementById('edDispositionsTitle');
    selectors.edDispositionsChart = document.getElementById('edDispositionsChart');
    selectors.edDispositionsMessage = document.getElementById('edDispositionsMessage');
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
        selectors.edDispositionsMessage.textContent = dispositionsText.empty || 'Nepavyko atvaizduoti grafiko.';
        selectors.edDispositionsMessage.hidden = false;
      }
    }

    const statusInfo = buildEdStatus(summary, dataset, displayVariant);
    if (selectors.edStatus) {
      const tone = statusInfo.tone || 'info';
      const pillText = tone === 'error' ? (statusInfo.message || '') : '';
      selectors.edStatus.textContent = pillText;
      setDatasetValue(selectors.edStatus, 'tone', tone);
    }
  }

  return { renderEdDashboard };
}
