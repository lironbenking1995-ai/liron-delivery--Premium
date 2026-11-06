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
const CID_RE = /^(main|c[0-9a-f]{8}|e\d{1,2})$/;
const phoneKey = p => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('972')) d = '0' + d.slice(3); return d; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const distM = (a, b) => { const R = 6371000, t = Math.PI / 180, dl = (b.lat - a.lat) * t, dn = (b.lng - a.lng) * t; const x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const TRAIL_MAX = 600;
const slim = o => { const { trail, ...rest } = o; return { ...rest, trailN: (trail || []).length }; };

function same(want, got) {
  want = String(want || ''); got = String(got || '');
  if (!want || want.length < 4 || got.length !== want.length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return d === 0;
}
// ---------- אבטחה: הגבלת ניסיונות, בדיקת מקור, רישום ----------
const ipOf = (req, ctx) => String(ctx?.ip || req.headers.get('x-nf-client-connection-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || 'unknown').trim().slice(0, 64);
const FAIL_WIN = 15 * 60 * 1000, FAIL_MAX = 20;        // 20 קודים שגויים ב-15 דקות → חסימה ל-15 דקות
const CREATE_WIN = 60 * 60 * 1000, CREATE_MAX = 20;    // עד 20 הזמנות בשעה מאותה כתובת
const ADMIN_SESSION_DAYS = 7;
const secLog = (ev, ip, extra) => console.warn('[security]', ev, 'ip=' + ip, extra || '');
async function rlGet(s, key, win) { const r = await s.get(key, { type: 'json' }); return r && Date.now() - r.t < win ? r : { n: 0, t: Date.now() }; }
async function ipKey(prefix, ip) { return prefix + (await sha('ip:' + ip)).slice(0, 24); }
async function isLocked(s, ip) { const r = await s.get(await ipKey('rl:', ip), { type: 'json' }); return !!(r && r.until && r.until > Date.now()); }
async function noteFail(s, ip, what) {
  const k = await ipKey('rl:', ip); const r = await rlGet(s, k, FAIL_WIN); r.n++;
  if (r.n >= FAIL_MAX) { r.until = Date.now() + FAIL_WIN; secLog('LOCKED after ' + r.n + ' wrong codes', ip, what); }
  else if (r.n >= 5) secLog('wrong code #' + r.n, ip, what);
  await s.setJSON(k, r);
}
const tooMany = () => json(429, { error: 'יותר מדי ניסיונות. נסו שוב בעוד 15 דקות.' });
// בקשות POST מתקבלות רק מהאתר עצמו (הגנת CSRF) ורק כ-JSON
function originOk(req, url) {
  const o = req.headers.get('origin'); if (!o) return true;
  try { const h = new URL(o).host; return h === url.host || /(^|\.)liron-delivery\.com$/.test(h); } catch { return false; }
}
async function sha(text) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }

// כניסת ניהול: קוד מפתח (ADMIN_PIN) או קוד מנהל.
// קודי מנהל: במשתנה MANAGER_CODES בפורמט "שם:קוד,שם:קוד", ו/או קודים שהמפתח מוסיף באפליקציה (נשמרים מוצפנים).
function envManagers() {
  return String(process.env.MANAGER_CODES || '').split(',').map(x => x.trim()).filter(Boolean).map((x, i) => {
    const k = x.lastIndexOf(':'); return k > 0 ? { id: 'env' + i, name: x.slice(0, k).trim(), code: x.slice(k + 1).trim(), env: true } : null;
  }).filter(m => m && m.code.length >= 4);
}
// טביעת אצבע של הקוד: כשמחליפים קוד, כל החיבורים הישנים שלו מתנתקים
async function credFp(r, s) {
  if (r.role === 'dev') return process.env.ADMIN_PIN ? (await sha('fp:' + process.env.ADMIN_PIN)).slice(0, 20) : null;
  if (/^env/.test(r.mid || '')) { const m = envManagers().find(x => x.id === r.mid); return m ? (await sha('fp:' + m.code)).slice(0, 20) : null; }
  const m = ((await s.get('managers', { type: 'json' })) || []).find(x => x.id === r.mid);
  return m && m.active !== false && m.hash ? m.hash.slice(0, 20) : null;
}
async function adminRole(req, s) {
  const tok = String(req.headers.get('x-admin-token') || '');
  if (/^[0-9a-f]{48}$/.test(tok)) {
    const ses = await s.get('as:' + tok, { type: 'json' });
    if (ses && ses.exp > Date.now() && ses.fp && ses.fp === await credFp(ses, s)) return { role: ses.role, name: ses.name, mid: ses.mid, tok };
    return null;
  }
  return null;
}
async function adminByCode(code, s) {
  code = String(code || '');
  if (!code) return null;
  if (same(process.env.ADMIN_PIN, code)) return { role: 'dev', name: 'מפתח' };
  for (const m of envManagers()) if (same(m.code, code)) return { role: 'manager', name: m.name, mid: m.id };
  const list = (await s.get('managers', { type: 'json' })) || [];
  for (const m of list) if (m.active !== false && m.hash && (await sha(m.salt + ':' + code)) === m.hash) return { role: 'manager', name: m.name, mid: m.id };
  return null;
}
// השליח הראשי (לירון): נכנס עם COURIER_PIN בלבד
const MAIN = () => ({ id: 'main', name: process.env.COURIER_NAME || 'לירון', phone: process.env.COURIER_PHONE || '0525068475', active: true });

// ---------- אימות SMS לשליחים ----------
// Twilio Verify: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID
// 019 SMS: SMS019_USER, SMS019_TOKEN (אופציונלי: SMS019_SOURCE, SMS019_APP_ID)
const OTP_PROVIDER = () => (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SID) ? 'twilio' : (process.env.SMS019_USER && process.env.SMS019_TOKEN) ? '019' : null;
const OTP_ON = () => !!OTP_PROVIDER() && process.env.COURIER_OTP !== 'off';
const OTP_SESSION_HOURS = () => Math.min(72, Math.max(1, Number(process.env.COURIER_OTP_HOURS) || 12));
const ilPhone = p => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('972')) d = '0' + d.slice(3); return /^05\d{8}$/.test(d) ? d : null; };
const maskPhone = d => d.slice(0, 3) + '-XXX-X' + d.slice(-3);
async function otpSend(phone) {
  if (OTP_PROVIDER() === 'twilio') {
    const r = await fetch('https://verify.twilio.com/v2/Services/' + process.env.TWILIO_VERIFY_SID + '/Verifications', { method: 'POST', headers: { authorization: 'Basic ' + btoa(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ To: '+972' + phone.slice(1), Channel: 'sms', Locale: 'he' }) });
    if (!r.ok) console.error('twilio send', r.status, (await r.text()).slice(0, 300));
    return r.ok;
  }
  const r = await fetch('https://019sms.co.il/api', { method: 'POST', headers: { authorization: 'Bearer ' + process.env.SMS019_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ send_otp: { user: { username: process.env.SMS019_USER }, phone, app_id: String(process.env.SMS019_APP_ID || '1'), source: process.env.SMS019_SOURCE || 'LironDeliv', max_tries: '5', valid_time: '5', text: 'קוד הכניסה שלך ללירון משלוחים: [code]' } }) });
  const j = await r.json().catch(() => ({}));
  if (Number(j.status) !== 0) console.error('019 send', r.status, j.status, String(j.message || '').slice(0, 200));
  return Number(j.status) === 0;
}
async function otpCheck(phone, code) {
  if (OTP_PROVIDER() === 'twilio') {
    const r = await fetch('https://verify.twilio.com/v2/Services/' + process.env.TWILIO_VERIFY_SID + '/VerificationCheck', { method: 'POST', headers: { authorization: 'Basic ' + btoa(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ To: '+972' + phone.slice(1), Code: code }) });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.status === 'approved';
  }
  const r = await fetch('https://019sms.co.il/api', { method: 'POST', headers: { authorization: 'Bearer ' + process.env.SMS019_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ validate_otp: { user: { username: process.env.SMS019_USER }, phone, app_id: String(process.env.SMS019_APP_ID || '1'), code, destination_type: '1' } }) });
  const j = await r.json().catch(() => ({}));
  return Number(j.status) === 0;
}
async function makeCourierSession(s, cid, fp, otp) {
  const tok = rnd(20);
  const exp = otp ? Date.now() + OTP_SESSION_HOURS() * 3600e3 : Date.now() + SESSION_DAYS * 864e5;
  await s.setJSON('sess:' + tok, { cid, fp, otp: !!otp, exp });
  if (cid.startsWith('c')) { const list = await getCouriers(s); const c = list.find(x => x.id === cid); if (c) { c.lastLogin = Date.now(); await s.setJSON('couriers', list); } }
  return tok;
}
async function getCouriers(s) { return (await s.get('couriers', { type: 'json' })) || []; }
// שליחים קבועים מ-Netlify: COURIER_CODES בפורמט "שם:קוד" או "שם:טלפון:קוד", מופרדים בפסיק
function envCouriers() {
  return String(process.env.COURIER_CODES || '').split(',').map(x => x.trim()).filter(Boolean).map((x, i) => {
    const p = x.split(':').map(y => y.trim()); if (p.length < 2) return null;
    const code = p[p.length - 1], phone = p.length >= 3 ? p[1] : '';
    return code.length >= 4 ? { id: 'e' + i, name: p[0], phone: phone || (process.env.COURIER_PHONE || '0525068475'), code, env: true, active: true } : null;
  }).filter(Boolean);
}
async function findCourier(s, id) { if (id === 'main') return MAIN(); const e = envCouriers().find(x => x.id === id); if (e) return e; return (await getCouriers(s)).find(x => x.id === id) || null; }
// בודק אם קוד כבר בשימוש אצל מישהו (מפתח, מנהל, שליח)
async function codeTaken(s, code, exceptId) {
  if (same(process.env.ADMIN_PIN, code) || same(process.env.COURIER_PIN, code)) return true;
  if (envManagers().some(m => same(m.code, code)) || envCouriers().some(c => same(c.code, code))) return true;
  for (const m of ((await s.get('managers', { type: 'json' })) || [])) if (m.hash && (await sha(m.salt + ':' + code)) === m.hash) return true;
  for (const c of await getCouriers(s)) if (c.id !== exceptId && c.hash && (await sha(c.salt + ':' + code)) === c.hash) return true;
  return false;
}
async function genCode(s) {
  for (let i = 0; i < 30; i++) { const a = new Uint32Array(1); crypto.getRandomValues(a); const c = String(100000 + (a[0] % 900000)); if (!(await codeTaken(s, c))) return c; }
  throw new Error('לא הצלחנו ליצור קוד, נסו שוב');
}
const pubCourier = c => ({ id: c.id, name: c.name, phone: c.phone || process.env.COURIER_PHONE || '0525068475', active: c.active !== false });

async function courierFp(c) {
  if (c.id === 'main') return process.env.COURIER_PIN ? (await sha('fp:' + process.env.COURIER_PIN)).slice(0, 20) : null;
  if (c.env) return (await sha('fp:' + c.code)).slice(0, 20);
  return c.hash ? c.hash.slice(0, 20) : null;
}
// מזהה מי מבצע את הבקשה: מפתח, שליח עם סשן, או השליח הראשי עם קוד
async function who(req, s) {
  const ar = await adminRole(req, s);
  if (ar) return { id: 'admin', name: ar.name, admin: true };
  const tok = String(req.headers.get('x-courier-token') || '');
  if (/^[0-9a-f]{40}$/.test(tok)) {
    const ses = await s.get('sess:' + tok, { type: 'json' });
    if (ses && ses.exp > Date.now()) {
      const c = await findCourier(s, ses.cid);
      if (c && c.active !== false && (ses.fp || null) === await courierFp(c) && (ses.otp || !OTP_ON())) return pubCourier(c);
    }
  }
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

export default async (req, context) => {
  const url = new URL(req.url);
  const a = url.searchParams.get('a') || '';
  const s = store();
  const ip = ipOf(req, context);
  if (!['GET', 'POST'].includes(req.method)) return json(405, { error: 'שיטה לא נתמכת' });
  let body = {};
  if (req.method === 'POST') {
    if (!originOk(req, url)) { secLog('blocked cross-site POST', ip, req.headers.get('origin')); return json(403, { error: 'בקשה ממקור לא מורשה' }); }
    if (!/^application\/json/i.test(req.headers.get('content-type') || '')) return json(415, { error: 'בקשה לא תקינה' });
    if (Number(req.headers.get('content-length') || 0) > 20000) return json(413, { error: 'בקשה גדולה מדי' });
    try { body = await req.json(); } catch { return json(400, { error: 'בקשה לא תקינה' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'בקשה לא תקינה' });
  }

  // ---------- לקוח: יצירת הזמנה ----------
  if (a === 'create' && req.method === 'POST') {
    const ck = await ipKey('rc:', ip); const cr = await rlGet(s, ck, CREATE_WIN);
    if (cr.n >= CREATE_MAX) { secLog('too many orders', ip, cr.n); return json(429, { error: 'נשלחו הרבה הזמנות מהמכשיר הזה. התקשרו אלינו או נסו שוב בעוד שעה.' }); }
    cr.n++; await s.setJSON(ck, cr);
    const o = body;
    const fromCity = str(o.fromCity, 40), toCity = str(o.toCity, 40);
    const name = str(o.name, 60), phone = str(o.phone, 20).replace(/[^\d+\-\s]/g, '');
    if (!fromCity || !toCity || !name || phone.replace(/\D/g, '').length < 9) return json(400, { error: 'חסרים פרטים בהזמנה' });
    const p = price({ fromCity, toCity, qty: o.qty, size: o.size, kind: o.kind, extra: o.extra });
    const agreed = Math.round(Number(o.agreed) * 100) / 100;
    let priceRec;
    if (p && !p.needExtra) priceRec = { total: p.total, extra: p.extra || 0, agreed: false, text: p.total + '₪' };
    else if (agreed >= 1 && agreed <= MAX_AMOUNT) priceRec = { total: agreed, extra: 0, agreed: true, byCustomer: true, text: agreed + '₪ (הלקוח הזין, לבדוק מול מה שסוכם)' };
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
    if (!o || !same(o.token, token)) return json(404, { error: 'לא מצאנו משלוח עם הקוד הזה' });
    return json(200, publicView(o, await locOf(s, o.assignedTo)));
  }

  // ---------- שליח: התחברות ----------
  if (a === 'login' && req.method === 'POST') {
    // כניסה עם הקוד האישי בלבד (הטלפון לא חובה)
    if (await isLocked(s, ip)) return tooMany();
    const code = str(body.code, 40);
    let cid = null, me = null, fp = null, rawPhone = '';
    if (code.length >= 4) {
      if (same(process.env.COURIER_PIN, code)) { cid = 'main'; me = MAIN(); fp = await courierFp(MAIN()); rawPhone = MAIN().phone; }
      if (!me) { const e = envCouriers().find(c => same(c.code, code)); if (e) { cid = e.id; me = pubCourier(e); fp = await courierFp(e); rawPhone = e.phone; } }
      if (!me) for (const c of await getCouriers(s)) {
        if (c.hash && (await sha(c.salt + ':' + code)) === c.hash) {
          if (c.active === false) { await sleep(700); return json(403, { error: 'החשבון שלך מושבת. פנה למנהל.' }); }
          cid = c.id; me = pubCourier(c); fp = await courierFp(c); rawPhone = c.phone; break;
        }
      }
    }
    if (!me) { await noteFail(s, ip, 'courier-login'); await sleep(900); return json(401, { error: 'הקוד שגוי' }); }
    if (OTP_ON()) {
      // שלב 2: קוד חד-פעמי ב-SMS לנייד של השליח (אם לא רשום לו נייד, הקוד נשלח לנייד של העסק)
      const phone = ilPhone(rawPhone) || ilPhone(process.env.COURIER_PHONE || '0525068475');
      if (!phone) return json(400, { error: 'לא מוגדר מספר נייד. פנו למנהל.' });
      const sk = 'os:' + cid; const sr = await rlGet(s, sk, 3600e3);
      if (sr.n >= 6) { secLog('otp send limit', ip, cid); return json(429, { error: 'נשלחו יותר מדי קודים בשעה האחרונה. נסו שוב מאוחר יותר.' }); }
      let sent = false; try { sent = await otpSend(phone); } catch (e) { console.error('otp send', e); }
      if (!sent) return json(502, { error: 'לא הצלחנו לשלוח SMS כרגע. נסו שוב בעוד דקה.' });
      sr.n++; await s.setJSON(sk, sr);
      const pend = rnd(20);
      await s.setJSON('otp:' + pend, { cid, fp, phone, exp: Date.now() + 10 * 60e3, tries: 0 });
      secLog('otp sent', ip, cid + ' ' + maskPhone(phone));
      return json(200, { otp: true, pending: pend, phone: maskPhone(phone), own: !!ilPhone(rawPhone) && ilPhone(rawPhone) !== ilPhone(process.env.COURIER_PHONE || '0525068475') || cid === 'main' });
    }
    const tok = await makeCourierSession(s, cid, fp, false);
    return json(200, { token: tok, courier: me });
  }
  if (a === 'login-otp' && req.method === 'POST') {
    if (await isLocked(s, ip)) return tooMany();
    const pend = str(body.pending, 60), code = String(body.otp || '').replace(/\D/g, '').slice(0, 8);
    const p = /^[0-9a-f]{40}$/.test(pend) ? await s.get('otp:' + pend, { type: 'json' }) : null;
    if (!p || p.exp < Date.now()) return json(410, { error: 'פג התוקף של הקוד. הקישו שוב את הקוד האישי.' });
    let ok = false; if (code.length >= 4) { try { ok = await otpCheck(p.phone, code); } catch (e) { console.error('otp check', e); } }
    if (!ok) {
      await noteFail(s, ip, 'otp'); p.tries = (p.tries || 0) + 1;
      if (p.tries >= 5) { await s.delete('otp:' + pend); return json(410, { error: 'יותר מדי ניסיונות. הקישו שוב את הקוד האישי לקבלת SMS חדש.' }); }
      await s.setJSON('otp:' + pend, p); await sleep(600);
      return json(401, { error: 'קוד ה-SMS שגוי' });
    }
    await s.delete('otp:' + pend);
    const c = await findCourier(s, p.cid);
    if (!c || c.active === false || (p.fp || null) !== await courierFp(c)) return json(401, { error: 'הקוד האישי השתנה. התחברו מחדש.' });
    const tok = await makeCourierSession(s, p.cid, p.fp, true);
    secLog('otp login ok', ip, p.cid);
    return json(200, { token: tok, courier: pubCourier(c) });
  }

  // ---------- מצב מפתח ----------
  if (a === 'admin-login' && req.method === 'POST') {
    if (await isLocked(s, ip)) return tooMany();
    const r = await adminByCode(req.headers.get('x-admin-pin') || body.code, s);
    if (!r) { await noteFail(s, ip, 'admin-login'); await sleep(900); return json(401, { error: 'הקוד שגוי' }); }
    const tok = rnd(24);
    await s.setJSON('as:' + tok, { role: r.role, name: r.name, mid: r.mid || null, fp: await credFp(r, s), exp: Date.now() + ADMIN_SESSION_DAYS * 864e5 });
    secLog('admin login ok', ip, r.role + ':' + r.name);
    return json(200, { ok: true, role: r.role, name: r.name, token: tok });
  }
  if (a === 'admin-logout' && req.method === 'POST') {
    const tok = String(req.headers.get('x-admin-token') || ''); if (/^[0-9a-f]{48}$/.test(tok)) await s.delete('as:' + tok);
    return json(200, { ok: true });
  }
  if (a.startsWith('admin')) {
    const role = await adminRole(req, s);
    if (!role) { await sleep(400); return json(401, { error: 'צריך להתחבר מחדש' }); }
    // ניהול קודי מנהל: רק למפתח
    if (a.startsWith('admin-manager') && role.role !== 'dev') return json(403, { error: 'רק המפתח יכול לנהל קודי מנהל' });
    if (a === 'admin-managers') {
      const list = (await s.get('managers', { type: 'json' })) || [];
      return json(200, { managers: [...envManagers().map(m => ({ id: m.id, name: m.name, env: true, active: true })), ...list.map(m => ({ id: m.id, name: m.name, active: m.active !== false, createdAt: m.createdAt, lastLogin: m.lastLogin || null }))] });
    }
    if (a === 'admin-manager-save' && req.method === 'POST') {
      const name = str(body.name, 40), code = str(body.code, 40);
      if (!name) return json(400, { error: 'צריך שם למנהל' });
      if (!/^\d{6,12}$/.test(code)) return json(400, { error: 'קוד מנהל: 6 עד 12 ספרות' });
      if (same(process.env.ADMIN_PIN, code) || same(process.env.COURIER_PIN, code) || envManagers().some(m => same(m.code, code))) return json(409, { error: 'הקוד הזה כבר בשימוש. בחרו קוד אחר' });
      const list = (await s.get('managers', { type: 'json' })) || [];
      for (const m of list) if (m.hash && (await sha(m.salt + ':' + code)) === m.hash) return json(409, { error: 'הקוד הזה כבר בשימוש. בחרו קוד אחר' });
      const salt = rnd(8);
      list.push({ id: 'm' + rnd(4), name, salt, hash: await sha(salt + ':' + code), active: true, createdAt: Date.now() });
      await s.setJSON('managers', list);
      return json(200, { ok: true });
    }
    if (a === 'admin-manager-delete' && req.method === 'POST') {
      const id = str(body.id, 20);
      if (/^env/.test(id)) return json(400, { error: 'קוד שמוגדר ב-Netlify נמחק רק משם' });
      const list = (await s.get('managers', { type: 'json' })) || [];
      await s.setJSON('managers', list.filter(m => m.id !== id));
      return json(200, { ok: true });
    }
    if (role.mid && !/^env/.test(role.mid)) { const list = (await s.get('managers', { type: 'json' })) || []; const m = list.find(x => x.id === role.mid); if (m && (!m.lastLogin || Date.now() - m.lastLogin > 3e5)) { m.lastLogin = Date.now(); await s.setJSON('managers', list); } }
    if (a === 'admin-order') {
      const id = url.searchParams.get('id') || '';
      if (!ID_RE.test(id)) return json(400, { error: 'לא תקין' });
      const o = await s.get('o:' + id, { type: 'json' });
      if (!o) return json(404, { error: 'לא נמצא' });
      const c = o.assignedTo ? await findCourier(s, o.assignedTo) : null;
      const loc = o.assignedTo ? await locOf(s, o.assignedTo) : null;
      return json(200, { order: o, courier: c ? { ...pubCourier(c), loc } : null });
    }
    if (a === 'admin-list') {
      const orders = (await readOrders(s, 1000)).map(slim);
      const list = await getCouriers(s);
      const all = [MAIN(), ...envCouriers().map(pubCourier), ...list.map(pubCourier)];
      const envIds = new Set(envCouriers().map(c => c.id));
      const locs = {}; await Promise.all(all.map(async c => { const l = await locOf(s, c.id); if (l) locs[c.id] = l; }));
      const couriers = all.map(c => ({ ...c, main: c.id === 'main', env: envIds.has(c.id), lastLogin: (list.find(x => x.id === c.id) || {}).lastLogin || null, loc: locs[c.id] || null }));
      const sys = {
        cardcom: !!(process.env.CARDCOM_TERMINAL && process.env.CARDCOM_API_NAME),
        terminal: process.env.CARDCOM_TERMINAL ? String(process.env.CARDCOM_TERMINAL).slice(-3) : null,
        courierPin: !!process.env.COURIER_PIN, adminPin: true, site: process.env.URL || url.origin, now: Date.now()
      };
      return json(200, { orders, couriers, sys });
    }
    if (a === 'admin-courier-save' && req.method === 'POST') {
      const name = str(body.name, 40); let phone = str(body.phone, 20);
      if (phone && phoneKey(phone) === phoneKey(process.env.COURIER_PHONE || '0525068475')) phone = '';
      let code = str(body.code, 12);
      if (!name) return json(400, { error: 'צריך שם לשליח' });
      if (phone && phoneKey(phone).length < 9) return json(400, { error: 'מספר הטלפון לא תקין (אפשר גם להשאיר ריק)' });
      const list = await getCouriers(s);
      const id = body.id && /^c[0-9a-f]{8}$/.test(body.id) ? body.id : null;
      if (phone && list.some(x => x.phone && phoneKey(x.phone) === phoneKey(phone) && x.id !== id)) return json(409, { error: 'כבר יש שליח עם הטלפון הזה' });
      let c = id ? list.find(x => x.id === id) : null;
      if (id && !c) return json(404, { error: 'השליח לא נמצא' });
      const isNew = !c;
      if (isNew) { c = { id: 'c' + rnd(4), createdAt: Date.now(), active: true }; }
      if (body.autoCode || (isNew && !code)) code = await genCode(s);
      if (code) {
        if (!/^\d{4,12}$/.test(code)) return json(400, { error: 'הקוד צריך להיות 4 עד 12 ספרות' });
        if (await codeTaken(s, code, c.id)) return json(409, { error: 'הקוד הזה כבר בשימוש. בחרו קוד אחר' });
        c.salt = rnd(8); c.hash = await sha(c.salt + ':' + code);
      }
      c.name = name; c.phone = phone || '';
      if (typeof body.active === 'boolean') c.active = body.active;
      if (isNew) list.push(c);
      await s.setJSON('couriers', list);
      return json(200, { ok: true, courier: pubCourier(c), code: code || null });
    }
    if (a === 'admin-courier-bulk' && req.method === 'POST') {
      const n = Math.min(20, Math.max(1, parseInt(body.count, 10) || 1));
      const list = await getCouriers(s);
      const used = new Set([...list.map(c => c.name), ...envCouriers().map(c => c.name)]);
      let k = 1; const made = [];
      for (let i = 0; i < n; i++) {
        while (used.has('שליח ' + k)) k++;
        const name = 'שליח ' + k; used.add(name);
        const code = await genCode(s); const c = { id: 'c' + rnd(4), createdAt: Date.now(), active: true, name, phone: '' };
        c.salt = rnd(8); c.hash = await sha(c.salt + ':' + code); list.push(c);
        await s.setJSON('couriers', list); made.push({ name, code });
      }
      return json(200, { ok: true, made });
    }
    if (a === 'admin-courier-delete' && req.method === 'POST') {
      const id = str(body.id, 20);
      if (!/^c[0-9a-f]{8}$/.test(id)) return json(400, { error: 'את השליח הזה אפשר למחוק רק מ-Netlify' });
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
      const all = [MAIN(), ...envCouriers(), ...list.filter(c => c.active !== false)];
      const sharing = (await Promise.all(all.map(c => locOf(s, c.id)))).filter(l => l && Date.now() - l.at < 10 * 60 * 1000).length;
      checks.push({ key: 'sms', label: 'אימות SMS לשליחים', ...(OTP_ON() ? { ok: true, detail: 'פעיל דרך ' + (OTP_PROVIDER() === 'twilio' ? 'Twilio' : '019 SMS') + ' · קוד חדש בכל כניסה, חיבור בתוקף ' + OTP_SESSION_HOURS() + ' שעות' } : { ok: false, warn: true, detail: 'כבוי: עוד לא חוברה חברת SMS, ושליחים נכנסים עם הקוד האישי בלבד' }) });
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
          const c = await findCourier(s, body.assignedTo);
          if (!c) return json(400, { error: 'שליח לא קיים' });
          o.assignedTo = c.id; o.courierName = c.name; o.courierPhone = c.phone;
          if (o.status === 'new') { o.status = 'assigned'; o.history.push({ s: 'assigned', at: Date.now(), by: 'admin' }); }
        }
      }
      if (typeof body.adminNote === 'string') o.adminNote = str(body.adminNote, 400);
      await s.setJSON('o:' + id, o);
      return json(200, { ok: true, order: slim(o) });
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
    return json(200, { orders: orders.map(slim), me: { id: me.id, name: me.name, phone: me.phone }, loc: await locOf(s, me.admin ? 'main' : me.id) });
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
    const here = await locOf(s, me.admin ? (o.assignedTo || 'main') : me.id);
    const hEntry = { s: st, at: Date.now(), by: me.id, byName: me.name };
    if (here && Date.now() - here.at < 5 * 60 * 1000) { hEntry.lat = here.lat; hEntry.lng = here.lng; }
    o.status = st; o.history.push(hEntry);
    await s.setJSON('o:' + o.id, o);
    return json(200, { ok: true, order: slim(o) });
  }

  if (a === 'paid' && req.method === 'POST') {
    const [o, err] = await loadMine(str(body.id, 20)); if (err) return err;
    if (!me.admin && (o.assignedTo || (o.status !== 'new' ? 'main' : null)) !== me.id) return json(409, { error: 'אפשר לסמן תשלום רק במשלוח שלך' });
    o.pay.paid = !!body.paid; if (body.method && ['card', 'bit', 'cash'].includes(body.method)) o.pay.method = body.method;
    await s.setJSON('o:' + o.id, o);
    return json(200, { ok: true, order: slim(o) });
  }

  if (a === 'loc' && req.method === 'POST') {
    const lat = Number(body.lat), lng = Number(body.lng);
    if (!(lat > 29 && lat < 34 && lng > 34 && lng < 36.5)) return json(400, { error: 'מיקום מחוץ לישראל' });
    const rec = { lat: +lat.toFixed(6), lng: +lng.toFixed(6), acc: Math.round(Number(body.acc) || 0), spd: Number(body.spd) || 0, at: Date.now(), name: me.name };
    await s.setJSON('loc:' + (me.admin ? 'main' : me.id), rec);
    // מסלול: נשמרת נקודה לכל משלוח פעיל של השליח (בערך כל דקה או 150 מטר)
    const ids = Array.isArray(body.active) ? body.active.filter(x => ID_RE.test(String(x))).slice(0, 15) : [];
    await Promise.all(ids.map(async id => {
      const o = await s.get('o:' + id, { type: 'json' });
      if (!o || !LIVE.has(o.status) || (!me.admin && o.assignedTo !== me.id)) return;
      const tr = o.trail || []; const last = tr[tr.length - 1];
      if (last && rec.at - last.t < 55000 && distM(last, rec) < 150) return;
      tr.push({ lat: rec.lat, lng: rec.lng, t: rec.at, s: o.status }); o.trail = tr.slice(-TRAIL_MAX);
      await s.setJSON('o:' + id, o);
    }));
    return json(200, { ok: true });
  }

  if (a === 'locoff' && req.method === 'POST') { await s.delete('loc:' + (me.admin ? 'main' : me.id)); if (me.id === 'main') await s.delete('courier'); return json(200, { ok: true }); }

  return json(404, { error: 'פעולה לא מוכרת' });
};
