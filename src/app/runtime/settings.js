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

export async function loadSettingsFromConfig(DEFAULT_SETTINGS) {
  try {
    const response = await fetch(getRuntimeConfigUrl(), { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Nepavyko atsisiųsti konfigūracijos (${response.status})`);
    }
    const configData = await response.json();
    return normalizeSettings(configData, DEFAULT_SETTINGS);
  } catch (error) {
    console.warn('Nepavyko įkelti config.json, naudojami numatytieji.', error);
    return normalizeSettings({}, DEFAULT_SETTINGS);
  }
}
