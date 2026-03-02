export const CHARTS_SECTION_KEYS = ['overview', 'hourly', 'heatmap', 'hospital'];

export const DEFAULT_CHARTS_SECTIONS_EXPANDED = {
  overview: true,
  hourly: false,
  heatmap: false,
  hospital: false,
};

export function normalizeChartsSectionExpandedKeys(values) {
  const allowed = new Set(CHARTS_SECTION_KEYS);
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter((value, index, arr) => value && allowed.has(value) && arr.indexOf(value) === index);
}

export function buildChartsExpandedMap(values, defaults) {
  const keys = Object.keys(defaults || {});
  const selected = new Set(Array.isArray(values) ? values : []);
  const next = {};
  keys.forEach((key) => {
    next[key] = selected.has(key);
  });
  return next;
}

export function getExpandedKeysFromMap(map, defaults) {
  return Object.keys(defaults || {}).filter((key) => map?.[key] === true);
}
