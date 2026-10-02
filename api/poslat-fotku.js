/**
 * Vercel funkce pro formulář „Pošlete fotku“ (/poslete-fotku/).
 * Přijme JSON z formuláře (fotka zmenšená v prohlížeči, base64), založí
 * záznam ve Fotobance (Schvaleno = false – schvaluje redakce) a nahraje
 * fotku jako přílohu přes Airtable content API.
 * Env (Vercel): AIRTABLE_FOTKY_API_KEY – samostatný Airtable token se zápisem
 * (data.records:write jen pro tuto bázi); AIRTABLE_API_KEY webu je jen ke
 * čtení. AIRTABLE_BASE_ID.
 */
const TABULKA = 'Fotobanka';
const POLE_OBRAZEK = 'fldHxrCJCmivsIUb6'; // Fotobanka.Obrazek
const OBCE = ['Slatiňany', 'Orel', 'Tuněchody', 'Rabštejnská Lhota', 'Obecné'];
const MAX_BAJTU = 3_500_000; // po zmenšení v prohlížeči; Vercel bere max. ~4,5 MB těla
const TYPY = ['image/jpeg', 'image/png', 'image/webp'];

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
  if (!klic || !baze) return chyba(res, 500, 'Formulář není nastavený.');

  const d = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  // Ochrana proti robotům: skryté pole musí zůstat prázdné a formulář se
  // nesmí odeslat dřív než pár sekund po načtení stránky.
  if (d.web) return res.status(200).json({ ok: true });
  if (!d.nacteno || Date.now() - Number(d.nacteno) < 4000) return chyba(res, 400, 'Zkuste to prosím znovu za chvíli.');

  const popis = text(d.popis, 200);
  const autor = text(d.autor, 80);
  const email = text(d.email, 120);
  const obec = OBCE.includes(d.obec) ? d.obec : 'Obecné';
  if (!popis || !autor) return chyba(res, 400, 'Vyplňte prosím popis fotky a své jméno.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return chyba(res, 400, 'E-mail nevypadá správně.');
  if (!d.souhlas) return chyba(res, 400, 'Bez souhlasu fotku zveřejnit nemůžeme.');
  if (!TYPY.includes(d.typ)) return chyba(res, 400, 'Pošlete prosím fotku (JPG, PNG nebo WebP).');
  const data = String(d.data || '');
  const bajtu = Math.floor((data.length * 3) / 4);
  if (!data || bajtu > MAX_BAJTU) return chyba(res, 400, 'Fotka je příliš velká.');

  const hlavicky = { Authorization: `Bearer ${klic}`, 'Content-Type': 'application/json' };
  const dnes = new Date().toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague' });
  const zalozeni = await fetch(`https://api.airtable.com/v0/${baze}/${encodeURIComponent(TABULKA)}`, {
    method: 'POST',
    headers: hlavicky,
    body: JSON.stringify({
      typecast: true,
      fields: {
        Popis: popis,
        Obec: obec,
        Autor: `Foto: ${autor}, čtenář Rozhledny`,
        Licence: 'se svolením autora (čtenář)',
        Email: email || undefined,
        Poznamka: `Poslal čtenář přes formulář na webu ${dnes}. Souhlas: je autorem, souhlasí s bezplatným zveřejněním se jménem; rozpoznatelné osoby jen se svolením. Doplň Temata a zkontroluj fotku.`,
      },
    }),
  });
  if (!zalozeni.ok) {
    console.error('Fotobanka: založení záznamu selhalo', zalozeni.status, await zalozeni.text());
    return chyba(res, 502, 'Fotku se nepodařilo uložit, zkuste to prosím později.');
  }
  const zaznam = await zalozeni.json();

  const nahrani = await fetch(`https://content.airtable.com/v0/${baze}/${zaznam.id}/${POLE_OBRAZEK}/uploadAttachment`, {
    method: 'POST',
    headers: hlavicky,
    body: JSON.stringify({ contentType: d.typ, filename: text(d.nazev, 80) || 'fotka.jpg', file: data }),
  });
  if (!nahrani.ok) {
    console.error('Fotobanka: nahrání fotky selhalo', nahrani.status, await nahrani.text());
    return chyba(res, 502, 'Fotku se nepodařilo nahrát, zkuste to prosím později.');
  }
  return res.status(200).json({ ok: true });
}
