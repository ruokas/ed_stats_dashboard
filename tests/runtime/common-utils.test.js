import { describe, expect, it } from 'vitest';
import {
  createStatusSetter,
  matchesWildcard,
  parseCandidateList,
} from '../../src/app/runtime/utils/common.js';

describe('parseCandidateList', () => {
  it('splits candidates by supported separators and trims values', () => {
    const value = 'A, B\nC|D;E';
    expect(parseCandidateList(value)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});

describe('matchesWildcard', () => {
  it('supports star wildcard matching', () => {
    expect(matchesWildcard('labas-123', 'labas-*')).toBe(true);
    expect(matchesWildcard('labas-123', 'viso-*')).toBe(false);
  });
});

describe('createStatusSetter', () => {
  it('updates status node classes and text', () => {
    document.body.innerHTML = '<div id="status"></div>';
    const selectors = { status: document.getElementById('status') };
    const setStatus = createStatusSetter({
      loading: 'Kraunama',
      error: 'Klaida',
      errorDetails: (detail) => `Klaida: ${detail}`,
      success: 'Gerai',
    });

    setStatus(selectors, 'loading');
    expect(selectors.status.classList.contains('status--loading')).toBe(true);
    expect(selectors.status.getAttribute('aria-label')).toBe('Kraunama');

    setStatus(selectors, 'error', 'Nepavyko');
    expect(selectors.status.classList.contains('status--error')).toBe(true);
    expect(selectors.status.textContent).toBe('Klaida: Nepavyko');

    setStatus(selectors, 'success');
    expect(selectors.status.classList.contains('status--success')).toBe(true);
    expect(selectors.status.textContent).toBe('Gerai');
  });

  it('supports function-based status messages and optional success suppression', () => {
    document.body.innerHTML = '<div id="status"></div>';
    const selectors = { status: document.getElementById('status') };
    const setStatus = createStatusSetter(
      {
        loading: () => 'Kraunama',
        error: () => 'Klaida',
        success: () => '',
      },
      { showSuccessState: false }
    );

    setStatus(selectors, 'loading');
    expect(selectors.status.getAttribute('aria-label')).toBe('Kraunama');

    setStatus(selectors, 'success');
    expect(selectors.status.classList.contains('status--success')).toBe(false);
  });
});
