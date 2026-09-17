(function () {
  const ink = "#161411";
  const muted = "#6F6A62";
  const rule = "rgba(22, 20, 17, 0.10)";
  const copper = "#B45309";
  const copperSoft = "#C4BDB2";
  const over = "#9B1C1C";
  let sequence = 0;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  function chartWidth(el, fallback) {
    return Math.max(360, Math.round(el.clientWidth || fallback || 760));
  }

  function textWidth(value, font) {
    context.font = font || '11px "IBM Plex Sans", Arial, sans-serif';
    return context.measureText(String(value || "")).width;
  }

  function truncate(value, maxWidth, font) {
    const text = String(value || "");
    if (textWidth(text, font) <= maxWidth) return text;
    let low = 0;
    let high = text.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (textWidth(text.slice(0, middle) + "…", font) <= maxWidth) low = middle;
      else high = middle - 1;
    }
    return text.slice(0, low) + "…";
  }

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

  function heading(el, title) {
    const id = `chart-title-${++sequence}`;
    return {
      id,
      html: title ? `<h2 id="${id}">${Hours.esc(title)}</h2>` : "",
      aria: title ? `aria-labelledby="${id}"` : "",
    };
  }

  function frame(el, spec, rows, series) {
    const width = chartWidth(el, spec.width);
    const labels = rows.map((row) => row.label || row.name || row.key || "");
    const values = [];
    rows.forEach((row) => series.forEach((item) => values.push(Hours.fmtNum(row[item.key]))));
    const maxLabel = labels.reduce((max, label) => Math.max(max, textWidth(label)), 0);
    const maxValue = values.reduce((max, value) => Math.max(max, textWidth(value, '11px "IBM Plex Mono", monospace')), 0);
    const padL = Math.min(
      Math.max(Number(spec.padL || 0), Math.ceil(maxLabel) + 20, 92),
      Math.max(120, Math.floor(width * 0.40))
    );
    const padR = spec.showValues
      ? Math.min(Math.max(Math.ceil(maxValue) + 20, Number(spec.padR || 0), 62), Math.floor(width * 0.22))
      : Math.max(24, Number(spec.padR || 0));
    return {
      width,
      padL,
      padR,
      plotRight: width - padR,
      inner: Math.max(80, width - padL - padR),
      labelWidth: Math.max(56, padL - 22),
    };
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
    if (!rows.length) {
      const title = heading(el, spec.title);
      el.innerHTML = `${title.html}<div class="empty-mini">—</div>`;
      el.onclick = null;
      el.onkeydown = null;
      return;
    }
    const layout = frame(el, spec, rows, series);
    const rowH = spec.rowH || 36;
    const padT = 8;
    const padB = 28;
    const height = padT + Math.max(rows.length, 1) * rowH + padB;
    const domain = spec.domain || extent(rows, series.map((item) => item.key));
    const span = domain.max - domain.min || 1;
    const zeroX = layout.padL + ((0 - domain.min) / span) * layout.inner;
    const band = spec.barH || Math.min(10, Math.max(5, (rowH - 12) / series.length));
    const selected = spec.selectedKeys || new Set();
    const clipId = `plot-clip-${++sequence}`;
    let marks = "";

    rows.forEach((row, index) => {
      const y = padT + index * rowH;
      const fullLabel = row.label || row.name || row.key || "";
      const label = Hours.esc(truncate(fullLabel, layout.labelWidth));
      const key = row.key || fullLabel || String(index);
      const values = series.map((item) => `${item.label || item.key} ${Hours.fmtNum(row[item.key])}`).join(" · ");
      const aria = `${fullLabel} · ${values}`;
      let bars = "";
      series.forEach((item, seriesIndex) => {
        const value = Number(row[item.key] || 0);
        const valueX = layout.padL + ((value - domain.min) / span) * layout.inner;
        const x = Math.min(valueX, zeroX);
        const yy = y + Math.round((rowH - band * series.length - (series.length - 1) * 2) / 2)
          + seriesIndex * (band + 2);
        bars += `<rect class="bar" fill="${value < 0 ? over : item.fill}" x="${x}" y="${yy}"
          width="${Math.abs(valueX - zeroX)}" height="${band}"></rect>`;
      });
      const labelNode = `<text class="axis${row.href ? " axis-link" : ""}" x="${layout.padL - 12}"
        y="${y + Math.round(rowH * 0.58)}" text-anchor="end">${label}</text>`;
      const linkedLabel = row.href
        ? `<a href="${Hours.esc(row.href)}"${row.external ? ` target="_blank" rel="noreferrer"` : ""}>${labelNode}</a>`
        : labelNode;
      const endValue = spec.showValues
        ? `<text class="axis chart-value" x="${layout.width - 4}" y="${y + Math.round(rowH * 0.58)}"
          text-anchor="end">${Hours.esc(Hours.fmtNum(row[series[0].key]))}</text>`
        : "";
      marks += `<g class="chart-row${selected.has(key) ? " is-selected" : ""}" data-chart-row="${index}"
        ${spec.onSelect ? `tabindex="0" role="button" aria-pressed="${selected.has(key)}"` : ""}
        aria-label="${Hours.esc(aria)}">
        <title>${Hours.esc(aria)}</title>
        <rect class="chart-hit" x="0" y="${y}" width="${layout.width}" height="${rowH}"></rect>
        ${linkedLabel}<g clip-path="url(#${clipId})">${bars}</g>${endValue}
      </g>`;
    });

    let grid = "";
    for (let tick = 0; tick <= 4; tick++) {
      const ratio = tick / 4;
      const x = layout.padL + layout.inner * ratio;
      const value = domain.min + span * ratio;
      grid += `<line class="tick" x1="${x}" x2="${x}" y1="${padT}" y2="${height - padB}"></line>
        <text class="axis" x="${x}" y="${height - 6}" text-anchor="middle">${formatTick(value)}</text>`;
    }
    const title = heading(el, spec.title);
    el.innerHTML = `${title.html}
      <svg viewBox="0 0 ${layout.width} ${height}" role="group" ${title.aria}>
        <defs><clipPath id="${clipId}"><rect x="${layout.padL}" y="${padT}" width="${layout.inner}" height="${height - padT - padB}"></rect></clipPath></defs>
        <g clip-path="url(#${clipId})">${grid}</g>${marks}
      </svg>
      ${spec.legend ? `<div class="chart-legend">${Hours.esc(spec.legend)}</div>` : ""}`;
    bindRows(el, rows, spec.onSelect);
  }

  function dumbbell(el, spec) {
    const rows = (spec.rows || []).filter((row) => row[spec.startKey] != null && row[spec.endKey] != null);
    const series = [
      { key: spec.startKey, label: spec.startLabel || spec.startKey },
      { key: spec.endKey, label: spec.endLabel || spec.endKey },
    ];
    if (!rows.length) {
      const title = heading(el, spec.title);
      el.innerHTML = `${title.html}<div class="empty-mini">—</div>`;
      return;
    }
    const layout = frame(el, Object.assign({}, spec, { showValues: true }), rows, series);
    const rowH = spec.rowH || 40;
    const padT = 8;
    const padB = 28;
    const height = padT + rows.length * rowH + padB;
    const domain = extent(rows, [spec.startKey, spec.endKey]);
    domain.min = Math.min(0, domain.min);
    const span = domain.max - domain.min || 1;
    const xFor = (value) => layout.padL + ((Number(value) - domain.min) / span) * layout.inner;
    const clipId = `dumbbell-clip-${++sequence}`;
    let marks = "";
    rows.forEach((row, index) => {
      const y = padT + index * rowH + rowH / 2;
      const start = Number(row[spec.startKey]);
      const end = Number(row[spec.endKey]);
      const fullLabel = row.label || row.name || row.key || "";
      const label = Hours.esc(truncate(fullLabel, layout.labelWidth));
      const aria = `${fullLabel} · ${series[0].label} ${Hours.fmtNum(start)} · ${series[1].label} ${Hours.fmtNum(end)}`;
      const variance = Hours.round2(start - end);
      marks += `<g class="chart-row" data-chart-row="${index}" ${spec.onSelect ? `tabindex="0" role="button"` : ""} aria-label="${Hours.esc(aria)}">
        <title>${Hours.esc(aria)}</title>
        <rect class="chart-hit" x="0" y="${padT + index * rowH}" width="${layout.width}" height="${rowH}"></rect>
        <text class="axis" x="${layout.padL - 12}" y="${y + 4}" text-anchor="end">${label}</text>
        <g clip-path="url(#${clipId})">
          <line class="dumbbell-line" x1="${xFor(start)}" x2="${xFor(end)}" y1="${y}" y2="${y}"></line>
          <circle class="dumbbell-start" cx="${xFor(start)}" cy="${y}" r="5"></circle>
          <circle class="dumbbell-end" cx="${xFor(end)}" cy="${y}" r="5"></circle>
        </g>
        <text class="axis chart-value${variance < 0 ? " is-over" : ""}" x="${layout.width - 4}" y="${y + 4}" text-anchor="end">${Hours.esc(Hours.fmtNum(variance))}</text>
      </g>`;
    });
    const title = heading(el, spec.title);
    el.innerHTML = `${title.html}<svg viewBox="0 0 ${layout.width} ${height}" role="group" ${title.aria}>
      <defs><clipPath id="${clipId}"><rect x="${layout.padL}" y="${padT}" width="${layout.inner}" height="${height - padT - padB}"></rect></clipPath></defs>
      ${marks}
    </svg><div class="chart-legend">${Hours.esc(series[0].label)} ● · ${Hours.esc(series[1].label)} ○ · Variance</div>`;
    bindRows(el, rows, spec.onSelect);
  }

  function polar(cx, cy, radius, angle) {
    const radians = (angle - 90) * Math.PI / 180;
    return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
  }

  function arc(cx, cy, radius, start, end) {
    const from = polar(cx, cy, radius, end);
    const to = polar(cx, cy, radius, start);
    return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 0 ${to.x} ${to.y}`;
  }

  function donut(el, spec) {
    const segments = (spec.segments || []).filter((segment) => Number(segment.value) > 0);
    const total = segments.reduce((sum, segment) => sum + Number(segment.value), 0);
    const width = chartWidth(el, spec.width);
    const height = Math.min(300, Math.max(220, Math.round(width * 0.58)));
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.28;
    const stroke = Math.max(20, radius * 0.32);
    const title = heading(el, spec.title);
    if (!total) {
      el.innerHTML = `${title.html}<div class="empty-mini">—</div>`;
      return;
    }
    let angle = 0;
    const paths = segments.map((segment, index) => {
      const portion = Number(segment.value) / total;
      const start = angle;
      const end = angle + portion * 359.999;
      angle = end;
      const label = `${segment.label} ${segment.value} · ${Hours.round2(portion * 100)}%`;
      return `<path data-segment="${index}" tabindex="0" role="button" aria-label="${Hours.esc(label)}"
        d="${arc(cx, cy, radius, start, end)}" fill="none" stroke="${segment.fill}" stroke-width="${stroke}">
        <title>${Hours.esc(label)}</title></path>`;
    }).join("");
    const legend = segments.map((segment, index) =>
      `<button type="button" data-segment="${index}"><i style="background:${segment.fill}"></i>${Hours.esc(segment.label)} <span>${Hours.esc(String(segment.value))}</span></button>`
    ).join("");
    el.innerHTML = `${title.html}<svg viewBox="0 0 ${width} ${height}" role="group" ${title.aria}>
      ${paths}
      <text class="donut-total" x="${cx}" y="${cy - 2}" text-anchor="middle">${Hours.esc(String(total))}</text>
      <text class="donut-label" x="${cx}" y="${cy + 18}" text-anchor="middle">${Hours.esc(spec.centerLabel || "EDPs")}</text>
    </svg><div class="chart-legend chart-segments">${legend}</div>`;
    el.onclick = spec.onSelect ? (event) => {
      const target = event.target.closest("[data-segment]");
      if (target) spec.onSelect(segments[Number(target.getAttribute("data-segment"))], event);
    } : null;
    el.onkeydown = spec.onSelect ? (event) => {
      const target = event.target.closest("[data-segment]");
      if (target && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        spec.onSelect(segments[Number(target.getAttribute("data-segment"))], event);
      }
    } : null;
  }

  function pareto(el, spec) {
    const rows = (spec.rows || []).filter((row) => Number(row[spec.valueKey || "value"]) > 0);
    const valueKey = spec.valueKey || "value";
    if (!rows.length) {
      const title = heading(el, spec.title);
      el.innerHTML = `${title.html}<div class="empty-mini">—</div>`;
      return;
    }
    const width = chartWidth(el, spec.width);
    const height = spec.height || 300;
    const padL = 48;
    const padR = 48;
    const padT = 16;
    const padB = 70;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const max = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1);
    const total = rows.reduce((sum, row) => sum + Number(row[valueKey] || 0), 0) || 1;
    const band = innerW / Math.max(rows.length, 1);
    let running = 0;
    let bars = "";
    const points = [];
    rows.forEach((row, index) => {
      const value = Number(row[valueKey] || 0);
      running += value;
      const barHeight = value / max * innerH;
      const x = padL + index * band + band * 0.18;
      const y = padT + innerH - barHeight;
      const cumulative = running / total * 100;
      const px = padL + index * band + band / 2;
      const py = padT + innerH - cumulative / 100 * innerH;
      points.push([px, py]);
      bars += `<g><title>${Hours.esc(`${row.label || row.key} · ${Hours.fmtNum(value)} · ${Hours.round2(cumulative)}%`)}</title>
        <rect class="pareto-bar" x="${x}" y="${y}" width="${band * 0.64}" height="${barHeight}"></rect>
        <text class="axis" x="${px}" y="${height - padB + 15}" text-anchor="end" transform="rotate(-35 ${px} ${height - padB + 15})">${Hours.esc(truncate(row.label || row.key, 72))}</text>
      </g>`;
    });
    const path = points.map((point, index) => `${index ? "L" : "M"} ${point[0]} ${point[1]}`).join(" ");
    const title = heading(el, spec.title);
    el.innerHTML = `${title.html}<svg viewBox="0 0 ${width} ${height}" role="img" ${title.aria}>
      <line class="tick" x1="${padL}" x2="${padL}" y1="${padT}" y2="${padT + innerH}"></line>
      <line class="tick" x1="${width - padR}" x2="${width - padR}" y1="${padT}" y2="${padT + innerH}"></line>
      ${bars}<path class="pareto-line" d="${path}"></path>
      ${points.map((point) => `<circle class="pareto-point" cx="${point[0]}" cy="${point[1]}" r="3"></circle>`).join("")}
      <text class="axis" x="${width - padR + 8}" y="${padT + 4}">100%</text>
      <text class="axis" x="${width - padR + 8}" y="${padT + innerH}">0%</text>
    </svg>`;
  }

  function line(el, spec) {
    const rows = (spec.rows || []).filter((row) => row.value != null);
    const width = chartWidth(el, spec.width);
    const height = spec.height || 280;
    const labels = rows.map((row) => Hours.fmtNum(row.value));
    const padL = Math.max(58, Math.ceil(labels.reduce((max, label) => Math.max(max, textWidth(label)), 0)) + 16);
    const padR = 24;
    const padT = 22;
    const padB = 48;
    const title = heading(el, spec.title);
    if (rows.length < 2) {
      el.innerHTML = `${title.html}<div class="empty-mini">—</div>`;
      return;
    }
    const values = rows.map((row) => Number(row.value));
    const min = spec.zero ? 0 : Math.min(...values);
    const max = Math.max(...values);
    const valueSpan = max - min || 1;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const xFor = (index) => padL + (index / (rows.length - 1)) * innerW;
    const yFor = (value) => padT + ((max - value) / valueSpan) * innerH;
    const clipId = `line-clip-${++sequence}`;
    const path = rows.map((row, index) =>
      `${index ? "L" : "M"} ${xFor(index).toFixed(2)} ${yFor(Number(row.value)).toFixed(2)}`
    ).join(" ");
    const points = rows.map((row, index) => {
      const label = `${row.date} · ${Hours.fmtNum(row.value)}`;
      return `<g tabindex="0" aria-label="${Hours.esc(label)}"><title>${Hours.esc(label)}</title>
        <circle cx="${xFor(index)}" cy="${yFor(Number(row.value))}" r="4"></circle></g>`;
    }).join("");
    el.innerHTML = `${title.html}<svg viewBox="0 0 ${width} ${height}" role="group" ${title.aria}>
      <defs><clipPath id="${clipId}"><rect x="${padL}" y="${padT}" width="${innerW}" height="${innerH}"></rect></clipPath></defs>
      <line class="tick" x1="${padL}" x2="${padL}" y1="${padT}" y2="${padT + innerH}"></line>
      <line class="tick" x1="${padL}" x2="${width - padR}" y1="${padT + innerH}" y2="${padT + innerH}"></line>
      <text class="axis" x="${padL - 10}" y="${padT + 4}" text-anchor="end">${formatTick(max)}</text>
      <text class="axis" x="${padL - 10}" y="${padT + innerH}" text-anchor="end">${formatTick(min)}</text>
      <text class="axis" x="${padL}" y="${height - 10}" text-anchor="start">${Hours.esc(rows[0].date)}</text>
      <text class="axis" x="${width - padR}" y="${height - 10}" text-anchor="end">${Hours.esc(rows[rows.length - 1].date)}</text>
      <g clip-path="url(#${clipId})"><path class="trend-line" d="${path}"></path>${points}</g>
    </svg>`;
  }

  function stacked(el, spec) {
    donut(el, Object.assign({}, spec, { centerLabel: spec.centerLabel || "Total" }));
  }

  window.Charts = {
    hbar,
    dumbbell,
    donut,
    pareto,
    line,
    stacked,
    ink,
    copper,
    copperSoft,
    over,
  };
})();
