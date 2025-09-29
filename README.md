# RŠL SMPS statistika

Modernizuotas vieno HTML failo informacinis skydelis, kuris užkrauna neatidėliotinos pagalbos skyriaus duomenis iš „Google Sheets“ CSV ir pateikia pagrindinius rodiklius, grafikus, paskutinės savaitės kasdienę ir savaitinę suvestines.

## Savybės
- 🔄 Vienas HTML failas be papildomų priklausomybių (Chart.js kraunamas iš CDN per klasikinį `<script>`, kad neliktų CORS/MIME kliūčių).
- 📊 KPI kortelės su aiškia „Metinis vidurkis“ eilute ir mėnesio palyginimu, stulpelinė bei linijinė diagramos, paskutinės 7 dienos ir savaitinė lentelės.
- 🗓️ KPI laikotarpio filtras leidžia pasirinkti iki 365 d. langą arba matyti visus duomenis vienu paspaudimu.
- 🎯 Interaktyvūs KPI filtrai (laikotarpis, pamaina, GMP, išvykimo sprendimas) su aiškia santrauka ir sparčiuoju **Shift+R**.
- 🧭 LT lokalė, aiškūs paaiškinimai, pritaikyta klaviatūros ir ekrano skaitytuvų naudotojams.
- 🖥️ Reagavimas į ekranų pločius (desktop, planšetė, telefonas), „prefers-reduced-motion“ palaikymas.
- 🛡️ Automatinis demonstracinių duomenų rezervas ir aiškios klaidų žinutės, padedančios diagnozuoti „Google Sheets“ publikavimo problemas.
- ⚙️ Nustatymų dialogas (Ctrl+,) CSV laukų, skaičiavimo logikos ir išvesties tekstų pritaikymui be kodo keitimo (saugoma `localStorage`).
- 📈 Vidutinės buvimo trukmės apskaičiavimas automatiškai ignoruoja >24 val. įrašus, kad ekstremalios vertės nedarkytų rodiklių.
- 🛏️ Integruotas lovų užimtumo CSV – kasdieniame grafike greta ED pacientų vidurkio rodoma lovų apkrova (%), leidžianti matyti perkrovos riziką.

## Diegimas
1. Atsisiųskite saugomą saugyklą arba jos ZIP: `git clone https://example.com/ed_stats_dashboard.git`.
2. Atidarykite `index.html` pasirinktoje naršyklėje (Chrome, Edge, Firefox).
3. Greiti pakeitimai atliekami per nustatymų dialogą (mygtukas „Nustatymai“ viršuje dešinėje arba trumpinys **Ctrl+,**). Čia galite įklijuoti naują CSV nuorodą, perjungti demonstracinius duomenis ar pakeisti stulpelių pavadinimus.

## Konfigūracija
- Tekstai (LT, su kabliuku EN) – `TEXT` objektas `index.html` viršuje arba nustatymų dialoge nurodyti pavadinimai/paantraštės.
- Duomenų šaltinis, lovų užimtumo ir atsiliepimų CSV su demonstraciniais rinkiniais – nustatymų dialogas („Duomenų šaltinis“, „Lovų užimtumo duomenys“ ir „CSV stulpelių atitikimas“ skyriai).
- GMP laukas numatytai atpažįsta reikšmes „GMP“, „su GMP“ ir „GMP (su GMP)“, o tuščias hospitalizavimo stulpelis reiškia išrašytą pacientą.
- Spalvų schema ir kampai – CSS kintamieji `:root` bloke (`index.html`).
- Grafikai – Chart.js nustatymai `renderCharts()` funkcijoje (`index.html`).

### Nustatymų meniu

Dialogas leidžia neredaguojant kodo keisti:

1. **Duomenų šaltinį** – CSV nuorodą, demonstracinių duomenų būseną ir turinį.
2. **CSV stulpelių atitikimą** – laukų pavadinimus (galimi keli sinonimai, atskirti `,` arba `|`), „taip“ reikšmes, dienos/nakties raktažodžius.
3. **Skaičiavimo logiką** – analizuojamų dienų skaičių, „Paskutinių dienų“ lentelės ilgį, nakties pradžios ir pabaigos valandas.
4. **Išvesties tekstus** – hero pavadinimą, sekcijų antraštes, apatinius prierašus ir lentelių rodymo jungiklius.

Visi pakeitimai saugomi naršyklės `localStorage` ir gali būti atstatyti mygtuku **„Atstatyti numatytuosius“**.

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
6. Įsitikinkite, jog dienos grafike matote dvi ašis: stulpelius su vidutiniu ED pacientų skaičiumi ir liniją su lovų užimtumu (%).
7. Paspauskite „Perkrauti duomenis“ – statusas turi trumpam rodyti „Kraunama...“, po sėkmės – atnaujinimo laiką.
8. Laikinai atjunkite internetą ir spauskite „Perkrauti duomenis“ – statusas turi pereiti į oranžinę žinutę apie demonstracinius duomenis, konsolėje matysite klaidos detalizaciją.
9. (Pasirinktinai) Nustatymuose išjunkite demonstracinius duomenis ir pakartokite 8 žingsnį – statusas turi tapti raudonas su konkrečiu klaidos aprašu.

## Licencija
Projektas licencijuojamas pagal [MIT](./LICENSE) licenciją. Drąsiai naudokite, adaptuokite ir diekite RŠL bei kitose gydymo įstaigose.
