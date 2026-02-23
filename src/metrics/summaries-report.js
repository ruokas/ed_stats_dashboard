import { getMetricLabelOverride } from './catalog-overrides.js';
import { getMetricById } from './index.js';

const SUMMARIES_REPORT_METRIC_MAP = {
  diagnosis: 'summaries.diagnosis',
  ageDiagnosisHeatmap: 'summaries.ageDiagnosisHeatmap',
  z769Trend: 'summaries.z769Trend',
  referralTrend: 'summaries.referralTrend',
  referralDispositionYearly: 'summaries.referralDispositionYearly',
  referralMonthlyHeatmap: 'summaries.referralMonthlyHeatmap',
  referralHospitalizedByPspc: 'summaries.referralHospitalizedByPspc',
  pspcCorrelation: 'summaries.pspcCorrelation',
  ageDistribution: 'summaries.ageDistribution',
  pspcDistribution: 'summaries.pspcDistribution',
};

/**
 * @param {string} reportKey
 * @param {Record<string, string>} fallbackCards
 * @param {Record<string, any>} [settings]
 */
export function getSummariesReportTitle(reportKey, fallbackCards = {}, settings = null) {
  const metricId = SUMMARIES_REPORT_METRIC_MAP[reportKey] || '';
  if (metricId) {
    const definition = getMetricById(metricId);
    const baseLabel = typeof definition?.label === 'string' ? definition.label : '';
    const overrideLabel = getMetricLabelOverride(settings, metricId, baseLabel);
    if (typeof overrideLabel === 'string' && overrideLabel.trim()) {
      return overrideLabel;
    }
  }
  const fallback = fallbackCards?.[reportKey];
  if (typeof fallback === 'string' && fallback.trim()) {
    return fallback;
  }
  return reportKey;
}
