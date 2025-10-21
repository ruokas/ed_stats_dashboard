# RŠL SMPS statistika

Modernizuotas vieno HTML failo informacinis skydelis, kuris užkrauna neatidėliotinos pagalbos skyriaus duomenis iš „Google Sheets“ CSV ir pateikia pagrindinius rodiklius, grafikus, konsoliduotą 7/30/12 laikotarpių rezultatų modulį bei pacientų atsiliepimus.

## Savybės
- 🔄 Vienas HTML failas be papildomų priklausomybių (Chart.js kraunamas iš CDN per klasikinį `<script>`, kad neliktų CORS/MIME kliūčių).
- ⏱️ Automatinis duomenų atnaujinimas kas 5 min., papildomai galima perkrauti rankiniu mygtuku.
- 🔗 Galimybė kartu naudoti pagrindinį operatyvinį ir papildomą 5 metų istorinį CSV šaltinį.
- 📊 KPI kortelės su aiškia „Metinis vidurkis“ eilute ir mėnesio palyginimu, stulpelinė bei linijinė diagramos, 7/30/12 laikotarpių lentelės viename modulyje.
- 📂 „Rezultatai ir trendai“ modulis leidžia perjungti 7 d., 30 d. ir 12 mėn. langus bei iš karto eksportuoti aktyvų laikotarpį į CSV (taip pat per **Ctrl+Shift+E**).
- 🧾 Automatinės „Kas pagerėjo / kas blogėja“ interpretacijos pagal paskutinį laikotarpį (7 d., 30 d., 12 mėn.) su kontekstine pastaba.
- 🧭 Pamainų palyginimo juosta (dabartinė vs praėjusi) su automatiniu pacientų skaičiaus ir procento pokyčiu.
- 🗓️ KPI laikotarpio filtras leidžia pasirinkti iki 365 d. langą arba matyti visus duomenis vienu paspaudimu.
- 🎯 Interaktyvūs KPI filtrai (laikotarpis, pamaina, GMP, išvykimo sprendimas) su aiškia santrauka ir sparčiuoju **Shift+R**.
- 🧠 Pacientų srautų skiltis su viena eilute išdėstytais filtrų blokais („Laikotarpis“, „Metai“, „Rodiklis“, „Detalizavimas“) ir trimis naratyviniais moduliais (kasdienis pulsas, savaitės ritmas, sprendimai).
- 🎹 Skaičiai **1–6** akimirksniu fokusuoja atitinkamas KPI korteles, o **Shift+I** – „Budrumo signalą“ su papildoma informacija.
- 🔍 Pacientų atsiliepimų filtras pagal tai, kas pildė anketą ir kur ji pildyta – kortelės, grafikas ir lentelė prisitaiko akimirksniu.
- ❓ Pacientų srautų „Pagalbos“ dialogas su legendomis (mygtukas „Pagalba“).
- 🧭 LT lokalė, aiškūs paaiškinimai, pritaikyta klaviatūros ir ekrano skaitytuvų naudotojams.
- 🖥️ Reagavimas į ekranų pločius (desktop, planšetė, telefonas), „prefers-reduced-motion“ palaikymas.
- 📺 TV režimas su stambiais rodikliais (Ctrl+Shift+T) ir gyvu laikrodžiu greitam skydo rodymui monitoriuje ar televizoriuje.
- 🛡️ Automatinis demonstracinių duomenų rezervas ir aiškios klaidų žinutės, padedančios diagnozuoti „Google Sheets“ publikavimo problemas.
- ⚙️ Nustatymų dialogas (Ctrl+,) CSV laukų, skaičiavimo logikos ir išvesties tekstų pritaikymui be kodo keitimo (pakeitimai išsaugomi naršyklės `localStorage`).
- 📈 Vidutinės buvimo trukmės apskaičiavimas automatiškai ignoruoja >24 val. įrašus, kad ekstremalios vertės nedarkytų rodiklių.

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

Dialoge yra keturios akordeono grupės:

1. **Duomenų šaltiniai** – pagrindinis, istorinis, atsiliepimų ir ED CSV nuorodos bei demonstraciniai rinkiniai.
2. **Transformacijos** – CSV stulpelių atitikmenys, „taip“ reikšmės, dienos/nakties raktažodžiai ir skaičiavimo langai.
3. **Etiketės** – hero, tabų, KPI, grafikų, atsiliepimų ir ED blokų tekstai bei apatinių eilučių šablonas.
4. **Funkcijų jungikliai** – pasirinkimas, kuriuos skydo blokus rodyti (Įžvalgos, Paskutinės dienos, Mėnesinė, Metinė, Atsiliepimai).

Akordeono sekcijas galima išskleisti ar suskleisti klaviatūra (`Enter`/`Space`) arba pele; pagal nutylėjimą atsidaro tik „Duomenų šaltiniai“, kad dialogas neapkrautų informacija. Visus tekstus galima keisti ir LT, ir EN kalboms – numatytieji vertimai laikomi `TEXT.settingsDialog` objekte.

Visi pakeitimai įrašomi `localStorage` (raktas `edDashboardSettings-v1`) ir išliks iki kol išvalysite naršyklės duomenis arba paspausite **„Atstatyti numatytuosius“**. CSV turinys nėra talpinamas – duomenys laikomi tik atmintyje, kad neviršytų naršyklės kvotų.

## Trikčių diagnostika
- Statuso eilutė praneš „Rodomi demonstraciniai duomenys…“, jei nepavyko pasiekti nuotolinio CSV (HTTP 404/403, CORS, tinklo klaidos).
- Raudonas pranešimas rodo kritinę klaidą. Patikrinkite, ar Google Sheet yra paviešinta per **File → Share → Publish to web → CSV** ir ar nuoroda atsidaro naršyklėje be prisijungimo.
- Naršyklės konsolėje matysite lokalizuotą klaidos paaiškinimą (pvz., „HTTP 404 – nuoroda nerasta“). Tai padeda greitai sutaisyti leidimų problemas.
- Rezervinį duomenų rinkinį galite išjungti nustatymų dialoge (nuimkite pažymėjimą „Naudoti demonstracinius duomenis“), jei norite matyti tik realią klaidos būseną.

## Greitas „smoke test“ sąrašas
1. Atidarykite `index.html` ir patikrinkite, kad nauja viršutinė juosta rodo pavadinimą, būsenos juostą ir veiksmų mygtukus („Perkrauti duomenis“, filtrų suvestinę, nustatymus, TV režimą).
2. Išbandykite naują tabų juostą: pele paspauskite kiekvieną skiltį ir patikrinkite, kad puslapis sklandžiai nuslysta į atitinkamą sekciją. Tuomet fokusuokite juostą (pvz., `Tab`) ir naudokite rodyklių klavišus (`←`/`→`, `Home`, `End`) – aktyvus tabas turi keistis ir išlaikyti fokusą.
3. Paspauskite **Ctrl+,** (arba mygtuką „Nustatymai“), perjunkite akordeono sekcijas (`Enter`/`Space`) ir patikrinkite, kad formos viduje esantys laukeliai lieka fokusuojami. Pakeiskite „Analizuojamų dienų skaičius“ reikšmę ir išsaugokite – KPI kortelės bei grafikai turi persiskaičiuoti.
4. Išbandykite KPI filtrus: pasirinkite, pvz., 14 d. laikotarpį, „Naktinės“ pamainas ir „Tik GMP“ – kortelės turi persiskaičiuoti, o santrauka viršuje parodyti aktyvius filtrus. Grafikų filtrų forma turi automatiškai perimti tas pačias reikšmes be papildomo derinimo, o pacientų srautų filtrų eilutėje „Laikotarpis“, „Metai“, „Rodiklis“ ir „Detalizavimas“ grupės turi likti vienoje linijoje (iki ~1280 px pločio), siauresniuose ekranuose pereiti į horizontalaus slinkimo režimą be papildomos eilės ir išsaugoti pasirinktą būseną. Patikrinkite, kad „Laikotarpis“ kapsulės aukštis panašus į šalia esančius selektorius ir kad „Detalizavimas“ bloke matosi filtrų santrauka, pagalbos mygtukas bei detalizavimo selektoriai be netolygaus tarpo.
5. Patikrinkite „Pamainų palyginimas“ juostą – turi matytis dabartinės ir praėjusios pamainos datos, vertės bei skirtumo rodyklė. Pakeitus filtrus (pvz., pamainos tipą) juosta persiskaičiuoja.
6. Paspauskite mygtuką „Atkurti filtrus“ arba **Shift+R** – reikšmės turi grįžti į numatytąsias, KPI kortelės ir pamainų juosta persikrauna.
7. Patvirtinkite, kad „Rezultatai ir trendai“ modulis leidžia perjungti 7 d., 30 d. ir 12 mėn. vaizdus (mygtukais viršuje arba rodyklių klavišais), o lentelės persijungia be mirgėjimo.
8. Paspauskite „Atsisiųsti CSV“ (arba **Ctrl+Shift+E**) pasirinkę bent vieną laikotarpį – naršyklė turi atsisiųsti CSV failą, o po sėkmės viršuje rodomas statusas „Eksportuota...“.
9. Patikrinkite „Kas keičiasi“ bloką: perjunkite 7 d./30 d./12 mėn. laikotarpius ir įsitikinkite, kad interpretacijos tekstai atsinaujina pagal pasirinktą langą arba rodomas pranešimas apie duomenų trūkumą.
10. Patvirtinkite, kad užsikrovus duomenims KPI kortelės, grafikai ir rezultato lentelės (jei jos nepaslėptos nustatymuose) užsipildo.
11. Paspauskite „Perkrauti duomenis“ – statusas turi trumpam rodyti „Kraunama...“, po sėkmės – atnaujinimo laiką.
12. Laikinai atjunkite internetą ir spauskite „Perkrauti duomenis“ – statusas turi pereiti į oranžinę žinutę apie demonstracinius duomenis, konsolėje matysite klaidos detalizaciją.
13. (Pasirinktinai) Nustatymuose išjunkite demonstracinius duomenis ir pakartokite 10 žingsnį – statusas turi tapti raudonas su konkrečiu klaidos aprašu.
14. Aktyvuokite TV režimą mygtuku „TV režimas“ arba sparčiuoju **Ctrl+Shift+T** – turi atsirasti pilno ekrano kortelės, laikrodis ir triage pasiskirstymo juostos. Išjunkite režimą pakartotinai paspausdami mygtuką arba grįždami į „Bendrą vaizdą“.
15. Paspauskite „Pagalba“ pacientų srautų skiltyje – turi atsiverti pagalbos dialogas su grafikų legendomis, užsidaro mygtuku „X“ arba „Escape“.
16. Aktyviame „Bendras vaizdas“ skirtuke spauskite klavišus **1–6** ir **Shift+I** – fokusas turi pereiti į pasirinktas KPI korteles arba budrumo signalą, kortelės išlieka prieinamos skaitytuvams.

## Licencija
Projektas licencijuojamas pagal [MIT](./LICENSE) licenciją. Drąsiai naudokite, adaptuokite ir diekite RŠL bei kitose gydymo įstaigose.
