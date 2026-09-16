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
  reportEppRows() { return []; },
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
assert.equal(mappingSummary.average, 50);

console.log("reporting calculations ok");
