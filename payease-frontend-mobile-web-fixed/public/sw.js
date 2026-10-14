// Service Worker for Educa Fintech PWA
const CACHE_NAME = 'educa-fintech-v9';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Ignore unsupported schemes (e.g. chrome-extension://, moz-extension://)
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return;
  }

  // Pass-through for all API, WebSocket, SSE requests
  if (
    url.includes('/api/') ||
    url.includes('/admin/notifications/stream') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Assets (JS, CSS, fonts, images): Cache-first with network fallback for ultra-fast instant startup
  if (url.includes('/assets/') || url.match(/\.(js|css|png|jpg|svg|ico|woff2)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached || new Response('', { status: 408, statusText: 'Offline Asset' }));
      })
    );
    return;
  }

  // HTML / Navigation: Network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || new Response('', { status: 408, statusText: 'Offline' })))
  );
});
