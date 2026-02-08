export function createTextContentFeature(deps) {
  const {
    selectors,
    settings,
    TEXT,
    dashboardState,
    setDatasetValue,
    getDatasetValue,
    formatDailyCaption,
    updateChartsHospitalTableHeaderSortIndicators,
    syncHourlyMetricButtons,
    populateHourlyWeekdayOptions,
    populateHourlyStayOptions,
    syncHourlyDepartmentVisibility,
    updateHourlyCaption,
    populateHeatmapMetricOptions,
    updateHeatmapCaption,
    populateFeedbackFilterControls,
    syncFeedbackFilterControls,
    updateFeedbackFiltersSummary,
    updateFeedbackTrendSubtitle,
    syncFeedbackTrendControls,
    hideStatusNote,
    updateFullscreenControls,
  } = deps;

  function applyTextContent() {
    if (selectors.title) {
      selectors.title.textContent = TEXT.title;
    }
    const setSectionTitle = (heading, text) => {
      if (!heading) {
        return;
      }
      const textNode = heading.querySelector('.section-title__text');
      if (textNode) {
        textNode.textContent = text;
      } else {
        heading.textContent = text;
      }
    };
    if (selectors.tabOverview) {
      selectors.tabOverview.textContent = settings.output.tabOverviewLabel || TEXT.tabs.overview;
    }
    if (selectors.edNavButton) {
      const edNavLabel = settings.output.tabEdLabel || TEXT.tabs.ed;
      const openLabel = typeof TEXT.edToggle?.open === 'function'
        ? TEXT.edToggle.open(edNavLabel)
        : `Atidaryti ${edNavLabel}`;
      const closeLabel = typeof TEXT.edToggle?.close === 'function'
        ? TEXT.edToggle.close(edNavLabel)
        : `Uždaryti ${edNavLabel}`;
      setDatasetValue(selectors.edNavButton, 'panelLabel', edNavLabel);
      setDatasetValue(selectors.edNavButton, 'openLabel', openLabel);
      setDatasetValue(selectors.edNavButton, 'closeLabel', closeLabel);
      const isActive = dashboardState.activeTab === 'ed';
      const currentLabel = isActive ? closeLabel : openLabel;
      selectors.edNavButton.setAttribute('aria-label', currentLabel);
      selectors.edNavButton.title = currentLabel;
    }
    if (selectors.closeEdPanelBtn) {
      const overviewLabel = settings.output.tabOverviewLabel || TEXT.tabs.overview;
      const closeLabel = typeof TEXT.ed?.closeButton === 'function'
        ? TEXT.ed.closeButton(overviewLabel)
        : (TEXT.ed?.closeButton || 'Grįžti');
      selectors.closeEdPanelBtn.setAttribute('aria-label', closeLabel);
      selectors.closeEdPanelBtn.title = closeLabel;
      const labelSpan = selectors.closeEdPanelBtn.querySelector('span');
      if (labelSpan) {
        labelSpan.textContent = closeLabel;
      } else {
        selectors.closeEdPanelBtn.textContent = closeLabel;
      }
    }
    if (selectors.themeToggleBtn) {
      selectors.themeToggleBtn.setAttribute('aria-label', TEXT.theme.toggle);
      selectors.themeToggleBtn.title = `${TEXT.theme.toggle} (Ctrl+Shift+L)`;
    }
    updateFullscreenControls();
    setSectionTitle(selectors.kpiHeading, TEXT.kpis.title);
    if (selectors.kpiSubtitle) {
      selectors.kpiSubtitle.textContent = TEXT.kpis.subtitle;
    }
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
    setSectionTitle(selectors.chartsHospitalTableHeading, hospitalTableText.title || 'Stacionarizuoti pacientai pagal skyrių ir SPS trukmę');
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
      selectors.chartsHospitalDeptTrendTitle.textContent = hospitalTableText.trendTitle || 'Skyriaus dinamika per metus';
    }
    if (selectors.chartsHospitalDeptTrendSubtitle) {
      selectors.chartsHospitalDeptTrendSubtitle.textContent = hospitalTableText.trendSubtitle || '';
    }
    if (selectors.chartsHospitalDeptTrendEmpty) {
      selectors.chartsHospitalDeptTrendEmpty.textContent = hospitalTableText.trendEmpty || 'Šiam skyriui nepakanka duomenų metinei dinamikai.';
    }
    if (selectors.chartsHospitalTableYearLabel) {
      selectors.chartsHospitalTableYearLabel.textContent = hospitalTableText.yearFilterLabel || 'Metai';
    }
    if (selectors.chartsHospitalTableSearchLabel) {
      selectors.chartsHospitalTableSearchLabel.textContent = hospitalTableText.searchLabel || 'Skyriaus paieška';
    }
    if (selectors.chartsHospitalTableSearch) {
      const placeholder = hospitalTableText.searchPlaceholder || 'Įveskite skyriaus pavadinimą';
      selectors.chartsHospitalTableSearch.placeholder = placeholder;
      selectors.chartsHospitalTableSearch.setAttribute('aria-label', placeholder);
      selectors.chartsHospitalTableSearch.title = placeholder;
    }
    if (selectors.chartsHospitalTableRoot && hospitalTableText.columns) {
      const headers = selectors.chartsHospitalTableRoot.querySelectorAll('thead th');
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
      dashboardState.hourlyDepartment,
    );
    const funnelCaptionText = typeof TEXT.charts.funnelCaptionWithYear === 'function'
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
    setSectionTitle(selectors.feedbackHeading, TEXT.feedback.title);
    if (selectors.feedbackSubtitle) {
      selectors.feedbackSubtitle.textContent = TEXT.feedback.subtitle;
    }
    if (selectors.feedbackDescription) {
      selectors.feedbackDescription.textContent = TEXT.feedback.description;
    }
    const feedbackFiltersText = TEXT.feedback?.filters || {};
    if (selectors.feedbackRespondentLabel) {
      selectors.feedbackRespondentLabel.textContent = feedbackFiltersText.respondent?.label || 'Kas pildo anketą';
    }
    if (selectors.feedbackLocationLabel) {
      selectors.feedbackLocationLabel.textContent = feedbackFiltersText.location?.label || 'Šaltinis';
    }
    populateFeedbackFilterControls();
    syncFeedbackFilterControls();
    updateFeedbackFiltersSummary();
    if (selectors.feedbackTrendTitle) {
      selectors.feedbackTrendTitle.textContent = TEXT.feedback.trend.title;
    }
    updateFeedbackTrendSubtitle();
    if (selectors.feedbackTrendControlsLabel) {
      selectors.feedbackTrendControlsLabel.textContent = TEXT.feedback.trend.controlsLabel;
    }
    if (selectors.feedbackTrendButtons && selectors.feedbackTrendButtons.length) {
      const periodConfig = Array.isArray(TEXT.feedback.trend.periods) ? TEXT.feedback.trend.periods : [];
      selectors.feedbackTrendButtons.forEach((button) => {
        const months = Number.parseInt(getDatasetValue(button, 'trendMonths', ''), 10);
        const config = periodConfig.find((item) => Number.parseInt(item?.months, 10) === months);
        if (config?.label) {
          button.textContent = config.label;
        }
        if (config?.hint) {
          button.title = config.hint;
        } else {
          button.removeAttribute('title');
        }
      });
    }
    syncFeedbackTrendControls();
    if (selectors.feedbackCaption) {
      selectors.feedbackCaption.textContent = TEXT.feedback.table.caption;
    }
    if (selectors.feedbackColumnMonth) {
      selectors.feedbackColumnMonth.textContent = TEXT.feedback.table.headers.month;
    }
    if (selectors.feedbackColumnResponses) {
      selectors.feedbackColumnResponses.textContent = TEXT.feedback.table.headers.responses;
    }
    if (selectors.feedbackColumnOverall) {
      selectors.feedbackColumnOverall.textContent = TEXT.feedback.table.headers.overall;
    }
    if (selectors.feedbackColumnDoctors) {
      selectors.feedbackColumnDoctors.textContent = TEXT.feedback.table.headers.doctors;
    }
    if (selectors.feedbackColumnNurses) {
      selectors.feedbackColumnNurses.textContent = TEXT.feedback.table.headers.nurses;
    }
    if (selectors.feedbackColumnAides) {
      selectors.feedbackColumnAides.textContent = TEXT.feedback.table.headers.aides;
    }
    if (selectors.feedbackColumnWaiting) {
      selectors.feedbackColumnWaiting.textContent = TEXT.feedback.table.headers.waiting;
    }
    if (selectors.feedbackColumnContact) {
      selectors.feedbackColumnContact.textContent = TEXT.feedback.table.headers.contact;
    }
    if (selectors.edHeading) {
      setSectionTitle(selectors.edHeading, settings.output.edTitle || TEXT.ed.title);
    }
    if (selectors.edStatus) {
      selectors.edStatus.textContent = '';
      setDatasetValue(selectors.edStatus, 'tone', 'info');
    }
    if (selectors.compareToggle) {
      selectors.compareToggle.textContent = TEXT.compare.toggle;
    }
    if (selectors.scrollTopBtn) {
      selectors.scrollTopBtn.textContent = TEXT.scrollTop;
      selectors.scrollTopBtn.setAttribute('aria-label', TEXT.scrollTop);
      selectors.scrollTopBtn.title = `${TEXT.scrollTop} (Home)`;
    }
    if (selectors.compareSummary) {
      selectors.compareSummary.textContent = TEXT.compare.prompt;
    }
    hideStatusNote();
  }

  return {
    applyTextContent,
  };
}
