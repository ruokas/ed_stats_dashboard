import { buildStateSummaryItems } from './state-summary.js';

const PAGE_RESET_ACTIONS = {
  kpi: { buttonId: 'kpiFiltersReset', label: 'Atkurti filtrus' },
  charts: { buttonId: 'chartFiltersReset', label: 'Atkurti filtrus' },
  summaries: { buttonId: 'summariesReportsReset', label: 'Atkurti filtrus' },
  gydytojai: { buttonId: 'gydytojaiResetFilters', label: 'Atkurti filtrus' },
  feedback: { buttonId: 'feedbackFiltersReset', label: 'Atkurti filtrus' },
  recent: { buttonId: 'compareClear', label: 'Išvalyti palyginimą' },
};

function ensureStateStrip() {
  let root = document.getElementById('pageStateStrip');
  if (root) {
    return root;
  }
  const hero = document.querySelector('header.hero');
  if (!hero || !hero.parentNode) {
    return null;
  }
  root = document.createElement('section');
  root.id = 'pageStateStrip';
  root.className = 'page-state-strip';
  root.setAttribute('aria-label', 'Aktyvi puslapio būsena');
  root.innerHTML = `
    <div class="container page-state-strip__inner">
      <div id="pageStateStripSummary" class="page-state-strip__summary" role="status" aria-live="polite"></div>
      <div class="page-state-strip__actions">
        <button id="pageStateStripReset" type="button" class="btn btn-secondary btn-small page-state-strip__btn" hidden>
          Atkurti filtrus
        </button>
      </div>
    </div>
  `;
  hero.insertAdjacentElement('afterend', root);
  return root;
}

function getPageId() {
  return String(document.body?.dataset?.page || 'kpi')
    .trim()
    .toLowerCase();
}

function getRecentCompareSelectionCount() {
  const rows = Array.from(document.querySelectorAll('#recentTable tr.table-row--selected'));
  return rows.length;
}

function getRecentCompareModeActive() {
  const card = document.getElementById('compareCard');
  return Boolean(card && !card.hasAttribute('hidden'));
}

function getPageExtras(pageId) {
  if (pageId === 'recent') {
    const compareActive = getRecentCompareModeActive();
    const selected = getRecentCompareSelectionCount();
    const items = [];
    items.push({
      key: 'compareMode',
      label: 'Palyginimas',
      value: compareActive ? 'Įjungtas' : 'Išjungtas',
    });
    if (compareActive) {
      items.push({ key: 'compareSelection', label: 'Pasirinkta', value: `${selected}/2` });
    }
    return items;
  }
  return [];
}

function formatSummary(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<span class="page-state-strip__empty">Numatyti filtrai</span>`;
  }
  return items
    .map(
      (item) =>
        `<span class="page-state-chip" data-key="${item.key}"><span class="page-state-chip__label">${item.label}:</span> <span class="page-state-chip__value">${item.value}</span></span>`
    )
    .join('');
}

function queueAnimationFrame(fn) {
  let rafId = 0;
  return () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      fn();
    });
  };
}

export function initStateStrip() {
  const pageId = getPageId();
  if (pageId === 'ed' || pageId === 'kpi') {
    return null;
  }
  const root = ensureStateStrip();
  if (!root) {
    return null;
  }
  const summaryEl = root.querySelector('#pageStateStripSummary');
  const resetBtn = root.querySelector('#pageStateStripReset');
  const resetConfig = PAGE_RESET_ACTIONS[pageId] || null;

  const render = () => {
    if (!summaryEl) {
      return;
    }
    const items = [...buildStateSummaryItems(pageId), ...getPageExtras(pageId)];
    summaryEl.innerHTML = formatSummary(items);

    if (resetBtn && resetConfig) {
      const sourceButton = document.getElementById(resetConfig.buttonId);
      const shouldShowForRecent =
        pageId !== 'recent' || (getRecentCompareModeActive() && getRecentCompareSelectionCount() > 0);
      const visible = Boolean(sourceButton) && shouldShowForRecent;
      resetBtn.hidden = !visible;
      resetBtn.textContent = resetConfig.label;
      resetBtn.disabled = !visible;
    } else if (resetBtn) {
      resetBtn.hidden = true;
      resetBtn.disabled = true;
    }
  };

  const scheduleRender = queueAnimationFrame(render);

  if (resetBtn && resetBtn.dataset.bound !== 'true') {
    resetBtn.dataset.bound = 'true';
    resetBtn.addEventListener('click', () => {
      const config = PAGE_RESET_ACTIONS[getPageId()];
      if (!config) {
        return;
      }
      const sourceButton = document.getElementById(config.buttonId);
      if (sourceButton instanceof HTMLElement && !sourceButton.hasAttribute('disabled')) {
        sourceButton.click();
      }
    });
  }

  window.addEventListener('app:query-updated', scheduleRender);
  window.addEventListener('app:runtime-ready', scheduleRender);
  window.addEventListener('hashchange', scheduleRender);
  document.addEventListener('change', scheduleRender, true);
  document.addEventListener('click', scheduleRender, true);
  document.addEventListener('input', scheduleRender, true);

  render();

  const api = {
    refresh: render,
    destroy() {
      window.removeEventListener('app:query-updated', scheduleRender);
      window.removeEventListener('app:runtime-ready', scheduleRender);
      window.removeEventListener('hashchange', scheduleRender);
      document.removeEventListener('change', scheduleRender, true);
      document.removeEventListener('click', scheduleRender, true);
      document.removeEventListener('input', scheduleRender, true);
    },
  };
  window.__edStateStrip = api;
  return api;
}
