// @ts-check
import { defineConfig } from 'astro/config';

// Nasazeno na Vercel/Netlify (zdarma tarif) – viz akční plán, Fáze 6, Krok 4, bod 2.
// Doména: rozhledna-chrudimsko.cz
export default defineConfig({
  site: 'https://rozhledna-chrudimsko.cz',
  // Fotky článků jsou přílohy v Airtable. Jejich URL po pár hodinách
  // vyprší, proto je astro:assets při buildu stáhne, zmenší a uloží do
  // /_astro – na webu pak nezávisí na Airtable.
  image: {
    remotePatterns: [{ protocol: 'https', hostname: '**.airtableusercontent.com' }],
  },
});
