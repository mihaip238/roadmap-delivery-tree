# Roadmap delivery views

Static pages over the roadmap delivery tree (EDP → EPP → Feature → Story).

- [List tree](Roadmap_Delivery_Tree.html)
- [Coggle map](Roadmap_Map.html)

GitHub Pages serves this folder. PolarIS links are the Jira Product Discovery “is implemented by” relationship. Inferred links are title matches, not PolarIS.

Time spent and original estimate come from native Jira worklogs (`timespent`, `timeoriginalestimate`, `aggregatetimespent`). Jira’s calendar is 8 hours = 1 day. Feature totals include child defects; EPP totals add the epic’s own worklogs to those feature totals. Shared EPPs are flagged so hours are not mistaken as exclusive to one EDP.

Refresh local time data with `python fetch_time.py` then `python apply_time.py` then `python build_mindmap.py`.

Delivery milestones (M1–M4, EET / VanHelder) group BRPaaS and Power Balancer EPPs. Refresh those trees with `python fetch_milestone_epps.py` then `python build_mindmap.py`. On the list tree, switch **Group by delivery milestone**.

Do not treat this repo as private. A free GitHub Pages site requires a public repository.
