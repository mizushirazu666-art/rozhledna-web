/**
 * Načtení publikovaných článků z Airtable (báze "Rozhledna", tabulka Clanky)
 * pro statický build webu. Nahrazuje `src/data/articles.json` jako zdroj dat
 * podle Kroku 4, bodu 5 akčního plánu.
 *
 * Použití proměnných prostředí (nastavit v administraci hostingu -
 * Netlify/Vercel - jako build-time secrets, NE commitovat do repozitáře):
 *   AIRTABLE_API_KEY   - Personal access token s právy data.records:read na bázi Rozhledna
 *   AIRTABLE_BASE_ID   - appQ1MZxZDfmEBd3v
 *   AIRTABLE_TABLE_NAME - volitelné, výchozí "Clanky"
 *
 * Pokud proměnné nejsou nastavené (např. lokální vývoj bez secrets), web
 * spadne zpátky na ukázková data v `src/data/articles.json` - nikdy nespadne
 * s chybou jen kvůli chybějící konfiguraci Airtable.
 *
 * Na web se dostávají jen záznamy se Stavem "Publikováno" - to je záměrná
 * redakční brzda z Fáze 2, bodu 3 (AI návrh -> Ke schválení -> Schváleno ->
 * teprve Publikováno se objeví na webu).
 */
import taxonomie from '../data/taxonomie.json';
import articlesJsonFallback from '../data/articles.json';

export interface Clanek {
  id: string;
  slug: string;
  stav: string;
  rubrika: string;
  obec: string;
  nadpis: string;
  perex: string;
  autor: string;
  datumPublikace: string;
  casCteniMin: number;
  obrazekAlt?: string;
  telo: string[];
  stitky: string[];
  hlavniZprava: boolean;
  souvisejiciClanky: string[];
  ukazkovyObsah?: boolean;
}

// Server-only proměnné (build-time), záměrně přes process.env, ne import.meta.env
// (Vite by je bez VITE_ prefixu do klientského bundlu stejně nepustil - tady jde
// navíc o čistě statický web, tenhle kód se vůbec nespouští v prohlížeči).
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'Clanky';

let cache: Promise<Clanek[]> | null = null;

function rubrikaSlugZNazvu(nazev: string | undefined): string | null {
  if (!nazev) return null;
  return taxonomie.rubriky.find((r) => r.nazev === nazev)?.slug ?? null;
}

function obecSlugZNazvu(nazev: string | undefined): string | null {
  if (!nazev) return null;
  return taxonomie.obce.find((o) => o.nazev === nazev)?.slug ?? null;
}

function odhadniCasCteni(telo: string[]): number {
  const pocetSlov = telo.join(' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(pocetSlov / 200));
}

// Pipeline (viz rozhledna-pipeline/pipeline/draft.py) plní pole Autor jako
// "AI návrh (Redakce Rozhledny)" - na publikovaném článku to čtenáři nepatří,
// zobrazit jako standardní "Redakce Rozhledny".
function normalizujAutora(autor: string | undefined): string {
  if (!autor || autor.includes('AI návrh')) return 'Redakce Rozhledny';
  return autor;
}

interface AirtableRecord {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
}

async function nacistVsechnyZaznamy(): Promise<AirtableRecord[]> {
  const zaklad = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;
  const filtr = encodeURIComponent("{Stav}='Publikováno'");
  const zaznamy: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = `${zaklad}?filterByFormula=${filtr}&pageSize=100${offset ? `&offset=${offset}` : ''}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    if (!resp.ok) {
      throw new Error(`Airtable API vrátila ${resp.status}: ${await resp.text()}`);
    }
    const data = (await resp.json()) as { records: AirtableRecord[]; offset?: string };
    zaznamy.push(...data.records);
    offset = data.offset;
  } while (offset);

  return zaznamy;
}

async function nacistZAirtable(): Promise<Clanek[]> {
  const zaznamy = await nacistVsechnyZaznamy();

  const clanky: Clanek[] = [];
  for (const rec of zaznamy) {
    const f = rec.fields as Record<string, any>;
    const rubrikaSlug = rubrikaSlugZNazvu(f.Rubrika);
    const obecSlug = obecSlugZNazvu(f.Obec);

    if (!rubrikaSlug || !obecSlug || !f.Slug || !f.Nadpis) {
      console.warn(
        `[clanky] Přeskakuji Airtable záznam ${rec.id} ("${f.Nadpis ?? '?'}") - chybí Slug/Nadpis, nebo Rubrika ("${f.Rubrika}")/Obec ("${f.Obec}") neodpovídá taxonomii. Zkontroluj záznam v Airtable před publikací.`,
      );
      continue;
    }

    const telo = String(f.Telo || '')
      .split(/\n\s*\n/)
      .map((s: string) => s.trim())
      .filter(Boolean);

    clanky.push({
      id: rec.id,
      slug: String(f.Slug),
      stav: String(f.Stav ?? ''),
      rubrika: rubrikaSlug,
      obec: obecSlug,
      nadpis: String(f.Nadpis),
      perex: String(f.Perex ?? ''),
      autor: normalizujAutora(f.Autor),
      datumPublikace: String(f.DatumPublikace || f.DatumZdroje || rec.createdTime.slice(0, 10)),
      casCteniMin: odhadniCasCteni(telo),
      obrazekAlt: undefined,
      telo,
      stitky: String(f.Stitky || '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean),
      hlavniZprava: Boolean(f.HlavniZprava),
      souvisejiciClanky: [],
      ukazkovyObsah: false,
    });
  }

  // Nejnovější nahoře.
  clanky.sort((a, b) => (a.datumPublikace < b.datumPublikace ? 1 : -1));

  // Související články: stejná obec, jiný slug, max 3 nejnovější. Airtable
  // zatím nemá pole pro ruční výběr souvisejících článků - dopočítá se tady.
  for (const c of clanky) {
    c.souvisejiciClanky = clanky
      .filter((jiny) => jiny.obec === c.obec && jiny.slug !== c.slug)
      .slice(0, 3)
      .map((jiny) => jiny.slug);
  }

  return clanky;
}

/**
 * Vrátí publikované články - z Airtable, nebo z lokálních ukázkových dat,
 * pokud Airtable není nakonfigurovaná nebo načtení selže. Výsledek je v
 * rámci jednoho buildu cachovaný (zavolá se jen jednou bez ohledu na to,
 * kolik stránek si o data řekne).
 */
export function getClanky(): Promise<Clanek[]> {
  if (cache) return cache;

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn(
      '[clanky] AIRTABLE_API_KEY/AIRTABLE_BASE_ID nejsou nastavené (build-time proměnné prostředí) - používám ukázková data z src/data/articles.json. Pro živý obsah nastav proměnné v administraci hostingu, viz README.',
    );
    cache = Promise.resolve(articlesJsonFallback as Clanek[]);
    return cache;
  }

  cache = nacistZAirtable().catch((err) => {
    console.error(
      '[clanky] Nepodařilo se načíst články z Airtable, build pokračuje s ukázkovými daty jako záchrannou variantou:',
      err,
    );
    return articlesJsonFallback as Clanek[];
  });
  return cache;
}
