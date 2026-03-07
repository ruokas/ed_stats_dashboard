(function initializeEdUtils(globalScope) {
  if (globalScope.__edSharedEdUtils) {
    return;
  }

  function parseDurationMinutes(value) {
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

  function parseNumericCell(value) {
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

  function normalizeRatioValue(value) {
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

  function normalizeDispositionValue(value) {
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

  globalScope.__edSharedEdUtils = {
    normalizeDispositionValue,
    normalizeRatioValue,
    parseDurationMinutes,
    parseNumericCell,
  };
})(typeof self !== 'undefined' ? self : globalThis);
