import { afterEach, describe, expect, it, vi } from 'vitest';
import { initExportMenus } from '../../src/app/runtime/features/export-menu.js';

describe('export menu', () => {
  afterEach(() => {
    if (window.__edExportMenus && typeof window.__edExportMenus.destroy === 'function') {
      window.__edExportMenus.destroy();
    }
    delete window.__edExportMenus;
    if (document.body?.dataset) {
      delete document.body.dataset.exportMenusInit;
    }
    document.body.innerHTML = '';
  });

  it('transforms chart toolbar copy/download into one export menu', () => {
    document.body.innerHTML = `
      <main class="container">
        <figure class="chart-card">
          <div class="chart-card__toolbar">
            <button type="button" class="chart-copy-btn" data-chart-copy data-chart-target="#dailyChart"></button>
            <button type="button" class="chart-download-btn" data-chart-download data-chart-target="#dailyChart"></button>
          </div>
        </figure>
      </main>
    `;

    initExportMenus();

    const menu = document.querySelector('.export-menu');
    expect(menu).not.toBeNull();
    const trigger = menu.querySelector('.export-menu__trigger');
    expect(trigger?.textContent).toContain('Eksportuoti');
    const items = Array.from(menu.querySelectorAll('.export-menu__item')).map((node) =>
      node.textContent?.trim()
    );
    expect(items).toContain('Kopijuoti PNG');
    expect(items).toContain('Parsisiųsti PNG');
    expect(items).toContain('Parsisiųsti CSV');
  });

  it('chart csv menu action triggers chart-download source with csv mode', () => {
    const clickSpy = vi.fn();
    document.body.innerHTML = `
      <main class="container">
        <figure class="chart-card">
          <div class="chart-card__toolbar">
            <button type="button" class="chart-copy-btn" data-chart-copy data-chart-target="#dailyChart"></button>
            <button type="button" id="downloadBtn" class="chart-download-btn" data-chart-download data-chart-target="#dailyChart"></button>
          </div>
        </figure>
      </main>
    `;
    const sourceButton = document.getElementById('downloadBtn');
    sourceButton.addEventListener('click', clickSpy);

    initExportMenus();

    const trigger = document.querySelector('.export-menu__trigger');
    trigger.click();
    const csvItem = Array.from(document.querySelectorAll('.export-menu__item')).find(
      (item) => item.textContent?.trim() === 'Parsisiųsti CSV'
    );
    expect(csvItem).not.toBeUndefined();

    csvItem.click();

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(sourceButton.getAttribute('data-chart-download')).toBe('');
  });
});
