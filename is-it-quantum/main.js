// Is it quantum? The page. Python (xeb/) builds the circuits, runs them on the
// selected backend and scores the answers. This file deals the line-ups, draws
// the plates and keeps the tallies.
import * as api from 'xeb.api';

const BACKEND = typeof backend !== 'undefined' ? backend : null;
const VIEWS = [
  ['lineup', '1', 'The line-up'],
  ['print', '2', 'The fingerprint'],
  ['cheats', '3', 'The cheats'],
  ['results', '', 'Results'],
  ['why', '', "What it's for"],
];
const FAKERS = {
  coin: ['The coin flipper', 'Flips a coin for every bit. It never looks at the circuit.'],
  mimic: ['The mimic', 'Matches how often each single bit comes up 1, and nothing about how the bits go together.'],
  peeker: ['The peeker', 'Works out the fingerprint first, then gives the single likeliest answer every time.'],
};

const S = {
  info: null,
  real: [],        // answers from the selected backend, one list per circuit
  realRun: null,
  fake: null,      // answers and scores from the three fakers
  view: '',
  lineup: null,    // { circuit, realIsA, a, b, guess }
  guesses: { tries: 0, right: 0 },
  cursor: [],      // how many real answers each circuit has dealt so far
  print: { circuit: 0, shown: 50, realIsA: true, unmasked: false },
  busy: false,
};

const $ = (id) => document.getElementById(id);
const num = (n) => n.toLocaleString('en-GB');
const fixed = (x, d = 2) => (Object.is(Number(x.toFixed(d)), -0) ? 0 : x).toFixed(d);
const plusMinus = (s) => `${fixed(s.score)} ± ${fixed(1.96 * s.se)}`;

async function call(name, ...args) {
  const fn = api[name];
  const out = fn.callPromising ? await fn.callPromising(...args) : await fn(...args);
  return JSON.parse(String(out));
}

function say(text, bad = false) {
  const el = $('status');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('bad', bad);
  if (text) console.log(text);
}

function pick(n) {
  const box = new Uint32Array(1);
  try { crypto.getRandomValues(box); } catch { box[0] = Math.floor(Math.random() * 2 ** 32); }
  return box[0] % n;
}

// The same score Python computes, for the numbers that move while you watch.
function score(fingerprint, answers) {
  const size = fingerprint.length;
  const norm = size * fingerprint.reduce((t, p) => t + p * p, 0) - 1;
  const n = answers.length;
  if (!n) return { score: 0, se: 0, n: 0 };
  const values = answers.map((x) => (size * fingerprint[x] - 1) / norm);
  const mean = values.reduce((t, v) => t + v, 0) / n;
  const variance = n > 1 ? values.reduce((t, v) => t + (v - mean) ** 2, 0) / (n - 1) : 0;
  return { score: mean, se: Math.sqrt(variance / n), n };
}

const fingerprintOf = (c) => S.info.circuits[c].fingerprint;

// ---------- Drawing ----------

// One answer as five squares, qubit 0 on the left.
function answerMarks(x) {
  let out = '';
  for (let q = 0; q < S.info.qubits; q++) out += `<i${(x >> q) & 1 ? ' class="on"' : ''}></i>`;
  return `<span class="answer">${out}</span>`;
}

function stream(answers, label) {
  const ones = answers.reduce((t, x) => t + x.toString(2).replace(/0/g, '').length, 0);
  return `<div class="stream" role="img" aria-label="${label}: ${answers.length} answers of five bits each, ${ones} ones in total.">${answers.map(answerMarks).join('')}</div>`;
}

// A halftone plate. Every possible answer gets a cell, likeliest first. The
// ring's area is how often the fingerprint says that answer should come up;
// the dot's area is how often this machine gave it.
function plate(fingerprint, answers, label) {
  const order = fingerprint.map((p, i) => i).sort((a, b) => fingerprint[b] - fingerprint[a]);
  const top = Math.max(...fingerprint);
  const counts = new Array(fingerprint.length).fill(0);
  if (answers) for (const x of answers) counts[x]++;
  const total = answers ? Math.max(1, answers.length) : 1;
  const R = 21;
  let cells = '';
  order.forEach((answer, k) => {
    const cx = 25 + (k % 8) * 50;
    const cy = 25 + Math.floor(k / 8) * 50;
    const ring = R * Math.sqrt(fingerprint[answer] / top);
    cells += `<circle class="ring" cx="${cx}" cy="${cy}" r="${Math.max(1.2, ring).toFixed(1)}"/>`;
    const share = answers ? counts[answer] / total : fingerprint[answer];
    const dot = Math.min(24, R * Math.sqrt(share / top));
    cells += `<circle class="dot" cx="${cx}" cy="${cy}" r="${dot.toFixed(1)}"/>`;
  });
  return `<svg class="plate${answers ? '' : ' print'}" viewBox="0 0 400 200" role="img" aria-label="${label}">${cells}</svg>`;
}

function meter(s, label) {
  const width = Math.max(0, Math.min(1, s.score)) * 100;
  return `<p class="meter"><b>${fixed(s.score)}</b> ${label} <span class="hint">± ${fixed(1.96 * s.se)} from ${num(s.n)} answers</span></p>
    <div class="bar" aria-hidden="true"><span style="width:${width.toFixed(0)}%"></span></div>`;
}

// ---------- 1. The line-up ----------

function deal() {
  const circuit = pick(S.info.circuits.length);
  const start = S.cursor[circuit];
  const mine = S.real[circuit].slice(start, start + 24);
  S.cursor[circuit] = start + 24 + 24 > S.real[circuit].length ? 0 : start + 24;
  const theirs = Array.from({ length: 24 }, () => pick(2 ** S.info.qubits));
  const realIsA = pick(2) === 0;
  S.lineup = { circuit, realIsA, a: realIsA ? mine : theirs, b: realIsA ? theirs : mine, guess: null };
}

function renderLineup() {
  if (!S.lineup) deal();
  const L = S.lineup;
  const done = L.guess !== null;
  const right = done && (L.guess === 'a') === L.realIsA;
  const tag = (isA) => (done ? `<p class="tag${isA === L.realIsA ? '' : ' fake'}">${isA === L.realIsA ? `The real one: ${S.info.backend}` : 'The faker: a coin flipped for every bit'}</p>` : '<p class="tag"></p>');
  let verdict = '';
  let why = '';
  if (done) {
    verdict = right ? 'Right. That was the real machine.' : 'Wrong. That was the faker.';
    const g = S.guesses;
    why = `You've picked the real one ${g.right} ${g.right === 1 ? 'time' : 'times'} in ${g.tries}. Guessing blind gets it right half the time, and nobody does much better by eye: both streams look like noise. The difference is in which answers come up more often, and for that you need the circuit's fingerprint.`;
  }
  $('stage').innerHTML = `<header class="brief">
      <h2>The line-up</h2>
      <p class="goal">Your job: pick the real quantum computer. Each machine below gave 24 answers to the same random circuit.</p>
    </header>
    <div class="pair">
      <section class="suspect${done && L.realIsA ? ' real' : ''}"><h3>Machine A</h3>${stream(L.a, 'Machine A')}${tag(true)}</section>
      <section class="suspect${done && !L.realIsA ? ' real' : ''}"><h3>Machine B</h3>${stream(L.b, 'Machine B')}${tag(false)}</section>
    </div>
    <p class="hint">Each answer is five bits. A filled square is a 1.</p>
    <p class="verdict${done ? ' pop' : ''}">${verdict}</p>
    <p class="why${done ? ' pop' : ''}">${why}</p>
    <div class="row">${done
      ? '<button class="do" id="again">Deal another pair</button><button class="do quiet" id="next">Show me the fingerprint</button>'
      : '<button class="do" id="pick-a">A is the real one</button><button class="do" id="pick-b">B is the real one</button>'}</div>`;
  const guess = (side) => {
    L.guess = side;
    S.guesses.tries++;
    if ((side === 'a') === L.realIsA) S.guesses.right++;
    renderLineup();
    $('again')?.focus({ preventScroll: true });
  };
  $('pick-a')?.addEventListener('click', () => guess('a'));
  $('pick-b')?.addEventListener('click', () => guess('b'));
  $('again')?.addEventListener('click', () => { deal(); renderLineup(); $('pick-a')?.focus({ preventScroll: true }); });
  $('next')?.addEventListener('click', () => show('print'));
}

// ---------- 2. The fingerprint ----------

function renderPrint() {
  const P = S.print;
  const fp = fingerprintOf(P.circuit);
  const limit = Math.min(S.real[P.circuit].length, S.fake.coin.answers[P.circuit].length);
  const shown = Math.min(P.shown, limit);
  const real = S.real[P.circuit].slice(0, shown);
  const coin = S.fake.coin.answers[P.circuit].slice(0, shown);
  const a = P.realIsA ? real : coin;
  const b = P.realIsA ? coin : real;
  const sa = score(fp, a);
  const sb = score(fp, b);
  const tag = (isA) => (P.unmasked ? `<p class="tag${isA === P.realIsA ? '' : ' fake'}">${isA === P.realIsA ? `The real one: ${S.info.backend}` : 'The faker: a coin flipped for every bit'}</p>` : '<p class="tag"></p>');
  const apart = Math.abs(sa.score - sb.score) > 1.96 * Math.hypot(sa.se, sb.se) * 1.5;
  let verdict = '';
  if (P.unmasked) verdict = 'The machine whose dots fill the rings is the real one. The faker spreads its answers evenly and ignores the rings.';
  else if (apart) verdict = `After ${num(shown)} answers the scores have pulled apart. One machine is following the fingerprint.`;
  $('stage').innerHTML = `<header class="brief">
      <h2>The fingerprint</h2>
      <p class="goal">A random circuit favours some answers over others. That pattern is its fingerprint, and only a machine that ran the circuit can follow it.</p>
    </header>
    <div class="row choice" role="group" aria-label="Circuit"><span class="label">Circuit</span>${S.info.circuits.map((c, i) => `<button data-c="${i}" aria-pressed="${i === P.circuit}">${i + 1}</button>`).join('')}</div>
    <div class="print-plate">${plate(fp, null, `Fingerprint of circuit ${P.circuit + 1}: 32 possible answers, likeliest first. The likeliest comes up ${(100 * Math.max(...fp)).toFixed(0)}% of the time.`)}
      <p class="caption">The fingerprint of circuit ${P.circuit + 1}, worked out by simulating it. Each cell is one of the 32 possible answers, likeliest first. A bigger dot is a likelier answer.</p></div>
    <div class="pair">
      <section class="suspect${P.unmasked && P.realIsA ? ' real' : ''}"><h3>Machine A</h3>${plate(fp, a, `Machine A's ${shown} answers against the fingerprint`)}${meter(sa, 'score')}${tag(true)}</section>
      <section class="suspect${P.unmasked && !P.realIsA ? ' real' : ''}"><h3>Machine B</h3>${plate(fp, b, `Machine B's ${shown} answers against the fingerprint`)}${meter(sb, 'score')}${tag(false)}</section>
    </div>
    <p class="hint">Rings show the fingerprint. Dots show how often each machine gave that answer. A score of 1 means the answers follow the fingerprint, and 0 means they ignore it.</p>
    <p class="verdict">${verdict}</p>
    <div class="row">
      <button class="do" id="more"${shown >= limit ? ' disabled' : ''}>Take 50 more answers</button>
      <button class="do quiet" id="all"${shown >= limit ? ' disabled' : ''}>Take them all</button>
      <button class="do quiet" id="unmask"${P.unmasked ? ' disabled' : ''}>Unmask them</button>
    </div>
    <p class="tally">${num(shown)} of ${num(limit)} answers from each machine. The score is the average, over a machine's answers, of how likely the fingerprint says each answer is, rescaled so a perfect machine gets 1.</p>`;
  document.querySelectorAll('.choice button').forEach((btn) => btn.addEventListener('click', () => {
    S.print = { circuit: Number(btn.dataset.c), shown: 50, realIsA: pick(2) === 0, unmasked: false };
    renderPrint();
    document.querySelector(`.choice button[data-c="${S.print.circuit}"]`)?.focus({ preventScroll: true });
  }));
  $('more').addEventListener('click', () => { P.shown = Math.min(limit, shown + 50); renderPrint(); $('more')?.focus({ preventScroll: true }); });
  $('all').addEventListener('click', () => { P.shown = limit; renderPrint(); $('unmask')?.focus({ preventScroll: true }); });
  $('unmask').addEventListener('click', () => { P.unmasked = true; renderPrint(); });
}

// ---------- 3. The cheats ----------

function renderCheats() {
  const c = S.print.circuit;
  const fp = fingerprintOf(c);
  const real = S.realRun.combined;
  const cards = Object.entries(FAKERS).map(([key, [name, how]]) => {
    const f = S.fake[key];
    const beats = f.combined.score > real.score;
    return `<section class="cheat${beats ? ' winner' : ''}">
      <div><h3>${name}</h3><p>${how}</p>${meter(f.combined, 'score over all four circuits')}</div>
      <div>${plate(fp, f.answers[c], `${name}'s answers on circuit ${c + 1} against the fingerprint`)}<p class="caption">Its answers on circuit ${c + 1}.</p></div>
    </section>`;
  }).join('');
  const peek = S.fake.peeker.combined.score;
  $('stage').innerHTML = `<header class="brief">
      <h2>The cheats</h2>
      <p class="goal">Three fakers try to pass the test without a quantum computer. Two fail. One scores higher than the real machine.</p>
    </header>
    <div class="cheats">
      <section class="cheat">
        <div><h3>${S.info.backend}</h3><p>The machine you picked, running the circuits for real.</p>${meter(real, 'score over all four circuits')}</div>
        <div>${plate(fp, S.real[c], `The real machine's answers on circuit ${c + 1} against the fingerprint`)}<p class="caption">Its answers on circuit ${c + 1}.</p></div>
      </section>
      ${cards}
    </div>
    <section class="below">
      <h3>Why the peeker wins, and why it doesn't matter</h3>
      <p>The peeker scores ${fixed(peek)}, well above the real machine's ${fixed(real.score)}. It can do that only because it worked out the fingerprint first. For these five-qubit circuits that means tracking 32 numbers, which any laptop does instantly.</p>
      <p>Every extra qubit doubles the work. At around 50 qubits the fingerprint takes a supercomputer, and beyond that nobody can work it out at all. That is the point of the test: past that size the only way to follow the fingerprint is to be a quantum computer.</p>
      <p>The same wall stands in front of the examiner. If nobody can compute the fingerprint, nobody can mark the answers either, so the largest claims are checked on smaller or simplified circuits and extended by argument. This is the honest weak spot in every quantum supremacy result, and the reason the claims are still argued over.</p>
    </section>`;
}

// ---------- Results ----------

function evidence() {
  return {
    project: 'Is it quantum?',
    version: S.info.version,
    backend: S.info.backend,
    mode: S.info.kind === 'remote' ? 'one job for all four circuits' : 'one job per circuit',
    saved_at: new Date().toISOString(),
    bit_order: 'Answer number i has qubit q set when (i >> q) & 1 is 1.',
    seconds: S.realRun.seconds,
    combined: S.realRun.combined,
    circuits: S.info.circuits.map((c, i) => ({ seed: c.seed, qubits: c.qubits, depth: c.depth, cnots: c.cnots, fingerprint: c.fingerprint, score: S.realRun.scores[i], answers: S.real[i] })),
    fakers: Object.fromEntries(Object.keys(FAKERS).map((k) => [k, { combined: S.fake[k].combined, expected: S.fake[k].expected }])),
    line_up_guesses: S.guesses,
  };
}

function renderResults() {
  const real = S.realRun;
  const rows = S.info.circuits.map((c, i) => `<tr><td>Circuit ${i + 1} (seed ${c.seed})</td><td class="num">${c.cnots}</td><td class="num">${num(real.scores[i].n)}</td><td class="num">${fixed(real.scores[i].score)}</td><td class="num">${fixed(real.scores[i].lo)} to ${fixed(real.scores[i].hi)}</td></tr>`).join('');
  const fakes = Object.entries(FAKERS).map(([k, [name]]) => `<tr><td>${name}</td><td class="num">${num(S.fake[k].combined.n)}</td><td class="num">${fixed(S.fake[k].combined.score)}</td><td class="num">${fixed(S.fake[k].combined.lo)} to ${fixed(S.fake[k].combined.hi)}</td><td class="num">${fixed(S.fake[k].expected)}</td></tr>`).join('');
  $('stage').innerHTML = `<section class="sheet">
    <h2>Results on this machine</h2>
    <p>How closely <strong>${S.info.backend}</strong> followed the fingerprints of four random circuits, five qubits and ten CNOTs each. A perfect machine scores 1.</p>
    <p class="big">${fixed(real.combined.score)}</p>
    <p>That is the average over all four circuits, with a 95% interval of ${fixed(real.combined.lo)} to ${fixed(real.combined.hi)}, from ${num(real.combined.n)} answers in ${real.jobs === 1 ? 'one job' : `${real.jobs} jobs`} and ${real.seconds} seconds.</p>
    <table class="results"><caption>Circuit by circuit</caption><thead><tr><th>Circuit</th><th class="num">CNOTs</th><th class="num">Answers</th><th class="num">Score</th><th class="num">95% interval</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="results"><caption>The fakers, over all four circuits</caption><thead><tr><th>Faker</th><th class="num">Answers</th><th class="num">Score</th><th class="num">95% interval</th><th class="num">Expected</th></tr></thead><tbody>${fakes}</tbody></table>
    <p class="hint">The fakers' answers come from the browser's random number generator. "Expected" is what each one scores on average, worked out exactly from the fingerprints.</p>
    <div class="row"><button class="do" id="save">Save the evidence</button></div>
    <label for="evidence" class="sr">Evidence record</label>
    <textarea id="evidence" readonly hidden></textarea>
  </section>`;
  $('save').addEventListener('click', () => guard(async () => {
    const text = JSON.stringify(evidence(), null, 1);
    const box = $('evidence');
    box.hidden = false;
    box.value = text;
    const res = await call('export_evidence', text);
    say(res.sent ? 'The evidence file is in the console below.' : 'Copy the record from the box to save it.');
    box.focus();
    box.select();
  }));
}

// ---------- What it's for ----------

function renderWhy() {
  $('stage').innerHTML = `<section class="sheet">
    <h2>What it's for</h2>
    <p>This is the test behind the biggest claims in quantum computing. In 2019 Google ran random circuits on 53 qubits and reported that its Sycamore chip followed their fingerprints, faintly but measurably, on a task it estimated would take a supercomputer thousands of years. In 2024 it repeated the test on its Willow chip with larger circuits.</p>
    <p>The test is called cross-entropy benchmarking. Its appeal is that it needs nothing from the machine except answers. Its weakness is the one you saw in the cheats: someone has to compute the fingerprint, and at the sizes that matter nobody can.</p>
    <h3>Three things people use it for</h3>
    <ol class="steps">
      <li>Comparing machines. Run the same circuits on two machines and the higher score is the one that kept its qubits in step for longer. Try this project on an IonQ noise model and an IBM one.</li>
      <li>Catching a provider that cuts corners. A cloud service that quietly swaps in a cheaper machine, or returns made-up answers, scores near 0.</li>
      <li>Tracking one machine over time. The score falls as circuits get deeper, and how fast it falls measures the error in each gate.</li>
    </ol>
    <h3>What this page leaves out</h3>
    <p>Five qubits is far too small to prove anything about quantum advantage: the fingerprint here is trivial to compute, which is why the peeker can cheat. The page shows how the test works, how it is fooled, and where it stops being checkable.</p>
  </section>`;
}

// ---------- Navigation ----------

function renderNav() {
  $('nav').innerHTML = VIEWS.map(([id, n, title]) => `<button data-view="${id}"${n ? '' : ' class="tool"'} aria-current="${S.view === id}">${n ? `<span class="n">${n}</span>` : ''}${title}</button>`).join('');
  document.querySelectorAll('#nav button').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
}

function show(view) {
  S.view = view;
  renderNav();
  ({ lineup: renderLineup, print: renderPrint, cheats: renderCheats, results: renderResults, why: renderWhy })[view]();
}

async function guard(work) {
  if (S.busy) return;
  S.busy = true;
  try {
    await work();
  } catch (err) {
    const text = String(err?.message ?? err);
    // IonQ runs one job at a time for an account, and says so with this error.
    const busy = /already running/i.test(text) ? ' IonQ is still busy with an earlier job from this account. Press Stop, wait a minute, then Run again.' : '';
    say(`${text}${busy} This page never invents answers to fill a gap.`, true);
  } finally {
    S.busy = false;
  }
}

function whenMounted() {
  return new Promise((resolve) => {
    const check = () => ($('stage') ? resolve() : setTimeout(check, 120));
    check();
  });
}

// ---------- Boot ----------

await whenMounted();
await guard(async () => {
  let hint = '';
  try { hint = /ionq/i.test(String(BACKEND?.name ?? '')) ? 'remote' : ''; } catch { hint = ''; }
  S.info = await call('describe', BACKEND, hint);
  $('machine').textContent = `Machine: ${S.info.backend}`;
  say(S.info.kind === 'remote' ? 'Running all four circuits as one job.' : 'Running four random circuits.');
  const run = await call('sample', BACKEND, S.info.kind, S.info.shots);
  if (!run.ok) throw new Error(run.error);
  S.realRun = run;
  S.real = run.answers.map((a) => a.split(',').map(Number));
  S.cursor = S.real.map(() => 0);
  const fake = await call('fakers', S.info.shots);
  for (const f of Object.values(fake)) f.answers = f.answers.map((a) => a.split(',').map(Number));
  S.fake = fake;
  S.print.realIsA = pick(2) === 0;

  console.log(`Results on ${S.info.backend}: score ${plusMinus(run.combined)} over ${num(run.combined.n)} answers, ${run.jobs === 1 ? 'one job' : `${run.jobs} jobs`}, ${run.seconds} s.`);
  run.scores.forEach((s, i) => console.log(`  Circuit ${i + 1}: ${plusMinus(s)}`));
  for (const [k, [name]] of Object.entries(FAKERS)) console.log(`  ${name}: ${plusMinus(fake[k].combined)}`);
  console.log(`RESULTS ${JSON.stringify({ backend: S.info.backend, mode: S.info.kind, shots: S.info.shots, score: run.combined.score, se: run.combined.se, n: run.combined.n, circuits: run.scores.map((s) => [Number(s.score.toFixed(4)), Number(s.se.toFixed(4))]) })}`);
  try {
    const sent = await call('export_evidence', JSON.stringify(evidence(), null, 1));
    if (sent.sent) console.log('The evidence file for this run is in the console.');
  } catch { /* the Results tab can still save it */ }
  say('');
  show('lineup');
});

// A self-check for forks and for testing on a new machine. Switched on, it
// presses every control in turn after loading and writes what happened to the
// console, so a run can be checked without a mouse.
const SELF_CHECK = false;

async function selfCheck() {
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const text = (selector) => (document.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  let ok = 0;
  let failed = 0;
  const step = async (name, selector, read, expect) => {
    const el = document.querySelector(selector);
    if (!el || el.disabled) { failed++; console.log(`SELFCHECK FAILED: ${name}: no control to press`); return; }
    el.click();
    await pause(700);
    const seen = text(read);
    if (expect.test(seen) && !$('status').classList.contains('bad')) { ok++; console.log(`SELFCHECK ok: ${name}: ${seen.slice(0, 100)}`); }
    else { failed++; console.log(`SELFCHECK FAILED: ${name}: saw "${seen.slice(0, 100)}", status "${text('#status')}"`); }
  };
  const view = (id) => `#nav button[data-view="${id}"]`;
  await step('open the line-up', view('lineup'), '#stage h2', /line-up/i);
  await step('pick machine A', '#pick-a', '.verdict', /Right|Wrong/);
  await step('deal another pair', '#again', '#pick-b', /B is the real one/);
  await step('pick machine B', '#pick-b', '.verdict', /Right|Wrong/);
  await step('open the fingerprint', '#next', '#stage h2', /fingerprint/i);
  await step('take 50 more answers', '#more', '#stage', /answers/);
  await step('take them all', '#all', '#stage', /answers/);
  await step('unmask the machines', '#unmask', '#stage', /real|faker/i);
  await step('open the cheats', view('cheats'), '#stage h2', /cheats/i);
  await step('open results', view('results'), '#stage h2', /Results/i);
  await step('save the evidence', '#save', '#status', /console|box/);
  await step('open what it is for', view('why'), '#stage h2', /for/i);
  console.log(`SELFCHECK done: ${ok} ok, ${failed} failed.`);
}

if (SELF_CHECK) await selfCheck();

// Qollab ends a run when this file finishes, and the page stops responding
// with it. Waiting here keeps it live until Stop is pressed.
console.log('The page is live. Press Stop in Qollab when you are done.');
await new Promise(() => {});
