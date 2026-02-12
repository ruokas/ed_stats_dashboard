export function renderHourlyChart(env, records, ChartLib, palette) {
  const {
    dashboardState,
    TEXT,
    getThemePalette,
    setChartCardMessage,
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
    decimalFormatter,
    numberFormatter,
  } = env;

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

  const compareEnabled = dashboardState.hourlyCompareEnabled === true;
  const compareYears = normalizeHourlyCompareYears(
    dashboardState.hourlyCompareYears?.[0],
    dashboardState.hourlyCompareYears?.[1]
  );
  const baseRecords =
    Array.isArray(dashboardState.chartData.baseRecords) && dashboardState.chartData.baseRecords.length
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
  let suggestedMax;
  let suggestedMin;
  let hasData = false;
  const isBalanceMetric = metricValue === 'balance';

  if (compareEnabled && compareYears.length) {
    const colorPalette = [themePalette.accent, themePalette.weekendAccent, themePalette.success];
    const compareMaxes = [];
    const seriesKey = HOURLY_COMPARE_SERIES.includes(dashboardState.hourlyCompareSeries)
      ? dashboardState.hourlyCompareSeries
      : HOURLY_COMPARE_SERIES_ALL;
    datasets = compareYears.map((year, index) => {
      const yearRecords = getHourlyChartRecords(
        baseRecords,
        year,
        dashboardState.chartFilters || {},
        dashboardState.chartPeriod
      );
      const yearResult = computeHourlySeries(
        yearRecords,
        weekdayValue,
        stayBucket,
        metricValue,
        dashboardState.hourlyDepartment
      );
      if (yearResult?.hasData) {
        hasData = true;
        const values = yearResult.averages?.[seriesKey] || [];
        const localMax = Math.max(0, ...values);
        const localAbsMax = values.length ? Math.max(...values.map((value) => Math.abs(value))) : 0;
        compareMaxes.push(isBalanceMetric ? localAbsMax : localMax);
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
    if (isBalanceMetric) {
      const absMax = maxValue > 0 ? Math.ceil(maxValue * 1.1 * 10) / 10 : undefined;
      suggestedMax = absMax;
      suggestedMin = absMax != null ? -absMax : undefined;
    } else {
      suggestedMax = maxValue > 0 ? Math.ceil(maxValue * 1.1 * 10) / 10 : undefined;
    }
  } else {
    const result = computeHourlySeries(
      records,
      weekdayValue,
      stayBucket,
      metricValue,
      dashboardState.hourlyDepartment
    );
    if (result?.hasData) {
      hasData = true;
    }
    const baseSeries = computeHourlySeries(records, weekdayValue, HOURLY_STAY_BUCKET_ALL, metricValue, 'all');
    const baseMax = baseSeries?.averages?.all ? Math.max(0, ...baseSeries.averages.all) : 0;
    if (isBalanceMetric) {
      const absMax = baseSeries?.averages?.all
        ? Math.max(...baseSeries.averages.all.map((value) => Math.abs(value)))
        : 0;
      const rounded = absMax > 0 ? Math.ceil(absMax * 1.1 * 10) / 10 : undefined;
      suggestedMax = rounded;
      suggestedMin = rounded != null ? -rounded : undefined;
    } else {
      suggestedMax = baseMax > 0 ? Math.ceil(baseMax * 1.1 * 10) / 10 : undefined;
    }

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
    if (dashboardState.charts.hourly) {
      if (dashboardState.charts.hourly._yAxisWheelHandler && canvas) {
        canvas.removeEventListener('wheel', dashboardState.charts.hourly._yAxisWheelHandler);
      }
      if (typeof dashboardState.charts.hourly.destroy === 'function') {
        dashboardState.charts.hourly.destroy();
      }
    }
    dashboardState.charts.hourly = null;
    return;
  }
  setChartCardMessage(canvas, null);

  dashboardState.hourlyYAxisSuggestedMax = suggestedMax ?? null;
  dashboardState.hourlyYAxisSuggestedMin = suggestedMin ?? null;

  const labels = HEATMAP_HOURS;
  const chartConfig = {
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
          onClick(_event, legendItem, legend) {
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
          ticks: {
            color: themePalette.textColor,
            padding: 8,
            callback(value) {
              return numberFormatter.format(value);
            },
          },
          grid: {
            color(context) {
              if (isBalanceMetric && context.tick && context.tick.value === 0) {
                return 'rgba(239, 68, 68, 0.65)';
              }
              return themePalette.gridColor;
            },
            drawBorder: false,
          },
        },
      },
    },
  };

  const existingChart = dashboardState.charts.hourly;
  const canReuse = existingChart && existingChart.canvas === canvas && existingChart.config?.type === 'line';
  if (canReuse) {
    existingChart.data.labels = chartConfig.data.labels;
    existingChart.data.datasets = chartConfig.data.datasets;
    existingChart.options = chartConfig.options;
    if (typeof applyHourlyYAxisAuto === 'function') {
      applyHourlyYAxisAuto(existingChart);
    }
    existingChart.update('none');
    return;
  }
  if (existingChart) {
    if (existingChart._yAxisWheelHandler && canvas) {
      canvas.removeEventListener('wheel', existingChart._yAxisWheelHandler);
    }
    if (typeof existingChart.destroy === 'function') {
      existingChart.destroy();
    }
  }
  dashboardState.charts.hourly = new Chart(ctx, chartConfig);

  if (typeof applyHourlyYAxisAuto === 'function') {
    applyHourlyYAxisAuto(dashboardState.charts.hourly);
  }
}

export async function renderHourlyChartWithTheme(env, records) {
  const { dashboardState, loadChartJs, getThemePalette, getThemeStyleTarget } = env;
  const Chart = dashboardState.chartLib ?? (await loadChartJs());
  if (!Chart) {
    console.error('Chart.js biblioteka nepasiekiama.');
    return;
  }
  const palette = getThemePalette();
  const styleTarget = getThemeStyleTarget();
  Chart.defaults.color = palette.textColor;
  Chart.defaults.font.family = getComputedStyle(styleTarget).fontFamily;
  Chart.defaults.borderColor = palette.gridColor;
  if (!dashboardState.chartLib) {
    dashboardState.chartLib = Chart;
  }
  renderHourlyChart(env, records, Chart, palette);
}

export async function renderLastShiftHourlyChartWithTheme(env, seriesInfo) {
  const {
    dashboardState,
    selectors,
    loadChartJs,
    getThemePalette,
    getThemeStyleTarget,
    setChartCardMessage,
    TEXT,
    HEATMAP_HOURS,
    decimalFormatter,
    numberFormatter,
  } = env;

  const canvas = selectors.lastShiftHourlyChart || document.getElementById('lastShiftHourlyChart');
  if (!canvas || !canvas.getContext) {
    return;
  }

  const titleEl = document.getElementById('lastShiftHourlyTitle');
  const titleMainEl = titleEl?.querySelector('span');
  const metric = seriesInfo?.metric;
  if (titleMainEl) {
    if (metric === 'balance') {
      titleMainEl.textContent = 'Paskutinės pamainos srautų balansas per valandą';
    } else if (metric === 'discharges') {
      titleMainEl.textContent = 'Paskutinės pamainos išleidimai per valandą';
    } else if (metric === 'hospitalized') {
      titleMainEl.textContent = 'Paskutinės pamainos hospitalizacijos per valandą';
    } else if (metric === 'census') {
      titleMainEl.textContent = 'Paskutinės pamainos pacientų kiekis skyriuje per valandą';
    } else {
      titleMainEl.textContent = 'Paskutinės pamainos atvykimai per valandą';
    }
  }

  const Chart = dashboardState.chartLib ?? (await loadChartJs());
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

  if (!seriesInfo?.hasData) {
    setChartCardMessage(canvas, TEXT.charts?.empty);
    if (selectors.lastShiftHourlyContext) {
      selectors.lastShiftHourlyContext.textContent = '';
    }
    if (
      dashboardState.charts.lastShiftHourly &&
      typeof dashboardState.charts.lastShiftHourly.destroy === 'function'
    ) {
      dashboardState.charts.lastShiftHourly.destroy();
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
    if (seriesInfo?.metricLabel) {
      contextParts.push(`Rodiklis: ${seriesInfo.metricLabel}`);
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

  const startHour = 7;
  const rotateSeries = (values = []) => {
    if (!Array.isArray(values) || values.length === 0) {
      return [];
    }
    const length = values.length;
    const shift = ((startHour % length) + length) % length;
    return values.slice(shift).concat(values.slice(0, shift));
  };

  const rotatedSeries = {
    total: rotateSeries(seriesInfo.series?.total),
    t: rotateSeries(seriesInfo.series?.t),
    tr: rotateSeries(seriesInfo.series?.tr),
    ch: rotateSeries(seriesInfo.series?.ch),
  };

  const isBalance = metric === 'balance';
  const isCensus = metric === 'census';
  const rotatedOutflow = rotateSeries(seriesInfo.series?.outflow);
  const rotatedNet = rotateSeries(seriesInfo.series?.net);
  const rotatedCensus = rotateSeries(seriesInfo.series?.census);
  const peakIndices = {
    total: toPeakIndex(rotatedSeries.total),
    t: toPeakIndex(rotatedSeries.t),
    tr: toPeakIndex(rotatedSeries.tr),
    ch: toPeakIndex(rotatedSeries.ch),
    outflow: toPeakIndex(rotatedOutflow),
    net: toPeakIndex(rotatedNet),
    census: toPeakIndex(rotatedCensus),
  };

  const datasets = isBalance
    ? [
        {
          label: 'Atvykimai',
          data: rotatedSeries.total || [],
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
          label: 'Išvykimai',
          data: rotatedOutflow,
          borderColor: '#f97316',
          backgroundColor: '#f97316',
          tension: 0.35,
          fill: false,
          pointRadius(context) {
            return context.dataIndex === peakIndices.outflow ? 5 : 2;
          },
          pointHoverRadius: 4,
          pointBackgroundColor: '#f97316',
          pointBorderColor: '#f97316',
        },
        {
          label: 'Neto srautas',
          data: rotatedNet,
          borderColor: '#22c55e',
          backgroundColor: '#22c55e',
          fill: {
            target: 'origin',
            above: 'rgba(34, 197, 94, 0.18)',
            below: 'rgba(239, 68, 68, 0.18)',
          },
          tension: 0.35,
          pointRadius(context) {
            return context.dataIndex === peakIndices.net ? 5 : 2;
          },
          pointHoverRadius: 4,
          pointBackgroundColor: '#22c55e',
          pointBorderColor: '#22c55e',
        },
      ]
    : isCensus
      ? [
          {
            label: 'Atvykimai',
            data: rotatedSeries.total || [],
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
            label: 'Išvykimai',
            data: rotatedOutflow || [],
            borderColor: '#f97316',
            backgroundColor: '#f97316',
            tension: 0.35,
            fill: false,
            pointRadius(context) {
              return context.dataIndex === peakIndices.outflow ? 5 : 2;
            },
            pointHoverRadius: 4,
            pointBackgroundColor: '#f97316',
            pointBorderColor: '#f97316',
          },
          {
            label: 'Pacientų kiekis skyriuje',
            data: rotatedCensus || [],
            borderColor: palette.accent,
            backgroundColor: palette.accentSoft,
            tension: 0.35,
            fill: true,
            pointRadius(context) {
              return context.dataIndex === peakIndices.census ? 5 : 2;
            },
            pointHoverRadius: 4,
            pointBackgroundColor: palette.accent,
            pointBorderColor: palette.accent,
          },
        ]
      : [
          {
            label: TEXT.charts?.hourlyDatasetTotalLabel || 'Iš viso',
            data: rotatedSeries.total || [],
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
            data: rotatedSeries.t || [],
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
            data: rotatedSeries.tr || [],
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
            data: rotatedSeries.ch || [],
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

  const chartConfig = {
    type: 'line',
    data: {
      labels: rotateSeries(HEATMAP_HOURS),
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
              return `${context.dataset.label}: ${decimalFormatter.format(context.parsed.y)}`;
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
            color(context) {
              if (isBalance && context.tick && context.tick.value === 0) {
                return 'rgba(239, 68, 68, 0.65)';
              }
              return palette.gridColor;
            },
            drawBorder: false,
          },
        },
      },
    },
  };

  const existingLastShiftChart = dashboardState.charts.lastShiftHourly;
  const canReuseLastShiftChart =
    existingLastShiftChart &&
    existingLastShiftChart.canvas === canvas &&
    existingLastShiftChart.config?.type === 'line';
  const lastShiftChart = canReuseLastShiftChart ? existingLastShiftChart : new Chart(ctx, chartConfig);
  if (canReuseLastShiftChart) {
    existingLastShiftChart.data.labels = chartConfig.data.labels;
    existingLastShiftChart.data.datasets = chartConfig.data.datasets;
    existingLastShiftChart.options = chartConfig.options;
    existingLastShiftChart.update();
  } else {
    if (existingLastShiftChart && typeof existingLastShiftChart.destroy === 'function') {
      existingLastShiftChart.destroy();
    }
    dashboardState.charts.lastShiftHourly = lastShiftChart;
  }
  if (canReuseLastShiftChart) {
    dashboardState.charts.lastShiftHourly = existingLastShiftChart;
  }

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
