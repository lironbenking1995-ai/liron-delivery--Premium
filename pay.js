// יוצר דף תשלום מאובטח בקארדקום (LowProfile) ומחזיר קישור אליו.
// הפרטים הסודיים נקראים ממשתני סביבה ב-Netlify ולא מופיעים בקוד או בדף:
//   CARDCOM_TERMINAL  – מספר המסוף
//   CARDCOM_API_NAME  – שם ה-API
// המחיר מחושב כאן מחדש לפי הערים, כך שאי אפשר לשנות אותו מהדפדפן.

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
const API = 'https://secure.cardcom.solutions/api/v11/LowProfile/Create';
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
const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { 'content-type': 'application/json; charset=utf-8' } });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const terminal = Number(process.env.CARDCOM_TERMINAL);
  const apiName = process.env.CARDCOM_API_NAME;
  if (!terminal || !apiName) return json(500, { error: 'התשלום באשראי עוד לא הוגדר באתר.' });

  let o;
  try { o = await req.json(); } catch { return json(400, { error: 'בקשה לא תקינה' }); }
  // מחיר קבוע מחושב בשרת. אם המחיר בתיאום, הלקוח מזין את הסכום שסוכם (עד 10,000 ₪).
  let p = price(o), agreed = false;
  if (p && p.needExtra) return json(400, { error: 'בחרו תוספת לאזור רמלה-לוד (בכפולות של 10 ₪).' });
  if (!p) {
    const a = Math.round(Number(o.agreed) * 100) / 100;
    if (!(a >= 1 && a <= MAX_AMOUNT)) return json(400, { error: 'הזינו את הסכום שתואם איתנו, בין 1 ל-10,000 ₪.' });
    p = { total: a };
    agreed = true;
  }
  if (p.total > MAX_AMOUNT) return json(400, { error: 'הסכום המקסימלי לתשלום באתר הוא 10,000 ₪.' });

  const site = process.env.URL || new URL(req.url).origin;
  const ref = 'L' + Date.now().toString(36).toUpperCase();
  const desc = `${agreed ? 'סכום מתואם · ' : ''}${p.extra ? 'כולל תוספת ' + p.extra + '₪ · ' : ''}משלוח ${o.size || ''} · ${norm(o.fromCity)} ← ${norm(o.toCity)}`.slice(0, 200);

  const body = {
    TerminalNumber: terminal,
    ApiName: apiName,
    Operation: 'ChargeOnly',
    ReturnValue: ref,
    Amount: p.total,
    ProductName: desc,
    ISOCoinId: 1,
    Language: 'he',
    SuccessRedirectUrl: `${site}/thanks.html?ref=${ref}`,
    FailedRedirectUrl: `${site}/index.html?pay=failed#order`,
    WebHookUrl: `${site}/.netlify/functions/verify`,
    AdvancedDefinition: {
      MinNumOfPayments: 1,
      MaxNumOfPayments: MAX_PAYMENTS
    },
    UIDefinition: {
      CardOwnerNameValue: String(o.name || '').slice(0, 50),
      CardOwnerPhoneValue: String(o.phone || '').replace(/[^\d+]/g, '').slice(0, 15)
    }
  };

  try {
    const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json();
    if (data.ResponseCode !== 0 || !data.Url) {
      console.error('Cardcom error', data.ResponseCode, data.Description);
      return json(502, { error: 'לא הצלחנו לפתוח דף תשלום. נסו שוב או שלמו ב-bit.' });
    }
    return json(200, { url: data.Url, amount: p.total, ref, agreed });
  } catch (e) {
    console.error(e);
    return json(502, { error: 'חברת הסליקה לא זמינה כרגע. נסו שוב בעוד רגע.' });
  }
};
