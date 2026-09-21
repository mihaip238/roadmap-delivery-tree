# Hours Control — reporting intelligence

## North star

A sold module or client commitment should be controlled at the **deliverable**
level (usually an EDP, sometimes a bounded part of one) without asking Sales or
Consultancy to collect EPPs manually.

```
Business case / commitment
        ↓
Deliverable (EDP) — accountable report
        ↓
EPP → Feature → Story — Jira evidence
```

Stories are where evidence is maintained. The report rolls that evidence up.
An EDP status alone is never accepted as proof that its children are done.

## 1. Decisions before metrics

| Audience | Decision | Minimum evidence |
| --- | --- | --- |
| Business-case owner | Continue, change scope, add capacity, or stop? | Scope baseline, spent, remaining, FAC, target, benefits, risks |
| Sales / account | Can we make or keep the customer commitment? | Deliverable state, forecast date, confidence, blockers, scope change |
| Consultancy | Can we plan implementation, migration, training, and handover? | Release/acceptance readiness, dependency dates, open client actions |
| Client | What is done, what is next, and what needs attention? | Agreed scope, completed/in-progress/remaining, milestone, blockers, decisions |
| Delivery lead | Where must the team act now? | Story/Feature workflow, unestimated work, aging WIP, blockers, estimate drift |

The executive answer is short:

1. **What did we promise?**
2. **Where is it now?**
3. **What has it consumed?**
4. **What remains?**
5. **When will it finish, with what confidence?**
6. **What can stop it?**
7. **What changed since the commitment?**
8. **Will the intended business/client benefit be realized?**

## 2. Report hierarchy

### Business-case / commitment report

Portfolio of deliverables: allocated hours, FAC, budget, target confidence,
blockers, benefit owner, and change. Drill to the deliverable report.

### Deliverable report (implemented first)

One EDP, top-down:

- identity, product, Jira status, mapping health;
- completion by leaf Jira workflow state;
- unique spent, original estimate, remaining estimate, linear forecast;
- estimate coverage and evidence confidence;
- hours concentration by EPP;
- pending mapping, shared scope, target, blockers;
- EPP → Feature → Story table with Jira links;
- explicit **Track next in Jira** gaps.

### Delivery evidence

The exact Jira hierarchy. EPPs group work; Features and Stories provide scope,
workflow, estimates, time, acceptance, and blocker evidence.

## 3. What the current Jira snapshot can support

Snapshot: `2026-09-14T14:06:16Z`.

| Insight | Current evidence | State |
| --- | --- | --- |
| Unique spent by product / EDP / EPP / milestone | Jira worklogs + confirmed membership | Available |
| Logged vs Cost vs Pending | Worklogs + overlay membership | Available |
| Scope hierarchy and concentration | 102 keyed EPPs, 279 Features, 981 Stories in the product payload | Available |
| Current workflow composition | Jira status names | Partial: status category was not preserved in this snapshot |
| Completion by leaf-item count | Story/Feature statuses; removed scope excluded | Partial: fallback status mapping |
| Original-estimate coverage | 310/981 Stories and 85/279 Features carry original estimate | Partial (~32% / ~30%) |
| Spent vs original estimate | Worklogs and sparse original estimates | Partial; not a completion forecast |
| Remaining work / ETC from Jira | Jira has `timeestimate`; old payload omitted it | Unavailable until next refresh with new pipeline |
| Forecast finish | Needs remaining estimate + ≥3 snapshots over ≥14 days | Unavailable (one snapshot) |
| Mapping coverage | 9 confirmed / 63 active; 17 pending; 37 none | Available and currently weak |
| Budget / FAC | Overlay supports it | Unavailable until authoritative inputs exist |
| Blockers / risks | No consistent Flagged/blocker reason in payload | Unavailable |
| Promised target date | No accountable EDP target date in payload | Unavailable |
| Scope change | Future snapshot differences can show it | Unavailable with one snapshot |
| Lead/cycle time, aging WIP | Requires status transition history/revisions | Unavailable |
| Release / client acceptance readiness | No normalized acceptance/release evidence | Unavailable |
| Business benefit realization | No benefit owner, baseline, target, actual | Unavailable |

The application must never turn sparse estimates into a precise date. `—` plus
the required Jira practice is more useful than false confidence.

Time currently comes from Jira ticket aggregates (`timespent`,
`aggregatetimespent`), not individual worklog rows. There is no worklog date,
author, or team in product/program reporting; burn is therefore derived from
dated snapshot deltas. The case ledger schema exists but is empty until a
sanitized fetch is configured.

An older Excel/CSV source contains a `business_case` column, but that field is
not in the frontend payload. Do not publish it automatically: this repository
and GitHub Pages are public. Case identity must be explicitly sanitized or
maintained in `overlay_cases.json`.

## 4. KPI evidence contract

KPIs are definitions, not hard-coded cards. Each KPI declares:

```text
id · label · decision · formula · unit · source · evidence status · tracking action
```

Evidence status:

- **available** — source and denominator are complete enough for the claim;
- **partial** — number is useful but has a named coverage/proxy limitation;
- **unavailable** — show `—`; state what must be tracked.

Implemented registry: `assets/js/kpis.js`.

### Initial deliverable KPIs

| KPI | Formula | Guardrail |
| --- | --- | --- |
| Items done | Done leaf items / (all leaf items − removed) | Count-weighted scope proxy, not earned progress; partial until status category coverage is 100%; never “hours spent / estimate” |
| Spent | Unique own worklog hours in confirmed cost-member tree | Pending inferred excluded |
| Original | Unique sum of Jira original estimates | Always paired with estimate coverage |
| Remaining | Unique sum of Jira remaining estimates | `—` until refreshed and sufficiently maintained |
| Estimate coverage | Estimated active leaf items / active leaf items | Removed work excluded |
| Forecast finish | Remaining / historical daily burn, projected from latest snapshot | Requires ≥70% Original and Remaining coverage plus ≥3 snapshots spanning 14 days; labelled partial/linear |
| Pending mapping | Unique hours under inferred EPPs | Never Cost |
| Shared scope | Confirmed EPPs with multiple EDP owners | Not auto-split |
| Blockers | Flagged/blocker-linked open items | `—` until one Jira convention exists |
| Target | Accountable EDP target date | `—` until field and ownership exist |

## 5. Jira tracking contract (add in this order)

### P0 — needed for a credible customer commitment

1. **Remaining estimate** on every active Story; update when logging work.
2. **Target date** on the EDP (one field, one owner, change history retained).
3. **Blocker convention**: Jira Flagged plus blocker reason, owner, and review date.
4. **Status category** preserved in the reporting payload (pipeline implemented;
   next Jira refresh populates it).
5. **Scope membership**: every active Story has Feature → EPP → EDP ancestry.

### P1 — needed for forecast confidence and change control

6. Baseline scope/date/estimate snapshot when a commitment is approved.
7. Definition of done / client acceptance state on deliverable scope.
8. Dependency links with needed-by date and owner.
9. Release milestone / version for customer-usable completion.
10. Regular snapshots or Jira revision history for scope and flow change.

### P2 — needed for business-case traction, not only delivery

11. Benefit statement, owner, baseline, target, measurement date, actual.
12. Client/account commitment identifier linking one case to one or more EDPs.
13. Decision log for scope/date/budget changes.

Do not create one mega-form on every Story. Put business ownership and target on
the EDP/case; delivery evidence and remaining work on Story/Feature; dependency
and blocker evidence on the affected work item.

## 6. Industry logic reused carefully

### Earned value

PMI EVM integrates scope, schedule, and resources and supports forecasting.
However, EV/PV/SPI require a performance baseline and objective earned value.
Current Jira hours alone provide actual effort, **not earned value**. Hours
Control should add SPI/EAC only after baseline scope, planned value, and
completion weights exist.

### Jira epic reporting

Atlassian Epic Report/Burndown patterns justify:

- complete / incomplete / unestimated composition;
- remaining work and scope change;
- forecasts only when estimation coverage is adequate.

Atlassian explicitly warns that predictions are unreliable with substantial
unestimated work. We expose estimate coverage beside the forecast.

### Flow analytics

Azure DevOps CFDs and cycle/lead time use daily state snapshots or revision
history. Current Hours Control history is one daily aggregate snapshot, so flow
metrics must wait for repeated snapshots or Jira revisions.

### Benefits realization

PMI BRM separates delivery outputs from business outcomes. Hours, status, and
forecast control delivery; a business case also needs a benefit owner, target,
measurement procedure, and post-delivery actual.

### Evidence-based management

Scrum.org EBM warns against reducing control to team output. Delivery reports
must eventually connect Time-to-Market and Ability-to-Innovate with Current and
Unrealized Value. Story counts and hours are evidence of delivery, not customer
value.

## 7. Sources

1. [PMI — The Standard for Earned Value Management](https://www.pmi.org/standards/earned-value-management) — scope/schedule/resources integration and forecasting.
2. [PMI — Practical Calculation: EVM](https://www.pmi.org/learning/library/practical-calculation-evm-6774) — EV, PV, SPI, ETC and EAC formulas/assumptions.
3. [PMI — Benefits Realization Management Framework](https://www.pmi.org/-/media/pmi/documents/public/pdf/learning/thought-leadership/benefits-realization-management-framework.pdf) — business case, benefits plan, KPIs, ownership, reporting.
4. [Atlassian — Epic Report](https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-epic-report/) — complete, incomplete and unestimated work.
5. [Atlassian — Epic Burndown](https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-epic-burndown-report/) — remaining work, scope change, estimation-coverage warning and sprint forecast.
6. [Atlassian — Generate a report / Time Tracking Report](https://support.atlassian.com/jira-software-cloud/docs/generate-a-report/) — original, remaining, spent and estimate accuracy.
7. [Atlassian — Log time on a work item](https://support.atlassian.com/jira-software-cloud/docs/log-time-on-an-issue/) — maintaining spent and remaining estimates.
8. [Azure DevOps — Cumulative flow](https://learn.microsoft.com/en-us/azure/devops/report/dashboards/cumulative-flow?view=azure-devops) — WIP and bottleneck visualization.
9. [Azure DevOps Analytics data model](https://learn.microsoft.com/en-us/azure/devops/report/extend-analytics/data-model-analytics-service?view=azure-devops) — current state vs snapshots vs revisions.
10. [Azure DevOps — Lead and cycle time](https://learn.microsoft.com/en-us/azure/devops/report/powerbi/sample-boards-leadcycletime?view=azure-devops) — item-level flow measures.
11. [Scrum.org — Evidence-Based Management](https://www.scrum.org/resources/evidence-based-management) — Current Value, Unrealized Value, Time-to-Market, Ability-to-Innovate.
12. [Microsoft Project portfolio reporting](https://learn.microsoft.com/en-us/projectonline/project-features-descriptions) — portfolio, status, resources, issues/risks/deliverables reporting.

## 8. Sequence

1. **Now:** EDP Deliverable report + KPI evidence registry.
2. Refresh Jira with status category and remaining estimate retained.
3. Establish P0 tracking conventions; measure coverage in the report.
4. Accumulate ≥3 snapshots over ≥14 days; activate linear finish forecast.
5. Add baseline/change, blockers/dependencies, release/acceptance.
6. Add business benefit measures; only then call the full case “traction.”
