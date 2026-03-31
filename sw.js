// Version of this service worker - increment when deploying updates
const VERSION = 'v3';
const CACHE_NAME = `stepney-green-${VERSION}`;
const CACHED_URLS = ['/', '/nearby', '/manifest.json', '/192-192.png', '/512-512.png', "manifest_1.json"];

// Install: cache the HTML shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHED_URLS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches and handle updates
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name.startsWith('stepney-green-'))
          .map(name => caches.delete(name))
      );

      // Take control of all clients
      await self.clients.claim();

      // Check if we're online and notify clients about update
      if (navigator.onLine) {
        // Notify clients that a new SW is active
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(client => {
          client.postMessage({ type: 'SW_UPDATE_ACTIVE', version: VERSION });
        });

        // Optionally trigger a recache of critical assets
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.addAll(CACHED_URLS);
        } catch (error) {
          console.warn('Failed to recache assets during SW activation:', error);
        }
      }
    })()
  );
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

  // Handle page reload request from client when new SW is waiting
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Handle online status changes from client
  if (event.data && event.data.type === 'ONLINE_STATUS_CHANGED') {
    if (navigator.onLine && event.data.isOnline) {
      // We just came online, check for updates
      self.registration.update().then(() => {
        // Notify clients that we checked for updates
        self.clients.matchAll({ type: 'window' }).then(clientList => {
          clientList.forEach(client => {
            client.postMessage({ type: 'SW_UPDATE_CHECKED' });
          });
        });
      });
    }
  }
});

// Listen for online/offline events to detect connectivity changes
self.addEventListener('online', () => {
  // When we come online, check for service worker updates
  self.registration.update().then(() => {
    // Notify clients that we checked for updates
    self.clients.matchAll({ type: 'window' }).then(clientList => {
      clientList.forEach(client => {
        client.postMessage({ type: 'SW_UPDATE_CHECKED_ONLINE' });
      });
    });
  });
});

self.addEventListener('offline', () => {
  // When we go offline, we could notify clients if needed
  self.clients.matchAll({ type: 'window' }).then(clientList => {
    clientList.forEach(client => {
      client.postMessage({ type: 'SW_OFFLINE' });
    });
  });
});

// Periodically check for updates (optional)
// self.addEventListener('periodicsync', event => {
//   if (event.tag === 'update-service-worker') {
//     event.waitUntil(self.registration.update());
//   }
// });