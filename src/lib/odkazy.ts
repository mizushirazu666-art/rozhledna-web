/**
 * Odkazy v textu článku: zápis [text](adresa) v poli Telo (Airtable) se na
 * webu vykreslí jako odkaz. Povolené jsou jen adresy webu (/clanek/…) a
 * http(s) – cokoli jiného zůstane obyčejným textem.
 */
export interface CastTextu {
  text: string;
  href?: string;
  externi?: boolean;
}

const ODKAZ_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;

export function castiTextu(text: string): CastTextu[] {
  const casti: CastTextu[] = [];
  let posledni = 0;
  for (const m of text.matchAll(ODKAZ_RE)) {
    const [cely, popis, href] = m;
    const index = m.index ?? 0;
    const povoleny = href.startsWith('/') || /^https?:\/\//.test(href);
    if (index > posledni) casti.push({ text: text.slice(posledni, index) });
    casti.push(povoleny ? { text: popis, href, externi: !href.startsWith('/') } : { text: cely });
    posledni = index + cely.length;
  }
  if (posledni < text.length) casti.push({ text: text.slice(posledni) });
  return casti;
}

/** Text bez zápisu odkazů (pro perex, popis stránky, čas čtení). */
export function bezOdkazu(text: string): string {
  return text.replace(ODKAZ_RE, '$1');
}
