// Play every Moleculator level of Litmus in 3D through real input, and pick
// each level's 3D placement.
//
// For each level: placements 0, 1, 2 ... are tried in turn. The careful pilot
// (the page's __litmus3d.next()) says what a player would do; this script does
// it as real touch (phone) or mouse (desktop) events, through the DevTools
// protocol, with the world drifting as it does in play. The first placement
// the careful pilot wins is the level's. On that placement the careless pilot
// (faces the atom it wants and taps, no looking for a clear line) then plays
// it too, so the report says which levels punish a careless pull.
//
// usage: node tools/litmus/levels.mjs <mobile|desktop> <first> <last> <out.json>
//        [--tries=4] [--careless=1] [--workers=4] [--speed=3] [--chapter=reactor] [--track]
// --track prints, for each level, the analytics events the page sent while it was played.
// The Reactor (--chapter=reactor) has no placements to try: one try a level, and --write is ignored.
// Serves the repo for the length of the run. Writes litmus/places.js only
// with --write.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const [mode, a, b, outFile] = process.argv.slice(2);
const opt = Object.fromEntries(process.argv.slice(6).map((s) => { const [k, v] = s.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
const CHAPTER = ['reactor', 'carbon'].includes(opt.chapter) ? opt.chapter : null;   // the Reactor and the Carbon Chamber play the same sphere
// --daily: the "levels" are days of the daily molecule, counted from 4 October 2026 (level 1 = day 0)
const DAILY = !!opt.daily && !CHAPTER;
const TRIES = CHAPTER ? 1 : +(opt.tries || 4), CARELESS = +(opt.careless ?? 1), WORKERS = +(opt.workers || 4), SPEED = +(opt.speed || 3);
const root = new URL('../../', import.meta.url).pathname;
const mobile = mode === 'mobile';

const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg', woff2: 'font/woff2' };
const PORT = 5600 + Math.floor(Math.random() * 300);
const server = createServer((req, res) => {
  let f = root + decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\//, '');
  if (f.endsWith('/')) f += 'index.html';
  if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(PORT);

const profile = `/tmp/litmus3d-levels-${PORT}`;
mkdirSync(profile, { recursive: true });
const DEBUG = 9300 + Math.floor(Math.random() * 300);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--mute-audio', '--disable-audio-output', `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank',
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const msg = { id: ++id, method, params }; if (sessionId) msg.sessionId = sessionId;
  pending.set(msg.id, { res, rej }); ws.send(JSON.stringify(msg));
});
const errors = [];

async function worker(levels, results) {
  // each in a window of its own: a tab behind another is hidden, and a hidden page stops drawing (and so stops the game)
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true, background: false });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable');
  await S('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const W = mobile ? 390 : 1280, H = mobile ? 844 : 800;
  await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile });
  await S('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
  // --track: keep every event the site's analytics would send (shared/analytics.js sends through window.va)
  if (opt.track) await S('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__va = []; window.va = (k, e) => window.__va.push(e);' });
  await S('Page.navigate', { url: `http://localhost:${PORT}/litmus/?harness=1&speed=${SPEED}${CHAPTER ? '&chapter=' + CHAPTER : ''}#level-1` });
  await sleep(5000);
  const ev = async (expr) => { const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const rect = await ev(`(() => { const r = document.getElementById('game').getBoundingClientRect(); const s = __litmus3d.state(); return { x: r.left, y: r.top, kx: r.width / s.LW, ky: r.height / s.LH }; })()`);
  const px = (x, y) => [rect.x + x * rect.kx, rect.y + y * rect.ky];
  async function tap([x, y]) {
    const [cx, cy] = px(x, y);
    if (mobile) { await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] }); await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    else { await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy }); await S('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 }); await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 }); }
  }
  async function dragBy([x0, y0, x1, y1]) {
    const [a0, b0] = px(x0, y0), [a1, b1] = px(x1, y1), n = 14;
    if (mobile) {
      await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a0, y: b0, id: 2 }] });
      for (let i = 1; i <= n; i++) { const k = Math.min(1, i / 8); await S('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a0 + (a1 - a0) * k, y: b0 + (b1 - b0) * k, id: 2 }] }); await sleep(16); }
      await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await S('Input.dispatchMouseEvent', { type: 'mousePressed', x: a0, y: b0, button: 'left', clickCount: 1 });
      for (let i = 1; i <= n; i++) { const k = Math.min(1, i / 8); await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a0 + (a1 - a0) * k, y: b0 + (b1 - b0) * k, button: 'left', buttons: 1 }); await sleep(16); }
      await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: a1, y: b1, button: 'left', clickCount: 1 });
    }
  }
  async function play(n, variant, careless) {
    const info = await ev(DAILY ? `JSON.stringify(__litmus3d.daily(${n - 1}, ${variant}))` : `JSON.stringify(__litmus3d.level(${n}, ${variant}))`);
    const log = [];
    let waited = 0;
    const t0 = Date.now();
    for (let step = 0; step < 160 && Date.now() - t0 < 150000; step++) {
      const act = await ev(`__litmus3d.next(${careless})`);
      if (opt.verbose) console.log(n, variant, careless ? 'careless' : 'careful', JSON.stringify(act).slice(0, 160));
      if (act.type === 'done') return { won: act.result === 'win', result: act.result, moves: log.length, ms: Date.now() - t0, log, bonds: act.bonds, info: JSON.parse(info) };
      if (act.type === 'stuck' && opt.verbose) console.log(n, variant, 'STUCK', JSON.stringify(act).slice(0, 1500));
      if (act.type === 'stuck') return { won: false, result: 'stuck', moves: log.length, ms: Date.now() - t0, log, info: JSON.parse(info) };
      if (act.type === 'wait') {
        step--;     // waiting for an animation is not a move: a five-step chain spent its 160 on waits (the time cap still holds)
        waited = (waited || 0) + 1;
        if (waited === 200) console.log(`${n} ${variant} long wait: ${JSON.stringify(act)}`);
        await sleep(90); continue;
      }
      waited = 0;
      if (act.type === 'drag') { await dragBy(act.pts); await sleep(60); continue; }
      if (act.type === 'hold') {
        log.push('drift to ' + act.el);
        const [cx, cy] = px(act.pt[0], act.pt[1]);
        if (mobile) { await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 4 }] }); await sleep(act.ms); await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
        else { await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy }); await S('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 }); await sleep(act.ms); await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 }); }
        await sleep(200); continue;
      }
      if (act.type === 'tap') { log.push((act.kind === 'letgo' ? 'let go ' : '') + act.el); await tap(act.pt); await sleep(140); }
    }
    return { won: false, result: 'timeout', moves: log.length, ms: Date.now() - t0, log, info: JSON.parse(info) };
  }
  for (const n of levels) {
    const row = { level: n, tries: [] };
    // a daily that no placement wins tries a fresh deal of its atoms (code = deal x 10 + placement)
    const codes = DAILY ? [0, 1, 2].flatMap((k) => [...Array(TRIES).keys()].map((v) => k * 10 + v)) : [...Array(TRIES).keys()];
    for (const v of codes) {
      let r;
      try { r = await play(n, v, false); } catch (e) { r = { won: false, result: 'error ' + e.message.slice(0, 120) }; }
      row.tries.push({ variant: v, won: r.won, result: r.result, moves: r.moves, ms: r.ms, log: r.log && r.log.join(' '), bonds: r.bonds });
      if (r.won) { row.variant = v; break; }
    }
    if (row.variant != null && CARELESS) {
      row.careless = [];
      for (let c = 0; c < CARELESS; c++) {
        let r;
        try { r = await play(n, row.variant, true); } catch (e) { r = { won: false, result: 'error ' + e.message.slice(0, 120) }; }
        row.careless.push({ won: r.won, result: r.result, moves: r.moves, log: r.log && r.log.join(' '), bonds: r.bonds });
      }
    }
    if (opt.track) row.events = await ev('window.__va.splice(0).map((e) => e.name + (e.data && e.data.level != null ? ` ${e.data.level}` : "") + (e.data && e.data.moves != null ? ` moves ${e.data.moves}` : "") + (e.data && e.data.streak != null ? ` streak ${e.data.streak}` : ""))');
    results.push(row);
    if (opt.track) console.log(`${mode} ${n} sent: ${row.events.join(' | ')}`);
    console.log(`${mode} ${n}: ` + (row.variant != null ? `won on placement ${row.variant}` : 'NOT WON') +
      ` [${row.tries.map((t) => (t.won ? 'W' : t.result[0])).join('')}]` + (row.careless ? ` careless ${row.careless.map((c) => (c.won ? 'W' : c.result)).join(',')}` : ''));
  }
  await send('Target.closeTarget', { targetId });
}

try {
  let ver;
  for (let i = 0; i < 50; i++) { try { ver = await (await fetch(`http://127.0.0.1:${DEBUG}/json/version`)).json(); break; } catch { await sleep(200); } }
  ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  });
  const all = []; for (let n = +a; n <= +b; n++) all.push(n);
  const results = [];
  const shares = Array.from({ length: WORKERS }, (_, w) => all.filter((_, i) => i % WORKERS === w));
  await Promise.all(shares.filter((s) => s.length).map((s) => worker(s, results)));
  results.sort((x, y) => x.level - y.level);
  writeFileSync(outFile, JSON.stringify({ mode, speed: SPEED, tries: TRIES, errors, results }, null, 1));
  const won = results.filter((r) => r.variant != null);
  const carelessLost = won.filter((r) => r.careless && r.careless.some((c) => !c.won));
  console.log(`\n${mode}: ${won.length} of ${results.length} levels won by the careful pilot; careless lost on ${carelessLost.length} of ${won.length}; page errors ${errors.length}`);
  if (opt.write && DAILY) {
    const file = root + 'litmus/dailies.js', src = readFileSync(file, 'utf8');
    const cur = JSON.parse(src.match(/window\.LITMUS3D_DAILIES = (\{[\s\S]*?\});/)[1].replace(/(\w+):/g, '"$1":'));
    const list = cur[mode] || [];
    for (const r of results) if (r.variant != null) list[r.level - 1] = r.variant;
    for (let i = 0; i < list.length; i++) if (list[i] == null) list[i] = 0;
    cur[mode] = list;
    writeFileSync(file, src.replace(/window\.LITMUS3D_DAILIES = \{[\s\S]*?\};/, `window.LITMUS3D_DAILIES = { mobile: [${(cur.mobile || []).join(',')}], desktop: [${(cur.desktop || []).join(',')}] };`));
    console.log('wrote', file);
  } else if (opt.write && !CHAPTER) {
    const file = root + 'litmus/places.js', src = readFileSync(file, 'utf8');
    const cur = JSON.parse(src.match(/window\.LITMUS3D_PLACES = (\{[\s\S]*?\});/)[1].replace(/(\w+):/g, '"$1":'));
    const list = cur[mode] || [];
    for (const r of results) if (r.variant != null) list[r.level - 1] = r.variant;
    for (let i = 0; i < list.length; i++) if (list[i] == null) list[i] = 0;
    cur[mode] = list;
    writeFileSync(file, src.replace(/window\.LITMUS3D_PLACES = \{[\s\S]*?\};/, `window.LITMUS3D_PLACES = { mobile: [${(cur.mobile || []).join(',')}], desktop: [${(cur.desktop || []).join(',')}] };`));
    console.log('wrote', file);
  }
} catch (e) {
  console.error('ERROR', e.stack);
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill('SIGKILL'); server.close();
  process.exit(0);
}
