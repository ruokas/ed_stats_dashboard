# Pritaikymas kitai ligoninei

Šis dokumentas aprašo trumpiausią kelią paruošti naują šio projekto kopiją kitai ligoninei nekeičiant runtime / worker kodo.

## Paskirtis

Numatytas scenarijus:

1. Nukopijuojate repo.
2. Susikuriate savo `config.json` pagal `docs/config-starter.json`.
3. Pakeičiate CSV šaltinius, CSV stulpelių pavadinimus ir matomus tekstus.
4. Patikrinate konfigūraciją komanda `npm run config:check`.

## Failų rolės

- `config.json`: aktyvi diegimo konfigūracija (esamas projektas naudoja šį failą pagal nutylėjimą)
- `docs/config-starter.json`: neutralus šablonas naujai ligoninei
- `docs/config-baseline.json`: esamos konfigūracijos bazinė ištrauka / istorinis pavyzdys

## Greitas pritaikymo srautas

1. Nukopijuokite `docs/config-starter.json` į `config.json`.
2. Užpildykite `dataSource.*.url` reikšmes (publikuoti CSV URL).
3. Suderinkite `csv.*` laukus pagal jūsų CSV stulpelių pavadinimus.
4. Pakeiskite `output.*` tekstus (antraštės, subtitrai, skirtukų pavadinimai).
5. Paleiskite `npm run config:check`.
6. Paleiskite lokalų HTTP serverį ir atlikite smoke test.

## „Customize-first“ konfigūracijos laukai

### Privalomi minimaliai veikiančiai kopijai

- `dataSource.url`
- `dataSource.feedback.url`
- `dataSource.ed.url`
- `csv.arrival`
- `csv.discharge`
- `csv.gmp`
- `csv.department`
- `csv.number`
- `csv.closingDoctor`

### Dažniausiai keičiami (branding / UI)

- `output.pageTitle`
- `output.title`
- `output.subtitle`
- `output.kpiSubtitle`
- `output.chartsSubtitle`
- `output.recentSubtitle`
- `output.monthlySubtitle`
- `output.yearlySubtitle`
- `output.feedbackSubtitle`
- `output.footerSource`
- `output.tabOverviewLabel`
- `output.tabEdLabel`
- `output.edTitle`

### Pasirenkami / priklausomi nuo duomenų

- `dataSource.historical.enabled`
- `dataSource.historical.url`
- `dataSource.historical.label`
- `csv.dayNight` (jei nenaudojate atskiro diena/naktis stulpelio)
- `csv.hospitalizedValues` (jei hospitalizacija žymima aiškiomis reikšmėmis)

## CSV šaltinių reikalavimai

### Google Sheets (rekomenduojama)

- Naudokite „Publish to web“ ir CSV formatą.
- URL turi būti viešai pasiekiamas be prisijungimo.
- Naudokite galutinį publikuotą CSV URL (`...output=csv`).

### Dažnos problemos

- `403`: nepakanka bendrinimo teisių / nepublikuota viešai
- `404`: neteisinga nuoroda arba ne tas `gid`
- HTML vietoje CSV: naudotas sheet peržiūros URL, o ne publikuotas CSV URL
- CORS klaidos: šaltinis neleidžia kryžminių užklausų

## CSV laukų suderinimas

Pavyzdys, jei jūsų CSV naudoja kitokius pavadinimus:

- `csv.arrival`: `"Arrival DateTime"`
- `csv.discharge`: `"Discharge DateTime"`
- `csv.gmp`: `"EMS"`
- `csv.department`: `"Disposition Department"`
- `csv.number`: `"Visit ID"`
- `csv.closingDoctor`: `"Attending Physician"`

Svarbu: reikšmės turi tiksliai sutapti su CSV antraštėmis.

## Konfigūracijos patikra

Vykdykite prieš paleidimą / PR:

```bash
npm run config:check
```

Alternatyvus failas:

```bash
node scripts/check-hospital-config.mjs docs/config-starter.json
```

## Lokalioji smoke patikra

1. Paleiskite HTTP serverį (ne `file://`), pvz. `npx http-server .`
2. Atidarykite `index.html`.
3. Patikrinkite, kad užsikrauna antraštė, KPI, statuso eilutė.
4. Atidarykite `charts.html`, `recent.html`, `summaries.html`, `feedback.html`, `ed.html`.
5. Patikrinkite naršyklės `Console` ir `Network` (CSV užklausas, 403/404/CORS/HTML atsaką).

## Pastaba dėl gydytojų specialybių

Šiame paruošimo etape `doctors.specialties.assignments` nėra automatizuojamas kitai ligoninei.
Jei gydytojų specialybių puslapis nereikalingas iškart, galite laikyti `doctors.specialties.enabled = false`.
