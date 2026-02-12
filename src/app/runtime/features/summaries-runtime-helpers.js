import {
  capitalizeSentence,
  monthFormatter,
  numberFormatter,
  oneDecimalFormatter,
  percentFormatter,
} from '../../../utils/format.js';

export function getCssVar(name, fallback) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || fallback;
  } catch (_error) {
    return fallback;
  }
}

export function parseHexColor(value, fallback = { r: 239, g: 68, b: 68 }) {
  const text = String(value || '').trim();
  if (!text.startsWith('#')) {
    return fallback;
  }
  const hex = text.slice(1);
  const fullHex =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : hex;
  if (fullHex.length !== 6) {
    return fallback;
  }
  const r = Number.parseInt(fullHex.slice(0, 2), 16);
  const g = Number.parseInt(fullHex.slice(2, 4), 16);
  const b = Number.parseInt(fullHex.slice(4, 6), 16);
  if (![r, g, b].every((item) => Number.isFinite(item))) {
    return fallback;
  }
  return { r, g, b };
}

export function mixRgb(start, end, t) {
  const ratio = Math.max(0, Math.min(1, Number(t) || 0));
  return {
    r: Math.round(start.r + (end.r - start.r) * ratio),
    g: Math.round(start.g + (end.g - start.g) * ratio),
    b: Math.round(start.b + (end.b - start.b) * ratio),
  };
}

export function applyChartThemeDefaults(chartLib) {
  if (!chartLib || !chartLib.defaults) {
    return;
  }
  const textColor = getCssVar('--color-text-muted', '#9ca8c0');
  const titleColor = getCssVar('--color-text', '#e8ecf6');
  const gridColor = getCssVar('--chart-grid', 'rgba(156, 168, 192, 0.26)');
  chartLib.defaults.color = textColor;
  chartLib.defaults.borderColor = gridColor;
  chartLib.defaults.scale = chartLib.defaults.scale || {};
  chartLib.defaults.scale.ticks = { ...(chartLib.defaults.scale.ticks || {}), color: textColor };
  chartLib.defaults.scale.title = { ...(chartLib.defaults.scale.title || {}), color: titleColor };
  chartLib.defaults.plugins = chartLib.defaults.plugins || {};
  chartLib.defaults.plugins.legend = chartLib.defaults.plugins.legend || {};
  chartLib.defaults.plugins.legend.labels = {
    ...(chartLib.defaults.plugins.legend.labels || {}),
    color: textColor,
  };
}

export function formatMonthLabel(monthKey) {
  if (typeof monthKey !== 'string') {
    return '—';
  }
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return monthKey;
  }
  return capitalizeSentence(monthFormatter.format(new Date(year, month - 1, 1)));
}

export function formatYearLabel(yearValue) {
  return Number.isFinite(Number(yearValue)) ? String(yearValue) : '—';
}

export function formatExportFilename(title, ext) {
  const normalized = String(title || 'ataskaita')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const date = new Date();
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `${normalized || 'ataskaita'}-${stamp}.${String(ext || 'csv').replace(/^\./, '')}`;
}

export function isCompleteYearEntry(entry) {
  if (!entry) {
    return false;
  }
  const monthCount = Number.isFinite(entry?.monthCount) ? entry.monthCount : 0;
  const dayCount = Number.isFinite(entry?.dayCount) ? entry.dayCount : 0;
  return monthCount >= 12 || dayCount >= 360;
}

export function formatValueWithShare(value, total) {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (!Number.isFinite(total) || total <= 0) {
    return numberFormatter.format(safeValue);
  }
  return `${numberFormatter.format(safeValue)} (${percentFormatter.format(safeValue / total)})`;
}

export function formatChangeCell(diff, percent, canCompare) {
  if (!canCompare || !Number.isFinite(diff)) {
    return '—';
  }
  const sign = diff > 0 ? '+' : '';
  const percentText = Number.isFinite(percent)
    ? ` (${sign}${oneDecimalFormatter.format(percent * 100)}%)`
    : '';
  return `${sign}${numberFormatter.format(diff)}${percentText}`;
}
