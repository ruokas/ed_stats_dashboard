export function parseCandidateList(value, fallback = '') {
  const base = value && String(value).trim().length ? String(value) : String(fallback ?? '');
  return base
    .replace(/\r\n/g, '\n')
    .split(/[\n,|;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function matchesWildcard(normalized, candidate) {
  if (!normalized || !candidate) {
    return false;
  }
  const escaped = candidate.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const regex = new RegExp(`^${escaped}$`);
  return regex.test(normalized);
}

export function createStatusSetter(statusText = {}) {
  return function setStatus(selectors, type, details = '') {
    const statusEl = selectors.status;
    if (!statusEl) {
      return;
    }
    statusEl.textContent = '';
    statusEl.classList.remove('status--loading', 'status--error', 'status--success', 'status--warning');
    if (type === 'loading') {
      statusEl.classList.add('status--loading');
      if (statusText.loading) {
        statusEl.setAttribute('aria-label', statusText.loading);
      }
      return;
    }
    statusEl.removeAttribute('aria-label');
    if (type === 'error') {
      statusEl.classList.add('status--error');
      statusEl.textContent = details && typeof statusText.errorDetails === 'function'
        ? statusText.errorDetails(details)
        : (statusText.error || details || '');
      return;
    }
    if (type === 'warning') {
      statusEl.classList.add('status--warning');
      statusEl.textContent = details || statusText.success || '';
      return;
    }
    statusEl.classList.add('status--success');
    statusEl.textContent = statusText.success || '';
  };
}
