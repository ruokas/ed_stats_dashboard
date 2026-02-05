export function initCompareControls(env) {
  const {
    selectors,
    dashboardState,
    setCompareMode,
    clearCompareSelection,
    updateCompareSummary,
    handleCompareRowSelection,
  } = env;

  if (selectors.compareToggle) {
    selectors.compareToggle.addEventListener('click', () => {
      setCompareMode(!dashboardState.compare.active);
    });
    selectors.compareToggle.setAttribute('aria-pressed', 'false');
  }

  if (selectors.compareClear) {
    selectors.compareClear.addEventListener('click', () => {
      clearCompareSelection();
      if (dashboardState.compare.active) {
        updateCompareSummary();
      }
    });
  }

  const handleCompareClick = (event) => {
    if (!dashboardState.compare.active) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const row = target.closest('tr[data-compare-id]');
    if (row) {
      handleCompareRowSelection(row);
    }
  };

  const handleCompareKeydown = (event) => {
    if (!dashboardState.compare.active) {
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const row = target.closest('tr[data-compare-id]');
    if (row) {
      event.preventDefault();
      handleCompareRowSelection(row);
    }
  };

  if (selectors.recentTable) {
    selectors.recentTable.addEventListener('click', handleCompareClick);
    selectors.recentTable.addEventListener('keydown', handleCompareKeydown);
  }

  if (selectors.monthlyTable) {
    selectors.monthlyTable.addEventListener('click', handleCompareClick);
    selectors.monthlyTable.addEventListener('keydown', handleCompareKeydown);
  }

  if (selectors.yearlyTable) {
    selectors.yearlyTable.addEventListener('click', handleCompareClick);
    selectors.yearlyTable.addEventListener('keydown', handleCompareKeydown);
  }
}
