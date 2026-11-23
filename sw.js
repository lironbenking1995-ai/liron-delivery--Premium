// Service Worker של לירון משלוחים: האפליקציה והאתר נפתחים מהר ועובדים גם בלי אינטרנט.
// הקובץ הזה הוא פונקציה של Netlify שמחזירה את קוד ה-Service Worker בכתובת /sw.js
const VERSION = 'liron-v1-2026-11-23';
const SW = `
const C='${VERSION}';
const PRE=['/app.html','/index.html','/liron-logo.webp','/manifest.json','/IMG_4754.png','/IMG_4753.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>Promise.all(PRE.map(u=>c.add(new Request(u,{cache:'reload'})).catch(()=>{})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
const OFF='<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>אין חיבור</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#08080a;color:#f5f5f7;font:500 18px/1.6 Heebo,Arial,sans-serif;text-align:center;padding:24px"><div><div style="font-size:56px">📡</div><h1 style="color:#ffd12c;margin:8px 0">אין חיבור לאינטרנט</h1><p>ברגע שהחיבור יחזור, הדף ייטען מחדש.<br>להזמנה דחופה: <a style="color:#ffd12c" href="tel:0525068475">052-5068475</a></p><button onclick="location.reload()" style="margin-top:12px;min-height:50px;padding:0 28px;border:0;border-radius:99px;background:#ffd12c;font:800 17px Heebo,Arial;cursor:pointer">נסו שוב</button></div><script>addEventListener("online",()=>location.reload())</script></body></html>';
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
 if(u.origin!==location.origin)return;
 if(u.pathname.startsWith('/.netlify/')||u.pathname.endsWith('.apk')||u.pathname==='/site-config.json')return;
 if(r.mode==='navigate'||(r.headers.get('accept')||'').includes('text/html')){
  e.respondWith(fetch(r).then(res=>{if(res.ok&&res.type==='basic'){const cp=res.clone();caches.open(C).then(c=>c.put(u.pathname==='/'?'/index.html':u.pathname,cp))}return res})
   .catch(()=>caches.match(u.pathname==='/'?'/index.html':u.pathname).then(m=>m||new Response(OFF,{headers:{'content-type':'text/html; charset=utf-8'}}))));return;}
 if(/\\.(webp|png|jpg|jpeg|svg|ico|woff2?)$/.test(u.pathname)){
  e.respondWith(caches.match(r).then(m=>{const net=fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res}).catch(()=>m);return m||net}));}
});
`;
export default async () => new Response(SW, { status: 200, headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache', 'service-worker-allowed': '/' } });
