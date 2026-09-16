(function () {
  const DEFAULTS = {
    cut: "product",
    metric: "cost",
    compare: "none",
    product: "all",
    active: true,
    health: "",
    q: "",
    top: "10",
    range: "30",
    milestone: "",
    selected: "",
  };
  const CUT_LABELS = {
    product: "Product line",
    program: "Program M1–M4",
    edp: "EDP",
    epp: "EPP",
  };
  const ALLOWED_METRICS = {
    product: ["cost", "logged", "budget", "remaining", "pending", "mapping"],
    program: ["cost", "logged", "budget", "remaining"],
    edp: ["cost", "logged", "budget", "remaining", "pending", "mapping"],
    epp: ["cost", "logged", "pending"],
  };
  const state = readState();
  const els = {
    cut: document.getElementById("report-cut"),
    metric: document.getElementById("report-metric"),
    compare: document.getElementById("report-compare"),
    product: document.getElementById("report-product"),
    active: document.getElementById("report-active"),
    health: document.getElementById("report-health"),
    q: document.getElementById("report-search"),
    top: document.getElementById("report-top"),
    range: document.getElementById("report-range"),
    reset: document.getElementById("report-reset"),
    export: document.getElementById("report-export"),
    summary: document.getElementById("report-summary"),
    workbenchChart: document.getElementById("workbench-chart"),
    workbenchTable: document.getElementById("workbench-table"),
    trendChart: document.getElementById("trend-chart"),
    trendSummary: document.getElementById("trend-summary"),
  };

  function readState() {
    const params = new URLSearchParams(location.search);
    const cut = params.get("cut") || localStorage.getItem("hours.reports.cut") || DEFAULTS.cut;
    return {
      cut: cut in CUT_LABELS ? cut : DEFAULTS.cut,
      metric: params.get("metric") || DEFAULTS.metric,
      compare: params.get("compare") || DEFAULTS.compare,
      product: params.get("product") || DEFAULTS.product,
      active: params.get("active") !== "0",
      health: params.get("health") || "",
      q: params.get("q") || "",
      top: params.get("top") || localStorage.getItem("hours.reports.top") || DEFAULTS.top,
      range: params.get("range") || DEFAULTS.range,
      milestone: params.get("ms") || "",
      selected: params.get("select") || "",
    };
  }

  function writeState() {
    const params = new URLSearchParams();
    if (state.cut !== DEFAULTS.cut) params.set("cut", state.cut);
    if (state.metric !== DEFAULTS.metric) params.set("metric", state.metric);
    if (state.compare !== DEFAULTS.compare) params.set("compare", state.compare);
    if (state.product !== DEFAULTS.product) params.set("product", state.product);
    if (!state.active) params.set("active", "0");
    if (state.health) params.set("health", state.health);
    if (state.q) params.set("q", state.q);
    if (state.top !== DEFAULTS.top) params.set("top", state.top);
    if (state.range !== DEFAULTS.range) params.set("range", state.range);
    if (state.milestone) params.set("ms", state.milestone);
    if (state.selected) params.set("select", state.selected);
    const query = params.toString();
    history.replaceState(null, "", location.pathname + (query ? "?" + query : "") + location.hash);
    localStorage.setItem("hours.reports.cut", state.cut);
    localStorage.setItem("hours.reports.top", state.top);
  }

  function setState(patch) {
    Object.assign(state, patch);
    enforceState();
    writeState();
    syncControls();
    render();
  }

  function enforceState() {
    if (!(state.cut in CUT_LABELS)) state.cut = DEFAULTS.cut;
    if (!ALLOWED_METRICS[state.cut].includes(state.metric)) state.metric = "cost";
    if (!["none", "logged", "budget"].includes(state.compare)) state.compare = "none";
    if (state.compare === state.metric) state.compare = "none";
    if (!["10", "25", "all"].includes(state.top)) state.top = "10";
    if (!["30", "90", "all"].includes(state.range)) state.range = "30";
    if (state.cut === "program") {
      state.active = false;
      state.product = "all";
    }
    if (state.cut !== "edp") state.health = "";
    if (state.cut !== "epp") state.milestone = "";
  }

  function populateProducts() {
    els.product.innerHTML = `<option value="all">All</option>` + Hours.productRows().map((row) =>
      `<option value="${Hours.esc(row.name)}">${Hours.esc(row.name)}</option>`
    ).join("");
  }

  function syncControls() {
    els.cut.value = state.cut;
    els.metric.value = state.metric;
    els.compare.value = state.compare;
    els.product.value = state.product;
    els.active.checked = state.active;
    els.health.value = state.health;
    els.q.value = state.q;
    els.top.value = state.top;
    els.range.value = state.range;
    const program = state.cut === "program";
    els.active.disabled = program;
    els.health.disabled = program || state.cut === "product";
    els.product.disabled = program;
    Array.from(els.metric.options).forEach((option) => {
      option.disabled = !ALLOWED_METRICS[state.cut].includes(option.value);
    });
    Array.from(els.compare.options).forEach((option) => {
      option.disabled = option.value === state.metric
        || (option.value === "budget" && !["product", "program", "edp"].includes(state.cut));
    });
  }

  function metricFormat(value, metric) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    if (metric === "mapping") return Hours.fmtNum(value) + "%";
    return Hours.fmtNum(value);
  }

  function renderSummary(data) {
    const values = Reporting.summary(data, state);
    const cells = [
      [state.metric === "mapping" ? "Coverage" : "Total", values.total, state.metric],
      ["Average", values.average, state.metric],
      ["Median", values.median, state.metric],
      ["Maximum", values.maximum, state.metric],
      [state.metric === "mapping" ? "Rows" : "Budgeted", state.metric === "mapping" ? values.count : values.coverage, state.metric === "mapping" ? "plain" : "mapping"],
      ["Variance", values.variance, state.metric],
    ];
    els.summary.innerHTML = cells.map(([label, value, metric], index) =>
      `<div class="report-kpi${index === 0 ? " is-lead" : ""}${value != null && value < 0 ? " is-over" : ""}">
        <b>${Hours.esc(metricFormat(value, metric))}</b><span>${Hours.esc(label)}</span>
      </div>`
    ).join("");
  }

  function drill(row) {
    if (!row) return;
    if (row.type === "product") {
      setState({ cut: "edp", product: row.name, metric: "cost", compare: "none", selected: "" });
      return;
    }
    if (row.type === "milestone") {
      setState({ cut: "epp", milestone: row.key, metric: "cost", compare: "none", selected: "" });
      return;
    }
    setState({ selected: state.selected === row.key ? "" : row.key });
  }

  function renderWorkbench(data) {
    const metric = Reporting.METRICS[state.metric];
    const series = [{ key: state.metric, label: metric.label, fill: Charts.ink }];
    if (state.compare !== "none" && data.some((row) => row[state.compare] != null)) {
      series.push({
        key: state.compare,
        label: Reporting.METRICS[state.compare].label,
        fill: Charts.copperSoft,
      });
    }
    Charts.hbar(els.workbenchChart, {
      title: metric.label,
      rows: data,
      series,
      rowH: 38,
      barH: series.length > 1 ? 7 : 10,
      padL: state.cut === "product" ? 210 : 150,
      padR: 78,
      showValues: true,
      selectedKeys: new Set(state.selected ? [state.selected] : []),
      onSelect: drill,
      legend: series.length > 1 ? series.map((item) => item.label).join(" · ") : "",
    });
  }

  function jiraKey(row) {
    if (!["edp", "epp"].includes(row.type)) return Hours.esc(row.key || "");
    const href = Hours.jiraHref(row);
    return href
      ? `<a class="key" href="${Hours.esc(href)}" target="_blank" rel="noreferrer">${Hours.esc(row.key)}</a>`
      : Hours.esc(row.key || "");
  }

  function rowTitle(row) {
    if (row.type === "product") {
      return `<a href="${Hours.esc(Hours.lineHref(row.name))}">${Hours.esc(row.name)}</a>`;
    }
    if (row.type === "milestone") {
      return `<a href="delivery.html?view=milestone&amp;milestone=${encodeURIComponent(row.key)}">${Hours.esc(row.name)}</a>`;
    }
    if (row.type === "edp") {
      const href = Hours.lineHref(row.product) + "#" + encodeURIComponent(row.key || "");
      return `<a href="${Hours.esc(href)}">${Hours.esc(row.title || "")}</a>`;
    }
    return Hours.esc(row.title || "");
  }

  function renderTable(data) {
    const compareHead = state.compare === "none" ? "" : `<th class="num">${Hours.esc(Reporting.METRICS[state.compare].label)}</th>`;
    const compareCells = (row) => state.compare === "none"
      ? ""
      : `<td class="num mono">${Hours.esc(metricFormat(row[state.compare], state.compare))}</td>`;
    els.workbenchTable.innerHTML = `<h2>${Hours.esc(CUT_LABELS[state.cut])}</h2>
      <div class="table-wrap"><table class="data report-data">
        <thead><tr><th>Key</th><th></th><th class="num">${Hours.esc(Reporting.METRICS[state.metric].label)}</th>${compareHead}</tr></thead>
        <tbody>${data.map((row) => `<tr${state.selected === row.key ? ` class="is-selected"` : ""} data-select-row="${Hours.esc(row.key || "")}">
          <td>${jiraKey(row)}</td>
          <td>${rowTitle(row)}</td>
          <td class="num mono">${Hours.esc(metricFormat(row[state.metric], state.metric))}</td>
          ${compareCells(row)}
        </tr>`).join("")}</tbody>
      </table></div>`;
  }

  function renderFixed() {
    const products = Hours.reportProductRows()
      .filter((row) => row.name !== "Unclassified" && row.cost > 0);
    Charts.hbar(document.getElementById("byProduct"), {
      title: "Product line",
      rows: products,
      series: [{ key: "cost", label: "Cost", fill: Charts.ink }],
      rowH: 38,
      barH: 10,
      showValues: true,
      padL: 190,
      padR: 72,
      onSelect: drill,
    });
    Charts.hbar(document.getElementById("byMilestone"), {
      title: "Program M1–M4",
      rows: Hours.reportMilestoneRows(),
      series: [{ key: "cost", label: "Cost", fill: Charts.ink }],
      rowH: 48,
      barH: 12,
      showValues: true,
      padL: 270,
      padR: 72,
      onSelect: drill,
      legend: "Program " + Hours.fmtNum(Hours.overview().programUniqueHours) + " h",
    });
  }

  function renderTrend() {
    const points = Reporting.historySeries(state);
    const metric = Reporting.METRICS[state.metric];
    Charts.line(els.trendChart, { title: metric.label, rows: points });
    const first = points[0];
    const last = points[points.length - 1];
    const delta = points.length > 1 && first && last ? Hours.round2(last.value - first.value) : null;
    const model = ["cost", "logged", "pending"].includes(state.metric)
      ? Reporting.forecast(points, 30)
      : null;
    const cells = [
      ["Change", delta, state.metric],
      ["Weekly", model && model.weekly, state.metric],
      ["30d", model && model.projected, state.metric],
      ["R²", model && model.r2, "plain"],
    ];
    els.trendSummary.innerHTML = cells.map(([label, value, metricName]) =>
      `<div><b>${Hours.esc(metricName === "plain" ? (value == null ? "—" : Hours.fmtNum(value)) : metricFormat(value, metricName))}</b><span>${Hours.esc(label)}</span></div>`
    ).join("");
  }

  function renderSecondary() {
    const budgeted = []
      .concat(
        Hours.reportProductRows().filter((row) => row.budget != null),
        Hours.reportMilestoneRows().filter((row) => row.budget != null),
        normalizedBudgetEdps()
      )
      .sort((a, b) => Number(a.remaining) - Number(b.remaining))
      .slice(0, 10);
    const budgetEl = document.getElementById("spentBudget");
    if (budgeted.length) {
      Charts.hbar(budgetEl, {
        title: "Budget",
        rows: budgeted,
        series: [
          { key: "cost", label: "Cost", fill: Charts.ink },
          { key: "budget", label: "Budget", fill: Charts.copperSoft },
        ],
        rowH: 38,
        barH: 7,
        padR: 72,
        showValues: true,
      });
    } else {
      budgetEl.innerHTML = `<h2>Budget</h2><div class="empty-mini">—</div>`;
    }

    const health = Hours.healthCounts(true);
    Charts.stacked(document.getElementById("health"), {
      title: "Health",
      segments: [
        { key: "confirmed", label: "Confirmed", value: health.confirmed, fill: Charts.ink },
        { key: "pending", label: "Pending", value: health.pending, fill: Charts.copper },
        { key: "none", label: "None", value: health.none, fill: Charts.copperSoft },
      ],
      onSelect: (segment) => setState({ cut: "edp", health: segment.key, metric: "cost", selected: "" }),
    });

    Charts.hbar(document.getElementById("topEdps"), {
      title: "Concentration",
      rows: Hours.topEdps(8).map((row) => ({
        key: row.key, label: row.key, cost: row.uniqueSpentHours, href: row.href, external: true,
      })),
      series: [{ key: "cost", label: "Cost", fill: Charts.ink }],
      rowH: 34,
      barH: 9,
      showValues: true,
      padR: 72,
    });

    const shared = Hours.topSharedEpps(8);
    const sharedEl = document.getElementById("shared");
    if (shared.length) {
      Charts.hbar(sharedEl, {
        title: "Shared",
        rows: shared.map((row) => ({
          key: row.key, label: row.key, logged: row.hours, href: row.href, external: true,
        })),
        series: [{ key: "logged", label: "Logged", fill: Charts.copper }],
        rowH: 34,
        barH: 9,
        showValues: true,
        padR: 72,
      });
    } else {
      sharedEl.innerHTML = `<h2>Shared</h2><div class="empty-mini">—</div>`;
    }
  }

  function normalizedBudgetEdps() {
    return Hours.edpRows().filter((row) => row.budget != null).map((row) => ({
      key: row.key,
      label: row.key,
      cost: row.uniqueSpentHours,
      budget: row.budget,
      remaining: row.remaining,
      href: row.href,
      external: true,
    }));
  }

  function render() {
    const data = Reporting.rows(state);
    renderSummary(data);
    renderWorkbench(data);
    renderTable(data);
    renderTrend();
  }

  function downloadCsv() {
    const blob = new Blob([Reporting.csv(Reporting.rows(state), state)], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `hours-report-${state.cut}-${state.metric}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function bind() {
    [
      [els.cut, "cut"], [els.metric, "metric"], [els.compare, "compare"],
      [els.product, "product"], [els.health, "health"], [els.top, "top"], [els.range, "range"],
    ].forEach(([element, key]) => element.addEventListener("change", () => setState({ [key]: element.value, selected: "" })));
    els.active.addEventListener("change", () => setState({ active: els.active.checked, selected: "" }));
    els.q.addEventListener("input", () => setState({ q: els.q.value, selected: "" }));
    els.reset.addEventListener("click", () => setState(Object.assign({}, DEFAULTS)));
    els.export.addEventListener("click", downloadCsv);
    els.workbenchTable.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      const row = event.target.closest("[data-select-row]");
      if (row) setState({ selected: row.getAttribute("data-select-row") || "" });
    });
    document.addEventListener("keydown", (event) => {
      if (event.target.matches("input, select, textarea")) return;
      if (event.key === "/") {
        event.preventDefault();
        els.q.focus();
      } else if (event.key === "Escape") {
        setState({ selected: "" });
      } else if (event.key.toLowerCase() === "r") {
        setState(Object.assign({}, DEFAULTS));
      }
    });
  }

  populateProducts();
  enforceState();
  syncControls();
  bind();
  renderFixed();
  renderSecondary();
  render();
  if (location.hash) {
    const target = document.querySelector(location.hash);
    if (target) target.scrollIntoView({ block: "start" });
  }
})();
