// Service Worker for Educa Fintech PWA
const CACHE_NAME = 'educa-fintech-v2';

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
  // Pass-through for all API, WebSocket, SSE requests
  if (
    event.request.url.includes('/api/') ||
    event.request.url.includes('/admin/notifications/stream') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Network-first with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
