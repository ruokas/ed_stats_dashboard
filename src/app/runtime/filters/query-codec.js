import { getFilterSchema } from './definitions.js';

function parseBoolean(raw, fallback = false) {
  if (raw == null) {
    return fallback;
  }
  const value = String(raw).trim().toLowerCase();
  if (value === '1' || value === 'true' || value === 'yes') {
    return true;
  }
  if (value === '0' || value === 'false' || value === 'no') {
    return false;
  }
  return fallback;
}

function parseNumber(raw, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (parsed < min || parsed > max) {
    return null;
  }
  return parsed;
}

function parseByType(raw, config) {
  const { type } = config || {};
  if (type === 'boolean') {
    return parseBoolean(raw, false);
  }
  if (type === 'number') {
    return parseNumber(raw, config);
  }
  if (type === 'numberOrNull') {
    if (raw == null || String(raw).trim() === '' || String(raw).trim() === 'all') {
      return null;
    }
    return parseNumber(raw, config);
  }
  if (type === 'enum') {
    const value = String(raw ?? '').trim();
    return Array.isArray(config.allowed) && config.allowed.includes(value) ? value : null;
  }
  if (type === 'csv') {
    return String(raw || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return String(raw ?? '').trim();
}

function encodeValueByType(value, config) {
  const { type } = config || {};
  if (type === 'boolean') {
    return value ? '1' : '0';
  }
  if (type === 'csv') {
    return Array.isArray(value) ? value.filter(Boolean).join(',') : '';
  }
  if (value == null) {
    return '';
  }
  return String(value);
}

export function parseFromQuery(pageId, search) {
  const schema = getFilterSchema(pageId);
  if (!schema) {
    return {};
  }
  const params = new URLSearchParams(String(search || ''));
  const parsed = {};
  Object.entries(schema.filters || {}).forEach(([key, config]) => {
    const raw = params.get(config.queryKey);
    if (raw == null) {
      return;
    }
    const value = parseByType(raw, config);
    if (value != null) {
      parsed[key] = value;
    }
  });
  return parsed;
}

export function serializeToQuery(pageId, state, defaults = null) {
  const schema = getFilterSchema(pageId);
  if (!schema) {
    return '';
  }
  const params = new URLSearchParams();
  Object.entries(schema.filters || {}).forEach(([key, config]) => {
    const value = state?.[key];
    const defaultValue = defaults?.[key];
    const encoded = encodeValueByType(value, config);
    const encodedDefault = encodeValueByType(defaultValue, config);
    if (encoded === '' || encoded === encodedDefault) {
      return;
    }
    params.set(config.queryKey, encoded);
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function replaceUrlQuery(nextQuery) {
  const query = String(nextQuery || '');
  const nextUrl = `${window.location.pathname}${query}${window.location.hash || ''}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash || ''}`;
  if (nextUrl !== currentUrl) {
    window.history.replaceState(null, '', nextUrl);
    if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent('app:query-updated', {
          detail: {
            pathname: window.location.pathname,
            search: window.location.search,
            hash: window.location.hash || '',
          },
        })
      );
    }
  }
}
