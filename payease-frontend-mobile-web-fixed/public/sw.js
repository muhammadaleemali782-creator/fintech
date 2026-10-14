// Service Worker for Educa Fintech PWA
// v10: app-shell navigation is now stale-while-revalidate (opens instantly from cache, refreshes in background).
const CACHE_NAME = 'educa-fintech-v10';
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

// Stale-while-revalidate for the app shell:
//  - cached shell exists  -> return it IMMEDIATELY (no waiting on a slow / sleeping network),
//                            and refresh the cached copy in the background for the next open
//  - nothing cached yet   -> normal network request (first ever visit)
async function handleAppNavigation(event) {
  const cache = await caches.open(CACHE_NAME);
  const cachedShell = await cache.match(SHELL_URL);

  const refresh = fetch(event.request).then((response) => {
    if (isHtmlOk(response)) cache.put(SHELL_URL, response.clone());
    return response;
  });

  if (cachedShell) {
    event.waitUntil(refresh.catch(() => {})); // keep the worker alive until the background refresh ends
    return cachedShell;
  }

  try {
    return await refresh;
  } catch (_) {
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
