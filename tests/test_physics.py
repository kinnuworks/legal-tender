"""Checks that each circuit gives the textbook number on an ideal simulator.

Run from the repository root:  .venv/bin/python -m pytest tests -q
"""

import json
import sys
from pathlib import Path

import pytest
from qiskit.providers.basic_provider import BasicSimulator
from qiskit.quantum_info import Statevector

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "legal-tender"))

from legaltender import api, plates, proof, stats  # noqa: E402
from legaltender.cells import GUESSES, LENIENT_COPY, LENIENT_PAIR, SIX, STATES, TESTS, Cell  # noqa: E402


def exact(cell):
    """Exact outcome-code probabilities for one cell, from its statevector."""
    from qiskit import QuantumCircuit

    qc = QuantumCircuit(cell.qubits)
    cell.build(qc, 0)
    probs = Statevector(qc).probabilities_dict()
    out = {}
    for key, p in probs.items():
        code = cell.read(key[::-1])
        out[code] = out.get(code, 0.0) + p
    return out


@pytest.mark.parametrize("state", STATES)
def test_honest_note_always_passes(state):
    assert exact(Cell("honest", state)).get(1, 0) == pytest.approx(1.0)


@pytest.mark.parametrize("state", STATES)
@pytest.mark.parametrize("guess", GUESSES)
def test_photocopier_matches_its_theory(state, guess):
    cell = Cell("photocopier", state, guess=guess)
    assert exact(cell).get(3, 0) == pytest.approx(cell.theory()["both"])


def test_photocopier_averages_five_eighths():
    cells = [Cell("photocopier", s, guess=g) for s in STATES for g in GUESSES]
    mean = sum(exact(c).get(3, 0) for c in cells) / len(cells)
    assert mean == pytest.approx(stats.PHOTOCOPIER_PER_QUBIT)


@pytest.mark.parametrize("state", STATES)
def test_best_press_reaches_the_proven_ceiling_for_every_state(state):
    probs = exact(Cell("press", state))
    assert probs.get(3, 0) == pytest.approx(stats.SIMPLE_ATTACK_CEILING)
    note_alone = probs.get(1, 0) + probs.get(3, 0)
    copy_alone = probs.get(2, 0) + probs.get(3, 0)
    assert note_alone == pytest.approx(stats.BEST_SINGLE_COPY)
    assert copy_alone == pytest.approx(stats.BEST_SINGLE_COPY)


@pytest.mark.parametrize("state", STATES)
@pytest.mark.parametrize("test", TESTS)
@pytest.mark.parametrize("visits", [2, 4, 6])
def test_patient_forger_matches_theory(state, test, visits):
    cell = Cell("patient", state, test=test, visits=visits)
    probs = exact(cell)
    caught = sum(p for code, p in probs.items() if code % 100)
    theory = cell.theory()
    assert caught == pytest.approx(theory["caught"], abs=1e-9)
    free = 1 - caught
    probe_given_free = probs.get(100, 0) / free
    assert probe_given_free == pytest.approx(theory["probe"], abs=1e-9)


def test_patience_lowers_the_risk():
    risks = [Cell("patient", "0", test="X", visits=n).theory()["caught"] for n in (2, 4, 8, 12)]
    assert risks == sorted(risks, reverse=True)
    assert risks[0] == pytest.approx(0.75)
    assert risks[-1] < 0.2


@pytest.mark.parametrize("kind", ["local", "device", "remote"])
def test_every_plate_runs_and_agrees_with_theory(kind):
    backend = BasicSimulator()
    info = json.loads(api.describe(backend, kind))
    assert info["kind"] == kind
    for plate in info["plates"]:
        if plate["qubits"] > 22:
            continue  # the 24-qubit remote photocopier plate is too slow for a unit test
        sheet = json.loads(api.print_plate(backend, plate["id"], kind, 400))
        assert sheet["ok"], sheet
        assert sheet["shots"] == 400
        for cell in sheet["cells"]:
            codes = [int(c) for c in sheet["outcomes"][cell["id"]].split(",")]
            assert len(codes) == 400
            if cell["kind"] == "reprint":
                assert abs(codes.count(1) / 400 - cell["theory"]["pass"]) < 0.1
            elif cell["kind"] == "honest":
                assert codes.count(1) == 400
            elif cell["kind"] in ("press", "photocopier", "lenient", "universal"):
                both = codes.count(3) / 400
                assert abs(both - cell["theory"]["both"]) < 0.1
            else:
                caught = sum(1 for c in codes if c % 100) / 400
                assert abs(caught - cell["theory"]["caught"]) < 0.1


def test_local_plates_stay_narrow():
    for plate in plates.plan("local").values():
        assert sum(c.qubits for c in plate["cells"]) <= 14
    device = plates.plan("device")
    assert len(device) < len(plates.plan("local"))
    assert all(sum(c.qubits for c in plate["cells"]) <= 16 for plate in device.values())
    sheet = plates.plan("remote")["proof-1"]["cells"]
    assert sum(c.qubits for c in sheet) == 22
    assert {c.kind for c in sheet} == {"honest", "press", "lenient", "universal"}


def test_wilson_interval_brackets_the_estimate():
    r = stats.rate(100, 1000)
    assert r["lo"] < 0.1 < r["hi"]


def test_ticket_length_is_sensible():
    good = stats.ticket(0.99, 5 / 6)
    assert good["ok"] and good["n"] < 400
    assert good["honest_reject"] <= 0.01 and good["forger_accept"] <= 1e-6
    assert good["need"] / good["n"] > 5 / 6
    assert not stats.ticket(0.8, 5 / 6)["ok"]
    worse = stats.ticket(0.95, 5 / 6)
    assert worse["n"] > good["n"]
    assert not stats.ticket(0.88, 5 / 6)["ok"]


def test_patient_code_records_the_visit_that_failed():
    cell = Cell("patient", "0", test="X", visits=4)
    assert cell.read("00" + "0000") == 0
    assert cell.read("01" + "0000") == 100
    assert cell.read("00" + "0010") == 3
    assert cell.read("01" + "0110") == 102


def test_counts_collected_by_the_page_read_the_same_way():
    backend = BasicSimulator()
    qc = api.plate_circuit(backend, "proof-1", "remote")
    counts = dict(backend.run(qc, shots=300).result().get_counts())
    sheet = json.loads(api.read_plate("proof-1", "remote", json.dumps(counts), 0.5, "basic_simulator"))
    assert sheet["ok"] and sheet["shots"] == 300 and sheet["qubits"] == 22
    honest = [int(c) for c in sheet["outcomes"]["honest:-"].split(",")]
    assert honest.count(1) == 300
    press = [int(c) for c in sheet["outcomes"]["press:+"].split(",")]
    assert abs(press.count(3) / 300 - 0.75) < 0.1
    bad = json.loads(api.read_plate("no-such-plate", "remote", "{}", 0, "x"))
    assert not bad["ok"]


def test_describe_by_name_matches_describe():
    named = json.loads(api.describe_named("ionq_simulator"))
    assert named["kind"] == "remote" and len(named["plates"]) == 3
    assert json.loads(api.describe_named("fake_kingston"))["kind"] == "device"
    assert json.loads(api.describe_named("basic_simulator"))["kind"] == "local"


def test_best_press_is_the_published_cloning_channel():
    """The press circuit is the optimal map from Molina, Vidick and Watrous.

    Their channel has Kraus operators A0 and A1 from one qubit to two. Written
    as one isometry it sends |0> to (3|00>|0> + |11>|0> + |01>|1> + |10>|1>)/sqrt(12)
    and |1> to the same with every bit flipped, where the third qubit is scrap.
    """
    import numpy as np
    from qiskit import QuantumCircuit

    from legaltender.cells import teller_check

    targets = {
        "0": {"000": 3, "110": 1, "011": 1, "101": 1},
        "1": {"111": 3, "001": 1, "100": 1, "010": 1},
    }
    for state, amplitudes in targets.items():
        qc = QuantumCircuit(3)
        Cell("press", state).build(qc, 0)
        # build() ends with the teller's check; undo it to see the copies.
        teller_check(qc, 0, state)
        teller_check(qc, 1, state)
        out = Statevector(qc)
        want = np.zeros(8)
        for bits, amp in amplitudes.items():
            note, copy, scrap = (int(b) for b in bits)
            want[note + 2 * copy + 4 * scrap] = amp / np.sqrt(12)
        assert abs(abs(np.vdot(want, out.data)) - 1) < 1e-9


def test_reprints_pass_only_when_the_forger_is_right():
    for truth in STATES:
        for belief in STATES:
            cell = Cell("reprint", truth, guess=belief)
            assert exact(cell).get(1, 0) == pytest.approx(cell.theory()["pass"])
    assert Cell("reprint", "+", guess="+").theory()["pass"] == 1.0
    assert Cell("reprint", "+", guess="-").theory()["pass"] == 0.0
    assert Cell("reprint", "+", guess="0").theory()["pass"] == 0.5


def test_heist_odds_grow_with_patience():
    from legaltender.cells import heist_note, heist_qubit

    assert heist_qubit("+", 8) == pytest.approx(1.0)
    assert heist_qubit("-", 8) == pytest.approx(heist_qubit("0", 8) ** 2)
    odds = [heist_note(n) for n in (4, 8, 12, 1000)]
    assert odds == sorted(odds)
    assert odds[0] < 0.02 and 0.09 < odds[1] < 0.11 and 0.2 < odds[2] < 0.22 and odds[3] > 0.97


def test_a_heist_on_an_ideal_machine_names_every_qubit():
    """Play the forger's three-test routine against each state, exactly."""
    from legaltender.cells import HEIST_NAMES, HEIST_TESTS

    for truth in STATES:
        belief = "-"
        for test in HEIST_TESTS:
            probs = exact(Cell("patient", truth, test=test, visits=8))
            free = sum(p for code, p in probs.items() if code % 100 == 0)
            probe_one = probs.get(100, 0) / free
            assert probe_one == pytest.approx(1.0 if HEIST_NAMES[test] == truth else 0.0, abs=1e-9)
            if probe_one > 0.5:
                belief = HEIST_NAMES[test]
                break
        assert belief == truth


def test_only_ideal_simulators_get_the_heist():
    local = {c.id for plate in plates.plan("local").values() for c in plate["cells"]}
    device = {c.id for plate in plates.plan("device").values() for c in plate["cells"]}
    assert "patient:-:-Z:12" in local and "reprint:0:+" in local
    assert "patient:-:-Z:12" not in device and "reprint:0:+" not in device
    assert all(sum(c.qubits for c in plate["cells"]) <= 14 for plate in plates.plan("local").values())


# ---------- Six-way notes and the two machines built for them ----------

@pytest.mark.parametrize("state", SIX)
def test_every_six_way_qubit_passes_when_genuine(state):
    assert exact(Cell("honest", state)).get(1, 0) == pytest.approx(1.0)


@pytest.mark.parametrize("state", STATES)
def test_second_press_makes_each_copy_as_good_as_it_can_be(state):
    probs = exact(Cell("lenient", state))
    assert probs.get(3, 0) == pytest.approx(LENIENT_PAIR)
    assert probs.get(1, 0) + probs.get(3, 0) == pytest.approx(LENIENT_COPY)
    assert probs.get(2, 0) + probs.get(3, 0) == pytest.approx(LENIENT_COPY)
    assert LENIENT_COPY == pytest.approx(0.8535533905932737)


@pytest.mark.parametrize("state", SIX)
def test_universal_cloner_treats_every_state_alike(state):
    probs = exact(Cell("universal", state))
    assert probs.get(3, 0) == pytest.approx(2 / 3)
    assert probs.get(1, 0) + probs.get(3, 0) == pytest.approx(5 / 6)
    assert probs.get(2, 0) + probs.get(3, 0) == pytest.approx(5 / 6)


# ---------- The proof ----------

def test_limits_are_the_known_values():
    assert proof.limit(STATES, "strict") == pytest.approx(3 / 4, abs=1e-12)
    assert proof.limit(STATES, "forgiving") == pytest.approx(0.5 + 0.125 ** 0.5, abs=1e-12)
    assert proof.limit(SIX, "strict") == pytest.approx(2 / 3, abs=1e-12)
    assert proof.limit(SIX, "forgiving") == pytest.approx(5 / 6, abs=1e-12)
    for note in ("four", "six"):
        assert stats.PAIR_CEILING[note] == pytest.approx(proof.limit(proof.NOTES[note], "strict"))
        assert stats.COPY_CEILING[note] == pytest.approx(proof.limit(proof.NOTES[note], "forgiving"))


@pytest.mark.parametrize("line", proof.certificates(), ids=lambda c: f"{c['note']}-{c['teller']}")
def test_every_certificate_closes(line):
    # The circuit reaches the limit, and it does so for every state alike.
    assert line["gap"] < 1e-12
    assert line["spread"] < 1e-12
    assert line["reached"] <= line["limit"] + 1e-12


def flat(state):
    """Amplitudes in Qiskit's order, with qubit 0 as the lowest bit."""
    import numpy as np

    return np.transpose(state, tuple(reversed(range(state.ndim)))).reshape(-1)


@pytest.mark.parametrize("cell", [
    Cell("honest", "L"), Cell("reprint", "0", guess="-"), Cell("photocopier", "-", guess="X"),
    Cell("press", "+"), Cell("lenient", "1"), Cell("universal", "R"),
    Cell("patient", "0", test="X", visits=3), Cell("patient", "-", test="-Z", visits=2),
], ids=lambda c: c.id)
def test_own_amplitudes_agree_with_qiskit(cell):
    import numpy as np
    from qiskit import QuantumCircuit

    qc = QuantumCircuit(cell.qubits)
    cell.build(qc, 0)
    assert np.allclose(flat(proof.amplitudes(qc)), Statevector(qc).data, atol=1e-12)


def choi(kind):
    """The Choi matrix of one machine, read off its own circuit.

    For the states "0" and "1" the bank's printing and the teller's check are
    at most an X, so the circuit's amplitudes give the machine's two columns.
    """
    import numpy as np
    from qiskit import QuantumCircuit

    columns = []
    for bit, state in enumerate("01"):
        cell = Cell(kind, state)
        qc = QuantumCircuit(cell.qubits)
        cell.build(qc, 0)
        out = proof.amplitudes(qc)
        if bit:
            out = out[::-1, ::-1]          # undo the teller's X on original and copy
        columns.append(out.reshape(4, -1))  # rows: original, copy; columns: scrap
    j = np.zeros((8, 8), dtype=complex)
    for a in range(2):
        for b in range(2):
            block = columns[a] @ columns[b].conj().T
            unit = np.zeros((2, 2))
            unit[a, b] = 1
            j += np.kron(block, unit)
    return j


@pytest.mark.parametrize("line", proof.certificates(), ids=lambda c: f"{c['note']}-{c['teller']}")
def test_the_operator_scores_a_machine_as_its_circuit_does(line):
    import numpy as np

    j = choi(line["machine"])
    assert np.trace(j).real == pytest.approx(2.0)
    assert np.linalg.eigvalsh(j)[0] > -1e-12
    q = proof.operator(proof.NOTES[line["note"]], line["teller"])
    assert np.trace(q @ j).real == pytest.approx(line["reached"], abs=1e-12)


def test_no_random_machine_beats_the_limit():
    import numpy as np

    rng = np.random.default_rng(2012)
    for note, teller in proof.MACHINES:
        q = proof.operator(proof.NOTES[note], teller)
        top = proof.limit(proof.NOTES[note], teller)
        best = 0.0
        for _ in range(400):
            # A random machine: a random isometry from one qubit to two qubits and scrap.
            raw = rng.normal(size=(16, 2)) + 1j * rng.normal(size=(16, 2))
            v, _r = np.linalg.qr(raw)
            cols = [v[:, k].reshape(4, 4) for k in range(2)]
            j = np.zeros((8, 8), dtype=complex)
            for a in range(2):
                for b in range(2):
                    unit = np.zeros((2, 2))
                    unit[a, b] = 1
                    j += np.kron(cols[a] @ cols[b].conj().T, unit)
            best = max(best, np.trace(q @ j).real)
        assert best <= top + 1e-9
        assert best > 0.3   # the search is not trivially low


def test_a_machine_built_for_the_wrong_note_does_worse():
    assert proof.cross_score("press", "six", "strict") < 2 / 3 - 0.01
    assert proof.cross_score("press", "six", "forgiving") < 5 / 6 - 0.01
    assert proof.cross_score("lenient", "six", "forgiving") < 5 / 6 - 0.01
    assert proof.cross_score("universal", "four", "strict") < 3 / 4 - 0.01
    assert proof.cross_score("universal", "four", "forgiving") < LENIENT_COPY - 0.01


def test_six_way_tickets_are_shorter():
    both = stats.tickets(0.99)
    assert both["four"]["ok"] and both["six"]["ok"]
    assert both["six"]["n"] < both["four"]["n"]
    # Between the two floors only the six-way note can be made safe.
    assert not stats.ticket(0.85, stats.COPY_CEILING["four"])["ok"]
    assert stats.COPY_CEILING["six"] < 0.85 < stats.COPY_CEILING["four"]


# ---------- Hand-overs ----------

def test_barriers_change_no_result():
    from qiskit import QuantumCircuit

    for cell in (Cell("press", "-"), Cell("universal", "L"), Cell("patient", "0", test="X", visits=2)):
        qc = QuantumCircuit(cell.qubits)
        cell.build(qc, 0)
        assert "barrier" in qc.count_ops()
        stripped = plates.bare(qc)
        assert "barrier" not in stripped.count_ops()
        assert Statevector(stripped).equiv(Statevector(qc))


def test_a_hand_over_stops_the_compiler_merging_print_and_check():
    from qiskit import QuantumCircuit, transpile

    cell = Cell("honest", "+")
    qc = QuantumCircuit(1, 1)
    cell.build(qc, 0)
    qc.measure(0, 0)
    basis = ["rz", "sx", "x", "cx"]
    kept = transpile(qc, basis_gates=basis, optimization_level=2)
    merged = transpile(plates.bare(qc), basis_gates=basis, optimization_level=2)
    gates = lambda c: sum(n for name, n in c.count_ops().items() if name not in ("measure", "barrier"))  # noqa: E731
    assert gates(merged) == 0     # print and check cancel to nothing
    assert gates(kept) > 0        # with the hand-over, both are really run


@pytest.mark.parametrize("row", [stats.TICKET_TABLE[0], stats.TICKET_TABLE[3], stats.TICKET_TABLE[7], stats.TICKET_TABLE[11]], ids=lambda r: str(r[0]))
def test_ticket_table_is_what_the_calculation_gives(row):
    rate, four, six = row
    both = stats.tickets(rate)
    assert (both["four"]["n"] if both["four"]["ok"] else None) == four
    assert (both["six"]["n"] if both["six"]["ok"] else None) == six


def test_a_real_machine_gets_the_same_sheet_with_fewer_shots():
    class IonQQPUBackend:          # shaped like qiskit-ionq's hardware backend
        name = "ionq_qpu.forte-1"

    class IonQSimulatorBackend:
        name = "ionq_simulator"

    real = json.loads(api.describe(IonQQPUBackend()))
    model = json.loads(api.describe(IonQSimulatorBackend()))
    assert real["kind"] == model["kind"] == "remote"
    assert real["plates"] == model["plates"]
    assert real["shots"] == api.QPU_SHOTS < model["shots"] == api.REMOTE_SHOTS

