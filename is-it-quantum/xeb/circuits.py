"""Random circuits and their fingerprints.

A random circuit spreads its answers unevenly: a few of the 2^n bitstrings come
up often, most come up rarely. That uneven pattern is the circuit's
fingerprint, and it can only be worked out by simulating the circuit.

Bit order everywhere in this package: qubit 0 is the lowest bit, so answer
number i has qubit q set when (i >> q) & 1 is 1.
"""

import random
from math import pi

from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector

QUBITS = 5
DEPTH = 5
SEEDS = (1970, 1983, 2019, 2024)
# The decay sweep: the same kind of circuit at these numbers of layers.
SWEEP_DEPTHS = (1, 2, 4, 6, 8, 12)
SWEEP_SEEDS = (1970, 2019)


def build(seed, qubits=QUBITS, depth=DEPTH):
    """One random circuit: layers of random turns, then CNOTs on random pairs.

    The pairs are drawn from all qubits, not just neighbours, so a machine with
    limited wiring has to add swaps to run it.
    """
    rng = random.Random(seed)
    qc = QuantumCircuit(qubits)
    for _ in range(depth):
        for q in range(qubits):
            qc.ry(rng.uniform(0, pi), q)
            qc.rz(rng.uniform(0, 2 * pi), q)
        order = list(range(qubits))
        rng.shuffle(order)
        for a, b in zip(order[::2], order[1::2]):
            qc.cx(a, b)
    for q in range(qubits):
        qc.ry(rng.uniform(0, pi), q)
    return qc


def fingerprint(qc):
    """The exact chance of every answer, from a classical simulation."""
    return [float(p) for p in Statevector(qc).probabilities()]


def describe(seed):
    qc = build(seed)
    return {
        "seed": seed,
        "qubits": qc.num_qubits,
        "depth": qc.depth(),
        "cnots": int(qc.count_ops().get("cx", 0)),
        "fingerprint": fingerprint(qc),
    }


def wide(seeds):
    """Every circuit side by side in one, for backends that take one job."""
    total = QUBITS * len(seeds)
    qc = QuantumCircuit(total, total)
    for k, seed in enumerate(seeds):
        qc.compose(build(seed), qubits=range(k * QUBITS, (k + 1) * QUBITS), inplace=True)
    qc.measure(range(total), range(total))
    return qc


def single(seed, depth=DEPTH):
    qc = QuantumCircuit(QUBITS, QUBITS)
    qc.compose(build(seed, depth=depth), inplace=True)
    qc.measure(range(QUBITS), range(QUBITS))
    return qc
