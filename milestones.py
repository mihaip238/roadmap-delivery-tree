"""Power Balancer / BRPaaS delivery milestones → EPP keys.

Milestones are a customer-delivery cut (EET / VanHelder), not a Jira field.
BRPaaS is Power Balancer plus BPO services; both product lines sit in this view.

Source of M1–M4 EPP keys: AURORA versions 18221 / 18322 / 18388 / 18421, Confluence tracker,
Team Weekly (2026-09-16), and the EET decks (M2 KickOff, M4M2 13 Jul, PB Messaging 20 Aug,
Revision Flow 21 Aug). M5 (VolumeSeries, C-AR, register sync) is excluded on purpose.
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
        "eppKeys": ["EPP-262", "EPP-252", "EPP-279", "EPP-276"],
        "note": "PM hour overview 2026-08-28: Energy Program (EPP-262), Transport/GLMD (EPP-252), EMM foundation (EPP-279), UI foundation (EPP-276). M1 AURORA version 18221.",
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
        "eppKeys": [
            "EPP-302",
            "EPP-299",
            "EPP-311",
            "EPP-303",
            "EPP-377",
            "EPP-209",
            "EPP-300",
            "EPP-310",
        ],
        "note": "PM M3 list: forecast quality (EPP-302), position (EPP-299), financial realizations (EPP-311), FC admin (EPP-303), ETPA via Jules (EPP-377), Jules Intraday fetch (EPP-209), reconciliation dashboard epic (EPP-300), imbalance dashboard epic (EPP-310). AURORA-739/740 still hang under EPP-311. AURORA version 18388.",
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
            "EPP-379",
            "EPP-227",
        ],
        "note": "AURORA version 18421 plus NLALLCONPB revision scripts (EPP-379) and BPO unfinished-message overview (EPP-227 / AURORA-737). Distinct from EPP-18 on EDP-42. VolumeSeries EPP-313 is M5, not M4.",
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
