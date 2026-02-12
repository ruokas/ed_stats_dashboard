# ED statistikos skydelis

Profesionalus, konfigūruojamas neatidėliotinos pagalbos (ED) veiklos statistikos skydelis, paremtas CSV duomenų šaltiniais ir naršyklėje veikiančiu runtime.
Projektas pritaikytas tiek kasdienei eksploatacijai ligoninėje, tiek nuosekliam inžineriniam vystymui. RŠL / SMPS naudojimo scenarijus pateikiamas kaip praktinis diegimo pavyzdys, bet architektūra yra bendrinė.

## Turinys
- [Kam skirtas šis projektas](#kam-skirtas-šis-projektas)
- [Pagrindinės galimybės](#pagrindinės-galimybės)
- [Greitas paleidimas (Quick Start)](#greitas-paleidimas-quick-start)
- [Konfigūracija](#konfigūracija)
- [Projekto struktūra ir architektūra](#projekto-struktūra-ir-architektūra)
- [Kokybės vartai ir kasdienės komandos](#kokybės-vartai-ir-kasdienės-komandos)
- [Testavimas ir priėmimo scenarijai](#testavimas-ir-priėmimo-scenarijai)
- [Diegimas ir eksploatacija](#diegimas-ir-eksploatacija)
- [Trikčių diagnostika](#trikčių-diagnostika)
- [Indėlis ir darbo tvarka](#indėlis-ir-darbo-tvarka)
- [Licencija](#licencija)

## Kam skirtas šis projektas
Šis README vienu metu aptarnauja dvi auditorijas.

- Kūrėjams:
  - greitas onboarding,
  - architektūros žemėlapis,
  - kokybės vartų ir CI reikalavimai,
  - testavimo ir refaktorizavimo saugos praktika.
- Operatoriams:
  - duomenų šaltinių ir `config.json` konfigūravimas,
  - paleidimas per lokalų / vidinį HTTP serverį,
  - tipinių incidentų (CSV, HTTP, CORS) diagnostika.

## Pagrindinės galimybės

### Duomenys
- Krauna operatyvinius ED duomenis iš publikuoto CSV šaltinio.
- Palaiko papildomą istorinį (pvz., 5 metų) CSV rinkinį ilgalaikiam palyginimui.
- Duomenų transformacijos atliekamos worker sluoksnyje (`data-worker*.js`) siekiant mažinti UI gijos apkrovą.

### Atvaizdavimas
- KPI kortelės, diagramos, lentelės ir puslapių sekcijos pagal konfigūraciją.
- Keli puslapiai su bendra app shell struktūra: `index`, `charts`, `recent`, `summaries`, `feedback`, `ed`.
- Lokalių tekstų ir UI valdiklių valdymas per `config.json`.

### Filtrai
- KPI laikotarpio, pamainos, GMP ir išvykimo sprendimo filtrai.
- Filtrų būsenos santrauka ir greitas atstatymas.

### Eksportas
- Palaikomas vizualizacijų kopijavimas į iškarpinę.
- `summaries` ir susijusiuose runtime moduliuose palaikomi ataskaitų / lentelių eksportavimo scenarijai.

### Prieinamumas
- Navigacija ir valdikliai orientuoti į aiškų klaviatūros naudojimą.
- Vengiama tik spalva paremtų būsenų ten, kur būtinas semantinis aiškumas.

### Patikimumas
- Service worker strategija statiniams failams ir CSV atsakymams (stale-while-revalidate principas).
- Aiškesnė klaidų signalizacija statuso juostoje ir konsolėje.

### Našumas
- Runtime modulių skaidymas pagal puslapius.
- Performance matavimai ir medianų skaičiavimas per dokumentuotus harness scenarijus.

## Greitas paleidimas (Quick Start)

### 1) Reikalavimai
- Node.js `20.x` (atitinka CI konfigūraciją faile `.github/workflows/code-quality.yml`).
- `npm` (naudojamas `package-lock.json`, todėl rekomenduojamas `npm ci`).

### 2) Priklausomybių įdiegimas
```bash
npm ci
```

### 3) Paleidimas per HTTP serverį (ne `file://`)
Projektas įkelia `config.json` per `fetch`, todėl `file://` režimas netinka patikimam veikimui.

Vienas paprasčiausių lokalių paleidimo variantų:
```bash
npx http-server .
```

### 4) Pirmas patikrinimas
- Atidarykite `index.html` per serverio URL (pvz., `http://127.0.0.1:8080/index.html`).
- Patikrinkite, ar užsikrauna antraštė, KPI, diagramos ir statuso eilutė.

## Konfigūracija
Pagrindinis konfigūracijos failas yra `config.json`.

### Konfigūracijos šaltinis
- Numatytoji konfigūracija: `config.json` projekto šaknyje.
- Alternatyvus kelias: `?config=kelias/iki/config.json`.

### Esminiai blokai
- `dataSource`: duomenų šaltinio nustatymai.
- `csv`: CSV stulpelių atitikmenys.
- `output`: tekstai, sekcijų pavadinimai, rodymo jungikliai.
- `calculations`: skaičiavimo langai ir KPI elgsena.

### Praktinės taisyklės duomenų laukams
- Istoriniam rinkiniui pakanka laukų: `Numeris`, `Atvykimo data`, `Išrašymo data`, `Siuntimas`, `GMP`, `Nukreiptas į padalinį`.
- Jei CSV neturi pamainos lauko (`Diena/naktis`), paros metas gali būti išvedamas iš atvykimo laiko.
- GMP reikšmės turi būti nuoseklios (`GMP`, `su GMP` ar analogiškai suderintos reikšmės).
- Tuščias hospitalizavimo laukas traktuojamas kaip išrašymas, jei taip aprašyta konfigūracijos taisyklėse.

## Projekto struktūra ir architektūra

### Įėjimo kelias
- `main.js -> src/main.js -> src/app/runtime.js`

### Puslapių runtime žemėlapis
- `kpi`: `src/app/runtime/pages/kpi-page.js`
- `charts`: `src/app/runtime/pages/charts-page.js`
- `recent`: `src/app/runtime/pages/recent-page.js`
- `summaries`: `src/app/runtime/pages/summaries-page.js`
- `feedback`: `src/app/runtime/pages/feedback-page.js`
- `ed`: `src/app/runtime/pages/ed-page.js`

### Worker sluoksnis
- Pagrindinis worker įėjimas: `data-worker.js`.
- Transformacijų moduliai: `data-worker-csv-parse.js`, `data-worker-main-transform.js`, `data-worker-ed-transform.js`, `data-worker-kpi-filters.js`, `data-worker-transforms.js`.
- Protokolas tarp UI ir worker: `data-worker-protocol.js`.

### Page shell generavimas
- Šablonai: `templates/page-shell/`.
- Manifestas: `templates/page-shell/manifest.json`.
- Generavimas: `npm run pages:generate`.
- Nuoseklumo patikra: `npm run pages:check`.

## Kokybės vartai ir kasdienės komandos
Žemiau pateiktos komandos atitinka `package.json` `scripts`.

| Komanda | Paskirtis | Kada naudoti |
| --- | --- | --- |
| `npm run lint` | Statinė kokybės patikra su Biome | Prieš kiekvieną PR |
| `npm run lint:fix` | Automatinis dalies lint pažeidimų taisymas | Lokaliam taisymui prieš commit |
| `npm run format` | Formatavimas su Biome | Kai reikia suvienodinti formatą |
| `npm run format:check` | Formato patikra nekeičiant failų | CI ir prieš PR |
| `npm run typecheck` | `tsc --noEmit` (`checkJs`) statinė tipų patikra | Keičiant runtime / data logiką |
| `npm run test` | Vitest testų vykdymas | Kasdienė lokalioji verifikacija |
| `npm run test:coverage` | Testai su coverage ataskaita | Prieš merge į pagrindines šakas |
| `npm run depcruise` | Importų ciklų ir taisyklių patikra | Refaktorių metu |
| `npm run knip` | Nenaudojamų failų/priklausomybių analizė | Periodinė techninė higiena |
| `npm run knip:exports` | Nenaudojamų eksportų analizė | Prieš didesnius architektūrinius pokyčius |
| `npm run css:metrics` | CSS metrikų ataskaita | CSS optimizavimo metu |
| `npm run css:budget` | CSS biudžeto vartai | Prieš release / refaktorių su UI pokyčiais |
| `npm run pages:generate` | Sugeneruoja visus HTML puslapius iš page-shell | Keičiant templates arba manifestą |
| `npm run pages:check` | Patikrina, ar sugeneruoti puslapiai sinchronizuoti | Prieš PR po templates pakeitimų |
| `npm run benchmark:worker` | Worker benchmark medianų ir p95 skaičiavimas | Vertinant transformacijų našumą |
| `npm run check` | `lint + typecheck + test:coverage` | Minimalūs kokybės vartai |
| `npm run check:strict` | `check + depcruise + knip:exports` | Prieš sudėtingesnius merge |
| `npm run check:refactor` | `check:strict + pages:check + css:budget` | Prieš release ir didelius refaktorius |

### Minimalus kasdienis srautas
```bash
npm run lint
npm run typecheck
npm run test
npm run check
```

### Srautas prieš merge / release
```bash
npm run check:refactor
```

CI (`.github/workflows/code-quality.yml`) vykdo `npm run check:refactor` kiekviename `pull_request` ir `push` į `main` / `code-quality`.

## Testavimas ir priėmimo scenarijai

### Funkcinis smoke test (trumpa versija)
1. Paleiskite projektą per HTTP serverį ir atidarykite `index.html`.
2. Patikrinkite, kad užsikrauna KPI, grafikai, lentelės ir statuso eilutė.
3. Pakeiskite KPI langą (pvz., 14 dienų) ir įsitikinkite, kad reikšmės persiskaičiuoja.
4. Pakeiskite filtrus (pamaina, GMP, išvykimo sprendimas), tada atkurkite numatytuosius.
5. Atidarykite visus puslapius: `index.html`, `charts.html`, `recent.html`, `summaries.html`, `feedback.html`, `ed.html`.
6. Patikrinkite, kad konsolėje nėra kritinių runtime klaidų.

### Išsamios metodikos
- Refaktorizavimo saugos tinklas: `docs/refactor-safety-net.md`
- Našumo regresijos kontrolė: `docs/performance-checklist.md`
- Performance harness ir medianos: `docs/perf-harness.md`

## Diegimas ir eksploatacija

### HTTP serveris / reverse proxy
- Pavyzdinė serverio konfigūracija pateikta faile `nginx.conf`.
- Rekomenduojama taikyti suspaudimą (`gzip` / `brotli`) ir aiškias `Cache-Control` antraštes.

### Talpyklos strategija
- Service worker talpina statinius failus ir API/CSV atsakymus.
- App shell ar talpyklos strategijos pokyčių metu būtina didinti cache versijas worker faile.
- Jei pereinama prie hash pavadinimų (`*.hash.js`, `*.hash.css`), galima ilginti static TTL ir naudoti `immutable`.

### Eksploatacinė priežiūra
- Periodiškai peržiūrėkite benchmark rezultatus (`worker-bench-runs.json` + `npm run benchmark:worker`).
- Po templates pakeitimų visada vykdykite `npm run pages:generate` ir `npm run pages:check`.

## Trikčių diagnostika

### Dažniausi simptomai ir priežastys
- HTTP 403/404 įkeliant CSV:
  - neteisinga nuoroda,
  - nepaskelbtas (nepublikuotas) šaltinis,
  - apribotos prieigos teisės.
- CORS klaidos naršyklėje:
  - šaltinis neleidžia kryžminių užklausų,
  - netinkama publikavimo politika.
- Duomenys neatsinaujina:
  - pasenusi service worker talpykla,
  - neatnaujinta cache versija po release.

### Kur tikrinti
- Statuso eilutė UI viršuje.
- Naršyklės konsolė (`Network` + `Console`).
- Duomenų šaltinio publikavimo nustatymai (pvz., Google Sheets "Publish to web").

## Indėlis ir darbo tvarka

### Branch ir PR disciplina
- Kiekvieną pakeitimą atlikite atskiroje šakoje.
- PR apraše nurodykite:
  - kokia problema sprendžiama,
  - kokie rizikos taškai,
  - kokius vartus paleidote lokaliai.

### Privalomi patikrinimai prieš PR
- Mažesniems pakeitimams:
```bash
npm run check
```
- Didesniems refaktoriams / release klasės pakeitimams:
```bash
npm run check:refactor
```

### Papildoma rekomendacija
- Jei keičiate dokumentaciją apie našumą ar kokybės vartus, atnaujinkite susijusius `docs/*` failus tame pačiame PR.

## Licencija
Projektas licencijuotas pagal `MIT` licenciją. Žr. `LICENSE`.
