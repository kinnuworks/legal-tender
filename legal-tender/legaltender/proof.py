"""Proof that no forging machine beats the ones in this project.

Every forging machine, however clever, takes one note qubit in and hands two
qubits out. Write the machine as its Choi matrix J, an 8 x 8 matrix that is
positive and has trace 2. Its score with the teller, averaged over the states
the bank might have used, is trace(Q J), where Q is built below from those
states and from what the teller counts as a pass.

Because J is positive,

    trace(Q J)  <=  largest eigenvalue of Q  x  trace(J)  =  2 x largest eigenvalue of Q.

That is an upper limit on every possible machine. The lower limit is a machine
that exists: the circuits in cells.py, whose exact scores are worked out here
from their amplitudes. Where the two numbers agree, the circuit is the best
machine there can be.

Two tellers are covered. A strict teller wants every qubit right, so the
forger needs the original and the copy to pass together. A forgiving teller
lets a few wrong qubits through, which every real machine needs, so what
counts is how often one copy passes on its own.
"""

from math import cos, sin, sqrt

import numpy as np
from qiskit import QuantumCircuit

from .cells import SIX, STATES, Cell

_H = sqrt(0.5)
KETS = {
    "0": (1, 0), "1": (0, 1),
    "+": (_H, _H), "-": (_H, -_H),
    "R": (_H, 1j * _H), "L": (_H, -1j * _H),
}
NOTES = {"four": STATES, "six": SIX}
# The best machine for each note and teller, by the name cells.py gives it.
MACHINES = {
    ("four", "strict"): "press",
    ("four", "forgiving"): "lenient",
    ("six", "strict"): "universal",
    ("six", "forgiving"): "universal",
}


def operator(states, teller):
    """Q for these note states and this teller. Order: original, copy, input."""
    eye = np.eye(2)
    q = np.zeros((8, 8), dtype=complex)
    for name in states:
        ket = np.array(KETS[name], dtype=complex)
        p = np.outer(ket, ket.conj())
        if teller == "strict":
            passed = np.kron(p, p)
        else:
            passed = (np.kron(p, eye) + np.kron(eye, p)) / 2
        q += np.kron(passed, p.T) / len(states)
    return q


def limit(states, teller):
    """The most any forging machine can score: 2 x the largest eigenvalue of Q."""
    return 2 * float(np.linalg.eigvalsh(operator(states, teller))[-1])


def _gate(name, params):
    if name == "x":
        return np.array([[0, 1], [1, 0]], dtype=complex)
    if name == "z":
        return np.array([[1, 0], [0, -1]], dtype=complex)
    if name == "h":
        return np.array([[_H, _H], [_H, -_H]], dtype=complex)
    if name == "s":
        return np.array([[1, 0], [0, 1j]], dtype=complex)
    if name == "sdg":
        return np.array([[1, 0], [0, -1j]], dtype=complex)
    if name == "ry":
        half = float(params[0]) / 2
        return np.array([[cos(half), -sin(half)], [sin(half), cos(half)]], dtype=complex)
    raise ValueError(f"no matrix for gate {name!r}")


def amplitudes(qc):
    """Exact final amplitudes of a circuit, as an array with one axis per qubit.

    A few lines of linear algebra that share nothing with the simulators the
    measurements run on, so the two check each other.
    """
    n = qc.num_qubits
    state = np.zeros((2,) * n, dtype=complex)
    state[(0,) * n] = 1
    for inst in qc.data:
        name = inst.operation.name
        if name == "barrier":
            continue
        where = [qc.find_bit(q).index for q in inst.qubits]
        if name in ("cx", "cz"):
            control, target = where
            gate = _gate("x" if name == "cx" else "z", ())
            picked = [slice(None)] * n
            picked[control] = 1
            picked = tuple(picked)
            axis = target if target < control else target - 1
            state[picked] = np.moveaxis(np.tensordot(gate, state[picked], axes=([1], [axis])), 0, axis)
        else:
            (target,) = where
            gate = _gate(name, inst.operation.params)
            state = np.moveaxis(np.tensordot(gate, state, axes=([1], [target])), 0, target)
    return state


def score(kind, state, teller):
    """Exactly how often this machine gets one note state past this teller."""
    cell = Cell(kind, state)
    qc = QuantumCircuit(cell.qubits)
    cell.build(qc, 0)
    chance = np.abs(amplitudes(qc)) ** 2
    rest = tuple(range(2, cell.qubits))
    pair = chance.sum(axis=rest) if rest else chance   # [original bit][copy bit]; 0 is a pass
    if teller == "strict":
        return float(pair[0, 0])
    return float((pair[0, :].sum() + pair[:, 0].sum()) / 2)


def certificate(note, teller):
    """One line of the proof: the limit, the machine, and how far apart they are."""
    states = NOTES[note]
    kind = MACHINES[(note, teller)]
    scores = [score(kind, s, teller) for s in states]
    reached = sum(scores) / len(scores)
    top = limit(states, teller)
    return {
        "note": note,
        "teller": teller,
        "machine": kind,
        "limit": top,
        "reached": reached,
        "gap": abs(top - reached),
        "spread": max(scores) - min(scores),
        "eigenvalues": [round(float(v), 9) for v in np.linalg.eigvalsh(operator(states, teller))[::-1]],
    }


def certificates():
    """All four lines: both notes against both tellers."""
    return [certificate(note, teller) for note in ("four", "six") for teller in ("strict", "forgiving")]


def cross_score(kind, note, teller):
    """How a machine built for one note fares on another (for the write-up)."""
    scores = [score(kind, s, teller) for s in NOTES[note]]
    return sum(scores) / len(scores)
