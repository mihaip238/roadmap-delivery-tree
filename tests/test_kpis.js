const assert = require("node:assert/strict");

global.window = {};
global.Hours = {
  round2(value) { return Math.round(Number(value) * 100) / 100; },
  costChildren(edp) { return (edp.children || []).filter((row) => row.costMember); },
  pendingUniqueHours() { return 2; },
  uniqueHoursOf(edp) { return Number((edp.time || {}).uniqueSpentHours) || 0; },
  reportHistory() { return []; },
};

require("../assets/js/kpis.js");
const Kpis = window.Kpis;

const edp = {
  type: "edp",
  key: "EDP-1",
  status: "Delivery",
  time: { uniqueSpentHours: 5 },
  children: [{
    type: "epp",
    key: "EPP-1",
    costMember: true,
    time: { ownEstimateSec: null, sharedWith: ["EDP-1", "EDP-2"] },
    children: [{
      type: "feature",
      key: "FTR-1",
      time: { ownEstimateSec: null },
      children: [
        {
          type: "story",
          key: "STY-1",
          status: "Done",
          time: { ownEstimateSec: 3600, ownSpentSec: 3600 },
          children: [],
        },
        {
          type: "story",
          key: "STY-2",
          status: "In Development",
          statusCategory: "indeterminate",
          time: { ownEstimateSec: null, ownSpentSec: 7200 },
          children: [],
        },
      ],
    }],
  }],
};

const report = Kpis.deliverable(edp);
assert.equal(report.metrics.completion.definition.label, "Items done");
assert.equal(report.metrics.completion.value, 50);
assert.equal(report.metrics.completion.status, "partial");
assert.equal(report.metrics.estimate_coverage.value, 50);
assert.equal(report.metrics.original_estimate.value, 1);
assert.equal(report.metrics.spent.value, 5);
assert.equal(report.metrics.remaining.value, null);
assert.equal(report.metrics.remaining.status, "unavailable");
assert.equal(report.metrics.pending_mapping.value, 2);
assert.equal(report.metrics.shared_scope.value, 1);
assert.deepEqual(report.workflow.counts, {
  done: 1, active: 1, planned: 0, removed: 0, other: 0,
});

console.log("deliverable KPI evidence calculations ok");
