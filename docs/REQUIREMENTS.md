# Hours Control — functional requirements

Living spec for the static Hours Control app. PolarIS is never written. Overlay JSON in this repo is the mapping source of truth. Cost is **hours**, not euros.

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

1. Bind roadmap EDPs to the EPPs developers actually work on.
2. Show a true tree per EDP from that binding.
3. Control cost in hours (finance converts to euros elsewhere).
4. Report by **product line** and by **BRPaaS program milestones** as separate cuts. Never one number labelled “BRPaaS” that mixes the product line with the program.

## F0 Shell and design

Operations console: bone canvas `#E8E2D6`, ink `#161411`, dark rail `#141311`, signal amber `#B45309` for pending only. IBM Plex Sans + IBM Plex Mono. 2px corners, hairlines, no card candy, no Apple blue, no helper copy. Hierarchy is type chips, indent, Cost vs Logged.

| ID | Name | Definition of done |
| --- | --- | --- |
| F0.1 | Design tokens | `assets/css/app.css` variables only; pages do not invent palettes. |
| F0.2 | App shell | Overview, Delivery, Mapping, Cost, Reports. Current page marked. Fetched-at on the rail. No explanatory copy. |
| F0.3 | Overview | Unique hours, active EDPs, pending inferred count, shared EPP count, BRPaaS **program** unique hours (M1–M4). Links into the other four pages. No charts. |

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

Custom SVG. Short titles only. No captions, no insight essays.

| ID | Name | Definition of done |
| --- | --- | --- |
| F5.1 | Hours by product line | Unique, de-duped inside the line. Caption warns multi-tagged EDPs appear under each line. |
| F5.2 | Hours by BRPaaS milestone | M1–M4 unique. Program total de-dupes tickets across milestones. |
| F5.3 | Spent vs budget | Only rows with a budget. Sort by remaining (risk first). |
| F5.4 | Mapping health | Confirmed / pending inferred / none for **active** EDPs. Callout if pending > 0. |
| F5.5 | Concentration | Top EDPs by unique hours; top shared EPPs by hours. |
| F5.6 | Insight strip | Removed. Numbers and charts only. |

Jira-backed EDP and EPP labels link to their source issues. Product lines and M1–M4 remain aggregate, non-Jira entities.

## F6 Local writer

| ID | Name | Definition of done |
| --- | --- | --- |
| F6.1 | `serve.py` | Stdlib HTTP, bind localhost. Serve the site. `POST /overlay` and `POST /budgets` write the JSON files. |

## Out of scope (v1)

Write PolarIS to Jira. Euros. Allocating shared EPP hours across EDPs. Live Jira in the browser. Auth. MariaDB. Treating “BRP as a Service” hours as the BRPaaS program total.
