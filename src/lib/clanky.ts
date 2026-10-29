/**
 * Načtení publikovaných článků z Airtable (báze "Rozhledna", tabulka Clanky)
 * pro statický build webu. Nahrazuje `src/data/articles.json` jako zdroj dat
 * podle Kroku 4, bodu 5 akčního plánu.
 *
 * Použití proměnných prostředí (nastavit v administraci hostingu -
 * Netlify/Vercel - jako build-time secrets, NE commitovat do repozitáře):
 *   AIRTABLE_API_KEY   - Personal access token s právy data.records:read na bázi Rozhledna
 *   AIRTABLE_BASE_ID   - appQ1MZxZDfmEBd3v
 *   AIRTABLE_TABLE_NAME - volitelné, výchozí "Clanky"
 *
 * Pokud proměnné nejsou nastavené (např. lokální vývoj bez secrets), web
 * spadne zpátky na ukázková data v `src/data/articles.json` - nikdy nespadne
 * s chybou jen kvůli chybějící konfiguraci Airtable.
 *
 * Na web se dostávají jen záznamy se Stavem "Publikováno" - to je záměrná
 * redakční brzda z Fáze 2, bodu 3 (AI návrh -> Ke schválení -> Schváleno ->
 * teprve Publikováno se objeví na webu).
 */
import taxonomie from '../data/taxonomie.json';
import region from '../data/region.json';
import articlesJsonFallback from '../data/articles.json';

export interface Clanek {
  id: string;
  slug: string;
  stav: string;
  rubrika: string;
  obec: string;
  nadpis: string;
  perex: string;
  autor: string;
  datumPublikace: string;
  casCteniMin: number;
  obrazekAlt?: string;
  /** Fotka z Airtable (pole Obrazek + ObrazekPopis + ObrazekAutor). Bez ní se
   * článek zobrazí bez obrázku – žádné šedé placeholdery. */
  obrazek?: Obrazek;
  telo: string[];
  stitky: string[];
  /** Typ zdroje z pipeline (ZdrojTyp), např. volby-vysledky. */
  zdrojTyp?: string;
  hlavniZprava: boolean;
  /** Ručně připnutý článek – na hlavní stránce hned pod hlavní zprávou. */
  pripnout?: boolean;
  /** AI výběr ilustrační fotky v pipeline (ilustrace_vyber.py, pole
   * Ilustrace): ID záznamu Fotobanky, '-' = bez fotky, '' = výběr podle témat. */
  ilustrace?: string;
  /** PlatiDo (YYYY-MM-DD) – poslední den, kdy je článek aktuální; u pozvánek
   * poslední den akce. Pro kalendář akcí (/akce/). */
  platiDo?: string;
  /** DatumZdroje (YYYY-MM-DD) – u pozvánek často začátek akce. */
  datumZdroje?: string;
  /** Praktické oznámení (pole Sluzba – odstávka elektřiny/vody/plynu, lékař mimo
   * provoz). Takové články jsou na /odstavky/ a /pohotovost/, ne v Nejnovějších. */
  sluzba?: string;
  /** SluzbaOd (YYYY-MM-DD) – první den odstávky / nepřítomnosti lékaře. */
  sluzbaOd?: string;
  souvisejiciClanky: string[];
  ukazkovyObsah?: boolean;
}

export interface Obrazek {
  /** URL přílohy v Airtable – platí jen pár hodin, proto ji web stahuje a
   * zpracovává při buildu (astro:assets), nikdy ji nedává přímo do HTML. */
  url: string;
  sirka: number;
  vyska: number;
  popis: string;
  autor?: string;
  /** Fotka z Fotobanky, ne přímo z článku – na webu s popiskem "Ilustrační foto". */
  ilustracni?: boolean;
}

// Server-only proměnné (build-time), záměrně přes process.env, ne import.meta.env
// (Vite by je bez VITE_ prefixu do klientského bundlu stejně nepustil - tady jde
// navíc o čistě statický web, tenhle kód se vůbec nespouští v prohlížeči).
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'Clanky';

let cache: Promise<Clanek[]> | null = null;

function rubrikaSlugZNazvu(nazev: string | undefined): string | null {
  if (!nazev) return null;
  return taxonomie.rubriky.find((r) => r.nazev === nazev)?.slug ?? null;
}

/** Články za celý mikroregion (např. souhrny voleb) mají v Airtable Obec =
 *  region.mikroregion („Mikroregion Chrudimsko“) a slug 'mikroregion'. */
export const MIKROREGION_SLUG = 'mikroregion';

function obecSlugZNazvu(nazev: string | undefined): string | null {
  if (!nazev) return null;
  if (nazev === region.mikroregion) return MIKROREGION_SLUG;
  return taxonomie.obce.find((o) => o.nazev === nazev)?.slug ?? null;
}

/** Název obce článku pro štítky a drobečkovou navigaci (i pro celý mikroregion). */
export function nazevObceClanku(slug: string): string | undefined {
  if (slug === MIKROREGION_SLUG) return region.mikroregion;
  return taxonomie.obce.find((o) => o.slug === slug)?.nazev;
}

function odhadniCasCteni(telo: string[]): number {
  const pocetSlov = telo.join(' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(pocetSlov / 200));
}

// Pipeline (viz rozhledna-pipeline/pipeline/draft.py) plní pole Autor jako
// "AI návrh (Redakce Rozhledny)" - na publikovaném článku to čtenáři nepatří,
// zobrazit jako standardní "Redakce Rozhledny".
function normalizujAutora(autor: string | undefined): string {
  if (!autor || autor.includes('AI návrh')) return 'Redakce Rozhledny';
  return autor;
}

function obrazekZPoli(f: Record<string, any>): Obrazek | undefined {
  const priloha = Array.isArray(f.Obrazek) ? f.Obrazek.find((p: any) => String(p?.type ?? '').startsWith('image/')) : undefined;
  if (!priloha?.url) return undefined;
  // Velký náhled stačí (max. ~1000 px) a je menší než originál z mobilu.
  const zdroj = priloha.thumbnails?.large ?? priloha;
  return {
    url: String(zdroj.url),
    sirka: Number(zdroj.width || priloha.width || 1200),
    vyska: Number(zdroj.height || priloha.height || 800),
    popis: String(f.ObrazekPopis || f.Nadpis || ''),
    autor: f.ObrazekAutor ? String(f.ObrazekAutor) : undefined,
  };
}

// --- Ilustrační fotky (Airtable tabulka Fotobanka) ---------------------------

interface FotkaBanky {
  /** ID záznamu ve Fotobance (na něj odkazuje pole Ilustrace článku). */
  id: string;
  obrazek: Obrazek;
  obec: string; // slug, nebo '' = obecná fotka
  temata: string[];
  /** Kdo je na fotce (AI kontrola v pipeline – fotobanka_kontrola.py):
   * 'bez lidí' | 'muži' | 'ženy' | 'děti' | 'smíšeně', '' = nezkontrolováno. */
  lide: string;
  /** 'české' | 'neutrální' | 'cizí' – cizí fotky až nakonec. */
  prostredi: string;
}

/** Záznam Fotobanky; u zamítnutých nás zajímá jen ZdrojURL, fotka může chybět. */
type FotkaBankyZaznam = Omit<FotkaBanky, 'obrazek'> & { obrazek?: Obrazek; zdroj: string };

async function nacistFotky(baze: string, vzorec: string): Promise<FotkaBankyZaznam[]> {
  const zaklad = `https://api.airtable.com/v0/${baze}/Fotobanka`;
  const fotky: FotkaBankyZaznam[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ filterByFormula: vzorec, pageSize: '100' });
    if (offset) params.set('offset', offset);
    const resp = await fetch(`${zaklad}?${params}`, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    if (!resp.ok) throw new Error(`Airtable Fotobanka (${baze}) vrátila ${resp.status}: ${await resp.text()}`);
    const data = (await resp.json()) as { records: AirtableRecord[]; offset?: string };
    for (const rec of data.records) {
      const f = rec.fields as Record<string, any>;
      const zdroj = f.ZdrojURL ? String(f.ZdrojURL) : '';
      // Licence CC BY(-SA) vyžadují u fotky uvést autora i licenci.
      const autor = [f.Autor, f.Licence && !/vlastní/i.test(String(f.Licence)) ? f.Licence : ''].filter(Boolean).join(', ');
      const obrazek = obrazekZPoli({ Obrazek: f.Obrazek, ObrazekPopis: f.Popis, ObrazekAutor: autor });
      fotky.push({
        id: rec.id,
        obrazek: obrazek && { ...obrazek, ilustracni: true },
        obec: f.Obec === 'Obecné' ? '' : (obecSlugZNazvu(f.Obec) ?? ''),
        temata: Array.isArray(f.Temata) ? f.Temata.map(String) : [],
        lide: f.Lide ? String(f.Lide) : '',
        prostredi: f.Prostredi ? String(f.Prostredi) : '',
        zdroj,
      });
    }
    offset = data.offset;
  } while (offset);
  return fotky;
}

const SCHVALENE = 'AND({Schvaleno}, NOT({Neschvaleno}))';

/**
 * Schválené fotky vlastní báze + obecné fotky (Obec = Obecné) schválené ve
 * Fotobance druhého regionu (`sdilenaFotobanka` v region.json). Fotky
 * bez konkrétního místa (míč, silnice, volební místnost…) se tak schvalují
 * jen jednou. Sdílená fotka se vynechá, když ji vlastní báze má taky
 * (podle ZdrojURL) – i zamítnutou. Když token na druhou bázi nemá přístup,
 * použijí se jen vlastní fotky.
 */
async function nacistFotobanku(): Promise<FotkaBanky[]> {
  const vlastni = await nacistFotky(AIRTABLE_BASE_ID!, SCHVALENE);
  const sdilenaBaze = (region as { sdilenaFotobanka?: string }).sdilenaFotobanka;
  let sdilene: FotkaBankyZaznam[] = [];
  if (sdilenaBaze && sdilenaBaze !== AIRTABLE_BASE_ID) {
    try {
      const zamitnute = await nacistFotky(AIRTABLE_BASE_ID!, '{Neschvaleno}');
      const zname = new Set([...vlastni, ...zamitnute].map((f) => f.zdroj).filter(Boolean));
      sdilene = (await nacistFotky(sdilenaBaze, `AND(${SCHVALENE}, {Obec} = 'Obecné')`)).filter(
        (f) => f.obrazek && !(f.zdroj && zname.has(f.zdroj)),
      );
      console.log(`[clanky] Sdílené obecné fotky z druhé Fotobanky: ${sdilene.length}`);
    } catch (err) {
      console.warn('[clanky] Sdílenou Fotobanku se nepodařilo načíst, použiji jen vlastní fotky:', err);
    }
  }
  return [...vlastni, ...sdilene].filter((f): f is FotkaBanky & { zdroj: string } => Boolean(f.obrazek));
}

// Podtémata ilustračních fotek (názvy musí sedět s config/ilustrace.json v
// rozhledna-pipeline-v2). Pozná se z nadpisu, perexu a štítků článku; pořadí
// rozhoduje, které se zkusí dřív.
const PODTEMATA: [RegExp, string][] = [
  [/volb|volič|kandid/, 'Volební místnost'],
  [/fotbal/, 'Fotbalový zápas'],
  [/volejbal/, 'Volejbalový zápas'],
  [/florbal/, 'Florbal'],
  [/stolní tenis/, 'Stolní tenis'],
  [/tenis/, 'Tenis'],
  [/běh|běžeck|maraton/, 'Běh'],
  [/cyklo|cyklist/, 'Cyklistika'],
  [/požární (útok|sport)|hasičsk.{0,20}(soutěž|lig)/, 'Hasičská soutěž'],
  [/zásah|požár|hořel|výjezd/, 'Hasičský zásah'],
  [/hasičsk.{0,12}(auto|vůz|technik|zbrojnic)|cistern/, 'Hasičská technika'],
  [/polic|krádež|nehod|vloupán/, 'Policie'],
  // 9. 10. 2026 – témata, ke kterým chyběly fotky (AI výběr je nechal bez fotky).
  [/houb|\bhub\b|mykolog/, 'Houby'],
  [/\bryb(y|a|ami)?\b|kapr/, 'Ryby'],
  [/obchod|prodejn|smíšené zboží|potravin/, 'Obchod'],
  [/halloween|strašideln|dýn/, 'Halloween a dýně'],
  [/svat\S* martin|svatomartin/, 'Svatý Martin'],
  [/přednášk|seminář|cestopis|cestovatel/, 'Přednáška'],
  [/kurz|tvořiv|tvoření|kaligraf|drátkov|workshop/, 'Tvoření a kurzy'],
  [/sbírk|bílá pastelka|diakoni/, 'Sbírka'],
  [/hřbitov|hrobov|dušičk/, 'Hřbitov'],
  [/planetári|hvězd|astronom/, 'Planetárium a hvězdy'],
  [/dobrovoln/, 'Dobrovolníci'],
  [/uzavír|uzavřen|objížď|výluk/, 'Uzavírka'],
  [/zimní údržb|sníh|náledí|posyp/, 'Zimní údržba'],
  [/silnic|vozovk|komunikac|asfalt/, 'Oprava silnice'],
  [/chodník|přechod pro/, 'Chodník'],
  [/autobus|zastávk|jízdní řád/, 'Autobus'],
  [/vlak|železni|nádraž|trať/, 'Vlak'],
  [/parkov/, 'Parkování'],
  [/odstávka vody|vodovod|kanalizac|pitn|vodné|stočné|čistírn/, 'Voda a kanalizace'],
  [/elektř|přerušení dodávky|egd|čez/, 'Odstávka elektřiny'],
  [/odpad|popelnic|svoz|kontejner|sběrn/, 'Odpady'],
  [/rozpoč|financ|závěrečný účet|úvěr/, 'Rozpočet a finance'],
  [/dotac|grant/, 'Dotace'],
  [/územn/, 'Územní plán'],
  [/osvětlení|lamp/, 'Veřejné osvětlení'],
  [/stavb|rekonstruk|výstavb|oprav/, 'Stavba a rekonstrukce'],
  [/pozem|pronáj|pacht|nemovit|aukc|prodej/, 'Pozemky a nemovitosti'],
  [/zasedání|zastupitel/, 'Zasedání zastupitelstva'],
  [/lékař|ordinac|zdravot|očkov|nemocn|záchran/, 'Zdraví'],
  [/mateřsk|školk/, 'Školka'],
  [/škol|žák|výuk/, 'Výuka'],
  [/knihovn|knih|beseda|čtení/, 'Knihovna'],
  [/pouť|kolotoč/, 'Pouť'],
  [/mikuláš|čert|rozsvícení/, 'Mikuláš'],
  [/advent|vánoc|vánoční|jarmark/, 'Advent a Vánoce'],
  [/masopust|maškar/, 'Masopust'],
  [/koncert|kapel|hudb|zpěv|pěveck|sborov/, 'Koncert'],
  [/divadl|představení|loutk/, 'Divadlo'],
  [/výstav|muze|galeri|vernisáž/, 'Výstava'],
  [/ples|taneční|zábav/, 'Ples'],
  [/senior|důchod/, 'Senioři'],
  [/dět/, 'Akce pro děti'],
  [/počas|bouř|povod|vichřic|mráz|vedr|meteo|výstrah/, 'Počasí'],
  [/rybník|výlov|rybář/, 'Rybník'],
  [/strom|zeleň|alej|výsadb|kácen|\bpark\b/, 'Stromy a zeleň'],
  [/\bles|lesní|kůrov|těžb|dřev/, 'Les'],
];

/** Témata Fotobanky, která se k článku hodí, od nejvhodnějšího: nejdřív
 * konkrétní podtémata (svoz odpadu → popelnice), pak hlavní témata. */
function podtemataClanku(c: Clanek): string[] {
  const podle = (text: string) => PODTEMATA.filter(([re]) => re.test(text.toLowerCase())).map(([, tema]) => tema);
  // Přednost má téma z nadpisu (zájezd do divadla vlakem → divadlo, ne vlak),
  // pak z perexu a štítků.
  const t = [...new Set([...podle(c.nadpis), ...podle(`${c.perex} ${c.stitky.join(' ')}`)])];
  // Nadpis a perex nic konkrétního neprozradí → zkusit začátek textu.
  return t.length ? t : podle(c.telo.slice(0, 2).join(' '));
}

function temataClanku(c: Clanek): string[] {
  const text = `${c.nadpis} ${c.perex} ${c.stitky.join(' ')}`.toLowerCase();
  const t: string[] = podtemataClanku(c);
  const kdyz = (re: RegExp, tema: string) => { if (re.test(text)) t.push(tema); };
  kdyz(/fotbal/, 'Fotbal');
  kdyz(/volejbal/, 'Volejbal');
  kdyz(/hasič|požár/, 'Hasiči');
  kdyz(/volb|kandid|volič/, 'Volby');
  kdyz(/škol|žák/, 'Škola');
  kdyz(/uzavír|uzavřen|silnic|objížď|doprav|autobus/, 'Doprava a silnice');
  kdyz(/zastupitel|úřad|rozpoč|vyhlášk|aukc|pozem|pacht/, 'Úřad a zastupitelstvo');
  kdyz(/les|příro|rybník|hub/, 'Příroda');
  const podleRubriky: Record<string, string[]> = {
    sport: ['Sport obecně'],
    doprava: ['Doprava a silnice'],
    'verejna-sprava': ['Úřad a zastupitelstvo'],
    bezpecnost: ['Hasiči'],
    kultura: ['Kultura a akce'],
  };
  return [...new Set([...t, ...(podleRubriky[c.rubrika] ?? [])])];
}

// Záložní témata jen pro fotky konkrétní obce (náves, zámek, okolí) – obecná
// fotka "nějaké vesnice" nebo "nějakého lesa" by u článku jinak mátla.
// Příroda (krajina, rezervace) jen u článků, kde téma Příroda vyšlo z textu.
const ZALOZNI_TEMATA_OBCE = ['Obec obecně', 'Památky'];

/** Koho se článek týká – aby k článku o mužském volejbalu nešla fotka žen. */
function lideClanku(c: Clanek): 'muži' | 'ženy' | 'děti' | 'smíšeně' | '' {
  const text = `${c.nadpis} ${c.perex} ${c.telo.slice(0, 2).join(' ')}`.toLowerCase();
  const zeny = /(?<!\p{L})žen(y|ám|ách|sk)|dívk|hráčk|volejbalistk|fotbalistk|florbalistk|házenkářk|sportovkyn|tenistk|běžkyn/u.test(text);
  const muzi = /(?<!\p{L})muž(i|ů|sk)|(?<!\p{L})páni(?!\p{L})|volejbalist[éaůy]|fotbalist[éaůy]|florbalist[éaůy]|hokejist|házenkář[iů]|tenist[éaů]|běžc[iů]/u.test(text);
  const deti = /(?<!\p{L})dět[ií]|žác|žák|dorost|mládež|přípravk|školák|školáci/u.test(text);
  if (deti && !muzi && !zeny) return 'děti';
  if (muzi && zeny) return 'smíšeně';
  if (zeny) return 'ženy';
  if (muzi) return 'muži';
  return '';
}

/** Hodí se fotka k článku podle toho, kdo je na ní? Nezkontrolované fotky
 * (lide '') a fotky bez lidí se hodí vždy. */
function sediLide(f: FotkaBanky, c: Clanek, kdo: ReturnType<typeof lideClanku>): boolean {
  if (!f.lide || f.lide === 'bez lidí') return true;
  if (kdo === 'ženy') return f.lide === 'ženy';
  if (kdo === 'muži') return f.lide === 'muži';
  if (kdo === 'děti') return f.lide === 'děti' || f.lide === 'smíšeně';
  if (kdo === 'smíšeně') return true;
  // U sportu bez upřesnění raději fotka bez lidí nebo smíšená (nikdy nesedí špatně).
  return c.rubrika !== 'sport' || f.lide === 'smíšeně';
}

/** Kolik sousedních článků (podle data) nesmí mít stejnou ilustrační fotku. */
const OKNO_BEZ_OPAKOVANI = 12;

function hash(text: string): number {
  let h = 0;
  for (const z of text) h = (h * 31 + z.charCodeAt(0)) >>> 0;
  return h;
}

/** Rozdá ilustrační fotky článkům bez vlastní fotky. Články se procházejí od
 * nejstaršího, takže starší článek si fotku drží i po přidání nových.
 *
 * Přednost má fotka k tématu článku před fotkou obce (zájezd do divadla →
 * divadlo, ne krajina kolem obce). Pořadí pokusů:
 *  1. konkrétní podtéma (Divadlo, Uzavírka…) – fotka obce i obecná;
 *  2. totéž podtéma i s fotkou použitou nedávno – u konkrétního tématu je
 *     opakovaná fotka lepší než nesouvisející;
 *  3. hlavní témata podle textu a rubriky (Kultura a akce, Doprava…);
 *  4. záložní fotky obce (náves, památky) – jen když článek nemá žádné
 *     konkrétní podtéma; jinak raději bez fotky.
 * V rámci kroku se fotky obce a obecné míchají: přednost má fotka, která se
 * zatím použila nejméně; při shodě fotka z obce. Fotka z posledních
 * OKNO_BEZ_OPAKOVANI článků se (kromě kroku 2) přeskočí. Bazárek fotky
 * nedostává. Před tím vším má přednost volba AI z pole Ilustrace (pipeline
 * ilustrace_vyber.py, 8. 10. 2026); '-' = bez fotky. */
function rozdejIlustrace(clanky: Clanek[], banka: FotkaBanky[]): void {
  const pouziti = new Map<string, number>();
  const posledni: string[] = [];
  const poradi = [...clanky].sort((a, b) => a.datumPublikace.localeCompare(b.datumPublikace));
  for (const c of poradi) {
    if (c.obrazek || c.rubrika === 'bazarek') continue;
    // Volba AI (pipeline vidí popis i obsah fotky) má přednost před
    // výběrem podle slov; '-' = žádná fotka nesedí.
    if (c.ilustrace?.startsWith('-')) continue; // '-' / '--' (ani po návrzích fotek)
    const zAi = c.ilustrace ? banka.find((f) => f.id === c.ilustrace) : undefined;
    if (zAi) {
      c.obrazek = zAi.obrazek;
      pouziti.set(zAi.obrazek.url, (pouziti.get(zAi.obrazek.url) ?? 0) + 1);
      posledni.push(zAi.obrazek.url);
      if (posledni.length > OKNO_BEZ_OPAKOVANI) posledni.shift();
      continue;
    }
    const temata = temataClanku(c);
    const podtemata = new Set(podtemataClanku(c));
    const vlastni = new Set(temata);
    const kdo = lideClanku(c);

    const vyber = (tema: string, sOpakovanim: boolean): FotkaBanky | undefined => {
      const kandidati = banka.filter(
        (f) =>
          f.temata.includes(tema) &&
          ((c.obec && f.obec === c.obec) || (f.obec === '' && vlastni.has(tema))) &&
          (sOpakovanim || !posledni.includes(f.obrazek.url)) &&
          sediLide(f, c, kdo),
      );
      if (!kandidati.length) return undefined;
      // Cizí prostředí (americký sport, cizí nápisy) až nakonec, pak nejméně
      // použitá (s opakováním: ta, která byla použita nejdávněji), pak fotka obce.
      const klic = (f: FotkaBanky) => [
        f.prostredi === 'cizí' ? 1 : 0,
        sOpakovanim ? posledni.indexOf(f.obrazek.url) : 0,
        pouziti.get(f.obrazek.url) ?? 0,
        f.obec ? 0 : 1,
        hash(c.slug + f.obrazek.url),
      ];
      kandidati.sort((x, y) => {
        const [a, b] = [klic(x), klic(y)];
        return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3] || a[4] - b[4];
      });
      return kandidati[0];
    };

    const konkretni = temata.filter((t) => podtemata.has(t));
    const ostatni = temata.filter((t) => !podtemata.has(t));
    const zalozni = konkretni.length ? [] : ZALOZNI_TEMATA_OBCE.filter((z) => !vlastni.has(z));
    let vybrana: FotkaBanky | undefined;
    for (const [seznam, sOpakovanim] of [
      [konkretni, false],
      [konkretni, true],
      [ostatni, false],
      [zalozni, false],
    ] as [string[], boolean][]) {
      for (const tema of seznam) {
        vybrana = vyber(tema, sOpakovanim);
        if (vybrana) break;
      }
      if (vybrana) break;
    }
    if (!vybrana) continue;
    c.obrazek = vybrana.obrazek;
    pouziti.set(vybrana.obrazek.url, (pouziti.get(vybrana.obrazek.url) ?? 0) + 1);
    posledni.push(vybrana.obrazek.url);
    if (posledni.length > OKNO_BEZ_OPAKOVANI) posledni.shift();
  }
}

interface AirtableRecord {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
}

async function nacistVsechnyZaznamy(): Promise<AirtableRecord[]> {
  const zaklad = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;
  // PlatiDo = poslední den, kdy je článek aktuální (akce, uzavírka…); den poté
  // ho web přestane ukazovat i bez běhu pipeline (ta ho přepne na Neaktuální).
  const filtr = encodeURIComponent(
    "AND({Stav}='Publikováno', OR(NOT({PlatiDo}), NOT(IS_BEFORE({PlatiDo}, TODAY()))))",
  );
  const zaznamy: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = `${zaklad}?filterByFormula=${filtr}&pageSize=100${offset ? `&offset=${offset}` : ''}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    if (!resp.ok) {
      throw new Error(`Airtable API vrátila ${resp.status}: ${await resp.text()}`);
    }
    const data = (await resp.json()) as { records: AirtableRecord[]; offset?: string };
    zaznamy.push(...data.records);
    offset = data.offset;
  } while (offset);

  return zaznamy;
}

/** Datum zveřejnění článku. DatumZdroje u pozvánek bývá datum akce (třeba
 * v prosinci) – takový článek by se řadil jako nejnovější a ruční hlavní
 * zpráva by nahoře vydržela až do akce (21. 10. 2026). Budoucí DatumZdroje
 * proto nahradí čas publikování (Publikovano), jinak vznik záznamu. */
function datumZverejneni(f: Record<string, any>, createdTime: string): string {
  if (f.DatumPublikace) return String(f.DatumPublikace);
  const dnes = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
  if (f.DatumZdroje && String(f.DatumZdroje).slice(0, 10) <= dnes) return String(f.DatumZdroje);
  return String(f.Publikovano || createdTime).slice(0, 10);
}

async function nacistZAirtable(): Promise<Clanek[]> {
  const zaznamy = await nacistVsechnyZaznamy();

  const clanky: Clanek[] = [];
  for (const rec of zaznamy) {
    const f = rec.fields as Record<string, any>;
    const rubrikaSlug = rubrikaSlugZNazvu(f.Rubrika);
    const obecSlug = obecSlugZNazvu(f.Obec);

    if (!rubrikaSlug || !obecSlug || !f.Slug || !f.Nadpis) {
      console.warn(
        `[clanky] Přeskakuji Airtable záznam ${rec.id} ("${f.Nadpis ?? '?'}") - chybí Slug/Nadpis, nebo Rubrika ("${f.Rubrika}")/Obec ("${f.Obec}") neodpovídá taxonomii. Zkontroluj záznam v Airtable před publikací.`,
      );
      continue;
    }

    const telo = String(f.Telo || '')
      .split(/\n\s*\n/)
      .map((s: string) => s.trim())
      .filter(Boolean);

    clanky.push({
      id: rec.id,
      slug: String(f.Slug),
      stav: String(f.Stav ?? ''),
      rubrika: rubrikaSlug,
      obec: obecSlug,
      nadpis: String(f.Nadpis),
      perex: String(f.Perex ?? ''),
      autor: normalizujAutora(f.Autor),
      datumPublikace: datumZverejneni(f, rec.createdTime),
      casCteniMin: odhadniCasCteni(telo),
      obrazekAlt: undefined,
      obrazek: obrazekZPoli(f),
      telo,
      stitky: String(f.Stitky || '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean),
      zdrojTyp: f.ZdrojTyp ? String(f.ZdrojTyp) : '',
      hlavniZprava: Boolean(f.HlavniZprava),
      pripnout: Boolean(f.Pripnout),
      ilustrace: f.Ilustrace ? String(f.Ilustrace).trim() : '',
      platiDo: f.PlatiDo ? String(f.PlatiDo).slice(0, 10) : undefined,
      datumZdroje: f.DatumZdroje ? String(f.DatumZdroje).slice(0, 10) : undefined,
      sluzba: f.Sluzba ? String(f.Sluzba) : undefined,
      sluzbaOd: f.SluzbaOd ? String(f.SluzbaOd).slice(0, 10) : undefined,
      souvisejiciClanky: [],
      ukazkovyObsah: false,
    });
  }

  let banka: FotkaBanky[] = [];
  try {
    banka = await nacistFotobanku();
  } catch (err) {
    console.warn('[clanky] Fotobanku se nepodařilo načíst, články bez fotky zůstanou bez obrázku:', err);
  }
  rozdejIlustrace(clanky, banka);

  // Fotku astro:assets stahuje až při generování stránek a chyba stažení by
  // shodila celý build. Proto se tu každá ověří předem a nedostupná se jen
  // vynechá (článek se zobrazí bez fotky).
  await Promise.all(
    clanky
      .filter((c) => c.obrazek)
      .map(async (c) => {
        try {
          const resp = await fetch(c.obrazek!.url, { method: 'HEAD' });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        } catch (err) {
          console.warn(`[clanky] Fotku k "${c.nadpis}" se nepodařilo stáhnout (${err}) - článek bude bez fotky.`);
          c.obrazek = undefined;
        }
      }),
  );

  // Nejnovější nahoře.
  clanky.sort((a, b) => (a.datumPublikace < b.datumPublikace ? 1 : -1));
  // Dva články se stejným slugem (stejná akce z víc zdrojů) by měly jednu
  // adresu, ale výpis a stránka článku by ukázaly každý jiný – nechá se
  // jen novější (pipeline nové duplicity ukládá jako Neschváleno).
  const videneSlugy = new Set<string>();
  for (let i = 0; i < clanky.length; i++) {
    if (videneSlugy.has(clanky[i].slug)) {
      console.warn(`[clanky] Duplicitní slug "${clanky[i].slug}" – starší článek vynechán.`);
      clanky.splice(i--, 1);
    } else {
      videneSlugy.add(clanky[i].slug);
    }
  }

  // Související články: stejná obec, jiný slug, max 3 nejnovější. Airtable
  // zatím nemá pole pro ruční výběr souvisejících článků - dopočítá se tady.
  for (const c of clanky) {
    c.souvisejiciClanky = clanky
      .filter((jiny) => jiny.obec === c.obec && jiny.slug !== c.slug)
      .slice(0, 3)
      .map((jiny) => jiny.slug);
  }

  return clanky;
}

/**
 * Vrátí publikované články - z Airtable, nebo z lokálních ukázkových dat,
 * pokud Airtable není nakonfigurovaná nebo načtení selže. Výsledek je v
 * rámci jednoho buildu cachovaný (zavolá se jen jednou bez ohledu na to,
 * kolik stránek si o data řekne).
 */
export function getClanky(): Promise<Clanek[]> {
  if (cache) return cache;

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn(
      '[clanky] AIRTABLE_API_KEY/AIRTABLE_BASE_ID nejsou nastavené (build-time proměnné prostředí) - používám ukázková data z src/data/articles.json. Pro živý obsah nastav proměnné v administraci hostingu, viz README.',
    );
    cache = Promise.resolve(articlesJsonFallback as Clanek[]);
    return cache;
  }

  cache = nacistZAirtable().catch((err) => {
    console.error(
      '[clanky] Nepodařilo se načíst články z Airtable, build pokračuje s ukázkovými daty jako záchrannou variantou:',
      err,
    );
    return articlesJsonFallback as Clanek[];
  });
  return cache;
}

// Rubriky, které se hodí na hlavní zprávu, když ji redakce nevybrala ručně –
// věci, které se týkají hodně lidí (úřad, silnice, bezpečnost). Sport, kultura
// a bazárek jdou nahoru jen ručně zaškrtnutým polem HlavniZprava.
const RUBRIKY_PRO_HLAVNI_ZPRAVU = ['verejna-sprava', 'doprava', 'bezpecnost'];
// Ručně připnutý článek (Pripnout) vydrží pod hlavní zprávou nejvýš tolik dní.
const RUCNI_HLAVNI_ZPRAVA_DNU = 7;
// Ručně vybraná hlavní zpráva (HlavniZprava) vydrží nahoře jen v den článku
// a den poté (kalendářní dny v Praze; 19. 10. 2026, přání Lukáše), pak ji
// vystřídá automatický výběr – zaškrtnutí se v Airtable rušit nemusí.
const RUCNI_HLAVNI_ZPRAVA_KAL_DNU = 1;

function kalendarnichDniOd(clanek: Clanek, dnes: Date): number {
  const dnesPraha = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(dnes);
  return (Date.parse(dnesPraha) - Date.parse(clanek.datumPublikace.slice(0, 10))) / 86_400_000;
}

/** Pořadí pod hlavní zprávou: nejdřív ručně připnuté články (Pripnout ✔,
 * nejdéle RUCNI_HLAVNI_ZPRAVA_DNU dní staré), pak ostatní od nejnovějšího. */
export function pripnuteNahoru(clanky: Clanek[], dnes: Date = new Date()): Clanek[] {
  const pripnute = clanky.filter((c) => c.pripnout && staryDni(c, dnes) <= RUCNI_HLAVNI_ZPRAVA_DNU);
  return [...pripnute, ...clanky.filter((c) => !pripnute.includes(c))];
}
// Automatický výběr bere z preferovaných rubrik jen dost čerstvé články;
// starší důležitá zpráva nemá přebít novější článek z jiné rubriky.
const AUTOMATICKA_HLAVNI_ZPRAVA_DNU = 3;

function staryDni(clanek: Clanek, dnes: Date): number {
  return (dnes.getTime() - new Date(clanek.datumPublikace).getTime()) / 86_400_000;
}

// Automaticky vybraná hlavní zpráva se během dne střídá (19. 10. 2026, přání
// Lukáše): web se přestavuje 3× denně (10:17, 15:17, 20:17 Praha) a každá
// přestavba vezme jiný z nejvýš 3 nejlepších kandidátů.
const STRIDANI_HLAVNI_ZPRAVY = 3;

/** Část dne v Praze při buildu: 0 = dopoledne, 1 = odpoledne, 2 = večer. */
function castDne(dnes: Date): number {
  const hodina = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/Prague' }).format(dnes),
  );
  return hodina < 12 ? 0 : hodina < 17 ? 1 : 2;
}

/**
 * Vybere hlavní zprávu na homepage z publikovaných článků seřazených od
 * nejnovějšího:
 *   1. články se zaškrtnutým HlavniZprava – v den článku a den poté (když jich
 *      je víc, střídají se až 3 nejnovější podle části dne),
 *   2. jinak se střídají (podle části dne) až 3 nejlepší kandidáti v pořadí:
 *      veřejná správa/doprava/bezpečnost z posledních 3 dnů (nejdřív s vlastní
 *      fotkou), pak čerstvá kultura a další rubriky, pak sport, pak prostě
 *      nejnovější článek.
 * Volební články (ZdrojTyp volby-*, štítek s „volby“) a bazárek automaticky
 * nahoru nejdou.
 */
export function vyberHlavniZpravu(clanky: Clanek[], dnes: Date = new Date()): Clanek | undefined {
  // Víc ručně vybraných hlavních zpráv se střídá stejně jako automatické.
  const rucne = clanky
    .filter((c) => c.hlavniZprava && kalendarnichDniOd(c, dnes) <= RUCNI_HLAVNI_ZPRAVA_KAL_DNU)
    .slice(0, STRIDANI_HLAVNI_ZPRAVY);
  if (rucne.length) return rucne[castDne(dnes) % rucne.length];

  // Volební články (výsledky, povolební) už nejsou aktuální jako hlavní zpráva
  // (17. 10. 2026) – nahoru jdou jen ručním zaškrtnutím HlavniZprava.
  const bezVoleb = clanky.filter(
    (c) => !c.zdrojTyp?.startsWith('volby') && !c.stitky.some((s) => /volb/i.test(s)) && c.rubrika !== 'bazarek',
  );
  const cerstve = bezVoleb.filter((c) => staryDni(c, dnes) <= AUTOMATICKA_HLAVNI_ZPRAVA_DNU);
  const vlastniFotka = (c: Clanek) => Boolean(c.obrazek && !c.obrazek.ilustracni);
  const dulezite = cerstve.filter((c) => RUBRIKY_PRO_HLAVNI_ZPRAVU.includes(c.rubrika));
  const poradi = [
    ...dulezite.filter(vlastniFotka),
    ...dulezite.filter((c) => !vlastniFotka(c)),
    ...cerstve.filter((c) => !RUBRIKY_PRO_HLAVNI_ZPRAVU.includes(c.rubrika) && c.rubrika !== 'sport'),
    ...cerstve.filter((c) => c.rubrika === 'sport'),
    ...bezVoleb,
  ];
  const nejlepsi = [...new Set(poradi)].slice(0, STRIDANI_HLAVNI_ZPRAVY);
  if (!nejlepsi.length) return clanky[0];
  return nejlepsi[castDne(dnes) % nejlepsi.length];
}
