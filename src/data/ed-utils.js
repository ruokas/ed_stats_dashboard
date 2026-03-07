import '../../shared/ed-utils-shared.js';

const sharedEdUtils = globalThis.__edSharedEdUtils;

if (!sharedEdUtils) {
  throw new Error('Nepavyko inicializuoti bendrų ED helperių.');
}

export const parseDurationMinutes = sharedEdUtils.parseDurationMinutes;
export const parseNumericCell = sharedEdUtils.parseNumericCell;
export const normalizeRatioValue = sharedEdUtils.normalizeRatioValue;
export const normalizeDispositionValue = sharedEdUtils.normalizeDispositionValue;

export function toDateKeyFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatHourLabel(hour) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return '';
  }
  return `${String(hour).padStart(2, '0')}:00`;
}

export function pickTopHours(hourCounts, limit = 3) {
  if (!Array.isArray(hourCounts) || !hourCounts.length) {
    return [];
  }
  return hourCounts
    .map((count, hour) => ({ hour, count }))
    .filter((entry) => Number.isFinite(entry.count) && entry.count > 0)
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.hour - b.hour;
    })
    .slice(0, Math.max(0, limit));
}

export function computePercentile(sortedValues, percentile) {
  if (!Array.isArray(sortedValues) || !sortedValues.length) {
    return null;
  }
  const clamped = Math.min(Math.max(percentile, 0), 1);
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }
  const index = (sortedValues.length - 1) * clamped;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (upper >= sortedValues.length) {
    return sortedValues[sortedValues.length - 1];
  }
  if (lower === upper) {
    return sortedValues[lower];
  }
  const lowerValue = sortedValues[lower];
  const upperValue = sortedValues[upper];
  if (!Number.isFinite(lowerValue) || !Number.isFinite(upperValue)) {
    return null;
  }
  return lowerValue + (upperValue - lowerValue) * weight;
}

export function formatPercentPointDelta(delta, oneDecimalFormatter) {
  if (!Number.isFinite(delta)) {
    return '';
  }
  const magnitude = Math.abs(delta) * 100;
  const rounded = Math.round(magnitude * 10) / 10;
  if (!rounded) {
    return '±0 p.p.';
  }
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${oneDecimalFormatter.format(rounded)} p.p.`;
}
