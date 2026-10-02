// @ts-check
import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Jeden kód, víc webů: region vybírá proměnná ROZHLEDNA_REGION (nastavená ve
// Vercel projektu daného webu, výchozí "chrudimsko"). Data regionu
// (taxonomie – obce, region.json, mapa-regionu.json) jsou pro Chrudimsko
// v src/data/, pro ostatní regiony v src/regiony/<region>/ – importy
// '../data/taxonomie.json' apod. se při buildu přesměrují tam.
const REGION = (process.env.ROZHLEDNA_REGION || 'chrudimsko').trim().toLowerCase();
const regionDir = fileURLToPath(new URL(`./src/regiony/${REGION}/`, import.meta.url));
const region = JSON.parse(
  readFileSync(REGION === 'chrudimsko' ? new URL('./src/data/region.json', import.meta.url) : `${regionDir}region.json`, 'utf-8'),
);

export default defineConfig({
  site: `https://${region.domena}`,
  vite: {
    resolve: {
      alias:
        REGION === 'chrudimsko'
          ? []
          : [{ find: /^.*\/data\/(taxonomie|region|mapa-regionu)\.json$/, replacement: `${regionDir}$1.json` }],
    },
  },
  // Fotky článků jsou přílohy v Airtable. Jejich URL po pár hodinách
  // vyprší, proto je astro:assets při buildu stáhne, zmenší a uloží do
  // /_astro – na webu pak nezávisí na Airtable.
  image: {
    remotePatterns: [{ protocol: 'https', hostname: '**.airtableusercontent.com' }],
  },
});
