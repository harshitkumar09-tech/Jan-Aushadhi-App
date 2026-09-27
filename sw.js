/*
 * Service worker: makes the site work offline after the first visit.
 * App files are served from the cache first (instant start, no "Please wait"),
 * then refreshed in the background. Change CACHE when you edit any file below.
 */
var CACHE = 'jas-v1';
var APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/data/medicines.js',
  './js/data/kendras.js',
  './js/i18n.js',
  './js/search.js',
  './js/services.js',
  './js/lab.js',
  './js/app.js',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png'
];
// Third-party files we allow into the cache (the map library, loaded only when the map is opened).
var CDN = 'https://cdnjs.cloudflare.com/';

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(APP_FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && req.url.indexOf(CDN) !== 0) return; // map tiles etc. go straight to the network

  // Stale-while-revalidate: answer from cache immediately, update the cache in the background.
  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req, { ignoreSearch: sameOrigin }).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        }).catch(function () {
          if (req.mode === 'navigate') return cache.match('./index.html');
          return cached;
        });
        return cached || network;
      });
    })
  );
});
