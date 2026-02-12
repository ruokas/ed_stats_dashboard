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
    const date = value instanceof Date ? value : value ? new Date(value) : null;
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
  const baseCommentsMeta =
    typeof baseDataset?.summary?.feedbackCommentsMeta === 'string'
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
  const summaryMode = typeof summary?.mode === 'string' ? summary.mode : dataset.meta?.type || 'legacy';
  const hasSnapshotMetrics =
    Number.isFinite(summary?.currentPatients) ||
    Number.isFinite(summary?.occupiedBeds) ||
    Number.isFinite(summary?.nursePatientsPerStaff) ||
    Number.isFinite(summary?.doctorPatientsPerStaff);
  const computedDisplayVariant =
    summaryMode === 'snapshot' || (summaryMode === 'hybrid' && hasSnapshotMetrics) ? 'snapshot' : 'legacy';
  const hasRecords = Array.isArray(dataset?.records) && dataset.records.length > 0;
  const hasLegacyTotals = Number.isFinite(summary?.totalPatients) && summary.totalPatients > 0;
  const hasRenderableEdData = hasRecords || hasLegacyTotals || hasSnapshotMetrics;
  let displayVariant = computedDisplayVariant;
  if (hasRenderableEdData) {
    dashboardState.edLastDisplayVariant = computedDisplayVariant;
  } else {
    const persistedVariant = dashboardState?.edLastDisplayVariant;
    displayVariant =
      persistedVariant === 'legacy' || persistedVariant === 'snapshot' ? persistedVariant : 'snapshot';
  }

  const overviewDailyStats =
    Array.isArray(dashboardState?.kpi?.daily) && dashboardState.kpi.daily.length
      ? dashboardState.kpi.daily
      : Array.isArray(dashboardState.dailyStats)
        ? dashboardState.dailyStats
        : [];
  const configuredWindowRaw = Number.isFinite(Number(dashboardState?.kpi?.filters?.window))
    ? Number(dashboardState.kpi.filters.window)
    : Number.isFinite(Number(settings?.calculations?.windowDays))
      ? Number(settings.calculations.windowDays)
      : DEFAULT_KPI_WINDOW_DAYS;
  const configuredWindow =
    Number.isFinite(configuredWindowRaw) && configuredWindowRaw > 0
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
      const yearHospShare = Number.isFinite(yearMetrics?.hospitalizedShare)
        ? yearMetrics.hospitalizedShare
        : null;
      const monthHospShare = Number.isFinite(monthMetrics?.hospitalizedShare)
        ? monthMetrics.hospitalizedShare
        : null;

      summary.avgLosMinutes = yearAvgMinutes != null ? yearAvgMinutes : summary.avgLosMinutes;
      summary.avgLosHospitalizedMinutes =
        yearHospLosMinutes != null ? yearHospLosMinutes : summary.avgLosHospitalizedMinutes;
      summary.avgLosYearMinutes = yearAvgMinutes != null ? yearAvgMinutes : summary.avgLosYearMinutes;
      summary.avgLosMonthMinutes = monthAvgMinutes != null ? monthAvgMinutes : summary.avgLosMonthMinutes;
      summary.hospitalizedShare = yearHospShare != null ? yearHospShare : summary.hospitalizedShare;
      summary.hospitalizedYearShare = yearHospShare != null ? yearHospShare : summary.hospitalizedYearShare;
      summary.hospitalizedMonthShare =
        monthHospShare != null ? monthHospShare : summary.hospitalizedMonthShare;
    }
  }
  const overviewRecords =
    Array.isArray(dashboardState?.primaryRecords) && dashboardState.primaryRecords.length
      ? dashboardState.primaryRecords
      : Array.isArray(dashboardState?.rawRecords)
        ? dashboardState.rawRecords
        : [];
  enrichSummaryWithOverviewFallback(summary, overviewRecords, overviewDailyStats, {
    windowDays: configuredWindow,
  });

  const cardsConfigSource = TEXT.ed.cards || {};
  const cardConfigs = Array.isArray(cardsConfigSource[displayVariant])
    ? cardsConfigSource[displayVariant]
    : [];
  const dispositionsText = TEXT.ed.dispositions?.[displayVariant] || TEXT.ed.dispositions?.legacy || {};
  const updatedAt =
    summary.generatedAt instanceof Date && !Number.isNaN(summary.generatedAt.getTime())
      ? summary.generatedAt
      : dataset.updatedAt instanceof Date && !Number.isNaN(dataset.updatedAt.getTime())
        ? dataset.updatedAt
        : null;

  const feedbackMonthly = Array.isArray(dashboardState?.feedback?.monthly)
    ? dashboardState.feedback.monthly
    : [];
  const feedbackRecords = Array.isArray(dashboardState?.feedback?.records)
    ? dashboardState.feedback.records
    : [];
  const feedbackRotatingConfig = cardConfigs.find((card) => card?.type === 'feedback-rotating-metric');
  const feedbackMetricConfig =
    Array.isArray(feedbackRotatingConfig?.metrics) && feedbackRotatingConfig.metrics.length
      ? feedbackRotatingConfig.metrics
      : [
          { key: 'overallAverage', label: 'Bendra patirtis', countKey: 'overallCount' },
          { key: 'doctorsAverage', label: 'Gydytojų darbas', countKey: 'doctorsCount' },
          { key: 'nursesAverage', label: 'Slaugytojų darbas', countKey: 'nursesCount' },
          { key: 'aidesAverage', label: 'Padėjėjų darbas', countKey: 'aidesResponses' },
          { key: 'waitingAverage', label: 'Laukimo vertinimas', countKey: 'waitingCount' },
        ];
  const isValidRating = (value) => Number.isFinite(value) && value >= 1 && value <= 5;
  const normalizeText = (value) =>
    typeof value === 'string'
      ? value
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
      : '';
  const classifyLocation = (raw) => {
    const value = normalizeText(raw);
    if (!value) return null;
    if (value.includes('ambulator')) return 'left';
    if (value.includes('sale') || value.includes('sal') || value.includes('zale')) return 'right';
    return null;
  };
  const compareGroups = TEXT?.feedback?.trend?.compareGroups?.location || {};
  const locationLabels = {
    left: String(compareGroups?.left?.label || 'Ambulatorija'),
    right: String(compareGroups?.right?.label || 'Salė'),
  };
  const getMetricValueFromRecord = (record, metricKey) => {
    if (!record || typeof record !== 'object') {
      return null;
    }
    if (metricKey === 'overallAverage') {
      return isValidRating(record.overallRating) ? Number(record.overallRating) : null;
    }
    if (metricKey === 'doctorsAverage') {
      return isValidRating(record.doctorsRating) ? Number(record.doctorsRating) : null;
    }
    if (metricKey === 'nursesAverage') {
      return isValidRating(record.nursesRating) ? Number(record.nursesRating) : null;
    }
    if (metricKey === 'aidesAverage') {
      return record.aidesContact === true && isValidRating(record.aidesRating)
        ? Number(record.aidesRating)
        : null;
    }
    if (metricKey === 'waitingAverage') {
      return isValidRating(record.waitingRating) ? Number(record.waitingRating) : null;
    }
    return null;
  };
  const locationMetricBuckets = new Map();
  feedbackRecords.forEach((record) => {
    const monthKey = toMonthKey(record?.receivedAt);
    const side = classifyLocation(record?.location);
    if (!monthKey || !side) {
      return;
    }
    feedbackMetricConfig.forEach((metric) => {
      const metricKey = String(metric?.key || '');
      if (!metricKey) {
        return;
      }
      const value = getMetricValueFromRecord(record, metricKey);
      if (!Number.isFinite(value)) {
        return;
      }
      const key = `${monthKey}|||${metricKey}|||${side}`;
      if (!locationMetricBuckets.has(key)) {
        locationMetricBuckets.set(key, { sum: 0, count: 0 });
      }
      const bucket = locationMetricBuckets.get(key);
      bucket.sum += Number(value);
      bucket.count += 1;
    });
  });
  const getLocationMetricStats = (monthKey, metricKey, side) => {
    const key = `${monthKey}|||${metricKey}|||${side}`;
    const bucket = locationMetricBuckets.get(key);
    const count = Number.isFinite(bucket?.count) ? bucket.count : 0;
    const sum = Number.isFinite(bucket?.sum) ? bucket.sum : 0;
    return {
      count,
      average: count > 0 ? sum / count : null,
    };
  };
  const buildFeedbackCountsForMonth = (monthKey) => {
    const counts = {
      overallCount: 0,
      doctorsCount: 0,
      nursesCount: 0,
      aidesResponses: 0,
      waitingCount: 0,
    };
    if (!monthKey) {
      return counts;
    }
    feedbackRecords.forEach((record) => {
      const recordMonth = toMonthKey(record?.receivedAt);
      if (recordMonth !== monthKey) {
        return;
      }
      if (isValidRating(record?.overallRating)) {
        counts.overallCount += 1;
      }
      if (isValidRating(record?.doctorsRating)) {
        counts.doctorsCount += 1;
      }
      if (isValidRating(record?.nursesRating)) {
        counts.nursesCount += 1;
      }
      if (record?.aidesContact === true && isValidRating(record?.aidesRating)) {
        counts.aidesResponses += 1;
      }
      if (isValidRating(record?.waitingRating)) {
        counts.waitingCount += 1;
      }
    });
    return counts;
  };
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
      feedbackMonth =
        monthlyFromRecords.find((entry) => entry.month === currentMonthKey) ||
        monthlyFromRecords[monthlyFromRecords.length - 1] ||
        null;
    }
  }
  const feedbackMonthKey = feedbackMonth?.month ? String(feedbackMonth.month) : '';
  const feedbackMonthCounts = buildFeedbackCountsForMonth(feedbackMonthKey);
  const feedbackMonthLabel = feedbackMonth?.month
    ? formatMonthLabel(feedbackMonth.month) || feedbackMonth.month
    : '';
  const monthKeysFromRecords = Array.from(
    new Set(feedbackRecords.map((record) => toMonthKey(record?.receivedAt)).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  const feedbackMonthRecordIndex = feedbackMonthKey ? monthKeysFromRecords.indexOf(feedbackMonthKey) : -1;
  const feedbackIndex = feedbackMonth?.month
    ? feedbackMonthly.findIndex((entry) => entry?.month === feedbackMonth.month)
    : -1;
  const feedbackMetricCatalog = feedbackMetricConfig.map((metric) => {
    const value = Number.isFinite(feedbackMonth?.[metric.key]) ? Number(feedbackMonth[metric.key]) : null;
    const countValue = Number.isFinite(feedbackMonthCounts?.[metric.countKey])
      ? Number(feedbackMonthCounts[metric.countKey])
      : null;
    let previousMonth = null;
    if (feedbackIndex > 0) {
      for (let i = feedbackIndex - 1; i >= 0; i -= 1) {
        const candidate = feedbackMonthly[i];
        if (candidate?.month && Number.isFinite(candidate?.[metric.key])) {
          previousMonth = candidate;
          break;
        }
      }
    }
    const previousMonthLabel = previousMonth?.month
      ? formatMonthLabel(previousMonth.month) || previousMonth.month
      : '';
    const trend =
      previousMonth && Number.isFinite(value)
        ? buildFeedbackTrendInfo(value, Number(previousMonth[metric.key]), {
            currentLabel: feedbackMonthLabel,
            previousLabel: previousMonthLabel,
          })
        : null;
    const currentLeft = getLocationMetricStats(feedbackMonthKey, metric.key, 'left');
    const currentRight = getLocationMetricStats(feedbackMonthKey, metric.key, 'right');
    const findPreviousLocationValue = (side) => {
      if (feedbackMonthRecordIndex <= 0) {
        return null;
      }
      for (let i = feedbackMonthRecordIndex - 1; i >= 0; i -= 1) {
        const monthKey = monthKeysFromRecords[i];
        const previousStats = getLocationMetricStats(monthKey, metric.key, side);
        if (Number.isFinite(previousStats.average)) {
          return {
            month: monthKey,
            label: formatMonthLabel(monthKey) || monthKey,
            average: Number(previousStats.average),
          };
        }
      }
      return null;
    };
    const previousLeft = findPreviousLocationValue('left');
    const previousRight = findPreviousLocationValue('right');
    const leftTrend =
      previousLeft && Number.isFinite(currentLeft.average)
        ? buildFeedbackTrendInfo(Number(currentLeft.average), Number(previousLeft.average), {
            currentLabel: feedbackMonthLabel,
            previousLabel: previousLeft.label,
          })
        : null;
    const rightTrend =
      previousRight && Number.isFinite(currentRight.average)
        ? buildFeedbackTrendInfo(Number(currentRight.average), Number(previousRight.average), {
            currentLabel: feedbackMonthLabel,
            previousLabel: previousRight.label,
          })
        : null;
    const metaParts = [];
    if (feedbackMonthLabel) {
      metaParts.push(feedbackMonthLabel);
    }
    if (countValue != null && feedbackMonthKey) {
      metaParts.push(`Atsakymai: ${numberFormatter.format(Math.max(0, Math.round(countValue)))}`);
    }
    return {
      key: metric.key,
      label: metric.label,
      countKey: metric.countKey,
      value,
      count: countValue,
      meta: metaParts.join(' • '),
      trend,
      byLocation: {
        left: {
          key: 'left',
          label: locationLabels.left,
          value: Number.isFinite(currentLeft.average) ? Number(currentLeft.average) : null,
          count: Number.isFinite(currentLeft.count) ? currentLeft.count : 0,
          trend: leftTrend,
        },
        right: {
          key: 'right',
          label: locationLabels.right,
          value: Number.isFinite(currentRight.average) ? Number(currentRight.average) : null,
          count: Number.isFinite(currentRight.count) ? currentRight.count : 0,
          trend: rightTrend,
        },
      },
      month: feedbackMonthKey,
    };
  });
  summary.feedbackCurrentMonthMetricCatalog = feedbackMetricCatalog;
  const carousel =
    dashboardState.feedbackMetricCarousel && typeof dashboardState.feedbackMetricCarousel === 'object'
      ? dashboardState.feedbackMetricCarousel
      : { index: 0 };
  const normalizedIndex = feedbackMetricCatalog.length
    ? ((Number.parseInt(String(carousel.index ?? 0), 10) % feedbackMetricCatalog.length) +
        feedbackMetricCatalog.length) %
      feedbackMetricCatalog.length
    : 0;
  carousel.index = normalizedIndex;
  if (dashboardState.feedbackMetricCarousel && typeof dashboardState.feedbackMetricCarousel === 'object') {
    dashboardState.feedbackMetricCarousel.index = normalizedIndex;
  }
  const activeMetric = feedbackMetricCatalog[normalizedIndex] || null;
  summary.feedbackCurrentMonthMetricKey = activeMetric?.key || '';
  summary.feedbackCurrentMonthMetricTitle =
    activeMetric?.label || feedbackRotatingConfig?.title || 'Atsiliepimų rodiklis';
  summary.feedbackCurrentMonthMetricValue = Number.isFinite(activeMetric?.value) ? activeMetric.value : null;
  summary.feedbackCurrentMonthMetricMeta = activeMetric?.meta || '';
  summary.feedbackCurrentMonthMetricTrend = activeMetric?.trend || null;
  summary.feedbackCurrentMonthMetricByLocation = activeMetric?.byLocation || {
    left: { key: 'left', label: locationLabels.left, value: null, count: 0, trend: null },
    right: { key: 'right', label: locationLabels.right, value: null, count: 0, trend: null },
  };

  const overallMetric = feedbackMetricCatalog.find((metric) => metric.key === 'overallAverage') || null;
  if (Number.isFinite(overallMetric?.value)) {
    summary.feedbackCurrentMonthOverall = overallMetric.value;
  } else {
    summary.feedbackCurrentMonthOverall = null;
  }
  if (overallMetric?.meta) {
    summary.feedbackCurrentMonthMeta = overallMetric.meta;
  } else {
    summary.feedbackCurrentMonthMeta = '';
  }
  if (overallMetric?.trend) {
    summary.feedbackCurrentMonthTrend = overallMetric.trend;
  } else {
    summary.feedbackCurrentMonthTrend = null;
  }

  const feedbackComments = Array.isArray(dashboardState?.feedback?.summary?.comments)
    ? dashboardState.feedback.summary.comments
    : Array.isArray(summary.feedbackComments)
      ? summary.feedbackComments
      : [];
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  const recentFeedbackComments = feedbackComments.filter((entry) => {
    const receivedAt =
      entry?.receivedAt instanceof Date
        ? entry.receivedAt
        : entry?.receivedAt
          ? new Date(entry.receivedAt)
          : null;
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
