import { registerServiceWorker } from '../../app.js';
import { loadChartJs } from '../utils/chart-loader.js';
import { enableLazyLoading, runAfterDomAndIdle } from '../utils/dom.js';

const SW_INIT_SESSION_KEY = 'edDashboard:sw-init:v2';

export function initializeServiceWorker({ updateClientConfig }) {
  const initDone = (() => {
    try {
      return window.sessionStorage.getItem(SW_INIT_SESSION_KEY) === 'true';
    } catch (_error) {
      return false;
    }
  })();

  if (initDone) {
    return;
  }

  const register = () => {
    registerServiceWorker('/service-worker.js').then((registration) => {
      if (registration?.scope && typeof updateClientConfig === 'function') {
        updateClientConfig({ swScope: registration.scope });
      }
      try {
        window.sessionStorage.setItem(SW_INIT_SESSION_KEY, 'true');
      } catch (_error) {
        // Ignore storage write issues.
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
