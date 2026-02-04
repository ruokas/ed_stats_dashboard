import { setDatasetValue } from '../utils/dom.js';

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
      const baseDataset = edData || {};
      const baseComments = Array.isArray(baseDataset?.summary?.feedbackComments)
        ? baseDataset.summary.feedbackComments
        : [];
      const baseCommentsMeta = typeof baseDataset?.summary?.feedbackCommentsMeta === 'string'
        ? baseDataset.summary.feedbackCommentsMeta
        : '';
      const searchQuery = normalizeEdSearchQuery(dashboardState.edSearchQuery);
      const baseRecords = Array.isArray(baseDataset.records) ? baseDataset.records : [];
      let dataset = baseDataset;
      if (searchQuery) {
        const filteredRecords = baseRecords.filter((record) => matchesEdSearch(record, searchQuery));
        const aggregates = summarizeEdRecords(filteredRecords, baseDataset.meta || {});
        dataset = {
          ...baseDataset,
          records: filteredRecords,
          summary: aggregates.summary,
          dispositions: aggregates.dispositions,
          daily: aggregates.daily,
          meta: { ...(baseDataset.meta || {}), searchQuery },
        };
      }
      const summary = dataset.summary || createEmptyEdSummary(dataset.meta?.type);
      if (!Array.isArray(summary.feedbackComments) || !summary.feedbackComments.length) {
        summary.feedbackComments = baseComments.slice();
      }
      if (!summary.feedbackCommentsMeta && baseCommentsMeta) {
        summary.feedbackCommentsMeta = baseCommentsMeta;
      }
      resetEdCommentRotation();
      const dispositions = Array.isArray(dataset.dispositions) ? dataset.dispositions : [];
      const summaryMode = typeof summary?.mode === 'string' ? summary.mode : (dataset.meta?.type || 'legacy');
      const hasSnapshotMetrics = Number.isFinite(summary?.currentPatients)
        || Number.isFinite(summary?.occupiedBeds)
        || Number.isFinite(summary?.nursePatientsPerStaff)
        || Number.isFinite(summary?.doctorPatientsPerStaff);
      const displayVariant = summaryMode === 'snapshot'
        || (summaryMode === 'hybrid' && hasSnapshotMetrics)
        ? 'snapshot'
        : 'legacy';

      const overviewDailyStats = Array.isArray(dashboardState?.kpi?.daily) && dashboardState.kpi.daily.length
        ? dashboardState.kpi.daily
        : (Array.isArray(dashboardState.dailyStats) ? dashboardState.dailyStats : []);
      const configuredWindowRaw = Number.isFinite(Number(dashboardState?.kpi?.filters?.window))
        ? Number(dashboardState.kpi.filters.window)
        : (Number.isFinite(Number(settings?.calculations?.windowDays))
          ? Number(settings.calculations.windowDays)
          : DEFAULT_KPI_WINDOW_DAYS);
      const configuredWindow = Number.isFinite(configuredWindowRaw) && configuredWindowRaw > 0
        ? configuredWindowRaw
        : DEFAULT_KPI_WINDOW_DAYS;
      if (overviewDailyStats.length) {
        const overviewMetrics = buildYearMonthMetrics(overviewDailyStats, configuredWindow);
        if (overviewMetrics) {
          const { yearMetrics, monthMetrics } = overviewMetrics;
          const yearAvgMinutes = Number.isFinite(yearMetrics?.avgTime) ? yearMetrics.avgTime * 60 : null;
          const yearHospLosMinutes = Number.isFinite(yearMetrics?.avgHospitalizedTime)
            ? yearMetrics.avgHospitalizedTime * 60
            : null;
          const monthAvgMinutes = Number.isFinite(monthMetrics?.avgTime) ? monthMetrics.avgTime * 60 : null;
          const yearHospShare = Number.isFinite(yearMetrics?.hospitalizedShare) ? yearMetrics.hospitalizedShare : null;
          const monthHospShare = Number.isFinite(monthMetrics?.hospitalizedShare) ? monthMetrics.hospitalizedShare : null;

          summary.avgLosMinutes = yearAvgMinutes != null ? yearAvgMinutes : summary.avgLosMinutes;
          summary.avgLosHospitalizedMinutes = yearHospLosMinutes != null ? yearHospLosMinutes : summary.avgLosHospitalizedMinutes;
          summary.avgLosYearMinutes = yearAvgMinutes != null ? yearAvgMinutes : null;
          summary.avgLosMonthMinutes = monthAvgMinutes != null ? monthAvgMinutes : null;
          summary.hospitalizedShare = yearHospShare != null ? yearHospShare : summary.hospitalizedShare;
          summary.hospitalizedYearShare = yearHospShare != null ? yearHospShare : null;
          summary.hospitalizedMonthShare = monthHospShare != null ? monthHospShare : null;
        }
      }
      const overviewRecords = Array.isArray(dashboardState?.primaryRecords) && dashboardState.primaryRecords.length
        ? dashboardState.primaryRecords
        : (Array.isArray(dashboardState?.rawRecords) ? dashboardState.rawRecords : []);
      enrichSummaryWithOverviewFallback(summary, overviewRecords, overviewDailyStats, { windowDays: configuredWindow });
      const cardsConfigSource = TEXT.ed.cards || {};
      const cardConfigs = Array.isArray(cardsConfigSource[displayVariant]) ? cardsConfigSource[displayVariant] : [];
      const dispositionsText = TEXT.ed.dispositions?.[displayVariant] || TEXT.ed.dispositions?.legacy || {};
      const updatedAt = summary.generatedAt instanceof Date && !Number.isNaN(summary.generatedAt.getTime())
        ? summary.generatedAt
        : (dataset.updatedAt instanceof Date && !Number.isNaN(dataset.updatedAt.getTime()) ? dataset.updatedAt : null);

      const feedbackMonthly = Array.isArray(dashboardState?.feedback?.monthly)
        ? dashboardState.feedback.monthly
        : [];
      const currentMonthKey = (formatLocalDateKey(new Date()) || '').slice(0, 7);
      let feedbackMonth = feedbackMonthly.find((entry) => entry?.month === currentMonthKey) || null;
      if (!feedbackMonth && feedbackMonthly.length) {
        feedbackMonth = feedbackMonthly.reduce((latest, entry) => {
          if (!entry?.month) {
            return latest;
          }
          if (!latest) {
            return entry;
          }
          return entry.month > latest.month ? entry : latest;
        }, null);
      }
      const feedbackAverage = Number.isFinite(feedbackMonth?.overallAverage)
        ? feedbackMonth.overallAverage
        : null;
      const feedbackResponses = Number.isFinite(feedbackMonth?.responses)
        ? Math.max(0, Math.round(feedbackMonth.responses))
        : null;
      const feedbackMonthLabel = feedbackMonth?.month
        ? (formatMonthLabel(feedbackMonth.month) || feedbackMonth.month)
        : '';
      const feedbackIndex = feedbackMonth?.month
        ? feedbackMonthly.findIndex((entry) => entry?.month === feedbackMonth.month)
        : -1;
      let previousFeedbackMonth = null;
      if (feedbackIndex > 0) {
        for (let i = feedbackIndex - 1; i >= 0; i -= 1) {
          const candidate = feedbackMonthly[i];
          if (candidate?.month && Number.isFinite(candidate.overallAverage)) {
            previousFeedbackMonth = candidate;
            break;
          }
        }
      }
      const previousMonthLabel = previousFeedbackMonth?.month
        ? (formatMonthLabel(previousFeedbackMonth.month) || previousFeedbackMonth.month)
        : '';
      const feedbackTrend = previousFeedbackMonth && Number.isFinite(feedbackAverage)
        ? buildFeedbackTrendInfo(
          feedbackAverage,
          previousFeedbackMonth.overallAverage,
          {
            currentLabel: feedbackMonthLabel,
            previousLabel: previousMonthLabel,
          },
        )
        : null;
      const feedbackMetaParts = [];
      if (feedbackMonthLabel) {
        feedbackMetaParts.push(feedbackMonthLabel);
      }
      if (feedbackResponses != null) {
        feedbackMetaParts.push(`Atsakymai: ${numberFormatter.format(feedbackResponses)}`);
      }
      summary.feedbackCurrentMonthOverall = feedbackAverage;
      summary.feedbackCurrentMonthMeta = feedbackMetaParts.join(' • ');
      summary.feedbackCurrentMonthTrend = feedbackTrend;
      const feedbackComments = Array.isArray(dashboardState?.feedback?.summary?.comments)
        ? dashboardState.feedback.summary.comments
        : [];
      const now = new Date();
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 30);
      const recentFeedbackComments = feedbackComments.filter((entry) => {
        if (!(entry?.receivedAt instanceof Date) || Number.isNaN(entry.receivedAt.getTime())) {
          return false;
        }
        return entry.receivedAt >= cutoff;
      });
      summary.feedbackComments = recentFeedbackComments;
      const commentsMeta = recentFeedbackComments.length
        ? `Komentarai (30 d.): ${numberFormatter.format(recentFeedbackComments.length)}`
        : '';
      summary.feedbackCommentsMeta = commentsMeta;

      if (selectors.edCards) {
        selectors.edCards.replaceChildren();
        const sectionDefinitions = TEXT.ed.cardSections || {};
        const sectionsMap = new Map();

        cardConfigs.forEach((config) => {
          if (!config || typeof config !== 'object') {
            return;
          }
          const sectionKey = config.section || 'default';
          if (!sectionsMap.has(sectionKey)) {
            const sectionMeta = sectionDefinitions[sectionKey] || sectionDefinitions.default || {};
            sectionsMap.set(sectionKey, {
              key: sectionKey,
              title: sectionMeta.title || '',
              description: sectionMeta.description || '',
              icon: sectionMeta.icon || '',
              cards: [],
            });
          }
          sectionsMap.get(sectionKey).cards.push(config);
        });

        const groupedSections = Array.from(sectionsMap.values());
        if (!groupedSections.length && cardConfigs.length) {
          groupedSections.push({
            key: 'default',
            title: sectionDefinitions?.default?.title || '',
            description: sectionDefinitions?.default?.description || '',
            icon: sectionDefinitions?.default?.icon || '',
            cards: cardConfigs.filter((config) => config && typeof config === 'object'),
          });
        }

        const sectionOrder = Array.isArray(sectionDefinitions)
          ? sectionDefinitions
          : Object.keys(sectionDefinitions || {});
        if (sectionOrder.length) {
          groupedSections.sort((a, b) => {
            const aIndex = sectionOrder.indexOf(a.key);
            const bIndex = sectionOrder.indexOf(b.key);
            const normalizedA = aIndex === -1 ? Number.POSITIVE_INFINITY : aIndex;
            const normalizedB = bIndex === -1 ? Number.POSITIVE_INFINITY : bIndex;
            if (normalizedA === normalizedB) {
              return String(a.key || '').localeCompare(String(b.key || ''));
            }
            return normalizedA - normalizedB;
          });
        }

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
        const pillText = tone === 'success'
          ? (statusInfo.timestamp || statusInfo.message || TEXT.ed.status.loading)
          : (statusInfo.message || TEXT.ed.status.loading);
        selectors.edStatus.textContent = pillText;
        setDatasetValue(selectors.edStatus, 'tone', tone);
      }
      updateEdTvPanel(summary, dispositions, displayVariant, dataset, statusInfo);
    }

  return { renderEdDashboard };
}
