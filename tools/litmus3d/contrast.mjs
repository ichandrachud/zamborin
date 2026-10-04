// Contrast on the painted pixel (NEW-GAME-PROMPT 6 and 10): every word Litmus in 3D draws, measured against what is
// actually painted around it, on the play screens of each chapter, the menu, the level map and every kind of card, on a
// phone and in the desktop frame. The game lists what it draws in one frame (__litmus3d.texts()); this saves a
// screenshot beside that list, and tools/litmus3d/contrast.py measures each word: its colour (with its alpha laid over
// what is behind it) against the lightest of the pixels round its box, so a light patch behind a word counts.
// usage: node tools/litmus3d/contrast.mjs <outdir> && python3 tools/litmus3d/contrast.py <outdir>
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const [outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const root = new URL('../../', import.meta.url).pathname;
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg', woff2: 'font/woff2' };
const PORT = 5600 + Math.floor(Math.random() * 300);
const server = createServer((req, res) => {
  let f = root + decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\//, '');
  if (f.endsWith('/')) f += 'index.html';
  if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(PORT);
const profile = `/tmp/litmus3d-contrast-${PORT}`;
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
const FRAMES = [{ name: 'phone', w: 390, h: 844, touch: true }, { name: 'desktop', w: 1280, h: 900, touch: false }];
// each screen: a chapter, and what to do to bring it up
const SCREENS = [
  ['moleculator', 'play-1', '__litmus3d.level(1, 0)'],
  ['moleculator', 'play-22', '__litmus3d.level(22, 0)'],
  ['moleculator', 'menu', '__litmus3d.level(5, 0); __litmus3d.menu(true)'],
  ['moleculator', 'map', '__litmus3d.map(true)'],
  ['moleculator', 'card-atoms', '__litmus3d.level(22, 0); __litmus3d.learn(0, false)'],
  ['moleculator', 'card-electrons', '__litmus3d.level(22, 0); __litmus3d.learn(0, true)'],
  ['moleculator', 'card-fail', '__litmus3d.level(22, 0); __litmus3d.failCard()'],
  ['reactor', 'play-10', '__litmus3d.level(10)'],
  ['reactor', 'play-44', '__litmus3d.level(44)'],
  ['reactor', 'menu', '__litmus3d.level(44); __litmus3d.menu(true)'],
  ['reactor', 'card', '__litmus3d.level(44); __litmus3d.rxPlanSteps(); __litmus3d.rcCard(0)'],
  ['reactor', 'card-poured', '__litmus3d.level(44); __litmus3d.failCard("agent")'],
  ['carbon', 'play-26', '__litmus3d.level(26)'],
  ['carbon', 'card', '__litmus3d.level(26); __litmus3d.rxPlanSteps(); __litmus3d.rcCard(0)'],
];
async function run() {
  for (let i = 0; i < 50; i++) {
    try { const v = await (await fetch(`http://127.0.0.1:${DEBUG}/json/version`)).json(); ws = new WebSocket(v.webSocketDebuggerUrl); break; } catch { await sleep(200); }
  }
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } });
  const index = [];
  for (const F of FRAMES) for (const chapter of ['moleculator', 'reactor', 'carbon']) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => send(m, p, sessionId);
    await S('Page.enable'); await S('Runtime.enable');
    await S('Emulation.setDeviceMetricsOverride', { width: F.w, height: F.h, deviceScaleFactor: 1, mobile: F.touch });
    await S('Emulation.setTouchEmulationEnabled', { enabled: F.touch, maxTouchPoints: F.touch ? 5 : 1 });
    await S('Page.navigate', { url: `http://localhost:${PORT}/litmus3d/?harness=1${chapter === 'moleculator' ? '' : '&chapter=' + chapter}#level-1` });
    await sleep(5000);
    const ev = async (expr) => { const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    for (const [ch, name, setup] of SCREENS) {
      if (ch !== chapter) continue;
      await ev(`__litmus3d.menu(false); __litmus3d.map(false); ${setup}; 1`);
      await sleep(900);
      const texts = await ev('__litmus3d.texts()');
      const shot = await S('Page.captureScreenshot', { format: 'png' });
      const base = `${F.name}-${chapter}-${name}`;
      writeFileSync(`${outDir}/${base}.png`, Buffer.from(shot.data, 'base64'));
      writeFileSync(`${outDir}/${base}.json`, JSON.stringify(texts));
      index.push(base);
      console.log(base, texts.length, 'words');
    }
    await send('Target.closeTarget', { targetId });
  }
  writeFileSync(`${outDir}/index.json`, JSON.stringify(index));
}
run().catch((e) => { console.log('ERROR', e.message); }).finally(() => { chrome.kill(); server.close(); process.exit(0); });
