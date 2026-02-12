import { createMainDataHandlers } from '../../../data/main-data.js';
import {
  computeDoctorDayNightMix,
  computeDoctorHospitalizationShare,
  computeDoctorLeaderboard,
  computeDoctorMonthlyTrend,
  computeDoctorVolumeVsLosScatter,
  computeDoctorYearlyMatrix,
} from '../../../data/stats.js';
import { createDashboardState } from '../../../state/dashboardState.js';
import { createSelectorsForPage } from '../../../state/selectors.js';
import { loadChartJs } from '../../../utils/chart-loader.js';
import { numberFormatter, oneDecimalFormatter, percentFormatter } from '../../../utils/format.js';
import { DEFAULT_FOOTER_SOURCE, DEFAULT_KPI_WINDOW_DAYS, TEXT, THEME_STORAGE_KEY } from '../../constants.js';
import { DEFAULT_SETTINGS } from '../../default-settings.js';
import {
  initSummariesJumpNavigation,
  initSummariesJumpStickyOffset,
} from '../features/summaries-jump-navigation.js';
import { applyTheme, initializeTheme } from '../features/theme.js';
import { createTextSignature, describeError, downloadCsv, formatUrlForDiagnostics } from '../network.js';
import { applyCommonPageShellText, setupSharedPageUi } from '../page-ui.js';
import { loadSettingsFromConfig } from '../settings.js';
import {
  createDefaultChartFilters,
  createDefaultFeedbackFilters,
  createDefaultKpiFilters,
} from '../state.js';
import { createStatusSetter } from '../utils/common.js';

const setStatus = createStatusSetter(TEXT.status, { showSuccessState: false });

function extractHistoricalRecords(dashboardState) {
  const all = Array.isArray(dashboardState.rawRecords) ? dashboardState.rawRecords : [];
  const tagged = all.filter((record) => record?.sourceId === 'historical');
  return tagged.length ? tagged : all.filter((record) => record?.hasExtendedHistoricalFields === true);
}

function applyDoctorControls(selectors, dashboardState, yearOptions, topRows) {
  if (selectors.gydytojaiYear) {
    const select = selectors.gydytojaiYear;
    const previous = String(dashboardState.doctorsYear || 'all');
    select.replaceChildren();
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'Visi metai';
    select.appendChild(allOption);
    (Array.isArray(yearOptions) ? yearOptions : []).forEach((year) => {
      const option = document.createElement('option');
      option.value = String(year);
      option.textContent = String(year);
      select.appendChild(option);
    });
    const hasPrevious = Array.from(select.options).some((option) => option.value === previous);
    select.value = hasPrevious ? previous : 'all';
    dashboardState.doctorsYear = select.value;
  }

  if (selectors.gydytojaiTopN) {
    selectors.gydytojaiTopN.value = String(dashboardState.doctorsTopN || 15);
  }
  if (selectors.gydytojaiMinCases) {
    selectors.gydytojaiMinCases.value = String(dashboardState.doctorsMinCases || 30);
  }
  if (selectors.gydytojaiSort) {
    selectors.gydytojaiSort.value = String(dashboardState.doctorsSort || 'volume_desc');
  }

  if (selectors.gydytojaiDoctorSelect) {
    const select = selectors.gydytojaiDoctorSelect;
    const previous = String(dashboardState.doctorsSelected || '__top3__');
    select.replaceChildren();
    const topOption = document.createElement('option');
    topOption.value = '__top3__';
    topOption.textContent = 'TOP 3';
    select.appendChild(topOption);
    (Array.isArray(topRows) ? topRows : []).forEach((row) => {
      const alias = String(row?.alias || '').trim();
      if (!alias) {
        return;
      }
      const option = document.createElement('option');
      option.value = alias;
      option.textContent = alias;
      select.appendChild(option);
    });
    const hasPrevious = Array.from(select.options).some((option) => option.value === previous);
    select.value = hasPrevious ? previous : '__top3__';
    dashboardState.doctorsSelected = select.value;
  }
}

function setKpis(selectors, model) {
  const kpis = model?.kpis || {};
  if (selectors.gydytojaiKpiActive) {
    selectors.gydytojaiKpiActive.textContent = numberFormatter.format(Number(kpis.activeDoctors || 0));
  }
  if (selectors.gydytojaiKpiMedianLos) {
    selectors.gydytojaiKpiMedianLos.textContent = Number.isFinite(kpis.medianLosHours)
      ? oneDecimalFormatter.format(kpis.medianLosHours)
      : '-';
  }
  if (selectors.gydytojaiKpiTopShare) {
    selectors.gydytojaiKpiTopShare.textContent = percentFormatter.format(Number(kpis.topDoctorShare || 0));
  }
}

function setCoverage(selectors, model) {
  if (!selectors.gydytojaiCoverage) {
    return;
  }
  const coverage = model?.coverage || {};
  const total = Number(coverage.total || 0);
  const withDoctor = Number(coverage.withDoctor || 0);
  const percent = Number(coverage.percent || 0);
  selectors.gydytojaiCoverage.textContent = `Su uždariusiu gydytoju: ${withDoctor} iš ${total} (${oneDecimalFormatter.format(percent)}%).`;
}

function renderLeaderboardTable(selectors, rows) {
  if (!selectors.gydytojaiLeaderboardBody) {
    return;
  }
  const body = selectors.gydytojaiLeaderboardBody;
  body.replaceChildren();
  if (!rows.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="7">Nepakanka duomenų.</td>';
    body.appendChild(row);
    return;
  }
  rows.forEach((entry) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${entry.alias}</td>
      <td>${numberFormatter.format(entry.count)}</td>
      <td>${oneDecimalFormatter.format(entry.share * 100)}</td>
      <td>${Number.isFinite(entry.avgLosHours) ? oneDecimalFormatter.format(entry.avgLosHours) : '-'}</td>
      <td>${Number.isFinite(entry.medianLosHours) ? oneDecimalFormatter.format(entry.medianLosHours) : '-'}</td>
      <td>${oneDecimalFormatter.format(entry.hospitalizedShare * 100)}</td>
      <td>${oneDecimalFormatter.format(entry.nightShare * 100)}</td>
    `;
    body.appendChild(tr);
  });
}

function renderYearlyTable(selectors, model) {
  if (!selectors.gydytojaiYearlyHead || !selectors.gydytojaiYearlyBody) {
    return;
  }
  const years = Array.isArray(model?.years) ? model.years : [];
  const rows = Array.isArray(model?.rows) ? model.rows : [];
  selectors.gydytojaiYearlyHead.innerHTML = '';
  selectors.gydytojaiYearlyBody.innerHTML = '';

  const headRow = document.createElement('tr');
  headRow.appendChild(Object.assign(document.createElement('th'), { textContent: 'Gydytojas' }));
  years.forEach((year) => {
    const th = document.createElement('th');
    th.textContent = String(year);
    headRow.appendChild(th);
  });
  selectors.gydytojaiYearlyHead.appendChild(headRow);

  if (!rows.length) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="${Math.max(1, years.length + 1)}">Nepakanka duomenų.</td>`;
    selectors.gydytojaiYearlyBody.appendChild(row);
    return;
  }

  rows.forEach((entry) => {
    const tr = document.createElement('tr');
    const label = document.createElement('td');
    label.textContent = entry.alias;
    tr.appendChild(label);
    (entry.yearly || []).forEach((yearCell) => {
      const td = document.createElement('td');
      const avg = Number.isFinite(yearCell?.avgLosHours)
        ? oneDecimalFormatter.format(yearCell.avgLosHours)
        : '-';
      td.textContent = `${numberFormatter.format(Number(yearCell?.count || 0))} / ${avg}`;
      tr.appendChild(td);
    });
    selectors.gydytojaiYearlyBody.appendChild(tr);
  });
}

function upsertChart(chartMap, slot, chartLib, canvas, config) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const existing = chartMap[slot];
  if (existing && typeof existing.destroy === 'function') {
    existing.destroy();
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  chartMap[slot] = new chartLib(ctx, config);
}

function renderCharts(dashboardState, chartLib, selectors, models) {
  const rows = models?.leaderboard?.rows || [];
  const labels = rows.map((row) => row.alias);
  upsertChart(dashboardState.doctorsCharts, 'volume', chartLib, selectors.gydytojaiVolumeChart, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Atvejai', data: rows.map((row) => row.count), backgroundColor: '#2563eb' }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });
  upsertChart(dashboardState.doctorsCharts, 'los', chartLib, selectors.gydytojaiLosChart, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Vid. LOS (val.)', data: rows.map((row) => row.avgLosHours), backgroundColor: '#0ea5e9' },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });
  upsertChart(dashboardState.doctorsCharts, 'hospital', chartLib, selectors.gydytojaiHospitalChart, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Hospitalizacija %',
          data: rows.map((row) => row.hospitalizedShare * 100),
          backgroundColor: '#ef4444',
        },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });

  const mixRows = models?.mix?.rows || [];
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

  const trend = models?.trend || {};
  upsertChart(dashboardState.doctorsCharts, 'trend', chartLib, selectors.gydytojaiTrendChart, {
    type: 'line',
    data: {
      labels: trend.months || [],
      datasets: (trend.series || []).map((series, index) => ({
        label: series.alias,
        data: (series.points || []).map((point) => point.count),
        borderColor: ['#2563eb', '#ef4444', '#16a34a'][index % 3],
        backgroundColor: 'transparent',
        tension: 0.3,
      })),
    },
    options: { responsive: true, maintainAspectRatio: false },
  });

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
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function wireInteractions(selectors, dashboardState, rerender) {
  selectors.gydytojaiYear?.addEventListener('change', (event) => {
    dashboardState.doctorsYear = String(event.target.value || 'all');
    rerender();
  });
  selectors.gydytojaiTopN?.addEventListener('change', (event) => {
    dashboardState.doctorsTopN = parsePositiveInt(event.target.value, 15);
    rerender();
  });
  selectors.gydytojaiMinCases?.addEventListener('change', (event) => {
    dashboardState.doctorsMinCases = parsePositiveInt(event.target.value, 30);
    rerender();
  });
  selectors.gydytojaiSort?.addEventListener('change', (event) => {
    dashboardState.doctorsSort = String(event.target.value || 'volume_desc');
    rerender();
  });
  selectors.gydytojaiDoctorSelect?.addEventListener('change', (event) => {
    dashboardState.doctorsSelected = String(event.target.value || '__top3__');
    rerender();
  });
}

export async function runGydytojaiRuntime(core) {
  const selectors = createSelectorsForPage(core?.pageId || 'gydytojai');
  const settings = await loadSettingsFromConfig(DEFAULT_SETTINGS);
  const dashboardState = createDashboardState({
    defaultChartFilters: createDefaultChartFilters,
    defaultKpiFilters: () => createDefaultKpiFilters({ settings, DEFAULT_SETTINGS, DEFAULT_KPI_WINDOW_DAYS }),
    defaultFeedbackFilters: createDefaultFeedbackFilters,
    defaultHeatmapFilters: () => ({ arrival: 'all', disposition: 'all', cardType: 'all' }),
    defaultHeatmapMetric: 'arrivals',
    hourlyMetricArrivals: 'arrivals',
    hourlyCompareSeriesAll: 'all',
  });

  applyCommonPageShellText({ selectors, settings, text: TEXT, defaultFooterSource: DEFAULT_FOOTER_SOURCE });
  setupSharedPageUi({
    selectors,
    dashboardState,
    initializeTheme,
    applyTheme,
    themeStorageKey: THEME_STORAGE_KEY,
    afterSectionNavigation: () => {
      initSummariesJumpStickyOffset({
        summariesJumpNav: selectors.jumpNav,
        hero: selectors.hero,
      });
      initSummariesJumpNavigation({
        summariesJumpNav: selectors.jumpNav,
        summariesJumpLinks: selectors.jumpLinks,
      });
    },
  });

  const { fetchData } = createMainDataHandlers({
    settings,
    DEFAULT_SETTINGS,
    dashboardState,
    downloadCsv,
    describeError: (error, options = {}) =>
      describeError(error, { ...options, fallbackMessage: TEXT.status.error }),
    createTextSignature,
    formatUrlForDiagnostics,
  });

  let chartLib = null;
  const render = async () => {
    const records = extractHistoricalRecords(dashboardState);
    const options = {
      yearFilter: dashboardState.doctorsYear,
      topN: dashboardState.doctorsTopN,
      minCases: dashboardState.doctorsMinCases,
      sortBy: dashboardState.doctorsSort,
      calculations: settings?.calculations,
      defaultSettings: DEFAULT_SETTINGS,
      selectedDoctor: dashboardState.doctorsSelected,
    };

    const leaderboard = computeDoctorLeaderboard(records, options);
    const yearly = computeDoctorYearlyMatrix(records, options);
    const mix = computeDoctorDayNightMix(records, options);
    const hospital = computeDoctorHospitalizationShare(records, options);
    const trend = computeDoctorMonthlyTrend(records, options);
    const scatter = computeDoctorVolumeVsLosScatter(records, options);

    applyDoctorControls(selectors, dashboardState, yearly.yearOptions, leaderboard.rows);
    setCoverage(selectors, leaderboard);
    setKpis(selectors, leaderboard);
    renderLeaderboardTable(selectors, leaderboard.rows);
    renderYearlyTable(selectors, yearly);

    chartLib = chartLib || (await loadChartJs());
    if (!chartLib) {
      return;
    }
    renderCharts(dashboardState, chartLib, selectors, {
      leaderboard,
      yearly,
      mix,
      hospital,
      trend,
      scatter,
    });
  };

  wireInteractions(selectors, dashboardState, () => {
    render().catch((error) => {
      console.error('Nepavyko perskaičiuoti gydytojų rodiklių:', error);
    });
  });

  try {
    setStatus(selectors, 'loading');
    const data = await fetchData({ skipHistorical: false });
    dashboardState.rawRecords = Array.isArray(data?.records) ? data.records : [];
    await render();
    setStatus(selectors, 'ready');
  } catch (error) {
    console.error('Nepavyko įkelti gydytojų puslapio:', error);
    setStatus(selectors, 'error', error?.message || TEXT.status.error);
  }
}
