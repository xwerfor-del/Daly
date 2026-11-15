// Service worker لموقع دلي: يجعل الموقع يفتح بسرعة وبدون إنترنت
const CACHE = 'daly-v1';
const SHELL = ['./', './index.html', './firebase-config.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isStatic = sameOrigin || url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com' || url.host === 'www.gstatic.com';
  if (!isStatic) return; // Firebase data & rates: always live
  // صفحات الموقع: الشبكة أولاً ثم النسخة المحفوظة
  if (sameOrigin && (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('firebase-config.js'))) {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  // الخطوط والمكتبات والأيقونات: المحفوظ أولاً
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
