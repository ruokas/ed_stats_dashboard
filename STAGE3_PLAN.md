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
- **Struktūra ir turinys**
  - Išdėstyti korteles dviejų eilučių tinkleliu: viršuje keturi momentiniai KPI, apačioje dvi platesnės „sisteminės“ kortelės (pvz., lovų apkrova, laukimo laikas). Išlaikyti maksimaliai 6 korteles, kad atminties ir „above the fold“ plotis nesikeistų.
  - Kiekvienai kortelei suteikti `data-kpi-key` atributą, kad būtų galima tiesiogiai atnaujinti iš worker'io ir išlaikyti Stage 2 suvienodintus `dashboardState` kelius.
- **Dinamika ir palyginimai**
  - Įtraukti procentinę ar absoliučią dinamiką (pagal KPI tipą) su aiškiu žymėjimu „↑“ / „↓“ ir `aria-live="polite"` srityje, kad pagalbinės technologijos praneštų apie pokyčius keičiantis filtrams.
  - Pridėti mini „paskutinės 24 h“ sparkline vietos rezervaciją kortelės dešinėje (tik markup + `data-sparkline-target`, realus grafikas bus įdiegtas Stage 4 jei reikės).
- **Sugeneruotos įžvalgos**
  - „Budrumo“ kortelę perkelti po KPI tinkleliu ir pateikti kaip `role="status"` elementą su trijų dalių tekstu: santrauka, priežastis, rekomenduojamas veiksmas. Naudoti `TEXT.INSIGHTS.overview.alert`, `...reason`, `...action` raktus (LT/EN poros).
  - Numatyti papildomą vietą antrajai automatinei įžvalgai (pvz., „Stebėti pacientų srauto piką“), kurią galima įjungti feature flag'u `INSIGHTS_EXTRA_ENABLED`.
- **Pamainų juosta**
  - Kompaktiška strip juosta po įžvalgų kortele: kairėje dabartinės pamainos pagrindinis KPI (pvz., aptarnauti pacientai), dešinėje ankstesnės pamainos reikšmė ir skirtumas su spalviniu indikatoriumi.
  - Juostos markup'e rezervuoti `button` su `data-tv-preview-trigger` kad Stage 5 metu būtų galima išplėsti į TV režimą be DOM pertvarkymo.
- **Sąveikos ir prieinamumas**
  - Įtraukti klavišų šauktinius: `1–6` perjungia fokusą tarp KPI kortelių, `Shift+I` – fokusuoja įžvalgų kortelę. Visi elementai turi gauti `tabindex="0"` tik jei ne interaktyvūs.
  - Patikrinti, kad `aria-describedby` jungia dinaminius tekstus su procentine dinamika ir įžvalgomis; teksto spalvų kontrastas ≥ 4.5:1.

### 3.2. Patient Flow (prototipo `.tab-panel#flow`)
- **Struktūra ir komponavimas**
  - Trijų segmentų stulpelis: viršuje „Real-time srautas“, viduryje „Dienos dinamika“, apačioje „Kelio kliūtys“ (funnel arba heatmap).
  - Kiekvienas segmentas turi `data-flow-block` atributą (`realtime`, `daily-trend`, `bottlenecks`) kad worker galėtų atsiųsti tik reikiamą fragmentą.
  - Viršutinė dalis turi `aria-live="polite"` sumariklę (pacientai per paskutines 15 min), kad girdėtų ir matytų reagavimo komandų pokyčius.
- **Bendra įrankių juosta**
  - Vienas `form` su `role="toolbar"`, viduje `fieldset` pasirinkimams: laiko intervalas (`select`), grupavimas (`radio`), vienetai (`toggle`).
  - Visi valdikliai rišami prie `dashboardState.flowControls` ir sinchronizuojami su Stage 2 globaliu filtru (laiko/skyrių apribojimai).
  - Numatyti `data-analytics-key` atributus, kad būtų galima loginti pasirinkimus be papildomo DOM.
- **Vizualizacijos ir anotacijos**
  - Realtime blokas turi „žalios/oranžinės/raudonos“ indikatorių juostą su procentinėmis ribomis (`< 70`, `70–90`, `> 90`).
  - Dienos trendui rezervuojame `canvas` elementą su `data-trend-target` (Stage 4 grafikas), apačioje lentelės mini santrauką (`tbody` su 3–4 eilutėm).
  - Funnel / heatmap zona turi `figure` su `figcaption`, kuriame `TEXT.LEGENDS.flow` paaiškinimai, taip pat `button` su `data-help` (aktyvuojamas `?`).
- **Sąveika ir našumas**
  - Didesnius duomenų atnaujinimus throttle'iname `requestAnimationFrame` pagrindu: worker siunčia `flow:update`, UI praleidžia rėmus jei per dažnai.
  - Klavišų šauktiniai: `F` fokusuoja toolbar, `Shift+F` pereina tarp segmentų (`data-flow-block`).
  - Lazy-load'iname dienos trendą tik kai panelė matoma (`IntersectionObserver` hookas užregistruotas Stage 2 bazėje).

### 3.3. Performance & Trends (prototipo `.tab-panel#trends`)
- **Komponentų skeletas**
  - Viršuje `tabs` (`button` elementai) 7d / 30d / 12m, su `aria-controls` ir `data-range-key` atributais; pagal pasirinkimą kraunamos sekcijos.
  - Centras – dviejų dalių modulis: kairėje linijinė diagrama (`canvas`), dešinėje KPI lentelė (`table`) su `data-metric-id` eilutėmis.
  - Apačioje `section` „Interpretacijos“ su dviem kortelėm („Pagerėjimai“, „Rizikos“), kiekviena turi `aria-live` „off“ (static) ir `data-insight-source`.
- **Duomenų atnaujinimas**
  - Worker siunčia `trends:update` su `range`, `series`, `tableRows`, `insights`; UI turi atskiras render funkcijas, kad vieno atnaujinimo klaida nesustabdyti kitų.
  - CSV eksportas aktyvinamas `button[data-export-csv]`; nuspaudus, `data-worker` gauna `trends:export` su dabartiniu `dashboardState`.
  - Lentelėje įdėti `th scope="row"` su papildomu `span` „% pokytis“ stulpeliui, kad ekraniniai skaitytuvai suprastų santykį.
- **Pagalba ir dokumentacija**
  - Greta eksportavimo mygtuko rodyti tekstą `TEXT.MESSAGES.exportHint` (LT/EN) apie aktyvius filtrus.
  - Prie tabs įtraukti `button` su `title` + `aria-describedby` į tooltips (`TEXT.TOOLTIPS.trendsRange`).
  - Užfiksuoti `Ctrl+E` klavišą eksportui ir `Alt+ArrowLeft/Right` diapazonų keitimui.

### 3.4. Experience (prototipo `.tab-panel#experience`)
- **Kortelių išdėstymas**
  - Vieno stulpelio `grid` su keturiais blokais: `sentiment-summary`, `nps-score`, `trend-chart`, `recent-comments`.
  - Viršuje sentiment kortelė (3 indikatoriai: teigiami, neutralūs, neigiami), kiekvienas su `aria-label` ir `data-sentiment-key`.
  - NPS turi `progress` elementą su `max="100"`, papildomas tekstas `TEXT.EXPERIENCE.npsHelp`.
- **Komentarų sąrašas**
  - `recent-comments` sudaro `ul` su `li` kortelėm: vardas (pseudonimas), data, kategorija, tekstas; `button` „Žymėti peržiūrėta“ su `data-mark-seen`.
  - Slėpti jautrius komentarus: `toggle` (`input type="checkbox"`) su `data-hide-sensitive`, UI rodo placeholder „[Paslėptas]“.
  - Live feed (papildoma užduotis) – `section` su `aria-live="assertive"`, `data-live-feed`, rodomas tik kai `LIVE_FEED_ENABLED`.
- **Filtrai ir sąveika**
  - Viršuje kompaktiška filtrų juosta (`form`), laukai: `select` skyriui, `input type="search"` raktiniam žodžiui (debounce 300 ms), `checkbox` jautrumui.
  - Klavišų šauktiniai: `/` fokusuoja paiešką, `Ctrl+Shift+L` perjungia live feed, `Alt+N` fokusuoja NPS kortą.
  - LocalStorage talpina paskutinį filtrą `experienceFilters`, su „Išvalyti“ mygtuku atstatymui.
- **Prieinamumas**
  - Užtikrinti, kad komentarų tekstas turi `lang` atributą jei nustatomas kitoks nei LT.
  - `aria-expanded` rodoma ant „Rodyti daugiau“ (fold) kontrolės, `aria-controls` sieja su papildomu turiniu.

### 3.5. Operations / TV (prototipo `.tab-panel#ops`)
- **Statuso kortos**
  - Trys kortelės vienoje eilėje (`grid`): „Duomenų atnaujinimas“, „CSV kokybė“, „TV rotacija“.
  - Kiekviena korta turi `data-ops-key` ir `role="status"`; pranešimai atnaujinami iš worker `ops:update`.
  - Įtraukti indikatorius (`svg` ikonėlės) su spalvine koduote (žalia/geltona/raudona), pateikiant `aria-label`.
- **TV peržiūra**
  - `iframe` placeholder'į keičia `div` su `data-tv-preview`, viduje 3 mini kadrai (Overview, Flow, Experience) atvaizduojami kaip `picture`/`img`.
  - Po preview – `button` „Atidaryti TV režimą“ su `data-tv-launch`, `Ctrl+T` klavišas.
  - Pridėti `TEXT.OPERATIONS.tvHint` tekstą apie papildomus leidimus (pvz., naršyklės lango viso ekrano režimą).
- **Checklist ir audit trail**
  - Dviejų stulpelių sąrašas: „Paruošta“ (`ul` su `li` + data), „Reikia dėmesio“ (`ul` su `li` + `button data-acknowledge`).
  - Fiksuoti veiksmus `opsLog` objekte (localStorage) su paskutinių 10 įrašų lentele apačioje.
  - Užtikrinti, kad `aria-describedby` sujungia elementus su datų formatavimo tekstais (`TEXT.FORMATS.dateLong`).

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
