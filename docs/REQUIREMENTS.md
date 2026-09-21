# Hours Control — functional requirements

Living spec for the static Hours Control app. PolarIS is never written. Overlay JSON in this repo is the mapping source of truth. Cost is **hours**, not euros.

**End goal:** hours-control insights and reports **over Jira** — unique cost, envelopes, mapping health, concentration, trend, and case FAC, computed from a Jira snapshot. Mapping, Delivery, Cases, and Cost exist to make those reports true. Design: [CONTROL.md](CONTROL.md).

GitHub Pages is read-only. Mapping and budgets are edited locally (`python serve.py`) and committed. Hours are public if the repository is public.

## Glossary

- **EDP** — Jira Product Discovery idea = roadmap item.
- **EPP** — initiative epic. Grain of overlay.
- **PolarIS** — Jira “is implemented by”. Evidence, not authority.
- **Overlay** — this repo’s confirmed / rejected / added EDP↔EPP map (`jira_map/overlay_links.json`).
- **Rolled hours** — sum of child worklogs; a shared EPP is counted on every parent.
- **Unique hours** — each ticket counted once. **This is cost.**
- **Product line** — Jira Product Name (BRP as a Service, Power Balancer, …).
- **BRPaaS program** — 2026 EET / VanHelder cut, milestones M1–M4. Power Balancer plus BPO services. Distinct from the product line nicknamed BRPaaS.
- **Active** — Roadmap Now / Next / Later.
- **Cost member** — an EPP that counts toward an EDP’s envelope: PolarIS not rejected, or overlay add/confirm. Inferred pending is not a cost member.
- **Snapshot** — one immutable reporting state per Jira `fetchedAt` UTC date. A later refresh on the same date replaces that date.
- **Business case** — overlay record (`overlay_cases.json`). Not PolarIS and not assumed 1 EDP = 1 case. Product design: [CONTROL.md](CONTROL.md).
- **Associated hours** — unique hours on cost-member tickets in a case’s bound EDP trees. Observation, not yet assigned.
- **Allocated hours** — unique hours the controller assigns to a case. Exclusive cost members default to 100%. Shared EPPs are unallocated until set. Never auto-split 50/50.
- **ETC** — estimate to complete, hours, overlay authority. Jira remaining estimate is evidence only.
- **FAC** — allocated unique spent + ETC. Control signal vs budget. Spent vs budget is lagging.
- **Ledger** — dated worklog rows. Cumulative `timespent` remains the tree rollup. Public Pages omit authors and worklog bodies.
- **Coverage exception** — a ledger row in the case window whose ticket is not in the case’s cost-member trees.

## Overlay rules

File: `jira_map/overlay_links.json`. One row per pair:

`{ "edp", "epp", "action": "confirm" | "add" | "reject", "source", "note", "updatedAt" }`

- PolarIS is in cost unless overlay **rejects** it.
- Overlay **adds** an EPP PolarIS missed.
- Inferred title/alias matches are an **inbox**, not cost. Confirm → overlay. Reject → stay out of cost.
- Rejected PolarIS remains visible as audit (“Jira still links this; overlay excluded”).
- Feature / Story membership stays Jira parent. No feature-level overlay in v1.
- Shared EPP: unique totals count the ticket once; each EDP still *shows* the EPP with a shared flag. Default charts = unique. Rolled overstates.
- Cost membership for an EDP = PolarIS not rejected ∪ overlay adds.
- Empty budget ⇒ show spent only, never a fake remaining of zero.
- Milestones stay in `milestones.py`. Overlay does not invent milestone membership in v1.

Budgets: `jira_map/overlay_budgets.json` — hours per EDP, optional per product, optional per milestone.

## Product jobs

1. Report hours control **over Jira**: unique Cost, Logged, Pending, mapping, budget/Left, concentration, history — Product line and BRPaaS program M1–M4 as exclusive cuts. Every hour drills to Jira keys.
2. Bind roadmap EDPs to the EPPs developers actually work on so report Cost is not pending.
3. Show a true tree per EDP from that binding (inspect the Jira work behind a number).
4. Control cost in hours (finance converts to euros elsewhere).
5. Control a **business case** envelope so Reports Case mode can show associated vs allocated, ETC, FAC, and coverage of tagged worklogs. Traceability is necessary and not sufficient. Never one number labelled “BRPaaS” that mixes the product line with the program.

## F0 Shell and design

Operations console: bone canvas `#E8E2D6`, ink `#161411`, dark rail `#141311`, signal amber `#B45309` for pending only. IBM Plex Sans + IBM Plex Mono. 2px corners, hairlines, no card candy, no Apple blue, no helper copy. Hierarchy is type chips, indent, Cost vs Logged.

| ID | Name | Definition of done |
| --- | --- | --- |
| F0.1 | Design tokens | `assets/css/app.css` variables only; pages do not invent palettes. |
| F0.2 | App shell | Overview, Delivery, Mapping, Cases, Cost, Reports. Current page marked. Fetched-at on the rail. No explanatory copy. |
| F0.3 | Overview | Unique hours, active EDPs, pending inferred count, shared EPP count, BRPaaS **program** unique hours (M1–M4), and the pilot case Allocated / FAC / Budget / holes. Links into the other pages. No charts. |

## F1 Overlay engine

| ID | Name | Definition of done |
| --- | --- | --- |
| F1.1 | Schema | Overlay file matches the row shape above. |
| F1.2 | `apply_overlay.py` | Marks each EPP `polaris` / `overlay` / `inferred_pending` / `rejected`. Inferred not confirmed do not attach for cost. |
| F1.3 | Pipeline | `assemble_tree` → `fetch_time` → `apply_time` → `apply_overlay` → `build_mindmap`. README documents it. |
| F1.4 | Shared flags | `sharedWith` is recomputed on overlay cost membership, not raw PolarIS+inferred. |

`build_mindmap.py` also applies overlay to the product payload so inferred hours drop out of cost even if `delivery_tree.json` was not rewritten.

## F2 Mapping studio

| ID | Name | Definition of done |
| --- | --- | --- |
| F2.1 | Inbox | Active EDPs whose cost tree is empty or only inferred. Confirm / reject per suggested EPP. |
| F2.2 | EDP inspector | Current members, PolarIS vs overlay vs pending, unique hours if confirmed. |
| F2.3 | Add EPP | Type `EPP-311`; must exist in the catalog built from the tree. Warn if already on another EDP. |
| F2.4 | Reject PolarIS | Exclude from cost; keep an audit line. |
| F2.5 | Save | Local writer POST when `python serve.py` is up; otherwise download JSON. GitHub Pages is view + download. |

Mapping uses the same progressive Product line → EDP chrome as Delivery.

## F3 Delivery (true view)

| ID | Name | Definition of done |
| --- | --- | --- |
| F3.1 | Product tree | Product → EDP → EPP → Feature → Story. Filters: active, product, link health (confirmed / pending / none). |
| F3.2 | Milestone tree | M1–M4, EPP-first, EDPs/products on each EPP, unique hours on the milestone row. |
| F3.3 | EDP record | Type-marked EDP → EPP → Feature → Story. Cost vs Logged. Pending Cost is a dash. Expand in place. |

Delivery uses progressive navigation: Product line → EDP → record, or Program M1–M4 → milestone → EPP → record. Selecting a row opens the local breakdown; selecting a Jira key opens the source issue in a new tab. Records start collapsed.

## F4 Cost control

| ID | Name | Definition of done |
| --- | --- | --- |
| F4.1 | Product envelopes | Unique spent, budget, remaining, % used. Unbudgeted labelled, not zero. |
| F4.2 | EDP envelopes | Same columns. Shared EPPs noted, not split 50/50. |
| F4.3 | Milestone envelopes | M1–M4 unique hours vs optional milestone budget. |
| F4.4 | Edit budgets | Same save pattern as overlay. Hours only, integers or 0.5. |

## F5 Reports

The payoff surface. Custom SVG. Short titles only. No captions, no insight essays. Complexity comes from filters, calculations, drill-down, tooltips, and underlying tables—not more card widgets. Numbers come from the Jira snapshot plus overlay; they are not authored in the UI.

| ID | Name | Definition of done |
| --- | --- | --- |
| F5.1 | Hours by product line | Unique, de-duped inside the line. Caption warns multi-tagged EDPs appear under each line. |
| F5.2 | Hours by BRPaaS milestone | M1–M4 unique. Program total de-dupes tickets across milestones. |
| F5.3 | Spent vs budget | Only rows with a budget. Sort by remaining (risk first). |
| F5.4 | Mapping health | Confirmed / pending inferred / none for **active** EDPs. Callout if pending > 0. |
| F5.5 | Concentration | Top EDPs by unique hours; top shared EPPs by hours. |
| F5.6 | Insight strip | Removed. Numbers and charts only. |
| F5.7 | KPI workbench | User selects cut, metric, comparison, scope, product, health, row limit, and search. State is shareable in the URL and exportable as CSV. |
| F5.8 | Interactions | Chart rows are keyboard-focusable, expose values on hover/focus, and drill Product → EDP or M1–M4 → EPP. Jira keys still open Jira. |
| F5.9 | History | `report_history.json` stores one dated snapshot per Jira fetch date and is updated by `build_mindmap.py`. |
| F5.10 | Trend / forecast | Date range drives cumulative trend. Burn rate and 30-day projection require at least 3 snapshots spanning 14 days; otherwise show `—`. |
| F5.11 | KPI definitions | Mapping coverage = confirmed active / active. Budget coverage = unique cost in EDPs with budgets / global unique cost. Pending exposure is unique logged work under inferred pending EPPs and is never cost. Shared duplication = rolled cost-member hours − unique cost. |
| F5.12 | Report structure | Traditional variance-to-detail flow: context/filters → KPI strip → primary comparison + composition → trend → concentration/shared → exact table. |
| F5.13 | Reporting modes | Product line and Program M1–M4 are the top-level reporting cuts (Case is added in F7.6 as a third exclusive mode). EDP and EPP are drill levels, never peer business cuts. A Product selection never constrains Program. |
| F5.14 | Chart grammar | Mapping health uses a Confirmed/Pending/None donut. Cost vs Budget/Logged uses dumbbells, Left uses diverging bars, history uses lines, concentration uses Pareto, and category comparison uses ranked bars. |
| F5.15 | Chart bounds | Labels and values have measured gutters; plot marks are clipped to the plot area. Charts reflow before text, axes, or values can cross panel boundaries. |

Jira-backed EDP and EPP labels link to their source issues. Product lines and M1–M4 remain aggregate, non-Jira entities.
When Active is selected, product-line Cost, Logged, Pending, counts, and historical series are recomputed from active EDPs; aggregate coverage de-duplicates multi-tagged EDPs.

## F6 Local writer

| ID | Name | Definition of done |
| --- | --- | --- |
| F6.1 | `serve.py` | Stdlib HTTP, bind localhost. Serve the site. `POST /overlay`, `POST /budgets`, and `POST /cases` write the JSON files. |

## F7 Business-case control

Makes Reports Case mode honest. Workflow, layout, and connections: [CONTROL.md](CONTROL.md). First slice proves **one pilot case** controllable. Do not grow the catalog first.

| ID | Name | Definition of done |
| --- | --- | --- |
| F7.1 | Case overlay | `overlay_cases.json` stores cases, EDP bindings, versioned budgets, ETC, per-EPP allocations, coverage exceptions. Overlay is authority. |
| F7.2 | Cases page | Progressive list → record. Envelope chips: Allocated, FAC, Budget, Left, ETC, Holes. Bind EDPs. Tree slice reuses Delivery record chrome. Shared EPPs allocate hours or %. Empty budget ⇒ Left `—`. |
| F7.3 | Associated vs allocated | Associated = unique cost-member hours on bound trees. Allocated = exclusive 100% plus explicit shared shares. Unallocated associated is a hole, not FAC. Total allocated per EPP across cases ≤ that EPP’s unique hours. |
| F7.4 | Ledger + coverage | Pipeline fetches worklogs for the case period/teams, sanitizes authors, writes a public ledger. Coverage exceptions are Map / Out of scope / Other case. Pending inferred is never in-tree cost. |
| F7.5 | ETC and FAC | ETC is overlay hours (case, optional per-EPP rollup). FAC = allocated + ETC. Overrun = FAC − budget when budgeted. Jira remaining estimate may display as evidence, never as the saved ETC unless copied. |
| F7.6 | Reports Case mode | Third exclusive View alongside Product line and Program M1–M4. Drill Case → EDP. Metric FAC allowed. Product filters still never constrain Program. |
| F7.7 | History | Snapshots store case allocated, ETC, FAC, budget. Trend/forecast rules match F5.10. |
| F7.8 | Public Pages | No worklog author, email, or comment body in shipped JSON. |
| F7.9 | Pilot done | Bound trees have no pending cost members; shared is allocated or listed as holes; exceptions classified; ETC numeric; Overview / Cases / Reports FAC match. |

## F8 Deliverable reporting and KPI evidence

Decision model, Jira gap analysis, formulas, tracking contract, and references:
[REPORTING.md](REPORTING.md).

| ID | Name | Definition of done |
| --- | --- | --- |
| F8.1 | EDP deliverable report | One accountable EDP report rolls confirmed EPP → Feature → Story evidence into workflow composition, unique spent, estimates, forecast readiness, concentration, control signals, and exact Jira scope. |
| F8.2 | KPI registry | KPI definitions declare decision, formula/source, unit, evidence state (`available` / `partial` / `unavailable`), and Jira tracking action. UI does not manufacture missing values. |
| F8.3 | Completion | Done leaf items / active leaf items excluding removed. Status-category fallback is visibly partial. Hours spent / estimate is never completion. |
| F8.4 | Estimate confidence | Original and Remaining are always paired with estimate coverage. Forecast requires Remaining plus ≥3 snapshots spanning 14 days. |
| F8.5 | Reporting drill | Reports EDP rows and Delivery EDP records open the deliverable report. Every scope key opens Jira. |
| F8.6 | Evidence payload | Future Jira refreshes retain native status category and remaining estimate at issue and rollup levels. |
| F8.7 | Tracking gaps | Report identifies missing target, blocker semantics, remaining estimates, status evidence, history, acceptance, and benefits instead of showing false confidence. |

## Out of scope (v1)

Write PolarIS to Jira. Euros. Auto-allocating shared EPP hours across EDPs or cases. Live Jira in the browser. Auth. MariaDB. Treating “BRP as a Service” hours as the BRPaaS program total. Publishing unsanitized worklogs. Multiple pilots before F7.9.
