/**
 * RSS kanál posledních článků – pro čtečky zpráv, agregátory a nástroje,
 * které z nového článku umí udělat příspěvek na Facebooku.
 */
import type { APIRoute } from 'astro';
import region from '../data/region.json';
import { getClanky } from '../lib/clanky';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async ({ site }) => {
  const clanky = (await getClanky()).filter((c) => c.stav === 'Publikováno' && !c.ukazkovyObsah).slice(0, 40);
  const polozky = clanky.map((c) => {
    const odkaz = new URL(`/clanek/${c.slug}/`, site).href;
    return `<item><title>${esc(c.nadpis)}</title><link>${odkaz}</link><guid>${odkaz}</guid><pubDate>${new Date(c.datumPublikace).toUTCString()}</pubDate><description>${esc(c.perex)}</description></item>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${esc(`Rozhledna – ${region.nazev}`)}</title>
<link>${new URL('/', site).href}</link>
<description>${esc(`Zprávy z obcí ${region.genitiv}`)}</description>
<language>cs</language>
${polozky.join('\n')}
</channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
