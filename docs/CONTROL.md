# Hours Control — product design (insights and reports over Jira)

## North star

The product is **hours control over Jira**: unique-hour cost, envelopes, mapping
health, concentration, trend, and (once bound) business-case FAC — computed from
Jira work and time, read in Overview and Reports.

Jira is the system of work. Developers log time on tickets. Parents, Product
Name, PolarIS, and worklogs live there. Hours Control does not replace Jira and
does not write PolarIS. It is the control and reporting layer **on top of a
Jira snapshot**.

Mapping, Delivery, Cases, and Cost exist only so those reports are **cost**,
not a guess. If a screen does not improve a Jira-backed number or the drill
into its tickets, it is out of the product.

Living rules: [REQUIREMENTS.md](REQUIREMENTS.md). PolarIS is never written.
Cost is hours. Unique hours are cost. Pending inferred is not cost. Product
line and BRPaaS program M1–M4 stay separate cuts. GitHub Pages is read-only.

Traceability: *which Jira tickets sit under which roadmap item.*
Control: *whether a funded envelope will hold, given that Jira ledger.*
The tree stays. Reports sit on the tree.

---

## 1. Who owns what

| Layer | Owns | Does not own |
| --- | --- | --- |
| **Jira** | Issues, keys, Feature/Story parentage, Product Name, PolarIS (evidence), worklogs, `timespent`, remaining estimate (evidence) | Unique vs rolled, EDP↔EPP authority, case identity, budgets, ETC, allocations, product vs program cut |
| **Overlay (this repo)** | Confirm/add/reject membership, case records, versioned budgets, ETC, shared allocations, coverage classifications | Ticket hierarchy, worklog hours |
| **Hours Control** | Unique cost, pending vs cost, envelopes, FAC, mapping health, two BRPaaS cuts, history, the report workbench | Live Jira writes, euros |

Every Jira key in the console opens the issue in a new tab. Every hour in a
report traces to Jira tickets in the underlying table.

### Jobs (who does what)

| Role | Job | Surface |
| --- | --- | --- |
| Anyone | Read Jira-backed cost, program, mapping debt, pilot FAC | Overview, **Reports** |
| Mapper | Bind EDPs to EPPs so report Cost is not pending | Mapping |
| Controller | Own one case so Reports Case mode is FAC, not spend | Cases |
| Delivery lead | Inspect the Jira tree behind a number | Delivery |
| Reporter | Cut unique hours: product line, program M1–M4, case | Reports |

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

## 2. End-state insights (what Reports must answer from Jira)

These are the product. Other pages feed them.

| Insight | Cut | Jira input | Overlay input | Honest only if |
| --- | --- | --- | --- | --- |
| Unique **Cost** | Product line | Worklogs on cost-member tickets, Product Name on EDPs | Membership | Pending not mixed into Cost |
| Unique **Cost** | Program M1–M4 | Same + milestone EPP set | Membership; not product-line hours | Never labelled “BRPaaS” with the product line |
| **Logged** vs Cost | Either | All time on the shown tree vs cost members | Rejects | Logged ≥ Cost |
| **Pending** | Active EDPs | Hours under inferred EPPs | Unconfirmed matches | Amber, never Cost |
| **Mapping** | Active EDPs | PolarIS + catalog | Confirm/reject/add | Coverage = confirmed / active |
| **Budget / Left / %** | Line, EDP, M, case | Unique spent | Envelope hours | Empty budget ⇒ `—` |
| **Concentration / shared** | EDP / EPP | Unique hours | Shared flags | Unique default; rolled is a warning |
| **Burn / 30d / forecast** | Same cut | Snapshot history of Jira `fetchedAt` | — | ≥3 snapshots over 14 days, else `—` |
| **Associated / allocated / FAC** | Case | Worklogs on bound trees | Bindings, shares, ETC, budget | Shared not auto-split; pending out |
| **Coverage** | Case window | Ledger rows for tagged teams | Exceptions | 100% = those teams explained, not all of Jira |

Drill always ends on Jira keys. CSV is the same numbers as the table.

## 3. Control loop (how the week works)

Cadence is weekly: **refresh Jira → make Cost true → read Reports**. One
**pilot case** until Reports Case mode is controllable.

```
  Fetch Jira (tree, PolarIS, worklogs)
       │
       ▼
  Mapping inbox          Delivery tree
  (membership)           (inspect tickets)
       │                         │
       └──────────┬──────────────┘
                  ▼
           Cases — pilot (only if FAC is in scope)
           associated / allocated / coverage / ETC
                  │
                  ▼
           Reports  ← the payoff
           Product | Program | Case
           Overview is the same numbers, no charts
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

**Report.** The week ends on Reports. Product and Program modes stay exclusive.
Case mode is a third exclusive cut. A product filter never constrains Program.
Case mode never mixes those two BRPaaS meanings.

**Stop for v1 of control.** Reports Product and Program already exist. The next
slice makes **one** case honest in Reports: bind → allocate shared → classify
coverage for tagged teams/period → ETC entered → FAC vs budget. Do not scale
the case catalog first. Do not add pages that are not on this path.

Open inputs (filled on the pilot record, not invented here): which case,
which teams, which period, whether first budget hours come from finance
spreadsheet or are typed. Overlay remains authority after that paste.

---

## 4. Information architecture

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
| **Reports** | **Payoff.** Variance-to-detail over the Jira snapshot. Modes: Product line, Program M1–M4, **Case**. KPI → analysis → trend → concentration → table. Every row drills to Jira keys. | Insight essays, euros, a third BRPaaS mix |

Deep links stay URL-hash / query based:

- Delivery: `?line=` / `?view=milestone&milestone=`
- Cases: `?case=`
- Reports: existing workbench params plus `mode=case&case=`

Selecting a Jira key always opens Jira in a new tab. Selecting a title or row
stays in the console.

### What connects to what

```
Jira ── fetch ──► tree + PolarIS + timespent + worklog ledger
                      │
overlay_links.json    ┴─ Mapping ──► cost membership
overlay_budgets.json  ── Cost    ──► line / EDP / milestone envelopes
overlay_cases.json    ── Cases   ──► bindings, budget versions, ETC, allocations
                      │
tree_data.js          ── all pages (one snapshot, fetchedAt on the rail)
report_history.json   ── Reports trend (one row per Jira fetch date; + case FAC)
```

Writes: local `python serve.py` POST `/overlay` `/budgets` `/cases`.
GitHub Pages: view + download JSON. Same pattern as today.

---

## 5. Component look (same chrome)

Tokens stay F0: bone `#E8E2D6`, ink `#161411`, rail `#141311`, amber `#B45309`
for pending only. IBM Plex Sans + Mono. Hairlines, 2px corners, no card candy,
no helper copy. Type chips, indent, Cost vs Logged. `[hidden]` stays none.

### 5.1 Overview

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

### 5.2 Delivery (unchanged structure)

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

### 5.3 Mapping (unchanged structure)

Inbox first. Confirm / reject / add. Shared warning when adding an EPP already
on another EDP. After save, Cases associated hours recompute on next payload
build (or live if serve.py re-applies overlay).

### 5.4 Cases (new — progressive, same split as Delivery)

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

### 5.5 Cost

Keep three tables: Product line, Program M1–M4, EDP.

Add a column **From cases** on EDP rows: sum of allocated hours from cases
bound to that EDP. If it disagrees with unique Cost, show the gap as
unallocated — do not overwrite Cost.

Line and milestone budgets remain independently editable. They are reporting
envelopes. They are not the case budget. A later optional “roll from cases”
is out of the first control slice.

### 5.6 Reports (payoff)

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

## 6. How each connection works

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

Reports is the **product**. Cases is the **editor** that makes Case-mode
numbers true. Delivery is the **Jira tree** behind a row. Mapping is the
**membership** editor behind Cost vs Pending. Neither surface writes PolarIS.

---

## 7. Data (Jira snapshot + overlay SoT)

`jira_map/overlay_cases.json` (implemented in R6):

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

## 8. What “done” means

**Hours control over Jira is achieved** when a refresh of Jira is enough to
open Reports and trust:

1. Product-line Cost and Program M1–M4 Cost are unique, separate, and not
   pending.
2. Mapping coverage and pending exposure are visible; pending is never Cost.
3. Budgeted rows show Left; unbudgeted rows show `—`.
4. Trend/burn follow snapshot dates from Jira fetches.
5. Every chart row and table row opens or lists Jira keys.
6. For the **pilot case**, Reports Case mode matches Cases and Overview on
   Allocated and FAC (criteria below).

### Pilot case controllable

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

Until then, Hours Control reports **traceable unique spend from Jira**. It
does not claim the business case is under control.

---

## 9. Out of this design

Write PolarIS (or any Jira field). Jira dashboards/gadgets as the UI (the
console is the report surface; keys deep-link to Jira). Euros. Auth. MariaDB.
Auto-splitting shared EPPs. Treating BRP as a Service hours as program M1–M4.
Publishing worklog authors on Pages. Feature-level overlay. Live Jira in the
browser. Multiple pilots before one case is controllable. Pages that do not
change a report number or its Jira drill.
