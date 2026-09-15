(function () {
  const budgets = {
    version: 1,
    updatedAt: null,
    edps: {},
    products: {},
    milestones: {},
  };
  let writer = false;
  const statusEl = document.getElementById("status");

  function setStatus(msg, kind) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function parseHours(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (s === "") return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.round(n * 2) / 2;
  }

  function remainingCell(env) {
    if (env.unbudgeted) return "—";
    const cls = env.remaining < 0 ? "warn" : "";
    return `<span class="${cls}">${Hours.esc(Hours.fmtHours(env.remaining))}</span>`;
  }

  function pctCell(env) {
    if (env.unbudgeted) return "—";
    const cls = env.pct > 100 ? "warn" : "";
    return `<span class="${cls}">${Hours.esc(String(env.pct))}%</span>`;
  }

  function budgetInput(kind, key, value) {
    const v = value == null ? "" : value;
    return `<input type="number" min="0" step="0.5" data-kind="${Hours.esc(kind)}" data-key="${Hours.esc(key)}" value="${Hours.esc(v)}" />`;
  }

  function paintProducts() {
    const rows = Hours.productRows();
    document.getElementById("products").innerHTML = `<table class="data">
      <thead><tr><th>Product line</th><th class="num">Unique spent</th><th class="num">Budget</th><th class="num">Remaining</th><th class="num">Used</th></tr></thead>
      <tbody>${rows.map((r) => {
        const env = Hours.envelope(r.uniqueSpentHours, budgets.products[r.name] != null ? budgets.products[r.name] : r.budget);
        return `<tr>
          <td>${Hours.esc(r.name)}</td>
          <td class="num">${Hours.esc(Hours.fmtHours(r.uniqueSpentHours))}</td>
          <td class="num">${budgetInput("products", r.name, budgets.products[r.name])}</td>
          <td class="num">${remainingCell(env)}</td>
          <td class="num">${pctCell(env)}</td>
        </tr>`;
      }).join("")}</tbody></table>`;
  }

  function paintMilestones() {
    const rows = Hours.milestoneRows();
    document.getElementById("milestones").innerHTML = `<table class="data">
      <thead><tr><th>Milestone</th><th>Delivers</th><th class="num">Unique spent</th><th class="num">Budget</th><th class="num">Remaining</th><th class="num">Used</th></tr></thead>
      <tbody>${rows.map((r) => {
        const env = Hours.envelope(r.uniqueSpentHours, budgets.milestones[r.key] != null ? budgets.milestones[r.key] : r.budget);
        return `<tr>
          <td><span class="key">${Hours.esc(r.key)}</span></td>
          <td>${Hours.esc(r.name)} · ${Hours.esc(r.target || "")}</td>
          <td class="num">${Hours.esc(Hours.fmtHours(r.uniqueSpentHours))}</td>
          <td class="num">${budgetInput("milestones", r.key, budgets.milestones[r.key])}</td>
          <td class="num">${remainingCell(env)}</td>
          <td class="num">${pctCell(env)}</td>
        </tr>`;
      }).join("")}</tbody></table>`;
  }

  function paintEdps() {
    const q = (document.getElementById("q").value || "").trim().toLowerCase();
    const activeOnly = document.getElementById("activeOnly").checked;
    const rows = Hours.edpRows().filter((r) => {
      if (activeOnly && !r.active) return false;
      if (q && !(r.key + " " + r.title + " " + r.product).toLowerCase().includes(q)) return false;
      return true;
    });
    document.getElementById("edps").innerHTML = `<table class="data">
      <thead><tr><th>EDP</th><th>Product</th><th>Health</th><th class="num">Unique</th><th class="num">Rolled</th><th class="num">Budget</th><th class="num">Remaining</th><th>Shared</th></tr></thead>
      <tbody>${rows.map((r) => {
        const env = Hours.envelope(r.uniqueSpentHours, budgets.edps[r.key] != null ? budgets.edps[r.key] : r.budget);
        const shared = (r.sharedWith || []).length
          ? `<span class="copper">${Hours.esc(r.sharedWith.join(", "))}</span>`
          : "—";
        return `<tr>
          <td><a href="delivery.html#${Hours.esc(r.key)}"><span class="key">${Hours.esc(r.key)}</span></a> ${Hours.esc(r.title)}</td>
          <td>${Hours.esc(r.product)}${(r.alsoIn || []).length ? `<div class="muted">also ${Hours.esc(r.alsoIn.join(", "))}</div>` : ""}</td>
          <td><span class="health ${Hours.esc(r.health)}">${Hours.esc(r.health)}</span></td>
          <td class="num">${Hours.esc(Hours.fmtHours(r.uniqueSpentHours))}</td>
          <td class="num">${Hours.esc(Hours.fmtHours(r.rolledSpentHours))}</td>
          <td class="num">${budgetInput("edps", r.key, budgets.edps[r.key])}</td>
          <td class="num">${remainingCell(env)}</td>
          <td>${shared}</td>
        </tr>`;
      }).join("")}</tbody></table>`;
  }

  function readInputs() {
    document.querySelectorAll("input[data-kind]").forEach((inp) => {
      const kind = inp.getAttribute("data-kind");
      const key = inp.getAttribute("data-key");
      const n = parseHours(inp.value);
      if (n === undefined) return;
      if (n == null) delete budgets[kind][key];
      else budgets[kind][key] = n;
    });
  }

  function payload() {
    readInputs();
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      edps: budgets.edps,
      products: budgets.products,
      milestones: budgets.milestones,
    };
  }

  function paintAll() {
    paintProducts();
    paintMilestones();
    paintEdps();
  }

  function onBudgetChange(e) {
    const inp = e.target.closest("input[data-kind]");
    if (!inp) return;
    const n = parseHours(inp.value);
    if (n === undefined) {
      setStatus("Budgets must be hours ≥ 0 in 0.5 steps.", "warn");
      return;
    }
    const kind = inp.getAttribute("data-kind");
    const key = inp.getAttribute("data-key");
    if (n == null) delete budgets[kind][key];
    else budgets[kind][key] = n;
    paintAll();
    setStatus("Unsaved budget change.", "warn");
  }

  async function save() {
    const data = payload();
    data.updatedAt = new Date().toISOString();
    if (writer) {
      try {
        await Save.post("/budgets", data);
        setStatus("Saved. Reloading tree…", "ok");
        location.reload();
        return;
      } catch (err) {
        setStatus("Writer failed: " + err.message + " — downloading instead.", "warn");
      }
    }
    Save.download("overlay_budgets.json", data);
    setStatus("Downloaded overlay_budgets.json. Commit it, then run python apply_overlay.py.", "warn");
  }

  async function boot() {
    writer = await Save.available();
    setStatus(writer ? "Local writer is up." : "View / download only (start python serve.py to save).", writer ? "ok" : "warn");
    try {
      const r = await fetch("jira_map/overlay_budgets.json", { cache: "no-store" });
      if (r.ok) {
        const blob = await r.json();
        budgets.edps = blob.edps || {};
        budgets.products = blob.products || {};
        budgets.milestones = blob.milestones || {};
        budgets.updatedAt = blob.updatedAt || null;
      }
    } catch (e) { /* empty */ }
    paintAll();
  }

  document.getElementById("save").addEventListener("click", save);
  document.getElementById("download").addEventListener("click", () => {
    Save.download("overlay_budgets.json", payload());
    setStatus("Downloaded overlay_budgets.json.", "ok");
  });
  document.getElementById("activeOnly").addEventListener("change", paintAll);
  document.getElementById("q").addEventListener("input", paintAll);
  document.querySelector("main").addEventListener("change", onBudgetChange);

  boot();
})();
