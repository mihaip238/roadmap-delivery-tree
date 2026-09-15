(function () {
  const cap = Hours.caption();

  document.getElementById("insights").innerHTML = Hours.insights().map((s) => `<p>${Hours.esc(s)}</p>`).join("")
    || `<p>No insight lines yet.</p>`;

  const products = Hours.productRows()
    .filter((p) => p.name !== "Unclassified")
    .map((p) => ({ label: p.name, value: p.uniqueSpentHours || 0 }));
  Charts.hbar(document.getElementById("byProduct"), {
    title: "Unique hours by product line",
    rows: products,
    series: [{ key: "value", label: "Unique hours", fill: Charts.ink }],
    caption: cap + ". Multi-tagged EDPs appear under each line; hours de-dupe inside the line. This is not the BRPaaS program total.",
  });

  const milestones = Hours.milestoneRows().map((m) => ({
    label: m.key + " " + (m.name || ""),
    value: m.uniqueSpentHours || 0,
  }));
  Charts.hbar(document.getElementById("byMilestone"), {
    title: "Unique hours by BRPaaS program milestone",
    rows: milestones,
    series: [{ key: "value", label: "Unique hours", fill: Charts.ink }],
    caption: cap + ". M1–M4 is the EET / VanHelder program cut (Power Balancer plus BPO), not the BRP as a Service product line.",
  });

  const budgeted = []
    .concat(
      Hours.productRows().filter((r) => r.budget != null).map((r) => ({ label: r.name, spent: r.spent, budget: r.budget, remaining: r.remaining })),
      Hours.milestoneRows().filter((r) => r.budget != null).map((r) => ({ label: r.key, spent: r.spent, budget: r.budget, remaining: r.remaining })),
      Hours.edpRows().filter((r) => r.budget != null).map((r) => ({ label: r.key, spent: r.spent, budget: r.budget, remaining: r.remaining }))
    )
    .sort((a, b) => (a.remaining == null ? 0 : a.remaining) - (b.remaining == null ? 0 : b.remaining));
  const spentEl = document.getElementById("spentBudget");
  if (!budgeted.length) {
    spentEl.innerHTML = `<h2>Spent vs budget</h2><p class="caption">No hour budgets yet. Add them on Cost. Unbudgeted envelopes are omitted here so remaining is never a fake zero.</p>`;
  } else {
    Charts.hbar(spentEl, {
      title: "Spent vs budget (risk first)",
      rows: budgeted,
      series: [
        { key: "spent", label: "Unique spent", fill: Charts.ink },
        { key: "budget", label: "Budget", fill: Charts.copper },
      ],
      caption: cap,
    });
  }

  const h = Hours.healthCounts(true);
  Charts.stacked(document.getElementById("health"), {
    title: "Mapping health — active EDPs",
    segments: [
      { label: "Confirmed", value: h.confirmed },
      { label: "Pending inferred", value: h.pending },
      { label: "None", value: h.none },
    ],
    caption: cap + (h.pending ? ". " + h.pending + " active EDPs still pending confirm." : ". All active EDPs with work are confirmed."),
  });

  Charts.hbar(document.getElementById("topEdps"), {
    title: "Top EDPs by unique hours",
    rows: Hours.topEdps(8).map((r) => ({ label: r.key, value: r.uniqueSpentHours })),
    series: [{ key: "value", label: "Unique hours", fill: Charts.ink }],
    caption: cap,
  });

  const shared = Hours.topSharedEpps(8);
  const sharedEl = document.getElementById("shared");
  if (!shared.length) {
    sharedEl.innerHTML = `<h2>Shared EPPs by hours</h2><p class="caption">${Hours.esc(cap)}. No shared cost-member EPPs in the overlay membership.</p>`;
  } else {
    Charts.hbar(sharedEl, {
      title: "Shared EPPs by hours",
      rows: shared.map((r) => ({ label: r.key, value: r.hours })),
      series: [{ key: "value", label: "Rolled hours on the EPP", fill: Charts.copper }],
      caption: cap + ". Hours shown on the EPP; unique totals still count each ticket once.",
    });
  }
})();
