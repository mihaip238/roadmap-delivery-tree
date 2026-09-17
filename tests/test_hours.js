const assert = require("node:assert/strict");

global.window = {
  ROADMAP_TREE: {
    products: [
      {
        name: "Unclassified",
        children: [{
          type: "edp",
          key: "EDP-1",
          title: "Unclassified item",
          productLabel: "EBASE",
          alsoIn: [],
          children: [{
            type: "epp",
            key: "EPP-M",
            title: "Milestone EPP",
            costMember: false,
            method: "inferred_pending",
            time: { rolledSpentHours: 5 },
            children: [],
          }],
        }],
      },
      {
        name: "Power Balancer",
        children: [{
          type: "edp",
          key: "EDP-2",
          title: "Multi-product item",
          productLabel: "Power Balancer, Gas Shipper",
          alsoIn: ["Gas Shipper"],
          children: [],
        }],
      },
      {
        name: "Gas Shipper",
        children: [{
          type: "edp",
          key: "EDP-2",
          title: "Multi-product item",
          productLabel: "Power Balancer, Gas Shipper",
          alsoIn: ["Power Balancer"],
          children: [],
        }],
      },
    ],
    milestones: [{
      type: "milestone",
      key: "M2",
      children: [{
        type: "epp",
        key: "EPP-M",
        title: "Milestone EPP",
        onEdps: ["EDP-1"],
        products: ["Unclassified"],
        time: { rolledSpentHours: 5 },
        children: [],
      }],
    }],
  },
};

require("../assets/js/hours.js");

const rows = Object.fromEntries(window.Hours.uniqueEdps().map((row) => [row.key, row]));
assert.equal(rows["EDP-1"].productLabel, "Unclassified");
assert.deepEqual(rows["EDP-1"].alsoIn, []);
assert.equal(rows["EDP-2"].productLabel, "Power Balancer");
assert.deepEqual(rows["EDP-2"].alsoIn, ["Gas Shipper"]);
const milestoneEpp = window.Hours.reportEppRows().find((row) => row.key === "EPP-M");
assert.equal(milestoneEpp.cost, 5);
assert.deepEqual(milestoneEpp.milestones, ["M2"]);

console.log("hours product and milestone normalization ok");
