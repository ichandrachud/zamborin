// Litmus in 3D in every window (NEW-GAME-PROMPT 3 and 5). In an embed, a portal package and full screen the game takes
// the window's own shape; on a phone it is the screen. At CrazyGames' ten window sizes (as /chemistry/window-sweep.mjs),
// small and odd windows, phones from 320 wide either way up, and the 760x600 site frame, it loads levels of each chapter
// and checks, on the boxes the game reports (__litmus3d.geom()):
//   - the canvas fills the window (the site frame: exactly 760x600);
//   - the menu button, the goal orbs, their names, the agents and their names are inside the frame;
//   - no goal's name is cut short, and no name meets another, the menu button or an orb;
//   - the sphere is inside the frame, clear of the goals' names above and of the chances above the agents;
//   - the agents and their names do not meet.
// Every level of each chapter at the three tightest windows; a spread of levels at the rest.
// usage: node tools/litmus3d/sizes.mjs [quick]     Serves the repo for the length of the run.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const QUICK = process.argv.includes('quick');
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
const profile = `/tmp/litmus3d-sizes-${PORT}`;
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

// [w, h, a touch device?, the site frame (not embedded)?]
const CG = [[907, 510], [1216, 684], [1077, 606], [821, 462], [1366, 768], [1920, 1080], [1536, 864], [1280, 720], [800, 450, true], [1080, 607, true]];
const SMALL = [[480, 360], [640, 400], [700, 480], [760, 420]];
const PHONES = [[320, 568, true], [360, 640, true], [375, 667, true], [390, 844, true], [412, 915, true], [568, 320, true], [844, 390, true]];
const SITE = [[1280, 900, false, true]];
const TIGHT = [[320, 568, true], [800, 450, true], [480, 360]];
const WINDOWS = QUICK ? [...TIGHT, ...SITE] : [...CG, ...SMALL, ...PHONES, ...SITE];
const CHAPTERS = { moleculator: 100, reactor: 60, carbon: 40 };
const SPREAD = { moleculator: [1, 2, 5, 22, 39, 49, 82, 97, 100], reactor: [1, 10, 41, 44, 52, 57, 60], carbon: [1, 13, 26, 34, 35, 40] };

const right = (r) => r.x + r.w, bottom = (r) => r.y + r.h;
const meets = (a, b, g = 2) => a.x < right(b) + g && right(a) + g > b.x && a.y < bottom(b) + g && bottom(a) + g > b.y;
const inside = (r, G) => r.x >= -0.5 && r.y >= -0.5 && right(r) <= G.LW + 0.5 && bottom(r) <= G.LH + 0.5;
function check(G, W) {
  const bad = [];
  if (W[3]) { if (G.LW !== 760 || G.LH !== 600) bad.push(`site frame is ${G.LW}x${G.LH}, not 760x600`); }
  else if (Math.abs(G.cssW - G.winW) > 1 || Math.abs(G.cssH - G.winH) > 1) bad.push(`canvas ${Math.round(G.cssW)}x${Math.round(G.cssH)} in a ${G.winW}x${G.winH} window`);
  const boxes = [];
  if (G.pause) { boxes.push(['menu', G.pause]); if (!inside(G.pause, G)) bad.push('menu button off screen'); }
  G.goals.forEach((o, i) => { const b = { x: o.x - o.R, y: o.y - o.R, w: o.R * 2, h: o.R * 2 }; boxes.push([`goal ${i + 1}`, b, i]); if (!inside(b, G)) bad.push(`goal ${i + 1} orb off screen`); });
  G.names.forEach((n) => { boxes.push([`name "${n.text}"`, n, n.goal]); if (n.cut) bad.push(`name cut short: "${n.text}"`); if (!inside(n, G)) bad.push(`name off screen: "${n.text}"`); });
  // names against each other, the menu, and the other goals' orbs
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, A, ga] = boxes[i], [b, B, gb] = boxes[j];
    if (a.startsWith('goal') && b.startsWith('goal')) continue;
    if (ga != null && ga === gb) continue;          // a goal's own orb and the lines of its own name
    if (meets(A, B)) bad.push(`${a} meets ${b}`);
  }
  const S = G.sphere;
  if (S) {
    const top = Math.max(...G.names.map((n) => bottom(n)), ...G.goals.map((o) => o.y + o.R));
    if (S.y - S.r < top + 2) bad.push(`sphere top ${Math.round(S.y - S.r)} over the goals (to ${Math.round(top)})`);
    if (S.y + S.r > S.chancesY - 8 - 2) bad.push(`sphere bottom ${Math.round(S.y + S.r)} on the chances (${Math.round(S.chancesY)})`);
    if (S.x - S.r < 0 || S.x + S.r > G.LW) bad.push('sphere off the sides');
    const ag = S.agents.map((a) => ({ x: a.x - a.r, y: a.y - a.r, w: a.r * 2, h: a.r * 2 }));
    const names = S.agents.flatMap((a, k) => a.lines.map((l) => ({ x: a.x - l.w / 2, y: l.y - 10, w: l.w, h: 20, text: l.text, k })));
    ag.forEach((b, i) => { if (!inside(b, G)) bad.push(`agent ${i + 1} off screen`); });
    names.forEach((n) => { if (!inside(n, G)) bad.push(`agent name off screen: ${n.text}`); });
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (names[i].k !== names[j].k && meets(names[i], names[j], 4)) bad.push(`agent names meet: ${names[i].text} / ${names[j].text}`);
    for (let i = 0; i < ag.length; i++) for (let j = i + 1; j < ag.length; j++) if (meets(ag[i], ag[j], 0)) bad.push(`agents ${i + 1} and ${j + 1} meet`);
  }
  return bad;
}

let fails = 0, checked = 0;
const kinds = {};
async function run() {
  for (let i = 0; i < 50; i++) {
    try { const v = await (await fetch(`http://127.0.0.1:${DEBUG}/json/version`)).json(); ws = new WebSocket(v.webSocketDebuggerUrl); break; } catch { await sleep(200); }
  }
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } });
  for (const W of WINDOWS) {
    const [w, h, touch, site] = W;
    const tight = TIGHT.some((t) => t[0] === w && t[1] === h);
    for (const [chapter, count] of Object.entries(CHAPTERS)) {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const S = (m, p) => send(m, p, sessionId);
      await S('Page.enable'); await S('Runtime.enable');
      await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!touch });
      await S('Emulation.setTouchEmulationEnabled', { enabled: !!touch, maxTouchPoints: touch ? 5 : 1 });
      const q = `harness=1${site || touch ? '' : '&embed=1'}${chapter === 'moleculator' ? '' : '&chapter=' + chapter}`;
      await S('Page.navigate', { url: `http://localhost:${PORT}/litmus3d/?${q}#level-1` });
      await sleep(5000);
      const ev = async (expr) => { const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
      const frames = '(new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))';
      const levels = tight ? [...Array(count).keys()].map((i) => i + 1) : SPREAD[chapter];
      for (const n of levels) {
        await ev(`__litmus3d.level(${n}, 0)`); await ev(frames); await ev(frames);
        const G = await ev('__litmus3d.geom()');
        checked++;
        const bad = check(G, W);
        for (const b of new Set(bad.map((x) => `${w}x${h}${touch ? ' touch' : ''}${site ? ' site' : ''} ${chapter}: ${x.replace(/"[^"]*"/g, '"…"').replace(/\d+/g, '#')}`))) kinds[b] = (kinds[b] || 0) + 1;
        if (bad.length) { fails++; if (fails <= 40) console.log(`${w}x${h}${touch ? ' touch' : ''}${site ? ' site' : ''} ${chapter} ${n}: ${[...new Set(bad)].join('; ')}`); }
      }
      await send('Target.closeTarget', { targetId });
    }
  }
  console.log('\nBY KIND'); for (const [k, n] of Object.entries(kinds).sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(4), k);
  console.log(`\n${checked} screens checked in ${WINDOWS.length} windows; ${fails} with a problem`);
}
run().catch((e) => { console.log('ERROR', e.message); }).finally(() => { chrome.kill(); server.close(); process.exit(0); });
