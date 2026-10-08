/**
 * Bloky v textu článku (pole Telo v Airtable). Odstavec, jehož všechny řádky
 * začínají a končí svislítkem, je tabulka – první řádek je záhlaví:
 *
 *   | Obec | Účast 2022 |
 *   | Bořice | 51,3 % |
 *
 * Když odstavci předchází řádek [mapa], vykreslí se navíc mapka obcí
 * regionu s hodnotou u každé obce (první sloupec = název obce, druhý =
 * hodnota; barva podle čísla v hodnotě). Výčty po obcích tak nejsou dlouhá
 * věta (přání Lukáše 8. 10. 2026).
 */
export type Blok =
  | { typ: 'text'; text: string }
  | { typ: 'tabulka'; hlavicka: string[]; radky: string[][]; mapa: boolean };

const RADEK_TABULKY = /^\|.*\|$/;

export function blokTextu(odstavec: string): Blok {
  const radky = odstavec.split('\n').map((r) => r.trim()).filter(Boolean);
  const mapa = radky[0]?.toLowerCase() === '[mapa]';
  const tabulka = mapa ? radky.slice(1) : radky;
  if (tabulka.length < 2 || !tabulka.every((r) => RADEK_TABULKY.test(r))) {
    return { typ: 'text', text: odstavec };
  }
  const bunky = tabulka
    .map((r) => r.slice(1, -1).split('|').map((b) => b.trim()))
    // oddělovač záhlaví z Markdownu (| --- | --- |) přeskočit
    .filter((r) => !r.every((b) => /^:?-{2,}:?$/.test(b)));
  return { typ: 'tabulka', hlavicka: bunky[0], radky: bunky.slice(1), mapa };
}

/** Číslo z hodnoty v buňce („51,3 %“ → 51.3), nebo null. */
export function cisloZHodnoty(hodnota: string): number | null {
  const m = hodnota.replace(/\s/g, '').match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
}

/** Text pro čas čtení, RSS apod. – tabulka jako „hlavička: hodnota“. */
export function blokJakoText(blok: Blok): string {
  return blok.typ === 'text' ? blok.text : blok.radky.map((r) => r.join(' ')).join(', ');
}
