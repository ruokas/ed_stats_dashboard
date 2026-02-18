export function syncAriaPressed(buttons, getValue, activeValue) {
  (Array.isArray(buttons) ? buttons : []).forEach((button) => {
    const value = getValue(button);
    button.setAttribute('aria-pressed', String(String(value) === String(activeValue)));
  });
}

export function syncDisabledState(elements, disabled, titleWhenDisabled = '') {
  (Array.isArray(elements) ? elements : []).forEach((element) => {
    if (!element) {
      return;
    }
    element.disabled = Boolean(disabled);
    element.setAttribute('aria-disabled', String(Boolean(disabled)));
    if (disabled && titleWhenDisabled) {
      element.setAttribute('title', titleWhenDisabled);
    } else {
      element.removeAttribute('title');
    }
  });
}

export function syncSummary(element, text, isDefault) {
  if (!element) {
    return;
  }
  element.textContent = String(text || '');
  element.dataset.default = isDefault ? 'true' : 'false';
}

export function createDebouncedHandler(handler, delayMs = 250) {
  let timer = null;
  let lastArgs = [];
  const debounced = (...args) => {
    lastArgs = args;
    if (timer) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(
      () => {
        const argsToRun = lastArgs;
        lastArgs = [];
        timer = null;
        handler(...argsToRun);
      },
      Math.max(0, Number(delayMs) || 0)
    );
  };
  debounced.cancel = () => {
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
    lastArgs = [];
  };
  debounced.flush = () => {
    if (!timer) {
      return;
    }
    window.clearTimeout(timer);
    const argsToRun = lastArgs;
    lastArgs = [];
    timer = null;
    handler(...argsToRun);
  };
  return debounced;
}
