export async function renderFeedbackTrendChart(env, monthlyStats) {
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
    getFeedbackTrendMetricConfig,
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

  const updateSummary = (text) => {
    if (!summaryElement) {
      return;
    }
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

  syncFeedbackTrendControls();
  updateFeedbackTrendSubtitle();

  if (!canvas || typeof canvas.getContext !== 'function') {
    const fallbackText = TEXT.feedback?.trend?.unavailable
      || 'Nepavyko atvaizduoti trendo grafiko. Patikrinkite ryšį ir bandykite dar kartą.';
    setTrendMessage(fallbackText);
    return;
  }

  const monthlyArray = Array.isArray(monthlyStats)
    ? monthlyStats.filter((entry) => entry && typeof entry === 'object')
    : [];
  const normalized = monthlyArray
    .map((entry) => {
      const rawMonth = typeof entry.month === 'string' ? entry.month.trim() : '';
      if (!rawMonth) {
        return null;
      }
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

  if (!normalized.length) {
    if (dashboardState.charts.feedbackTrend && typeof dashboardState.charts.feedbackTrend.destroy === 'function') {
      dashboardState.charts.feedbackTrend.destroy();
    }
    dashboardState.charts.feedbackTrend = null;
    const emptyText = TEXT.feedback?.trend?.empty
      || 'Trendo grafikas bus parodytas, kai atsiras bent vienas mėnuo su bendru įvertinimu.';
    setTrendMessage(emptyText);
    return;
  }

  const metricConfig = Array.isArray(getFeedbackTrendMetricConfig?.())
    ? getFeedbackTrendMetricConfig()
    : [];
  const configByKey = new Map(metricConfig.map((item) => [item.key, item]));
  const selectedMetricKeys = Array.isArray(getActiveFeedbackTrendMetrics?.())
    ? getActiveFeedbackTrendMetrics()
    : ['overallAverage'];
  const selectedMetrics = selectedMetricKeys
    .map((key) => configByKey.get(key))
    .filter(Boolean);

  if (!selectedMetrics.length) {
    const noMetricSelectedText = TEXT.feedback?.trend?.noMetricSelected
      || 'Pasirinkite bent vieną rodiklį trendo atvaizdavimui.';
    setTrendMessage(noMetricSelectedText);
    return;
  }

  const scoped = (() => {
    const activeWindow = getActiveFeedbackTrendWindow();
    if (Number.isFinite(activeWindow) && activeWindow > 0) {
      const subset = normalized.slice(-Math.max(1, Math.round(activeWindow)));
      return subset.length ? subset : normalized.slice();
    }
    return normalized.slice();
  })();

  const metricData = selectedMetrics.map((metric) => ({
    ...metric,
    values: scoped.map((entry) => (Number.isFinite(entry[metric.key]) ? entry[metric.key] : null)),
  }));
  const hasAnyData = metricData.some((metric) => metric.values.some((value) => Number.isFinite(value)));
  if (!hasAnyData) {
    const emptyText = TEXT.feedback?.trend?.empty
      || 'Trendo grafikas bus parodytas, kai atsiras bent vienas mėnuo su bendru įvertinimu.';
    setTrendMessage(emptyText);
    return;
  }

  const Chart = dashboardState.chartLib ?? await loadChartJs();
  if (!Chart) {
    const unavailableText = TEXT.feedback?.trend?.unavailable
      || 'Nepavyko atvaizduoti trendo grafiko. Patikrinkite ryšį ir bandykite dar kartą.';
    if (dashboardState.charts.feedbackTrend && typeof dashboardState.charts.feedbackTrend.destroy === 'function') {
      dashboardState.charts.feedbackTrend.destroy();
    }
    dashboardState.charts.feedbackTrend = null;
    setTrendMessage(unavailableText);
    return;
  }
  if (!dashboardState.chartLib) {
    dashboardState.chartLib = Chart;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const unavailableText = TEXT.feedback?.trend?.unavailable
      || 'Nepavyko atvaizduoti trendo grafiko. Patikrinkite ryšį ir bandykite dar kartą.';
    if (dashboardState.charts.feedbackTrend && typeof dashboardState.charts.feedbackTrend.destroy === 'function') {
      dashboardState.charts.feedbackTrend.destroy();
    }
    dashboardState.charts.feedbackTrend = null;
    setTrendMessage(unavailableText);
    return;
  }

  const labels = scoped.map((entry) => entry.label);
  const hasRatingMetrics = metricData.some((metric) => metric.axis !== 'responses');
  const hasResponsesMetrics = metricData.some((metric) => metric.axis === 'responses');
  const responseAxisId = hasResponsesMetrics && hasRatingMetrics ? 'y1' : 'y';

  const palette = getThemePalette();
  const styleTarget = getThemeStyleTarget();
  Chart.defaults.color = palette.textColor;
  Chart.defaults.font.family = getComputedStyle(styleTarget).fontFamily;
  Chart.defaults.borderColor = palette.gridColor;

  const metricColors = [
    palette.accent,
    palette.success,
    '#0ea5e9',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
  ];

  const datasets = metricData
    .filter((metric) => metric.values.some((value) => Number.isFinite(value)))
    .map((metric, index) => {
      const color = metricColors[index % metricColors.length];
      if (metric.axis === 'responses') {
        return {
          label: metric.label,
          type: 'bar',
          data: metric.values,
          yAxisID: responseAxisId,
          backgroundColor: 'rgba(148, 163, 184, 0.35)',
          borderColor: 'rgba(148, 163, 184, 0.35)',
          borderWidth: 0,
          barPercentage: 0.6,
          categoryPercentage: 0.8,
          order: 1,
        };
      }
      return {
        label: metric.label,
        type: 'line',
        data: metric.values,
        borderColor: color,
        backgroundColor: color,
        tension: 0.3,
        spanGaps: true,
        fill: false,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: color,
        pointBorderColor: color,
        pointBorderWidth: 1,
        yAxisID: 'y',
        order: 2,
      };
    });

  if (!datasets.length) {
    const emptyText = TEXT.feedback?.trend?.empty
      || 'Trendo grafikas bus parodytas, kai atsiras bent vienas mėnuo su bendru įvertinimu.';
    setTrendMessage(emptyText);
    return;
  }

  const responseMetricData = metricData.find((metric) => metric.axis === 'responses');
  const numericResponses = responseMetricData
    ? responseMetricData.values.filter((value) => Number.isFinite(value))
    : [];
  const hasResponseRange = numericResponses.length > 0;
  const responsesLabel = TEXT.feedback?.trend?.responsesLabel || 'Atsakymų skaičius';

  const primaryMetric = metricData.find((metric) => metric.axis !== 'responses' && metric.values.some((value) => Number.isFinite(value)))
    || metricData.find((metric) => metric.values.some((value) => Number.isFinite(value)))
    || null;
  const primaryValues = primaryMetric ? primaryMetric.values : [];
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

  const summaryInfo = {
    metric: primaryMetric
      ? {
          key: primaryMetric.key,
          label: primaryMetric.label,
          axis: primaryMetric.axis,
        }
      : null,
    metrics: metricData.map((item) => ({
      key: item.key,
      label: item.label,
      axis: item.axis,
      hasData: item.values.some((value) => Number.isFinite(value)),
    })),
    average: numericPrimary.length
      ? {
          raw: numericPrimary.reduce((sum, value) => sum + value, 0) / numericPrimary.length,
          formatted: primaryMetric?.axis === 'responses'
            ? numberFormatter.format(Math.round(numericPrimary.reduce((sum, value) => sum + value, 0) / numericPrimary.length))
            : oneDecimalFormatter.format(numericPrimary.reduce((sum, value) => sum + value, 0) / numericPrimary.length),
        }
      : null,
    best: bestIndex != null
      ? {
          raw: primaryValues[bestIndex],
          formatted: primaryMetric?.axis === 'responses'
            ? numberFormatter.format(Math.round(primaryValues[bestIndex]))
            : oneDecimalFormatter.format(primaryValues[bestIndex]),
          label: labels[bestIndex] || '',
        }
      : null,
    worst: worstIndex != null
      ? {
          raw: primaryValues[worstIndex],
          formatted: primaryMetric?.axis === 'responses'
            ? numberFormatter.format(Math.round(primaryValues[worstIndex]))
            : oneDecimalFormatter.format(primaryValues[worstIndex]),
          label: labels[worstIndex] || '',
        }
      : null,
    responses: hasResponseRange
      ? {
          min: Math.min(...numericResponses),
          max: Math.max(...numericResponses),
          minFormatted: numberFormatter.format(Math.round(Math.min(...numericResponses))),
          maxFormatted: numberFormatter.format(Math.round(Math.max(...numericResponses))),
          label: responsesLabel,
        }
      : null,
  };

  const summaryBuilder = TEXT.feedback?.trend?.summary;
  const summaryText = typeof summaryBuilder === 'function'
    ? summaryBuilder(summaryInfo)
    : (() => {
        const parts = [];
        if (summaryInfo.metrics?.length) {
          parts.push(`Rodikliai: ${summaryInfo.metrics.map((item) => item.label).join(', ')}`);
        }
        if (summaryInfo.metric?.label && summaryInfo.average?.formatted) {
          parts.push(`${summaryInfo.metric.label} vidurkis ${summaryInfo.average.formatted}`);
        }
        if (summaryInfo.best?.label && summaryInfo.best?.formatted) {
          parts.push(`Geriausias ${summaryInfo.best.label} (${summaryInfo.best.formatted})`);
        }
        if (summaryInfo.worst?.label && summaryInfo.worst?.formatted) {
          parts.push(`Silpniausias ${summaryInfo.worst.label} (${summaryInfo.worst.formatted})`);
        }
        if (summaryInfo.responses?.minFormatted && summaryInfo.responses?.maxFormatted) {
          if (summaryInfo.responses.minFormatted === summaryInfo.responses.maxFormatted) {
            parts.push(`${responsesLabel}: ${summaryInfo.responses.minFormatted}`);
          } else {
            parts.push(`${responsesLabel}: ${summaryInfo.responses.minFormatted}–${summaryInfo.responses.maxFormatted}`);
          }
        }
        return parts.join(' • ');
      })();

  updateSummary(summaryText);
  setTrendMessage('');

  const chartTitle = TEXT.feedback?.trend?.title || 'Bendro vertinimo dinamika';
  const ariaBuilder = TEXT.feedback?.trend?.aria;
  const firstLabel = labels[0] || '';
  const lastLabel = labels[labels.length - 1] || '';
  if (typeof ariaBuilder === 'function') {
    canvas.setAttribute('aria-label', ariaBuilder(chartTitle, firstLabel, lastLabel));
  } else {
    canvas.setAttribute('aria-label', `${chartTitle}: ${firstLabel}${lastLabel && firstLabel !== lastLabel ? ` – ${lastLabel}` : ''}`);
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
    data: { labels, datasets },
    plugins: hasRatingMetrics ? [ratingBandsPlugin] : [],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 320,
        easing: 'easeOutCubic',
      },
      layout: {
        padding: { top: 10, bottom: 6 },
      },
      interaction: {
        intersect: false,
        mode: 'index',
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: palette.textColor,
            usePointStyle: true,
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
            callback(value, index) {
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
