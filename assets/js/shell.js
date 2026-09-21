(function () {
  const PAGES = [
    { href: "index.html", id: "overview", label: "Overview" },
    { href: "delivery.html", id: "delivery", label: "Delivery" },
    { href: "mapping.html", id: "mapping", label: "Mapping" },
    { href: "cases.html", id: "cases", label: "Cases" },
    { href: "cost.html", id: "cost", label: "Cost" },
    { href: "reports.html", id: "reports", label: "Reports" },
  ];

  function pageId() {
    return document.documentElement.getAttribute("data-page") || "overview";
  }

  function fetched() {
    const t = window.Hours && Hours.fetchedAt();
    return t ? Hours.fmtWhen(t) : "";
  }

  function mount() {
    const id = pageId();
    const header = document.getElementById("shell-header");
    const footer = document.getElementById("shell-footer");
    const when = fetched();
    document.body.classList.add("app");
    if (header) {
      header.className = "rail";
      header.innerHTML = `<a class="wordmark" href="index.html"><span>Hours</span><span>Control</span></a>
        <nav class="nav">${PAGES.map((p) => {
          const cur = p.id === id ? ' aria-current="page"' : "";
          return `<a href="${p.href}"${cur}>${p.label}</a>`;
        }).join("")}</nav>
        <div class="rail-foot">
          ${when ? `<time class="mono">${Hours.esc(when)}</time>` : ""}
          <a href="Roadmap_Map.html">Map</a>
        </div>`;
    }
    if (footer) footer.hidden = true;
  }

  window.Shell = { mount, pageId };
  document.addEventListener("DOMContentLoaded", mount);
})();
