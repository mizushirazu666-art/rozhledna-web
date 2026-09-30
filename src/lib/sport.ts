/**
 * Sportovní přehled: zápasy a tabulky klubů z našich obcí z Airtable
 * (tabulky Zapasy a Tabulky, plní je rozhledna-pipeline – scrapers/sport.py).
 * Načítá se při buildu stejně jako články; bez Airtable (lokální vývoj)
 * vrací prázdná data a sportovní bloky se na webu nezobrazí.
 */
import taxonomie from '../data/taxonomie.json';

export interface Zapas {
  id: string;
  sport: string;
  obec: string; // slug
  tym: string;
  soutez: string;
  kategorie: string;
  kolo?: number;
  zacatek: string; // ISO
  domaci: string;
  hoste: string;
  domaNas: boolean;
  misto: string;
  skore: string;
  strelci: string;
  odehrano: boolean;
}

export interface RadekTabulky {
  poradi: number;
  tym: string;
  z?: string;
  v?: string;
  r?: string;
  p?: string;
  skore?: string;
  body: string;
  nas?: boolean;
}

export interface Tabulka {
  id: string;
  sport: string;
  obec: string;
  tym: string;
  soutez: string;
  poradi?: number;
  radky: RadekTabulky[];
}

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

function obecSlug(nazev: unknown): string {
  return taxonomie.obce.find((o) => o.nazev === nazev)?.slug ?? '';
}

async function nacist(tabulka: string, filtr?: string): Promise<Record<string, any>[]> {
  const zaklad = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tabulka)}`;
  const vysledek: Record<string, any>[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (filtr) params.set('filterByFormula', filtr);
    if (offset) params.set('offset', offset);
    const resp = await fetch(`${zaklad}?${params}`, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    if (!resp.ok) throw new Error(`Airtable ${tabulka} vrátila ${resp.status}: ${await resp.text()}`);
    const data = (await resp.json()) as { records: { id: string; fields: Record<string, any> }[]; offset?: string };
    vysledek.push(...data.records.map((r) => ({ id: r.id, ...r.fields })));
    offset = data.offset;
  } while (offset);
  return vysledek;
}

let cache: Promise<{ zapasy: Zapas[]; tabulky: Tabulka[] }> | null = null;

export function getSport(): Promise<{ zapasy: Zapas[]; tabulky: Tabulka[] }> {
  if (cache) return cache;
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    cache = Promise.resolve({ zapasy: [], tabulky: [] });
    return cache;
  }
  cache = (async () => {
    // Stačí zápasy od dvou týdnů zpátky – starší výsledky už web neukazuje.
    const zapasyRaw = await nacist('Zapasy', 'IS_AFTER({Zacatek}, DATEADD(TODAY(), -14, "days"))');
    const tabulkyRaw = await nacist('Tabulky');
    const zapasy: Zapas[] = zapasyRaw
      .filter((f) => f.Zacatek && obecSlug(f.Obec))
      .map((f) => ({
        id: String(f.ZapasId ?? f.id),
        sport: String(f.Sport ?? ''),
        obec: obecSlug(f.Obec),
        tym: String(f.Tym ?? ''),
        soutez: String(f.Soutez ?? ''),
        kategorie: String(f.Kategorie ?? ''),
        kolo: f.Kolo ? Number(f.Kolo) : undefined,
        zacatek: String(f.Zacatek),
        domaci: String(f.Domaci ?? ''),
        hoste: String(f.Hoste ?? ''),
        domaNas: Boolean(f.DomaNas),
        misto: String(f.Misto ?? ''),
        skore: String(f.Skore ?? ''),
        strelci: String(f.Strelci ?? ''),
        odehrano: f.Stav === 'Odehráno' || Boolean(f.Skore),
      }))
      .sort((a, b) => a.zacatek.localeCompare(b.zacatek));
    const tabulky: Tabulka[] = tabulkyRaw
      .filter((f) => obecSlug(f.Obec))
      .map((f) => {
        let radky: RadekTabulky[] = [];
        try {
          radky = JSON.parse(String(f.Radky || '[]'));
        } catch {
          radky = [];
        }
        return {
          id: String(f.TabulkaId ?? f.id),
          sport: String(f.Sport ?? ''),
          obec: obecSlug(f.Obec),
          tym: String(f.Tym ?? ''),
          soutez: String(f.Soutez ?? ''),
          poradi: f.Poradi ? Number(f.Poradi) : undefined,
          radky,
        };
      });
    return { zapasy, tabulky };
  })().catch((err) => {
    console.error('[sport] Nepodařilo se načíst zápasy/tabulky z Airtable, sportovní přehled bude prázdný:', err);
    return { zapasy: [], tabulky: [] };
  });
  return cache;
}

const PORADI_KATEGORII = ['Muži', 'Ženy', 'Dorost', 'Žáci', 'Přípravka'];

/** Zápasy pro přehled: nadcházející do `dniDopredu`, odehrané za `dniZpet`
 * (výsledky jen dospělých – u mládeže zdroje výsledky nemají). */
export function vyberZapasy(zapasy: Zapas[], obec?: string, dniDopredu = 9, dniZpet = 8, ted = new Date()) {
  const zObce = zapasy.filter((z) => !obec || z.obec === obec);
  const od = ted.getTime() - dniZpet * 86_400_000;
  const do_ = ted.getTime() + dniDopredu * 86_400_000;
  const program = zObce.filter((z) => !z.odehrano && new Date(z.zacatek).getTime() >= ted.getTime() - 3 * 3_600_000 && new Date(z.zacatek).getTime() <= do_);
  const vysledky = zObce
    .filter((z) => z.odehrano && new Date(z.zacatek).getTime() >= od)
    .sort((a, b) => b.zacatek.localeCompare(a.zacatek));
  return { program, vysledky };
}

export function seraditTabulky(tabulky: Tabulka[], obec?: string): Tabulka[] {
  return tabulky
    .filter((t) => !obec || t.obec === obec)
    .sort((a, b) => a.obec.localeCompare(b.obec) || a.soutez.localeCompare(b.soutez));
}

export function kategorieIndex(k: string): number {
  const i = PORADI_KATEGORII.indexOf(k);
  return i < 0 ? 99 : i;
}

export function nazevObce(slug: string): string {
  return taxonomie.obce.find((o) => o.slug === slug)?.nazev ?? slug;
}

const DNY = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];

/** "so 4. 10. 16:00" v pražském čase (build běží v UTC). */
export function formatZacatek(iso: string): string {
  const d = new Date(iso);
  const casti = new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'Europe/Prague',
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const cast = (typ: string) => casti.find((p) => p.type === typ)?.value ?? '';
  const den = DNY[new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Prague' })).getDay()];
  return `${den} ${cast('day')}. ${cast('month')}. ${cast('hour')}:${cast('minute')}`;
}
