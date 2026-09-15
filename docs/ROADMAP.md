# Hours Control — roadmap

Build order. Each slice is usable alone.

## R0 — Chrome (F0)

Porcelain ledger tokens, shared shell, Overview wired to `tree_data.js`. Redirect old `Roadmap_*.html` / `E21_*.html` entry points. Coggle map stays in the repo, out of primary nav.

## R1 — Overlay brain (F1)

`overlay_links.json` schema, `apply_overlay.py`, inferred pending excluded from cost. `build_mindmap.py` applies overlay to the payload. Shared flags follow cost membership.

## R2 — Mapping (F2 + F6)

Inbox for active EDPs still inferred or empty. Confirm / reject / add. `serve.py` writes overlay JSON locally.

First mapping target: active BRP as a Service / Power Balancer EDPs that are still inferred (EDP-162, EDP-105, EDP-109, …) plus M3 EPPs.

## R3 — Delivery true view (F3)

Restyle product and milestone trees. EDP detail on overlay membership (unique vs rolled, pending, budget).

## R4 — Cost (F4)

Envelopes for product line, EDP, and M1–M4. `overlay_budgets.json` editor. Unbudgeted labelled, not zero.

## R5 — Reports (F5)

Unique hours by product and by BRPaaS milestone, mapping health, concentration, insight strip.

## Later (not v1)

Coggle restyle. PolarIS write-back. Feature-level split (e.g. EPP-172). Euros. Auth.

## Refresh pipeline

```
python assemble_tree.py
python fetch_time.py
python apply_time.py
python apply_overlay.py
python build_mindmap.py
```

Milestone EPP trees: `python fetch_milestone_epps.py` then `python build_mindmap.py`.

Local editing: `python serve.py` then open http://127.0.0.1:8765/
