import { describe, expect, it, vi } from 'vitest';
import { initJumpStickyOffset } from '../../src/app/runtime/features/jump-sticky-offset.js';

describe('initJumpStickyOffset', () => {
  it('applies sticky offset and nav height using measured hero height', () => {
    document.body.innerHTML = '<section id="hero"></section><nav id="jump"></nav>';
    const hero = document.getElementById('hero');
    const jumpNav = document.getElementById('jump');
    hero.getBoundingClientRect = () => ({ height: 120 });
    jumpNav.getBoundingClientRect = () => ({ height: 42 });

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback();
      return 1;
    });
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const viewportResizeSpy = vi.fn();
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        addEventListener: viewportResizeSpy,
      },
    });

    initJumpStickyOffset({
      jumpNav,
      hero,
      jumpNavStickyTopVar: '--test-jump-top',
      documentStickyTopVar: '--test-jump-top-doc',
      documentJumpNavHeightVar: '--test-jump-nav-height',
    });

    expect(jumpNav.style.getPropertyValue('--test-jump-top')).toBe('122px');
    expect(document.documentElement.style.getPropertyValue('--test-jump-top-doc')).toBe('122px');
    expect(document.documentElement.style.getPropertyValue('--test-jump-nav-height')).toBe('42px');
    expect(addEventListenerSpy).toHaveBeenCalled();
    expect(viewportResizeSpy).toHaveBeenCalledWith('resize', expect.any(Function), { passive: true });

    rafSpy.mockRestore();
    addEventListenerSpy.mockRestore();
  });

  it('falls back to css hero height when measured hero height is zero', () => {
    document.body.innerHTML = '<section id="hero"></section><nav id="jump"></nav>';
    const hero = document.getElementById('hero');
    const jumpNav = document.getElementById('jump');
    document.documentElement.style.setProperty('--hero-height', '80px');
    hero.getBoundingClientRect = () => ({ height: 0 });
    jumpNav.getBoundingClientRect = () => ({ height: 20 });

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback();
      return 1;
    });

    initJumpStickyOffset({
      jumpNav,
      hero,
      jumpNavStickyTopVar: '--fallback-jump-top',
      documentJumpNavHeightVar: '--fallback-jump-nav-height',
    });

    expect(jumpNav.style.getPropertyValue('--fallback-jump-top')).toBe('82px');
    expect(document.documentElement.style.getPropertyValue('--fallback-jump-nav-height')).toBe('20px');
    rafSpy.mockRestore();
  });
});
