# Legal Tender

[Demo video](https://youtu.be/hcYQKXyhFs4) | [Source on GitHub](https://github.com/kinnuworks/legal-tender) | [The proof](#the-proof-on-the-page) | [Results](#results) | MIT licence

**A banknote you can't photocopy. Go on, try.** You get three ways to forge a note whose serial number is eight qubits. Then you change sides and redesign the note. Every note, forgery and teller check is a Qiskit circuit run on the machine you pick, and as the page loads it proves that no machine of any kind could forge a qubit better than the ones it runs.

**On a real IonQ Forte 1:** one 22-qubit job put the best possible forger at 74.0% per qubit against the textbook note and 65.2% against our six-way note. The proven limits are 75% and 66.7%. The gap between the two notes is 8.8 points, more than four standard errors, and seven simulators agree with it.

![A forged quantum banknote on the bank's counter. The teller has opened its eight seals and stamped it FORGED.](https://raw.githubusercontent.com/kinnuworks/legal-tender/main/docs/cover.png)

This effort is supported by Qollab & IonQ. Theme: Quantum Playground.

## Try it in 60 seconds

1. Press **Run Project** and pick the **Built-in simulator**. It is free. Act one is on screen as soon as the runtime has loaded, and the rest of the circuits print behind it while you play.
2. Press **Run the photocopier**. The teller opens the note's eight seals one by one and stamps your two notes ACCEPTED or FORGED.
3. Press **Run a hundred notes** and count how few get through.

That is the idea in one minute: to copy a qubit you have to read it, and reading it the wrong way destroys it.

## For a judge with three minutes

1. **Act two**, Pull the lever. This is the best copying machine physics allows, and it fails nine times in ten. The line beside it is the proof: the limit for every possible machine and this circuit's exact score, both 75.0000%.
2. **Act three**, Start the heist, with 12 visits. This attack works. The forger reads the whole note without the teller noticing and prints copies that pass.
3. **Act four**, Six ways, then Let the forger at it. You run the bank now. Scroll down for both notes against both tellers, measured on your machine, and the proof for all four cases.
4. **What it's for**, type 0.97 and press Work it out. A safe ticket needs 288 qubits with the textbook note and 224 with ours.
5. **Results** has every number with its interval. The console has the same numbers on one line, the proof, and an evidence file.

Move the pointer across a note and its colour-shifting ink changes, as it does on a real one.

## Where to look for each criterion

| Criterion | What to look at |
|---|---|
| Novelty and creativity | You forge the note, then you defend it. The page proves its own limits where other projects cite them. One other Qollab project builds on Wiesner's tokens, as permissions for AI agents. We found none that lets you play the forger, runs the adaptive attack or redesigns the note. |
| Technical execution | Three optimal copying machines and an adaptive attack, each an explicit circuit. Limit and circuit agree to twelve decimal places. 123 tests. Eight machines, one of them a real IonQ Forte 1, with a 95% interval on every number. |
| Impact potential | A one-job health check with exact targets, a rule for sizing quantum tickets and a 20-minute lesson, all on today's machines. A six-way ticket works on machines the textbook note can't use and is 12 to 39% shorter everywhere else. See [Who can use it today](#who-can-use-it-today). |
| Documentation quality | This page gives the derivations, the full proof in three lines, the limits we know of, and the files behind every number. |

## Who can use it today

Quantum banknotes need qubits that keep for days, and no machine has those yet. These four uses need nothing that doesn't exist now.

- **Someone checking a machine.** One run on an IonQ backend is one 22-qubit job with seven exact target values. How far a machine falls short of them is a reading of its noise. Ideal simulators land within a point of every target. On IonQ's and IBM's noise models the forgers fall 1 to 6 points short. The real Forte 1 came within 2.4.
- **Someone designing a quantum ticket.** The **What it's for** tab turns a machine's quality into a safe ticket length. At the 99.8% we measured for genuine qubits on Forte 1, that is 122 qubits for the textbook note and 106 for the six-way note.
- **A teacher.** The game fits a 20-minute slot, and the lesson plan is [further down](#in-a-classroom).
- **Someone with a new note design.** `proof.limit(states, teller)` returns the most any forger can score against any set of one-qubit states. It is one call, and [Fork it](#fork-it) lists where to start.

## Running it on other machines

Use a recent Chrome, Edge, Brave or Opera, or Firefox 153 or later.

On an IonQ simulator Qollab allows one job per run. The page spends it on one 22-qubit sheet that samples every machine in the project, then opens acts two and four. Acts one and three need a local simulator. IonQ's cloud simulates every shot on its own, so that job takes from half a minute to a few minutes.

On a real IonQ machine the page sends the same sheet with 400 shots. Ours waited 26 minutes in the queue and cost 25.79 credits, although Qollab had quoted 0.00.

Every run writes its results and the proof to the console and leaves an evidence file there. The game stays live until you press **Stop**.

## The idea

Stephen Wiesner proposed quantum money around 1970 and published it in 1983 [1]. A note carries a row of qubits. The bank sets each one to 0 or 1, either straight or diagonal, and keeps the list secret. To check a note, the bank measures each qubit the way it was printed and compares the answer with its list.

A forger doesn't know which qubits are straight and which are diagonal. Reading a qubit the wrong way gives a random answer and wipes out the original. A classical banknote has no such property: anything you can look at, you can copy.

## The four acts

| Act | What happens | Qubits per note qubit | Proven result | Source |
|---|---|---|---|---|
| 1. The photocopier | The forger reads each qubit in a guessed direction and prints a second note from what it saw | 3 | Original and copy both pass 5/8 of the time, so an eight-qubit pair passes 2.3% of the time | Short calculation below |
| 2. The best press | The forger uses the best copying machine there is for these four states, which needs no guess | 3 | Both pass 3/4 of the time and nothing does better. An eight-qubit pair passes 10.0% of the time | Molina, Vidick and Watrous [2], and the proof on the page |
| 3. The patient forger | The forger touches each qubit very lightly, sends the note for a check, gets it back and repeats, then prints copies from what was learned | 2 plus one per visit | A risky probe is caught with probability 1 − cos(π/2N)^(2N) over N visits. A whole-note heist gets away 10% of the time at 8 visits per probe, 21% at 12 and 98% at 1,000 | Brodutch, Nagaj, Sattath and Unruh [3] |
| 4. The bank fights back | You switch the note to six ways of setting a qubit and face the best machine against that note | 3 | Both pass 2/3 of the time and nothing does better. An eight-qubit pair passes 3.9% of the time | Bužek and Hillery [6], and the proof on the page |

Acts one and two are the best things a forger can do with one look at a note, and both fail. Act three succeeds, and when it does the forger knows the note exactly and can print any number of copies. It only works because the teller hands a valid note back. The fix, which the same paper gives, is for the bank to replace every note it checks. Act four is the bank's other move: a better note.

## The proof on the page

The limits in this project are worked out in front of you when the page loads, and the argument is short enough to give in full.

Any forging machine, however clever, takes one note qubit in and hands two qubits out. Such a machine can be written as one 8 by 8 matrix J, its Choi matrix, which is positive and has trace 2. Its score with the teller, averaged over the states the bank might have used, is trace(Q J). Here Q is another 8 by 8 matrix, built from the note's states and from what the teller counts as a pass. Because J is positive,

    trace(Q J)  ≤  largest eigenvalue of Q × trace(J)  =  2 × largest eigenvalue of Q.

That is a ceiling on every possible machine. The floor is a machine that exists: one of the circuits in this project, whose exact score comes from its amplitudes. `legaltender/proof.py` computes both when the page loads. Its amplitude code is a few lines of linear algebra that share nothing with the simulators the game runs on, so the two check each other.

| Note | Teller | Limit for any machine | Best circuit here | Which circuit |
|---|---|---|---|---|
| Four-way | Strict | 75.000000% | 75.000000% | best press [2] |
| Four-way | Forgiving | 85.355339% | 85.355339% | second press [7, 8] |
| Six-way | Strict | 66.666667% | 66.666667% | universal press [6] |
| Six-way | Forgiving | 83.333333% | 83.333333% | universal press [6] |

A strict teller refuses a note with any wrong qubit, so the forger's score is how often a qubit passes on both notes. A forgiving teller lets a few wrong qubits through, which every real machine needs, so the score is how often a qubit passes on one copy. The two tellers are beaten by different machines. The best press makes pairs that pass together as often as possible. The second press gives up a little of that to make each copy as good as it can be alone.

The limit and the circuit differ by less than 10^-12 in every row. You can read the same table in the game under **The bank fights back**, and every run prints it to the console.

A machine built for the wrong note does worse than the limit, which the same code confirms. On six-way notes the best press scores 61.1% with a strict teller where the limit is 66.7%, and the second press scores 81.9% with a forgiving one where the limit is 83.3%.

## What is quantum here

The game cannot be rebuilt with a random number generator, because the outcome of each check depends on how the forger chose to measure.

- Act one is measurement back-action. A qubit read in the wrong basis is destroyed, and the game uses up the note.
- Act two is entanglement. The best press leaves the original, the copy and a scrap qubit entangled, which is how it beats the photocopier.
- Act three is interference. On a qubit the probe suits, the small rotations add up to a full flip. On a qubit it doesn't suit, each teller check resets the probe, the same effect as the Elitzur and Vaidman bomb test [5].
- Act four is the shape of the set of states. Four states sit on one circle, and a copier can be tuned to that circle. Six states are spread evenly over the whole sphere and leave nothing to tune to.

## Results

Each cell is a pass rate per qubit with its 95% Wilson interval.

<!-- RESULTS:START -->
**Strict teller: how often one qubit passes on both notes**

| Machine | Photocopier (limit 62.5%) | Best press, four-way note (limit 75.0%) | Best machine, six-way note (limit 66.7%) | Shots per cell |
|---|---|---|---|---|
| Built-in simulator (Qollab) | 62.2% (61.1 to 63.2) | 74.2% (72.8 to 75.5) | 66.1% (64.9 to 67.3) | 1,024 |
| AWS Braket local simulator (Qollab) | 62.2% (61.2 to 63.3) | 75.3% (74.0 to 76.6) | 67.0% (65.8 to 68.2) | 1,024 |
| IonQ Aria 1 noise model (Qollab) | one job per run | 71.9% (69.9 to 73.8) | 64.7% (63.0 to 66.4) | 1,024 |
| IonQ Aria 2 noise model (Qollab) | one job per run | 71.5% (69.5 to 73.4) | 64.2% (62.5 to 65.9) | 1,024 |
| IonQ Forte 1 noise model (Qollab) | one job per run | 72.4% (70.4 to 74.3) | 65.3% (63.6 to 67.0) | 1,024 |
| IonQ Forte Enterprise 1 noise model (Qollab) | one job per run | 69.2% (67.2 to 71.2) | 63.3% (61.6 to 65.0) | 1,024 |
| IBM Kingston noise model (Qollab) | 61.4% (59.9 to 62.9) | 71.9% (69.9 to 73.8) | 65.1% (63.4 to 66.8) | 512 |
| IonQ Forte 1, real quantum computer (Qollab) | one job per run | 74.0% (70.9 to 76.9) | 65.2% (62.5 to 67.9) | 400 |
| Theory, ideal machine | 62.5% | 75.0% | 66.7% |  |

**Forgiving teller: how often one qubit passes on one copy**

| Machine | Genuine qubit | Second press, four-way note (limit 85.4%) | Best machine, six-way note (limit 83.3%) | Margin, four-way and six-way | Shots per cell |
|---|---|---|---|---|---|
| Built-in simulator (Qollab) | 100.0% (99.9 to 100.0) | 85.0% (84.2 to 85.7) | 83.1% (82.4 to 83.7) | +14.6 and +16.7 points | 1,024 |
| AWS Braket local simulator (Qollab) | 100.0% (99.9 to 100.0) | 85.6% (84.8 to 86.3) | 83.5% (82.8 to 84.1) | +14.6 and +16.7 points | 1,024 |
| IonQ Aria 1 noise model (Qollab) | 100.0% (99.9 to 100.0) | 83.6% (82.5 to 84.7) | 81.9% (80.9 to 82.8) | +14.6 and +16.7 points | 1,024 |
| IonQ Aria 2 noise model (Qollab) | 100.0% (99.9 to 100.0) | 84.2% (83.0 to 85.2) | 81.6% (80.6 to 82.5) | +14.6 and +16.7 points | 1,024 |
| IonQ Forte 1 noise model (Qollab) | 100.0% (99.9 to 100.0) | 83.9% (82.8 to 85.0) | 81.8% (80.9 to 82.8) | +14.6 and +16.7 points | 1,024 |
| IonQ Forte Enterprise 1 noise model (Qollab) | 100.0% (99.9 to 100.0) | 82.3% (81.1 to 83.5) | 80.6% (79.6 to 81.5) | +14.6 and +16.7 points | 1,024 |
| IBM Kingston noise model (Qollab) | 99.9% (99.7 to 99.9) | 82.4% (81.2 to 83.5) | 82.0% (81.0 to 82.9) | +14.5 and +16.5 points | 512 |
| IonQ Forte 1, real quantum computer (Qollab) | 99.8% (99.4 to 100.0) | 86.9% (85.2 to 88.5) | 81.0% (79.4 to 82.6) | +14.5 and +16.5 points | 400 |
| Theory, ideal machine | 100.0% | 85.4% | 83.3% | +14.6 and +16.7 points |  |
<!-- RESULTS:END -->

Rows were run on Qollab and read from the line each run writes to the console. The files are in the [repository's](https://github.com/kinnuworks/legal-tender) `evidence/` folder, and `tools/ledger.py` builds these tables from them.

![Console of the run on the real IonQ Forte 1: 22 qubits, 400 shots, the measured rates and the proof lines](https://raw.githubusercontent.com/kinnuworks/legal-tender/main/docs/hardware-run.png)

Six things stand out.

- It holds on a real quantum computer. One job on IonQ Forte 1 (22 qubits, 400 shots, 16 seconds of machine time after 26 minutes in the queue) put the best forger at 74.0% on the four-way note and 65.2% on the six-way note. The gap is 8.8 points, more than four standard errors. Against a forgiving teller the gap is 5.9 points, five standard errors.
- Against a strict teller, six ways beats four on every machine. The forger's best score is 6 to 9 points lower on the six-way note, a gap of at least four standard errors everywhere. The proof predicts 8.3 points on an ideal machine.
- Against a forgiving teller the six-way note holds the forger 1.7 to 5.9 points lower on seven of the eight machines, each gap more than twice its standard error. The proof predicts 2.1. On IBM's Kingston model the gap is 0.4 points, well inside the noise, so that row does not separate the two notes.
- No machine let the forger past a limit. `tools/ledger.py --check` compares every interval with its limit, and none sits above one. The closest call is the second press on the real machine: 86.9% measured against a limit of 85.4%, which its interval of 85.2 to 88.5 still contains.
- Noise costs the forger. On IonQ's four noise models the forger lands 1 to 6 points short of each limit, because a forging circuit has three to six two-qubit gates per qubit. The Forte Enterprise 1 model is the harshest of the four.
- The genuine qubit's 100% on the IonQ noise models needs a caution. IonQ's service drops the barrier between the bank's printing and the teller's check and merges the two into nothing, so that column shows the merge and says nothing about the machine. On the real Forte 1 a genuine qubit still failed 2 times in 1,200, which is the machine's own preparation and read-out error. On IBM's Kingston model the barrier holds and both are run as gates: a genuine qubit failed 4 times in 3,072 there. At the real machine's rate a safe ticket needs 122 qubits four-way and 106 six-way.

IonQ backends take one job per run, so the photocopier column is empty for those rows. Their one job is a 22-qubit sheet, with 1,024 shots on the simulators and 400 on the real machine.

### The heist

Whole-note heists played from circuit shots on the built-in simulator, 2,000 at each setting, using `tools/heist.py` from the repository.

| Visits per probe | Clean getaways | Rate (95% interval) | Theory |
|---|---|---|---|
| 4 | 28 of 2,000 | 1.4% (1.0 to 2.0) | 1.4% |
| 8 | 212 of 2,000 | 10.6% (9.3 to 12.0) | 10.1% |
| 12 | 438 of 2,000 | 21.9% (20.1 to 23.8) | 20.9% |
| 1,000 | too many qubits to simulate | | 98.0% |

At 8 visits per probe the patient forger already matches the best press, and at 12 doubles it. The comparison understates the heist: a press that passes has made one extra note, while a heist that gets away has learned the note and can print any number.

To reproduce a row: run the project on that machine, open Results, and press **Save the evidence**. The file lists the machine, every plate's qubit count, depth and gate counts, the proof table, and the raw counts behind each number.

## How the numbers come out

### Photocopier, 5/8

Half the time the guess matches the bank's basis. The copier then reads the qubit correctly and both notes pass. The other half, the read-out is random, and each note passes its check with probability 1/2 independently, so both pass 1/4 of the time. That gives 1/2 + 1/2 × 1/4 = 5/8.

### Best press, 3/4

Two blank qubits are set to (3|00⟩ + |01⟩ + |10⟩ + |11⟩)/√12. Four CNOTs then spread the note across the original and the copy: note to copy, note to scrap, copy to note, scrap to note. For any of the four note states the pair passes with probability 9/12 = 3/4, and each note alone passes with probability 10/12 = 5/6.

### Second press, 85.4%

This is the phase-covariant cloner [7] in its two-qubit form [8], with no scrap qubit. The four note states lie on one circle of the sphere of qubit states. The circuit turns that circle onto the equator, applies a controlled quarter-turn and a CNOT, and turns back. Each copy passes with probability 1/2 + 1/√8 = 85.4%, and the pair passes together 72.9% of the time, a little less than the best press manages.

### Universal press, 2/3 and 5/6

The universal cloner [6] treats every state alike. Its blank qubits start as (2|00⟩ + |01⟩ + |11⟩)/√6, written copy first, and the same four CNOTs as the best press do the rest. For any state at all the pair passes 2/3 of the time and each copy 5/6 of the time. Against a six-way note no machine does better on either count.

### Patient forger, one probe

The probe starts at |0⟩ and turns by π/2N before each visit. A controlled-X from the probe leaves a diagonal-plus qubit untouched, so after N visits the probe has turned to |1⟩ and the forger has identified the qubit without risk. On a straight qubit the controlled-X entangles probe and note. The teller's check then catches the forger with probability sin²(π/2N) and otherwise resets the probe to |0⟩. Surviving all N visits has probability cos(π/2N)^(2N). Call that s.

### Patient forger, whole note

For each seal the forger tries up to three probes, built on controlled-X, controlled-Z and controlled-(−Z), and stops at the first one that reads 1, which names the qubit as diagonal-plus, straight-0 or straight-1. If none does, the qubit is diagonal-minus. A diagonal-plus qubit costs no risky probe, the two straight states cost one each, and diagonal-minus costs two. A random qubit is therefore read safely with probability (1 + 2s + s²)/4 = ((1 + s)/2)², and a whole eight-qubit note with probability ((1 + s)/2)^16.

### Tests

The repository's test suite has 123 tests for this project. They check every circuit against exact statevectors, for every state, basis and probe. They confirm that the best press is exactly the published cloning map, that the matrix Q scores each machine the same as its own circuit does, that 400 random machines per case stay under the limit, and that the proof's amplitude code agrees with Qiskit's.

## What it's for: tickets nobody can copy

Quantum banknotes need qubits that keep for days. Today's keep for seconds. A nearer use is a ticket or pass that gets checked soon after it is issued. Pastawski and co-authors proposed such tokens in 2012, using six-way qubits, and proved they survive noisy hardware as long as the teller's tolerance stays above 5/6 [4]. That is the six-way forgiving limit in the table above.

A real machine gets some genuine qubits wrong, so the teller has to accept a ticket when most of its qubits pass. Forgive too many and a forged copy gets through. The **What it's for** tab finds a safe ticket length for a machine of any quality.

| A genuine qubit passes | Four-way ticket | Six-way ticket | Saving |
|---|---|---|---|
| 100% | 88 qubits | 76 qubits | 14% |
| 99.9% | 106 | 93 | 12% |
| 99.5% | 137 | 119 | 13% |
| 99% | 164 | 142 | 13% |
| 97% | 288 | 224 | 22% |
| 95% | 476 | 348 | 27% |
| 92% | 1,184 | 724 | 39% |
| 90% | more than 1,600 | 1,344 | |
| 85% | none at any length | possible, very long | |

The worse the machine, the more six ways saves. Between 83.3% and 85.4% a six-way ticket is the only kind that can be made safe.

The rule behind the table: a ticket of n qubits is accepted when at least k pass. Genuine qubits pass independently at the machine's rate. A forger who works on the ticket one qubit at a time cannot get the qubits of the worse of two copies past the teller more often than the forgiving limit, on average. By a theorem of Hoeffding [9], the chance that copy is accepted is then at most the chance that n coin flips at that rate reach k. The table gives the smallest n for which some k turns a genuine ticket away less than 1 time in 100 and keeps that bound under 1 in 1,000,000. These lengths are safe. A sharper analysis could shorten them.

### In a classroom

The game fits a 20-minute slot. Students play act one and write down their pass count out of 100. They play act two and compare. The class then guesses whether a cleverer machine could beat 75%, and the teacher shows the proof table. Act three is the homework: why does handing a note back break the scheme? Act four is the follow-up: what would you change about the note?

## What is new here

- A new context. One other project on Qollab, Conservation of Authority, builds on Wiesner's tokens as permissions for AI agents. We found none that turns quantum money into something you play, or that covers the adaptive attack and the six-way note.
- A proof that runs. The optimality of each copying circuit is computed on the page, from an eigenvalue and the circuit's own amplitudes, and printed with every run.
- Three optimal cloners and the adaptive attack as explicit circuits from standard gates, run on any Qollab backend, a real IonQ Forte 1 among them, and reported with intervals. As far as we can find, this is the first playable version of the adaptive attack on a whole note.
- A result with a number on it. The game measures both floors on each machine and turns them into ticket lengths, which shows what the textbook four-way note costs on real hardware and what six ways saves.
- A way of teaching. The player fails to copy a qubit before reading a word about why, pulls off the one attack that works, and then gets to fix the note.

The physics is published work [1 to 8]. The circuits, the proof code, the measurements and the game are ours.

## How it is built

| File | What it does |
|---|---|
| `main.js` | The page: notes, guesses, tallies, charts and every call to the backend |
| `index.html`, `main.css` | Markup and styling |
| `legaltender/cells.py` | One small circuit per experiment on one note qubit |
| `legaltender/plates.py` | Packs cells side by side into one circuit, runs it, splits the counts |
| `legaltender/proof.py` | The limit for any machine, and each circuit's exact score |
| `legaltender/stats.py` | Wilson intervals and the ticket calculation |
| `legaltender/api.py` | The functions `main.js` calls |

Cells never share qubits, so a plate of several cells is one circuit whose parts stay independent. On ideal simulators the plates are narrow (14 qubits at most) and all of them print while the game loads, about forty small jobs. On IBM noise models, where every job is slow to simulate, the plates are wider and fewer. On IonQ backends the one job a run allows is a 22-qubit sheet: a genuine qubit from each basis, and each of the three presses on one state per basis.

The bank, the forger and the teller act one after another, and none of them sees the others' gates. Each circuit marks those hand-overs with a barrier, so a compiler cannot merge the bank's printing into the teller's check. A test shows what happens without one: the two cancel and nothing runs.

Every forged note you hand over spends real shots from a plate. When a plate runs out the page prints a new one. Counts arrive sorted, so the shots are shuffled before use. The shuffle changes their order and nothing else. If a run fails the page says so and shows no numbers.

The page has two routes to the backend. Normally Python fits the circuit to the machine and runs it. If that fails, the page runs the same circuit itself and hands the counts back to Python to read.

`main.js` carries a self-check. Switched on, it presses every control in turn after loading and writes what happened to the console. We used it to confirm on Qollab that all twenty controls respond.

The bank's secret list and the "guess for me" button use the browser's random number generator. Everything the teller decides comes from the quantum backend.

## How it looks, and why

The page is a banknote lying on a bank counter. The counter and everything written on it use one ink on one surface. Colour belongs to the note.

- The note is paper in both the light and the dark theme, printed the way real notes are. It has a colour blend across the sheet, two fine line screens under the design, an engraved braid round the edge, microprint, and a serial number that climbs in size as on Indian banknotes.
- The bank prints in green and the teller stamps in violet, so the two colours tell you who made each mark. The teller's stamp has the worn edge of a rubber stamp.
- The large numeral and the thread are colour-shifting ink. They move between the bank's green and the teller's violet as the pointer crosses the note.
- Each qubit is drawn the way physicists draw polarised light. Upright and flat lines are the straight qubits, leaning lines are the diagonal ones, and a curved arrow is a circular one. A sealed qubit is a solid disc.
- The ring on the left is a guilloche with eight sectors, one per qubit. Where a qubit fails its check, that sector of the weave pinches flat, the way a poor copy loses its fine lines.
- Motion only answers what you do: the teller opens the seals one at a time, the stamp lands last, and a hundred attempts fill in as a hundred slips. With reduced motion switched on, everything appears at once.

## Built during the hackathon

All code was written inside the build window, 9 to 11 October 2026, starting from an empty folder. Nothing was forked, and no template or earlier project was used.

- Library: Qiskit (Apache 2.0), with NumPy for the proof.
- Font: Archivo from Google Fonts (SIL Open Font Licence), with a system fallback if it doesn't load.
- The way `main.js` calls Python follows Qollab's runtime documentation.
- The circuits implement published results [2, 3, 6, 7, 8]. The code is our own.
- An AI coding assistant helped write the code. Every circuit is checked against exact theory by the test suite.

## Accessibility

- Every control is a native button or input and works from the keyboard, with a visible focus ring.
- Text contrast is at least 5.2:1 in both the light and dark themes (body text 14:1 or better). Text on the note is dark green on pale paper in both.
- A failed qubit gets a cross, a broken ring and a pinched engraving, and a forged note gets a rectangular stamp, so nothing relies on colour. A passed qubit gets a tick and a passed note an oval stamp.
- Status messages are announced through a live region. Charts and notes carry text descriptions, and every chart's numbers are also in a table.
- Animations are switched off when the system asks for reduced motion. The colour-shifting ink only moves when you move the pointer.
- The layout works down to a 375-pixel-wide screen. The page never scrolls sideways, and a table too wide for the screen scrolls inside its own frame.

## Limits

- No quantum computer can hold a banknote today. Qubit memories last seconds, and all but one of these runs are on simulators.
- Eight qubits is a toy note. A real one would use a few hundred, as the ticket table shows.
- The genuine qubit's pass rate on IonQ's models says little. IonQ's service drops barriers and merges the bank's printing and the teller's check into nothing before the circuit runs, so that figure shows the merge. The forging circuits can't be merged away, and their rates do carry the noise model.
- No simulator here models a qubit waiting in a wallet. That waiting is where a real note would lose most of its quality, and it is why the calculator takes the genuine pass rate as an input.
- The ticket lengths are safe against a forger who works on one qubit at a time. For six-way notes the floor is proven against every attack [4]. For four-way notes we have not seen that proof, and we do not claim it.
- The ticket lengths are upper bounds, and they treat each genuine qubit as failing independently.
- The patient forger is simulated up to 12 visits per probe (14 qubits). The odds beyond that are theory.
- The whole-note heist runs on the ideal simulators only. It takes about thirty small jobs, which is too slow on a noise model and more than an IonQ backend allows in one run.
- Noise models are models. A machine's real numbers can differ from its simulator's, as the two Forte 1 rows show.
- The hardware row is one job of 400 shots, so its intervals are about three points wide either way.
- Every check is arranged so that a pass reads 0. A machine that misreads 1 as 0 more often than the reverse would flatter the forger a little. Mixing the two readings across qubits would remove that.

## Fork it

- Print longer notes and watch the pass rate fall.
- Add the variant from [2] where the bank verifies over a classical channel.
- Try a note with eight or twelve states and compute its limits with `proof.py`. One call gives the answer.
- Repeat the run on real IonQ hardware with more shots and tighten the last row of the tables. On a real machine the page sends the same sheet with 400 shots.

## References

1. S. Wiesner, "Conjugate coding", ACM SIGACT News 15(1), 78 to 88 (1983).
2. A. Molina, T. Vidick and J. Watrous, "Optimal counterfeiting attacks and generalizations for Wiesner's quantum money", [arXiv:1202.4010](https://arxiv.org/abs/1202.4010) (2012).
3. A. Brodutch, D. Nagaj, O. Sattath and D. Unruh, "An adaptive attack on Wiesner's quantum money", Quantum Information and Computation 16, 1048 (2016), [arXiv:1404.1507](https://arxiv.org/abs/1404.1507).
4. F. Pastawski, N. Y. Yao, L. Jiang, M. D. Lukin and J. I. Cirac, "Unforgeable noise-tolerant quantum tokens", PNAS 109(40), 16079 (2012), [arXiv:1112.5456](https://arxiv.org/abs/1112.5456).
5. A. Elitzur and L. Vaidman, "Quantum mechanical interaction-free measurements", Foundations of Physics 23, 987 (1993).
6. V. Bužek and M. Hillery, "Quantum copying: beyond the no-cloning theorem", Physical Review A 54, 1844 (1996), [arXiv:quant-ph/9607018](https://arxiv.org/abs/quant-ph/9607018). The circuit follows V. Bužek, S. L. Braunstein, M. Hillery and D. Bruß, "Quantum copying: a network", Physical Review A 56, 3446 (1997), [arXiv:quant-ph/9703046](https://arxiv.org/abs/quant-ph/9703046).
7. D. Bruß, M. Cinchetti, G. M. D'Ariano and C. Macchiavello, "Phase-covariant quantum cloning", Physical Review A 62, 012302 (2000), [arXiv:quant-ph/9909046](https://arxiv.org/abs/quant-ph/9909046).
8. C.-S. Niu and R. B. Griffiths, "Two-qubit copying machine for economical quantum eavesdropping", Physical Review A 60, 2764 (1999), [arXiv:quant-ph/9810008](https://arxiv.org/abs/quant-ph/9810008).
9. W. Hoeffding, "On the distribution of the number of successes in independent trials", Annals of Mathematical Statistics 27(3), 713 (1956).

## Licence

MIT. See `LICENSE`.
