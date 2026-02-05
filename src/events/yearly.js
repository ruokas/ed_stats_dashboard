export function initYearlyExpand(env) {
  const { selectors, handleYearlyToggle } = env;
  if (!selectors.yearlyTable) {
    return;
  }
  selectors.yearlyTable.addEventListener('click', handleYearlyToggle);
}
