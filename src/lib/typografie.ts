/**
 * Česká typografie (přání Lukáše 17. 11. 2026): za jednopísmennými
 * předložkami a spojkami (k, s, v, z, o, u, a, i) pevná mezera, aby na konci
 * řádku nezůstaly samotné. Používá se na nadpis, perex a text článků
 * a hlášení při načtení z Airtable. Lookbehind bere i předchozí pevnou mezeru,
 * takže projde i „a v lese“.
 */
const JEDNOPISMENNA = /(?<=^|[\s („"'–—-])([kKsSvVzZoOuUaAiI]) (?=\S)/gm;

export function pevneMezery(text: string): string {
  return text.replace(JEDNOPISMENNA, '$1 ');
}
