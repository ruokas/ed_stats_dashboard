const DEFAULT_PLUGIN_SCRIPT_TIMEOUT_MS = 8000;

export function resolveScriptLoadWithTimeout(
  script,
  timeoutMs = DEFAULT_PLUGIN_SCRIPT_TIMEOUT_MS,
  timer = (callback, ms) => window.setTimeout(callback, ms)
) {
  return new Promise((resolve) => {
    if (!(script instanceof HTMLScriptElement)) {
      resolve(false);
      return;
    }
    if (script.dataset.loaded === 'true') {
      resolve(true);
      return;
    }
    if (script.dataset.failed === 'true') {
      resolve(false);
      return;
    }
    let settled = false;
    const finalize = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(Boolean(ok));
    };
    const onLoad = () => {
      script.dataset.loaded = 'true';
      script.dataset.failed = 'false';
      finalize(true);
    };
    const onError = () => {
      script.dataset.failed = 'true';
      script.dataset.loaded = 'false';
      finalize(false);
    };
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    timer(() => finalize(false), timeoutMs);
  });
}

export function loadPluginScript(
  scriptSrc,
  timeoutMs = DEFAULT_PLUGIN_SCRIPT_TIMEOUT_MS,
  timer = (callback, ms) => window.setTimeout(callback, ms)
) {
  return new Promise((resolve) => {
    const existingScript = document.querySelector(`script[src="${scriptSrc}"]`);
    if (existingScript instanceof HTMLScriptElement) {
      void resolveScriptLoadWithTimeout(existingScript, timeoutMs, timer).then(resolve);
      return;
    }
    const script = document.createElement('script');
    script.src = scriptSrc;
    script.defer = true;
    script.dataset.loaded = 'false';
    script.dataset.failed = 'false';
    let settled = false;
    const finalize = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(Boolean(ok));
    };
    script.onload = () => {
      script.dataset.loaded = 'true';
      script.dataset.failed = 'false';
      finalize(true);
    };
    script.onerror = () => {
      script.dataset.failed = 'true';
      script.dataset.loaded = 'false';
      finalize(false);
    };
    document.head.appendChild(script);
    timer(() => finalize(false), timeoutMs);
  });
}
