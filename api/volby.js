/**
 * Vercel funkce pro živé výsledky komunálních voleb 2026 (stránka
 * /volby-2026/). Stáhne z volby.gov.cz průběžné výsledky a účast pro všechny
 * obce regionu (env ROZHLEDNA_REGION) a vrátí je v jednom JSONu. Odpověď se
 * na Vercelu cachuje 60 s, takže volby.gov.cz dostane nejvýš jeden dotaz za
 * minutu na obec, ať stránku čte kolik lidí chce.
 *
 * Zdroje (stejné jako pipeline scrapers/volby.py):
 *   /appdata/kv2026/20261009/vysled/{okres}/{obec}.json – strany, hlasy,
 *     kandidáti; "zvoleno": true = konečný výsledek. Ověřeno 10. 10. 2026:
 *     vysledky [č., název, hlasy, %, kandidátů, …, mandáty (8. sloupec), …],
 *     kandidát [pořadí, jméno, věk, hlasy, %, zvolen true/false, pořadí
 *     zvolení / náhradníka]
 *   /appdata/kv2026/20261009/ucast/obec/{okres}/{obec}.json – "celkem"
 *     (voliči, vydané obálky, účast %, ?, odevzdané obálky, platné obálky,
 *     % platných, platné hlasy); okrsky a % zpracování jen v vysled.prehled
 */
// Obce regionů (kódy ČSÚ z pipeline config/(hlinecko/)obce.json).
export const OBCE = {
  chrudimsko: [
    { slug: 'borice', nazev: 'Bořice', kod: 571229, okres: 5301, obyvatel: 193 },
    { slug: 'bylany', nazev: 'Bylany', kod: 571245, okres: 5301, obyvatel: 485 },
    { slug: 'dolni-bezdekov', nazev: 'Dolní Bezděkov', kod: 505030, okres: 5301, obyvatel: 282 },
    { slug: 'dvakacovice', nazev: 'Dvakačovice', kod: 504955, okres: 5301, obyvatel: 210 },
    { slug: 'honbice', nazev: 'Honbice', kod: 571458, okres: 5301, obyvatel: 172 },
    { slug: 'horka', nazev: 'Horka', kod: 571466, okres: 5301, obyvatel: 435 },
    { slug: 'chrast', nazev: 'Chrast', kod: 571539, okres: 5301, obyvatel: 3150 },
    { slug: 'chrudim', nazev: 'Chrudim', kod: 571164, okres: 5301, obyvatel: 23564 },
    { slug: 'koci', nazev: 'Kočí', kod: 571610, okres: 5301, obyvatel: 739 },
    { slug: 'lany', nazev: 'Lány', kod: 504807, okres: 5301, obyvatel: 299 },
    { slug: 'liciborice', nazev: 'Licibořice', kod: 547832, okres: 5301, obyvatel: 269 },
    { slug: 'lukavice', nazev: 'Lukavice', kod: 571768, okres: 5301, obyvatel: 933 },
    { slug: 'mladonovice', nazev: 'Mladoňovice', kod: 571857, okres: 5301, obyvatel: 330 },
    { slug: 'morasice', nazev: 'Morašice', kod: 571873, okres: 5301, obyvatel: 816 },
    { slug: 'nabocany', nazev: 'Nabočany', kod: 571890, okres: 5301, obyvatel: 128 },
    { slug: 'orel', nazev: 'Orel', kod: 571962, okres: 5301, obyvatel: 786 },
    { slug: 'prestavlky', nazev: 'Přestavlky', kod: 572110, okres: 5301, obyvatel: 201 },
    { slug: 'rabstejnska-lhota', nazev: 'Rabštejnská Lhota', kod: 556882, okres: 5301, obyvatel: 866 },
    { slug: 'restoky', nazev: 'Řestoky', kod: 572217, okres: 5301, obyvatel: 473 },
    { slug: 'slatinany', nazev: 'Slatiňany', kod: 572268, okres: 5301, obyvatel: 4074 },
    { slug: 'sobetuchy', nazev: 'Sobětuchy', kod: 572276, okres: 5301, obyvatel: 1011 },
    { slug: 'stolany', nazev: 'Stolany', kod: 547891, okres: 5301, obyvatel: 401 },
    { slug: 'tribrichy', nazev: 'Třibřichy', kod: 504921, okres: 5301, obyvatel: 276 },
    { slug: 'trojovice', nazev: 'Trojovice', kod: 572403, okres: 5301, obyvatel: 183 },
    { slug: 'tunechody', nazev: 'Tuněchody', kod: 572420, okres: 5301, obyvatel: 621 },
    { slug: 'uhretice', nazev: 'Úhřetice', kod: 572446, okres: 5301, obyvatel: 492 },
    { slug: 'vejvanovice', nazev: 'Vejvanovice', kod: 572471, okres: 5301, obyvatel: 297 },
    { slug: 'zajecice', nazev: 'Zaječice', kod: 572578, okres: 5301, obyvatel: 1040 },
    { slug: 'zajezdec', nazev: 'Zájezdec', kod: 547859, okres: 5301, obyvatel: 118 },
  ],
  hlinecko: [
    { slug: 'bojanov', nazev: 'Bojanov', kod: 571202, okres: 5301, obyvatel: 603 },
    { slug: 'chlumetin', nazev: 'Chlumětín', kod: 595721, okres: 6105, obyvatel: 178 },
    { slug: 'dedova', nazev: 'Dědová', kod: 571300, okres: 5301, obyvatel: 149 },
    { slug: 'hamry', nazev: 'Hamry', kod: 571377, okres: 5301, obyvatel: 259 },
    { slug: 'hlinsko', nazev: 'Hlinsko', kod: 571393, okres: 5301, obyvatel: 9903 },
    { slug: 'hodonin', nazev: 'Hodonín', kod: 547794, okres: 5301, obyvatel: 96 },
    { slug: 'holetin', nazev: 'Holetín', kod: 571440, okres: 5301, obyvatel: 747 },
    { slug: 'horni-bradlo', nazev: 'Horní Bradlo', kod: 571474, okres: 5301, obyvatel: 448 },
    { slug: 'jenikov', nazev: 'Jeníkov', kod: 547816, okres: 5301, obyvatel: 469 },
    { slug: 'kamenicky', nazev: 'Kameničky', kod: 571571, okres: 5301, obyvatel: 798 },
    { slug: 'kladno', nazev: 'Kladno', kod: 571580, okres: 5301, obyvatel: 245 },
    { slug: 'krasne', nazev: 'Krásné', kod: 571652, okres: 5301, obyvatel: 169 },
    { slug: 'krouna', nazev: 'Krouna', kod: 571661, okres: 5301, obyvatel: 1353 },
    { slug: 'miretice', nazev: 'Miřetice', kod: 571831, okres: 5301, obyvatel: 1185 },
    { slug: 'mrakotin', nazev: 'Mrákotín', kod: 554847, okres: 5301, obyvatel: 349 },
    { slug: 'otradov', nazev: 'Otradov', kod: 554952, okres: 5301, obyvatel: 283 },
    { slug: 'pokrikov', nazev: 'Pokřikov', kod: 572063, okres: 5301, obyvatel: 264 },
    { slug: 'rana', nazev: 'Raná', kod: 572152, okres: 5301, obyvatel: 372 },
    { slug: 'studnice', nazev: 'Studnice', kod: 572322, okres: 5301, obyvatel: 446 },
    { slug: 'svratouch', nazev: 'Svratouch', kod: 572349, okres: 5301, obyvatel: 924 },
    { slug: 'tisovec', nazev: 'Tisovec', kod: 572381, okres: 5301, obyvatel: 312 },
    { slug: 'trhova-kamenice', nazev: 'Trhová Kamenice', kod: 572390, okres: 5301, obyvatel: 903 },
    { slug: 'vcelakov', nazev: 'Včelákov', kod: 572462, okres: 5301, obyvatel: 569 },
    { slug: 'vitanov', nazev: 'Vítanov', kod: 572497, okres: 5301, obyvatel: 408 },
    { slug: 'vojtechov', nazev: 'Vojtěchov', kod: 572501, okres: 5301, obyvatel: 427 },
    { slug: 'vortova', nazev: 'Vortová', kod: 572527, okres: 5301, obyvatel: 249 },
    { slug: 'vseradov', nazev: 'Všeradov', kod: 572543, okres: 5301, obyvatel: 137 },
    { slug: 'vysocina', nazev: 'Vysočina', kod: 572551, okres: 5301, obyvatel: 687 },
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

// Odhad rozdělení míst podle průběžných hlasů (než ČSÚ zveřejní konečné
// mandáty): d'Hondtova metoda (dělitelé 1, 2, 3…), do dělení jen strany
// s aspoň 5 % (u ČSÚ 7. sloupec – podíl z přepočteného základu, jinak podíl
// hlasů), strana nedostane víc míst, než má kandidátů. Koalice mají ve
// skutečnosti vyšší hranici – proto je to jen „odhad“.
export function odhadMandatu(radky, mist) {
  if (!mist || !radky.length) return {};
  const podil = (r) => cislo(r[6]) ?? cislo(r[3]) ?? 0;
  let mezi = radky.filter((r) => (cislo(r[2]) ?? 0) > 0 && podil(r) >= 5);
  if (mezi.length < 2) mezi = radky.filter((r) => (cislo(r[2]) ?? 0) > 0);
  const vysledek = Object.fromEntries(radky.map((r) => [String(r[0]), 0]));
  for (let i = 0; i < mist; i++) {
    let nej = null;
    let nejPodil = -1;
    for (const r of mezi) {
      const c = String(r[0]);
      const kandidatu = cislo(r[4]) ?? mist;
      if (vysledek[c] >= kandidatu) continue;
      const q = cislo(r[2]) / (vysledek[c] + 1);
      if (q > nejPodil) { nejPodil = q; nej = c; }
    }
    if (nej === null) break;
    vysledek[nej] += 1;
  }
  return vysledek;
}

export async function nactiObec(o) {
  const [vysled, ucast] = await Promise.all([
    json(`${ZAKLAD}/vysled/${o.okres}/${o.kod}.json`),
    json(`${ZAKLAD}/ucast/obec/${o.okres}/${o.kod}.json`),
  ]);
  const celkem = Array.isArray(ucast?.celkem) ? ucast.celkem : [];
  // prehled (ověřeno na reálných datech 10. 10. 2026): [mandáty, ?, okrsky celkem,
  // okrsky zpracované, % zpracováno, voliči, vydané obálky, účast %, ?, odevzdané
  // obálky, platné obálky, % platných, platné hlasy]; celkem = prehled[5..12].
  const prehled = Array.isArray(vysled?.prehled) ? vysled.prehled : [];
  const plne = Object.fromEntries((vysled?.plne_nazvy_stran || []).map(([c, n]) => [String(c), n]));
  const hlasy = vysled?.hlasy || {};
  const konecne = Boolean(vysled?.zvoleno);
  const odhad = !konecne && (prehled[3] ?? 0) > 0 ? odhadMandatu(vysled?.vysledky || [], cislo(prehled[0])) : {};
  const strany = (vysled?.vysledky || []).map((r) => {
    const kandidati = hlasy[String(r[0])] || [];
    const zvoleni = konecne
      ? kandidati.filter((k) => k[5] === true)
          .sort((a, b) => (a[6] ?? 0) - (b[6] ?? 0))
          .map((k) => ({ jmeno: k[1], hlasy: cislo(k[3]) }))
      : [];
    return {
      cislo: r[0],
      nazev: r[1],
      plnyNazev: plne[String(r[0])] || r[1],
      hlasy: cislo(r[2]) ?? 0,
      procent: cislo(r[3]) ?? 0,
      mandaty: konecne ? (cislo(r[7]) ?? zvoleni.length) : null,
      odhadMandatu: konecne ? null : (odhad[String(r[0])] ?? null),
      zvoleni,
    };
  }).sort((a, b) => b.hlasy - a.hlasy);
  return {
    slug: o.slug,
    nazev: o.nazev,
    obyvatel: o.obyvatel,
    dostupne: Boolean(vysled),
    konecne,
    mandatu: cislo(prehled[0]),
    okrskyCelkem: cislo(prehled[2]),
    okrskyZpracovano: cislo(prehled[3]),
    zpracovanoProcent: cislo(prehled[4]),
    volicu: cislo(prehled[5]) ?? cislo(celkem[0]),
    ucastProcent: cislo(prehled[7]) ?? cislo(celkem[2]),
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
