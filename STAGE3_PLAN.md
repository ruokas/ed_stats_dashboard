# Stage 3 Section Rebuild Plan

## 1. Tikslas (Purpose)
- Užbaigti `Implementation Plan` Stage 3 punktus: aiškūs KPI, naratyvinis srautas, sutraukti moduliai ir vieninga patirčių zona.
- Užtikrinti, kad Stage 1–2 sukurtos struktūros (top bar, tab bar, globalus filtras) būtų pilnai užpildytos turiniu `layout_prototype.html` nurodyta seka.
- Išlaikyti žemas įdiegimo sąnaudas: minimalios priklausomybės, pernaudojamos esamos worker funkcijos ir tekstų žemėlapiai.

## 2. Priklausomybės ir įėjimo kriterijai
- Stage 2 top baras ir globalus filtro valdiklis veikia visose sekcijose.
- Turime patvirtintą KPI sąrašą (Stage 0/1 išvados) ir duomenų laukus `data-worker.js` pusėje.
- Demo CSV turi laukus pamainų palyginimui, tendencijų skaičiavimui ir komentarų metaduomenims (sentimentas, data, tipas).

## 3. Pagrindiniai paketai (Work Packages)
### 3.1. Overview (prototipo `.tab-panel#overview` atitikmuo)
- **KPI kortelės**: palikti 6 aukšto signalo rodiklius su procentine dinamika ir `aria-live` atnaujinimu.
- **Sugeneruotos įžvalgos**: „Budrumo“ kortelė, kuri iš Stage 2 bendrų skaičiavimų pateikia tekstinę išvadą (naudoti `TEXT.INSIGHTS`).
- **Pamainų juosta**: kompaktiška strip juosta su dabartine/praėjusia pamaina ir skirtumu; laikyti vietos papildomam „TV mode“ režimui.

### 3.2. Patient Flow (prototipo `.tab-panel#flow`)
- **Naratyvinis stulpelis**: iš viršaus realaus laiko indikatorius, po juo dienos trendas, apačioje funnel / heatmap.
- **Bendra įrankių juosta**: vienas komponentas laiko intervalui, grupavimui ir vienetams; prisijungia prie Stage 2 filtro būsenos.
- **Legendos ir anotacijos**: trumpi paaiškinimai iš `TEXT.LEGENDS`, prie kiekvieno grafiko pridėti pagalbos mygtuką (? klavišo sparčiuoju).

### 3.3. Performance & Trends (prototipo `.tab-panel#trends`)
- **Sujungtas modulis**: vienas komponentas su 7d / 30d / 12m perjungimu; atsinaujina lentelės ir grafikai kartu.
- **Eksportas**: CSV eksportas naudojamas esamą worker logiką; pridėti „Pastaba: eksportas pagal aktyvų filtrą“ tekstą.
- **Interpretacijos**: trumpi tekstiniai blokai „Kas pagerėjo / kas blogėja“, duomenys generuojami worker'iui apskaičiavus skirtumus.

### 3.4. Experience (prototipo `.tab-panel#experience`)
- **Kortelių išdėstymas**: sentimentas, NPS, trend grafikas ir naujausių komentarų sąrašas vienoje kolonėlėje su „fold“ galimybe.
- **Filtrai**: sutraukta filtrų juosta, paieška pagal raktinį žodį (debounce), jungiklis „Paslėpti jautrius komentarus“ (ON by default).
- **Papildoma užduotis** *(jei lieka laiko)*: naujausias-komentarų feed su `aria-live` ir „peržiūrėta“ žymomis.

### 3.5. Operations / TV (prototipo `.tab-panel#ops`)
- **Statuso kortos**: duomenų atnaujinimo būsena, CSV kokybės indikatoriai, TV rotacijos trukmė.
- **TV peržiūra**: mini išdėstymo peržiūra su CTA „Atidaryti TV režimą“.
- **Checklist**: aiškūs punktai „Kas pasirengę“ ir „Kas reikalauja dėmesio“ su datomis/laikais.

## 4. Pakeistini failai
| Failas | Paskirtis |
| --- | --- |
| `index.html` | Sekcijų markup, `aria` atributai, LT/EN tekstai, filtrų/toolbar komponentai pagal tab panelių tvarką. |
| `data-worker.js` | KPI, trendų ir interpretacijų skaičiavimai, eksportui paruošti duomenys. |
| `styles.css` *(inline ar atskiras blokas `index.html`)* | Tinklelio, strip juostos, legendų, komentarų sąrašo stiliai. |
| `README.md` | Atnaujinti navigacijos aprašymą, smoke testų sąrašą, naujus karštuosius klavišus. |
| `TEXT` objektas `index.html` skripte | Nauji LT tekstai + hook'ai EN versijai, legendos, tooltip'ai. |

## 5. Eiga (Execution Roadmap)
1. **Skeleton & tekstai** – į `index.html` įdėti kiekvienos `.tab-panel` struktūrą su lietuviškais placeholderiais ir `data-panel` atributais.
2. **Overview logika** – prijungti KPI, įžvalgas ir pamainų strip juostą prie worker rezultatų; patikrinti `aria-live` veikimą.
3. **Patient Flow naratyvas** – pergrupuoti grafikus, sujungti toolbar, parašyti legendas; naudoti `requestAnimationFrame` throttlingą.
4. **Performance & Trends modulis** – suvienodinti perjungimus, įdėti eksportą ir interpretacijų bloką.
5. **Experience zona** – atnaujinti korteles, komentarų sąrašą, filtrus ir pasirenkamą live feed.
6. **Operations / TV** – įdėti statuso kortas, TV peržiūrą ir checklistą; sujungti su TV režimo logika.
7. **A11y + klavišai** – `aria` atributai, fokusų tvarka, klavišų trumpiniai (`/`, `Ctrl+K`, `?`).
8. **Dokumentacija** – README, smoke checklist, nuoroda į Implementation Plan Stage 3 įvykdymą.

## 6. Testavimas
- Perbėgti README smoke testus ir papildomai:
  - KPI kortelės atnaujėja keičiant globalų filtrą; `aria-live` praneša pokyčius.
  - Patient Flow grafikai persikrauna ir rodo bendrą toolbar pasirinkimą.
  - CSV eksportas atitinka pasirinktą laikotarpį ir aktyvius filtrus.
  - Jautrių komentarų slėpimas veikia, indikatoriai matomi klavišais ir pele.
  - Ops tabo checklistas atsinaujina pagal paskutinius worker duomenis.
  - Klavišų sparčiuosius (`/`, `Ctrl+K`, `?`) perima atitinkamos funkcijos.
  - Responsyvumas 1440px, 1024px, 768px, 414px pločiuose.

## 7. Rizikos ir prevencija
- **Per lėtas užkrovimas** → skaičiavimus palikti worker'yje, UI throttle'inti atnaujinimus (`requestAnimationFrame`).
- **Tekstų nesuderinamumas** → LT/EN tvarkymas viename `TEXT` žemėlapyje, prieš commit palyginti su Stage 1/2 raktų sąrašu.
- **Duomenų spragos CSV** → numatyti fallback pranešimus legendose, README dokumentuoti minimalų laukų rinkinį.
- **Toolbar dublikatai** → iš anksto suderinti atributus su Stage 2 komponentu, kad nekiltų konflikto.

## 8. Ką pasiruošti iš anksto
- Patvirtinti KPI pavadinimus ir vienetus su ED vadovu (jei keičiasi – atnaujinti `TEXT`).
- Surinkti anoniminius komentarus sentimentų testavimui ir trend grafikui.
- Patikrinti worker duomenų struktūrą: ar yra laukų pamainų palyginimui ir interpretacijų generavimui.
- Paruošti QA sąrašą Stage 5 etapui (kas bus tikrinama prieš pristatymą).
