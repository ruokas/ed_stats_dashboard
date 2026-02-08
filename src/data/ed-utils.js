export function parseDurationMinutes(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  const normalized = text.replace(',', '.').replace(/\s+/g, '');
  if (/^\d{1,2}:\d{2}$/.test(normalized)) {
    const [hours, minutes] = normalized.split(':').map((part) => Number.parseInt(part, 10));
    if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
      return hours * 60 + minutes;
    }
  }
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

export function parseNumericCell(value) {
  if (value == null) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  const normalized = raw.replace(/\s+/g, '').replace(',', '.');
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeRatioValue(value) {
  if (value == null) {
    return { ratio: null, text: '' };
  }
  const text = String(value).trim();
  if (!text) {
    return { ratio: null, text: '' };
  }
  const normalized = text.replace(',', '.').replace(/\s+/g, '');
  if (normalized.includes(':')) {
    const [left, right] = normalized.split(':');
    const numerator = Number.parseFloat(left);
    const denominator = Number.parseFloat(right);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      return { ratio: numerator / denominator, text };
    }
  }
  const numeric = Number.parseFloat(normalized);
  if (Number.isFinite(numeric) && numeric > 0) {
    return { ratio: numeric, text };
  }
  return { ratio: null, text };
}

export function normalizeDispositionValue(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    return { label: 'Nežinoma', category: 'unknown' };
  }
  const lower = raw.toLowerCase();
  if (/(hospital|stacion|admit|ward|perkel|stacionar|stac\.|priimtuvas)/i.test(lower)) {
    return { label: raw, category: 'hospitalized' };
  }
  if (/(discharg|nam|ambulator|released|outpatient|home|išle)/i.test(lower)) {
    return { label: raw, category: 'discharged' };
  }
  if (/(transfer|perkeltas|perkelta|pervež|perkėlimo)/i.test(lower)) {
    return { label: raw, category: 'transfer' };
  }
  if (/(left|atsisak|neatvyko|nedalyv|amoa|dnw|did not wait|lwbs|lwt|pabėg|walked)/i.test(lower)) {
    return { label: raw, category: 'left' };
  }
  return { label: raw, category: 'other' };
}

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
