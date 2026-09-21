(function () {
  const LS_VIEW = "hours.delivery.view";
  const LS_LINE = "hours.delivery.line";
  const LS_MILESTONE = "hours.delivery.milestone";
  const open = new Set();

  const els = {
    view: document.getElementById("view-toggle"),
    search: document.getElementById("tree-search"),
    status: document.getElementById("status-filter"),
    active: document.getElementById("active-only"),
    context: document.getElementById("line-switch"),
    nav: document.getElementById("nav-list"),
    pane: document.getElementById("record-pane"),
  };

  let view = localStorage.getItem(LS_VIEW) || "product";
  let line = "";
  let milestone = "";
  let selected = { kind: null, key: null };

  function hashKey() {
    return decodeURIComponent((location.hash || "").replace(/^#/, "")).trim();
  }

  function edpId(edp) {
    return edp.key || edp.title || "";
  }

  function replaceUrl() {
    const url = new URL(location.href);
    if (view === "milestone") url.searchParams.set("view", "milestone");
    else url.searchParams.delete("view");
    if (view === "product" && line) url.searchParams.set("line", line);
    else url.searchParams.delete("line");
    if (view === "milestone" && milestone) url.searchParams.set("milestone", milestone);
    else url.searchParams.delete("milestone");
    history.replaceState(null, "", url.pathname + url.search + (location.hash || ""));
  }

  function setHash(key) {
    const url = new URL(location.href);
    url.hash = key ? encodeURIComponent(key) : "";
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  function persistContext() {
    if (line) localStorage.setItem(LS_LINE, line);
    else localStorage.removeItem(LS_LINE);
    if (milestone) localStorage.setItem(LS_MILESTONE, milestone);
    else localStorage.removeItem(LS_MILESTONE);
    replaceUrl();
  }

  function readContext() {
    const q = new URLSearchParams(location.search);
    if (q.get("view") === "milestone" || q.has("milestone")) view = "milestone";
    if (q.get("view") === "product") view = "product";
    line = q.has("line") ? (q.get("line") || "") : (localStorage.getItem(LS_LINE) || "");
    milestone = q.has("milestone") ? (q.get("milestone") || "") : (localStorage.getItem(LS_MILESTONE) || "");
  }

  function matchesEdp(edp) {
    const q = (els.search.value || "").trim().toLowerCase();
    const st = els.status.value;
    if (els.active.checked && !edp.active) return false;
    if (st && Hours.health(edp) !== st) return false;
    if (line && edp.productLabel !== line && !(edp.alsoIn || []).includes(line)) return false;
    if (!q) return true;
    const hay = ((edp.key || "") + " " + (edp.title || "") + " " + (edp.productLabel || "")).toLowerCase();
    if (hay.includes(q)) return true;
    return (edp.children || []).some((e) => ((e.key || "") + " " + (e.title || "")).toLowerCase().includes(q));
  }

  function milestoneNode(key) {
    return (Hours.tree().milestones || []).find((m) => m.key === key) || null;
  }

  function matchesEpp(epp) {
    const q = (els.search.value || "").trim().toLowerCase();
    if (!q) return true;
    return ((epp.key || "") + " " + (epp.title || "")).toLowerCase().includes(q);
  }

  function select(kind, key) {
    selected = { kind, key };
    open.clear();
    setHash(key);
    renderNav();
    renderPane();
  }

  function setLine(name) {
    line = name || "";
    selected = { kind: null, key: null };
    open.clear();
    setHash("");
    persistContext();
    renderAll();
  }

  function setMilestone(key) {
    milestone = key || "";
    selected = { kind: null, key: null };
    open.clear();
    setHash("");
    persistContext();
    renderAll();
  }

  function renderContext() {
    const name = view === "product" ? line : milestone;
    if (!name) {
      els.context.hidden = true;
      els.context.innerHTML = "";
      return;
    }
    const node = view === "milestone" ? milestoneNode(name) : null;
    const label = node ? `${node.key} ${node.name || node.title || ""}` : name;
    const kicker = view === "milestone" ? "Program M1–M4" : "Product line";
    els.context.hidden = false;
    els.context.innerHTML = `<button type="button" class="nav-back" data-back>
      <span aria-hidden="true">←</span>
      <span><small>${Hours.esc(kicker)}</small>${Hours.esc(label)}</span>
    </button>`;
  }

  function jiraKey(node) {
    const href = Hours.jiraHref(node);
    const key = Hours.esc((node && node.key) || "—");
    return href
      ? `<a class="nav-edp-k" href="${Hours.esc(href)}" target="_blank" rel="noreferrer">${key}</a>`
      : `<span class="nav-edp-k">${key}</span>`;
  }

  function navItem(kind, node, hours, health) {
    const key = kind === "edp" ? edpId(node) : node.key;
    const on = selected.kind === kind && selected.key === key;
    const status = health ? `<span class="nav-edp-st st-${Hours.esc(health)}"></span>` : `<span></span>`;
    return `<div class="nav-edp${on ? " is-on" : ""}" role="button" tabindex="0"
      data-kind="${Hours.esc(kind)}" data-key="${Hours.esc(key)}">
      ${jiraKey(node)}
      <span class="nav-edp-t">${Hours.esc(node.title || "")}</span>
      <span class="nav-edp-h mono">${Hours.esc(Hours.fmtNum(hours))}</span>
      ${status}
    </div>`;
  }

  function renderProductRoots() {
    const q = (els.search.value || "").trim().toLowerCase();
    const max = Hours.lineMaxHours();
    const edps = Hours.uniqueEdps().filter(matchesEdp);
    els.nav.innerHTML = Hours.productRows().map((prod) => {
      const members = edps.filter((e) => e.productLabel === prod.name || (e.alsoIn || []).includes(prod.name));
      if (q && !prod.name.toLowerCase().includes(q) && !members.length) return "";
      const zero = !(Number(prod.uniqueSpentHours) > 0);
      return `<button type="button" class="nav-root${zero ? " is-zero" : ""}" data-line="${Hours.esc(prod.name)}">
        <span class="nav-root-main">
          <span class="nav-root-name">${Hours.esc(prod.name)}</span>
          <span class="nav-root-count mono">${Hours.esc(String(members.length || prod.edpCount || 0))}</span>
        </span>
        <span class="nav-root-cost mono">${Hours.esc(Hours.fmtNum(prod.uniqueSpentHours))}</span>
        ${Hours.lineBar(prod.uniqueSpentHours, max)}
      </button>`;
    }).join("") || `<div class="empty-mini">—</div>`;
  }

  function renderProductEdps() {
    const edps = Hours.uniqueEdps().filter(matchesEdp);
    els.nav.innerHTML = edps.map((edp) =>
      navItem("edp", edp, Hours.uniqueHoursOf(edp), Hours.health(edp))
    ).join("") || `<div class="empty-mini">—</div>`;
  }

  function renderMilestoneRoots() {
    const q = (els.search.value || "").trim().toLowerCase();
    const max = Hours.milestoneRows().reduce((m, row) => Math.max(m, Number(row.uniqueSpentHours) || 0), 0);
    els.nav.innerHTML = Hours.milestoneRows().map((row) => {
      const node = milestoneNode(row.key);
      const children = ((node && node.children) || []).filter(matchesEpp);
      const label = `${row.key} ${row.name || ""}`;
      if (q && !label.toLowerCase().includes(q) && !children.length) return "";
      return `<button type="button" class="nav-root" data-milestone="${Hours.esc(row.key)}">
        <span class="nav-root-main">
          <span class="nav-root-name">${Hours.esc(label)}</span>
          <span class="nav-root-count mono">${Hours.esc(String(row.eppCount || children.length || 0))}</span>
        </span>
        <span class="nav-root-cost mono">${Hours.esc(Hours.fmtNum(row.uniqueSpentHours))}</span>
        ${Hours.lineBar(row.uniqueSpentHours, max)}
      </button>`;
    }).join("") || `<div class="empty-mini">—</div>`;
  }

  function renderMilestoneEpps() {
    const node = milestoneNode(milestone);
    const rows = ((node && node.children) || []).filter(matchesEpp);
    els.nav.innerHTML = rows.map((epp) => {
      const t = epp.time || {};
      const cost = t.uniqueSpentHours != null ? t.uniqueSpentHours : t.rolledSpentHours;
      return navItem("epp", epp, cost || 0, "");
    }).join("") || `<div class="empty-mini">—</div>`;
  }

  function renderNav() {
    if (view === "milestone") {
      if (milestone) renderMilestoneEpps();
      else renderMilestoneRoots();
      return;
    }
    if (line) renderProductEdps();
    else renderProductRoots();
  }

  function summaryView(kind, label, cost, count) {
    const isProgram = kind === "milestone";
    return `<header class="record-head record-summary">
      <div class="record-id">${Record.chip(isProgram ? "milestone" : "product")}</div>
      <h1>${Hours.esc(label)}</h1>
      <div class="metrics metrics-2">
        <div class="metric${Number(cost) > 0 ? " is-lead" : " is-quiet"}"><b>${Hours.esc(Hours.fmtNum(cost))}</b><span>Cost</span></div>
        <div class="metric is-quiet"><b>${Hours.esc(String(count || 0))}</b><span>${isProgram ? "EPPs" : "EDPs"}</span></div>
      </div>
    </header>`;
  }

  function renderPane() {
    if (selected.kind === "edp") {
      const edp = Hours.findEdp(selected.key);
      els.pane.innerHTML = edp
        ? Record.edpView(edp, {
          open,
          reportHref: "deliverable.html?edp=" + encodeURIComponent(edp.key || ""),
          mappingHref: "mapping.html#" + encodeURIComponent(edpId(edp)),
        })
        : `<div class="empty-mini">—</div>`;
      return;
    }
    if (selected.kind === "epp") {
      const epp = Hours.findEpp(selected.key);
      els.pane.innerHTML = epp ? Record.eppView(epp, { open }) : `<div class="empty-mini">—</div>`;
      return;
    }
    if (view === "product" && line) {
      const row = Hours.productRows().find((p) => p.name === line);
      const count = Hours.uniqueEdps().filter((e) => e.productLabel === line || (e.alsoIn || []).includes(line)).length;
      els.pane.innerHTML = summaryView("product", line, row && row.uniqueSpentHours, count);
      return;
    }
    if (view === "milestone" && milestone) {
      const row = Hours.milestoneRows().find((m) => m.key === milestone);
      els.pane.innerHTML = summaryView("milestone", `${milestone} ${(row && row.name) || ""}`, row && row.uniqueSpentHours, row && row.eppCount);
      return;
    }
    els.pane.innerHTML = "";
  }

  function keepVisible() {
    if (selected.kind === "edp" && !Hours.uniqueEdps().filter(matchesEdp).some((e) => edpId(e) === selected.key)) {
      selected = { kind: null, key: null };
      setHash("");
    }
    if (selected.kind === "epp") {
      const node = milestoneNode(milestone);
      if (!((node && node.children) || []).filter(matchesEpp).some((e) => e.key === selected.key)) {
        selected = { kind: null, key: null };
        setHash("");
      }
    }
    renderNav();
    renderPane();
  }

  function applyHash() {
    const key = hashKey();
    if (!key) return false;
    const edp = Hours.findEdp(key);
    if (edp) {
      view = "product";
      line = edp.productLabel || line;
      els.view.value = view;
      localStorage.setItem(LS_VIEW, view);
      persistContext();
      selected = { kind: "edp", key: edpId(edp) };
      return true;
    }
    const epp = Hours.findEpp(key);
    if (!epp) return false;
    const containingMilestone = (Hours.tree().milestones || []).find((m) =>
      (m.children || []).some((child) => child.key === key)
    );
    if (view === "milestone" && containingMilestone) {
      milestone = containingMilestone.key;
      persistContext();
      selected = { kind: "epp", key };
      return true;
    }
    const owner = Hours.edpsForEpp(key)[0];
    if (owner) {
      view = "product";
      line = owner.productLabel || line;
      els.view.value = view;
      localStorage.setItem(LS_VIEW, view);
      persistContext();
      selected = { kind: "edp", key: edpId(owner) };
      open.add("epp:" + key);
      return true;
    }
    if (containingMilestone) {
      view = "milestone";
      milestone = containingMilestone.key;
      els.view.value = view;
      localStorage.setItem(LS_VIEW, view);
      persistContext();
      selected = { kind: "epp", key };
      return true;
    }
    return false;
  }

  function syncChrome() {
    const program = view === "milestone";
    els.status.hidden = program;
    const activeLabel = els.active.closest("label");
    if (activeLabel) activeLabel.hidden = program;
    els.active.hidden = program;
    els.status.disabled = program;
    els.active.disabled = program;
  }

  function renderAll() {
    syncChrome();
    renderContext();
    renderNav();
    renderPane();
  }

  els.view.addEventListener("change", () => {
    view = els.view.value;
    localStorage.setItem(LS_VIEW, view);
    selected = { kind: null, key: null };
    open.clear();
    setHash("");
    persistContext();
    renderAll();
  });

  [els.search, els.status, els.active].forEach((el) => {
    el.addEventListener("input", keepVisible);
    el.addEventListener("change", keepVisible);
  });

  els.context.addEventListener("click", (ev) => {
    if (!ev.target.closest("[data-back]")) return;
    if (view === "milestone") setMilestone("");
    else setLine("");
  });

  els.nav.addEventListener("click", (ev) => {
    if (ev.target.closest("a")) return;
    const lineButton = ev.target.closest("[data-line]");
    if (lineButton) {
      setLine(lineButton.getAttribute("data-line") || "");
      return;
    }
    const milestoneButton = ev.target.closest("[data-milestone]");
    if (milestoneButton) {
      setMilestone(milestoneButton.getAttribute("data-milestone") || "");
      return;
    }
    const item = ev.target.closest("[data-kind][data-key]");
    if (item) select(item.getAttribute("data-kind"), item.getAttribute("data-key"));
  });

  els.nav.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const item = ev.target.closest("[data-kind][data-key]");
    if (!item || ev.target.closest("a")) return;
    ev.preventDefault();
    select(item.getAttribute("data-kind"), item.getAttribute("data-key"));
  });

  Record.bindToggle(els.pane, open, renderPane);
  window.addEventListener("hashchange", () => {
    if (applyHash()) renderAll();
  });

  if (view !== "milestone") view = "product";
  readContext();
  els.view.value = view;
  applyHash();
  renderAll();
})();
