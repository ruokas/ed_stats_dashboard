import { describe, expect, it, vi } from 'vitest';

import { createChartsHospitalTableFeature } from '../../src/app/runtime/runtimes/charts/hospital-table.js';

function createRow(index) {
  return {
    department: `Skyrius ${String(index).padStart(3, '0')}`,
    count_lt4: 1,
    count_4_8: 1,
    count_8_16: 1,
    count_gt16: 1,
    count_unclassified: 0,
    total: 4,
    pct_lt4: 25,
    pct_4_8: 25,
    pct_8_16: 25,
    pct_gt16: 25,
    pct_unclassified: 0,
  };
}

function createFeatureEnv({ rows = [createRow(1)] } = {}) {
  document.body.innerHTML = `
    <table>
      <tbody id="chartsHospitalTableBody"></tbody>
    </table>
    <select id="chartsHospitalTableYear"></select>
    <div id="chartsHospitalDeptTrendEmpty"></div>
    <canvas id="chartsHospitalDeptTrendCanvas"></canvas>
    <div id="chartsHospitalDeptTrendSubtitle"></div>
  `;
  const selectors = {
    chartsHospitalTableBody: document.getElementById('chartsHospitalTableBody'),
    chartsHospitalTableYear: document.getElementById('chartsHospitalTableYear'),
    chartsHospitalDeptTrendEmpty: document.getElementById('chartsHospitalDeptTrendEmpty'),
    chartsHospitalDeptTrendCanvas: document.getElementById('chartsHospitalDeptTrendCanvas'),
    chartsHospitalDeptTrendSubtitle: document.getElementById('chartsHospitalDeptTrendSubtitle'),
    chartsHospitalSortableHeaders: [],
    chartsHospitalTableCaption: null,
  };
  const computeHospitalizedByDepartmentAndSpsStay = vi.fn(() => ({
    rows,
    totals: rows.reduce(
      (acc, row) => ({
        count_lt4: acc.count_lt4 + Number(row.count_lt4 || 0),
        count_4_8: acc.count_4_8 + Number(row.count_4_8 || 0),
        count_8_16: acc.count_8_16 + Number(row.count_8_16 || 0),
        count_gt16: acc.count_gt16 + Number(row.count_gt16 || 0),
        count_unclassified: acc.count_unclassified + Number(row.count_unclassified || 0),
        total: acc.total + Number(row.total || 0),
      }),
      { count_lt4: 0, count_4_8: 0, count_8_16: 0, count_gt16: 0, count_unclassified: 0, total: 0 }
    ),
    yearOptions: [2024],
  }));
  const loadChartJs = vi.fn(async () => null);
  const dashboardState = {
    rawRecords: [{ id: 1 }],
    chartsSectionRenderFlags: { hospitalVisible: true },
    chartsHospitalTableSort: 'total_desc',
    chartsHospitalTableYear: 'all',
    chartsHospitalTableSearch: '',
    chartsHospitalTableDepartment: '',
  };
  const feature = createChartsHospitalTableFeature({
    selectors,
    dashboardState,
    TEXT: { charts: { hospitalTable: {} } },
    settings: { calculations: { shiftStartHour: 7 } },
    DEFAULT_SETTINGS: { calculations: { shiftStartHour: 7 } },
    textCollator: new Intl.Collator('lt'),
    numberFormatter: new Intl.NumberFormat('lt-LT'),
    oneDecimalFormatter: new Intl.NumberFormat('lt-LT', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
    setDatasetValue: (element, name, value) => element.setAttribute(`data-${name}`, value),
    getDatasetValue: (element, name, fallback = '') => element.getAttribute(`data-${name}`) || fallback,
    computeHospitalizedByDepartmentAndSpsStay,
    computeHospitalizedDepartmentYearlyStayTrend: () => ({ rows: [] }),
    loadChartJs,
    getThemePalette: () => ({}),
    persistChartsQuery: vi.fn(),
  });
  return { feature, selectors, dashboardState, loadChartJs };
}

describe('charts hospital table runtime', () => {
  it('does not refresh department trend on year change when no department is selected', () => {
    const { feature, loadChartJs } = createFeatureEnv();
    feature.handleChartsHospitalTableYearChange({ target: { value: '2024' } });
    expect(loadChartJs).toHaveBeenCalledTimes(0);
  });

  it('renders large tables in animation-frame chunks and appends summary at the end', () => {
    const rafQueue = [];
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      rafQueue.push(callback);
      return rafQueue.length;
    });
    const rows = Array.from({ length: 200 }, (_unused, index) => createRow(index));
    const { feature, selectors } = createFeatureEnv({ rows });
    try {
      feature.renderChartsHospitalTable([{ id: 1 }], { force: true });
      expect(selectors.chartsHospitalTableBody.children).toHaveLength(0);

      while (rafQueue.length) {
        const callback = rafQueue.shift();
        callback();
      }

      expect(selectors.chartsHospitalTableBody.children).toHaveLength(rows.length + 1);
      expect(
        selectors.chartsHospitalTableBody.lastElementChild?.classList.contains('table-row--summary')
      ).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
