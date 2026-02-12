import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initScrollTopButton: vi.fn(),
  initSectionNavigation: vi.fn(),
  initThemeToggle: vi.fn(),
  createLayoutTools: vi.fn(),
}));

vi.mock('../../src/events/scroll.js', () => ({
  initScrollTopButton: mocks.initScrollTopButton,
}));

vi.mock('../../src/events/section-nav.js', () => ({
  initSectionNavigation: mocks.initSectionNavigation,
}));

vi.mock('../../src/events/theme.js', () => ({
  initThemeToggle: mocks.initThemeToggle,
}));

vi.mock('../../src/app/runtime/layout.js', () => ({
  createLayoutTools: mocks.createLayoutTools,
}));

import { setupSharedPageUi } from '../../src/app/runtime/page-ui.js';

let layoutTools = null;

beforeEach(() => {
  vi.clearAllMocks();
  layoutTools = {
    updateScrollTopButtonVisibility: vi.fn(),
    scheduleScrollTopUpdate: vi.fn(),
  };
  mocks.createLayoutTools.mockReturnValue(layoutTools);
});

describe('setupSharedPageUi', () => {
  it('wires common UI controls and applies theme toggling callback', () => {
    const selectors = {
      sectionNav: document.createElement('nav'),
      themeToggleBtn: document.createElement('button'),
      scrollTopBtn: document.createElement('button'),
    };
    const dashboardState = { theme: 'dark' };
    const initializeTheme = vi.fn();
    const applyTheme = vi.fn();
    const onThemeChange = vi.fn();
    const afterSectionNavigation = vi.fn();

    setupSharedPageUi({
      selectors,
      dashboardState,
      initializeTheme,
      applyTheme,
      themeStorageKey: 'theme-key',
      onThemeChange,
      afterSectionNavigation,
    });

    expect(initializeTheme).toHaveBeenCalledWith(dashboardState, selectors, {
      themeStorageKey: 'theme-key',
    });
    expect(mocks.createLayoutTools).toHaveBeenCalledWith({ selectors });
    expect(mocks.initSectionNavigation).toHaveBeenCalledWith({
      selectors,
      ...layoutTools,
    });
    expect(afterSectionNavigation).toHaveBeenCalledOnce();
    expect(mocks.initScrollTopButton).toHaveBeenCalledWith({
      selectors,
      updateScrollTopButtonVisibility: layoutTools.updateScrollTopButtonVisibility,
      scheduleScrollTopUpdate: layoutTools.scheduleScrollTopUpdate,
    });
    expect(mocks.initThemeToggle).toHaveBeenCalledTimes(1);

    const toggleTheme = mocks.initThemeToggle.mock.calls[0][0].toggleTheme;
    toggleTheme();

    expect(applyTheme).toHaveBeenCalledWith(dashboardState, selectors, 'light', {
      persist: true,
      themeStorageKey: 'theme-key',
    });
    expect(onThemeChange).toHaveBeenCalledOnce();
  });

  it('supports setup without optional callbacks', () => {
    const selectors = {
      sectionNav: document.createElement('nav'),
      themeToggleBtn: document.createElement('button'),
      scrollTopBtn: document.createElement('button'),
    };
    const dashboardState = { theme: 'light' };
    const initializeTheme = vi.fn();
    const applyTheme = vi.fn();

    setupSharedPageUi({
      selectors,
      dashboardState,
      initializeTheme,
      applyTheme,
      themeStorageKey: 'theme-key',
    });

    const toggleTheme = mocks.initThemeToggle.mock.calls[0][0].toggleTheme;
    toggleTheme();
    expect(applyTheme).toHaveBeenCalledWith(dashboardState, selectors, 'dark', {
      persist: true,
      themeStorageKey: 'theme-key',
    });
  });
});
