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
          children: [],
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
  },
};

require("../assets/js/hours.js");

const rows = Object.fromEntries(window.Hours.uniqueEdps().map((row) => [row.key, row]));
assert.equal(rows["EDP-1"].productLabel, "Unclassified");
assert.deepEqual(rows["EDP-1"].alsoIn, []);
assert.equal(rows["EDP-2"].productLabel, "Power Balancer");
assert.deepEqual(rows["EDP-2"].alsoIn, ["Gas Shipper"]);

console.log("hours product normalization ok");
