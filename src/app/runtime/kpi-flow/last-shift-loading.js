function shouldUseBlockingLastShiftLoading(deps, options = {}) {
  if (options?.forceBlocking === true) {
    return true;
  }
  if (options?.forceNonBlocking === true) {
    return false;
  }
  return deps.dashboardState.kpi?.lastShiftHourlyHasRenderedOnce !== true;
}

export function beginLastShiftHourlyLoading(deps, options = {}) {
  const token = deps.nextRenderToken();
  const blocking = shouldUseBlockingLastShiftLoading(deps, options);
  if (blocking && typeof deps.showLastShiftHourlyLoading === 'function') {
    deps.showLastShiftHourlyLoading();
  }
  if (deps.setChartCardMessage) {
    deps.setChartCardMessage(deps.selectors.lastShiftHourlyChart, '');
  }
  return { token, blocking };
}

export function endLastShiftHourlyLoading(deps, renderState) {
  const token = Number(renderState?.token);
  const blocking = renderState?.blocking === true;
  if (!Number.isFinite(token) || token !== deps.getRenderToken()) {
    return;
  }
  if (!blocking) {
    return;
  }
  const hide = () => {
    if (token !== deps.getRenderToken()) {
      return;
    }
    if (typeof deps.hideLastShiftHourlyLoading === 'function') {
      deps.hideLastShiftHourlyLoading();
    }
  };
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    // Delay skeleton removal by two frames so the canvas/chart paint is visible first.
    window.requestAnimationFrame(() => {
      if (token !== deps.getRenderToken()) {
        return;
      }
      window.requestAnimationFrame(hide);
    });
    return;
  }
  hide();
}
