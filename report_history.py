"""Persist one reporting snapshot per Jira fetch date.

History is derived from the applied Hours Control payload. It never queries Jira
and never changes overlay authority or cost membership.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parent
HISTORY_JSON = ROOT / "jira_map" / "report_history.json"
HISTORY_JS = ROOT / "jira_map" / "report_history.js"
TREE_JS = ROOT / "jira_map" / "tree_data.js"
TREE_PREFIX = "window.ROADMAP_TREE = "


def flatten_edps(nodes: Iterable[dict]) -> list[dict]:
    out: list[dict] = []
    for node in nodes:
        if node.get("type") == "theme":
            out.extend(node.get("children") or [])
        else:
            out.append(node)
    return out


def unique_edps(payload: dict) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    valid_products = {
        product.get("name") for product in payload.get("products") or []
        if product.get("name")
    }
    for product in payload.get("products") or []:
        for edp in flatten_edps(product.get("children") or []):
            ident = edp.get("key") or edp.get("title") or ""
            if not ident or ident in seen:
                continue
            seen.add(ident)
            row = dict(edp)
            declared = [product.get("name"), *(edp.get("alsoIn") or [])]
            declared.extend(
                name.strip()
                for name in str(edp.get("productLabel") or "").replace(";", ",").split(",")
            )
            row["productLabel"] = product.get("name") or ""
            row["alsoIn"] = list(dict.fromkeys(
                name for name in declared
                if name and name in valid_products and name != row["productLabel"]
            ))
            out.append(row)
    return out


def collect_own_seconds(node: dict, acc: dict[str, int], *, cost_only: bool = False) -> None:
    if cost_only and node.get("type") == "epp" and node.get("costMember") is False:
        return
    key = node.get("key")
    if key:
        acc[key] = int((node.get("time") or {}).get("ownSpentSec") or 0)
    for child in node.get("children") or []:
        collect_own_seconds(child, acc, cost_only=cost_only)


def unique_hours(nodes: Iterable[dict], *, cost_only: bool = False) -> float:
    acc: dict[str, int] = {}
    for node in nodes:
        collect_own_seconds(node, acc, cost_only=cost_only)
    return round(sum(acc.values()) / 3600, 2)


def pending_hours(nodes: Iterable[dict]) -> float:
    acc: dict[str, int] = {}
    for edp in nodes:
        for epp in edp.get("children") or []:
            if epp.get("method") == "inferred_pending":
                collect_own_seconds(epp, acc)
    return round(sum(acc.values()) / 3600, 2)


def nullable_number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    return float(value)


def health_counts(nodes: Iterable[dict], *, active_only: bool = True) -> dict[str, int]:
    counts = {"confirmed": 0, "pending": 0, "none": 0}
    for edp in nodes:
        if active_only and not edp.get("active"):
            continue
        health = edp.get("health") or "none"
        counts[health if health in counts else "none"] += 1
    return counts


def product_rows(payload: dict) -> list[dict]:
    rows = []
    for product in payload.get("products") or []:
        edps = flatten_edps(product.get("children") or [])
        active_edps = [edp for edp in edps if edp.get("active")]
        counts = health_counts(edps)
        rows.append({
            "name": product.get("name") or "",
            "cost": float(product.get("uniqueSpentHours") or 0),
            "logged": float(product.get("rolledSpentHours") or 0),
            "pending": pending_hours(edps),
            "activeCost": unique_hours(active_edps, cost_only=True),
            "activeLogged": round(sum(float((edp.get("time") or {}).get("rolledSpentHours") or 0) for edp in active_edps), 2),
            "activePending": pending_hours(active_edps),
            "budget": nullable_number(product.get("budgetHours")),
            "activeEdp": sum(1 for edp in edps if edp.get("active")),
            "confirmed": counts["confirmed"],
            "pendingEdp": counts["pending"],
            "none": counts["none"],
        })
    return rows


def milestone_rows(payload: dict) -> list[dict]:
    return [{
        "key": milestone.get("key") or "",
        "name": milestone.get("name") or milestone.get("title") or "",
        "cost": float(milestone.get("uniqueSpentHours") or 0),
        "logged": float((milestone.get("time") or {}).get("rolledSpentHours") or 0),
        "budget": nullable_number(milestone.get("budgetHours")),
        "eppCount": int(milestone.get("eppCount") or len(milestone.get("children") or [])),
    } for milestone in payload.get("milestones") or []]


def edp_rows(payload: dict) -> list[dict]:
    rows = []
    for edp in unique_edps(payload):
        time_info = edp.get("time") or {}
        rows.append({
            "key": edp.get("key") or "",
            "title": edp.get("title") or "",
            "product": edp.get("productLabel") or "",
            "alsoIn": edp.get("alsoIn") or [],
            "active": bool(edp.get("active")),
            "health": edp.get("health") or "none",
            "cost": float(time_info.get("uniqueSpentHours") or 0),
            "logged": float(time_info.get("rolledSpentHours") or 0),
            "pending": pending_hours([edp]),
            "budget": nullable_number(edp.get("budgetHours")),
            "eppCount": int(edp.get("eppCount") or 0),
            "sharedEpps": time_info.get("sharedWith") or [],
        })
    return rows


def epp_rows(payload: dict) -> list[dict]:
    by_key: dict[str, dict] = {}
    for edp in unique_edps(payload):
        edp_key = edp.get("key") or ""
        products = [edp.get("productLabel")] + list(edp.get("alsoIn") or [])
        for epp in edp.get("children") or []:
            key = epp.get("key") or ""
            if not key:
                continue
            time_info = epp.get("time") or {}
            row = by_key.setdefault(key, {
                "key": key,
                "title": epp.get("title") or "",
                "status": epp.get("status") or "",
                "cost": 0.0,
                "logged": float(time_info.get("rolledSpentHours") or 0),
                "owners": [],
                "pendingOn": [],
                "products": [],
                "milestones": [],
                "active": False,
            })
            row["logged"] = max(row["logged"], float(time_info.get("rolledSpentHours") or 0))
            if epp.get("costMember"):
                row["cost"] = row["logged"]
                if edp_key and edp_key not in row["owners"]:
                    row["owners"].append(edp_key)
            if epp.get("method") == "inferred_pending" and edp_key and edp_key not in row["pendingOn"]:
                row["pendingOn"].append(edp_key)
            row["active"] = row["active"] or bool(edp.get("active"))
            for product in filter(None, products):
                if product not in row["products"]:
                    row["products"].append(product)
    for milestone in payload.get("milestones") or []:
        for epp in milestone.get("children") or []:
            key = epp.get("key") or ""
            if not key:
                continue
            time_info = epp.get("time") or {}
            row = by_key.setdefault(key, {
                "key": key,
                "title": epp.get("title") or "",
                "status": epp.get("status") or "",
                "cost": float(time_info.get("uniqueSpentHours") or time_info.get("rolledSpentHours") or 0),
                "logged": float(time_info.get("rolledSpentHours") or 0),
                "owners": epp.get("onEdps") or [],
                "pendingOn": [],
                "products": epp.get("products") or [],
                "milestones": [],
                "active": True,
            })
            if milestone.get("key") not in row["milestones"]:
                row["milestones"].append(milestone.get("key"))
    rows = list(by_key.values())
    for row in rows:
        row["cost"] = row["logged"] if row["owners"] or row["milestones"] else 0.0
    return sorted(rows, key=lambda row: row["key"])


def case_rows(payload: dict) -> list[dict]:
    return [{
        "key": row.get("id") or "",
        "title": row.get("title") or "",
        "status": row.get("status") or "active",
        "allocated": float(row.get("allocated") or 0),
        "associated": float(row.get("associated") or 0),
        "unallocated": float(row.get("unallocated") or 0),
        "pending": float(row.get("pending") or 0),
        "etc": nullable_number(row.get("etc")),
        "fac": nullable_number(row.get("fac")),
        "budget": nullable_number(row.get("budget")),
        "remaining": nullable_number(row.get("left")),
        "coverageExceptionHours": float(row.get("coverageExceptionHours") or 0),
        "edps": row.get("edps") or [],
        "pilot": bool(row.get("pilot")),
    } for row in payload.get("cases") or []]


def build_snapshot(payload: dict) -> dict:
    summary = payload.get("hoursControl") or {}
    fetched_at = summary.get("fetchedAt") or ((payload.get("totals") or {}).get("time") or {}).get("fetchedAt")
    if not fetched_at:
        raise ValueError("A Jira fetchedAt timestamp is required for report history")
    edps = unique_edps(payload)
    active_edps = [edp for edp in edps if edp.get("active")]
    edp_data = edp_rows(payload)
    counts = health_counts(edps)
    active_total = sum(counts.values())
    cost = float(summary.get("costUniqueHours") or 0)
    rolled = round(sum(float((edp.get("time") or {}).get("rolledSpentHours") or 0) for edp in edps), 2)

    budgeted_nodes = [edp for edp in edps if edp.get("budgetHours") not in (None, "")]
    budgeted_cost = unique_hours(budgeted_nodes, cost_only=True)
    over = [
        row for row in edp_data
        if row["budget"] is not None and row["cost"] > row["budget"]
    ]
    return {
        "date": str(fetched_at)[:10],
        "fetchedAt": fetched_at,
        "summary": {
            "cost": cost,
            "logged": rolled,
            "activeCost": unique_hours(active_edps, cost_only=True),
            "activeLogged": round(sum(float((edp.get("time") or {}).get("rolledSpentHours") or 0) for edp in active_edps), 2),
            "programCost": float(summary.get("programUniqueHours") or 0),
            "pending": pending_hours(edps),
            "activePending": pending_hours(active_edps),
            "sharedDuplication": round(max(0, rolled - cost), 2),
            "activeEdp": active_total,
            "confirmed": counts["confirmed"],
            "pendingEdp": counts["pending"],
            "none": counts["none"],
            "mappingCoveragePct": round((counts["confirmed"] / active_total * 100), 2) if active_total else 0,
            "budgetCoveragePct": round((budgeted_cost / cost * 100), 2) if cost else 0,
            "overBudgetEdp": len(over),
            "overBudgetHours": round(sum(row["cost"] - float(row["budget"]) for row in over), 2),
        },
        "products": product_rows(payload),
        "milestones": milestone_rows(payload),
        "edps": edp_data,
        "epps": epp_rows(payload),
        "cases": case_rows(payload),
    }


def load_history(path: Path = HISTORY_JSON) -> dict:
    if not path.exists():
        return {"version": 1, "snapshots": []}
    data = json.loads(path.read_text(encoding="utf-8"))
    data.setdefault("version", 1)
    data.setdefault("snapshots", [])
    return data


def write_history(history: dict, json_path: Path = HISTORY_JSON, js_path: Path = HISTORY_JS) -> None:
    json_path.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(history, ensure_ascii=False, indent=2) + "\n"
    json_path.write_text(body, encoding="utf-8")
    js_path.write_text(
        "window.REPORT_HISTORY = " + json.dumps(history, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )


def update_history(
    payload: dict,
    json_path: Path = HISTORY_JSON,
    js_path: Path = HISTORY_JS,
) -> dict:
    history = load_history(json_path)
    snapshot = build_snapshot(payload)
    snapshots = [
        row for row in history.get("snapshots") or []
        if row.get("date") != snapshot["date"]
    ]
    snapshots.append(snapshot)
    snapshots.sort(key=lambda row: (row.get("date") or "", row.get("fetchedAt") or ""))
    history = {
        "version": 1,
        "updatedAt": snapshot["fetchedAt"],
        "snapshots": snapshots,
    }
    write_history(history, json_path, js_path)
    return history


def read_tree_js(path: Path = TREE_JS) -> dict:
    text = path.read_text(encoding="utf-8")
    if not text.startswith(TREE_PREFIX):
        raise ValueError(f"{path} does not start with {TREE_PREFIX!r}")
    return json.loads(text[len(TREE_PREFIX):].rstrip().rstrip(";"))


def main() -> int:
    history = update_history(read_tree_js())
    print("report snapshots", len(history["snapshots"]), "latest", history["snapshots"][-1]["date"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
