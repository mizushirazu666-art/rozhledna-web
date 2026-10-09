/**
 * Vercel funkce pro živé výsledky komunálních voleb 2026 (stránka
 * /volby-2026/). Stáhne z volby.gov.cz průběžné výsledky a účast pro všechny
 * obce regionu (env ROZHLEDNA_REGION) a vrátí je v jednom JSONu. Odpověď se
 * na Vercelu cachuje 60 s, takže volby.gov.cz dostane nejvýš jeden dotaz za
 * minutu na obec, ať stránku čte kolik lidí chce.
 *
 * Zdroje (stejné jako pipeline scrapers/volby.py):
 *   /appdata/kv2026/20261009/vysled/{okres}/{obec}.json – strany, hlasy,
 *     kandidáti; "zvoleno": true = konečný výsledek (zvolený kandidát má
 *     vyplněný 6. sloupec)
 *   /appdata/kv2026/20261009/ucast/obec/{okres}/{obec}.json – "celkem"
 *     (pořadí sloupců jako v XML ČSÚ: okrsky celkem, zpracováno, % zprac.,
 *     voliči, vydané obálky, účast %, odevzdané obálky, platné hlasy)
 */
// Obce regionů (kódy ČSÚ z pipeline config/(hlinecko/)obce.json).
export const OBCE = {
  chrudimsko: [
    { slug: 'borice', nazev: 'Bořice', kod: 571229, okres: 5301 },
    { slug: 'bylany', nazev: 'Bylany', kod: 571245, okres: 5301 },
    { slug: 'dolni-bezdekov', nazev: 'Dolní Bezděkov', kod: 505030, okres: 5301 },
    { slug: 'dvakacovice', nazev: 'Dvakačovice', kod: 504955, okres: 5301 },
    { slug: 'honbice', nazev: 'Honbice', kod: 571458, okres: 5301 },
    { slug: 'horka', nazev: 'Horka', kod: 571466, okres: 5301 },
    { slug: 'chrast', nazev: 'Chrast', kod: 571539, okres: 5301 },
    { slug: 'chrudim', nazev: 'Chrudim', kod: 571164, okres: 5301 },
    { slug: 'koci', nazev: 'Kočí', kod: 571610, okres: 5301 },
    { slug: 'lany', nazev: 'Lány', kod: 504807, okres: 5301 },
    { slug: 'liciborice', nazev: 'Licibořice', kod: 547832, okres: 5301 },
    { slug: 'lukavice', nazev: 'Lukavice', kod: 571768, okres: 5301 },
    { slug: 'mladonovice', nazev: 'Mladoňovice', kod: 571857, okres: 5301 },
    { slug: 'morasice', nazev: 'Morašice', kod: 571873, okres: 5301 },
    { slug: 'nabocany', nazev: 'Nabočany', kod: 571890, okres: 5301 },
    { slug: 'orel', nazev: 'Orel', kod: 571962, okres: 5301 },
    { slug: 'prestavlky', nazev: 'Přestavlky', kod: 572110, okres: 5301 },
    { slug: 'rabstejnska-lhota', nazev: 'Rabštejnská Lhota', kod: 556882, okres: 5301 },
    { slug: 'restoky', nazev: 'Řestoky', kod: 572217, okres: 5301 },
    { slug: 'slatinany', nazev: 'Slatiňany', kod: 572268, okres: 5301 },
    { slug: 'sobetuchy', nazev: 'Sobětuchy', kod: 572276, okres: 5301 },
    { slug: 'stolany', nazev: 'Stolany', kod: 547891, okres: 5301 },
    { slug: 'tribrichy', nazev: 'Třibřichy', kod: 504921, okres: 5301 },
    { slug: 'trojovice', nazev: 'Trojovice', kod: 572403, okres: 5301 },
    { slug: 'tunechody', nazev: 'Tuněchody', kod: 572420, okres: 5301 },
    { slug: 'uhretice', nazev: 'Úhřetice', kod: 572446, okres: 5301 },
    { slug: 'vejvanovice', nazev: 'Vejvanovice', kod: 572471, okres: 5301 },
    { slug: 'zajecice', nazev: 'Zaječice', kod: 572578, okres: 5301 },
    { slug: 'zajezdec', nazev: 'Zájezdec', kod: 547859, okres: 5301 },
  ],
  hlinecko: [
    { slug: 'bojanov', nazev: 'Bojanov', kod: 571202, okres: 5301 },
    { slug: 'chlumetin', nazev: 'Chlumětín', kod: 595721, okres: 6105 },
    { slug: 'dedova', nazev: 'Dědová', kod: 571300, okres: 5301 },
    { slug: 'hamry', nazev: 'Hamry', kod: 571377, okres: 5301 },
    { slug: 'hlinsko', nazev: 'Hlinsko', kod: 571393, okres: 5301 },
    { slug: 'hodonin', nazev: 'Hodonín', kod: 547794, okres: 5301 },
    { slug: 'holetin', nazev: 'Holetín', kod: 571440, okres: 5301 },
    { slug: 'horni-bradlo', nazev: 'Horní Bradlo', kod: 571474, okres: 5301 },
    { slug: 'jenikov', nazev: 'Jeníkov', kod: 547816, okres: 5301 },
    { slug: 'kamenicky', nazev: 'Kameničky', kod: 571571, okres: 5301 },
    { slug: 'kladno', nazev: 'Kladno', kod: 571580, okres: 5301 },
    { slug: 'krasne', nazev: 'Krásné', kod: 571652, okres: 5301 },
    { slug: 'krouna', nazev: 'Krouna', kod: 571661, okres: 5301 },
    { slug: 'miretice', nazev: 'Miřetice', kod: 571831, okres: 5301 },
    { slug: 'mrakotin', nazev: 'Mrákotín', kod: 554847, okres: 5301 },
    { slug: 'otradov', nazev: 'Otradov', kod: 554952, okres: 5301 },
    { slug: 'pokrikov', nazev: 'Pokřikov', kod: 572063, okres: 5301 },
    { slug: 'rana', nazev: 'Raná', kod: 572152, okres: 5301 },
    { slug: 'studnice', nazev: 'Studnice', kod: 572322, okres: 5301 },
    { slug: 'svratouch', nazev: 'Svratouch', kod: 572349, okres: 5301 },
    { slug: 'tisovec', nazev: 'Tisovec', kod: 572381, okres: 5301 },
    { slug: 'trhova-kamenice', nazev: 'Trhová Kamenice', kod: 572390, okres: 5301 },
    { slug: 'vcelakov', nazev: 'Včelákov', kod: 572462, okres: 5301 },
    { slug: 'vitanov', nazev: 'Vítanov', kod: 572497, okres: 5301 },
    { slug: 'vojtechov', nazev: 'Vojtěchov', kod: 572501, okres: 5301 },
    { slug: 'vortova', nazev: 'Vortová', kod: 572527, okres: 5301 },
    { slug: 'vseradov', nazev: 'Všeradov', kod: 572543, okres: 5301 },
    { slug: 'vysocina', nazev: 'Vysočina', kod: 572551, okres: 5301 },
  ],
};

const ZAKLAD = 'https://volby.gov.cz/appdata/kv2026/20261009';

async function json(url) {
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': 'Rozhledna (mistni zpravodajstvi)' } });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

function cislo(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export async function nactiObec(o) {
  const [vysled, ucast] = await Promise.all([
    json(`${ZAKLAD}/vysled/${o.okres}/${o.kod}.json`),
    json(`${ZAKLAD}/ucast/obec/${o.okres}/${o.kod}.json`),
  ]);
  const celkem = Array.isArray(ucast?.celkem) ? ucast.celkem : [];
  const plne = Object.fromEntries((vysled?.plne_nazvy_stran || []).map(([c, n]) => [String(c), n]));
  const hlasy = vysled?.hlasy || {};
  const konecne = Boolean(vysled?.zvoleno);
  const strany = (vysled?.vysledky || []).map((r) => {
    const kandidati = hlasy[String(r[0])] || [];
    const zvoleni = konecne
      ? kandidati.filter((k) => k[5] !== null && k[5] !== undefined && k[5] !== 0 && k[5] !== '')
          .sort((a, b) => a[5] - b[5])
          .map((k) => ({ jmeno: k[1], hlasy: cislo(k[3]) }))
      : [];
    return {
      cislo: r[0],
      nazev: r[1],
      plnyNazev: plne[String(r[0])] || r[1],
      hlasy: cislo(r[2]) ?? 0,
      procent: cislo(r[3]) ?? 0,
      mandaty: konecne ? zvoleni.length : null,
      zvoleni,
    };
  }).sort((a, b) => b.hlasy - a.hlasy);
  return {
    slug: o.slug,
    nazev: o.nazev,
    dostupne: Boolean(vysled),
    konecne,
    mandatu: cislo(vysled?.prehled?.[0]),
    okrskyCelkem: cislo(celkem[0]),
    okrskyZpracovano: cislo(celkem[1]),
    zpracovanoProcent: cislo(celkem[2]),
    volicu: cislo(celkem[3]),
    ucastProcent: cislo(celkem[5]),
    generovano: vysled?.generovano || null,
    strany,
    surove: { prehled: vysled?.prehled ?? null, celkem },
  };
}

export default async function handler(req, res) {
  const region = process.env.ROZHLEDNA_REGION || 'chrudimsko';
  const vsechny = OBCE[region] || OBCE.chrudimsko;
  // ?obec=<slug> = jen jedna obec (stránka /volby-2026/<slug>/)
  const jen = typeof req.query?.obec === 'string' ? req.query.obec : '';
  const seznam = jen ? vsechny.filter((o) => o.slug === jen) : vsechny;
  const vysledky = await Promise.all(seznam.map(nactiObec));
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  res.status(200).json({ ok: true, region, stazeno: new Date().toISOString(), obce: vysledky });
}
