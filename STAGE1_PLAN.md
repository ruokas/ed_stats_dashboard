# Stage 1 Experience Architecture Plan

## Objectives
- Translate the ED manager journey into a clear information architecture before writing production code.
- Anchor every decision to the structure captured in `prototypes/layout_prototype.html` (top bar → tab bar → tab panels).
- Produce low-fidelity wireframes/prototypes that stakeholders can validate quickly.

## Deliverables
1. **Wireframe set** (desktop + mobile) mirroring layout prototype anchors:
   - Top bar shell (identity cluster, status pill, refresh, TV toggle, settings, filter drawer trigger).
   - Tab bar with five tabs → Overview, Patient Flow, Performance & Trends, Experience, Operations/TV.
   - Overview tab (KPI strip, alert banner, insights, shift comparison strip).
   - Patient Flow tab (trend column, heatmap/funnel placement, metric toolbar).
   - Performance & Trends tab (toggleable table/chart module, export affordance).
   - Experience tab (sentiment cards, trend chart, latest feedback list).
2. **Interaction notes** covering tab transitions, filter application flow, TV-mode handoff, and how the filter drawer overlays the layout prototype.
3. **Validation checklist** for internal review + ED manager walkthrough mapped to each structural area (top bar, tabs, tab panels).
4. **Static prototype**: updated interactive mock at `prototypes/layout_prototype.html` with annotations highlighting confirmed sections.

## Layout Blueprint
- **Top bar** (matches `.top-bar` in prototype): fixed at 64px, hosts identity, refresh, status pill, TV toggle, settings, and filter drawer button. Shrinks to 56px on <768px.
- **Global filter drawer**: slides from right; single set of controls (window preset, shift, arrival, disposition, card type). Desktop width 360px; on mobile becomes full-screen sheet.
- **Tabs** (matches `.tab-bar` / `.tab-btn`): sticky horizontal bar on desktop; collapses into segmented control on mobile. Anchors: `overview`, `flow`, `trends`, `experience`, `ops` (optional).
- **Section priorities**:
  - Overview: KPIs (2x3 grid), alert/insights stack, shift comparison banner, quick actions.
  - Flow: stacked charts ordered by now → pattern → breakdown, with shared toolbar pinned atop charts.
  - Trends: toggle (recent/monthly/yearly), inline change indicators, export button.
  - Experience: sentiment cards row, trend chart, latest comments list with filters inline.
  - Operations (optional tab or modal): TV mode preview + core diagnostics.
- **Responsive rules**: break at 1200px (three-column → two), 900px (single column), 640px (full width cards, sticky filters repositioned).

## Incremental Workflow
1. **Audit current insights** – map existing dashboard elements onto layout prototype regions to confirm coverage.
2. **Sketch top bar & tabs** – produce desktop + mobile wireframes that match prototype spacing and behaviour.
3. **Detail each tab panel** – capture KPI/chart/card counts plus placeholder copy, ensuring tabs can collapse to one column.
4. **Document interactions** – record expected keyboard focus order, filter drawer overlay path, and tab switching animation cues.
5. **Assemble annotated prototype** – update `layout_prototype.html`, layer callouts, share for review.

## Validation & Research
- **Design reviews**: async feedback with product + engineering (Figma comments) followed by live critique using the prototype as the single reference.
- **Stakeholder walkthrough**: 30-minute session with ED manager; capture decisions on KPI order, alerts, and TV usage directly in the annotated prototype.
- **Feasibility check**: engineering review to ensure global filter state can hydrate all modules and that tab shell aligns with current routing.

## Acceptance Criteria
- Wireframes approved by product, ED manager, and engineering with screenshots cross-referenced to layout prototype sections.
- Interaction notes answer mobile/desktop behaviour questions for developers and point to exact selectors/classes in the prototype.
- Validation checklist signed off, feeding Stage 2 backlog (global filter controller, tab shell, top bar refactor) with explicit traceability to layout components.

## Review notes
### Prototype adjust summary
- Swap overview cards to show daily totals/real values.
- Limit alerts to daily-refresh insights (no real-time staffing evaluation).
- Remove staffing/surge/inpatient/diagnostics widgets due to missing data.
- TV mode treated as shared floor display (not manager-only tool).

## After review notes
- Add percentage context next to admissions/EMS/discharge counts in prototype.
- Replace operations checklist with more meaningful data (e.g., data refresh, CSV status, TV rotation).
- Introduce representative chart placeholders or simplified previews in flow/trends/ops tabs.
- Admissions, EMS arrivals and discharges under 4h should also show percentages next to actual numbers.
- Operational checklist shows no useful info for me.
- would like to see actual charts in patient flow tab, performance tab, operations tab.
