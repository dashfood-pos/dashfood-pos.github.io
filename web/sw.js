/* Dash Food POS — service worker.
 * Hanya menyimpan "kerangka" aplikasi (HTML, ikon, manifest) agar bisa dibuka cepat dan di-install.
 * DATA TIDAK PERNAH di-cache: semua panggilan API (POST ke Apps Script, domain lain) dilewatkan apa adanya,
 * sehingga harga, stok, dan transaksi selalu dari server.
 */
var VERSION = '__VERSION__';
var CACHE = 'dashfood-shell-' + VERSION;
var SHELL = ['./', './index.html', './config.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('dashfood-shell-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // API (POST) → langsung ke jaringan
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // Apps Script, foto Drive, font → tidak disentuh
  var isPage = req.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname) || /config\.js$/.test(url.pathname);
  if (isPage) {
    // Network-first: versi terbaru dipakai bila online; cache hanya cadangan saat offline.
    e.respondWith(fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) { return hit || caches.match('./index.html'); });
    }));
    return;
  }
  // Ikon & manifest: cache-first.
  e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req); }));
});
