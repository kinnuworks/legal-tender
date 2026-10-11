"""Checks for Is it quantum?: the fingerprints, the score and the fakers."""

import json
import random
import sys
from pathlib import Path

import pytest
from qiskit.providers.basic_provider import BasicSimulator

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "is-it-quantum"))

from xeb import api, circuits, score  # noqa: E402


@pytest.mark.parametrize("seed", circuits.SEEDS)
def test_fingerprints_are_distributions_and_uneven(seed):
    p = circuits.fingerprint(circuits.build(seed))
    assert len(p) == 32
    assert sum(p) == pytest.approx(1.0)
    assert max(p) > 2 / 32  # some answers are clearly likelier than chance


def test_circuits_are_reproducible():
    assert circuits.fingerprint(circuits.build(2019)) == circuits.fingerprint(circuits.build(2019))
    assert circuits.fingerprint(circuits.build(2019)) != circuits.fingerprint(circuits.build(2024))


@pytest.mark.parametrize("seed", circuits.SEEDS)
def test_a_perfect_sampler_scores_one_and_a_coin_scores_zero(seed):
    p = circuits.fingerprint(circuits.build(seed))
    rng = random.Random(7)
    perfect = rng.choices(range(32), weights=p, k=40000)
    s = score.score(p, perfect)
    assert s["lo"] < 1.0 < s["hi"]
    assert abs(s["score"] - 1.0) < 0.05
    coin = score.score(p, score.fake(p, "coin", 40000, rng))
    assert coin["lo"] < 0.0 < coin["hi"]


@pytest.mark.parametrize("seed", circuits.SEEDS)
@pytest.mark.parametrize("faker", ["coin", "mimic", "peeker"])
def test_fakers_score_what_the_arithmetic_says(seed, faker):
    p = circuits.fingerprint(circuits.build(seed))
    got = score.score(p, score.fake(p, faker, 60000, random.Random(3)))
    assert got["score"] == pytest.approx(score.expected(p, faker), abs=0.03)


def test_the_peeker_beats_a_perfect_machine_and_the_mimic_does_not():
    for seed in circuits.SEEDS:
        p = circuits.fingerprint(circuits.build(seed))
        assert score.expected(p, "peeker") > 1.0
        assert 0.0 <= score.expected(p, "mimic") < 0.6


@pytest.mark.parametrize("kind", ["local", "remote"])
def test_the_simulator_passes_the_test(kind):
    backend = BasicSimulator()
    info = json.loads(api.describe(backend, kind))
    assert info["kind"] == kind and len(info["circuits"]) == 4
    run = json.loads(api.sample(backend, kind, 600))
    assert run["ok"], run
    assert run["jobs"] == (1 if kind == "remote" else 4)
    assert all(len(a.split(",")) == 600 for a in run["answers"])
    assert run["combined"]["lo"] < 1.0 < run["combined"]["hi"] + 0.05
    assert run["combined"]["score"] > 0.85


def test_wide_and_single_circuits_agree():
    backend = BasicSimulator()
    wide = json.loads(api.sample(backend, "remote", 3000))
    single = json.loads(api.sample(backend, "local", 3000))
    for a, b in zip(wide["scores"], single["scores"]):
        assert a["score"] == pytest.approx(b["score"], abs=0.15)


def test_faker_report():
    report = json.loads(api.fakers(2000))
    assert set(report) == {"coin", "mimic", "peeker"}
    assert abs(report["coin"]["combined"]["score"]) < 0.1
    assert report["peeker"]["combined"]["score"] > 1.0
    assert report["peeker"]["combined"]["score"] == pytest.approx(report["peeker"]["expected"])


def test_the_decay_fit_recovers_a_known_rate():
    points = [{"depth": d, "score": 0.97 * 0.95 ** d, "se": 0.01} for d in (1, 2, 4, 6, 8, 12)]
    fit = score.decay(points)
    assert fit["ok"]
    assert abs(fit["keep"] - 0.95) < 1e-9
    assert abs(fit["start"] - 0.97) < 1e-9
    assert fit["keep_lo"] < 0.95 < fit["keep_hi"]
    assert abs(fit["error"] - 0.05) < 1e-9


def test_the_decay_fit_refuses_too_few_points():
    assert not score.decay([{"depth": 1, "score": 0.9, "se": 0.01}, {"depth": 2, "score": 0.0, "se": 0.01}])["ok"]


def test_an_ideal_simulator_shows_no_decay():
    from qiskit.providers.basic_provider import BasicSimulator
    backend = BasicSimulator()
    points = [json.loads(api.sweep_point(backend, d, 1024)) for d in circuits.SWEEP_DEPTHS]
    assert all(p["ok"] for p in points)
    fit = json.loads(api.sweep_fit(json.dumps(points)))
    assert fit["ok"]
    assert fit["error_lo"] < 0 < fit["error_hi"] or abs(fit["error"]) < 0.02
