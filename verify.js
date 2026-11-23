// בודק מול קארדקום אם תשלום הצליח.
// דף האישור קורא לזה עם lowprofilecode שקארדקום מוסיפה לכתובת, וקארדקום שולחת לכאן גם עדכון (webhook).
import { getStore } from '@netlify/blobs';
const API = 'https://secure.cardcom.solutions/api/v11/LowProfile/GetLpResult';

// מסמן את ההזמנה באפליקציה כשולמה
async function markPaid(ref, t) {
  if (!/^L[A-Z0-9]{6,14}$/.test(String(ref || ''))) return;
  try {
    const s = getStore({ name: 'liron-orders', consistency: 'strong' });
    const o = await s.get('o:' + ref, { type: 'json' });
    if (!o || o.pay.paid) return;
    const amount = Number(t.Amount);
    const due = o.price && o.price.total != null && !o.price.byCustomer ? Number(o.price.total) : null;
    // בודקים שהסכום ששולם תואם למחיר ההזמנה
    if (due != null && !(amount >= due - 0.01)) {
      o.pay = { method: 'card', paid: false, deal: t.TranzactionId ?? null, amount, underpaid: true };
      console.warn('[security] underpaid order', ref, 'paid', amount, 'due', due);
    } else {
      o.pay = { method: 'card', paid: true, deal: t.TranzactionId ?? null, amount };
      if (due == null) o.price = { ...(o.price || {}), total: amount, text: amount + '₪ שולם באשראי (סכום שהלקוח הזין, לבדוק מול מה שסוכם)', byCustomer: true };
    }
    o.history = o.history || []; o.history.push({ s: o.status, at: Date.now(), by: 'cardcom', byName: (o.pay.paid ? 'תשלום אשראי ' : 'תשלום חלקי ') + amount + '₪' });
    await s.setJSON('o:' + ref, o);
    if (o.pay.paid) await notifyPaid(o, s).catch(e => console.error('notify', e));
    else if (o.pay.underpaid) await notifyPaid({ ...o, notes: '⚠️ שולם פחות מהמחיר! שולם ' + amount + '₪ במקום ' + due + '₪. ' + (o.notes || '') }, s).catch(e => console.error('notify', e));
  } catch (e) { console.error('markPaid', e); }
}

// הודעה למנהל בוואטסאפ על הזמנה ששולמה, עם סיכום העסקה ופרטי ההפצה המלאים.
// פעיל רק כשמוגדר ב-Netlify CALLMEBOT_KEY או TWILIO_ACCOUNT_SID+TWILIO_AUTH_TOKEN+TWILIO_WA_FROM.
function orderSummary(o) {
  const p = o.price || {}, adr = x => [x.street, x.city].filter(Boolean).join(', ') + (x.floor ? ' · קומה ' + x.floor : '') + (x.apt ? ' · דירה ' + x.apt : '');
  return ['✅ תשלום התקבל באתר (אשראי / bit)', 'מספר הזמנה: ' + o.id, o.custId ? 'כרטיס לקוח: ' + o.custId + (o.customer.biz ? ' (' + o.customer.biz + ')' : '') : '',
    'מזמין: ' + o.customer.name + ' · ' + o.customer.phone, '', '📦 ' + (o.pkg.mix || o.pkg.qty + ' × ' + o.pkg.size) + ' · ' + o.pkg.kind,
    '📍 איסוף: ' + adr(o.from), '🏁 מסירה: ' + adr(o.to), o.customer.receiver ? '👤 מקבל: ' + o.customer.receiver : '', o.notes ? '📝 ' + o.notes : '', '',
    '💰 לפני מע"מ: ' + (p.net ?? '-') + '₪ · מע"מ ' + (p.vatRate ?? 18) + '%: ' + (p.vat ?? '-') + '₪', '💳 שולם: ' + o.pay.amount + '₪ · עסקה ' + (o.pay.deal ?? '')].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
}
async function notifyPaid(o, s) {
  let c = {}; try { c = (await s.get('wa-cfg', { type: 'json' })) || {}; } catch {}
  const to = String(c.to || process.env.WHATSAPP_TO || process.env.COURIER_PHONE || '0525068475').replace(/\D/g, '').replace(/^972/, '0'), text = orderSummary(o) + '\n\n🔗 https://www.liron-delivery.com/app.html#/devorder/' + o.id;
  const key = process.env.CALLMEBOT_KEY || c.key;
  if (key) await fetch('https://api.callmebot.com/whatsapp.php?phone=972' + to.slice(1) + '&text=' + encodeURIComponent(text) + '&apikey=' + encodeURIComponent(key));
  else if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WA_FROM) await fetch('https://api.twilio.com/2010-04-01/Accounts/' + process.env.TWILIO_ACCOUNT_SID + '/Messages.json', { method: 'POST', headers: { authorization: 'Basic ' + btoa(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ From: 'whatsapp:' + process.env.TWILIO_WA_FROM, To: 'whatsapp:+972' + to.slice(1), Body: text }) });
}
const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { 'content-type': 'application/json; charset=utf-8' } });

export default async (req) => {
  const terminal = Number(process.env.CARDCOM_TERMINAL);
  const apiName = process.env.CARDCOM_API_NAME;
  if (!terminal || !apiName) return json(500, { ok: false });

  let id = new URL(req.url).searchParams.get('id');
  if (!id && req.method === 'POST') {
    try { const b = await req.json(); id = b.LowProfileId || b.lowprofilecode; } catch {}
  }
  if (!id || !/^[0-9a-fA-F-]{20,60}$/.test(id)) return json(400, { ok: false });

  try {
    const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ TerminalNumber: terminal, ApiName: apiName, LowProfileId: id }) });
    const d = await r.json();
    const t = d.TranzactionInfo || {};
    const ok = d.ResponseCode === 0 && t.ResponseCode === 0;
    console.log('Cardcom result', id, d.ReturnValue, ok, t.Amount, t.TranzactionId);
    if (ok) await markPaid(d.ReturnValue, t);
    return json(200, { ok, amount: t.Amount ?? null, ref: d.ReturnValue ?? null, deal: t.TranzactionId ?? null, last4: t.Last4CardDigitsString ?? null });
  } catch (e) {
    console.error(e);
    return json(502, { ok: false });
  }
};
