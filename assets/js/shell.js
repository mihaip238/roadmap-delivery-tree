(function () {
  const PAGES = [
    { href: "index.html", id: "overview", label: "Overview" },
    { href: "delivery.html", id: "delivery", label: "Delivery" },
    { href: "mapping.html", id: "mapping", label: "Mapping" },
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
    if (header) {
      header.className = "site-header";
      header.innerHTML = `<div class="bar">
        <a class="wordmark" href="index.html">Hours Control</a>
        <nav class="nav">${PAGES.map((p) => {
          const cur = p.id === id ? ' aria-current="page"' : "";
          return `<a href="${p.href}"${cur}>${p.label}</a>`;
        }).join("")}</nav>
      </div>`;
    }
    if (footer) {
      footer.className = "site-footer";
      const when = fetched();
      footer.innerHTML = `<div class="bar">
        <span>Hours, not euros. Unique tickets count once. Overlay is source of truth.</span>
        <span>${when ? "Worklogs as of " + when : "Run python apply_overlay.py after a Jira refresh."}
          · <a href="Roadmap_Map.html">Map</a>
          · <a href="docs/REQUIREMENTS.md">Requirements</a>
        </span>
      </div>`;
    }
  }

  window.Shell = { mount, pageId };
  document.addEventListener("DOMContentLoaded", mount);
})();
