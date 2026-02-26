import { beforeEach, describe, expect, it } from 'vitest';
import { initGlobalSearch } from '../../src/app/runtime/features/global-search.js';
import { createPageShellSelectors } from '../../src/state/selectors/helpers.js';

function renderShell() {
  document.body.innerHTML = `
    <header class="hero">
      <div class="hero__content">
        <nav class="section-nav hero__nav" aria-label="Pagrindinės sekcijos">
          <div class="section-nav__bar">
            <div class="section-nav__inner">
              <a class="section-nav__link" href="index.html"><span class="section-nav__label">Rodikliai</span></a>
              <a class="section-nav__link" href="charts.html"><span class="section-nav__label">Grafikai</span></a>
            </div>
          </div>
        </nav>
        <div class="hero__actions">
          <div class="hero__buttons">
            <button id="globalSearchBtn" type="button">Search</button>
          </div>
        </div>
      </div>
    </header>
    <main class="container">
      <section data-section="kpi"><h2 id="kpiHeading">KPI</h2></section>
    </main>`;
  document.body.dataset.page = 'kpi';
}

function getDialogState() {
  const dialog = document.querySelector('dialog.global-search');
  return {
    dialog,
    open: Boolean(dialog && (dialog.open || dialog.hasAttribute('open'))),
  };
}

describe('global search DOM behavior', () => {
  beforeEach(() => {
    renderShell();
    delete document.body.dataset.globalSearchInit;
    delete document.body.dataset.globalSearchIndex;
    document.querySelectorAll('dialog.global-search').forEach((node) => {
      node.remove();
    });
    if (typeof HTMLDialogElement !== 'undefined') {
      HTMLDialogElement.prototype.showModal = function showModalStub() {
        this.setAttribute('open', '');
      };
      HTMLDialogElement.prototype.close = function closeStub() {
        this.removeAttribute('open');
      };
    }
  });

  it('opens from the hero button click', () => {
    const selectors = createPageShellSelectors();
    initGlobalSearch({ selectors });

    document.getElementById('globalSearchBtn')?.click();

    const state = getDialogState();
    expect(state.dialog).toBeTruthy();
    expect(state.open).toBe(true);
    expect(document.body.dataset.globalSearchInit).toBe('true');
  });

  it('opens via delegated click after the button node is replaced', () => {
    const selectors = createPageShellSelectors();
    initGlobalSearch({ selectors });

    const original = document.getElementById('globalSearchBtn');
    const replacement = document.createElement('button');
    replacement.id = 'globalSearchBtn';
    replacement.type = 'button';
    replacement.textContent = 'Search replacement';
    original?.replaceWith(replacement);

    replacement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    const state = getDialogState();
    expect(state.dialog).toBeTruthy();
    expect(state.open).toBe(true);
  });

  it('opens with slash shortcut when focus is not in an editable field', () => {
    const selectors = createPageShellSelectors();
    initGlobalSearch({ selectors });

    const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);

    const state = getDialogState();
    expect(state.open).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });
});
