import { loadChartJs } from '../utils/chart-loader.js';
import { runAfterDomAndIdle, enableLazyLoading } from '../utils/dom.js';
import { registerServiceWorker } from '../../app.js';

export function initializeServiceWorker({ updateClientConfig }) {
  registerServiceWorker('/service-worker.js').then((registration) => {
    if (registration?.scope && typeof updateClientConfig === 'function') {
      updateClientConfig({ swScope: registration.scope });
    }
  });
}

export function initializeLazyLoading() {
  enableLazyLoading();
}

export function preloadChartJs() {
  runAfterDomAndIdle(() => loadChartJs());
}
