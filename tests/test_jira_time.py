"""Jira time compaction keeps evidence needed by deliverable reports."""
from __future__ import annotations

import unittest

from jira_time import compact_issue, feature_rolled_remaining, leaf_rolled_remaining


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


if __name__ == "__main__":
    unittest.main()
