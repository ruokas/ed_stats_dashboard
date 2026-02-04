export function renderDowCharts(env, Chart, palette, scopedDaily) {
  const {
    dashboardState,
    selectors,
    TEXT,
    setChartCardMessage,
    getWeekdayIndexFromDateKey,
    decimalFormatter,
    numberFormatter,
  } = env;

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
                borderColor: palette.accent,
                backgroundColor: palette.accent,
                tension: 0.35,
                fill: false,
                pointRadius: dowPointRadii,
                pointHoverRadius: dowHoverRadii,
                pointBackgroundColor: dowPointColors,
                pointBorderColor: dowPointColors,
                segment: {
                  borderColor: (ctx) => (ctx.p1DataIndex >= 5 ? palette.weekendAccent : palette.accent),
                },
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
}
