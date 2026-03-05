export function createEdSkeletonFeature({
  selectors,
  text,
  setDatasetValue,
  getDatasetValue,
  minVisibleMs = 450,
}) {
  let edSkeletonShownAt = 0;
  let edSkeletonHideTimerId = null;

  function buildEdSkeletonCardCatalog() {
    const cardsRoot = text?.ed?.cards;
    const catalogs = [];
    if (Array.isArray(cardsRoot)) {
      catalogs.push(cardsRoot);
    } else if (cardsRoot && typeof cardsRoot === 'object') {
      if (Array.isArray(cardsRoot.snapshot)) {
        catalogs.push(cardsRoot.snapshot);
      }
      if (Array.isArray(cardsRoot.legacy)) {
        catalogs.push(cardsRoot.legacy);
      }
    }
    const deduped = new Map();
    catalogs.flat().forEach((card, index) => {
      if (!card || typeof card !== 'object') {
        return;
      }
      const key = `${card.section || 'default'}::${card.key || card.title || index}::${card.type || 'default'}`;
      if (!deduped.has(key)) {
        deduped.set(key, card);
      }
    });
    return Array.from(deduped.values());
  }

  function buildEdSkeletonSections() {
    const sectionMeta = text?.ed?.cardSections || {};
    const sectionOrder = Object.keys(sectionMeta);
    const sectionsByKey = new Map();
    const cards = buildEdSkeletonCardCatalog();
    cards.forEach((card) => {
      const key = typeof card.section === 'string' && card.section.trim() ? card.section.trim() : 'default';
      if (!sectionsByKey.has(key)) {
        const meta = sectionMeta[key] || sectionMeta.default || {};
        sectionsByKey.set(key, {
          key,
          title: meta.title || '',
          description: meta.description || '',
          cards: [],
        });
      }
      sectionsByKey.get(key).cards.push(card);
    });
    const sections = Array.from(sectionsByKey.values()).filter(
      (section) => Array.isArray(section.cards) && section.cards.length
    );
    sections.sort((a, b) => {
      const aIndex = sectionOrder.indexOf(a.key);
      const bIndex = sectionOrder.indexOf(b.key);
      const normalizedA = aIndex === -1 ? Number.POSITIVE_INFINITY : aIndex;
      const normalizedB = bIndex === -1 ? Number.POSITIVE_INFINITY : bIndex;
      return normalizedA - normalizedB;
    });
    return sections;
  }

  function createEdSkeletonCard() {
    const card = document.createElement('article');
    card.className = 'ed-dashboard__card ed-dashboard__card--skeleton';

    const title = document.createElement('div');
    title.className = 'skeleton skeleton--title';
    const value = document.createElement('div');
    value.className = 'skeleton skeleton--value';
    const detailPrimary = document.createElement('div');
    detailPrimary.className = 'skeleton skeleton--detail';
    const detailSecondary = document.createElement('div');
    detailSecondary.className = 'skeleton skeleton--detail';
    card.append(title, value, detailPrimary, detailSecondary);
    return card;
  }

  function createEdSkeletonSection(section) {
    const sectionEl = document.createElement('section');
    sectionEl.className = 'ed-dashboard__section ed-dashboard__section--skeleton';
    sectionEl.setAttribute('aria-hidden', 'true');
    if (section?.key) {
      setDatasetValue(sectionEl, 'sectionKey', section.key);
    }

    const header = document.createElement('div');
    header.className = 'ed-dashboard__section-header';
    const icon = document.createElement('div');
    icon.className = 'ed-dashboard__section-icon skeleton skeleton--chip';
    const textWrapper = document.createElement('div');
    textWrapper.className = 'ed-dashboard__section-header-text';
    const title = document.createElement('div');
    title.className = 'skeleton skeleton--title';
    const subtitle = document.createElement('div');
    subtitle.className = 'skeleton skeleton--detail';
    textWrapper.append(title, subtitle);
    header.append(icon, textWrapper);

    const grid = document.createElement('div');
    grid.className = 'ed-dashboard__section-grid';
    const cards = Array.isArray(section?.cards) ? section.cards : [];
    cards.forEach(() => {
      grid.appendChild(createEdSkeletonCard());
    });
    sectionEl.append(header, grid);
    return sectionEl;
  }

  function showEdSkeleton() {
    const container = selectors.edCards;
    if (!container || getDatasetValue(container, 'skeleton') === 'true') {
      return;
    }
    if (selectors.edStandardSection) {
      selectors.edStandardSection.setAttribute('aria-busy', 'true');
    }
    if (edSkeletonHideTimerId) {
      window.clearTimeout(edSkeletonHideTimerId);
      edSkeletonHideTimerId = null;
    }
    edSkeletonShownAt = Date.now();
    setDatasetValue(container, 'skeleton', 'true');
    const sections = buildEdSkeletonSections();
    if (!sections.length) {
      container.replaceChildren();
      return;
    }
    const flatCards = sections.flatMap((section) => (Array.isArray(section?.cards) ? section.cards : []));
    const limitedCards = flatCards.slice(0, 3);
    if (!limitedCards.length) {
      container.replaceChildren();
      return;
    }
    const baseSection = sections[0] || {};
    const compactSection = {
      key: baseSection.key || 'default',
      title: baseSection.title || '',
      description: baseSection.description || '',
      cards: limitedCards,
    };
    const fragment = document.createDocumentFragment();
    fragment.appendChild(createEdSkeletonSection(compactSection));
    container.replaceChildren(fragment);
  }

  function hideEdSkeleton() {
    const container = selectors.edCards;
    if (!container) {
      return;
    }
    const isSkeletonVisible = getDatasetValue(container, 'skeleton') === 'true';
    if (isSkeletonVisible && edSkeletonShownAt > 0) {
      const elapsed = Date.now() - edSkeletonShownAt;
      if (elapsed < minVisibleMs) {
        if (!edSkeletonHideTimerId) {
          edSkeletonHideTimerId = window.setTimeout(() => {
            edSkeletonHideTimerId = null;
            hideEdSkeleton();
          }, minVisibleMs - elapsed);
        }
        return;
      }
    }
    if (selectors.edStandardSection) {
      selectors.edStandardSection.removeAttribute('aria-busy');
    }
    if (isSkeletonVisible) {
      container.replaceChildren();
    }
    edSkeletonShownAt = 0;
    setDatasetValue(container, 'skeleton', null);
  }

  function cleanupEdSkeletonTimers() {
    if (edSkeletonHideTimerId) {
      window.clearTimeout(edSkeletonHideTimerId);
      edSkeletonHideTimerId = null;
    }
  }

  return {
    showEdSkeleton,
    hideEdSkeleton,
    cleanupEdSkeletonTimers,
  };
}
