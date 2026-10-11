// Local stand-in for Qollab's JS-to-Python bridge, for Is it quantum?
// On Qollab, main.js imports 'xeb.api' straight from the Python package.
const remote = (name) => {
  const fn = () => { throw new Error(`Call ${name}.callPromising(...) as on Qollab.`); };
  fn.callPromising = async (...args) => {
    const res = await fetch(`/api/${name}`, { method: 'POST', body: JSON.stringify(args) });
    if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
    return res.text();
  };
  return fn;
};

globalThis.backend = { name: 'basic_simulator', toJSON: () => '__backend__' };

export const describe = remote('describe');
export const sample = remote('sample');
export const fakers = remote('fakers');
export const sweep_point = remote('sweep_point');
export const sweep_fit = remote('sweep_fit');
export const export_evidence = remote('export_evidence');

// ?step=decay opens that step on load, so a headless browser can photograph it.
const step = new URLSearchParams(location.search).get('step');
if (step) {
  const timer = setInterval(() => {
    const button = document.querySelector(`#nav button[data-view="${step}"]`);
    if (!button || !document.querySelector('.suspect')) return;
    clearInterval(timer);
    setTimeout(() => {
      button.click();
      if (step === 'print') { document.querySelector('#all')?.click(); document.querySelector('#unmask')?.click(); }
    }, step === 'decay' ? 7000 : 300);
  }, 200);
}
