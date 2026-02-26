(() => {
  const storageKey = 'edDashboardTheme';
  const settingsSessionKey = 'edDashboard:settings:v1';
  const settingsCacheTtlMs = 2 * 60 * 1000;
  const root = document.documentElement;

  const preferDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

  const getStoredTheme = () => {
    try {
      const value = localStorage.getItem(storageKey);
      return value === 'dark' || value === 'light' ? value : null;
    } catch (_error) {
      return null;
    }
  };

  const getRuntimeConfigUrl = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const paramUrl = params.get('config');
      return paramUrl?.trim() ? paramUrl.trim() : 'config.json';
    } catch (_error) {
      return 'config.json';
    }
  };

  const getCachedSettings = () => {
    try {
      const raw = window.sessionStorage.getItem(settingsSessionKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      if (parsed.configUrl !== getRuntimeConfigUrl()) {
        return null;
      }
      if (!Number.isFinite(parsed.savedAt) || Date.now() - parsed.savedAt > settingsCacheTtlMs) {
        return null;
      }
      if (!parsed.settings || typeof parsed.settings !== 'object') {
        return null;
      }
      return parsed.settings;
    } catch (_error) {
      return null;
    }
  };

  const applyCachedBranding = (settings) => {
    const output = settings?.output;
    if (!output || typeof output !== 'object') {
      return;
    }
    if (typeof output.pageTitle === 'string' && output.pageTitle.trim()) {
      document.title = output.pageTitle.trim();
    }
    const applyDomText = () => {
      const pageTitleEl = document.getElementById('pageTitle');
      if (pageTitleEl && typeof output.title === 'string' && output.title.trim()) {
        pageTitleEl.textContent = output.title.trim();
      }
      const edHeadingEl = document.getElementById('edHeading');
      if (edHeadingEl && typeof output.edTitle === 'string' && output.edTitle.trim()) {
        edHeadingEl.textContent = output.edTitle.trim();
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyDomText, { once: true });
    } else {
      applyDomText();
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
        { once: true }
      );
    }
  };

  const initialTheme = getStoredTheme() || (preferDark() ? 'dark' : 'light');
  setThemeAttributes(initialTheme);
  applyCachedBranding(getCachedSettings());
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
