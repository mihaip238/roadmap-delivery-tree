(function () {
  const overlay = {
    version: 1,
    updatedAt: null,
    links: [],
  };
  const LS_LINE = "hours.delivery.line";
  const open = new Set();
  let selected = "";
  let line = "";
  let dirty = false;
  let writer = false;

  const els = {
    search: document.getElementById("map-search"),
    status: document.getElementById("map-status"),
    lineSwitch: document.getElementById("line-switch"),
    nav: document.getElementById("nav-list"),
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

  function persistLine() {
    localStorage.setItem(LS_LINE, line);
    const url = new URL(location.href);
    if (line) url.searchParams.set("line", line);
    else url.searchParams.delete("line");
    history.replaceState(null, "", url.pathname + url.search + (location.hash || ""));
  }

  function matches(edp) {
    if (!edp.active) return false;
    const q = (els.search.value || "").trim().toLowerCase();
    const st = els.status.value;
    const h = Hours.health(edp);
    if (st === "inbox") {
      if (!(h === "pending" || h === "none" || Hours.pendingChildren(edp).length)) return false;
    } else if (st && h !== st) return false;
    if (line && edp.productLabel !== line && !(edp.alsoIn || []).includes(line)) return false;
    if (!q) return true;
    const hay = (edp.key + " " + edp.title).toLowerCase();
    if (hay.includes(q)) return true;
    return (edp.children || []).some((e) => (e.key + " " + e.title).toLowerCase().includes(q));
  }

  function actions(edp) {
    return function (epp) {
      const method = epp.method || "";
      if (method === "inferred_pending") {
        return `<button type="button" class="primary" data-act="confirm" data-epp="${Hours.esc(epp.key)}">Confirm</button>
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

  function renderLineSwitch() {
    if (!line) {
      els.lineSwitch.hidden = true;
      els.lineSwitch.innerHTML = "";
      return;
    }
    els.lineSwitch.hidden = false;
    els.lineSwitch.innerHTML = `<button type="button" class="nav-back" data-back>
      <span aria-hidden="true">←</span>
      <span><small>Product line</small>${Hours.esc(line)}</span>
    </button>`;
  }

  function edpButton(e) {
    const on = (e.key || e.title) === selected;
    const jira = Hours.jiraHref(e);
    const key = jira
      ? `<a class="nav-edp-k" href="${Hours.esc(jira)}" target="_blank" rel="noreferrer">${Hours.esc(e.key || "—")}</a>`
      : `<span class="nav-edp-k">${Hours.esc(e.key || "—")}</span>`;
    return `<div class="nav-edp${on ? " is-on" : ""}" role="button" tabindex="0" data-edp="${Hours.esc(e.key || e.title)}">
      ${key}
      <span class="nav-edp-t">${Hours.esc(e.title)}</span>
      <span class="nav-edp-h mono">${Hours.fmtNum((e.time || {}).uniqueSpentHours)}</span>
      <span class="nav-edp-st st-${Hours.esc(Hours.health(e))}"></span>
    </div>`;
  }

  function renderNav() {
    const edps = Hours.uniqueEdps().filter(matches);
    if (line) {
      els.nav.innerHTML = edps.map(edpButton).join("") || `<div class="empty-mini">—</div>`;
      return;
    }
    const max = Hours.lineMaxHours();
    els.nav.innerHTML = Hours.productRows().map((prod) => {
      const list = edps.filter((e) => e.productLabel === prod.name || (e.alsoIn || []).includes(prod.name));
      if (!list || !list.length) return "";
      const zero = !(Number(prod.uniqueSpentHours) > 0);
      return `<button type="button" class="nav-root${zero ? " is-zero" : ""}" data-line="${Hours.esc(prod.name)}">
        <span class="nav-root-main">
          <span class="nav-root-name">${Hours.esc(prod.name)}</span>
          <span class="nav-root-count mono">${Hours.esc(String(list.length))}</span>
        </span>
        <span class="nav-root-cost mono">${Hours.esc(Hours.fmtNum(prod.uniqueSpentHours))}</span>
        ${Hours.lineBar(prod.uniqueSpentHours, max)}
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
    if (key) {
      const url = new URL(location.href);
      history.replaceState(null, "", url.pathname + url.search + "#" + encodeURIComponent(key));
    }
    renderLineSwitch();
    renderNav();
    renderPane();
  }

  function setLine(name) {
    line = name || "";
    selected = "";
    open.clear();
    persistLine();
    renderLineSwitch();
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
    if (ev.target.closest("a")) return;
    const lineBtn = ev.target.closest("[data-line]");
    if (lineBtn) {
      setLine(lineBtn.getAttribute("data-line") || "");
      return;
    }
    const btn = ev.target.closest("[data-edp]");
    if (btn) select(btn.getAttribute("data-edp"));
  });

  els.nav.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const btn = ev.target.closest("[data-edp]");
    if (!btn || ev.target.closest("a")) return;
    ev.preventDefault();
    select(btn.getAttribute("data-edp"));
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

  [els.search, els.status].forEach((el) => {
    el.addEventListener("input", () => { renderLineSwitch(); renderNav(); });
    el.addEventListener("change", () => { renderLineSwitch(); renderNav(); });
  });

  els.lineSwitch.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-back]")) setLine("");
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
    const q = new URLSearchParams(location.search).get("line");
    if (q != null) line = q;
    else line = localStorage.getItem(LS_LINE) || "";
    persistLine();
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
      const edp = Hours.findEdp(hash);
      if (edp && edp.productLabel && !new URLSearchParams(location.search).has("line")) {
        line = edp.productLabel;
        persistLine();
      }
    } else selected = "";
    renderLineSwitch();
    renderNav();
    renderPane();
  }

  boot();
})();
