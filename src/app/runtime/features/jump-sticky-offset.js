export function initJumpStickyOffset({
  jumpNav,
  hero,
  jumpNavStickyTopVar,
  documentStickyTopVar = null,
  documentJumpNavHeightVar,
}) {
  if (!(jumpNav instanceof HTMLElement)) {
    return;
  }

  const applyOffset = () => {
    const measuredHeroHeight = hero instanceof HTMLElement ? hero.getBoundingClientRect().height : 0;
    const cssHeroHeight =
      Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hero-height')) || 0;
    const heroHeight = measuredHeroHeight > 0 ? measuredHeroHeight : cssHeroHeight;
    const offset = Math.max(56, Math.ceil(heroHeight) + 2);
    jumpNav.style.setProperty(jumpNavStickyTopVar, `${offset}px`);
    if (documentStickyTopVar) {
      document.documentElement.style.setProperty(documentStickyTopVar, `${offset}px`);
    }
    const jumpNavHeight = jumpNav.getBoundingClientRect().height;
    if (Number.isFinite(jumpNavHeight) && jumpNavHeight > 0 && documentJumpNavHeightVar) {
      document.documentElement.style.setProperty(documentJumpNavHeightVar, `${Math.ceil(jumpNavHeight)}px`);
    }
  };

  applyOffset();
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(applyOffset);
  } else {
    window.setTimeout(applyOffset, 0);
  }

  window.addEventListener('resize', applyOffset, { passive: true });
  window.addEventListener('orientationchange', applyOffset, { passive: true });
  window.addEventListener('load', applyOffset, { passive: true });
  if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
    window.visualViewport.addEventListener('resize', applyOffset, { passive: true });
  }
}
