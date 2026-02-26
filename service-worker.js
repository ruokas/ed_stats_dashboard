// Bump cache versions on release when app shell/static routing changes.
// Rule of thumb: STATIC_CACHE for HTML/CSS/JS shell changes, API_CACHE for CSV/API strategy changes.
const STATIC_CACHE = 'ed-static-v24';
const API_CACHE = 'ed-api-v2';
const OFFLINE_FALLBACK = new URL('./index.html', self.location).pathname;
const STATIC_ASSETS = [
  new URL('./', self.location).pathname,
  new URL('./index.html', self.location).pathname,
  new URL('./charts.html', self.location).pathname,
  new URL('./recent.html', self.location).pathname,
  new URL('./summaries.html', self.location).pathname,
  new URL('./gydytojai.html', self.location).pathname,
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
];

async function precacheStaticAssets() {
  const cache = await caches.open(STATIC_CACHE);
  const failures = [];
  for (const assetPath of STATIC_ASSETS) {
    try {
      const request = new Request(assetPath, { cache: 'no-cache' });
      const response = await fetch(request);
      if (!response?.ok) {
        failures.push({ assetPath, status: response?.status || 0 });
        continue;
      }
      await cache.put(request, response.clone());
    } catch (_error) {
      failures.push({ assetPath, status: 0 });
    }
  }
  if (failures.length) {
    console.warn('Service worker precache partial failures:', failures);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheStaticAssets()
      .catch((error) => {
        console.warn('Service worker precache failed:', error);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== STATIC_CACHE && key !== API_CACHE).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isHtmlShellPath(pathname) {
  return STATIC_ASSETS.includes(pathname) && (pathname === '/' || /\.html$/i.test(pathname));
}

function safeResponseError() {
  return new Response('Laikinai nepasiekiama.', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function resolveCacheMatch(target, options = {}) {
  const ignoreSearch = options?.ignoreSearch === true;
  if (typeof caches?.match !== 'function') {
    return Promise.resolve(undefined);
  }
  return caches.match(target, ignoreSearch ? { ignoreSearch: true } : undefined);
}

function cacheFirst(
  request,
  { useOfflineFallback = false, fallbackPath = OFFLINE_FALLBACK, ignoreSearchForCache = false } = {}
) {
  return caches
    .match(request, ignoreSearchForCache ? { ignoreSearch: true } : undefined)
    .then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        const clone = response.clone();
        caches
          .open(STATIC_CACHE)
          .then((cache) => cache.put(request, clone))
          .catch(() => {});
        return response;
      });
    })
    .catch(() => {
      if (useOfflineFallback) {
        return resolveCacheMatch(fallbackPath || OFFLINE_FALLBACK, { ignoreSearch: true }).then(
          (fallback) => fallback || safeResponseError()
        );
      }
      return safeResponseError();
    });
}

async function networkFirst(
  request,
  { useOfflineFallback = false, fallbackPath = OFFLINE_FALLBACK, ignoreSearchForCache = false } = {}
) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (response?.ok) {
      try {
        await cache.put(request, response.clone());
      } catch (_cacheWriteError) {
        // Never fail the request because CacheStorage refused the write.
      }
    }
    return response;
  } catch (_error) {
    const cached = await cache.match(request, ignoreSearchForCache ? { ignoreSearch: true } : undefined);
    if (cached) {
      return cached;
    }
    if (useOfflineFallback) {
      const fallback = await cache.match(fallbackPath || OFFLINE_FALLBACK, { ignoreSearch: true });
      if (fallback) {
        return fallback;
      }
    }
    return safeResponseError();
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(API_CACHE);
  const cachedResponse = await cache.match(request);

  const networkFetch = fetch(request)
    .then(async (response) => {
      if (response?.ok) {
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
  const accept = request.headers.get('accept') || '';
  const isDocumentLikeRequest =
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    request.destination === 'iframe' ||
    accept.includes('text/html');
  const htmlShellRequest = isHtmlShellPath(url.pathname) && isDocumentLikeRequest;
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, {
        useOfflineFallback: true,
        fallbackPath: isHtmlShellPath(url.pathname) ? url.pathname : OFFLINE_FALLBACK,
        ignoreSearchForCache: true,
      })
    );
    return;
  }

  if (htmlShellRequest) {
    event.respondWith(
      cacheFirst(request, {
        useOfflineFallback: true,
        fallbackPath: url.pathname,
        ignoreSearchForCache: true,
      })
    );
    return;
  }

  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (/\.js($|\?)/i.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (/\.csv($|\?)/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});
