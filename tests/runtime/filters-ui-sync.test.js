import { describe, expect, it, vi } from 'vitest';

import {
  createDebouncedHandler,
  syncAriaPressed,
  syncDisabledState,
  syncSummary,
} from '../../src/app/runtime/filters/ui-sync.js';

describe('filters ui-sync helpers', () => {
  it('syncs aria-pressed for button groups', () => {
    document.body.innerHTML = `
      <button data-v="all" aria-pressed="false"></button>
      <button data-v="ems" aria-pressed="false"></button>
      <button data-v="self" aria-pressed="false"></button>
    `;
    const buttons = Array.from(document.querySelectorAll('button'));
    syncAriaPressed(buttons, (button) => button.getAttribute('data-v'), 'ems');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[2].getAttribute('aria-pressed')).toBe('false');
  });

  it('syncs disabled and aria-disabled state', () => {
    document.body.innerHTML = `
      <button id="a"></button>
      <input id="b" />
    `;
    const elements = [document.getElementById('a'), document.getElementById('b')];
    syncDisabledState(elements, true, 'Laikinai neaktyvu');
    expect(elements[0].disabled).toBe(true);
    expect(elements[1].disabled).toBe(true);
    expect(elements[0].getAttribute('aria-disabled')).toBe('true');
    expect(elements[0].getAttribute('title')).toBe('Laikinai neaktyvu');
    syncDisabledState(elements, false);
    expect(elements[0].disabled).toBe(false);
    expect(elements[1].disabled).toBe(false);
    expect(elements[0].getAttribute('aria-disabled')).toBe('false');
    expect(elements[0].hasAttribute('title')).toBe(false);
  });

  it('syncs summary text and default marker', () => {
    document.body.innerHTML = '<p id="summary"></p>';
    const element = document.getElementById('summary');
    syncSummary(element, 'Numatytieji filtrai', true);
    expect(element.textContent).toBe('Numatytieji filtrai');
    expect(element.dataset.default).toBe('true');
    syncSummary(element, 'Metai: 2025', false);
    expect(element.textContent).toBe('Metai: 2025');
    expect(element.dataset.default).toBe('false');
  });

  it('debounced handler delays callback and keeps latest args', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const handler = createDebouncedHandler(spy, 250);
    handler('a');
    handler('b');
    vi.advanceTimersByTime(250);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('b');
    vi.useRealTimers();
  });
});
