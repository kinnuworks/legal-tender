"""What main.js calls. Every function takes and returns plain values or JSON text."""

import json
import random
import time

from qiskit import transpile

from . import VERSION, circuits, score as scoring

LOCAL_SHOTS = 1024
REMOTE_SHOTS = 1024   # IonQ simulators: one job, so it may as well be a good one
QPU_SHOTS = 400        # a real IonQ machine: the same job, priced by the shot
FAKERS = ("coin", "mimic", "peeker")


def _backend_name(backend):
    for attr in ("name", "backend_name"):
        try:
            value = getattr(backend, attr)
            value = value() if callable(value) else value
            if value:
                return str(value)
        except Exception:
            pass
    return type(backend).__name__


def _kind(backend):
    """IonQ backends take one job per run on Qollab; everything else takes many."""
    text = f"{type(backend).__module__} {type(backend).__name__} {_backend_name(backend)}".lower()
    return "remote" if "ionq" in text else "local"


def _shots(backend, kind):
    if kind != "remote":
        return LOCAL_SHOTS
    text = f"{type(backend).__module__} {type(backend).__name__} {_backend_name(backend)}".lower()
    return QPU_SHOTS if "qpu" in text else REMOTE_SHOTS


def describe(backend, force_kind=""):
    """The machine that was picked and the circuits it will be tested on."""
    kind = force_kind or _kind(backend)
    return json.dumps({
        "version": VERSION,
        "backend": _backend_name(backend),
        "kind": kind,
        "shots": _shots(backend, kind),
        "qubits": circuits.QUBITS,
        "circuits": [circuits.describe(seed) for seed in circuits.SEEDS],
    })


def _counts(backend, qc, shots):
    try:
        ready = transpile(qc, backend)
    except Exception:
        ready = qc
    counts = backend.run(ready, shots=shots).result().get_counts()
    if isinstance(counts, list):
        counts = counts[0]
    out = {}
    for key, n in dict(counts).items():
        if isinstance(key, int):
            key = format(key, "b")
        key = str(key).replace(" ", "")
        if key.startswith("0x"):
            key = format(int(key, 16), "b")
        out[key.zfill(qc.num_qubits)[::-1]] = int(n)  # qubit 0 first
    return out


def _answers(counts, offset=0):
    """Counts for one circuit as a shuffled list of answer numbers."""
    answers = []
    for bits, n in counts.items():
        chunk = bits[offset:offset + circuits.QUBITS]
        answers.extend([sum(1 << q for q, b in enumerate(chunk) if b == "1")] * n)
    random.SystemRandom().shuffle(answers)
    return answers


def sample(backend, kind, shots):
    """Run every circuit on the selected backend and score its answers."""
    try:
        started = time.time()
        seeds = circuits.SEEDS
        runs = []
        if kind == "remote":
            counts = _counts(backend, circuits.wide(seeds), int(shots))
            runs = [_answers(counts, k * circuits.QUBITS) for k in range(len(seeds))]
            jobs = 1
        else:
            runs = [_answers(_counts(backend, circuits.single(seed), int(shots))) for seed in seeds]
            jobs = len(seeds)
        prints = [circuits.fingerprint(circuits.build(seed)) for seed in seeds]
        scores = [scoring.score(p, a) for p, a in zip(prints, runs)]
        out = {
            "ok": True,
            "backend": _backend_name(backend),
            "jobs": jobs,
            "seconds": round(time.time() - started, 2),
            "answers": [",".join(str(x) for x in a) for a in runs],
            "scores": scores,
            "combined": scoring.combine(scores),
        }
    except Exception as err:  # the page shows the message; it never invents answers
        out = {"ok": False, "error": f"{type(err).__name__}: {err}"}
    return json.dumps(out)


def fakers(shots):
    """Answers and scores for the three classical fakers, on every circuit."""
    rng = random.SystemRandom()
    out = {}
    for faker in FAKERS:
        prints = [circuits.fingerprint(circuits.build(seed)) for seed in circuits.SEEDS]
        runs = [scoring.fake(p, faker, int(shots), rng) for p in prints]
        scores = [scoring.score(p, a) for p, a in zip(prints, runs)]
        out[faker] = {
            "answers": [",".join(str(x) for x in a) for a in runs],
            "scores": scores,
            "combined": scoring.combine(scores),
            "expected": sum(scoring.expected(p, faker) for p in prints) / len(prints),
        }
    return json.dumps(out)


def export_evidence(text):
    """Offer the evidence record as a download in Qollab's console."""
    try:
        from js import sendFile
        sendFile("is-it-quantum-evidence.json", "application/json", str(text))
        return json.dumps({"sent": True})
    except Exception as err:
        return json.dumps({"sent": False, "error": str(err)})
