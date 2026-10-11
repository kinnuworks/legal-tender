"""Save one run of Is it quantum? and print its results-table row.

    .venv/bin/python tools/save_iiq.py 01-builtin "Built-in simulator (Qollab)" '{"backend": ...}'
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

name, label, line = sys.argv[1], sys.argv[2], sys.argv[3]
r = json.loads(line)
record = {
    "project": "Is it quantum?", "label": label,
    "saved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "source": "The RESULTS line this run wrote to Qollab's console.",
    "results": r,
}
path = Path(__file__).resolve().parents[1] / "evidence" / "is-it-quantum" / f"{name}.json"
path.write_text(json.dumps(record, indent=1) + "\n")
lo, hi = r["score"] - 1.96 * r["se"], r["score"] + 1.96 * r["se"]
jobs = "one job" if r["mode"] == "remote" else "four jobs"
print(f"| {label} | {r['score']:.2f} ({lo:.2f} to {hi:.2f}) | {r['n']:,} | {jobs} |")
