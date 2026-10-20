// Service Worker for Educa Fintech PWA
// v14: Ultra-fast KYC single-call batch loading, real-time analytics sync, and clean image caching.
const CACHE_NAME = 'educa-fintech-v14';
const SHELL_URL = '/index.html';

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

// SPA routes (/login, /dashboard ...) have no file extension and are all served by index.html (see vercel.json).
// Real files such as /sitemap.xml or /prototypes/bond-25k.html must NOT get the app shell.
function isAppRouteNavigation(request) {
  if (request.mode !== 'navigate') return false;
  try {
    return !/\.[a-z0-9]+$/i.test(new URL(request.url).pathname);
  } catch (_) {
    return false;
  }
}

function isHtmlOk(response) {
  return Boolean(
    response &&
    response.status === 200 &&
    (response.headers.get('content-type') || '').includes('text/html')
  );
}

// Network-first for app shell navigation:
// - online: fetch latest index.html directly from network, update cache, and return immediately
// - offline / network failure: fallback to cached shell
async function handleAppNavigation(event) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(event.request);
    if (isHtmlOk(response)) {
      cache.put(SHELL_URL, response.clone());
    }
    return response;
  } catch (_) {
    const cachedShell = await cache.match(SHELL_URL);
    if (cachedShell) return cachedShell;
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

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

  // App routes: instant cached shell + background refresh
  if (isAppRouteNavigation(event.request)) {
    event.respondWith(handleAppNavigation(event));
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

  // Everything else (real .html / .xml / .txt files): Network-first with cache fallback
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
