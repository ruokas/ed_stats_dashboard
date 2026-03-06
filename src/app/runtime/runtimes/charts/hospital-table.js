import { createDebouncedHandler } from '../../filters/ui-sync.js';

export function createChartsHospitalTableFeature({
  selectors,
  dashboardState,
  TEXT,
  settings,
  DEFAULT_SETTINGS,
  textCollator,
  numberFormatter,
  oneDecimalFormatter,
  setDatasetValue,
  getDatasetValue,
  computeHospitalizedByDepartmentAndSpsStay,
  computeHospitalizedDepartmentYearlyStayTrend,
  loadChartJs,
  getThemePalette,
  persistChartsQuery,
}) {
  const normalizeChartsHospitalTableSort = (value) => {
    const normalized = String(value || '').trim();
    const allowed = [
      'total_desc',
      'total_asc',
      'name_asc',
      'name_desc',
      'lt4_desc',
      'lt4_asc',
      '4to8_desc',
      '4to8_asc',
      '8to16_desc',
      '8to16_asc',
      'gt16_desc',
      'gt16_asc',
      'unclassified_desc',
      'unclassified_asc',
    ];
    return allowed.includes(normalized) ? normalized : 'total_desc';
  };

  const getChartsHospitalSortParts = (sortValue) => {
    const normalized = normalizeChartsHospitalTableSort(sortValue);
    const match = normalized.match(/^(name|total|lt4|4to8|8to16|gt16|unclassified)_(asc|desc)$/);
    return match ? { key: match[1], dir: match[2] } : { key: 'total', dir: 'desc' };
  };

  const normalizeChartsHospitalTableDepartment = (value) => String(value || '').trim();

  const updateChartsHospitalTableHeaderSortIndicators = () => {
    const headers = Array.isArray(selectors.chartsHospitalSortableHeaders)
      ? selectors.chartsHospitalSortableHeaders
      : [];
    if (!headers.length) {
      return;
    }
    const current = getChartsHospitalSortParts(dashboardState.chartsHospitalTableSort);
    headers.forEach((header) => {
      const key = String(header.getAttribute('data-charts-hospital-sort') || '').trim();
      if (!key) {
        return;
      }
      const isActive = key === current.key;
      header.classList.toggle('is-sort-active', isActive);
      header.setAttribute(
        'aria-sort',
        isActive ? (current.dir === 'asc' ? 'ascending' : 'descending') : 'none'
      );
      const baseLabel = String(header.textContent || '')
        .replace(/\s*[↑↓]$/, '')
        .trim();
      header.textContent = isActive ? `${baseLabel} ${current.dir === 'asc' ? '↑' : '↓'}` : baseLabel;
    });
  };

  const sortChartsHospitalRows = (rows, sortValue) => {
    const list = Array.isArray(rows) ? rows.slice() : [];
    const { key, dir } = getChartsHospitalSortParts(sortValue);
    const mult = dir === 'asc' ? 1 : -1;
    const metricField = {
      total: 'total',
      lt4: 'count_lt4',
      '4to8': 'count_4_8',
      '8to16': 'count_8_16',
      gt16: 'count_gt16',
      unclassified: 'count_unclassified',
    }[key];
    list.sort((a, b) => {
      if (key === 'name') {
        return textCollator.compare(String(a?.department || ''), String(b?.department || '')) * mult;
      }
      const av = Number(a?.[metricField] || 0);
      const bv = Number(b?.[metricField] || 0);
      if (av !== bv) {
        return (av - bv) * mult;
      }
      return textCollator.compare(String(a?.department || ''), String(b?.department || ''));
    });
    return list;
  };

  const getChartsHospitalStatsFromWorkerAgg = (yearFilter = 'all') => {
    const agg = dashboardState.chartsHospitalTableWorkerAgg;
    const byYear = agg?.byYear && typeof agg.byYear === 'object' ? agg.byYear : null;
    if (!byYear) {
      return null;
    }
    const yearKeys = Object.keys(byYear).filter((key) => /^\d{4}$/.test(String(key)));
    const yearOptions = yearKeys
      .map((key) => Number.parseInt(String(key), 10))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => b - a);
    const selectedYear = yearFilter == null ? 'all' : String(yearFilter);
    const yearsToUse =
      selectedYear === 'all' ? yearKeys : yearKeys.includes(selectedYear) ? [selectedYear] : [];
    const buckets = new Map();
    yearsToUse.forEach((yearKey) => {
      const yearData = byYear[yearKey] && typeof byYear[yearKey] === 'object' ? byYear[yearKey] : {};
      Object.keys(yearData).forEach((departmentRaw) => {
        const department = String(departmentRaw || '').trim() || 'Nenurodyta';
        if (!buckets.has(department)) {
          buckets.set(department, {
            department,
            count_lt4: 0,
            count_4_8: 0,
            count_8_16: 0,
            count_gt16: 0,
            count_unclassified: 0,
            total: 0,
          });
        }
        const target = buckets.get(department);
        const src = yearData[departmentRaw] || {};
        target.count_lt4 += Number.isFinite(src.count_lt4) ? src.count_lt4 : 0;
        target.count_4_8 += Number.isFinite(src.count_4_8) ? src.count_4_8 : 0;
        target.count_8_16 += Number.isFinite(src.count_8_16) ? src.count_8_16 : 0;
        target.count_gt16 += Number.isFinite(src.count_gt16) ? src.count_gt16 : 0;
        target.count_unclassified += Number.isFinite(src.count_unclassified) ? src.count_unclassified : 0;
        target.total += Number.isFinite(src.total) ? src.total : 0;
      });
    });
    const rows = Array.from(buckets.values())
      .filter((row) => row.total > 0)
      .map((row) => ({
        ...row,
        pct_lt4: row.total > 0 ? (row.count_lt4 / row.total) * 100 : 0,
        pct_4_8: row.total > 0 ? (row.count_4_8 / row.total) * 100 : 0,
        pct_8_16: row.total > 0 ? (row.count_8_16 / row.total) * 100 : 0,
        pct_gt16: row.total > 0 ? (row.count_gt16 / row.total) * 100 : 0,
        pct_unclassified: row.total > 0 ? (row.count_unclassified / row.total) * 100 : 0,
      }));
    const totals = rows.reduce(
      (acc, row) => {
        acc.count_lt4 += row.count_lt4;
        acc.count_4_8 += row.count_4_8;
        acc.count_8_16 += row.count_8_16;
        acc.count_gt16 += row.count_gt16;
        acc.count_unclassified += row.count_unclassified;
        acc.total += row.total;
        return acc;
      },
      {
        count_lt4: 0,
        count_4_8: 0,
        count_8_16: 0,
        count_gt16: 0,
        count_unclassified: 0,
        total: 0,
      }
    );
    return {
      rows,
      totals,
      yearOptions,
      bucketOrder: ['lt4', '4to8', '8to16', 'gt16', 'unclassified'],
      meta: {
        totalHospitalized: totals.total,
        unclassifiedCount: totals.count_unclassified,
      },
    };
  };

  const getDepartmentTrendRowsFromWorkerAgg = (departmentRaw) => {
    const agg = dashboardState.chartsHospitalTableWorkerAgg;
    const byYear = agg?.byYear && typeof agg.byYear === 'object' ? agg.byYear : null;
    if (!byYear) {
      return [];
    }
    const department = normalizeChartsHospitalTableDepartment(departmentRaw);
    if (!department) {
      return [];
    }
    return Object.keys(byYear)
      .filter((key) => /^\d{4}$/.test(String(key)))
      .map((yearKey) => {
        const yearData = byYear[yearKey] && typeof byYear[yearKey] === 'object' ? byYear[yearKey] : {};
        const src = yearData[department] || null;
        if (!src) {
          return null;
        }
        const total = Number.isFinite(src.total) ? src.total : 0;
        if (total <= 0) {
          return null;
        }
        const count_lt4 = Number.isFinite(src.count_lt4) ? src.count_lt4 : 0;
        const count_4_8 = Number.isFinite(src.count_4_8) ? src.count_4_8 : 0;
        const count_8_16 = Number.isFinite(src.count_8_16) ? src.count_8_16 : 0;
        const count_gt16 = Number.isFinite(src.count_gt16) ? src.count_gt16 : 0;
        const count_unclassified = Number.isFinite(src.count_unclassified) ? src.count_unclassified : 0;
        return {
          year: Number.parseInt(yearKey, 10),
          total,
          count_lt4,
          count_4_8,
          count_8_16,
          count_gt16,
          count_unclassified,
          pct_lt4: total > 0 ? (count_lt4 / total) * 100 : 0,
          pct_4_8: total > 0 ? (count_4_8 / total) * 100 : 0,
          pct_8_16: total > 0 ? (count_8_16 / total) * 100 : 0,
          pct_gt16: total > 0 ? (count_gt16 / total) * 100 : 0,
          pct_unclassified: total > 0 ? (count_unclassified / total) * 100 : 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.year - b.year);
  };

  const getChartsHospitalCalcSignature = () => {
    try {
      return JSON.stringify(settings?.calculations || DEFAULT_SETTINGS.calculations || {});
    } catch (_error) {
      return '';
    }
  };

  const getCachedChartsHospitalPreparedRows = (records, yearFilter, searchQuery) => {
    const normalizedYear = yearFilter == null ? 'all' : String(yearFilter);
    const normalizedSearch = String(searchQuery || '')
      .trim()
      .toLocaleLowerCase('lt');
    const calcSignature = getChartsHospitalCalcSignature();
    const cache = dashboardState.chartsHospitalPreparedRowsCache || {};
    const key = `${normalizedYear}|${normalizedSearch}|${calcSignature}`;
    if (cache.recordsRef === records && cache.key === key && cache.value) {
      return cache.value;
    }
    const stats = buildChartsHospitalStats(records, normalizedYear);
    const rows = (Array.isArray(stats?.rows) ? stats.rows : []).filter(
      (row) =>
        !normalizedSearch ||
        String(row?.department || '')
          .toLocaleLowerCase('lt')
          .includes(normalizedSearch)
    );
    const value = { rows, totals: stats?.totals || {} };
    dashboardState.chartsHospitalPreparedRowsCache = {
      recordsRef: records,
      key,
      value,
    };
    return value;
  };

  const createHospitalTableRow = (entry) => {
    const row = document.createElement('tr');
    setDatasetValue(row, 'department', String(entry.department || ''));
    if (
      String(dashboardState.chartsHospitalTableDepartment || '').trim() ===
      String(entry.department || '').trim()
    ) {
      row.classList.add('is-department-active');
    }
    row.innerHTML = `
      <td>${entry.department || 'Nenurodyta'}</td>
      <td>${numberFormatter.format(Number(entry.count_lt4 || 0))} (${oneDecimalFormatter.format(Number(entry.pct_lt4 || 0))}%)</td>
      <td>${numberFormatter.format(Number(entry.count_4_8 || 0))} (${oneDecimalFormatter.format(Number(entry.pct_4_8 || 0))}%)</td>
      <td>${numberFormatter.format(Number(entry.count_8_16 || 0))} (${oneDecimalFormatter.format(Number(entry.pct_8_16 || 0))}%)</td>
      <td>${numberFormatter.format(Number(entry.count_gt16 || 0))} (${oneDecimalFormatter.format(Number(entry.pct_gt16 || 0))}%)</td>
      <td>${numberFormatter.format(Number(entry.count_unclassified || 0))} (${oneDecimalFormatter.format(Number(entry.pct_unclassified || 0))}%)</td>
      <td class="charts-hospital-total">${numberFormatter.format(Number(entry.total || 0))}</td>
    `;
    return row;
  };

  const createHospitalTableSummaryRow = (totals) => {
    const tableText = TEXT?.charts?.hospitalTable || {};
    const summaryRow = document.createElement('tr');
    summaryRow.className = 'table-row--summary';
    summaryRow.innerHTML = `
      <td>${tableText.totalLabel || 'Bendroji suma'}</td>
      <td>${numberFormatter.format(Number(totals.count_lt4 || 0))}</td>
      <td>${numberFormatter.format(Number(totals.count_4_8 || 0))}</td>
      <td>${numberFormatter.format(Number(totals.count_8_16 || 0))}</td>
      <td>${numberFormatter.format(Number(totals.count_gt16 || 0))}</td>
      <td>${numberFormatter.format(Number(totals.count_unclassified || 0))}</td>
      <td class="charts-hospital-total">${numberFormatter.format(Number(totals.total || 0))}</td>
    `;
    return summaryRow;
  };

  const renderHospitalRowsChunked = (rows, totals) => {
    if (!selectors.chartsHospitalTableBody) {
      return;
    }
    const body = selectors.chartsHospitalTableBody;
    const token = Number(dashboardState.chartsHospitalTableRenderToken || 0) + 1;
    dashboardState.chartsHospitalTableRenderToken = token;
    body.replaceChildren();
    const summaryRow = createHospitalTableSummaryRow(totals || {});
    const CHUNK_SIZE = 140;
    if (rows.length <= CHUNK_SIZE) {
      const fragment = document.createDocumentFragment();
      rows.forEach((entry) => {
        fragment.appendChild(createHospitalTableRow(entry));
      });
      body.appendChild(fragment);
      body.appendChild(summaryRow);
      return;
    }

    let index = 0;
    const scheduleNext =
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 0);
    const renderChunk = () => {
      if (dashboardState.chartsHospitalTableRenderToken !== token) {
        return;
      }
      const fragment = document.createDocumentFragment();
      const end = Math.min(index + CHUNK_SIZE, rows.length);
      for (let rowIndex = index; rowIndex < end; rowIndex += 1) {
        fragment.appendChild(createHospitalTableRow(rows[rowIndex]));
      }
      body.appendChild(fragment);
      index = end;
      if (index < rows.length) {
        scheduleNext(renderChunk);
        return;
      }
      body.appendChild(summaryRow);
    };
    scheduleNext(renderChunk);
  };

  const getCachedChartsHospitalStats = (records, yearFilter) => {
    const workerAggStats = getChartsHospitalStatsFromWorkerAgg(yearFilter);
    if (workerAggStats) {
      return workerAggStats;
    }
    const normalizedYear = yearFilter == null ? 'all' : String(yearFilter);
    const calcSignature = getChartsHospitalCalcSignature();
    const cache = dashboardState.chartsHospitalStatsCache || {};
    const key = `${normalizedYear}|${calcSignature}`;
    if (cache.recordsRef === records && cache.key === key && cache.value) {
      return cache.value;
    }
    const value = computeHospitalizedByDepartmentAndSpsStay(records, {
      yearFilter: normalizedYear,
      hospitalByDeptStayAgg:
        dashboardState.chartsHospitalLocalAggCache?.recordsRef === records
          ? dashboardState.chartsHospitalLocalAggCache.value
          : null,
      calculations: settings?.calculations || DEFAULT_SETTINGS.calculations,
      defaultSettings: DEFAULT_SETTINGS,
    });
    if (
      !dashboardState.chartsHospitalLocalAggCache ||
      dashboardState.chartsHospitalLocalAggCache.recordsRef !== records
    ) {
      dashboardState.chartsHospitalLocalAggCache = {
        recordsRef: records,
        value: value?.aggregate || null,
      };
    }
    dashboardState.chartsHospitalStatsCache = {
      recordsRef: records,
      key,
      value,
    };
    return value;
  };

  const getCachedChartsHospitalDepartmentTrendRows = (records, department) => {
    const workerRows = getDepartmentTrendRowsFromWorkerAgg(department);
    if (workerRows.length) {
      return workerRows;
    }
    const normalizedDepartment = normalizeChartsHospitalTableDepartment(department);
    if (!normalizedDepartment) {
      return [];
    }
    const calcSignature = getChartsHospitalCalcSignature();
    const cache = dashboardState.chartsHospitalDeptTrendRowsCache || {};
    const key = `${normalizedDepartment}|${calcSignature}`;
    if (cache.recordsRef === records && cache.key === key && Array.isArray(cache.rows)) {
      return cache.rows;
    }
    const trend = computeHospitalizedDepartmentYearlyStayTrend(records, {
      department: normalizedDepartment,
      hospitalByDeptStayAgg:
        dashboardState.chartsHospitalLocalAggCache?.recordsRef === records
          ? dashboardState.chartsHospitalLocalAggCache.value
          : null,
      calculations: settings?.calculations || DEFAULT_SETTINGS.calculations,
      defaultSettings: DEFAULT_SETTINGS,
    });
    const rows = Array.isArray(trend?.rows) ? trend.rows : [];
    dashboardState.chartsHospitalDeptTrendRowsCache = {
      recordsRef: records,
      key,
      rows,
    };
    return rows;
  };

  const buildChartsHospitalStats = (records, yearFilter) => getCachedChartsHospitalStats(records, yearFilter);

  const destroyChartsHospitalDeptTrendChart = () => {
    const existing = dashboardState.chartsHospitalDeptTrendChart;
    if (existing && typeof existing.destroy === 'function') {
      existing.destroy();
    }
    dashboardState.chartsHospitalDeptTrendChart = null;
    dashboardState.chartsHospitalDeptTrendKey = '';
  };

  const renderChartsHospitalDepartmentTrend = async (records = dashboardState.rawRecords) => {
    if (!selectors.chartsHospitalDeptTrendCanvas || !selectors.chartsHospitalDeptTrendEmpty) {
      return;
    }
    const hideTrendSkeleton = () => {
      const skeleton = document.getElementById('chartsHospitalDeptTrendSkeleton');
      if (skeleton instanceof HTMLElement) {
        skeleton.hidden = true;
      }
    };
    const department = normalizeChartsHospitalTableDepartment(dashboardState.chartsHospitalTableDepartment);
    if (!department) {
      destroyChartsHospitalDeptTrendChart();
      selectors.chartsHospitalDeptTrendCanvas.hidden = true;
      selectors.chartsHospitalDeptTrendEmpty.hidden = false;
      hideTrendSkeleton();
      if (selectors.chartsHospitalDeptTrendSubtitle) {
        selectors.chartsHospitalDeptTrendSubtitle.textContent =
          TEXT?.charts?.hospitalTable?.trendSubtitle ||
          'Pasirinkite skyriu lenteleje, kad matytumete jo SPS trukmes % dinamika pagal metus.';
      }
      return;
    }
    const rows = getCachedChartsHospitalDepartmentTrendRows(records, department);
    if (rows.length < 2) {
      destroyChartsHospitalDeptTrendChart();
      selectors.chartsHospitalDeptTrendCanvas.hidden = true;
      selectors.chartsHospitalDeptTrendEmpty.hidden = false;
      hideTrendSkeleton();
      if (selectors.chartsHospitalDeptTrendSubtitle) {
        selectors.chartsHospitalDeptTrendSubtitle.textContent = `${department} • nepakanka metu palyginimui`;
      }
      return;
    }
    const ChartLib = await loadChartJs();
    if (!ChartLib) {
      destroyChartsHospitalDeptTrendChart();
      selectors.chartsHospitalDeptTrendCanvas.hidden = true;
      selectors.chartsHospitalDeptTrendEmpty.hidden = false;
      hideTrendSkeleton();
      if (selectors.chartsHospitalDeptTrendSubtitle) {
        selectors.chartsHospitalDeptTrendSubtitle.textContent = `${department} • nepavyko ikelti grafiko bibliotekos`;
      }
      return;
    }
    const trendKey = `${department}|${rows.map((row) => `${row.year}:${row.total}:${row.count_lt4}:${row.count_4_8}:${row.count_8_16}:${row.count_gt16}:${row.count_unclassified}`).join(';')}`;
    if (
      dashboardState.chartsHospitalDeptTrendChart &&
      dashboardState.chartsHospitalDeptTrendKey === trendKey
    ) {
      selectors.chartsHospitalDeptTrendCanvas.hidden = false;
      selectors.chartsHospitalDeptTrendEmpty.hidden = true;
      hideTrendSkeleton();
      return;
    }
    if (selectors.chartsHospitalDeptTrendSubtitle) {
      selectors.chartsHospitalDeptTrendSubtitle.textContent = `${department} • 100% sudeties dinamika pagal metus`;
    }
    const palette = getThemePalette();
    const years = rows.map((row) => String(row.year));
    const datasetDefs = [
      { key: 'pct_lt4', countKey: 'count_lt4', label: '<4', color: palette?.accent || '#2563eb' },
      { key: 'pct_4_8', countKey: 'count_4_8', label: '4-8', color: '#0ea5e9' },
      { key: 'pct_8_16', countKey: 'count_8_16', label: '8-16', color: '#f59e0b' },
      { key: 'pct_gt16', countKey: 'count_gt16', label: '>16', color: '#ef4444' },
      { key: 'pct_unclassified', countKey: 'count_unclassified', label: 'Neklasifikuota', color: '#94a3b8' },
    ];
    const normalizedRows = rows.map((row) => {
      const values = {
        pct_lt4: Number(row?.pct_lt4 || 0),
        pct_4_8: Number(row?.pct_4_8 || 0),
        pct_8_16: Number(row?.pct_8_16 || 0),
        pct_gt16: Number(row?.pct_gt16 || 0),
        pct_unclassified: Number(row?.pct_unclassified || 0),
      };
      const sum =
        values.pct_lt4 + values.pct_4_8 + values.pct_8_16 + values.pct_gt16 + values.pct_unclassified;
      if (!(sum > 0)) {
        return { ...row, ...values };
      }
      const scale = 100 / sum;
      return {
        ...row,
        pct_lt4: values.pct_lt4 * scale,
        pct_4_8: values.pct_4_8 * scale,
        pct_8_16: values.pct_8_16 * scale,
        pct_gt16: values.pct_gt16 * scale,
        pct_unclassified: values.pct_unclassified * scale,
      };
    });
    const datasets = datasetDefs.map((def) => ({
      label: def.label,
      data: normalizedRows.map((row) => Number(row?.[def.key] || 0)),
      borderColor: def.color,
      backgroundColor: def.color,
      borderWidth: 0,
      stack: 'stay',
      _countKey: def.countKey,
    }));
    const config = {
      type: 'bar',
      data: {
        labels: years,
        datasets,
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 120,
        plugins: {
          legend: {
            labels: {
              color: palette?.textColor || '#111827',
            },
          },
          tooltip: {
            callbacks: {
              label(context) {
                const value = Number(context?.parsed?.y || 0);
                const yearIndex = Number(context?.dataIndex || 0);
                const sourceRow = rows[yearIndex] || {};
                const dataset = context?.dataset || {};
                const countKey = dataset._countKey;
                const count = Number(sourceRow?.[countKey] || 0);
                const total = Number(sourceRow?.total || 0);
                return `${dataset.label}: ${oneDecimalFormatter.format(value)}% (${numberFormatter.format(count)}/${numberFormatter.format(total)})`;
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            ticks: {
              color: palette?.textMuted || palette?.textColor || '#6b7280',
            },
            grid: {
              color: 'rgba(148, 163, 184, 0.24)',
            },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            max: 100,
            ticks: {
              color: palette?.textMuted || palette?.textColor || '#6b7280',
              callback: (value) => `${value}%`,
            },
            grid: {
              color: 'rgba(148, 163, 184, 0.24)',
            },
          },
        },
      },
    };
    const existing = dashboardState.chartsHospitalDeptTrendChart;
    const existingType = String(existing?.config?.type || existing?.constructor?.id || '');
    if (
      existing &&
      typeof existing.update === 'function' &&
      existing.canvas === selectors.chartsHospitalDeptTrendCanvas &&
      existingType === String(config.type)
    ) {
      existing.data = config.data;
      existing.options = config.options;
      existing.update('none');
    } else {
      if (existing && typeof existing.destroy === 'function') {
        existing.destroy();
      }
      const ctx = selectors.chartsHospitalDeptTrendCanvas.getContext('2d');
      if (!ctx) {
        return;
      }
      dashboardState.chartsHospitalDeptTrendChart = new ChartLib(ctx, config);
    }
    dashboardState.chartsHospitalDeptTrendKey = trendKey;
    selectors.chartsHospitalDeptTrendCanvas.hidden = false;
    selectors.chartsHospitalDeptTrendEmpty.hidden = true;
    hideTrendSkeleton();
  };

  const populateChartsHospitalTableYearOptions = (records) => {
    if (!selectors.chartsHospitalTableYear) {
      return;
    }
    const stats = buildChartsHospitalStats(records, 'all');
    const years = Array.isArray(stats?.yearOptions) ? stats.yearOptions : [];
    selectors.chartsHospitalTableYear.replaceChildren();
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = TEXT?.charts?.hospitalTable?.yearFilterAll || 'Visi metai';
    selectors.chartsHospitalTableYear.appendChild(allOption);
    years.forEach((year) => {
      const option = document.createElement('option');
      option.value = String(year);
      option.textContent = `${year} m.`;
      selectors.chartsHospitalTableYear.appendChild(option);
    });
    selectors.chartsHospitalTableYear.value = String(dashboardState.chartsHospitalTableYear ?? 'all');
  };

  const renderChartsHospitalTable = (records = dashboardState.rawRecords, options = {}) => {
    if (!selectors.chartsHospitalTableBody) {
      return;
    }
    const forceRender = options?.force === true;
    const isVisible = Boolean(dashboardState.chartsSectionRenderFlags?.hospitalVisible);
    if (!forceRender && !isVisible) {
      if (selectors.chartsHospitalTableCaption) {
        selectors.chartsHospitalTableCaption.textContent =
          TEXT?.charts?.hospitalTable?.caption || 'Lentelė bus įkelta priartėjus prie skyriaus.';
      }
      return;
    }
    dashboardState.chartsHospitalTableHasRendered = true;
    dashboardState.chartsStartupPhases = {
      ...(dashboardState.chartsStartupPhases || {}),
      hospitalRendered: true,
    };
    const yearFilter =
      dashboardState.chartsHospitalTableYear == null ? 'all' : dashboardState.chartsHospitalTableYear;
    const searchQuery = String(dashboardState.chartsHospitalTableSearch || '');
    const prepared = getCachedChartsHospitalPreparedRows(records, yearFilter, searchQuery);
    const tableText = TEXT?.charts?.hospitalTable || {};
    const rows = sortChartsHospitalRows(prepared?.rows, dashboardState.chartsHospitalTableSort);

    selectors.chartsHospitalTableBody.replaceChildren();
    if (!rows.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.textContent = tableText.empty || 'Pasirinktam laikotarpiui nera stacionarizaciju duomenu.';
      row.appendChild(cell);
      selectors.chartsHospitalTableBody.appendChild(row);
      updateChartsHospitalTableHeaderSortIndicators();
      if (options?.refreshTrend === true) {
        void renderChartsHospitalDepartmentTrend(records);
      }
      return;
    }
    renderHospitalRowsChunked(rows, prepared?.totals || {});
    updateChartsHospitalTableHeaderSortIndicators();
    if (options?.refreshTrend === true) {
      void renderChartsHospitalDepartmentTrend(records);
    }
  };

  const handleChartsHospitalTableYearChange = (event) => {
    dashboardState.chartsSectionRenderFlags = {
      ...(dashboardState.chartsSectionRenderFlags || {}),
      hospitalVisible: true,
    };
    const value = String(event?.target?.value || 'all');
    dashboardState.chartsHospitalTableYear = value === 'all' ? 'all' : Number.parseInt(value, 10);
    persistChartsQuery();
    renderChartsHospitalTable(dashboardState.rawRecords, {
      force: true,
      refreshTrend: Boolean(dashboardState.chartsHospitalTableDepartment),
    });
  };

  const handleChartsHospitalTableSearchInput = createDebouncedHandler((event) => {
    dashboardState.chartsSectionRenderFlags = {
      ...(dashboardState.chartsSectionRenderFlags || {}),
      hospitalVisible: true,
    };
    dashboardState.chartsHospitalTableSearch = String(event?.target?.value || '');
    persistChartsQuery();
    renderChartsHospitalTable(dashboardState.rawRecords, { force: true });
  }, 250);

  const handleChartsHospitalTableHeaderClick = (event) => {
    const target = event?.target;
    if (!(target instanceof Element)) {
      return;
    }
    const header = target.closest('th[data-charts-hospital-sort]');
    if (!header) {
      return;
    }
    dashboardState.chartsSectionRenderFlags = {
      ...(dashboardState.chartsSectionRenderFlags || {}),
      hospitalVisible: true,
    };
    const key = String(header.getAttribute('data-charts-hospital-sort') || '').trim();
    if (!key) {
      return;
    }
    const current = getChartsHospitalSortParts(dashboardState.chartsHospitalTableSort);
    const nextDir =
      current.key === key ? (current.dir === 'asc' ? 'desc' : 'asc') : key === 'name' ? 'asc' : 'desc';
    dashboardState.chartsHospitalTableSort = normalizeChartsHospitalTableSort(`${key}_${nextDir}`);
    persistChartsQuery();
    renderChartsHospitalTable(dashboardState.rawRecords, { force: true });
  };

  const handleChartsHospitalTableRowClick = (event) => {
    const target = event?.target;
    if (!(target instanceof Element)) {
      return;
    }
    dashboardState.chartsSectionRenderFlags = {
      ...(dashboardState.chartsSectionRenderFlags || {}),
      hospitalVisible: true,
    };
    const row = target.closest('tr[data-department]');
    if (!row) {
      return;
    }
    const department = String(getDatasetValue(row, 'department', '') || '').trim();
    if (!department) {
      return;
    }
    const current = normalizeChartsHospitalTableDepartment(dashboardState.chartsHospitalTableDepartment);
    dashboardState.chartsHospitalTableDepartment = current === department ? '' : department;
    persistChartsQuery();
    renderChartsHospitalTable(dashboardState.rawRecords, { force: true, refreshTrend: true });
  };

  return {
    updateChartsHospitalTableHeaderSortIndicators,
    populateChartsHospitalTableYearOptions,
    renderChartsHospitalTable,
    handleChartsHospitalTableYearChange,
    handleChartsHospitalTableSearchInput,
    handleChartsHospitalTableHeaderClick,
    handleChartsHospitalTableRowClick,
  };
}
