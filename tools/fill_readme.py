"""Write the measured tables into the project page.

    .venv/bin/python tools/fill_readme.py

Replaces everything between the two RESULTS markers in legal-tender/README.md
with the tables tools/ledger.py builds from evidence/.
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
README = ROOT / "legal-tender" / "README.md"
START, END = "<!-- RESULTS:START -->", "<!-- RESULTS:END -->"

tables = subprocess.run([sys.executable, str(ROOT / "tools" / "ledger.py")], capture_output=True, text=True, check=True).stdout.strip()
text = README.read_text()
block = f"{START}\n{tables}\n{END}"
if START in text:
    text = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _: block, text, flags=re.S)
else:
    text = text.replace("RESULTS-TABLES", block)
README.write_text(text)
print(f"README tables written from {len(list((ROOT / 'evidence').glob('v2-*.json')))} runs.")
