export function initEdPanelControls(env) {
  const { selectors, dashboardState, setActiveTab, debounce, applyEdSearchFilter } = env;

  if (selectors.edNavButton) {
    selectors.edNavButton.addEventListener('click', (event) => {
      event.preventDefault();
      const isActive = dashboardState.activeTab === 'ed';
      setActiveTab(isActive ? 'overview' : 'ed', {
        focusPanel: !isActive,
        restoreFocus: isActive,
      });
    });
  }

  if (selectors.closeEdPanelBtn) {
    selectors.closeEdPanelBtn.addEventListener('click', () => {
      setActiveTab('overview', { restoreFocus: true });
    });
  }

  const debouncedEdSearch = debounce((value) => {
    applyEdSearchFilter(value);
  }, 350);

  if (selectors.edSearchInput) {
    selectors.edSearchInput.addEventListener('input', (event) => {
      debouncedEdSearch(event.target.value || '');
    });
  }
}
