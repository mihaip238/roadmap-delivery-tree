(function () {
  function esc(s) { return Hours.esc(s); }

  function hrefOf(node) {
    return Hours.jiraHref(node);
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
    if (!(v > 0) || !(m > 0)) return "";
    const pct = Math.min(100, (v / m) * 100);
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
      <span class="line-main">
        <span class="line-title">${esc(st.title || "")}</span>
        ${status(st) ? `<span class="row-meta">${esc(status(st))}</span>` : ""}
      </span>
      <span class="hrs hrs-cost dim">—</span>
      <span class="hrs hrs-log${loggedHours(st) ? "" : " dim"}">${esc(num(loggedHours(st)))}</span>
      <span class="hrs hrs-last${Hours.lastBookedOf(st) ? "" : " dim"}">${esc(Hours.lastBookedOf(st) || "—")}</span>
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
        <span class="line-main">
          <span class="line-title">${esc(feat.title || "")}</span>
          <span class="row-meta">${esc(status(feat) || feat.issuetype || "")}${n ? ` · ${esc(String(n))} STY` : ""}</span>
        </span>
        <span class="hrs hrs-cost dim">—</span>
        <span class="hrs hrs-log${loggedHours(feat) ? "" : " dim"}">${esc(num(loggedHours(feat)))}</span>
        <span class="hrs hrs-last${Hours.lastBookedOf(feat) ? "" : " dim"}">${esc(Hours.lastBookedOf(feat) || "—")}</span>
        <span class="unit-act"></span>
      </header>
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
    const details = [
      status(epp),
      (epp.method || "").replace("inferred_pending", "inferred").replace("inferred_alias", "inferred"),
      shared.length ? shared.join(" ") : "",
      (f || s) ? `${f} FTR · ${s} STY` : "",
    ].filter(Boolean);
    return `<article class="${cls}" data-unit="${esc(id)}">
      <header class="unit-h" data-toggle="${esc(id)}">
        ${chip("epp")}
        ${keyLink(epp)}
        <span class="line-main">
          <span class="line-title">${esc(epp.title || "")}</span>
          ${details.length ? `<span class="row-meta${pending ? " warn" : ""}">${esc(details.join(" · "))}</span>` : ""}
        </span>
        <span class="hrs hrs-cost${cost == null ? " dim" : ""}">${esc(cost == null ? "—" : num(cost))}</span>
        <span class="hrs hrs-log${logged ? "" : " dim"}">${esc(num(logged))}</span>
        <span class="hrs hrs-last${Hours.lastBookedOf(epp) ? "" : " dim"}">${esc(Hours.lastBookedOf(epp) || "—")}</span>
        <span class="unit-act">${act}</span>
      </header>
      ${open && feats.length ? `<div class="unit-b">${feats.map((feat) => featureBlock(feat, openSet)).join("")}</div>` : ""}
    </article>`;
  }

  function cols() {
    return `<div class="unit-cols">
      <span></span><span></span><span></span><span>Cost</span><span>Logged</span><span>Last booked</span><span></span>
    </div>`;
  }

  function edpHead(edp, extra) {
    const t = edp.time || {};
    const cost = Number(t.uniqueSpentHours) || 0;
    const logged = Number(t.rolledSpentHours) || 0;
    const health = Hours.health(edp);
    const lines = [edp.productLabel].concat(edp.alsoIn || []).filter(Boolean);
    const lineHtml = lines.length
      ? `<div class="record-line">${lines.map((n, i) =>
          `<a href="${esc(Hours.lineHref(n))}"${i ? ` class="is-also"` : ""}>${esc(n)}</a>`
        ).join("")}</div>`
      : "";
    return `<header class="record-head">
      ${lineHtml}
      <div class="record-id">
        ${chip("edp")}
        ${keyLink(edp)}
        <span class="pip st-${esc(health)}"></span>
        ${edp.roadmap ? `<span class="pill">${esc(edp.roadmap)}</span>` : ""}
        ${edp.status ? `<span class="pill">${esc(edp.status)}</span>` : ""}
        ${extra || ""}
      </div>
      <h1>${esc(edp.title || "")}</h1>
      <div class="metrics metrics-2">
        <div class="metric${cost > 0 ? " is-lead" : " is-quiet"}"><b>${esc(num(cost))}</b><span>Cost</span></div>
        <div class="metric${!(logged > 0) ? " is-quiet" : ""}"><b>${esc(num(logged))}</b><span>Logged</span></div>
        <div class="metric${Hours.lastBookedOf(edp) ? "" : " is-quiet"}"><b>${esc(Hours.lastBookedOf(edp) || "—")}</b><span>Last booked</span></div>
      </div>
    </header>`;
  }

  function edpView(edp, opts) {
    opts = opts || {};
    const openSet = opts.open || new Set();
    const epps = edp.children || [];
    openSet.maxHours = epps.reduce((m, e) => Math.max(m, loggedHours(e)), 0);
    const cost = Hours.costChildren(edp);
    const pending = Hours.pendingChildren(edp);
    const rejected = Hours.rejectedChildren(edp);
    const ordered = cost.concat(pending, rejected);
    const extra = [
      opts.reportHref ? `<a class="soft-link" href="${esc(opts.reportHref)}">Report</a>` : "",
      opts.mappingHref ? `<a class="soft-link" href="${esc(opts.mappingHref)}">Mapping</a>` : "",
    ].join("");
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
    const logged = loggedHours(epp);
    const lineHtml = (epp.products || []).length
      ? `<div class="record-line">${(epp.products || []).map((n) =>
          `<a href="${esc(Hours.lineHref(n))}">${esc(n)}</a>`
        ).join("")}</div>`
      : "";
    const parents = (epp.onEdps || []).map((k) => {
      const owner = Hours.findEdp(k);
      const href = Hours.lineHref(owner && owner.productLabel) + "#" + encodeURIComponent(k);
      return `<a class="chip-btn" href="${esc(href)}">${esc(k)}</a>`;
    }).join("");
    return `<header class="record-head">
      ${lineHtml}
      <div class="record-id">
        ${chip("epp")}
        ${keyLink(epp)}
        <span class="pill">${esc(status(epp))}</span>
        ${methodMark(epp)}
        ${parents}
        <span class="pill">${esc(String(epp.featureCount || feats.length || 0))} FTR · ${esc(String(epp.storyCount || 0))} STY</span>
      </div>
      <h1>${esc(epp.title || "")}</h1>
      <div class="metrics metrics-2">
        <div class="metric${logged > 0 ? " is-lead" : " is-quiet"}"><b>${esc(num(logged))}</b><span>Logged</span></div>
        <div class="metric${Hours.lastBookedOf(epp) ? "" : " is-quiet"}"><b>${esc(Hours.lastBookedOf(epp) || "—")}</b><span>Last booked</span></div>
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
    keyLink, chip, num, loggedHours, costHours, edpView, eppView, eppBlock, featureBlock, bindToggle,
  };
})();
