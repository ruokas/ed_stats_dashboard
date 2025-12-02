/**
 * Papildomos kliento funkcijos: service worker registracija, paprastas saugojimas ir našumo stebėjimas.
 * Jokios priklausomybės – tinka statiniam diegimui.
 */

const DEFAULT_CONFIG_KEY = 'edDashboardClientConfig-v1';

/**
 * Kuria paprastą saugyklą naršyklės localStorage/IndexedDB alternatyvai.
 * @param {string} storageKey
 */
export function createClientStore(storageKey = DEFAULT_CONFIG_KEY) {
  const key = storageKey || DEFAULT_CONFIG_KEY;
  const safeParse = (raw) => {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      console.warn('Nepavyko perskaityti saugomos konfigūracijos, naudojamas tuščias objektas.', error);
      return {};
    }
  };

  return {
    load() {
      try {
        return safeParse(window.localStorage.getItem(key));
      } catch (error) {
        console.warn('localStorage neprieinamas, grįžtama į tuščią konfigūraciją.', error);
        return {};
      }
    },
    save(value = {}) {
      try {
        const payload = JSON.stringify(value || {});
        window.localStorage.setItem(key, payload);
        return true;
      } catch (error) {
        console.warn('Nepavyko įrašyti konfigūracijos.', error);
        return false;
      }
    },
    clear() {
      try {
        window.localStorage.removeItem(key);
        return true;
      } catch (error) {
        console.warn('Nepavyko išvalyti konfigūracijos.', error);
        return false;
      }
    },
  };
}

/**
 * Registruoja service worker (jei palaikomas) ir grąžina `Promise` su registracija.
 * @param {string} [scriptUrl]
 */
export function registerServiceWorker(scriptUrl = '/service-worker.js') {
  if (!('serviceWorker' in navigator)) {
    console.info('Service worker nepalaikomas šioje naršyklėje.');
    return Promise.resolve(null);
  }
  const resolvedUrl = scriptUrl.startsWith('http')
    ? scriptUrl
    : new URL(scriptUrl, window.location.href).href;
  return navigator.serviceWorker.register(resolvedUrl)
    .then((registration) => {
      console.info('Service worker užregistruotas.', registration.scope);
      return registration;
    })
    .catch((error) => {
      console.error('Service worker registracija nepavyko:', error);
      return null;
    });
}

/**
 * Išvalo `CacheStorage` pagal pavadinimo pradžią.
 * @param {string[]} prefixes
 */
export async function clearNamedCaches(prefixes = []) {
  if (!('caches' in window)) {
    return { cleared: [], skipped: true };
  }
  const keys = await caches.keys();
  const cleared = [];
  for (const cacheName of keys) {
    if (!prefixes.length || prefixes.some((prefix) => cacheName.startsWith(prefix))) {
      await caches.delete(cacheName);
      cleared.push(cacheName);
    }
  }
  return { cleared, skipped: false };
}

/**
 * Centralizuotas našumo stebėtojas su `performance.mark/measure` ir `console.table`.
 */
export class PerfMonitor {
  constructor() {
    this.runs = [];
    this.counter = 0;
  }

  start(label, meta = {}) {
    this.counter += 1;
    const id = `${label}-${this.counter}`;
    performance.mark(`${id}-start`);
    return { id, label, meta };
  }

  finish(handle, extraMeta = {}) {
    if (!handle?.id) {
      return null;
    }
    const endMark = `${handle.id}-end`;
    performance.mark(endMark);
    const measureName = `${handle.id}-measure`;
    performance.measure(measureName, `${handle.id}-start`, endMark);
    const entry = performance.getEntriesByName(measureName).pop();
    const row = {
      žyma: handle.label,
      trukmėMs: entry?.duration ? Number(entry.duration.toFixed(2)) : null,
      laikas: new Date().toISOString(),
      ...handle.meta,
      ...extraMeta,
    };
    this.runs.push(row);
    return row;
  }

  logTable() {
    if (this.runs.length) {
      console.table(this.runs);
    }
  }
}

/**
 * Išvalo localStorage įrašus ir pasirinktus CacheStorage bei service worker registracijas.
 * @param {string[]} storageKeys
 * @param {string[]} cachePrefixes
 */
export async function clearClientData({ storageKeys = [], cachePrefixes = [] } = {}) {
  storageKeys.forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      console.warn(`Nepavyko pašalinti įrašo ${key} iš localStorage`, error);
    }
  });

  const cacheResult = await clearNamedCaches(cachePrefixes);

  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch (error) {
      console.warn('Nepavyko išregistruoti service worker.', error);
    }
  }

  return { caches: cacheResult };
}
