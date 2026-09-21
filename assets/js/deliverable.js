(function () {
  const select = document.getElementById("deliverable-select");
  let selected = "";

  function fmt(value, unit) {
    if (value == null || value === "") return "—";
    if (unit === "percent") return Hours.fmtNum(value) + "%";
    if (unit === "date") return String(value);
    return Hours.fmtNum(value);
  }

  function metricClass(metric) {
    return metric.status === "available" ? "" : metric.status === "partial" ? " is-partial" : " is-missing";
  }

  function metricCell(metric, unit) {
    return `<div class="report-kpi${metricClass(metric)}">
      <b>${Hours.esc(fmt(metric.value, unit))}</b>
      <span>${Hours.esc(metric.definition.label)}</span>
      <small>${Hours.esc(metric.status)}</small>
    </div>`;
  }

  function nodeHours(node, field) {
    const seconds = (node.time || {})[field];
    return seconds == null ? null : Hours.round2(Number(seconds) / 3600);
  }

  function flatRows(edp) {
    const rows = [];
    Hours.costChildren(edp).forEach((epp) => {
      rows.push({ node: epp, level: 0 });
      (epp.children || []).forEach((feature) => {
        rows.push({ node: feature, level: 1 });
        (feature.children || []).forEach((story) => rows.push({ node: story, level: 2 }));
      });
    });
    return rows;
  }

  function paintTitle(report) {
    const edp = report.edp;
    const category = Kpis.category(edp);
    document.getElementById("deliverable-title").innerHTML = `
      <div class="record-line">${[edp.productLabel].concat(edp.alsoIn || []).filter(Boolean).map((name) =>
        `<a href="${Hours.esc(Hours.lineHref(name))}">${Hours.esc(name)}</a>`
      ).join("")}</div>
      <div class="record-id">
        <span class="chip chip-edp">EDP</span>
        <a class="key mono" href="${Hours.esc(Hours.jiraHref(edp))}" target="_blank" rel="noreferrer">${Hours.esc(edp.key || "")}</a>
        <span class="pill">${Hours.esc(edp.status || "No status")}</span>
        <span class="pill">${Hours.esc(category.key)}</span>
        <span class="pip st-${Hours.esc(Hours.health(edp))}"></span>
      </div>
      <h1>${Hours.esc(edp.title || "")}</h1>`;
    document.getElementById("deliverable-jira").href = Hours.jiraHref(edp);
    document.getElementById("deliverable-tree").href =
      Hours.lineHref(edp.productLabel) + "#" + encodeURIComponent(edp.key || "");
  }

  function paintKpis(report) {
    const m = report.metrics;
    document.getElementById("deliverable-kpis").innerHTML = [
      metricCell(m.completion, "percent"),
      metricCell(m.spent, "hours"),
      metricCell(m.original_estimate, "hours"),
      metricCell(m.remaining, "hours"),
      metricCell(m.forecast_finish, "date"),
      metricCell(m.estimate_coverage, "percent"),
    ].join("");
    const native = m.completion.nativeCoverage;
    document.getElementById("deliverable-evidence").innerHTML = `
      <span><b>Evidence</b> Jira snapshot ${Hours.esc(Hours.fmtWhen(Hours.fetchedAt()))}</span>
      <span>Status category ${Hours.esc(Hours.fmtNum(native))}% native</span>
      <span>${Hours.esc(String(report.workflow.leaves.length))} leaf items</span>`;
  }

  function paintCharts(report) {
    const c = report.workflow.counts;
    Charts.donut(document.getElementById("deliverable-workflow"), {
      title: "Scope state",
      centerLabel: "Items",
      segments: [
        { key: "done", label: "Done", value: c.done, fill: Charts.ink },
        { key: "active", label: "In progress", value: c.active, fill: Charts.copper },
        { key: "planned", label: "To do", value: c.planned, fill: Charts.copperSoft },
        { key: "other", label: "Other", value: c.other, fill: "#8a8478" },
        { key: "removed", label: "Removed", value: c.removed, fill: "#d8d2c6" },
      ],
    });
    const rows = report.epps.map((epp) => ({
      key: epp.key,
      label: epp.key,
      logged: Number((epp.time || {}).rolledSpentHours) || 0,
      href: Hours.jiraHref(epp),
      external: true,
    })).sort((a, b) => b.logged - a.logged);
    Charts.hbar(document.getElementById("deliverable-hours"), {
      title: "Hours by EPP",
      rows,
      series: [{ key: "logged", label: "Logged", fill: Charts.ink }],
      rowH: 38,
      showValues: true,
    });
  }

  function signal(label, value, status, href) {
    const content = `<b class="mono">${Hours.esc(value)}</b><span>${Hours.esc(label)}</span><small>${Hours.esc(status)}</small>`;
    return href
      ? `<a class="control-signal" href="${Hours.esc(href)}">${content}</a>`
      : `<div class="control-signal">${content}</div>`;
  }

  function paintSignals(report) {
    const m = report.metrics;
    document.getElementById("deliverable-signals").innerHTML = `<div class="control-signals">
      ${signal("Mapping", Hours.health(report.edp), "available", `mapping.html?line=${encodeURIComponent(report.edp.productLabel)}#${encodeURIComponent(report.edp.key)}`)}
      ${signal("Pending h", fmt(m.pending_mapping.value), m.pending_mapping.status, "mapping.html")}
      ${signal("Shared EPP", fmt(m.shared_scope.value), m.shared_scope.status, "cases.html")}
      ${signal("Blockers", fmt(m.blockers.value), m.blockers.status)}
      ${signal("Target", fmt(m.target_date.value, "date"), m.target_date.status)}
    </div>`;
    const priority = [
      "remaining", "forecast_finish", "target_date", "blockers",
      "estimate_coverage", "delivery_status", "pending_mapping",
    ];
    const gaps = priority.map((id) => m[id]).filter((metric) => metric.status !== "available");
    document.getElementById("deliverable-gaps").innerHTML = gaps.map((metric) => `
      <div class="tracking-gap">
        <div><b>${Hours.esc(metric.definition.label)}</b><span class="pill">${Hours.esc(metric.status)}</span></div>
        <p>${Hours.esc(metric.definition.track)}</p>
        <small>${Hours.esc(metric.definition.source)}</small>
      </div>`).join("") || `<div class="empty-mini">—</div>`;
  }

  function paintTable(report) {
    const rows = flatRows(report.edp);
    document.getElementById("deliverable-count").textContent = `${rows.length} Jira items`;
    document.getElementById("deliverable-table").innerHTML = `<table class="data deliverable-data">
      <thead><tr><th>Key</th><th>Item</th><th>Status</th><th>State</th><th class="num">Logged h</th><th class="num">Original h</th><th class="num">Remaining h</th></tr></thead>
      <tbody>${rows.map(({ node, level }) => {
        const category = Kpis.category(node);
        return `<tr>
          <td><a class="key mono" href="${Hours.esc(Hours.jiraHref(node))}" target="_blank" rel="noreferrer">${Hours.esc(node.key || "")}</a></td>
          <td class="scope-level-${level}"><span class="chip chip-${Hours.esc(node.type)}">${Hours.esc(node.type === "feature" ? "FTR" : node.type === "story" ? "STY" : "EPP")}</span>${Hours.esc(node.title || "")}</td>
          <td>${Hours.esc(node.status || "—")}</td><td>${Hours.esc(category.key)}</td>
          <td class="num mono">${Hours.esc(fmt(nodeHours(node, "rolledSpentSec")))}</td>
          <td class="num mono">${Hours.esc(fmt(nodeHours(node, "ownEstimateSec")))}</td>
          <td class="num mono">${Hours.esc(fmt(nodeHours(node, "ownRemainingSec")))}</td>
        </tr>`;
      }).join("") || `<tr><td colspan="7" class="muted">No confirmed Jira scope</td></tr>`}</tbody>
    </table>`;
  }

  function render() {
    const edp = Hours.findEdp(selected);
    if (!edp) return;
    const report = Kpis.deliverable(edp);
    paintTitle(report);
    paintKpis(report);
    paintCharts(report);
    paintSignals(report);
    paintTable(report);
    history.replaceState(null, "", `${location.pathname}?edp=${encodeURIComponent(edp.key || "")}`);
  }

  function init() {
    const rows = Hours.edpRows().filter((row) => row.active || row.uniqueSpentHours > 0)
      .sort((a, b) => String(a.title).localeCompare(String(b.title)));
    select.innerHTML = rows.map((row) =>
      `<option value="${Hours.esc(row.key)}">${Hours.esc(row.key + "  " + row.title)}</option>`
    ).join("");
    const requested = new URLSearchParams(location.search).get("edp");
    selected = rows.some((row) => row.key === requested) ? requested : ((rows[0] || {}).key || "");
    select.value = selected;
    document.getElementById("deliverable-snapshot").textContent =
      Hours.fmtWhen(Hours.fetchedAt()).replace(" UTC", "");
    select.addEventListener("change", () => {
      selected = select.value;
      render();
    });
    render();
  }

  init();
})();
