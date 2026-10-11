"""Local preview of the Qollab project.

Qollab runs main.js in the browser and bridges it to Python through Pyodide.
This server stands in for that bridge: it serves the same files and answers
main.js's Python calls over HTTP, using Qiskit's BasicSimulator as the backend.

    .venv/bin/python dev/serve.py            # http://127.0.0.1:8791
    KIND=remote .venv/bin/python dev/serve.py  # behave like a one-job backend
    PROJECT=is-it-quantum .venv/bin/python dev/serve.py   # the second project
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# folder, Python module main.js imports, and the bridge that stands in for it
PROJECTS = {
    "legal-tender": ("legaltender.api", "/dev/bridge.js"),
    "is-it-quantum": ("xeb.api", "/dev/bridge_xeb.js"),
}
NAME = os.environ.get("PROJECT", "legal-tender")
MODULE, BRIDGE = PROJECTS[NAME]
PROJECT = ROOT / NAME
sys.path.insert(0, str(PROJECT))

import importlib  # noqa: E402

from qiskit.providers.basic_provider import BasicSimulator  # noqa: E402

api = importlib.import_module(MODULE)

BACKEND = BasicSimulator()
CIRCUITS = {}
KIND = os.environ.get("KIND", "")
TYPES = {".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json"}

PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%(name)s (local preview)</title>
<link rel="stylesheet" href="/project/main.css">
<script type="importmap">{"imports": {"%(module)s": "%(bridge)s"}}</script>
</head><body>
%(body)s
<script type="module" src="%(bridge)s"></script>
<script type="module" src="/project/main.js"></script>
</body></html>"""


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, kind="text/plain"):
        data = body if isinstance(body, bytes) else body.encode()
        self.send_response(code)
        self.send_header("Content-Type", f"{kind}; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/":
            page = PAGE % {"name": NAME, "module": MODULE, "bridge": BRIDGE, "body": (PROJECT / "index.html").read_text()}
            return self._send(200, page, "text/html")
        if path.startswith("/project/"):
            target = PROJECT / path[len("/project/"):]
        elif path.startswith("/dev/"):
            target = ROOT / path[1:]
        else:
            return self._send(404, "not found")
        if not target.is_file() or ROOT not in target.resolve().parents:
            return self._send(404, "not found")
        self._send(200, target.read_bytes(), TYPES.get(target.suffix, "text/plain"))

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or "[]")
        if self.path == "/dev/run":
            qc = CIRCUITS[body["circuit"]]
            counts = BACKEND.run(qc, shots=int(body["shots"])).result().get_counts()
            return self._send(200, json.dumps(dict(counts)), "application/json")
        name = self.path.rsplit("/", 1)[-1]
        fn = getattr(api, name, None)
        if not self.path.startswith("/api/") or fn is None or name.startswith("_"):
            return self._send(404, "no such function")
        args = [BACKEND if a == "__backend__" else a for a in body]
        if name in ("describe", "describe_named") and KIND:
            args = [args[0], KIND]
        out = fn(*args)
        if not isinstance(out, str):
            # A circuit cannot cross HTTP, so the page gets a ticket for it.
            CIRCUITS[str(len(CIRCUITS))] = out
            out = json.dumps(str(len(CIRCUITS) - 1))
        self._send(200, out, "application/json")

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8791"))
    print(f"{NAME} preview on http://127.0.0.1:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
