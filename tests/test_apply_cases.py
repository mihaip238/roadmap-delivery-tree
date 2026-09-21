"""Business-case calculations preserve unique, pending, allocation, and FAC rules."""
from __future__ import annotations

import unittest

from apply_cases import apply_cases


def node(kind: str, key: str, own_hours: float, children: list | None = None, **extra) -> dict:
    children = children or []
    rolled = own_hours + sum(float((child.get("time") or {}).get("rolledSpentHours") or 0) for child in children)
    row = {
        "type": kind,
        "key": key,
        "title": key,
        "children": children,
        "time": {
            "ownSpentSec": int(own_hours * 3600),
            "rolledSpentHours": rolled,
        },
    }
    row.update(extra)
    return row


def fixture() -> dict:
    shared = node("epp", "EPP-S", 2, costMember=True)
    exclusive = node("epp", "EPP-A", 3, costMember=True)
    pending = node("epp", "EPP-P", 4, costMember=False, method="inferred_pending")
    return {
        "products": [{
            "name": "A",
            "children": [
                node("edp", "EDP-1", 0, [shared, exclusive, pending]),
                node("edp", "EDP-2", 0, [shared]),
            ],
        }],
    }


class ApplyCasesTests(unittest.TestCase):
    def test_shared_case_hours_require_explicit_allocation(self):
        overlay = {
            "pilot": "CASE-1",
            "cases": [
                {
                    "id": "CASE-1",
                    "title": "Pilot",
                    "edps": ["EDP-1"],
                    "budgets": [{"at": "2026-09-01", "hours": 10}],
                    "etcHours": 2,
                    "allocations": [{"epp": "EPP-S", "hours": 1}],
                },
                {"id": "CASE-2", "edps": ["EDP-2"]},
            ],
        }
        payload = apply_cases(fixture(), overlay, {"rows": []})
        pilot = payload["caseControl"]["pilot"]
        self.assertEqual(pilot["associated"], 5)
        self.assertEqual(pilot["allocated"], 4)
        self.assertEqual(pilot["unallocated"], 1)
        self.assertEqual(pilot["pending"], 4)
        self.assertEqual(pilot["etc"], 2)
        self.assertEqual(pilot["fac"], 6)
        self.assertEqual(pilot["budget"], 10)
        self.assertEqual(pilot["left"], 6)
        self.assertEqual(pilot["overrun"], -4)

    def test_exclusive_case_defaults_to_full_allocation_and_etc_rolls_up(self):
        overlay = {
            "pilot": "CASE-1",
            "cases": [{
                "id": "CASE-1",
                "edps": ["EDP-1"],
                "etcHours": 99,
                "etcByEpp": {"EPP-A": 1.5, "EPP-S": 0.5},
            }],
        }
        pilot = apply_cases(fixture(), overlay, {"rows": []})["caseControl"]["pilot"]
        self.assertEqual(pilot["allocated"], 5)
        self.assertEqual(pilot["unallocated"], 0)
        self.assertEqual(pilot["etc"], 2)
        self.assertEqual(pilot["fac"], 7)
        self.assertIsNone(pilot["budget"])
        self.assertIsNone(pilot["left"])

    def test_unexplained_ledger_rows_are_coverage_holes(self):
        overlay = {
            "pilot": "CASE-1",
            "cases": [{
                "id": "CASE-1",
                "edps": ["EDP-1"],
                "period": {"from": "2026-09-01", "to": "2026-09-30"},
                "teams": ["E21"],
                "exceptions": [{"key": "STY-2", "action": "out_of_scope"}],
            }],
        }
        ledger = {
            "rows": [
                {"date": "2026-09-10", "key": "STY-1", "epp": "EPP-X", "hours": 2, "team": "E21"},
                {"date": "2026-09-11", "key": "STY-2", "epp": "EPP-X", "hours": 3, "team": "E21"},
                {"date": "2026-09-12", "key": "STY-3", "epp": "EPP-X", "hours": 9, "team": "OTHER"},
            ],
        }
        pilot = apply_cases(fixture(), overlay, ledger)["caseControl"]["pilot"]
        self.assertEqual(pilot["coverageExceptionHours"], 2)
        self.assertEqual(pilot["coverageExceptionCount"], 1)
        self.assertEqual(pilot["holes"], 2)

    def test_allocations_across_cases_cannot_exceed_jira_hours(self):
        overlay = {
            "pilot": "CASE-1",
            "cases": [
                {
                    "id": "CASE-1",
                    "edps": ["EDP-1"],
                    "allocations": [{"epp": "EPP-S", "hours": 1.5}],
                },
                {
                    "id": "CASE-2",
                    "edps": ["EDP-2"],
                    "allocations": [{"epp": "EPP-S", "hours": 1}],
                },
            ],
        }
        with self.assertRaisesRegex(ValueError, r"EPP-S allocations total 2.5 h but Jira has 2.0 unique h"):
            apply_cases(fixture(), overlay, {"rows": []})


if __name__ == "__main__":
    unittest.main()
