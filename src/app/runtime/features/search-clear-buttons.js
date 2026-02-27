const TARGET_IDS = ['chartsHospitalTableSearch', 'gydytojaiSearch', 'gydytojaiAnnualDoctorInput'];

function syncButton(input, button) {
  button.hidden = !String(input.value || '').trim();
}

function attachClearButton(input) {
  if (!(input instanceof HTMLInputElement) || input.dataset.clearBtnInit === 'true') {
    return;
  }
  input.dataset.clearBtnInit = 'true';
  const wrapper = document.createElement('div');
  wrapper.className = 'inline-clear-field';
  input.insertAdjacentElement('beforebegin', wrapper);
  wrapper.appendChild(input);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'inline-clear-field__button';
  button.setAttribute('aria-label', 'Išvalyti paiešką');
  button.textContent = '×';
  button.hidden = true;
  button.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    syncButton(input, button);
  });
  input.addEventListener('input', () => syncButton(input, button));
  input.addEventListener('change', () => syncButton(input, button));
  wrapper.appendChild(button);
  syncButton(input, button);
}

export function initSearchClearButtons() {
  TARGET_IDS.forEach((id) => {
    attachClearButton(document.getElementById(id));
  });
}
