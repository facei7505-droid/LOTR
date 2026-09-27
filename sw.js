// Service worker of the installed game: the page itself is always fetched fresh when online (updates arrive at once),
// models, textures, the 3D engine and fonts are kept in a cache so the game starts fast and plays offline.
const CACHE = 'ak-v1';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png']).catch(() => {}))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (url.protocol !== 'https:' || url.hostname === 'localhost') return; // the local dev server always serves fresh files
  if (/mqtt|wss?:/.test(url.href) || url.pathname.endsWith('sw.js')) return; // the online lobby is never cached
  const page = r.mode === 'navigate' || url.pathname.endsWith('.html');
  if (page) { // network first: new versions of the game load immediately, the cached copy is the offline fallback
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); return res; }).catch(() => caches.match(r).then(m => m || caches.match('index.html'))));
    return;
  }
  // everything else: answer from the cache at once and refresh it in the background
  e.respondWith(caches.open(CACHE).then(k => k.match(r).then(hit => {
    const net = fetch(r).then(res => { if (res && (res.ok || res.type === 'opaque')) k.put(r, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  })));
});
