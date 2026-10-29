// בודק מול קארדקום אם תשלום הצליח.
// דף האישור קורא לזה עם lowprofilecode שקארדקום מוסיפה לכתובת, וקארדקום שולחת לכאן גם עדכון (webhook).
const API = 'https://secure.cardcom.solutions/api/v11/LowProfile/GetLpResult';
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
    return json(200, { ok, amount: t.Amount ?? null, ref: d.ReturnValue ?? null, deal: t.TranzactionId ?? null, last4: t.Last4CardDigitsString ?? null });
  } catch (e) {
    console.error(e);
    return json(502, { ok: false });
  }
};
