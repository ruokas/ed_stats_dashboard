export function shouldShowKpiLoadingSkeleton(deps) {
  const grid = deps.selectors?.kpiGrid;
  if (!(grid instanceof HTMLElement)) {
    return true;
  }
  if (deps.getDatasetValue(grid, 'skeleton') === 'true') {
    return true;
  }
  return grid.children.length === 0;
}

export function notifyKpiStateChange(deps) {
  if (typeof deps.onKpiStateChange !== 'function') {
    return;
  }
  deps.onKpiStateChange({
    ...(deps.dashboardState.kpi?.filters || {}),
    selectedDate: deps.dashboardState.kpi?.selectedDate || null,
  });
}
