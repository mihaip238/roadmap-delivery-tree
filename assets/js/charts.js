(function () {
  const ink = "#161616";
  const muted = "#5c574e";
  const rule = "#e2ddd4";
  const copper = "#8c4a2f";
  const copperSoft = "#c4a090";

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
    const series = spec.series || [{ key: "value", label: "Hours", fill: ink }];
    const w = spec.width || 720;
    const rowH = 28;
    const padL = spec.padL || 168;
    const padR = 48;
    const padT = 8;
    const padB = 28;
    const h = padT + rows.length * rowH + padB;
    const max = spec.max || maxOf(rows, series.map((s) => s.key));
    const inner = w - padL - padR;
    const ticks = 4;
    let bars = "";
    const band = Math.min(10, (rowH - 10) / series.length);
    rows.forEach((r, i) => {
      const y = padT + i * rowH;
      const label = Hours.esc(r.label || r.name || r.key || "");
      bars += `<text class="axis" x="${padL - 10}" y="${y + 14}" text-anchor="end">${label}</text>`;
      series.forEach((s, si) => {
        const v = Number(r[s.key] || 0);
        const bw = Math.max(0, (v / max) * inner);
        const yy = y + 4 + si * (band + 2);
        bars += `<rect class="bar" fill="${s.fill}" x="${padL}" y="${yy}" width="${bw}" height="${band}"></rect>`;
      });
    });
    let grid = "";
    for (let t = 0; t <= ticks; t++) {
      const x = padL + (inner * t) / ticks;
      const val = Math.round((max * t) / ticks);
      grid += `<line class="tick" x1="${x}" x2="${x}" y1="${padT}" y2="${h - padB}" stroke="${rule}"></line>`;
      grid += `<text class="axis" x="${x}" y="${h - 10}" text-anchor="middle">${val}</text>`;
    }
    const legend = series.length > 1
      ? `<p class="caption">${series.map((s) => s.label).join(" · ")} · Hours (h)</p>`
      : "";
    el.innerHTML = `<h2>${Hours.esc(spec.title)}</h2>
      <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${Hours.esc(spec.title)}">
        ${grid}${bars}
      </svg>
      ${legend}
      <p class="caption">${Hours.esc(spec.caption || Hours.caption())}</p>`;
  }

  function stacked(el, spec) {
    const segs = spec.segments || [];
    const total = segs.reduce((s, x) => s + Number(x.value || 0), 0) || 1;
    const w = spec.width || 720;
    const h = 72;
    const pad = 0;
    let x = pad;
    let rects = "";
    const fills = [ink, copper, copperSoft, rule];
    segs.forEach((seg, i) => {
      const bw = ((Number(seg.value) || 0) / total) * (w - pad * 2);
      rects += `<rect x="${x}" y="24" width="${Math.max(bw, 0)}" height="18" fill="${fills[i % fills.length]}"></rect>`;
      x += bw;
    });
    const legend = segs.map((s, i) => `${s.label} ${s.value}`).join(" · ");
    el.innerHTML = `<h2>${Hours.esc(spec.title)}</h2>
      <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${Hours.esc(spec.title)}">${rects}</svg>
      <p class="caption">${Hours.esc(legend)}</p>
      <p class="caption">${Hours.esc(spec.caption || Hours.caption())}</p>`;
  }

  window.Charts = { hbar, stacked, ink, copper, copperSoft };
})();
