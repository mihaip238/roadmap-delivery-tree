(function () {
  const overlay = {
    version: 1,
    updatedAt: null,
    links: [],
  };
  const open = new Set();
  let selected = "";
  let dirty = false;
  let writer = false;

  const els = {
    search: document.getElementById("map-search"),
    status: document.getElementById("map-status"),
    product: document.getElementById("map-product"),
    nav: document.getElementById("nav-list"),
    navMeta: document.getElementById("nav-meta"),
    pane: document.getElementById("record-pane"),
    statusEl: document.getElementById("status"),
    save: document.getElementById("save"),
    download: document.getElementById("download"),
  };

  function setStatus(msg, kind) {
    els.statusEl.textContent = msg || "";
    els.statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function idx() {
    const m = new Map();
    overlay.links.forEach((row, i) => m.set(row.edp + "|" + row.epp, i));
    return m;
  }

  function upsert(edp, epp, action, extra) {
    const key = edp + "|" + epp;
    const map = idx();
    const row = Object.assign({
      edp, epp, action,
      source: (extra && extra.source) || "mapping",
      note: (extra && extra.note) || "",
      updatedAt: new Date().toISOString(),
    }, extra || {});
    if (map.has(key)) overlay.links[map.get(key)] = Object.assign({}, overlay.links[map.get(key)], row);
    else overlay.links.push(row);
    dirty = true;
    overlay.updatedAt = row.updatedAt;
  }

  function catalogKeys() {
    return new Set(Hours.eppCatalog().map((e) => e.key));
  }

  function ownersOf(eppKey) {
    const owners = [];
    Hours.uniqueEdps().forEach((edp) => {
      (edp.children || []).forEach((e) => {
        if (e.key === eppKey && e.costMember) owners.push(edp.key);
      });
    });
    overlay.links.forEach((row) => {
      if (row.epp === eppKey && row.action !== "reject" && owners.indexOf(row.edp) < 0) owners.push(row.edp);
    });
    return owners;
  }

  function fillProducts() {
    const names = (Hours.tree().products || []).map((p) => p.name);
    els.product.innerHTML = '<option value="">Product</option>' +
      names.map((n) => `<option>${Hours.esc(n)}</option>`).join("");
  }

  function matches(edp) {
    if (!edp.active) return false;
    const q = (els.search.value || "").trim().toLowerCase();
    const st = els.status.value;
    const prod = els.product.value;
    const h = Hours.health(edp);
    if (st === "inbox") {
      if (!(h === "pending" || h === "none" || Hours.pendingChildren(edp).length)) return false;
    } else if (st && h !== st) return false;
    if (prod && edp.productLabel !== prod) return false;
    if (!q) return true;
    const hay = (edp.key + " " + edp.title).toLowerCase();
    if (hay.includes(q)) return true;
    return (edp.children || []).some((e) => (e.key + " " + e.title).toLowerCase().includes(q));
  }

  function actions(edp) {
    return function (epp) {
      const method = epp.method || "";
      if (method === "inferred_pending") {
        return `<button type="button" data-act="confirm" data-epp="${Hours.esc(epp.key)}">Confirm</button>
                <button type="button" class="danger" data-act="reject" data-epp="${Hours.esc(epp.key)}">Reject</button>`;
      }
      if (method === "rejected") {
        return `<button type="button" data-act="confirm" data-epp="${Hours.esc(epp.key)}">Restore</button>`;
      }
      if (epp.costMember) {
        return `<button type="button" class="danger" data-act="reject" data-epp="${Hours.esc(epp.key)}">Reject</button>`;
      }
      return "";
    };
  }

  function renderNav() {
    const edps = Hours.uniqueEdps().filter(matches);
    els.navMeta.textContent = String(edps.length);
    els.nav.innerHTML = edps.map((e) => {
      const on = (e.key || e.title) === selected;
      return `<button type="button" class="nav-edp${on ? " is-on" : ""}" data-edp="${Hours.esc(e.key || e.title)}">
        <span class="nav-edp-k">${Hours.esc(e.key || "—")}</span>
        <span class="nav-edp-t">${Hours.esc(e.title)}</span>
        <span class="nav-edp-h mono">${Hours.fmtNum((e.time || {}).uniqueSpentHours)}</span>
        <span class="nav-edp-st st-${Hours.esc(Hours.health(e))}"></span>
      </button>`;
    }).join("") || `<div class="empty-mini">—</div>`;
  }

  function renderPane() {
    const edp = Hours.findEdp(selected);
    if (!edp) {
      els.pane.innerHTML = `<div class="empty-mini">—</div>`;
      return;
    }
    els.pane.innerHTML = Record.edpView(edp, {
      open,
      actions: actions(edp),
      afterHead: `<div class="add-row">
        <input type="text" id="addKey" placeholder="EPP-311" autocomplete="off" />
        <button type="button" id="addBtn">Add</button>
      </div>`,
    });
  }

  function select(key) {
    selected = key;
    if (key) history.replaceState(null, "", "#" + encodeURIComponent(key));
    renderNav();
    renderPane();
  }

  function applyAct(edp, epp, act) {
    if (act === "confirm" && (Hours.rejectedChildren(edp).some((e) => e.key === epp) || Hours.costChildren(edp).some((e) => e.key === epp))) {
      const existing = (edp.children || []).find((e) => e.key === epp);
      const origin = (existing && existing.sourceMethod) || "";
      if (origin.indexOf("polaris") === 0) {
        overlay.links = overlay.links.filter((r) => !(r.edp === edp.key && r.epp === epp && r.action === "reject"));
        dirty = true;
      } else {
        upsert(edp.key, epp, "confirm", { source: "inbox" });
      }
    } else {
      upsert(edp.key, epp, act, { source: act === "confirm" ? "inbox" : "mapping" });
    }
    setStatus("Unsaved", "warn");
    renderPane();
  }

  function payload() {
    return {
      version: 1,
      updatedAt: overlay.updatedAt,
      links: overlay.links,
    };
  }

  async function save() {
    const data = payload();
    if (writer) {
      try {
        await Save.post("/overlay", data);
        dirty = false;
        setStatus("Saved", "ok");
        location.reload();
        return;
      } catch (err) {
        setStatus("Failed", "warn");
      }
    }
    Save.download("overlay_links.json", data);
    setStatus("Downloaded", "ok");
  }

  els.nav.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-edp]");
    if (btn) select(btn.getAttribute("data-edp"));
  });

  els.pane.addEventListener("click", (ev) => {
    const addBtn = ev.target.closest("#addBtn");
    if (addBtn) {
      const edp = Hours.findEdp(selected);
      if (!edp) return;
      const raw = ((document.getElementById("addKey") || {}).value || "").trim().toUpperCase();
      if (!/^EPP-\d+$/.test(raw)) return;
      if (!catalogKeys().has(raw)) return;
      upsert(edp.key, raw, "add", { source: "mapping" });
      setStatus("Unsaved", "warn");
      renderPane();
      return;
    }
    const btn = ev.target.closest("[data-act]");
    if (!btn) return;
    const edp = Hours.findEdp(selected);
    if (!edp) return;
    applyAct(edp, btn.getAttribute("data-epp"), btn.getAttribute("data-act"));
  });

  Record.bindToggle(els.pane, open, renderPane);

  [els.search, els.status, els.product].forEach((el) => {
    el.addEventListener("input", renderNav);
    el.addEventListener("change", renderNav);
  });

  els.save.addEventListener("click", save);
  els.download.addEventListener("click", () => {
    Save.download("overlay_links.json", payload());
    setStatus("Downloaded", "ok");
  });

  window.addEventListener("hashchange", () => {
    const h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    if (Hours.findEdp(h)) select(h);
  });

  window.addEventListener("beforeunload", (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });

  async function boot() {
    writer = await Save.available();
    fillProducts();
    try {
      const r = await fetch("jira_map/overlay_links.json", { cache: "no-store" });
      if (r.ok) {
        const blob = await r.json();
        overlay.version = blob.version || 1;
        overlay.updatedAt = blob.updatedAt || null;
        overlay.links = blob.links || (Array.isArray(blob) ? blob : []);
      }
    } catch (e) { /* empty overlay */ }
    const hash = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    if (hash && Hours.findEdp(hash)) {
      selected = hash;
      els.status.value = "";
    } else {
      const list = Hours.uniqueEdps().filter(matches);
      const first = list.find((e) => (e.children || []).length) || list[0];
      selected = first ? first.key : "";
    }
    renderNav();
    renderPane();
  }

  boot();
})();
