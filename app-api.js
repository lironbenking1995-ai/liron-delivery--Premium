// שרת האפליקציה של לירון משלוחים: הזמנות, סטטוסים ומיקום חי של השליח.
// הנתונים נשמרים ב-Netlify Blobs (אחסון מובנה של Netlify, בלי שרת נוסף).
// משתנה סביבה נדרש ב-Netlify: COURIER_PIN – קוד הכניסה לשליח.
import { getStore } from '@netlify/blobs';

const CITIES = {
  'אשקלון': 0, 'ברכיה': 5, 'בת הדר': 6, 'גיאה': 6, 'הודיה': 7, 'מבקיעים': 7, 'זיקים': 8, 'באר גנים': 8, 'ניצן': 8,
  'תלמי יפה': 9, 'ניצנים': 10, 'כרמיה': 10, 'משען': 10, 'ניר ישראל': 12, 'כוכב מיכאל': 12, 'שדה עוזיה': 15, 'אמונים': 16,
  'באר טוביה': 18, 'ניר גלים': 18, 'אשדוד': 20, 'עזריקם': 21, 'שתולים': 22, 'חצב': 22, 'ניר בנים': 23, 'קריית מלאכי': 24,
  'בני דרום': 25, 'גן יבנה': 25, 'גבעת וושינגטון': 28, 'קבוצת יבנה': 30, 'גן הדרום': 30, 'ביצרון': 31, 'כנות': 33,
  'בני עי"ש': 34, 'יבנה': 35, 'גדרה': 35,
  'בית גמליאל': 37, 'כפר הנגיד': 38, 'קריית עקרון': 38, 'מזכרת בתיה': 38, 'גאליה': 39, 'רחובות': 42, 'כפר אביב': 40,
  'פלמחים': 42, 'עיינות': 42, 'בית חנן': 43, 'נס ציונה': 43, 'נטעים': 44, 'גן שורק': 44, 'בית עובד': 44, 'כפר אהרון': 44,
  'ראשון לציון': 48, 'באר יעקב': 47,
  'רמלה': 50, 'לוד': 53, 'גני הדר': 45, 'כרמי יוסף': 46, 'יד רמב"ם': 47, 'פדיה': 48, 'נען': 47, 'רמות מאיר': 45,
  'נצר סירני': 48, 'צפריה': 52, 'גינתון': 54, 'בן שמן': 55, 'כפר דניאל': 55, 'גמזו': 55, 'מצליח': 52, 'יציץ': 50,
  'סתריה': 49, 'כפר בן נון': 49
};
// אזור רמלה-לוד והמושבים: מחיר האזור + תוספת שהלקוח בוחר, בכפולות של 10
const RL = new Set(['רמלה', 'לוד', 'גני הדר', 'כרמי יוסף', 'יד רמב"ם', 'פדיה', 'נען', 'רמות מאיר', 'נצר סירני', 'צפריה',
  'גינתון', 'בן שמן', 'כפר דניאל', 'גמזו', 'מצליח', 'יציץ', 'סתריה', 'כפר בן נון']);
const EXTRA_STEP = 10, EXTRA_MAX = 100;
const ALIAS = { 'קרית עקרון': 'קריית עקרון', 'ראשל"צ': 'ראשון לציון', 'ראשלצ': 'ראשון לציון', 'נס-ציונה': 'נס ציונה', 'יד רמבם': 'יד רמב"ם', 'קרית מלאכי': 'קריית מלאכי', 'בני עיש': 'בני עי"ש', 'אשקלון העיר': 'אשקלון' };
const TIERS = [[20, 50], [30, 65], [40, 80], [50, 95]];
const RL_BASE = 110; // מחיר בסיס לאזור רמלה-לוד, לפני התוספת
const MAX_AMOUNT = 10000;      // סכום מקסימלי לחיוב באתר (₪)
const MAX_PAYMENTS = 24;       // מספר תשלומים מקסימלי

function norm(v) {
  return String(v || '').replace(/[-–־]/g, ' ').replace(/[״"׳']/g, m => (m === "'" || m === '׳') ? '' : '"').replace(/\s+/g, ' ').trim();
}
function canon(raw) {
  const key = ALIAS[norm(raw)] || norm(raw);
  if (key in CITIES) return key;
  const plain = key.replace(/"/g, '');
  for (const c in CITIES) if (c.replace(/"/g, '') === plain) return c;
  return null;
}
function km(raw) { const c = canon(raw); return c === null ? null : CITIES[c]; }
function isRL(raw) { const c = canon(raw); return c !== null && RL.has(c); }
function price(o) {
  const a = km(o.fromCity), b = km(o.toCity);
  if (a === null || b === null) return null;
  if (o.kind !== 'מהיום למחר' || o.size === 'גדולה') return null;
  const far = Math.max(a, b);
  const rl = isRL(o.fromCity) || isRL(o.toCity);
  const unit = rl ? RL_BASE : (TIERS.find(t => far <= t[0]) || [])[1];
  if (!unit) return null;
  const qty = Math.min(100, Math.max(1, parseInt(o.qty, 10) || 1));
  let extra = 0;
  if (rl) {
    extra = Number(o.extra);
    if (!(extra >= EXTRA_STEP && extra <= EXTRA_MAX && extra % EXTRA_STEP === 0)) return { needExtra: true };
  }
  return { unit, qty, extra, total: unit * qty + extra };
}

const EXTRA_TXT = {10:'מעטפה או מסמכים',20:'חבילה קטנה אחת',30:'2–3 חבילות קטנות, או בינונית אחת',40:'בינונית + קטנה, או 4–5 קטנות',50:'2 חבילות בינוניות',60:'חבילה גדולה אחת',70:'גדולה + קטנה או בינונית',80:'2 גדולות, או 3–4 בינוניות',90:'כמה חבילות גדולות',100:'משלוח מלא'};
const STATUSES = ['new', 'assigned', 'picked', 'transit', 'delivered', 'cancelled'];
const LIVE = new Set(['assigned', 'picked', 'transit']);
const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const store = () => getStore({ name: 'liron-orders', consistency: 'strong' });
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const rnd = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
const newId = () => 'L' + Date.now().toString(36).toUpperCase().slice(-6) + rnd(2).toUpperCase();
const ID_RE = /^L[A-Z0-9]{6,14}$/;

function same(want, got) {
  want = String(want || ''); got = String(got || '');
  if (!want || want.length < 4 || got.length !== want.length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return d === 0;
}
// מצב מפתח: קוד ב-ADMIN_PIN. מי שמחובר כמפתח יכול גם כל פעולה של שליח.
function adminOk(req) { return same(process.env.ADMIN_PIN, req.headers.get('x-admin-pin')); }
function pinOk(req) { return adminOk(req) || same(process.env.COURIER_PIN, req.headers.get('x-courier-pin')); }

async function geocode(street, city) {
  if (!city) return null;
  const q = [street, city, 'ישראל'].filter(Boolean).join(', ');
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 3500);
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=il&q=' + encodeURIComponent(q),
      { headers: { 'user-agent': 'LironDelivery/1.0 (liron@liron-delivery.com)', 'accept-language': 'he' }, signal: ac.signal });
    clearTimeout(t);
    const d = await r.json();
    if (d && d[0]) return { lat: +(+d[0].lat).toFixed(6), lng: +(+d[0].lon).toFixed(6) };
  } catch {}
  return null;
}

async function readIdx(s) { return (await s.get('idx', { type: 'json' })) || []; }

function publicView(o, courier) {
  const showLoc = LIVE.has(o.status) && courier && Date.now() - courier.at < 10 * 60 * 1000;
  return {
    id: o.id, status: o.status, history: o.history, createdAt: o.createdAt,
    from: { city: o.from.city, lat: o.from.lat, lng: o.from.lng },
    to: { city: o.to.city, street: o.to.street, lat: o.to.lat, lng: o.to.lng },
    pkg: o.pkg, price: o.price, pay: { method: o.pay.method, paid: o.pay.paid }, schedule: o.schedule,
    courier: showLoc ? { lat: courier.lat, lng: courier.lng, acc: courier.acc, spd: courier.spd, at: courier.at } : null,
    courierPhone: process.env.COURIER_PHONE || '0525068475'
  };
}

export default async (req) => {
  const url = new URL(req.url);
  const a = url.searchParams.get('a') || '';
  const s = store();
  let body = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch { return json(400, { error: 'בקשה לא תקינה' }); } }

  // ---------- לקוח: יצירת הזמנה ----------
  if (a === 'create' && req.method === 'POST') {
    const o = body;
    const fromCity = str(o.fromCity, 40), toCity = str(o.toCity, 40);
    const name = str(o.name, 60), phone = str(o.phone, 20).replace(/[^\d+\-\s]/g, '');
    if (!fromCity || !toCity || !name || phone.replace(/\D/g, '').length < 9) return json(400, { error: 'חסרים פרטים בהזמנה' });
    const p = price({ fromCity, toCity, qty: o.qty, size: o.size, kind: o.kind, extra: o.extra });
    const agreed = Math.round(Number(o.agreed) * 100) / 100;
    let priceRec;
    if (p && !p.needExtra) priceRec = { total: p.total, extra: p.extra || 0, agreed: false, text: p.total + '₪' };
    else if (agreed >= 1 && agreed <= MAX_AMOUNT) priceRec = { total: agreed, extra: 0, agreed: true, text: agreed + '₪ (מתואם)' };
    else priceRec = { total: null, extra: 0, agreed: false, text: 'בתיאום' };
    const extra = isRL(fromCity) || isRL(toCity) ? Number(o.extra) || 0 : 0;
    const [gf, gt] = await Promise.all([geocode(str(o.fromStreet, 80), canon(fromCity) || fromCity), geocode(str(o.toStreet, 80), canon(toCity) || toCity)]);
    const now = Date.now();
    const order = {
      id: newId(), token: rnd(10), createdAt: now, status: 'new', history: [{ s: 'new', at: now }],
      customer: { name, phone, receiver: str(o.receiver, 80) },
      from: { city: canon(fromCity) || fromCity, street: str(o.fromStreet, 80), floor: str(o.fromFloor, 10), apt: str(o.fromApt, 10), lat: gf?.lat ?? null, lng: gf?.lng ?? null },
      to: { city: canon(toCity) || toCity, street: str(o.toStreet, 80), floor: str(o.toFloor, 10), apt: str(o.toApt, 10), lat: gt?.lat ?? null, lng: gt?.lng ?? null },
      pkg: { size: str(o.size, 20), qty: Math.min(100, Math.max(1, parseInt(o.qty, 10) || 1)), care: str(o.care, 20), kind: str(o.kind, 30) },
      extra, extraTxt: EXTRA_TXT[extra] || '', price: priceRec,
      schedule: { date: str(o.date, 12), window: str(o.window, 20) }, notes: str(o.details, 400),
      pay: { method: ['card', 'bit', 'cash'].includes(o.payMethod) ? o.payMethod : 'pending', paid: false, deal: null }
    };
    await s.setJSON('o:' + order.id, order);
    const idx = await readIdx(s); idx.unshift(order.id); await s.setJSON('idx', idx.slice(0, 1000));
    const site = process.env.URL || url.origin;
    return json(200, { id: order.id, token: order.token, trackUrl: `${site}/app.html#/track/${order.id}.${order.token}`, price: priceRec });
  }

  // ---------- לקוח: מעקב ----------
  if (a === 'track') {
    const id = url.searchParams.get('id') || '', token = url.searchParams.get('t') || '';
    if (!ID_RE.test(id)) return json(404, { error: 'לא נמצא' });
    const o = await s.get('o:' + id, { type: 'json' });
    if (!o || o.token !== token) return json(404, { error: 'לא מצאנו משלוח עם הקוד הזה' });
    const courier = await s.get('courier', { type: 'json' });
    return json(200, publicView(o, courier));
  }

  // ---------- מצב מפתח ----------
  if (a.startsWith('admin')) {
    if (!adminOk(req)) { await new Promise(r => setTimeout(r, 900)); return json(401, { error: 'קוד מפתח שגוי' }); }
    if (a === 'admin-login') return json(200, { ok: true });
    if (a === 'admin-list') {
      const idx = await readIdx(s);
      const orders = (await Promise.all(idx.slice(0, 1000).map(id => s.get('o:' + id, { type: 'json' })))).filter(Boolean);
      const courier = await s.get('courier', { type: 'json' });
      const sys = {
        cardcom: !!(process.env.CARDCOM_TERMINAL && process.env.CARDCOM_API_NAME),
        terminal: process.env.CARDCOM_TERMINAL ? String(process.env.CARDCOM_TERMINAL).slice(-3) : null,
        courierPin: !!process.env.COURIER_PIN, adminPin: true, site: process.env.URL || url.origin, now: Date.now()
      };
      return json(200, { orders, courier, sys });
    }
    if (a === 'admin-update' && req.method === 'POST') {
      const id = str(body.id, 20);
      if (!ID_RE.test(id)) return json(400, { error: 'לא תקין' });
      const o = await s.get('o:' + id, { type: 'json' });
      if (!o) return json(404, { error: 'לא נמצא' });
      if (body.status && STATUSES.includes(body.status) && body.status !== o.status) { o.status = body.status; o.history.push({ s: body.status, at: Date.now(), by: 'admin' }); }
      if (typeof body.paid === 'boolean') o.pay.paid = body.paid;
      if (body.method && ['card', 'bit', 'cash', 'pending'].includes(body.method)) o.pay.method = body.method;
      if (body.total !== undefined && body.total !== null && body.total !== '') {
        const t = Math.round(Number(body.total) * 100) / 100;
        if (!(t >= 0 && t <= MAX_AMOUNT)) return json(400, { error: 'מחיר לא תקין' });
        o.price = { ...o.price, total: t, text: t + '₪', agreed: true };
      }
      if (typeof body.adminNote === 'string') o.adminNote = str(body.adminNote, 400);
      await s.setJSON('o:' + id, o);
      return json(200, { ok: true, order: o });
    }
    if (a === 'admin-delete' && req.method === 'POST') {
      const id = str(body.id, 20);
      if (!ID_RE.test(id)) return json(400, { error: 'לא תקין' });
      await s.delete('o:' + id);
      const idx = await readIdx(s); await s.setJSON('idx', idx.filter(x => x !== id));
      return json(200, { ok: true });
    }
    return json(404, { error: 'פעולה לא מוכרת' });
  }

  // ---------- שליח: כל השאר דורש קוד ----------
  if (!pinOk(req)) { await new Promise(r => setTimeout(r, 700)); return json(401, { error: 'קוד שליח שגוי' }); }

  if (a === 'login') return json(200, { ok: true });

  if (a === 'list') {
    const idx = await readIdx(s);
    const limit = Math.min(200, parseInt(url.searchParams.get('n'), 10) || 80);
    const orders = (await Promise.all(idx.slice(0, limit).map(id => s.get('o:' + id, { type: 'json' })))).filter(Boolean);
    const courier = await s.get('courier', { type: 'json' });
    return json(200, { orders, courier });
  }

  if (a === 'status' && req.method === 'POST') {
    const id = str(body.id, 20), st = str(body.status, 20);
    if (!ID_RE.test(id) || !STATUSES.includes(st)) return json(400, { error: 'סטטוס לא תקין' });
    const o = await s.get('o:' + id, { type: 'json' });
    if (!o) return json(404, { error: 'לא נמצא' });
    o.status = st; o.history.push({ s: st, at: Date.now() });
    await s.setJSON('o:' + id, o);
    return json(200, { ok: true, order: o });
  }

  if (a === 'paid' && req.method === 'POST') {
    const id = str(body.id, 20);
    if (!ID_RE.test(id)) return json(400, { error: 'לא תקין' });
    const o = await s.get('o:' + id, { type: 'json' });
    if (!o) return json(404, { error: 'לא נמצא' });
    o.pay.paid = !!body.paid; if (body.method && ['card', 'bit', 'cash'].includes(body.method)) o.pay.method = body.method;
    await s.setJSON('o:' + id, o);
    return json(200, { ok: true, order: o });
  }

  if (a === 'loc' && req.method === 'POST') {
    const lat = Number(body.lat), lng = Number(body.lng);
    if (!(lat > 29 && lat < 34 && lng > 34 && lng < 36.5)) return json(400, { error: 'מיקום מחוץ לישראל' });
    const rec = { lat: +lat.toFixed(6), lng: +lng.toFixed(6), acc: Math.round(Number(body.acc) || 0), spd: Number(body.spd) || 0, at: Date.now() };
    await s.setJSON('courier', rec);
    return json(200, { ok: true });
  }

  if (a === 'locoff' && req.method === 'POST') { await s.delete('courier'); return json(200, { ok: true }); }

  return json(404, { error: 'פעולה לא מוכרת' });
};
