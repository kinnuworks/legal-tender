"""Small statistics helpers. Pure Python, no NumPy needed."""

from math import exp, lgamma, log, sqrt

# Limits the measured numbers are compared against. proof.py recomputes the
# two ceilings from scratch, and the tests hold these constants to its answers.
PHOTOCOPIER_PER_QUBIT = 5 / 8      # measure in a random basis, reprint twice
BEST_SINGLE_COPY = 5 / 6           # one copy from the best press, on its own
# Strict teller, every qubit must be right: how often the original and the
# copy can pass together, per qubit.
PAIR_CEILING = {"four": 3 / 4, "six": 2 / 3}
# Forgiving teller: how often one copy can pass, per qubit. A teller that
# forgives more than this is robbed every time, so this is the floor its
# threshold has to clear.
COPY_CEILING = {"four": 0.5 + sqrt(0.125), "six": 5 / 6}
SIMPLE_ATTACK_CEILING = PAIR_CEILING["four"]


def wilson(successes, n, z=1.96):
    """95% Wilson score interval for a proportion."""
    if n == 0:
        return [0.0, 1.0]
    p = successes / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return [max(0.0, centre - half), min(1.0, centre + half)]


def rate(successes, n):
    lo, hi = wilson(successes, n)
    return {"k": successes, "n": n, "p": successes / n if n else 0.0, "lo": lo, "hi": hi}


def _tails(n, p):
    """tails[k] = P(X >= k) for X ~ Binomial(n, p), for k = 0..n+1."""
    if p <= 0.0:
        return [1.0] + [0.0] * (n + 1)
    if p >= 1.0:
        return [1.0] * (n + 1) + [0.0]
    log_p, log_q = log(p), log(1 - p)
    tails = [0.0] * (n + 2)
    for k in range(n, -1, -1):
        log_pmf = lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1) + k * log_p + (n - k) * log_q
        tails[k] = tails[k + 1] + exp(log_pmf)
    return tails


def binom_tail(n, p, k_min):
    """P(X >= k_min) for X ~ Binomial(n, p)."""
    if k_min <= 0:
        return 1.0
    if k_min > n:
        return 0.0
    return _tails(n, p)[k_min]


def ticket(honest, forger, honest_fail=0.01, forger_pass=1e-6, max_n=1600):
    """Shortest ticket a noisy machine could issue safely.

    A ticket of n qubits is accepted when at least `need` of them pass. `honest`
    is the chance one genuine qubit passes on this machine and `forger` is the
    chance one qubit of a forged ticket passes. The answer is the smallest n for
    which some threshold turns away a genuine ticket less than `honest_fail` of
    the time and lets a forged one through less than `forger_pass` of the time.

    For `forger`, use COPY_CEILING: the most one copy can score per qubit from
    any machine that works on the note one qubit at a time. That is 85.4% on a
    four-way note and 83.3% on a six-way note. For six-way notes Pastawski and
    co-authors prove the same floor against every attack, however the forger
    groups the qubits.
    """
    if honest <= forger:
        return {"ok": False, "reason": "A genuine qubit passes no more often than a forged one on this machine."}
    # Every length up to 200, then coarser steps, to keep this quick in the browser.
    for n in list(range(1, 201)) + list(range(204, 801, 4)) + list(range(816, max_n + 1, 16)):
        honest_tails = _tails(n, honest)
        forger_tails = _tails(n, forger)
        for need in range(int(n * forger) + 1, n + 1):
            reject = 1.0 - honest_tails[need]
            if reject > honest_fail:
                break
            accept = forger_tails[need]
            if accept <= forger_pass:
                return {
                    "ok": True, "n": n, "need": need, "threshold": need / n,
                    "honest_reject": max(0.0, reject), "forger_accept": accept,
                }
    return {"ok": False, "reason": f"This machine would need a ticket longer than {max_n} qubits."}


def tickets(honest):
    """The shortest safe ticket of each kind for one machine, side by side."""
    return {note: ticket(honest, COPY_CEILING[note]) | {"floor": COPY_CEILING[note]} for note in ("four", "six")}


# The shortest safe ticket against the genuine pass rate: (rate, four-way,
# six-way). None means longer than 1,600 qubits. Worked out with ticket() and
# kept here so the page can draw the curve without a long wait. The tests
# recompute entries from it.
TICKET_TABLE = [
    (1.0, 88, 76), (0.999, 106, 93), (0.995, 137, 119), (0.99, 164, 142), (0.98, 224, 174),
    (0.97, 288, 224), (0.96, 368, 280), (0.95, 476, 348), (0.94, 628, 448), (0.93, 848, 564),
    (0.92, 1184, 724), (0.91, None, 976), (0.90, None, 1344), (0.89, None, None), (0.88, None, None),
]
