"""Reporting history snapshots preserve cost, pending, and shared semantics."""
from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path

from report_history import build_snapshot, deliverable_evidence, update_history


def issue(kind: str, key: str, own: int, children: list | None = None, **extra) -> dict:
    children = children or []
    rolled = own + sum(int((child.get("time") or {}).get("rolledSpentSec") or 0) for child in children)
    row = {
        "type": kind,
        "key": key,
        "title": key,
        "children": children,
        "time": {
            "ownSpentSec": own,
            "rolledSpentSec": rolled,
            "rolledSpentHours": round(rolled / 3600, 2),
        },
    }
    row.update(extra)
    return row


def fixture() -> dict:
    feature = issue("feature", "FTR-1", 3600)
    shared = issue("epp", "EPP-A", 3600, [feature], costMember=True, method="polaris")
    pending = issue("epp", "EPP-P", 10800, costMember=False, method="inferred_pending")
    edps = [
        issue(
            "edp", "EDP-1", 0, [shared],
            active=True, health="confirmed", productLabel="A", budgetHours=3,
        ),
        issue(
            "edp", "EDP-2", 0, [pending],
            active=True, health="pending", productLabel="A",
        ),
        issue(
            "edp", "EDP-3", 0, [],
            active=True, health="none", productLabel="A",
        ),
        issue(
            "edp", "EDP-4", 0, [copy.deepcopy(shared)],
            active=False, health="confirmed", productLabel="A",
        ),
    ]
    edps[0]["time"].update({"uniqueSpentHours": 2, "sharedWith": ["EPP-A"]})
    edps[1]["time"].update({"rolledSpentSec": 0, "rolledSpentHours": 0, "uniqueSpentHours": 0})
    edps[2]["time"].update({"uniqueSpentHours": 0})
    edps[3]["time"].update({"uniqueSpentHours": 2, "sharedWith": ["EPP-A"]})
    return {
        "jiraBase": "https://example.atlassian.net/browse/",
        "products": [{
            "type": "product",
            "name": "A",
            "uniqueSpentHours": 2,
            "rolledSpentHours": 4,
            "activeCount": 4,
            "children": edps,
        }],
        "milestones": [],
        "totals": {"time": {"fetchedAt": "2026-09-14T10:00:00+00:00"}},
        "hoursControl": {
            "fetchedAt": "2026-09-14T10:00:00+00:00",
            "costUniqueHours": 2,
            "programUniqueHours": 0,
            "activeEdp": 3,
            "confirmedActive": 1,
            "pendingInferredActive": 1,
            "noneActive": 1,
            "sharedEppCount": 1,
        },
        "cases": [{
            "id": "CASE-1",
            "title": "Pilot",
            "status": "active",
            "pilot": True,
            "allocated": 1.5,
            "associated": 2,
            "unallocated": 0.5,
            "pending": 3,
            "etc": 1,
            "fac": 2.5,
            "budget": 4,
            "left": 2.5,
            "coverageExceptionHours": 0,
            "edps": ["EDP-1"],
        }],
    }


class ReportHistoryTests(unittest.TestCase):
    def test_snapshot_keeps_cost_pending_and_shared_separate(self):
        snapshot = build_snapshot(fixture())
        self.assertEqual(snapshot["date"], "2026-09-14")
        self.assertEqual(snapshot["summary"]["cost"], 2)
        self.assertEqual(snapshot["summary"]["logged"], 4)
        self.assertEqual(snapshot["summary"]["pending"], 3)
        self.assertEqual(snapshot["summary"]["sharedDuplication"], 2)
        self.assertEqual(snapshot["summary"]["activeCost"], 2)
        self.assertEqual(snapshot["summary"]["activeLogged"], 2)
        self.assertEqual(snapshot["summary"]["mappingCoveragePct"], 33.33)
        self.assertEqual(snapshot["summary"]["budgetCoveragePct"], 100)

    def test_epp_snapshot_tracks_cost_owners_and_pending_relations(self):
        rows = {row["key"]: row for row in build_snapshot(fixture())["epps"]}
        self.assertEqual(rows["EPP-A"]["cost"], 2)
        self.assertEqual(rows["EPP-A"]["owners"], ["EDP-1", "EDP-4"])
        self.assertEqual(rows["EPP-P"]["cost"], 0)
        self.assertEqual(rows["EPP-P"]["pendingOn"], ["EDP-2"])

    def test_same_fetch_date_replaces_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            json_path = Path(tmp) / "history.json"
            js_path = Path(tmp) / "history.js"
            first = fixture()
            update_history(first, json_path, js_path)
            second = fixture()
            second["hoursControl"]["costUniqueHours"] = 7
            history = update_history(second, json_path, js_path)
            self.assertEqual(len(history["snapshots"]), 1)
            self.assertEqual(history["snapshots"][0]["summary"]["cost"], 7)
            self.assertTrue(js_path.read_text(encoding="utf-8").startswith("window.REPORT_HISTORY = "))
            self.assertEqual(json.loads(json_path.read_text(encoding="utf-8"))["version"], 1)

    def test_case_snapshot_tracks_fac_inputs(self):
        case = build_snapshot(fixture())["cases"][0]
        self.assertEqual(case["key"], "CASE-1")
        self.assertEqual(case["allocated"], 1.5)
        self.assertEqual(case["fac"], 2.5)
        self.assertEqual(case["budget"], 4)
        self.assertEqual(case["edps"], ["EDP-1"])

    def test_deliverable_snapshot_keeps_scope_status_and_estimate_evidence(self):
        stories = [
            issue(
                "story", "STY-1", 3600,
                status="Done", statusCategory="done",
            ),
            issue(
                "story", "STY-2", 0,
                status="In Development", statusCategory="indeterminate",
            ),
        ]
        stories[0]["time"]["ownEstimateSec"] = 7200
        stories[0]["time"]["ownRemainingSec"] = 0
        stories[1]["time"]["ownEstimateSec"] = None
        stories[1]["time"]["ownRemainingSec"] = 3600
        feature = issue("feature", "FTR-X", 0, stories)
        edp = issue(
            "edp", "EDP-X", 0,
            [issue("epp", "EPP-X", 0, [feature], costMember=True)],
        )
        evidence = deliverable_evidence(edp)
        self.assertEqual(evidence["scope"], 2)
        self.assertEqual(evidence["status"]["done"], 1)
        self.assertEqual(evidence["status"]["active"], 1)
        self.assertEqual(evidence["completionPct"], 50)
        self.assertEqual(evidence["statusCategoryCoveragePct"], 100)
        self.assertEqual(evidence["estimateCoveragePct"], 50)
        self.assertEqual(evidence["remainingCoveragePct"], 100)
        self.assertEqual(evidence["originalEstimate"], 2)
        self.assertEqual(evidence["remainingEstimate"], 1)

    def test_missing_fetch_timestamp_is_rejected(self):
        payload = fixture()
        payload["hoursControl"].pop("fetchedAt")
        payload["totals"]["time"].pop("fetchedAt")
        with self.assertRaises(ValueError):
            build_snapshot(payload)


if __name__ == "__main__":
    unittest.main()
