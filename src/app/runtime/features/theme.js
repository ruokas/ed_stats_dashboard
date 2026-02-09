export function getThemeStyleTarget() {
  return document.body || document.documentElement;
}

function parseHexToRgb(value) {
  const text = String(value || '').trim();
  if (!text.startsWith('#')) {
    return null;
  }
  const hex = text.slice(1);
  const fullHex = hex.length === 3 ? hex.split('').map((char) => `${char}${char}`).join('') : hex;
  if (fullHex.length !== 6) {
    return null;
  }
  const r = Number.parseInt(fullHex.slice(0, 2), 16);
  const g = Number.parseInt(fullHex.slice(2, 4), 16);
  const b = Number.parseInt(fullHex.slice(4, 6), 16);
  if (![r, g, b].every((item) => Number.isFinite(item))) {
    return null;
  }
  return { r, g, b };
}

function parseColorToRgb(color, fallback) {
  const text = String(color || '').trim();
  if (!text) {
    return fallback;
  }
  const hex = parseHexToRgb(text);
  if (hex) {
    return hex;
  }
  const rgbMatch = text.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1]
      .split(',')
      .map((part) => Number.parseFloat(part.trim()))
      .filter((part) => Number.isFinite(part));
    if (parts.length >= 3) {
      return {
        r: Math.max(0, Math.min(255, Math.round(parts[0]))),
        g: Math.max(0, Math.min(255, Math.round(parts[1]))),
        b: Math.max(0, Math.min(255, Math.round(parts[2]))),
      };
    }
  }
  return fallback;
}

function rgbToRgba(rgb, alpha) {
  const resolved = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
  const r = Number.isFinite(rgb?.r) ? Math.max(0, Math.min(255, Math.round(rgb.r))) : 0;
  const g = Number.isFinite(rgb?.g) ? Math.max(0, Math.min(255, Math.round(rgb.g))) : 0;
  const b = Number.isFinite(rgb?.b) ? Math.max(0, Math.min(255, Math.round(rgb.b))) : 0;
  return `rgba(${r}, ${g}, ${b}, ${resolved})`;
}

export function getThemePalette() {
  const styleTarget = getThemeStyleTarget();
  const rootStyles = getComputedStyle(styleTarget);
  const danger = rootStyles.getPropertyValue('--color-danger').trim() || '#c34b55';
  const dangerRgb = parseColorToRgb(danger, { r: 195, g: 75, b: 85 });
  return {
    accent: rootStyles.getPropertyValue('--color-accent').trim() || '#2563eb',
    accentSoft: rootStyles.getPropertyValue('--color-accent-soft').trim() || 'rgba(37, 99, 235, 0.18)',
    weekendAccent: rootStyles.getPropertyValue('--color-weekend').trim() || '#f97316',
    weekendAccentSoft: rootStyles.getPropertyValue('--color-weekend-soft').trim() || 'rgba(249, 115, 22, 0.2)',
    success: rootStyles.getPropertyValue('--color-success').trim() || '#16a34a',
    danger,
    dangerSoft: rootStyles.getPropertyValue('--color-danger-soft').trim() || rgbToRgba(dangerRgb, 0.28),
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
