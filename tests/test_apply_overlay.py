"""Overlay membership: PolarIS in unless rejected; inferred is not cost until confirmed."""
from __future__ import annotations

import unittest

from apply_overlay import apply_edp_node, apply_payload, index_overlay, unique_spent_hours


def epp(key: str, method: str, own: int = 0, rolled: int | None = None, **extra) -> dict:
    rolled = own if rolled is None else rolled
    rec = {
        "type": "epp",
        "key": key,
        "title": key,
        "method": method,
        "featureCount": extra.pop("featureCount", 0),
        "storyCount": extra.pop("storyCount", 0),
        "children": extra.pop("children", []),
        "time": {
            "ownSpentSec": own,
            "rolledSpentSec": rolled,
            "rolledSpentHours": round(rolled / 3600, 2),
            "ownSpentHours": round(own / 3600, 2),
        },
    }
    rec.update(extra)
    return rec


def edp(key: str, children: list, active: bool = True) -> dict:
    return {
        "type": "edp",
        "key": key,
        "title": key,
        "active": active,
        "children": children,
        "time": {"ownSpentSec": 0, "rolledSpentSec": 0},
    }


class OverlayMembershipTests(unittest.TestCase):
    def test_inferred_excluded_from_cost_when_overlay_empty(self):
        node = edp("EDP-1", [
            epp("EPP-P", "polaris", own=3600),
            epp("EPP-I", "inferred_alias", own=7200),
        ])
        apply_edp_node(node, {}, {})
        methods = {e["key"]: (e["method"], e["costMember"]) for e in node["children"]}
        self.assertEqual(methods["EPP-P"], ("polaris", True))
        self.assertEqual(methods["EPP-I"], ("inferred_pending", False))
        self.assertEqual(node["kind"], "polaris")
        self.assertEqual(node["health"], "confirmed")
        self.assertEqual(node["eppCount"], 1)
        self.assertEqual(node["pendingCount"], 1)
        self.assertEqual(node["time"]["uniqueSpentHours"], 1.0)
        self.assertEqual(node["time"]["rolledSpentHours"], 1.0)

    def test_confirm_inferred_becomes_overlay_cost(self):
        node = edp("EDP-1", [epp("EPP-I", "inferred_title", own=7200)])
        overlay = index_overlay({"links": [
            {"edp": "EDP-1", "epp": "EPP-I", "action": "confirm", "source": "inbox"},
        ]})
        apply_edp_node(node, overlay, {})
        child = node["children"][0]
        self.assertEqual(child["method"], "overlay")
        self.assertTrue(child["costMember"])
        self.assertEqual(node["kind"], "overlay")
        self.assertEqual(node["time"]["uniqueSpentHours"], 2.0)

    def test_reject_polaris_drops_cost_keeps_audit(self):
        node = edp("EDP-1", [epp("EPP-P", "polaris", own=3600)])
        overlay = index_overlay({"links": [
            {"edp": "EDP-1", "epp": "EPP-P", "action": "reject", "note": "wrong epic"},
        ]})
        apply_edp_node(node, overlay, {})
        child = node["children"][0]
        self.assertEqual(child["method"], "rejected")
        self.assertFalse(child["costMember"])
        self.assertEqual(node["kind"], "none")
        self.assertEqual(node["health"], "none")
        self.assertEqual(node["rejectedCount"], 1)
        self.assertEqual(node["time"]["uniqueSpentHours"], 0.0)

    def test_add_missing_epp_from_catalog(self):
        catalog = {"EPP-X": epp("EPP-X", "polaris", own=1800)}
        node = edp("EDP-2", [])
        overlay = index_overlay({"links": [
            {"edp": "EDP-2", "epp": "EPP-X", "action": "add", "source": "mapping"},
        ]})
        apply_edp_node(node, overlay, catalog)
        self.assertEqual(len(node["children"]), 1)
        self.assertEqual(node["children"][0]["key"], "EPP-X")
        self.assertEqual(node["children"][0]["method"], "overlay")
        self.assertTrue(node["children"][0]["costMember"])
        self.assertEqual(node["time"]["uniqueSpentHours"], 0.5)

    def test_shared_flags_use_cost_membership_only(self):
        payload = {
            "products": [
                {
                    "type": "product",
                    "name": "A",
                    "children": [
                        edp("EDP-1", [epp("EPP-S", "inferred_alias", own=3600)]),
                        edp("EDP-2", [epp("EPP-S", "polaris", own=3600)]),
                    ],
                }
            ],
            "milestones": [],
            "totals": {"time": {}},
        }
        overlay = {"links": [
            {"edp": "EDP-1", "epp": "EPP-S", "action": "confirm"},
        ]}
        out = apply_payload(payload, overlay, {"edps": {}, "products": {}, "milestones": {}})
        shared = out["totals"]["time"]["sharedEpps"]
        self.assertEqual(shared["EPP-S"], ["EDP-1", "EDP-2"])
        self.assertEqual(out["hoursControl"]["sharedEppCount"], 1)

    def test_inferred_hours_drop_from_product_unique(self):
        payload = {
            "products": [{
                "type": "product",
                "name": "A",
                "children": [
                    edp("EDP-1", [epp("EPP-I", "inferred_alias", own=36000)]),
                    edp("EDP-2", [epp("EPP-P", "polaris", own=3600)]),
                ],
            }],
            "milestones": [],
            "totals": {"time": {}},
        }
        out = apply_payload(payload, {"links": []}, {"edps": {}, "products": {}, "milestones": {}})
        prod = out["products"][0]
        self.assertEqual(prod["uniqueSpentHours"], 1.0)
        self.assertEqual(out["hoursControl"]["costUniqueHours"], 1.0)
        self.assertEqual(out["hoursControl"]["pendingInferredActive"], 1)


    def test_program_hours_do_not_double_count_milestone_rollup(self):
        payload = {
            "products": [{"type": "product", "name": "A", "children": []}],
            "milestones": [{
                "type": "milestone",
                "key": "M1",
                "time": {"ownSpentSec": 3600},
                "children": [epp("EPP-1", "milestone", own=3600)],
            }],
            "totals": {"time": {}},
        }
        out = apply_payload(payload, {"links": []}, {"edps": {}, "products": {}, "milestones": {}})
        self.assertEqual(out["hoursControl"]["programUniqueHours"], 1.0)
    def test_cost_only_skips_pending(self):
        nodes = [
            edp("EDP-1", [
                {**epp("EPP-I", "inferred_pending", own=7200), "costMember": False},
                {**epp("EPP-P", "polaris", own=3600), "costMember": True},
            ])
        ]
        self.assertEqual(unique_spent_hours(nodes, cost_only=True), 1.0)


if __name__ == "__main__":
    unittest.main()
