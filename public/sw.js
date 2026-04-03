// Version of this service worker - increment when deploying updates
const VERSION = 'v5';
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
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isNavigation = event.request.mode === 'navigate';
  const isHtmlGet = event.request.method === 'GET' &&
    event.request.headers.get('accept')?.includes('text/html') &&
    url.origin === self.location.origin;

  if (isNavigation || isHtmlGet) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
});

// Message handler
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
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Notification handling
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  let targetUrl = '/';
  if (data.station && data.line && data.appKey) {
    targetUrl = `/?station=${encodeURIComponent(data.station)}&line=${encodeURIComponent(data.line)}&appKey=${encodeURIComponent(data.appKey)}&setNo=${encodeURIComponent(data.setNo || '')}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.navigate(targetUrl).then(c => c.focus());
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// Push notification listener
self.addEventListener('push', (event) => {
  let data = { title: 'TubeLive', body: 'New notification available' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'TubeLive', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: '/512-512.png',
    badge: '/192-192.png',
    data: {
      url: '/',
      station: data.station,
      line: data.line,
      appKey: data.appKey,
      setNo: data.setNo
    }
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});