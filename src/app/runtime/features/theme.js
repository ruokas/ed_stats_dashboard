export function getThemeStyleTarget() {
  return document.body || document.documentElement;
}

export function getThemePalette() {
  const styleTarget = getThemeStyleTarget();
  const rootStyles = getComputedStyle(styleTarget);
  return {
    accent: rootStyles.getPropertyValue('--color-accent').trim() || '#2563eb',
    accentSoft: rootStyles.getPropertyValue('--color-accent-soft').trim() || 'rgba(37, 99, 235, 0.18)',
    weekendAccent: rootStyles.getPropertyValue('--color-weekend').trim() || '#f97316',
    weekendAccentSoft: rootStyles.getPropertyValue('--color-weekend-soft').trim() || 'rgba(249, 115, 22, 0.2)',
    success: rootStyles.getPropertyValue('--color-success').trim() || '#16a34a',
    danger: rootStyles.getPropertyValue('--color-danger').trim() || '#c34b55',
    dangerSoft: rootStyles.getPropertyValue('--color-danger-soft').trim() || 'rgba(195, 75, 85, 0.28)',
    textColor: rootStyles.getPropertyValue('--color-text').trim() || '#0f172a',
    textMuted: rootStyles.getPropertyValue('--color-text-muted').trim() || '#475569',
    gridColor: rootStyles.getPropertyValue('--chart-grid').trim() || 'rgba(15, 23, 42, 0.12)',
    surface: rootStyles.getPropertyValue('--color-surface').trim() || '#f8fafc',
  };
}

export function updateThemeToggleState(selectors, theme) {
  if (!selectors?.themeToggleBtn) {
    return;
  }
  const isDark = theme === 'dark';
  selectors.themeToggleBtn.setAttribute('aria-pressed', String(isDark));
  selectors.themeToggleBtn.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

export function applyTheme(dashboardState, selectors, theme, { persist = false, themeStorageKey } = {}) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  [document.documentElement, document.body].filter(Boolean).forEach((el) => {
    el.setAttribute('data-theme', normalized);
  });
  if (dashboardState && typeof dashboardState === 'object') {
    dashboardState.theme = normalized;
  }
  updateThemeToggleState(selectors, normalized);
  if (!persist || !themeStorageKey) {
    return;
  }
  try {
    localStorage.setItem(themeStorageKey, normalized);
  } catch (error) {
    console.warn('Nepavyko issaugoti temos nustatymo:', error);
  }
}

export function initializeTheme(dashboardState, selectors, { themeStorageKey } = {}) {
  const htmlTheme = document.documentElement.getAttribute('data-theme');
  const bodyTheme = document.body?.getAttribute('data-theme');
  const attrTheme = htmlTheme || bodyTheme;
  const storedTheme = themeStorageKey ? localStorage.getItem(themeStorageKey) : null;
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = attrTheme === 'dark' || attrTheme === 'light'
    ? attrTheme
    : storedTheme === 'dark' || storedTheme === 'light'
      ? storedTheme
      : (prefersDark ? 'dark' : 'light');
  applyTheme(dashboardState, selectors, resolved, { persist: false, themeStorageKey });
}
