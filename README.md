# RŠL SMPS statistika

Modernizuotas vieno HTML failo informacinis skydelis, kuris užkrauna neatidėliotinos pagalbos skyriaus duomenis iš „Google Sheets“ CSV ir pateikia pagrindinius rodiklius, grafikus, paskutinės savaitės kasdienę ir savaitinę suvestines.

## Savybės
- 🔄 Vienas HTML failas be papildomų priklausomybių (Chart.js kraunamas iš CDN per klasikinį `<script>`, kad neliktų CORS/MIME kliūčių).
- ⏱️ Automatinis duomenų atnaujinimas kas 5 min. (be rankinio mygtuko).
- 🔗 Galimybė kartu naudoti pagrindinį operatyvinį ir papildomą 5 metų istorinį CSV šaltinį.
- 📊 KPI kortelės su aiškia „Metinis vidurkis“ eilute ir mėnesio palyginimu, stulpelinė bei linijinė diagramos, paskutinės 7 dienos ir savaitinė lentelės.
- 🗓️ KPI laikotarpio filtras leidžia pasirinkti iki 365 d. langą arba matyti visus duomenis vienu paspaudimu.
- 🎯 Interaktyvūs KPI filtrai (laikotarpis, pamaina, GMP, išvykimo sprendimas) su aiškia santrauka ir sparčiuoju **Shift+R**.
- 🔍 Pacientų atsiliepimų filtras pagal tai, kas pildė anketą ir kur ji pildyta – kortelės, grafikas ir lentelė prisitaiko akimirksniu.
- 📋 Greitas grafikų kopijavimas į iškarpinę (PNG/SVG), su atsarginėmis „data URL“ kopijomis.
- 🧭 LT lokalė, aiškūs paaiškinimai, pritaikyta klaviatūros ir ekrano skaitytuvų naudotojams.
- 🖥️ Reagavimas į ekranų pločius (desktop, planšetė, telefonas), „prefers-reduced-motion“ palaikymas.
- 🛡️ Aiškios klaidų žinutės, padedančios diagnozuoti „Google Sheets“ publikavimo problemas.
- 📈 Vidutinės buvimo trukmės apskaičiavimas automatiškai ignoruoja >24 val. įrašus, kad ekstremalios vertės nedarkytų rodiklių.
- ⚡ Našumo optimizavimas: bendras temos bootstrap iškeltas į `theme-init.js`/`theme-init.css`, trečiųjų šalių skriptai žymimi `defer`, visiems `<img>`/`<iframe>` taikomas `loading="lazy"`.
- 📦 Service worker talpina statinius failus ir CSV atsakymus („stale-while-revalidate“), suteikia HTML atsarginę kopiją be papildomų bibliotekų.
- ⏱️ `performance.mark/measure` ir `console.table` matavimai leidžia greitai palyginti įkėlimus su ir be talpyklos.

## Dabartinė architektūra
- Įėjimo taškas: `main.js` -> `src/main.js` -> `src/app/runtime.js`.
- Puslapių runtime:
- `kpi`: `src/app/runtime/pages/kpi-page.js`
- `charts`: `src/app/runtime/pages/charts-page.js`
- `recent`: `src/app/runtime/pages/recent-page.js`
- `summaries`: `src/app/runtime/pages/summaries-page.js`
- `feedback`: `src/app/runtime/pages/feedback-page.js`
- `ed`: `src/app/runtime/pages/ed-page.js`
- Legacy runner kelias pašalintas: nebenaudojami `runtime-legacy` ir `legacy-runner`.

## Diegimas
1. Atsisiųskite saugomą saugyklą arba jos ZIP: `git clone https://example.com/ed_stats_dashboard.git`.
2. Atidarykite `index.html` pasirinktoje naršyklėje (Chrome, Edge, Firefox).
3. Greiti pakeitimai atliekami `config.json` faile: atnaujinkite CSV nuorodas ir skaičiavimo parametrus pagal poreikį.

## Kodo kokybė ir testai
Nuo `code-quality` šakos projektas turi bazinę kokybės infrastruktūrą:
- `npm run lint` – paleidžia `Biome` patikrą visam projektui.
- `npm run lint:fix` – automatiškai sutvarko dalį `Biome` pažeidimų.
- `npm run format` – performatuoja palaikomus failus.
- `npm run format:check` – formato patikra nekeičiant failų.
- `npm run typecheck` – `TypeScript` (`checkJs`) statinė patikra kritiniams moduliams.
- `npm run test` – paleidžia `Vitest` testus (`jsdom` aplinkoje).
- `npm run test:coverage` – paleidžia testus su coverage vartais.
- `npm run depcruise` – tikrina modulių ciklus ir architektūrines importų taisykles.
- `npm run knip` – ieško nenaudojamų failų/eksportų/priklausomybių (reikalauja papildomo konfigūravimo brandžiai analizei).
- `npm run check` – paleidžia `lint + typecheck + test:coverage` vienu veiksmu.

CI darbo eiga (`.github/workflows/code-quality.yml`) vykdo `npm run check` kiekviename `pull_request` ir `push` į `main`/`code-quality`, bei prideda coverage artifact.

## Konfigūracija
Skydelis įkelia `config.json` per `fetch`, todėl rekomenduojama jį atverti per lokalų serverį (ne `file://`).
- Laikinai kitą konfigūraciją galima įkrauti per `?config=kelias/iki/config.json`.
- Tekstai, sekcijų pavadinimai ir rodymo jungikliai – `config.json` `output` bloke.
- Duomenų šaltinis, papildomas istorinis CSV ir stulpelių atitikmenys – `config.json` `dataSource` ir `csv` blokuose. Istoriniam rinkiniui pakanka stulpelių **„Numeris“**, **„Atvykimo data“**, **„Išrašymo data“**, **„Siuntimas“**, **„GMP“**, **„Nukreiptas į padalinį“** – „Diena/naktis“ gali nebūti, nes paros metas apskaičiuojamas iš atvykimo laiko.
- GMP laukas numatytai atpažįsta reikšmes „GMP“, „su GMP“ ir „GMP (su GMP)“, o tuščias hospitalizavimo stulpelis reiškia išrašytą pacientą.
- Spalvų schema ir kampai – CSS kintamieji `:root` bloke (`index.html`).
- Grafikai – Chart.js nustatymai `renderCharts()` funkcijoje (`index.html`).
- Automatinio atnaujinimo intervalas – `AUTO_REFRESH_INTERVAL_MS` kintamasis `index.html` faile (numatyta 5 min.).

## Našumo ir talpyklos rekomendacijos
- Nginx pavyzdinė konfigūracija su `gzip`, `brotli` ir `Cache-Control` antraštėmis pateikta faile [`nginx.conf`](./nginx.conf). Static failams taikoma 7 dienų talpykla, nes pavadinimai neversijuojami; jei pradėsite naudoti `styles.<hash>.css` ar `data-worker.<hash>.js`, galite ilginti TTL ir pridėti `immutable`.
- SVG naudojamos ikonoms; jei prireiks nuotraukų, konvertuokite jas į `webp`/`avif` formatus prieš diegimą.
- Visi `img`/`iframe` elementai automatiškai gauna `loading="lazy"`, nebent nustatytas `data-force-eager` atributas.

## Trikčių diagnostika
- Statuso eilutė praneš apie klaidą, jei nepavyko pasiekti nuotolinio CSV (HTTP 404/403, CORS, tinklo klaidos).
- Raudonas pranešimas rodo kritinę klaidą. Patikrinkite, ar Google Sheet yra paviešinta per **File → Share → Publish to web → CSV** ir ar nuoroda atsidaro naršyklėje be prisijungimo.
- Naršyklės konsolėje matysite lokalizuotą klaidos paaiškinimą (pvz., „HTTP 404 – nuoroda nerasta“). Tai padeda greitai sutaisyti leidimų problemas.

## Greitas „smoke test“ sąrašas
Detalesnis refaktorizavimo tikrinimo sarasas: `docs/refactor-safety-net.md`.
1. Atidarykite `index.html` ir patikrinkite, kad hero blokas rodo pavadinimą, navigacijos nuorodas ir statuso eilutę.
2. Pakeiskite `config.json` `calculations.windowDays` reikšmę (pvz., į 14) ir perkraukite puslapį – KPI kortelės bei grafikai turi persiskaičiuoti.
3. Išbandykite KPI filtrus: pasirinkite, pvz., 14 d. laikotarpį, „Naktinės“ pamainas ir „Tik GMP“ – kortelės turi persiskaičiuoti, o santrauka viršuje parodyti aktyvius filtrus.
4. Paspauskite mygtuką „Atkurti filtrus“ arba **Shift+R** – reikšmės turi grįžti į numatytąsias, KPI kortelės persikrauna.
5. Patvirtinkite, kad užsikrovus duomenims KPI kortelės, grafikai ir lentelės (jei jos nepaslėptos konfigūracijoje) užsipildo.
6. (Pasirinktinai) Laikinai atjunkite internetą – statusas turi parodyti klaidą, konsolėje matysite klaidos detalizaciją.
8. Atidarykite visus puslapius (`index.html`, `charts.html`, `recent.html`, `summaries.html`, `feedback.html`, `ed.html`) ir patikrinkite, kad kiekviename užsikrauna duomenys be klaidų konsolėje.

## Licencija
Projektas licencijuojamas pagal [MIT](./LICENSE) licenciją. Drąsiai naudokite, adaptuokite ir diekite RŠL bei kitose gydymo įstaigose.
