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
    formatMonthLabel,
    numberFormatter,
    oneDecimalFormatter,
  } = env;

  const canvas = selectors.feedbackTrendChart || document.getElementById('feedbackTrendChart');
  const messageElement = selectors.feedbackTrendMessage || document.getElementById('feedbackTrendMessage');
  const summaryElement = selectors.feedbackTrendSummary || document.getElementById('feedbackTrendSummary');

  const updateSummary = (text) => {
    if (!summaryElement) {
      return;
    }
    if (text) {
      summaryElement.textContent = text;
      summaryElement.hidden = false;
    } else {
      summaryElement.textContent = '';
      summaryElement.hidden = true;
    }
  };

  const setTrendMessage = (text) => {
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
      const monthLabel = formatMonthLabel(rawMonth) || rawMonth;

      const rawAverage = entry?.overallAverage;
      let overallAverage = null;
      if (Number.isFinite(rawAverage)) {
        overallAverage = Number(rawAverage);
      } else if (typeof rawAverage === 'string') {
        const parsed = Number.parseFloat(rawAverage.replace(',', '.'));
        overallAverage = Number.isFinite(parsed) ? parsed : null;
      } else if (rawAverage != null) {
        const coerced = Number(rawAverage);
        overallAverage = Number.isFinite(coerced) ? coerced : null;
      }

      if (!Number.isFinite(overallAverage)) {
        return null;
      }

      let responses = null;
      const rawResponses = entry?.responses;
      if (Number.isFinite(rawResponses)) {
        responses = Number(rawResponses);
      } else if (typeof rawResponses === 'string') {
        const parsedResponses = Number.parseFloat(rawResponses.replace(',', '.'));
        responses = Number.isFinite(parsedResponses) ? parsedResponses : null;
      } else if (rawResponses != null) {
        const coercedResponses = Number(rawResponses);
        responses = Number.isFinite(coercedResponses) ? coercedResponses : null;
      }

      return {
        month: rawMonth,
        label: monthLabel,
        overallAverage,
        responses,
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

  const scoped = (() => {
    const activeWindow = getActiveFeedbackTrendWindow();
    if (Number.isFinite(activeWindow) && activeWindow > 0) {
      const subset = normalized.slice(-Math.max(1, Math.round(activeWindow)));
      return subset.length ? subset : normalized.slice();
    }
    return normalized.slice();
  })();

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

  if (dashboardState.charts.feedbackTrend && typeof dashboardState.charts.feedbackTrend.destroy === 'function') {
    dashboardState.charts.feedbackTrend.destroy();
  }

  const palette = getThemePalette();
  const styleTarget = getThemeStyleTarget();
  Chart.defaults.color = palette.textColor;
  Chart.defaults.font.family = getComputedStyle(styleTarget).fontFamily;
  Chart.defaults.borderColor = palette.gridColor;

  const labels = scoped.map((entry) => entry.label);
  const ratingValues = scoped.map((entry) => entry.overallAverage);
  const numericRatings = ratingValues.filter((value) => Number.isFinite(value));
  if (!numericRatings.length) {
    updateSummary('');
    const emptyText = TEXT.feedback?.trend?.empty
      || 'Trendo grafikas bus parodytas, kai atsiras bent vienas mėnuo su bendru įvertinimu.';
    setTrendMessage(emptyText);
    return;
  }

  const responsesValues = scoped.map((entry) => (Number.isFinite(entry.responses) ? entry.responses : null));
  const numericResponses = responsesValues.filter((value) => Number.isFinite(value));
  const hasResponses = numericResponses.length > 0;
  const responsesLabel = TEXT.feedback?.trend?.responsesLabel || 'Atsakymų skaičius';
  const datasetLabel = TEXT.feedback?.table?.headers?.overall || 'Bendra patirtis (vid. 1–5)';
  const referenceLabel = TEXT.feedback?.trend?.averageLabel || 'Vidutinis įvertinimas';
  const chartTitle = TEXT.feedback?.trend?.title || 'Bendro vertinimo dinamika';

  let bestIndex = null;
  let worstIndex = null;
  ratingValues.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      return;
    }
    if (bestIndex == null || value > ratingValues[bestIndex]) {
      bestIndex = index;
    }
    if (worstIndex == null || value < ratingValues[worstIndex]) {
      worstIndex = index;
    }
  });

  const averageValue = numericRatings.reduce((sum, value) => sum + value, 0) / numericRatings.length;
  const responsesMin = hasResponses ? Math.min(...numericResponses) : null;
  const responsesMax = hasResponses ? Math.max(...numericResponses) : null;

  const summaryInfo = {
    average: {
      raw: averageValue,
      formatted: oneDecimalFormatter.format(averageValue),
    },
    best: bestIndex != null
      ? {
          raw: ratingValues[bestIndex],
          formatted: oneDecimalFormatter.format(ratingValues[bestIndex]),
          label: labels[bestIndex] || '',
        }
      : null,
    worst: worstIndex != null
      ? {
          raw: ratingValues[worstIndex],
          formatted: oneDecimalFormatter.format(ratingValues[worstIndex]),
          label: labels[worstIndex] || '',
        }
      : null,
    responses: hasResponses
      ? {
          min: responsesMin,
          max: responsesMax,
          minFormatted: numberFormatter.format(Math.round(responsesMin)),
          maxFormatted: numberFormatter.format(Math.round(responsesMax)),
          label: responsesLabel,
        }
      : null,
  };

  const summaryBuilder = TEXT.feedback?.trend?.summary;
  const summaryText = typeof summaryBuilder === 'function'
    ? summaryBuilder(summaryInfo)
    : (() => {
        const parts = [`Vidurkis ${summaryInfo.average.formatted}`];
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
      const { chartArea, scales, ctx } = chart;
      if (!chartArea || !scales?.y) {
        return;
      }
      const yScale = scales.y;
      const bands = [
        { from: 4, to: 5, color: 'rgba(34, 197, 94, 0.12)' },
        { from: 3, to: 4, color: 'rgba(148, 163, 184, 0.12)' },
        { from: 1, to: 3, color: 'rgba(239, 68, 68, 0.1)' },
      ];
      ctx.save();
      bands.forEach((band) => {
        const top = yScale.getPixelForValue(band.to);
        const bottom = yScale.getPixelForValue(band.from);
        ctx.fillStyle = band.color;
        ctx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, bottom - top);
      });
      ctx.restore();
    },
  };

  const pointColors = ratingValues.map((_, index) => {
    if (bestIndex === index) {
      return palette.success;
    }
    if (worstIndex === index) {
      return palette.danger;
    }
    return palette.accent;
  });

  const ratingDataset = {
    label: datasetLabel,
    data: ratingValues,
    borderColor: palette.accent,
    backgroundColor: palette.accent,
    tension: 0.35,
    fill: false,
    pointRadius: 5,
    pointHoverRadius: 7,
    pointBackgroundColor: pointColors,
    pointBorderColor: pointColors,
    pointBorderWidth: 1,
    pointStyle: 'circle',
    order: 2,
  };

  const responseDataset = hasResponses ? {
    label: responsesLabel,
    type: 'bar',
    data: responsesValues,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    backgroundColor: 'rgba(148, 163, 184, 0.35)',
    borderWidth: 0,
    barPercentage: 0.6,
    categoryPercentage: 0.8,
    yAxisID: 'y1',
    order: 1,
  } : null;

  dashboardState.charts.feedbackTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: responseDataset ? [ratingDataset, responseDataset] : [ratingDataset],
    },
    plugins: [ratingBandsPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { top: 10, bottom: 6 },
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: palette.textColor,
          },
        },
        tooltip: {
          callbacks: {
            label(context) {
              if (context.dataset.yAxisID === 'y1') {
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
              if (!label) {
                return '';
              }
              return label.replace(/\\s\\d{4}$/, '');
            },
          },
          grid: {
            color: palette.gridColor,
            drawBorder: false,
          },
        },
        y: {
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
        },
        ...(hasResponses ? {
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
        } : {}),
      },
    },
  });
}
