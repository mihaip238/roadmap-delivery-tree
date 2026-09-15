(function () {
  function paint() {
    const ov = Hours.overview();
    const stats = [
      [Hours.fmtNum(ov.costUniqueHours), "Cost"],
      [String(ov.activeEdp || 0), "EDPs"],
      [String(ov.pendingInferredActive || 0), "Pending"],
      [String(ov.confirmedActive || 0), "Confirmed"],
      [String(ov.noneActive || 0), "None"],
      [Hours.fmtNum(ov.programUniqueHours), "M1–M4"],
    ];
    document.getElementById("stats").innerHTML = stats.map(([v, l]) => (
      `<div class="kpi"><div class="kpi-v">${Hours.esc(v)}</div><div class="kpi-k">${Hours.esc(l)}</div></div>`
    )).join("");

    const products = Hours.productRows().filter((p) => p.name !== "Unclassified");
    document.getElementById("product-table").innerHTML = `<table class="data">
      <thead><tr><th>Product</th><th class="num">EDPs</th><th class="num">Cost</th></tr></thead>
      <tbody>${products.map((p) => `<tr>
        <td>${Hours.esc(p.name)}</td>
        <td class="num mono">${p.activeCount || p.edpCount || ""}</td>
        <td class="num mono">${Hours.esc(Hours.fmtNum(p.uniqueSpentHours))}</td>
      </tr>`).join("")}</tbody></table>`;

    const ms = Hours.milestoneRows();
    document.getElementById("program-table").innerHTML = `<table class="data">
      <thead><tr><th></th><th></th><th class="num">Cost</th><th></th></tr></thead>
      <tbody>${ms.map((m) => `<tr>
        <td class="mono">${Hours.esc(m.key)}</td>
        <td>${Hours.esc(m.name)}</td>
        <td class="num mono">${Hours.esc(Hours.fmtNum(m.uniqueSpentHours))}</td>
        <td class="mono muted">${Hours.esc(m.target || "")}</td>
      </tr>`).join("")}
      <tr class="sum"><td></td><td></td><td class="num mono">${Hours.esc(Hours.fmtNum(ov.programUniqueHours))}</td><td></td></tr>
      </tbody></table>`;

    const pending = Hours.uniqueEdps()
      .filter((e) => e.active && Hours.health(e) === "pending")
      .sort((a, b) => Number((b.time || {}).rolledSpentHours || 0) - Number((a.time || {}).rolledSpentHours || 0))
      .slice(0, 16);
    document.getElementById("inbox-list").innerHTML = pending.map((e) =>
      `<a class="inbox-row" href="mapping.html#${encodeURIComponent(e.key || e.title)}">
        <span class="mono">${Hours.esc(e.key || "—")}</span>
        <span class="grow">${Hours.esc(e.title)}</span>
        <span class="mono">${Hours.fmtNum((e.time || {}).rolledSpentHours)}</span>
        <span class="nav-edp-st st-pending"></span>
      </a>`
    ).join("") || `<div class="empty-mini">—</div>`;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint);
  else paint();
})();
