import { getDatasetValue } from '../utils/dom.js';

export function initTabSwitcher(env) {
  const { selectors, dashboardState, handleTabKeydown, setActiveTab } = env;

  if (!selectors.tabButtons || !selectors.tabButtons.length) {
    setActiveTab(dashboardState.activeTab || 'overview');
    return;
  }
  selectors.tabButtons.forEach((button) => {
    if (!button) {
      return;
    }
    button.addEventListener('click', () => {
      setActiveTab(getDatasetValue(button, 'tabTarget', 'overview'), { focusPanel: true });
    });
    button.addEventListener('keydown', handleTabKeydown);
  });
  setActiveTab(dashboardState.activeTab || 'overview');
}
