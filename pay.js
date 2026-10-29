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
  'בני עי"ש': 34, 'יבנה': 35, 'גדרה': 35
};
const ALIAS = { 'קרית מלאכי': 'קריית מלאכי', 'בני עיש': 'בני עי"ש', 'אשקלון העיר': 'אשקלון' };
const TIERS = [[20, 30], [30, 45], [40, 60]];
const API = 'https://secure.cardcom.solutions/api/v11/LowProfile/Create';

function norm(v) {
  return String(v || '').replace(/[-–־]/g, ' ').replace(/[״"׳']/g, m => (m === "'" || m === '׳') ? '' : '"').replace(/\s+/g, ' ').trim();
}
function km(raw) {
  const key = ALIAS[norm(raw)] || norm(raw);
  if (key in CITIES) return CITIES[key];
  const plain = key.replace(/"/g, '');
  for (const c in CITIES) if (c.replace(/"/g, '') === plain) return CITIES[c];
  return null;
}
function price(o) {
  const a = km(o.fromCity), b = km(o.toCity);
  if (a === null || b === null) return null;
  if (o.kind !== 'מהיום למחר' || o.size === 'גדולה') return null;
  const far = Math.max(a, b);
  const t = TIERS.find(t => far <= t[0]);
  if (!t) return null;
  const qty = Math.min(20, Math.max(1, parseInt(o.qty, 10) || 1));
  return { unit: t[1], qty, total: t[1] * qty };
}
const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { 'content-type': 'application/json; charset=utf-8' } });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const terminal = Number(process.env.CARDCOM_TERMINAL);
  const apiName = process.env.CARDCOM_API_NAME;
  if (!terminal || !apiName) return json(500, { error: 'התשלום באשראי עוד לא הוגדר באתר.' });

  let o;
  try { o = await req.json(); } catch { return json(400, { error: 'בקשה לא תקינה' }); }
  const p = price(o);
  if (!p) return json(400, { error: 'למשלוח הזה המחיר נקבע בתיאום, ולכן אי אפשר לשלם עליו אונליין כרגע.' });

  const site = process.env.URL || new URL(req.url).origin;
  const ref = 'L' + Date.now().toString(36).toUpperCase();
  const desc = `משלוח ${o.size || ''} · ${norm(o.fromCity)} ← ${norm(o.toCity)}`.slice(0, 200);

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
    return json(200, { url: data.Url, amount: p.total, ref });
  } catch (e) {
    console.error(e);
    return json(502, { error: 'חברת הסליקה לא זמינה כרגע. נסו שוב בעוד רגע.' });
  }
};
