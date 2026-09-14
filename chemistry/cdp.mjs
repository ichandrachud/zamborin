/* Lessons in Chemistry · a headless Chrome page over the DevTools protocol,
   for the harnesses beside this file. Instruments, not the site: .mjs is not
   served by the deployment.

   Needs Google Chrome in /Applications and the game on a local server:
   CHEM_BASE defaults to the chemistry worktree's preview port. */
import { spawn } from 'child_process';
import fs from 'fs';

export const BASE = process.env.CHEM_BASE || 'http://localhost:5291/chemistry/';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/* Open a page at a size. Resolves to { send, ev, toPage, errors, navigate, close }.
   mobile: true emulates a touch phone, so (pointer: coarse) matches. */
export async function openPage({ w, h, dpr = 1, mobile = false, url, settle = 3400 }) {
  const port = 9300 + Math.floor(Math.random() * 600);
  const dir = `/tmp/chem-cdp-${port}`;
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run',
    '--no-default-browser-check', `--user-data-dir=${dir}`, '--hide-scrollbars', '--mute-audio', 'about:blank'],
    { stdio: 'ignore' });
  const kill = () => { chrome.kill('SIGKILL'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} };
  // Chrome can answer /json/list before its page target exists; wait for the
  // page itself, and never leave a Chrome running if it does not come.
  let page;
  for (let i = 0; i < 100 && !page; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch (e) { /* not up yet */ }
    if (!page) await sleep(100);
  }
  if (!page) { kill(); throw new Error('Chrome did not start'); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => { kill(); j(new Error('DevTools socket failed')); }; });
  let id = 0;
  const pending = new Map(), errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    // Vercel's scripts only exist on Vercel, and the AdSense script logs its own
    // report-only CSP notices about framing google.com; neither is the game.
    const e = d.params && d.params.entry;
    const thirdParty = e && (/_vercel|googlesyndication|adtrafficquality|doubleclick/.test(e.url || '') ||
                             /report-only Content Security Policy/.test(e.text || ''));
    if (d.method === 'Log.entryAdded' && e.level === 'error' && !thirdParty) {
      errors.push(d.params.entry.text + ' ' + (d.params.entry.url || ''));
    }
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(expr.slice(0, 80) + ' -> ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result.result.value;
  };
  const metrics = async (W, H, D, mob) => {
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: D, mobile: mob });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mob, maxTouchPoints: mob ? 5 : 1 });
  };
  const navigate = async (u, wait = settle) => { await send('Page.navigate', { url: u }); await sleep(wait); };
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await metrics(w, h, dpr, mobile);
  if (url) await navigate(url);
  // a logical canvas point to a CSS pixel in the viewport
  const toPage = (x, y) => ev(`(() => { const c = document.getElementById('game').getBoundingClientRect(); const s = __chem.state;
    return { x: c.left + ${x} * c.width / s.LW, y: c.top + ${y} * c.height / s.LH }; })()`);
  const close = () => { try { ws.close(); } catch (e) {} kill(); };
  return { send, ev, toPage, errors, navigate, metrics, close };
}
