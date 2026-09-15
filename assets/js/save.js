(function () {
  async function available() {
    try {
      const r = await fetch("/writer-status", { cache: "no-store" });
      if (!r.ok) return false;
      const j = await r.json();
      return !!j.ok;
    } catch (e) {
      return false;
    }
  }

  async function post(path, data) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
    if (!r.ok) throw new Error((json && json.error) || ("HTTP " + r.status));
    return json;
  }

  function download(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
  }

  window.Save = { available, post, download };
})();
