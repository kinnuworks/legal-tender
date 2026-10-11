"""Save one run's RESULTS line as an evidence file.

    .venv/bin/python tools/save_run.py 02-qollab-braket "AWS Braket local simulator (Qollab)" '{"backend": ...}'
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

name, label, line = sys.argv[1], sys.argv[2], sys.argv[3]
record = {
    "project": "Legal Tender",
    "version": "2.0.0",
    "label": label,
    "saved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "source": "The RESULTS line this run wrote to Qollab's console.",
    "results": json.loads(line),
}
path = Path(__file__).resolve().parents[1] / "evidence" / f"v2-{name}.json"
path.write_text(json.dumps(record, indent=1) + "\n")
print(path.name, record["results"]["backend"], len(record["results"]["rows"]), "rows")
