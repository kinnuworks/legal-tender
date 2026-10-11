# Is it quantum?

Two machines say they ran your circuit. One of them is faking it.

This effort is supported by Qollab & IonQ.

Demo video: ADD YOUR PUBLIC VIDEO LINK HERE

Theme: Quantum Unlocked. Licence: MIT.

Source, tests and saved runs: https://github.com/kinnuworks/legal-tender (the `is-it-quantum` folder)

A quantum computer running a random circuit gives a stream of answers that looks like noise. So does a faker flipping coins. This project puts the two side by side and asks you to pick the real one, which you can't do by eye. Then it shows the test that can: the one behind Google's quantum supremacy claims. Last, it lets three fakers loose on that test, and one of them scores higher than the real machine. Working out why is the lesson.

Every answer from the "real" machine comes from a Qiskit circuit run on the backend you pick.

## Run it

1. Press **Run Project** and pick the **Built-in simulator**. Four random circuits run in about a second.
2. **The line-up.** Two machines each show 24 answers to the same circuit. Pick the real quantum computer. You will be right about half the time.
3. **The fingerprint.** The same two machines, now scored against the circuit's fingerprint. Press **Take 50 more answers** and watch one score climb to 1 while the other stays at 0. Then unmask them.
4. **The cheats.** Three fakers take the test. Open **Results** for this machine's score and **What it's for** for where the test is used.

Use a recent Chrome, Edge, Brave or Opera, or Firefox 153 or later. On an IonQ simulator all four circuits run as one 20-qubit job, because Qollab allows one job per run. The page stays live until you press **Stop**.

## The idea

Run a random circuit and measure it, and you get one of 2^n bitstrings. Run it again and you get another. The circuit does not treat them equally: interference makes some answers several times likelier than others. That uneven pattern is the circuit's fingerprint.

The fingerprint cannot be guessed. The only known ways to get it are to run the circuit on a quantum computer, or to simulate the circuit on a classical one, which takes work that doubles with every qubit. So a machine whose answers follow the fingerprint has either run the circuit or done an enormous sum.

That is cross-entropy benchmarking [1, 2]. For each answer a machine gives, look up how likely the fingerprint says that answer is. Average over all its answers. A real machine's average is high, because it lands on likely answers more often. A faker's is not.

## The three steps

| Step | What you do | What it shows |
|---|---|---|
| 1. The line-up | Pick the real machine from two streams of answers | By eye, a quantum computer and a coin flipper look the same |
| 2. The fingerprint | Score both machines as their answers come in | A few hundred answers are enough to tell them apart with a number |
| 3. The cheats | Watch three fakers take the test | Two fail. The one that computed the fingerprint first beats the real machine, which is the test's known weak spot |

## What is quantum here

The fingerprint is an interference pattern. Each circuit turns every qubit by random angles and entangles random pairs with CNOTs, five rounds of it, so the chance of each answer is a sum of many paths that reinforce or cancel. The mimic in step 3 shows what is left without the entanglement: it reproduces every single qubit's behaviour exactly and still scores about a quarter of what the real machine does.

## Results

Each machine row is one run on Qollab, read from the line the run writes to the console.

| Machine | Score (95% interval) | Answers | Jobs |
|---|---|---|---|
| Built-in simulator (Qollab) | 1.01 (0.97 to 1.04) | 4,096 | four jobs |
| AWS Braket local simulator (Qollab) | 1.00 (0.96 to 1.03) | 4,096 | four jobs |
| IBM Kingston noise model (Qollab) | 0.89 (0.86 to 0.93) | 4,096 | four jobs |
| IonQ Aria 1 noise model (Qollab) | 0.91 (0.87 to 0.94) | 4,096 | one job |
| A perfect machine | 1.00 | | |
| The coin flipper | 0.00 | | |
| The mimic | 0.25 | | |
| The peeker | 2.75 | | |

The three fakers' scores are their exact averages over the four circuits, worked out from the fingerprints.

The two ideal simulators score 1 within their intervals. IBM's Kingston noise model scores 0.89 and IonQ's Aria 1 noise model 0.91, each five or six standard errors below a perfect machine. The test sees a machine's errors with nothing but its answers to go on.

The IonQ row took six minutes, because IonQ's cloud simulates every shot on its own. The page now sends half as many shots to IonQ's simulators, 512 for each circuit.

To reproduce a row: run the project on that machine, open Results, and press **Save the evidence**. The file holds the machine's name, each circuit's fingerprint, every answer the machine gave and the scores.

## How the score works

For a circuit on n qubits there are D = 2^n possible answers, and the fingerprint gives each a probability p. For a list of answers x from some machine:

    score = (D × mean of p[x] − 1) / (D × sum of p² − 1)

The top line is the usual linear cross-entropy. A machine that ignores the circuit gives every answer equally often, so its mean of p[x] is 1/D and it scores 0. The bottom line rescales so that a perfect machine scores exactly 1 on any circuit. Large random circuits have fingerprints for which the bottom line is very close to 1 already; these five-qubit ones do not, so the page divides by it.

The interval is 1.96 standard errors of that mean. The score over four circuits is their average.

**The fakers, exactly.** The coin flipper gives every answer with chance 1/D and scores 0. The mimic gives each bit independently with that bit's true chance of being 1, so its score depends on how much of the fingerprint survives when you forget how the bits go together: between 0.19 and 0.39 on these four circuits. The peeker always gives the likeliest answer and scores (D × largest p − 1) divided by the same bottom line: between 2.5 and 3.0 here.

The repository's test suite checks the score against a perfect sampler and a coin, and checks every faker against its exact value on every circuit: 26 tests.

## What it's for

In 2019 Google ran random circuits on its 53-qubit Sycamore chip and reported that the answers followed the fingerprints, faintly but measurably, on a task it estimated would take a supercomputer thousands of years [1]. In 2024 it repeated the test on its Willow chip with larger circuits [3]. Both claims are scored with the number this page computes.

People use the same number for plainer jobs.

- Comparing machines. The same circuits on two machines give two scores, and the higher one kept its qubits in step for longer. These circuits entangle random pairs, so a machine that can only connect neighbours has to add swaps and pays for them in the score.
- Catching a provider that cuts corners. A cloud service that quietly returns made-up answers scores near 0.
- Measuring gate error. The score falls as circuits get deeper, and how fast it falls gives the error in each gate.

**In a classroom.** Twenty minutes. Students play the line-up ten times and write down their hits. They watch the scores separate in step 2. Then the question for discussion: the peeker beat the real machine, so is the test broken? The answer is in step 3's last panel.

## What is new here

- A new context. We found no other project on Qollab built around cross-entropy benchmarking or how quantum supremacy claims are checked.
- A technical extension. The score is rescaled to stay honest on small circuits, reported with intervals, and run on every Qollab backend, with each faker's exact score computed as a control.
- A way of teaching. The page states the test's weakness instead of hiding it. The spoofing problem is an open research question [4], and the player meets it by watching a cheat win.

## How it is built

| File | What it does |
|---|---|
| `main.js` | The page: the line-up, the plates, the scores that move, and the call that runs the circuits |
| `index.html`, `main.css` | Markup and styling |
| `xeb/circuits.py` | Builds the four random circuits and simulates their fingerprints |
| `xeb/score.py` | The score, its interval, the three fakers and their exact averages |
| `xeb/api.py` | Runs the circuits on the selected backend and returns the answers |

The circuits are fixed by their seeds, so every run on every machine is tested against the same four fingerprints. On local simulators each circuit is its own job. On IonQ backends the four sit side by side in one 20-qubit circuit.

Counts arrive sorted, so the answers are shuffled before the page deals them out. The shuffle changes their order and nothing else. The fakers and the dealing use the browser's random number generator. If a run fails the page says so and shows no numbers.

`main.js` carries a self-check. Switched on, it presses every control in turn after loading and writes what happened to the console. We used it to confirm on Qollab that all twelve controls respond.

Each plate has 32 cells, one per possible answer, likeliest first. A ring's area is how often the fingerprint says that answer should come up. A dot's area is how often the machine gave it.

## Built during the hackathon

All code was written inside the build window, 9 to 11 October 2026. Nothing was forked, and no template or earlier project was used.

- Library: Qiskit (Apache 2.0).
- Font: Bricolage Grotesque from Google Fonts (SIL Open Font Licence), with a system fallback if it doesn't load.
- The way the page calls Python, and keeps the run live, follows Qollab's runtime documentation and is shared with our other entry, Legal Tender, written in the same window.
- The test implements published work [1, 2]; the code is our own.
- An AI coding assistant helped write the code. The score and the fakers are checked against exact values by the test suite.

## Accessibility

- Every control is a native button and works from the keyboard, with a visible focus ring.
- Text contrast is at least 5.5:1 in both the light and dark themes.
- The real machine is marked with words and an outline as well as colour. Scores are numbers first and bars second.
- Every stream and plate has a text description, and every result on a plate is also in a table.
- Motion is limited to dots and bars resizing, and is switched off when the system asks for reduced motion.
- The layout works down to a 375-pixel-wide screen without sideways scrolling.

## Limits

- Five qubits proves nothing about quantum advantage. The fingerprint is trivial to compute at this size, which is exactly why the peeker can cheat.
- The score needs the fingerprint, so this page cannot grade a circuit too large to simulate. Neither can anyone else.
- Four circuits and about a thousand answers each give an interval a few hundredths wide. Small differences between machines are within it.
- Noise models are models. A real machine's score can differ from its simulator's.

## Fork it

- Change `QUBITS` and `DEPTH` in `xeb/circuits.py` and watch the score fall as circuits deepen.
- Add your own faker to `xeb/score.py` and see whether it beats the mimic.
- Restrict the CNOTs to neighbouring qubits and compare machines again.
- Run it on real IonQ hardware and add a row to the table. On a real machine the page sends the same one job with 400 shots.

## References

1. F. Arute and others, "Quantum supremacy using a programmable superconducting processor", Nature 574, 505 (2019).
2. S. Boixo and others, "Characterizing quantum supremacy in near-term devices", Nature Physics 14, 595 (2018), [arXiv:1608.00263](https://arxiv.org/abs/1608.00263).
3. H. Neven, "Meet Willow, our state-of-the-art quantum chip", Google, 9 December 2024.
4. X. Gao and others, "Limitations of linear cross-entropy as a measure for quantum advantage", PRX Quantum 5, 010334 (2024), [arXiv:2112.01657](https://arxiv.org/abs/2112.01657).

## Licence

MIT. See `LICENSE`.
