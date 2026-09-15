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
    return decodeURIComponent((location.hash || "").replace(/^#/, "")).trim();
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

  function edpId(edp) {
    return edp.key || edp.title || "";
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
    els.navMeta.textContent = String(edps.length);
    const byProd = {};
    edps.forEach((e) => {
      const p = e.productLabel || "—";
      (byProd[p] ||= []).push(e);
    });
    const html = Object.keys(byProd).sort().map((p) => {
      const list = byProd[p];
      const h = list.reduce((s, e) => s + Number((e.time || {}).uniqueSpentHours || 0), 0);
      const rows = list.map((e) => {
        const on = selected.kind === "edp" && selected.key === edpId(e);
        const health = Hours.health(e);
        return `<button type="button" class="nav-edp${on ? " is-on" : ""}" data-kind="edp" data-key="${Hours.esc(edpId(e))}">
          <span class="nav-edp-k">${Hours.esc(e.key || "—")}</span>
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
        ? Record.edpView(edp, { open, mappingHref: "mapping.html#" + encodeURIComponent(edpId(edp)) })
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

  function visibleEdps() {
    return Hours.uniqueEdps().filter(matchesEdp);
  }

  function visibleEpps() {
    const q = (els.search.value || "").trim().toLowerCase();
    const out = [];
    (Hours.tree().milestones || []).forEach((m) => {
      (m.children || []).forEach((e) => {
        if (!q || (e.key + " " + e.title).toLowerCase().includes(q)) out.push(e);
      });
    });
    return out;
  }

  function pickDefault() {
    if (view === "milestone") {
      const first = visibleEpps()[0];
      if (first) select("epp", first.key);
      else els.pane.innerHTML = `<div class="empty-mini">—</div>`;
      return;
    }
    const list = visibleEdps();
    const first = list.find((e) => (e.children || []).length) || list[0];
    if (first) select("edp", edpId(first));
    else els.pane.innerHTML = `<div class="empty-mini">—</div>`;
  }

  function keepVisible() {
    if (view === "milestone") {
      const keys = visibleEpps().map((e) => e.key);
      if (selected.kind === "epp" && keys.indexOf(selected.key) >= 0) {
        renderNav();
        return;
      }
      if (keys[0]) select("epp", keys[0]);
      else { selected = { kind: null, key: null }; renderNav(); renderPane(); }
      return;
    }
    const ids = visibleEdps().map(edpId);
    if (selected.kind === "edp" && ids.indexOf(selected.key) >= 0) {
      renderNav();
      return;
    }
    pickDefault();
  }

  function applyHash() {
    const key = hashKey();
    if (!key) return false;
    const edp = Hours.findEdp(key);
    if (edp) {
      view = "product";
      els.view.value = "product";
      localStorage.setItem(LS_VIEW, view);
      syncChrome();
      select("edp", edpId(edp));
      return true;
    }
    if (Hours.findEpp(key)) {
      if (view === "milestone") {
        syncChrome();
        select("epp", key);
        return true;
      }
      const owners = Hours.edpsForEpp(key);
      if (owners[0]) {
        view = "product";
        els.view.value = "product";
        open.add("epp:" + key);
        select("edp", edpId(owners[0]));
        return true;
      }
      view = "milestone";
      els.view.value = "milestone";
      localStorage.setItem(LS_VIEW, view);
      syncChrome();
      select("epp", key);
      return true;
    }
    return false;
  }

  function syncChrome() {
    const ms = view === "milestone";
    els.product.hidden = ms;
    els.status.hidden = ms;
    const activeLabel = els.active.closest("label");
    if (activeLabel) activeLabel.hidden = ms;
    els.active.hidden = ms;
    els.product.disabled = ms;
    els.status.disabled = ms;
    els.active.disabled = ms;
  }

  function relatedEpp(edpKey) {
    const edp = Hours.findEdp(edpKey);
    const kid = ((edp && edp.children) || [])[0];
    return kid ? kid.key : "";
  }

  els.view.addEventListener("change", () => {
    const prev = selected;
    view = els.view.value;
    localStorage.setItem(LS_VIEW, view);
    open.clear();
    syncChrome();
    if (view === "milestone" && prev.kind === "edp") {
      const eppKey = relatedEpp(prev.key);
      if (eppKey) { select("epp", eppKey); return; }
    }
    if (view === "product" && prev.kind === "epp") {
      const owners = Hours.edpsForEpp(prev.key);
      if (owners[0]) { select("edp", edpId(owners[0])); return; }
    }
    selected = { kind: null, key: null };
    renderNav();
    renderPane();
  });
  [els.search, els.status, els.product, els.active].forEach((el) => {
    el.addEventListener("input", keepVisible);
    el.addEventListener("change", keepVisible);
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
