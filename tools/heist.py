"""Measure how often the whole-note heist gets away, at each number of visits.

    .venv/bin/python tools/heist.py

It prints every heist cell on Qiskit's BasicSimulator, then plays heists from
those shots exactly as the game does: three probes at most per seal, stopping
at the first probe that reads 1, and seizing the note on any failed check.
"""

import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "legal-tender"))

from qiskit.providers.basic_provider import BasicSimulator  # noqa: E402

from legaltender import api, cells, plates, stats  # noqa: E402

HEISTS = 2000
rng = random.SystemRandom()
backend = BasicSimulator()
stock = {}
for plate_id, plate in plates.plan("local").items():
    if plate["act"] != "patient":
        continue
    sheet = json.loads(api.print_plate(backend, plate_id, "local", 4096))
    assert sheet["ok"], sheet
    for cell_id, codes in sheet["outcomes"].items():
        stock[cell_id] = [int(c) for c in codes.split(",")]

print("| Visits per probe | Heists | Clean getaways | Rate (95% interval) | Theory |")
print("|---|---|---|---|---|")
for visits in plates.HEIST_VISITS:
    wins = 0
    for _ in range(HEISTS):
        secret = [rng.choice(cells.STATES) for _ in range(8)]
        beliefs = []
        for state in secret:
            belief = "-"
            caught = False
            for test in cells.HEIST_TESTS:
                code = rng.choice(stock[f"patient:{state}:{test}:{visits}"])
                if code % 100:
                    caught = True
                    break
                if code >= 100:
                    belief = cells.HEIST_NAMES[test]
                    break
            if caught:
                break
            beliefs.append(belief)
        else:
            if all(rng.choice(stock[f"reprint:{s}:{b}"]) == 1 for s, b in zip(secret, beliefs) for _ in range(2)):
                wins += 1
    r = stats.rate(wins, HEISTS)
    print(f"| {visits} | {HEISTS:,} | {wins:,} | {100 * r['p']:.1f}% ({100 * r['lo']:.1f} to {100 * r['hi']:.1f}) | {100 * cells.heist_note(visits):.1f}% |")
print(f"| 1,000 | | | too many qubits to simulate | {100 * cells.heist_note(1000):.1f}% |")
