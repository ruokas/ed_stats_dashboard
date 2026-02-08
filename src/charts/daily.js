export function renderDailyChart(env, dailyStats, period, ChartLib, palette) {
  const {
    dashboardState,
    selectors,
    TEXT,
    getThemePalette,
    getThemeStyleTarget,
    numberFormatter,
    monthOnlyFormatter,
    monthDayFormatter,
    shortDateFormatter,
    dateKeyToDate,
    isWeekendDateKey,
    computeMonthlyStats,
    formatMonthLabel,
    formatDailyCaption,
    syncChartPeriodButtons,
  } = env;

  const Chart = ChartLib;
  const themePalette = palette || getThemePalette();
  const normalizedPeriod = Number.isFinite(Number(period))
    ? Math.max(0, Number(period))
    : 30;
  dashboardState.chartPeriod = normalizedPeriod;
  syncChartPeriodButtons(normalizedPeriod);
  const compareGmp = dashboardState.chartFilters?.compareGmp === true;
  const isMonthlyTrend = normalizedPeriod === 365 || normalizedPeriod === 0;
  if (selectors.dailyCaption) {
    selectors.dailyCaption.textContent = formatDailyCaption(normalizedPeriod);
  }
  const scopedData = Array.isArray(dailyStats)
    ? (normalizedPeriod === 0 ? dailyStats.slice() : dailyStats.slice(-normalizedPeriod))
    : [];
  if (selectors.dailyCaptionContext) {
    const lastEntry = scopedData.length ? scopedData[scopedData.length - 1] : null;
    const dateValue = lastEntry?.date ? dateKeyToDate(lastEntry.date) : null;
    const formatted = dateValue ? shortDateFormatter.format(dateValue) : lastEntry?.date || '';
    const dayCount = scopedData.length;
    const dayNote = dayCount ? `n=${numberFormatter.format(dayCount)} d.` : '';
    const contextText = TEXT.charts.dailyContext(formatted);
    selectors.dailyCaptionContext.textContent = [contextText, dayNote].filter(Boolean).join(' • ');
  }

  const canvas = document.getElementById('dailyChart');
  if (!canvas || !canvas.getContext) {
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  if (!Chart) {
    return;
  }

  const styleTarget = getThemeStyleTarget();
  Chart.defaults.color = themePalette.textColor;
  Chart.defaults.font.family = getComputedStyle(styleTarget).fontFamily;
  Chart.defaults.borderColor = themePalette.gridColor;

  if (!scopedData.length) {
    if (dashboardState.charts.daily && typeof dashboardState.charts.daily.destroy === 'function') {
      dashboardState.charts.daily.destroy();
    }
    dashboardState.charts.daily = null;
    return;
  }

  const weekendFlags = scopedData.map((entry) => isWeekendDateKey(entry.date));
  const tickEvery = Math.max(1, Math.ceil(scopedData.length / 8));

  let labels = scopedData.map((entry) => entry.date);
  let gmpCounts = scopedData.map((entry) => Number.isFinite(entry?.ems) ? entry.ems : 0);
  let totalCounts = scopedData.map((entry) => Number.isFinite(entry?.count) ? entry.count : 0);
  let nightCounts = scopedData.map((entry) => Number.isFinite(entry?.night) ? entry.night : 0);
  let selfCounts = totalCounts.map((value, index) => Math.max(0, value - gmpCounts[index]));
  let chartType = 'bar';
  let useWeekendColors = true;

  if (isMonthlyTrend) {
    const monthlyStats = computeMonthlyStats(scopedData);
    const monthlyWindow = monthlyStats.length > 12 ? monthlyStats.slice(-12) : monthlyStats;
    labels = monthlyWindow.map((entry) => {
      const date = typeof entry?.month === 'string' ? new Date(Date.UTC(
        Number.parseInt(entry.month.slice(0, 4), 10),
        Number.parseInt(entry.month.slice(5, 7), 10) - 1,
        1,
      )) : null;
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return formatMonthLabel(entry.month);
      }
      return monthOnlyFormatter.format(date);
    });
    totalCounts = monthlyWindow.map((entry) => Number.isFinite(entry?.count) ? entry.count : 0);
    nightCounts = monthlyWindow.map((entry) => Number.isFinite(entry?.night) ? entry.night : 0);
    gmpCounts = monthlyWindow.map((entry) => Number.isFinite(entry?.ems) ? entry.ems : 0);
    selfCounts = totalCounts.map((value, index) => Math.max(0, value - gmpCounts[index]));
    chartType = 'line';
    useWeekendColors = false;
  }

  const weekendColors = useWeekendColors
    ? weekendFlags.map((isWeekend) => (isWeekend ? themePalette.weekendAccent : themePalette.accent))
    : null;
  const chartConfig = {
    type: chartType,
    data: {
      labels,
      datasets: [
        ...(compareGmp ? [
          {
            label: TEXT.charts?.hourlyDatasetEmsLabel || 'Tik GMP',
            data: gmpCounts,
            backgroundColor: useWeekendColors ? weekendFlags.map(() => themePalette.dangerSoft) : themePalette.dangerSoft,
            borderColor: themePalette.danger,
            borderRadius: chartType === 'bar' ? 10 : 0,
            borderWidth: chartType === 'bar' ? 1 : 2,
            stack: chartType === 'bar' ? 'daily' : undefined,
            tension: chartType === 'line' ? 0.25 : 0,
            fill: chartType === 'line' ? false : true,
            pointRadius: chartType === 'line' ? 2 : 0,
            pointHoverRadius: chartType === 'line' ? 4 : 0,
          },
          {
            label: TEXT.charts?.hourlyDatasetSelfLabel || 'Be GMP',
            data: selfCounts,
            backgroundColor: useWeekendColors ? weekendFlags.map(() => themePalette.success) : themePalette.success,
            borderColor: themePalette.success,
            borderRadius: chartType === 'bar' ? 10 : 0,
            borderWidth: chartType === 'bar' ? 1 : 2,
            stack: chartType === 'bar' ? 'daily' : undefined,
            tension: chartType === 'line' ? 0.25 : 0,
            fill: chartType === 'line' ? false : true,
            pointRadius: chartType === 'line' ? 2 : 0,
            pointHoverRadius: chartType === 'line' ? 4 : 0,
          },
          {
            type: 'line',
            label: TEXT.charts?.hourlyDatasetTotalLabel || 'Iš viso',
            data: totalCounts,
            borderColor: themePalette.textColor,
            backgroundColor: themePalette.textColor,
            borderWidth: 3,
            pointRadius: 2,
            pointHoverRadius: 4,
            tension: 0.25,
            fill: false,
            order: 0,
          },
        ] : [
          {
            label: 'Pacientai',
            data: totalCounts,
            backgroundColor: chartType === 'bar' ? weekendColors : themePalette.accent,
            borderColor: chartType === 'line' ? themePalette.accent : undefined,
            borderRadius: chartType === 'bar' ? 12 : 0,
            borderWidth: chartType === 'line' ? 2 : 0,
            tension: chartType === 'line' ? 0.25 : 0,
            fill: chartType === 'line' ? false : true,
            pointRadius: chartType === 'line' ? 2 : 0,
            pointHoverRadius: chartType === 'line' ? 4 : 0,
          },
          {
            label: 'Naktiniai pacientai',
            data: nightCounts,
            backgroundColor: chartType === 'bar'
              ? weekendFlags.map((isWeekend) => (isWeekend ? themePalette.weekendAccentSoft : themePalette.accentSoft))
              : themePalette.accentSoft,
            borderColor: chartType === 'line' ? themePalette.accentSoft : undefined,
            borderRadius: chartType === 'bar' ? 12 : 0,
            borderWidth: chartType === 'line' ? 2 : 0,
            tension: chartType === 'line' ? 0.25 : 0,
            fill: chartType === 'line' ? false : true,
            pointRadius: chartType === 'line' ? 2 : 0,
            pointHoverRadius: chartType === 'line' ? 4 : 0,
          },
        ]),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: themePalette.textColor,
          },
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${numberFormatter.format(context.parsed.y)}`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: compareGmp && chartType === 'bar',
          ticks: {
            autoSkip: isMonthlyTrend,
            maxRotation: 0,
            minRotation: 0,
            maxTicksLimit: isMonthlyTrend ? 12 : undefined,
            padding: 10,
            color: (ctxTick) => (useWeekendColors && weekendFlags[ctxTick.index] ? themePalette.weekendAccent : themePalette.textColor),
            callback(value, index) {
              if (!isMonthlyTrend && index % tickEvery !== 0) {
                return '';
              }
              const rawLabel = this.getLabelForValue(value);
              if (!rawLabel) {
                return '';
              }
              if (isMonthlyTrend) {
                return rawLabel;
              }
              const dateObj = dateKeyToDate(rawLabel);
              if (dateObj instanceof Date && !Number.isNaN(dateObj.getTime())) {
                return monthDayFormatter.format(dateObj);
              }
              return rawLabel.slice(5);
            },
          },
          grid: {
            color: themePalette.gridColor,
            drawBorder: false,
          },
        },
        y: {
          beginAtZero: true,
          stacked: compareGmp && chartType === 'bar',
          ticks: {
            padding: 6,
            color: themePalette.textColor,
            callback(value) {
              return numberFormatter.format(value);
            },
          },
          grid: {
            color: themePalette.gridColor,
            drawBorder: false,
          },
        },
      },
    },
  };

  const existingChart = dashboardState.charts.daily;
  const canReuse = existingChart
    && existingChart.canvas === canvas
    && existingChart.config?.type === chartType;
  if (canReuse) {
    existingChart.data.labels = chartConfig.data.labels;
    existingChart.data.datasets = chartConfig.data.datasets;
    existingChart.options = chartConfig.options;
    existingChart.update('none');
    return;
  }
  if (existingChart && typeof existingChart.destroy === 'function') {
    existingChart.destroy();
  }
  dashboardState.charts.daily = new Chart(ctx, chartConfig);
}
