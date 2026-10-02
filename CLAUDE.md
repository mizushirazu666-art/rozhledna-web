# Rozhledna – web (CLAUDE.md)

Statický web rozhledna-chrudimsko.cz (Astro 7) pro obce Chrudimska. Obsah
čte z Airtable **jen při buildu**; plní ho pipeline v repozitáři
`mizushirazu666-art/rozhledna-pipeline-v2` – tam je v CLAUDE.md popis
celého projektu, Airtable tabulek (ID polí), zdrojů a pravidel spolupráce.
Komunikace s Lukášem (redaktor/majitel) česky; kód, komentáře a commity
česky.

## Nasazení

- Vercel projekt `prj_hWKinbqAXFyDvmQfgS39TzvM5wHL` (team slug `rozhledna`).
  Push na `main` = automatický produkční deploy. Push na main je povolený,
  PR jen na přání.
- Ruční přestavění (např. po schválení fotek/článků v Airtable): Vercel
  create_deployment s `gitSource {type: github, org: mizushirazu666-art,
  repo: rozhledna-web, ref: main}`, `target: production`, `forceNew: 1`.
  Pipeline po každém denním běhu volá Deploy Hook.
- Env (jen na Vercelu, nedešifrovat): AIRTABLE_API_KEY, AIRTABLE_BASE_ID,
  AIRTABLE_TABLE_NAME. Bez nich build použije ukázková data v `src/data`.
- Build: `npm install && npx astro build`. Repozitář nemá `.gitignore` –
  `node_modules`, `dist`, `.astro` necommitovat.

## Struktura

- `src/lib/clanky.ts` – načtení článků (`{Stav}='Publikováno'`), převod
  fotek (`obrazekZPoli`, HEAD kontrola dostupnosti – nedostupná fotka se
  vynechá, aby nespadl build), `vyberHlavniZpravu` (ruční HlavniZprava
  ≤ 7 dní, jinak veřejná správa/doprava/bezpečnost ≤ 3 dny s fotkou, jinak
  nejnovější) a ilustrační fotky z Fotobanky:
  - `nacistFotobanku` – filtr `AND({Schvaleno}, NOT({Neschvaleno}))`;
    u licencí kromě „vlastní“ se licence připojí k autorovi.
  - `PODTEMATA` – regexy podtémat (názvy musí sedět s
    `config/ilustrace.json` v pipeline), `temataClanku` = podtémata, pak
    hlavní témata, pak podle rubriky.
  - `rozdejIlustrace` – články od nejstaršího; v rámci tématu se míchají
    fotky obce a obecné, přednost nejméně použitá (při shodě z obce);
    fotka se neopakuje v `OKNO_BEZ_OPAKOVANI` (12) sousedních článcích,
    jinak článek zůstane bez fotky. Obecné fotky jen k vlastním tématům
    článku, záložní témata obce (Obec obecně, Památky, Příroda) jen
    s fotkami té obce. Bazárek fotky nedostává.
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
  Bezpečnost (nad články) a na stránce obce (jen její hlášení).
- `src/pages/` – `index.astro` (hero s fotkou nebo varianta bez fotky,
  sportovní blok), `clanek/[slug]`, `rubrika/[slug]`, `obec/[slug]`.
- `src/components/Header.astro` – logo ROZHLEDNA s podtitulem „Chrudimsko“,
  navigace vycentrovaná mezi logem a CTA (zúžená mezera 901–1200 px).
- `astro.config.mjs` – `image.remotePatterns` pro `**.airtableusercontent.com`
  (URL příloh Airtable platí jen pár hodin, fotky se zpracují při buildu).
