export function createChartsSectionDisclosureFeature({
  selectors,
  dashboardState,
  chartsSectionKeys,
  defaultChartsSectionsExpanded,
  ensureChartsDisclosure,
}) {
  let scheduleChartsSecondaryRender = null;
  let renderChartsHospitalTable = null;

  const setScheduleChartsSecondaryRender = (handler) => {
    scheduleChartsSecondaryRender = typeof handler === 'function' ? handler : null;
  };
  const setRenderChartsHospitalTable = (handler) => {
    renderChartsHospitalTable = typeof handler === 'function' ? handler : null;
  };

  const markChartsSectionVisible = (section, { scheduleSecondary = false, reason = 'interaction' } = {}) => {
    const key =
      section === 'heatmap'
        ? 'heatmapVisible'
        : section === 'hourly'
          ? 'hourlyVisible'
          : section === 'hospital'
            ? 'hospitalVisible'
            : null;
    if (!key) {
      return false;
    }
    const previousFlags = dashboardState.chartsSectionRenderFlags || {};
    const changed = !previousFlags[key];
    if (changed) {
      dashboardState.chartsSectionRenderFlags = {
        ...previousFlags,
        [key]: true,
      };
    }
    if (
      (section === 'heatmap' || section === 'hourly') &&
      dashboardState.chartsSecondaryVisibilityObserver &&
      dashboardState.chartsSectionRenderFlags?.heatmapVisible &&
      dashboardState.chartsSectionRenderFlags?.hourlyVisible
    ) {
      dashboardState.chartsSecondaryVisibilityObserver.disconnect();
      dashboardState.chartsSecondaryVisibilityObserver = null;
    }
    if (scheduleSecondary && scheduleChartsSecondaryRender) {
      scheduleChartsSecondaryRender({ reason });
    }
    return changed;
  };

  const applyChartsSectionDisclosure = ({ reason = 'state-sync', triggerRender = false } = {}) => {
    ensureChartsDisclosure();
    const sectionExpanded = dashboardState.chartsSectionsExpanded || defaultChartsSectionsExpanded;

    (Array.isArray(selectors?.chartsSectionPanels) ? selectors.chartsSectionPanels : []).forEach((panel) => {
      if (!(panel instanceof HTMLElement)) {
        return;
      }
      const key = String(panel.getAttribute('data-charts-section-panel') || '').trim();
      if (!chartsSectionKeys.includes(key)) {
        return;
      }
      panel.hidden = sectionExpanded[key] !== true;
    });
    (Array.isArray(selectors?.chartsSectionToggleButtons)
      ? selectors.chartsSectionToggleButtons
      : []
    ).forEach((button) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      const key = String(button.getAttribute('data-charts-section-toggle') || '').trim();
      if (!chartsSectionKeys.includes(key)) {
        return;
      }
      const expanded = sectionExpanded[key] === true;
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      button.classList.toggle('is-expanded', expanded);
    });

    if (!triggerRender) {
      return;
    }
    if (sectionExpanded.hospital === true) {
      dashboardState.chartsSectionRenderFlags = {
        ...(dashboardState.chartsSectionRenderFlags || {}),
        hospitalVisible: true,
      };
      if (
        renderChartsHospitalTable &&
        Array.isArray(dashboardState.rawRecords) &&
        dashboardState.rawRecords.length
      ) {
        renderChartsHospitalTable(dashboardState.rawRecords, { force: true });
      }
    }
    const shouldRenderHourly = sectionExpanded.hourly === true;
    const shouldRenderHeatmap = sectionExpanded.heatmap === true;
    let shouldScheduleSecondary = false;
    if (shouldRenderHourly) {
      shouldScheduleSecondary = markChartsSectionVisible('hourly') || shouldScheduleSecondary;
    }
    if (shouldRenderHeatmap) {
      shouldScheduleSecondary = markChartsSectionVisible('heatmap') || shouldScheduleSecondary;
    }
    if (shouldScheduleSecondary && scheduleChartsSecondaryRender) {
      scheduleChartsSecondaryRender({ reason });
    }
  };

  return {
    markChartsSectionVisible,
    applyChartsSectionDisclosure,
    setRenderChartsHospitalTable,
    setScheduleChartsSecondaryRender,
  };
}
