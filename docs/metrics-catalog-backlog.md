# Metrics Catalog techninis backlog

## Tikslas
Sukurti vieningą `metrics catalog` sluoksnį, kad KPI, grafikai ir suvestinės naudotų tas pačias metrikų definicijas (raktai, formulės, vienetai, validacijos, UI metaduomenys), vietoje išbarstytų aprašų `constants.js` ir runtime moduliuose.

## Scope (MVP)
- Katalogas frontende (be backend), versijuojamas repozitorijoje.
- Metrikų registras KPI + heatmap + daliai suvestinių.
- Runtime validacija (schema + semantinės taisyklės).
- Vienas centralizuotas formatavimo/label API.
- Migracija nuo hardcodintų sąrašų (`TEXT.kpis.cards`, `heatmapMetricOptions` ir pan.) į katalogą.

## Out of scope (MVP)
- Vartotojo UI metrikų kūrimui.
- RBAC / permissions.
- Pilnas formulų DSL su parseriu.

## Epic 1: Katalogo modelis ir schema

### T1.1 Sukurti metrikos domeno modelį
- Aprašas:
  - Įvesti tipizuotą (JSDoc) modelį: `id`, `version`, `domain`, `aggregationLevel`, `valueType`, `unit`, `label`, `description`, `format`, `dependencies`, `computeKey`, `visibility`, `tags`.
- Pakeitimai:
  - Naujas: `src/metrics/catalog-types.js`
  - Naujas: `src/metrics/README.md`
- Priėmimo kriterijai:
  - Bent 10 metrikų aprašyta per modelį (KPI + chart).
  - `npm run typecheck` praeina.

### T1.2 Įdiegti katalogo schemą ir validaciją
- Aprašas:
  - Sukurti `validateMetricDefinition` ir `validateCatalog`, tikrinančius privalomus laukus, unikalius ID, leidžiamas `valueType/format` kombinacijas.
- Pakeitimai:
  - Naujas: `src/metrics/catalog-validate.js`
  - Naujas: `tests/data/metrics-catalog-validate.test.js`
- Priėmimo kriterijai:
  - Neteisingas katalogas meta aiškią klaidą su metrikos `id`.
  - Testuose padengti bent 5 invalid scenarijai.

### T1.3 Sukurti pradinį katalogo failą
- Aprašas:
  - Įvesti vieną centralizuotą katalogą su MVP metrikomis:
    - KPI: `total`, `night`, `avgTime`, `discharged`, `hospitalized`
    - Heatmap: `arrivals`, `discharges`, `hospitalized`, `avgDuration`
    - Recent: `emsShare`, `hospShare`
- Pakeitimai:
  - Naujas: `src/metrics/catalog.js`
  - Naujas: `src/metrics/index.js`
- Priėmimo kriterijai:
  - Katalogas kraunasi per vieną import tašką.
  - Startup metu validacija vyksta be klaidų.

## Epic 2: Compute registry ir skaičiavimo sujungimas

### T2.1 Įdiegti compute registry
- Aprašas:
  - Susieti `computeKey` su skaičiavimo funkcijomis (`fromLastShiftSummary`, `fromDailyStats`, `fromHeatmapCell`).
- Pakeitimai:
  - Naujas: `src/metrics/compute-registry.js`
  - Pakeisti: `src/app/runtime/runtimes/kpi-runtime.js`
  - Pakeisti: `src/app/runtime/runtimes/charts-runtime-impl.js`
- Priėmimo kriterijai:
  - KPI ir heatmap duomenys skaičiuojami per registry adapterį, ne per hardcode sąrašus.
  - Esami UI skaičiai nesikeičia (regresijos testai).

### T2.2 Įvesti centralų metric resolver
- Aprašas:
  - `resolveMetric(metricId, context)` grąžina `value`, `formattedValue`, `unit`, `label`, `status`.
- Pakeitimai:
  - Naujas: `src/metrics/resolve-metric.js`
  - Naujas: `tests/runtime/metric-resolver.test.js`
- Priėmimo kriterijai:
  - Resolver tvarko `no-data` būseną vienodai visur.
  - `format` logika nebekartojama keliuose runtime.

## Epic 3: UI migracija į katalogą

### T3.1 KPI kortelių migracija
- Aprašas:
  - `TEXT.kpis.cards` palikti tik kaip fallback; pagrindinis šaltinis – katalogas.
  - `kpi-model` statyti korteles pagal `metric ids`.
- Pakeitimai:
  - Pakeisti: `src/render/kpi-model.js`
  - Pakeisti: `src/render/kpi.js`
  - Pakeisti: `src/app/constants.js` (pašalinti dubliavimą, palikti i18n tekstus)
  - Naujas testas: `tests/runtime/kpi-model-catalog.test.js`
- Priėmimo kriterijai:
  - KPI kortelių tvarka valdoma kataloge.
  - Vieno metric label pakeitimas kataloge atsispindi UI be papildomų pakeitimų.

### T3.2 Heatmap metric selector migracija
- Aprašas:
  - `heatmapMetricOptions`, `units`, `descriptions` traukti iš katalogo.
- Pakeitimai:
  - Pakeisti: `src/app/runtime/runtimes/charts-runtime-impl.js`
  - Pakeisti: `src/app/constants.js`
  - Naujas testas: `tests/runtime/charts-metric-catalog.test.js`
- Priėmimo kriterijai:
  - Heatmap rodiklių dropdown pilnai generuojamas iš katalogo.
  - Nebelieka hardcodintų heatmap metric žemėlapių runtime faile.

### T3.3 Recent/summaries minimali integracija
- Aprašas:
  - Bent 2 additional puslapiai naudoja katalogo `label/unit/format`.
- Pakeitimai:
  - Pakeisti: `src/app/runtime/runtimes/recent-runtime.js`
  - Pakeisti: `src/state/selectors/pages/summaries.js`
- Priėmimo kriterijai:
  - `compare.metrics.*` tekstai sutampa su katalogo aprašais.
  - Nėra dvigubų tų pačių metrikų label definicijų.

## Epic 4: Konfigūracija, kokybė ir DX

### T4.1 Konfigūracijos tiltas su `config.json`
- Aprašas:
  - Įvesti optional `metrics` sekciją `config.json`:
    - `enabledMetricIds`
    - `overrides` (`label`, `target`, `warnThreshold`)
- Pakeitimai:
  - Pakeisti: `config.json`
  - Pakeisti: `src/app/runtime/settings.js`
  - Naujas: `src/metrics/catalog-overrides.js`
  - Naujas testas: `tests/runtime/metrics-config-overrides.test.js`
- Priėmimo kriterijai:
  - Išjungta metrika nerodoma UI, bet sistema nestabdo.
  - Blogas override meta aiškią klaidą per status UI.

### T4.2 Build-time katalogo check script
- Aprašas:
  - Sukurti scriptą, kuris validuoja katalogą CI metu.
- Pakeitimai:
  - Naujas: `scripts/check-metrics-catalog.mjs`
  - Pakeisti: `package.json` (`metrics:check`, įtraukti į `check:strict`)
- Priėmimo kriterijai:
  - CI krenta esant invalid katalogui.
  - Scriptas grąžina ne-0 kodą klaidos atveju.

### T4.3 Dokumentacija komandos darbui
- Aprašas:
  - Kaip pridėti naują metriką (required fields, naming, tests, review checklist).
- Pakeitimai:
  - Naujas: `docs/metrics-catalog-guide.md`
  - Pakeisti: `README.md` (nuoroda į guide)
- Priėmimo kriterijai:
  - Yra aiškus „new metric checklist“.
  - Naujas komandos narys gali pridėti metriką be runtime hardcode redagavimo.

## Epic 5: Testai ir regresijos apsauga

### T5.1 Unit testai katalogui
- Failai:
  - `tests/data/metrics-catalog-validate.test.js`
  - `tests/runtime/metric-resolver.test.js`
- Kriterijai:
  - Padengti schema, resolver no-data, formatter edge atvejai.

### T5.2 Integraciniai testai runtime migracijoms
- Failai:
  - `tests/runtime/kpi-model-catalog.test.js`
  - `tests/runtime/charts-metric-catalog.test.js`
  - Papildymai: `tests/runtime/kpi-renderer.test.js`, `tests/runtime/charts-runtime-interactions.test.js`
- Kriterijai:
  - UI renderina tas pačias reikšmes kaip iki migracijos.
  - Dropdown/kortelių elgsena išlieka stabili.

### T5.3 Snapshot/regression baseline
- Aprašas:
  - Išsaugoti kritinių KPI ir heatmap render baseline (tekstiniai assertionai, ne trapūs HTML snapshotai).
- Kriterijai:
  - Matoma, kada metrika pakeitė formulę ar etiketę.

## Siūlomas įgyvendinimo eiliškumas (2 sprintai)

### Sprint 1 (architektūra + KPI)
- T1.1, T1.2, T1.3
- T2.1, T2.2
- T3.1
- T5.1 (dalis), T5.2 (KPI dalis)

### Sprint 2 (charts + config + DX)
- T3.2, T3.3
- T4.1, T4.2, T4.3
- T5.1/T5.2 likutis + T5.3

## Priklausomybės
- T2.* priklauso nuo T1.3.
- T3.1 priklauso nuo T2.2.
- T3.2 priklauso nuo T2.1.
- T4.1 rekomenduojama po T3.1/T3.2, kad nebūtų dvigubo migravimo.

## Rizikos ir mitigacija
- Rizika: skaičių regresijos KPI kortelėse.
  - Mitigacija: prieš/po assertion testai `kpi-runtime` ir `kpi-model`.
- Rizika: dubliuoti label tarp `TEXT` ir katalogo.
  - Mitigacija: aiški taisyklė: metric label/unit tik kataloge; `TEXT` tik UI frazėms.
- Rizika: per didelis scope.
  - Mitigacija: MVP apriboti iki KPI + heatmap + recent.

## Definition of Done (viso epic paketo)
- Visos KPI ir heatmap metrikos deklaruotos `src/metrics/catalog.js`.
- Nėra hardcodintų metrikų sąrašų `kpi-model` ir `charts-runtime-impl`.
- `npm run test`, `npm run typecheck`, `npm run metrics:check` praeina.
- Yra dokumentuotas naujos metrikos įdėjimo procesas.
