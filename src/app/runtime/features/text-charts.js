import { setSectionTitle } from './text-common.js';

export function applyChartsText({
  selectors,
  TEXT,
  dashboardState,
  formatDailyCaption,
  updateChartsHospitalTableHeaderSortIndicators,
  syncHourlyMetricButtons,
  populateHourlyWeekdayOptions,
  populateHourlyStayOptions,
  syncHourlyDepartmentVisibility,
  updateHourlyCaption,
  populateHeatmapMetricOptions,
  updateHeatmapCaption,
}) {
  setSectionTitle(selectors.chartHeading, TEXT.charts.title);
  if (selectors.chartSubtitle) {
    selectors.chartSubtitle.textContent = TEXT.charts.subtitle;
  }
  if (selectors.chartYearLabel) {
    selectors.chartYearLabel.textContent = TEXT.charts.yearFilterLabel;
  }
  if (selectors.chartYearSelect) {
    const firstOption = selectors.chartYearSelect.querySelector('option[value="all"]');
    if (firstOption) {
      firstOption.textContent = TEXT.charts.yearFilterAll;
    }
  }
  if (selectors.dailyCaption) {
    selectors.dailyCaption.textContent = formatDailyCaption(dashboardState.chartPeriod);
  }

  const hospitalTableText = TEXT?.charts?.hospitalTable || {};
  setSectionTitle(
    selectors.chartsHospitalTableHeading,
    hospitalTableText.title || 'Stacionarizuoti pacientai pagal skyrių ir SPS trukmę'
  );
  if (selectors.chartsHospitalTableSubtitle) {
    selectors.chartsHospitalTableSubtitle.textContent = hospitalTableText.subtitle || '';
  }
  if (selectors.chartsHospitalTableCaption) {
    selectors.chartsHospitalTableCaption.textContent = hospitalTableText.caption || '';
  }
  if (selectors.chartsHospitalTableHint) {
    selectors.chartsHospitalTableHint.textContent = hospitalTableText.hint || '';
  }
  if (selectors.chartsHospitalDeptTrendTitle) {
    selectors.chartsHospitalDeptTrendTitle.textContent =
      hospitalTableText.trendTitle || 'Skyriaus dinamika per metus';
  }
  if (selectors.chartsHospitalDeptTrendSubtitle) {
    selectors.chartsHospitalDeptTrendSubtitle.textContent = hospitalTableText.trendSubtitle || '';
  }
  if (selectors.chartsHospitalDeptTrendEmpty) {
    selectors.chartsHospitalDeptTrendEmpty.textContent =
      hospitalTableText.trendEmpty || 'Šiam skyriui nepakanka duomenų metinei dinamikai.';
  }
  if (selectors.chartsHospitalTableYearLabel) {
    selectors.chartsHospitalTableYearLabel.textContent = hospitalTableText.yearFilterLabel || 'Metai';
  }
  if (selectors.chartsHospitalTableSearchLabel) {
    selectors.chartsHospitalTableSearchLabel.textContent =
      hospitalTableText.searchLabel || 'Skyriaus paieška';
  }
  if (selectors.chartsHospitalTableSearch) {
    const placeholder = hospitalTableText.searchPlaceholder || 'Įveskite skyriaus pavadinimą';
    selectors.chartsHospitalTableSearch.placeholder = placeholder;
    selectors.chartsHospitalTableSearch.setAttribute('aria-label', placeholder);
    selectors.chartsHospitalTableSearch.title = placeholder;
  }
  if (selectors.chartsHospitalTableRoot && hospitalTableText.columns) {
    const headers = Array.isArray(selectors.chartsHospitalTableHeaders)
      ? selectors.chartsHospitalTableHeaders
      : [];
    const columns = hospitalTableText.columns;
    const values = [
      columns.department,
      columns.lt4,
      columns.from4to8,
      columns.from8to16,
      columns.gt16,
      columns.unclassified,
      columns.total,
    ];
    headers.forEach((header, index) => {
      const label = values[index];
      if (header && typeof label === 'string' && label.trim()) {
        header.textContent = label;
      }
    });
  }
  updateChartsHospitalTableHeaderSortIndicators();

  if (selectors.dailyCaptionContext) {
    selectors.dailyCaptionContext.textContent = '';
  }
  if (selectors.dowCaption) {
    selectors.dowCaption.textContent = TEXT.charts.dowCaption;
  }
  if (selectors.dowStayCaption) {
    selectors.dowStayCaption.textContent = TEXT.charts.dowStayCaption;
  }

  if (selectors.hourlyWeekdayLabel) {
    const hourlyLabelText = TEXT.charts?.hourlyWeekdayLabel || 'Savaitės diena';
    selectors.hourlyWeekdayLabel.textContent = hourlyLabelText;
    if (selectors.hourlyWeekdaySelect) {
      selectors.hourlyWeekdaySelect.setAttribute('aria-label', hourlyLabelText);
      selectors.hourlyWeekdaySelect.title = hourlyLabelText;
    }
  }
  if (selectors.hourlyMetricLabel) {
    syncHourlyMetricButtons();
  }
  if (selectors.hourlyDepartmentLabel) {
    const departmentLabelText = TEXT.charts?.hourlyDepartmentLabel || 'Skyrius';
    selectors.hourlyDepartmentLabel.textContent = departmentLabelText;
    if (selectors.hourlyDepartmentInput) {
      selectors.hourlyDepartmentInput.setAttribute('aria-label', departmentLabelText);
      selectors.hourlyDepartmentInput.title = departmentLabelText;
      selectors.hourlyDepartmentInput.placeholder = TEXT.charts?.hourlyDepartmentAll || 'Visi skyriai';
    }
  }
  if (selectors.hourlyStayLabel) {
    const stayLabelText = TEXT.charts?.hourlyStayLabel || 'Buvimo trukmė';
    selectors.hourlyStayLabel.textContent = stayLabelText;
    if (selectors.hourlyStaySelect) {
      selectors.hourlyStaySelect.setAttribute('aria-label', stayLabelText);
      selectors.hourlyStaySelect.title = stayLabelText;
    }
  }

  populateHourlyWeekdayOptions();
  populateHourlyStayOptions();
  syncHourlyDepartmentVisibility(dashboardState.hourlyMetric);
  updateHourlyCaption(
    dashboardState.hourlyWeekday,
    dashboardState.hourlyStayBucket,
    dashboardState.hourlyMetric,
    dashboardState.hourlyDepartment
  );

  const funnelCaptionText =
    typeof TEXT.charts.funnelCaptionWithYear === 'function'
      ? TEXT.charts.funnelCaptionWithYear(null)
      : TEXT.charts.funnelCaption;
  if (selectors.funnelCaption) {
    selectors.funnelCaption.textContent = funnelCaptionText;
  }

  if (selectors.heatmapMetricLabel) {
    const heatmapLabelText = TEXT.charts?.heatmapMetricLabel || 'Rodiklis';
    selectors.heatmapMetricLabel.textContent = heatmapLabelText;
    if (selectors.heatmapMetricSelect) {
      selectors.heatmapMetricSelect.setAttribute('aria-label', heatmapLabelText);
      selectors.heatmapMetricSelect.title = `${heatmapLabelText} (Ctrl+Shift+H)`;
    }
  }
  if (selectors.heatmapFilterArrival) {
    selectors.heatmapFilterArrival.setAttribute('aria-label', 'Atvykimas');
  }
  if (selectors.heatmapFilterDisposition) {
    selectors.heatmapFilterDisposition.setAttribute('aria-label', 'Sprendimas');
  }
  if (selectors.heatmapFilterCardType) {
    selectors.heatmapFilterCardType.setAttribute('aria-label', 'Kortelė');
  }
  if (selectors.heatmapYearSelect) {
    selectors.heatmapYearSelect.setAttribute('aria-label', 'Metai');
  }
  populateHeatmapMetricOptions();
  updateHeatmapCaption(dashboardState.heatmapMetric);
}
