# Rozhledna – Chrudimsko

Web pro AI-Native Local News Bureau "Rozhledna" (Chrudimsko), postavený podle vizuálního
návrhu Varianty A ("Teplý moderní") z Fáze 6 akčního plánu.

## Technologie

- **Astro** – statický web, minimální JS, rychlé buildy, snadné pro solo provoz.
- Obsah se při buildu načítá z Airtable (báze **Rozhledna**, tabulka **Clanky**) přes
  `src/lib/clanky.ts` – na web se dostanou jen záznamy se stavem **Publikováno**. Pokud
  proměnné prostředí pro Airtable nejsou nastavené (např. lokální vývoj bez secrets), web
  automaticky spadne zpět na ukázková data v `src/data/articles.json`, nikdy nespadne s chybou.

### Napojení na Airtable (proměnné prostředí)

V administraci hostingu (Netlify/Vercel), v sekci Environment variables, nastav:

| Proměnná | Hodnota |
|---|---|
| `AIRTABLE_API_KEY` | Personal access token s právem `data.records:read` na bázi Rozhledna |
| `AIRTABLE_BASE_ID` | `appQ1MZxZDfmEBd3v` |
| `AIRTABLE_TABLE_NAME` | `Clanky` (volitelné, tohle je i výchozí hodnota) |

**Nikdy tyto hodnoty necommituj do repozitáře** – patří jen do nastavení hostingu, stejně
jako secrets u sběrové pipeline.

**Důležité: web je statický.** Nová/upravená data v Airtable se na živém webu neobjeví,
dokud neproběhne nový build. Dvě věci, jak to zajistit:
1. Po schválení dávky článků (přesun na stav *Publikováno*) klikni v administraci
   Netlify/Vercel na **Trigger deploy** (ruční rebuild) – nejjednodušší varianta pro provoz
   jedním člověkem.
2. Časem lze přidat automatický rebuild (např. denní scheduled build na hostingu, souběžně
   s ranním během sběrové pipeline) – zatím neřešeno, doladí se až podle skutečné frekvence
   publikování.

### Dvě pole v Airtable, která web navíc využívá

Kromě schématu z `rozhledna-pipeline` (viz jeho README) web čte i dvě pole, která si redakce
vyplňuje sama při schvalování, ne pipeline automaticky:

- **DatumPublikace** (Date) – datum, které se zobrazí u článku na webu. Když je prázdné, web
  použije `DatumZdroje` jako náhradu.
- **HlavniZprava** (Checkbox) – zaškrtni u článku, který se má zobrazit jako hlavní zpráva
  (hero) na homepage. Když není zaškrtnutý žádný, použije se nejnovější publikovaný článek.

## Spuštění lokálně

```bash
npm install
npm run dev       # vývojový server
npm run build     # produkční build do dist/
npm run preview   # náhled produkčního buildu
```

## Struktura obsahu (`src/data/`)

- `taxonomie.json` – 6 rubrik (Veřejná správa, Doprava, Sport, Bezpečnost, Kultura, Bazárek)
  a 4 obce vlny 1 (Slatiňany, Orel, Tuněchody, Rabštejnská Lhota).
- `articles.json` – ukázkové články. **Pole jsou navržená tak, aby přesně odpovídala budoucím
  sloupcům v Airtable** (viz Krok 4, bod 1 akčního plánu):

  | Pole v JSON | Budoucí sloupec v Airtable | Poznámka |
  |---|---|---|
  | `stav` | Stav (select) | `AI návrh` → `Ke schválení` → `Schváleno` → `Publikováno` – na web se dostanou jen `Publikováno` |
  | `rubrika`, `obec` | Linked record | Vazba na tabulky Rubriky / Obce |
  | `nadpis`, `perex`, `telo` | Text pole | `telo` bude v Airtable long text, zde rozdělené na odstavce |
  | `autor` | Text | Pevně "Redakce Rozhledny", u bazárku "Bazárek (řádková inzerce)" |
  | `obrazek` | Obrazek (příloha) + ObrazekPopis + ObrazekAutor | Fotka se při buildu stáhne a zmenší (astro:assets); bez fotky se článek zobrazí bez obrázku |
  | `ukazkovyObsah` | – | Interní příznak, že jde o ukázkový obsah pro demo rozvržení – u reálných článků se nebude nastavovat |

Všechny texty v `articles.json` jsou **ukázkový obsah pro demonstraci rozvržení, ne skutečné
zprávy** – stejné upozornění, jaké bylo použito v design canvasu.

## Doména a hosting (Krok 4, bod 2 akčního plánu)

- Doména: **rozhledna-chrudimsko.cz** (registrátor VEDOS)
- DNS a e-mail: Cloudflare (zdarma, vč. Email Routing pro kontakt@/inzerce@)
- Hosting: Vercel nebo Netlify (zdarma tarif) – po nasazení stačí repozitář připojit a nastavit
  vlastní doménu v administraci hostingu.

## Co zatím chybí (další kroky)

- Nasazení na skutečný hosting (Vercel/Netlify) a doména `rozhledna-chrudimsko.cz` – zatím
  není založené, web zatím běží jen lokálně/jako zip.
- Formuláře pro newsletter (hero, article sidebar) zatím nikam neodesílají – čekají na výběr
  a napojení e-mailového nástroje (bod 6).

## Hlavní zpráva a fotky

- **Hlavní zpráva** (`vyberHlavniZpravu` v `src/lib/clanky.ts`): nejnovější článek se
  zaškrtnutým `HlavniZprava` (nejvýš 7 dní starý), jinak nejnovější článek z rubrik
  Veřejná správa / Doprava / Bezpečnost z posledních 3 dnů (přednost má ten s fotkou),
  jinak nejnovější článek.
- **Fotky**: pole `Obrazek` v Airtable (první příloha), `ObrazekPopis` (alt + popisek),
  `ObrazekAutor` (kredit). Jen fotky, ke kterým máme práva.

## Sport

`src/lib/sport.ts` + `src/components/SportPrehled.astro`: program, výsledky a tabulky
z Airtable tabulek `Zapasy` a `Tabulky` (plní je rozhledna-pipeline). Zobrazuje se na
homepage (kompaktně), v rubrice Sport a na stránkách obcí. Bez dat se blok nevykreslí.
