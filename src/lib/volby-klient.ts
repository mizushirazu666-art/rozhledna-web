// Vykreslení živých výsledků voleb v prohlížeči (stránky /volby-2026/ a
// /volby-2026/<obec>/). Data z /api/volby (api/volby.js).

export type Strana = {
  cislo: number; nazev: string; plnyNazev: string; hlasy: number; procent: number;
  mandaty: number | null; zvoleni: { jmeno: string; hlasy: number | null }[];
};
export type Obec = {
  slug: string; nazev: string; dostupne: boolean; konecne: boolean; mandatu: number | null;
  okrskyCelkem: number | null; okrskyZpracovano: number | null; zpracovanoProcent: number | null;
  ucastProcent: number | null; strany: Strana[];
};

export const cz = (n: number, des = 0) =>
  n.toLocaleString('cs-CZ', { minimumFractionDigits: des, maximumFractionDigits: des });

export const el = (tag: string, trida?: string, text?: string) => {
  const e = document.createElement(tag);
  if (trida) e.className = trida;
  if (text !== undefined) e.textContent = text;
  return e;
};

export const sectenoHlasu = (o: Obec) => o.strany.some((s) => s.hlasy > 0);
export const bezDiakritiky = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function stitek(o: Obec) {
  if (o.konecne) return el('span', 'stitek stitek--konec', 'Konečné výsledky');
  if (sectenoHlasu(o)) {
    const p = o.zpracovanoProcent;
    return el('span', 'stitek stitek--prubeh', p !== null && p > 0 && p <= 100 ? `Sčítá se · ${cz(p)} % okrsků` : 'Sčítá se');
  }
  return el('span', 'stitek', o.dostupne ? 'Zatím bez výsledků' : 'Data nedostupná');
}

/** Karta obce. `otevrene` si pamatuje rozbalené části mezi obnoveními,
 * `detail` = karta na vlastní stránce obce (bez zkracování seznamu). */
export function karta(o: Obec, otevrene: Set<string>, detail = false) {
  const k = el('article', 'karta');
  const hlava = el('div', 'karta__hlava');
  const odkaz = el(detail ? 'span' : 'a', 'karta__nazev', o.nazev) as HTMLAnchorElement;
  if (!detail) odkaz.href = `/volby-2026/${o.slug}/`;
  hlava.append(odkaz, stitek(o));
  k.append(hlava);

  const info: string[] = [];
  if (o.ucastProcent !== null && o.ucastProcent > 0 && o.ucastProcent <= 100) info.push(`Účast ${cz(o.ucastProcent, 2)} %`);
  if (o.mandatu) info.push(`${o.mandatu} míst v zastupitelstvu`);
  if (o.strany.length === 1) info.push('jediná kandidátka');
  if (info.length) k.append(el('p', 'karta__info', info.join(' · ')));

  const strany = el('div', 'karta__strany');
  // Nezávislí kandidáti jsou každý samostatná „strana“ – dlouhý seznam se
  // zkrátí na prvních 6, zbytek pod rozbalovací odkaz.
  const NAHORE = detail ? 1000 : 6;
  const zbytek = el('details', 'karta__dalsi') as HTMLDetailsElement;
  zbytek.open = otevrene.has(`${o.slug}:dalsi`);
  zbytek.addEventListener('toggle', () => (zbytek.open ? otevrene.add(`${o.slug}:dalsi`) : otevrene.delete(`${o.slug}:dalsi`)));
  zbytek.append(el('summary', undefined, `Další kandidující (${Math.max(0, o.strany.length - NAHORE)})`));
  for (const [i, s] of o.strany.entries()) {
    const r = el('div', 'strana');
    const popis = el('div', 'strana__popis');
    popis.append(el('span', 'strana__nazev', s.plnyNazev || s.nazev));
    const cisla = sectenoHlasu(o) ? `${cz(s.procent, 2)} % · ${cz(s.hlasy)} hl.` : '';
    const mand = s.mandaty !== null ? ` · ${s.mandaty} ${s.mandaty === 1 ? 'mandát' : s.mandaty >= 2 && s.mandaty <= 4 ? 'mandáty' : 'mandátů'}` : '';
    popis.append(el('span', 'strana__cisla', cisla + mand));
    const pruh = el('div', 'strana__pruh');
    const vypln = el('div', 'strana__vypln');
    vypln.style.width = `${Math.max(0, Math.min(100, s.procent))}%`;
    pruh.append(vypln);
    r.append(popis, pruh);
    (i < NAHORE || o.strany.length <= NAHORE + 1 ? strany : zbytek).append(r);
  }
  if (o.strany.length > NAHORE + 1) strany.append(zbytek);
  k.append(strany);

  const zvoleni = o.strany.filter((s) => s.zvoleni.length);
  if (o.konecne && zvoleni.length) {
    const d = el('details', 'karta__zvoleni') as HTMLDetailsElement;
    d.open = detail || otevrene.has(o.slug);
    d.addEventListener('toggle', () => (d.open ? otevrene.add(o.slug) : otevrene.delete(o.slug)));
    d.append(el('summary', undefined, 'Zvolení zastupitelé'));
    for (const s of zvoleni) {
      const p = el('p');
      p.append(el('strong', undefined, `${s.nazev}: `), document.createTextNode(s.zvoleni.map((z) => z.jmeno).join(', ')));
      d.append(p);
    }
    k.append(d);
  }
  if (!detail) {
    const vic = el('a', 'karta__vic', 'Detail obce →') as HTMLAnchorElement;
    vic.href = `/volby-2026/${o.slug}/`;
    k.append(vic);
  }
  return k;
}

export const casAktualizace = (iso: string) =>
  new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
