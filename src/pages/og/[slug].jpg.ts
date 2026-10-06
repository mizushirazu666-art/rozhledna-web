/**
 * Náhledový obrázek článku pro sdílení (Facebook, WhatsApp…) na stálé adrese
 * /og/<slug>.jpg. Obrázky z astro:assets (/_astro/…) mají v názvu otisk
 * adresy přílohy v Airtable – ta se při každém buildu mění, takže se mění
 * i název souboru a stará adresa po další přestavbě (každé 2 h) vrací 404.
 * Facebook si náhled stahuje se zpožděním a pak ukáže prázdný rámeček.
 */
import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { getClanky } from '../../lib/clanky';

export async function getStaticPaths() {
  const clanky = await getClanky();
  return clanky
    .filter((c) => c.stav === 'Publikováno' && c.obrazek)
    .map((c) => ({ params: { slug: c.slug }, props: { url: c.obrazek!.url } }));
}

async function zdrojFotky(url: string): Promise<Buffer> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return Buffer.from(await resp.arrayBuffer());
  } catch (err) {
    // Chyba stažení nesmí shodit build – místo fotky obrázek regionu.
    console.warn(`[og] Fotku ${url} se nepodařilo stáhnout (${err}) – použit obrázek regionu.`);
    const region = (process.env.ROZHLEDNA_REGION || 'chrudimsko').trim().toLowerCase();
    return readFile(`${process.cwd()}/public/og-${region}.png`);
  }
}

export const GET: APIRoute = async ({ props }) => {
  // Vždy 1200 × 630 (poměr, který Facebook ukazuje jako velký náhled) –
  // rozměry pak může BaseLayout uvést v og:image:width/height. Výřez se
  // zaměří na nejzajímavější část fotky (sharp „attention“).
  const jpg = await sharp(await zdrojFotky(props.url as string))
    .rotate()
    .resize({ width: 1200, height: 630, fit: 'cover', position: sharp.strategy.attention })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return new Response(new Uint8Array(jpg), { headers: { 'Content-Type': 'image/jpeg' } });
};
