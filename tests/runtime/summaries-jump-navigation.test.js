import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initSummariesJumpNavigation,
  initSummariesJumpStickyOffset,
} from '../../src/app/runtime/features/summaries-jump-navigation.js';

describe('summaries jump navigation', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('marks hash-matched link as active', () => {
    document.body.innerHTML = `
      <nav id="jumpNav">
        <a class="summaries-jump-nav__link" href="#sec1">One</a>
        <a class="summaries-jump-nav__link" href="#sec2">Two</a>
      </nav>
      <section id="sec1"></section>
      <section id="sec2"></section>
    `;
    const links = Array.from(document.querySelectorAll('.summaries-jump-nav__link'));
    const selectors = {
      summariesJumpNav: document.getElementById('jumpNav'),
      summariesJumpLinks: links,
    };
    window.scrollTo = vi.fn();
    window.location.hash = '#sec2';

    initSummariesJumpNavigation(selectors);

    expect(links[1].classList.contains('is-active')).toBe(true);
    expect(links[1].getAttribute('aria-current')).toBe('true');
    expect(links[0].classList.contains('is-active')).toBe(false);
  });

  it('applies sticky offset css variables', () => {
    document.body.innerHTML = `
      <header id="hero"></header>
      <nav id="jumpNav"></nav>
    `;
    const hero = document.getElementById('hero');
    const jumpNav = document.getElementById('jumpNav');
    const selectors = { hero, summariesJumpNav: jumpNav };
    hero.getBoundingClientRect = () => ({ height: 120 });
    jumpNav.getBoundingClientRect = () => ({ height: 44 });

    initSummariesJumpStickyOffset(selectors);

    expect(jumpNav.style.getPropertyValue('--summaries-jump-sticky-top')).toBe('122px');
    expect(document.documentElement.style.getPropertyValue('--summaries-jump-sticky-top')).toBe('122px');
  });
});
