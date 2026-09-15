(function () {
  function paint() {
    const ov = Hours.overview();
    const stats = [
      [Hours.fmtHours(ov.costUniqueHours), "Unique hours (cost)"],
      [String(ov.activeEdp || 0), "Active EDPs"],
      [String(ov.pendingInferredActive || 0), "Pending inferred"],
      [String(ov.sharedEppCount || 0), "Shared EPPs"],
      [Hours.fmtHours(ov.programUniqueHours), "BRPaaS program M1–M4"],
    ];
    document.getElementById("stats").innerHTML = stats.map(([v, l]) => (
      `<div class="stat"><span class="value">${Hours.esc(v)}</span><span class="label">${Hours.esc(l)}</span></div>`
    )).join("");
    if (window.Shell && Shell.mount) Shell.mount();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint);
  else paint();
})();
