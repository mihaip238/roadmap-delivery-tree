"""Fetch EPP → Feature → Story trees for Power Balancer / BRPaaS milestones.

Writes jira_map/milestone_epps.json in the same node shape as the product tree.
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone

from apply_time import attach_epp
from fetch_time import fetch_keys, fetch_parents, store_issue
from jira_time import FEATURE_TYPES
from milestones import FETCHED, JIRA, all_epp_keys


def to_story(st: dict) -> dict:
    key = st.get("key") or ""
    t = st.get("time") or {}
    return {
        "type": "story",
        "key": key,
        "title": st.get("summary") or st.get("title") or "",
        "status": st.get("status") or "",
        "issuetype": st.get("issuetype") or "",
        "url": (JIRA + key) if key else "",
        "time": slim_time(t),
    }


def slim_time(raw: dict | None) -> dict | None:
    if not raw:
        return None
    return {
        "ownSpentSec": raw.get("ownSpentSec") or 0,
        "rolledSpentSec": raw.get("rolledSpentSec") or 0,
        "ownEstimateSec": raw.get("ownEstimateSec"),
        "rolledEstimateSec": raw.get("rolledEstimateSec"),
        "ownSpent": raw.get("ownSpent") or "",
        "rolledSpent": raw.get("rolledSpent") or "",
        "ownEstimate": raw.get("ownEstimate") or "",
        "rolledEstimate": raw.get("rolledEstimate") or "",
        "ownSpentHours": raw.get("ownSpentHours"),
        "rolledSpentHours": raw.get("rolledSpentHours"),
        "rolledPoints": raw.get("rolledPoints"),
        "unlistedSpent": raw.get("unlistedSpent") or "",
        "sharedWith": raw.get("sharedWith") or [],
    }


def to_feature(feat: dict) -> dict:
    key = feat.get("key") or ""
    stories = [to_story(st) for st in feat.get("stories") or []]
    return {
        "type": "feature",
        "key": key,
        "title": feat.get("summary") or feat.get("title") or "",
        "status": feat.get("status") or "",
        "issuetype": feat.get("issuetype") or "",
        "url": (JIRA + key) if key else "",
        "storyCount": len(stories),
        "children": stories,
        "time": slim_time(feat.get("time")),
    }


def to_epp(epp: dict) -> dict:
    key = epp.get("key") or ""
    feats = [to_feature(f) for f in epp.get("children") or []]
    t = slim_time(epp.get("time")) or {}
    return {
        "type": "epp",
        "key": key,
        "title": epp.get("summary") or epp.get("title") or "",
        "status": epp.get("status") or "",
        "url": (JIRA + key) if key else "",
        "method": "milestone",
        "featureCount": len(feats),
        "storyCount": sum(f["storyCount"] for f in feats),
        "children": feats,
        "time": t,
    }


def main() -> None:
    keys = all_epp_keys()
    print("milestone EPPs", keys)
    index: dict[str, dict] = {}
    children: dict[str, list[str]] = defaultdict(list)

    for issue in fetch_keys(keys, "ms_epp"):
        store_issue(index, children, issue)
    missing = [k for k in keys if k not in index]
    if missing:
        print("missing EPP keys", missing)

    extra_features = 0
    for issue in fetch_parents(keys, "ms_epp"):
        before = issue.get("key") in index
        store_issue(index, children, issue)
        if issue.get("key") and not before:
            extra_features += 1
    print("new issues from EPP parent walk", extra_features)

    feature_parents = sorted({
        key for key, rec in index.items()
        if rec.get("issuetype") in FEATURE_TYPES
    })
    extra_leaves = 0
    for issue in fetch_parents(feature_parents, "ms_feature"):
        before = issue.get("key") in index
        store_issue(index, children, issue)
        if issue.get("key") and not before:
            extra_leaves += 1
    print("new issues from feature parent walk", extra_leaves)

    children_by_parent = {k: v for k, v in children.items()}
    epps = {}
    for key in keys:
        attached = attach_epp({"key": key, "children": []}, index, children_by_parent, {})
        epps[key] = to_epp(attached)
        print(
            key,
            epps[key]["title"],
            "feat", epps[key]["featureCount"],
            "stories", epps[key]["storyCount"],
            "spent", (epps[key].get("time") or {}).get("rolledSpent"),
        )

    FETCHED.parent.mkdir(parents=True, exist_ok=True)
    FETCHED.write_text(
        json.dumps({
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "source": "twg jira workitem query",
            "eppKeys": keys,
            "issuesFetched": len(index),
            "extraFromEppWalk": extra_features,
            "extraFromFeatureWalk": extra_leaves,
            "epps": epps,
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print("wrote", FETCHED, "epps", len(epps), "hours unique",
          round(sum(int((e.get("time") or {}).get("ownSpentSec") or 0) for e in epps.values()) / 3600, 2))


if __name__ == "__main__":
    main()
