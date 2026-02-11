import { byId, byQuery, byQueryAllIn, byQueryIn, createPageShellSelectors } from '../helpers.js';

export function createKpiPageSelectors() {
  const main = byQuery('main.container');
  const sectionNav = byQuery('.section-nav');
  const kpiSection = byQuery('[data-section="kpi"]');
  const kpiFiltersForm = byId('kpiFiltersForm');
  const kpiHourlyControls = byQueryIn(kpiSection, '.kpi-hourly-controls');

  return {
    ...createPageShellSelectors({ sectionNav }),
    kpiHeading: byId('kpiHeading'),
    kpiSubtitle: byId('kpiSubtitle'),
    kpiDatePrev: byId('kpiDatePrev'),
    kpiDateInput: byId('kpiDateInput'),
    kpiDateNext: byId('kpiDateNext'),
    kpiDateClear: byId('kpiDateClear'),
    kpiSummary: byId('kpiSummary'),
    kpiGrid: byId('kpiGrid'),
    kpiControls: byQueryIn(kpiSection, '.kpi-controls'),
    kpiFiltersForm,
    kpiWindow: byId('kpiWindow'),
    kpiShift: byId('kpiShift'),
    kpiArrival: byId('kpiArrival'),
    kpiArrivalButtons: byQueryAllIn(kpiFiltersForm, '[data-kpi-arrival]'),
    kpiDisposition: byId('kpiDisposition'),
    kpiCardType: byId('kpiCardType'),
    kpiCardTypeButtons: byQueryAllIn(kpiFiltersForm, '[data-kpi-card-type]'),
    kpiFiltersReset: byId('kpiFiltersReset'),
    kpiFiltersToggle: byId('kpiFiltersToggle'),
    kpiActiveInfo: byId('kpiActiveFilters'),
    lastShiftHourlyChart: byId('lastShiftHourlyChart'),
    lastShiftHourlyContext: byId('lastShiftHourlyContext'),
    lastShiftHourlyLegend: byId('lastShiftHourlyLegend'),
    lastShiftHourlyMetricButtons: byQueryAllIn(kpiHourlyControls, '[data-last-shift-metric]'),
    tableDownloadButtons: byQueryAllIn(main, '[data-table-download]'),
  };
}
