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

    const products = Hours.productRows();
    const max = Hours.lineMaxHours();
    document.getElementById("product-table").innerHTML = products.map((p) =>
      `<a class="line-item is-dir" href="${Hours.esc(Hours.lineHref(p.name))}">
        <span class="line-name">${Hours.esc(p.name)}</span>
        <span class="line-n mono">${p.activeCount || p.edpCount || ""}</span>
        <span class="line-h mono">${Hours.esc(Hours.fmtNum(p.uniqueSpentHours))}</span>
        ${Hours.lineBar(p.uniqueSpentHours, max)}
      </a>`
    ).join("");

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
      .sort((a, b) => Number((b.time || {}).rolledSpentHours || 0) - Number((a.time || {}).rolledSpentHours || 0));
    const byProd = {};
    pending.forEach((e) => {
      const p = e.productLabel || "—";
      (byProd[p] ||= []).push(e);
    });
    document.getElementById("inbox-list").innerHTML = Hours.productRows().map((prod) => {
      const list = (byProd[prod.name] || []).slice(0, 8);
      if (!list.length) return "";
      return `<div class="pending-line">
        <a class="pending-line-h" href="${Hours.esc(Hours.lineHref(prod.name, "mapping.html"))}">${Hours.esc(prod.name)}</a>
        ${list.map((e) =>
          `<a class="inbox-row" href="mapping.html?line=${encodeURIComponent(prod.name)}#${encodeURIComponent(e.key || e.title)}">
            <span class="mono">${Hours.esc(e.key || "—")}</span>
            <span class="grow">${Hours.esc(e.title)}</span>
            <span class="mono">${Hours.fmtNum((e.time || {}).rolledSpentHours)}</span>
            <span class="nav-edp-st st-pending"></span>
          </a>`
        ).join("")}
      </div>`;
    }).join("") || `<div class="empty-mini">—</div>`;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint);
  else paint();
})();
