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

/** Projde pole "polozky" a každý objekt (jako text) předá zpětnému volání.
 * Rozpracovaný objekt se skládá po kusech bloků (ne po znacích – soubor má
 * ~150 MB textu). */
async function prochazejPolozky(stream: AsyncIterable<string>, naObjekt: (text: string) => void): Promise<void> {
  let vPoli = false;
  let hloubka = 0;
  let vRetezci = false;
  let escape = false;
  let buf = '';
  let hledani = '';
  for await (let s of stream) {
    let i = 0;
    if (!vPoli) {
      hledani += s;
      const k = hledani.search(/"polozky"\s*:\s*\[/);
      if (k < 0) {
        hledani = hledani.slice(-40);
        continue;
      }
      s = hledani.slice(hledani.indexOf('[', k) + 1);
      vPoli = true;
    }
    let zacatek = hloubka > 0 ? 0 : -1;
    for (; i < s.length; i++) {
      const ch = s[i];
      if (vRetezci) {
        if (escape) escape = false;
        else if (ch === '\\') escape = true;
        else if (ch === '"') vRetezci = false;
        continue;
      }
      if (ch === '"') vRetezci = true;
      else if (ch === '{') {
        if (hloubka === 0) zacatek = i;
        hloubka++;
      } else if (ch === '}') {
        hloubka--;
        if (hloubka === 0) {
          naObjekt(buf + s.slice(zacatek, i + 1));
          buf = '';
          zacatek = -1;
        }
      } else if (ch === ']' && hloubka === 0) return;
    }
    if (hloubka > 0) buf += s.slice(zacatek);
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
  const resp = await fetch(ZDROJ, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Rozhledna; zpravodajský web obcí)' },
    signal: AbortSignal.timeout(240000),
  });
  if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
  // Server může poslat soubor s Content-Encoding: gzip – fetch ho pak rozbalí
  // sám a druhé rozbalení by selhalo. Rozhoduje hlavička gzipu (1f 8b).
  const surovy = Readable.fromWeb(resp.body as any);
  const prvni: Buffer = await new Promise((ok, chyba) => {
    surovy.once('readable', () => ok(surovy.read() ?? Buffer.alloc(0)));
    surovy.once('error', chyba);
  });
  surovy.unshift(prvni);
  const stream = prvni[0] === 0x1f && prvni[1] === 0x8b ? surovy.pipe(createGunzip()) : surovy;
  stream.setEncoding('utf8'); // vícebajtové znaky na hranici bloků
  const t0 = Date.now();
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
  console.log(`[prace] Volná místa v obcích regionu: ${vysledek.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
  return vysledek;
}

let cache: Promise<{ mista: VolneMisto[]; chyba: boolean }> | null = null;

export function getVolnaMista(): Promise<{ mista: VolneMisto[]; chyba: boolean }> {
  if (!cache) {
    cache = nacist()
      .then((mista) => ({ mista, chyba: false }))
      .catch((err) => {
        console.warn('[prace] Volná místa z data.mpsv.cz se nepodařilo načíst:', err?.message ?? err, err?.cause ?? '');
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
