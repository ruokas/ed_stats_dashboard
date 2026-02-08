const STATIC_CACHE = 'ed-static-v20';
const API_CACHE = 'ed-api-v1';
const OFFLINE_FALLBACK = new URL('./index.html', self.location).pathname;
const STATIC_ASSETS = [
  new URL('./', self.location).pathname,
  new URL('./index.html', self.location).pathname,
  new URL('./charts.html', self.location).pathname,
  new URL('./recent.html', self.location).pathname,
  new URL('./summaries.html', self.location).pathname,
  new URL('./feedback.html', self.location).pathname,
  new URL('./ed.html', self.location).pathname,
  new URL('./styles.css', self.location).pathname,
  new URL('./theme-init.css', self.location).pathname,
  new URL('./theme-init.js', self.location).pathname,
  new URL('./data-worker.js', self.location).pathname,
  new URL('./app.js', self.location).pathname,
  new URL('./main.js', self.location).pathname,
  new URL('./src/main.js', self.location).pathname,
  new URL('./src/app/runtime.js', self.location).pathname,
  new URL('./src/app/runtime-full.js', self.location).pathname,
  new URL('./src/app/full-page-app.js', self.location).pathname,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
      .map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

function cacheFirst(request, { useOfflineFallback = false } = {}) {
  return caches.match(request).then((cached) => {
    if (cached) {
      return cached;
    }
    return fetch(request).then((response) => {
      const clone = response.clone();
      caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
      return response;
    });
  }).catch(() => {
    if (useOfflineFallback) {
      return caches.match(OFFLINE_FALLBACK);
    }
    return Response.error();
  });
}

async function networkFirst(request, { useOfflineFallback = false } = {}) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    if (useOfflineFallback) {
      const fallback = await cache.match(OFFLINE_FALLBACK);
      if (fallback) {
        return fallback;
      }
    }
    return Response.error();
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(API_CACHE);
  const cachedResponse = await cache.match(request);

  const networkFetch = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        const clone = response.clone();
        const headers = new Headers(clone.headers);
        headers.set('X-Cache-Status', cachedResponse ? 'revalidated' : 'updated');
        const responseWithHeader = new Response(await clone.blob(), {
          status: clone.status,
          statusText: clone.statusText,
          headers,
        });
        await cache.put(request, responseWithHeader.clone());
        return responseWithHeader;
      }
      return response;
    })
    .catch(() => cachedResponse);

  if (cachedResponse) {
    if (event && typeof event.waitUntil === 'function') {
      event.waitUntil(networkFetch);
    } else {
      networkFetch.catch(() => {});
    }

    const headers = new Headers(cachedResponse.headers);
    headers.set('X-Cache-Status', 'hit');
    return new Response(await cachedResponse.clone().blob(), {
      status: cachedResponse.status,
      statusText: cachedResponse.statusText,
      headers,
    });
  }

  return networkFetch;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, { useOfflineFallback: true }));
    return;
  }

  if (/\.js($|\?)/i.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (/\.csv($|\?)/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});
