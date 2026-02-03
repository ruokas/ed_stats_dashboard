export function createChartRenderers(env) {
  const {
    dashboardState,
    selectors,
    TEXT,
    loadChartJs,
    getThemePalette,
    getThemeStyleTarget,
    showChartSkeletons,
    hideChartSkeletons,
    clearChartError,
    showChartError,
    setChartCardMessage,
    renderFunnelShape,
    renderArrivalHeatmap,
    filterDailyStatsByYear,
    computeFunnelStats,
    isValidHeatmapData,
    filterRecordsByYear,
    filterRecordsByChartFilters,
    filterRecordsByWindow,
    computeArrivalHeatmap,
    getWeekdayIndexFromDateKey,
    numberFormatter,
    decimalFormatter,
    oneDecimalFormatter,
    percentFormatter,
    monthOnlyFormatter,
    monthDayFormatter,
    shortDateFormatter,
    dateKeyToDate,
    isWeekendDateKey,
    computeMonthlyStats,
    formatMonthLabel,
    formatDailyCaption,
    syncChartPeriodButtons,
    HEATMAP_METRIC_KEYS,
    DEFAULT_HEATMAP_METRIC,
    HEATMAP_HOURS,
    HOURLY_STAY_BUCKET_ALL,
    HOURLY_COMPARE_SERIES,
    HOURLY_COMPARE_SERIES_ALL,
    normalizeHourlyWeekday,
    normalizeHourlyStayBucket,
    normalizeHourlyMetric,
    normalizeHourlyDepartment,
    normalizeHourlyCompareYears,
    updateHourlyCaption,
    updateHourlyDepartmentOptions,
    syncHourlyDepartmentVisibility,
    getHourlyChartRecords,
    computeHourlySeries,
    applyHourlyYAxisAuto,
    syncFeedbackTrendControls,
    updateFeedbackTrendSubtitle,
    getActiveFeedbackTrendWindow,
    formatMonthLabelForAxis,
  } = env;

  function renderDailyChart(dailyStats, period, ChartLib, palette) {
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

    if (dashboardState.charts.daily) {
      dashboardState.charts.daily.destroy();
    }

    if (!scopedData.length) {
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
    dashboardState.charts.daily = new Chart(ctx, {
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
    });
  }

  function renderHourlyChart(records, ChartLib, palette) {
    const Chart = ChartLib;
    const themePalette = palette || getThemePalette();
    const canvas = document.getElementById('hourlyChart');
    if (!canvas || !canvas.getContext) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx || !Chart) {
      return;
    }

    const weekdayValue = normalizeHourlyWeekday(dashboardState.hourlyWeekday);
    const stayBucket = normalizeHourlyStayBucket(dashboardState.hourlyStayBucket);
    const metricValue = normalizeHourlyMetric(dashboardState.hourlyMetric);
    const departmentValue = normalizeHourlyDepartment(dashboardState.hourlyDepartment);
    updateHourlyCaption(weekdayValue, stayBucket, metricValue, departmentValue);

    if (dashboardState.charts.hourly) {
      if (dashboardState.charts.hourly._yAxisWheelHandler && canvas) {
        canvas.removeEventListener('wheel', dashboardState.charts.hourly._yAxisWheelHandler);
      }
      dashboardState.charts.hourly.destroy();
    }

    const compareEnabled = dashboardState.hourlyCompareEnabled === true;
    const compareYears = normalizeHourlyCompareYears(
      dashboardState.hourlyCompareYears?.[0],
      dashboardState.hourlyCompareYears?.[1],
    );
    const baseRecords = Array.isArray(dashboardState.chartData.baseRecords)
      && dashboardState.chartData.baseRecords.length
      ? dashboardState.chartData.baseRecords
      : dashboardState.rawRecords;
    const optionRecords = compareEnabled
      ? getHourlyChartRecords(baseRecords, null, dashboardState.chartFilters || {}, dashboardState.chartPeriod)
      : records;

    updateHourlyDepartmentOptions(optionRecords);
    const normalizedDepartment = normalizeHourlyDepartment(dashboardState.hourlyDepartment);
    if (normalizedDepartment !== departmentValue) {
      dashboardState.hourlyDepartment = normalizedDepartment;
    }
    syncHourlyDepartmentVisibility(metricValue);
    updateHourlyCaption(weekdayValue, stayBucket, metricValue, dashboardState.hourlyDepartment);

    let datasets = [];
    let suggestedMax = undefined;
    let hasData = false;

    if (compareEnabled && compareYears.length) {
      const colorPalette = [themePalette.accent, themePalette.weekendAccent, themePalette.success];
      const compareMaxes = [];
      const seriesKey = HOURLY_COMPARE_SERIES.includes(dashboardState.hourlyCompareSeries)
        ? dashboardState.hourlyCompareSeries
        : HOURLY_COMPARE_SERIES_ALL;
      datasets = compareYears.map((year, index) => {
        const yearRecords = getHourlyChartRecords(baseRecords, year, dashboardState.chartFilters || {}, dashboardState.chartPeriod);
        const yearResult = computeHourlySeries(
          yearRecords,
          weekdayValue,
          stayBucket,
          metricValue,
          dashboardState.hourlyDepartment,
        );
        if (yearResult?.hasData) {
          hasData = true;
          const localMax = Math.max(0, ...(yearResult.averages?.[seriesKey] || []));
          compareMaxes.push(localMax);
        }
        const lineColor = colorPalette[index % colorPalette.length] || themePalette.accent;
        return {
          label: `${year} m.`,
          data: yearResult?.averages?.[seriesKey] || [],
          borderColor: lineColor,
          backgroundColor: lineColor,
          tension: 0.35,
          fill: false,
          pointRadius: 2,
          pointHoverRadius: 4,
          pointBackgroundColor: lineColor,
          pointBorderColor: lineColor,
        };
      });
      const maxValue = compareMaxes.length ? Math.max(...compareMaxes) : 0;
      suggestedMax = maxValue > 0 ? Math.ceil(maxValue * 1.1 * 10) / 10 : undefined;
    } else {
      const result = computeHourlySeries(records, weekdayValue, stayBucket, metricValue, dashboardState.hourlyDepartment);
      if (result?.hasData) {
        hasData = true;
      }
      const baseSeries = computeHourlySeries(records, weekdayValue, HOURLY_STAY_BUCKET_ALL, metricValue, 'all');
      const baseMax = baseSeries?.averages?.all
        ? Math.max(0, ...baseSeries.averages.all)
        : 0;
      suggestedMax = baseMax > 0
        ? Math.ceil(baseMax * 1.1 * 10) / 10
        : undefined;

      datasets = [
        {
          label: TEXT.charts?.hourlyDatasetTotalLabel || 'Iš viso',
          data: result.averages.all,
          borderColor: themePalette.accent,
          backgroundColor: themePalette.accentSoft,
          tension: 0.35,
          fill: false,
          pointRadius: 2,
          pointHoverRadius: 4,
          pointBackgroundColor: themePalette.accent,
          pointBorderColor: themePalette.accent,
        },
        {
          label: TEXT.charts?.hourlyDatasetEmsLabel || 'Tik GMP',
          data: result.averages.ems,
          borderColor: themePalette.danger,
          backgroundColor: themePalette.danger,
          tension: 0.35,
          fill: false,
          pointRadius: 2,
          pointHoverRadius: 4,
          pointBackgroundColor: themePalette.danger,
          pointBorderColor: themePalette.danger,
        },
        {
          label: TEXT.charts?.hourlyDatasetSelfLabel || 'Be GMP',
          data: result.averages.self,
          borderColor: themePalette.success,
          backgroundColor: themePalette.success,
          tension: 0.35,
          fill: false,
          pointRadius: 2,
          pointHoverRadius: 4,
          pointBackgroundColor: themePalette.success,
          pointBorderColor: themePalette.success,
        },
      ];
    }

    if (!hasData) {
      setChartCardMessage(canvas, TEXT.charts?.empty);
      dashboardState.charts.hourly = null;
      return;
    }
    setChartCardMessage(canvas, null);

    dashboardState.hourlyYAxisSuggestedMax = suggestedMax ?? null;

    const labels = HEATMAP_HOURS;
    dashboardState.charts.hourly = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            top: 8,
            bottom: 14,
          },
        },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              color: themePalette.textColor,
              usePointStyle: true,
              padding: 18,
            },
            padding: 10,
            onClick(event, legendItem, legend) {
              const chart = legend.chart;
              const index = legendItem.datasetIndex;
              const meta = chart.getDatasetMeta(index);
              meta.hidden = meta.hidden === null ? !chart.data.datasets[index].hidden : null;
              chart.update();
            },
          },
          tooltip: {
            callbacks: {
              label(context) {
                return `${context.dataset.label}: ${decimalFormatter.format(context.parsed.y)}`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: themePalette.textColor,
              autoSkip: false,
              maxRotation: 90,
              minRotation: 90,
              padding: 10,
              font: {
                size: 10,
              },
            },
            grid: {
              color: themePalette.gridColor,
              drawBorder: false,
            },
          },
          y: {
            beginAtZero: true,
            suggestedMax,
            ticks: {
              color: themePalette.textColor,
              padding: 8,
              callback(value) {
                return decimalFormatter.format(value);
              },
            },
            grid: {
              color: themePalette.gridColor,
              drawBorder: false,
            },
          },
        },
      },
    });
    applyHourlyYAxisAuto(dashboardState.charts.hourly);
  }

  async function renderHourlyChartWithTheme(records) {
    const Chart = dashboardState.chartLib ?? await loadChartJs();
    if (!Chart) {
      throw new Error('Chart.js biblioteka nepasiekiama');
    }
    const palette = getThemePalette();
    const styleTarget = getThemeStyleTarget();
    Chart.defaults.color = palette.textColor;
    Chart.defaults.font.family = getComputedStyle(styleTarget).fontFamily;
    Chart.defaults.borderColor = palette.gridColor;
    if (!dashboardState.chartLib) {
      dashboardState.chartLib = Chart;
    }
    renderHourlyChart(records, Chart, palette);
  }

  async function renderLastShiftHourlyChartWithTheme(seriesInfo) {
    const canvas = selectors.lastShiftHourlyChart || document.getElementById('lastShiftHourlyChart');
    if (!canvas || !canvas.getContext) {
      return;
    }
    const Chart = dashboardState.chartLib ?? await loadChartJs();
    if (!Chart) {
      throw new Error('Chart.js biblioteka nepasiekiama');
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const palette = getThemePalette();
    const styleTarget = getThemeStyleTarget();
    Chart.defaults.color = palette.textColor;
    Chart.defaults.font.family = getComputedStyle(styleTarget).fontFamily;
    Chart.defaults.borderColor = palette.gridColor;
    dashboardState.chartLib = Chart;

    if (dashboardState.charts.lastShiftHourly) {
      dashboardState.charts.lastShiftHourly.destroy();
    }

    if (!seriesInfo?.hasData) {
      setChartCardMessage(canvas, TEXT.charts?.empty);
      if (selectors.lastShiftHourlyContext) {
        selectors.lastShiftHourlyContext.textContent = '';
      }
      dashboardState.charts.lastShiftHourly = null;
      return;
    }

    setChartCardMessage(canvas, null);
    if (selectors.lastShiftHourlyContext) {
      const shiftStart = Number.isFinite(seriesInfo?.shiftStartHour)
        ? `${String(Math.floor(seriesInfo.shiftStartHour)).padStart(2, '0')}:00`
        : '';
      const shiftWindowText = shiftStart ? `Pamainos langas: ${shiftStart}–${shiftStart}` : '';
      const contextParts = [];
      if (seriesInfo?.dateLabel) {
        contextParts.push(`Pamaina: ${seriesInfo.dateLabel}`);
      }
      if (shiftWindowText) {
        contextParts.push(shiftWindowText);
      }
      contextParts.push('Legenda: spustelėkite, kad paslėptumėte/rodytumėte kreives.');
      selectors.lastShiftHourlyContext.textContent = contextParts.join(' • ');
    }

    if (selectors.lastShiftHourlyLegend) {
      selectors.lastShiftHourlyLegend.replaceChildren();
    }

    const toPeakIndex = (values = []) => {
      let max = -Infinity;
      let index = -1;
      values.forEach((value, idx) => {
        if (Number.isFinite(value) && value > max) {
          max = value;
          index = idx;
        }
      });
      return index;
    };

    const peakIndices = {
      total: toPeakIndex(seriesInfo.series?.total),
      t: toPeakIndex(seriesInfo.series?.t),
      tr: toPeakIndex(seriesInfo.series?.tr),
      ch: toPeakIndex(seriesInfo.series?.ch),
    };

    const datasets = [
      {
        label: TEXT.charts?.hourlyDatasetTotalLabel || 'Iš viso',
        data: seriesInfo.series?.total || [],
        borderColor: palette.textColor,
        backgroundColor: palette.textColor,
        tension: 0.35,
        fill: false,
        pointRadius(context) {
          return context.dataIndex === peakIndices.total ? 5 : 2;
        },
        pointHoverRadius: 4,
        pointBackgroundColor: palette.textColor,
        pointBorderColor: palette.textColor,
      },
      {
        label: 'T',
        data: seriesInfo.series?.t || [],
        borderColor: '#f2c94c',
        backgroundColor: '#f2c94c',
        tension: 0.35,
        fill: false,
        pointRadius(context) {
          return context.dataIndex === peakIndices.t ? 5 : 2;
        },
        pointHoverRadius: 4,
        pointBackgroundColor: '#f2c94c',
        pointBorderColor: '#f2c94c',
      },
      {
        label: 'TR',
        data: seriesInfo.series?.tr || [],
        borderColor: '#27ae60',
        backgroundColor: '#27ae60',
        tension: 0.35,
        fill: false,
        pointRadius(context) {
          return context.dataIndex === peakIndices.tr ? 5 : 2;
        },
        pointHoverRadius: 4,
        pointBackgroundColor: '#27ae60',
        pointBorderColor: '#27ae60',
      },
      {
        label: 'CH',
        data: seriesInfo.series?.ch || [],
        borderColor: '#2f80ed',
        backgroundColor: '#2f80ed',
        tension: 0.35,
        fill: false,
        pointRadius(context) {
          return context.dataIndex === peakIndices.ch ? 5 : 2;
        },
        pointHoverRadius: 4,
        pointBackgroundColor: '#2f80ed',
        pointBorderColor: '#2f80ed',
      },
    ];

    const lastShiftChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: HEATMAP_HOURS,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: {
          padding: {
            top: 6,
            bottom: 6,
          },
        },
        plugins: {
          legend: {
            display: false,
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
            ticks: {
              color: palette.textColor,
              autoSkip: true,
              maxTicksLimit: 12,
              maxRotation: 0,
              minRotation: 0,
              padding: 10,
              font: { size: 10 },
            },
            grid: {
              color: palette.gridColor,
              drawBorder: false,
            },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: palette.textColor,
              padding: 8,
              callback(value) {
                return numberFormatter.format(value);
              },
            },
            grid: {
              color: palette.gridColor,
              drawBorder: false,
            },
          },
        },
      },
    });

    dashboardState.charts.lastShiftHourly = lastShiftChart;

    if (selectors.lastShiftHourlyLegend) {
      datasets.forEach((dataset, index) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'chart-legend__item';
        item.setAttribute('role', 'listitem');
        item.setAttribute('aria-pressed', 'true');
        item.title = 'Spustelėkite, kad paslėptumėte/rodytumėte kreivę';

        const dot = document.createElement('span');
        dot.className = 'chart-legend__dot';
        dot.style.color = dataset.borderColor;

        const label = document.createElement('span');
        label.textContent = dataset.label;

        item.append(dot, label);
        item.addEventListener('click', () => {
          const isVisible = lastShiftChart.isDatasetVisible(index);
          lastShiftChart.setDatasetVisibility(index, !isVisible);
          lastShiftChart.update();
          item.classList.toggle('is-hidden', isVisible);
          item.setAttribute('aria-pressed', String(!isVisible));
        });

        selectors.lastShiftHourlyLegend.appendChild(item);
      });
    }
  }

  async function renderCharts(dailyStats, funnelTotals, heatmapData) {
    showChartSkeletons();
    const Chart = await loadChartJs();
    if (!Chart) {
      console.error('Chart.js biblioteka nepasiekiama.');
      showChartError(TEXT.charts?.errorLoading);
      return;
    }

    try {
      clearChartError();
      const palette = getThemePalette();
      const styleTarget = getThemeStyleTarget();
      Chart.defaults.color = palette.textColor;
      Chart.defaults.font.family = getComputedStyle(styleTarget).fontFamily;
      Chart.defaults.borderColor = palette.gridColor;

      if (!Number.isFinite(dashboardState.chartPeriod) || dashboardState.chartPeriod < 0) {
        dashboardState.chartPeriod = 30;
      }

      dashboardState.chartLib = Chart;
      const scopedDaily = Array.isArray(dailyStats) ? dailyStats.slice() : [];
      dashboardState.chartData.dailyWindow = scopedDaily;

      const selectedYear = Number.isFinite(dashboardState.chartYear) ? Number(dashboardState.chartYear) : null;
      const baseDailyForFallback = Array.isArray(dashboardState.chartData.baseDaily)
        && dashboardState.chartData.baseDaily.length
        ? dashboardState.chartData.baseDaily
        : dashboardState.dailyStats;
      const fallbackDaily = filterDailyStatsByYear(baseDailyForFallback, selectedYear);
      const filteredDaily = Array.isArray(dashboardState.chartData.filteredDaily)
        ? dashboardState.chartData.filteredDaily
        : fallbackDaily;
      const funnelSource = funnelTotals ?? computeFunnelStats(scopedDaily, selectedYear, filteredDaily);
      dashboardState.chartData.funnel = funnelSource;

      let heatmapSource = heatmapData ?? null;
      if (!isValidHeatmapData(heatmapSource)) {
        let fallbackRecords = Array.isArray(dashboardState.chartData.filteredWindowRecords)
          && dashboardState.chartData.filteredWindowRecords.length
          ? dashboardState.chartData.filteredWindowRecords
          : null;
        if (!fallbackRecords || !fallbackRecords.length) {
          const baseRecords = Array.isArray(dashboardState.chartData.baseRecords)
            && dashboardState.chartData.baseRecords.length
            ? dashboardState.chartData.baseRecords
            : dashboardState.rawRecords;
          const yearScopedRecords = filterRecordsByYear(baseRecords, selectedYear);
          const filteredRecords = filterRecordsByChartFilters(yearScopedRecords, dashboardState.chartFilters || {});
          fallbackRecords = filterRecordsByWindow(filteredRecords, dashboardState.chartPeriod);
        }
        heatmapSource = computeArrivalHeatmap(fallbackRecords);
      }
      dashboardState.chartData.heatmap = heatmapSource;
      if (!HEATMAP_METRIC_KEYS.includes(dashboardState.heatmapMetric)) {
        dashboardState.heatmapMetric = DEFAULT_HEATMAP_METRIC;
      }

      hideChartSkeletons();
      renderDailyChart(scopedDaily, dashboardState.chartPeriod, Chart, palette);

      const funnelCanvas = document.getElementById('funnelChart');
      if (funnelCanvas) {
        if (typeof renderFunnelShape === 'function') {
          renderFunnelShape(funnelCanvas, funnelSource, palette.accent, palette.textColor);
          dashboardState.charts.funnel = funnelCanvas;
        }
      }

      const dowLabels = ['Pir', 'Ant', 'Tre', 'Ket', 'Pen', 'Šeš', 'Sek'];
      const compareGmp = dashboardState.chartFilters?.compareGmp === true;
      const dowCounts = Array(7).fill(0);
      const dowEmsCounts = Array(7).fill(0);
      const dowSelfCounts = Array(7).fill(0);
      const dowTotals = Array(7).fill(0);
      const dowStayTotals = Array(7).fill(0);
      const dowStayCounts = Array(7).fill(0);
      const dowStayEmsTotals = Array(7).fill(0);
      const dowStayEmsCounts = Array(7).fill(0);
      const dowStaySelfTotals = Array(7).fill(0);
      const dowStaySelfCounts = Array(7).fill(0);
      scopedDaily.forEach((entry) => {
        const dayIndex = getWeekdayIndexFromDateKey(entry?.date);
        if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
          return;
        }
        const patientCount = Number.isFinite(entry?.count) ? entry.count : 0;
        dowCounts[dayIndex] += patientCount;
        const emsCount = Number.isFinite(entry?.ems) ? entry.ems : 0;
        dowEmsCounts[dayIndex] += emsCount;
        dowSelfCounts[dayIndex] += Math.max(0, patientCount - emsCount);
        dowTotals[dayIndex] += 1;
        const totalTime = Number.isFinite(entry?.totalTime) ? entry.totalTime : 0;
        const durations = Number.isFinite(entry?.durations) ? entry.durations : 0;
        if (totalTime > 0 && durations > 0) {
          dowStayTotals[dayIndex] += totalTime;
          dowStayCounts[dayIndex] += durations;
        } else {
          const avgTime = Number.isFinite(entry?.avgTime) ? entry.avgTime : 0;
          if (avgTime > 0) {
            dowStayTotals[dayIndex] += avgTime;
            dowStayCounts[dayIndex] += 1;
          }
        }
      });
      if (compareGmp) {
        const stayRecordsSource = Array.isArray(dashboardState.chartData.filteredWindowRecords)
          && dashboardState.chartData.filteredWindowRecords.length
          ? dashboardState.chartData.filteredWindowRecords
          : (Array.isArray(dashboardState.rawRecords) ? dashboardState.rawRecords : []);
        stayRecordsSource.forEach((record) => {
          const arrival = record?.arrival instanceof Date && !Number.isNaN(record.arrival.getTime())
            ? record.arrival
            : null;
          const discharge = record?.discharge instanceof Date && !Number.isNaN(record.discharge.getTime())
            ? record.discharge
            : null;
          if (!arrival || !discharge) {
            return;
          }
          const duration = (discharge.getTime() - arrival.getTime()) / 3600000;
          if (!Number.isFinite(duration) || duration < 0 || duration > 24) {
            return;
          }
          const dayIndex = (arrival.getDay() + 6) % 7;
          if (dayIndex < 0 || dayIndex > 6) {
            return;
          }
          if (record.ems) {
            dowStayEmsTotals[dayIndex] += duration;
            dowStayEmsCounts[dayIndex] += 1;
          } else {
            dowStaySelfTotals[dayIndex] += duration;
            dowStaySelfCounts[dayIndex] += 1;
          }
        });
      }
      const dowAverages = dowCounts.map((value, index) => (dowTotals[index] ? value / dowTotals[index] : 0));
      const dowEmsAverages = dowEmsCounts.map((value, index) => (dowTotals[index] ? value / dowTotals[index] : 0));
      const dowSelfAverages = dowSelfCounts.map((value, index) => (dowTotals[index] ? value / dowTotals[index] : 0));
      const dowStayAverages = dowStayTotals.map((value, index) => (dowStayCounts[index] ? value / dowStayCounts[index] : 0));
      const dowStayEmsAverages = dowStayEmsTotals.map((value, index) => (
        dowStayEmsCounts[index] ? value / dowStayEmsCounts[index] : 0
      ));
      const dowStaySelfAverages = dowStaySelfTotals.map((value, index) => (
        dowStaySelfCounts[index] ? value / dowStaySelfCounts[index] : 0
      ));
      const dowPointColors = dowLabels.map((_, index) => (index >= 5 ? palette.weekendAccent : palette.accent));
      const dowPointRadii = dowLabels.map((_, index) => (index >= 5 ? 6 : 4));
      const dowHoverRadii = dowLabels.map((_, index) => (index >= 5 ? 8 : 6));
      const totalDays = dowTotals.reduce((sum, value) => sum + value, 0);
      const totalStaySamples = compareGmp
        ? dowStayEmsCounts.reduce((sum, value) => sum + value, 0)
          + dowStaySelfCounts.reduce((sum, value) => sum + value, 0)
        : dowStayCounts.reduce((sum, value) => sum + value, 0);
      if (selectors.dowCaptionContext) {
        selectors.dowCaptionContext.textContent = totalDays ? `n=${numberFormatter.format(totalDays)} d.` : '';
      }
      if (selectors.dowStayCaptionContext) {
        selectors.dowStayCaptionContext.textContent = totalStaySamples
          ? `n=${numberFormatter.format(totalStaySamples)} viz.`
          : '';
      }

      const dowCanvas = document.getElementById('dowChart');
      if (dowCanvas && dowCanvas.getContext) {
        if (dashboardState.charts.dow) {
          dashboardState.charts.dow.destroy();
        }
        const hasDowData = dowTotals.some((total) => total > 0);
        if (!hasDowData) {
          setChartCardMessage(dowCanvas, TEXT.charts?.empty);
          dashboardState.charts.dow = null;
        } else {
          setChartCardMessage(dowCanvas, null);
          const dowCtx = dowCanvas.getContext('2d');
          if (dowCtx) {
            dashboardState.charts.dow = new Chart(dowCtx, {
              type: 'line',
              data: {
                labels: dowLabels,
                datasets: compareGmp ? [
                  {
                    label: TEXT.charts?.hourlyDatasetEmsLabel || 'Tik GMP',
                    data: dowEmsAverages,
                    borderColor: palette.danger,
                    backgroundColor: palette.danger,
                    tension: 0.35,
                    fill: false,
                    pointRadius: dowPointRadii,
                    pointHoverRadius: dowHoverRadii,
                  },
                  {
                    label: TEXT.charts?.hourlyDatasetSelfLabel || 'Be GMP',
                    data: dowSelfAverages,
                    borderColor: palette.success,
                    backgroundColor: palette.success,
                    tension: 0.35,
                    fill: false,
                    pointRadius: dowPointRadii,
                    pointHoverRadius: dowHoverRadii,
                  },
                ] : [
                  {
                    label: TEXT.charts?.dowLabel || 'Vid. pacientų sk.',
                    data: dowAverages,
                    borderColor: palette.accent,
                    backgroundColor: palette.accent,
                    tension: 0.35,
                    fill: false,
                    pointRadius: dowPointRadii,
                    pointHoverRadius: dowHoverRadii,
                    pointBackgroundColor: dowPointColors,
                    pointBorderColor: dowPointColors,
                  },
                ],
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
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
                        return `${context.dataset.label}: ${decimalFormatter.format(context.parsed.y)}`;
                      },
                    },
                  },
                },
                scales: {
                  x: {
                    ticks: {
                      color: palette.textColor,
                    },
                    grid: {
                      color: palette.gridColor,
                      drawBorder: false,
                    },
                  },
                  y: {
                    beginAtZero: true,
                    ticks: {
                      color: palette.textColor,
                      callback(value) {
                        return decimalFormatter.format(value);
                      },
                    },
                    grid: {
                      color: palette.gridColor,
                      drawBorder: false,
                    },
                  },
                },
              },
            });
          }
        }
      }

      const dowStayCanvas = document.getElementById('dowStayChart');
      if (dowStayCanvas && dowStayCanvas.getContext) {
        if (dashboardState.charts.dowStay) {
          dashboardState.charts.dowStay.destroy();
        }
        const hasStayData = compareGmp
          ? dowStayEmsCounts.some((count) => count > 0) || dowStaySelfCounts.some((count) => count > 0)
          : dowStayCounts.some((count) => count > 0);
        if (!hasStayData) {
          setChartCardMessage(dowStayCanvas, TEXT.charts?.empty);
          dashboardState.charts.dowStay = null;
        } else {
          setChartCardMessage(dowStayCanvas, null);
          const stayCtx = dowStayCanvas.getContext('2d');
          if (stayCtx) {
            dashboardState.charts.dowStay = new Chart(stayCtx, {
              type: 'line',
              data: {
                labels: dowLabels,
                datasets: compareGmp ? [
                  {
                    label: TEXT.charts?.hourlyDatasetEmsLabel || 'Tik GMP',
                    data: dowStayEmsAverages,
                    borderColor: palette.danger,
                    backgroundColor: palette.danger,
                    tension: 0.35,
                    fill: false,
                    pointRadius: dowPointRadii,
                    pointHoverRadius: dowHoverRadii,
                  },
                  {
                    label: TEXT.charts?.hourlyDatasetSelfLabel || 'Be GMP',
                    data: dowStaySelfAverages,
                    borderColor: palette.success,
                    backgroundColor: palette.success,
                    tension: 0.35,
                    fill: false,
                    pointRadius: dowPointRadii,
                    pointHoverRadius: dowHoverRadii,
                  },
                ] : [
                  {
                    label: TEXT.charts?.dowStayLabel || 'Vid. trukmė (val.)',
                    data: dowStayAverages,
                    borderColor: palette.weekendAccent,
                    backgroundColor: palette.weekendAccent,
                    tension: 0.35,
                    fill: false,
                    pointRadius: dowPointRadii,
                    pointHoverRadius: dowHoverRadii,
                  },
                ],
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
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
                        return `${context.dataset.label}: ${decimalFormatter.format(context.parsed.y)}`;
                      },
                    },
                  },
                },
                scales: {
                  x: {
                    ticks: {
                      color: palette.textColor,
                    },
                    grid: {
                      color: palette.gridColor,
                      drawBorder: false,
                    },
                  },
                  y: {
                    beginAtZero: true,
                    ticks: {
                      color: palette.textColor,
                      callback(value) {
                        return decimalFormatter.format(value);
                      },
                    },
                    grid: {
                      color: palette.gridColor,
                      drawBorder: false,
                    },
                  },
                },
              },
            });
          }
        }
      }

      if (selectors.heatmapContainer && typeof renderArrivalHeatmap === 'function') {
        renderArrivalHeatmap(
          selectors.heatmapContainer,
          heatmapSource,
          palette.accent,
          dashboardState.heatmapMetric,
        );
        dashboardState.charts.heatmap = selectors.heatmapContainer;
      }

      const hourlyRecords = Array.isArray(dashboardState.chartData.filteredWindowRecords)
        && dashboardState.chartData.filteredWindowRecords.length
        ? dashboardState.chartData.filteredWindowRecords
        : (Array.isArray(dashboardState.rawRecords) ? dashboardState.rawRecords : []);
      renderHourlyChart(hourlyRecords, Chart, palette);
    } catch (error) {
      console.error('Nepavyko atvaizduoti grafikų:', error);
      showChartError(TEXT.charts?.errorLoading);
    }
  }

  async function renderFeedbackTrendChart(monthlyStats) {
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

    const ratingMin = Math.min(...numericRatings);
    const ratingMax = Math.max(...numericRatings);
    const ratingRange = ratingMax - ratingMin;
    const padding = numericRatings.length > 1 ? Math.max(0.2, ratingRange * 0.25) : 0.2;
    const yMin = Math.max(1, Math.floor((ratingMin - padding) * 10) / 10);
    const yMax = Math.min(5, Math.ceil((ratingMax + padding) * 10) / 10);

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
    };

    const responseDataset = hasResponses ? {
      label: responsesLabel,
      data: responsesValues,
      borderColor: palette.accentSoft,
      backgroundColor: palette.accentSoft,
      tension: 0.35,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 0,
      yAxisID: 'y1',
    } : null;

    dashboardState.charts.feedbackTrend = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: responseDataset ? [ratingDataset, responseDataset] : [ratingDataset],
      },
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
                return label.replace(/\s\d{4}$/, '');
              },
            },
            grid: {
              color: palette.gridColor,
              drawBorder: false,
            },
          },
          y: {
            min: yMin,
            max: yMax,
            ticks: {
              color: palette.textColor,
              callback(value) {
                return oneDecimalFormatter.format(value);
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

  async function renderEdDispositionsChart(dispositions, text, displayVariant) {
    const canvas = selectors.edDispositionsChart;
    const messageEl = selectors.edDispositionsMessage || null;

    if (!canvas) {
      if (messageEl) {
        messageEl.textContent = '';
        messageEl.hidden = true;
      }
      return;
    }

    if (messageEl) {
      messageEl.textContent = '';
      messageEl.hidden = true;
    }

    if (dashboardState.charts.edDispositions && typeof dashboardState.charts.edDispositions.destroy === 'function') {
      dashboardState.charts.edDispositions.destroy();
    }
    dashboardState.charts.edDispositions = null;

    const validEntries = Array.isArray(dispositions)
      ? dispositions
        .filter((entry) => Number.isFinite(entry?.count) && entry.count >= 0)
        .map((entry, index) => ({
          ...entry,
          categoryKey: entry?.categoryKey != null ? String(entry.categoryKey) : null,
          label: entry?.label || `Kategorija ${entry?.categoryKey ?? index + 1}`,
        }))
      : [];

    if (!validEntries.length) {
      canvas.hidden = true;
      canvas.setAttribute('aria-hidden', 'true');
      if (messageEl) {
        messageEl.textContent = text?.empty || 'Nėra duomenų grafiko sudarymui.';
        messageEl.hidden = false;
      }
      return;
    }

    const Chart = await loadChartJs();
    if (!Chart) {
      throw new Error('Chart.js biblioteka nepasiekiama');
    }
    if (!dashboardState.chartLib) {
      dashboardState.chartLib = Chart;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Nepavyko gauti grafiko konteksto');
    }

    canvas.hidden = false;
    canvas.removeAttribute('aria-hidden');
    if (text?.caption) {
      canvas.setAttribute('aria-description', text.caption);
    } else {
      canvas.removeAttribute('aria-description');
    }

    const palette = getThemePalette();
    const styleTarget = getThemeStyleTarget();
    const computedStyles = getComputedStyle(styleTarget);
    const theme = styleTarget?.dataset?.theme || 'light';

    const CATEGORY_COLORS = {
      '1': '#2563eb',
      '2': '#ef4444',
      '3': '#f59e0b',
      '4': '#10b981',
      '5': '#6366f1',
    };

    const colors = validEntries.map((entry, index) => {
      const fallback = index % 2 === 0 ? palette.accent : palette.weekendAccent;
      return CATEGORY_COLORS[entry.categoryKey] || fallback;
    });

    const total = validEntries.reduce((sum, entry) => sum + entry.count, 0);
    const legendLabels = validEntries.map((entry) => ({
      label: entry.label,
      count: entry.count,
      share: total > 0 ? entry.count / total : null,
    }));

    const legendBuilder = text?.legendBuilder;
    const legendFormatter = typeof legendBuilder === 'function'
      ? legendBuilder
      : (item) => {
          if (Number.isFinite(item.share)) {
            return `${item.label} (${percentFormatter.format(item.share)})`;
          }
          return item.label;
        };

    Chart.defaults.color = palette.textColor;
    Chart.defaults.font.family = computedStyles.fontFamily;
    Chart.defaults.borderColor = palette.gridColor;

    const datasetLabel = text?.title || 'Pacientų kategorijos';
    const labelTextColor = (color, lightText, darkText) => {
      if (typeof color !== 'string') {
        return lightText;
      }
      const hexMatch = color.trim().match(/^#?([a-f\d]{6})$/i);
      let r;
      let g;
      let b;
      if (hexMatch) {
        const numeric = Number.parseInt(hexMatch[1], 16);
        r = (numeric >> 16) & 255;
        g = (numeric >> 8) & 255;
        b = numeric & 255;
      } else {
        const rgbMatch = color.trim().match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (rgbMatch) {
          r = Number(rgbMatch[1]);
          g = Number(rgbMatch[2]);
          b = Number(rgbMatch[3]);
        }
      }
      if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
        return lightText;
      }
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.6 ? darkText : lightText;
    };

    const categoryLabelPlugin = {
      id: 'edCategoryLabels',
      afterDatasetsDraw(chart) {
        const dataset = chart.data.datasets?.[0];
        if (!dataset) {
          return;
        }
        const meta = chart.getDatasetMeta(0);
        if (!meta?.data) {
          return;
        }
        const ctx = chart.ctx;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `600 12px ${computedStyles.fontFamily}`;
        meta.data.forEach((element, index) => {
          const value = Number.isFinite(dataset.data?.[index]) ? dataset.data[index] : 0;
          if (!value) {
            return;
          }
          const share = total > 0 ? value / total : null;
          const percent = Number.isFinite(share) ? percentFormatter.format(share) : '';
          const pos = element.tooltipPosition();
          const fill = labelTextColor(colors[index], '#ffffff', '#0f172a');
          const categoryLabel = validEntries[index]?.categoryKey || String(index + 1);
          ctx.fillStyle = fill;
          ctx.font = `800 24px ${computedStyles.fontFamily}`;
          ctx.fillText(String(categoryLabel), pos.x, pos.y - (percent ? 12 : 0));
          if (percent) {
            ctx.font = `700 16px ${computedStyles.fontFamily}`;
            ctx.fillText(percent, pos.x, pos.y + 12);
          }
        });
        ctx.restore();
      },
    };

    dashboardState.charts.edDispositions = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: legendLabels.map((item) => legendFormatter(item)),
        datasets: [
          {
            label: datasetLabel,
            data: validEntries.map((entry) => entry.count),
            backgroundColor: colors,
            borderColor: theme === 'dark' ? palette.surface : '#ffffff',
            borderWidth: 2,
            hoverOffset: 12,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '55%',
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label(context) {
                const value = context.parsed || 0;
                const share = total > 0 ? value / total : null;
                const formattedShare = Number.isFinite(share) ? percentFormatter.format(share) : '';
                const label = context.label || '';
                return formattedShare ? `${label}: ${value} (${formattedShare})` : `${label}: ${value}`;
              },
            },
          },
        },
      },
      plugins: [categoryLabelPlugin],
    });
  }

  return {
    renderCharts,
    renderDailyChart,
    renderHourlyChart,
    renderHourlyChartWithTheme,
    renderLastShiftHourlyChartWithTheme,
    renderFeedbackTrendChart,
    renderEdDispositionsChart,
  };
}
