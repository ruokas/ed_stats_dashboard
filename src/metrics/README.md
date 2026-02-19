# Metrics Catalog

Šis katalogas centralizuoja metrikų definicijas:
- `catalog.js` - metrikų registras.
- `catalog-validate.js` - schema ir semantinė validacija.
- `compute-registry.js` - compute adapteriai pagal `computeKey`.
- `resolve-metric.js` - vieningas metric resolveris UI/runtime sluoksniams.
- `catalog-overrides.js` - `config.json` `metrics` sekcijos (`enabledMetricIds`, `overrides`) taikymas.

Tikslas: sumažinti hardcodintų metric label/unit/format sąrašų dubliavimą skirtinguose runtime moduliuose.
