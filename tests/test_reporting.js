const assert = require("node:assert/strict");

global.window = {};
global.Hours = {
  round2(value) { return Math.round(Number(value) * 100) / 100; },
  edpRows() { return []; },
  pendingUniqueHours() { return 0; },
  reportProductRows() {
    return [
      { key: "A", name: "A", type: "product", remaining: 5, budget: 10, cost: 5, active: true },
      { key: "B", name: "B", type: "product", remaining: -2, budget: 8, cost: 10, active: true },
      { key: "C", name: "C", type: "product", remaining: null, budget: null, cost: 3, active: true },
    ];
  },
  reportMilestoneRows() { return []; },
  reportEppRows() {
    return [
      { key: "EPP-M", cost: 5, logged: 5, pending: 0, active: true, milestones: ["M1"], products: [] },
      { key: "EPP-P", cost: 7, logged: 7, pending: 0, active: true, milestones: [], products: ["A"] },
    ];
  },
  caseRows() {
    return [
      { id: "CASE-1", key: "CASE-1", type: "case", title: "Pilot", fac: 20, allocated: 12, associated: 15, unallocated: 3, etc: 8, budget: 25, remaining: 13, pending: 2, active: true, edps: ["EDP-1"] },
      { id: "CASE-2", key: "CASE-2", type: "case", title: "Closed", fac: 5, allocated: 5, associated: 5, unallocated: 0, etc: 0, budget: null, remaining: null, pending: 0, active: false, edps: ["EDP-3"] },
    ];
  },
  reportHistory() { return []; },
  uniqueReportHours() { return 42; },
  uniqueEdps() {
    return [
      { key: "EDP-1", active: true, productLabel: "A", alsoIn: [], health: "confirmed" },
      { key: "EDP-2", active: true, productLabel: "A", alsoIn: ["B"], health: "pending" },
      { key: "EDP-3", active: true, productLabel: "B", alsoIn: [], health: "confirmed" },
      { key: "EDP-4", active: true, productLabel: "B", alsoIn: [], health: "none" },
    ];
  },
  health(edp) { return edp.health; },
  tree() { return { products: [{ name: "A", children: [] }, { name: "B", children: [] }] }; },
  flattenEdps(nodes) { return nodes || []; },
  findEpp() { return null; },
};

require("../assets/js/reporting.js");
const Reporting = window.Reporting;

assert.equal(Reporting.median([9, 1, 5]), 5);
assert.equal(Reporting.median([1, 3, 5, 7]), 4);

const forecast = Reporting.forecast([
  { date: "2026-01-01", value: 0 },
  { date: "2026-01-08", value: 14 },
  { date: "2026-01-15", value: 28 },
], 30);
assert.equal(forecast.daily, 2);
assert.equal(forecast.weekly, 14);
assert.equal(forecast.projected, 88);
assert.equal(forecast.r2, 1);
assert.equal(Reporting.forecast([
  { date: "2026-01-01", value: 0 },
  { date: "2026-01-15", value: 28 },
], 30), null);

const remaining = Reporting.rows({
  cut: "product",
  metric: "remaining",
  compare: "none",
  product: "all",
  active: true,
  health: "",
  q: "",
  top: "all",
  milestone: "",
});
assert.deepEqual(remaining.map((row) => row.key), ["B", "A"]);

const costSummary = Reporting.summary([
  { name: "A", cost: 5, budget: 10 },
  { name: "B", cost: 10, budget: 8 },
], {
  cut: "product",
  metric: "cost",
  compare: "budget",
});
assert.equal(costSummary.total, 42, "cost summary must use unique ticket union");
assert.equal(costSummary.average, 7.5);
assert.equal(costSummary.variance, 24);

const mappingSummary = Reporting.summary([
  { name: "A", mapping: 50, activeCount: 2, confirmed: 1 },
  { name: "B", mapping: 33.33, activeCount: 3, confirmed: 1 },
], {
  cut: "product",
  metric: "mapping",
  compare: "none",
});
assert.equal(mappingSummary.total, 50, "mapping coverage must be weighted and never sum percentages");
assert.equal(mappingSummary.average, 41.67);

const programEpps = Reporting.rows({
  mode: "program",
  cut: "epp",
  metric: "cost",
  compare: "none",
  product: "all",
  milestone: "",
  active: false,
  health: "",
  q: "",
  top: "all",
});
assert.deepEqual(programEpps.map((row) => row.key), ["EPP-M"]);

const caseRows = Reporting.rows({
  mode: "case",
  cut: "case",
  case: "CASE-1",
  metric: "fac",
  compare: "budget",
  product: "all",
  milestone: "",
  active: false,
  health: "",
  q: "",
  top: "all",
});
assert.deepEqual(caseRows.map((row) => row.key), ["CASE-1"]);
assert.equal(Reporting.summary(caseRows, {
  mode: "case",
  cut: "case",
  metric: "fac",
  compare: "budget",
}).total, 20);

assert.equal(Reporting.snapshotValue({
  summary: { cost: 100, programCost: 30 },
}, {
  mode: "program",
  cut: "epp",
  metric: "cost",
  product: "all",
  milestone: "",
  q: "",
  health: "",
  active: false,
}), 30);

assert.equal(Reporting.snapshotValue({
  cases: [{ key: "CASE-1", fac: 20 }, { key: "CASE-2", fac: 5 }],
}, {
  mode: "case",
  cut: "case",
  case: "CASE-1",
  metric: "fac",
  product: "all",
  milestone: "",
  q: "",
  health: "",
  active: false,
}), 20);

console.log("reporting calculations ok");
