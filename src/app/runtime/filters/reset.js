import { sanitizePageFilters } from './sanitize.js';

export function resetToDefaults(pageId, defaults, context = {}) {
  return sanitizePageFilters(pageId, defaults, {
    ...context,
    defaults,
  });
}
