(function () {
  const ink = "#161411";
  const muted = "#6F6A62";
  const rule = "rgba(22, 20, 17, 0.10)";
  const copper = "#B45309";
  const copperSoft = "#C4BDB2";

  function maxOf(rows, keys) {
    let m = 0;
    rows.forEach((r) => {
      keys.forEach((k) => {
        const v = Number(r[k] || 0);
        if (v > m) m = v;
      });
    });
    return m || 1;
  }

  function hbar(el, spec) {
    const rows = spec.rows || [];
    const series = spec.series || [{ key: "value", label: "", fill: ink }];
    const w = spec.width || 720;
    const rowH = 26;
    const padL = spec.padL || 168;
    const padR = 40;
    const padT = 4;
    const padB = 22;
    const h = padT + Math.max(rows.length, 1) * rowH + padB;
    const max = spec.max || maxOf(rows, series.map((s) => s.key));
    const inner = w - padL - padR;
    const ticks = 4;
    let bars = "";
    const band = Math.min(9, (rowH - 8) / series.length);
    rows.forEach((r, i) => {
      const y = padT + i * rowH;
      const label = Hours.esc(r.label || r.name || r.key || "");
      bars += `<text class="axis" x="${padL - 10}" y="${y + 13}" text-anchor="end">${label}</text>`;
      series.forEach((s, si) => {
        const v = Number(r[s.key] || 0);
        const bw = Math.max(0, (v / max) * inner);
        const yy = y + 5 + si * (band + 2);
        bars += `<rect class="bar" fill="${s.fill}" x="${padL}" y="${yy}" width="${bw}" height="${band}" rx="0"></rect>`;
      });
    });
    let grid = "";
    for (let t = 0; t <= ticks; t++) {
      const x = padL + (inner * t) / ticks;
      const val = Math.round((max * t) / ticks);
      grid += `<line class="tick" x1="${x}" x2="${x}" y1="${padT}" y2="${h - padB}" stroke="${rule}"></line>`;
      grid += `<text class="axis" x="${x}" y="${h - 6}" text-anchor="middle">${val}</text>`;
    }
    el.innerHTML = `${spec.title ? `<h2>${Hours.esc(spec.title)}</h2>` : ""}
      <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${Hours.esc(spec.title || "")}">
        ${grid}${bars}
      </svg>`;
  }

  function stacked(el, spec) {
    const segs = spec.segments || [];
    const total = segs.reduce((s, x) => s + Number(x.value || 0), 0) || 1;
    const w = spec.width || 720;
    const h = 48;
    let x = 0;
    let rects = "";
    const fills = [ink, copper, copperSoft, rule];
    segs.forEach((seg, i) => {
      const bw = ((Number(seg.value) || 0) / total) * w;
      rects += `<rect x="${x}" y="0" width="${Math.max(bw, 0)}" height="10" fill="${fills[i % fills.length]}"></rect>`;
      x += bw;
    });
    const legend = segs.map((s) => `${Hours.esc(s.label)} ${Hours.esc(String(s.value))}`).join(" · ");
    el.innerHTML = `${spec.title ? `<h2>${Hours.esc(spec.title)}</h2>` : ""}
      <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${Hours.esc(spec.title || "")}">${rects}</svg>
      <div class="chart-legend">${legend}</div>`;
  }

  window.Charts = { hbar, stacked, ink, copper, copperSoft };
})();
