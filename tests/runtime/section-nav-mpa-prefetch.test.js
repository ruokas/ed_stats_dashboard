import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initSectionNavigation } from '../../src/events/section-nav.js';

const connectionDescriptor = Object.getOwnPropertyDescriptor(navigator, 'connection');
const mozConnectionDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mozConnection');
const webkitConnectionDescriptor = Object.getOwnPropertyDescriptor(navigator, 'webkitConnection');

function setNavigatorProperty(name, value) {
  Object.defineProperty(navigator, name, {
    configurable: true,
    value,
  });
}

function restoreNavigatorProperties() {
  const restore = (name, descriptor) => {
    if (descriptor) {
      Object.defineProperty(navigator, name, descriptor);
    } else {
      Reflect.deleteProperty(navigator, name);
    }
  };
  restore('connection', connectionDescriptor);
  restore('mozConnection', mozConnectionDescriptor);
  restore('webkitConnection', webkitConnectionDescriptor);
}

function createEnv() {
  return {
    selectors: {
      sectionNav: document.querySelector('.section-nav'),
    },
    sectionNavState: { initialized: false },
    sectionVisibility: new Map(),
    sectionNavCompactQuery: null,
    setLayoutRefreshAllowed: vi.fn(),
    getLayoutResizeObserver: vi.fn(),
    setLayoutResizeObserver: vi.fn(),
    updateSectionNavCompactState: vi.fn(),
    handleNavKeydown: vi.fn(),
    scheduleLayoutRefresh: vi.fn(),
    syncSectionNavVisibility: vi.fn(),
    waitForFontsAndStyles: vi.fn().mockResolvedValue(undefined),
    updateLayoutMetrics: vi.fn(),
    refreshSectionObserver: vi.fn(),
    updateScrollTopButtonVisibility: vi.fn(),
    flushPendingLayoutRefresh: vi.fn(),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.head.querySelectorAll('link[rel="prefetch"]').forEach((node) => {
    node.remove();
  });
  document.body.innerHTML = `
    <nav class="section-nav">
      <div class="section-nav__bar">
        <div class="section-nav__inner">
          <a class="section-nav__link" href="/charts.html">Charts</a>
        </div>
      </div>
    </nav>
  `;
});

afterEach(() => {
  restoreNavigatorProperties();
  document.head.querySelectorAll('link[rel="prefetch"]').forEach((node) => {
    node.remove();
  });
});

describe('initSectionNavigation (mpa prefetch)', () => {
  it('ignores navigator.mozConnection and still allows prefetch intent', () => {
    setNavigatorProperty('connection', undefined);
    setNavigatorProperty('mozConnection', { saveData: true, effectiveType: '2g' });
    setNavigatorProperty('webkitConnection', { saveData: true, effectiveType: '2g' });

    const env = createEnv();
    initSectionNavigation(env);

    const link = document.querySelector('.section-nav__link');
    link.dispatchEvent(new Event('mouseenter', { bubbles: true }));

    const prefetch = document.head.querySelector('link[rel="prefetch"][href="/charts.html"]');
    expect(prefetch).not.toBeNull();
  });

  it('does not prefetch when navigator.connection.saveData is enabled', () => {
    setNavigatorProperty('connection', { saveData: true, effectiveType: '4g' });
    setNavigatorProperty('mozConnection', undefined);
    setNavigatorProperty('webkitConnection', undefined);

    const env = createEnv();
    initSectionNavigation(env);

    const link = document.querySelector('.section-nav__link');
    link.dispatchEvent(new Event('mouseenter', { bubbles: true }));

    const prefetch = document.head.querySelector('link[rel="prefetch"][href="/charts.html"]');
    expect(prefetch).toBeNull();
  });
});
