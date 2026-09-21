"""Apply business-case control overlays to an applied Hours Control payload."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parent
CASES_PATH = ROOT / "jira_map" / "overlay_cases.json"
LEDGER_PATH = ROOT / "jira_map" / "worklog_ledger.json"


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def load_cases(path: Path | None = None) -> dict:
    blob = load_json(path or CASES_PATH, {"version": 1, "pilot": None, "cases": []})
    if not isinstance(blob, dict):
        return {"version": 1, "pilot": None, "cases": []}
    blob.setdefault("version", 1)
    blob.setdefault("pilot", None)
    blob.setdefault("cases", [])
    return blob


def load_ledger(path: Path | None = None) -> dict:
    blob = load_json(path or LEDGER_PATH, {"version": 1, "fetchedAt": None, "rows": []})
    if not isinstance(blob, dict):
        return {"version": 1, "fetchedAt": None, "rows": []}
    blob.setdefault("version", 1)
    blob.setdefault("rows", [])
    return blob


def flatten_edps(nodes: Iterable[dict]) -> list[dict]:
    out: list[dict] = []
    for node in nodes:
        if node.get("type") == "theme":
            out.extend(node.get("children") or [])
        else:
            out.append(node)
    return out


def unique_edps(payload: dict) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for product in payload.get("products") or []:
        for edp in flatten_edps(product.get("children") or []):
            key = edp.get("key") or ""
            if key and key not in out:
                out[key] = edp
    return out


def collect_own(node: dict, acc: dict[str, int]) -> None:
    key = node.get("key")
    if key:
        acc[key] = int((node.get("time") or {}).get("ownSpentSec") or 0)
    for child in node.get("children") or []:
        collect_own(child, acc)


def hours(acc: dict[str, int]) -> float:
    return round(sum(acc.values()) / 3600, 2)


def nullable_hours(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return round(number * 2) / 2 if number >= 0 else None


def latest_budget(rows: Any) -> tuple[float | None, dict | None]:
    valid = [row for row in (rows or []) if isinstance(row, dict) and nullable_hours(row.get("hours")) is not None]
    if not valid:
        return None, None
    row = sorted(valid, key=lambda item: str(item.get("at") or ""))[-1]
    return nullable_hours(row.get("hours")), row


def allocation_map(case: dict) -> dict[str, float]:
    out: dict[str, float] = {}
    for row in case.get("allocations") or []:
        if not isinstance(row, dict) or not row.get("epp"):
            continue
        value = nullable_hours(row.get("hours"))
        if value is not None:
            out[str(row["epp"])] = value
    return out


def case_ledger_rows(case: dict, ledger: dict) -> list[dict]:
    case_id = case.get("id") or ""
    teams = set(case.get("teams") or [])
    period = case.get("period") or {}
    start = str(period.get("from") or "")
    end = str(period.get("to") or "")
    rows = []
    for row in ledger.get("rows") or []:
        if not isinstance(row, dict):
            continue
        if row.get("case") and row.get("case") != case_id:
            continue
        if teams and row.get("team") not in teams:
            continue
        date = str(row.get("date") or "")
        if start and date < start:
            continue
        if end and date > end:
            continue
        rows.append(row)
    return rows


def apply_cases(payload: dict, overlay: dict | None = None, ledger: dict | None = None) -> dict:
    overlay = overlay if overlay is not None else load_cases()
    ledger = ledger if ledger is not None else load_ledger()
    edp_by_key = unique_edps(payload)
    raw_cases = [
        row for row in overlay.get("cases") or []
        if isinstance(row, dict) and str(row.get("id") or "").strip()
    ]

    epp_cases: dict[str, set[str]] = {}
    case_epps: dict[str, dict[str, dict]] = {}
    for case in raw_cases:
        case_id = str(case["id"]).strip()
        found: dict[str, dict] = {}
        for edp_key in case.get("edps") or []:
            edp = edp_by_key.get(str(edp_key))
            if not edp:
                continue
            for epp in edp.get("children") or []:
                if epp.get("costMember") and epp.get("key"):
                    found.setdefault(epp["key"], epp)
        case_epps[case_id] = found
        for epp_key in found:
            epp_cases.setdefault(epp_key, set()).add(case_id)

    result = []
    for raw in raw_cases:
        case = dict(raw)
        case_id = str(case["id"]).strip()
        bound = [str(key) for key in case.get("edps") or [] if str(key) in edp_by_key]
        epps = case_epps.get(case_id, {})
        associated_acc: dict[str, int] = {}
        pending_acc: dict[str, int] = {}
        epp_rows = []
        explicit = allocation_map(case)
        allocated = 0.0
        unallocated = 0.0
        for key, epp in sorted(epps.items()):
            epp_acc: dict[str, int] = {}
            collect_own(epp, epp_acc)
            associated_acc.update(epp_acc)
            epp_hours = hours(epp_acc)
            shared_cases = sorted(epp_cases.get(key) or [])
            is_shared = len(shared_cases) > 1
            allocation = explicit.get(key)
            if allocation is None and not is_shared:
                allocation = epp_hours
            allocation = min(allocation, epp_hours) if allocation is not None else None
            if allocation is None:
                unallocated += epp_hours
            else:
                allocated += allocation
                unallocated += max(0, epp_hours - allocation)
            epp_rows.append({
                "key": key,
                "title": epp.get("title") or "",
                "hours": epp_hours,
                "allocated": allocation,
                "shared": is_shared,
                "cases": shared_cases,
            })
        for edp_key in bound:
            for epp in edp_by_key[edp_key].get("children") or []:
                if epp.get("method") == "inferred_pending":
                    collect_own(epp, pending_acc)

        etc_by_epp = {
            str(key): value
            for key, raw_value in (case.get("etcByEpp") or {}).items()
            if (value := nullable_hours(raw_value)) is not None
        }
        etc = round(sum(etc_by_epp.values()), 2) if etc_by_epp else nullable_hours(case.get("etcHours"))
        budget, budget_row = latest_budget(case.get("budgets"))
        allocated = round(allocated, 2)
        unallocated = round(unallocated, 2)
        fac = round(allocated + etc, 2) if etc is not None else None
        left = round(budget - allocated, 2) if budget is not None else None
        overrun = round(fac - budget, 2) if fac is not None and budget is not None else None
        ledger_rows = case_ledger_rows(case, ledger)
        exception_keys = {
            str(row.get("key") or "") for row in case.get("exceptions") or []
            if isinstance(row, dict) and row.get("action") in {"out_of_scope", "other_case"}
        }
        coverage = [
            row for row in ledger_rows
            if row.get("epp") not in epps and str(row.get("key") or "") not in exception_keys
        ]
        coverage_hours = round(sum(float(row.get("hours") or 0) for row in coverage), 2)
        associated = hours(associated_acc)
        result.append({
            "id": case_id,
            "title": case.get("title") or "",
            "status": case.get("status") or "active",
            "pilot": case_id == overlay.get("pilot"),
            "period": case.get("period") or {},
            "teams": case.get("teams") or [],
            "edps": bound,
            "milestones": case.get("milestones") or [],
            "associated": associated,
            "allocated": allocated,
            "unallocated": unallocated,
            "pending": hours(pending_acc),
            "etc": etc,
            "fac": fac,
            "budget": budget,
            "budgetVersion": budget_row,
            "left": left,
            "overrun": overrun,
            "coverageExceptionHours": coverage_hours,
            "coverageExceptionCount": len(coverage),
            "holes": round(unallocated + coverage_hours, 2),
            "epps": epp_rows,
            "coverage": coverage,
        })

    pilot = next((row for row in result if row["pilot"]), None)
    payload["cases"] = result
    payload["caseControl"] = {
        "pilot": pilot,
        "count": len(result),
        "updatedAt": overlay.get("updatedAt"),
        "ledgerFetchedAt": ledger.get("fetchedAt"),
    }
    return payload
