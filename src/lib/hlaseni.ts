/**
 * Krátká hlášení z Chrudimska z Airtable tabulky Hlaseni – výjezdy hasičů
 * (Typ "Výjezd", scrapers/izs.py) a krátké zprávy policie, hasičů a Deníku
 * (Typ "Zpráva", scrapers/bezpecnost.py); plní je rozhledna-pipeline každé
 * 2 hodiny. Obec je vyplněná jen u našich obcí, Lokalita u všech.
 * Úřední hlášení se ukazují bez schvalování; redakce je může jen skrýt
 * (Skryto). Bez Airtable (lokální vývoj) vrací prázdný seznam a bloky
 * s hlášeními se na webu nezobrazí.
 */
import taxonomie from '../data/taxonomie.json';

export interface Hlaseni {
  id: string;
  typ: 'vyjezd' | 'zprava';
  cas: string; // ISO
  obec: string; // slug naší obce, jinak ''
  lokalita: string;
  nadpis: string;
  misto: string;
  druh: string;
  probiha: boolean;
  zdroj: string;
  zdrojUrl: string;
  text: string[]; // odstavce krátkého článku (může být prázdné)
  slug: string; // /hlaseni/<slug>/
}

/** Podtyp výjezdu z textu („…k technické pomoci – otevření uzavřených
 * prostor.“, scrapers/izs.py) – hasiči ho uvádějí v detailu události. */
export function podtypVyjezdu(h: Hlaseni): string {
  const m = h.text[0]?.match(/vyjížděli\b[^–]*?\bk [^–.]+ – ([^.]+)\./);
  if (!m) return '';
  // „odpad, ostatní“ → „odpad“; samotné „ostatní“/„jiné“ nic neříká.
  const podtyp = m[1].trim().replace(/,\s*(ostatní|jiné)$/i, '');
  return /^(ostatní|jiné|nezadán)$/i.test(podtyp) ? '' : podtyp;
}

/** Druh výjezdu i s podtypem: „Technická pomoc – otevření uzavřených prostor“
 * (3. 11. 2026, přání Lukáše – konkrétnější nadpisy v Bezpečnosti). */
export function druhVyjezdu(h: Hlaseni): string {
  const podtyp = podtypVyjezdu(h);
  return podtyp ? `${h.druh} – ${podtyp}` : h.druh;
}

/** Titulek hlášení – u zpráv nadpis, u výjezdů "Požár – odpad (Chrudim IV)". */
export function titulekHlaseni(h: Hlaseni): string {
  return h.typ === 'zprava' ? h.nadpis : `${druhVyjezdu(h)}, ${mistoBezOpakovani(h.misto)}`;
}

/** Datum hlášení „2. 11. 2026“ (čas Praha). */
export function datumHlaseni(iso: string): string {
  return new Date(iso).toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', year: 'numeric' });
}

/** Titulek stránky pro vyhledávače (2. 11. 2026): typ, místo a datum – lidé
 * hledají „nehoda Krouna dnes“, „požár Hlinsko“. U výjezdů místo bez
 * opakování („Krouna - Krouna“ → „Krouna“). */
export function seoTitulekHlaseni(h: Hlaseni): string {
  const datum = datumHlaseni(h.cas);
  if (h.typ === 'zprava') return `${h.nadpis} – ${datum}`;
  return `${druhVyjezdu(h)}, ${mistoBezOpakovani(h.misto)} – ${datum}`;
}

/** „Krouna - Krouna“ → „Krouna“, „Chrudim - Chrudim IV“ → „Chrudim, Chrudim IV“. */
function mistoBezOpakovani(misto: string): string {
  return [...new Set(hezkeMisto(misto).split(', ').map((x) => x.trim()).filter(Boolean))].join(', ');
}

/** "Chrudim - Chrudim IV" → "Chrudim, Chrudim IV" (zápis hasičů). */
export function hezkeMisto(misto: string): string {
  return misto.replace(/\s+-\s+/g, ', ');
}

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

/** Jak dlouho zpátky hlášení na webu ukazujeme. */
export const DNI_ZPET = 30;

let cache: Promise<Hlaseni[]> | null = null;

export function getHlaseni(): Promise<Hlaseni[]> {
  if (cache) return cache;
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    cache = Promise.resolve([]);
    return cache;
  }
  cache = (async () => {
    const zaklad = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Hlaseni`;
    const filtr = `AND(NOT({Skryto}), IS_AFTER({Cas}, DATEADD(TODAY(), -${DNI_ZPET}, "days")))`;
    const vysledek: Hlaseni[] = [];
    let offset: string | undefined;
    do {
      const params = new URLSearchParams({ pageSize: '100', filterByFormula: filtr });
      if (offset) params.set('offset', offset);
      const resp = await fetch(`${zaklad}?${params}`, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
      if (!resp.ok) throw new Error(`Airtable Hlaseni vrátila ${resp.status}: ${await resp.text()}`);
      const data = (await resp.json()) as { records: { id: string; fields: Record<string, any> }[]; offset?: string };
      for (const { id, fields: f } of data.records) {
        if (!f.Cas) continue;
        const obec = taxonomie.obce.find((o) => o.nazev === f.Obec)?.slug ?? '';
        vysledek.push({
          id: String(f.HlaseniId ?? id),
          typ: f.Typ === 'Zpráva' ? 'zprava' : 'vyjezd',
          cas: String(f.Cas),
          obec,
          lokalita: String(f.Lokalita || f.Obec || ''),
          nadpis: String(f.Nadpis ?? ''),
          misto: hezkeMisto(String(f.Misto ?? '')),
          druh: String(f.Druh ?? ''),
          probiha: f.Stav === 'Probíhá',
          zdroj: String(f.Zdroj ?? ''),
          zdrojUrl: String(f.ZdrojURL ?? ''),
          text: String(f.Text ?? '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean),
          slug: String(f.HlaseniId ?? id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        });
      }
      offset = data.offset;
    } while (offset);
    return vysledek.sort((a, b) => b.cas.localeCompare(a.cas));
  })().catch((err) => {
    console.error('[hlaseni] Nepodařilo se načíst hlášení IZS z Airtable, bloky s hlášeními budou prázdné:', err);
    return [];
  });
  return cache;
}

const PRAHA = 'Europe/Prague';

function denKlic(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: PRAHA });
}

/** "Dnes 18:41", "Včera 9:04", jinak "Po 28. 9. 14:10" (český čas).
 * jenDen – bez času (u zpráv je čas jen okamžik, kdy je sběr našel). */
export function formatCas(iso: string, jenDen = false, ted = new Date()): string {
  const d = new Date(iso);
  const cas = jenDen ? '' : ` ${d.toLocaleTimeString('cs-CZ', { timeZone: PRAHA, hour: 'numeric', minute: '2-digit' })}`;
  const vcera = new Date(ted.getTime() - 86_400_000);
  if (denKlic(d) === denKlic(ted)) return `Dnes${cas}`;
  if (denKlic(d) === denKlic(vcera)) return `Včera${cas}`;
  const den = d.toLocaleDateString('cs-CZ', { timeZone: PRAHA, weekday: 'short', day: 'numeric', month: 'numeric' });
  return `${den.charAt(0).toUpperCase()}${den.slice(1)}${cas}`;
}
