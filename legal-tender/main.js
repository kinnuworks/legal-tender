// Legal Tender: the page. Python (legaltender/) owns the circuits and the
// statistics. This file owns the desk, the notes, the tallies and every call
// that reaches the selected backend.
import * as api from 'legaltender.api';

const BACKEND = typeof backend !== 'undefined' ? backend : null;
const NOTE_QUBITS = 8;
const STATES = ['0', '1', '+', '-'];
const SIX = [...STATES, 'R', 'L'];
const ACT_PLATES = { photocopier: 'photocopier', press: 'proof', patient: 'patient', upgrade: 'upgrade', ledger: 'proof', ticket: 'proof' };
const VIEWS = [
  ['photocopier', '1', 'The photocopier'],
  ['press', '2', 'The best press'],
  ['patient', '3', 'The patient forger'],
  ['upgrade', '4', 'The bank fights back'],
  ['ledger', '', 'Results'],
  ['ticket', '', "What it's for"],
];

const S = {
  info: null,
  kind: 'local',
  view: '',
  sheets: [],
  cells: new Map(),
  printed: new Set(),
  note: null,
  guesses: Array(NOTE_QUBITS).fill('Z'),
  result: null,
  tally: { photocopier: { tries: 0, passes: 0 }, press: { tries: 0, passes: 0 }, universal: { tries: 0, passes: 0 } },
  ways: 'four',
  visits: 4,
  heistVisits: 8,
  heist: null,
  heists: {},
  probe: null,
  probes: {},
  ticket: null,
  busy: false,
};

const $ = (id) => document.getElementById(id);
const pct = (x, digits = 1) => `${(100 * x).toFixed(digits)}%`;
const num = (n) => n.toLocaleString('en-GB');

// ---------- Python bridge ----------

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

// ---------- Motion and sound ----------

const STEP = 170; // pause between the teller's checks, in ms
const REVEAL = NOTE_QUBITS * STEP + 260; // when the stamp lands
const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, calm() ? 0 : ms));
const at = (ms) => ` style="animation-delay:${ms}ms"`;

// Sound is off until the player turns it on. Every sound is synthesised here,
// so the project ships no audio files.
let audio = null;
const VOICES = {
  tick: ['square', 1500, 900, 0.03, 0.05],
  thud: ['sine', 120, 36, 0.26, 0.6],
  whirr: ['sawtooth', 210, 150, 0.7, 0.05],
  slip: ['triangle', 520, 780, 0.12, 0.07],
};
function sound(name, afterMs = 0) {
  if (!audio) return;
  const [type, from, to, seconds, volume] = VOICES[name];
  const t = audio.currentTime + (calm() ? 0 : afterMs) / 1000;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + seconds);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + seconds + 0.02);
}

function wireSound() {
  const button = $('sound');
  const Ctx = window.AudioContext ?? window.webkitAudioContext;
  if (!button) return;
  if (!Ctx) { button.hidden = true; return; }
  button.addEventListener('click', () => {
    if (audio) { audio.close(); audio = null; } else { audio = new Ctx(); sound('slip'); }
    button.setAttribute('aria-pressed', String(Boolean(audio)));
    button.textContent = audio ? 'Sound on' : 'Sound off';
  });
}

// ---------- Small helpers ----------

function pick(n) {
  const box = new Uint32Array(1);
  try { crypto.getRandomValues(box); } catch { box[0] = Math.floor(Math.random() * 2 ** 32); }
  return box[0] % n;
}

function wilson(k, n) {
  if (!n) return { k, n, p: 0, lo: 0, hi: 1 };
  const z = 1.96;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { k, n, p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

const between = (r) => `between ${pct(r.lo)} and ${pct(r.hi)}`;

// The two notes a bank can issue, and the best machine against each.
const WAYS = {
  four: { machine: 'press', pool: STATES, name: 'Four-way note', series: 'IV' },
  six: { machine: 'universal', pool: SIX, name: 'Six-way note', series: 'VI' },
};

// The states a note on this view can use. An IonQ run holds one sheet with a
// few states for each machine, so its notes are drawn from those.
function poolFor(view) {
  const held = (kind, pool) => {
    const some = pool.filter((state) => S.cells.has(`${kind}:${state}`));
    return some.length ? some : pool;
  };
  if (view === 'press') return held('press', STATES);
  if (view === 'upgrade') return held(WAYS[S.ways].machine, WAYS[S.ways].pool);
  return STATES;
}

function newNote() {
  const pool = poolFor(S.view);
  const secret = Array.from({ length: NOTE_QUBITS }, () => pool[pick(pool.length)]);
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const serial = `${pick(10)}${letters[pick(24)]}${letters[pick(24)]} ${String(pick(1000000)).padStart(6, '0')}`;
  S.note = { secret, serial, view: S.view, ways: S.view === 'upgrade' ? S.ways : 'four' };
  S.result = null;
}

// ---------- Plates and stock ----------

function addSheet(sheet) {
  S.sheets.push(sheet);
  for (const c of sheet.cells) {
    const codes = sheet.outcomes[c.id].split(',').map(Number);
    const cell = S.cells.get(c.id) ?? { ...c, codes: [], cursor: 0, plate: sheet.plate };
    cell.codes = cell.codes.concat(codes);
    S.cells.set(c.id, cell);
  }
  S.printed.add(sheet.plate);
}

async function runFromPage(id) {
  const started = performance.now();
  let circuit;
  try {
    circuit = await api.plate_circuit.callPromising(BACKEND, id, S.kind);
  } catch {
    circuit = await api.plain_circuit.callPromising(id, S.kind);
  }
  const job = await BACKEND.run(circuit, { shots: S.info.shots });
  const result = await job.result();
  let counts = result.get_counts();
  if (counts?.toJs) counts = counts.toJs();
  if (Array.isArray(counts)) [counts] = counts;
  if (counts instanceof Map) counts = Object.fromEntries(counts);
  const seconds = ((performance.now() - started) / 1000).toFixed(2);
  return call('read_plate', id, S.kind, JSON.stringify(counts), seconds, S.info.backend);
}

async function printPlate(id, message) {
  if (S.kind === 'remote' && S.sheets.length > 0) {
    throw new Error('This machine prints one plate per run. Press Stop, then Run, to print another.');
  }
  say(S.kind === 'device' ? `${message} This machine simulates noise, so a plate can take a minute or two.` : message);
  let sheet;
  try {
    sheet = await call('print_plate', BACKEND, id, S.kind, S.info.shots);
  } catch (err) {
    sheet = { ok: false, error: String(err?.message ?? err) };
  }
  // If Python could not run the job, run it from the page and let Python read
  // the counts. An IonQ backend that has already taken its one job is left alone.
  if (!sheet.ok && !/one job|only one/i.test(sheet.error) && typeof BACKEND?.run === 'function') {
    console.log(`Python could not run the plate (${sheet.error}). Running it from the page.`);
    sheet = await runFromPage(id);
  }
  if (!sheet.ok) throw new Error(sheet.error);
  addSheet(sheet);
  console.log(`Plate ${sheet.plate}: ${sheet.qubits} qubits, ${sheet.shots} shots, ${sheet.seconds} s on ${sheet.backend}.`);
}

// An IonQ run has one sheet, and it carries the upgrade's cells too.
const actOf = (view) => (S.kind === 'remote' && view === 'upgrade' ? 'proof' : ACT_PLATES[view]);

async function ensureAct(view) {
  const act = actOf(view);
  const todo = S.info.plates.filter((p) => p.act === act && !S.printed.has(p.id));
  for (let i = 0; i < todo.length; i++) {
    await printPlate(todo[i].id, `Inking plate ${i + 1} of ${todo.length} (${todo[i].qubits} qubits).`);
  }
  say('');
}

function has(view) {
  const act = actOf(view);
  return S.info.plates.some((p) => p.act === act && S.printed.has(p.id));
}

async function take(cellId) {
  const cell = S.cells.get(cellId);
  if (!cell) throw new Error(`No plate on this run holds ${cellId}.`);
  if (cell.cursor >= cell.codes.length) {
    if (S.kind === 'remote') throw new Error('This plate is used up. Press Stop, then Run, for a fresh one.');
    await printPlate(cell.plate, 'That plate is worn out. Inking a fresh one.');
    say('');
  }
  return cell.codes[cell.cursor++];
}

function cellsOf(kind, filter = () => true) {
  return [...S.cells.values()].filter((c) => c.kind === kind && filter(c));
}

function rateOver(cells, hit) {
  let k = 0;
  let n = 0;
  for (const c of cells) {
    n += c.codes.length;
    for (const code of c.codes) if (hit(code)) k++;
  }
  return wilson(k, n);
}

// ---------- Drawing a banknote ----------

// A guilloche: strands of one sine wave woven round a ring, the engraved
// pattern real banknotes carry. Each of the ring's eight sectors belongs to one
// qubit. Where a qubit failed its check the weave pinches flat, the way a poor
// copy loses its fine lines.
function guilloche(cx, cy, seed, flaws, animate) {
  const parts = [];
  const sector = Math.PI / 4;
  const rings = [
    { radius: 62, swing: 13, waves: seed % 2 ? 24 : 16, strands: 5 + (seed % 3) },
    { radius: 34, swing: 6, waves: 8, strands: 4 },
  ];
  for (const ring of rings) {
    for (let k = 0; k < ring.strands; k++) {
      const phase = (2 * Math.PI * k) / ring.strands;
      for (let j = 0; j < 8; j++) {
        const strand = (pinched) => {
          let d = '';
          for (let i = 0; i <= 30; i++) {
            const t = (j + i / 30) * sector - Math.PI / 2 - sector / 2;
            const swing = ring.swing * (pinched ? 1 - 0.9 * Math.sin((Math.PI * i) / 30) ** 2 : 1);
            const r = ring.radius + swing * Math.sin(ring.waves * t + phase);
            d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(t)).toFixed(1)} ${(cy + r * Math.sin(t)).toFixed(1)}`;
          }
          return d;
        };
        const flawed = flaws && flaws[j];
        if (!flawed) {
          parts.push(`<path class="line bank" stroke-width="0.7" d="${strand(false)}"/>`);
        } else if (!animate) {
          parts.push(`<path class="line teller" stroke-width="0.9" d="${strand(true)}"/>`);
        } else {
          parts.push(`<path class="line bank fade-out"${at(j * STEP)} stroke-width="0.7" d="${strand(false)}"/>`);
          parts.push(`<path class="line teller fade-in"${at(j * STEP)} stroke-width="0.9" d="${strand(true)}"/>`);
        }
      }
    }
  }
  for (const r of [79, 45, 24]) parts.push(`<circle class="line bank" stroke-width="0.6" cx="${cx}" cy="${cy}" r="${r}"/>`);
  return parts.join('');
}

// A qubit is drawn the way physicists draw polarised light: a line through a
// circle. Straight qubits stand upright or lie flat, diagonal ones lean, and
// circular ones turn, one clockwise and one anticlockwise.
const TILT = { '0': 90, '1': 0, '+': 45, '-': 135 };

function turning(x, y, r, clockwise) {
  const side = clockwise ? 1 : -1;
  const on = (deg, radius = r) => [x + side * radius * Math.cos((deg * Math.PI) / 180), y + radius * Math.sin((deg * Math.PI) / 180)];
  const f = (v) => v.toFixed(1);
  const [x0, y0] = on(-40);
  const [x1, y1] = on(235);
  // The arrowhead: two short strokes back from the end of the arc.
  const [ax, ay] = on(205, r * 0.48);
  const [bx, by] = on(203, r * 1.55);
  return `M${f(x0)} ${f(y0)}A${r} ${r} 0 1 ${clockwise ? 1 : 0} ${f(x1)} ${f(y1)}M${f(ax)} ${f(ay)}L${f(x1)} ${f(y1)}L${f(bx)} ${f(by)}`;
}

function seal(i, s, animate) {
  const x = 252 + i * 48;
  const y = 214;
  const r = 16;
  const when = animate ? at(i * STEP) : '';
  const number = `<text class="sealno" x="${x}" y="${y - 25}" text-anchor="middle" font-size="10" font-weight="600">${i + 1}</text>`;
  const closed = `<circle class="fill-bank" cx="${x}" cy="${y}" r="${r}"/><circle class="eye" cx="${x}" cy="${y}" r="${r - 6}"/>`;
  if (s.shape === 'hidden') return closed + number;

  const bad = s.mark === 'fail';
  const tone = bad ? 'teller' : 'bank';
  const a = (TILT[s.state] * Math.PI) / 180;
  const dx = (r - 5) * Math.cos(a);
  const dy = (r - 5) * Math.sin(a);
  let open = `<circle class="line ${tone}" stroke-width="1.8"${bad ? ' stroke-dasharray="3.5 3"' : ''} cx="${x}" cy="${y}" r="${r}"/>`;
  open += s.state === 'R' || s.state === 'L'
    ? `<path class="line ${tone}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="${turning(x, y, r - 8, s.state === 'R')}"/>`
    : `<line class="line ${tone}" stroke-width="2.8" stroke-linecap="round" x1="${(x - dx).toFixed(1)}" y1="${(y + dy).toFixed(1)}" x2="${(x + dx).toFixed(1)}" y2="${(y - dy).toFixed(1)}"/>`;
  open += bad
    ? `<path class="line teller stamped"${when} stroke-width="2.4" stroke-linecap="round" d="M${x - 6} ${y + 26}l12 12M${x + 6} ${y + 26}l-12 12"/>`
    : `<path class="line bank stamped"${when} stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M${x - 7} ${y + 32}l5 5 9-10"/>`;
  if (!animate) return open + number;
  // Each seal stays closed until the teller reaches it.
  return `<g class="fade-out"${when}>${closed}</g><g class="fade-in"${when}>${open}</g>${number}`;
}

// Serial numbers climb in size from left to right, as on Indian banknotes.
function serialText(serial) {
  return [...serial].map((ch, i) => `<tspan font-size="${(13 + i * 1.1).toFixed(1)}">${ch === ' ' ? '&#160;' : ch}</tspan>`).join('');
}

const MICRO = 'LEGAL TENDER EIGHT QUBITS PAYABLE TO THE BEARER ONCE '.repeat(5);

// Everything a note is printed with: the paper's colour blend, the two line
// screens laid under the design, the grain of the paper, the worn edge of a
// rubber stamp, and two inks that change colour as the note is tilted. Real
// notes carry all of these. They are defined once and every note refers to them.
function inks() {
  if ($('lt-inks')) return;
  const holder = document.createElement('div');
  holder.innerHTML = `<svg id="lt-inks" class="inks" width="0" height="0" aria-hidden="true" focusable="false"><defs>
    <linearGradient id="lt-iris" x1="0" x2="1" y1="0" y2="0.4">
      <stop offset="0" stop-color="#DCEBD8"/><stop offset="0.52" stop-color="#F0ECD9"/><stop offset="1" stop-color="#E5DDF0"/>
    </linearGradient>
    <pattern id="lt-screen" width="16" height="5" patternUnits="userSpaceOnUse"><path d="M0 2.5q4-3.4 8 0t8 0" fill="none" stroke="#1C6A50" stroke-width="0.34"/></pattern>
    <pattern id="lt-cross" width="24" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(64)"><path d="M0 3.5q6-4.4 12 0t12 0" fill="none" stroke="#5B2D91" stroke-width="0.3"/></pattern>
    <radialGradient id="lt-clear" cx="0.5" cy="0.5" r="0.5"><stop offset="0.55" stop-color="#F2F1E4" stop-opacity="0.85"/><stop offset="1" stop-color="#F2F1E4" stop-opacity="0"/></radialGradient>
    <filter id="lt-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix type="matrix" values="0 0 0 0 0.07  0 0 0 0 0.15  0 0 0 0 0.11  0 0 0 -1.5 1.02"/></filter>
    <filter id="lt-ink" x="-4%" y="-10%" width="108%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="3" seed="11" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.7" xChannelSelector="R" yChannelSelector="G" result="rough"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.09 0.5" numOctaves="2" seed="4" result="streak"/>
      <feColorMatrix in="streak" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3.6 0 0 0 -0.6" result="worn"/>
      <feComposite in="rough" in2="worn" operator="in"/>
    </filter>
    <linearGradient id="lt-ovi" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" style="stop-color:hsl(calc(156 + var(--tilt, 0.25) * 118) 64% 31%)"/>
      <stop offset="0.5" style="stop-color:hsl(calc(176 + var(--tilt, 0.25) * 118) 58% 40%)"/>
      <stop offset="1" style="stop-color:hsl(calc(150 + var(--tilt, 0.25) * 118) 66% 28%)"/>
    </linearGradient>
    <linearGradient id="lt-foil" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" style="stop-color:hsl(calc(150 + var(--tilt, 0.25) * 150) 34% 76%)"/>
      <stop offset="0.5" style="stop-color:hsl(calc(190 + var(--tilt, 0.25) * 150) 46% 50%)"/>
      <stop offset="1" style="stop-color:hsl(calc(140 + var(--tilt, 0.25) * 150) 34% 80%)"/>
    </linearGradient>
  </defs></svg>`;
  $('lt-root').append(holder.firstChild);
  // Tilting: the colour-shifting inks follow the pointer across a note.
  document.addEventListener('pointermove', (event) => {
    const sheet = event.target.closest?.('.sheet');
    if (!sheet) return;
    const box = sheet.getBoundingClientRect();
    $('lt-root').style.setProperty('--tilt', ((event.clientX - box.left) / box.width).toFixed(3));
  }, { passive: true });
}

// The engraved band round the edge: two strands of one wave, a half-wave apart.
function braid() {
  const run = (x, y, dx, dy, n, sign) => {
    const nx = dy ? sign * 5.4 : 0;
    const ny = dx ? sign * 5.4 : 0;
    let d = `M${x} ${y}q${dx / 2 + nx} ${dy / 2 + ny} ${dx} ${dy}`;
    for (let i = 1; i < n; i++) d += `t${dx} ${dy}`;
    return d;
  };
  let d = '';
  for (const sign of [1, -1]) {
    d += run(22, 12.5, 9.93, 0, 60, sign) + run(22, 267.5, 9.93, 0, 60, sign);
    d += run(12.5, 22, 0, 9.83, 24, sign) + run(627.5, 22, 0, 9.83, 24, sign);
  }
  return d;
}
const BRAID = braid();

function noteSvg({ serial, seals, flaws, verdict, label, animate, stampAt = REVEAL, series = 'IV' }) {
  const seed = [...serial].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const when = animate ? at(stampAt) : '';
  let stamp = '';
  if (verdict === 'ACCEPTED') {
    stamp = `<g transform="rotate(-8 548 140)"><g class="slam stampmark"${when}><g filter="url(#lt-ink)"><ellipse class="line teller" stroke-width="2.8" cx="548" cy="140" rx="72" ry="23"/><ellipse class="line teller" stroke-width="1" cx="548" cy="140" rx="66" ry="18"/><text class="verdict" x="548" y="145.5" text-anchor="middle" font-size="14.5">ACCEPTED</text></g></g></g>`;
  } else if (verdict) {
    stamp = `<g transform="rotate(-8 548 140)"><g class="slam stampmark"${when}><g filter="url(#lt-ink)"><rect class="line teller" stroke-width="2.8" x="480" y="117" width="136" height="46" rx="3"/><rect class="line teller" stroke-width="1" x="485" y="122" width="126" height="36" rx="1"/><text class="verdict" x="548" y="147" text-anchor="middle" font-size="19">${verdict}</text></g></g></g>`;
  }
  let thread = '';
  for (let i = 0; i < 7; i++) thread += `<rect x="199.5" y="${33 + i * 31}" width="5.5" height="23" rx="0.8" fill="url(#lt-foil)"/>`;
  return `<svg viewBox="0 0 640 280" role="img" aria-label="${label}">
    <rect width="640" height="280" fill="url(#lt-iris)"/>
    <rect width="640" height="280" fill="url(#lt-screen)" opacity="0.55"/>
    <rect width="640" height="280" fill="url(#lt-cross)" opacity="0.5"/>
    <ellipse cx="420" cy="150" rx="250" ry="128" fill="url(#lt-clear)"/>
    <circle cx="112" cy="142" r="92" fill="url(#lt-clear)"/>
    <rect width="640" height="280" filter="url(#lt-grain)" opacity="0.2"/>
    <rect class="line bank" stroke-width="0.9" x="6.5" y="6.5" width="627" height="267" rx="3"/>
    <path class="line bank" stroke-width="0.55" d="${BRAID}"/>
    <rect class="line bank" stroke-width="0.6" x="18.5" y="18.5" width="603" height="243" rx="1.5"/>
    <text class="micro" x="26" y="26.5" textLength="588" lengthAdjust="spacing">${MICRO}</text>
    <text class="micro" x="26" y="257" textLength="588" lengthAdjust="spacing">${MICRO}</text>
    ${thread}
    ${guilloche(112, 142, seed, flaws, animate)}
    <text class="numeral" x="112" y="155" text-anchor="middle" font-size="36">8</text>
    <text class="bankname" x="228" y="60" font-size="10.5">QUANTUM MINT</text>
    <text class="series" x="394" y="60" font-size="9.5">SERIES ${series}</text>
    <text class="denom" x="226" y="103" font-size="35">Eight qubits</text>
    <text class="legend-line" x="228" y="127" font-size="12.5">Payable to the bearer, once</text>
    <text class="serial" x="228" y="162">${serialText(serial)}</text>
    <text class="ovi" x="592" y="74" text-anchor="middle" font-size="44" fill="url(#lt-ovi)">8</text>
    ${seals.map((sl, i) => seal(i, sl, animate)).join('')}
    ${stamp}
  </svg>`;
}

function figure(caption, opts) {
  const shake = opts.animate && opts.verdict ? ` shake"${at(opts.stampAt ?? REVEAL)}` : '"';
  return `<figure class="note"><div class="sheet${shake}>${noteSvg(opts)}</div><figcaption>${caption}</figcaption></figure>`;
}

// A hundred attempts at a glance: one small slip per attempt, filled if it got through.
function slips(results, label) {
  return `<div class="hundred" role="img" aria-label="${label}">${results.map((ok, i) => `<span class="${ok ? 'yes' : 'no'} fade-in"${at(i * 12)}></span>`).join('')}</div>`;
}

const hiddenSeals = () => Array.from({ length: NOTE_QUBITS }, () => ({ shape: 'hidden' }));

function sealsFor(which) {
  return S.note.secret.map((state, i) => ({ state, shape: 'open', mark: S.result.qubits[i][which] ? 'pass' : 'fail' }));
}

// The two ways to read a qubit, drawn as the filter you would hold up to it.
const filterIcon = (guess) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${guess === 'X' ? 'M6 6l12 12M18 6L6 18' : 'M12 3.5v17M3.5 12h17'}"/></svg>`;
const visitMark = (caught) => `<svg viewBox="0 0 24 24" aria-hidden="true">${caught ? '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>' : '<circle cx="12" cy="12" r="9"/><path d="M7.5 12.5l3 3 6-7"/>'}</svg>`;

// ---------- Acts one and two: copying a note ----------

const COPY = {
  photocopier: {
    title: 'The photocopier',
    perQubit: () => S.info.theory.photocopier,
    goal: 'Your job: turn this one banknote into two that both get past the bank teller.',
    steps: [
      'The eight round seals on the note each hide one qubit. A qubit is set either straight or diagonal, and only the bank knows which.',
      'To copy a qubit the photocopier has to read it, and it needs your guess for how it is set. A right guess copies it cleanly. A wrong guess scrambles it for good.',
      'The teller then checks all sixteen qubits on the two notes. One wrong answer and both notes are refused.',
    ],
    button: 'Run the photocopier',
    why: 'Each qubit gets past the teller on both notes five times in eight on average. All eight have to pass, which happens about once in forty tries.',
  },
  press: {
    title: 'The best press',
    perQubit: () => S.info.theory.press,
    goal: 'Same job, better machine: this is the best copier physics allows. It needs no guesses.',
    steps: [
      'Pull the lever. The press copies all eight qubits the same way, without reading them.',
      'The teller checks all sixteen qubits on the two notes, as before.',
      'Three physicists designed this machine in 2012 and proved that nothing can beat it.',
    ],
    button: 'Pull the lever',
    why: 'Each qubit gets past the teller on both notes three times in four, and no machine can do better. All eight have to pass, which happens about once in ten tries.',
  },
};

// The marks on a checked note, explained with the marks themselves.
const KEY = {
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="k-bank" cx="12" cy="12" r="9"/><path class="k-bank" d="M12 5v14"/></svg> answered the teller correctly',
  wrong: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="k-teller" stroke-dasharray="3 2.6" cx="12" cy="12" r="9"/><path class="k-teller" d="M7 7l10 10M17 7L7 17"/></svg> answered wrong',
  lean: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="k-bank" cx="12" cy="12" r="9"/><path class="k-bank" d="M7 17L17 7"/></svg> a leaning line is a diagonal qubit, an upright or flat one is straight',
  missed: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect class="k-teller" stroke-dasharray="3 2.6" x="3" y="3" width="18" height="18" rx="4"/></svg> your guess was the wrong way round',
  turn: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="k-bank" cx="12" cy="12" r="9"/><path class="k-bank" d="${turning(12, 12, 4.6, true)}"/></svg> a curved arrow is a circular qubit, which only six-way notes have`,
};

async function forgeOnce(kind, secret, guesses) {
  const qubits = [];
  for (let i = 0; i < NOTE_QUBITS; i++) {
    const id = kind === 'photocopier' ? `photocopier:${secret[i]}:${guesses[i]}` : `${kind}:${secret[i]}`;
    const code = await take(id);
    qubits.push({ a: (code & 1) === 1, b: (code & 2) === 2 });
  }
  const wrong = qubits.reduce((n, q) => n + (q.a ? 0 : 1) + (q.b ? 0 : 1), 0);
  S.tally[kind].tries++;
  if (wrong === 0) S.tally[kind].passes++;
  return { kind, qubits, wrong };
}

async function forge(kind) {
  const result = await forgeOnce(kind, S.note.secret, S.guesses);
  // The machine works on the note for a moment before the teller sees it.
  document.querySelector('.note')?.classList.add(kind === 'photocopier' ? 'scanning' : 'pressing');
  sound('whirr');
  await wait(kind === 'photocopier' ? 950 : 760);
  S.result = { ...result, guesses: [...S.guesses] };
  if (!calm()) for (let i = 0; i < NOTE_QUBITS; i++) sound('tick', i * STEP);
  sound('thud', REVEAL);
  renderCopy(kind, { animate: true });
  $('again')?.focus({ preventScroll: true });
}

async function hundred(kind, render = (opts) => renderCopy(kind, opts)) {
  const results = [];
  const pool = poolFor(S.view);
  for (let n = 0; n < 100; n++) {
    const secret = Array.from({ length: NOTE_QUBITS }, () => pool[pick(pool.length)]);
    const guesses = Array.from({ length: NOTE_QUBITS }, () => (pick(2) ? 'X' : 'Z'));
    results.push((await forgeOnce(kind, secret, guesses)).wrong === 0);
  }
  const passed = results.filter(Boolean).length;
  newNote();
  sound('whirr');
  render({
    animate: true,
    grid: slips(results, `${passed} of 100 pairs passed`),
    headline: `${passed} of those 100 tries got both notes past the teller. Filled slips are the ones that passed.`,
  });
}

function tallyLine(kind) {
  const t = S.tally[kind];
  const perQubit = rateOver(cellsOf(kind), (code) => code === 3);
  const theoryNote = COPY[kind].perQubit() ** NOTE_QUBITS;
  let line = '';
  if (t.tries) {
    const r = wilson(t.passes, t.tries);
    line += `Pairs past the teller so far: <strong>${t.passes} of ${num(t.tries)}</strong> (${pct(r.p)}, ${between(r)}). Theory for eight qubits: ${pct(theoryNote)}.<br>`;
  }
  line += `Per qubit on this machine, the original and the copy both passed ${pct(perQubit.p)} of the time over ${num(perQubit.n)} shots (${between(perQubit)}). Theory: ${pct(COPY[kind].perQubit())}.`;
  return line;
}

function renderCopy(kind, { headline = '', grid = '', animate = false } = {}) {
  const c = COPY[kind];
  const done = S.result && S.result.kind === kind;
  let notes;
  let guessRow = '';
  let verdict = headline;
  let why = '';
  let key = '';
  let buttons;
  if (done) {
    const r = S.result;
    const mark = r.wrong === 0 ? 'ACCEPTED' : 'FORGED';
    notes = `<div class="notes">
      ${figure('Note 1: your original, after the machine had it', { serial: S.note.serial, seals: sealsFor('a'), flaws: r.qubits.map((q) => !q.a), verdict: mark, label: `Original note, ${mark.toLowerCase()}`, animate })}
      ${figure('Note 2: your copy', { serial: S.note.serial, seals: sealsFor('b'), flaws: r.qubits.map((q) => !q.b), verdict: mark, label: `Copied note, ${mark.toLowerCase()}`, animate })}
    </div>`;
    verdict = r.wrong === 0
      ? 'Accepted. Both notes got past the teller.'
      : `Forged. ${r.wrong} of the sixteen qubits gave the teller a wrong answer, so both notes were refused.`;
    const keys = [KEY.right, KEY.wrong, KEY.lean];
    if (kind === 'photocopier') {
      const wrongWay = r.guesses.map((g, i) => (g === 'Z') !== (S.note.secret[i] === '0' || S.note.secret[i] === '1'));
      const missed = wrongWay.filter(Boolean).length;
      guessRow = `<div class="guess-row"><p class="guess-label">Your guesses</p><div class="guesses shown" role="img" aria-label="Your guesses. ${missed} of 8 were the wrong way round.">${r.guesses.map((g, i) => `<span class="${wrongWay[i] ? 'wrong' : ''}">${filterIcon(g)}</span>`).join('')}</div></div>`;
      if (missed === 0) why = 'All eight of your guesses were right, so every qubit copied cleanly. That takes luck: one chance in 256.';
      else if (r.wrong === 0) why = `You guessed ${missed} of the eight seals the wrong way round and got lucky. A scrambled qubit still passes on both notes one time in four.`;
      else why = `Why: you guessed ${missed} of the eight seals the wrong way round, so ${missed === 1 ? 'that qubit was' : 'those qubits were'} scrambled before ${missed === 1 ? 'it was' : 'they were'} copied.`;
      keys.push(KEY.missed);
    } else {
      why = c.why;
    }
    key = `<ul class="key">${keys.map((k) => `<li>${k}</li>`).join('')}</ul>`;
    buttons = `<button class="do" id="again">Try again with a new note</button><button class="do quiet" id="hundred">Run a hundred notes</button>`;
  } else {
    notes = `<div class="notes">${figure('A genuine banknote. Each of the eight round seals hides one qubit.', { serial: S.note.serial, seals: hiddenSeals(), flaws: null, verdict: null, label: 'A genuine note with eight sealed qubits' })}</div>`;
    if (kind === 'photocopier') {
      guessRow = `<div class="guess-row"><p class="guess-label">Your guess for each seal</p><div class="guesses" role="group" aria-label="Your guess for each seal">${S.guesses.map((g, i) => `<button data-i="${i}" aria-pressed="${g === 'X'}" aria-label="Seal ${i + 1}: guess ${g === 'X' ? 'diagonal' : 'straight'}">${filterIcon(g)}</button>`).join('')}</div></div>
        <p class="hint">${filterIcon('Z')} means you guess straight and ${filterIcon('X')} means diagonal. Press a switch to change it.</p>`;
    }
    if (headline) why = c.why;
    buttons = `<button class="do" id="go">${c.button}</button>${kind === 'photocopier' ? '<button class="do quiet" id="shuffle">Guess for me</button>' : ''}<button class="do quiet" id="hundred">Run a hundred notes</button>`;
  }
  // Whatever follows the reveal waits for it: the verdict after the stamp, the
  // count after the last slip.
  const late = animate ? ` after"${at(grid ? 1500 : REVEAL + 220)}` : '"';
  $('stage').innerHTML = `<header class="brief">
      <h2>${c.title}</h2>
      <p class="goal">${c.goal}</p>
    </header>
    <section class="counter">
      <div class="desk">
        ${notes}
        ${guessRow}
        ${grid}
        <p class="verdict-line${late}>${verdict}</p>
        <p class="why${late}>${why}</p>
        <div class="row${late}>${buttons}</div>
        <div class="legend${late}>${key}</div>
      </div>
      <aside class="panel">
        <h3>How it works</h3>
        <ol class="steps">${c.steps.map((step) => `<li>${step}</li>`).join('')}</ol>
        ${kind === 'press' ? proofLine() : ''}
        <p class="tally">${tallyLine(kind)}</p>
      </aside>
    </section>`;

  document.querySelectorAll('.guesses button').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.i);
    S.guesses[i] = S.guesses[i] === 'Z' ? 'X' : 'Z';
    renderCopy(kind);
    document.querySelector(`.guesses button[data-i="${i}"]`)?.focus();
  }));
  $('go')?.addEventListener('click', () => guard(() => forge(kind)));
  $('shuffle')?.addEventListener('click', () => { S.guesses = S.guesses.map(() => (pick(2) ? 'X' : 'Z')); renderCopy(kind); });
  $('again')?.addEventListener('click', () => { newNote(); renderCopy(kind); $('go')?.focus(); });
  $('hundred')?.addEventListener('click', () => guard(() => hundred(kind)));
}

// ---------- Act four: the bank fights back ----------

const digits = (x) => `${(100 * x).toFixed(4)}%`;

// The proof, cut down to the one line act two needs.
function proofLine() {
  const line = S.info.proof?.ok && S.info.proof.lines.find((l) => l.note === 'four' && l.teller === 'strict');
  if (!line) return '';
  return `<p class="proofline">Proved on this page when it loaded: no machine of any kind can score above <strong>${digits(line.limit)}</strong> per qubit, and this press scores <strong>${digits(line.reached)}</strong>. The working is under The bank fights back.</p>`;
}

function proofBlock() {
  const proof = S.info.proof;
  if (!proof?.ok) return '';
  const machines = { press: 'best press', lenient: 'second press', universal: 'universal press' };
  const rows = proof.lines.map((l) => `<tr><td>${l.note === 'four' ? 'Four-way' : 'Six-way'}</td><td>${l.teller === 'strict' ? 'Strict' : 'Forgiving'}</td><td class="num">${digits(l.limit)}</td><td class="num">${digits(l.reached)}</td><td>${machines[l.machine]}</td></tr>`).join('');
  const worst = Math.max(...proof.lines.map((l) => l.gap));
  return `<h3>The proof, worked out on this page</h3>
    <p>Every forging machine, however clever, takes one qubit in and hands two out. Its score with the teller comes from an 8 by 8 table built from the note's states, and no machine can score more than twice that table's largest eigenvalue. This page worked that limit out when it loaded. It also took the circuits it runs and worked out their exact scores from their amplitudes.</p>
    <table class="ledger"><thead><tr><th>Note</th><th>Teller</th><th class="num">Limit for any machine</th><th class="num">Best circuit here</th><th>Which circuit</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="hint">${worst < 1e-9 ? 'The two columns agree to better than one part in a billion on every row, so each circuit is the best machine there can be for its note and teller.' : `The two columns differ by at most ${worst.toExponential(1)}.`} A strict teller refuses a note with any wrong qubit, so the score is how often a qubit passes on both notes. A forgiving teller allows a few, so the score is how often a qubit passes on one copy.</p>`;
}

// What the forger's best machines scored on this run, per qubit.
function duel() {
  const T = S.info.theory;
  const pair = (kind) => (cellsOf(kind).length ? rateOver(cellsOf(kind), (c) => c === 3) : null);
  const copy = (kind) => {
    const cells = cellsOf(kind);
    if (!cells.length) return null;
    const a = rateOver(cells, (c) => (c & 1) === 1);
    const b = rateOver(cells, (c) => (c & 2) === 2);
    return wilson(a.k + b.k, a.n + b.n);
  };
  const gauge = (r, limit) => {
    if (!r) return '<span class="hint">not on this run</span>';
    const w = (p) => `${(100 * Math.max(0, Math.min(1, (p - 0.5) / 0.5))).toFixed(1)}%`;
    return `<span class="score">${pct(r.p)}</span><span class="gauge" role="img" aria-label="${pct(r.p)} measured, between ${pct(r.lo)} and ${pct(r.hi)}. Limit ${pct(limit)}."><i style="width:${w(r.p)}"></i><b style="left:${w(limit)}"></b></span><small>limit ${pct(limit)}</small>`;
  };
  const whole = (r) => (r ? `<span class="score">${pct(r.p ** NOTE_QUBITS)}</span>` : '');
  const four = pair('press');
  const six = pair('universal');
  return `<table class="ledger duel"><thead><tr><th>The forger's best machine against</th><th>Four-way note</th><th>Six-way note</th></tr></thead><tbody>
    <tr><td><strong>A strict teller.</strong> How often one qubit passes on both notes.</td><td>${gauge(four, T.pair.four)}</td><td>${gauge(six, T.pair.six)}</td></tr>
    <tr><td>The same, for a whole eight-qubit pair.</td><td>${whole(four)}</td><td>${whole(six)}</td></tr>
    <tr><td><strong>A forgiving teller.</strong> How often one qubit passes on one copy.</td><td>${gauge(copy('lenient'), T.floor.four)}</td><td>${gauge(copy('universal'), T.floor.six)}</td></tr>
  </tbody></table>
  <p class="hint">Measured on ${S.info.backend}. Each bar runs from 50% to 100% and the violet tick is the proven limit. Intervals are in Results.</p>`;
}

function renderUpgrade({ headline = '', grid = '', animate = false } = {}) {
  const way = WAYS[S.ways];
  const T = S.info.theory;
  const done = S.result && S.result.kind === way.machine;
  const series = way.series;
  let notes;
  let verdict = headline;
  let why = '';
  let key = '';
  let buttons;
  const odds = S.ways === 'six'
    ? 'Against six ways no machine gets a qubit past on both notes more than two times in three. A whole pair gets through about once in 26 tries.'
    : 'Against four ways the best press gets a qubit past on both notes three times in four. A whole pair gets through about once in ten tries.';
  if (done) {
    const r = S.result;
    const mark = r.wrong === 0 ? 'ACCEPTED' : 'FORGED';
    notes = `<div class="notes">
      ${figure('Note 1: the original, after the forger had it', { serial: S.note.serial, series, seals: sealsFor('a'), flaws: r.qubits.map((q) => !q.a), verdict: mark, label: `Original note, ${mark.toLowerCase()}`, animate })}
      ${figure('Note 2: the forger\'s copy', { serial: S.note.serial, series, seals: sealsFor('b'), flaws: r.qubits.map((q) => !q.b), verdict: mark, label: `Copied note, ${mark.toLowerCase()}`, animate })}
    </div>`;
    verdict = r.wrong === 0
      ? 'Accepted. The forger got both notes past your teller.'
      : `Forged. ${r.wrong} of the sixteen qubits gave your teller a wrong answer, so both notes were refused.`;
    why = odds;
    const keys = [KEY.right, KEY.wrong, KEY.lean];
    if (S.ways === 'six') keys.push(KEY.turn);
    key = `<ul class="key">${keys.map((k) => `<li>${k}</li>`).join('')}</ul>`;
    buttons = '<button class="do" id="again">Print a new note</button><button class="do quiet" id="hundred">Run a hundred notes</button>';
  } else {
    notes = `<div class="notes">${figure(S.ways === 'six' ? 'Your new note. Each seal now hides a qubit set one of six ways.' : 'Your note as it stands. Each seal hides a qubit set one of four ways.', { serial: S.note.serial, series, seals: hiddenSeals(), flaws: null, verdict: null, label: `A genuine ${S.ways}-way note with eight sealed qubits` })}</div>`;
    if (headline) why = odds;
    buttons = '<button class="do" id="go">Let the forger at it</button><button class="do quiet" id="hundred">Run a hundred notes</button>';
  }
  const t = S.tally[way.machine];
  const perQubit = rateOver(cellsOf(way.machine), (code) => code === 3);
  let tally = '';
  if (t.tries) {
    const r = wilson(t.passes, t.tries);
    tally = `Forged pairs past your teller so far on this note: <strong>${t.passes} of ${num(t.tries)}</strong> (${pct(r.p)}, ${between(r)}). Theory: ${pct(T.pair[S.ways] ** NOTE_QUBITS)}.<br>`;
  }
  tally += `Per qubit on this machine, the original and the copy both passed ${pct(perQubit.p)} of the time over ${num(perQubit.n)} shots (${between(perQubit)}). Limit: ${pct(T.pair[S.ways])}.`;
  const table = Object.fromEntries((S.info.tickets ?? []).map(([rate, four, six]) => [rate, { four, six }]));
  const buys = table[0.99] && table[0.95]
    ? `<h3>What six ways buys</h3>
      <p>A shorter note. On a machine whose genuine qubits pass 99% of the time, a ticket that is safe against the best forger needs ${table[0.99].four} qubits if it is four-way and ${table[0.99].six} if it is six-way. At 95% that is ${table[0.95].four} against ${table[0.95].six}. A machine between 83.3% and 85.4% can issue six-way tickets and no four-way ticket at all. The curve is under What it's for.</p>`
    : '';
  const late = animate ? ` after"${at(grid ? 1500 : REVEAL + 220)}` : '"';
  $('stage').innerHTML = `<header class="brief">
      <h2>The bank fights back</h2>
      <p class="goal">You run the bank now. Change the note so the forger's best machine does worse.</p>
    </header>
    <section class="counter">
      <div class="desk">
        <div class="guess-row heist-row"><p class="guess-label">How the bank sets each qubit</p><div class="choice wide" id="ways" role="group" aria-label="How the bank sets each qubit">
          <button data-w="four" aria-pressed="${S.ways === 'four'}">Four ways</button><button data-w="six" aria-pressed="${S.ways === 'six'}">Six ways</button>
        </div></div>
        <p class="hint">${S.ways === 'six' ? 'Straight, diagonal or circular. The forger has a third thing to get wrong.' : 'Straight or diagonal. This is the note from the first three acts.'}</p>
        ${notes}
        ${grid}
        <p class="verdict-line${late}>${verdict}</p>
        <p class="why${late}>${why}</p>
        <div class="row${late}>${buttons}</div>
        <div class="legend${late}>${key}</div>
        <p class="tally">${tally}</p>
      </div>
      <aside class="panel">
        <h3>How it works</h3>
        <ol class="steps">
          <li>The forger's best press was built for the note you have been printing, which sets each qubit one of four ways.</li>
          <li>Switch to six ways and print again. The best any machine can do falls from three qubits in four to two in three, and a forged pair gets through less than half as often.</li>
          <li>A real teller has to forgive a few wrong qubits, because real machines make mistakes. A second press is built to beat that teller. Six ways holds it back too, as the table below shows.</li>
        </ol>
      </aside>
    </section>
    <section class="below">
      <h3>Both notes against both tellers</h3>
      ${duel()}
      ${proofBlock()}
      ${buys}
    </section>`;

  document.querySelectorAll('#ways button').forEach((b) => b.addEventListener('click', () => {
    S.ways = b.dataset.w;
    newNote();
    renderUpgrade();
    document.querySelector(`#ways button[data-w="${S.ways}"]`)?.focus();
  }));
  $('go')?.addEventListener('click', () => guard(async () => {
    const result = await forgeOnce(way.machine, S.note.secret, S.guesses);
    document.querySelector('.note')?.classList.add('pressing');
    sound('whirr');
    await wait(760);
    S.result = { ...result, guesses: [] };
    if (!calm()) for (let i = 0; i < NOTE_QUBITS; i++) sound('tick', i * STEP);
    sound('thud', REVEAL);
    renderUpgrade({ animate: true });
    $('again')?.focus({ preventScroll: true });
  }));
  $('again')?.addEventListener('click', () => { newNote(); renderUpgrade(); $('go')?.focus(); });
  $('hundred')?.addEventListener('click', () => guard(() => hundred(way.machine, renderUpgrade)));
}

// ---------- Act three: the patient forger ----------

const riskAt = (n) => 1 - Math.cos(Math.PI / (2 * n)) ** (2 * n);
const visitChoices = () => cellsOf('patient', (c) => c.state === '0' && c.test === 'X').map((c) => c.visits).sort((a, b) => a - b);

async function probeOnce() {
  const code = await take(`patient:0:X:${S.visits}`);
  const t = (S.probes[S.visits] ??= { tries: 0, caught: 0 });
  t.tries++;
  if (code % 100) t.caught++;
  return code;
}

function riskChart() {
  const W = 640;
  const H = 250;
  const L = 52;
  const R = 16;
  const T = 14;
  const B = 40;
  const x = (n) => L + ((Math.log(n) - Math.log(2)) / (Math.log(1000) - Math.log(2))) * (W - L - R);
  const y = (p) => T + (1 - p / 0.8) * (H - T - B);
  let curve = '';
  for (let n = 2; n <= 1000; n = Math.ceil(n * 1.12)) curve += `${curve ? 'L' : 'M'}${x(n).toFixed(1)} ${y(riskAt(n)).toFixed(1)}`;
  let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chance of being caught against number of visits. Measured points sit on the theory curve, which falls towards zero.">`;
  for (const p of [0, 0.2, 0.4, 0.6, 0.8]) out += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}"/><text x="${L - 8}" y="${y(p) + 4}" text-anchor="end">${pct(p, 0)}</text>`;
  for (const n of [2, 4, 8, 16, 50, 200, 1000]) out += `<text x="${x(n)}" y="${H - B + 16}" text-anchor="middle">${num(n)}</text>`;
  out += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">visits to the teller for one qubit</text>`;
  out += `<path class="theory" d="${curve}"/><path class="axis" d="M${L} ${T}V${H - B}H${W - R}"/>`;
  for (const c of cellsOf('patient', (cell) => cell.state === '0' && cell.test === 'X')) {
    const r = rateOver([c], (code) => code % 100 > 0);
    out += `<line class="whisk" x1="${x(c.visits)}" x2="${x(c.visits)}" y1="${y(Math.min(0.8, r.hi))}" y2="${y(r.lo)}"/><circle class="dot" cx="${x(c.visits)}" cy="${y(Math.min(0.8, r.p))}" r="4"/>`;
  }
  out += `<line class="mark" x1="${x(1000)}" x2="${x(1000)}" y1="${y(0.12)}" y2="${y(riskAt(1000)) - 4}"/><text class="mark-text" x="${x(1000) - 6}" y="${y(0.14)}" text-anchor="end">1,000 visits: caught ${pct(riskAt(1000), 2)} of the time</text>`;
  return `${out}</svg>`;
}

function freeRows() {
  const rows = [];
  const lucky = S.cells.get('patient:+:X:6');
  const kicked = S.cells.get('patient:-:X:4');
  if (lucky) {
    const caught = rateOver([lucky], (code) => code % 100 > 0);
    const one = rateOver([lucky], (code) => code >= 100);
    rows.push(`<tr><td>Diagonal, plus</td><td class="num">${caught.k} of ${num(caught.n)}</td><td class="num">${one.k} of ${num(one.n)}</td><td>The probe turns all the way to 1. The forger now knows this qubit, and the teller saw nothing.</td></tr>`);
  }
  if (kicked) {
    const caught = rateOver([kicked], (code) => code % 100 > 0);
    const one = rateOver([kicked], (code) => code >= 100);
    rows.push(`<tr><td>Diagonal, minus</td><td class="num">${caught.k} of ${num(caught.n)}</td><td class="num">${one.k} of ${num(one.n)}</td><td>Each touch undoes the last, so the probe ends at 0. A second probe built for minus reads it for free.</td></tr>`);
  }
  if (!rows.length) return '';
  return `<h3>When the probe suits the qubit</h3>
    <p>The risk above comes from using a diagonal probe on a straight qubit. On a diagonal qubit the same probe is never caught.</p>
    <table class="ledger"><thead><tr><th>Secret qubit</th><th class="num">Caught</th><th class="num">Probe read 1</th><th>What happened</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

// The whole-note heist. For each seal the forger tries up to three probes and
// stops as soon as one comes back 1, which names the qubit. Any failed check
// along the way ends the heist.
const HEIST_TESTS = [['X', '+'], ['Z', '0'], ['-Z', '1']];
const hasHeist = () => S.cells.has('patient:-:-Z:8') && S.cells.has('reprint:0:0');
const heistChoices = () => [4, 8, 12].filter((n) => S.cells.has(`patient:-:-Z:${n}`));

async function heistOnce(secret, visits) {
  const seals = [];
  let caughtAt = -1;
  let trips = 0;
  for (let i = 0; i < NOTE_QUBITS && caughtAt < 0; i++) {
    let belief = '-';
    let caught = false;
    for (const [test, names] of HEIST_TESTS) {
      const code = await take(`patient:${secret[i]}:${test}:${visits}`);
      const caughtOn = code % 100;
      trips += caughtOn || visits;
      if (caughtOn) { caught = true; break; }
      if (code >= 100) { belief = names; break; }
    }
    if (caught) caughtAt = i;
    seals.push(caught ? { caught: true } : { belief });
  }
  let copies = null;
  if (caughtAt < 0) {
    copies = [];
    for (let c = 0; c < 2; c++) {
      const pass = [];
      for (let i = 0; i < NOTE_QUBITS; i++) pass.push((await take(`reprint:${secret[i]}:${seals[i].belief}`)) === 1);
      copies.push(pass);
    }
  }
  const won = caughtAt < 0 && copies.every((pass) => pass.every(Boolean));
  const t = (S.heists[visits] ??= { tries: 0, wins: 0 });
  t.tries++;
  if (won) t.wins++;
  return { visits, seals, caughtAt, copies, won, trips };
}

function heistNotes(h, animate) {
  const seals = S.note.secret.map((state, i) => {
    const seal = h.seals[i];
    if (!seal) return { shape: 'hidden' };
    return seal.caught ? { state, shape: 'open', mark: 'fail' } : { state: seal.belief, shape: 'open', mark: 'pass' };
  });
  const flaws = S.note.secret.map((_, i) => Boolean(h.seals[i]?.caught));
  const stampAt = (h.caughtAt < 0 ? NOTE_QUBITS : h.caughtAt + 1) * STEP + 200;
  let out = figure(h.caughtAt < 0 ? 'The original, read seal by seal without the teller noticing' : 'The original, seized at the counter', {
    serial: S.note.serial, seals, flaws, verdict: h.caughtAt < 0 ? null : 'SEIZED', animate, stampAt,
    label: h.caughtAt < 0 ? 'Original note with all eight qubits read' : `Original note, seized at seal ${h.caughtAt + 1}`,
  });
  if (h.copies) {
    h.copies.forEach((pass, c) => {
      const ok = pass.every(Boolean);
      out += figure(`Copy ${c + 1}, printed from what the forger learned`, {
        serial: S.note.serial,
        seals: S.note.secret.map((state, i) => ({ state: h.seals[i].belief, shape: 'open', mark: pass[i] ? 'pass' : 'fail' })),
        flaws: pass.map((x) => !x), verdict: ok ? 'ACCEPTED' : 'FORGED', animate, stampAt: stampAt + 500 + c * 350,
        label: `Printed copy ${c + 1}, ${ok ? 'accepted' : 'refused'}`,
      });
    });
  }
  return `<div class="notes">${out}</div>`;
}

function closeUp({ headline, grid, animate }) {
  const choices = visitChoices();
  if (!choices.includes(S.visits)) S.visits = choices[Math.min(1, choices.length - 1)];
  const t = S.probes[S.visits];
  let stamps = '';
  let late = animate && grid ? ` after"${at(1500)}` : '"';
  if (S.probe !== null) {
    const caughtOn = S.probe % 100;
    const last = caughtOn || S.visits;
    if (animate) late = ` after"${at(last * 110 + 120)}`;
    for (let k = 1; k <= last; k++) {
      const when = animate ? at((k - 1) * 110) : '';
      stamps += `<span class="visit${k === caughtOn ? ' caught' : ''} stamped"${when} title="Visit ${k}: ${k === caughtOn ? 'the check failed' : 'the note passed'}">${visitMark(k === caughtOn)}</span>`;
    }
    if (!headline) {
      headline = caughtOn
        ? `Caught on visit ${caughtOn} of ${S.visits}. The touch disturbed the qubit and the teller's check failed.`
        : `${S.visits} visits, ${S.visits} clean checks. The probe came back at 0, which tells the forger this qubit is not diagonal-plus.`;
    }
  }
  let tally = `Theory at ${S.visits} visits: caught ${pct(riskAt(S.visits))} of the time.`;
  if (t) {
    const r = wilson(t.caught, t.tries);
    tally = `Caught <strong>${t.caught} of ${num(t.tries)}</strong> probes at ${S.visits} visits (${pct(r.p)}, ${between(r)}). ${tally}`;
  }
  return `<p class="guess-label">How many times should the forger visit the teller?</p>
    <div class="choice" id="visits" role="group" aria-label="Visits to the teller">${choices.map((n) => `<button data-n="${n}" aria-pressed="${n === S.visits}">${n}</button>`).join('')}</div>
    <div class="row"><button class="do quiet" id="probe">Probe one qubit</button><button class="do quiet" id="probes">Probe a hundred times</button></div>
    <div class="visits" aria-hidden="true">${stamps}</div>
    ${grid}
    <p class="verdict-line${late}>${headline}</p>
    <ul class="key"><li>${visitMark(false)} a visit the teller passed</li><li class="caught">${visitMark(true)} the check failed and the forger was caught</li></ul>
    <p class="tally${late}>${tally}</p>
    ${riskChart()}
    <p class="hint">Chance of being caught on one risky probe, against the number of visits. Dots are this machine's results with 95% intervals, and the dashed line is theory. More than ${choices[choices.length - 1]} visits needs more qubits than a browser can simulate, so the right-hand side is theory only.</p>`;
}

function renderPatient({ headline = '', grid = '', animate = false, part = 'heist' } = {}) {
  const heist = hasHeist();
  const mine = (key) => (part === key ? { headline, grid, animate } : { headline: '', grid: '', animate: false });
  let desk = '';
  let how;
  if (heist) {
    const options = heistChoices();
    if (!options.includes(S.heistVisits)) S.heistVisits = options[Math.min(1, options.length - 1)];
    const N = S.heistVisits;
    const odds = S.info.theory.heist ?? {};
    const h = S.heist;
    const m = mine('heist');
    let notes;
    let verdict = m.headline;
    let why = '';
    let late = '"';
    if (h && !m.grid) {
      notes = heistNotes(h, m.animate);
      const landed = (h.caughtAt < 0 ? NOTE_QUBITS : h.caughtAt + 1) * STEP + (h.copies ? 1300 : 500);
      if (m.animate) late = ` after"${at(landed)}`;
      if (h.won) {
        verdict = `A clean getaway. You read all eight qubits in ${num(h.trips)} visits, and the teller accepted both copies.`;
        why = 'You still hold the original, and you know the note exactly, so you could print a thousand more. Neither of the first two machines could do that even once.';
      } else if (h.caughtAt >= 0) {
        verdict = `Caught at seal ${h.caughtAt + 1}. A probe disturbed the qubit, the teller's check failed, and the note was seized.`;
        why = `With ${N} visits per probe a heist gets away about ${pct(odds[N] ?? 0, 0)} of the time. More visits make each touch lighter.`;
      } else {
        verdict = 'You read the note, but noise spoiled what you learned and the teller refused a copy.';
      }
    } else {
      notes = `<div class="notes">${figure('A genuine banknote. This time the forger wants to read all eight seals.', { serial: S.note.serial, seals: hiddenSeals(), flaws: null, verdict: null, label: 'A genuine note with eight sealed qubits' })}</div>`;
      if (m.grid) { late = m.animate ? ` after"${at(1500)}` : '"'; why = `Theory at ${N} visits: ${pct(odds[N] ?? 0)} of heists get away. At a thousand visits it is ${pct(odds['1000'] ?? 0, 0)}.`; }
    }
    const t = S.heists[N];
    let tally = `Theory at ${N} visits per probe: ${pct(odds[N] ?? 0)} of heists get away clean. At a thousand visits: ${pct(odds['1000'] ?? 0, 0)}.`;
    if (t) {
      const r = wilson(t.wins, t.tries);
      tally = `Clean getaways at ${N} visits: <strong>${t.wins} of ${num(t.tries)}</strong> (${pct(r.p)}, ${between(r)}). ${tally}`;
    }
    desk = `${notes}
      <div class="guess-row heist-row"><p class="guess-label">Visits per probe</p><div class="choice" id="heist-visits" role="group" aria-label="Visits to the teller for each probe">${options.map((n) => `<button data-n="${n}" aria-pressed="${n === N}">${n}</button>`).join('')}</div></div>
      ${m.grid}
      <p class="verdict-line${late}>${verdict}</p>
      <p class="why${late}>${why}</p>
      <div class="row${late}><button class="do" id="heist">${h && !m.grid ? 'Try again with a new note' : 'Start the heist'}</button><button class="do quiet" id="heists">Run a hundred heists</button></div>
      <p class="tally">${tally}</p>`;
    how = `<li>This only works if the teller hands a good note back after checking it.</li>
      <li>The forger touches one qubit very lightly, sends the note for a check, and repeats. A light touch rarely spoils the note, and enough touches name the qubit.</li>
      <li>One failed check and the note is seized. If all eight seals are read, the forger prints copies the teller cannot tell from the original.</li>
      <li>More visits mean a lighter touch and a safer heist. Four physicists published this attack in 2014.</li>`;
  } else {
    desk = `<p>The full heist takes dozens of small jobs, so it runs on the ideal simulators only. On this machine you can still probe one qubit below.</p>`;
    how = `<li>This only works if the teller hands a good note back after checking it.</li>
      <li>On each visit the forger touches the qubit very lightly, then sends the note for a check. A light touch rarely spoils the note.</li>
      <li>More visits mean a lighter touch each time, and enough touches add up to knowing the qubit. Four physicists published this attack in 2014.</li>`;
  }
  $('stage').innerHTML = `<header class="brief">
      <h2>The patient forger</h2>
      <p class="goal">A new job: read all eight sealed qubits without the teller noticing, then print as many copies as you like.</p>
    </header>
    <section class="counter">
      <div class="desk">${desk}</div>
      <aside class="panel">
        <h3>How it works</h3>
        <ol class="steps">${how}</ol>
      </aside>
    </section>
    <section class="below">
      <h3>One qubit up close</h3>
      <p>Here is a single straight qubit and the one probe that puts it at risk. This is where the heist's odds come from.</p>
      ${closeUp(mine('close'))}
      ${freeRows()}
      <h3>What the bank has to do</h3>
      <p>Never hand a checked note back. If the teller swaps every note it checks for a freshly printed one, the forger gets one look and the limits from acts one and two hold again.</p>
    </section>`;

  document.querySelectorAll('#heist-visits button').forEach((b) => b.addEventListener('click', () => {
    S.heistVisits = Number(b.dataset.n);
    S.heist = null;
    newNote();
    renderPatient();
    document.querySelector(`#heist-visits button[data-n="${S.heistVisits}"]`)?.focus();
  }));
  $('heist')?.addEventListener('click', () => guard(async () => {
    newNote();
    S.heist = null;
    renderPatient();
    const h = await heistOnce(S.note.secret, S.heistVisits);
    const opened = h.caughtAt < 0 ? NOTE_QUBITS : h.caughtAt + 1;
    if (!calm()) for (let i = 0; i < opened; i++) sound('tick', i * STEP);
    sound('thud', opened * STEP + (h.copies ? 700 : 200));
    S.heist = h;
    renderPatient({ animate: true, part: 'heist' });
    $('heist')?.focus({ preventScroll: true });
  }));
  $('heists')?.addEventListener('click', () => guard(async () => {
    const wins = [];
    for (let n = 0; n < 100; n++) {
      const secret = Array.from({ length: NOTE_QUBITS }, () => STATES[pick(4)]);
      wins.push((await heistOnce(secret, S.heistVisits)).won);
    }
    const got = wins.filter(Boolean).length;
    S.heist = null;
    newNote();
    sound('whirr');
    renderPatient({
      animate: true, part: 'heist',
      grid: slips(wins, `${got} of 100 heists got away clean`),
      headline: `${got} of those 100 heists got away clean. Filled slips are the getaways.`,
    });
  }));
  document.querySelectorAll('#visits button').forEach((b) => b.addEventListener('click', () => {
    S.visits = Number(b.dataset.n);
    S.probe = null;
    renderPatient({ part: 'close' });
    document.querySelector(`#visits button[data-n="${S.visits}"]`)?.focus();
  }));
  $('probe').addEventListener('click', () => guard(async () => {
    S.probe = await probeOnce();
    const caughtOn = S.probe % 100;
    const last = caughtOn || S.visits;
    if (!calm()) for (let k = 0; k < last - (caughtOn ? 1 : 0); k++) sound('tick', k * 110);
    if (caughtOn) sound('thud', (last - 1) * 110);
    renderPatient({ animate: true, part: 'close' });
    $('probe')?.focus({ preventScroll: true });
  }));
  $('probes').addEventListener('click', () => guard(async () => {
    const clean = [];
    for (let n = 0; n < 100; n++) clean.push((await probeOnce()) % 100 === 0);
    const caught = clean.filter((ok) => !ok).length;
    S.probe = null;
    sound('whirr');
    renderPatient({
      animate: true, part: 'close',
      grid: slips(clean, `${caught} of 100 probes were caught`),
      headline: `The teller caught ${caught} of those 100 probes. Filled slips are the ones that got away.`,
    });
  }));
}

// ---------- The ledger ----------

function ledgerRows() {
  const rows = [];
  const add = (key, label, cells, hit, theory, scale = 1) => {
    if (!cells.length) return;
    const r = rateOver(cells, hit);
    rows.push({ key, label, theory, ...(scale === 1 ? r : wilson(r.k, r.n * scale)) });
  };
  add('honest', 'A genuine qubit passes the teller', cellsOf('honest'), (c) => c === 1, 1);
  add('photocopier', 'Photocopier: original and copy both pass', cellsOf('photocopier'), (c) => c === 3, S.info.theory.photocopier);
  const T = S.info.theory;
  // One copy on its own: the original and the copy are both counted.
  const alone = (key, label, kind, theory) => {
    const cells = cellsOf(kind);
    if (!cells.length) return;
    const a = rateOver(cells, (c) => (c & 1) === 1);
    const b = rateOver(cells, (c) => (c & 2) === 2);
    rows.push({ key, label, theory, ...wilson(a.k + b.k, a.n + b.n) });
  };
  add('press', 'Four-way note, best press: original and copy both pass', cellsOf('press'), (c) => c === 3, T.press);
  alone('single', 'Four-way note, best press: one copy on its own passes', 'press', T.single);
  add('lenient', 'Four-way note, second press: original and copy both pass', cellsOf('lenient'), (c) => c === 3, T.lenient_pair);
  alone('lenient-single', 'Four-way note, second press: one copy on its own passes', 'lenient', T.lenient);
  add('universal', 'Six-way note, best machine: original and copy both pass', cellsOf('universal'), (c) => c === 3, T.universal);
  alone('universal-single', 'Six-way note, best machine: one copy on its own passes', 'universal', T.floor.six);
  for (const c of cellsOf('patient', (cell) => cell.state === '0' && cell.test === 'X').sort((p, q) => p.visits - q.visits)) {
    add(`patient-${c.visits}`, `Patient forger caught on one risky probe, ${c.visits} visits`, [c], (code) => code % 100 > 0, riskAt(c.visits));
  }
  for (const [visits, t] of Object.entries(S.heists)) {
    rows.push({ key: `heist-${visits}`, label: `Whole-note heists that got away, ${visits} visits per probe`, theory: S.info.theory.heist?.[visits] ?? 0, ...wilson(t.wins, t.tries) });
  }
  return rows;
}

function ruler(rows) {
  const W = 640;
  const L = 16;
  const R = 16;
  const x = (p) => +(L + ((p - 0.5) / 0.5) * (W - L - R)).toFixed(1);
  const short = {
    honest: 'genuine qubit', photocopier: 'photocopier, both', press: 'best press, both', universal: 'six-way note, both',
    'lenient-single': 'second press, one copy', 'universal-single': 'six-way note, one copy',
  };
  const shown = rows.filter((r) => short[r.key]);
  const foot = 64 + shown.length * 24;
  const H = foot + 62;
  let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="A ruler from 50 to 100 percent showing each measured pass rate against the proven limits.">`;
  out += `<path class="axis" d="M${L} 40H${W - R}"/>`;
  for (let p = 0.5; p <= 1.001; p += 0.1) out += `<line class="axis" x1="${x(p)}" x2="${x(p)}" y1="34" y2="46"/><text x="${x(p)}" y="26" text-anchor="middle">${pct(p, 0)}</text>`;
  const T = S.info.theory;
  const limits = [
    [T.photocopier, 'photocopier 62.5%', 0, 'start'],
    [T.pair.six, 'six-way pair 66.7%', 14, 'start'],
    [T.pair.four, 'four-way pair 75%', 28, 'start'],
    [T.floor.six, 'six-way copy 83.3%', 42, 'end'],
    [T.floor.four, 'four-way copy 85.4%', 0, 'start'],
  ];
  for (const [p, label, drop, anchor] of limits) {
    out += `<line class="mark" x1="${x(p)}" x2="${x(p)}" y1="40" y2="${foot + drop + 4}" stroke-dasharray="3 3"/><text class="mark-text" x="${x(p) + (anchor === 'end' ? -4 : 4)}" y="${foot + drop + 14}" text-anchor="${anchor}">${label}</text>`;
  }
  shown.forEach((r, i) => {
    const yy = 66 + i * 24;
    const left = r.p > 0.8;
    const tx = left ? x(Math.max(0.5, r.lo)) - 10 : x(Math.min(1, r.hi)) + 10;
    out += `<line class="whisk" x1="${x(Math.max(0.5, r.lo))}" x2="${x(Math.min(1, r.hi))}" y1="${yy}" y2="${yy}"/><circle class="dot" cx="${x(Math.max(0.5, r.p))}" cy="${yy}" r="4.5"/><text class="label" x="${tx}" y="${yy + 4}" text-anchor="${left ? 'end' : 'start'}">${short[r.key]} ${pct(r.p)}</text>`;
  });
  return `${out}</svg>
    <p class="hint">Dots are this machine's results with their 95% intervals. Dashed lines are the proven limits: the most a forger can score against each note.</p>`;
}

// Security against note length. A pair of forged notes passes only if every
// qubit passes, so the chance falls by the same factor with each added qubit.
function lengthChart(rows) {
  const lines = [
    ['photocopier', 'photocopier', S.info.theory.photocopier],
    ['press', 'best press', S.info.theory.press],
  ].map(([key, name, theory]) => ({ name, theory, row: rows.find((r) => r.key === key) })).filter((l) => l.row);
  if (!lines.length) return '';
  const W = 640;
  const H = 300;
  const L = 96;
  const R = 92;
  const T = 16;
  const B = 44;
  const lengths = [1, 2, 4, 8, 16, 32, 64];
  const x = (n) => L + (Math.log2(n) / 6) * (W - L - R);
  const y = (p) => T + (Math.min(14, -Math.log10(p)) / 14) * (H - T - B);
  let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chance that a forged pair of notes passes, against note length, on a logarithmic scale. Both lines fall steadily; at 64 qubits the best press passes about once in a hundred million tries.">`;
  for (const [power, label] of [[0, 'every time'], [3, '1 in a thousand'], [6, '1 in a million'], [9, '1 in a billion'], [12, '1 in a trillion']]) {
    out += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(10 ** -power)}" y2="${y(10 ** -power)}"/><text x="${L - 8}" y="${y(10 ** -power) + 4}" text-anchor="end">${label}</text>`;
  }
  for (const n of lengths) out += `<text x="${x(n)}" y="${H - B + 16}" text-anchor="middle">${n}</text>`;
  out += `<text x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle">qubits in the note</text>`;
  out += `<path class="axis" d="M${L} ${T}V${H - B}H${W - R}"/>`;
  for (const { name, theory, row } of lines) {
    const path = (p) => lengths.map((n, i) => `${i ? 'L' : 'M'}${x(n).toFixed(1)} ${y(p ** n).toFixed(1)}`).join('');
    out += `<path class="theory" d="${path(theory)}"/><path class="whisk" fill="none" d="${path(row.p)}"/>`;
    for (const n of lengths) out += `<circle class="dot" cx="${x(n)}" cy="${y(row.p ** n).toFixed(1)}" r="3.5"/>`;
    out += `<text class="label" x="${x(64) + 8}" y="${y(row.p ** 64) + 4}">${name}</text>`;
  }
  return `<h3>Longer notes</h3>${out}</svg>
    <p class="hint">Chance that a forged pair passes, against the length of the note. Dots use this machine's measured rate for one qubit, raised to the note's length, and the dashed lines are theory. Every added qubit cuts the forger's odds by the same factor, so a 64-qubit note stops the best press about 99,999,999 times in 100 million.</p>`;
}

function evidence(rows) {
  return {
    project: 'Legal Tender',
    version: S.info.version,
    backend: S.info.backend,
    backend_module: S.info.module,
    mode: S.kind === 'remote' ? 'one plate per run' : 'all plates',
    saved_at: new Date().toISOString(),
    bit_order: 'Counts keys list qubit 0 first.',
    summary: rows.map((r) => ({ measure: r.label, hits: r.k, shots: r.n, rate: r.p, interval_95: [r.lo, r.hi], theory: r.theory })),
    proof: S.info.proof,
    play: { photocopier: S.tally.photocopier, press: S.tally.press, six_way: S.tally.universal, patient: S.probes, heists: S.heists },
    plates: S.sheets.map((s) => ({ plate: s.plate, shots: s.shots, seconds: s.seconds, qubits: s.qubits, depth: s.depth, gates: s.gates, cells: s.cells, counts: s.counts })),
  };
}

function renderLedger() {
  const rows = ledgerRows();
  const honest = rows.find((r) => r.key === 'honest');
  let margin = '';
  if (honest) {
    const points = (gap) => `${gap >= 0 ? '+' : '−'}${(100 * Math.abs(gap)).toFixed(1)} points`;
    const floor = S.info.theory.floor;
    margin = `<p class="big">${points(honest.p - floor.six)}</p>
      <p>That is this machine's forgery margin on a six-way note: how far a genuine qubit's pass rate (${pct(honest.p)}) sits above ${pct(floor.six)}, the most one forged copy can score. On a four-way note a forged copy can reach ${pct(floor.four)}, so the margin shrinks to ${points(honest.p - floor.four)}. A machine with a small margin needs long notes, and a machine below the floor can't issue safe notes at all.</p>`;
    if (S.kind === 'remote') {
      margin += `<p class="hint">A caution about the genuine qubit on this machine. IonQ's service merges the bank's printing and the teller's check into nothing before the circuit runs, so that figure shows the merge and says nothing about how well the machine keeps a qubit. The forging circuits can't be merged away, so their rates do carry this machine's noise.</p>`;
    }
  }
  const body = rows.map((r) => `<tr><td>${r.label}</td><td class="num">${num(r.k)} of ${num(r.n)}</td><td class="num">${pct(r.p)}</td><td class="num">${pct(r.lo)} to ${pct(r.hi)}</td><td class="num">${pct(r.theory)}</td></tr>`).join('');
  const plates = S.sheets.map((s) => `<tr><td>${s.plate}</td><td class="num">${s.qubits}</td><td class="num">${s.depth}</td><td class="num">${num(s.shots)}</td><td class="num">${s.seconds} s</td></tr>`).join('');
  $('stage').innerHTML = `<section class="card">
    <h2>Results on this machine</h2>
    <p>Everything measured on <strong>${S.info.backend}</strong> during this run, next to what an ideal machine would give. Intervals are 95% Wilson intervals.</p>
    ${margin}
    ${ruler(rows)}
    ${lengthChart(rows)}
    <table class="ledger"><caption>Measured against theory</caption><thead><tr><th>What was measured</th><th class="num">Hits</th><th class="num">Rate</th><th class="num">95% interval</th><th class="num">Theory</th></tr></thead><tbody>${body}</tbody></table>
    <table class="ledger"><caption>Plates printed</caption><thead><tr><th>Plate</th><th class="num">Qubits</th><th class="num">Depth</th><th class="num">Shots</th><th class="num">Time</th></tr></thead><tbody>${plates}</tbody></table>
    <div class="row"><button class="do" id="save">Save the evidence</button></div>
    <p class="hint">The evidence file holds the raw counts for every plate, the circuits' sizes, the machine's name and the numbers above, so anyone can check them.</p>
    <label for="evidence" class="sr">Evidence record</label>
    <textarea id="evidence" readonly hidden></textarea>
  </section>`;
  $('save').addEventListener('click', () => guard(async () => {
    const text = JSON.stringify(evidence(rows), null, 1);
    const box = $('evidence');
    box.hidden = false;
    box.value = text;
    const res = await call('export_evidence', text);
    say(res.sent ? 'The evidence file is in the console below.' : 'Copy the record from the box to save it.');
    box.focus();
    box.select();
  }));
}

// ---------- The ticket office ----------

// Ticket length against machine quality, for both notes. Each curve climbs
// without limit as the machine nears that note's floor.
function ticketChart(here) {
  const table = S.info.tickets ?? [];
  if (!table.length) return '';
  const floor = S.info.theory.floor;
  const W = 640;
  const H = 320;
  const L = 60;
  const R = 22;
  const T = 18;
  const B = 46;
  const x = (p) => +(L + ((p - 0.82) / 0.18) * (W - L - R)).toFixed(1);
  const y = (n) => +(T + (1 - (Math.log(n) - Math.log(50)) / (Math.log(1600) - Math.log(50))) * (H - T - B)).toFixed(1);
  let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Shortest safe ticket against how often a genuine qubit passes. The six-way curve lies below the four-way curve everywhere, and each climbs steeply as the machine nears that note's floor.">`;
  for (const n of [50, 100, 200, 400, 800, 1600]) out += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(n)}" y2="${y(n)}"/><text x="${L - 8}" y="${y(n) + 4}" text-anchor="end">${num(n)}</text>`;
  for (const p of [0.85, 0.9, 0.95, 1]) out += `<text x="${x(p)}" y="${H - B + 16}" text-anchor="middle">${pct(p, 0)}</text>`;
  out += `<text x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle">how often a genuine qubit passes on the machine</text>`;
  out += `<text transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">qubits in the shortest safe ticket</text>`;
  out += `<path class="axis" d="M${L} ${T}V${H - B}H${W - R}"/>`;
  for (const [note, col, label] of [['four', 1, 'four-way'], ['six', 2, 'six-way']]) {
    const points = table.filter((row) => row[col]).map((row) => [row[0], row[col]]);
    out += `<line class="mark" x1="${x(floor[note])}" x2="${x(floor[note])}" y1="${T}" y2="${H - B}" stroke-dasharray="3 3"/>`;
    out += `<text class="mark-text" x="${x(floor[note]) + 5}" y="${T + (note === 'four' ? 26 : 11)}">${label} floor ${pct(floor[note])}</text>`;
    out += `<path class="${note === 'six' ? 'curve' : 'curve faint'}" d="${points.map(([p, n], i) => `${i ? 'L' : 'M'}${x(p)} ${y(n)}`).join('')}"/>`;
    for (const [p, n] of points) out += `<circle class="${note === 'six' ? 'dot' : 'dot faint'}" cx="${x(p)}" cy="${y(n)}" r="3"/>`;
    // Each curve is named at its top end, where the two are furthest apart.
    const [pEnd, nEnd] = points[points.length - 1];
    out += `<text class="label" x="${x(pEnd) + (note === 'four' ? 8 : -8)}" y="${y(nEnd) + (note === 'four' ? 2 : 4)}" text-anchor="${note === 'four' ? 'start' : 'end'}">${label} note</text>`;
  }
  if (here >= 0.83 && here <= 1) out += `<line class="here" x1="${x(here)}" x2="${x(here)}" y1="${T + 44}" y2="${H - B}"/><text class="label" x="${x(here)}" y="${T + 38}" text-anchor="end">this machine</text>`;
  return `${out}</svg>
    <p class="hint">Each point is the shortest ticket that turns a genuine holder away less than 1 time in 100 and lets a forged copy through less than 1 time in 1,000,000. The dashed lines are the two floors. Left of a floor, no ticket of that kind is safe at any length.</p>`;
}

function renderTicket() {
  const rows = ledgerRows();
  const honest = rows.find((r) => r.key === 'honest');
  const measured = honest?.p ?? 0.99;
  const h = (S.ticket?.honest ?? measured).toFixed(3);
  let answer = '';
  const t = S.ticket?.result;
  if (t) {
    const pane = (x, name) => (x.ok
      ? `<div class="pane"><p class="pane-title">${name}</p><p class="big">${num(x.n)} qubits</p><p>Accepted when ${num(x.need)} or more pass. A genuine ticket is turned away ${(1000 * x.honest_reject).toFixed(1)} times in a thousand.</p></div>`
      : `<div class="pane"><p class="pane-title">${name}</p><p class="big">None</p><p>${x.reason}</p></div>`);
    let saving = '';
    if (t.four.ok && t.six.ok) saving = `<p class="verdict-line">Six ways saves ${num(t.four.n - t.six.n)} qubits on this machine, ${pct(1 - t.six.n / t.four.n, 0)} of the ticket.</p>`;
    else if (t.six.ok) saving = '<p class="verdict-line">Only the six-way ticket can be made safe on this machine.</p>';
    answer = `<div class="panes">${pane(t.four, 'Four-way ticket')}${pane(t.six, 'Six-way ticket')}</div>${saving}`;
  }
  $('stage').innerHTML = `<section class="card">
    <h2>What it's for: tickets nobody can copy</h2>
    <p>Quantum banknotes need qubits that keep for days, and today's last for seconds. A nearer use is a ticket or a pass that is checked soon after it is issued. A team proposed exactly that in 2012.</p>
    <p>A real machine gets some genuine qubits wrong, so the teller has to forgive a few. Forgive too many and a forged copy gets through. This counter finds the shortest ticket that is safe, for a machine of any quality, in both kinds of note.</p>
    <div class="row">
      <label for="honest">A genuine qubit passes</label><input id="honest" type="number" min="0.5" max="1" step="0.001" value="${h}">
      <button class="do" id="work">Work it out</button>
    </div>
    <p class="hint">The box starts at what this run measured on ${S.info.backend}. Type any rate between 0.5 and 1.</p>
    ${answer}
    <h3>Which note, and how long</h3>
    ${ticketChart(S.ticket?.honest ?? measured)}
  </section>`;
  $('work').addEventListener('click', () => guard(async () => {
    const honestRate = Math.max(0.5, Math.min(1, Number($('honest').value) || 0));
    say('Counting qubits.');
    const result = await call('tickets', honestRate);
    S.ticket = { honest: honestRate, result };
    say('');
    renderTicket();
  }));
}

// ---------- Navigation ----------

function renderNav() {
  const locked = S.kind === 'remote' && S.sheets.length > 0;
  $('acts').innerHTML = VIEWS.map(([id, n, title]) => {
    const off = locked && !has(id);
    return `<button data-view="${id}"${n ? '' : ' class="tool"'} aria-current="${S.view === id}"${off ? ' disabled title="This machine prints one plate per run."' : ''}>${n ? `<span class="n">${n}</span>` : ''}${title}</button>`;
  }).join('');
  document.querySelectorAll('#acts button').forEach((b) => b.addEventListener('click', () => guard(() => show(b.dataset.view))));
}

async function show(view) {
  if (!(S.kind === 'remote' && has(view))) await ensureAct(view);
  S.view = view;
  renderNav();

  if (view === 'photocopier' || view === 'press') {
    if (!S.note || S.note.view !== view) newNote();
    renderCopy(view);
  } else if (view === 'patient') {
    if (!S.note || S.note.view !== view) newNote();
    renderPatient();
  } else if (view === 'upgrade') {
    if (!S.note || S.note.view !== view || S.note.ways !== S.ways) newNote();
    renderUpgrade();
  } else if (view === 'ledger') {
    renderLedger();
  } else {
    renderTicket();
  }
}

// What this run measured, written to Qollab's console so the numbers can be
// read and copied without opening the Results tab.
function report() {
  const rows = ledgerRows();
  console.log(`Results on ${S.info.backend}, ${num(S.info.shots)} shots per cell:`);
  for (const r of rows) {
    console.log(`  ${r.label}: ${num(r.k)} of ${num(r.n)} = ${pct(r.p)} (95% interval ${pct(r.lo)} to ${pct(r.hi)}), theory ${pct(r.theory)}`);
  }
  console.log(`RESULTS ${JSON.stringify({ backend: S.info.backend, mode: S.kind, shots: S.info.shots, rows: rows.map((r) => ({ key: r.key, k: r.k, n: r.n })) })}`);
  const proof = S.info.proof;
  if (proof?.ok) {
    console.log('Proof worked out on this page, the limit for any machine against the best circuit here:');
    for (const l of proof.lines) console.log(`  ${l.note}-way note, ${l.teller} teller: limit ${(100 * l.limit).toFixed(6)}%, ${l.machine} circuit ${(100 * l.reached).toFixed(6)}%`);
  } else if (proof) {
    console.log(`The proof could not be worked out on this machine: ${proof.error}`);
  }
  return rows;
}

async function guard(work) {
  if (S.busy) return;
  S.busy = true;
  try {
    await work();
  } catch (err) {
    say(`${err?.message ?? err} This page never invents results to fill a gap.`, true);
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
inks();
wireSound();
await guard(async () => {
  let hint = '';
  try { hint = /ionq/i.test(String(BACKEND?.name ?? '')) ? 'remote' : ''; } catch { hint = ''; }
  let name = '';
  try { name = String(BACKEND?.name ?? ''); } catch { name = ''; }
  try {
    S.info = await call('describe', BACKEND, hint);
  } catch (err) {
    console.log(`Python could not be handed the backend (${err?.message ?? err}). Describing it by name.`);
    S.info = await call('describe_named', name, hint);
  }
  S.kind = S.info.kind;
  $('machine').textContent = `Machine: ${S.info.backend}`;
  newNote();
  renderNav();
  // Print what the first acts need while the run is starting. An IonQ backend
  // takes one job per run, so there the one job is the proof sheet.
  if (S.kind === 'remote') {
    $('machine').textContent = `Machine: ${S.info.backend}. It takes one job per run, so acts one and three need the built-in simulator.`;
    await ensureAct('press');
  } else {
    await ensureAct('press');
    await ensureAct('photocopier');
    await ensureAct('upgrade');
    if (S.kind === 'local') await ensureAct('patient');
  }
  const rows = report();
  try {
    const sent = await call('export_evidence', JSON.stringify(evidence(rows), null, 1));
    if (sent.sent) console.log('The evidence file for this run is in the console.');
  } catch { /* the Results tab can still save it */ }
  await show(S.kind === 'remote' ? 'press' : 'photocopier');
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
  const step = async (name, selector, ms, read, expect) => {
    const el = document.querySelector(selector);
    if (!el || el.disabled) { console.log(`SELFCHECK skipped: ${name} (not on this machine)`); return; }
    el.click();
    await pause(ms);
    const seen = text(read);
    if (expect.test(seen) && !$('status').classList.contains('bad')) { ok++; console.log(`SELFCHECK ok: ${name}: ${seen.slice(0, 110)}`); }
    else { failed++; console.log(`SELFCHECK FAILED: ${name}: saw "${seen.slice(0, 110)}", status "${text('#status')}"`); }
  };
  const view = (id) => `#acts button[data-view="${id}"]`;
  await step('open the photocopier', view('photocopier'), 900, '#stage h2', /photocopier/i);
  await step('flip a guess switch', '.guesses button[data-i="2"]', 300, '.guesses button[data-i="2"]', /^$/);
  await step('run the photocopier', '#go', 3800, '.verdict-line', /Accepted|Forged/);
  await step('try again', '#again', 500, '.note figcaption', /genuine/i);
  await step('a hundred photocopies', '#hundred', 3200, '.verdict-line', /of those 100/);
  await step('open the best press', view('press'), 900, '#stage h2', /best press/i);
  await step('pull the lever', '#go', 3800, '.verdict-line', /Accepted|Forged/);
  await step('a hundred pressings', '#hundred', 3200, '.verdict-line', /of those 100/);
  await step('open the patient forger', view('patient'), 900, '#stage h2', /patient forger/i);
  await step('start the heist', '#heist', 5200, '.verdict-line', /getaway|Caught|read the note/);
  await step('a hundred heists', '#heists', 4200, '.verdict-line', /of those 100/);
  await step('probe one qubit', '#probe', 2600, '.below .verdict-line', /Caught|clean checks/);
  await step('open the bank fights back', view('upgrade'), 900, '#stage h2', /fights back/i);
  await step('switch to six ways', '#ways button[data-w="six"]', 500, '.desk .hint', /circular/);
  await step('forge a six-way note', '#go', 3800, '.verdict-line', /Accepted|Forged/);
  await step('a hundred six-way notes', '#hundred', 3200, '.verdict-line', /of those 100/);
  await step('open results', view('ledger'), 900, '#stage h2', /Results/);
  await step('save the evidence', '#save', 1500, '#status', /console|box/);
  await step('open the ticket office', view('ticket'), 900, '#stage h2', /tickets/i);
  await step('work out a ticket', '#work', 6000, '.panes', /qubits|None/);
  console.log(`SELFCHECK done: ${ok} ok, ${failed} failed.`);
}

if (SELF_CHECK) await selfCheck();

// Qollab ends a run when this file finishes, and the page stops responding
// with it. Waiting here keeps the game live until Stop is pressed.
console.log('The game is live. Press Stop in Qollab when you are done.');
await new Promise(() => {});
