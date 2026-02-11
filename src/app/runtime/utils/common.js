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

function resolveStatusMessage(value, ...args) {
  if (typeof value === 'function') {
    return value(...args);
  }
  return value || '';
}

export function createStatusSetter(statusText = {}, { showSuccessState = true } = {}) {
  return function setStatus(selectors, type, details = '') {
    const statusEl = selectors.status;
    if (!statusEl) {
      return;
    }
    statusEl.textContent = '';
    statusEl.classList.remove('status--loading', 'status--error', 'status--success', 'status--warning');
    if (type === 'loading') {
      statusEl.classList.add('status--loading');
      const loadingText = resolveStatusMessage(statusText.loading);
      if (loadingText) {
        statusEl.setAttribute('aria-label', loadingText);
      }
      return;
    }
    statusEl.removeAttribute('aria-label');
    if (type === 'error') {
      statusEl.classList.add('status--error');
      statusEl.textContent =
        details && typeof statusText.errorDetails === 'function'
          ? statusText.errorDetails(details)
          : resolveStatusMessage(statusText.error) || details || '';
      return;
    }
    if (type === 'warning') {
      statusEl.classList.add('status--warning');
      statusEl.textContent = details || resolveStatusMessage(statusText.success);
      return;
    }
    if (!showSuccessState) {
      return;
    }
    statusEl.classList.add('status--success');
    statusEl.textContent = resolveStatusMessage(statusText.success);
  };
}
