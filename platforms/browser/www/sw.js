const CACHE_NAME = 'stratos-v1';

// Add files you want to cache here
const urlsToCache = [
  '/',
  '/index.html',
  '/signin.html',
  '/login.html',
  '/funds.html',
  '/mentor.html',
  '/promo.html',
  '/idea-incubation.html',
  '/css/style.css',
  '/img/logo.png'
];

// Install Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll([
          '/',
          '/index.html',
          '/signin.html',
          '/login.html',
          '/funds.html',
          '/mentor.html',
          '/promo.html',
          '/idea-incubation.html',
          '/css/style.css',
          '/img/logo.png'
        ]);
      })
  );
  self.skipWaiting();
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Handle updates
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      self.clients.claim();
    })
  );
}); 