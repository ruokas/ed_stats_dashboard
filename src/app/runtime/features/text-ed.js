import { setSectionTitle } from './text-common.js';

export function applyEdText({ selectors, settings, TEXT, setDatasetValue }) {
  if (selectors.edHeading) {
    setSectionTitle(selectors.edHeading, settings.output.edTitle || TEXT.ed.title);
  }
  if (selectors.edStatus) {
    selectors.edStatus.textContent = '';
    setDatasetValue(selectors.edStatus, 'tone', 'info');
  }
}
