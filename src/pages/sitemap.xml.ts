/**
 * Mapa webu pro vyhledávače (Google Search Console, Seznam Webmaster):
 * hlavní stránka, rubriky, obce, publikované články a hlášení.
 */
import type { APIRoute } from 'astro';
import taxonomie from '../data/taxonomie.json';
import { getClanky } from '../lib/clanky';
import { getHlaseni } from '../lib/hlaseni';

function polozka(adresa: string, zmena?: string): string {
  const lastmod = zmena ? `<lastmod>${zmena.slice(0, 10)}</lastmod>` : '';
  return `<url><loc>${adresa}</loc>${lastmod}</url>`;
}

export const GET: APIRoute = async ({ site }) => {
  const url = (cesta: string) => new URL(cesta, site).href;
  const clanky = (await getClanky()).filter((c) => c.stav === 'Publikováno' && !c.ukazkovyObsah);
  const hlaseni = await getHlaseni();
  const nejnovejsi = clanky[0]?.datumPublikace;
  const radky = [
    polozka(url('/'), nejnovejsi),
    ...taxonomie.rubriky.map((r) => polozka(url(`/rubrika/${r.slug}/`))),
    polozka(url('/obce/')),
    ...taxonomie.obce.map((o) => polozka(url(`/obec/${o.slug}/`))),
    ...clanky.map((c) => polozka(url(`/clanek/${c.slug}/`), c.datumPublikace)),
    ...hlaseni.map((h) => polozka(url(`/hlaseni/${h.slug}/`), h.cas)),
    ...['/o-nas/', '/kontakt/', '/poslete-fotku/', '/inzerce/', '/ochrana-udaju/'].map((c) => polozka(url(c))),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${radky.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
