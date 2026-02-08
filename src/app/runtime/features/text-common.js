export function setSectionTitle(heading, text) {
  if (!heading) {
    return;
  }
  const textNode = heading.querySelector('.section-title__text');
  if (textNode) {
    textNode.textContent = text;
  } else {
    heading.textContent = text;
  }
}

export function applyCommonText({
  selectors,
  settings,
  TEXT,
  dashboardState,
  setDatasetValue,
  updateFullscreenControls,
  hideStatusNote,
}) {
  if (selectors.title) {
    selectors.title.textContent = TEXT.title;
  }

  if (selectors.tabOverview) {
    selectors.tabOverview.textContent = settings.output.tabOverviewLabel || TEXT.tabs.overview;
  }

  if (selectors.edNavButton) {
    const edNavLabel = settings.output.tabEdLabel || TEXT.tabs.ed;
    const openLabel = typeof TEXT.edToggle?.open === 'function'
      ? TEXT.edToggle.open(edNavLabel)
      : `Atidaryti ${edNavLabel}`;
    const closeLabel = typeof TEXT.edToggle?.close === 'function'
      ? TEXT.edToggle.close(edNavLabel)
      : `Uždaryti ${edNavLabel}`;
    setDatasetValue(selectors.edNavButton, 'panelLabel', edNavLabel);
    setDatasetValue(selectors.edNavButton, 'openLabel', openLabel);
    setDatasetValue(selectors.edNavButton, 'closeLabel', closeLabel);
    const isActive = dashboardState.activeTab === 'ed';
    const currentLabel = isActive ? closeLabel : openLabel;
    selectors.edNavButton.setAttribute('aria-label', currentLabel);
    selectors.edNavButton.title = currentLabel;
  }

  if (selectors.closeEdPanelBtn) {
    const overviewLabel = settings.output.tabOverviewLabel || TEXT.tabs.overview;
    const closeLabel = typeof TEXT.ed?.closeButton === 'function'
      ? TEXT.ed.closeButton(overviewLabel)
      : (TEXT.ed?.closeButton || 'Grįžti');
    selectors.closeEdPanelBtn.setAttribute('aria-label', closeLabel);
    selectors.closeEdPanelBtn.title = closeLabel;
    const labelSpan = selectors.closeEdPanelBtn.querySelector('span');
    if (labelSpan) {
      labelSpan.textContent = closeLabel;
    } else {
      selectors.closeEdPanelBtn.textContent = closeLabel;
    }
  }

  if (selectors.themeToggleBtn) {
    selectors.themeToggleBtn.setAttribute('aria-label', TEXT.theme.toggle);
    selectors.themeToggleBtn.title = `${TEXT.theme.toggle} (Ctrl+Shift+L)`;
  }
  updateFullscreenControls();

  if (selectors.compareToggle) {
    selectors.compareToggle.textContent = TEXT.compare.toggle;
  }

  if (selectors.scrollTopBtn) {
    selectors.scrollTopBtn.textContent = TEXT.scrollTop;
    selectors.scrollTopBtn.setAttribute('aria-label', TEXT.scrollTop);
    selectors.scrollTopBtn.title = `${TEXT.scrollTop} (Home)`;
  }

  if (selectors.compareSummary) {
    selectors.compareSummary.textContent = TEXT.compare.prompt;
  }

  hideStatusNote();
}
