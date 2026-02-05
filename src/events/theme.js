export function initThemeToggle(env) {
  const { selectors, toggleTheme } = env;

  if (selectors.themeToggleBtn) {
    selectors.themeToggleBtn.addEventListener('click', () => {
      toggleTheme();
    });
  }
}
