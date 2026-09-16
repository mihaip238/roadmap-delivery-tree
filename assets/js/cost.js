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
    return `<span class="${cls}">${Hours.esc(Hours.fmtNum(env.remaining))}</span>`;
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
    const max = Hours.lineMaxHours();
    document.getElementById("products").innerHTML = `<table class="data">
      <thead><tr><th></th><th class="num">Cost</th><th class="num">Budget</th><th class="num">Left</th><th class="num">%</th></tr></thead>
      <tbody>${rows.map((r) => {
        const env = Hours.envelope(r.uniqueSpentHours, budgets.products[r.name] != null ? budgets.products[r.name] : r.budget);
        const zero = !(Number(r.uniqueSpentHours) > 0);
        return `<tr class="${zero ? "is-zero" : ""}">
          <td>
            <a class="line-name" href="${Hours.esc(Hours.lineHref(r.name))}">${Hours.esc(r.name)}</a>
            ${Hours.lineBar(r.uniqueSpentHours, max)}
          </td>
          <td class="num mono">${Hours.esc(Hours.fmtNum(r.uniqueSpentHours))}</td>
          <td class="num">${budgetInput("products", r.name, budgets.products[r.name])}</td>
          <td class="num mono">${remainingCell(env)}</td>
          <td class="num mono">${pctCell(env)}</td>
        </tr>`;
      }).join("")}</tbody></table>`;
  }

  function paintMilestones() {
    const rows = Hours.milestoneRows();
    document.getElementById("milestones").innerHTML = `<table class="data">
      <thead><tr><th></th><th></th><th class="num">Cost</th><th class="num">Budget</th><th class="num">Left</th><th class="num">%</th></tr></thead>
      <tbody>${rows.map((r) => {
        const env = Hours.envelope(r.uniqueSpentHours, budgets.milestones[r.key] != null ? budgets.milestones[r.key] : r.budget);
        return `<tr>
          <td class="mono">${Hours.esc(r.key)}</td>
          <td>${Hours.esc(r.name)}</td>
          <td class="num mono">${Hours.esc(Hours.fmtNum(r.uniqueSpentHours))}</td>
          <td class="num">${budgetInput("milestones", r.key, budgets.milestones[r.key])}</td>
          <td class="num mono">${remainingCell(env)}</td>
          <td class="num mono">${pctCell(env)}</td>
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
    const grouped = [];
    Hours.productRows().forEach((prod) => {
      const list = rows.filter((r) => r.product === prod.name);
      if (!list.length) return;
      grouped.push({ line: prod.name, rows: list });
    });
    document.getElementById("edps").innerHTML = grouped.map((g) => `
      <div class="pending-line-h cost-line">${Hours.esc(g.line)}</div>
      <table class="data">
      <thead><tr><th>EDP</th><th></th><th></th><th class="num">Cost</th><th class="num">Logged</th><th class="num">Budget</th><th class="num">Left</th><th></th></tr></thead>
      <tbody>${g.rows.map((r) => {
        const env = Hours.envelope(r.uniqueSpentHours, budgets.edps[r.key] != null ? budgets.edps[r.key] : r.budget);
        const shared = (r.sharedWith || []).length
          ? `<span class="copper">${Hours.esc(r.sharedWith.join(" "))}</span>`
          : "";
        const href = Hours.lineHref(r.product) + (r.key ? "#" + encodeURIComponent(r.key) : "");
        return `<tr>
          <td class="mono"><a href="${Hours.esc(href)}">${Hours.esc(r.key || "—")}</a></td>
          <td>${Hours.esc(r.title)}</td>
          <td><span class="pip st-${Hours.esc(r.health)}"></span></td>
          <td class="num mono">${Hours.esc(Hours.fmtNum(r.uniqueSpentHours))}</td>
          <td class="num mono muted">${Hours.esc(Hours.fmtNum(r.rolledSpentHours))}</td>
          <td class="num">${budgetInput("edps", r.key, budgets.edps[r.key])}</td>
          <td class="num mono">${remainingCell(env)}</td>
          <td>${shared}</td>
        </tr>`;
      }).join("")}</tbody></table>`).join("") || `<div class="empty-mini">—</div>`;
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
      setStatus("Unsaved", "warn");
      return;
    }
    const kind = inp.getAttribute("data-kind");
    const key = inp.getAttribute("data-key");
    if (n == null) delete budgets[kind][key];
    else budgets[kind][key] = n;
    paintAll();
    setStatus("Unsaved", "warn");
  }

  async function save() {
    const data = payload();
    data.updatedAt = new Date().toISOString();
    if (writer) {
      try {
        await Save.post("/budgets", data);
        setStatus("Saved", "ok");
        location.reload();
        return;
      } catch (err) {
        setStatus("Failed", "warn");
      }
    }
    Save.download("overlay_budgets.json", data);
    setStatus("Downloaded", "ok");
  }

  async function boot() {
    writer = await Save.available();
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
    setStatus("Downloaded", "ok");
  });
  document.getElementById("activeOnly").addEventListener("change", paintAll);
  document.getElementById("q").addEventListener("input", paintAll);
  document.querySelector("main").addEventListener("change", onBudgetChange);

  boot();
})();
