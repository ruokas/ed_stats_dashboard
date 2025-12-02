const SECONDARY_MODULE_URL = './dashboard.js';
const CHART_JS_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';

let secondaryModulePromise = null;
let secondaryLoaded = false;

function loadSecondaryModule() {
  if (secondaryLoaded) {
    return secondaryModulePromise;
  }

  if (!secondaryModulePromise) {
    secondaryModulePromise = import(SECONDARY_MODULE_URL)
      .then((module) => {
        secondaryLoaded = true;
        return module;
      })
      .catch((error) => {
        secondaryLoaded = false;
        console.error('Nepavyko įkelti antrinio modulio.', error);
        throw error;
      });
  }

  return secondaryModulePromise;
}

function prefetchLink(href, rel = 'prefetch', as) {
  if (!href) return;
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  if (as) {
    link.as = as;
  }
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

function setupPrefetches() {
  // Pirmiausia užbaigiame pagrindinį užkrovimą, tada ruošiamės būsimoms bibliotekoms.
  window.addEventListener('load', () => {
    const prefetchTask = () => {
      prefetchLink(SECONDARY_MODULE_URL, 'modulepreload');
      prefetchLink(CHART_JS_URL, 'prefetch', 'script');
    };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(prefetchTask, { timeout: 1500 });
    } else {
      window.setTimeout(prefetchTask, 700);
    }
  });
}

function attachLazyTriggers() {
  const triggers = [
    '#openSettingsBtn',
    '#edNavButton',
  ];

  triggers.forEach((selector) => {
    const element = document.querySelector(selector);
    if (!element) return;
    element.addEventListener('click', () => loadSecondaryModule(), { once: true });
  });

  const navLinks = document.querySelectorAll('.section-nav__link');
  navLinks.forEach((link) => {
    link.addEventListener('click', () => loadSecondaryModule(), { once: true });
  });
}

attachLazyTriggers();
setupPrefetches();
