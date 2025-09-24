# Skubios pagalbos statistikos skydelis

Modernizuotas vieno HTML failo informacinis skydelis, kuris užkrauna neatidėliotinos pagalbos skyriaus duomenis iš „Google Sheets“ CSV ir pateikia pagrindinius rodiklius, grafikus bei savaitinę suvestinę.

## Savybės
- 🔄 Vienas HTML failas be papildomų priklausomybių (Chart.js kraunamas iš CDN per klasikinį `<script>`, kad neliktų CORS/MIME kliūčių).
- 📊 KPI kortelės, stulpelinė bei linijinė diagramos, savaitinė lentelė.
- 🧭 LT lokalė, aiškūs paaiškinimai, pritaikyta klaviatūros ir ekrano skaitytuvų naudotojams.
- 🖥️ Reagavimas į ekranų pločius (desktop, planšetė, telefonas), „prefers-reduced-motion“ palaikymas.
- 🛡️ Automatinis demonstracinių duomenų rezervas ir aiškios klaidų žinutės, padedančios diagnozuoti „Google Sheets“ publikavimo problemas.

## Diegimas
1. Atsisiųskite saugomą saugyklą arba jos ZIP: `git clone https://example.com/ed_stats_dashboard.git`.
2. Atidarykite `index.html` pasirinktoje naršyklėje (Chrome, Edge, Firefox).
3. Jei reikia naudoti kitą duomenų šaltinį, `index.html` faile suraskite `const DATA_SOURCE` ir pakeiskite `url` reikšmę „Publish to web → CSV“ nuoroda.
4. Jeigu norite išjungti ar atnaujinti demonstracinius duomenis, tame pačiame `DATA_SOURCE` bloke redaguokite `fallbackCsv` (tuščia reikšmė – jokių rezervinių duomenų).

## Konfigūracija
- Tekstai (LT, su kabliuku EN) – `TEXT` objektas `index.html` viršuje.
- Duomenų šaltinis ir demonstraciniai įrašai – `DATA_SOURCE` objektas (tas pats failas, viršuje prie skripto).
- Spalvų schema ir kampai – CSS kintamieji `:root` bloke (`index.html`).
- Grafikai – Chart.js nustatymai `renderCharts()` funkcijoje (`index.html`).

## Trikčių diagnostika
- Statuso eilutė praneš „Rodomi demonstraciniai duomenys…“, jei nepavyko pasiekti nuotolinio CSV (HTTP 404/403, CORS, tinklo klaidos).
- Raudonas pranešimas rodo kritinę klaidą. Patikrinkite, ar Google Sheet yra paviešinta per **File → Share → Publish to web → CSV** ir ar nuoroda atsidaro naršyklėje be prisijungimo.
- Naršyklės konsolėje matysite lokalizuotą klaidos paaiškinimą (pvz., „HTTP 404 – nuoroda nerasta“). Tai padeda greitai sutaisyti leidimų problemas.
- Rezervinį duomenų rinkinį galite išjungti (perduoti tuščią `fallbackCsv`), jei norite matyti tik realią klaidos būseną.

## Greitas „smoke test“ sąrašas
1. Atidarykite `index.html` ir patikrinkite, kad hero blokas rodo pavadinimą bei mygtuką „Perkrauti duomenis“.
2. Patvirtinkite, kad užsikrovus duomenims KPI kortelės užsipildo, grafikai nupiešiami, lentelė rodoma.
3. Paspauskite „Perkrauti duomenis“ – statusas turi trumpam rodyti „Kraunama...“, po sėkmės – atnaujinimo laiką.
4. Laikinai atjunkite internetą ir spauskite „Perkrauti duomenis“ – statusas turi pereiti į oranžinę žinutę apie demonstracinius duomenis, konsolėje matysite klaidos detalizaciją.
5. (Pasirinktinai) Išvalykite `fallbackCsv` ir pakartokite 4 žingsnį – statusas turi tapti raudonas su konkrečiu klaidos aprašymu.

## Licencija
Projektas licencijuojamas pagal [MIT](./LICENSE) licenciją. Drąsiai naudokite, adaptuokite ir diekite RŠL bei kitose gydymo įstaigose.
