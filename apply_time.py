"""Attach Jira time onto the delivery tree and compute rolled-up spent/estimate.

Does not invent Product Names or PolarIS links. Extra Jira children found by
parent walk are attached so EPP/EDP totals are not silently short.
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from jira_time import (
    feature_rolled_estimate,
    feature_rolled_remaining,
    feature_rolled_spent,
    format_jira_time,
    hours,
    later_date,
    leaf_rolled_estimate,
    leaf_rolled_remaining,
    leaf_rolled_spent,
    stamp_last_booked,
    time_view,
)

ROOT = Path(r"C:\Users\MihaiPostolache\Downloads\kpisss")
TREE = ROOT / "jira_map" / "delivery_tree.json"
TIME = ROOT / "jira_map" / "time_tracking.json"
LAST_BOOKED = ROOT / "jira_map" / "last_booked.json"
AUDIT = ROOT / "jira_map" / "time_audit.json"


def load_last_booked() -> dict[str, str]:
    if not LAST_BOOKED.exists():
        return {}
    blob = json.loads(LAST_BOOKED.read_text(encoding="utf-8"))
    dates = blob.get("dates") if isinstance(blob, dict) else {}
    return {key: value for key, value in (dates or {}).items() if key and value}


def rec_for(index: dict, key: str | None) -> dict | None:
    if not key:
        return None
    return index.get(key)


def attach_story(st: dict, index: dict) -> dict:
    rec = rec_for(index, st.get("key"))
    own = int((rec or {}).get("ownSpentSec") or 0)
    rolled = leaf_rolled_spent(rec)
    own_est = (rec or {}).get("ownEstimateSec")
    rolled_est = leaf_rolled_estimate(rec) if rec else 0
    own_remaining = (rec or {}).get("ownRemainingSec")
    rolled_remaining = leaf_rolled_remaining(rec) if rec else 0
    points = (rec or {}).get("storyPoints")
    last_booked = (rec or {}).get("lastBookedOn")
    out = dict(st)
    if rec:
        out.setdefault("summary", rec.get("summary"))
        out.setdefault("issuetype", rec.get("issuetype"))
        out.setdefault("status", rec.get("status"))
        out.setdefault("statusCategory", rec.get("statusCategory"))
        out.setdefault("project", rec.get("project"))
    out["time"] = time_view(
        rec,
        own_spent=own,
        rolled_spent=rolled,
        own_estimate=own_est,
        rolled_estimate=rolled_est or None,
        own_remaining=own_remaining,
        rolled_remaining=rolled_remaining or None,
        own_points=points,
        rolled_points=points,
        unlisted_spent=max(0, rolled - own),
        last_booked_on=last_booked,
        last_booked_on_rolled=last_booked,
    )
    return out


def attach_feature(feat: dict, index: dict, children_by_parent: dict, seen_stories: set[str]) -> dict:
    key = feat.get("key")
    rec = rec_for(index, key)
    stories = [attach_story(st, index) for st in feat.get("stories") or []]
    known = {st.get("key") for st in stories if st.get("key")}
    extra = []
    for child_key in children_by_parent.get(key or "", []):
        if child_key in known:
            continue
        child_rec = rec_for(index, child_key)
        extra.append(attach_story({
            "key": child_key,
            "summary": (child_rec or {}).get("summary"),
            "issuetype": (child_rec or {}).get("issuetype"),
            "status": (child_rec or {}).get("status"),
            "statusCategory": (child_rec or {}).get("statusCategory"),
            "project": (child_rec or {}).get("project"),
            "addedFrom": "live_parent_walk",
        }, index))
    stories.extend(extra)
    child_spent = sum((st.get("time") or {}).get("rolledSpentSec") or 0 for st in stories)
    child_est = sum((st.get("time") or {}).get("rolledEstimateSec") or 0 for st in stories)
    child_remaining = sum((st.get("time") or {}).get("rolledRemainingSec") or 0 for st in stories)
    child_pts = 0.0
    has_pts = False
    for st in stories:
        pts = (st.get("time") or {}).get("rolledPoints")
        if pts is not None:
            child_pts += float(pts)
            has_pts = True
    own = int((rec or {}).get("ownSpentSec") or 0)
    rolled = feature_rolled_spent(rec, child_spent)
    own_est = (rec or {}).get("ownEstimateSec")
    rolled_est = feature_rolled_estimate(rec, child_est)
    own_remaining = (rec or {}).get("ownRemainingSec")
    rolled_remaining = feature_rolled_remaining(rec, child_remaining)
    own_pts = (rec or {}).get("storyPoints")
    rolled_pts = (own_pts or 0) + child_pts if (own_pts is not None or has_pts) else None
    listed = own + child_spent
    unlisted = max(0, rolled - listed)
    own_booked = (rec or {}).get("lastBookedOn")
    rolled_booked = later_date(own_booked, *[
        (st.get("time") or {}).get("lastBookedOnRolled") for st in stories
    ])
    out = dict(feat)
    if rec:
        out.setdefault("summary", rec.get("summary"))
        out.setdefault("issuetype", rec.get("issuetype"))
        out.setdefault("status", rec.get("status"))
        out.setdefault("statusCategory", rec.get("statusCategory"))
        out.setdefault("project", rec.get("project"))
    out["stories"] = stories
    out["story_count"] = len(stories)
    out["time"] = time_view(
        rec,
        own_spent=own,
        rolled_spent=rolled,
        own_estimate=own_est,
        rolled_estimate=rolled_est or None,
        own_remaining=own_remaining,
        rolled_remaining=rolled_remaining or None,
        own_points=own_pts,
        rolled_points=rolled_pts,
        unlisted_spent=unlisted,
        last_booked_on=own_booked,
        last_booked_on_rolled=rolled_booked,
    )
    for st in stories:
        if st.get("key"):
            seen_stories.add(st["key"])
    return out


def attach_epp(epp: dict, index: dict, children_by_parent: dict, shared: dict[str, list[str]]) -> dict:
    key = epp.get("key")
    rec = rec_for(index, key)
    features = [attach_feature(f, index, children_by_parent, set()) for f in epp.get("children") or []]
    known = {f.get("key") for f in features if f.get("key")}
    for child_key in children_by_parent.get(key or "", []):
        if child_key in known:
            continue
        child_rec = rec_for(index, child_key)
        itype = (child_rec or {}).get("issuetype") or ""
        # Direct EPP children are features (or stray stories). Attach as feature nodes.
        features.append(attach_feature({
            "key": child_key,
            "summary": (child_rec or {}).get("summary"),
            "issuetype": itype,
            "status": (child_rec or {}).get("status"),
            "statusCategory": (child_rec or {}).get("statusCategory"),
            "project": (child_rec or {}).get("project"),
            "stories": [],
            "addedFrom": "live_parent_walk",
        }, index, children_by_parent, set()))
    child_spent = sum((f.get("time") or {}).get("rolledSpentSec") or 0 for f in features)
    child_est = sum((f.get("time") or {}).get("rolledEstimateSec") or 0 for f in features)
    child_remaining = sum((f.get("time") or {}).get("rolledRemainingSec") or 0 for f in features)
    child_pts = 0.0
    has_pts = False
    for f in features:
        pts = (f.get("time") or {}).get("rolledPoints")
        if pts is not None:
            child_pts += float(pts)
            has_pts = True
    own = int((rec or {}).get("ownSpentSec") or 0)
    own_est = (rec or {}).get("ownEstimateSec")
    own_pts = (rec or {}).get("storyPoints")
    # EPP aggregate does NOT include features. Always own + children.
    rolled = own + child_spent
    rolled_est = (own_est or 0) + child_est
    own_remaining = (rec or {}).get("ownRemainingSec")
    rolled_remaining = (own_remaining or 0) + child_remaining
    rolled_pts = (own_pts or 0) + child_pts if (own_pts is not None or has_pts) else None
    own_booked = (rec or {}).get("lastBookedOn")
    rolled_booked = later_date(own_booked, *[
        (f.get("time") or {}).get("lastBookedOnRolled") for f in features
    ])
    out = dict(epp)
    if rec:
        out.setdefault("summary", rec.get("summary"))
        out.setdefault("issuetype", rec.get("issuetype"))
        out.setdefault("status", rec.get("status"))
        out.setdefault("statusCategory", rec.get("statusCategory"))
    out["children"] = features
    out["feature_count"] = len(features)
    out["story_count"] = sum(f.get("story_count") or 0 for f in features)
    out["time"] = time_view(
        rec,
        own_spent=own,
        rolled_spent=rolled,
        own_estimate=own_est,
        rolled_estimate=rolled_est or None,
        own_remaining=own_remaining,
        rolled_remaining=rolled_remaining or None,
        own_points=own_pts,
        rolled_points=rolled_pts,
        shared_with=shared.get(key or "", []),
        last_booked_on=own_booked,
        last_booked_on_rolled=rolled_booked,
    )
    return out


def unique_own_spent(node: dict, seen: set[str]) -> int:
    total = 0
    key = node.get("key")
    time_info = node.get("time") or {}
    if key and key not in seen:
        seen.add(key)
        total += int(time_info.get("ownSpentSec") or 0)
    for child in node.get("children") or node.get("stories") or []:
        total += unique_own_spent(child, seen)
    return total


def audit_feature(feat: dict) -> dict | None:
    rec_time = feat.get("time") or {}
    child_own = sum((st.get("time") or {}).get("rolledSpentSec") or 0 for st in feat.get("stories") or [])
    own = rec_time.get("ownSpentSec") or 0
    rolled = rec_time.get("rolledSpentSec") or 0
    listed = own + child_own
    # listed can exceed rolled only if Jira aggregate is stale/wrong.
    if listed > rolled + 60:
        return {
            "key": feat.get("key"),
            "kind": "listed_exceeds_feature_rolled",
            "own": own,
            "listedChildren": child_own,
            "rolled": rolled,
        }
    return None


def main() -> None:
    tree = json.loads(TREE.read_text(encoding="utf-8"))
    blob = json.loads(TIME.read_text(encoding="utf-8"))
    index = blob.get("issues") or {}
    children_by_parent = blob.get("childrenByParent") or {}
    for key, day in load_last_booked().items():
        rec = index.setdefault(key, {"key": key})
        rec["lastBookedOn"] = day

    epp_owners: dict[str, list[str]] = defaultdict(list)
    for item in list(tree.get("items") or []) + list(tree.get("non_ebase") or []):
        edp_key = (item.get("edp") or {}).get("key") or item.get("excel", {}).get("summary") or ""
        for epp in item.get("epps") or []:
            if epp.get("key"):
                epp_owners[epp["key"]].append(edp_key)
    shared = {
        key: sorted({edp for edp in owners if edp})
        for key, owners in epp_owners.items()
        if len(set(owners)) > 1
    }

    checks = []
    probe = index.get("EBASE-4092") or {}
    if probe:
        checks.append({
            "key": "EBASE-4092",
            "ownSpentSec": probe.get("ownSpentSec"),
            "jiraAggSpentSec": probe.get("jiraAggSpentSec"),
            "expectOwn": 22500,
            "expectAgg": 294300,
            "ownOk": probe.get("ownSpentSec") == 22500,
            "aggOk": probe.get("jiraAggSpentSec") == 294300,
        })
    epp18 = index.get("EPP-18") or {}
    if epp18:
        checks.append({
            "key": "EPP-18",
            "ownSpentSec": epp18.get("ownSpentSec"),
            "jiraAggSpentSec": epp18.get("jiraAggSpentSec"),
            "expectOwnEqualsAgg": True,
            "ok": epp18.get("ownSpentSec") == epp18.get("jiraAggSpentSec") == 326700,
        })
    flags: list[dict] = []
    items_out = []
    for group_name in ("items", "non_ebase"):
        group = []
        for item in tree.get(group_name) or []:
            epps = [attach_epp(e, index, children_by_parent, shared) for e in item.get("epps") or []]
            edp = dict(item.get("edp") or {})
            edp_rec = rec_for(index, edp.get("key"))
            own = int((edp_rec or {}).get("ownSpentSec") or 0)
            child_spent = sum((e.get("time") or {}).get("rolledSpentSec") or 0 for e in epps)
            child_est = sum((e.get("time") or {}).get("rolledEstimateSec") or 0 for e in epps)
            child_remaining = sum((e.get("time") or {}).get("rolledRemainingSec") or 0 for e in epps)
            child_pts = 0.0
            has_pts = False
            for e in epps:
                pts = (e.get("time") or {}).get("rolledPoints")
                if pts is not None:
                    child_pts += float(pts)
                    has_pts = True
            own_est = (edp_rec or {}).get("ownEstimateSec")
            own_remaining = (edp_rec or {}).get("ownRemainingSec")
            if edp_rec:
                edp.setdefault("status", edp_rec.get("status"))
                edp.setdefault("statusCategory", edp_rec.get("statusCategory"))
            unique_seen: set[str] = set()
            unique_spent = own
            for epp in epps:
                unique_spent += unique_own_spent(epp, unique_seen)
            shared_keys = sorted({
                e["key"] for e in epps
                if e.get("key") in shared
            })
            own_booked = (edp_rec or {}).get("lastBookedOn")
            rolled_booked = later_date(own_booked, *[
                (e.get("time") or {}).get("lastBookedOnRolled") for e in epps
            ])
            edp["time"] = time_view(
                edp_rec,
                own_spent=own,
                rolled_spent=own + child_spent,
                own_estimate=own_est,
                rolled_estimate=((own_est or 0) + child_est) or None,
                own_remaining=own_remaining,
                rolled_remaining=((own_remaining or 0) + child_remaining) or None,
                own_points=(edp_rec or {}).get("storyPoints"),
                rolled_points=child_pts if has_pts else None,
                shared_with=shared_keys,
                last_booked_on=own_booked,
                last_booked_on_rolled=rolled_booked,
            )
            edp["time"]["uniqueSpentSec"] = unique_spent
            edp["time"]["uniqueSpent"] = format_jira_time(unique_spent)
            edp["time"]["uniqueSpentHours"] = hours(unique_spent)
            gap = max(0, (own + child_spent) - unique_spent)
            edp["time"]["unlistedSpentSec"] = gap
            edp["time"]["unlistedSpent"] = format_jira_time(gap) if gap else ""
            coverage = dict(item.get("coverage") or {})
            coverage["feature_count"] = sum(e.get("feature_count") or 0 for e in epps)
            coverage["story_count"] = sum(e.get("story_count") or 0 for e in epps)
            coverage["spentHours"] = hours(own + child_spent)
            coverage["uniqueSpentHours"] = hours(unique_spent)
            coverage["estimateHours"] = hours(((own_est or 0) + child_est) or None)
            new_item = dict(item)
            new_item["edp"] = edp
            new_item["epps"] = epps
            new_item["coverage"] = coverage
            group.append(new_item)
            for epp in epps:
                for feat in epp.get("children") or []:
                    flag = audit_feature(feat)
                    if flag:
                        flags.append(flag)
        if group_name == "items":
            items_out = group
            tree["items"] = group
        else:
            tree["non_ebase"] = group

    spent_tickets = sum(1 for rec in index.values() if rec.get("ownSpentSec"))
    est_tickets = sum(1 for rec in index.values() if rec.get("ownEstimateSec"))
    pts_tickets = sum(1 for rec in index.values() if rec.get("storyPoints") is not None)
    tree["time"] = {
        "fetchedAt": blob.get("fetchedAt"),
        "issuesFetched": blob.get("issuesFetched"),
        "missingTreeKeys": blob.get("missingTreeKeys") or [],
        "ticketsWithSpent": spent_tickets,
        "ticketsWithEstimate": est_tickets,
        "ticketsWithStoryPoints": pts_tickets,
        "sharedEpps": shared,
        "workingHours": "Jira 8h/day, 5d/week. Feature rolled time uses aggregatetimespent so unlisted defects still count. EPP rolled time is own worklogs plus child Feature rolled time.",
    }
    TREE.write_text(json.dumps(tree, indent=2, ensure_ascii=False), encoding="utf-8")

    active = []
    for item in tree.get("items") or []:
        excel = item.get("excel") or {}
        if not excel.get("active"):
            continue
        edp = item.get("edp") or {}
        t = edp.get("time") or {}
        active.append({
            "edp": edp.get("key"),
            "summary": excel.get("summary"),
            "rolledSpent": t.get("rolledSpent"),
            "rolledSpentHours": t.get("rolledSpentHours"),
            "uniqueSpentHours": t.get("uniqueSpentHours"),
            "rolledEstimate": t.get("rolledEstimate"),
            "sharedWith": t.get("sharedWith") or [],
        })
    active.sort(key=lambda r: -(r.get("rolledSpentHours") or 0))
    audit = {
        "fetchedAt": blob.get("fetchedAt"),
        "issuesFetched": blob.get("issuesFetched"),
        "missingTreeKeys": blob.get("missingTreeKeys") or [],
        "extraFromEppWalk": blob.get("extraFromEppWalk"),
        "extraFromFeatureWalk": blob.get("extraFromFeatureWalk"),
        "ticketsWithSpent": spent_tickets,
        "ticketsWithEstimate": est_tickets,
        "ticketsWithStoryPoints": pts_tickets,
        "featureFlags": flags[:50],
        "featureFlagCount": len(flags),
        "sharedEppCount": len(shared),
        "probeChecks": checks,
        "activeEdpBySpent": active,
    }
    AUDIT.write_text(json.dumps(audit, indent=2, ensure_ascii=False), encoding="utf-8")
    print("wrote", TREE)
    print("audit", AUDIT)
    print("spent tickets", spent_tickets, "estimate", est_tickets, "points", pts_tickets)
    print("feature flags", len(flags), "shared epps", len(shared))
    print("top active", active[:8])


if __name__ == "__main__":
    main()
