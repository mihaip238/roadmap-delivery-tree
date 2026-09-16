(function () {
  const ink = "#161411";
  const muted = "#6F6A62";
  const rule = "rgba(22, 20, 17, 0.10)";
  const copper = "#B45309";
  const copperSoft = "#C4BDB2";
  const over = "#9B1C1C";
  let sequence = 0;

  function extent(rows, keys) {
    let min = 0;
    let max = 0;
    rows.forEach((row) => keys.forEach((key) => {
      const value = Number(row[key] || 0);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }));
    if (min === max) max = min + 1;
    return { min, max };
  }

  function formatTick(value) {
    const absolute = Math.abs(value);
    if (absolute >= 1000000) return (value / 1000000).toFixed(1).replace(".0", "") + "m";
    if (absolute >= 1000) return (value / 1000).toFixed(1).replace(".0", "") + "k";
    return String(Math.round(value * 10) / 10);
  }

  function bindRows(el, rows, onSelect) {
    el.onclick = onSelect ? (event) => {
      if (event.target.closest("a")) return;
      const mark = event.target.closest("[data-chart-row]");
      if (mark) onSelect(rows[Number(mark.getAttribute("data-chart-row"))], event);
    } : null;
    el.onkeydown = onSelect ? (event) => {
      const mark = event.target.closest("[data-chart-row]");
      if (!mark) return;
      const marks = Array.from(el.querySelectorAll("[data-chart-row]"));
      const index = marks.indexOf(mark);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = event.key === "ArrowDown"
          ? Math.min(marks.length - 1, index + 1)
          : Math.max(0, index - 1);
        marks[next].focus();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        marks[event.key === "Home" ? 0 : marks.length - 1].focus();
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(rows[index], event);
      }
    } : null;
  }

  function hbar(el, spec) {
    const rows = spec.rows || [];
    const series = spec.series || [{ key: "value", label: "", fill: ink }];
    const width = spec.width || 760;
    const rowH = spec.rowH || 34;
    const padL = spec.padL || 184;
    const padR = spec.padR || 64;
    const padT = spec.padT || 8;
    const padB = 26;
    const height = padT + Math.max(rows.length, 1) * rowH + padB;
    const domain = spec.domain || extent(rows, series.map((item) => item.key));
    const span = domain.max - domain.min || 1;
    const inner = width - padL - padR;
    const zeroX = padL + ((0 - domain.min) / span) * inner;
    const ticks = 4;
    const band = spec.barH || Math.min(10, Math.max(5, (rowH - 12) / series.length));
    const selected = spec.selectedKeys || new Set();
    let marks = "";

    rows.forEach((row, index) => {
      const y = padT + index * rowH;
      const label = Hours.esc(row.label || row.name || row.key || "");
      const key = row.key || row.label || String(index);
      const values = series.map((item) => `${item.label || item.key} ${Hours.fmtNum(row[item.key])}`).join(" · ");
      const aria = `${label} · ${values}`;
      let bars = "";
      series.forEach((item, seriesIndex) => {
        const value = Number(row[item.key] || 0);
        const valueX = padL + ((value - domain.min) / span) * inner;
        const x = Math.min(valueX, zeroX);
        const barWidth = Math.abs(valueX - zeroX);
        const yy = y + Math.round((rowH - band * series.length - (series.length - 1) * 2) / 2)
          + seriesIndex * (band + 2);
        const fill = value < 0 ? over : item.fill;
        bars += `<rect class="bar" fill="${fill}" x="${x}" y="${yy}" width="${Math.max(0, barWidth)}" height="${band}"></rect>`;
      });
      const labelNode = `<text class="axis${row.href ? " axis-link" : ""}" x="${padL - 12}" y="${y + Math.round(rowH * 0.58)}" text-anchor="end">${label}</text>`;
      const linkedLabel = row.href
        ? `<a href="${Hours.esc(row.href)}"${row.external ? ` target="_blank" rel="noreferrer"` : ""}>${labelNode}</a>`
        : labelNode;
      const endValue = spec.showValues
        ? `<text class="axis chart-value" x="${width - 2}" y="${y + Math.round(rowH * 0.58)}" text-anchor="end">${Hours.esc(Hours.fmtNum(row[series[0].key]))}</text>`
        : "";
      marks += `<g class="chart-row${selected.has(key) ? " is-selected" : ""}" data-chart-row="${index}"
        ${spec.onSelect ? `tabindex="0" role="button" aria-pressed="${selected.has(key)}"` : ""}
        aria-label="${Hours.esc(aria)}">
        <title>${Hours.esc(aria)}</title>
        <rect class="chart-hit" x="0" y="${y}" width="${width}" height="${rowH}"></rect>
        ${linkedLabel}${bars}${endValue}
      </g>`;
    });

    let grid = "";
    for (let tick = 0; tick <= ticks; tick++) {
      const ratio = tick / ticks;
      const x = padL + inner * ratio;
      const value = domain.min + span * ratio;
      grid += `<line class="tick" x1="${x}" x2="${x}" y1="${padT}" y2="${height - padB}" stroke="${rule}"></line>`;
      grid += `<text class="axis" x="${x}" y="${height - 6}" text-anchor="middle">${formatTick(value)}</text>`;
    }
    const headingId = `chart-title-${++sequence}`;
    el.innerHTML = `${spec.title ? `<h2 id="${headingId}">${Hours.esc(spec.title)}</h2>` : ""}
      <svg viewBox="0 0 ${width} ${height}" role="group" ${spec.title ? `aria-labelledby="${headingId}"` : ""}>
        ${grid}${marks}
      </svg>
      ${spec.legend ? `<div class="chart-legend">${Hours.esc(spec.legend)}</div>` : ""}`;
    bindRows(el, rows, spec.onSelect);
  }

  function stacked(el, spec) {
    const segments = spec.segments || [];
    const total = segments.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1;
    const width = spec.width || 760;
    const height = 64;
    let x = 0;
    let marks = "";
    const fills = [ink, copper, copperSoft, rule];
    segments.forEach((segment, index) => {
      const segmentWidth = ((Number(segment.value) || 0) / total) * width;
      const fill = segment.fill || fills[index % fills.length];
      const label = `${segment.label} ${segment.value}`;
      marks += `<g data-segment="${index}" ${spec.onSelect ? `tabindex="0" role="button" aria-label="${Hours.esc(label)}"` : ""}>
        <title>${Hours.esc(label)}</title>
        <rect x="${x}" y="8" width="${Math.max(segmentWidth, 0)}" height="14" fill="${fill}"></rect>
      </g>`;
      x += segmentWidth;
    });
    const headingId = `chart-title-${++sequence}`;
    const legend = segments.map((segment) =>
      `<button type="button" data-segment="${segments.indexOf(segment)}">${Hours.esc(segment.label)} <span>${Hours.esc(String(segment.value))}</span></button>`
    ).join("");
    el.innerHTML = `${spec.title ? `<h2 id="${headingId}">${Hours.esc(spec.title)}</h2>` : ""}
      <svg viewBox="0 0 ${width} ${height}" role="group" ${spec.title ? `aria-labelledby="${headingId}"` : ""}>${marks}</svg>
      <div class="chart-legend chart-segments">${legend}</div>`;
    if (spec.onSelect) {
      el.onclick = (event) => {
        const target = event.target.closest("[data-segment]");
        if (target) spec.onSelect(segments[Number(target.getAttribute("data-segment"))], event);
      };
      el.onkeydown = (event) => {
        const target = event.target.closest("[data-segment]");
        if (target && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          spec.onSelect(segments[Number(target.getAttribute("data-segment"))], event);
        }
      };
    } else {
      el.onclick = null;
      el.onkeydown = null;
    }
  }

  function line(el, spec) {
    const rows = (spec.rows || []).filter((row) => row.value != null);
    const width = spec.width || 760;
    const height = spec.height || 250;
    const padL = 54;
    const padR = 22;
    const padT = 18;
    const padB = 36;
    const headingId = `chart-title-${++sequence}`;
    if (rows.length < 2) {
      el.innerHTML = `${spec.title ? `<h2 id="${headingId}">${Hours.esc(spec.title)}</h2>` : ""}<div class="empty-mini">—</div>`;
      return;
    }
    const values = rows.map((row) => Number(row.value));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const valueSpan = max - min || 1;
    const xFor = (index) => padL + (index / (rows.length - 1)) * (width - padL - padR);
    const yFor = (value) => padT + ((max - value) / valueSpan) * (height - padT - padB);
    const path = rows.map((row, index) =>
      `${index ? "L" : "M"} ${xFor(index).toFixed(2)} ${yFor(Number(row.value)).toFixed(2)}`
    ).join(" ");
    const points = rows.map((row, index) => {
      const label = `${row.date} · ${Hours.fmtNum(row.value)}`;
      return `<g tabindex="0" aria-label="${Hours.esc(label)}">
        <title>${Hours.esc(label)}</title>
        <circle cx="${xFor(index)}" cy="${yFor(Number(row.value))}" r="4"></circle>
      </g>`;
    }).join("");
    const firstDate = Hours.esc(rows[0].date);
    const lastDate = Hours.esc(rows[rows.length - 1].date);
    el.innerHTML = `${spec.title ? `<h2 id="${headingId}">${Hours.esc(spec.title)}</h2>` : ""}
      <svg viewBox="0 0 ${width} ${height}" role="group" ${spec.title ? `aria-labelledby="${headingId}"` : ""}>
        <line class="tick" x1="${padL}" x2="${padL}" y1="${padT}" y2="${height - padB}"></line>
        <line class="tick" x1="${padL}" x2="${width - padR}" y1="${height - padB}" y2="${height - padB}"></line>
        <text class="axis" x="${padL - 8}" y="${padT + 4}" text-anchor="end">${formatTick(max)}</text>
        <text class="axis" x="${padL - 8}" y="${height - padB}" text-anchor="end">${formatTick(min)}</text>
        <text class="axis" x="${padL}" y="${height - 10}">${firstDate}</text>
        <text class="axis" x="${width - padR}" y="${height - 10}" text-anchor="end">${lastDate}</text>
        <path class="trend-line" d="${path}"></path>
        ${points}
      </svg>`;
  }

  window.Charts = { hbar, stacked, line, ink, copper, copperSoft, over };
})();
