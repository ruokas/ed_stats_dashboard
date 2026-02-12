# CSS Architecture Guide

## Scope
- Files: `styles.css` + modular CSS in `css/*.css`
- Goal: reduce duplication and specificity complexity without changing UI behavior.

## Baseline (2026-02-12)
- CSS bundle size: `154567` bytes total
- `styles.css`: `128257` bytes
- `css/navigation.css`: `7198` bytes
- `css/export-controls.css`: `2828` bytes
- `css/hero.css`: `9375` bytes
- `css/feedback.css`: `6909` bytes
- Lines: `7055`
- Media queries: `29`
- Approximate selector blocks: `1003`

## Current Snapshot (2026-02-12, post cleanup)
- CSS bundle size: `125233` bytes total
- `styles.css`: `98923` bytes
- `css/navigation.css`: `7198` bytes
- `css/export-controls.css`: `2828` bytes
- `css/hero.css`: `9375` bytes
- `css/feedback.css`: `6909` bytes
- Lines: `5926`
- Media queries: `26`
- Approximate selector blocks: `845`
- Cleanup note: removed legacy selector groups not referenced by current HTML/JS (`ed-tv`, `tab-switcher`, old `insight/trend` variants, legacy `chart-card--ed-modern` legend styles).

## Refactor Rules
- Do not change class names used by HTML/JS selectors.
- Do not change DOM structure only for styling.
- Keep contrast and theme behavior equivalent in light/dark mode.
- Prefer shared component rules and CSS tokens over repeated hardcoded values.
- For Chart.js blocks, set fixed/min heights on a dedicated wrapper (not on `canvas` directly in auto-height cards).

## Layering Strategy
- Declared layers: `tokens`, `base`, `layout`, `components`, `utilities`.
- New shared rules should be added to a clear logical section and use tokens first.

## Token Naming
- Shared state values: `--state-*`
- Component-scoped values: `--component-*`
- Keep color/alpha variants as dedicated tokens if reused 2+ times.

## Smoke Checklist
- Pages: `index.html`, `charts.html`, `summaries.html`, `feedback.html`, `ed.html`
- Breakpoints: `1440`, `1200`, `960`, `768`, `640`, `430`
- Interactions:
  - nav hover/focus/active
  - report export copy/download tooltip and feedback states
  - jump navigation active link states
- Themes:
  - light/dark readability and contrast parity

## Continuous Guardrails
- Metrics: `npm run css:metrics`
- Budget: `npm run css:budget`
- Budget target: `<= 145000` bytes (bundle total reported by `css:metrics`)
- CI runs CSS budget check in `.github/workflows/code-quality.yml`.
