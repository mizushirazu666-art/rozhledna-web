/**
 * Vercel funkce pro přihlášku k newsletteru (formuláře data-newsletter,
 * src/lib/newsletter-klient.ts). Zapíše odběratele do Airtable tabulky
 * Odberatele (Email, Prihlaseno, Stranka, Zdroj); už přihlášený e-mail se
 * znovu nezakládá. Rozesílání přehledu týdne řeší samostatný krok.
 * Env (Vercel): AIRTABLE_FOTKY_API_KEY (token se zápisem – stejný jako
 * u formuláře fotek), AIRTABLE_BASE_ID.
 */
const TABULKA = 'Odberatele';

function chyba(res, kod, zprava) {
  res.status(kod).json({ ok: false, chyba: zprava });
}

function text(v, max) {
  return String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return chyba(res, 405, 'Jen POST.');
  const klic = process.env.AIRTABLE_FOTKY_API_KEY;
  const baze = process.env.AIRTABLE_BASE_ID;
  if (!klic || !baze) return chyba(res, 500, 'Přihlášení teď nefunguje, zkuste to prosím později.');

  let d;
  try {
    d = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  } catch {
    return chyba(res, 400, 'Neplatný požadavek.');
  }
  // Ochrana proti robotům: skryté pole musí zůstat prázdné a formulář se
  // nesmí odeslat hned po načtení stránky.
  if (d.web) return res.status(200).json({ ok: true });
  if (!d.nacteno || Date.now() - Number(d.nacteno) < 3000) return chyba(res, 400, 'Zkuste to prosím znovu za chvíli.');

  const email = text(d.email, 120).toLowerCase();
  if (!/^[^\s@"'(),;<>]+@[^\s@"'(),;<>]+\.[a-z]{2,}$/.test(email)) return chyba(res, 400, 'E-mail nevypadá správně.');

  const url = `https://api.airtable.com/v0/${baze}/${encodeURIComponent(TABULKA)}`;
  const hlavicky = { Authorization: `Bearer ${klic}`, 'Content-Type': 'application/json' };

  // Už přihlášený? (Když token nemá právo číst, prostě založíme nový záznam.)
  const hledani = await fetch(`${url}?maxRecords=1&filterByFormula=${encodeURIComponent(`LOWER({Email})='${email.replace(/'/g, "\\'")}'`)}`, {
    headers: hlavicky,
  }).catch(() => null);
  if (hledani?.ok) {
    const nalezeno = (await hledani.json()).records?.[0];
    if (nalezeno) {
      if (nalezeno.fields?.Odhlaseno) {
        await fetch(url, {
          method: 'PATCH',
          headers: hlavicky,
          body: JSON.stringify({ records: [{ id: nalezeno.id, fields: { Odhlaseno: false, Prihlaseno: new Date().toISOString() } }] }),
        });
      }
      return res.status(200).json({ ok: true });
    }
  }

  const zalozeni = await fetch(url, {
    method: 'POST',
    headers: hlavicky,
    body: JSON.stringify({
      fields: {
        Email: email,
        Prihlaseno: new Date().toISOString(),
        Stranka: text(d.stranka, 200),
        Zdroj: text(d.zdroj, 60) || undefined,
      },
    }),
  });
  if (!zalozeni.ok) {
    console.error('Odberatele: založení selhalo', zalozeni.status, await zalozeni.text());
    return chyba(res, 502, 'Přihlášení se nepodařilo, zkuste to prosím později.');
  }
  return res.status(200).json({ ok: true });
}
