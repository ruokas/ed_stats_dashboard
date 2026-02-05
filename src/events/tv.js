export function initTvMode(env) {
  const {
    selectors,
    dashboardState,
    updateTvToggleControls,
    setTvMode,
    stopTvClock,
    setActiveTab,
  } = env;

  if (!selectors.edTvPanel) {
    dashboardState.tvMode = false;
    document.body.removeAttribute('data-tv-mode');
    stopTvClock();
    return;
  }
  updateTvToggleControls();
  if (selectors.edTvToggleBtn) {
    selectors.edTvToggleBtn.addEventListener('click', () => {
      const isActive = dashboardState.tvMode === true && dashboardState.activeTab === 'ed';
      if (!isActive && dashboardState.activeTab !== 'ed') {
        setActiveTab('ed', { focusPanel: true });
        setTvMode(true, { force: true });
      } else {
        setTvMode(!isActive);
      }
    });
  }
  const params = new URLSearchParams(window.location.search);
  const hash = (window.location.hash || '').toLowerCase();
  const autoStart = params.has('tv') || hash === '#tv' || hash.includes('tv-mode');
  if (autoStart) {
    setActiveTab('ed', { focusPanel: false });
    setTvMode(true, { force: true, silent: true });
  }
}
