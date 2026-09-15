(function () {
  const JIRA = (Hours.tree().jiraBase) || "https://eneve.atlassian.net/browse/";
  const state = {
    open: new Set(),
    activeOnly: true,
    group: "product",
    product: "all",
    milestone: "all",
    health: "all",
    q: "",
    selected: null,
  };

  const root = document.getElementById("root");
  const detail = document.getElementById("detail");

  function esc(s) { return Hours.esc(s); }

  function isMilestone() { return state.group === "milestone"; }

  function roots() {
    const t = Hours.tree();
    if (isMilestone()) {
      const all = t.milestones || [];
      if (state.milestone !== "all") return all.filter((m) => m.key === state.milestone);
      return all;
    }
    let products = t.products || [];
    if (state.product !== "all") products = products.filter((p) => p.name === state.product);
    return products;
  }

  function matchesSelf(node, q) {
    if (!q) return true;
    const blob = [
      node.name, node.key, node.title, node.status, node.kind, node.method, node.issuetype,
      node.target, (node.products || []).join(" "), (node.onEdps || []).join(" "),
    ].join(" ").toLowerCase();
    return blob.includes(q);
  }

  function matchesQuery(node, q) {
    if (!q) return true;
    if (matchesSelf(node, q)) return true;
    return (node.children || []).some((c) => matchesQuery(c, q));
  }

  function edpPasses(node) {
    if (node.type !== "edp") return true;
    if (state.activeOnly && !node.active) return false;
    if (state.health !== "all" && Hours.health(node) !== state.health) return false;
    return true;
  }

  function idOf(path) { return path.join("/"); }

  function timeBit(node) {
    const t = node.time || {};
    if (node.type === "product" || node.type === "milestone") {
      return node.uniqueSpentHours ? Hours.fmtHours(node.uniqueSpentHours) + " unique" : "";
    }
    if (node.type === "edp") {
      return Hours.fmtHours(t.uniqueSpentHours) + " unique";
    }
    if (t.rolledSpent && t.rolledSpent !== "0h") return t.rolledSpent + " spent";
    return "";
  }

  function counts(node) {
    const tb = timeBit(node);
    if (node.type === "product") return (node.activeCount || 0) + " active · " + tb;
    if (node.type === "milestone") {
      return [node.eppCount + " EPP", Hours.fmtHours(node.uniqueSpentHours) + " unique"].join(" · ");
    }
    if (node.type === "theme") return (node.edpCount || 0) + " EDP";
    if (node.type === "edp") {
      return [(node.eppCount || 0) + " EPP cost", (node.pendingCount || 0) + " pending", tb].filter(Boolean).join(" · ");
    }
    if (node.type === "epp") {
      return [(node.featureCount || 0) + " feat", (node.storyCount || 0) + " stories", tb].filter(Boolean).join(" · ");
    }
    if (node.type === "feature") return (node.storyCount || 0) + " stories" + (tb ? " · " + tb : "");
    return tb;
  }

  function meta(node) {
    const bits = [];
    if (node.type === "edp") {
      bits.push(`<span class="health ${esc(Hours.health(node))}">${esc(Hours.health(node))}</span>`);
      if (node.roadmap) bits.push(`<span class="muted">${esc(node.roadmap)}</span>`);
    }
    if (node.type === "milestone" && node.target) bits.push(`<span class="muted">${esc(node.target)}</span>`);
    if (node.status && node.type !== "product") bits.push(`<span class="muted">${esc(node.status)}</span>`);
    if (node.type === "epp") {
      bits.push(`<span class="muted">${esc(node.method || "")}</span>`);
      if (node.costMember === false) bits.push(`<span class="health pending">not cost</span>`);
      if ((node.time || {}).sharedWith && node.time.sharedWith.length) {
        bits.push(`<span class="health shared">shared ${esc(node.time.sharedWith.join(", "))}</span>`);
      }
      if (node.onEdps && node.onEdps.length) bits.push(`<span class="muted">on ${esc(node.onEdps.join(", "))}</span>`);
      if (node.products && node.products.length) bits.push(`<span class="muted">${esc(node.products.join(", "))}</span>`);
    }
    if (node.alsoIn && node.alsoIn.length) bits.push(`<span class="muted">also in ${esc(node.alsoIn.join(", "))}</span>`);
    if (node.budgetHours != null) bits.push(`<span class="muted">budget ${esc(Hours.fmtHours(node.budgetHours))}</span>`);
    return bits.join(" ");
  }

  function keyLink(node) {
    if (!node.key) return "";
    const href = node.url || (/^[A-Z][A-Z0-9]+-\d+$/.test(node.key) ? JIRA + node.key : "");
    return href
      ? `<a class="key" href="${esc(href)}" target="_blank" rel="noreferrer">${esc(node.key)}</a>`
      : `<span class="key">${esc(node.key)}</span>`;
  }

  function titleInner(node) {
    const label = node.name || node.title || "(untitled)";
    if (node.type === "edp") {
      return `${keyLink(node)}<button type="button" class="linkish" data-edp="${esc(node.key || "")}">${esc(label)}</button>`;
    }
    return `${keyLink(node)}${esc(label)}`;
  }

  function visibleKids(node) {
    const kids = node.children || [];
    if (node.type === "product" && kids.some((k) => k.type === "theme")) {
      return kids.filter((th) => (th.children || []).some((e) => edpPasses(e) && matchesQuery(e, state.q)));
    }
    if (node.type === "theme" || node.type === "product") {
      return kids.filter((e) => {
        if (e.type === "theme") return visibleKids(e).length;
        return edpPasses(e) && matchesQuery(e, state.q);
      });
    }
    if (!state.q) return kids;
    if (matchesSelf(node, state.q)) return kids;
    return kids.filter((c) => matchesQuery(c, state.q));
  }

  function rowClass(node) {
    const extra = [];
    if (node.type === "epp" && node.method === "inferred_pending") extra.push("pending");
    if (node.type === "epp" && node.method === "rejected") extra.push("rejected");
    if (node.type === "edp" && state.selected && node.key === state.selected) extra.push("edp-open");
    return `row ${node.type} ${extra.join(" ")}`.trim();
  }

  function renderNode(node, path) {
    if (node.type === "product" && !visibleKids(node).length && state.q) {
      if (!matchesSelf(node, state.q)) return "";
    }
    if (node.type === "edp" && !edpPasses(node)) return "";
    if (state.q && node.type === "edp" && !matchesQuery(node, state.q)) return "";
    if (isMilestone() && state.q && node.type === "milestone" && !matchesQuery(node, state.q)) return "";
    const kids = visibleKids(node);
    const id = idOf(path);
    const open = state.open.has(id);
    const hasKids = (node.children || []).length > 0;
    const twist = hasKids
      ? `<button class="twist" data-id="${esc(id)}" aria-expanded="${open}">${open ? "▾" : "▸"}</button>`
      : `<span class="twist"></span>`;
    let html = `<li>
      <div class="${rowClass(node)}${hasKids ? "" : " leaf"}">
        ${twist}
        <div class="body">
          <div class="kicker">${esc({
            product: "Product line", milestone: "BRPaaS milestone", theme: "Theme",
            edp: "EDP", epp: "EPP", feature: "Feature", story: "Story",
          }[node.type] || node.type)}</div>
          <div class="title">${titleInner(node)}</div>
          <div class="meta-row">${meta(node)}</div>
        </div>
        <div class="counts">${esc(counts(node))}</div>
      </div>`;
    if (hasKids && open) {
      html += "<ul>";
      kids.forEach((child, i) => {
        html += renderNode(child, path.concat([child.key || child.name || String(i)]));
      });
      html += "</ul>";
    } else if (node.type === "edp" && !(node.children || []).length) {
      html += `<div class="empty">No EPP attached</div>`;
    }
    html += "</li>";
    return html;
  }

  function paintTree() {
    const items = roots();
    root.innerHTML = items.map((p) => renderNode(p, [p.key || p.name])).join("") || "<li class='empty'>No matching items.</li>";
  }

  function paintDetail() {
    const key = state.selected;
    if (!key) {
      detail.innerHTML = `<p class="muted">Select an EDP for the true view — members, unique vs rolled, pending, budget.</p>`;
      return;
    }
    const edp = Hours.findEdp(key);
    if (!edp) {
      detail.innerHTML = `<p class="muted">EDP ${esc(key)} is not in the tree.</p>`;
      return;
    }
    const cost = Hours.costChildren(edp);
    const pending = Hours.pendingChildren(edp);
    const rejected = Hours.rejectedChildren(edp);
    const t = edp.time || {};
    const env = Hours.envelope(t.uniqueSpentHours, edp.budgetHours);
    const budgetLine = env.unbudgeted
      ? "No hour budget on this EDP."
      : `Budget ${Hours.fmtHours(env.budget)} · remaining ${Hours.fmtHours(env.remaining)} · ${env.pct}% used`;
    const href = edp.url || (edp.key ? JIRA + edp.key : "");
    detail.innerHTML = `
      <p class="kicker">True view</p>
      <h2>${href ? `<a href="${esc(href)}" target="_blank" rel="noreferrer">${esc(edp.key || "")}</a>` : esc(edp.key || "")}</h2>
      <p>${esc(edp.title)}</p>
      <div class="meta-row">
        <span class="health ${esc(Hours.health(edp))}">${esc(Hours.health(edp))}</span>
        <span>${esc(edp.roadmap || "")}</span>
        <span>${esc(edp.productLabel || "")}</span>
        ${(edp.alsoIn || []).length ? `<span>also in ${esc(edp.alsoIn.join(", "))}</span>` : ""}
      </div>
      <p class="note">${Hours.fmtHours(t.uniqueSpentHours)} unique · ${Hours.fmtHours(t.rolledSpentHours)} rolled (rolled overstates shared EPPs). ${esc(budgetLine)}</p>
      <h3 class="kicker">Cost members</h3>
      ${cost.length ? `<ul>${cost.map((e) => `<li><span class="key">${esc(e.key)}</span> ${esc(e.title)} · ${esc(e.method)} · ${esc((e.time || {}).rolledSpent || Hours.fmtHours((e.time || {}).rolledSpentHours))}${(e.time || {}).sharedWith && e.time.sharedWith.length ? ` · <span class="copper">shared</span>` : ""}</li>`).join("")}</ul>` : `<p class="muted">None. Pending inferred is not cost.</p>`}
      <h3 class="kicker">Pending inferred</h3>
      ${pending.length ? `<ul>${pending.map((e) => `<li><span class="key">${esc(e.key)}</span> ${esc(e.title)}</li>`).join("")}</ul>` : `<p class="muted">None.</p>`}
      <h3 class="kicker">Rejected (audit)</h3>
      ${rejected.length ? `<ul>${rejected.map((e) => `<li><span class="key">${esc(e.key)}</span> ${esc(e.title)} — Jira may still link this; overlay excluded.</li>`).join("")}</ul>` : `<p class="muted">None.</p>`}
      <p class="note"><a href="mapping.html#${esc(edp.key || "")}">Edit mapping</a></p>
    `;
  }

  function setDepth(level) {
    state.open.clear();
    function walk(node, path, depth) {
      if (depth < level) state.open.add(idOf(path));
      (node.children || []).forEach((child, i) => {
        walk(child, path.concat([child.key || child.name || String(i)]), depth + 1);
      });
    }
    roots().forEach((p) => walk(p, [p.key || p.name], 1));
  }

  function expandMatches() {
    state.open.clear();
    function walk(node, path) {
      const kids = node.children || [];
      let childHit = false;
      kids.forEach((child, i) => {
        if (walk(child, path.concat([child.key || child.name || String(i)]))) childHit = true;
      });
      const hit = matchesSelf(node, state.q) || childHit;
      if (hit && kids.length) state.open.add(idOf(path));
      return hit;
    }
    roots().forEach((p) => walk(p, [p.key || p.name]));
  }

  function syncChrome() {
    document.getElementById("milestone").disabled = !isMilestone();
    document.getElementById("product").disabled = isMilestone();
    document.getElementById("health").disabled = isMilestone();
    document.getElementById("activeOnly").disabled = isMilestone();
  }

  function paint() {
    syncChrome();
    if (state.q) expandMatches();
    else if (!state.open.size) setDepth(2);
    paintTree();
    paintDetail();
  }

  function fillSelects() {
    const prod = document.getElementById("product");
    (Hours.tree().products || []).forEach((p) => {
      const o = document.createElement("option");
      o.value = p.name;
      o.textContent = p.name;
      prod.appendChild(o);
    });
    const ms = document.getElementById("milestone");
    (Hours.tree().milestones || []).forEach((m) => {
      const o = document.createElement("option");
      o.value = m.key;
      o.textContent = m.key + " " + (m.name || m.title);
      ms.appendChild(o);
    });
  }

  fillSelects();

  root.addEventListener("click", (e) => {
    const twist = e.target.closest(".twist");
    if (twist && twist.dataset.id) {
      const id = twist.dataset.id;
      if (state.open.has(id)) state.open.delete(id);
      else state.open.add(id);
      paintTree();
      return;
    }
    const btn = e.target.closest("[data-edp]");
    if (btn) {
      state.selected = btn.getAttribute("data-edp") || "";
      history.replaceState(null, "", "#" + encodeURIComponent(state.selected));
      paint();
    }
  });

  document.getElementById("group").addEventListener("change", (e) => {
    state.group = e.target.value;
    state.open.clear();
    paint();
  });
  document.getElementById("product").addEventListener("change", (e) => {
    state.product = e.target.value;
    state.open.clear();
    paint();
  });
  document.getElementById("milestone").addEventListener("change", (e) => {
    state.milestone = e.target.value;
    state.open.clear();
    paint();
  });
  document.getElementById("health").addEventListener("change", (e) => {
    state.health = e.target.value;
    paint();
  });
  document.getElementById("activeOnly").addEventListener("change", (e) => {
    state.activeOnly = e.target.checked;
    paint();
  });
  document.getElementById("q").addEventListener("input", (e) => {
    state.q = e.target.value.trim().toLowerCase();
    paint();
  });

  const hash = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  if (hash) state.selected = hash;
  paint();
})();
