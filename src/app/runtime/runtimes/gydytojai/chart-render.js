import { numberFormatter, oneDecimalFormatter } from '../../../../utils/format.js';

function upsertChart(chartMap, slot, chartLib, canvas, config) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return null;
  }
  const existing = chartMap[slot];
  if (existing && typeof existing.destroy === 'function') {
    existing.destroy();
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  chartMap[slot] = new chartLib(ctx, config);
  return chartMap[slot];
}

function sortLosRowsByVisibleGroups(rows, visibleKeys) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  const keys = Array.isArray(visibleKeys) && visibleKeys.length ? visibleKeys : ['losGt16Share'];
  return list.sort((a, b) => {
    const scoreA = keys.reduce((sum, key) => sum + Number(a?.[key] || 0), 0);
    const scoreB = keys.reduce((sum, key) => sum + Number(b?.[key] || 0), 0);
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    return Number(b?.losGt16Share || 0) - Number(a?.losGt16Share || 0);
  });
}

function applyLosChartDynamicSort(chart, sourceRows) {
  if (!chart || !Array.isArray(sourceRows) || !sourceRows.length) {
    return;
  }
  const datasets = Array.isArray(chart.data?.datasets) ? chart.data.datasets : [];
  const visibleKeys = datasets
    .map((dataset, index) =>
      typeof chart.isDatasetVisible === 'function' && chart.isDatasetVisible(index)
        ? String(dataset?.losKey || '').trim()
        : ''
    )
    .filter(Boolean);
  const sortedRows = sortLosRowsByVisibleGroups(sourceRows, visibleKeys);
  chart.data.labels = sortedRows.map((row) => row.alias);
  datasets.forEach((dataset) => {
    const key = String(dataset?.losKey || '').trim();
    if (!key) {
      return;
    }
    dataset.data = sortedRows.map((row) => Number(row?.[key] || 0) * 100);
  });
}

export function renderCharts(dashboardState, chartLib, selectors, models) {
  const setChartCardLoading = (target, isLoading) => {
    const node =
      target instanceof HTMLElement
        ? target
        : typeof target === 'string'
          ? document.getElementById(target)
          : null;
    const card = node instanceof HTMLElement ? node.closest('.report-card') : null;
    if (!(card instanceof HTMLElement)) {
      return;
    }
    if (isLoading) {
      card.dataset.loading = 'true';
    } else {
      delete card.dataset.loading;
    }
  };
  const rows = models?.leaderboard?.rows || [];
  const labels = rows.map((row) => row.alias);
  const losSortedRows = [...rows].sort((a, b) => {
    const aValue = Number(a?.losGt16Share || 0);
    const bValue = Number(b?.losGt16Share || 0);
    if (aValue !== bValue) {
      return bValue - aValue;
    }
    return Number(b?.los8to16Share || 0) - Number(a?.los8to16Share || 0);
  });
  const hospitalSortedRows = [...rows].sort(
    (a, b) => (b.hospitalizedShare || 0) - (a.hospitalizedShare || 0)
  );
  const mixSortedRows = [...rows].sort((a, b) => (b.nightShare || 0) - (a.nightShare || 0));
  upsertChart(dashboardState.doctorsCharts, 'volume', chartLib, selectors.gydytojaiVolumeChart, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Atvejai', data: rows.map((row) => row.count), backgroundColor: '#2563eb' }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });
  setChartCardLoading(selectors.gydytojaiVolumeChart, false);

  const losChart = upsertChart(dashboardState.doctorsCharts, 'los', chartLib, selectors.gydytojaiLosChart, {
    type: 'bar',
    data: {
      labels: losSortedRows.map((row) => row.alias),
      datasets: [
        {
          label: '<4 val.',
          losKey: 'losLt4Share',
          data: losSortedRows.map((row) => row.losLt4Share * 100),
          backgroundColor: '#16a34a',
        },
        {
          label: '4-8 val.',
          losKey: 'los4to8Share',
          data: losSortedRows.map((row) => row.los4to8Share * 100),
          backgroundColor: '#0ea5e9',
        },
        {
          label: '8-16 val.',
          losKey: 'los8to16Share',
          data: losSortedRows.map((row) => row.los8to16Share * 100),
          backgroundColor: '#f59e0b',
        },
        {
          label: '>16 val.',
          losKey: 'losGt16Share',
          data: losSortedRows.map((row) => row.losGt16Share * 100),
          backgroundColor: '#ef4444',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          onClick: (event, legendItem, legend) => {
            const defaultClick = chartLib?.defaults?.plugins?.legend?.onClick;
            if (typeof defaultClick === 'function') {
              defaultClick(event, legendItem, legend);
            }
            const legendChart = legend?.chart;
            if (!legendChart) {
              return;
            }
            applyLosChartDynamicSort(legendChart, rows);
            legendChart.update();
          },
        },
      },
      scales: { x: { stacked: true }, y: { stacked: true, max: 100 } },
    },
  });
  applyLosChartDynamicSort(losChart, rows);
  setChartCardLoading(selectors.gydytojaiLosChart, false);

  const renderExtraCharts = dashboardState?.gydytojaiChartsExpandedExtras === true;
  if (!renderExtraCharts) {
    return;
  }

  upsertChart(dashboardState.doctorsCharts, 'hospital', chartLib, selectors.gydytojaiHospitalChart, {
    type: 'bar',
    data: {
      labels: hospitalSortedRows.map((row) => row.alias),
      datasets: [
        {
          label: 'Hospitalizacija %',
          data: hospitalSortedRows.map((row) => row.hospitalizedShare * 100),
          backgroundColor: '#ef4444',
        },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });
  setChartCardLoading(selectors.gydytojaiHospitalChart, false);

  const mixRows = mixSortedRows;
  upsertChart(dashboardState.doctorsCharts, 'mix', chartLib, selectors.gydytojaiMixChart, {
    type: 'bar',
    data: {
      labels: mixRows.map((row) => row.alias),
      datasets: [
        { label: 'Diena', data: mixRows.map((row) => row.dayShare * 100), backgroundColor: '#22c55e' },
        { label: 'Naktis', data: mixRows.map((row) => row.nightShare * 100), backgroundColor: '#64748b' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true } },
    },
  });
  setChartCardLoading(selectors.gydytojaiMixChart, false);

  const scatter = models?.scatter?.rows || [];
  upsertChart(dashboardState.doctorsCharts, 'scatter', chartLib, selectors.gydytojaiScatterChart, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Gydytojai',
          data: scatter.map((row) => ({ x: row.count, y: row.avgLosHours, label: row.alias })),
          backgroundColor: '#f59e0b',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => {
              const point = context.raw || {};
              return `${point.label}: n=${numberFormatter.format(point.x || 0)}, LOS=${oneDecimalFormatter.format(point.y || 0)}h`;
            },
          },
        },
      },
      scales: {
        x: { title: { display: true, text: 'Atvejai' } },
        y: { title: { display: true, text: 'Vid. LOS (val.)' } },
      },
    },
  });
  setChartCardLoading(selectors.gydytojaiScatterChart, false);
}
