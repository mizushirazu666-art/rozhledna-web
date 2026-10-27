/**
 * Odhlášení z newsletteru (27. 10. 2026) – odkaz v každém e-mailu
 * (pipeline newsletter.py): /api/odhlasit?id=<ID záznamu v tabulce Odberatele>.
 * Nastaví Odhlaseno ✔ (záznam se nemaže – evidence). GET zobrazí potvrzení,
 * POST obslouží „odhlásit jedním kliknutím“ z poštovních programů
 * (hlavička List-Unsubscribe-Post).
 * Env (Vercel): AIRTABLE_FOTKY_API_KEY (token se zápisem), AIRTABLE_BASE_ID.
 */
const TABULKA = 'Odberatele';

function stranka(res, kod, nadpis, text) {
  res.status(kod).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${nadpis} – Rozhledna</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:60px auto;padding:0 16px;color:#222;line-height:1.5">
<h1 style="font-size:24px">${nadpis}</h1><p>${text}</p><p><a href="/">Zpět na Rozhlednu</a></p></body></html>`);
}

export default async function handler(req, res) {
  const id = String(req.query?.id || '');
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) {
    return stranka(res, 400, 'Odkaz nefunguje', 'Odkaz na odhlášení je neúplný. Napište nám prosím odpovědí na e-mail s přehledem a odhlásíme vás ručně.');
  }
  const klic = process.env.AIRTABLE_FOTKY_API_KEY;
  const baze = process.env.AIRTABLE_BASE_ID;
  if (!klic || !baze) return stranka(res, 500, 'Odhlášení teď nefunguje', 'Zkuste to prosím později, nebo nám odpovězte na e-mail.');

  const odpoved = await fetch(`https://api.airtable.com/v0/${baze}/${encodeURIComponent(TABULKA)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${klic}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [{ id, fields: { Odhlaseno: true } }] }),
  }).catch(() => null);

  if (!odpoved?.ok) {
    return stranka(res, 500, 'Odhlášení se nepovedlo', 'Napište nám prosím odpovědí na e-mail s přehledem a odhlásíme vás ručně.');
  }
  if (req.method === 'POST') return res.status(200).json({ ok: true });
  return stranka(res, 200, 'Odběr je zrušený', 'Přehled týdne vám už posílat nebudeme. Kdybyste si to rozmysleli, přihlásit se můžete znovu na webu.');
}
