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
          misto: String(f.Misto ?? ''),
          druh: String(f.Druh ?? ''),
          probiha: f.Stav === 'Probíhá',
          zdroj: String(f.Zdroj ?? ''),
          zdrojUrl: String(f.ZdrojURL ?? ''),
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
