export function runAfterDomAndIdle(task, { timeout = 1200 } = {}) {
  if (typeof task !== 'function') {
    return;
  }

  const execute = () => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => task(), { timeout });
    } else {
      window.setTimeout(() => task(), timeout);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', execute, { once: true });
  } else {
    execute();
  }
}

export function enableLazyLoading() {
  document.querySelectorAll('img:not([loading])').forEach((img) => {
    if (!img.dataset?.forceEager) {
      img.loading = 'lazy';
    }
  });
  document.querySelectorAll('iframe:not([loading])').forEach((frame) => {
    frame.loading = 'lazy';
  });
}
