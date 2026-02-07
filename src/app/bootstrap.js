import { loadChartJs } from '../utils/chart-loader.js';
import { runAfterDomAndIdle, enableLazyLoading } from '../utils/dom.js';
import { registerServiceWorker } from '../../app.js';

const SW_INIT_SESSION_KEY = 'edDashboard:sw-init:v2';

export function initializeServiceWorker({ updateClientConfig }) {
  const initDone = (() => {
    try {
      return window.sessionStorage.getItem(SW_INIT_SESSION_KEY) === 'true';
    } catch (error) {
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
      } catch (error) {
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
