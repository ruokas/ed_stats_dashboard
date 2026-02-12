# CSS Architecture Guide

## Scope
- File: `styles.css`
- Goal: reduce duplication and specificity complexity without changing UI behavior.

## Baseline (2026-02-12)
- File size: `150461` bytes
- Lines: `5980`
- Media queries: `27`
- Approximate selector blocks: `1013`

## Current Snapshot (2026-02-12)
- File size: `144536` bytes
- Lines: `6944` (includes legacy spacing/newline blocks; size is the primary budget metric)
- Media queries: `27`
- Approximate selector blocks: `981`

## Refactor Rules
- Do not change class names used by HTML/JS selectors.
- Do not change DOM structure only for styling.
- Keep contrast and theme behavior equivalent in light/dark mode.
- Prefer shared component rules and CSS tokens over repeated hardcoded values.

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
- CI runs CSS budget check in `.github/workflows/code-quality.yml`.
