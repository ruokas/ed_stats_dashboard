# Stage 1 – Experience Architecture Plan

## Objectives
- Translate the ED manager journey into a clear information architecture before writing production code.
- Define the tabbed navigation, global filter drawer, and first-screen priorities for desktop and mobile.
- Produce low-fidelity wireframes/prototypes that stakeholders can validate quickly.

## Deliverables
1. **Wireframe set** (desktop + mobile) for:
   - Overview tab (KPI strip, alert banner, insights, shift comparison strip).
   - Patient Flow tab (trend column, heatmap/funnel placement, metric toolbar).
   - Performance & Trends tab (toggleable table/chart module, export affordance).
   - Experience tab (sentiment cards, trend chart, latest feedback list).
   - Operations top bar/global filter drawer.
2. **Interaction notes** covering tab transitions, filter application flow, and TV-mode handoff.
3. **Validation checklist** for internal review + ED manager walkthrough.
4. **Static prototype**: interactive layout mock at `prototypes/layout_prototype.html` (v2 pending data-scope adjustments).

## Layout Blueprint
- **Top bar**: fixed at 64px, hosts identity, refresh, status pill, TV toggle, settings, and filter drawer button. Shrinks to 56px on <768px.
- **Global filter drawer**: slides from right; single set of controls (window preset, shift, arrival, disposition, card type). Desktop width 360px; on mobile becomes full-screen sheet.
- **Tabs**: sticky horizontal bar on desktop; collapses into segmented control on mobile. Anchors: `overview`, `flow`, `trends`, `experience`, `ops` (optional).
- **Section priorities**:
  - Overview: KPIs (2x3 grid), alert/insights stack, shift comparison banner, quick actions.
  - Flow: stacked charts ordered by “now -> pattern -> breakdown”, with shared toolbar pinned atop charts.
  - Trends: toggle (recent/monthly/yearly), inline change indicators, export button.
  - Experience: sentiment cards row, trend chart, latest comments list with filters inline.
  - Operations (optional tab or modal): TV mode preview + core diagnostics.
- **Responsive rules**: break at 1200px (three-column -> two), 900px (single column), 640px (full width cards, sticky filters repositioned).

## Validation & Research
- **Design reviews**: async feedback with product + engineering (Figma comments) followed by live critique.
- **Stakeholder walkthrough**: 30-minute session with ED manager; capture decisions on KPI order, alerts, and TV usage.
- **Feasibility check**: engineering review to ensure global filter state can hydrate all modules and that tab shell aligns with current routing.

## Acceptance Criteria
- Wireframes approved by product, ED manager, and engineering.
- Interaction notes answer mobile/desktop behavior questions for developers.
- Validation checklist signed off, feeding Stage 2 backlog (global filter controller, tab shell, top bar refactor).

## Review notes
### Prototype adjust summary
- Swap overview cards to show daily totals/real values.
- Limit alerts to daily-refresh insights (no real-time staffing evaluation).
- Remove staffing/surge/inpatient/diagnostics widgets due to missing data.
- TV mode treated as shared floor display (not manager-only tool).

- Overall layout looks good
- Would like to see actual numbers for overview cards, not just percentages
- Alerts and insights would only be about long term performance, because currently the data is only updated once a day
- The page would not evaluate staffing, because I could not feed that data
- We dont have surge protocol, and dont have uptodate info about inpatient beds or diagnostics turnaround
- TV mode is used as a dashboard for all workers inside ED



