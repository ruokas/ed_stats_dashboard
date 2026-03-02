export function registerServiceWorker(scriptUrl = '/service-worker.js') {
  if (!('serviceWorker' in navigator)) {
    console.info('Service worker nepalaikomas šioje naršyklėje.');
    return Promise.resolve(null);
  }
  const resolvedUrl = scriptUrl.startsWith('http')
    ? scriptUrl
    : new URL(scriptUrl, window.location.href).href;
  return navigator.serviceWorker
    .register(resolvedUrl)
    .then((registration) => {
      console.info('Service worker užregistruotas.', registration.scope);
      return registration;
    })
    .catch((error) => {
      console.error('Service worker registracija nepavyko:', error);
      return null;
    });
}

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
