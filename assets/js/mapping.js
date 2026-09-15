(function () {
  const overlay = {
    version: 1,
    updatedAt: null,
    links: [],
  };
  let selected = "";
  let dirty = false;
  let writer = false;

  const statusEl = document.getElementById("status");

  function setStatus(msg, kind) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (kind ? " " + kind : "");
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

  function actionFor(edp, epp) {
    const i = idx().get(edp + "|" + epp);
    return i == null ? null : overlay.links[i];
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

  function paintLists() {
    const q = (document.getElementById("q").value || "").trim().toLowerCase();
    const rows = Hours.uniqueEdps().filter((e) => e.active);
    function match(e) {
      if (!q) return true;
      return (e.key + " " + e.title).toLowerCase().includes(q);
    }
    const inbox = rows.filter((e) => {
      if (!match(e)) return false;
      const h = Hours.health(e);
      return h === "pending" || h === "none" || Hours.pendingChildren(e).length;
    });
    function item(e) {
      const active = e.key === selected ? " active" : "";
      return `<button type="button" class="inbox-item${active}" data-edp="${Hours.esc(e.key)}">
        <span class="key">${Hours.esc(e.key)}</span> ${Hours.esc(e.title)}
        <div class="muted">${Hours.esc(Hours.health(e))} · ${Hours.esc(e.roadmap || "")} · ${Hours.fmtHours((e.time || {}).uniqueSpentHours)} unique</div>
      </button>`;
    }
    document.getElementById("inbox").innerHTML = inbox.length
      ? inbox.map(item).join("")
      : `<p class="muted">Inbox is empty for this filter.</p>`;
    document.getElementById("all").innerHTML = rows.filter(match).map(item).join("");
  }

  function paintInspector() {
    const el = document.getElementById("inspector");
    const edp = Hours.findEdp(selected);
    if (!edp) {
      el.innerHTML = `<p class="muted">Select an EDP.</p>`;
      return;
    }
    const cost = Hours.costChildren(edp);
    const pending = Hours.pendingChildren(edp);
    const rejected = Hours.rejectedChildren(edp);
    function eppLine(e, buttons) {
      const act = actionFor(edp.key, e.key);
      const owners = ownersOf(e.key).filter((k) => k !== edp.key);
      const share = owners.length ? `<div class="copper">Already on ${Hours.esc(owners.join(", "))}</div>` : "";
      return `<li>
        <span class="key">${Hours.esc(e.key)}</span> ${Hours.esc(e.title)}
        <div class="muted">${Hours.esc(e.method)}${act ? " · overlay " + Hours.esc(act.action) : ""}</div>
        ${share}
        <div class="actions">${buttons}</div>
      </li>`;
    }

    el.innerHTML = `
      <p class="kicker">${Hours.esc(edp.key)}</p>
      <h2>${Hours.esc(edp.title)}</h2>
      <p class="note">${Hours.fmtHours((edp.time || {}).uniqueSpentHours)} unique if confirmed · health ${Hours.esc(Hours.health(edp))}</p>
      <h3 class="kicker">Cost members</h3>
      ${cost.length ? `<ul>${cost.map((e) => eppLine(e,
        `<button type="button" class="danger" data-act="reject" data-epp="${Hours.esc(e.key)}">Reject</button>`
      )).join("")}</ul>` : `<p class="muted">None yet.</p>`}
      <h3 class="kicker">Pending inferred</h3>
      ${pending.length ? `<ul>${pending.map((e) => eppLine(e,
        `<button type="button" class="primary" data-act="confirm" data-epp="${Hours.esc(e.key)}">Confirm</button>
         <button type="button" class="danger" data-act="reject" data-epp="${Hours.esc(e.key)}">Reject</button>`
      )).join("")}</ul>` : `<p class="muted">None.</p>`}
      <h3 class="kicker">Rejected PolarIS (audit)</h3>
      ${rejected.length ? `<ul>${rejected.map((e) => eppLine(e,
        `<button type="button" data-act="confirm" data-epp="${Hours.esc(e.key)}">Restore</button>`
      )).join("")}</ul>` : `<p class="muted">None.</p>`}
      <h3 class="kicker">Add EPP</h3>
      <div class="actions">
        <input type="text" id="addKey" placeholder="EPP-311" />
        <button type="button" id="addBtn">Add</button>
      </div>
      <p class="note" id="addMsg"></p>
      <p class="note">PolarIS rows above stay as evidence. Reject excludes them from cost without writing Jira.</p>
    `;

    el.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const epp = btn.getAttribute("data-epp");
        const act = btn.getAttribute("data-act");
        if (act === "confirm" && (Hours.rejectedChildren(edp).some((e) => e.key === epp) || Hours.costChildren(edp).some((e) => e.key === epp))) {
          // restore rejected polaris: remove reject row, or confirm
          const existing = (edp.children || []).find((e) => e.key === epp);
          const origin = (existing && existing.sourceMethod) || "";
          if (origin.indexOf("polaris") === 0) {
            overlay.links = overlay.links.filter((r) => !(r.edp === edp.key && r.epp === epp && r.action === "reject"));
            dirty = true;
          } else {
            upsert(edp.key, epp, "confirm", { source: "inbox" });
          }
        } else {
          upsert(edp.key, epp, act === "restore" ? "confirm" : act, { source: act === "confirm" ? "inbox" : "mapping" });
        }
        setStatus("Unsaved overlay change.", "warn");
        paintInspector();
      });
    });
    const addBtn = document.getElementById("addBtn");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        const raw = (document.getElementById("addKey").value || "").trim().toUpperCase();
        const msg = document.getElementById("addMsg");
        if (!/^EPP-\d+$/.test(raw)) {
          msg.textContent = "Use a key like EPP-311.";
          return;
        }
        if (!catalogKeys().has(raw)) {
          msg.textContent = raw + " is not in the tree catalog. Refresh Jira fetch first.";
          return;
        }
        const others = ownersOf(raw).filter((k) => k !== edp.key);
        upsert(edp.key, raw, "add", { source: "mapping" });
        msg.textContent = others.length
          ? "Added. Warning: " + raw + " already implements " + others.join(", ") + "."
          : "Added " + raw + ". Save to rebuild cost.";
        setStatus("Unsaved overlay change.", "warn");
      });
    }
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
        setStatus("Saved. Reloading tree…", "ok");
        location.reload();
        return;
      } catch (err) {
        setStatus("Writer failed: " + err.message + " — downloading instead.", "warn");
      }
    }
    Save.download("overlay_links.json", data);
    setStatus("Downloaded overlay_links.json. Commit it, then run python apply_overlay.py.", "warn");
  }

  async function boot() {
    writer = await Save.available();
    setStatus(writer ? "Local writer is up." : "View / download only (start python serve.py to save).", writer ? "ok" : "warn");
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
    if (hash) selected = hash;
    paintLists();
    paintInspector();
  }

  document.getElementById("inbox").addEventListener("click", onPick);
  document.getElementById("all").addEventListener("click", onPick);
  function onPick(e) {
    const btn = e.target.closest("[data-edp]");
    if (!btn) return;
    selected = btn.getAttribute("data-edp") || "";
    history.replaceState(null, "", "#" + encodeURIComponent(selected));
    paintLists();
    paintInspector();
  }
  document.getElementById("q").addEventListener("input", paintLists);
  document.getElementById("save").addEventListener("click", save);
  document.getElementById("download").addEventListener("click", () => {
    Save.download("overlay_links.json", payload());
    setStatus("Downloaded overlay_links.json.", "ok");
  });

  boot();
})();
