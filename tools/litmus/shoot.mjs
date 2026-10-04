// Drive headless Chrome over the DevTools protocol: set a device, load a page,
// optionally tap, then save a screenshot and print what the harness reports.
// Marble's tools/marble/shoot.mjs, with taps for Litmus in 3D: `tapAt` takes an
// expression giving a point in the frame's units and presses it through real
// touch (or mouse) events, held for `ms` (a hold is a drift).
// usage: node shoot.mjs <outdir> <json list of shots>
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const [outDir, shotsJson] = process.argv.slice(2);
// Optional: serve a folder for the length of the run (a one-off, not a dev server).
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
let server = null;
if (process.env.SERVE_DIR) {
  const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg', woff2: 'font/woff2' };
  server = createServer((req, res) => {
    let f = process.env.SERVE_DIR + decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (f.endsWith('/')) f += 'index.html';
    if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' });
    res.end(readFileSync(f));
  }).listen(Number(process.env.SERVE_PORT || 5399));
}
const shots = JSON.parse(shotsJson);
mkdirSync(outDir, { recursive: true });
const PORT = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--mute-audio', '--disable-audio-output', `--remote-debugging-port=${PORT}`, `--user-data-dir=${outDir}/.profile-${PORT}`,
  '--no-first-run', '--no-default-browser-check', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
  '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
function send(method, params = {}, sessionId) {
  return new Promise((res, rej) => {
    const msg = { id: ++id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, { res, rej });
    ws.send(JSON.stringify(msg));
  });
}
try {
  let ver;
  for (let i = 0; i < 50; i++) {
    try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(200); }
  }
  ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      console.log('PAGE ERROR:', (d.exception && d.exception.description || d.text).split('\n').slice(0, 4).join(' | '), 'line', d.lineNumber, 'col', d.columnNumber, d.url || '');
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      console.log('CONSOLE ERROR:', m.params.args.map((a) => a.value || a.description).join(' ').slice(0, 400));
    }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  });
  for (const s of shots) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => send(m, p, sessionId);
    await S('Page.enable');
    await S('Runtime.enable');
    await S('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: s.dpr || 1, mobile: !!s.mobile });
    await S('Emulation.setTouchEmulationEnabled', { enabled: !!s.mobile, maxTouchPoints: s.mobile ? 5 : 1 });
    if (s.cpu) await S('Emulation.setCPUThrottlingRate', { rate: s.cpu });
    if (s.clear) await S('Storage.clearDataForOrigin', { origin: new URL(s.url).origin, storageTypes: 'local_storage' });
    await S('Page.navigate', { url: s.url });
    await sleep(s.wait || 2500);
    for (const a of s.actions || []) {
      if (a.record) {
        // A burst of frames for a clip: JPEG screenshots as fast as they come, for a while.
        mkdirSync(`${outDir}/${s.name}-frames`, { recursive: true });
        const t0 = Date.now(); let n = 0;
        while (Date.now() - t0 < a.record) {
          const shot = await S('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
          writeFileSync(`${outDir}/${s.name}-frames/f${String(++n).padStart(4, '0')}.jpg`, Buffer.from(shot.data, 'base64'));
        }
        console.log(s.name, 'recorded', n, 'frames in', Date.now() - t0, 'ms');
        continue;
      }
      if (a.script) {
        const r = await S('Runtime.evaluate', { expression: readFileSync(a.script, 'utf8'), returnByValue: true });
        console.log(s.name, 'script:', JSON.stringify(r.result.value ?? r.exceptionDetails?.text));
      } else if (a.eval) {
        const r = await S('Runtime.evaluate', { expression: a.eval, awaitPromise: true, returnByValue: true });
        console.log(s.name, 'eval:', JSON.stringify(r.result.value ?? r.exceptionDetails?.text));
      } else if (a.tapHit) {
        // Press a control where the game says it is, through real touch events.
        const r = await S('Runtime.evaluate', { expression: `(() => { const h = __marble.hits()['${a.tapHit}']; const rc = document.getElementById('game').getBoundingClientRect(); const st = __marble.state(); return h && [rc.left + (h.x + h.w / 2) * rc.width / st.LW, rc.top + (h.y + h.h / 2) * rc.height / st.LH]; })()`, returnByValue: true });
        const pt = r.result.value;
        if (!pt) { console.log(s.name, 'no hit box for', a.tapHit); continue; }
        const tp = [{ x: pt[0], y: pt[1], id: 1 }];
        if (s.mobile) {
          await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp });
          await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          await S('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt[0], y: pt[1], button: 'left', clickCount: 1 });
          await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt[0], y: pt[1], button: 'left', clickCount: 1 });
        }
        console.log(s.name, 'tapped', a.tapHit, pt.map(Math.round));
      } else if (a.tapAt) {
        const r = await S('Runtime.evaluate', { expression: `(() => { const p = (${a.tapAt}); const rc = document.getElementById('game').getBoundingClientRect(); const st = __litmus3d.state(); return p && [rc.left + p[0] * rc.width / st.LW, rc.top + p[1] * rc.height / st.LH]; })()`, returnByValue: true });
        const pt = r.result.value;
        if (!pt) { console.log(s.name, 'nothing to tap for', a.tapAt); continue; }
        if (s.mobile) {
          await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt[0], y: pt[1], id: 1 }] });
          if (a.ms) await sleep(a.ms);
          await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt[0], y: pt[1] });
          await S('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt[0], y: pt[1], button: 'left', clickCount: 1 });
          if (a.ms) await sleep(a.ms);
          await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt[0], y: pt[1], button: 'left', clickCount: 1 });
        }
        console.log(s.name, 'tapped', a.tapAt.slice(0, 60), pt.map(Math.round));
      } else if (a.dragExpr) {
        // a drag whose ends the page works out, in the frame's units: [x0, y0, x1, y1]
        const r = await S('Runtime.evaluate', { expression: `(() => { const q = (${a.dragExpr}); const rc = document.getElementById('game').getBoundingClientRect(); const st = __litmus3d.state(); return q && [rc.left + q[0] * rc.width / st.LW, rc.top + q[1] * rc.height / st.LH, rc.left + q[2] * rc.width / st.LW, rc.top + q[3] * rc.height / st.LH]; })()`, returnByValue: true });
        const q = r.result.value;
        if (!q) { console.log(s.name, 'no drag for', a.dragExpr.slice(0, 50)); continue; }
        const [x0, y0, x1, y1] = q, ms = a.ms || 400, n = Math.max(10, Math.round(ms / 16));
        if (s.mobile) {
          await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 3 }] });
          for (let i = 1; i <= n; i++) { const k = Math.min(1, i / 8); await S('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, id: 3 }] }); await sleep(16); }
          await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          await S('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
          for (let i = 1; i <= n; i++) { const k = Math.min(1, i / 8); await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, button: 'left', buttons: 1 }); await sleep(16); }
          await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 });
        }
        console.log(s.name, 'dragged', q.map(Math.round));
      } else if (a.drag) {
        const [x0, y0, x1, y1, ms] = a.drag;
        const tp = (x, y) => [{ x, y, id: 2 }];
        await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(x0, y0) });
        const n = Math.max(2, Math.round(ms / 16));
        for (let i = 1; i <= n; i++) {
          const k = Math.min(1, i / 8);
          await S('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k) });
          await sleep(16);
          if (a.shootMid && i === Math.round(n * 0.6)) {
            const shot = await S('Page.captureScreenshot', { format: 'png' });
            writeFileSync(`${outDir}/${s.name}-mid.png`, Buffer.from(shot.data, 'base64'));
          }
        }
        await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        console.log(s.name, 'dragged');
      } else if (a.snap) {
        const shot = await S('Page.captureScreenshot', { format: 'png' });
        writeFileSync(`${outDir}/${a.snap}.png`, Buffer.from(shot.data, 'base64'));
        console.log(s.name, 'snapped', a.snap);
      } else if (a.gc) {
        await S('HeapProfiler.enable'); await S('HeapProfiler.collectGarbage');
        const r = await S('Runtime.evaluate', { expression: 'Math.round(performance.memory.usedJSHeapSize / 1e6)', returnByValue: true });
        console.log(s.name, 'gc heap MB:', r.result.value, a.gc);
      } else if (a.sleep) await sleep(a.sleep);
    }
    const shot = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(`${outDir}/${s.name}.png`, Buffer.from(shot.data, 'base64'));
    console.log(s.name, 'saved');
    await send('Target.closeTarget', { targetId });
  }
} catch (e) {
  console.error('ERROR', e.message);
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill('SIGKILL');
  if (server) server.close();
  process.exit(0);
}
