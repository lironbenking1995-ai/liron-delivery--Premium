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
    o.pay = { method: 'card', paid: true, deal: t.TranzactionId ?? null, amount: t.Amount ?? null };
    await s.setJSON('o:' + ref, o);
  } catch (e) { console.error('markPaid', e); }
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
