export const PAGE_FILE_BY_ID = {
  kpi: 'index.html',
  charts: 'charts.html',
  recent: 'recent.html',
  summaries: 'summaries.html',
  gydytojai: 'gydytojai.html',
  feedback: 'feedback.html',
  ed: 'ed.html',
};

export const SECTION_ROUTE_REGISTRY = [
  { id: 'kpi-overview', pageId: 'kpi', anchorId: 'kpiHeading', label: 'Pagrindiniai rodikliai' },
  { id: 'charts-overview', pageId: 'charts', anchorId: 'chartHeading', label: 'Grafikų apžvalga' },
  { id: 'charts-hourly', pageId: 'charts', anchorId: 'chartsHourlyHeading', label: 'Valandinis profilis' },
  {
    id: 'charts-heatmap',
    pageId: 'charts',
    anchorId: 'chartsHeatmapHeading',
    label: 'Intensyvumo žemėlapis',
    aliases: ['heatmap'],
  },
  {
    id: 'charts-hospital-table',
    pageId: 'charts',
    anchorId: 'chartsHospitalTableHeading',
    label: 'Hospitalizacijų analizė',
    aliases: ['stacionarizacijos', 'skyriu lentele'],
  },
  { id: 'recent-main', pageId: 'recent', anchorId: 'recentHeading', label: 'Paskutinės dienos' },
  { id: 'summaries-yearly', pageId: 'summaries', anchorId: 'yearlyHeading', label: 'Metinė suvestinė' },
  {
    id: 'summaries-reports',
    pageId: 'summaries',
    anchorId: 'summariesReportsHeading',
    label: 'Papildomų duomenų ataskaitos',
    aliases: ['ataskaitos'],
  },
  {
    id: 'summaries-clinical',
    pageId: 'summaries',
    anchorId: 'summariesGroupClinicalHeading',
    label: 'Klinikinė apžvalga',
  },
  {
    id: 'summaries-referral',
    pageId: 'summaries',
    anchorId: 'summariesGroupReferralHeading',
    label: 'Siuntimai ir baigtys',
  },
  { id: 'summaries-pspc', pageId: 'summaries', anchorId: 'summariesGroupPspcHeading', label: 'PSPC analizė' },
  { id: 'doctors-overview', pageId: 'gydytojai', anchorId: 'gydytojaiHeading', label: 'Gydytojų apžvalga' },
  {
    id: 'doctors-tables',
    pageId: 'gydytojai',
    anchorId: 'gydytojaiTablesHeading',
    label: 'Gydytojų lentelės',
  },
  {
    id: 'doctors-annual',
    pageId: 'gydytojai',
    anchorId: 'gydytojaiAnnualCombinedHeading',
    label: 'Metinė gydytojų dinamika',
  },
  {
    id: 'doctors-charts',
    pageId: 'gydytojai',
    anchorId: 'gydytojaiChartsHeading',
    label: 'Gydytojų grafikai',
  },
  { id: 'feedback-main', pageId: 'feedback', anchorId: 'feedbackHeading', label: 'Pacientų atsiliepimai' },
  { id: 'ed-main', pageId: 'ed', anchorId: 'edHeading', label: 'ED skydelis' },
];

export const SURFACE_ROUTE_MAP = {
  'kpi-card': { pageId: 'kpi', anchorId: 'kpiHeading' },
  heatmap: { pageId: 'charts', anchorId: 'chartsHeatmapHeading' },
  'recent-compare': { pageId: 'recent', anchorId: 'recentHeading' },
  'summaries-report-card': { pageId: 'summaries', anchorId: 'summariesReportsHeading' },
};

export const METRIC_SURFACE_ROUTE_PRIORITY = [
  'kpi-card',
  'heatmap',
  'recent-compare',
  'summaries-report-card',
];

export function buildPageHref(pageId, anchorId = '') {
  const file = PAGE_FILE_BY_ID[pageId] || PAGE_FILE_BY_ID.kpi;
  if (!anchorId) {
    return file;
  }
  return `${file}#${anchorId}`;
}

export function normalizePathnameToPageId(pathname) {
  const raw = String(pathname || '')
    .trim()
    .toLowerCase();
  if (!raw || raw === '/' || raw.endsWith('/index.html')) {
    return 'kpi';
  }
  const normalized = raw.endsWith('/') ? `${raw}index.html` : raw;
  const file = normalized.split('/').pop();
  const match = Object.entries(PAGE_FILE_BY_ID).find(([, pageFile]) => pageFile === file);
  return match?.[0] || 'kpi';
}
