import { setSectionTitle } from './text-common.js';

export function applyKpiText({ selectors, TEXT }) {
  setSectionTitle(selectors.kpiHeading, TEXT.kpis.title);
  if (selectors.kpiSubtitle) {
    selectors.kpiSubtitle.textContent = TEXT.kpis.subtitle;
  }

  setSectionTitle(selectors.recentHeading, TEXT.recent.title);
  if (selectors.recentSubtitle) {
    selectors.recentSubtitle.textContent = TEXT.recent.subtitle;
  }
  if (selectors.recentCaption) {
    selectors.recentCaption.textContent = TEXT.recent.caption;
  }

  if (selectors.monthlyHeading) {
    setSectionTitle(selectors.monthlyHeading, TEXT.monthly.title);
  }
  if (selectors.monthlySubtitle) {
    selectors.monthlySubtitle.textContent = TEXT.monthly.subtitle;
  }
  if (selectors.monthlyCaption) {
    selectors.monthlyCaption.textContent = TEXT.monthly.caption;
  }

  if (selectors.yearlyHeading) {
    setSectionTitle(selectors.yearlyHeading, TEXT.yearly.title);
  }
  if (selectors.yearlySubtitle) {
    selectors.yearlySubtitle.textContent = TEXT.yearly.subtitle;
  }
  if (selectors.yearlyCaption) {
    selectors.yearlyCaption.textContent = TEXT.yearly.caption;
  }
}
