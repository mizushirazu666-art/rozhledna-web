// Vykreslení živých výsledků voleb v prohlížeči (stránky /volby-2026/ a
// /volby-2026/<obec>/). Data z /api/volby (api/volby.js).

export type Strana = {
  cislo: number; nazev: string; plnyNazev: string; hlasy: number; procent: number;
  mandaty: number | null; zvoleni: { jmeno: string; hlasy: number | null }[];
};
export type Obec = {
  slug: string; nazev: string; obyvatel?: number; dostupne: boolean; konecne: boolean; mandatu: number | null;
  okrskyCelkem: number | null; okrskyZpracovano: number | null; zpracovanoProcent: number | null;
  ucastProcent: number | null; volicu?: number | null; strany: Strana[];
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
export function karta(o: Obec, otevrene: Set<string>, detail = false, priZmeneMoje?: () => void) {
  const moje = mojeObec() === o.slug;
  const k = el('article', moje ? 'karta karta--moje' : 'karta');
  const hlava = el('div', 'karta__hlava');
  const odkaz = el(detail ? 'span' : 'a', 'karta__nazev', o.nazev) as HTMLAnchorElement;
  if (!detail) odkaz.href = `/volby-2026/${o.slug}/`;
  const prava = el('div', 'karta__prava');
  prava.append(stitek(o));
  if (priZmeneMoje) {
    const hvezda = el('button', 'karta__moje', moje ? '★ Moje obec' : '☆ Moje obec') as HTMLButtonElement;
    hvezda.type = 'button';
    hvezda.title = moje ? 'Přestat sledovat' : 'Sledovat – obec bude vždy nahoře';
    hvezda.setAttribute('aria-pressed', String(moje));
    hvezda.addEventListener('click', () => { nastavMojeObec(moje ? '' : o.slug); priZmeneMoje(); });
    prava.append(hvezda);
  }
  hlava.append(odkaz, prava);
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
  const pata = el('div', 'karta__pata');
  if (!detail) {
    const vic = el('a', 'karta__vic', 'Detail obce →') as HTMLAnchorElement;
    vic.href = `/volby-2026/${o.slug}/`;
    pata.append(vic);
  }
  pata.append(sdileni(o));
  k.append(pata);
  return k;
}

/** Souhrnná čísla nad seznamem obcí. Účast se počítá jen z obcí, kde ji ČSÚ
 * už uvádí (vážená počtem voličů, když je známý). */
export function souhrn(data: Obec[]) {
  const konec = data.filter((o) => o.konecne).length;
  const prubeh = data.filter((o) => !o.konecne && sectenoHlasu(o)).length;
  const sUcasti = data.filter((o) => o.ucastProcent !== null && o.ucastProcent > 0 && o.ucastProcent <= 100);
  const vahy = sUcasti.map((o) => (o.volicu && o.volicu > 0 ? o.volicu : 1));
  const soucetVah = vahy.reduce((a, b) => a + b, 0);
  const ucast = soucetVah ? sUcasti.reduce((a, o, i) => a + (o.ucastProcent as number) * vahy[i], 0) / soucetVah : null;
  const nejvyssi = sUcasti.slice().sort((a, b) => (b.ucastProcent as number) - (a.ucastProcent as number))[0];
  const box = el('div', 'souhrn');
  const dlazdice = (cislo: string, popis: string) => {
    const d = el('div', 'souhrn__dlazdice');
    d.append(el('strong', 'souhrn__cislo', cislo), el('span', 'souhrn__popis', popis));
    return d;
  };
  box.append(dlazdice(`${konec} z ${data.length}`, 'obcí má konečné výsledky'));
  box.append(dlazdice(String(prubeh), 'obcí se právě sčítá'));
  if (ucast !== null) box.append(dlazdice(`${cz(ucast, 1)} %`, `účast v ${sUcasti.length === data.length ? 'regionu' : `${sUcasti.length} sečtených obcích`}`));
  if (nejvyssi) box.append(dlazdice(`${cz(nejvyssi.ucastProcent as number, 1)} %`, `nejvyšší účast – ${nejvyssi.nazev}`));
  return box;
}

// „Moje obec“ – zapamatovaná v prohlížeči (jen pohodlí; když úložiště
// nejde, prostě se nepamatuje).
const KLIC_MOJE = 'rozhledna-volby-moje-obec';
export function mojeObec(): string {
  try { return localStorage.getItem(KLIC_MOJE) || ''; } catch { return ''; }
}
export function nastavMojeObec(slug: string) {
  try { slug ? localStorage.setItem(KLIC_MOJE, slug) : localStorage.removeItem(KLIC_MOJE); } catch { /* nic */ }
}

/** Tlačítko „Sdílet výsledky“: na mobilu nabídka sdílení telefonu, jinak
 * Facebook + zkopírování odkazu. */
export function sdileni(o: Obec) {
  const url = new URL(`/volby-2026/${o.slug}/`, location.origin).href;
  const titulek = `Výsledky voleb 2026: ${o.nazev}`;
  const obal = el('div', 'sdileni');
  const hlavni = el('button', 'sdileni__tlacitko', 'Sdílet výsledky obce') as HTMLButtonElement;
  hlavni.type = 'button';
  const fb = el('a', 'sdileni__odkaz', 'Facebook') as HTMLAnchorElement;
  fb.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  fb.target = '_blank';
  fb.rel = 'noopener';
  const kopirovat = el('button', 'sdileni__odkaz', 'Kopírovat odkaz') as HTMLButtonElement;
  kopirovat.type = 'button';
  kopirovat.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      kopirovat.textContent = 'Zkopírováno ✓';
    } catch {
      prompt('Odkaz na výsledky:', url);
    }
  });
  hlavni.addEventListener('click', async () => {
    if (navigator.share) {
      try { await navigator.share({ title: titulek, url }); return; } catch { /* zrušeno */ }
    }
    obal.classList.toggle('sdileni--otevrene');
  });
  obal.append(hlavni, fb, kopirovat);
  return obal;
}

export const casAktualizace = (iso: string) =>
  new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
