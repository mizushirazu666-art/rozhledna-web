/**
 * Práce v okolí (29. 10. 2026) – stránka /prace/. Zdroj: otevřená data volných
 * míst Úřadu práce ČR (data.mpsv.cz, volna-mista.json.gz, ~18 MB, denně
 * aktualizované). Načítá se jen při buildu; soubor se čte proudově a JSON se
 * parsuje jen u míst, která zmiňují kód některé obce regionu – celý soubor by
 * se do paměti vešel špatně. Při chybě prázdný seznam a odkaz na Úřad práce.
 * Jména kontaktních osob web nezobrazuje – jen zaměstnavatele.
 */
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { OBCE } from '../../api/volby.js';

const ZDROJ = 'https://data.mpsv.cz/od/soubory/volna-mista/volna-mista.json.gz';
export const UP_HLEDANI = 'https://up.gov.cz/volna-mista-v-cr';

export interface VolneMisto {
  id: number;
  profese: string;
  zamestnavatel: string;
  obec: string; // slug obce regionu
  obecNazev: string;
  mzdaOd?: number;
  mzdaDo?: number;
  hodinova: boolean;
  hodinTydne?: number;
  pocetMist: number;
  vlozeno: string; // YYYY-MM-DD
  info: string;
  email?: string;
  telefon?: string;
}

type ObecRegionu = { slug: string; nazev: string; kod: number };

/** Projde pole "polozky" a každý objekt (jako text) předá zpětnému volání. */
async function prochazejPolozky(stream: Readable, naObjekt: (text: string) => void): Promise<void> {
  let vPoli = false;
  let hloubka = 0;
  let vRetezci = false;
  let escape = false;
  let buf = '';
  let hledani = '';
  for await (const chunk of stream) {
    const s: string = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (!vPoli) {
        hledani = (hledani + ch).slice(-12);
        if (hledani.endsWith('"polozky"')) hledani = 'POLOZKY';
        else if (hledani.startsWith('POLOZKY') && ch === '[') vPoli = true;
        continue;
      }
      if (hloubka > 0) buf += ch;
      if (vRetezci) {
        if (escape) escape = false;
        else if (ch === '\\') escape = true;
        else if (ch === '"') vRetezci = false;
        continue;
      }
      if (ch === '"') vRetezci = true;
      else if (ch === '{') {
        if (hloubka === 0) buf = '{';
        hloubka++;
      } else if (ch === '}') {
        hloubka--;
        if (hloubka === 0) naObjekt(buf);
      } else if (ch === ']' && hloubka === 0) return;
    }
  }
}

function kodObce(o: any): string | undefined {
  const m = o?.mistoVykonuPrace;
  const id = m?.obec?.id ?? m?.pracoviste?.[0]?.adresa?.obec?.id;
  return typeof id === 'string' ? id.replace('Obec/', '') : undefined;
}

async function nacist(): Promise<VolneMisto[]> {
  const region = process.env.ROZHLEDNA_REGION || 'chrudimsko';
  const obce: ObecRegionu[] = (OBCE as Record<string, ObecRegionu[]>)[region] ?? [];
  const podleKodu = new Map(obce.map((o) => [String(o.kod), o]));
  const resp = await fetch(ZDROJ, { signal: AbortSignal.timeout(90000) });
  if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
  const stream = Readable.fromWeb(resp.body as any).pipe(createGunzip());
  stream.setEncoding('utf8'); // vícebajtové znaky na hranici bloků
  const vysledek: VolneMisto[] = [];
  const kody = [...podleKodu.keys()].map((k) => `"Obec/${k}"`);
  await prochazejPolozky(stream, (text) => {
    if (!kody.some((k) => text.includes(k))) return;
    let o: any;
    try {
      o = JSON.parse(text);
    } catch {
      return;
    }
    const obec = podleKodu.get(kodObce(o) ?? '');
    if (!obec) return; // kód obce jen v kontaktní adrese, místo výkonu jinde
    const prac = o.mistoVykonuPrace?.pracoviste?.[0];
    const kontakt = o.prvniKontaktSeZamestnavatelem?.komuSeHlasit;
    vysledek.push({
      id: o.portalId,
      profese: o.pozadovanaProfese?.cs ?? 'Volné místo',
      zamestnavatel: o.zamestnavatel?.nazev ?? prac?.nazev ?? '',
      obec: obec.slug,
      obecNazev: obec.nazev,
      mzdaOd: o.mesicniMzdaOd ?? undefined,
      mzdaDo: o.mesicniMzdaDo ?? undefined,
      hodinova: o.typMzdy?.id === 'TypMzdy/hod',
      hodinTydne: o.pocetHodinTydne ?? undefined,
      pocetMist: o.pocetMist ?? 1,
      vlozeno: String(o.datumZmeny ?? o.datumVlozeni ?? '').slice(0, 10),
      info: String(o.upresnujiciInformace?.cs ?? '').slice(0, 600),
      email: kontakt?.email ?? prac?.email ?? undefined,
      telefon: kontakt?.telefon ?? prac?.telefon ?? undefined,
    });
  });
  vysledek.sort((a, b) => (a.vlozeno < b.vlozeno ? 1 : -1));
  return vysledek;
}

let cache: Promise<{ mista: VolneMisto[]; chyba: boolean }> | null = null;

export function getVolnaMista(): Promise<{ mista: VolneMisto[]; chyba: boolean }> {
  if (!cache) {
    cache = nacist()
      .then((mista) => ({ mista, chyba: false }))
      .catch((err) => {
        console.warn('[prace] Volná místa z data.mpsv.cz se nepodařilo načíst:', err);
        return { mista: [], chyba: true };
      });
  }
  return cache;
}

export function formatMzda(m: VolneMisto): string {
  const f = (n: number) => n.toLocaleString('cs-CZ');
  const j = m.hodinova ? 'Kč/hod.' : 'Kč měsíčně';
  if (m.mzdaOd && m.mzdaDo && m.mzdaDo !== m.mzdaOd) return `${f(m.mzdaOd)}–${f(m.mzdaDo)} ${j}`;
  if (m.mzdaOd) return `od ${f(m.mzdaOd)} ${j}`;
  if (m.mzdaDo) return `až ${f(m.mzdaDo)} ${j}`;
  return '';
}
