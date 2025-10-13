# Dashboard Restructure Implementation Plan

## Stage 0 – Discovery Alignment
- Confirm primary user journeys: operations command view, analyst trend deep-dive, patient experience review.
- Inventory current metrics, filters, and dependencies (worker outputs, TEXT keys) to flag blockers early.
- Decide success criteria and tracking (load budget, task completion time, satisfaction ratings).

## Stage 1 – Experience Architecture
- Produce low-fidelity wireframes covering the new tab structure and global filter drawer.
- Validate navigation patterns on desktop and mobile, including sticky subnav behavior.
- Map content ownership per tab (Overview, Patient Flow, Performance & Trends, Experience) and confirm data sources for each module.

## Stage 2 – Foundation Refactor
- Implement the global filter controller; refactor KPI and chart logic to consume shared state before touching the UI.
- Introduce the new top bar hierarchy (identity, status, refresh, TV toggle, settings) and collapse the existing hero nav.
- Build the new tab shell with routeable anchors, keyboard focus handling, and responsive fallbacks.

## Stage 3 – Section Rebuilds
- Overview: limit to high-signal KPI cards, generated insights, and a compact shift comparison strip.
- Patient Flow: reflow charts into a narrative column, add shared metric toolbar, ensure legends/captions are concise.
- Performance & Trends: consolidate recent/monthly/yearly tables under a single toggleable component and streamline the comparison workflow.
- Experience: reorganize feedback cards, trend chart, and filters into a single cohesive layout; consider latest-comments feed if time permits.

## Stage 4 – Operations & Settings Cleanup
- Break the settings dialog into accordion groups (Data Sources, Transformations, Labels, Feature Toggles) and prune redundant helper text.
- Audit translation keys and defaults so new layout strings remain LT/EN aligned.
- Update documentation (README, AGENTS.md) with navigation, filtering, and testing changes.

## Stage 5 – QA, Launch, and Follow-Up
- Run manual regression (filters, charts, tables, TV mode, offline fallback) and add smoke scripts where feasible.
- Present the revamped dashboard to stakeholders for sign-off; capture any final layout or copy tweaks.
- Monitor usage metrics post-launch and schedule a retrospective to harvest backlog items for future iterations.
