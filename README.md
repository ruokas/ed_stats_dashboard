# RŠL SMPS statistika

Modernizuotas vieno HTML failo informacinis skydelis, kuris užkrauna neatidėliotinos pagalbos skyriaus duomenis iš „Google Sheets“ CSV ir pateikia pagrindinius rodiklius, grafikus, paskutinės savaitės kasdienę ir savaitinę suvestines.

## Savybės
- 🔄 Vienas HTML failas be papildomų priklausomybių (Chart.js kraunamas iš CDN per klasikinį `<script>`, kad neliktų CORS/MIME kliūčių).
- ⏱️ Automatinis duomenų atnaujinimas kas 5 min., papildomai galima perkrauti rankiniu mygtuku.
- 🔗 Galimybė kartu naudoti pagrindinį operatyvinį ir papildomą 5 metų istorinį CSV šaltinį.
- 📊 KPI kortelės su aiškia „Metinis vidurkis“ eilute ir mėnesio palyginimu, stulpelinė bei linijinė diagramos, paskutinės 7 dienos ir savaitinė lentelės.
- 🗓️ KPI laikotarpio filtras leidžia pasirinkti iki 365 d. langą arba matyti visus duomenis vienu paspaudimu.
- 🎯 Interaktyvūs KPI filtrai (laikotarpis, pamaina, GMP, išvykimo sprendimas) su aiškia santrauka ir sparčiuoju **Shift+R**.
- 🔍 Pacientų atsiliepimų filtras pagal tai, kas pildė anketą ir kur ji pildyta – kortelės, grafikas ir lentelė prisitaiko akimirksniu.
- 🧭 LT lokalė, aiškūs paaiškinimai, pritaikyta klaviatūros ir ekrano skaitytuvų naudotojams.
- 🖥️ Reagavimas į ekranų pločius (desktop, planšetė, telefonas), „prefers-reduced-motion“ palaikymas.
- 📺 TV režimas su stambiais rodikliais (Ctrl+Shift+T) ir gyvu laikrodžiu greitam skydo rodymui monitoriuje ar televizoriuje.
- 🛡️ Automatinis demonstracinių duomenų rezervas ir aiškios klaidų žinutės, padedančios diagnozuoti „Google Sheets“ publikavimo problemas.
- ⚙️ Nustatymų dialogas (Ctrl+,) CSV laukų, skaičiavimo logikos ir išvesties tekstų pritaikymui be kodo keitimo (pakeitimai išsaugomi naršyklės `localStorage`).
- 📈 Vidutinės buvimo trukmės apskaičiavimas automatiškai ignoruoja >24 val. įrašus, kad ekstremalios vertės nedarkytų rodiklių.
- ⚡ Našumo optimizavimas: kritinis CSS paliekamas inline, o likęs įkeliami su `media="print"`/`onload` triuku; trečiųjų šalių skriptai žymimi `defer`; visiems `<img>`/`<iframe>` taikomas `loading="lazy"`.
- 📦 Service worker talpina statinius failus ir CSV atsakymus („stale-while-revalidate“), suteikia HTML atsarginę kopiją be papildomų bibliotekų.
- ⏱️ `performance.mark/measure` ir `console.table` matavimai leidžia greitai palyginti įkėlimus su ir be talpyklos.

## Diegimas
1. Atsisiųskite saugomą saugyklą arba jos ZIP: `git clone https://example.com/ed_stats_dashboard.git`.
2. Atidarykite `index.html` pasirinktoje naršyklėje (Chrome, Edge, Firefox).
3. Greiti pakeitimai atliekami per nustatymų dialogą (mygtukas „Nustatymai“ viršuje dešinėje arba trumpinys **Ctrl+,**). Čia galite įklijuoti naują CSV nuorodą, perjungti demonstracinius duomenis ar pakeisti stulpelių pavadinimus.

## Konfigūracija
- Tekstai (LT, su kabliuku EN) – `TEXT` objektas `index.html` viršuje arba nustatymų dialoge nurodyti pavadinimai/paantraštės.
- Duomenų šaltinis, demonstraciniai įrašai, papildomas istorinis CSV ir stulpelių atitikmenys – nustatymų dialogas („Duomenų šaltinis“ ir „CSV stulpelių atitikimas“ skyriai). Istoriniam rinkiniui pakanka stulpelių **„Numeris“**, **„Atvykimo data“**, **„Išrašymo data“**, **„Siuntimas“**, **„GMP“**, **„Nukreiptas į padalinį“** – „Diena/naktis“ gali nebūti, nes paros metas apskaičiuojamas iš atvykimo laiko.
- GMP laukas numatytai atpažįsta reikšmes „GMP“, „su GMP“ ir „GMP (su GMP)“, o tuščias hospitalizavimo stulpelis reiškia išrašytą pacientą.
- Spalvų schema ir kampai – CSS kintamieji `:root` bloke (`index.html`).
- Grafikai – Chart.js nustatymai `renderCharts()` funkcijoje (`index.html`).
- Automatinio atnaujinimo intervalas – `AUTO_REFRESH_INTERVAL_MS` kintamasis `index.html` faile (numatyta 5 min.).

### Nustatymų meniu

Dialogas leidžia neredaguojant kodo keisti:

1. **Duomenų šaltinį** – CSV nuorodą, demonstracinių duomenų būseną ir turinį.
2. **CSV stulpelių atitikimą** – laukų pavadinimus (galimi keli sinonimai, atskirti `,` arba `|`), „taip“ reikšmes, dienos/nakties raktažodžius.
3. **Skaičiavimo logiką** – analizuojamų dienų skaičių, „Paskutinių dienų“ lentelės ilgį, nakties pradžios ir pabaigos valandas.
4. **Išvesties tekstus** – hero pavadinimą, sekcijų antraštes, apatinius prierašus ir lentelių rodymo jungiklius.

Visi pakeitimai įrašomi `localStorage` (raktas `edDashboardSettings-v1`) ir išliks iki kol išvalysite naršyklės duomenis arba paspausite **„Atstatyti numatytuosius“**. CSV turinys nėra talpinamas – duomenys laikomi tik atmintyje, kad neviršytų naršyklės kvotų.

## Našumo ir talpyklos rekomendacijos
- Nginx pavyzdinė konfigūracija su `gzip`, `brotli` ir `Cache-Control` antraštėmis pateikta faile [`nginx.conf`](./nginx.conf). Static failams taikoma 7 dienų talpykla, nes pavadinimai neversijuojami; jei pradėsite naudoti `styles.<hash>.css` ar `data-worker.<hash>.js`, galite ilginti TTL ir pridėti `immutable`.
- SVG naudojamos ikonoms; jei prireiks nuotraukų, konvertuokite jas į `webp`/`avif` formatus prieš diegimą.
- Visi `img`/`iframe` elementai automatiškai gauna `loading="lazy"`, nebent nustatytas `data-force-eager` atributas.

## Trikčių diagnostika
- Statuso eilutė praneš „Rodomi demonstraciniai duomenys…“, jei nepavyko pasiekti nuotolinio CSV (HTTP 404/403, CORS, tinklo klaidos).
- Raudonas pranešimas rodo kritinę klaidą. Patikrinkite, ar Google Sheet yra paviešinta per **File → Share → Publish to web → CSV** ir ar nuoroda atsidaro naršyklėje be prisijungimo.
- Naršyklės konsolėje matysite lokalizuotą klaidos paaiškinimą (pvz., „HTTP 404 – nuoroda nerasta“). Tai padeda greitai sutaisyti leidimų problemas.
- Rezervinį duomenų rinkinį galite išjungti nustatymų dialoge (nuimkite pažymėjimą „Naudoti demonstracinius duomenis“), jei norite matyti tik realią klaidos būseną.

## Greitas „smoke test“ sąrašas
1. Atidarykite `index.html` ir patikrinkite, kad hero blokas rodo pavadinimą bei mygtuką „Perkrauti duomenis“.
2. Paspauskite **Ctrl+,** (arba mygtuką „Nustatymai“), pakeiskite „Analizuojamų dienų skaičius“ reikšmę ir išsaugokite – KPI kortelės bei grafikai turi persiskaičiuoti.
3. Išbandykite KPI filtrus: pasirinkite, pvz., 14 d. laikotarpį, „Naktinės“ pamainas ir „Tik GMP“ – kortelės turi persiskaičiuoti, o santrauka viršuje parodyti aktyvius filtrus.
4. Paspauskite mygtuką „Atkurti filtrus“ arba **Shift+R** – reikšmės turi grįžti į numatytąsias, KPI kortelės persikrauna.
5. Patvirtinkite, kad užsikrovus duomenims KPI kortelės, grafikai ir lentelės (jei jos nepaslėptos nustatymuose) užsipildo.
6. Paspauskite „Perkrauti duomenis“ – statusas turi trumpam rodyti „Kraunama...“, po sėkmės – atnaujinimo laiką.
7. Laikinai atjunkite internetą ir spauskite „Perkrauti duomenis“ – statusas turi pereiti į oranžinę žinutę apie demonstracinius duomenis, konsolėje matysite klaidos detalizaciją.
8. (Pasirinktinai) Nustatymuose išjunkite demonstracinius duomenis ir pakartokite 7 žingsnį – statusas turi tapti raudonas su konkrečiu klaidos aprašu.
9. Aktyvuokite TV režimą mygtuku „TV režimas“ arba sparčiuoju **Ctrl+Shift+T** – turi atsirasti pilno ekrano kortelės, laikrodis ir triage pasiskirstymo juostos. Išjunkite režimą pakartotinai paspausdami mygtuką arba grįždami į „Bendrą vaizdą“.
10. Nustatymų dialoge spauskite **„Išvalyti duomenis“** – vietiniai nustatymai ir talpyklos turi būti išvalyti, konsolėje atsiranda service worker registracijos žinutės.

## Licencija
Projektas licencijuojamas pagal [MIT](./LICENSE) licenciją. Drąsiai naudokite, adaptuokite ir diekite RŠL bei kitose gydymo įstaigose.
