(function () {
  let model = { version: 1, updatedAt: null, pilot: null, cases: [] };
  let selected = "";
  let writer = false;
  const status = document.getElementById("case-status");
  const open = new Set();

  function rawCase(id) {
    return model.cases.find((row) => row.id === id) || null;
  }

  function computedCase(id) {
    return Hours.caseRows().find((row) => row.id === id) || null;
  }

  function setStatus(text, kind) {
    status.textContent = text || "";
    status.className = "status" + (kind ? " " + kind : "");
  }

  function parseHours(raw) {
    const text = String(raw == null ? "" : raw).trim();
    if (!text) return null;
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0) return undefined;
    return Math.round(value * 2) / 2;
  }

  function nextId() {
    let n = 1;
    const used = new Set(model.cases.map((row) => row.id));
    while (used.has("CASE-" + n)) n += 1;
    return "CASE-" + n;
  }

  function ensureShape(row) {
    row.status = row.status || "active";
    row.title = row.title || "";
    row.period = row.period || { from: null, to: null };
    row.teams = Array.isArray(row.teams) ? row.teams : [];
    row.edps = Array.isArray(row.edps) ? row.edps : [];
    row.milestones = Array.isArray(row.milestones) ? row.milestones : [];
    row.budgets = Array.isArray(row.budgets) ? row.budgets : [];
    row.etcHours = row.etcHours == null ? null : row.etcHours;
    row.etcByEpp = row.etcByEpp || {};
    row.allocations = Array.isArray(row.allocations) ? row.allocations : [];
    row.exceptions = Array.isArray(row.exceptions) ? row.exceptions : [];
    return row;
  }

  function latestBudget(row) {
    const rows = (row.budgets || []).filter((item) => item && item.hours != null);
    return rows.length ? rows.slice().sort((a, b) => String(a.at || "").localeCompare(String(b.at || ""))).pop() : null;
  }

  function metric(value) {
    return value == null ? "—" : Hours.fmtNum(value);
  }

  function metricStrip(calc) {
    const cells = [
      ["Allocated", calc && calc.allocated],
      ["FAC", calc && calc.fac],
      ["Budget", calc && calc.budget],
      ["Left", calc && calc.left],
      ["ETC", calc && calc.etc],
      ["Holes", calc && calc.holes],
    ];
    return `<div class="metrics metrics-6 case-metrics">${cells.map(([label, value], index) =>
      `<div class="metric${index === 1 ? " is-lead" : ""}${value != null && value < 0 ? " is-over" : ""}">
        <b>${Hours.esc(metric(value))}</b><span>${Hours.esc(label)}</span>
      </div>`
    ).join("")}</div>`;
  }

  function paintList() {
    const query = document.getElementById("case-search").value.toLowerCase();
    const active = document.getElementById("case-active").checked;
    const rows = model.cases.filter((row) => {
      if (active && (row.status || "active") !== "active") return false;
      return !query || `${row.id} ${row.title || ""}`.toLowerCase().includes(query);
    });
    document.getElementById("case-count").textContent = String(rows.length);
    document.getElementById("case-list").innerHTML = rows.map((row) => {
      const calc = computedCase(row.id);
      const isPilot = model.pilot === row.id;
      return `<button type="button" class="nav-edp${selected === row.id ? " is-selected" : ""}" data-case="${Hours.esc(row.id)}">
        <span class="nav-edp-main"><span class="mono">${Hours.esc(row.id)}</span>${isPilot ? `<span class="pill">Pilot</span>` : ""}</span>
        <span class="nav-edp-title">${Hours.esc(row.title || "Untitled case")}</span>
        <span class="nav-edp-foot"><span>FAC</span><b class="mono">${Hours.esc(metric(calc && calc.fac))}</b></span>
      </button>`;
    }).join("") || `<div class="empty-mini">—</div>`;
  }

  function jiraKey(key) {
    const href = Hours.jiraHref(key);
    return href
      ? `<a class="key mono" href="${Hours.esc(href)}" target="_blank" rel="noreferrer">${Hours.esc(key)}</a>`
      : `<span class="mono">${Hours.esc(key)}</span>`;
  }

  function bindings(row, calc) {
    const bound = new Set(row.edps || []);
    const choices = Hours.edpRows().filter((edp) => !bound.has(edp.key));
    const rows = (row.edps || []).map((key) => {
      const edp = Hours.findEdp(key);
      if (!edp) return `<tr><td>${jiraKey(key)}</td><td>Missing from snapshot</td><td></td><td></td><td><button data-remove-edp="${Hours.esc(key)}">Remove</button></td></tr>`;
      const calcEpps = calc ? (calc.epps || []).filter((epp) =>
        (edp.children || []).some((child) => child.key === epp.key)
      ) : [];
      const associated = Hours.uniqueReportHours((edp.children || []).filter((epp) => epp.costMember), false);
      const allocated = calcEpps.reduce((sum, epp) => sum + Number(epp.allocated || 0), 0);
      return `<tr>
        <td>${jiraKey(key)}</td>
        <td><a href="${Hours.esc(Hours.lineHref(edp.productLabel) + "#" + encodeURIComponent(key))}">${Hours.esc(edp.title || "")}</a></td>
        <td>${Hours.esc(edp.productLabel || "")}</td>
        <td class="num mono">${Hours.esc(metric(associated))}</td>
        <td class="num mono">${Hours.esc(metric(allocated))}</td>
        <td><button type="button" class="ghost" data-remove-edp="${Hours.esc(key)}">Remove</button></td>
      </tr>`;
    }).join("");
    return `<section class="case-section">
      <div class="case-section-head"><h2>Bindings</h2>
        <div class="toolbar-end">
          <select id="case-add-edp"><option value="">Add EDP</option>${choices.map((edp) =>
            `<option value="${Hours.esc(edp.key)}">${Hours.esc(edp.key + "  " + edp.title)}</option>`
          ).join("")}</select>
          <button type="button" id="case-add-edp-btn">Add</button>
        </div>
      </div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Key</th><th>Item</th><th>Product</th><th class="num">Associated</th><th class="num">Allocated</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="muted">—</td></tr>`}</tbody></table></div>
    </section>`;
  }

  function allocations(row, calc) {
    const raw = Object.fromEntries((row.allocations || []).map((item) => [item.epp, item]));
    const shared = ((calc && calc.epps) || []).filter((epp) => epp.shared || raw[epp.key]);
    return `<section class="case-section">
      <div class="case-section-head"><h2>Shared allocation</h2><span class="mono muted">${shared.length} EPP</span></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Key</th><th>Item</th><th>Cases</th><th class="num">Associated</th><th class="num">This case</th></tr></thead>
      <tbody>${shared.map((epp) => `<tr>
        <td>${jiraKey(epp.key)}</td><td>${Hours.esc(epp.title || "")}</td>
        <td class="mono muted">${Hours.esc((epp.cases || []).join(" "))}</td>
        <td class="num mono">${Hours.esc(metric(epp.hours))}</td>
        <td class="num"><input type="number" min="0" step="0.5" data-allocation="${Hours.esc(epp.key)}" value="${Hours.esc(raw[epp.key] && raw[epp.key].hours != null ? raw[epp.key].hours : "")}" /></td>
      </tr>`).join("") || `<tr><td colspan="5" class="muted">—</td></tr>`}</tbody></table></div>
    </section>`;
  }

  function treeSlice(row) {
    const groups = (row.edps || []).map((key) => {
      const edp = Hours.findEdp(key);
      if (!edp) return "";
      const ordered = Hours.costChildren(edp)
        .concat(Hours.pendingChildren(edp), Hours.rejectedChildren(edp));
      return `<div class="case-tree-edp">
        <div class="case-tree-head">
          ${jiraKey(key)}
          <a href="${Hours.esc(Hours.lineHref(edp.productLabel) + "#" + encodeURIComponent(key))}">${Hours.esc(edp.title || "")}</a>
          <span class="pill">${Hours.esc(Hours.health(edp))}</span>
        </div>
        <div class="unit-cols"><span></span><span></span><span></span><span>Cost</span><span>Logged</span><span>Last booked</span><span></span></div>
        ${ordered.map((epp) => Record.eppBlock(epp, open)).join("") || `<div class="empty-mini">—</div>`}
      </div>`;
    }).join("");
    return `<section class="case-section">
      <div class="case-section-head"><h2>Jira tree</h2><span class="mono muted">${(row.edps || []).length} EDP</span></div>
      ${groups || `<div class="empty-mini">—</div>`}
    </section>`;
  }

  function coverage(row, calc) {
    const rows = (calc && calc.coverage) || [];
    return `<section class="case-section">
      <div class="case-section-head"><h2>Coverage</h2><span class="mono muted">${rows.length} exceptions</span></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Ticket</th><th>EPP</th><th class="num">Hours</th><th>Action</th></tr></thead>
      <tbody>${rows.map((item) => `<tr>
        <td class="mono">${Hours.esc(item.date || "")}</td><td>${jiraKey(item.key || "")}</td><td>${jiraKey(item.epp || "")}</td>
        <td class="num mono">${Hours.esc(metric(item.hours))}</td>
        <td><button type="button" class="ghost" data-exception="${Hours.esc(item.key || "")}" data-action="out_of_scope">Out of scope</button></td>
      </tr>`).join("") || `<tr><td colspan="5" class="muted">—</td></tr>`}</tbody></table></div>
    </section>`;
  }

  function paintRecord() {
    const root = document.getElementById("case-record");
    const row = rawCase(selected);
    if (!row) {
      root.innerHTML = `<div class="case-empty"><button type="button" class="primary" id="case-empty-new">New case</button></div>`;
      document.getElementById("case-empty-new").addEventListener("click", createCase);
      return;
    }
    ensureShape(row);
    const calc = computedCase(row.id);
    const budget = latestBudget(row);
    root.innerHTML = `<header class="record-head case-head">
      <div class="record-id">
        <span class="chip">CASE</span><span class="mono">${Hours.esc(row.id)}</span>
        <label class="chk"><input type="checkbox" id="case-pilot"${model.pilot === row.id ? " checked" : ""} /> Pilot</label>
        <select id="case-status-field"><option value="active">Active</option><option value="closed">Closed</option></select>
      </div>
      <input class="case-title-input" id="case-title" type="text" value="${Hours.esc(row.title)}" placeholder="Case title" />
      ${metricStrip(calc)}
    </header>
    <div class="case-body">
      <section class="case-section case-settings">
        <div class="case-section-head"><h2>Control inputs</h2></div>
        <div class="case-fields">
          <label><span>Period from</span><input id="case-from" type="date" value="${Hours.esc(row.period.from || "")}" /></label>
          <label><span>Period to</span><input id="case-to" type="date" value="${Hours.esc(row.period.to || "")}" /></label>
          <label><span>Teams</span><input id="case-teams" type="text" value="${Hours.esc(row.teams.join(", "))}" placeholder="E21, BPO" /></label>
          <label><span>Budget h</span><input id="case-budget" type="number" min="0" step="0.5" value="${Hours.esc(budget ? budget.hours : "")}" /></label>
          <label><span>Budget source</span><input id="case-budget-source" type="text" value="${Hours.esc(budget ? budget.source || "" : "")}" /></label>
          <label><span>ETC h</span><input id="case-etc" type="number" min="0" step="0.5" value="${Hours.esc(row.etcHours == null ? "" : row.etcHours)}" /></label>
        </div>
      </section>
      ${bindings(row, calc)}
      ${treeSlice(row)}
      ${allocations(row, calc)}
      ${coverage(row, calc)}
    </div>`;
    document.getElementById("case-status-field").value = row.status;
    bindRecord(row);
  }

  function bindRecord(row) {
    [
      ["case-title", "title"],
      ["case-status-field", "status"],
    ].forEach(([id, field]) => document.getElementById(id).addEventListener("input", (event) => {
      row[field] = event.target.value;
      paintList();
    }));
    document.getElementById("case-pilot").addEventListener("change", (event) => {
      model.pilot = event.target.checked ? row.id : null;
      paintList();
    });
    document.getElementById("case-from").addEventListener("change", (event) => { row.period.from = event.target.value || null; });
    document.getElementById("case-to").addEventListener("change", (event) => { row.period.to = event.target.value || null; });
    document.getElementById("case-teams").addEventListener("input", (event) => {
      row.teams = event.target.value.split(",").map((value) => value.trim()).filter(Boolean);
    });
    document.getElementById("case-etc").addEventListener("change", (event) => {
      const value = parseHours(event.target.value);
      if (value !== undefined) row.etcHours = value;
    });
    document.getElementById("case-budget").addEventListener("change", (event) => {
      const value = parseHours(event.target.value);
      if (value === undefined) return;
      const source = document.getElementById("case-budget-source").value.trim();
      if (value == null) return;
      row.budgets.push({ at: new Date().toISOString(), hours: value, source: source || "manual", note: "" });
    });
    document.getElementById("case-add-edp-btn").addEventListener("click", () => {
      const select = document.getElementById("case-add-edp");
      if (select.value && !row.edps.includes(select.value)) row.edps.push(select.value);
      paintRecord();
    });
    document.querySelectorAll("[data-remove-edp]").forEach((button) => button.addEventListener("click", () => {
      row.edps = row.edps.filter((key) => key !== button.getAttribute("data-remove-edp"));
      paintRecord();
    }));
    document.querySelectorAll("[data-allocation]").forEach((input) => input.addEventListener("change", () => {
      const key = input.getAttribute("data-allocation");
      const value = parseHours(input.value);
      row.allocations = row.allocations.filter((item) => item.epp !== key);
      if (value != null && value !== undefined) row.allocations.push({
        epp: key, hours: value, note: "", updatedAt: new Date().toISOString(),
      });
    }));
    document.querySelectorAll("[data-exception]").forEach((button) => button.addEventListener("click", () => {
      const key = button.getAttribute("data-exception");
      row.exceptions = row.exceptions.filter((item) => item.key !== key);
      row.exceptions.push({
        key,
        action: button.getAttribute("data-action"),
        note: "",
        updatedAt: new Date().toISOString(),
      });
      setStatus("Classification staged");
    }));
  }

  function render() {
    paintList();
    paintRecord();
    const id = selected ? encodeURIComponent(selected) : "";
    history.replaceState(null, "", location.pathname + (id ? "?case=" + id : ""));
  }

  function createCase() {
    const id = nextId();
    model.cases.push(ensureShape({ id, title: "", status: "active" }));
    if (!model.pilot) model.pilot = id;
    selected = id;
    render();
    setTimeout(() => document.getElementById("case-title").focus(), 0);
  }

  function payload() {
    return Object.assign({}, model, { updatedAt: new Date().toISOString() });
  }

  async function save() {
    const data = payload();
    if (!writer) {
      Save.download("overlay_cases.json", data);
      setStatus("Downloaded", "ok");
      return;
    }
    try {
      setStatus("Saving…");
      await Save.post("/cases", data);
      setStatus("Saved · reload for recalculated FAC", "ok");
    } catch (error) {
      setStatus(error.message || "Save failed", "error");
    }
  }

  async function init() {
    try {
      const response = await fetch("jira_map/overlay_cases.json", { cache: "no-store" });
      if (response.ok) model = await response.json();
    } catch (error) {
      setStatus("Case overlay unavailable", "error");
    }
    model.cases = (model.cases || []).map(ensureShape);
    const requested = new URLSearchParams(location.search).get("case");
    selected = rawCase(requested) ? requested : (model.pilot || (model.cases[0] || {}).id || "");
    writer = await Save.available();
    document.getElementById("case-save").textContent = writer ? "Save" : "Download";
    render();
  }

  document.getElementById("case-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-case]");
    if (!button) return;
    selected = button.getAttribute("data-case");
    render();
  });
  document.getElementById("case-search").addEventListener("input", paintList);
  document.getElementById("case-active").addEventListener("change", paintList);
  document.getElementById("case-new").addEventListener("click", createCase);
  document.getElementById("case-download").addEventListener("click", () => Save.download("overlay_cases.json", payload()));
  document.getElementById("case-save").addEventListener("click", save);
  Record.bindToggle(document.getElementById("case-record"), open, paintRecord);
  init();
})();
