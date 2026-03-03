function getButtonMode(button) {
  const tableMode = String(button.dataset.tableDownload || '').trim();
  const reportMode = String(button.dataset.reportExport || '').trim();
  if (tableMode || reportMode) {
    return tableMode || reportMode;
  }
  if (button.classList.contains('chart-copy-btn')) {
    return 'copy';
  }
  if (button.classList.contains('chart-download-btn')) {
    return 'png';
  }
  return '';
}

function getActionLabel(button) {
  const mode = getButtonMode(button);
  if (mode === 'copy') {
    return 'Kopijuoti PNG';
  }
  if (mode === 'png') {
    return 'Parsisiųsti PNG';
  }
  if (mode === 'csv') {
    return 'Parsisiųsti CSV';
  }
  return button.getAttribute('title') || 'Eksportuoti';
}

function isExportSourceButton(node) {
  return (
    node instanceof HTMLButtonElement &&
    (node.matches('.chart-copy-btn') || node.matches('.chart-download-btn')) &&
    (node.hasAttribute('data-table-download') ||
      node.hasAttribute('data-report-export') ||
      node.hasAttribute('data-chart-target') ||
      node.hasAttribute('data-table-target') ||
      node.hasAttribute('data-report-key'))
  );
}

function buildGroupKey(button) {
  if (button.hasAttribute('data-chart-target')) {
    return `chart:${button.getAttribute('data-chart-target') || ''}`;
  }
  if (button.hasAttribute('data-table-target')) {
    return `table:${button.getAttribute('data-table-target') || ''}:${button.getAttribute('data-table-title') || ''}`;
  }
  if (button.hasAttribute('data-report-key')) {
    return `report:${button.getAttribute('data-report-key') || ''}`;
  }
  return `button:${button.id || ''}:${button.className}`;
}

function getGroupType(buttons = []) {
  if (buttons.some((button) => button.hasAttribute('data-table-target'))) {
    return 'table';
  }
  if (buttons.some((button) => button.hasAttribute('data-chart-target'))) {
    return 'chart';
  }
  if (buttons.some((button) => button.hasAttribute('data-report-key'))) {
    return 'report';
  }
  return 'button';
}

function closeAllMenus(except = null) {
  document.querySelectorAll('.export-menu[data-open="true"]').forEach((menu) => {
    if (except && menu === except) {
      return;
    }
    menu.dataset.open = 'false';
    const trigger = menu.querySelector('.export-menu__trigger');
    if (trigger instanceof HTMLButtonElement) {
      trigger.setAttribute('aria-expanded', 'false');
    }
  });
}

function createMenuForGroup(buttons) {
  const wrapper = document.createElement('div');
  wrapper.className = 'export-menu';
  wrapper.dataset.open = 'false';
  const menuId = `exportMenu-${Math.random().toString(36).slice(2, 10)}`;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'btn btn-secondary btn-small export-menu__trigger';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-controls', menuId);
  trigger.innerHTML = `
    <span>Eksportuoti</span>
    <span class="export-menu__caret" aria-hidden="true">▾</span>
  `;
  const menu = document.createElement('div');
  menu.className = 'export-menu__list';
  menu.id = menuId;
  menu.setAttribute('role', 'menu');

  const groupType = getGroupType(buttons);
  const isTableGroup = groupType === 'table';
  const isChartGroup = groupType === 'chart';
  let hasCsv = false;

  buttons.forEach((sourceButton, index) => {
    const mode = getButtonMode(sourceButton);
    if (mode === 'csv') {
      hasCsv = true;
    }
    sourceButton.hidden = true;
    sourceButton.classList.add('export-menu__source');
    sourceButton.setAttribute('tabindex', '-1');
    sourceButton.setAttribute('aria-hidden', 'true');
    sourceButton.dataset.exportMenuSource = 'true';
    sourceButton.style.setProperty('display', 'none', 'important');

    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'export-menu__item';
    item.setAttribute('role', 'menuitem');
    item.textContent = getActionLabel(sourceButton);
    item.dataset.sourceIndex = String(index);
    item.addEventListener('click', () => {
      sourceButton.click();
      wrapper.dataset.open = 'false';
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    });
    menu.appendChild(item);
  });

  if ((isTableGroup || isChartGroup) && !hasCsv && buttons.length) {
    const sourceButton = isTableGroup
      ? buttons[0]
      : buttons.find((button) => button.classList.contains('chart-download-btn')) || buttons[0];
    if (!(sourceButton instanceof HTMLButtonElement)) {
      wrapper.append(trigger, menu);
      return wrapper;
    }
    const csvItem = document.createElement('button');
    csvItem.type = 'button';
    csvItem.className = 'export-menu__item';
    csvItem.setAttribute('role', 'menuitem');
    csvItem.textContent = 'Parsisiųsti CSV';
    csvItem.addEventListener('click', () => {
      const attrName = isTableGroup ? 'data-table-download' : 'data-chart-download';
      const previous = sourceButton.getAttribute(attrName);
      sourceButton.setAttribute(attrName, 'csv');
      sourceButton.click();
      if (previous == null) {
        sourceButton.removeAttribute(attrName);
      } else {
        sourceButton.setAttribute(attrName, previous);
      }
      wrapper.dataset.open = 'false';
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    });
    menu.appendChild(csvItem);
  }

  trigger.addEventListener('click', () => {
    const isOpen = wrapper.dataset.open === 'true';
    if (!isOpen) {
      closeAllMenus(wrapper);
    }
    wrapper.dataset.open = isOpen ? 'false' : 'true';
    trigger.setAttribute('aria-expanded', String(!isOpen));
    if (!isOpen) {
      window.setTimeout(() => {
        const first = menu.querySelector('.export-menu__item');
        if (first instanceof HTMLButtonElement) {
          first.focus();
        }
      }, 0);
    }
  });

  wrapper.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      wrapper.dataset.open = 'false';
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
      event.preventDefault();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    const items = Array.from(wrapper.querySelectorAll('.export-menu__item'));
    if (!items.length) {
      return;
    }
    const activeIndex = items.indexOf(document.activeElement);
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = activeIndex < 0 ? 0 : (activeIndex + direction + items.length) % items.length;
    const next = items[nextIndex];
    if (next instanceof HTMLButtonElement) {
      next.focus();
      event.preventDefault();
    }
  });

  wrapper.append(trigger, menu);
  return wrapper;
}

function transformContainer(container) {
  if (!(container instanceof Element)) {
    return;
  }
  const buttons = Array.from(container.children).filter(isExportSourceButton);
  if (!buttons.length) {
    return;
  }

  const used = new Set();
  buttons.forEach((button) => {
    if (used.has(button) || button.dataset.exportMenuSource === 'true' || button.closest('.export-menu')) {
      return;
    }
    const group = [button];
    used.add(button);
    const groupKey = buildGroupKey(button);
    let next = button.nextElementSibling;
    while (isExportSourceButton(next) && buildGroupKey(next) === groupKey) {
      group.push(next);
      used.add(next);
      next = next.nextElementSibling;
    }
    if (!group.length) {
      return;
    }
    const wrapper = createMenuForGroup(group);
    button.insertAdjacentElement('beforebegin', wrapper);
  });
}

function scanAndTransform(root = document) {
  const actionContainersSelector =
    '.section__actions, .chart-card__actions, .chart-card__toolbar, .hourly-toolbar__actions-inline, .report-card__actions, .feedback-trend-card__actions, .table-actions, .feedback-table-actions';
  root.querySelectorAll(actionContainersSelector).forEach((container) => {
    transformContainer(container);
  });
}

export function initExportMenus() {
  if (document.body?.dataset?.exportMenusInit === 'true') {
    return window.__edExportMenus || null;
  }
  document.body.dataset.exportMenusInit = 'true';
  scanAndTransform(document);

  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) {
          return;
        }
        if (
          node.matches(
            '.section__actions, .chart-card__actions, .chart-card__toolbar, .hourly-toolbar__actions-inline, .report-card__actions, .feedback-trend-card__actions'
          )
        ) {
          transformContainer(node);
          return;
        }
        scanAndTransform(node);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const onDocumentClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('.export-menu')) {
      return;
    }
    closeAllMenus();
  };
  document.addEventListener('click', onDocumentClick, true);

  const api = {
    refresh() {
      scanAndTransform(document);
    },
    destroy() {
      observer.disconnect();
      document.removeEventListener('click', onDocumentClick, true);
    },
  };
  window.__edExportMenus = api;
  return api;
}
