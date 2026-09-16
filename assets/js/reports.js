(function () {
  const products = Hours.productRows()
    .filter((p) => p.name !== "Unclassified" && Number(p.uniqueSpentHours) > 0)
    .map((p) => ({ label: p.name, value: p.uniqueSpentHours || 0 }));
  Charts.hbar(document.getElementById("byProduct"), {
    title: "Product line",
    rows: products,
    series: [{ key: "value", fill: Charts.ink }],
    rowH: 30,
    barH: 8,
  });

  const milestones = Hours.milestoneRows().map((m) => ({
    label: m.key + "  " + (m.name || ""),
    value: m.uniqueSpentHours || 0,
  }));
  Charts.hbar(document.getElementById("byMilestone"), {
    title: "Program M1–M4",
    rows: milestones,
    series: [{ key: "value", fill: Charts.ink }],
    rowH: 44,
    barH: 12,
    padL: 280,
  });

  const budgeted = []
    .concat(
      Hours.productRows().filter((r) => r.budget != null).map((r) => ({
        label: r.name, spent: r.spent, budget: r.budget, remaining: r.remaining,
      })),
      Hours.milestoneRows().filter((r) => r.budget != null).map((r) => ({
        label: r.key, spent: r.spent, budget: r.budget, remaining: r.remaining,
      })),
      Hours.edpRows().filter((r) => r.budget != null).map((r) => ({
        label: r.key, spent: r.spent, budget: r.budget, remaining: r.remaining, href: r.href,
      }))
    )
    .sort((a, b) => Number(a.remaining) - Number(b.remaining));
  const spentEl = document.getElementById("spentBudget");
  if (!budgeted.length) {
    spentEl.innerHTML = `<h2>Budget</h2><div class="empty-mini">—</div>`;
  } else {
    Charts.hbar(spentEl, {
      title: "Budget",
      rows: budgeted,
      series: [
        { key: "spent", fill: Charts.ink },
        { key: "budget", fill: Charts.copperSoft },
      ],
    });
  }

  const h = Hours.healthCounts(true);
  Charts.stacked(document.getElementById("health"), {
    title: "Health",
    segments: [
      { label: "Confirmed", value: h.confirmed },
      { label: "Pending", value: h.pending },
      { label: "None", value: h.none },
    ],
  });

  Charts.hbar(document.getElementById("topEdps"), {
    title: "EDPs",
    rows: Hours.topEdps(8).map((r) => ({ label: r.key, value: r.uniqueSpentHours, href: r.href })),
    series: [{ key: "value", fill: Charts.ink }],
  });

  const shared = Hours.topSharedEpps(8);
  const sharedEl = document.getElementById("shared");
  if (!shared.length) {
    sharedEl.innerHTML = `<h2>Shared</h2><div class="empty-mini">—</div>`;
  } else {
    Charts.hbar(sharedEl, {
      title: "Shared",
      rows: shared.map((r) => ({ label: r.key, value: r.hours, href: r.href })),
      series: [{ key: "value", fill: Charts.copper }],
    });
  }
})();
