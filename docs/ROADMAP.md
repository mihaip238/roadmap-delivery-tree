# Hours Control — roadmap

Build order. Each slice is usable alone.

## R0 — Chrome (F0)

Operations console (dark rail, bone canvas, IBM Plex). Overview wired to `tree_data.js`. Redirect old `Roadmap_*.html` / `E21_*.html` entry points. Coggle map stays in the repo, out of primary nav.

## R1 — Overlay brain (F1)

`overlay_links.json` schema, `apply_overlay.py`, inferred pending excluded from cost. `build_mindmap.py` applies overlay to the payload. Shared flags follow cost membership.

## R2 — Mapping (F2 + F6)

Inbox for active EDPs still inferred or empty. Confirm / reject / add. `serve.py` writes overlay JSON locally.

First mapping target: active BRP as a Service / Power Balancer EDPs that are still inferred (EDP-162, EDP-105, EDP-109, …) plus M3 EPPs.

## R3 — Delivery true view (F3)

EDP record: type chips, Cost vs Logged, expandable EPP → Feature → Story.

## R4 — Cost (F4)

Envelopes for product line, EDP, and M1–M4. `overlay_budgets.json` editor. Unbudgeted labelled, not zero.

## R5 — Reports (F5)

The payoff: unique hours by product and by BRPaaS milestone, mapping health, concentration. Power BI-style variance-to-detail structure with exclusive Product / Program modes, bounded responsive SVGs, donut health, dumbbell budget comparison, diverging variance, Pareto concentration, URL-persisted filters, CSV export, underlying tables, dated history, burn rate, and forecast. No insight essays. Every row drills to Jira keys.

## R6 — Business-case control (F7)

Product design: [CONTROL.md](CONTROL.md).

Keep the tree. Fetch remains Jira. Add Cases only so Reports can show FAC for one pilot: overlay cases file, sanitized worklog ledger, associated vs allocated, ETC/FAC, coverage exceptions, Reports Case mode, Overview pilot strip. Local `POST /cases`.

First usable slice: **one pilot case** meets F7.9 so Case-mode reports match Overview. Do not scale the case list first. Do not add surfaces that are not on the Jira → Reports path.

Implemented: case overlay/model, local writer, Cases workspace with Jira tree,
Overview pilot strip, Reports Case mode, and case history rows. The empty
ledger schema is public-safe. F7.9 activates when the authoritative pilot,
teams/period, budget/ETC, and sanitized Jira ledger are populated.

## R7 — Deliverable intelligence (F8)

Product/report design: [REPORTING.md](REPORTING.md).

Implemented first slice: EDP Deliverable report, evidence-aware KPI registry,
workflow composition, estimate coverage, EPP hours concentration, control
signals, tracking gaps, and Jira scope table. Reports and Delivery drill into it.

Next data steps: refresh Jira with native status category and Remaining estimate,
adopt the P0 target/blocker/estimate conventions, then accumulate three or more
snapshots over 14 days before enabling finish forecasts.

## Later (not v1)

Coggle restyle. PolarIS write-back. Feature-level split (e.g. EPP-172). Euros. Auth. Roll Cost-page line budgets from cases. Multiple cases as a portfolio.

## Refresh pipeline

```
python assemble_tree.py
python fetch_time.py
python apply_time.py
python apply_overlay.py
python build_mindmap.py
```

Last booked: `jira_map/last_booked.json` (ISO day only). Rolled up in `apply_time.py` / `build_mindmap.py`.

Milestone EPP trees: `python fetch_milestone_epps.py` then `python build_mindmap.py`.

Local editing: `python serve.py` then open http://127.0.0.1:8765/
