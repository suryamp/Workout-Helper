// ── Service Worker ───────────────────────────────────────────────────────────
// Cache-first strategy. Bump CACHE_VERSION on every deploy so users get
// fresh assets — old caches are deleted on activate.

const CACHE_VERSION = 'v3';
const CACHE_NAME    = `workout-${CACHE_VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './styles/tokens.css',
  './styles/layout.css',
  './styles/components.css',
  './styles/animations.css',
  './src/main.js',
  './src/telemetry.js',
  './src/data/exercises.js',
  './src/data/days.js',
  './src/data/volumeAnimals.js',
  './src/db/index.js',
  './src/db/connection.js',
  './src/db/sessions.js',
  './src/db/logs.js',
  './src/db/recovery.js',
  './src/state/session.js',
  './src/state/setWidget.js',
  './src/ui/render.js',
  './src/ui/timer.js',
  './src/ui/share.js',
  './src/ui/sessionDetail.js',
  './src/ui/modals.js',
  './src/ui/history.js',
  './src/ui/home.js',
  './src/ui/menu.js',
  './src/ui/nav.js',
  './src/ui/settings.js',
  './src/utils/time.js',
  './src/utils/settings.js',
  './src/utils/wakeLock.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Only handle GET requests for same-origin resources.
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
