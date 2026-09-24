# Hours Control

Static app over the roadmap delivery tree. Overlay JSON is the EDP↔EPP source of truth. PolarIS is never written. Cost is **hours** (finance converts to euros). End goal: **hours-control insights and reports over Jira** ([docs/CONTROL.md](docs/CONTROL.md)).

## Pages

- [Overview](index.html)
- [Delivery](delivery.html) — product line and BRPaaS milestone trees
- [Mapping](mapping.html) — confirm / reject / add links
- [Cases](cases.html) — business-case control: bindings, Jira tree, allocation, ETC/FAC, coverage
- [Cost](cost.html) — hour envelopes
- [Reports](reports.html) — payoff: interactive KPIs over the Jira snapshot (product / program cuts, history, forecast)
- [Deliverable](deliverable.html) — EDP control report; opened from Reports or Delivery

The Coggle [map](Roadmap_Map.html) is still in the repo; it is not in the primary nav.

GitHub Pages serves this folder as a **read-only snapshot**. Do not treat the repository as private.

## Overlay rules

PolarIS is in cost unless overlay rejects it. Overlay adds EPPs PolarIS missed. Inferred title matches are inbox, not cost. Unique hours de-duplicate tickets. Shared EPPs are flagged, not split 50/50.

Product-line reports stay EDP-first. BRPaaS **program** reports stay milestone-first (Power Balancer plus BPO). Do not mix those cuts into one “BRPaaS hours” number.

Living spec: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md), [docs/ROADMAP.md](docs/ROADMAP.md). Control process: [docs/CONTROL.md](docs/CONTROL.md). Reporting intelligence and Jira tracking contract: [docs/REPORTING.md](docs/REPORTING.md).

## Refresh

```
python assemble_tree.py
python fetch_time.py
python apply_time.py
python apply_overlay.py
python build_mindmap.py
```

Last booked dates live in `jira_map/last_booked.json` (ISO day only, no authors). `apply_time.py` and `build_mindmap.py` roll them up the tree.

`build_mindmap.py` also updates `jira_map/report_history.json` and
`jira_map/report_history.js`. History keeps one snapshot per Jira `fetchedAt`
UTC date; another refresh on that date replaces the snapshot.

Milestone EPP trees: `python fetch_milestone_epps.py` then `python build_mindmap.py`.

Time spent comes from native Jira worklogs (`timespent`, `aggregatetimespent`). Jira’s calendar is 8 hours = 1 day.

## Edit mapping, budgets, and cases locally

```
python serve.py
```

Open http://127.0.0.1:8765/ — POST `/overlay`, `/budgets`, and `/cases` write JSON and re-run `apply_overlay.py`. On GitHub Pages, download the JSON, commit it, and run the refresh locally.
