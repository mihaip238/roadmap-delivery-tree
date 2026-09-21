"""Local Hours Control server: static files + overlay/budget/case writer.

GitHub Pages cannot save. Run this on a trusted machine:

    python serve.py

Then open http://127.0.0.1:8765/
"""
from __future__ import annotations

import json
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
OVERLAY = ROOT / "jira_map" / "overlay_links.json"
BUDGETS = ROOT / "jira_map" / "overlay_budgets.json"
CASES = ROOT / "jira_map" / "overlay_cases.json"
HOST = "127.0.0.1"
PORT = 8765


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)


def apply_overlay() -> tuple[bool, str]:
    proc = subprocess.run(
        [sys.executable, str(ROOT / "apply_overlay.py")],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    return proc.returncode == 0, out[-4000:]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code: int, payload: dict) -> None:
        blob = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(blob)))
        self.end_headers()
        self.wfile.write(blob)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 2_000_000:
            raise ValueError("empty or too large body")
        raw = self.rfile.read(length)
        data = json.loads(raw.decode("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("expected a JSON object")
        return data

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/writer-status":
            self._json(200, {
                "ok": True,
                "overlay": str(OVERLAY),
                "budgets": str(BUDGETS),
                "cases": str(CASES),
            })
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            data = self._read_json()
        except Exception as exc:
            self._json(400, {"ok": False, "error": str(exc)})
            return
        if path == "/overlay":
            links = data.get("links")
            if not isinstance(links, list):
                self._json(400, {"ok": False, "error": "links must be a list"})
                return
            for row in links:
                if not isinstance(row, dict):
                    self._json(400, {"ok": False, "error": "each link must be an object"})
                    return
                if row.get("action") not in {"confirm", "add", "reject"}:
                    self._json(400, {"ok": False, "error": "action must be confirm, add, or reject"})
                    return
                if not row.get("edp") or not row.get("epp"):
                    self._json(400, {"ok": False, "error": "edp and epp are required"})
                    return
            write_json(OVERLAY, {
                "version": int(data.get("version") or 1),
                "updatedAt": data.get("updatedAt"),
                "links": links,
            })
            ok, log = apply_overlay()
            self._json(200 if ok else 500, {"ok": ok, "wrote": str(OVERLAY), "apply": log})
            return
        if path == "/budgets":
            def clean_map(raw: object) -> dict:
                out = {}
                if not isinstance(raw, dict):
                    return out
                for key, val in raw.items():
                    if val in (None, ""):
                        continue
                    try:
                        n = float(val)
                    except (TypeError, ValueError):
                        continue
                    if n < 0:
                        continue
                    out[str(key)] = round(n * 2) / 2
                return out
            write_json(BUDGETS, {
                "version": int(data.get("version") or 1),
                "updatedAt": data.get("updatedAt"),
                "edps": clean_map(data.get("edps")),
                "products": clean_map(data.get("products")),
                "milestones": clean_map(data.get("milestones")),
            })
            ok, log = apply_overlay()
            self._json(200 if ok else 500, {"ok": ok, "wrote": str(BUDGETS), "apply": log})
            return
        if path == "/cases":
            rows = data.get("cases")
            if not isinstance(rows, list):
                self._json(400, {"ok": False, "error": "cases must be a list"})
                return
            seen = set()
            for row in rows:
                if not isinstance(row, dict):
                    self._json(400, {"ok": False, "error": "each case must be an object"})
                    return
                case_id = str(row.get("id") or "").strip()
                if not case_id or case_id in seen:
                    self._json(400, {"ok": False, "error": "case ids must be present and unique"})
                    return
                seen.add(case_id)
                if row.get("status") not in {None, "", "active", "closed"}:
                    self._json(400, {"ok": False, "error": "case status must be active or closed"})
                    return
                for field in ("edps", "teams", "milestones", "budgets", "allocations", "exceptions"):
                    if row.get(field) is not None and not isinstance(row.get(field), list):
                        self._json(400, {"ok": False, "error": f"{field} must be a list"})
                        return
            pilot = data.get("pilot")
            if pilot not in (None, "") and str(pilot) not in seen:
                self._json(400, {"ok": False, "error": "pilot must name an existing case"})
                return
            write_json(CASES, {
                "version": int(data.get("version") or 1),
                "updatedAt": data.get("updatedAt"),
                "pilot": pilot or None,
                "cases": rows,
            })
            ok, log = apply_overlay()
            self._json(200 if ok else 500, {"ok": ok, "wrote": str(CASES), "apply": log})
            return
        self._json(404, {"ok": False, "error": "unknown path"})

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main() -> int:
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Hours Control  http://{HOST}:{PORT}/")
    print("POST /overlay, POST /budgets, and POST /cases write JSON then run apply_overlay.py")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstop")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
