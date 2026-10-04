// Measure every Moleculator level's "What you built" card in Litmus in 3D: each
// molecule's tab, in both views (the atoms, the electrons), on each frame size.
// A card fails when its parts do not add up to its height, it leaves the frame,
// or a line of its words is wider than its column. Saves a screenshot of any
// card named with --shots (e.g. --shots=1,16,50).
//
// usage: node tools/litmus/cards.mjs <outdir> [--shots=1,16] [--first=1] [--last=100] [--chapter=reactor]
// The Reactor's "What just happened" cards are measured for each level's reactions as the shortest way takes them,
// one tab for each.
// Serves the repo for the length of the run.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const [outDir] = process.argv.slice(2);
const opt = Object.fromEntries(process.argv.slice(3).map((s) => { const [k, v] = s.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
const RX = ['reactor', 'carbon'].includes(opt.chapter) ? opt.chapter : null;
const FIRST = +(opt.first || 1), LAST = +(opt.last || (RX === 'carbon' ? 40 : RX ? 60 : 100)), SHOTS = new Set(String(opt.shots || '').split(',').filter(Boolean).map(Number));
const root = new URL('../../', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg', woff2: 'font/woff2' };
const PORT = 5600 + Math.floor(Math.random() * 300);
const server = createServer((req, res) => {
  let f = root + decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\//, '');
  if (f.endsWith('/')) f += 'index.html';
  if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(PORT);
const profile = `/tmp/litmus3d-cards-${PORT}`;
mkdirSync(profile, { recursive: true });
const DEBUG = 9300 + Math.floor(Math.random() * 300);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: 'ignore' });
let ws, id = 0;
const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const msg = { id: ++id, method, params }; if (sessionId) msg.sessionId = sessionId;
  pending.set(msg.id, { res, rej }); ws.send(JSON.stringify(msg));
});

// the frames: two phones (a tall one and a short one) and the desktop frame
const FRAMES = [
  { name: 'phone-390x844', w: 390, h: 844, mobile: true },
  { name: 'phone-375x667', w: 375, h: 667, mobile: true },
  { name: 'desktop', w: 1280, h: 800, mobile: false },
  // --frames=all: the narrowest phone, a portal's touch window, a small window and a big embed (sizes.mjs's tightest)
  ...(opt.frames === 'all' ? [
    { name: 'phone-320x568', w: 320, h: 568, mobile: true },
    { name: 'touch-800x450', w: 800, h: 450, mobile: true },
    { name: 'small-480x360', w: 480, h: 360, mobile: false },
    { name: 'embed-1920x1080', w: 1920, h: 1080, mobile: false, embed: true },
  ] : []),
];
const fails = [], rows = [];
async function run() {
  for (let i = 0; i < 50; i++) {
    try { const v = await (await fetch(`http://127.0.0.1:${DEBUG}/json/version`)).json(); ws = new WebSocket(v.webSocketDebuggerUrl); break; } catch { await sleep(200); }
  }
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } });
  for (const F of FRAMES) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => send(m, p, sessionId);
    await S('Page.enable'); await S('Runtime.enable');
    await S('Emulation.setDeviceMetricsOverride', { width: F.w, height: F.h, deviceScaleFactor: 2, mobile: F.mobile });
    await S('Emulation.setTouchEmulationEnabled', { enabled: F.mobile, maxTouchPoints: F.mobile ? 5 : 1 });
    await S('Page.navigate', { url: `http://localhost:${PORT}/litmus/?harness=1${F.embed ? '&embed=1' : ''}${RX ? '&chapter=' + RX : ''}#level-1` });
    await sleep(5000);
    const ev = async (expr) => { const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    const frames = '(new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))';
    for (let n = FIRST; n <= LAST; n++) {
      await ev(`__litmus3d.level(${n}, 0)`);
      const tabs = RX ? await ev('__litmus3d.rxPlanSteps()') : await ev('__litmus3d.state().targets');
      for (let t = 0; t < tabs; t++) for (const e of RX ? [false] : [false, true]) {
        await ev(RX ? `__litmus3d.rcCard(${t})` : `__litmus3d.learn(${t}, ${e})`); await ev(frames);
        const f = await ev(RX ? '__litmus3d.rcFit()' : '__litmus3d.learnFit()');
        const row = { frame: F.name, level: n, tab: t, electrons: e, ...f };
        rows.push(row);
        const bad = RX ? (!f || !f.fits || f.widest > f.inner + 0.5) : (!f || !f.fits || f.widest > f.textW + 0.5 || f.legendW > f.colW + 0.5 || !f.headerFits);
        if (bad) fails.push(row);
        if (SHOTS.has(n) && t === 0) {
          const shot = await S('Page.captureScreenshot', { format: 'png' });
          writeFileSync(`${outDir}/${F.name}-L${n}-${e ? 'electrons' : 'atoms'}.png`, Buffer.from(shot.data, 'base64'));
        }
      }
    }
    await send('Target.closeTarget', { targetId });
  }
  writeFileSync(`${outDir}/cards.json`, JSON.stringify(rows, null, 1));
  const scrolls = rows.filter((r) => r.scrollMax > 0);
  console.log(`${rows.length} cards measured; ${fails.length} fail; ${scrolls.length} scroll (most ${Math.max(0, ...scrolls.map((r) => Math.round(r.scrollMax)))}px)`);
  for (const r of fails.slice(0, 40)) console.log('FAIL', JSON.stringify(r));
}
run().catch((e) => { console.log('ERROR', e.message); }).finally(() => { chrome.kill(); server.close(); process.exit(0); });
