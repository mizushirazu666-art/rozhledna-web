/**
 * Předpověď počasí pro pruh pod záhlavím – Open-Meteo (zdarma, bez klíče),
 * načítá se jen při buildu (web se přestavuje každé 2 h). Bere se několik
 * dní dopředu, aby si prohlížeč mohl vybrat dnešek i po půlnoci bez
 * přestavby. Při chybě vrací prázdný seznam a pruh počasí jen vynechá.
 */
import region from '../data/region.json';

export interface DenPocasi {
  datum: string; // YYYY-MM-DD (český čas)
  popis: string;
  max: number;
  min: number;
}

/** WMO kódy počasí → krátký český popis. */
function popisKodu(kod: number): string {
  if (kod === 0) return 'jasno';
  if (kod === 1) return 'skoro jasno';
  if (kod === 2) return 'polojasno';
  if (kod === 3) return 'zataženo';
  if (kod === 45 || kod === 48) return 'mlha';
  if (kod >= 51 && kod <= 57) return 'mrholení';
  if (kod >= 61 && kod <= 67) return 'déšť';
  if (kod >= 71 && kod <= 77) return 'sněžení';
  if (kod >= 80 && kod <= 82) return 'přeháňky';
  if (kod === 85 || kod === 86) return 'sněhové přeháňky';
  if (kod >= 95) return 'bouřky';
  return '';
}

let cache: Promise<DenPocasi[]> | null = null;

export function getPocasi(): Promise<DenPocasi[]> {
  if (cache) return cache;
  cache = (async () => {
    const { lat, lon } = region.pocasi;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Europe%2FPrague&forecast_days=3';
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) throw new Error(`Open-Meteo vrátilo ${resp.status}`);
    const d = (await resp.json()).daily as { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
    return d.time.map((datum, i) => ({
      datum,
      popis: popisKodu(d.weather_code[i]),
      max: Math.round(d.temperature_2m_max[i]),
      min: Math.round(d.temperature_2m_min[i]),
    }));
  })().catch((err) => {
    console.error('[pocasi] Předpověď se nepodařilo načíst, pruh bude bez počasí:', err);
    return [];
  });
  return cache;
}
