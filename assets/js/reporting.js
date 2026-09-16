(function () {
  const METRICS = {
    cost: { label: "Cost", unit: "hours", direction: "desc" },
    logged: { label: "Logged", unit: "hours", direction: "desc" },
    budget: { label: "Budget", unit: "hours", direction: "desc", budgeted: true },
    remaining: { label: "Left", unit: "hours", direction: "asc", budgeted: true },
    pending: { label: "Pending", unit: "hours", direction: "desc" },
    mapping: { label: "Mapping", unit: "percent", direction: "asc" },
  };

  function normalizedEdps() {
    return Hours.edpRows().map((row) => Object.assign({}, row, {
      label: row.key || row.title,
      type: "edp",
      cost: row.uniqueSpentHours,
      logged: row.rolledSpentHours,
      pending: Hours.pendingUniqueHours([row.edp]),
      mapping: row.health === "confirmed" ? 100 : 0,
      count: row.eppCount,
      products: [row.product].concat(row.alsoIn || []),
    }));
  }

  function normalizedRows(cut) {
    if (cut === "program") return Hours.reportMilestoneRows();
    if (cut === "edp") return normalizedEdps();
    if (cut === "epp") return Hours.reportEppRows();
    return Hours.reportProductRows();
  }

  function includesText(row, query) {
    if (!query) return true;
    const text = [
      row.key, row.label, row.name, row.title, row.product,
      ...(row.products || []), ...(row.owners || []),
    ].join(" ").toLowerCase();
    return text.includes(query.toLowerCase());
  }

  function rows(state) {
    const metric = METRICS[state.metric] || METRICS.cost;
    let source = normalizedRows(state.cut);
    if (state.cut === "product" && state.active) {
      source = source.map((row) => Object.assign({}, row, {
        cost: row.activeCost,
        logged: row.activeLogged,
        pending: row.activePending,
        count: row.activeCount,
      }));
    }
    let data = source.filter((row) => {
      if (state.active && !row.active) return false;
      if (state.product && state.product !== "all") {
        const products = row.products || [row.product || row.name];
        if (!products.includes(state.product)) return false;
      }
      if (state.milestone && !(row.milestones || []).includes(state.milestone)) return false;
      if (state.health && row.type === "edp" && row.health !== state.health) return false;
      if (!includesText(row, state.q)) return false;
      if (state.cut === "product" && state.metric === "cost" && !(Number(row.cost) > 0)) return false;
      if (metric.budgeted && row.budget == null) return false;
      if (state.compare === "budget" && row.budget == null) return false;
      return true;
    });
    data.sort((a, b) => {
      const av = Number(a[state.metric] || 0);
      const bv = Number(b[state.metric] || 0);
      return metric.direction === "asc" ? av - bv : bv - av;
    });
    if (state.top !== "all") data = data.slice(0, Number(state.top) || 10);
    return data;
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function summary(data, state) {
    const values = data
      .map((row) => row[state.metric])
      .filter((value) => value != null && Number.isFinite(Number(value)))
      .map(Number);
    const compareValues = state.compare === "none"
      ? []
      : data.map((row) => row[state.compare]).filter((value) => value != null).map(Number);
    const rowTotal = values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    let total = rowTotal;
    if (state.metric === "cost" && data.length) {
      let nodes = [];
      if (state.cut === "product") {
        const names = new Set(data.map((row) => row.name));
        (Hours.tree().products || []).forEach((product) => {
          if (names.has(product.name)) {
            nodes.push(...Hours.flattenEdps(product.children).filter((edp) => !state.active || edp.active));
          }
        });
        total = Hours.uniqueReportHours(nodes, true);
      } else if (state.cut === "program") {
        const keys = new Set(data.map((row) => row.key));
        (Hours.tree().milestones || []).forEach((milestone) => {
          if (keys.has(milestone.key)) nodes.push(...(milestone.children || []));
        });
        total = Hours.uniqueReportHours(nodes, false);
      } else if (state.cut === "edp") {
        total = Hours.uniqueReportHours(data.map((row) => row.edp), true);
      } else {
        total = Hours.uniqueReportHours(data.map((row) => Hours.findEpp(row.key)).filter(Boolean), false);
      }
    }
    if (state.metric === "pending" && data.length) {
      if (state.cut === "product") {
        const names = new Set(data.map((row) => row.name));
        const edps = Hours.uniqueEdps().filter((edp) => {
          if (state.active && !edp.active) return false;
          return names.has(edp.productLabel) || (edp.alsoIn || []).some((name) => names.has(name));
        });
        total = Hours.pendingUniqueHours(edps);
      } else if (state.cut === "edp") {
        total = Hours.pendingUniqueHours(data.map((row) => row.edp));
      } else if (state.cut === "epp") {
        total = Hours.uniqueReportHours(
          data.filter((row) => row.pending > 0).map((row) => Hours.findEpp(row.key)).filter(Boolean),
          false
        );
      }
    }
    if (state.metric === "mapping") {
      if (!data.length) {
        total = null;
      } else if (state.cut === "product") {
        const names = new Set(data.map((row) => row.name));
        const edps = Hours.uniqueEdps().filter((edp) =>
          edp.active && (names.has(edp.productLabel) || (edp.alsoIn || []).some((name) => names.has(name)))
        );
        total = edps.length
          ? Hours.round2((edps.filter((edp) => Hours.health(edp) === "confirmed").length / edps.length) * 100)
          : 0;
      } else {
        total = Hours.round2(
          (data.filter((row) => row.health === "confirmed").length / data.length) * 100
        );
      }
    }
    const compareTotal = compareValues.length
      ? compareValues.reduce((sum, value) => sum + value, 0)
      : null;
    return {
      total: total == null ? null : Hours.round2(total),
      average: values.length ? Hours.round2(rowTotal / values.length) : null,
      median: values.length ? Hours.round2(median(values)) : null,
      maximum: values.length ? Hours.round2(Math.max(...values)) : null,
      coverage: state.metric === "mapping"
        ? total
        : Hours.round2((data.filter((row) => row.budget != null).length / Math.max(data.length, 1)) * 100),
      variance: total != null && compareTotal != null ? Hours.round2(total - compareTotal) : null,
      count: values.length,
    };
  }

  function historyRows(snapshot, cut) {
    if (cut === "program") return snapshot.milestones || [];
    if (cut === "edp") return snapshot.edps || [];
    if (cut === "epp") return snapshot.epps || [];
    return snapshot.products || [];
  }

  function snapshotValue(snapshot, state) {
    const summaryRow = snapshot.summary || {};
    const noEntityFilter = (!state.product || state.product === "all") && !state.q && !state.health;
    if (noEntityFilter) {
      if (state.metric === "cost") return state.cut === "program" ? summaryRow.programCost : (state.active ? summaryRow.activeCost : summaryRow.cost);
      if (state.metric === "logged") return state.cut === "program" ? summaryRow.programCost : (state.active ? summaryRow.activeLogged : summaryRow.logged);
      if (state.metric === "pending") return state.cut === "program" ? 0 : (state.active ? summaryRow.activePending : summaryRow.pending);
      if (state.metric === "mapping") return state.cut === "program" ? null : summaryRow.mappingCoveragePct;
    }
    const data = (historyRows(snapshot, state.cut) || []).filter((row) => {
      if (state.active && row.active === false) return false;
      if (state.product && state.product !== "all") {
        const products = row.products || [row.product || row.name];
        if (!products.includes(state.product)) return false;
      }
      if (state.milestone && !(row.milestones || []).includes(state.milestone)) return false;
      if (state.health && row.health !== state.health) return false;
      return includesText(row, state.q);
    });
    const metricKey = state.active && state.cut === "product"
      ? { cost: "activeCost", logged: "activeLogged", pending: "activePending" }[state.metric] || state.metric
      : state.metric;
    const values = data.map((row) => row[metricKey]).filter((value) => value != null).map(Number);
    if (!values.length) return null;
    if (state.metric === "mapping") {
      if (state.cut === "product") {
        const active = data.reduce((sum, row) => sum + Number(row.activeEdp || 0), 0);
        const confirmed = data.reduce((sum, row) => sum + Number(row.confirmed || 0), 0);
        return active ? Hours.round2((confirmed / active) * 100) : 0;
      }
      return Hours.round2(values.reduce((sum, value) => sum + value, 0) / values.length);
    }
    return Hours.round2(values.reduce((sum, value) => sum + value, 0));
  }

  function historySeries(state) {
    const snapshots = Hours.reportHistory();
    if (!snapshots.length) return [];
    const latest = new Date(snapshots[snapshots.length - 1].date + "T00:00:00Z").getTime();
    const rangeDays = state.range === "all" ? null : Number(state.range);
    return snapshots.map((snapshot) => ({
      date: snapshot.date,
      value: snapshotValue(snapshot, state),
    })).filter((point) => {
      if (point.value == null) return false;
      if (!rangeDays) return true;
      const time = new Date(point.date + "T00:00:00Z").getTime();
      return (latest - time) / 86400000 <= rangeDays;
    });
  }

  function forecast(points, horizonDays) {
    const valid = (points || []).filter((point) =>
      point.value != null && Number.isFinite(Number(point.value)) && !Number.isNaN(Date.parse(point.date))
    );
    if (valid.length < 3) return null;
    const first = Date.parse(valid[0].date);
    const xs = valid.map((point) => (Date.parse(point.date) - first) / 86400000);
    const span = Math.max(...xs) - Math.min(...xs);
    if (span < 14) return null;
    const ys = valid.map((point) => Number(point.value));
    const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
    const denominator = xs.reduce((sum, value) => sum + Math.pow(value - meanX, 2), 0);
    if (!denominator) return null;
    const slope = xs.reduce((sum, value, index) =>
      sum + (value - meanX) * (ys[index] - meanY), 0
    ) / denominator;
    const intercept = meanY - slope * meanX;
    const predicted = xs.map((x) => intercept + slope * x);
    const totalSquares = ys.reduce((sum, value) => sum + Math.pow(value - meanY, 2), 0);
    const residualSquares = ys.reduce((sum, value, index) =>
      sum + Math.pow(value - predicted[index], 2), 0
    );
    const days = Number(horizonDays) || 30;
    return {
      daily: Hours.round2(slope),
      weekly: Hours.round2(slope * 7),
      projected: Hours.round2(ys[ys.length - 1] + slope * days),
      horizonDays: days,
      r2: totalSquares ? Hours.round2(1 - residualSquares / totalSquares) : 1,
    };
  }

  function csv(data, state) {
    const columns = ["key", "title", "product", state.metric];
    if (state.compare !== "none") columns.push(state.compare);
    const quote = (value) => `"${String(value == null ? "" : value).replace(/"/g, '""')}"`;
    return [
      columns.join(","),
      ...data.map((row) => columns.map((column) => quote(row[column])).join(",")),
    ].join("\n");
  }

  window.Reporting = {
    METRICS,
    rows,
    summary,
    historySeries,
    forecast,
    csv,
    median,
    snapshotValue,
  };
})();
