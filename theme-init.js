(() => {
  const storageKey = 'edDashboardTheme';
  const root = document.documentElement;

  const preferDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  const getStoredTheme = () => {
    try {
      const value = localStorage.getItem(storageKey);
      return value === 'dark' || value === 'light' ? value : null;
    } catch (error) {
      return null;
    }
  };

  const setThemeAttributes = (theme) => {
    if (!theme) {
      return;
    }
    root.setAttribute('data-theme', theme);
    if (document.body) {
      document.body.setAttribute('data-theme', theme);
    } else {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          if (document.body) {
            document.body.setAttribute('data-theme', theme);
          }
        },
        { once: true },
      );
    }
  };

  const initialTheme = getStoredTheme() || (preferDark() ? 'dark' : 'light');
  setThemeAttributes(initialTheme);
  root.classList.add('theme-transition-block');
  window.ED_DASHBOARD_THEME = initialTheme;

  const removeBlocker = () => {
    root.classList.remove('theme-transition-block');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeBlocker, { once: true });
  } else {
    removeBlocker();
  }
})();