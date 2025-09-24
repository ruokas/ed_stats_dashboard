# Skubios pagalbos statistikos skydelis

Modernizuotas vieno HTML failo informacinis skydelis, kuris užkrauna neatidėliotinos pagalbos skyriaus duomenis iš „Google Sheets“ CSV ir pateikia pagrindinius rodiklius, grafikus bei savaitinę suvestinę.

## Savybės
- 🔄 Vienas HTML failas be papildomų priklausomybių (Chart.js kraunamas iš CDN per klasikinį `<script>`, kad neliktų CORS/MIME kliūčių).
- 📊 KPI kortelės, stulpelinė bei linijinė diagramos, savaitinė lentelė.
- 🧭 LT lokalė, aiškūs paaiškinimai, pritaikyta klaviatūros ir ekrano skaitytuvų naudotojams.
- 🖥️ Reagavimas į ekranų pločius (desktop, planšetė, telefonas), „prefers-reduced-motion“ palaikymas.

## Diegimas
1. Atsisiųskite saugomą saugyklą arba jos ZIP: `git clone https://example.com/ed_stats_dashboard.git`.
2. Atidarykite `index.html` pasirinktoje naršyklėje (Chrome, Edge, Firefox).
3. Jei reikia naudoti kitą duomenų šaltinį, pakoreguokite `fetchData()` funkcijos `url` reikšmę (`index.html`, komentaras nurodytas kode).

## Konfigūracija
- Tekstai (LT, su kabliuku EN) – `TEXT` objektas `index.html` viršuje.
- Spalvų schema ir kampai – CSS kintamieji `:root` bloke (`index.html`).
- Grafikai – Chart.js nustatymai `renderCharts()` funkcijoje (`index.html`).

## Greitas „smoke test“ sąrašas
1. Atidarykite `index.html` ir patikrinkite, kad hero blokas rodo pavadinimą bei mygtuką „Perkrauti duomenis“.
2. Patvirtinkite, kad užsikrovus duomenims KPI kortelės užsipildo, grafikai nupiešiami, lentelė rodoma.
3. Paspauskite „Perkrauti duomenis“ – statusas turi trumpam rodyti „Kraunama...“, po sėkmės – atnaujinimo laiką.
4. Išjunkite internetą ir paspauskite „Perkrauti duomenis“ – turi būti matomas klaidos pranešimas hero bloke ir konsolėje.

## Licencija
Projektas licencijuojamas pagal [MIT](./LICENSE) licenciją. Drąsiai naudokite, adaptuokite ir diekite RŠL bei kitose gydymo įstaigose.
