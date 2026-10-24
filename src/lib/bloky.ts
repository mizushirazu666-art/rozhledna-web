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
 *
 * Odstavec, jehož všechny řádky jsou obrázky ve tvaru Markdownu
 * ![popisek](/cesta.jpg), je galerie fotek (jen fotky z webu, adresa
 * začíná „/“) – např. čtenářská galerie „Podzim v obci“ (24. 10. 2026).
 */
export type Blok =
  | { typ: 'text'; text: string }
  | { typ: 'tabulka'; hlavicka: string[]; radky: string[][]; mapa: boolean }
  | { typ: 'galerie'; fotky: { src: string; popis: string }[] };

const RADEK_TABULKY = /^\|.*\|$/;
const RADEK_FOTKY = /^!\[([^\]]*)\]\((\/[^)\s]+)\)$/;

export function blokTextu(odstavec: string): Blok {
  const radky = odstavec.split('\n').map((r) => r.trim()).filter(Boolean);
  if (radky.length > 0 && radky.every((r) => RADEK_FOTKY.test(r))) {
    const fotky = radky.map((r) => {
      const [, popis, src] = r.match(RADEK_FOTKY)!;
      return { src, popis };
    });
    return { typ: 'galerie', fotky };
  }
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
  if (blok.typ === 'text') return blok.text;
  if (blok.typ === 'galerie') return blok.fotky.map((f) => f.popis).join(', ');
  return blok.radky.map((r) => r.join(' ')).join(', ');
}
