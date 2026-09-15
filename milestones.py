"""Power Balancer / BRPaaS delivery milestones → EPP keys.

Milestones are a customer-delivery cut (EET / VanHelder), not a Jira field.
BRPaaS is Power Balancer plus BPO services; both product lines sit in this view.

Source of M2–M4 EPP keys: AURORA feature tracker (Confluence) + Jira parent EPPs.
M1 is not on that tracker; EPP-252 is the AURORA nomination / transport-program parent.
Each listed EPP is included in full (all child features and stories).
"""
from __future__ import annotations

import copy
import json
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FETCHED = ROOT / "jira_map" / "milestone_epps.json"
JIRA = "https://eneve.atlassian.net/browse/"

MILESTONES = [
    {
        "key": "M1",
        "name": "Nomination / new architecture",
        "delivers": "Nomination flow — first go-live of the new architecture (VanHelder).",
        "target": "22 Jun 2026",
        "status": "Live",
        "eppKeys": ["EPP-252"],
        "note": "Not listed on the AURORA M3/M4 tracker. EPP-252 is the nomination/GLMD transport-program parent.",
    },
    {
        "key": "M2",
        "name": "Measurements",
        "delivers": "Credibility milestone — prove the architecture with measurements.",
        "target": "Aug 2026",
        "status": "In progress",
        "eppKeys": ["EPP-167", "EPP-172"],
        "note": "EPP-172 is the shared integration layer; the whole epic is shown, not only the measurement Kafka slice.",
    },
    {
        "key": "M3",
        "name": "Forecasting, position & financials",
        "delivers": "Forecasting, position management, and financial dashboards.",
        "target": "1 Oct 2026",
        "status": "Planned",
        "eppKeys": ["EPP-311", "EPP-299", "EPP-302"],
        "note": "These EPPs also hang off BRP as a Service EDPs on the product view.",
    },
    {
        "key": "M4",
        "name": "Alloc 2.0 + imbalance (EET go-live)",
        "delivers": "Allocation 2.0 and imbalance on the new stack — EET 2026 go-live.",
        "target": "1 Oct 2026",
        "status": "In progress",
        "eppKeys": [
            "EPP-189",
            "EPP-228",
            "EPP-292",
            "EPP-314",
            "EPP-224",
            "EPP-295",
            "EPP-293",
            "EPP-290",
            "EPP-217",
        ],
        "note": "Capability EPPs from AURORA. Distinct from EPP-18 (Allocation 2.0 Tranche 3 qualification) on EDP-42.",
    },
]


def all_epp_keys() -> list[str]:
    seen: list[str] = []
    for ms in MILESTONES:
        for key in ms["eppKeys"]:
            if key not in seen:
                seen.append(key)
    return seen


def flatten_edps(nodes: list[dict]) -> list[dict]:
    out = []
    for n in nodes:
        if n.get("type") == "theme":
            out.extend(n.get("children") or [])
        else:
            out.append(n)
    return out


def index_tree_epps(products: list[dict]) -> dict[str, dict]:
    """First copy of each EPP found under BRPaaS / Power Balancer (and elsewhere)."""
    found: dict[str, dict] = {}
    for prod in products:
        for edp in flatten_edps(prod.get("children") or []):
            for epp in edp.get("children") or []:
                key = epp.get("key")
                if key and key not in found:
                    found[key] = copy.deepcopy(epp)
    return found


def linked_edps(products: list[dict]) -> dict[str, list[dict]]:
    links: dict[str, list[dict]] = {}
    seen: dict[str, set[str]] = {}
    for prod in products:
        pname = prod.get("name") or ""
        for edp in flatten_edps(prod.get("children") or []):
            for epp in edp.get("children") or []:
                ekey = epp.get("key")
                if not ekey:
                    continue
                seen.setdefault(ekey, set())
                edp_key = edp.get("key") or edp.get("title") or ""
                sig = pname + "|" + edp_key
                if sig in seen[ekey]:
                    continue
                seen[ekey].add(sig)
                links.setdefault(ekey, []).append({
                    "key": edp.get("key") or "",
                    "title": edp.get("title") or "",
                    "product": pname,
                    "kind": edp.get("kind") or "",
                    "active": bool(edp.get("active")),
                    "roadmap": edp.get("roadmap") or "",
                })
    return links


def collect_own_spent(node: dict, acc: dict[str, int]) -> None:
    t = node.get("time") or {}
    key = node.get("key")
    if key:
        acc[key] = int(t.get("ownSpentSec") or 0)
    for child in node.get("children") or []:
        collect_own_spent(child, acc)


def unique_spent_hours(nodes: list[dict]) -> float:
    acc: dict[str, int] = {}
    for n in nodes:
        collect_own_spent(n, acc)
    return round(sum(acc.values()) / 3600, 2)


def annotate_epp(epp: dict, links: list[dict]) -> dict:
    out = copy.deepcopy(epp)
    out["type"] = "epp"
    out["url"] = out.get("url") or (JIRA + out["key"] if out.get("key") else "")
    out["linkedEdps"] = links
    products = list(OrderedDict.fromkeys(l["product"] for l in links if l.get("product")))
    out["products"] = products
    if links:
        out["alsoIn"] = []
        keys = [l["key"] for l in links if l.get("key")]
        if keys:
            out["onEdps"] = keys
    else:
        out["onEdps"] = []
        out["unlinked"] = True
    return out


def load_fetched() -> dict[str, dict]:
    if not FETCHED.exists():
        return {}
    blob = json.loads(FETCHED.read_text(encoding="utf-8"))
    return blob.get("epps") or {}


def build_milestone_tree(products: list[dict]) -> list[dict]:
    fetched = load_fetched()
    from_tree = index_tree_epps(products)
    links = linked_edps(products)
    missing: list[str] = []
    nodes = []
    for ms in MILESTONES:
        epps = []
        for key in ms["eppKeys"]:
            raw = fetched.get(key) or from_tree.get(key)
            if not raw:
                missing.append(key)
                epps.append({
                    "type": "epp",
                    "key": key,
                    "title": "(not fetched — run python fetch_milestone_epps.py)",
                    "status": "",
                    "url": JIRA + key,
                    "method": "milestone",
                    "featureCount": 0,
                    "storyCount": 0,
                    "children": [],
                    "onEdps": [],
                    "products": [],
                    "unlinked": True,
                    "missing": True,
                })
                continue
            epps.append(annotate_epp(raw, links.get(key) or []))
        rolled = 0.0
        feat_n = 0
        story_n = 0
        for epp in epps:
            hours = (epp.get("time") or {}).get("rolledSpentHours")
            if hours:
                rolled += float(hours)
            feat_n += int(epp.get("featureCount") or 0)
            story_n += int(epp.get("storyCount") or 0)
        uniq = unique_spent_hours(epps)
        uniq_sec = int(round(uniq * 3600))
        nodes.append({
            "type": "milestone",
            "key": ms["key"],
            "name": ms["name"],
            "title": ms["name"],
            "target": ms["target"],
            "status": ms["status"],
            "eppCount": len(epps),
            "featureCount": feat_n,
            "storyCount": story_n,
            "rolledSpentHours": round(rolled, 2),
            "uniqueSpentHours": uniq,
            "time": {
                "ownSpentSec": uniq_sec,
                "rolledSpentSec": uniq_sec,
                "rolledSpentHours": round(rolled, 2),
                "uniqueSpentHours": uniq,
                "rolledSpent": "",
                "uniqueSpent": "",
            },
            "children": epps,
        })
    return nodes
