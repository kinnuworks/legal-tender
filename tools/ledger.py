"""Turn the saved runs into the results tables for the project page.

    .venv/bin/python tools/ledger.py            # tables from evidence/v2-*.json
    .venv/bin/python tools/ledger.py --check    # also flag any limit that falls
                                                # below a measured interval

Every run of the game writes one line to the console that starts with RESULTS.
Each file in evidence/ holds that line for one machine, with a label and the
time it was saved. Runs of version 1 are kept in evidence/v1 for the record.
"""

import json
import sys
from math import sqrt
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "legal-tender"))
EVIDENCE = ROOT / "evidence"

from legaltender import cells, stats  # noqa: E402

# key in the RESULTS line, column heading, proven limit
STRICT = [
    ("photocopier", "Photocopier", stats.PHOTOCOPIER_PER_QUBIT),
    ("press", "Best press, four-way note", stats.PAIR_CEILING["four"]),
    ("universal", "Best machine, six-way note", stats.PAIR_CEILING["six"]),
]
FORGIVING = [
    ("honest", "Genuine qubit", 1.0),
    ("lenient-single", "Second press, four-way note", stats.COPY_CEILING["four"]),
    ("universal-single", "Best machine, six-way note", stats.COPY_CEILING["six"]),
]


def wilson(k, n, z=1.96):
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return p, max(0.0, centre - half), min(1.0, centre + half)


def cell(rows, key):
    row = rows.get(key)
    if not row:
        return "one job per run"
    p, lo, hi = wilson(row["k"], row["n"])
    return f"{100 * p:.1f}% ({100 * lo:.1f} to {100 * hi:.1f})"


def table(title, columns, runs, extra=None):
    head = ["Machine"] + [f"{name} (limit {100 * limit:.1f}%)" if limit < 1 else name for _, name, limit in columns]
    if extra:
        head.append(extra[0])
    head.append("Shots per cell")
    out = [f"**{title}**", "", "| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    for run in runs:
        rows = {r["key"]: r for r in run["results"]["rows"]}
        line = [run["label"]] + [cell(rows, key) for key, _, _ in columns]
        if extra:
            line.append(extra[1](rows))
        line.append(f"{run['results']['shots']:,}")
        out.append("| " + " | ".join(line) + " |")
    theory = ["Theory, ideal machine"] + [f"{100 * limit:.1f}%" for _, _, limit in columns]
    if extra:
        theory.append(extra[2])
    theory.append("")
    out.append("| " + " | ".join(theory) + " |")
    return "\n".join(out)


def margins(rows):
    if "honest" not in rows:
        return ""
    p = rows["honest"]["k"] / rows["honest"]["n"]
    return f"+{100 * (p - stats.COPY_CEILING['four']):.1f} and +{100 * (p - stats.COPY_CEILING['six']):.1f} points"


def check(runs):
    """A forger can't beat a proven limit, so no interval should sit above one."""
    bad = 0
    for run in runs:
        rows = {r["key"]: r for r in run["results"]["rows"]}
        for key, name, limit in STRICT + FORGIVING[1:] + [("lenient", "Second press pair", cells.LENIENT_PAIR), ("single", "Best press, one copy", stats.BEST_SINGLE_COPY)]:
            if key not in rows:
                continue
            p, lo, hi = wilson(rows[key]["k"], rows[key]["n"])
            if lo > limit:
                bad += 1
                print(f"ABOVE THE LIMIT: {run['label']}, {name}: {100 * lo:.1f} to {100 * hi:.1f} against {100 * limit:.1f}", file=sys.stderr)
    print(f"{len(runs)} runs checked, {bad} intervals above a limit.", file=sys.stderr)


def main():
    runs = [json.loads(p.read_text()) for p in sorted(EVIDENCE.glob("v2-*.json"))]
    if not runs:
        raise SystemExit("No runs saved in evidence/ yet.")
    print(table("Strict teller: how often one qubit passes on both notes", STRICT, runs))
    print()
    print(table(
        "Forgiving teller: how often one qubit passes on one copy", FORGIVING, runs,
        extra=("Margin, four-way and six-way", margins, "+14.6 and +16.7 points"),
    ))
    if "--check" in sys.argv:
        check(runs)


if __name__ == "__main__":
    main()
