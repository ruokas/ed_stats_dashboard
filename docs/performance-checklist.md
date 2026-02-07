# Performance Regression Checklist

## Scope
- Pages: `index.html`, `charts.html`
- Browser: Chrome (incognito), disabled extensions
- Runs: 3 cold loads + 3 warm loads per page

## Baseline Metrics
- `DOMContentLoaded`
- First Contentful Paint (FCP)
- JS parse/eval time (Performance panel)
- Transferred JS bytes (Network panel)
- Console errors/warnings

## Steps
1. Open DevTools `Network` + `Performance`.
2. Enable `Disable cache` for cold run, then reload page.
3. Record one profile from navigation start until first visible content.
4. Save values:
- `DOMContentLoaded`
- FCP
- top JS tasks duration
- transferred JS total
5. Repeat 3 times, calculate median.
6. Disable `Disable cache`, repeat warm runs.

## Acceptance Targets
- `index.html`: JS parse/eval reduced by at least ~30% from baseline.
- `charts.html`: first content render improved by at least ~20%.
- Console errors: `0`.

## Functional Sanity
- Navigation links between pages work.
- Theme toggle works on all pages.
- KPI/cards/charts/summaries/feedback/ED render without missing data.
- Service worker serves updated assets after hard refresh.
