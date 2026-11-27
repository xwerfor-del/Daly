// Service worker لموقع دلي: يجعل الموقع يفتح بسرعة وبدون إنترنت
const CACHE = 'daly-v3';
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const SHELL = ['./', './index.html', './firebase-config.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
const LIBS = [FB + 'firebase-app.js', FB + 'firebase-auth.js', FB + 'firebase-firestore.js'];

// صفحة احتياطية: تظهر بدل الشاشة البيضاء إذا لم تكن هناك نسخة محفوظة
const OFFLINE_HTML = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0F3D2E"><title>دلي</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0F3D2E;color:#F3EBDD;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px;box-sizing:border-box}b{font-size:56px;color:#C39A44;display:block;margin-bottom:8px}p{line-height:1.8;opacity:.9;margin:0 0 20px}button{font:inherit;font-weight:700;border:0;border-radius:14px;padding:14px 28px;background:#C39A44;color:#0F3D2E}</style></head>
<body><div><b>دلي</b><p>لا يوجد اتصال بالإنترنت، ولم تُحفظ نسخة من دلي على هذا الجهاز بعد.<br>افتح دلي مرة واحدة وأنت متصل، وبعدها يعمل بدون إنترنت.</p><button onclick="location.reload()">إعادة المحاولة</button></div></body></html>`;

// نحفظ ملفاً واحداً دون أن يُفشل فشلُه الباقي
const keep = (c, url, opts) => fetch(new Request(url, opts || {cache: 'reload'})).then(res => {
  if (res && (res.ok || res.type === 'opaque')) return c.put(url, clean(res));
}).catch(() => {});
// استجابة بلا «تحويل» (iOS يرفض تقديم استجابة محوَّلة لصفحة)
function clean(res){
  if (!res.redirected) return res;
  return res.blob().then(b => new Response(b, {status: res.status, statusText: res.statusText, headers: res.headers}));
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([
    ...SHELL.map(u => keep(c, u)),
    ...LIBS.map(u => keep(c, u, {mode: 'cors', cache: 'reload'}))
  ])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const timeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
async function fromCache(req){
  const c = await caches.open(CACHE);
  return (await c.match(req, {ignoreSearch: true})) || (await c.match('./index.html')) || (await c.match('./'));
}
async function putClean(req, res){
  try{ const c = await caches.open(CACHE); await c.put(req, await clean(res.clone())); }catch(e){}
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isStatic = sameOrigin || url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com' || url.host === 'www.gstatic.com';
  if (!isStatic) return; // بيانات Firebase والأسعار والمساعد: مباشرة دائماً

  // فتح الصفحة: الشبكة أولاً (بحد أقصى 4 ثوانٍ للنت البطيء)، ثم النسخة المحفوظة، ثم صفحة احتياطية
  if (req.mode === 'navigate' || (sameOrigin && url.pathname.endsWith('.html'))){
    e.respondWith((async () => {
      try{
        const res = await timeout(fetch(req), 4000);
        if (res && res.ok){ putClean(new Request(self.registration.scope + 'index.html'), res); return await clean(res); }
        const hit = await fromCache(req); return hit || res;
      }catch(err){
        const hit = await fromCache(req);
        return hit || new Response(OFFLINE_HTML, {headers: {'Content-Type': 'text/html; charset=utf-8'}});
      }
    })());
    return;
  }
  // ملفات الإعدادات والأسعار المحلية: الشبكة أولاً ثم المحفوظ
  if (sameOrigin && (url.pathname.endsWith('.json') || url.pathname.endsWith('firebase-config.js'))){
    e.respondWith(fetch(req).then(res => { if (res.ok) putClean(req, res); return res; }).catch(() => caches.match(req, {ignoreSearch: true})));
    return;
  }
  // الخطوط والمكتبات والأيقونات: المحفوظ أولاً
  e.respondWith(caches.match(req, {ignoreSearch: url.host !== 'fonts.googleapis.com'}).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') putClean(req, res);
    return res;
  })));
});
