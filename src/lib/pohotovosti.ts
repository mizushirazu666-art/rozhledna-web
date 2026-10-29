/**
 * Pohotovosti (29. 10. 2026) – stránka /pohotovost/. Zdroj: přehled pohotovostí
 * VZP (pohotovosti.vzp.cz), běžné HTML stránky: seznam podle kraje a typu,
 * detail s telefonem a otevírací dobou po dnech, rozpis (rotace) zubních
 * pohotovostí o víkendech a svátcích. Načítá se jen při buildu (3× denně);
 * při chybě vrací prázdná data a stránka odkáže přímo na VZP.
 */

const ZAKLAD = 'https://pohotovosti.vzp.cz';
const KRAJ = 9; // Pardubický kraj
/** Okresy, které ukazujeme (obě naše oblasti leží v okrese Chrudim, část
 * služeb – zubní, dětská – je v Pardubicích). */
const OKRESY = ['Chrudim', 'Pardubice'];
const ROTACE_ZUBNI = 286; // „Rozpis pohotovostí pro Pardubický kraj“
const DNI_ROTACE = 21;

export type TypPohotovosti = 'dospeli' | 'deti' | 'zubni' | 'lekarna';
const TYPY: Record<TypPohotovosti, number> = { dospeli: 1, deti: 2, zubni: 3, lekarna: 4 };

export interface OteviraciDen {
  den: string; // Pondělí … Neděle, Svátek
  doba: string; // „17:00–21:00“ / „Zavřeno“
}

export interface Pohotovost {
  typ: TypPohotovosti;
  nazev: string;
  adresa: string;
  okres: string;
  telefon?: string;
  oteviraciDoba: OteviraciDen[];
  url: string;
}

export interface ZubniSluzba {
  datum: string; // YYYY-MM-DD
  nazev: string;
  adresa: string;
  okres: string;
  telefon?: string;
  doba?: string;
  url: string;
}

export interface DataPohotovosti {
  stale: Pohotovost[];
  zubniRozpis: ZubniSluzba[];
  chyba: boolean;
}

function text(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

async function stahni(cesta: string): Promise<string> {
  const resp = await fetch(cesta.startsWith('http') ? cesta : ZAKLAD + cesta, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Rozhledna; zpravodajský web obcí)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${cesta}`);
  return resp.text();
}

interface Radek {
  nazev: string;
  adresa: string;
  okres: string;
  odkaz: string;
}

/** Řádky tabulky seznamu: [název<br>adresa] [kraj<br>okres] [typ] [odkaz]. */
function radkyTabulky(html: string): Radek[] {
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
  const radky: Radek[] = [];
  for (const tr of tbody.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const bunky = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    const odkaz = tr.match(/href="([^"]+)"/)?.[1];
    if (bunky.length < 2 || !odkaz) continue;
    const [nazev, ...adresa] = text(bunky[0]).split('\n');
    const okres = text(bunky[1]).split('\n').pop() ?? '';
    radky.push({ nazev: nazev.trim(), adresa: adresa.join(', ').trim(), okres: okres.trim(), odkaz });
  }
  return radky;
}

/** Detail: telefon a tabulka Den / Otevírací doba. */
function detail(html: string): { telefon?: string; oteviraciDoba: OteviraciDen[]; adresa?: string } {
  const t = text(html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, ''));
  const cislo = t.match(/Telefon\s*\n?\s*([+\d][\d\s]{7,})/)?.[1].replace(/\s+/g, '');
  // 469653040 → 469 653 040 (bez předvolby se čte lépe po trojicích)
  const telefon = cislo ? (/^\d{9}$/.test(cislo) ? cislo.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : cislo) : undefined;
  const adresa = t.match(/Adresa místa poskytování péče\s*([^\n]+?)\s*(?:Telefon|Web|Den\b|\n|$)/)?.[1].trim();
  const oteviraciDoba: OteviraciDen[] = [];
  const re = /(Pondělí|Úterý|Středa|Čtvrtek|Pátek|Sobota|Neděle|Svátek)\s+((?:\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}(?:\s*,\s*)?)+|Zavřeno|nonstop|Nonstop)/g;
  for (const m of t.matchAll(re)) {
    if (!oteviraciDoba.some((d) => d.den === m[1])) oteviraciDoba.push({ den: m[1], doba: m[2].replace(/\s+/g, ' ').trim() });
  }
  return { telefon, oteviraciDoba, adresa };
}

function dnesPraha(posun = 0): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + posun * 86400000));
}

async function nacist(): Promise<DataPohotovosti> {
  const stale: Pohotovost[] = [];
  for (const [typ, kod] of Object.entries(TYPY) as [TypPohotovosti, number][]) {
    const seznam = await stahni(`/seznam-pohotovosti/?queryKraj=${KRAJ}&queryTyp=${kod}`);
    for (const r of radkyTabulky(seznam)) {
      if (!OKRESY.includes(r.okres) || r.odkaz.includes('/rotace/')) continue;
      const d = detail(await stahni(r.odkaz));
      stale.push({
        typ,
        nazev: r.nazev,
        adresa: d.adresa || r.adresa,
        okres: r.okres,
        telefon: d.telefon,
        oteviraciDoba: d.oteviraciDoba,
        url: ZAKLAD + r.odkaz,
      });
    }
  }

  // Rozpis zubních pohotovostí: stránka s daty, pod každým datem tabulka
  // zubařů v kraji – bereme jen naše okresy a nejbližší tři týdny.
  const zubniRozpis: ZubniSluzba[] = [];
  const rotace = await stahni(`/seznam-pohotovosti/rotace/${ROTACE_ZUBNI}`);
  const konec = dnesPraha(DNI_ROTACE);
  const dnes = dnesPraha();
  const datumy = [...new Set([...rotace.matchAll(/rotace\/\d+\/(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]))]
    .filter((d) => d >= dnes && d <= konec);
  for (const datum of datumy) {
    const den = await stahni(`/seznam-pohotovosti/rotace/${ROTACE_ZUBNI}/${datum}`);
    for (const r of radkyTabulky(den)) {
      if (!OKRESY.includes(r.okres)) continue;
      const d = detail(await stahni(r.odkaz));
      zubniRozpis.push({
        datum,
        nazev: r.nazev,
        adresa: d.adresa || r.adresa,
        okres: r.okres,
        telefon: d.telefon,
        doba: d.oteviraciDoba.map((o) => o.doba).find((x) => x !== 'Zavřeno'),
        url: ZAKLAD + r.odkaz,
      });
    }
  }
  return { stale, zubniRozpis, chyba: false };
}

let cache: Promise<DataPohotovosti> | null = null;

export function getPohotovosti(): Promise<DataPohotovosti> {
  if (!cache) {
    cache = nacist().catch((err) => {
      console.warn('[pohotovosti] Přehled VZP se nepodařilo načíst, stránka odkáže na pohotovosti.vzp.cz:', err);
      return { stale: [], zubniRozpis: [], chyba: true };
    });
  }
  return cache;
}

export const VZP_PREHLED = `${ZAKLAD}/seznam-pohotovosti/?queryKraj=${KRAJ}&queryTyp=`;
