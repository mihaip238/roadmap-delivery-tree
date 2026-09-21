(function () {
  const DEFAULTS = {
    mode: "product",
    cut: "product",
    metric: "cost",
    compare: "none",
    product: "all",
    milestone: "",
    case: "",
    active: true,
    health: "",
    q: "",
    top: "10",
    range: "30",
    selected: "",
  };
  const METRIC_LABELS = {
    cost: "Cost",
    logged: "Logged",
    budget: "Budget",
    remaining: "Left",
    pending: "Pending",
    mapping: "Mapping",
    allocated: "Allocated",
    associated: "Associated",
    unallocated: "Unallocated",
    etc: "ETC",
    fac: "FAC",
  };
  const state = readState();
  const els = {
    mode: document.getElementById("report-mode"),
    metric: document.getElementById("report-metric"),
    compare: document.getElementById("report-compare"),
    range: document.getElementById("report-range"),
    snapshot: document.getElementById("report-snapshot"),
    active: document.getElementById("report-active"),
    activeWrap: document.getElementById("report-active-wrap"),
    product: document.getElementById("report-product"),
    productWrap: document.getElementById("report-product-wrap"),
    milestone: document.getElementById("report-milestone"),
    milestoneWrap: document.getElementById("report-milestone-wrap"),
    case: document.getElementById("report-case"),
    caseWrap: document.getElementById("report-case-wrap"),
    health: document.getElementById("report-health"),
    healthWrap: document.getElementById("report-health-wrap"),
    q: document.getElementById("report-search"),
    top: document.getElementById("report-top"),
    reset: document.getElementById("report-reset"),
    export: document.getElementById("report-export"),
    drillBack: document.getElementById("report-drill-back"),
    drillLabel: document.getElementById("report-drill-label"),
    summary: document.getElementById("report-summary"),
    primary: document.getElementById("primary-chart"),
    composition: document.getElementById("composition-chart"),
    trend: document.getElementById("trend-chart"),
    trendSummary: document.getElementById("trend-summary"),
    concentration: document.getElementById("concentration-chart"),
    shared: document.getElementById("shared-chart"),
    table: document.getElementById("report-table"),
    detailTitle: document.getElementById("detail-title"),
    detailCount: document.getElementById("detail-count"),
  };
  let resizeTimer = null;

  function readState() {
    const params = new URLSearchParams(location.search);
    const legacyCut = params.get("cut") || "";
    const mode = params.get("mode")
      || (legacyCut === "program" || legacyCut === "epp" ? "program" : legacyCut === "case" ? "case" : "")
      || localStorage.getItem("hours.reports.mode")
      || DEFAULTS.mode;
    const grain = params.get("grain") || legacyCut;
    const cut = mode === "program"
      ? (grain === "epp" ? "epp" : "program")
      : mode === "case"
        ? (grain === "edp" ? "edp" : "case")
        : (grain === "edp" ? "edp" : "product");
    return {
      mode: ["program", "case"].includes(mode) ? mode : "product",
      cut,
      metric: params.get("metric") || DEFAULTS.metric,
      compare: params.get("compare") || DEFAULTS.compare,
      product: params.get("product") || DEFAULTS.product,
      milestone: params.get("ms") || "",
      case: params.get("case") || "",
      active: params.get("active") !== "0",
      health: params.get("health") || "",
      q: params.get("q") || "",
      top: params.get("top") || localStorage.getItem("hours.reports.top") || DEFAULTS.top,
      range: params.get("range") || DEFAULTS.range,
      selected: params.get("select") || "",
    };
  }

  function hasBudgets() {
    if (state.mode === "case") {
      if (state.cut === "edp") return false;
      return Hours.caseRows().some((row) =>
        row.budget != null && (!state.case || row.id === state.case)
      );
    }
    if (state.mode === "program") {
      if (state.cut === "epp") return false;
      return Hours.reportMilestoneRows().some((row) => row.budget != null);
    }
    if (state.cut === "edp") {
      return Hours.edpRows().some((row) => {
        if (state.active && !row.active) return false;
        if (state.product !== "all" && row.product !== state.product && !(row.alsoIn || []).includes(state.product)) return false;
        return row.budget != null;
      });
    }
    return Hours.reportProductRows().some((row) =>
      row.budget != null && (state.product === "all" || row.name === state.product)
    );
  }

  function enforceState() {
    state.mode = ["program", "case"].includes(state.mode) ? state.mode : "product";
    if (state.mode === "program") {
      state.cut = state.cut === "epp" ? "epp" : "program";
      state.active = false;
      state.health = "";
      state.product = "all";
      if (!["cost", "logged", "budget", "remaining"].includes(state.metric)) state.metric = "cost";
    } else if (state.mode === "case") {
      state.cut = state.cut === "edp" ? "edp" : "case";
      state.active = false;
      state.health = "";
      state.product = "all";
      state.milestone = "";
      if (!["allocated", "associated", "unallocated", "etc", "fac", "budget", "remaining", "pending"].includes(state.metric)) state.metric = "fac";
    } else {
      state.cut = state.cut === "edp" ? "edp" : "product";
      state.milestone = "";
      if (!["cost", "logged", "budget", "remaining", "pending", "mapping"].includes(state.metric)) state.metric = "cost";
    }
    if (!["none", "logged", "budget", "fac"].includes(state.compare)
      || state.compare === state.metric
      || !["cost", "allocated", "fac"].includes(state.metric)) state.compare = "none";
    if (!["10", "25", "all"].includes(state.top)) state.top = "10";
    if (!["30", "90", "all"].includes(state.range)) state.range = "30";
    if (!hasBudgets() && ["budget", "remaining"].includes(state.metric)) state.metric = "cost";
    if (!hasBudgets() && state.compare === "budget") state.compare = "none";
  }

  function writeState() {
    const params = new URLSearchParams();
    if (state.mode !== DEFAULTS.mode) params.set("mode", state.mode);
    const rootCut = state.mode === "program" ? "program" : state.mode === "case" ? "case" : "product";
    if (state.cut !== rootCut) params.set("grain", state.cut);
    if (state.metric !== DEFAULTS.metric) params.set("metric", state.metric);
    if (state.compare !== DEFAULTS.compare) params.set("compare", state.compare);
    if (state.product !== DEFAULTS.product) params.set("product", state.product);
    if (state.milestone) params.set("ms", state.milestone);
    if (state.case) params.set("case", state.case);
    if (state.mode === "product" && !state.active) params.set("active", "0");
    if (state.health) params.set("health", state.health);
    if (state.q) params.set("q", state.q);
    if (state.top !== DEFAULTS.top) params.set("top", state.top);
    if (state.range !== DEFAULTS.range) params.set("range", state.range);
    if (state.selected) params.set("select", state.selected);
    const query = params.toString();
    history.replaceState(null, "", location.pathname + (query ? "?" + query : "") + location.hash);
    localStorage.setItem("hours.reports.mode", state.mode);
    localStorage.setItem("hours.reports.top", state.top);
  }

  function setState(patch) {
    Object.assign(state, patch);
    enforceState();
    writeState();
    syncControls();
    render();
  }

  function populateFilters() {
    els.product.innerHTML = `<option value="all">All</option>` + Hours.productRows().map((row) =>
      `<option value="${Hours.esc(row.name)}">${Hours.esc(row.name)}</option>`
    ).join("");
    els.milestone.innerHTML = `<option value="">All</option>` + Hours.milestoneRows().map((row) =>
      `<option value="${Hours.esc(row.key)}">${Hours.esc(row.key + " " + row.name)}</option>`
    ).join("");
    els.case.innerHTML = `<option value="">All</option>` + Hours.caseRows().map((row) =>
      `<option value="${Hours.esc(row.id)}">${Hours.esc(row.id + " " + (row.title || ""))}</option>`
    ).join("");
  }

  function syncControls() {
    els.mode.value = state.mode;
    els.metric.value = state.metric;
    els.compare.value = state.compare;
    els.range.value = state.range;
    els.active.checked = state.active;
    els.product.value = state.product;
    els.milestone.value = state.milestone;
    els.case.value = state.case;
    els.health.value = state.health;
    els.q.value = state.q;
    els.top.value = state.top;
    els.snapshot.textContent = Hours.fmtWhen(Hours.fetchedAt()).replace(" UTC", "");

    const program = state.mode === "program";
    const cases = state.mode === "case";
    els.activeWrap.hidden = program || cases;
    els.productWrap.hidden = program || cases;
    els.healthWrap.hidden = program || cases;
    els.milestoneWrap.hidden = !program;
    els.caseWrap.hidden = !cases;
    const budgeted = hasBudgets();
    Array.from(els.metric.options).forEach((option) => {
      const programBlocked = ["pending", "mapping"].includes(option.value);
      const caseBlocked = ["mapping", "logged", "cost"].includes(option.value);
      const caseOnly = ["allocated", "associated", "unallocated", "etc", "fac"].includes(option.value);
      const needsBudget = ["budget", "remaining"].includes(option.value);
      option.disabled = (program && (programBlocked || caseOnly))
        || (cases && caseBlocked)
        || (!cases && caseOnly)
        || (needsBudget && !budgeted);
    });
    Array.from(els.compare.options).forEach((option) => {
      option.disabled = option.value !== "none" && (
        !["cost", "allocated", "fac"].includes(state.metric)
        || option.value === state.metric
        || (option.value === "logged" && cases)
        || (option.value === "budget" && !budgeted)
        || (option.value === "fac" && !cases)
        || (state.cut === "epp" && option.value === "budget")
      );
    });

    const drilled = state.cut === "edp" || state.cut === "epp";
    els.drillBack.hidden = !drilled;
    els.drillLabel.textContent = drilled
      ? (state.mode === "case" ? state.case : state.cut === "edp" ? state.product : state.milestone)
      : "";
  }

  function reportState(metric, overrides) {
    return Object.assign({}, state, {
      metric,
      compare: "none",
      top: "all",
      q: "",
      selected: "",
    }, overrides || {});
  }

  function metricTotal(metric, overrides) {
    const scoped = reportState(metric, overrides);
    const rows = Reporting.rows(scoped);
    return Reporting.summary(rows, scoped).total;
  }

  function metricFormat(value, metric) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    if (metric === "mapping") return Hours.fmtNum(value) + "%";
    return Hours.fmtNum(value);
  }

  function renderKpis() {
    const cost = state.mode === "case" ? metricTotal("allocated") : metricTotal("cost");
    const budget = hasBudgets() ? metricTotal("budget") : null;
    const left = hasBudgets() ? metricTotal("remaining") : null;
    const trendPoints = Reporting.historySeries(reportState("cost"));
    const model = Reporting.forecast(trendPoints, 30);
    let cells;
    if (state.mode === "case") {
      cells = [
        ["Allocated", cost, "hours"],
        ["FAC", metricTotal("fac"), "hours"],
        ["Budget", budget, "hours"],
        ["Left", left, "hours"],
        ["ETC", metricTotal("etc"), "hours"],
        ["Holes", metricTotal("holes"), "hours"],
      ];
    } else if (state.mode === "program") {
      const epps = Hours.reportEppRows().filter((row) =>
        (row.milestones || []).length
        && (!state.milestone || row.milestones.includes(state.milestone))
      );
      cells = [
        ["Cost", cost, "hours"],
        ["Budget", budget, "hours"],
        ["Left", left, "hours"],
        ["EPPs", epps.length, "plain"],
        ["30d", model && model.projected, "hours"],
      ];
    } else {
      cells = [
        ["Cost", cost, "hours"],
        ["Budget", budget, "hours"],
        ["Left", left, "hours"],
        ["Mapping", metricTotal("mapping"), "mapping"],
        ["Pending", metricTotal("pending"), "hours"],
        ["30d", model && model.projected, "hours"],
      ];
    }
    els.summary.innerHTML = cells.map(([label, value, kind], index) =>
      `<div class="report-kpi${index === 0 ? " is-lead" : ""}${value != null && value < 0 ? " is-over" : ""}">
        <b>${Hours.esc(kind === "mapping" ? metricFormat(value, "mapping") : metricFormat(value, "plain"))}</b>
        <span>${Hours.esc(label)}</span>
      </div>`
    ).join("");
  }

  function scopedEdps(ignoreHealth) {
    return Hours.uniqueEdps().filter((edp) => {
      if (state.active && !edp.active) return false;
      if (state.product !== "all" && edp.productLabel !== state.product && !(edp.alsoIn || []).includes(state.product)) return false;
      if (!ignoreHealth && state.health && Hours.health(edp) !== state.health) return false;
      if (state.q) {
        const haystack = `${edp.key || ""} ${edp.title || ""}`.toLowerCase();
        if (!haystack.includes(state.q.toLowerCase())) return false;
      }
      return true;
    });
  }

  function drill(row) {
    if (!row) return;
    if (state.cut === "product" && row.type === "product") {
      setState({ cut: "edp", product: row.name, selected: "", q: "" });
      return;
    }
    if (state.cut === "program" && row.type === "milestone") {
      setState({ cut: "epp", milestone: row.key, selected: "", q: "" });
      return;
    }
    if (state.cut === "case" && row.type === "case") {
      setState({ cut: "edp", case: row.id, metric: "cost", compare: "none", selected: "", q: "" });
      return;
    }
    setState({ selected: state.selected === row.key ? "" : row.key });
  }

  function currentRows() {
    return Reporting.rows(state);
  }

  function renderPrimary(data) {
    const metric = METRIC_LABELS[state.metric];
    if (state.compare !== "none" && data.some((row) => row[state.compare] != null)) {
      Charts.dumbbell(els.primary, {
        title: `${metric} / ${METRIC_LABELS[state.compare]}`,
        rows: data,
        startKey: state.metric,
        endKey: state.compare,
        startLabel: metric,
        endLabel: METRIC_LABELS[state.compare],
        onSelect: drill,
      });
      return;
    }
    Charts.hbar(els.primary, {
      title: state.metric === "remaining" ? "Variance" : metric,
      rows: data,
      series: [{ key: state.metric, label: metric, fill: Charts.ink }],
      rowH: 40,
      barH: 11,
      showValues: true,
      selectedKeys: new Set(state.selected ? [state.selected] : []),
      onSelect: drill,
    });
  }

  function renderComposition() {
    if (state.mode === "case") {
      const cases = Reporting.rows(Object.assign({}, state, {
        cut: "case", metric: "associated", compare: "none", top: "all",
      }));
      const allocated = cases.reduce((sum, row) => sum + Number(row.allocated || 0), 0);
      const unallocated = cases.reduce((sum, row) => sum + Number(row.unallocated || 0), 0);
      const pending = cases.reduce((sum, row) => sum + Number(row.pending || 0), 0);
      Charts.donut(els.composition, {
        title: "Control",
        centerLabel: "Hours",
        segments: [
          { key: "allocated", label: "Allocated", value: allocated, fill: Charts.ink },
          { key: "unallocated", label: "Unallocated", value: unallocated, fill: Charts.copperSoft },
          { key: "pending", label: "Pending", value: pending, fill: Charts.copper },
        ],
      });
      return;
    }
    if (state.mode === "product") {
      const counts = { confirmed: 0, pending: 0, none: 0 };
      scopedEdps(true).forEach((edp) => {
        const health = Hours.health(edp);
        counts[health in counts ? health : "none"] += 1;
      });
      Charts.donut(els.composition, {
        title: "Mapping",
        centerLabel: "EDPs",
        segments: [
          { key: "confirmed", label: "Confirmed", value: counts.confirmed, fill: Charts.ink },
          { key: "pending", label: "Pending", value: counts.pending, fill: Charts.copper },
          { key: "none", label: "None", value: counts.none, fill: Charts.copperSoft },
        ],
        onSelect: (segment) => setState({ cut: "edp", health: segment.key, selected: "", q: "" }),
      });
      return;
    }
    if (state.cut === "epp") {
      const rows = currentRows().map((row) => Object.assign({}, row, {
        count: (row.owners || []).length,
      }));
      Charts.hbar(els.composition, {
        title: "EDP refs",
        rows,
        series: [{ key: "count", label: "EDPs", fill: Charts.ink }],
        rowH: 36,
        showValues: true,
      });
      return;
    }
    Charts.hbar(els.composition, {
      title: "EPPs",
      rows: Hours.reportMilestoneRows(),
      series: [{ key: "count", label: "EPPs", fill: Charts.ink }],
      rowH: 42,
      showValues: true,
      onSelect: drill,
    });
  }

  function renderTrend() {
    const points = Reporting.historySeries(state);
    Charts.line(els.trend, {
      title: `${METRIC_LABELS[state.metric]} trend`,
      rows: points,
      zero: ["cost", "logged", "pending", "budget", "allocated", "associated", "unallocated", "etc", "fac"].includes(state.metric),
    });
    const first = points[0];
    const last = points[points.length - 1];
    const delta = points.length > 1 ? Hours.round2(last.value - first.value) : null;
    const model = ["cost", "logged", "pending", "allocated", "fac"].includes(state.metric)
      ? Reporting.forecast(points, 30)
      : null;
    const cells = [
      ["Change", delta, state.metric],
      ["Weekly", model && model.weekly, state.metric],
      ["30d", model && model.projected, state.metric],
      ["R²", model && model.r2, "plain"],
    ];
    els.trendSummary.innerHTML = cells.map(([label, value, metric]) =>
      `<div><b>${Hours.esc(metricFormat(value, metric))}</b><span>${Hours.esc(label)}</span></div>`
    ).join("");
  }

  function renderSecondary() {
    let concentrationRows;
    if (state.mode === "case") {
      const caseRows = Hours.caseRows().filter((row) => !state.case || row.id === state.case);
      const edpKeys = new Set(caseRows.flatMap((row) => row.edps || []));
      concentrationRows = Reporting.rows({
        mode: "case", cut: "edp", case: state.case, metric: "cost", compare: "none",
        product: "all", milestone: "", active: false, health: "", q: "", top: "10",
      }).filter((row) => edpKeys.has(row.key));
      Charts.pareto(els.concentration, {
        title: "Concentration",
        rows: concentrationRows,
        valueKey: "cost",
      });
      Charts.hbar(els.shared, {
        title: "Unallocated",
        rows: caseRows,
        series: [{ key: "unallocated", label: "Unallocated", fill: Charts.copper }],
        rowH: 36,
        showValues: true,
        onSelect: drill,
      });
      return;
    } else if (state.mode === "program") {
      concentrationRows = Reporting.rows(Object.assign({}, state, {
        cut: "epp",
        metric: "cost",
        compare: "none",
        top: "10",
        q: "",
      }));
    } else {
      concentrationRows = Reporting.rows(Object.assign({}, state, {
        cut: "edp",
        metric: "cost",
        compare: "none",
        top: "10",
        q: "",
      }));
    }
    Charts.pareto(els.concentration, {
      title: "Concentration",
      rows: concentrationRows,
      valueKey: "cost",
    });

    if (state.mode === "program") {
      const epps = Reporting.rows(Object.assign({}, state, {
        cut: "epp",
        metric: "logged",
        compare: "none",
        top: "10",
        q: "",
      }));
      Charts.hbar(els.shared, {
        title: "EPP logged",
        rows: epps,
        series: [{ key: "logged", label: "Logged", fill: Charts.ink }],
        rowH: 36,
        showValues: true,
      });
      return;
    }
    const allowed = new Set(scopedEdps(false).map((edp) => edp.key));
    const shared = Hours.topSharedEpps(25).filter((row) =>
      (row.edps || []).some((key) => allowed.has(key))
    ).slice(0, state.top === "all" ? 25 : Number(state.top));
    if (!shared.length) {
      els.shared.innerHTML = `<h2>Shared</h2><div class="empty-mini">—</div>`;
      return;
    }
    Charts.hbar(els.shared, {
      title: "Shared",
      rows: shared.map((row) => ({
        key: row.key,
        label: row.key,
        logged: row.hours,
        href: row.href,
        external: true,
      })),
      series: [{ key: "logged", label: "Logged", fill: Charts.copper }],
      rowH: 36,
      showValues: true,
    });
  }

  function keyCell(row) {
    if (!["edp", "epp"].includes(row.type)) return Hours.esc(row.key || "");
    const href = Hours.jiraHref(row);
    return href
      ? `<a class="key" href="${Hours.esc(href)}" target="_blank" rel="noreferrer">${Hours.esc(row.key)}</a>`
      : Hours.esc(row.key || "");
  }

  function titleCell(row) {
    if (row.type === "case") return `<a href="${Hours.esc(row.href)}">${Hours.esc(row.title || row.id || "")}</a>`;
    if (row.type === "product") return `<a href="${Hours.esc(Hours.lineHref(row.name))}">${Hours.esc(row.name)}</a>`;
    if (row.type === "milestone") {
      return `<a href="delivery.html?view=milestone&amp;milestone=${encodeURIComponent(row.key)}">${Hours.esc(row.name)}</a>`;
    }
    if (row.type === "edp") {
      return `<a href="${Hours.esc(Hours.lineHref(row.product) + "#" + encodeURIComponent(row.key || ""))}">${Hours.esc(row.title || "")}</a>`;
    }
    return Hours.esc(row.title || "");
  }

  function numberCell(value, metric) {
    return `<td class="num mono">${Hours.esc(metricFormat(value, metric))}</td>`;
  }

  function renderTable(data) {
    els.detailTitle.textContent = state.cut === "product"
      ? "Product line"
      : state.cut === "program" ? "Milestone" : state.cut === "case" ? "Case" : state.cut.toUpperCase();
    els.detailCount.textContent = `${data.length} rows`;
    const productMode = state.mode === "product";
    const caseMode = state.mode === "case" && state.cut === "case";
    const header = caseMode
      ? `<th>Key</th><th>Item</th><th class="num">Associated h</th><th class="num">Allocated h</th><th class="num">ETC h</th><th class="num">FAC h</th><th class="num">Budget h</th><th class="num">Left h</th><th class="num">Holes h</th>`
      : productMode
      ? `<th>Key</th><th>Item</th><th class="num">Cost h</th><th class="num">Logged h</th><th class="num">Budget h</th><th class="num">Left h</th><th class="num">Pending h</th><th class="num">Mapping</th><th>Shared</th>`
      : `<th>Key</th><th>Item</th><th class="num">Cost h</th><th class="num">Logged h</th><th class="num">Budget h</th><th class="num">Left h</th><th>EDPs</th><th>Products</th>`;
    const body = data.map((row) => {
      const shared = (row.sharedWith || row.sharedEpps || []).join(" ");
      const owners = (row.owners || []).join(" ");
      const products = (row.products || []).join(", ");
      return `<tr${state.selected === row.key ? ` class="is-selected"` : ""} data-select-row="${Hours.esc(row.key || "")}">
        <td>${keyCell(row)}</td><td>${titleCell(row)}</td>
        ${caseMode
          ? `${numberCell(row.associated, "associated")}${numberCell(row.allocated, "allocated")}${numberCell(row.etc, "etc")}${numberCell(row.fac, "fac")}${numberCell(row.budget, "budget")}${numberCell(row.remaining, "remaining")}${numberCell(row.holes, "holes")}`
          : `${numberCell(row.cost, "cost")}${numberCell(row.logged, "logged")}
        ${numberCell(row.budget, "budget")}${numberCell(row.remaining, "remaining")}
        ${productMode
          ? `${numberCell(row.pending, "pending")}${numberCell(row.mapping, "mapping")}<td class="mono muted">${Hours.esc(shared)}</td>`
          : `<td class="mono muted">${Hours.esc(owners)}</td><td>${Hours.esc(products)}</td>`}`}
      </tr>`;
    }).join("");
    els.table.innerHTML = `<table class="data report-data"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function render() {
    const data = currentRows();
    renderKpis();
    renderPrimary(data);
    renderComposition();
    renderTrend();
    renderSecondary();
    renderTable(data);
  }

  function downloadCsv() {
    const blob = new Blob([Reporting.csv(currentRows(), state)], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `hours-report-${state.mode}-${state.cut}.csv`;
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
  }

  function bind() {
    els.mode.addEventListener("change", () => {
      const mode = els.mode.value;
      setState(Object.assign({}, DEFAULTS, {
        mode,
        cut: mode === "program" ? "program" : mode === "case" ? "case" : "product",
        metric: mode === "case" ? "fac" : "cost",
        active: mode === "product",
      }));
    });
    [
      [els.metric, "metric"], [els.compare, "compare"], [els.range, "range"],
      [els.product, "product"], [els.top, "top"],
    ].forEach(([element, key]) => element.addEventListener("change", () =>
      setState({ [key]: element.value, selected: "" })
    ));
    els.milestone.addEventListener("change", () => setState({
      cut: els.milestone.value ? "epp" : "program",
      milestone: els.milestone.value,
      selected: "",
      q: "",
    }));
    els.case.addEventListener("change", () => setState({
      cut: "case",
      case: els.case.value,
      selected: "",
      q: "",
    }));
    els.health.addEventListener("change", () => setState({
      cut: els.health.value ? "edp" : state.cut,
      health: els.health.value,
      selected: "",
    }));
    els.active.addEventListener("change", () => setState({ active: els.active.checked, selected: "" }));
    els.q.addEventListener("input", () => setState({ q: els.q.value, selected: "" }));
    els.reset.addEventListener("click", () => setState(Object.assign({}, DEFAULTS)));
    els.export.addEventListener("click", downloadCsv);
    els.drillBack.addEventListener("click", () => setState({
      cut: state.mode === "program" ? "program" : state.mode === "case" ? "case" : "product",
      product: "all",
      milestone: "",
      case: state.mode === "case" ? state.case : "",
      metric: state.mode === "case" ? "fac" : state.metric,
      health: "",
      selected: "",
      q: "",
    }));
    els.table.addEventListener("click", (event) => {
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
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(render, 120);
    });
  }

  populateFilters();
  enforceState();
  writeState();
  syncControls();
  bind();
  render();
  if (location.hash) {
    const target = document.querySelector(location.hash);
    if (target) target.scrollIntoView({ block: "start" });
  }
})();
