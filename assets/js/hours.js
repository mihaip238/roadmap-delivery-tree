(function () {
  function tree() {
    return window.ROADMAP_TREE || {};
  }

  function flattenEdps(nodes) {
    const out = [];
    (nodes || []).forEach((n) => {
      if (n.type === "theme") out.push.apply(out, flattenEdps(n.children));
      else out.push(n);
    });
    return out;
  }

  function uniqueEdps() {
    const seen = new Set();
    const rows = [];
    (tree().products || []).forEach((prod) => {
      flattenEdps(prod.children).forEach((edp) => {
        const id = edp.key || edp.title;
        if (!id || seen.has(id)) return;
        seen.add(id);
        rows.push(edp);
      });
    });
    return rows;
  }

  function fmtHours(n) {
    if (n == null || n === "") return "—";
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString("en-GB", { maximumFractionDigits: 2, minimumFractionDigits: 0 }) + " h";
  }

  function fmtWhen(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  }

  function fetchedAt() {
    return (tree().hoursControl && tree().hoursControl.fetchedAt)
      || (((tree().totals || {}).time || {}).fetchedAt)
      || "";
  }

  function costChildren(edp) {
    return (edp.children || []).filter((e) => e.costMember);
  }

  function pendingChildren(edp) {
    return (edp.children || []).filter((e) => e.method === "inferred_pending");
  }

  function rejectedChildren(edp) {
    return (edp.children || []).filter((e) => e.method === "rejected");
  }

  function health(edp) {
    return edp.health || (costChildren(edp).length ? "confirmed" : (pendingChildren(edp).length ? "pending" : "none"));
  }

  function uniqueHoursOf(edp) {
    const t = edp.time || {};
    if (t.uniqueSpentHours != null) return Number(t.uniqueSpentHours) || 0;
    return 0;
  }

  function remaining(spent, budget) {
    if (budget == null || budget === "") return null;
    return round2(Number(budget) - Number(spent || 0));
  }

  function pct(spent, budget) {
    if (budget == null || budget === "" || Number(budget) === 0) return null;
    return round2((Number(spent || 0) / Number(budget)) * 100);
  }

  function round2(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  function envelope(spent, budget) {
    const b = budget == null || budget === "" ? null : Number(budget);
    return {
      spent: Number(spent || 0),
      budget: b,
      remaining: remaining(spent, b),
      pct: pct(spent, b),
      unbudgeted: b == null,
    };
  }

  function overview() {
    return tree().hoursControl || {};
  }

  function productRows() {
    return (tree().products || []).map((p) => {
      const env = envelope(p.uniqueSpentHours, p.budgetHours);
      return Object.assign({ name: p.name, uniqueSpentHours: p.uniqueSpentHours || 0 }, env, {
        edpCount: p.edpCount,
        activeCount: p.activeCount,
        official: p.official !== false,
      });
    });
  }

  function milestoneRows() {
    return (tree().milestones || []).map((m) => {
      const env = envelope(m.uniqueSpentHours, m.budgetHours);
      return Object.assign({
        key: m.key,
        name: m.name || m.title,
        title: m.title || m.name,
        uniqueSpentHours: m.uniqueSpentHours || 0,
        target: m.target,
        status: m.status,
        eppCount: m.eppCount,
      }, env);
    });
  }

  function edpRows() {
    const seen = new Set();
    const rows = [];
    (tree().products || []).forEach((prod) => {
      flattenEdps(prod.children).forEach((edp) => {
        const id = edp.key || edp.title;
        if (!id || seen.has(id)) return;
        seen.add(id);
        const env = envelope(uniqueHoursOf(edp), edp.budgetHours);
        const shared = ((edp.time || {}).sharedWith || []);
        rows.push(Object.assign({
          key: edp.key || "",
          title: edp.title,
          product: prod.name,
          alsoIn: edp.alsoIn || [],
          active: !!edp.active,
          roadmap: edp.roadmap || "",
          kind: edp.kind || "none",
          health: health(edp),
          uniqueSpentHours: uniqueHoursOf(edp),
          rolledSpentHours: (edp.time || {}).rolledSpentHours || 0,
          pendingCount: edp.pendingCount || pendingChildren(edp).length,
          eppCount: edp.eppCount || costChildren(edp).length,
          sharedWith: shared,
          edp: edp,
        }, env));
      });
    });
    return rows;
  }

  function findEdp(key) {
    return uniqueEdps().find((e) => e.key === key || (!e.key && e.title === key)) || null;
  }

  function findEpp(key) {
    let fromProduct = null;
    let fromMilestone = null;
    function walk(node, bucket) {
      if (!node || bucket.node) return;
      if (node.type === "epp" && node.key === key) {
        bucket.node = node;
        return;
      }
      (node.children || []).forEach((c) => walk(c, bucket));
    }
    const prod = { node: null };
    const ms = { node: null };
    (tree().products || []).forEach((n) => walk(n, prod));
    (tree().milestones || []).forEach((n) => walk(n, ms));
    fromProduct = prod.node;
    fromMilestone = ms.node;
    if (fromProduct && fromMilestone) {
      return Object.assign({}, fromProduct, {
        onEdps: fromProduct.onEdps || fromMilestone.onEdps,
        products: fromProduct.products || fromMilestone.products,
      });
    }
    return fromProduct || fromMilestone;
  }

  function edpsForEpp(eppKey) {
    return uniqueEdps().filter((edp) => (edp.children || []).some((e) => e.key === eppKey));
  }

  function fmtNum(n) {
    if (n == null || n === "") return "—";
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString("en-GB", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  }

  function eppCatalog() {
    return tree().eppCatalog || [];
  }

  function caption() {
    const when = fmtWhen(fetchedAt()) || "unknown date";
    return "Jira worklogs · unique · as of " + when;
  }

  function insights() {
    const ov = overview();
    const lines = [];
    if ((ov.pendingInferredActive || 0) > 0) {
      lines.push(ov.pendingInferredActive + " active EDPs still pending confirm — their inferred hours are not in cost.");
    }
    const ms = milestoneRows().slice().sort((a, b) => b.uniqueSpentHours - a.uniqueSpentHours);
    if (ms.length && ms[0].uniqueSpentHours) {
      const top = ms[0];
      const node = (tree().milestones || []).find((m) => m.key === top.key);
      let slice = "";
      if (node) {
        const epps = (node.children || []).slice().sort((a, b) => {
          const ha = ((a.time || {}).rolledSpentHours) || 0;
          const hb = ((b.time || {}).rolledSpentHours) || 0;
          return hb - ha;
        });
        if (epps[0]) slice = epps[0].key + " is the largest EPP in that slice.";
      }
      lines.push(top.key + " (" + (top.name || "") + ") is " + fmtHours(top.uniqueSpentHours) + " unique in the BRPaaS program. " + slice);
    }
    const prods = productRows().filter((p) => p.name !== "Unclassified").slice().sort((a, b) => b.spent - a.spent);
    if (prods.length && prods[0].spent) {
      lines.push(prods[0].name + " holds " + fmtHours(prods[0].spent) + " unique on the product-line cut — not the BRPaaS program total.");
    }
    const over = edpRows().concat(productRows(), milestoneRows()).filter((r) => r.budget != null && r.remaining != null && r.remaining < 0);
    if (over.length) {
      lines.push(over.length + " budgeted envelope" + (over.length === 1 ? " is" : "s are") + " over spent.");
    } else if (edpRows().some((r) => r.budget != null) || productRows().some((r) => r.budget != null) || milestoneRows().some((r) => r.budget != null)) {
      lines.push("No budgeted envelope is over spent.");
    }
    return lines.slice(0, 4);
  }

  function collectOwn(node, acc, costOnly) {
    if (costOnly && node.type === "epp" && node.costMember === false) return;
    const t = node.time || {};
    if (node.key) acc[node.key] = t.ownSpentSec || 0;
    (node.children || []).forEach((c) => collectOwn(c, acc, costOnly));
  }

  function programUniqueHours() {
    const acc = {};
    (tree().milestones || []).forEach((m) => collectOwn(m, acc, false));
    return round2(Object.values(acc).reduce((s, n) => s + n, 0) / 3600);
  }

  function topEdps(n) {
    return edpRows().slice().sort((a, b) => b.uniqueSpentHours - a.uniqueSpentHours).slice(0, n || 8);
  }

  function topSharedEpps(n) {
    const shared = (((tree().totals || {}).time || {}).sharedEpps) || {};
    const byKey = {};
    uniqueEdps().forEach((edp) => {
      (edp.children || []).forEach((epp) => {
        if (!epp.costMember || !epp.key) return;
        if (!shared[epp.key]) return;
        if (!byKey[epp.key]) {
          byKey[epp.key] = {
            key: epp.key,
            title: epp.title,
            hours: (epp.time || {}).rolledSpentHours || 0,
            edps: shared[epp.key],
          };
        }
      });
    });
    return Object.values(byKey).sort((a, b) => b.hours - a.hours).slice(0, n || 8);
  }

  function healthCounts(activeOnly) {
    const rows = uniqueEdps().filter((e) => (activeOnly === false ? true : e.active));
    const out = { confirmed: 0, pending: 0, none: 0, total: rows.length };
    rows.forEach((e) => {
      const h = health(e);
      if (h === "confirmed") out.confirmed += 1;
      else if (h === "pending") out.pending += 1;
      else out.none += 1;
    });
    return out;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  window.Hours = {
    tree,
    flattenEdps,
    uniqueEdps,
    fmtHours,
    fmtWhen,
    fetchedAt,
    costChildren,
    pendingChildren,
    rejectedChildren,
    health,
    uniqueHoursOf,
    remaining,
    pct,
    envelope,
    overview,
    productRows,
    milestoneRows,
    edpRows,
    findEdp,
    findEpp,
    edpsForEpp,
    fmtNum,
    eppCatalog,
    caption,
    insights,
    programUniqueHours,
    topEdps,
    topSharedEpps,
    healthCounts,
    esc,
    round2,
  };
})();
