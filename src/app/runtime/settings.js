export function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  let result = parsed;
  if (Number.isFinite(min) && result < min) {
    result = min;
  }
  if (Number.isFinite(max) && result > max) {
    result = max;
  }
  return result;
}

export function deepMerge(target, source) {
  const output = { ...target };
  if (!source || typeof source !== 'object') {
    return output;
  }
  Object.keys(source).forEach((key) => {
    const src = source[key];
    const dst = output[key];
    if (src && typeof src === 'object' && !Array.isArray(src) && dst && typeof dst === 'object' && !Array.isArray(dst)) {
      output[key] = deepMerge(dst, src);
    } else {
      output[key] = src;
    }
  });
  return output;
}

export function normalizeSettings(rawSettings = {}, DEFAULT_SETTINGS) {
  const merged = deepMerge(DEFAULT_SETTINGS, rawSettings);
  merged.dataSource = merged.dataSource || {};
  merged.dataSource.feedback = merged.dataSource.feedback || {};
  merged.dataSource.historical = merged.dataSource.historical || {};
  merged.dataSource.ed = merged.dataSource.ed || {};
  merged.dataSource.url = String(merged.dataSource.url || '').trim();
  merged.dataSource.feedback.url = String(merged.dataSource.feedback.url || '').trim();
  merged.dataSource.historical.url = String(merged.dataSource.historical.url || '').trim();
  merged.dataSource.ed.url = String(merged.dataSource.ed.url || '').trim();
  merged.dataSource.historical.enabled = merged.dataSource.historical.enabled !== false;
  merged.calculations = merged.calculations || {};
  merged.calculations.windowDays = clampNumber(
    merged.calculations.windowDays,
    7,
    365,
    DEFAULT_SETTINGS.calculations.windowDays,
  );
  merged.calculations.recentDays = clampNumber(
    merged.calculations.recentDays,
    1,
    60,
    DEFAULT_SETTINGS.calculations.recentDays,
  );
  return merged;
}

export function getRuntimeConfigUrl() {
  const params = new URLSearchParams(window.location.search);
  const paramUrl = params.get('config');
  return paramUrl && paramUrl.trim() ? paramUrl.trim() : 'config.json';
}

const SETTINGS_SESSION_KEY = 'edDashboard:settings:v1';
const SETTINGS_CACHE_TTL_MS = 2 * 60 * 1000;

function readSettingsFromSessionCache(configUrl) {
  try {
    const raw = window.sessionStorage.getItem(SETTINGS_SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (parsed.configUrl !== configUrl) {
      return null;
    }
    if (!Number.isFinite(parsed.savedAt) || (Date.now() - parsed.savedAt) > SETTINGS_CACHE_TTL_MS) {
      return null;
    }
    if (!parsed.settings || typeof parsed.settings !== 'object') {
      return null;
    }
    return parsed.settings;
  } catch (error) {
    return null;
  }
}

function writeSettingsToSessionCache(configUrl, settings) {
  try {
    if (!settings || typeof settings !== 'object') {
      return;
    }
    window.sessionStorage.setItem(SETTINGS_SESSION_KEY, JSON.stringify({
      configUrl,
      savedAt: Date.now(),
      settings,
    }));
  } catch (error) {
    // Ignore storage quota and serialization issues.
  }
}

export async function loadSettingsFromConfig(DEFAULT_SETTINGS) {
  const configUrl = getRuntimeConfigUrl();
  const cachedSettings = readSettingsFromSessionCache(configUrl);
  if (cachedSettings) {
    return normalizeSettings(cachedSettings, DEFAULT_SETTINGS);
  }
  try {
    const response = await fetch(configUrl, { cache: 'default' });
    if (!response.ok) {
      throw new Error(`Nepavyko atsisiųsti konfigūracijos (${response.status})`);
    }
    const configData = await response.json();
    writeSettingsToSessionCache(configUrl, configData);
    return normalizeSettings(configData, DEFAULT_SETTINGS);
  } catch (error) {
    const fallbackCached = readSettingsFromSessionCache(configUrl);
    if (fallbackCached) {
      return normalizeSettings(fallbackCached, DEFAULT_SETTINGS);
    }
    console.warn('Nepavyko įkelti config.json, naudojami numatytieji.', error);
    return normalizeSettings({}, DEFAULT_SETTINGS);
  }
}
