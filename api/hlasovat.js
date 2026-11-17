/**
 * Hlasování „Nejhezčí vánoční strom 2026“ (/vanocni-strom/, 17. 11. 2026).
 * Hlasy jsou v Upstash Redis (Vercel Marketplace, zdarma) – ne v Airtable,
 * kde má bezplatný tarif limit 1 000 volání za měsíc.
 *
 * POST {kandidat, zarizeni} – jeden hlas za den z jednoho zařízení
 *   (náhodné ID v localStorage prohlížeče) a nejvýš MAX_Z_IP hlasů za den
 *   z jedné IP adresy (domácnost, škola, firma za jednou adresou). IP se
 *   neukládá, jen její otisk (SHA-256 se solí) a jen na 2 dny.
 * GET – průběžné výsledky {kandidat: hlasu}; web je ukazuje během hlasování.
 *
 * Env (Vercel, přidá je integrace Upstash): KV_REST_API_URL a
 * KV_REST_API_TOKEN (nebo UPSTASH_REDIS_REST_URL / _TOKEN); ROZHLEDNA_REGION.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const soutez = createRequire(import.meta.url)('../src/data/vanocni-strom-2026.json');

const MAX_Z_IP = 10;
const PREFIX = 'strom2026';

function redisUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
}
function redisToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
}

/** Víc příkazů Redisu najednou (REST „pipeline“), vrátí pole výsledků. */
async function redis(prikazy) {
  const r = await fetch(`${redisUrl()}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${redisToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(prikazy),
  });
  if (!r.ok) throw new Error(`Redis ${r.status}`);
  return (await r.json()).map((x) => x.result);
}

function dnesPraha() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' }); // RRRR-MM-DD
}

export default async function handler(req, res) {
  const region = (process.env.ROZHLEDNA_REGION || 'chrudimsko').trim().toLowerCase();
  const kandidati = (soutez[region] || []).map((k) => k.id);
  const klicHlasu = `${PREFIX}:${region}:hlasy`;
  res.setHeader('Cache-Control', 'no-store');
  if (!redisUrl() || !redisToken()) {
    return res.status(503).json({ ok: false, chyba: 'Hlasování zatím není spuštěné.' });
  }

  if (req.method === 'GET') {
    const [hash] = await redis([['HGETALL', klicHlasu]]);
    const vysledky = {};
    for (let i = 0; i + 1 < (hash || []).length; i += 2) vysledky[hash[i]] = Number(hash[i + 1]);
    return res.status(200).json({ ok: true, vysledky });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, chyba: 'Jen GET nebo POST.' });

  const dnes = dnesPraha();
  if (dnes < soutez.hlasovani_od) return res.status(400).json({ ok: false, chyba: 'Hlasování ještě nezačalo.' });
  if (dnes > soutez.hlasovani_do) return res.status(400).json({ ok: false, chyba: 'Hlasování už skončilo.' });

  const d = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const kandidat = String(d.kandidat || '');
  const zarizeni = String(d.zarizeni || '');
  if (!kandidati.includes(kandidat)) return res.status(400).json({ ok: false, chyba: 'Neznámá obec.' });
  if (!/^[a-z0-9-]{16,64}$/.test(zarizeni)) return res.status(400).json({ ok: false, chyba: 'Načtěte prosím stránku znovu.' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'neznama';
  const otisk = createHash('sha256').update(`${PREFIX}:${redisToken()}:${ip}`).digest('hex').slice(0, 24);
  const kZarizeni = `${PREFIX}:${region}:z:${dnes}:${zarizeni}`;
  const kIp = `${PREFIX}:${region}:ip:${dnes}:${otisk}`;

  const [nove, zIp] = await redis([
    ['SET', kZarizeni, kandidat, 'NX', 'EX', '172800'],
    ['INCR', kIp],
    ['EXPIRE', kIp, '172800'],
  ]);
  if (nove !== 'OK') return res.status(429).json({ ok: false, chyba: 'Dnes už jste hlasovali. Zítra můžete znovu!' });
  if (Number(zIp) > MAX_Z_IP) {
    return res.status(429).json({ ok: false, chyba: 'Z této sítě už dnes přišlo moc hlasů. Zkuste to prosím zítra.' });
  }
  await redis([['HINCRBY', klicHlasu, kandidat, '1']]);
  return res.status(200).json({ ok: true });
}
