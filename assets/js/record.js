(function () {
  const JIRA = (window.ROADMAP_TREE && window.ROADMAP_TREE.jiraBase) || "https://eneve.atlassian.net/browse/";

  function esc(s) { return Hours.esc(s); }

  function hrefOf(node) {
    if (node.url) return node.url;
    if (node.key && /^[A-Z][A-Z0-9]+-\d+$/.test(node.key)) return JIRA + node.key;
    return "";
  }

  function keyLink(node) {
    if (!node || !node.key) return "";
    const href = hrefOf(node);
    return href
      ? `<a class="key" href="${esc(href)}" target="_blank" rel="noreferrer">${esc(node.key)}</a>`
      : `<span class="key">${esc(node.key)}</span>`;
  }

  function chip(type) {
    const label = { edp: "EDP", epp: "EPP", feature: "FTR", story: "STY", milestone: "MS", product: "PL" }[type] || type;
    return `<span class="chip chip-${esc(type)}">${esc(label)}</span>`;
  }

  function num(n, dashZero) {
    if (n == null || n === "") return "—";
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    if (dashZero && x === 0) return "—";
    return Hours.fmtNum(x);
  }

  function loggedHours(node) {
    const t = node.time || {};
    if (t.rolledSpentHours != null) return Number(t.rolledSpentHours) || 0;
    if (t.ownSpentHours != null) return Number(t.ownSpentHours) || 0;
    return 0;
  }

  function costHours(node) {
    if (node.type === "epp" && node.costMember === false) return null;
    if (node.type === "edp") return Number((node.time || {}).uniqueSpentHours) || 0;
    return loggedHours(node);
  }

  function status(node) {
    return node.status || "";
  }

  function bar(value, max) {
    const v = Number(value) || 0;
    const m = Number(max) || 0;
    const pct = m > 0 ? Math.min(100, (v / m) * 100) : 0;
    return `<div class="hbare" aria-hidden="true"><i style="width:${pct}%"></i></div>`;
  }

  function methodMark(epp) {
    const m = epp.method || "";
    if (!m) return "";
    const short = m.replace("inferred_pending", "inferred").replace("inferred_alias", "inferred");
    return `<span class="meth">${esc(short)}</span>`;
  }

  function storyLine(st) {
    return `<div class="line line-story">
      ${chip("story")}
      ${keyLink(st)}
      <span class="line-title">${esc(st.title || "")}</span>
      <span class="pill">${esc(status(st))}</span>
      <span class="qty"></span>
      <span class="hrs dim">—</span>
      <span class="hrs">${esc(num(loggedHours(st)))}</span>
      <span class="unit-act"></span>
    </div>`;
  }

  function featureBlock(feat, openSet) {
    const id = "feat:" + (feat.key || feat.title);
    const open = openSet && openSet.has(id);
    const kids = feat.children || [];
    const n = kids.length;
    return `<article class="unit unit-feat" data-unit="${esc(id)}">
      <header class="unit-h" data-toggle="${esc(id)}">
        ${chip("feature")}
        ${keyLink(feat)}
        <span class="line-title">${esc(feat.title || "")}</span>
        <span class="pill">${esc(status(feat) || feat.issuetype || "")}</span>
        <span class="qty">${n ? esc(String(n)) : ""}</span>
        <span class="hrs dim">—</span>
        <span class="hrs">${esc(num(loggedHours(feat)))}</span>
        <span class="unit-act"></span>
      </header>
      ${bar(loggedHours(feat), openSet && openSet.maxHours)}
      ${open && n ? `<div class="unit-b">${kids.map(storyLine).join("")}</div>` : ""}
    </article>`;
  }

  function eppBlock(epp, openSet, actionsFn) {
    const id = "epp:" + (epp.key || epp.title);
    const open = openSet && openSet.has(id);
    const pending = epp.method === "inferred_pending" || (epp.costMember === false && epp.method !== "rejected");
    const rejected = epp.method === "rejected";
    const feats = epp.children || [];
    const cost = costHours(epp);
    const logged = loggedHours(epp);
    const shared = ((epp.time || {}).sharedWith || []).filter(Boolean);
    const act = actionsFn ? actionsFn(epp) : "";
    const cls = ["unit", "unit-epp", pending ? "is-pending" : "", rejected ? "is-rejected" : ""].filter(Boolean).join(" ");
    const f = Number(epp.featureCount || feats.length || 0);
    const s = Number(epp.storyCount || 0);
    const qtyLabel = (f || s) ? (f + "/" + s) : "";
    return `<article class="${cls}" data-unit="${esc(id)}">
      <header class="unit-h" data-toggle="${esc(id)}">
        ${chip("epp")}
        ${keyLink(epp)}
        <span class="line-title">${esc(epp.title || "")}</span>
        <span class="meta-bits">
          <span class="pill">${esc(status(epp))}</span>
          ${methodMark(epp)}
          ${shared.length ? `<span class="pill warn">${esc(shared.join(" "))}</span>` : ""}
        </span>
        <span class="qty">${esc(qtyLabel)}</span>
        <span class="hrs ${cost == null ? "dim" : ""}">${esc(cost == null ? "—" : num(cost))}</span>
        <span class="hrs">${esc(num(logged))}</span>
        <span class="unit-act">${act}</span>
      </header>
      ${bar(logged, openSet && openSet.maxHours)}
      ${open && feats.length ? `<div class="unit-b">${feats.map((feat) => featureBlock(feat, openSet)).join("")}</div>` : ""}
    </article>`;
  }

  function cols() {
    return `<div class="unit-cols">
      <span>Type</span><span>Key</span><span></span><span></span><span>F/S</span><span>Cost</span><span>Logged</span><span></span>
    </div>`;
  }

  function edpHead(edp, extra) {
    const t = edp.time || {};
    const cost = Number(t.uniqueSpentHours) || 0;
    const logged = Number(t.rolledSpentHours) || 0;
    const env = Hours.envelope(cost, edp.budgetHours);
    const health = Hours.health(edp);
    return `<header class="record-head">
      <div class="record-id">
        ${chip("edp")}
        ${keyLink(edp)}
        <span class="pip st-${esc(health)}"></span>
        ${edp.roadmap ? `<span class="pill">${esc(edp.roadmap)}</span>` : ""}
        ${edp.status ? `<span class="pill">${esc(edp.status)}</span>` : ""}
        ${edp.productLabel ? `<span class="soft">${esc(edp.productLabel)}</span>` : ""}
        ${(edp.alsoIn || []).map((p) => `<span class="soft">${esc(p)}</span>`).join("")}
        ${extra || ""}
      </div>
      <h1>${esc(edp.title || "")}</h1>
      <div class="metrics">
        <div class="metric"><b>${esc(num(cost))}</b><span>Cost</span></div>
        <div class="metric"><b>${esc(num(logged))}</b><span>Logged</span></div>
        <div class="metric"><b>${esc(env.unbudgeted ? "—" : num(env.budget))}</b><span>Budget</span></div>
        <div class="metric${env.remaining != null && env.remaining < 0 ? " is-over" : ""}"><b>${esc(env.unbudgeted ? "—" : num(env.remaining))}</b><span>Left</span></div>
      </div>
    </header>`;
  }

  function primed(openSet) {
    return openSet._primed || (openSet._primed = {});
  }

  function ensureOpen(edp, openSet) {
    const epps = edp.children || [];
    if (!epps.length) return;
    const seen = primed(openSet);
    if (seen["edp:" + (edp.key || edp.title)]) return;
    seen["edp:" + (edp.key || edp.title)] = true;
    const first = epps[0];
    openSet.add("epp:" + first.key);
    const feat = (first.children || [])[0];
    if (feat) openSet.add("feat:" + (feat.key || feat.title));
  }

  function edpView(edp, opts) {
    opts = opts || {};
    const openSet = opts.open || new Set();
    ensureOpen(edp, openSet);
    const epps = edp.children || [];
    openSet.maxHours = epps.reduce((m, e) => Math.max(m, loggedHours(e)), 0);
    const cost = Hours.costChildren(edp);
    const pending = Hours.pendingChildren(edp);
    const rejected = Hours.rejectedChildren(edp);
    const ordered = cost.concat(pending, rejected);
    const extra = opts.mappingHref
      ? `<a class="soft-link" href="${esc(opts.mappingHref)}">Mapping</a>`
      : "";
    if (!ordered.length) {
      return edpHead(edp, extra) + (opts.afterHead || "") + `<div class="empty-mini">—</div>`;
    }
    return edpHead(edp, extra) + (opts.afterHead || "") + cols() + ordered.map((e) => eppBlock(e, openSet, opts.actions)).join("");
  }

  function eppView(epp, opts) {
    opts = opts || {};
    const openSet = opts.open || new Set();
    const feats = epp.children || [];
    openSet.maxHours = feats.reduce((m, f) => Math.max(m, loggedHours(f)), 0);
    const seen = primed(openSet);
    if (feats[0] && !seen["eppview:" + (epp.key || "")]) {
      seen["eppview:" + (epp.key || "")] = true;
      openSet.add("feat:" + (feats[0].key || feats[0].title));
    }
    const logged = loggedHours(epp);
    const parents = (epp.onEdps || []).map((k) =>
      `<a class="chip-btn" href="delivery.html#${esc(k)}">${esc(k)}</a>`
    ).join("");
    const products = (epp.products || []).map((p) => `<span class="soft">${esc(p)}</span>`).join("");
    return `<header class="record-head">
      <div class="record-id">
        ${chip("epp")}
        ${keyLink(epp)}
        <span class="pill">${esc(status(epp))}</span>
        ${methodMark(epp)}
        ${products}
        ${parents}
      </div>
      <h1>${esc(epp.title || "")}</h1>
      <div class="metrics">
        <div class="metric"><b>${esc(num(logged))}</b><span>Logged</span></div>
        <div class="metric"><b>${esc(String(epp.featureCount || feats.length || 0))}</b><span>Features</span></div>
        <div class="metric"><b>${esc(String(epp.storyCount || 0))}</b><span>Stories</span></div>
      </div>
    </header>` + cols() + feats.map((f) => featureBlock(f, openSet)).join("");
  }

  function bindToggle(root, openSet, redraw) {
    root.addEventListener("click", (ev) => {
      if (ev.target.closest("a, button, input, select, textarea")) return;
      const h = ev.target.closest("[data-toggle]");
      if (!h || !root.contains(h)) return;
      const id = h.getAttribute("data-toggle");
      if (!id) return;
      if (openSet.has(id)) openSet.delete(id);
      else openSet.add(id);
      redraw();
    });
  }

  window.Record = {
    keyLink, chip, num, loggedHours, costHours, edpView, eppView, eppBlock, featureBlock, bindToggle, ensureOpen,
  };
})();
