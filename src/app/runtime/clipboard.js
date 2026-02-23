import { getDatasetValue, setDatasetValue } from '../../utils/dom.js';

export function storeCopyButtonBaseLabel(button) {
  if (!button || getDatasetValue(button, 'copyLabelBase')) {
    return;
  }
  const fallback = button.getAttribute('aria-label') || button.title || 'Kopijuoti grafiką';
  setDatasetValue(button, 'copyLabelBase', fallback);
  if (!getDatasetValue(button, 'tooltip')) {
    setDatasetValue(button, 'tooltip', fallback);
  }
}

export function setCopyButtonFeedback(button, message, tone = 'success') {
  if (!button) {
    return;
  }
  storeCopyButtonBaseLabel(button);
  const base = getDatasetValue(button, 'copyLabelBase', 'Kopijuoti grafiką');
  setDatasetValue(button, 'tooltip', message);
  button.setAttribute('aria-label', message);
  button.title = message;
  button.classList.add('is-feedback');
  if (tone === 'error') {
    button.classList.add('is-error');
  } else {
    button.classList.remove('is-error');
  }
  if (button.__copyResetTimeout) {
    window.clearTimeout(button.__copyResetTimeout);
  }
  button.__copyResetTimeout = window.setTimeout(() => {
    setDatasetValue(button, 'tooltip', base);
    button.setAttribute('aria-label', base);
    button.title = base;
    button.classList.remove('is-feedback');
    button.classList.remove('is-error');
  }, 2200);
}

export async function writeTextToClipboard(text) {
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function writeBlobToClipboard(blob, mimeType) {
  if (
    !navigator.clipboard ||
    typeof navigator.clipboard.write !== 'function' ||
    typeof window.ClipboardItem !== 'function'
  ) {
    return false;
  }
  const item = new ClipboardItem({ [mimeType]: blob });
  await navigator.clipboard.write([item]);
  return true;
}
