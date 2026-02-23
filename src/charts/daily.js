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
    formatMonthLabel,
    formatDailyCaption,
    syncChartPeriodButtons,
  } = env;

  const Chart = ChartLib;
  const themePalette = palette || getThemePalette();
  const normalizeDailyBaseCaption = (value) =>
    String(value || 'Kasdieniai pacientu srautai')
      .replace(/\s*\([^)]*\)\s*$/u, '')
      .trim();
  const normalizedPeriod = Number.isFinite(Number(period)) ? Math.max(0, Number(period)) : 30;
  dashboardState.chartPeriod = normalizedPeriod;
  syncChartPeriodButtons(normalizedPeriod);
  const compareGmp = dashboardState.chartFilters?.compareGmp === true;
  const selectedYear = Number.isFinite(dashboardState.chartYear) ? Number(dashboardState.chartYear) : null;
  const isYearMode = Number.isFinite(selectedYear);
  const isMonthlyTrend = isYearMode || normalizedPeriod === 365 || normalizedPeriod === 0;
  const baseCaption = normalizeDailyBaseCaption(TEXT.charts.dailyCaption);
  const captionText = isYearMode
    ? `${baseCaption} (${selectedYear} m. menesine dinamika)`
    : formatDailyCaption(normalizedPeriod);
  if (selectors.dailyCaption) {
    selectors.dailyCaption.textContent = captionText;
  }
  const scopedData = Array.isArray(dailyStats)
    ? isYearMode
      ? dailyStats.slice()
      : normalizedPeriod === 0
        ? dailyStats.slice()
        : dailyStats.slice(-normalizedPeriod)
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
  let gmpCounts = scopedData.map((entry) => (Number.isFinite(entry?.ems) ? entry.ems : 0));
  let totalCounts = scopedData.map((entry) => (Number.isFinite(entry?.count) ? entry.count : 0));
  let nightCounts = scopedData.map((entry) => (Number.isFinite(entry?.night) ? entry.night : 0));
  let selfCounts = totalCounts.map((value, index) => Math.max(0, value - gmpCounts[index]));
  let chartType = 'bar';
  let useWeekendColors = true;

  if (isMonthlyTrend) {
    const monthlyMap = new Map();
    const resolveYearMonth = (rawDate) => {
      const raw = String(rawDate || '').trim();
      const direct = raw.match(/^(\d{4})[-/.](\d{1,2})/);
      if (direct) {
        const year = Number.parseInt(direct[1], 10);
        const month = Number.parseInt(direct[2], 10);
        if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
          return { year, month };
        }
      }
      const utcDate = dateKeyToDate(raw);
      if (utcDate instanceof Date && !Number.isNaN(utcDate.getTime())) {
        return { year: utcDate.getUTCFullYear(), month: utcDate.getUTCMonth() + 1 };
      }
      const fallbackDate = new Date(raw);
      if (fallbackDate instanceof Date && !Number.isNaN(fallbackDate.getTime())) {
        return { year: fallbackDate.getUTCFullYear(), month: fallbackDate.getUTCMonth() + 1 };
      }
      return null;
    };
    scopedData.forEach((entry) => {
      const resolved = resolveYearMonth(entry?.date);
      if (!resolved) {
        return;
      }
      const monthKey = `${resolved.year}-${String(resolved.month).padStart(2, '0')}`;
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, {
          month: monthKey,
          count: 0,
          night: 0,
          ems: 0,
          discharged: 0,
          hospitalized: 0,
          totalTime: 0,
          durations: 0,
          hospitalizedTime: 0,
          hospitalizedDurations: 0,
          dayCount: 0,
        });
      }
      const bucket = monthlyMap.get(monthKey);
      bucket.count += Number.isFinite(Number(entry?.count)) ? Number(entry.count) : 0;
      bucket.night += Number.isFinite(Number(entry?.night)) ? Number(entry.night) : 0;
      bucket.ems += Number.isFinite(Number(entry?.ems)) ? Number(entry.ems) : 0;
      bucket.dayCount += 1;
    });
    const monthlyStats = Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));
    const normalizeMonthKey = (value) => {
      const raw = String(value || '').trim();
      const match = raw.match(/^(\d{4})-(\d{1,2})/);
      if (!match) {
        return '';
      }
      const year = Number.parseInt(match[1], 10);
      const month = Number.parseInt(match[2], 10);
      if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return '';
      }
      return `${year}-${String(month).padStart(2, '0')}`;
    };
    const resolvedYear = isYearMode
      ? selectedYear
      : monthlyStats.reduce((latest, entry) => {
          const normalizedMonth = normalizeMonthKey(entry?.month);
          const year = Number.parseInt(normalizedMonth.slice(0, 4), 10);
          return Number.isFinite(year) && year > latest ? year : latest;
        }, Number.NEGATIVE_INFINITY);
    const monthlyLookup = new Map(
      monthlyStats
        .map((entry) => ({ key: normalizeMonthKey(entry?.month), entry }))
        .filter((item) => Boolean(item.key))
        .map((item) => [item.key, item.entry])
    );
    const monthlyWindow = Number.isFinite(resolvedYear)
      ? Array.from({ length: 12 }, (_, index) => {
          const month = `${resolvedYear}-${String(index + 1).padStart(2, '0')}`;
          const entry = monthlyLookup.get(month);
          if (entry) {
            return entry;
          }
          return {
            month,
            count: 0,
            night: 0,
            ems: 0,
            discharged: 0,
            hospitalized: 0,
            totalTime: 0,
            durations: 0,
            hospitalizedTime: 0,
            hospitalizedDurations: 0,
            dayCount: 0,
          };
        })
      : [];
    labels = monthlyWindow.map((entry) => {
      const date =
        typeof entry?.month === 'string'
          ? new Date(
              Date.UTC(
                Number.parseInt(entry.month.slice(0, 4), 10),
                Number.parseInt(entry.month.slice(5, 7), 10) - 1,
                1
              )
            )
          : null;
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return formatMonthLabel(entry.month);
      }
      return monthOnlyFormatter.format(date);
    });
    totalCounts = monthlyWindow.map((entry) => (Number.isFinite(entry?.count) ? entry.count : 0));
    nightCounts = monthlyWindow.map((entry) => (Number.isFinite(entry?.night) ? entry.night : 0));
    gmpCounts = monthlyWindow.map((entry) => (Number.isFinite(entry?.ems) ? entry.ems : 0));
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
        ...(compareGmp
          ? [
              {
                label: TEXT.charts?.hourlyDatasetEmsLabel || 'Tik GMP',
                data: gmpCounts,
                backgroundColor: useWeekendColors
                  ? weekendFlags.map(() => themePalette.dangerSoft)
                  : themePalette.dangerSoft,
                borderColor: themePalette.danger,
                borderRadius: chartType === 'bar' ? 10 : 0,
                borderWidth: chartType === 'bar' ? 1 : 2,
                stack: chartType === 'bar' ? 'daily' : undefined,
                tension: chartType === 'line' ? 0.25 : 0,
                fill: chartType !== 'line',
                pointRadius: chartType === 'line' ? 2 : 0,
                pointHoverRadius: chartType === 'line' ? 4 : 0,
              },
              {
                label: TEXT.charts?.hourlyDatasetSelfLabel || 'Be GMP',
                data: selfCounts,
                backgroundColor: useWeekendColors
                  ? weekendFlags.map(() => themePalette.success)
                  : themePalette.success,
                borderColor: themePalette.success,
                borderRadius: chartType === 'bar' ? 10 : 0,
                borderWidth: chartType === 'bar' ? 1 : 2,
                stack: chartType === 'bar' ? 'daily' : undefined,
                tension: chartType === 'line' ? 0.25 : 0,
                fill: chartType !== 'line',
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
            ]
          : [
              {
                label: 'Pacientai',
                data: totalCounts,
                backgroundColor: chartType === 'bar' ? weekendColors : themePalette.accent,
                borderColor: chartType === 'line' ? themePalette.accent : undefined,
                borderRadius: chartType === 'bar' ? 12 : 0,
                borderWidth: chartType === 'line' ? 2 : 0,
                tension: chartType === 'line' ? 0.25 : 0,
                fill: chartType !== 'line',
                pointRadius: chartType === 'line' ? 2 : 0,
                pointHoverRadius: chartType === 'line' ? 4 : 0,
              },
              {
                label: 'Naktiniai pacientai',
                data: nightCounts,
                backgroundColor:
                  chartType === 'bar'
                    ? weekendFlags.map((isWeekend) =>
                        isWeekend ? themePalette.weekendAccentSoft : themePalette.accentSoft
                      )
                    : themePalette.accentSoft,
                borderColor: chartType === 'line' ? themePalette.accentSoft : undefined,
                borderRadius: chartType === 'bar' ? 12 : 0,
                borderWidth: chartType === 'line' ? 2 : 0,
                tension: chartType === 'line' ? 0.25 : 0,
                fill: chartType !== 'line',
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
            color: (ctxTick) =>
              useWeekendColors && weekendFlags[ctxTick.index]
                ? themePalette.weekendAccent
                : themePalette.textColor,
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
  const canReuse =
    existingChart && existingChart.canvas === canvas && existingChart.config?.type === chartType;
  if (canReuse) {
    existingChart.data.labels = chartConfig.data.labels;
    existingChart.data.datasets = chartConfig.data.datasets;
    existingChart.options = chartConfig.options;
    existingChart.update();
    return;
  }
  if (existingChart && typeof existingChart.destroy === 'function') {
    existingChart.destroy();
  }
  dashboardState.charts.daily = new Chart(ctx, chartConfig);
}
