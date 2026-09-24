"""Jira time compaction keeps evidence needed by deliverable reports."""
from __future__ import annotations

import unittest

from jira_time import compact_issue, feature_rolled_remaining, later_date, leaf_rolled_remaining, stamp_last_booked


class JiraTimeEvidenceTests(unittest.TestCase):
    def test_compact_issue_keeps_status_category_and_remaining(self):
        row = compact_issue({
            "key": "STY-1",
            "fields": {
                "summary": "Story",
                "status": {
                    "name": "In Development",
                    "statusCategory": {"key": "indeterminate", "name": "In Progress"},
                },
                "timeestimate": 3600,
                "aggregatetimeestimate": 5400,
            },
        })
        self.assertEqual(row["status"], "In Development")
        self.assertEqual(row["statusCategory"], "indeterminate")
        self.assertEqual(row["ownRemainingSec"], 3600)
        self.assertEqual(row["jiraAggRemainingSec"], 5400)

    def test_remaining_rollups_prefer_jira_aggregate_without_understating_children(self):
        rec = {"ownRemainingSec": 1800, "jiraAggRemainingSec": 3600}
        self.assertEqual(leaf_rolled_remaining(rec), 3600)
        self.assertEqual(feature_rolled_remaining(rec, 7200), 9000)

    def test_later_date_picks_the_newest_day(self):
        self.assertEqual(later_date("2026-08-01T10:00:00", None, "2026-09-14"), "2026-09-14")
        self.assertIsNone(later_date(None, ""))

    def test_stamp_last_booked_rolls_max_child_date(self):
        epp = {
            "key": "EPP-1",
            "children": [
                {"key": "AURORA-1", "time": {}, "children": [{"key": "STY-1", "time": {}}]},
                {"key": "AURORA-2", "time": {}},
            ],
            "time": {},
        }
        stamp_last_booked(epp, {
            "EPP-1": "2026-01-01",
            "AURORA-1": "2026-06-01",
            "STY-1": "2026-09-20",
            "AURORA-2": "2026-07-15",
        })
        self.assertEqual(epp["time"]["lastBookedOn"], "2026-01-01")
        self.assertEqual(epp["time"]["lastBookedOnRolled"], "2026-09-20")
        self.assertEqual(epp["children"][0]["time"]["lastBookedOnRolled"], "2026-09-20")


if __name__ == "__main__":
    unittest.main()
