// يجلب أسعار الليرة السورية من موقع الليرة اليوم (SP Today) ويحفظها في rates.json
// يشغّله GitHub تلقائياً. المفتاح محفوظ في GitHub Secrets باسم SPTODAY_API_KEY
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const KEY = process.env.SPTODAY_API_KEY;
const CITY = 'damascus';
const WANT = ['USD', 'EUR', 'KWD'];

if (!KEY) { console.error('المفتاح SPTODAY_API_KEY غير موجود في GitHub Secrets'); process.exit(1); }

const url = `https://api-v2.sp-today.com/api/v1/currencies?lang=en&city=${CITY}`;
const res = await fetch(url, { headers: { 'X-API-Key': KEY, Accept: 'application/json' } });
const body = await res.json().catch(() => null);
if (!res.ok || !body || body.ok === false) {
  console.error('خطأ من الخدمة:', res.status, JSON.stringify(body && (body.error || body)).slice(0, 400));
  process.exit(1);
}

const d = body.data || {};
const list = Array.isArray(d.currencies) ? d.currencies
  : Array.isArray(d.rates) ? d.rates
  : Array.isArray(d) ? d : [];

const raw = {};
for (const c of list) {
  const code = String(c.code || c.symbol || c.slug || '').toUpperCase();
  if (!WANT.includes(code)) continue;
  const city = (c.cities && (c.cities[CITY] || Object.values(c.cities)[0])) || c;
  const buy = Number(city.buy), sell = Number(city.sell);
  if (!(buy > 0) && !(sell > 0)) continue;
  raw[code] = { buy, sell, updated_at: c.updated_at || city.updated_at || null };
}
if (!raw.USD) {
  console.error('لم أجد الدولار في الرد. المفاتيح:', JSON.stringify(Object.keys(d)), JSON.stringify(list[0] || {}).slice(0, 400));
  process.exit(1);
}

// إن كانت الأسعار بالليرة القديمة (مثل 14,925) نحوّلها للجديدة بحذف صفرين
const factor = Math.max(raw.USD.buy || 0, raw.USD.sell || 0) > 1500 ? 100 : 1;
const r2 = n => n > 0 ? Math.round(n / factor * 100) / 100 : null;
const syp = {};
for (const [code, v] of Object.entries(raw)) {
  const buy = r2(v.buy), sell = r2(v.sell);
  syp[code] = { buy, sell, mid: buy && sell ? Math.round((buy + sell) / 2 * 100) / 100 : (buy || sell), updated_at: v.updated_at };
}

// سجل يومي لسعر الدولار (لدرع الليرة): تاريخ ← السعر الوسطي، نحتفظ بآخر 3 سنوات تقريباً
const day = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // توقيت دمشق
let old = null;
if (existsSync('rates.json')) { try { old = JSON.parse(readFileSync('rates.json', 'utf8')); } catch {} }
const history = Object.assign({}, (old && old.history) || {});
const hadToday = history[day] === syp.USD.mid;
history[day] = syp.USD.mid;
const days = Object.keys(history).sort();
while (days.length > 1100) delete history[days.shift()];

const out = { source: 'sp-today', city: CITY, unit: 'new SYP per 1 unit', fetchedAt: new Date().toISOString(), syp, history };

// لا نكتب الملف إلا إذا تغيّرت الأسعار أو بدأ يوم جديد، حتى لا تتكرر التحديثات بلا داعٍ
if (old && hadToday && JSON.stringify(old.syp) === JSON.stringify(syp)) { console.log('لا تغيير في الأسعار'); process.exit(0); }
writeFileSync('rates.json', JSON.stringify(out, null, 2) + '\n');
console.log('تم التحديث: الدولار', syp.USD.buy, '/', syp.USD.sell, 'ل.س');
