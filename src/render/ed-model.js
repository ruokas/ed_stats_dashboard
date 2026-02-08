export function buildEdDashboardModel({
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
}) {
  const toMonthKey = (value) => {
    const date = value instanceof Date ? value : (value ? new Date(value) : null);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return '';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

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
      summary.avgLosYearMinutes = yearAvgMinutes != null ? yearAvgMinutes : summary.avgLosYearMinutes;
      summary.avgLosMonthMinutes = monthAvgMinutes != null ? monthAvgMinutes : summary.avgLosMonthMinutes;
      summary.hospitalizedShare = yearHospShare != null ? yearHospShare : summary.hospitalizedShare;
      summary.hospitalizedYearShare = yearHospShare != null ? yearHospShare : summary.hospitalizedYearShare;
      summary.hospitalizedMonthShare = monthHospShare != null ? monthHospShare : summary.hospitalizedMonthShare;
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
  if (!feedbackMonth) {
    const feedbackRecords = Array.isArray(dashboardState?.feedback?.records)
      ? dashboardState.feedback.records
      : [];
    const buckets = new Map();
    feedbackRecords.forEach((record) => {
      const monthKey = toMonthKey(record?.receivedAt);
      const overall = Number.isFinite(record?.overallRating) ? record.overallRating : null;
      if (!monthKey || overall == null) {
        return;
      }
      if (!buckets.has(monthKey)) {
        buckets.set(monthKey, { month: monthKey, total: 0, responses: 0 });
      }
      const bucket = buckets.get(monthKey);
      bucket.total += overall;
      bucket.responses += 1;
    });
    if (buckets.size) {
      const monthlyFromRecords = Array.from(buckets.values())
        .map((entry) => ({
          month: entry.month,
          responses: entry.responses,
          overallAverage: entry.responses > 0 ? entry.total / entry.responses : null,
        }))
        .sort((a, b) => (a.month > b.month ? 1 : -1));
      feedbackMonth = monthlyFromRecords.find((entry) => entry.month === currentMonthKey)
        || monthlyFromRecords[monthlyFromRecords.length - 1]
        || null;
    }
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
  if (feedbackAverage != null) {
    summary.feedbackCurrentMonthOverall = feedbackAverage;
  }
  if (feedbackMetaParts.length) {
    summary.feedbackCurrentMonthMeta = feedbackMetaParts.join(' • ');
  }
  if (feedbackTrend) {
    summary.feedbackCurrentMonthTrend = feedbackTrend;
  }

  const feedbackComments = Array.isArray(dashboardState?.feedback?.summary?.comments)
    ? dashboardState.feedback.summary.comments
    : (Array.isArray(summary.feedbackComments) ? summary.feedbackComments : []);
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  const recentFeedbackComments = feedbackComments.filter((entry) => {
    const receivedAt = entry?.receivedAt instanceof Date
      ? entry.receivedAt
      : (entry?.receivedAt ? new Date(entry.receivedAt) : null);
    if (!(receivedAt instanceof Date) || Number.isNaN(receivedAt.getTime())) {
      return false;
    }
    return receivedAt >= cutoff;
  });
  if (recentFeedbackComments.length) {
    summary.feedbackComments = recentFeedbackComments;
    summary.feedbackCommentsMeta = `Komentarai (30 d.): ${numberFormatter.format(recentFeedbackComments.length)}`;
  } else if (!Array.isArray(summary.feedbackComments) || !summary.feedbackComments.length) {
    summary.feedbackComments = [];
    summary.feedbackCommentsMeta = '';
  }

  return {
    dataset,
    summary,
    dispositions,
    displayVariant,
    cardConfigs,
    dispositionsText,
    updatedAt,
  };
}

export function buildEdSectionsModel({ TEXT, cardConfigs }) {
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

  return {
    sectionDefinitions,
    groupedSections,
  };
}
