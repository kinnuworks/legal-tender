"""The cross-entropy test, and the fakers that try to beat it.

For each answer a machine gives, look up how likely the fingerprint says that
answer is. A real quantum computer gives likely answers more often, so its
average is high. Scaled as below, a perfect machine scores 1 and a machine that
ignores the circuit scores 0.

    score = (D * mean(p[x]) - 1) / (D * sum(p^2) - 1),   D = 2^n

The division makes a perfect sampler score exactly 1 on any circuit, including
small ones whose fingerprints are not yet fully random.
"""

from math import sqrt


def _scale(fingerprint):
    size = len(fingerprint)
    return size, size * sum(p * p for p in fingerprint) - 1.0


def score(fingerprint, answers):
    """Score a list of answers (integers) against one fingerprint.

    Returns the score, its standard error, and a 95% interval.
    """
    size, norm = _scale(fingerprint)
    n = len(answers)
    if n == 0:
        return {"score": 0.0, "se": 0.0, "lo": 0.0, "hi": 0.0, "n": 0}
    values = [(size * fingerprint[x] - 1.0) / norm for x in answers]
    mean = sum(values) / n
    var = sum((v - mean) ** 2 for v in values) / (n - 1) if n > 1 else 0.0
    se = sqrt(var / n)
    return {"score": mean, "se": se, "lo": mean - 1.96 * se, "hi": mean + 1.96 * se, "n": n}


def combine(scores):
    """Average the scores of several circuits."""
    k = len(scores)
    mean = sum(s["score"] for s in scores) / k
    se = sqrt(sum(s["se"] ** 2 for s in scores)) / k
    return {"score": mean, "se": se, "lo": mean - 1.96 * se, "hi": mean + 1.96 * se, "n": sum(s["n"] for s in scores)}


def expected(fingerprint, faker):
    """What each faker scores on average, worked out exactly."""
    size, norm = _scale(fingerprint)
    if faker == "coin":
        return 0.0
    if faker == "peeker":
        return (size * max(fingerprint) - 1.0) / norm
    if faker == "mimic":
        qubits = size.bit_length() - 1
        ones = [sum(p for i, p in enumerate(fingerprint) if (i >> q) & 1) for q in range(qubits)]
        total = 0.0
        for i, p in enumerate(fingerprint):
            chance = 1.0
            for q in range(qubits):
                chance *= ones[q] if (i >> q) & 1 else 1.0 - ones[q]
            total += chance * p
        return (size * total - 1.0) / norm
    raise ValueError(f"unknown faker {faker!r}")


def fake(fingerprint, faker, shots, rng):
    """Answers from a classical faker.

    coin    flips a coin for every bit.
    mimic   matches how often each single bit is 1, but nothing between bits.
    peeker  has worked out the fingerprint and always gives its likeliest answer.
    """
    size = len(fingerprint)
    qubits = size.bit_length() - 1
    if faker == "coin":
        return [rng.randrange(size) for _ in range(shots)]
    if faker == "peeker":
        best = max(range(size), key=lambda i: fingerprint[i])
        return [best] * shots
    if faker == "mimic":
        ones = [sum(p for i, p in enumerate(fingerprint) if (i >> q) & 1) for q in range(qubits)]
        return [sum((1 << q) for q in range(qubits) if rng.random() < ones[q]) for _ in range(shots)]
    raise ValueError(f"unknown faker {faker!r}")
