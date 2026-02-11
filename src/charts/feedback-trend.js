export async function renderFeedbackTrendChart(env, monthlyStats, feedbackRecords = []) {
  const {
    dashboardState,
    selectors,
    TEXT,
    loadChartJs,
    getThemePalette,
    getThemeStyleTarget,
    syncFeedbackTrendControls,
    updateFeedbackTrendSubtitle,
    getActiveFeedbackTrendWindow,
    getActiveFeedbackTrendMetrics,
    getActiveFeedbackTrendCompareMode,
    getFeedbackTrendMetricConfig,
    getFeedbackTrendCompareConfig,
    formatMonthLabel,
    numberFormatter,
    oneDecimalFormatter,
  } = env;

  const canvas = selectors.feedbackTrendChart || document.getElementById('feedbackTrendChart');
  const messageElement = selectors.feedbackTrendMessage || document.getElementById('feedbackTrendMessage');
  const summaryElement = selectors.feedbackTrendSummary || document.getElementById('feedbackTrendSummary');
  const skeletonElement = selectors.feedbackTrendSkeleton || document.getElementById('feedbackTrendSkeleton');

  const coerceNumeric = (value) => {
    if (Number.isFinite(value)) {
      return Number(value);
    }
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value.replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (value != null) {
      const coerced = Number(value);
      return Number.isFinite(coerced) ? coerced : null;
    }
    return null;
  };

  const normalizeText = (value) =>
    typeof value === 'string'
      ? value
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
      : '';

  const toMonthKey = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return '';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const isRating = (value) => Number.isFinite(value) && value >= 1 && value <= 5;

  const classifyRespondent = (raw) => {
    const value = normalizeText(raw);
    if (!value) return null;
    if (value.includes('artim') || value.includes('gimin') || value.includes('atstov')) return 'right';
    if (value.includes('pacient') || value.includes('pats')) return 'left';
    return null;
  };

  const classifyLocation = (raw) => {
    const value = normalizeText(raw);
    if (!value) return null;
    if (value.includes('ambulator')) return 'left';
    if (value.includes('sale') || value.includes('sal') || value.includes('zale')) return 'right';
    return null;
  };

  const updateSummary = (text) => {
    if (!summaryElement) return;
    if (text) {
      summaryElement.textContent = text;
      summaryElement.hidden = false;
      return;
    }
    summaryElement.textContent = '';
    summaryElement.hidden = true;
  };

  const setTrendMessage = (text) => {
    if (skeletonElement) {
      skeletonElement.hidden = true;
    }
    if (messageElement) {
      if (text) {
        messageElement.textContent = text;
        messageElement.hidden = false;
      } else {
        messageElement.textContent = '';
        messageElement.hidden = true;
      }
    }
    if (canvas) {
      if (text) {
        canvas.setAttribute('aria-hidden', 'true');
        canvas.hidden = true;
      } else {
        canvas.removeAttribute('aria-hidden');
        canvas.hidden = false;
      }
    }
    if (text) {
      updateSummary('');
    }
  };

  const aggregateMonthlyFromRecords = (records, predicate = null) => {
    const buckets = new Map();
    const list = Array.isArray(records) ? records : [];
    list.forEach((entry) => {
      if (typeof predicate === 'function' && !predicate(entry)) {
        return;
      }
      const month = toMonthKey(entry?.receivedAt);
      if (!month) {
        return;
      }
      if (!buckets.has(month)) {
        buckets.set(month, {
          month,
          responses: 0,
          overallSum: 0,
          overallCount: 0,
          doctorsSum: 0,
          doctorsCount: 0,
          nursesSum: 0,
          nursesCount: 0,
          aidesSum: 0,
          aidesCount: 0,
          waitingSum: 0,
          waitingCount: 0,
        });
      }
      const bucket = buckets.get(month);
      bucket.responses += 1;
      if (isRating(entry?.overallRating)) {
        bucket.overallSum += Number(entry.overallRating);
        bucket.overallCount += 1;
      }
      if (isRating(entry?.doctorsRating)) {
        bucket.doctorsSum += Number(entry.doctorsRating);
        bucket.doctorsCount += 1;
      }
      if (isRating(entry?.nursesRating)) {
        bucket.nursesSum += Number(entry.nursesRating);
        bucket.nursesCount += 1;
      }
      if (entry?.aidesContact === true && isRating(entry?.aidesRating)) {
        bucket.aidesSum += Number(entry.aidesRating);
        bucket.aidesCount += 1;
      }
      if (isRating(entry?.waitingRating)) {
        bucket.waitingSum += Number(entry.waitingRating);
        bucket.waitingCount += 1;
      }
    });

    return Array.from(buckets.values())
      .map((bucket) => ({
        month: bucket.month,
        label: formatMonthLabel(bucket.month) || bucket.month,
        responses: bucket.responses,
        overallAverage: bucket.overallCount > 0 ? bucket.overallSum / bucket.overallCount : null,
        doctorsAverage: bucket.doctorsCount > 0 ? bucket.doctorsSum / bucket.doctorsCount : null,
        nursesAverage: bucket.nursesCount > 0 ? bucket.nursesSum / bucket.nursesCount : null,
        aidesAverage: bucket.aidesCount > 0 ? bucket.aidesSum / bucket.aidesCount : null,
        waitingAverage: bucket.waitingCount > 0 ? bucket.waitingSum / bucket.waitingCount : null,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  };

  syncFeedbackTrendControls();
  updateFeedbackTrendSubtitle();

  if (!canvas || typeof canvas.getContext !== 'function') {
    setTrendMessage(
      TEXT.feedback?.trend?.unavailable ||
        'Nepavyko atvaizduoti trendo grafiko. Patikrinkite ryšį ir bandykite dar kartą.'
    );
    return;
  }

  const compareMode =
    typeof getActiveFeedbackTrendCompareMode === 'function' ? getActiveFeedbackTrendCompareMode() : 'none';
  const compareConfig =
    typeof getFeedbackTrendCompareConfig === 'function'
      ? getFeedbackTrendCompareConfig()
      : {
          respondent: {
            left: { key: 'patient', label: 'Pacientas' },
            right: { key: 'relative', label: 'Paciento artimasis' },
          },
          location: {
            left: { key: 'ambulatory', label: 'Ambulatorija' },
            right: { key: 'hall', label: 'Salė' },
          },
        };

  const fallbackMonthly = (Array.isArray(monthlyStats) ? monthlyStats : [])
    .map((entry) => {
      const rawMonth = typeof entry?.month === 'string' ? entry.month.trim() : '';
      if (!rawMonth) return null;
      return {
        month: rawMonth,
        label: formatMonthLabel(rawMonth) || rawMonth,
        overallAverage: coerceNumeric(entry?.overallAverage),
        doctorsAverage: coerceNumeric(entry?.doctorsAverage),
        nursesAverage: coerceNumeric(entry?.nursesAverage),
        aidesAverage: coerceNumeric(entry?.aidesAverage),
        waitingAverage: coerceNumeric(entry?.waitingAverage),
        responses: coerceNumeric(entry?.responses),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.month.localeCompare(b.month));

  const allRecords = Array.isArray(feedbackRecords) ? feedbackRecords.filter(Boolean) : [];
  const hasRecords = allRecords.length > 0;

  const groups = (() => {
    if (compareMode === 'respondent') {
      return [
        {
          key: compareConfig.respondent?.left?.key || 'patient',
          label: compareConfig.respondent?.left?.label || 'Pacientas',
          monthly: aggregateMonthlyFromRecords(
            allRecords,
            (entry) => classifyRespondent(entry?.respondent) === 'left'
          ),
        },
        {
          key: compareConfig.respondent?.right?.key || 'relative',
          label: compareConfig.respondent?.right?.label || 'Paciento artimasis',
          monthly: aggregateMonthlyFromRecords(
            allRecords,
            (entry) => classifyRespondent(entry?.respondent) === 'right'
          ),
        },
      ];
    }
    if (compareMode === 'location') {
      return [
        {
          key: compareConfig.location?.left?.key || 'ambulatory',
          label: compareConfig.location?.left?.label || 'Ambulatorija',
          monthly: aggregateMonthlyFromRecords(
            allRecords,
            (entry) => classifyLocation(entry?.location) === 'left'
          ),
        },
        {
          key: compareConfig.location?.right?.key || 'hall',
          label: compareConfig.location?.right?.label || 'Salė',
          monthly: aggregateMonthlyFromRecords(
            allRecords,
            (entry) => classifyLocation(entry?.location) === 'right'
          ),
        },
      ];
    }
    return [
      {
        key: 'all',
        label: '',
        monthly: hasRecords ? aggregateMonthlyFromRecords(allRecords) : fallbackMonthly,
      },
    ];
  })();

  const monthSet = new Set();
  groups.forEach((group) => {
    group.monthly.forEach((entry) => {
      monthSet.add(entry.month);
    });
  });
  const monthKeys = Array.from(monthSet).sort((a, b) => a.localeCompare(b));
  if (!monthKeys.length) {
    if (
      dashboardState.charts.feedbackTrend &&
      typeof dashboardState.charts.feedbackTrend.destroy === 'function'
    ) {
      dashboardState.charts.feedbackTrend.destroy();
    }
    dashboardState.charts.feedbackTrend = null;
    setTrendMessage(
      TEXT.feedback?.trend?.empty ||
        'Trendo grafikas bus parodytas, kai atsiras bent vienas mėnuo su bendru įvertinimu.'
    );
    return;
  }

  const activeWindow = getActiveFeedbackTrendWindow();
  const scopedMonthKeys =
    Number.isFinite(activeWindow) && activeWindow > 0
      ? monthKeys.slice(-Math.max(1, Math.round(activeWindow)))
      : monthKeys.slice();
  const labels = scopedMonthKeys.map((month) => formatMonthLabel(month) || month);

  const groupMaps = new Map(
    groups.map((group) => [group.key, new Map(group.monthly.map((entry) => [entry.month, entry]))])
  );

  const metricConfig = Array.isArray(getFeedbackTrendMetricConfig?.()) ? getFeedbackTrendMetricConfig() : [];
  const selectedMetricKeys = Array.isArray(getActiveFeedbackTrendMetrics?.())
    ? getActiveFeedbackTrendMetrics()
    : ['overallAverage'];
  const selectedMetrics = selectedMetricKeys
    .map((key) => metricConfig.find((item) => item.key === key))
    .filter(Boolean);
  if (!selectedMetrics.length) {
    setTrendMessage(
      TEXT.feedback?.trend?.noMetricSelected || 'Pasirinkite bent vieną rodiklį trendo atvaizdavimui.'
    );
    return;
  }

  const series = [];
  selectedMetrics.forEach((metric) => {
    groups.forEach((group) => {
      const map = groupMaps.get(group.key);
      const values = scopedMonthKeys.map((month) => {
        const entry = map?.get(month);
        return Number.isFinite(entry?.[metric.key]) ? entry[metric.key] : null;
      });
      if (!values.some((value) => Number.isFinite(value))) {
        return;
      }
      series.push({
        metricKey: metric.key,
        metricLabel: metric.label,
        metricAxis: metric.axis === 'responses' ? 'responses' : 'rating',
        groupKey: group.key,
        groupLabel: group.label,
        values,
      });
    });
  });

  if (!series.length) {
    setTrendMessage(
      TEXT.feedback?.trend?.empty ||
        'Trendo grafikas bus parodytas, kai atsiras bent vienas mėnuo su bendru įvertinimu.'
    );
    return;
  }

  if (compareMode !== 'none' && groups.every((group) => !group.monthly.length)) {
    setTrendMessage(
      TEXT.feedback?.trend?.empty ||
        'Trendo grafikas bus parodytas, kai atsiras bent vienas mėnuo su bendru įvertinimu.'
    );
    return;
  }

  const Chart = dashboardState.chartLib ?? (await loadChartJs());
  if (!Chart) {
    setTrendMessage(
      TEXT.feedback?.trend?.unavailable ||
        'Nepavyko atvaizduoti trendo grafiko. Patikrinkite ryšį ir bandykite dar kartą.'
    );
    return;
  }
  if (!dashboardState.chartLib) {
    dashboardState.chartLib = Chart;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    setTrendMessage(
      TEXT.feedback?.trend?.unavailable ||
        'Nepavyko atvaizduoti trendo grafiko. Patikrinkite ryšį ir bandykite dar kartą.'
    );
    return;
  }

  const palette = getThemePalette();
  const styleTarget = getThemeStyleTarget();
  Chart.defaults.color = palette.textColor;
  Chart.defaults.font.family = getComputedStyle(styleTarget).fontFamily;
  Chart.defaults.borderColor = palette.gridColor;

  const metricColors = [palette.accent, palette.success, '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6'];
  const metricColorMap = new Map();
  selectedMetrics.forEach((metric, index) => {
    metricColorMap.set(metric.key, metricColors[index % metricColors.length]);
  });

  const isCompare = compareMode !== 'none';
  const hasRatingMetrics = series.some((item) => item.metricAxis === 'rating');
  const hasResponsesMetrics = series.some((item) => item.metricAxis === 'responses');
  const responseAxisId = hasResponsesMetrics && hasRatingMetrics ? 'y1' : 'y';

  const datasets = series.map((item) => {
    const baseColor = metricColorMap.get(item.metricKey) || palette.accent;
    const compareStyle = isCompare
      ? item.groupKey === groups[0]?.key
        ? { borderDash: [], opacity: 0.92 }
        : { borderDash: [8, 4], opacity: 0.58 }
      : { borderDash: [], opacity: 0.82 };

    const lineStyleLabel =
      isCompare && item.metricAxis !== 'responses'
        ? item.groupKey === groups[0]?.key
          ? 'pilna'
          : 'punktyrinė'
        : '';
    const datasetLabel = isCompare
      ? `${item.metricLabel} (${item.groupLabel})${lineStyleLabel ? ` • ${lineStyleLabel} linija` : ''}`
      : item.metricLabel;

    if (item.metricAxis === 'responses') {
      const alpha = isCompare ? (item.groupKey === groups[0]?.key ? 0.36 : 0.2) : 0.3;
      return {
        label: datasetLabel,
        type: 'bar',
        data: item.values,
        yAxisID: responseAxisId,
        backgroundColor: `rgba(148, 163, 184, ${alpha})`,
        borderColor: `rgba(148, 163, 184, ${Math.min(0.8, alpha + 0.1)})`,
        borderWidth: 0,
        barPercentage: isCompare ? 0.5 : 0.62,
        categoryPercentage: 0.84,
        order: 1,
      };
    }

    return {
      label: datasetLabel,
      type: 'line',
      data: item.values,
      borderColor: baseColor,
      backgroundColor: baseColor,
      borderDash: compareStyle.borderDash,
      tension: 0.3,
      spanGaps: true,
      fill: false,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: baseColor,
      pointBorderColor: baseColor,
      pointBorderWidth: 1,
      yAxisID: 'y',
      order: 2,
      segment: {
        borderColor: baseColor,
      },
      opacity: compareStyle.opacity,
    };
  });

  const compareModeLabel =
    (Array.isArray(TEXT.feedback?.trend?.compareModes) ? TEXT.feedback.trend.compareModes : []).find(
      (item) => item?.key === compareMode
    )?.label || '';

  const primarySeries = series.find((item) => item.metricAxis === 'rating') || series[0];
  const primaryValues = primarySeries?.values || [];
  const numericPrimary = primaryValues.filter((value) => Number.isFinite(value));
  let bestIndex = null;
  let worstIndex = null;
  primaryValues.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      return;
    }
    if (bestIndex == null || value > primaryValues[bestIndex]) {
      bestIndex = index;
    }
    if (worstIndex == null || value < primaryValues[worstIndex]) {
      worstIndex = index;
    }
  });

  const responseSeries = series.filter((item) => item.metricAxis === 'responses');
  const responseValues = responseSeries.flatMap((item) =>
    item.values.filter((value) => Number.isFinite(value))
  );
  const responsesLabel = TEXT.feedback?.trend?.responsesLabel || 'Atsakymų skaičius';

  const summaryInfo = {
    compareMode,
    compareModeLabel: compareMode !== 'none' ? compareModeLabel : '',
    metric: primarySeries
      ? {
          key: primarySeries.metricKey,
          label: isCompare
            ? `${primarySeries.metricLabel} (${primarySeries.groupLabel})`
            : primarySeries.metricLabel,
          axis: primarySeries.metricAxis,
        }
      : null,
    metrics: series.map((item) => ({
      key: item.metricKey,
      label: isCompare ? `${item.metricLabel} (${item.groupLabel})` : item.metricLabel,
      axis: item.metricAxis,
      hasData: item.values.some((value) => Number.isFinite(value)),
    })),
    average: numericPrimary.length
      ? {
          raw: numericPrimary.reduce((sum, value) => sum + value, 0) / numericPrimary.length,
          formatted:
            primarySeries?.metricAxis === 'responses'
              ? numberFormatter.format(
                  Math.round(numericPrimary.reduce((sum, value) => sum + value, 0) / numericPrimary.length)
                )
              : oneDecimalFormatter.format(
                  numericPrimary.reduce((sum, value) => sum + value, 0) / numericPrimary.length
                ),
        }
      : null,
    best:
      bestIndex != null
        ? {
            raw: primaryValues[bestIndex],
            formatted:
              primarySeries?.metricAxis === 'responses'
                ? numberFormatter.format(Math.round(primaryValues[bestIndex]))
                : oneDecimalFormatter.format(primaryValues[bestIndex]),
            label: labels[bestIndex] || '',
          }
        : null,
    worst:
      worstIndex != null
        ? {
            raw: primaryValues[worstIndex],
            formatted:
              primarySeries?.metricAxis === 'responses'
                ? numberFormatter.format(Math.round(primaryValues[worstIndex]))
                : oneDecimalFormatter.format(primaryValues[worstIndex]),
            label: labels[worstIndex] || '',
          }
        : null,
    responses: responseValues.length
      ? {
          min: Math.min(...responseValues),
          max: Math.max(...responseValues),
          minFormatted: numberFormatter.format(Math.round(Math.min(...responseValues))),
          maxFormatted: numberFormatter.format(Math.round(Math.max(...responseValues))),
          label: responsesLabel,
        }
      : null,
  };

  const summaryBuilder = TEXT.feedback?.trend?.summary;
  const summaryText = typeof summaryBuilder === 'function' ? summaryBuilder(summaryInfo) : '';
  updateSummary(summaryText);
  setTrendMessage('');

  const chartTitle = TEXT.feedback?.trend?.title || 'Bendro vertinimo dinamika';
  const firstLabel = labels[0] || '';
  const lastLabel = labels[labels.length - 1] || '';
  const ariaBuilder = TEXT.feedback?.trend?.aria;
  if (typeof ariaBuilder === 'function') {
    canvas.setAttribute('aria-label', ariaBuilder(chartTitle, firstLabel, lastLabel));
  } else {
    canvas.setAttribute(
      'aria-label',
      `${chartTitle}: ${firstLabel}${lastLabel && firstLabel !== lastLabel ? ` – ${lastLabel}` : ''}`
    );
  }

  const ratingBandsPlugin = {
    id: 'feedbackRatingBands',
    beforeDraw(chart) {
      const { chartArea, scales, ctx: canvasCtx } = chart;
      if (!chartArea || !scales?.y || !hasRatingMetrics) {
        return;
      }
      const yScale = scales.y;
      const bands = [
        { from: 4, to: 5, color: 'rgba(34, 197, 94, 0.12)' },
        { from: 3, to: 4, color: 'rgba(148, 163, 184, 0.12)' },
        { from: 1, to: 3, color: 'rgba(239, 68, 68, 0.1)' },
      ];
      canvasCtx.save();
      bands.forEach((band) => {
        const top = yScale.getPixelForValue(band.to);
        const bottom = yScale.getPixelForValue(band.from);
        canvasCtx.fillStyle = band.color;
        canvasCtx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, bottom - top);
      });
      canvasCtx.restore();
    },
  };

  const chartConfig = {
    type: 'line',
    data: {
      labels,
      datasets,
    },
    plugins: hasRatingMetrics ? [ratingBandsPlugin] : [],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 320,
        easing: 'easeOutCubic',
      },
      interaction: {
        intersect: false,
        mode: 'index',
      },
      layout: {
        padding: { top: 10, bottom: 6 },
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: palette.textColor,
            usePointStyle: true,
            pointStyleWidth: 34,
            generateLabels(chart) {
              const defaults = Chart.defaults.plugins?.legend?.labels;
              const base =
                typeof defaults?.generateLabels === 'function' ? defaults.generateLabels(chart) : [];
              return base.map((item) => {
                const dataset = chart.data?.datasets?.[item.datasetIndex];
                if (!dataset || dataset.type === 'bar') {
                  return item;
                }
                return {
                  ...item,
                  pointStyle: 'line',
                  fillStyle: 'rgba(0,0,0,0)',
                  strokeStyle: dataset.borderColor || item.strokeStyle,
                  lineWidth: Number.isFinite(dataset.borderWidth) ? dataset.borderWidth : 3,
                  lineDash: Array.isArray(dataset.borderDash) ? dataset.borderDash : [],
                };
              });
            },
          },
        },
        tooltip: {
          callbacks: {
            label(context) {
              if (context.dataset.type === 'bar' || context.dataset.yAxisID === responseAxisId) {
                return `${context.dataset.label}: ${numberFormatter.format(Math.round(context.parsed.y))}`;
              }
              return `${context.dataset.label}: ${oneDecimalFormatter.format(context.parsed.y)}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: palette.textColor,
            maxRotation: 0,
            autoSkip: true,
            callback(_value, index) {
              const label = labels[index] || '';
              return label ? label.replace(/\s\d{4}$/, '') : '';
            },
          },
          grid: {
            color: palette.gridColor,
            drawBorder: false,
          },
        },
        y: hasRatingMetrics
          ? {
              min: 1,
              max: 5,
              ticks: {
                color: palette.textColor,
                stepSize: 1,
                callback(value) {
                  return Number(value).toFixed(0);
                },
              },
              grid: {
                color: palette.gridColor,
                drawBorder: false,
              },
            }
          : {
              beginAtZero: true,
              ticks: {
                color: palette.textColor,
                callback(value) {
                  return numberFormatter.format(value);
                },
              },
              grid: {
                color: palette.gridColor,
                drawBorder: false,
              },
            },
        ...(hasResponsesMetrics && hasRatingMetrics
          ? {
              y1: {
                position: 'right',
                beginAtZero: true,
                ticks: {
                  color: palette.textColor,
                  callback(value) {
                    return numberFormatter.format(value);
                  },
                },
                grid: {
                  display: false,
                },
              },
            }
          : {}),
      },
    },
  };

  const existingChart = dashboardState.charts.feedbackTrend;
  if (existingChart && typeof existingChart.destroy === 'function') {
    existingChart.destroy();
  }
  dashboardState.charts.feedbackTrend = new Chart(ctx, chartConfig);
}
