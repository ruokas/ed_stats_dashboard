# Stage 4 Operations & Settings Cleanup Plan

## 1. Tikslas (Purpose)
- Užbaigti `Implementation Plan` Stage 4 užduotis: sutvarkyti nustatymų langą, suderinti vertimus ir atnaujinti dokumentaciją.
- Palikti aiškius, lengvai randamus nustatymus ED komandai, kad nereikėtų techninių žinių.
- Užtikrinti, kad kiekvienas tekstas turi LT ir EN versijas, todėl ateities praplėtimai nekels painiavos.

## 2. Priklausomybės ir įėjimo kriterijai
- Stage 1–3 darbai užtikrina naują navigaciją ir turinio blokų struktūrą.
- Turime dabartinę nustatymų dialogo versiją `index.html` faile su visais aktyviais mygtukais.
- `TEXT` objektas jau turi visus raktus, bet gali būti pasenusių reikšmių arba dublikatų.

## 3. Pagrindiniai paketai (Work Packages)
### 3.1. Nustatymų dialogo pertvarka
- Išskaidyti dialogą į 4 aiškias grupes: **Duomenų šaltiniai**, **Transformacijos**, **Etiketės**, **Funkcijų jungikliai**.
- Kiekvienos grupės pavadinimas + trumpas paaiškinimas paprasta kalba; pašalinti nereikalingus tekstus.
- Pridėti akordeono logiką (atidaryti/uždaryti), kad vartotojai matytų tik reikalingą informaciją.

### 3.2. Vertimų ir numatytųjų reikšmių auditavimas
- Sudaryti raktų sąrašą iš `TEXT` objekto ir nustatymų dialogo.
- Patikrinti, ar kiekvienas naujos struktūros tekstas turi LT ir EN variantus; trūkstamus papildyti.
- Patikslinti numatytąsias reikšmes (`DEFAULT_SETTINGS`) ir pririšti jas prie naujų akordeono sekcijų.

### 3.3. Dokumentacijos atnaujinimas
- `README.md`: trumpai paaiškinti naują nustatymų dialogo išdėstymą ir kaip naudoti grupes.
- `AGENTS.md`: papildyti pastabomis apie nustatymų sekcijų struktūrą ir vertimų tvarką.
- Jei reikia, pridėti nuorodas į smoke testų sąrašą, kad būtų patikrinta nustatymų keitimo eiga.

## 4. Pakeistini failai
| Failas | Kodėl keisime |
| --- | --- |
| `index.html` | Nustatymų dialogo markup'as, akordeono elgsena, nauji `TEXT` raktai. |
| `data-worker.js` | Jei nustatymų pervadinimai ar nauji jungikliai veikia worker logiką. |
| `README.md` | Paprastas paaiškinimas, kaip naudotis naujomis nustatymų grupėmis ir kokie testai reikalingi. |
| `AGENTS.md` | Atnaujintos gairės apie tekstų raktų struktūrą ir dokumentacijos sinchronizavimą. |

## 5. Eiga (Execution Roadmap)
1. **Inventorizuoti turinį** – užsirašyti dabartines nustatymų parinktis ir jų tekstus.
2. **Sukurti naują akordeono schemą** – nubraižyti popieriuje ar skaitmeniniu įrankiu, kad būtų aiški vartotojo kelionė.
3. **Atnaujinti `index.html`** – perkelti esamus nustatymų elementus į naujas grupes, pridėti akordeono valdiklius.
4. **Suderinti `TEXT` ir `DEFAULT_SETTINGS`** – užpildyti vertimus ir numatytuosius, patikrinti, ar kodas nenaudoja senų raktų.
5. **Pataisyti worker sąsajas** – jei kuri nors parinktis keičia duomenų skaičiavimą, atnaujinti `data-worker.js`.
6. **Dokumentacija** – `README.md` ir `AGENTS.md` papildyti žingsniais ir patarimais.
7. **Greita peržiūra su komanda** – parodyti dialogą ED kolegoms, patikrinti, ar viskas suprantama.

## 6. Testavimas
- Patikrinti, ar kiekvienas akordeonas atsidaro klaviatūra (`Tab`, `Enter`, `Space`).
- Keisti kiekvieną nustatymą ir įsitikinti, kad reikšmės išsaugomos ir veikia grafikuose/KPI.
- Pabandymui išjungti internetą ir įsitikinti, kad nustatymai vis tiek kraunasi iš saugomų reikšmių.
- Perbėgti README smoke testus, pridėti papildomą žingsnį „Patikrinti nustatymų grupes“.

## 7. Rizikos ir prevencija
- **Per daug tekstų vienoje grupėje** → naudoti paprastus paaiškinimus, o išsamią informaciją perkelti į README.
- **Pamesti senus raktus** → prieš tryniant palyginti `TEXT` objektą su ankstesne versija, naudoti paiešką `rg`.
- **Akordeonas neveikia be JS** → numatyti, kad pagal nutylėjimą visos grupės būtų atviros, jei skriptas nepasileidžia.

## 8. Ką pasiruošti iš anksto
- Surinkti grįžtamąjį ryšį iš skyriaus vadovų, kurios nustatymų grupės jiems svarbiausios.
- Patikrinti, ar yra senų dokumentų ar „cheat sheet“, kuriuos reikės suderinti su nauja struktūra.
- Paruošti trumpą demonstraciją (pvz., „nustatyti naują duomenų šaltinį“), kad testuotojai žinotų, ką spausti.
