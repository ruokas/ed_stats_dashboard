export function initGlobalShortcuts(env) {
  const { selectors, dashboardState, resetKpiFilters, toggleTheme, setActiveTab } = env;

  document.addEventListener('keydown', (event) => {
    if (!event.ctrlKey && !event.metaKey && event.shiftKey && (event.key === 'R' || event.key === 'r')) {
      const tagName =
        event.target && 'tagName' in event.target ? String(event.target.tagName).toUpperCase() : '';
      if (tagName && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) {
        return;
      }
      event.preventDefault();
      resetKpiFilters({ fromKeyboard: true });
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'L' || event.key === 'l')) {
      event.preventDefault();
      toggleTheme();
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'H' || event.key === 'h')) {
      event.preventDefault();
      if (selectors.heatmapMetricSelect) {
        selectors.heatmapMetricSelect.focus();
      }
    }
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === 'A' || event.key === 'a')) {
      const tagName =
        event.target && 'tagName' in event.target ? String(event.target.tagName).toUpperCase() : '';
      const isEditable =
        event.target &&
        typeof event.target === 'object' &&
        'isContentEditable' in event.target &&
        event.target.isContentEditable === true;
      if (tagName && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) {
        return;
      }
      if (isEditable) {
        return;
      }
      if (dashboardState.activeTab === 'ed') {
        event.preventDefault();
        setActiveTab('overview', { restoreFocus: true });
      }
    }
    if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      event.key === 'Escape' &&
      dashboardState.fullscreen
    ) {
      event.preventDefault();
      setActiveTab('overview', { restoreFocus: true });
    }
  });
}
