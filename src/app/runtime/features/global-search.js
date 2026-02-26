import { TEXT } from '../../constants.js';
import {
  buildActionResults,
  buildMetricResults,
  buildPageResultsFromNavLinks,
  buildSectionResults,
} from './global-search/index-builder.js';
import { normalizeSearchText } from './global-search/normalize.js';
import { buildPageHref, normalizePathnameToPageId } from './global-search/routes.js';
import { rankGlobalSearchResults } from './global-search/scoring.js';

function supportsDialogApi(dialog) {
  return dialog && typeof dialog.showModal === 'function' && typeof dialog.close === 'function';
}

function openDialog(dialog) {
  if (!(dialog instanceof HTMLElement)) {
    return;
  }
  if (supportsDialogApi(dialog)) {
    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch (_error) {
        dialog.setAttribute('open', '');
      }
    }
    return;
  }
  dialog.setAttribute('open', '');
}

function closeDialog(dialog) {
  if (!(dialog instanceof HTMLElement)) {
    return;
  }
  if (supportsDialogApi(dialog)) {
    if (dialog.open) {
      try {
        dialog.close();
      } catch (_error) {
        dialog.removeAttribute('open');
      }
    }
    return;
  }
  dialog.removeAttribute('open');
  dialog.dispatchEvent(new Event('close'));
}

function createPaletteDom() {
  const dialog = document.createElement('dialog');
  dialog.className = 'global-search';
  dialog.setAttribute('aria-label', TEXT.globalSearch?.dialogLabel || 'Globali paieška');
  dialog.innerHTML = `
    <div class="global-search__shell">
      <div class="global-search__header">
        <label class="sr-only" for="globalSearchInput">${TEXT.globalSearch?.inputLabel || 'Ieškoti'}</label>
        <input id="globalSearchInput" class="global-search__input" type="search" autocomplete="off" spellcheck="false"
          placeholder="${TEXT.globalSearch?.inputPlaceholder || 'Ieškoti...'}" aria-controls="globalSearchResults">
        <button type="button" class="global-search__close" aria-label="${TEXT.globalSearch?.hints?.close || 'Uždaryti'}">Esc</button>
      </div>
      <div class="global-search__help">
        <span>${TEXT.globalSearch?.hints?.navigate || 'Enter atidaro'}</span>
        <span>${TEXT.globalSearch?.hints?.close || 'Esc uždaro'}</span>
      </div>
      <div id="globalSearchEmpty" class="global-search__empty" hidden>${TEXT.globalSearch?.noResults || 'Rezultatų nerasta.'}</div>
      <div id="globalSearchResults" class="global-search__results" role="listbox" aria-label="${TEXT.globalSearch?.dialogLabel || 'Globali paieška'}"></div>
    </div>`;
  document.body.appendChild(dialog);
  return {
    dialog,
    input: /** @type {HTMLInputElement|null} */ (dialog.querySelector('#globalSearchInput')),
    closeButton: dialog.querySelector('.global-search__close'),
    resultsRoot: dialog.querySelector('#globalSearchResults'),
    emptyState: dialog.querySelector('#globalSearchEmpty'),
  };
}

function groupLabel(kind) {
  const labels = TEXT.globalSearch?.groups || {};
  if (kind === 'page') {
    return labels.pages || 'Puslapiai';
  }
  if (kind === 'section') {
    return labels.sections || 'Sekcijos';
  }
  if (kind === 'metric') {
    return labels.metrics || 'Rodikliai';
  }
  return labels.actions || 'Veiksmai';
}

function renderResults(resultsRoot, emptyState, results, activeId) {
  if (!(resultsRoot instanceof HTMLElement) || !(emptyState instanceof HTMLElement)) {
    return [];
  }
  const groups = new Map();
  results.forEach((result) => {
    const list = groups.get(result.kind) || [];
    list.push(result);
    groups.set(result.kind, list);
  });
  const order = ['action', 'page', 'section', 'metric'];
  const flat = [];
  const chunks = [];
  order.forEach((kind) => {
    const items = groups.get(kind);
    if (!items?.length) {
      return;
    }
    const itemHtml = items
      .map((item) => {
        const optionId = `globalSearchOption-${item.id.replace(/[^a-z0-9_-]/gi, '_')}`;
        flat.push({ ...item, optionId });
        const isActive = optionId === activeId;
        return `<button type="button" class="global-search__option${isActive ? ' is-active' : ''}" role="option" id="${optionId}" aria-selected="${isActive ? 'true' : 'false'}" data-result-id="${item.id}">
          <span class="global-search__option-title">${item.title}</span>
          ${item.subtitle ? `<span class="global-search__option-subtitle">${item.subtitle}</span>` : ''}
        </button>`;
      })
      .join('');
    chunks.push(`<section class="global-search__group" aria-label="${groupLabel(kind)}">
      <h3 class="global-search__group-title">${groupLabel(kind)}</h3>
      <div class="global-search__group-list">${itemHtml}</div>
    </section>`);
  });

  const hasResults = flat.length > 0;
  resultsRoot.innerHTML = hasResults ? chunks.join('') : '';
  emptyState.hidden = hasResults;
  return flat;
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable === true || tag === 'select';
}

function scrollToAnchorWithOffset(anchorId) {
  const target = document.getElementById(String(anchorId || ''));
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const hero = document.querySelector('header.hero');
  const jumpNav = document.querySelector('.charts-jump-nav, .summaries-jump-nav, .gydytojai-jump-nav');
  const heroHeight = hero instanceof HTMLElement ? hero.getBoundingClientRect().height : 0;
  const jumpHeight = jumpNav instanceof HTMLElement ? jumpNav.getBoundingClientRect().height : 0;
  const offset = Math.ceil(heroHeight + jumpHeight + 12);
  const top = Math.max(0, Math.round(window.scrollY + target.getBoundingClientRect().top - offset));
  window.scrollTo({ top, behavior: 'smooth' });
  const hash = `#${anchorId}`;
  if (window.location.hash !== hash) {
    if (window.history && typeof window.history.pushState === 'function') {
      window.history.pushState(null, '', hash);
    } else {
      window.location.hash = hash;
    }
  }
  return true;
}

function focusElement(el) {
  if (!(el instanceof HTMLElement)) {
    return;
  }
  window.requestAnimationFrame(() => {
    if (typeof el.focus === 'function') {
      el.focus();
    }
    if (el instanceof HTMLInputElement && typeof el.select === 'function') {
      el.select();
    }
  });
}

function resolveActionTarget(selectors, actionKey) {
  if (actionKey === 'chartsHospitalSearch') {
    return selectors?.chartsHospitalTableSearch || null;
  }
  if (actionKey === 'doctorsSearch') {
    return selectors?.gydytojaiSearch || null;
  }
  if (actionKey === 'edSearch') {
    return selectors?.edSearchInput || null;
  }
  return null;
}

function samePageHref(href) {
  const url = new URL(String(href || ''), window.location.href);
  const current = new URL(window.location.href);
  const normalize = (value) => (value.endsWith('/') ? `${value}index.html` : value);
  return normalize(url.pathname) === normalize(current.pathname);
}

function updateTriggerText(trigger) {
  if (!(trigger instanceof HTMLElement)) {
    return;
  }
  const label = TEXT.globalSearch?.triggerLabel || 'Atidaryti paiešką';
  const hint = TEXT.globalSearch?.triggerHint || 'Ctrl/Cmd+K / Alt+K';
  trigger.setAttribute('aria-label', label);
  trigger.setAttribute('title', `${label} (${hint})`);
}

export function initGlobalSearch({ selectors }) {
  if (!(document?.body instanceof HTMLElement)) {
    return;
  }
  if (document.body.dataset.globalSearchInit === 'true') {
    return;
  }
  document.body.dataset.globalSearchInit = 'starting';

  try {
    const trigger = selectors?.globalSearchBtn;
    updateTriggerText(trigger);

    const currentPageId = normalizePathnameToPageId(
      window.location.pathname || document.body.dataset.page || ''
    );
    let pageResults = [];
    let sectionResults = [];
    let actionResults = [];
    let baseResults = [];
    let metricResults = [];
    let metricResultsLoaded = false;
    let metricLoadRequested = false;
    let metricLoadPromise = null;

    const ui = createPaletteDom();
    if (
      !(ui.input instanceof HTMLInputElement) ||
      !(ui.resultsRoot instanceof HTMLElement) ||
      !(ui.emptyState instanceof HTMLElement)
    ) {
      document.body.dataset.globalSearchInit = 'error';
      return;
    }

    let isOpen = false;
    let activeIndex = 0;
    let lastFocused = null;
    let renderedResults = [];
    let currentQuery = '';

    try {
      pageResults = buildPageResultsFromNavLinks(selectors?.sectionNavLinks || [], currentPageId);
      sectionResults = buildSectionResults(currentPageId);
      actionResults = buildActionResults({ selectors, currentPageId });
      baseResults = [...pageResults, ...sectionResults];
      document.body.dataset.globalSearchIndex = 'ok';
    } catch (error) {
      console.error('Global search index bootstrap failed', error);
      pageResults = [];
      sectionResults = [];
      actionResults = [];
      baseResults = [];
      document.body.dataset.globalSearchIndex = 'error';
    }

    const setActiveIndex = (nextIndex) => {
      if (!renderedResults.length) {
        activeIndex = 0;
        ui.input.removeAttribute('aria-activedescendant');
        return;
      }
      const clamped =
        ((nextIndex % renderedResults.length) + renderedResults.length) % renderedResults.length;
      activeIndex = clamped;
      const active = renderedResults[activeIndex];
      ui.input.setAttribute('aria-activedescendant', active.optionId);
      const activeNode = document.getElementById(active.optionId);
      activeNode?.scrollIntoView?.({ block: 'nearest' });
      ui.resultsRoot.querySelectorAll('.global-search__option').forEach((node) => {
        node.classList.toggle('is-active', node.id === active.optionId);
      });
      ui.resultsRoot.querySelectorAll('[role="option"]').forEach((node) => {
        node.setAttribute('aria-selected', node.id === active.optionId ? 'true' : 'false');
      });
    };

    const render = () => {
      const includeMetrics = normalizeSearchText(currentQuery).length > 0;
      const results = rankGlobalSearchResults(
        [...actionResults, ...baseResults, ...(includeMetrics ? metricResults : [])],
        currentQuery,
        {
          includeMetrics,
        }
      );
      const activeId = renderedResults[activeIndex]?.optionId || '';
      renderedResults = renderResults(ui.resultsRoot, ui.emptyState, results, activeId);
      if (!renderedResults.length) {
        setActiveIndex(0);
        return;
      }
      const nextActive = renderedResults.findIndex((item) => item.optionId === activeId);
      setActiveIndex(nextActive >= 0 ? nextActive : 0);
    };

    const ensureMetricResults = () => {
      if (metricResultsLoaded || metricLoadRequested) {
        return metricLoadPromise;
      }
      metricLoadRequested = true;
      metricLoadPromise = buildMetricResults()
        .then((results) => {
          metricResults = Array.isArray(results) ? results : [];
          metricResultsLoaded = true;
        })
        .catch((error) => {
          console.error('Global search metrics index load failed', error);
          metricResults = [];
          metricResultsLoaded = true;
        })
        .finally(() => {
          if (isOpen) {
            render();
          }
        });
      return metricLoadPromise;
    };

    const open = () => {
      if (isOpen) {
        ui.input.focus();
        ui.input.select();
        return;
      }
      isOpen = true;
      lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      openDialog(ui.dialog);
      currentQuery = '';
      ui.input.value = '';
      activeIndex = 0;
      render();
      ui.input.focus();
      if (normalizeSearchText(currentQuery)) {
        void ensureMetricResults();
      }
    };

    const close = () => {
      if (!isOpen) {
        return;
      }
      isOpen = false;
      closeDialog(ui.dialog);
      currentQuery = '';
      ui.input.value = '';
      renderedResults = [];
      ui.input.removeAttribute('aria-activedescendant');
      if (lastFocused && document.contains(lastFocused)) {
        lastFocused.focus();
      }
    };

    const activateResult = (result) => {
      if (!result?.target) {
        return;
      }
      if (result.target.type === 'focus') {
        const target = resolveActionTarget(selectors, result.target.actionKey);
        close();
        focusElement(target);
        return;
      }
      const href = String(result.target.href || '');
      const anchorId = String(result.target.anchorId || '');
      if (samePageHref(href) && anchorId) {
        close();
        if (!scrollToAnchorWithOffset(anchorId)) {
          window.location.hash = `#${anchorId}`;
        }
        return;
      }
      close();
      window.location.href = href || buildPageHref('kpi');
    };

    ui.input.addEventListener('input', (event) => {
      currentQuery = String(event.target?.value || '');
      if (normalizeSearchText(currentQuery)) {
        void ensureMetricResults();
      }
      activeIndex = 0;
      render();
    });

    ui.input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex(activeIndex + 1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex(activeIndex - 1);
        return;
      }
      if (event.key === 'Enter') {
        const active = renderedResults[activeIndex];
        if (active) {
          event.preventDefault();
          activateResult(active);
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    });

    ui.resultsRoot.addEventListener('mousemove', (event) => {
      const option =
        event.target instanceof HTMLElement ? event.target.closest('.global-search__option') : null;
      if (!(option instanceof HTMLElement)) {
        return;
      }
      const nextIndex = renderedResults.findIndex((item) => item.optionId === option.id);
      if (nextIndex >= 0 && nextIndex !== activeIndex) {
        setActiveIndex(nextIndex);
      }
    });

    ui.resultsRoot.addEventListener('click', (event) => {
      const option =
        event.target instanceof HTMLElement ? event.target.closest('.global-search__option') : null;
      if (!(option instanceof HTMLElement)) {
        return;
      }
      const result = renderedResults.find((item) => item.optionId === option.id);
      if (result) {
        activateResult(result);
      }
    });

    ui.closeButton?.addEventListener('click', close);
    ui.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    ui.dialog.addEventListener('close', () => {
      isOpen = false;
    });
    ui.dialog.addEventListener('click', (event) => {
      if (event.target !== ui.dialog) {
        return;
      }
      const rect = ui.dialog.getBoundingClientRect();
      const within =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!within) {
        close();
      }
    });

    if (trigger instanceof HTMLElement) {
      trigger.addEventListener('click', () => {
        open();
      });
    }
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target instanceof Element ? event.target.closest('#globalSearchBtn') : null;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        event.preventDefault();
        open();
      },
      { capture: true }
    );

    document.addEventListener(
      'keydown',
      (event) => {
        const key = String(event.key || '').toLowerCase();
        const isPrimaryShortcut = (event.ctrlKey || event.metaKey) && !event.altKey && key === 'k';
        const isAltShortcut = event.altKey && !event.ctrlKey && !event.metaKey && key === 'k';
        const isSlashShortcut =
          key === '/' &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.shiftKey &&
          !isEditableTarget(event.target) &&
          !isOpen;
        if (!isPrimaryShortcut && !isAltShortcut && !isSlashShortcut) {
          return;
        }
        event.preventDefault();
        open();
      },
      { capture: true }
    );

    document.addEventListener('keydown', (event) => {
      if (!isOpen) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (!isOpen) {
        return;
      }
      if (event.target === ui.input) {
        return;
      }
      if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isEditableTarget(event.target)
      ) {
        ui.input.focus();
      }
    });

    render();
    document.body.dataset.globalSearchInit = 'true';
  } catch (error) {
    document.body.dataset.globalSearchInit = 'error';
    console.error('Global search init failed', error);
  }
}
