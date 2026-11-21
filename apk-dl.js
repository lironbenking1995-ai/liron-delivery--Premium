// הורדת אפליקציית לירון משלוחים (APK) – רק עם שם משתמש וסיסמה.
// את שם המשתמש והסיסמה מגדירים בדף ההורדה עצמו ← "הגדרות מנהל" (עם קוד המנהל).
// הסיסמה נשמרת מוצפנת (PBKDF2) ב-Netlify Blobs, לא בקוד.
// אפשרות נוספת: Netlify → Environment variables:
//   APK_USER  = שם המשתמש
//   APK_PASS  = הסיסמה (לפחות 6 תווים)
//   (אפשר גם כמה משתמשים: APK_USERS = "שם:סיסמה,שם2:סיסמה2")
// לעולם לא לכתוב אותם בתוך הקוד.
import { getStore } from '@netlify/blobs';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = 'liron-app.apk';
const TOK_MIN = 10;                       // הקישור להורדה תקף 10 דקות
const FAIL_WIN = 15 * 60 * 1000, FAIL_MAX = 8;  // 8 ניסיונות שגויים → חסימה ל-15 דקות
const GH_RAW = 'https://raw.githubusercontent.com/lironbenking1995-ai/liron-delivery--Premium/main/' + FILE;

const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const store = () => getStore({ name: 'liron-orders', consistency: 'strong' });
const rnd = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
async function sha(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
// השוואה בזמן קבוע (משווים את ה-hash כדי שגם האורך לא ידלוף)
async function same(want, got) {
  want = String(want || ''); got = String(got || '');
  if (!want) return false;
  const a = await sha('c:' + want), b = await sha('c:' + got);
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function pbkdf2(pass, salt) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const b = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 150000 }, k, 256);
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
// קוד מנהל: אותו קוד של כניסת הניהול באפליקציה (ADMIN_PIN / MANAGER_CODES / קודי מנהלים שנוספו באפליקציה)
async function isAdminCode(code, s) {
  code = String(code || ''); if (code.length < 4) return false;
  if (process.env.ADMIN_PIN && await same(process.env.ADMIN_PIN, code)) return true;
  for (const x of String(process.env.MANAGER_CODES || '').split(',')) { const k = x.lastIndexOf(':'); if (k > 0 && x.slice(k + 1).trim().length >= 4 && await same(x.slice(k + 1).trim(), code)) return true; }
  const list = (await s.get('managers', { type: 'json' })) || [];
  for (const m of list) { if (m.active === false || !m.salt || !m.hash) continue; if (await sha(m.salt + ':' + code) === m.hash) return true; }
  return false;
}
const ipOf = (req, ctx) => String(ctx?.ip || req.headers.get('x-nf-client-connection-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || 'unknown').trim().slice(0, 64);
function originOk(req, url) {
  const o = req.headers.get('origin'); if (!o) return true;
  try { const h = new URL(o).host; return h === url.host || /(^|\.)liron-delivery\.com$/.test(h); } catch { return false; }
}
function users() {
  const list = [];
  const u = String(process.env.APK_USER || '').trim(), p = String(process.env.APK_PASS || '');
  if (u && p.length >= 6) list.push({ u, p });
  for (const x of String(process.env.APK_USERS || '').split(',')) {
    const k = x.lastIndexOf(':'); if (k <= 0) continue;
    const uu = x.slice(0, k).trim(), pp = x.slice(k + 1).trim();
    if (uu && pp.length >= 6) list.push({ u: uu, p: pp });
  }
  return list;
}
function findApk() {
  const here = (() => { try { return path.dirname(fileURLToPath(import.meta.url)); } catch { return ''; } })();
  const roots = [process.cwd(), process.env.LAMBDA_TASK_ROOT, here, here && path.join(here, '..'), here && path.join(here, '../..'), '/var/task'].filter(Boolean);
  for (const r of roots) { const f = path.join(r, FILE); try { if (existsSync(f)) return f; } catch {} }
  return null;
}
const dlHeaders = size => {
  const h = { 'content-type': 'application/vnd.android.package-archive', 'content-disposition': 'attachment; filename="' + FILE + '"', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  if (size) h['content-length'] = String(size);
  return h;
};

export default async (req, context) => {
  const url = new URL(req.url);
  const a = url.searchParams.get('a') || '';
  const s = store();
  const ip = ipOf(req, context);
  const rlk = 'apkrl:' + (await sha('ip:' + ip)).slice(0, 24);

  // 1) כניסה: בודקים שם משתמש וסיסמה ומחזירים קישור הורדה זמני
  if (a === 'login') {
    if (req.method !== 'POST') return json(405, { error: 'שיטה לא נתמכת' });
    if (!originOk(req, url)) return json(403, { error: 'בקשה לא מורשית' });
    const list = users();
    const cred = await s.get('apk-cred', { type: 'json' });
    if (!list.length && !cred) return json(503, { error: 'ההורדה עדיין לא הוגדרה. מנהל: לחצו למטה על "הגדרות מנהל".', setup: true });
    let r = await s.get(rlk, { type: 'json' });
    if (!r || Date.now() - r.t > FAIL_WIN) r = { n: 0, t: Date.now() };
    if (r.until && r.until > Date.now()) return json(429, { error: 'יותר מדי ניסיונות. נסו שוב בעוד 15 דקות.' });
    let body = {}; try { body = await req.json(); } catch {}
    const user = String(body.user || '').trim().slice(0, 64), pass = String(body.pass || '').slice(0, 128);
    let ok = null;
    for (const x of list) { const m1 = await same(x.u.toLowerCase(), user.toLowerCase()); const m2 = await same(x.p, pass); if (m1 && m2) ok = x; }
    if (!ok && cred && cred.u && cred.salt) {
      const m1 = await same(cred.u.toLowerCase(), user.toLowerCase());
      const m2 = await same(cred.hash, await pbkdf2(pass, cred.salt));
      if (m1 && m2) ok = { u: cred.u };
    }
    if (!ok) {
      r.n++; if (r.n >= FAIL_MAX) { r.until = Date.now() + FAIL_WIN; console.warn('[security] apk login LOCKED', 'ip=' + ip); }
      await s.setJSON(rlk, r);
      await new Promise(z => setTimeout(z, 400));
      return json(401, { error: 'שם משתמש או סיסמה שגויים' });
    }
    await s.delete(rlk).catch(() => {});
    const t = rnd(24);
    await s.setJSON('apk-tok:' + t, { exp: Date.now() + TOK_MIN * 60 * 1000, uses: 0, u: ok.u });
    console.log('[apk] login ok', ok.u);
    return json(200, { ok: true, url: '/.netlify/functions/apk-dl?t=' + t });
  }

  // הגדרת שם משתמש וסיסמה להורדה – רק עם קוד מנהל
  if (a === 'setup') {
    if (req.method !== 'POST') return json(405, { error: 'שיטה לא נתמכת' });
    if (!originOk(req, url)) return json(403, { error: 'בקשה לא מורשית' });
    let r = await s.get(rlk, { type: 'json' });
    if (!r || Date.now() - r.t > FAIL_WIN) r = { n: 0, t: Date.now() };
    if (r.until && r.until > Date.now()) return json(429, { error: 'יותר מדי ניסיונות. נסו שוב בעוד 15 דקות.' });
    let body = {}; try { body = await req.json(); } catch {}
    if (!(await isAdminCode(body.code, s))) {
      r.n++; if (r.n >= FAIL_MAX) { r.until = Date.now() + FAIL_WIN; console.warn('[security] apk setup LOCKED', 'ip=' + ip); }
      await s.setJSON(rlk, r); await new Promise(z => setTimeout(z, 400));
      return json(401, { error: 'קוד מנהל שגוי' });
    }
    const user = String(body.user || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 64), pass = String(body.pass || '').slice(0, 128);
    if (user.length < 2) return json(400, { error: 'שם המשתמש קצר מדי (לפחות 2 תווים)' });
    if (pass.length < 6) return json(400, { error: 'הסיסמה קצרה מדי (לפחות 6 תווים)' });
    const salt = rnd(16);
    await s.setJSON('apk-cred', { u: user, salt, hash: await pbkdf2(pass, salt), at: Date.now() });
    await s.delete(rlk).catch(() => {});
    console.warn('[security] apk download credentials changed', 'ip=' + ip);
    return json(200, { ok: true });
  }

  // 2) הורדה עם הקישור הזמני
  const t = url.searchParams.get('t') || '';
  if (!/^[0-9a-f]{48}$/.test(t)) return Response.redirect(new URL('/download.html', url), 302);
  const k = 'apk-tok:' + t;
  const tok = await s.get(k, { type: 'json' });
  if (!tok || tok.exp < Date.now() || tok.uses >= 3) {
    if (tok) await s.delete(k).catch(() => {});
    return Response.redirect(new URL('/download.html?x=1', url), 302);
  }
  tok.uses++; await s.setJSON(k, tok);

  const f = findApk();
  if (f) {
    const size = statSync(f).size;
    return new Response(Readable.toWeb(createReadStream(f)), { status: 200, headers: dlHeaders(size) });
  }
  // גיבוי: אם הקובץ לא נכלל בפונקציה, מושכים אותו מהמאגר
  try {
    const up = await fetch(GH_RAW);
    if (up.ok && up.body) return new Response(up.body, { status: 200, headers: dlHeaders(up.headers.get('content-length')) });
  } catch {}
  console.error('[apk] file not found');
  return json(500, { error: 'הקובץ לא נמצא כרגע. נסו שוב מאוחר יותר.' });
};
