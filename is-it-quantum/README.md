# Is it quantum?

[Demo video](ADD YOUR PUBLIC VIDEO LINK HERE) | [Source on GitHub](https://github.com/kinnuworks/legal-tender/tree/main/is-it-quantum) | [Results](#results) | [Limits](#limits) | MIT licence

**Two machines say they ran your circuit. One of them is faking it.** You try to pick the real one by eye. Then you score both with cross-entropy benchmarking, the test behind Google's quantum supremacy claims, and watch three fakers attack it. One of them wins. Last, you use the same test for what laboratories use it for: measuring the error in each layer of gates on the machine you picked.

**Measured on Qollab:** four of IBM's noise models lose 1.2% to 2.5% of the score per layer of gates, and the ideal simulator loses none. The sweep also catches something one score misses: Fez looks second best at five layers and has the worst gates of the four.

![The line-up: two machines, 24 answers each, and a button to pick the real one](https://raw.githubusercontent.com/kinnuworks/legal-tender/main/docs/iiq-cover.png)

This effort is supported by Qollab & IonQ. Theme: Quantum Unlocked.

## Try it in 60 seconds

1. Press **Run Project** and pick the **Built-in simulator**. It is free and the circuits run in about a second.
2. **The line-up.** Two machines each show 24 answers to the same circuit. Press the button on the one you think is real.
3. Press **Show me the fingerprint**, then **Take them all** and **Unmask them**. One score sits near 1 and the other near 0.

## For a judge with three minutes

1. **Step 1**, play the line-up twice and read the line under it. At five qubits there is a trick, counting repeats, and the page tells you why it dies at 53.
2. **Step 3**, The cheats. Two fakers fail and one scores 2.75 against the real machine's 1. The panel under the cards says why that is the test's weak spot and why it doesn't save a cheat in practice.
3. **Step 4**, The decay. The page has already run circuits of 1, 2, 4, 6, 8 and 12 layers on your machine and fitted a curve. On an ideal simulator it is flat. Run the project again on an IBM noise model and it is not. Fez and Miami make a good pair to compare.
4. **Results** has every number with its interval, and **Save the evidence** writes the answers and scores to a file.

Use a recent Chrome, Edge, Brave or Opera, or Firefox 153 or later. On an IonQ simulator the four circuits run as one 20-qubit job, because Qollab allows one job per run there. Ours took 17 seconds. Step 4 needs six jobs, so it runs on the local simulators only. The page stays live until you press **Stop**.

## The idea

Run a random circuit and measure it, and you get one of 2^n bitstrings. Run it again and you get another. The circuit does not treat them equally: interference makes some answers several times likelier than others. That uneven pattern is the circuit's fingerprint.

Running the circuit gives samples from the fingerprint. Working out the fingerprint itself means simulating the circuit on a classical computer. With the plainest method that work doubles with every qubit. Cleverer methods do better [5], but past some size none of them keeps up.

Cross-entropy benchmarking [1, 2] uses that gap. For each answer a machine gives, look up how likely the fingerprint says that answer is, and average. A machine that ran the circuit lands on likely answers more often, so its average is high. A machine that didn't has to get the fingerprint some other way, which at five qubits is easy and at 53 is a serious computation.

## The four steps

| Step | What you do | What it shows |
|---|---|---|
| 1. The line-up | Pick the real machine from two streams of answers | Both look like noise. At this size repeats give the real one away, and the page counts them for you after each guess |
| 2. The fingerprint | Score both machines as their answers come in | A few hundred answers are enough to tell them apart with a number and an interval |
| 3. The cheats | Watch three fakers take the test | Two fail. The one that computed the fingerprint first beats the real machine |
| 4. The decay | Read the curve the page has measured | The score falls with depth, and the rate of fall is the error in each layer of gates |

## What is quantum here

The fingerprint is an interference pattern. Each circuit turns every qubit by random angles and entangles random pairs with CNOTs, five rounds of it, so the chance of each answer is a sum of many paths that reinforce or cancel.

The mimic in step 3 is the control for that. It reproduces how often each single bit is 1 and throws away every relation between bits, quantum or classical. On these four circuits that earns it 0.25. The number is a small-circuit effect and falls towards 0 as circuits grow.

## Results

Each row is one run on Qollab, read from the lines the run writes to the console. The files are in the repository's `evidence/is-it-quantum` folder.

**The score on four circuits of five layers**

| Machine | Score (95% interval) | Answers | Jobs |
|---|---|---|---|
| Built-in simulator (Qollab) | 1.02 (0.99 to 1.06) | 4,096 | four jobs |
| AWS Braket local simulator (Qollab) | 1.00 (0.96 to 1.03) | 4,096 | four jobs |
| IBM Kingston noise model (Qollab) | 0.87 (0.83 to 0.90) | 4,096 | four jobs |
| IonQ Aria 1 noise model (Qollab) | 0.85 (0.80 to 0.90) | 2,048 | one job |
| A perfect machine | 1.00 | | |
| The coin flipper | 0.00 | | |
| The mimic | 0.25 | | |
| The peeker | 2.75 | | |

The three fakers' scores are their exact averages over the four circuits, worked out from the fingerprints.

The two ideal simulators score 1 within their intervals. The two noise models sit six to seven standard errors below a perfect machine. The test sees a machine's errors with nothing but its answers to go on.

Two earlier runs of the same circuits gave 0.89 on Kingston and 0.91 on Aria 1 (with 1,024 shots a circuit, which took six minutes on IonQ's cloud). Both agree with the rows above within their intervals. The page now sends 512 shots a circuit to IonQ's simulators, and the row above is that setting.

**The decay: score against depth**

| Machine | Score at 5 layers | 1 layer | 2 | 4 | 6 | 8 | 12 | Start | Each layer keeps | Error per layer |
|---|---|---|---|---|---|---|---|---|---|---|
| Built-in simulator (Qollab) | 1.02 | 0.97 | 1.00 | 0.98 | 0.97 | 1.01 | 1.01 | 0.98 | 100.3% (99.8 to 100.9) | none measurable |
| IBM Boston noise model (Qollab) | 0.97 | 1.00 | 0.96 | 0.94 | 0.94 | 0.92 | 0.86 | 1.00 | 98.8% (98.2 to 99.4) | 1.2% (0.6 to 1.8) |
| IBM Kingston noise model (Qollab) | 0.87 | 0.96 | 0.95 | 0.87 | 0.87 | 0.84 | 0.85 | 0.96 | 98.6% (98.0 to 99.2) | 1.4% (0.8 to 2.0) |
| IBM Miami noise model (Qollab) | 0.88 | 0.93 | 0.89 | 0.85 | 0.83 | 0.82 | 0.80 | 0.93 | 98.6% (97.9 to 99.2) | 1.4% (0.8 to 2.1) |
| IBM Fez noise model (Qollab) | 0.92 | 0.96 | 0.98 | 0.92 | 0.90 | 0.80 | 0.75 | 1.01 | 97.5% (96.9 to 98.1) | 2.5% (1.9 to 3.1) |

Each depth cell is the average score of two circuits at that depth, 2,048 answers, with a standard error of 0.02 to 0.03. "Start" is the fitted score at zero layers, and the curve is score = start × keep^layers.

Four things to read from it.

- The ideal simulator's interval contains 100%, so the method does not invent a decay where there is none.
- All four noise models show a decay, and every interval excludes 100%. One layer here is ten single-qubit turns and two CNOTs before the machine compiles it, so these are errors per layer of this circuit on each machine's wiring. They are not per-gate figures.
- One score and the sweep rank the machines differently. At five layers Fez scores 0.92, second best and ahead of Kingston and Miami. The sweep says its layers are the worst of the four: 2.5% lost per layer against 1.2 to 1.4%, a gap of 2.5 to 3 standard errors. Fez starts clean and decays fast. Miami starts 7% down, a fixed cost of preparing and reading its qubits, and then loses little per layer. By 12 layers Miami is ahead, 0.80 to 0.75.
- Every point is within 1.5 standard errors of its curve. A single rate is still a model, and with two circuits per depth and one run per machine these rankings need repeating before anyone leans on them.

To reproduce a row: run the project on that machine, open Results, and press **Save the evidence**. The file holds the machine's name, each circuit's fingerprint, every answer the machine gave, the scores and the sweep.

## How the score works

For a circuit on n qubits there are D = 2^n possible answers, and the fingerprint gives each a probability p. For a list of answers x from some machine:

    score = (D × mean of p[x] − 1) / (D × sum of p² − 1)

The top line is the usual linear cross-entropy. A machine that gives every answer equally often has a mean of p[x] equal to 1/D and scores 0. The bottom line rescales so that a perfect machine scores exactly 1 on any circuit. Large random circuits have fingerprints for which the bottom line is very close to 1 already. These five-qubit ones do not, so the page divides by it. The published experiments use the top line alone.

The interval on one circuit is 1.96 standard errors of that mean. The score over four circuits is their plain average, and its standard error is the root of the summed squares divided by four. On IonQ the four circuits share one job but sit on separate qubits that never interact, so their answers are independent on an ideal machine. Crosstalk on a real one could break that.

**The fakers, exactly.** The coin flipper gives every answer with chance 1/D and scores 0. The mimic gives each bit independently with that bit's true chance of being 1, and scores between 0.19 and 0.39 on these four circuits. The peeker always gives the likeliest answer and scores (D × largest p − 1) divided by the same bottom line: between 2.5 and 3.0 here.

**The decay fit.** If each layer keeps a fraction f of the signal, the score after d layers is A × f^d. The page fits a straight line to the logarithm of the score against d, weighting each point by the square of its score over its standard error. A soaks up mistakes in preparing and reading the qubits, so f measures the gates [1]. The interval on f comes from the fitted slope. Points whose score is not at least two standard errors above zero have no usable logarithm and are left out, and the page reports no fit with fewer than three depths.

The repository's test suite checks the score against a perfect sampler and a coin, checks every faker against its exact value on every circuit, and checks that the fit recovers a known rate and finds none on an ideal simulator: 29 tests.

## What it's for

In 2019 Google ran random circuits on its 53-qubit Sycamore chip and reported that the answers followed the fingerprints, faintly but measurably, on a task it estimated would take a supercomputer thousands of years [1]. Better classical methods later cut that estimate to hours or days [5]. In 2024 Google repeated the test on its Willow chip with larger circuits [3]. Both claims rest on this kind of score. For the hardest circuits nobody can compute the fingerprint, so the score there is extended from smaller and simplified circuits.

People use the same number for plainer jobs.

- Measuring gate error. Step 4 does it: the score falls as circuits deepen, and the rate is the error per layer. It needs no special circuits and nothing from the machine but its answers.
- Comparing machines. The same circuits on two machines give two scores, and the higher one made fewer mistakes in its gates and read-out. The sweep says which of the two it was, as the Fez and Miami rows in Results show. These circuits entangle random pairs, so a machine that can only connect neighbours has to add swaps and pays for them.
- Catching a provider that cuts corners. A cloud service that returns made-up answers scores near 0.

**In a classroom.** Twenty minutes. Students play the line-up ten times and write down their hits, then try again counting repeats. They watch the scores separate in step 2. Then the question for discussion: the peeker beat the real machine, so is the test broken? The answer is in step 3's last panel.

## What is new here

- A new context. Among the 203 projects updated on Qollab during the hackathon, we found none built around cross-entropy benchmarking or how quantum supremacy claims are checked. One, Canary, catches a cheating cloud by a different route, with hidden trap circuits.
- A technical extension. The score is rescaled to stay honest on small circuits and reported with intervals. Every faker's exact score is computed as a control. The depth sweep turns the score into an error per layer with an interval, on any local Qollab backend.
- A way of teaching. The page states the test's weaknesses and lets you find them: a trick that works by eye at five qubits, and a cheat that outscores the real machine. Spoofing the test is an open research question [4].

## How it is built

| File | What it does |
|---|---|
| `main.js` | The page: the line-up, the plates, the scores that move, the chart, and the calls that run the circuits |
| `index.html`, `main.css` | Markup and styling |
| `xeb/circuits.py` | Builds the random circuits at any depth and simulates their fingerprints |
| `xeb/score.py` | The score, its interval, the three fakers and their exact averages, and the decay fit |
| `xeb/api.py` | Runs the circuits on the selected backend and returns the answers |

The circuits are fixed by their seeds, so every run on every machine is tested against the same fingerprints. On local simulators each circuit is its own job, and the sweep runs behind the page, one depth at a time, while you play the first steps. On IonQ backends the four circuits sit side by side in one 20-qubit circuit.

Counts arrive sorted, so the answers are shuffled before the page deals them out. The shuffle changes their order and nothing else. The fakers and the dealing use the browser's random number generator. If a run fails the page says so and shows no numbers.

`main.js` carries a self-check. Switched on, it presses every control in turn after loading and writes what happened to the console: 13 steps, all passing.

Each plate has 32 cells, one per possible answer, likeliest first. A ring's area is how often the fingerprint says that answer should come up. A dot's area is how often the machine gave it.

## How it looks

A case file on an examiner's desk: paper, black ink and one red pen. The steps run down a rail on the left like tabs on a folder, and the evidence sits on cards to the right. Red marks whatever the test is pointing at: the fingerprint, the real machine once it is unmasked, the cheat that wins, the fitted curve. It shares no styles, colours or layout with our other entry.

## Built during the hackathon

All code was written inside the build window, 9 to 11 October 2026. Nothing was forked, and no template or earlier project was used.

- Library: Qiskit (Apache 2.0).
- Fonts: Space Grotesk and JetBrains Mono from Google Fonts (SIL Open Font Licence), with system fallbacks if they don't load.
- The way the page calls Python, and keeps the run live, follows Qollab's runtime documentation and is shared with our other entry, Legal Tender, written in the same window.
- The test implements published work [1, 2]; the code is our own.
- An AI coding assistant helped write the code. The score, the fakers and the fit are checked against exact values by the test suite.

## Accessibility

- Every control is a native button and works from the keyboard, with a visible focus ring.
- Text contrast is at least 5:1. The page is paper-coloured whatever the system theme.
- The real machine is marked with words and an outline as well as colour. Scores are numbers first and bars second.
- Every stream, plate and chart has a text description, and every result on a plate or chart is also in a table.
- Motion is limited to dots and bars resizing, and is switched off when the system asks for reduced motion.
- The layout works down to a 375-pixel-wide screen without sideways scrolling.

## Limits

- Five qubits proves nothing about quantum advantage. The fingerprint is 32 numbers, which is why the peeker can cheat and why counting repeats works by eye. Among 24 answers the real machine gives about 20 matching pairs and a coin about 9.
- The peeker is easy to catch by other means, because it gives one answer every time. The score alone doesn't catch it. The published way to fool the score without computing the fingerprint is different and subtler [4].
- The score needs the fingerprint, so this page cannot grade a circuit too large to simulate. Neither can anyone else.
- Four circuits and about a thousand answers each give an interval a few hundredths wide. Small differences between machines are within it.
- The sweep uses two circuits at each of six depths and assumes one rate for every layer. It gives an error per layer of these circuits after compiling, and it does not separate one-qubit from two-qubit gates.
- Noise models are models. A real machine's score can differ from its simulator's.

## Fork it

- Add circuits to `SWEEP_SEEDS` in `xeb/circuits.py` and tighten the error per layer.
- Run the sweep on every IBM noise model Qollab offers and rank them.
- Add your own faker to `xeb/score.py` and see whether it beats the mimic. A second test that catches the peeker is a good first one.
- Restrict the CNOTs to neighbouring qubits and compare machines again.
- Run it on real IonQ hardware and add a row to the table. On a real machine the page sends the same one job with 400 shots.

## References

1. F. Arute and others, "Quantum supremacy using a programmable superconducting processor", Nature 574, 505 (2019).
2. S. Boixo and others, "Characterizing quantum supremacy in near-term devices", Nature Physics 14, 595 (2018), [arXiv:1608.00263](https://arxiv.org/abs/1608.00263).
3. H. Neven, "Meet Willow, our state-of-the-art quantum chip", Google, 9 December 2024.
4. X. Gao and others, "Limitations of linear cross-entropy as a measure for quantum advantage", PRX Quantum 5, 010334 (2024), [arXiv:2112.01657](https://arxiv.org/abs/2112.01657).
5. F. Pan, K. Chen and P. Zhang, "Solving the sampling problem of the Sycamore quantum circuits", Physical Review Letters 129, 090502 (2022), [arXiv:2111.03011](https://arxiv.org/abs/2111.03011).

## Licence

MIT. See `LICENSE`.
