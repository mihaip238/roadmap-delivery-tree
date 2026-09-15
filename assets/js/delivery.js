(function () {
  const LS_VIEW = "hours.delivery.view";
  const open = new Set();

  const els = {
    view: document.getElementById("view-toggle"),
    search: document.getElementById("tree-search"),
    status: document.getElementById("status-filter"),
    product: document.getElementById("product-filter"),
    active: document.getElementById("active-only"),
    nav: document.getElementById("nav-list"),
    navMeta: document.getElementById("nav-meta"),
    pane: document.getElementById("record-pane"),
  };

  let view = localStorage.getItem(LS_VIEW) || "product";
  let selected = { kind: null, key: null };

  function hashKey() {
    const h = decodeURIComponent((location.hash || "").replace(/^#/, "")).trim();
    return /^[A-Z][A-Z0-9]+-\d+$/.test(h) ? h : "";
  }

  function setHash(key) {
    if (!key) return;
    const next = "#" + encodeURIComponent(key);
    if (location.hash !== next) history.replaceState(null, "", next);
  }

  function fillProducts() {
    const names = (Hours.tree().products || []).map((p) => p.name);
    els.product.innerHTML = '<option value="">Product</option>' +
      names.map((n) => `<option>${Hours.esc(n)}</option>`).join("");
  }

  function matchesEdp(edp) {
    const q = (els.search.value || "").trim().toLowerCase();
    const st = els.status.value;
    const prod = els.product.value;
    if (els.active.checked && !edp.active) return false;
    if (st && Hours.health(edp) !== st) return false;
    if (prod && edp.productLabel !== prod && !(edp.alsoIn || []).includes(prod)) return false;
    if (!q) return true;
    const hay = (edp.key + " " + edp.title + " " + (edp.productLabel || "")).toLowerCase();
    if (hay.includes(q)) return true;
    return (edp.children || []).some((e) => (e.key + " " + e.title).toLowerCase().includes(q));
  }

  function select(kind, key) {
    selected = { kind, key };
    setHash(key);
    renderNav();
    renderPane();
  }

  function renderNav() {
    if (view === "milestone") {
      renderMilestoneNav();
      return;
    }
    const edps = Hours.uniqueEdps().filter(matchesEdp);
    const hours = edps.reduce((s, e) => s + Number((e.time || {}).uniqueSpentHours || 0), 0);
    els.navMeta.textContent = edps.length + " · " + Hours.fmtNum(hours);
    const byProd = {};
    edps.forEach((e) => {
      const p = e.productLabel || "—";
      (byProd[p] ||= []).push(e);
    });
    const html = Object.keys(byProd).sort().map((p) => {
      const list = byProd[p];
      const h = list.reduce((s, e) => s + Number((e.time || {}).uniqueSpentHours || 0), 0);
      const rows = list.map((e) => {
        const on = selected.kind === "edp" && selected.key === e.key;
        const health = Hours.health(e);
        return `<button type="button" class="nav-edp${on ? " is-on" : ""}" data-kind="edp" data-key="${Hours.esc(e.key)}">
          <span class="nav-edp-k">${Hours.esc(e.key)}</span>
          <span class="nav-edp-t">${Hours.esc(e.title)}</span>
          <span class="nav-edp-h mono">${Hours.fmtNum((e.time || {}).uniqueSpentHours)}</span>
          <span class="nav-edp-st st-${Hours.esc(health)}"></span>
        </button>`;
      }).join("");
      return `<div class="nav-prod">
        <div class="nav-prod-h"><span>${Hours.esc(p)}</span><span class="mono">${Hours.fmtNum(h)}</span></div>
        ${rows}
      </div>`;
    }).join("");
    els.nav.innerHTML = html || `<div class="empty-mini">—</div>`;
  }

  function renderMilestoneNav() {
    const ms = Hours.tree().milestones || [];
    const q = (els.search.value || "").trim().toLowerCase();
    els.navMeta.textContent = "M1–M4";
    els.nav.innerHTML = ms.map((m) => {
      const epps = (m.children || []).filter((e) => {
        if (!q) return true;
        return (e.key + " " + e.title).toLowerCase().includes(q);
      });
      const rows = epps.map((e) => {
        const on = selected.kind === "epp" && selected.key === e.key;
        return `<button type="button" class="nav-edp${on ? " is-on" : ""}" data-kind="epp" data-key="${Hours.esc(e.key)}">
          <span class="nav-edp-k">${Hours.esc(e.key)}</span>
          <span class="nav-edp-t">${Hours.esc(e.title)}</span>
          <span class="nav-edp-h mono">${Hours.fmtNum((e.time || {}).rolledSpentHours)}</span>
          <span class="nav-edp-st"></span>
        </button>`;
      }).join("");
      return `<div class="nav-prod">
        <div class="nav-prod-h">
          <span>${Hours.esc(m.key)} ${Hours.esc(m.name || m.title)}</span>
          <span class="mono">${Hours.fmtNum(m.uniqueSpentHours)}</span>
        </div>
        ${rows}
      </div>`;
    }).join("");
  }

  function renderPane() {
    if (selected.kind === "edp") {
      const edp = Hours.findEdp(selected.key);
      els.pane.innerHTML = edp
        ? Record.edpView(edp, { open, mappingHref: "mapping.html#" + encodeURIComponent(edp.key) })
        : `<div class="empty-mini">—</div>`;
      return;
    }
    if (selected.kind === "epp") {
      const epp = Hours.findEpp(selected.key);
      if (!epp) {
        els.pane.innerHTML = `<div class="empty-mini">—</div>`;
        return;
      }
      els.pane.innerHTML = Record.eppView(epp, { open });
      return;
    }
    pickDefault();
  }

  function pickDefault() {
    if (view === "milestone") {
      const first = ((Hours.tree().milestones || [])[0] || {}).children || [];
      if (first[0]) select("epp", first[0].key);
      else els.pane.innerHTML = `<div class="empty-mini">—</div>`;
      return;
    }
    const list = Hours.uniqueEdps().filter(matchesEdp);
    const first = list.find((e) => (e.children || []).length) || list[0];
    if (first) select("edp", first.key);
    else els.pane.innerHTML = `<div class="empty-mini">—</div>`;
  }

  function applyHash() {
    const key = hashKey();
    if (!key) return false;
    if (key.indexOf("EDP-") === 0 && Hours.findEdp(key)) {
      view = "product";
      els.view.value = "product";
      localStorage.setItem(LS_VIEW, view);
      select("edp", key);
      return true;
    }
    if (key.indexOf("EPP-") === 0 && Hours.findEpp(key)) {
      const owners = Hours.edpsForEpp(key);
      if (view !== "milestone" && owners[0]) {
        view = "product";
        els.view.value = "product";
        open.add("epp:" + key);
        select("edp", owners[0].key);
        return true;
      }
      view = "milestone";
      els.view.value = "milestone";
      localStorage.setItem(LS_VIEW, view);
      select("epp", key);
      return true;
    }
    return false;
  }

  function syncChrome() {
    const ms = view === "milestone";
    els.product.disabled = ms;
    els.status.disabled = ms;
    els.active.disabled = ms;
  }

  els.view.addEventListener("change", () => {
    view = els.view.value;
    localStorage.setItem(LS_VIEW, view);
    selected = { kind: null, key: null };
    open.clear();
    syncChrome();
    renderNav();
    renderPane();
  });
  [els.search, els.status, els.product, els.active].forEach((el) => {
    el.addEventListener("input", () => { renderNav(); });
    el.addEventListener("change", () => { renderNav(); });
  });

  Record.bindToggle(els.pane, open, renderPane);

  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-kind][data-key]");
    if (!btn) return;
    if (!els.nav.contains(btn) && !els.pane.contains(btn)) return;
    const kind = btn.getAttribute("data-kind");
    const key = btn.getAttribute("data-key");
    if (kind === "edp") {
      view = "product";
      els.view.value = "product";
      localStorage.setItem(LS_VIEW, view);
      syncChrome();
      select("edp", key);
    } else if (kind === "epp") {
      select("epp", key);
    }
  });

  window.addEventListener("hashchange", () => applyHash());

  fillProducts();
  els.view.value = view;
  syncChrome();
  if (!applyHash()) {
    renderNav();
    renderPane();
  }
})();
