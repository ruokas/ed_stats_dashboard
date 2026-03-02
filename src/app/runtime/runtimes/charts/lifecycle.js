export function createChartsLifecycleFeature({
  selectors,
  dashboardState,
  runtimeClient,
  runAfterDomAndIdle,
  chartRenderers,
  computeHeatmapDataForFilters,
  renderChartsHospitalTable,
  markChartsSectionVisible,
}) {
  const dispatchChartsLifecycleEvent = (name, detail = {}) => {
    if (typeof window?.dispatchEvent !== 'function' || typeof window?.CustomEvent !== 'function') {
      return;
    }
    window.dispatchEvent(new CustomEvent(name, { detail }));
  };

  const markChartsPerfPoint = (name) => {
    if (typeof performance?.mark !== 'function') {
      return;
    }
    try {
      performance.mark(name);
    } catch (_error) {
      // ignore
    }
  };

  const ensureChartsHospitalVisibilityObserver = () => {
    if (!(selectors.chartsHospitalTableRoot instanceof HTMLElement)) {
      return;
    }
    if (dashboardState.chartsHospitalTableVisibilityObserver) {
      return;
    }
    if (typeof window.IntersectionObserver !== 'function') {
      dashboardState.chartsSectionRenderFlags = {
        ...(dashboardState.chartsSectionRenderFlags || {}),
        hospitalVisible: true,
      };
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0);
        if (!visible) {
          return;
        }
        dashboardState.chartsSectionRenderFlags = {
          ...(dashboardState.chartsSectionRenderFlags || {}),
          hospitalVisible: true,
        };
        renderChartsHospitalTable(dashboardState.rawRecords, { force: true });
        if (dashboardState.chartsHospitalTableVisibilityObserver) {
          dashboardState.chartsHospitalTableVisibilityObserver.disconnect();
          dashboardState.chartsHospitalTableVisibilityObserver = null;
        }
      },
      { root: null, rootMargin: '200px 0px', threshold: [0, 0.01] }
    );
    observer.observe(selectors.chartsHospitalTableRoot);
    dashboardState.chartsHospitalTableVisibilityObserver = observer;
  };

  const ensureChartsSecondaryVisibilityObserver = () => {
    const heatmapTarget = selectors.heatmapContainer;
    const hourlyTarget = document.getElementById('hourlyChart');
    if (
      dashboardState.chartsSectionRenderFlags?.heatmapVisible &&
      dashboardState.chartsSectionRenderFlags?.hourlyVisible
    ) {
      return;
    }
    if (!(heatmapTarget instanceof HTMLElement) && !(hourlyTarget instanceof HTMLElement)) {
      return;
    }
    if (dashboardState.chartsSecondaryVisibilityObserver) {
      return;
    }
    if (typeof window.IntersectionObserver !== 'function') {
      dashboardState.chartsSectionRenderFlags = {
        ...(dashboardState.chartsSectionRenderFlags || {}),
        heatmapVisible: true,
        hourlyVisible: true,
      };
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        let didReveal = false;
        for (const entry of entries) {
          if (!(entry.isIntersecting || entry.intersectionRatio > 0)) {
            continue;
          }
          if (entry.target === heatmapTarget) {
            didReveal = markChartsSectionVisible('heatmap') || didReveal;
          } else if (entry.target === hourlyTarget) {
            didReveal = markChartsSectionVisible('hourly') || didReveal;
          }
        }
        if (didReveal) {
          scheduleChartsSecondaryRender({ reason: 'visibility' });
        }
      },
      { root: null, rootMargin: '200px 0px', threshold: [0, 0.01] }
    );
    if (heatmapTarget instanceof HTMLElement) {
      observer.observe(heatmapTarget);
    }
    if (hourlyTarget instanceof HTMLElement) {
      observer.observe(hourlyTarget);
    }
    dashboardState.chartsSecondaryVisibilityObserver = observer;
  };

  const scheduleChartsSecondaryRender = ({ reason = 'runtime' } = {}) => {
    const interactiveReason =
      reason === 'visibility' ||
      reason === 'section-toggle' ||
      reason === 'jump-nav' ||
      reason === 'interaction';
    const secondaryTimeout = interactiveReason ? 80 : 1200;
    const hospitalTimeout = interactiveReason ? 120 : 2000;
    dashboardState.chartsDeferredRenderToken = Number(dashboardState.chartsDeferredRenderToken || 0) + 1;
    const token = dashboardState.chartsDeferredRenderToken;
    dashboardState.chartsDeferredRenderReason = reason;
    if (dashboardState.chartsSecondaryRenderScheduled) {
      return;
    }
    dashboardState.chartsSecondaryRenderScheduled = true;
    runAfterDomAndIdle(
      async () => {
        dashboardState.chartsSecondaryRenderScheduled = false;
        if (token !== dashboardState.chartsDeferredRenderToken) {
          scheduleChartsSecondaryRender({
            reason: dashboardState.chartsDeferredRenderReason || reason,
          });
          return;
        }
        ensureChartsSecondaryVisibilityObserver();
        const sectionFlags = dashboardState.chartsSectionRenderFlags || {};
        const renderHeatmap = Boolean(sectionFlags.heatmapVisible);
        const renderHourly = Boolean(sectionFlags.hourlyVisible);
        if (!renderHeatmap && !renderHourly) {
          return;
        }
        const secondaryPerfHandle =
          runtimeClient?.perfMonitor?.start?.('charts-secondary-render', { priežastis: reason }) || null;
        await chartRenderers.renderChartsSecondary({
          heatmapData: renderHeatmap ? computeHeatmapDataForFilters() : null,
          allowReuse: true,
          renderHeatmap,
          renderHourly,
        });
        runtimeClient?.perfMonitor?.finish?.(secondaryPerfHandle, { priežastis: reason });
        const updatedFlags = dashboardState.chartsSectionRenderFlags || {};
        const secondaryComplete = Boolean(updatedFlags.heatmapRendered && updatedFlags.hourlyRendered);
        dashboardState.chartsStartupPhases = {
          ...(dashboardState.chartsStartupPhases || {}),
          secondaryComplete,
        };
        if (secondaryComplete) {
          markChartsPerfPoint('app-charts-secondary-complete');
          dispatchChartsLifecycleEvent('app:charts-secondary-complete', {
            reason,
          });
        }
        if (dashboardState.chartsHospitalRenderScheduled) {
          return;
        }
        dashboardState.chartsHospitalRenderScheduled = true;
        runAfterDomAndIdle(
          () => {
            dashboardState.chartsHospitalRenderScheduled = false;
            if (token !== dashboardState.chartsDeferredRenderToken) {
              return;
            }
            ensureChartsHospitalVisibilityObserver();
            if (dashboardState.chartsSectionRenderFlags?.hospitalVisible) {
              const hospitalPerfHandle =
                runtimeClient?.perfMonitor?.start?.('charts-hospital-table-render', { priežastis: reason }) ||
                null;
              renderChartsHospitalTable(dashboardState.rawRecords, { force: true });
              runtimeClient?.perfMonitor?.finish?.(hospitalPerfHandle, { priežastis: reason });
            }
          },
          { timeout: hospitalTimeout }
        );
      },
      { timeout: secondaryTimeout }
    );
  };

  const handleChartsPrimaryVisible = () => {
    if (dashboardState.chartsStartupPhases?.primaryVisible) {
      return;
    }
    dashboardState.chartsStartupPhases = {
      ...(dashboardState.chartsStartupPhases || {}),
      primaryVisible: true,
    };
    dashboardState.chartsFirstVisibleAt = Date.now();
    markChartsPerfPoint('app-charts-primary-visible');
    dispatchChartsLifecycleEvent('app:charts-primary-visible', {});
  };

  return {
    ensureChartsHospitalVisibilityObserver,
    ensureChartsSecondaryVisibilityObserver,
    scheduleChartsSecondaryRender,
    handleChartsPrimaryVisible,
  };
}
