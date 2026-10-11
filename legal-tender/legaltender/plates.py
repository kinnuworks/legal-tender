"""Plates: cells packed side by side into one circuit, one job per plate.

IonQ backends accept one job per run on Qollab, so the remote plan fits a whole
act into a single circuit. Local simulators accept many jobs, so the local plan
uses narrow plates that simulate quickly.
"""

import random
import time

from qiskit import QuantumCircuit, transpile

from .cells import GUESSES, HEIST_TESTS, SIX, STATES, Cell

HONEST = [Cell("honest", s) for s in STATES]
PRESS = [Cell("press", s) for s in STATES]
PHOTOCOPIER = [Cell("photocopier", s, guess=g) for g in GUESSES for s in STATES]

# The bank's upgrade. On four-way notes, the press that beats a forgiving
# teller. Then six-way notes: their two extra genuine qubits, and the best
# machine there is against them.
LENIENT = [Cell("lenient", s) for s in STATES]
CIRCULAR = [Cell("honest", s) for s in ("R", "L")]
UNIVERSAL = [Cell("universal", s) for s in SIX]
UPGRADE = LENIENT + CIRCULAR + UNIVERSAL

# An IonQ backend takes one job per run, so its one sheet samples everything:
# a genuine qubit from each basis, and each machine on one state per basis.
# 3 + 6 + 4 + 9 = 22 qubits, which fits every IonQ model with room to spare.
REMOTE_PROOF = (
    [Cell("honest", s) for s in ("1", "-", "R")]
    + [Cell("press", s) for s in ("1", "+")]
    + [Cell("lenient", s) for s in ("0", "-")]
    + [Cell("universal", s) for s in ("1", "+", "L")]
)

# The patient forger, shown on one note qubit. "0" against the X test is the
# risky case, "+" is the safe case the forger can read for free, and "-" is the
# case where the probe is kicked back to where it started.
PATIENT_VISITS = (2, 4, 6, 8, 12)
PATIENT = (
    [Cell("patient", "0", test="X", visits=n) for n in PATIENT_VISITS]
    + [Cell("patient", "+", test="X", visits=6), Cell("patient", "-", test="X", visits=4)]
)
PATIENT_REMOTE = [c for c in PATIENT if c.visits <= 6 and c.state == "0"]

# The whole-note heist needs every qubit state against every test, at each
# number of visits on offer, plus the cells that check the forger's reprints.
HEIST_VISITS = (4, 8, 12)
HEIST = [Cell("patient", s, test=t, visits=n) for n in HEIST_VISITS for s in STATES for t in HEIST_TESTS]
REPRINT = [Cell("reprint", s, guess=b) for s in STATES for b in STATES]


def _unique(cells):
    seen = {}
    for cell in cells:
        seen.setdefault(cell.id, cell)
    return list(seen.values())

ACT_TITLES = {
    "proof": "Proof sheet: honest notes and the best press",
    "upgrade": "The bank's upgrade: the second press and six-way notes",
    "photocopier": "The photocopier",
    "patient": "The patient forger",
}


def _pack(cells, width):
    """Greedy first-fit packing of cells into plates at most `width` qubits wide."""
    plates = []
    for cell in cells:
        for plate in plates:
            if sum(c.qubits for c in plate) + cell.qubits <= width:
                plate.append(cell)
                break
        else:
            plates.append([cell])
    return plates


def plan(kind):
    """Every plate this machine can print, grouped by act.

    remote  IonQ backends: one job per run, so one wide plate per act.
    device  noise models of real devices: each job is slow to simulate, so
            fewer, wider plates.
    local   ideal simulators: many narrow plates, each almost instant.
    """
    if kind == "remote":
        groups = {
            "proof": [REMOTE_PROOF],
            "photocopier": [PHOTOCOPIER],
            "patient": [PATIENT_REMOTE],
        }
    else:
        width = 16 if kind == "device" else 12
        # The heist is dozens of small jobs, so only ideal simulators get it.
        patient = _unique(PATIENT + HEIST) + REPRINT if kind == "local" else PATIENT
        groups = {
            "proof": _pack(HONEST + PRESS, width),
            "upgrade": _pack(UPGRADE, width),
            "photocopier": _pack(PHOTOCOPIER, 12),
            "patient": _pack(patient, width),
        }
    plates = {}
    for act, packed in groups.items():
        for i, cells in enumerate(packed):
            plates[f"{act}-{i + 1}"] = {"act": act, "cells": cells}
    return plates


def build(cells):
    """One circuit holding every cell, with each qubit measured to its own bit."""
    total = sum(c.qubits for c in cells)
    qc = QuantumCircuit(total, total)
    q0 = 0
    for cell in cells:
        cell.build(qc, q0)
        q0 += cell.qubits
    qc.measure(range(total), range(total))
    return qc


def _bitstring(key, width):
    """Normalise a counts key to `width` characters, qubit 0 first."""
    if isinstance(key, int):
        key = format(key, "b")
    key = str(key).replace(" ", "")
    if key.startswith("0x"):
        key = format(int(key, 16), "b")
    return key.zfill(width)[::-1]


def ready(backend, qc):
    """Fit a circuit to the selected backend. Device-shaped backends need it."""
    try:
        return transpile(qc, backend)
    except Exception:
        return qc


def bare(qc):
    """The same circuit without its barriers, for backends that drop or reject them."""
    out = qc.copy_empty_like()
    for inst in qc.data:
        if inst.operation.name != "barrier":
            out.append(inst.operation, inst.qubits, inst.clbits)
    return out


def tidy(counts, width):
    """Counts as {bits: n}, with qubit 0 first in every key."""
    if isinstance(counts, list):
        counts = counts[0]
    return {_bitstring(k, width): int(v) for k, v in dict(counts).items()}


def execute(backend, qc, shots, plain=False):
    """Run one circuit on the selected backend and return its counts."""
    if plain:
        qc = bare(qc)
    job = backend.run(ready(backend, qc), shots=shots)
    return tidy(job.result().get_counts(), qc.num_qubits)


def split(cells, counts):
    """Turn joint counts into a shuffled list of per-shot outcome codes per cell.

    Counts arrive sorted by outcome, so the shots are shuffled before use. The
    shuffle changes their order only, never what was measured.
    """
    shots = [bits for bits, n in counts.items() for _ in range(n)]
    random.SystemRandom().shuffle(shots)
    out = {}
    q0 = 0
    for cell in cells:
        codes = [cell.read(bits[q0:q0 + cell.qubits]) for bits in shots]
        out[cell.id] = ",".join(str(c) for c in codes)
        q0 += cell.qubits
    return out


def sheet(plate_id, kind, counts, seconds):
    """Everything the page needs to know about one printed plate."""
    plate = plan(kind)[plate_id]
    cells = plate["cells"]
    qc = build(cells)
    return {
        "plate": plate_id,
        "act": plate["act"],
        "shots": sum(counts.values()),
        "seconds": seconds,
        "qubits": qc.num_qubits,
        "depth": qc.depth(),
        "gates": {name: int(n) for name, n in qc.count_ops().items() if name != "barrier"},
        "cells": [c.describe() | {"theory": c.theory()} for c in cells],
        "outcomes": split(cells, counts),
        "counts": counts,
    }


def print_plate(backend, plate_id, kind, shots):
    """Build, run and read one plate."""
    qc = build(plan(kind)[plate_id]["cells"])
    started = time.time()
    # IonQ's service drops barriers and takes one job per run, so its circuit
    # goes without them. Elsewhere they stay, unless the backend rejects them.
    if kind == "remote":
        counts = execute(backend, qc, shots, plain=True)
    else:
        try:
            counts = execute(backend, qc, shots)
        except Exception:
            counts = execute(backend, qc, shots, plain=True)
    return sheet(plate_id, kind, counts, round(time.time() - started, 2))
