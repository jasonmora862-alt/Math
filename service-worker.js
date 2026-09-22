const CACHE = 'tnpo-msvo-navigator-v0.2.0';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './governance.js', './db.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './data/msvo_nodes.json', './data/msvo_edges.json', './data/tnpo_roots.json', './data/tnpo_branches.json', './data/tnpo_modules.json', './data/semantic_catalog.json', './data/system_state.json'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok && new URL(event.request.url).origin === self.location.origin) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  })));
});
