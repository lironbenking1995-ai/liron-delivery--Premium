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
const SESSION_DAYS = 30;
const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const store = () => getStore({ name: 'liron-orders', consistency: 'strong' });
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const rnd = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
const newId = () => 'L' + Date.now().toString(36).toUpperCase().slice(-6) + rnd(2).toUpperCase();
const ID_RE = /^L[A-Z0-9]{6,14}$/;
const CID_RE = /^(main|c[0-9a-f]{8})$/;
const phoneKey = p => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('972')) d = '0' + d.slice(3); return d; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function same(want, got) {
  want = String(want || ''); got = String(got || '');
  if (!want || want.length < 4 || got.length !== want.length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return d === 0;
}
async function sha(text) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }

// מצב מפתח: קוד ב-ADMIN_PIN
function adminOk(req) { return same(process.env.ADMIN_PIN, req.headers.get('x-admin-pin')); }
// השליח הראשי (לירון): נכנס עם COURIER_PIN בלבד
const MAIN = () => ({ id: 'main', name: process.env.COURIER_NAME || 'לירון', phone: process.env.COURIER_PHONE || '0525068475', active: true });

async function getCouriers(s) { return (await s.get('couriers', { type: 'json' })) || []; }
const pubCourier = c => ({ id: c.id, name: c.name, phone: c.phone, active: c.active !== false });

// מזהה מי מבצע את הבקשה: מפתח, שליח עם סשן, או השליח הראשי עם קוד
async function who(req, s) {
  if (adminOk(req)) return { id: 'admin', name: 'מפתח', admin: true };
  const tok = String(req.headers.get('x-courier-token') || '');
  if (/^[0-9a-f]{40}$/.test(tok)) {
    const ses = await s.get('sess:' + tok, { type: 'json' });
    if (ses && ses.exp > Date.now()) {
      if (ses.cid === 'main') return MAIN();
      const c = (await getCouriers(s)).find(x => x.id === ses.cid);
      if (c && c.active !== false) return pubCourier(c);
    }
  }
  if (same(process.env.COURIER_PIN, req.headers.get('x-courier-pin'))) return MAIN();
  return null;
}

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
async function readOrders(s, n) { const idx = await readIdx(s); return (await Promise.all(idx.slice(0, n).map(id => s.get('o:' + id, { type: 'json' })))).filter(Boolean); }
async function locOf(s, cid) { return (await s.get('loc:' + (cid || 'main'), { type: 'json' })) || (cid === 'main' || !cid ? await s.get('courier', { type: 'json' }) : null); }

function publicView(o, loc) {
  const showLoc = LIVE.has(o.status) && loc && Date.now() - loc.at < 10 * 60 * 1000;
  return {
    id: o.id, status: o.status, history: o.history, createdAt: o.createdAt,
    from: { city: o.from.city, lat: o.from.lat, lng: o.from.lng },
    to: { city: o.to.city, street: o.to.street, lat: o.to.lat, lng: o.to.lng },
    pkg: o.pkg, price: o.price, pay: { method: o.pay.method, paid: o.pay.paid }, schedule: o.schedule,
    courier: showLoc ? { lat: loc.lat, lng: loc.lng, acc: loc.acc, spd: loc.spd, at: loc.at } : null,
    courierName: o.courierName || null,
    courierPhone: o.courierPhone || process.env.COURIER_PHONE || '0525068475'
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
      pay: { method: ['card', 'bit', 'cash'].includes(o.payMethod) ? o.payMethod : 'pending', paid: false, deal: null },
      assignedTo: null, courierName: null, courierPhone: null
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
    return json(200, publicView(o, await locOf(s, o.assignedTo)));
  }

  // ---------- שליח: התחברות ----------
  if (a === 'login' && req.method === 'POST') {
    const code = str(body.code, 40), ph = phoneKey(body.phone);
    let cid = null, me = null;
    if (!ph && same(process.env.COURIER_PIN, code)) { cid = 'main'; me = MAIN(); }
    else if (ph) {
      if (phoneKey(MAIN().phone) === ph && same(process.env.COURIER_PIN, code)) { cid = 'main'; me = MAIN(); }
      else {
        const c = (await getCouriers(s)).find(x => phoneKey(x.phone) === ph);
        if (c && c.active !== false && c.hash && (await sha(c.salt + ':' + code)) === c.hash) { cid = c.id; me = pubCourier(c); }
        else if (c && c.active === false) { await sleep(700); return json(403, { error: 'החשבון שלך מושבת. פנה למנהל.' }); }
      }
    }
    if (!me) { await sleep(900); return json(401, { error: 'טלפון או קוד שגויים' }); }
    const tok = rnd(20);
    await s.setJSON('sess:' + tok, { cid, exp: Date.now() + SESSION_DAYS * 864e5 });
    if (cid !== 'main') {
      const list = await getCouriers(s); const c = list.find(x => x.id === cid); if (c) { c.lastLogin = Date.now(); await s.setJSON('couriers', list); }
    }
    return json(200, { token: tok, courier: me });
  }

  // ---------- מצב מפתח ----------
  if (a.startsWith('admin')) {
    if (!adminOk(req)) { await sleep(900); return json(401, { error: 'קוד מפתח שגוי' }); }
    if (a === 'admin-login') return json(200, { ok: true });
    if (a === 'admin-list') {
      const orders = await readOrders(s, 1000);
      const list = await getCouriers(s);
      const all = [MAIN(), ...list.map(pubCourier)];
      const locs = {}; await Promise.all(all.map(async c => { const l = await locOf(s, c.id); if (l) locs[c.id] = l; }));
      const couriers = all.map(c => ({ ...c, main: c.id === 'main', lastLogin: (list.find(x => x.id === c.id) || {}).lastLogin || null, loc: locs[c.id] || null }));
      const sys = {
        cardcom: !!(process.env.CARDCOM_TERMINAL && process.env.CARDCOM_API_NAME),
        terminal: process.env.CARDCOM_TERMINAL ? String(process.env.CARDCOM_TERMINAL).slice(-3) : null,
        courierPin: !!process.env.COURIER_PIN, adminPin: true, site: process.env.URL || url.origin, now: Date.now()
      };
      return json(200, { orders, couriers, sys });
    }
    if (a === 'admin-courier-save' && req.method === 'POST') {
      const name = str(body.name, 40), phone = str(body.phone, 20), code = str(body.code, 40);
      if (!name || phoneKey(phone).length < 9) return json(400, { error: 'צריך שם וטלפון תקין' });
      const list = await getCouriers(s);
      const id = body.id && CID_RE.test(body.id) && body.id !== 'main' ? body.id : null;
      if (list.some(x => phoneKey(x.phone) === phoneKey(phone) && x.id !== id) || phoneKey(MAIN().phone) === phoneKey(phone)) return json(409, { error: 'כבר יש שליח עם הטלפון הזה' });
      let c = id ? list.find(x => x.id === id) : null;
      if (id && !c) return json(404, { error: 'השליח לא נמצא' });
      if (!c) { if (code.length < 4) return json(400, { error: 'קוד אישי של 4 תווים לפחות' }); c = { id: 'c' + rnd(4), createdAt: Date.now(), active: true }; list.push(c); }
      c.name = name; c.phone = phone;
      if (typeof body.active === 'boolean') c.active = body.active;
      if (code) { if (code.length < 4) return json(400, { error: 'קוד אישי של 4 תווים לפחות' }); c.salt = rnd(8); c.hash = await sha(c.salt + ':' + code); }
      await s.setJSON('couriers', list);
      return json(200, { ok: true, courier: pubCourier(c) });
    }
    if (a === 'admin-courier-delete' && req.method === 'POST') {
      const id = str(body.id, 20);
      if (!CID_RE.test(id) || id === 'main') return json(400, { error: 'לא ניתן למחוק את השליח הראשי' });
      const list = await getCouriers(s);
      await s.setJSON('couriers', list.filter(x => x.id !== id)); await s.delete('loc:' + id);
      return json(200, { ok: true });
    }
    if (a === 'admin-health') {
      const site = process.env.URL || url.origin;
      const timed = async (fn) => { const t0 = Date.now(); try { const r = await fn(); return { ...r, ms: Date.now() - t0 }; } catch (e) { return { ok: false, detail: String(e && e.message || e).slice(0, 120), ms: Date.now() - t0 }; } };
      const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('אין תשובה תוך ' + ms / 1000 + ' שניות')), ms))]);
      const checks = [];
      checks.push({ key: 'env', label: 'הגדרות בשרת', ...(() => {
        const miss = ['CARDCOM_TERMINAL', 'CARDCOM_API_NAME', 'COURIER_PIN', 'ADMIN_PIN'].filter(k => !process.env[k]);
        return { ok: miss.length === 0, detail: miss.length ? 'חסר: ' + miss.join(', ') : 'מסוף, שם API, קוד שליח וקוד מפתח מוגדרים' };
      })() });
      checks.push({ key: 'storage', label: 'אחסון הזמנות (Netlify Blobs)', ...(await timed(async () => {
        const v = { at: Date.now(), r: rnd(4) };
        await s.setJSON('health', v); const back = await s.get('health', { type: 'json' }); await s.delete('health');
        const n = (await readIdx(s)).length;
        return back && back.r === v.r ? { ok: true, detail: 'כתיבה וקריאה תקינות · ' + n + ' הזמנות שמורות' } : { ok: false, detail: 'הנתון שנכתב לא נקרא בחזרה' };
      })) });
      checks.push({ key: 'cardcom', label: 'חיבור לקארדקום (אשראי)', ...(await timed(async () => {
        if (!process.env.CARDCOM_TERMINAL || !process.env.CARDCOM_API_NAME) return { ok: false, detail: 'מסוף או שם API לא מוגדרים' };
        const r = await withTimeout(fetch('https://secure.cardcom.solutions/api/v11/LowProfile/Create', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ TerminalNumber: Number(process.env.CARDCOM_TERMINAL), ApiName: process.env.CARDCOM_API_NAME, Operation: 'ChargeOnly', ReturnValue: 'HEALTHCHECK', Amount: 1, ProductName: 'בדיקת מערכת (לא חיוב)', ISOCoinId: 1, Language: 'he', SuccessRedirectUrl: site + '/thanks.html', FailedRedirectUrl: site + '/index.html' }) }), 9000);
        const d = await r.json();
        return d.ResponseCode === 0 && d.Url ? { ok: true, detail: 'קארדקום אישרה את המסוף ושם ה-API · נוצר דף תשלום לבדיקה בלי חיוב' } : { ok: false, detail: 'קארדקום החזירה שגיאה ' + d.ResponseCode + (d.Description ? ': ' + String(d.Description).slice(0, 100) : '') };
      })) });
      checks.push({ key: 'geo', label: 'איתור כתובות למפה', ...(await timed(async () => {
        const g = await geocode('', 'אשקלון');
        return g ? { ok: true, detail: 'הכתובות מזוהות על המפה' } : { ok: false, warn: true, detail: 'שירות המפות לא ענה. האפליקציה עובדת, רק בלי סימון כתובות על המפה' };
      })) });
      const list = await getCouriers(s);
      const all = [MAIN(), ...list.filter(c => c.active !== false)];
      const sharing = (await Promise.all(all.map(c => locOf(s, c.id)))).filter(l => l && Date.now() - l.at < 10 * 60 * 1000).length;
      checks.push({ key: 'couriers', label: 'שליחים', ok: true, info: true, detail: all.length + ' שליחים פעילים · ' + (sharing ? sharing + ' משתפים מיקום עכשיו' : 'אף שליח לא משתף מיקום כרגע (תקין כשאין משלוח בדרך)') });
      return json(200, { checks, at: Date.now() });
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
      if (body.assignedTo !== undefined) {
        if (!body.assignedTo) { o.assignedTo = null; o.courierName = null; o.courierPhone = null; }
        else {
          const c = body.assignedTo === 'main' ? MAIN() : (await getCouriers(s)).find(x => x.id === body.assignedTo);
          if (!c) return json(400, { error: 'שליח לא קיים' });
          o.assignedTo = c.id; o.courierName = c.name; o.courierPhone = c.phone;
          if (o.status === 'new') { o.status = 'assigned'; o.history.push({ s: 'assigned', at: Date.now(), by: 'admin' }); }
        }
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

  // ---------- שליח: כל השאר דורש התחברות ----------
  const me = await who(req, s);
  if (!me) { await sleep(700); return json(401, { error: 'צריך להתחבר מחדש' }); }

  if (a === 'me') return json(200, { courier: { id: me.id, name: me.name, phone: me.phone } });

  if (a === 'logout' && req.method === 'POST') {
    const tok = String(req.headers.get('x-courier-token') || '');
    if (/^[0-9a-f]{40}$/.test(tok)) await s.delete('sess:' + tok);
    return json(200, { ok: true });
  }

  if (a === 'list') {
    const limit = Math.min(300, parseInt(url.searchParams.get('n'), 10) || 120);
    let orders = await readOrders(s, limit);
    // שליח רואה משלוחים חדשים שעוד לא נלקחו, ואת המשלוחים שלו
    if (!me.admin) orders = orders.filter(o => o.status === 'new' || o.assignedTo === me.id || (!o.assignedTo && me.id === 'main' && o.status !== 'new'));
    return json(200, { orders, me: { id: me.id, name: me.name, phone: me.phone }, loc: await locOf(s, me.admin ? 'main' : me.id) });
  }

  const loadMine = async (id) => {
    if (!ID_RE.test(id)) return [null, json(400, { error: 'לא תקין' })];
    const o = await s.get('o:' + id, { type: 'json' });
    if (!o) return [null, json(404, { error: 'לא נמצא' })];
    return [o, null];
  };

  if (a === 'status' && req.method === 'POST') {
    const st = str(body.status, 20);
    if (!STATUSES.includes(st)) return json(400, { error: 'סטטוס לא תקין' });
    const [o, err] = await loadMine(str(body.id, 20)); if (err) return err;
    if (!me.admin) {
      const owner = o.assignedTo || (o.status !== 'new' ? 'main' : null);
      if (o.status === 'new') {
        if (st === 'assigned') { o.assignedTo = me.id; o.courierName = me.name; o.courierPhone = me.phone; }
        else if (!(st === 'cancelled' && me.id === 'main')) return json(409, { error: 'קודם לוחצים "לקחתי את המשלוח"' });
      } else if (owner !== me.id) return json(409, { error: 'המשלוח הזה כבר אצל ' + (o.courierName || 'שליח אחר') });
    }
    o.status = st; o.history.push({ s: st, at: Date.now(), by: me.id });
    await s.setJSON('o:' + o.id, o);
    return json(200, { ok: true, order: o });
  }

  if (a === 'paid' && req.method === 'POST') {
    const [o, err] = await loadMine(str(body.id, 20)); if (err) return err;
    if (!me.admin && o.assignedTo && o.assignedTo !== me.id) return json(409, { error: 'המשלוח הזה אצל שליח אחר' });
    o.pay.paid = !!body.paid; if (body.method && ['card', 'bit', 'cash'].includes(body.method)) o.pay.method = body.method;
    await s.setJSON('o:' + o.id, o);
    return json(200, { ok: true, order: o });
  }

  if (a === 'loc' && req.method === 'POST') {
    const lat = Number(body.lat), lng = Number(body.lng);
    if (!(lat > 29 && lat < 34 && lng > 34 && lng < 36.5)) return json(400, { error: 'מיקום מחוץ לישראל' });
    const rec = { lat: +lat.toFixed(6), lng: +lng.toFixed(6), acc: Math.round(Number(body.acc) || 0), spd: Number(body.spd) || 0, at: Date.now(), name: me.name };
    await s.setJSON('loc:' + (me.admin ? 'main' : me.id), rec);
    return json(200, { ok: true });
  }

  if (a === 'locoff' && req.method === 'POST') { await s.delete('loc:' + (me.admin ? 'main' : me.id)); if (me.id === 'main') await s.delete('courier'); return json(200, { ok: true }); }

  return json(404, { error: 'פעולה לא מוכרת' });
};
