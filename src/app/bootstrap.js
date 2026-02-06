import { loadChartJs } from '../utils/chart-loader.js';
import { runAfterDomAndIdle, enableLazyLoading } from '../utils/dom.js';
import { registerServiceWorker } from '../../app.js';

export function initializeServiceWorker({ updateClientConfig }) {
  const register = () => {
    registerServiceWorker('/service-worker.js').then((registration) => {
      if (registration?.scope && typeof updateClientConfig === 'function') {
        updateClientConfig({ swScope: registration.scope });
      }
    });
  };
  // Defer SW registration to idle to reduce startup contention on first paint.
  runAfterDomAndIdle(register, { timeout: 1200 });
}

export function initializeLazyLoading() {
  enableLazyLoading();
}

export function preloadChartJs() {
  runAfterDomAndIdle(() => loadChartJs());
}
