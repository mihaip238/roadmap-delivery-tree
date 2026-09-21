"""Apply overlay_links.json to the delivery tree / product payload.

PolarIS is evidence. Overlay is authority. Inferred matches are inbox, not cost.
Never writes Jira.
"""
from __future__ import annotations

import argparse
import copy
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from apply_cases import apply_cases
from jira_time import format_jira_time, hours

ROOT = Path(__file__).resolve().parent
JIRA_MAP = ROOT / "jira_map"
OVERLAY_PATH = JIRA_MAP / "overlay_links.json"
BUDGETS_PATH = JIRA_MAP / "overlay_budgets.json"
DELIVERY_TREE = JIRA_MAP / "delivery_tree.json"
TREE_JS = JIRA_MAP / "tree_data.js"
PRODUCT_TREE = JIRA_MAP / "product_tree.json"

POLARIS_METHODS = {"polaris", "polaris_reverse"}
INFERRED_METHODS = {
    "inferred",
    "inferred_alias",
    "inferred_title",
    "inferred_child",
    "inferred_pending",
}

JS_PREFIX = "window.ROADMAP_TREE = "


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def load_overlay(path: Path | None = None) -> dict:
    blob = load_json(path or OVERLAY_PATH, {"version": 1, "links": []})
    if isinstance(blob, list):
        return {"version": 1, "links": blob}
    blob.setdefault("version", 1)
    blob.setdefault("links", [])
    return blob


def load_budgets(path: Path | None = None) -> dict:
    blob = load_json(path or BUDGETS_PATH, {"version": 1, "edps": {}, "products": {}, "milestones": {}})
    blob.setdefault("edps", {})
    blob.setdefault("products", {})
    blob.setdefault("milestones", {})
    return blob


def index_overlay(overlay: dict) -> dict[tuple[str, str], dict]:
    out: dict[tuple[str, str], dict] = {}
    for row in overlay.get("links") or []:
        edp = (row.get("edp") or "").strip()
        epp = (row.get("epp") or "").strip()
        action = (row.get("action") or "").strip()
        if not edp or not epp or action not in {"confirm", "add", "reject"}:
            continue
        out[(edp, epp)] = row
    return out


def classify_origin(method: str) -> str:
    m = method or ""
    if m in POLARIS_METHODS or m.startswith("polaris"):
        return "polaris"
    if m in INFERRED_METHODS or m.startswith("inferred"):
        return "inferred"
    if m in {"overlay", "confirm", "add"}:
        return "overlay"
    if m == "rejected":
        return "rejected"
    if m == "milestone":
        return "milestone"
    return "other"


def origin_method(epp: dict) -> str:
    """PolarIS / inferred / overlay origin, stable across re-applies."""
    src = epp.get("sourceMethod")
    if src:
        origin = classify_origin(src)
        if origin == "rejected":
            return src
        return src
    return epp.get("method") or ""


def membership_for(edp_key: str, epp: dict, overlay: dict[tuple[str, str], dict]) -> tuple[str, bool, dict | None]:
    """Return (method, cost_member, overlay_row)."""
    origin = classify_origin(origin_method(epp))
    epp_key = epp.get("key") or ""
    row = overlay.get((edp_key, epp_key)) if edp_key and epp_key else None
    action = (row or {}).get("action")
    if action == "reject":
        return "rejected", False, row
    if action in {"confirm", "add"}:
        if origin == "polaris":
            return "polaris", True, row
        return "overlay", True, row
    if origin == "polaris":
        return "polaris", True, row
    if origin == "overlay":
        return "overlay", True, row
    if origin == "inferred":
        return "inferred_pending", False, row
    if origin == "milestone":
        return "milestone", True, row
    return origin or "none", False, row


def unique_own_spent(node: dict, seen: set[str], *, cost_only: bool = False) -> int:
    if cost_only and node.get("type") == "epp" and node.get("costMember") is False:
        return 0
    total = 0
    key = node.get("key")
    time_info = node.get("time") or {}
    if key and key not in seen:
        seen.add(key)
        total += int(time_info.get("ownSpentSec") or 0)
    kids = node.get("children") or node.get("stories") or []
    for child in kids:
        total += unique_own_spent(child, seen, cost_only=cost_only)
    return total


def rolled_spent_sec(node: dict) -> int:
    t = node.get("time") or {}
    return int(t.get("rolledSpentSec") or 0)


def stamp_time(node: dict, *, own: int, rolled: int, unique: int, shared: list[str] | None = None) -> None:
    t = dict(node.get("time") or {})
    t["ownSpentSec"] = own
    t["rolledSpentSec"] = rolled
    t["ownSpentHours"] = hours(own)
    t["rolledSpentHours"] = hours(rolled)
    t["ownSpent"] = format_jira_time(own)
    t["rolledSpent"] = format_jira_time(rolled)
    t["uniqueSpentSec"] = unique
    t["uniqueSpentHours"] = hours(unique)
    t["uniqueSpent"] = format_jira_time(unique)
    gap = max(0, rolled - unique)
    t["unlistedSpentSec"] = gap
    t["unlistedSpent"] = format_jira_time(gap) if gap else ""
    if shared is not None:
        t["sharedWith"] = shared
    node["time"] = t


def apply_epp_row(edp_key: str, epp: dict, overlay: dict[tuple[str, str], dict]) -> dict:
    out = dict(epp)
    if "children" in epp:
        out["children"] = list(epp.get("children") or [])
    if "stories" in epp:
        out["stories"] = list(epp.get("stories") or [])
    out["sourceMethod"] = origin_method(out)
    method, cost, row = membership_for(edp_key, out, overlay)
    out["method"] = method
    out["costMember"] = cost
    if row:
        out["overlayAction"] = row.get("action")
        if row.get("note"):
            out["overlayNote"] = row.get("note")
    else:
        out.pop("overlayAction", None)
        out.pop("overlayNote", None)
    return out


def catalog_put(catalog: dict[str, dict], epp: dict) -> None:
    key = epp.get("key")
    if not key:
        return
    prev = catalog.get(key)
    if not prev or ((epp.get("title") or epp.get("summary")) and not (prev.get("title") or prev.get("summary"))):
        catalog[key] = copy.deepcopy(epp)


def collect_catalog_from_payload(payload: dict) -> dict[str, dict]:
    catalog: dict[str, dict] = {}
    for prod in payload.get("products") or []:
        for edp in flatten_edps(prod.get("children") or []):
            for epp in edp.get("children") or []:
                catalog_put(catalog, epp)
    for ms in payload.get("milestones") or []:
        for epp in ms.get("children") or []:
            catalog_put(catalog, epp)
    return catalog


def flatten_edps(nodes: list[dict]) -> list[dict]:
    out: list[dict] = []
    for n in nodes:
        if n.get("type") == "theme":
            out.extend(n.get("children") or [])
        else:
            out.append(n)
    return out


def stub_epp(key: str) -> dict:
    return {
        "type": "epp",
        "key": key,
        "title": "(not in tree — refresh fetch)",
        "summary": "(not in tree — refresh fetch)",
        "status": "",
        "url": f"https://eneve.atlassian.net/browse/{key}",
        "method": "overlay",
        "sourceMethod": "overlay",
        "costMember": True,
        "featureCount": 0,
        "storyCount": 0,
        "children": [],
        "missing": True,
        "time": {
            "ownSpentSec": 0,
            "rolledSpentSec": 0,
            "rolledSpentHours": 0.0,
            "uniqueSpentHours": 0.0,
        },
    }


def link_kind_for(cost_methods: list[str], pending: int, rejected: int) -> str:
    polaris = any(m == "polaris" for m in cost_methods)
    overlay = any(m == "overlay" for m in cost_methods)
    if polaris and overlay:
        return "mixed"
    if polaris:
        return "polaris"
    if overlay:
        return "overlay"
    if pending:
        return "inferred"
    if rejected and not cost_methods:
        return "none"
    return "none"


def apply_edp_node(edp: dict, overlay: dict[tuple[str, str], dict], catalog: dict[str, dict]) -> None:
    edp_key = edp.get("key") or ""
    existing = []
    seen = set()
    for epp in edp.get("children") or []:
        row = apply_epp_row(edp_key, epp, overlay)
        existing.append(row)
        if row.get("key"):
            seen.add(row["key"])
    for (edp_id, epp_key), row in overlay.items():
        if edp_id != edp_key:
            continue
        if row.get("action") == "reject":
            continue
        if epp_key in seen:
            continue
        if row.get("action") not in {"add", "confirm"}:
            continue
        src = copy.deepcopy(catalog.get(epp_key) or stub_epp(epp_key))
        src["sourceMethod"] = "overlay"
        src["method"] = "overlay"
        added = apply_epp_row(edp_key, src, overlay)
        added["type"] = "epp"
        existing.append(added)
        seen.add(epp_key)

    cost = [e for e in existing if e.get("costMember")]
    pending = [e for e in existing if e.get("method") == "inferred_pending"]
    rejected = [e for e in existing if e.get("method") == "rejected"]
    edp["children"] = existing
    edp["costChildren"] = [e.get("key") for e in cost if e.get("key")]
    edp["pendingChildren"] = [e.get("key") for e in pending if e.get("key")]
    edp["rejectedChildren"] = [e.get("key") for e in rejected if e.get("key")]
    edp["eppCount"] = len(cost)
    edp["pendingCount"] = len(pending)
    edp["rejectedCount"] = len(rejected)
    edp["featureCount"] = sum(int(e.get("featureCount") or 0) for e in cost)
    edp["storyCount"] = sum(int(e.get("storyCount") or 0) for e in cost)
    methods = [e.get("method") or "" for e in cost]
    kind = link_kind_for(methods, len(pending), len(rejected))
    edp["kind"] = kind
    edp["health"] = (
        "confirmed" if cost else ("pending" if pending else "none")
    )

    own = int((edp.get("time") or {}).get("ownSpentSec") or 0)
    rolled = own + sum(rolled_spent_sec(e) for e in cost)
    seen_keys: set[str] = set()
    if edp.get("key"):
        seen_keys.add(edp["key"])
    unique = own
    for epp_node in cost:
        unique += unique_own_spent(epp_node, seen_keys, cost_only=True)
    stamp_time(edp, own=own, rolled=rolled, unique=unique)


def collect_cost_owners(products: list[dict]) -> dict[str, list[str]]:
    owners: dict[str, set[str]] = defaultdict(set)
    seen_edp: set[str] = set()
    for prod in products:
        for edp in flatten_edps(prod.get("children") or []):
            edp_key = edp.get("key") or edp.get("title") or ""
            if not edp_key or edp_key in seen_edp:
                continue
            seen_edp.add(edp_key)
            for epp in edp.get("children") or []:
                if epp.get("costMember") and epp.get("key"):
                    owners[epp["key"]].add(edp_key)
    return {k: sorted(v) for k, v in owners.items() if len(v) > 1}


def stamp_shared(products: list[dict], shared: dict[str, list[str]]) -> None:
    for prod in products:
        for edp in flatten_edps(prod.get("children") or []):
            edp_shared = []
            for epp in edp.get("children") or []:
                key = epp.get("key")
                others = [x for x in shared.get(key or "", []) if x != (edp.get("key") or "")]
                t = dict(epp.get("time") or {})
                if others:
                    t["sharedWith"] = sorted({*others, edp.get("key") or ""} - {""})
                    # full owner list including self
                    t["sharedWith"] = shared.get(key, [])
                    epp["time"] = t
                    if key and key not in edp_shared:
                        edp_shared.append(key)
                else:
                    if t.get("sharedWith"):
                        t["sharedWith"] = []
                        epp["time"] = t
            et = dict(edp.get("time") or {})
            et["sharedWith"] = edp_shared
            edp["time"] = et


def collect_own_spent(node: dict, acc: dict[str, int], *, cost_only: bool = False) -> None:
    if cost_only and node.get("type") == "epp" and node.get("costMember") is False:
        return
    t = node.get("time") or {}
    key = node.get("key")
    if key:
        acc[key] = int(t.get("ownSpentSec") or 0)
    for child in node.get("children") or []:
        collect_own_spent(child, acc, cost_only=cost_only)


def unique_spent_hours(nodes: list[dict], *, cost_only: bool = False) -> float:
    acc: dict[str, int] = {}
    for n in flatten_edps(nodes):
        collect_own_spent(n, acc, cost_only=cost_only)
    return round(sum(acc.values()) / 3600, 2)


def retally_product(prod: dict) -> None:
    leaves = flatten_edps(prod.get("children") or [])
    rolled = 0.0
    epp_n = feat_n = story_n = 0
    for n in leaves:
        rolled += float((n.get("time") or {}).get("rolledSpentHours") or 0)
        epp_n += int(n.get("eppCount") or 0)
        feat_n += int(n.get("featureCount") or 0)
        story_n += int(n.get("storyCount") or 0)
    prod["edpCount"] = len(leaves)
    prod["activeCount"] = sum(1 for n in leaves if n.get("active"))
    prod["eppCount"] = epp_n
    prod["featureCount"] = feat_n
    prod["storyCount"] = story_n
    prod["rolledSpentHours"] = round(rolled, 2)
    prod["uniqueSpentHours"] = unique_spent_hours(prod.get("children") or [], cost_only=True)
    if prod.get("children") and prod["children"][0].get("type") == "theme":
        for theme in prod["children"]:
            kids = theme.get("children") or []
            theme["edpCount"] = len(kids)
            theme["activeCount"] = sum(1 for n in kids if n.get("active"))
            theme["uniqueSpentHours"] = unique_spent_hours(kids, cost_only=True)
            rolled_t = round(sum(float((n.get("time") or {}).get("rolledSpentHours") or 0) for n in kids), 2)
            theme["rolledSpentHours"] = rolled_t


def attach_budgets(payload: dict, budgets: dict) -> None:
    edp_b = budgets.get("edps") or {}
    prod_b = budgets.get("products") or {}
    ms_b = budgets.get("milestones") or {}
    for prod in payload.get("products") or []:
        name = prod.get("name") or ""
        if name in prod_b and prod_b[name] not in (None, ""):
            prod["budgetHours"] = float(prod_b[name])
        else:
            prod.pop("budgetHours", None)
        for edp in flatten_edps(prod.get("children") or []):
            key = edp.get("key") or ""
            if key in edp_b and edp_b[key] not in (None, ""):
                edp["budgetHours"] = float(edp_b[key])
            else:
                edp.pop("budgetHours", None)
    for ms in payload.get("milestones") or []:
        key = ms.get("key") or ""
        if key in ms_b and ms_b[key] not in (None, ""):
            ms["budgetHours"] = float(ms_b[key])
        else:
            ms.pop("budgetHours", None)
    payload["budgets"] = {
        "edps": edp_b,
        "products": prod_b,
        "milestones": ms_b,
        "updatedAt": budgets.get("updatedAt"),
    }


def epp_catalog_list(catalog: dict[str, dict]) -> list[dict]:
    rows = []
    for key, epp in sorted(catalog.items()):
        rows.append({
            "key": key,
            "title": epp.get("title") or epp.get("summary") or "",
            "status": epp.get("status") or "",
        })
    return rows


def hours_control_summary(payload: dict, shared: dict[str, list[str]]) -> dict:
    seen: set[str] = set()
    active = pending_active = confirmed_active = none_active = 0
    overlay_active = polaris_active = 0
    cost_acc: dict[str, int] = {}
    for prod in payload.get("products") or []:
        for edp in flatten_edps(prod.get("children") or []):
            ident = edp.get("key") or edp.get("title") or ""
            if not ident or ident in seen:
                continue
            seen.add(ident)
            collect_own_spent(edp, cost_acc, cost_only=True)
            if not edp.get("active"):
                continue
            active += 1
            health = edp.get("health") or ""
            if health == "pending":
                pending_active += 1
            elif health == "confirmed":
                confirmed_active += 1
            else:
                none_active += 1
            kind = edp.get("kind") or ""
            if kind == "overlay":
                overlay_active += 1
            if kind in {"polaris", "mixed"}:
                polaris_active += 1
    program_acc: dict[str, int] = {}
    for ms in payload.get("milestones") or []:
        for epp in ms.get("children") or []:
            collect_own_spent(epp, program_acc, cost_only=False)
    fetched = ((payload.get("totals") or {}).get("time") or {}).get("fetchedAt")
    return {
        "costUniqueHours": round(sum(cost_acc.values()) / 3600, 2),
        "programUniqueHours": round(sum(program_acc.values()) / 3600, 2),
        "uniqueEdp": len(seen),
        "activeEdp": active,
        "pendingInferredActive": pending_active,
        "confirmedActive": confirmed_active,
        "noneActive": none_active,
        "overlayActive": overlay_active,
        "polarisActive": polaris_active,
        "sharedEppCount": len(shared),
        "fetchedAt": fetched,
        "unit": "hours",
        "note": (
            "Hours, not euros. Unique de-duplicates tickets. "
            "Inferred pending is excluded from cost. "
            "Program hours are BRPaaS M1–M4 (EET / VanHelder), not the BRP as a Service product line."
        ),
    }


def apply_payload(payload: dict, overlay: dict | None = None, budgets: dict | None = None) -> dict:
    overlay = overlay if overlay is not None else load_overlay()
    budgets = budgets if budgets is not None else load_budgets()
    idx = index_overlay(overlay)
    catalog = collect_catalog_from_payload(payload)
    for prod in payload.get("products") or []:
        for edp in flatten_edps(prod.get("children") or []):
            apply_edp_node(edp, idx, catalog)
    shared = collect_cost_owners(payload.get("products") or [])
    stamp_shared(payload.get("products") or [], shared)
    for prod in payload.get("products") or []:
        retally_product(prod)
    attach_budgets(payload, budgets)
    # Refresh milestone EDP kind labels from overlay membership.
    edp_kind = {}
    for prod in payload.get("products") or []:
        for edp in flatten_edps(prod.get("children") or []):
            if edp.get("key"):
                edp_kind[edp["key"]] = edp.get("kind") or ""
    for ms in payload.get("milestones") or []:
        for epp in ms.get("children") or []:
            for link in epp.get("linkedEdps") or []:
                k = link.get("key")
                if k in edp_kind:
                    link["kind"] = edp_kind[k]
    payload["eppCatalog"] = epp_catalog_list(catalog)
    payload["overlay"] = {
        "linkCount": len(idx),
        "updatedAt": overlay.get("updatedAt"),
    }
    time_blob = dict((payload.get("totals") or {}).get("time") or {})
    time_blob["sharedEpps"] = shared
    totals = dict(payload.get("totals") or {})
    totals["time"] = time_blob
    totals["note"] = (
        "Official product = Jira/Excel Product Name. "
        "Overlay is the EDP↔EPP source of truth; PolarIS is evidence. "
        "Inferred title matches are inbox, not cost. "
        "Time is Jira worklogs (8h = 1d). Unique hours de-duplicate tickets. "
        "Delivery milestones group BRPaaS program EPPs (EET / VanHelder cut)."
    )
    payload["totals"] = totals
    payload["hoursControl"] = hours_control_summary(payload, shared)
    return apply_cases(payload)


def apply_delivery_item(item: dict, overlay: dict[tuple[str, str], dict], catalog: dict[str, dict]) -> dict:
    """Normalise a delivery_tree.json item onto the same membership rules."""
    edp = dict(item.get("edp") or {})
    excel = item.get("excel") or {}
    edp_key = edp.get("key") or ""
    # Shape like a product-tree EDP so apply_edp_node can run.
    node = {
        "type": "edp",
        "key": edp_key,
        "title": excel.get("summary") or edp.get("summary") or "",
        "time": edp.get("time") or {},
        "children": [],
        "active": bool(excel.get("active")),
    }
    for epp in item.get("epps") or []:
        row = dict(epp)
        row["type"] = "epp"
        if "title" not in row:
            row["title"] = row.get("summary") or ""
        node["children"].append(row)
        catalog_put(catalog, row)
    apply_edp_node(node, overlay, catalog)
    new_item = dict(item)
    new_item["edp"] = {**edp, "time": node.get("time")}
    new_item["epps"] = node["children"]
    new_item["link_kind"] = node.get("kind")
    new_item["health"] = node.get("health")
    cov = dict(item.get("coverage") or {})
    cov["epp_count"] = node.get("eppCount") or 0
    cov["feature_count"] = node.get("featureCount") or 0
    cov["story_count"] = node.get("storyCount") or 0
    cov["pending_count"] = node.get("pendingCount") or 0
    cov["spentHours"] = (node.get("time") or {}).get("rolledSpentHours")
    cov["uniqueSpentHours"] = (node.get("time") or {}).get("uniqueSpentHours")
    new_item["coverage"] = cov
    return new_item


def apply_delivery_tree(tree: dict, overlay: dict | None = None) -> dict:
    overlay = overlay if overlay is not None else load_overlay()
    idx = index_overlay(overlay)
    catalog: dict[str, dict] = {}
    tree = dict(tree)
    tree["items"] = [apply_delivery_item(i, idx, catalog) for i in tree.get("items") or []]
    tree["non_ebase"] = [apply_delivery_item(i, idx, catalog) for i in tree.get("non_ebase") or []]
    tree["overlay"] = {"linkCount": len(idx), "updatedAt": overlay.get("updatedAt")}
    return tree


def read_tree_js(path: Path | None = None) -> dict:
    path = path or TREE_JS
    text = path.read_text(encoding="utf-8")
    if not text.startswith(JS_PREFIX):
        raise ValueError(f"{path} does not start with {JS_PREFIX!r}")
    blob = text[len(JS_PREFIX):]
    if blob.endswith(";\n"):
        blob = blob[:-2]
    elif blob.endswith(";"):
        blob = blob[:-1]
    return json.loads(blob)


def write_tree_js(payload: dict, path: Path | None = None) -> None:
    path = path or TREE_JS
    path.write_text(JS_PREFIX + json.dumps(payload, ensure_ascii=False) + ";\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Apply overlay_links.json (no Jira writes).")
    parser.add_argument("--check", action="store_true", help="Print hoursControl summary only.")
    args = parser.parse_args(argv)

    overlay = load_overlay()
    budgets = load_budgets()
    wrote = []

    if DELIVERY_TREE.exists():
        tree = json.loads(DELIVERY_TREE.read_text(encoding="utf-8"))
        tree = apply_delivery_tree(tree, overlay)
        if not args.check:
            DELIVERY_TREE.write_text(json.dumps(tree, indent=2, ensure_ascii=False), encoding="utf-8")
            wrote.append(str(DELIVERY_TREE))

    if TREE_JS.exists():
        payload = read_tree_js()
        payload = apply_payload(payload, overlay, budgets)
        if not args.check:
            write_tree_js(payload)
            wrote.append(str(TREE_JS))
            PRODUCT_TREE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            wrote.append(str(PRODUCT_TREE))
        summary = payload.get("hoursControl") or {}
        print(json.dumps(summary, indent=2))
    elif not DELIVERY_TREE.exists():
        print("nothing to apply (no delivery_tree.json or tree_data.js)")
        return 1

    if wrote:
        print("wrote", ", ".join(wrote))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
