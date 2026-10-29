import type { Clanek } from './clanky';

/** Kalendář akcí (29. 10. 2026, stránka /akce/ a blok na hlavní stránce).
 * Akce = článek v rubrice Kultura s PlatiDo (pipeline ho u pozvánek nastaví na
 * poslední den akce). Den akce: budoucí DatumZdroje (začátek akce), jinak PlatiDo
 * – u pozvánek bývá DatumZdroje datum zveřejnění, ne akce. */
export interface Akce {
  clanek: Clanek;
  /** Den, pod kterým se akce v kalendáři ukáže (YYYY-MM-DD). */
  den: string;
  /** Poslední den vícedenní akce, jinak stejné jako den. */
  do: string;
}

export function dnesPraha(posun = 0): string {
  const d = new Date(Date.now() + posun * 86400000);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(d);
}

export function akceNaDny(clanky: Clanek[], dni = 14): Akce[] {
  const dnes = dnesPraha();
  const konec = dnesPraha(dni);
  const akce: Akce[] = [];
  for (const c of clanky) {
    if (c.rubrika !== 'kultura' || !c.platiDo || c.platiDo < dnes) continue;
    const zacatek = c.datumZdroje && c.datumZdroje > dnes && c.datumZdroje <= c.platiDo ? c.datumZdroje : c.platiDo;
    if (zacatek > konec) continue;
    akce.push({ clanek: c, den: zacatek, do: c.platiDo });
  }
  akce.sort((a, b) => (a.den === b.den ? a.clanek.nadpis.localeCompare(b.clanek.nadpis, 'cs') : a.den < b.den ? -1 : 1));
  return akce;
}

const DNY = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];

/** „Dnes“, „Zítra“, jinak „Sobota 31. 10.“ */
export function nazevDne(den: string): string {
  if (den === dnesPraha()) return 'Dnes';
  if (den === dnesPraha(1)) return 'Zítra';
  const [r, m, d] = den.split('-').map(Number);
  const t = DNY[new Date(Date.UTC(r, m - 1, d)).getUTCDay()];
  return `${t[0].toUpperCase()}${t.slice(1)} ${d}. ${m}.`;
}

export function jeVikend(den: string): boolean {
  const [r, m, d] = den.split('-').map(Number);
  const w = new Date(Date.UTC(r, m - 1, d)).getUTCDay();
  return w === 0 || w === 6;
}

export function kratkeDatum(den: string): string {
  const [, m, d] = den.split('-').map(Number);
  return `${d}. ${m}.`;
}
