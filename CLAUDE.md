# Rozhledna – web (CLAUDE.md)

Statický web rozhledna-chrudimsko.cz (Astro 7) pro obce Chrudimska. Obsah
čte z Airtable **jen při buildu**; plní ho pipeline v repozitáři
`mizushirazu666-art/rozhledna-pipeline-v2` – tam je v CLAUDE.md popis
celého projektu, Airtable tabulek (ID polí), zdrojů a pravidel spolupráce.
Komunikace s Lukášem (redaktor/majitel) česky; kód, komentáře a commity
česky.

## Nasazení

- Vercel projekt `rozhledna-chrudimsko` (`prj_hWKinbqAXFyDvmQfgS39TzvM5wHL`,
  team slug `rozhledna`; do 7. 10. 2026 se jmenoval `rozhledna-web`).
  Push na `main` = automatický produkční deploy. Push na main je povolený,
  PR jen na přání.
- Ruční přestavění (např. po schválení fotek/článků v Airtable): Vercel
  create_deployment s `gitSource {type: github, org: mizushirazu666-art,
  repo: rozhledna-web, ref: main}`, `target: production`, `forceNew: 1`.
  Pipeline po každém denním běhu volá Deploy Hook.
- Env (jen na Vercelu, nedešifrovat): AIRTABLE_API_KEY (jen čtení),
  AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME, AIRTABLE_FOTKY_API_KEY (zápis, jen
  formulář fotek). Bez nich build použije ukázková data v `src/data`.
- Build: `npm install && npx astro build`. Repozitář nemá `.gitignore` –
  `node_modules`, `dist`, `.astro` necommitovat.

## Struktura

- `src/lib/clanky.ts` – načtení článků (`{Stav}='Publikováno'`), převod
  fotek (`obrazekZPoli`, HEAD kontrola dostupnosti – nedostupná fotka se
  vynechá, aby nespadl build), `vyberHlavniZpravu` (ruční HlavniZprava
  ≤ 7 dní, jinak veřejná správa/doprava/bezpečnost ≤ 3 dny s fotkou, jinak
  nejnovější) a `pripnuteNahoru` (Airtable Pripnout ✔ ≤ 7 dní = na hlavní
  stránce hned pod hlavní zprávou, 8. 10. 2026) a ilustrační fotky z Fotobanky:
  - `nacistFotobanku` – filtr `AND({Schvaleno}, NOT({Neschvaleno}))`;
    u licencí kromě „vlastní“ se licence připojí k autorovi. Navíc obecné
    fotky (Obec = Obecné) schválené ve Fotobance druhého regionu
    (`sdilenaFotobanka` v region.json – Chrudimsko ↔ Hlinecko), kromě těch,
    které vlastní báze má (i zamítnuté) podle ZdrojURL. Token
    AIRTABLE_API_KEY musí mít čtení obou bází, jinak se sdílené vynechají
    (Hlinecko dostalo přístup k bázi Chrudimska 8. 10. 2026 – do té doby
    na Hlinecku žádné obecné fotky).
  - `PODTEMATA` – regexy podtémat (názvy musí sedět s
    `config/ilustrace.json` v pipeline), `temataClanku` = podtémata, pak
    hlavní témata, pak podle rubriky.
  - Pole **Ilustrace** článku (AI výběr v pipeline `ilustrace_vyber.py`,
    8. 10. 2026) má přednost: ID fotky z Fotobanky, „-“ = bez fotky; prázdné
    = výběr podle témat níže.
  - `rozdejIlustrace` – články od nejstaršího; pořadí (8. 10. 2026, přání
    Lukáše – téma před krajinou obce): 1) konkrétní podtéma (Divadlo,
    Fotbalový zápas…; přednost má podtéma z nadpisu, pak perex/štítky,
    jinak začátek textu) – fotka obce i obecná, 2) totéž podtéma i s nedávno použitou
    fotkou, 3) hlavní témata (text + rubrika), 4) záložní fotky obce (Obec
    obecně, Památky) jen u článků bez konkrétního podtématu – jinak raději
    bez fotky; Příroda jen u článků o přírodě. V kroku se míchají fotky obce
    a obecné, přednost nejméně použitá (při shodě z obce); mimo krok 2 se
    fotka neopakuje v `OKNO_BEZ_OPAKOVANI` (12) sousedních článcích.
    Obecné fotky jen k vlastním tématům článku. Bazárek fotky nedostává.
  - Kdo je na fotce (pole Lide – vyplní AI v pipeline, `fotobanka_kontrola.py`):
    `lideClanku` pozná z textu článek o ženách/mužích/dětech, `sediLide` pak
    nepustí fotku žen k mužům (a naopak); u sportu bez upřesnění jen fotky
    bez lidí nebo smíšené. Prostredi „cizí“ (americký sport, cizí nápisy)
    má nejnižší přednost.
- `src/lib/sport.ts`, `src/components/SportPrehled.astro` – zápasy a
  tabulky z Airtable (Zapasy, Tabulky); „doma“ = `VObci`
  (`Boolean(f.VObci)` – Airtable nevyplněné checkboxy vynechává).
- `src/lib/hlaseni.ts`, `src/components/HlaseniIzs.astro` – „Bezpečnost
  v okolí“: krátká hlášení z Airtable tabulky Hlaseni (bez schvalování,
  `Skryto` = nezobrazit, za posledních 30 dní) – Typ „Výjezd“ (výjezdy
  hasičů v okolí Chrudimi, `scrapers/izs.py`) a „Zpráva“ (nadpis + odkaz na
  zprávu policie/hasičů/Chrudimského deníku, `scrapers/bezpecnost.py`).
  Obec je vyplněná jen u našich obcí (zelená tečka), Lokalita u všech.
  `kompakt` = podbarvený sloupec vedle „Nejnovější z okolí“ na hlavní stránce
  (nadpis na úrovni nadpisu článků, max. 7 za týden); plný seznam v rubrice
  Bezpečnost (nad články) a na stránce obce (jen její hlášení). Každé
  hlášení má stránku `/hlaseni/<slug>/` (`src/pages/hlaseni/[slug].astro`,
  slug z HlaseniId) s krátkým článkem z pole Text a odkazem na zdroj.
- `src/lib/odkazy.ts` – v poli Telo se zápis `[text](adresa)` vykreslí jako
  odkaz (jen `/…` a http(s)); použito např. v článku „Volební víkend“.
- `src/lib/bloky.ts` + `src/components/MapaHodnoty.astro` (8. 10. 2026, přání
  Lukáše – výčty ne jako dlouhá věta): odstavec v Telo, jehož řádky jsou
  `| a | b |`, je tabulka (1. řádek záhlaví); s řádkem `[mapa]` nad ní navíc
  mapka obcí regionu s hodnotou u obce (1. sloupec = název obce přesně jako
  v mapa-regionu.json, 2. = hodnota, sytost barvy podle čísla), tabulka pak
  sbalená pod mapkou.
- `src/components/FacebookOdkaz.astro` (8. 10. 2026) – „Sledujte Rozhlednu na
  Facebooku“ (region.json `facebook`): blok pod článkem a na hlavní stránce,
  odkaz v patičce. Lukáš nemá osobní FB profil (nemůže zvát přátele).
- Volby živě (9. 10. 2026): `src/pages/volby-2026.astro` + `api/volby.js`
  (Vercel funkce: pro obce regionu stáhne z volby.gov.cz `vysled` a
  `ucast/obec` JSON, cache 60 s; prohlížeč obnovuje každou minutu). Obce a
  kódy ČSÚ jsou přímo v `api/volby.js` (z pipeline obce.json). Upoutávka
  `VolbyZive.astro` na hlavní stránce se ukáže jen 10. 10. 13:30 – 11. 10.
  22:00 SELČ (náhled `/?volby`). Pořadí sloupců `ucast.celkem` (okrsky,
  zpracováno, %, voliči, obálky, účast %…) je odhad podle XML ČSÚ – ověřit
  s reálnými daty. Po volbách upoutávku odebrat.
- `src/pages/poslete-fotku.astro` + `api/poslat-fotku.js` (Vercel funkce) –
  formulář pro čtenáře: fotka se v prohlížeči zmenší (max. 2000 px, JPEG),
  funkce založí záznam ve Fotobance (Schvaleno = false, Autor „Foto: jméno,
  čtenář Rozhledny“, Licence „se svolením autora (čtenář)“, Email, Poznamka)
  a nahraje přílohu přes content.airtable.com `uploadAttachment`. Ochrana:
  skryté pole `web`, min. 4 s od načtení, max. ~3,5 MB. Odkaz v patičce.
  Potřebuje env `AIRTABLE_FOTKY_API_KEY` (token se zápisem; AIRTABLE_API_KEY
  webu je jen ke čtení – s ním zápis končí 403).
- Propagace / vyhledávače (4. 10. 2026): BaseLayout má canonical, Open
  Graph (náhled při sdílení – u článku fotka na stálé adrese `/og/<slug>.jpg`
  (`src/pages/og/[slug].jpg.ts`, sharp; adresy `/_astro/…` se s každým
  buildem mění a Facebook pak ukázal prázdný náhled),
  jinak `public/og-<region>.png`), `article:published_time`, JSON-LD
  NewsArticle u článků, ověřovací meta z env `GOOGLE_SITE_VERIFICATION`
  a `SEZNAM_WMT` (Vercel). Endpointy `sitemap.xml`, `robots.txt`,
  `rss.xml` (40 posledních článků).
- Newsletter: formuláře s `data-newsletter` (NewsletterCTA, boční panel
  článku) obsluhuje `src/lib/newsletter-klient.ts` → `api/newsletter.js`
  (Vercel funkce, token AIRTABLE_FOTKY_API_KEY) → tabulka **Odberatele**
  (Chrudimsko `tblf9wjAK2IzJdQtc`, Hlinecko `tbla7UnnJsnM2eafN`: Email,
  Prihlaseno, Stranka, Zdroj = utm_source, Odhlaseno). Rozesílání zatím
  není (samostatný krok).
- Statistiky: Vercel Web Analytics (skript `/_vercel/insights/script.js`
  v BaseLayout, bez cookies); zapnout v projektu na Vercelu → Analytics.
  Čtení přes Vercel MCP `aggregate_pageviews`.
- `src/pages/` – `index.astro` (hero s fotkou nebo varianta bez fotky,
  sportovní blok; ze centrálního města nejvýš `limitCentraNaHlavni`
  zpráv), `clanek/[slug]`, `rubrika/[slug]`, `obec/[slug]` (s mapkou
  „Kde leží …“), `obce/` (mapka + seznam; na mobilu štítek „Obce“).
- **Více regionů (jeden kód, víc webů)**: region vybírá env
  `ROZHLEDNA_REGION` ve Vercel projektu (výchozí `chrudimsko`). Pro jiný
  region `astro.config.mjs` přesměruje importy `../data/taxonomie.json`,
  `region.json` a `mapa-regionu.json` do `src/regiony/<region>/`
  (Hlinecko: 28 obcí, petrolejová #1E5A63, centrum Hlinsko s limitem 2).
  Barva regionu se nastavuje na `<html style="--barva-zelena: …">`
  (BaseLayout), favicon `public/favicon-<centrum>.svg`. Každý web má vlastní
  Airtable bázi (env AIRTABLE_BASE_ID; Hlinecko `app5oYoXQLN614av5`).
- `src/data/region.json` – nastavení regionu (název mikroregionu, centrum
  + limit zpráv z něj na hlavní stránce, místo pro počasí). Připraveno pro
  další regiony (Hlinecko – jiná barva, viz CLAUDE.md pipeline).
- `src/data/mapa-regionu.json` – hranice obcí mikroregionu z OSM
  (zjednodušené, SVG souřadnice 0–100) + obrys; `MapaObci.astro` kreslí
  naše obce (taxonomie) barevně s odkazem, ostatní šedě („připravujeme“).
- `src/components/DnesPruh.astro` – pruh pod záhlavím: datum, svátek
  (`src/data/svatky.json`, MM-DD → jméno), počasí (`src/lib/pocasi.ts`,
  Open-Meteo při buildu, 3 dny), probíhající zásah hasičů / počet dnešních
  hlášení a vodoznak obrysu regionu. Dnešek dopočítá prohlížeč (web se
  v noci nepřestavuje), „probíhá“ skryje po 4 h.
- Záhlaví: „Obce ▾“ (`<details>`) rozbalí mapku a seznam obcí.
- `src/components/Header.astro` – logo ROZHLEDNA s podtitulem „Chrudimsko“,
  navigace vycentrovaná mezi logem a CTA (zúžená mezera 901–1200 px).
- `astro.config.mjs` – `image.remotePatterns` pro `**.airtableusercontent.com`
  (URL příloh Airtable platí jen pár hodin, fotky se zpracují při buildu).
