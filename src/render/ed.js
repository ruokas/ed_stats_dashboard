import { setDatasetValue } from '../utils/dom.js';
import { buildEdDashboardModel, buildEdSectionsModel } from './ed-model.js?v=2026-02-08-ed-cards-fallback-1';

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
    updateEdTvPanel,
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
      const {
        dataset,
        summary,
        dispositions,
        displayVariant,
        cardConfigs,
        dispositionsText,
      } = model;
      resetEdCommentRotation();

      if (selectors.edCards) {
        selectors.edCards.replaceChildren();
        const { sectionDefinitions, groupedSections } = buildEdSectionsModel({ TEXT, cardConfigs });

        groupedSections.forEach((section, sectionIndex) => {
          if (!Array.isArray(section.cards) || !section.cards.length) {
            return;
          }
          const sectionEl = document.createElement('section');
          sectionEl.className = 'ed-dashboard__section';
          sectionEl.setAttribute('role', 'region');
          if (section.key) {
            setDatasetValue(sectionEl, 'sectionKey', section.key);
          }

          const shouldRenderHeader = Boolean(section.title || section.description || groupedSections.length > 1);
          let sectionLabelId = '';
          if (shouldRenderHeader) {
            const header = document.createElement('header');
            header.className = 'ed-dashboard__section-header';

            const iconWrapper = document.createElement('span');
            iconWrapper.className = 'ed-dashboard__section-icon';
            const iconKey = section.icon || (section.key !== 'default' ? section.key : 'default');
            iconWrapper.appendChild(createEdSectionIcon(iconKey));
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
          }

          const cardsWrapper = document.createElement('div');
          cardsWrapper.className = 'ed-dashboard__section-grid';
          cardsWrapper.setAttribute('role', 'list');
          if (sectionLabelId) {
            cardsWrapper.setAttribute('aria-labelledby', sectionLabelId);
          }

          section.cards.forEach((config) => {
            if (!config || typeof config !== 'object') {
              return;
            }
            const card = document.createElement('article');
            card.className = 'ed-dashboard__card';
            card.setAttribute('role', 'listitem');

              const isDonutCard = config.type === 'donut';
              if (isDonutCard) {
                card.classList.add('ed-dashboard__card--donut');
              }

              const isCommentsCard = config.type === 'comments';

              const title = document.createElement('p');
              title.className = 'ed-dashboard__card-title';
              title.textContent = config.title;
              if (isDonutCard) {
              title.id = 'edDispositionsTitle';
            }
            card.appendChild(title);

            if (isDonutCard) {
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

                cardsWrapper.appendChild(card);
                return;
              }

              if (isCommentsCard) {
                card.classList.add('ed-dashboard__card--comments');
                const rawComments = Array.isArray(summary?.[config.key]) ? summary[config.key] : [];
                const metaValue = config.metaKey ? summary?.[config.metaKey] : '';
                renderEdCommentsCard(card, config, rawComments, metaValue);
                cardsWrapper.appendChild(card);
                return;
              }

              const value = document.createElement('p');
              value.className = 'ed-dashboard__card-value';
            const primaryRaw = summary?.[config.key];
            const secondaryRaw = config.secondaryKey ? summary?.[config.secondaryKey] : undefined;
            let hasValue = false;
            if (config.secondaryKey) {
              const primaryFormatted = formatEdCardValue(primaryRaw, config.format);
              const secondaryFormatted = formatEdCardValue(secondaryRaw, config.format);
              const suffix = config.format === 'hours'
                ? ' val.'
                : (config.format === 'minutes' ? ' min.' : '');
              const primaryText = primaryFormatted != null
                ? `${primaryFormatted}${suffix}`
                : '—';
              const secondaryText = secondaryFormatted != null
                ? `${secondaryFormatted}${suffix}`
                : '—';
              if (primaryFormatted != null || secondaryFormatted != null) {
                value.textContent = `${primaryText} / ${secondaryText}`;
                hasValue = true;
              }
            } else {
              const formatted = formatEdCardValue(primaryRaw, config.format);
              if (formatted != null) {
                if (config.format === 'hours') {
                  value.textContent = `${formatted} val.`;
                } else if (config.format === 'minutes') {
                  value.textContent = `${formatted} min.`;
                } else {
                  value.textContent = formatted;
                }
                hasValue = true;
              }
            }
            if (!hasValue) {
              value.textContent = config.empty ?? '—';
            }

            const meta = document.createElement('p');
            meta.className = 'ed-dashboard__card-meta';
            const metaRaw = config.metaKey ? summary?.[config.metaKey] : null;
            const metaText = typeof metaRaw === 'string'
              ? metaRaw.trim()
              : (metaRaw != null ? String(metaRaw).trim() : '');
            meta.textContent = metaText.length ? metaText : (config.description || '');

            card.appendChild(value);

            const visuals = buildEdCardVisuals(config, primaryRaw, secondaryRaw, summary);
            visuals.forEach((node) => {
              card.appendChild(node);
            });

            card.appendChild(meta);
            cardsWrapper.appendChild(card);
          });

          sectionEl.appendChild(cardsWrapper);
          selectors.edCards.appendChild(sectionEl);
        });
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
      updateEdTvPanel(summary, dispositions, displayVariant, dataset, statusInfo);
    }

  return { renderEdDashboard };
}
