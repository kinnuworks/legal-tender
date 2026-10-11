"""What main.js calls. Every function takes and returns plain values or JSON text."""

import json

from . import VERSION, cells, plates, proof, stats

LOCAL_SHOTS = 1024
REMOTE_SHOTS = 1024    # IonQ simulators: one job, so it may as well be a good one
QPU_SHOTS = 400        # a real IonQ machine: the same sheet, priced by the shot
DEVICE_SHOTS = 512     # noise models of real devices are slow to simulate


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
    """How this machine has to be driven.

    IonQ backends take one job per run on Qollab. Noise models of real devices
    (the IBM ones) accept many jobs but each is slow. Everything else is quick.
    """
    text = f"{type(backend).__module__} {type(backend).__name__} {_backend_name(backend)}".lower()
    if "ionq" in text:
        return "remote"
    if "fake" in text:
        return "device"
    return "local"


def _proof():
    """The four certificates, or the reason they could not be worked out."""
    try:
        return {"ok": True, "lines": proof.certificates()}
    except Exception as err:
        return {"ok": False, "error": f"{type(err).__name__}: {err}"}


def _shots(name, module, kind):
    if kind == "local":
        return LOCAL_SHOTS
    if kind == "remote":
        return QPU_SHOTS if "qpu" in f"{module} {name}".lower() else REMOTE_SHOTS
    return DEVICE_SHOTS


def _describe(name, module, kind):
    plan = plates.plan(kind)
    return json.dumps({
        "version": VERSION,
        "backend": name,
        "module": module,
        "kind": kind,
        "shots": _shots(name, module, kind),
        "titles": plates.ACT_TITLES,
        "plates": [
            {"id": pid, "act": p["act"], "qubits": sum(c.qubits for c in p["cells"]),
             "cells": [c.id for c in p["cells"]]}
            for pid, p in plan.items()
        ],
        "theory": {
            "photocopier": stats.PHOTOCOPIER_PER_QUBIT,
            "press": stats.PAIR_CEILING["four"],
            "single": stats.BEST_SINGLE_COPY,
            "lenient": cells.LENIENT_COPY,
            "lenient_pair": cells.LENIENT_PAIR,
            "universal": stats.PAIR_CEILING["six"],
            "pair": stats.PAIR_CEILING,
            "floor": stats.COPY_CEILING,
            "heist": {str(n): cells.heist_note(n) for n in plates.HEIST_VISITS + (1000,)},
        },
        "proof": _proof(),
        "tickets": stats.TICKET_TABLE,
    })


def describe(backend, force_kind=""):
    """Which machine was picked and which plates it can print."""
    module = f"{type(backend).__module__}.{type(backend).__name__}"
    return _describe(_backend_name(backend), module, force_kind or _kind(backend))


def describe_named(name, force_kind=""):
    """The same, when the page can only tell Python the machine's name."""
    text = str(name).lower()
    kind = force_kind or ("remote" if "ionq" in text else "device" if "fake" in text else "local")
    return _describe(str(name) or "selected backend", "", kind)


def print_plate(backend, plate_id, kind, shots):
    """Run one plate on the selected backend. Returns the outcomes as JSON."""
    try:
        sheet = plates.print_plate(backend, str(plate_id), str(kind), int(shots))
        sheet["backend"] = _backend_name(backend)
        sheet["ok"] = True
    except Exception as err:  # the page shows the message; it never invents results
        sheet = {"ok": False, "plate": str(plate_id), "error": f"{type(err).__name__}: {err}"}
    return json.dumps(sheet)


def ticket(honest, forger):
    """Shortest safe ticket for a machine with these per-qubit pass rates."""
    return json.dumps(stats.ticket(float(honest), float(forger)))


def tickets(honest):
    """Shortest safe ticket of each kind, four-way and six-way, for one machine."""
    return json.dumps(stats.tickets(float(honest)))


def export_evidence(text):
    """Offer the evidence record as a download in Qollab's console."""
    try:
        from js import sendFile
        sendFile("legal-tender-evidence.json", "application/json", str(text))
        return json.dumps({"sent": True})
    except Exception as err:
        return json.dumps({"sent": False, "error": str(err)})


# The page normally lets print_plate run the job. If that fails it asks for the
# circuit, runs it on the backend itself, and hands the counts back to be read.

def plate_circuit(backend, plate_id, kind):
    """One plate's circuit, fitted to the selected backend."""
    qc = plates.bare(plates.build(plates.plan(str(kind))[str(plate_id)]["cells"]))
    return plates.ready(backend, qc)


def plain_circuit(plate_id, kind):
    """One plate's circuit as written, for backends Python cannot be handed."""
    return plates.bare(plates.build(plates.plan(str(kind))[str(plate_id)]["cells"]))


def read_plate(plate_id, kind, counts_json, seconds, backend_name):
    """Read counts the page collected into the same sheet print_plate returns."""
    try:
        plate = plates.plan(str(kind))[str(plate_id)]
        width = sum(c.qubits for c in plate["cells"])
        counts = plates.tidy(json.loads(str(counts_json)), width)
        sheet = plates.sheet(str(plate_id), str(kind), counts, float(seconds))
        sheet["backend"] = str(backend_name)
        sheet["ok"] = True
    except Exception as err:
        sheet = {"ok": False, "plate": str(plate_id), "error": f"{type(err).__name__}: {err}"}
    return json.dumps(sheet)
