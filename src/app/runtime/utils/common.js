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

function normalizeStatusDetails(details) {
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    return details;
  }
  if (typeof details === 'string') {
    return { message: details };
  }
  return {};
}

function buildRichStatusText(type, statusText, details) {
  const payload = normalizeStatusDetails(details);
  if (type === 'loading') {
    return payload.message || resolveStatusMessage(statusText.loading) || '';
  }
  if (type === 'error') {
    if (payload.message) {
      return payload.message;
    }
    return resolveStatusMessage(statusText.error) || '';
  }
  if (type === 'warning') {
    if (payload.message) {
      return payload.message;
    }
    return resolveStatusMessage(statusText.success) || '';
  }
  return payload.message || resolveStatusMessage(statusText.success) || '';
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
      const loadingText = buildRichStatusText('loading', statusText, details);
      if (loadingText) {
        statusEl.setAttribute('aria-label', loadingText);
      }
      return;
    }
    statusEl.removeAttribute('aria-label');
    if (type === 'error') {
      statusEl.classList.add('status--error');
      const payload = normalizeStatusDetails(details);
      statusEl.textContent =
        payload.message && typeof statusText.errorDetails === 'function'
          ? statusText.errorDetails(payload.message)
          : buildRichStatusText('error', statusText, payload);
      return;
    }
    if (type === 'warning') {
      statusEl.classList.add('status--warning');
      statusEl.textContent = buildRichStatusText('warning', statusText, details);
      return;
    }
    if (!showSuccessState) {
      return;
    }
    statusEl.classList.add('status--success');
    statusEl.textContent = buildRichStatusText('success', statusText, details);
  };
}
