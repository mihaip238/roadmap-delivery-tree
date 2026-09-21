(function () {
  const DEFINITIONS = {
    delivery_status: {
      label: "Status",
      decision: "Is the deliverable moving through Jira?",
      source: "Jira status / status category",
      track: "Use Jira status categories consistently at Story and Feature level.",
    },
    completion: {
      label: "Completion",
      decision: "How much of the known scope is complete?",
      source: "Leaf Jira work items by status category",
      track: "Keep Story/Feature parentage and workflow status current.",
    },
    spent: {
      label: "Spent",
      decision: "How many unique hours have been consumed?",
      source: "Jira worklogs on confirmed cost-member tickets",
      track: "Log work on the lowest practical Jira work item.",
    },
    original_estimate: {
      label: "Original",
      decision: "What effort was initially expected?",
      source: "Jira Original estimate",
      track: "Estimate all scoped Stories before work starts.",
    },
    remaining: {
      label: "Remaining",
      decision: "How much effort is left?",
      source: "Jira Remaining estimate",
      track: "Update Remaining estimate whenever work is logged or scope changes.",
    },
    estimate_coverage: {
      label: "Estimate coverage",
      decision: "Can effort forecasts be trusted?",
      source: "Estimated leaf items / scoped leaf items",
      track: "Estimate every active Story; keep removed work out of the denominator.",
    },
    forecast_finish: {
      label: "Forecast finish",
      decision: "When will the deliverable likely finish?",
      source: "Remaining estimate + historical burn",
      track: "Maintain Remaining estimate, target date, and at least 3 snapshots over 14 days.",
    },
    blockers: {
      label: "Blockers",
      decision: "What is preventing delivery?",
      source: "Jira Flagged/blocker relation + reason",
      track: "Use one blocker convention: Flagged plus blocker reason, owner, and review date.",
    },
    target_date: {
      label: "Target",
      decision: "What date was promised?",
      source: "Jira target/due date on the EDP",
      track: "Store one accountable target date on the EDP and version changes.",
    },
    pending_mapping: {
      label: "Pending mapping",
      decision: "Are hours missing from cost because linkage is uncertain?",
      source: "Inferred EDP↔EPP matches",
      track: "Confirm or reject the Mapping inbox.",
    },
    shared_scope: {
      label: "Shared scope",
      decision: "Could the same work be attributed to multiple deliverables?",
      source: "Confirmed EPP ownership",
      track: "Allocate shared EPPs explicitly when business-case attribution is required.",
    },
  };

  const DONE = new Set(["done", "released", "usable", "passed", "closed", "resolved"]);
  const REMOVED = new Set(["canceled", "cancelled", "rejected", "abandoned"]);
  const ACTIVE_RX = /progress|development|design|test|review|delivery|selected|waiting for release|ready/;
  const PLANNED_RX = /backlog|open|new|to do|discovery|parking lot|proposed/;

  function round(value) {
    return Hours.round2(Number(value) || 0);
  }

  function category(node) {
    const raw = String(node.statusCategory || "").toLowerCase();
    if (raw === "done") return { key: "done", native: true };
    if (raw === "indeterminate") return { key: "active", native: true };
    if (raw === "new" || raw === "to do") return { key: "planned", native: true };
    const status = String(node.status || "").trim().toLowerCase();
    if (DONE.has(status)) return { key: "done", native: false };
    if (REMOVED.has(status)) return { key: "removed", native: false };
    if (ACTIVE_RX.test(status)) return { key: "active", native: false };
    if (PLANNED_RX.test(status)) return { key: "planned", native: false };
    return { key: "other", native: false };
  }

  function walk(node, visit, costOnly) {
    if (!node) return;
    if (costOnly && node.type === "epp" && node.costMember === false) return;
    visit(node);
    (node.children || []).forEach((child) => walk(child, visit, costOnly));
  }

  function uniqueNodes(root, costOnly) {
    const seen = new Set();
    const rows = [];
    walk(root, (node) => {
      const key = node.key || `${node.type}:${node.title || ""}`;
      if (!key || seen.has(key)) return;
      seen.add(key);
      rows.push(node);
    }, costOnly);
    return rows;
  }

  function leafScope(edp) {
    const cost = Hours.costChildren(edp);
    const stories = [];
    const features = [];
    cost.forEach((epp) => (epp.children || []).forEach((feature) => {
      features.push(feature);
      stories.push(...(feature.children || []));
    }));
    if (stories.length) return stories;
    if (features.length) return features;
    return cost;
  }

  function fieldHours(edp, field) {
    const seen = new Set();
    let seconds = 0;
    walk(edp, (node) => {
      if (!node.key || seen.has(node.key)) return;
      seen.add(node.key);
      const value = (node.time || {})[field];
      if (value != null) seconds += Number(value) || 0;
    }, true);
    return round(seconds / 3600);
  }

  function evidence(id, value, status, detail) {
    return Object.assign({ id, value, status, definition: DEFINITIONS[id] }, detail || {});
  }

  function workflow(edp) {
    const leaves = leafScope(edp);
    const counts = { done: 0, active: 0, planned: 0, removed: 0, other: 0 };
    let native = 0;
    leaves.forEach((node) => {
      const result = category(node);
      counts[result.key] += 1;
      if (result.native) native += 1;
    });
    const denominator = leaves.length - counts.removed;
    return {
      leaves,
      counts,
      completion: denominator ? round((counts.done / denominator) * 100) : null,
      nativeCoverage: leaves.length ? round((native / leaves.length) * 100) : 0,
    };
  }

  function deliverable(edp) {
    if (!edp) return null;
    const flow = workflow(edp);
    const nodes = uniqueNodes(edp, true);
    const estimable = flow.leaves.filter((node) => category(node).key !== "removed");
    const estimated = estimable.filter((node) => (node.time || {}).ownEstimateSec != null);
    const original = fieldHours(edp, "ownEstimateSec");
    const remainingNodes = nodes.filter((node) => (node.time || {}).ownRemainingSec != null);
    const remaining = fieldHours(edp, "ownRemainingSec");
    const spent = Hours.uniqueHoursOf(edp);
    const pending = Hours.pendingUniqueHours([edp]);
    const shared = Array.from(new Set(Hours.costChildren(edp).flatMap((epp) =>
      ((epp.time || {}).sharedWith || []).length > 1 ? [epp.key] : []
    )));
    const status = category(edp);
    const blockers = nodes.filter((node) => node.flagged || node.blocked);
    const target = edp.targetDate || edp.dueDate || null;
    const history = Hours.reportHistory().map((snapshot) => {
      const row = (snapshot.edps || []).find((item) => item.key === edp.key);
      return row ? { date: snapshot.date, value: Number(row.cost) || 0 } : null;
    }).filter(Boolean);
    const burn = window.Reporting ? Reporting.forecast(history, 30) : null;
    let forecast = null;
    if (burn && burn.daily > 0 && remainingNodes.length) {
      const last = history[history.length - 1];
      const days = Math.ceil(remaining / burn.daily);
      const date = new Date(last.date + "T00:00:00Z");
      date.setUTCDate(date.getUTCDate() + days);
      forecast = { date: date.toISOString().slice(0, 10), days, daily: burn.daily, r2: burn.r2 };
    }
    const estimateCoverage = estimable.length ? round((estimated.length / estimable.length) * 100) : null;
    const metrics = {
      delivery_status: evidence("delivery_status", edp.status || "—", edp.status ? (status.native ? "available" : "partial") : "unavailable", {
        category: status.key,
      }),
      completion: evidence("completion", flow.completion, flow.leaves.length ? (flow.nativeCoverage === 100 ? "available" : "partial") : "unavailable", {
        counts: flow.counts,
        denominator: flow.leaves.length - flow.counts.removed,
        nativeCoverage: flow.nativeCoverage,
      }),
      spent: evidence("spent", spent, "available"),
      original_estimate: evidence("original_estimate", original, estimated.length ? (estimateCoverage === 100 ? "available" : "partial") : "unavailable"),
      remaining: evidence("remaining", remainingNodes.length ? remaining : null, remainingNodes.length ? (remainingNodes.length === nodes.length ? "available" : "partial") : "unavailable", {
        coverage: nodes.length ? round((remainingNodes.length / nodes.length) * 100) : 0,
      }),
      estimate_coverage: evidence("estimate_coverage", estimateCoverage, estimated.length ? (estimateCoverage === 100 ? "available" : "partial") : "unavailable", {
        estimated: estimated.length,
        total: estimable.length,
      }),
      forecast_finish: evidence("forecast_finish", forecast && forecast.date, forecast ? "partial" : "unavailable", {
        model: forecast,
      }),
      blockers: evidence("blockers", blockers.length || null, blockers.length ? "partial" : "unavailable", { rows: blockers }),
      target_date: evidence("target_date", target, target ? "available" : "unavailable"),
      pending_mapping: evidence("pending_mapping", pending, pending > 0 ? "partial" : "available"),
      shared_scope: evidence("shared_scope", shared.length, "available", { keys: shared }),
    };
    return {
      edp,
      metrics,
      workflow: flow,
      nodes,
      epps: Hours.costChildren(edp),
      gaps: Object.values(metrics).filter((metric) => metric.status !== "available"),
    };
  }

  function definitions() {
    return Object.entries(DEFINITIONS).map(([id, row]) => Object.assign({ id }, row));
  }

  window.Kpis = { deliverable, definitions, category, fieldHours, leafScope };
})();
