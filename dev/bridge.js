// Local stand-in for Qollab's JS-to-Python bridge. On Qollab, main.js imports
// 'legaltender.api' straight from the Python package. Here the import map in
// dev/serve.py points that name at this file, and each call goes over HTTP.
// Open the preview with ?fallback=1 to make print_plate fail on purpose, which
// exercises the path where the page runs the job itself.
const forceFallback = new URLSearchParams(location.search).has('fallback');

const post = async (path, body) => {
  const res = await fetch(path, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.text();
};

const remote = (name) => {
  const fn = () => { throw new Error(`Call ${name}.callPromising(...) as on Qollab.`); };
  fn.callPromising = async (...args) => {
    if (forceFallback && name === 'print_plate') return JSON.stringify({ ok: false, error: 'forced failure (dev)' });
    const out = await post(`/api/${name}`, args);
    // Circuits come back as a ticket the dev server can look up again.
    return name.endsWith('_circuit') ? JSON.parse(out) : out;
  };
  return fn;
};

// A stand-in for the backend object Qollab injects: run() resolves to a job
// whose result() has get_counts(), shaped like the proxies Pyodide returns.
globalThis.backend = {
  name: 'basic_simulator',
  toJSON: () => '__backend__',
  run: async (circuit, { shots }) => ({
    result: async () => {
      const counts = JSON.parse(await post('/dev/run', { circuit, shots }));
      return { get_counts: () => ({ toJs: () => new Map(Object.entries(counts)) }) };
    },
  }),
};

export const describe = remote('describe');
export const describe_named = remote('describe_named');
export const print_plate = remote('print_plate');
export const plate_circuit = remote('plate_circuit');
export const plain_circuit = remote('plain_circuit');
export const read_plate = remote('read_plate');
export const ticket = remote('ticket');
export const tickets = remote('tickets');
export const export_evidence = remote('export_evidence');

// ?shot=1 plays one photocopier attempt on load, so a headless browser can
// take the cover picture: see tools/cover.sh.
if (new URLSearchParams(location.search).has('shot')) {
  const play = () => {
    if (!document.getElementById('go')) return setTimeout(play, 300);
    for (const i of [1, 4, 6]) document.querySelectorAll('.guesses button')[i]?.click();
    document.getElementById('go').click();
  };
  setTimeout(play, 1200);
}
