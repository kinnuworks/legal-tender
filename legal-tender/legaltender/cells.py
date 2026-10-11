"""The circuits behind every note, forgery and teller check.

A banknote's serial number is a row of qubits. The bank prepares each one in
a secret state and keeps the list to itself:

    "0", "1"   straight (the Z basis)
    "+", "-"   diagonal (the X basis)
    "R", "L"   circular (the Y basis), used only by six-way notes

Wiesner's original note uses the first four. The six-way note adds the last
two, which leaves the best forger worse off.

A cell is one small experiment on one note qubit. Cells never share qubits, so
several fit side by side in one circuit (a plate) and their results stay
independent. Every cell measures all of its qubits.
"""

from dataclasses import dataclass
from math import acos, cos, pi, sin, sqrt

STATES = ("0", "1", "+", "-")
SIX = STATES + ("R", "L")
GUESSES = ("Z", "X")
TESTS = ("X", "Z", "-X", "-Z")

# What one copy from the second press scores with a teller, and what the pair
# scores together: 1/2 + 1/sqrt(8) and its square.
LENIENT_COPY = 0.5 + sqrt(0.125)
LENIENT_PAIR = LENIENT_COPY ** 2


def prepare(qc, q, state):
    """The bank prints one note qubit in its secret state."""
    if state in ("1", "-", "L"):
        qc.x(q)
    if state not in ("0", "1"):
        qc.h(q)
    if state in ("R", "L"):
        qc.s(q)


def teller_check(qc, q, state):
    """Rotate a note qubit so that a genuine one reads 0 and a fake reads 1."""
    if state in ("R", "L"):
        qc.sdg(q)
    if state not in ("0", "1"):
        qc.h(q)
    if state in ("1", "-", "L"):
        qc.x(q)


def teller_return(qc, q, state):
    """Undo teller_check, so a note that passed goes back as it came in."""
    prepare(qc, q, state)


def handover(qc, *qubits):
    """The note changes hands.

    The bank, the forger and the teller act one after another, and none of
    them sees the others' gates. A barrier stops a compiler from merging one
    party's gates into the next party's.
    """
    qc.barrier(*qubits)


def _turn_if(qc, angle, control, target):
    """Turn `target` by `angle` about Y when `control` reads 1."""
    qc.ry(angle / 2, target)
    qc.cx(control, target)
    qc.ry(-angle / 2, target)
    qc.cx(control, target)


@dataclass(frozen=True)
class Cell:
    kind: str          # honest | photocopier | press | lenient | universal
                       # | patient | reprint
    state: str         # the bank's secret state for this qubit
    guess: str = ""    # forger's basis guess (photocopier), or the state the
                       # forger believes the qubit is in (reprint)
    test: str = ""     # controlled gate the patient forger uses
    visits: int = 0    # trips to the teller (patient)

    @property
    def id(self):
        if self.kind in ("honest", "press", "lenient", "universal"):
            return f"{self.kind}:{self.state}"
        if self.kind == "reprint":
            return f"reprint:{self.state}:{self.guess}"
        if self.kind == "patient":
            return f"patient:{self.state}:{self.test}:{self.visits}"
        return f"{self.kind}:{self.state}:{self.guess}"

    @property
    def qubits(self):
        fixed = {"honest": 1, "reprint": 1, "lenient": 2, "photocopier": 3, "press": 3, "universal": 3}
        return fixed.get(self.kind, 2 + self.visits)

    def describe(self):
        d = {"id": self.id, "kind": self.kind, "state": self.state, "qubits": self.qubits}
        if self.guess:
            d["guess"] = self.guess
        if self.kind == "patient":
            d["test"] = self.test
            d["visits"] = self.visits
        return d

    def build(self, qc, q0):
        """Add this cell to qc on qubits q0, q0+1, ... (measurement comes later)."""
        if self.kind == "honest":
            prepare(qc, q0, self.state)
            handover(qc, q0)
            teller_check(qc, q0, self.state)
        elif self.kind == "reprint":
            # A forger who believes the qubit is `guess` prints a fresh one
            # that way. The teller checks it against the true state.
            prepare(qc, q0, self.guess)
            handover(qc, q0)
            teller_check(qc, q0, self.state)
        elif self.kind == "photocopier":
            self._photocopier(qc, q0)
        elif self.kind == "press":
            self._press(qc, q0)
        elif self.kind == "lenient":
            self._lenient(qc, q0)
        elif self.kind == "universal":
            self._universal(qc, q0)
        elif self.kind == "patient":
            self._patient(qc, q0)
        else:
            raise ValueError(f"unknown cell kind {self.kind!r}")

    def _photocopier(self, qc, q0):
        # Measure the note in the guessed basis, then print a second note from
        # what was read. The read-out is written to a record qubit (deferred
        # measurement), which collapses the original exactly as a real
        # measurement would.
        note, record, copy = q0, q0 + 1, q0 + 2
        prepare(qc, note, self.state)
        handover(qc, note, record, copy)
        if self.guess == "X":
            qc.h(note)
        qc.cx(note, record)
        qc.cx(note, copy)
        if self.guess == "X":
            qc.h(note)
            qc.h(copy)
        handover(qc, note, record, copy)
        teller_check(qc, note, self.state)
        teller_check(qc, copy, self.state)

    def _press(self, qc, q0):
        # The best copier physics allows for these four states (Molina, Vidick
        # and Watrous, 2012). It needs no guess. Two blank qubits are set to
        # (3|00> + |01> + |10> + |11>) / sqrt(12), then four CNOTs spread the
        # note across the original and the copy. The third qubit is scrap.
        note, copy, scrap = q0, q0 + 1, q0 + 2
        prepare(qc, note, self.state)
        handover(qc, note, copy, scrap)
        first = 2 * acos(sqrt(10 / 12))
        if_zero = 2 * acos(3 / sqrt(10))
        if_one = pi / 2
        qc.ry(first, copy)
        qc.ry((if_zero + if_one) / 2, scrap)
        qc.cx(copy, scrap)
        qc.ry((if_zero - if_one) / 2, scrap)
        qc.cx(copy, scrap)
        qc.cx(note, copy)
        qc.cx(note, scrap)
        qc.cx(copy, note)
        qc.cx(scrap, note)
        handover(qc, note, copy, scrap)
        teller_check(qc, note, self.state)
        teller_check(qc, copy, self.state)

    def _lenient(self, qc, q0):
        # The best copier against a teller who forgives a few wrong qubits.
        # It makes each copy as good as physics allows for these four states,
        # 85.4%, at the cost of the pair passing together a little less often
        # (the phase-covariant cloner of Bruss and co-authors, 2000, in the
        # two-qubit form of Niu and Griffiths, 1999). It needs no scrap qubit.
        # The four states lie on one circle, and the first two gates turn
        # that circle to where the copier expects it.
        note, copy = q0, q0 + 1
        prepare(qc, note, self.state)
        handover(qc, note, copy)
        qc.sdg(note)
        qc.h(note)
        _turn_if(qc, pi / 2, note, copy)
        qc.cx(copy, note)
        for q in (note, copy):
            qc.h(q)
            qc.s(q)
        handover(qc, note, copy)
        teller_check(qc, note, self.state)
        teller_check(qc, copy, self.state)

    def _universal(self, qc, q0):
        # The universal cloner (Buzek and Hillery, 1996), which treats every
        # state alike and is the best copier there is for six-way notes. The
        # blank qubits start as (2|00> + |01> + |11>) / sqrt(6), written copy
        # first, and the same four CNOTs as the best press do the rest.
        note, copy, scrap = q0, q0 + 1, q0 + 2
        prepare(qc, note, self.state)
        handover(qc, note, copy, scrap)
        qc.ry(2 * acos(sqrt(2 / 3)), scrap)
        _turn_if(qc, pi / 2, scrap, copy)
        qc.cx(note, copy)
        qc.cx(note, scrap)
        qc.cx(copy, note)
        qc.cx(scrap, note)
        handover(qc, note, copy, scrap)
        teller_check(qc, note, self.state)
        teller_check(qc, copy, self.state)

    def _patient(self, qc, q0):
        # Bomb-testing attack (Brodutch, Nagaj, Sattath, Unruh, 2014). A probe
        # qubit is nudged by a small angle, touches the note through one
        # controlled gate, and the note goes to the teller. The teller's check
        # is recorded on a fresh qubit each visit; a 1 on any record means the
        # forger was caught on that visit.
        note, probe = q0, q0 + 1
        theta = pi / (2 * self.visits)
        prepare(qc, note, self.state)
        handover(qc, note, probe)
        for k in range(self.visits):
            qc.ry(2 * theta, probe)
            if self.test in ("X", "-X"):
                qc.cx(probe, note)
            else:
                qc.cz(probe, note)
            if self.test.startswith("-"):
                qc.z(probe)
            handover(qc, note, probe)
            teller_check(qc, note, self.state)
            qc.cx(note, q0 + 2 + k)
            teller_return(qc, note, self.state)
            handover(qc, note, probe)

    def read(self, bits):
        """Turn this cell's measured bits (in qubit order) into one outcome code.

        honest       1 = passed
        photocopier  bit 0 = original passed, bit 1 = copy passed
        press, lenient, universal   the same two bits
        patient      the visit on which the teller caught the forger (0 = never),
                     plus 100 if the probe read 1
        """
        if self.kind in ("honest", "reprint"):
            return 1 if bits[0] == "0" else 0
        if self.kind == "photocopier":
            return (1 if bits[0] == "0" else 0) + (2 if bits[2] == "0" else 0)
        if self.kind in ("press", "lenient", "universal"):
            return (1 if bits[0] == "0" else 0) + (2 if bits[1] == "0" else 0)
        records = bits[2:]
        caught_on = records.index("1") + 1 if "1" in records else 0
        return caught_on + (100 if bits[1] == "1" else 0)

    def theory(self):
        """What an ideal machine would give for this cell."""
        if self.kind == "honest":
            return {"pass": 1.0}
        if self.kind == "reprint":
            if self.guess == self.state:
                return {"pass": 1.0}
            same_basis = (self.guess in "01") == (self.state in "01")
            return {"pass": 0.0 if same_basis else 0.5}
        if self.kind == "press":
            return {"both": 0.75, "single": 5 / 6}
        if self.kind == "lenient":
            return {"both": LENIENT_PAIR, "single": LENIENT_COPY}
        if self.kind == "universal":
            return {"both": 2 / 3, "single": 5 / 6}
        if self.kind == "photocopier":
            matched = (self.guess == "Z") == (self.state in ("0", "1"))
            return {"both": 1.0 if matched else 0.25, "single": 1.0 if matched else 0.5}
        return {"caught": patient_caught(self.state, self.test, self.visits),
                "probe": patient_probe(self.state, self.test, self.visits)}


def _relation(state, test):
    """How the note's state sits against the forger's controlled gate."""
    gate_basis = "X" if test in ("X", "-X") else "Z"
    state_basis = "X" if state in ("+", "-") else "Z"
    if gate_basis != state_basis:
        return "risky"
    plus_eigen = state in ("+", "0")
    if test.startswith("-"):
        plus_eigen = not plus_eigen
    return "safe" if plus_eigen else "kickback"


def patient_caught(state, test, visits):
    """Chance the teller catches the patient forger on this qubit."""
    if _relation(state, test) != "risky":
        return 0.0
    theta = pi / (2 * visits)
    return 1.0 - cos(theta) ** (2 * visits)


def patient_probe(state, test, visits):
    """Chance the probe reads 1 at the end, given the forger was never caught."""
    rel = _relation(state, test)
    if rel == "safe":
        return 1.0
    if rel == "kickback":
        return 0.0 if visits % 2 == 0 else sin(pi / (2 * visits)) ** 2
    return 0.0


# The whole-note heist. The forger probes each qubit with up to three tests,
# stopping as soon as a probe comes back 1, which names the qubit.
HEIST_TESTS = ("X", "Z", "-Z")
HEIST_NAMES = {"X": "+", "Z": "0", "-Z": "1"}


def heist_qubit(state, visits):
    """Chance of learning one qubit without being caught."""
    free = 1.0
    for test in HEIST_TESTS:
        free *= 1.0 - patient_caught(state, test, visits)
        if HEIST_NAMES[test] == state:
            break
    return free


def heist_note(visits, qubits=8):
    """Chance of learning a whole note of random qubits without being caught."""
    per_qubit = sum(heist_qubit(s, visits) for s in STATES) / len(STATES)
    return per_qubit ** qubits
