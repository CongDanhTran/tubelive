const CACHE_NAME = 'stepney-green-v1';
const CACHED_URLS = ['/', '/nearby', '/manifest.json', '/icon.png'];

// Install: cache the HTML shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHED_URLS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: HTML navigations served from cache (with network-first update).
// All API/external requests go straight to network — no caching.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only intercept same-origin HTML navigations
  const isNavigation = event.request.mode === 'navigate';
  const isHtmlGet = event.request.method === 'GET' &&
    event.request.headers.get('accept')?.includes('text/html') &&
    url.origin === self.location.origin;

  if (isNavigation || isHtmlGet) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Update cache with fresh copy
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request)) // offline fallback
    );
    return;
  }
  // Everything else (TfL API calls etc.) — network only, no caching
});

// Message handler for cache clear + recache triggered from the page
self.addEventListener('message', event => {
  if (event.data === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0]?.postMessage('CACHE_CLEARED');
    });
  }

  if (event.data === 'RECACHE') {
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHED_URLS))
      .then(() => event.ports[0]?.postMessage('RECACHE_DONE'));
  }
});
