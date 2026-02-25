function boolDefault(value) {
  return value === true;
}

export const FILTER_SCHEMAS = {
  kpi: {
    filters: {
      window: { type: 'number', queryKey: 'kw', min: 0, max: 366 },
      shift: { type: 'enum', queryKey: 'ks', allowed: ['all', 'day', 'night'] },
      arrival: { type: 'enum', queryKey: 'ka', allowed: ['all', 'ems', 'self'] },
      disposition: {
        type: 'enum',
        queryKey: 'kd',
        allowed: ['all', 'hospitalized', 'discharged'],
      },
      cardType: { type: 'enum', queryKey: 'kc', allowed: ['all', 't', 'tr', 'ch'] },
      selectedDate: { type: 'string', queryKey: 'kdt' },
    },
  },
  charts: {
    filters: {
      chartPeriod: { type: 'number', queryKey: 'cp', min: 0, max: 3660 },
      chartYear: { type: 'numberOrNull', queryKey: 'cy', min: 2000, max: 2100 },
      arrival: { type: 'enum', queryKey: 'ca', allowed: ['all', 'ems', 'self'] },
      disposition: {
        type: 'enum',
        queryKey: 'cd',
        allowed: ['all', 'hospitalized', 'discharged'],
      },
      cardType: { type: 'enum', queryKey: 'ct', allowed: ['all', 't', 'tr', 'ch'] },
      compareGmp: { type: 'boolean', queryKey: 'cg', default: boolDefault },
      heatmapMetric: {
        type: 'enum',
        queryKey: 'hm',
        allowed: ['arrivals', 'discharges', 'hospitalized', 'avgDuration'],
      },
      heatmapArrival: { type: 'enum', queryKey: 'ha', allowed: ['all', 'ems', 'self'] },
      heatmapDisposition: {
        type: 'enum',
        queryKey: 'hd',
        allowed: ['all', 'hospitalized', 'discharged'],
      },
      heatmapCardType: { type: 'enum', queryKey: 'hc', allowed: ['all', 't', 'tr', 'ch'] },
      heatmapYear: { type: 'numberOrNull', queryKey: 'hy', min: 2000, max: 2100 },
      hourlyWeekday: { type: 'string', queryKey: 'hw' },
      hourlyStayBucket: { type: 'string', queryKey: 'hs' },
      hourlyMetric: { type: 'string', queryKey: 'hmt' },
      hourlyDepartment: { type: 'string', queryKey: 'hmd' },
      hourlyCompareEnabled: { type: 'boolean', queryKey: 'hce', default: boolDefault },
      hourlyCompareYearA: { type: 'numberOrNull', queryKey: 'hya', min: 2000, max: 2100 },
      hourlyCompareYearB: { type: 'numberOrNull', queryKey: 'hyb', min: 2000, max: 2100 },
      hourlyCompareSeries: { type: 'string', queryKey: 'hys' },
      hospitalYear: { type: 'string', queryKey: 'hty' },
      hospitalSort: { type: 'string', queryKey: 'hts' },
      hospitalSearch: { type: 'string', queryKey: 'htq' },
      hospitalDepartment: { type: 'string', queryKey: 'htd' },
    },
  },
  feedback: {
    filters: {
      respondent: { type: 'string', queryKey: 'fr' },
      location: { type: 'string', queryKey: 'fl' },
      trendWindow: { type: 'numberOrNull', queryKey: 'ftw', min: 1, max: 60 },
      trendMetrics: { type: 'csv', queryKey: 'ftm' },
      trendCompareMode: { type: 'string', queryKey: 'ftc' },
    },
  },
  summaries: {
    filters: {
      year: { type: 'string', queryKey: 'sry' },
      topN: { type: 'number', queryKey: 'srt', min: 1, max: 200 },
      minGroup: { type: 'number', queryKey: 'srm', min: 1, max: 9999 },
      pspcSort: { type: 'string', queryKey: 'srps' },
      pspcMode: { type: 'string', queryKey: 'srpm' },
      pspcTrend: { type: 'string', queryKey: 'srpp' },
    },
  },
  gydytojai: {
    filters: {
      year: { type: 'string', queryKey: 'y' },
      topN: { type: 'number', queryKey: 'top', min: 1, max: 200 },
      minCases: { type: 'number', queryKey: 'min', min: 1, max: 5000 },
      sort: { type: 'string', queryKey: 'sort' },
      arrival: { type: 'enum', queryKey: 'arr', allowed: ['all', 'ems', 'self'] },
      disposition: {
        type: 'enum',
        queryKey: 'disp',
        allowed: ['all', 'hospitalized', 'discharged'],
      },
      shift: { type: 'enum', queryKey: 'shift', allowed: ['all', 'day', 'night'] },
      specialty: { type: 'string', queryKey: 'sp' },
      search: { type: 'string', queryKey: 'q' },
      tableSort: { type: 'string', queryKey: 'tsort' },
      annualMetric: { type: 'string', queryKey: 'am' },
      annualSort: { type: 'string', queryKey: 'as' },
      annualDoctors: { type: 'csv', queryKey: 'ad' },
      specialtyAnnualMetric: { type: 'string', queryKey: 'sam' },
      specialtyAnnualSort: { type: 'string', queryKey: 'sas' },
      specialtyAnnualSelected: { type: 'csv', queryKey: 'sase' },
      gydytojaiAnnualSubview: { type: 'string', queryKey: 'ga' },
      gydytojaiFiltersAdvancedExpanded: { type: 'boolean', queryKey: 'gfa' },
      gydytojaiSectionExpanded: { type: 'csv', queryKey: 'gse' },
    },
  },
};

export function getFilterSchema(pageId) {
  return FILTER_SCHEMAS[pageId] || null;
}
