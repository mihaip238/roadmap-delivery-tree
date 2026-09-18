# Hours Control — product design (business-case control)

How the console becomes a **control process**, not only a tree of hours.

This document is the product design for the next slice. Living rules in
[REQUIREMENTS.md](REQUIREMENTS.md) still win. PolarIS is never written. Cost is
hours. Unique hours are cost. Pending inferred is not cost. Product line and
BRPaaS program M1–M4 stay separate cuts. GitHub Pages stays read-only.

Traceability answers *what work sits under which roadmap item*.
Control answers *whether a funded envelope will hold*.

The tree stays. Control sits **on** the tree.

---

## 1. Jobs and objects

### Jobs (who does what)

| Role | Job | Surface |
| --- | --- | --- |
| Mapper | Bind EDPs to EPPs. Empty or inferred trees do not enter cost. | Mapping |
| Controller | Own one business case: budget, allocation, ETC, coverage exceptions. | Cases |
| Delivery lead | See the true tree and remaining work on a record. | Delivery |
| Reporter | Cut unique hours by product line or by program M1–M4. | Reports |
| Anyone | Pulse: spend, pending inbox, program, case health. | Overview |

### Objects (what exists)

```
Product line ── EDP ── EPP ── Feature ── Story     ← Delivery tree (Jira + overlay)
                 │
                 └── cost member?  overlay confirm/add, PolarIS unless reject
                                   inferred pending = inbox, never cost

Business case ── binds 0..n EDPs (never assumed 1 EDP = 1 case)
             └── optional milestone tags (program cut, not the case identity)
             └── budget versions (hours)
             └── allocations on shared EPPs
             └── ETC (hours left to finish scoped work)
```

A **business case** is an overlay record in this repo. It is not a Jira issue
type and not PolarIS. Jira keys still identify EDPs/EPPs/Features/Stories.

| Term | Meaning |
| --- | --- |
| **Associated** | Unique hours on cost-member tickets that sit in the case’s mapped trees. Observation. |
| **Allocated** | Hours the controller assigns to this case. Exclusive cost members default to 100%. Shared EPPs stay unallocated until the controller sets a share. Never auto-split 50/50. |
| **Unallocated associated** | Associated unique hours with no case share. Visible as a hole, not silently in FAC. |
| **ETC** | Estimate to complete, hours, overlay SoT. Jira remaining estimate is evidence only. |
| **FAC** | Forecast at completion = **allocated unique spent + ETC**. |
| **Left (budget)** | Budget − allocated spent. Empty budget ⇒ `—`, never a fake zero. |
| **Overrun** | FAC − budget when budget exists. Spent over budget is a lagging signal; FAC over budget is the control signal. |
| **Coverage exception** | A worklog (in the pilot window, for tagged teams) whose ticket is not in any cost-member tree of the case. |
| **Ledger** | Dated worklog rows (hours, ticket, day). Cumulative `timespent` remains the tree rollup; the ledger is what control and coverage use. |

Public Pages must not publish author names, emails, or unsanitized worklog
bodies. The public snapshot keeps ticket key, hours, date, and case/EDP ids.

---

## 2. Control loop (how the week works)

Cadence is weekly after a Jira refresh. One **pilot case** is in scope until
that case is controllable end-to-end.

```
  Refresh Jira
       │
       ▼
  Tree + overlay          Mapping inbox
  (traceability)          (bind or reject inferred)
       │                         │
       └──────────┬──────────────┘
                  ▼
           Cases — pilot
           associated ← trees
           allocated  ← exclusive default / shared manual
           coverage   ← ledger minus in-tree
           ETC        ← controller
                  │
                  ▼
           FAC vs budget
           act, or hold
                  │
                  ▼
           Reports (Product | Program | Case)
```

**Entry.** Overview shows pending count (mapping debt) and pilot FAC vs budget
(control debt). Amber only for pending inferred, same as today.

**Bind.** Mapping: confirm / add / reject. Until an EPP is a cost member it
does not associate to the case.

**Own.** Cases: open the pilot. See associated unique hours, shared flags,
unallocated holes, coverage exceptions, ETC, FAC.

**Allocate.** Shared EPP: set hours or % to this case. Remainder stays
unallocated globally (other cases may claim it). Total allocated across cases
for one EPP cannot exceed that EPP’s unique hours.

**Reconcile.** Coverage list: ledger rows in the pilot period whose tickets are
outside the case trees. Actions: add EPP via Mapping, mark *out of scope*
(with note), or mark *other case*. Out of scope is not cost.

**Estimate.** ETC on the case, optionally per EPP. Saving ETC writes overlay,
not Jira.

**Judge.** If FAC > budget → overrun (warn). If budget empty → show allocated
spent and FAC only. If unallocated associated > 0 → control is incomplete
(FAC is not the whole story).

**Report.** Product and Program modes unchanged. Case mode is a third exclusive
cut for the control object. A product filter never constrains Program. Case
mode never mixes those two BRPaaS meanings.

**Stop for v1 of control.** Prove **one** case: bind → allocate shared →
zero unexplained coverage for the tagged teams/period → ETC entered → FAC
readable vs budget. Do not scale the case catalog first.

Open inputs (filled on the pilot record, not invented here): which case,
which teams, which period, whether first budget hours come from finance
spreadsheet or are typed. Overlay remains authority after that paste.

---

## 3. Information architecture

### Navigation

Same rail. New item **Cases** between Mapping and Cost.

```
Hours Control     Overview  Delivery  Mapping  Cases  Cost  Reports     fetched-at
```

| Page | Job in this design | Does not |
| --- | --- | --- |
| **Overview** | Pulse: unique cost, active EDPs, pending, shared, program unique, **pilot FAC / budget / holes**. | Charts, case editor |
| **Delivery** | True tree. Progressive Product → EDP → record, or Program → M → EPP → record. Row = local breakdown. Key = Jira. | Edit overlay, budgets, ETC |
| **Mapping** | Inbox + inspector + add/reject. Same progressive chrome as Delivery. | Invent milestone membership, write PolarIS |
| **Cases** | Control object. Progressive Case list → case record (envelope, tree slice, allocation, coverage, ETC). | Product/Program as peer identity of a case |
| **Cost** | Line / milestone / EDP hour envelopes. Budgets here are **roll-up envelopes**, not the case ledger. Case budgets live on Cases. | Split shared 50/50 |
| **Reports** | Variance-to-detail. Modes: Product line, Program M1–M4, **Case**. Same KPI → analysis → trend → concentration → table grammar. | Insight essays, euros |

Deep links stay URL-hash / query based:

- Delivery: `?line=` / `?view=milestone&milestone=`
- Cases: `?case=`
- Reports: existing workbench params plus `mode=case&case=`

Selecting a Jira key always opens Jira in a new tab. Selecting a title or row
stays in the console.

### What connects to what

```
overlay_links.json      ── Mapping ──► cost membership on the tree
overlay_budgets.json    ── Cost    ──► product / EDP / milestone envelopes
overlay_cases.json      ── Cases   ──► case records, budget versions, ETC, allocations
worklog_ledger.json     ── pipeline ─► associated hours, coverage, 30d burn (sanitized public)
tree_data.js            ── all pages (snapshot)
report_history.json     ── Reports + Overview trend (extend with case FAC)
```

Writes: local `python serve.py` POST `/overlay` `/budgets` `/cases`.
GitHub Pages: view + download JSON. Same pattern as today.

---

## 4. Component look (same chrome)

Tokens stay F0: bone `#E8E2D6`, ink `#161411`, rail `#141311`, amber `#B45309`
for pending only. IBM Plex Sans + Mono. Hairlines, 2px corners, no card candy,
no helper copy. Type chips, indent, Cost vs Logged. `[hidden]` stays none.

### 4.1 Overview

Keep the five KPIs. Add a sixth **Pilot** strip under the existing duo, same
`program-band` density — not a chart.

```
[ Unique h ] [ Active EDPs ] [ Pending ] [ Shared ] [ Program M1–M4 ]

Product table (existing)

Pending list          Program M1–M4 table
                      ─────────────────────
Pilot  CASE-KEY  title
Allocated  FAC  Budget  Left  Unallocated  Exceptions
```

- Pending KPI still links to Mapping inbox.
- Pilot numbers link to `cases.html?case=`.
- Unallocated or exceptions > 0 uses ink + count, not a third colour.
- No budget ⇒ Budget and Left are `—`.

### 4.2 Delivery (unchanged structure)

```
Delivery    [ Product line ▾ ]  [ Search ]              [ Health ▾ ] [ Active ]
┌ nav ──────────────┐  ┌ record ──────────────────────────────────────────┐
│ Product / M1–M4   │  │ EDP-nnn  title                    Cost    Logged │
│   EDP  key  Cost  │  │   EPP    key  shared?             Cost    Logged │
│   EDP  …          │  │     Feature …                                    │
└───────────────────┘  └──────────────────────────────────────────────────┘
```

Case membership is a quiet chip on the EDP record when bound (`CASE-…`),
linking to Cases. Delivery does not become the case editor.

### 4.3 Mapping (unchanged structure)

Inbox first. Confirm / reject / add. Shared warning when adding an EPP already
on another EDP. After save, Cases associated hours recompute on next payload
build (or live if serve.py re-applies overlay).

### 4.4 Cases (new — progressive, same split as Delivery)

**List (navigator)**

```
Cases     [ Active ▾ ]  [ Search ]                    [ Download ] [ Save ]
┌ nav ──────────────┐  ┌ record ──────────────────────────────────────────┐
│ PILOT *           │  │ CASE-…  title                                    │
│   CASE  FAC  Left │  │ [Allocated] [FAC] [Budget] [Left] [ETC] [Holes]  │
│   CASE  …         │  │                                                  │
│                   │  │ Bindings     EDPs in this case                   │
│                   │  │ Tree         cost members, Cost vs Logged        │
│                   │  │ Shared       allocate h or %                     │
│                   │  │ Coverage     ledger exceptions                   │
│                   │  │ ETC          case + optional per EPP             │
└───────────────────┘  └──────────────────────────────────────────────────┘
```

**Envelope strip (record header).** Six numbers, same KPI type as Reports, no
donut here. Dumbbell Cost vs Budget only if a budget exists.

| Chip | Value |
| --- | --- |
| Allocated | unique hours assigned to this case |
| FAC | allocated + ETC |
| Budget | current budget version |
| Left | budget − allocated; `—` if unbudgeted |
| ETC | overlay |
| Holes | unallocated associated + coverage exception hours |

**Bindings.** Table of EDPs: key (Jira), title (opens Delivery record), product
label, mapping health, unique associated, allocated. Add EDP from catalog.
Remove unbinds; does not reject PolarIS.

**Tree.** Reuse Delivery record chrome, scoped to bound EDPs. Pending Cost is
`—`. Shared flag on EPP rows.

**Shared / allocation.** Only EPPs with `sharedWith` or with another case
claim. Columns: EPP key, unique hours, associated cases, this case hours, %,
note. Empty this-case hours = unallocated. Primary save on the work-bar.

**Coverage.** Period and team chips from the case record (pilot fields). Table:
date, ticket key (Jira), hours, reason empty. Actions: `Map`, `Out of scope`,
`Other case`. Mapped rows disappear after overlay save + refresh. Out of scope
writes a case exception row, not cost.

**ETC.** One case-level hours input; optional per-EPP overrides that must sum
≤ case ETC if both set — simpler rule: **per-EPP ETC rolls up to case ETC**
when any EPP ETC exists; otherwise case ETC is the number. Integers or 0.5.

**Budget versions.** Not a full history UI in v1. Saving budget appends
`{ at, hours, source, note }` and displays the latest. Reports history uses
the hours valid on each snapshot date.

Empty state: no cases → one primary **New case** (id, title, period, optional
budget). First case is the pilot until another is starred.

### 4.5 Cost

Keep three tables: Product line, Program M1–M4, EDP.

Add a column **From cases** on EDP rows: sum of allocated hours from cases
bound to that EDP. If it disagrees with unique Cost, show the gap as
unallocated — do not overwrite Cost.

Line and milestone budgets remain independently editable. They are reporting
envelopes. They are not the case budget. A later optional “roll from cases”
is out of the first control slice.

### 4.6 Reports

Same page skeleton: context → KPI → 2:1 analysis → trend → concentration →
table.

View select grows a third option:

```
View     Product line | Program M1–M4 | Case
Metric   Cost | Logged | Budget | Left | Pending | Mapping | FAC
Compare  None | Logged | Budget | FAC
```

- Product and Program behaviour unchanged (F5.12–F5.15).
- Case mode: ranked bars by case allocated (or FAC). Composition donut =
  allocated / unallocated associated / pending (pending still not cost).
  Drill Case → EDP (then EPP in the table).
- FAC compare uses dumbbells like Cost vs Budget.
- Trend includes case FAC when ≥3 snapshots spanning 14 days; else `—`.
- CSV includes case id when mode is Case.

---

## 5. How each connection works

### Mapping → tree → associated

1. PolarIS link in cost unless overlay `reject`.
2. Overlay `add` / `confirm` makes a cost member.
3. Inferred pending stays inbox; unique hours under it are Pending, not Cost.
4. Case **associated** = unique hours of cost members on bound EDPs.
5. Shared EPP unique hours appear on every bound EDP’s tree (flagged) and
   count once in associated until allocated.

### Allocation → FAC

```
for each cost-member EPP in case trees:
  if exclusive to this case: allocated += unique(EPP)
  else: allocated += overlay allocation for (case, EPP) or 0

FAC = allocated + ETC
```

Rolled hours never enter FAC. Pending never enters FAC.

### Ledger → coverage

Refresh fetches worklogs for the pilot teams and period. Each row maps to a
ticket. Walk parents to EPP. If that EPP is a cost member of a bound EDP of
the case → in tree. Else → exception.

Coverage % = in-tree unique ledger hours / (in-tree + exception hours) for
that window. 100% means the tagged teams’ hours in period are explained, not
that Jira is fully mapped globally.

### Cost page vs Cases

| | Cost | Cases |
| --- | --- | --- |
| Question | How much unique spend sits on this line / EDP / milestone vs envelope? | Will this funded case complete inside its hours? |
| Spend | Unique cost membership | Allocated unique |
| Remaining | Budget − spent | Budget − allocated; control uses FAC − budget |
| Shared | Flagged, not split | Split only by explicit allocation |

### Reports vs Cases

Cases is the **work** surface (edit). Reports is the **read** surface
(compare, trend, export). Neither writes PolarIS.

---

## 6. Data (overlay SoT)

`jira_map/overlay_cases.json` (shape for implementation; not shipped until R6):

```json
{
  "version": 1,
  "updatedAt": null,
  "pilot": "CASE-1",
  "cases": [
    {
      "id": "CASE-1",
      "title": "",
      "status": "active",
      "period": { "from": null, "to": null },
      "teams": [],
      "edps": [],
      "milestones": [],
      "budgets": [],
      "etcHours": null,
      "etcByEpp": {},
      "allocations": [
        { "epp": "EPP-0", "hours": 0, "note": "", "updatedAt": null }
      ],
      "exceptions": [
        { "key": "EPP-0", "action": "out_of_scope", "note": "", "updatedAt": null }
      ]
    }
  ]
}
```

Budget row: `{ "at": "ISO-date", "hours": 0, "source": "manual", "note": "" }`.

Ledger public file: `{ "fetchedAt", "period", "rows": [{ "date", "key", "hours", "epp" }] }` — no authors.

Pipeline grows: `fetch_time` still fills tree rollups; `fetch_worklogs` (new)
writes the sanitized ledger; `apply_overlay` + `apply_cases` (new) stamp
associated / allocated / FAC onto the payload; `build_mindmap` snapshots case
KPIs into `report_history.json`.

---

## 7. What “controllable” means (pilot done)

A case is controllable when all of these are true:

1. Bound EDPs have no pending-inferred cost members in the case trees.
2. Every shared EPP in those trees is allocated or explicitly left as a hole
   (hole count is known).
3. Coverage exceptions for the stated teams and period are empty or classified
   (out of scope / other case).
4. ETC is a number (including 0), not blank.
5. Budget is a number **or** the record is labelled unbudgeted and FAC is
   still shown.
6. Overview, Cases, and Reports Case mode show the same Allocated and FAC.

Until then, Hours Control reports **traceable unique spend**. It does not
claim the business case is under control.

---

## 8. Out of this design

Write PolarIS. Euros. Auth. MariaDB. Auto-splitting shared EPPs. Treating
BRP as a Service hours as program M1–M4. Publishing worklog authors on Pages.
Feature-level overlay. Live Jira in the browser. Multiple pilots before one
case is controllable.
