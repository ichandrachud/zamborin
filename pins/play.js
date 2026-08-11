/* ============================================================
   PINS · a Zamborin Game (prototype)

   A web of nodes on springs, anchored at both side columns, with ONE edge
   shaken continuously at fixed frequencies. Pin a node and it is held rigidly
   at rest, which changes the structure's natural frequencies and so changes
   how hard it answers the shaking.

   Two-sided objective: the TARGET (white ring) must go still, and the BELL
   (amber ring) must keep ringing. Both at once, within the pin budget.

   PHYSICS is exactly the measured spec — K 0.11, C 0.002, dt 1, semi-implicit
   Euler. Do not touch those; C = 0.04 was measured to destroy resonance
   entirely. Levels are pre-baked and verified against this same integrator.

   TIMING NOTE. The transient decays as exp(-C*t), so after a pin the web needs
   thousands of steps to reach its new steady state — about 25 seconds at one
   step per frame, which is not playable. On every pin change we run the
   settle + measurement window invisibly (about 7ms) and then resume one step
   per frame for the visuals. The verdict therefore uses exactly the same
   procedure that verified the level.
   ============================================================ */
(() => {
  'use strict';

  const K = 0.11, C = 0.002, SX = 70, SY = 80;
  const WARM = 6000, MEAS = 3000;          // same windows the levels were verified with
  const SETTLE_ON_CHANGE = 4000;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let LW = 900, LH = 560;

  // ---- palette: section 7.1, locked ----
  const GROUND = '#0A1A2F', SPRING = '#4A7AB0', TRAIL = '#8FC8F0';
  const HEAD = '#DCEEFF', PINNED = '#7FD4D0', ANCHOR = '#4A6D96';
  const TARGET_RING = '#DCEEFF', BELL_RING = '#E8B54D';

  // Re-evaluated, not fixed at load: a browser can report a 0-width viewport for
  // the first frame, which would otherwise pin this to 'mobile' forever.
  const isMobile = () => matchMedia('(pointer: coarse)').matches ||
    (window.innerWidth > 0 && window.innerWidth < 768);
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- sound ----------
  // Everything here is short and dry. Section 7.5 bans decorative motion because
  // this is a game about detecting motion; the same argument bans a decorative
  // drone, so nothing loops and nothing sustains — you only ever hear a pin go
  // in and a reading of what it did.
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zamborin-pins.sound' }) : null;
  const snd = {
    on: () => !!(sfx && sfx.isOn()),
    ready() { if (sfx) sfx.ensureAudio(); },
    toggle() { if (!sfx) return; sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.tone(880, 0.05, 0.03, 'sine'); },
    pin() { if (sfx) { sfx.tone(540, 0.045, 0.032, 'sine'); sfx.noise(0.02, 2200, 1.2, 0.03); } },
    unpin() { if (sfx) sfx.tone(300, 0.07, 0.024, 'sine'); },
    // How still the target is now, carried as pitch: low while it is still
    // swinging, high as it approaches silent. This is the ear's answer to
    // "am I getting closer or further away?".
    reading(closeness) {
      if (!sfx) return;
      const c = Math.max(0, Math.min(1, closeness));
      sfx.tone(330 * Math.pow(2, c * 1.6), 0.11, 0.026, 'triangle');
    },
    // The two objectives get opposite shapes so you can hear WHICH one just
    // changed without reading anything: going still falls, ringing rises.
    met(which) {
      if (!sfx) return;
      if (which === 'target') { sfx.tone(660, 0.10, 0.036, 'sine'); setTimeout(() => sfx.tone(440, 0.20, 0.034, 'sine'), 90); }
      else { sfx.tone(587.33, 0.09, 0.032, 'triangle'); setTimeout(() => sfx.tone(880, 0.18, 0.032, 'triangle'), 80); }
    },
    lost(which) { if (sfx) sfx.tone(which === 'target' ? 260 : 220, 0.12, 0.022, 'triangle'); },
    win() { if (sfx) sfx.arpeggio(523.25, 0.09, 3); },
    // An assisted solve is not a win, so it does not get the win's fanfare.
    shown() { if (sfx) { sfx.tone(392, 0.10, 0.026, 'sine'); setTimeout(() => sfx.tone(523.25, 0.16, 0.024, 'sine'), 90); } },
    hint() { if (sfx) sfx.tone(760, 0.05, 0.020, 'sine'); },
    clear() { if (sfx) { sfx.tone(420, 0.06, 0.022, 'sine'); setTimeout(() => sfx.tone(300, 0.09, 0.020, 'sine'), 60); } },
  };
  // Fired only from paths the player caused. loadLevel seeds these instead, or
  // every level would open by announcing whatever state it happens to start in.
  let lastPassT = false, lastPassB = false;
  function seedSound() {
    lastPassT = verdict.t <= L.targetThreshold;
    lastPassB = verdict.b >= L.bellThreshold;
  }
  function announce() {
    const pt = verdict.t <= L.targetThreshold, pb = verdict.b >= L.bellThreshold;
    if (pt !== lastPassT) (pt ? snd.met : snd.lost)('target');
    if (pb !== lastPassB) (pb ? snd.met : snd.lost)('bell');
    lastPassT = pt; lastPassB = pb;
  }
  function closenessToStill() {
    const span = L.baseT - L.targetThreshold;
    return span > 0 ? (L.baseT - verdict.t) / span : 1;
  }

  // ---------- level ----------
  const LEVELS = window.PINS_LEVELS || [];
  let li = 0, L = null;
  let n = 0, cols = 0, rows = 0;
  let rx, ry, px, py, vx, vy, fixed, driven, pinned;
  let sa, sb, sl, ns, free = [];
  let t = 0, pinsUsed = 0, budget = 3;
  let verdict = { t: 0, b: 0, solved: false };
  let trails = [], bufLen = 20;
  let phase = 'play';            // play | won
  let wonT = -1e9;
  let uiButtons = [], pendingBtn = null;
  let hintsShown = 0, assisted = false;

  // Which stored solution to guide toward: the one the player is already
  // closest to, so hints never contradict pins they have chosen to keep.
  function bestSolution() {
    let best = null, bestScore = -1;
    for (const s of L.solutions) {
      let score = 0;
      for (const p of s.set) if (pinned[p]) score++;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best ? best.set : [];
  }
  function hintNodes() { return bestSolution().slice(0, hintsShown); }

  function loadLevel(i) {
    L = LEVELS[i % LEVELS.length];
    cols = L.cols; rows = L.rows; n = cols * rows;
    rx = new Float64Array(n); ry = new Float64Array(n);
    px = new Float64Array(n); py = new Float64Array(n);
    vx = new Float64Array(n); vy = new Float64Array(n);
    fixed = new Uint8Array(n); driven = new Uint8Array(n); pinned = new Uint8Array(n);
    free = [];
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const i2 = c * rows + r;
      rx[i2] = c * SX; ry[i2] = r * SY;
      if (c === 0 || c === cols - 1) fixed[i2] = 1; else free.push(i2);
    }
    const dc = L.drivenEdge === 0 ? 0 : cols - 1;
    for (let r = 0; r < rows; r++) driven[dc * rows + r] = 1;
    const A = [], B = [], Ln = [];
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const i2 = c * rows + r;
      if (c + 1 < cols) { A.push(i2); B.push((c + 1) * rows + r); Ln.push(SX); }
      if (r + 1 < rows) { A.push(i2); B.push(c * rows + (r + 1)); Ln.push(SY); }
    }
    sa = Int32Array.from(A); sb = Int32Array.from(B); sl = Float64Array.from(Ln); ns = A.length;
    px.set(rx); py.set(ry); vx.fill(0); vy.fill(0);
    t = 0; pinsUsed = 0; budget = L.pins; phase = 'play'; wonT = -1e9;
    previewCache = new Map(); previewNode = -1;
    hintsShown = 0; assisted = false; pendingBtn = null;
    trails = free.map(() => []);
    layout();
    resettle();
    seedSound();
  }

  // ---- one physics step, exactly as specified ----
  function step() {
    let s = 0;
    for (let k = 0; k < L.freqs.length; k++) s += Math.sin(L.freqs[k] * t);
    const dy = L.amp * s;
    for (let i = 0; i < n; i++) {
      if (!fixed[i]) continue;
      px[i] = rx[i]; py[i] = driven[i] ? ry[i] + dy : ry[i];
    }
    for (let k = 0; k < ns; k++) {
      const a = sa[k], b = sb[k];
      const ex = px[b] - px[a], ey = py[b] - py[a];
      const d = Math.sqrt(ex * ex + ey * ey);
      if (d === 0) continue;
      const f = K * (d - sl[k]) / d, fx = f * ex, fy = f * ey;
      if (!fixed[a] && !pinned[a]) { vx[a] += fx; vy[a] += fy; }
      if (!fixed[b] && !pinned[b]) { vx[b] -= fx; vy[b] -= fy; }
    }
    for (let i = 0; i < n; i++) {
      if (fixed[i]) continue;
      if (pinned[i]) { px[i] = rx[i]; py[i] = ry[i]; vx[i] = 0; vy[i] = 0; continue; }
      vx[i] *= (1 - C); vy[i] *= (1 - C);
      px[i] += vx[i]; py[i] += vy[i];
    }
    t++;
  }

  // Run the transient out and measure, invisibly. Same windows as verification.
  function resettle() {
    px.set(rx); py.set(ry); vx.fill(0); vy.fill(0); t = 0;
    for (let i = 0; i < WARM; i++) step();
    let at = 0, ab = 0;
    for (let i = 0; i < MEAS; i++) {
      step();
      const dxa = px[L.target] - rx[L.target], dya = py[L.target] - ry[L.target];
      const dxb = px[L.bell] - rx[L.bell], dyb = py[L.bell] - ry[L.bell];
      at += dxa * dxa + dya * dya; ab += dxb * dxb + dyb * dyb;
    }
    verdict.t = Math.sqrt(at / MEAS); verdict.b = Math.sqrt(ab / MEAS);
    verdict.solved = verdict.t <= L.targetThreshold && verdict.b >= L.bellThreshold;
    if (verdict.solved && phase === 'play') {
      phase = 'won'; wonT = performance.now();
      (assisted ? snd.shown : snd.win)();
    }
    for (const tr of trails) tr.length = 0;
  }

  // ---------- preview ----------
  // What would this pin do? Measured on a private copy of the web so the live
  // one is never disturbed. Safe to show: the gate measured that taking the best
  // single pin each time still fails or lands >=1.15x worse on 52% of boards, so
  // giving away every single-pin effect does not give away the puzzle — the
  // difficulty lives in how three pins interact.
  function measureWith(pinSet) {
    const qx = Float64Array.from(rx), qy = Float64Array.from(ry);
    const wx = new Float64Array(n), wy = new Float64Array(n);
    const pin = new Uint8Array(n);
    for (const p of pinSet) pin[p] = 1;
    let at = 0, ab = 0;
    for (let s = 0; s < WARM + MEAS; s++) {
      let sum = 0;
      for (let k = 0; k < L.freqs.length; k++) sum += Math.sin(L.freqs[k] * s);
      const dy = L.amp * sum;
      for (let i = 0; i < n; i++) { if (!fixed[i]) continue; qx[i] = rx[i]; qy[i] = driven[i] ? ry[i] + dy : ry[i]; }
      for (let k = 0; k < ns; k++) {
        const a = sa[k], b = sb[k];
        const ex = qx[b] - qx[a], ey = qy[b] - qy[a];
        const d = Math.sqrt(ex * ex + ey * ey); if (d === 0) continue;
        const f = K * (d - sl[k]) / d, fx = f * ex, fy = f * ey;
        if (!fixed[a] && !pin[a]) { wx[a] += fx; wy[a] += fy; }
        if (!fixed[b] && !pin[b]) { wx[b] -= fx; wy[b] -= fy; }
      }
      for (let i = 0; i < n; i++) {
        if (fixed[i]) continue;
        if (pin[i]) { qx[i] = rx[i]; qy[i] = ry[i]; wx[i] = 0; wy[i] = 0; continue; }
        wx[i] *= (1 - C); wy[i] *= (1 - C); qx[i] += wx[i]; qy[i] += wy[i];
      }
      if (s >= WARM) {
        const ax = qx[L.target] - rx[L.target], ay = qy[L.target] - ry[L.target];
        const bx = qx[L.bell] - rx[L.bell], by = qy[L.bell] - ry[L.bell];
        at += ax * ax + ay * ay; ab += bx * bx + by * by;
      }
    }
    return { t: Math.sqrt(at / MEAS), b: Math.sqrt(ab / MEAS) };
  }
  let previewCache = new Map(), previewNode = -1;
  function previewFor(i) {
    if (previewCache.has(i)) return previewCache.get(i);
    const set = [];
    for (const j of free) if (j !== i && pinned[j]) set.push(j);
    if (!pinned[i]) { if (pinsUsed >= budget) return null; set.push(i); }
    const r = measureWith(set);
    previewCache.set(i, r);
    return r;
  }

  // ---------- layout ----------
  let scale = 1, ox = 0, oy = 0;
  function layout() {
    const padX = 40, padTop = 96, padBot = 124;   // padBot leaves room for the control row
    const wSim = (cols - 1) * SX, hSim = (rows - 1) * SY;
    const availW = Math.max(80, LW - padX * 2), availH = Math.max(80, LH - padTop - padBot);
    scale = Math.max(0.25, Math.min(availW / (wSim + 80), availH / (hSim + 80)));
    ox = (LW - wSim * scale) / 2;
    oy = padTop + (availH - hSim * scale) / 2;
  }
  // Displacement is magnified for DISPLAY only. The physics runs at a small,
  // verified-stable amplitude (~6 sim units at the target); the brief's "18
  // display pixels" is reached here, in the renderer, which is exactly where it
  // says to make visual adjustments. Positions are rest + displacement * MAG.
  const MAG = 2.2;
  const sx = i => ox + (rx[i] + (px[i] - rx[i]) * MAG) * scale;
  const sy = i => oy + (ry[i] + (py[i] - ry[i]) * MAG) * scale;

  function setCanvasVars() {
    if (isMobile()) { LW = window.innerWidth || 390; LH = window.innerHeight || 700; }
    else { LW = 900; LH = 560; }
    document.body.style.setProperty('--canvas-w', LW + 'px');
    document.body.style.setProperty('--canvas-h', LH + 'px');
  }
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const r = canvas.getBoundingClientRect();
    const bW = Math.round((r.width || LW) * dpr), bH = Math.round((r.height || LH) * dpr);
    if (canvas.width !== bW) canvas.width = bW;
    if (canvas.height !== bH) canvas.height = bH;
    ctx.setTransform(Math.min(bW / LW, bH / LH), 0, 0, Math.min(bW / LW, bH / LH), 0, 0);
  }
  const wrap = canvas.parentElement;
  function fitFullscreen() {
    if (isMobile()) { wrap.style.width = window.innerWidth + 'px'; wrap.style.height = window.innerHeight + 'px'; }
    else { wrap.style.width = LW + 'px'; wrap.style.height = LH + 'px'; }
  }
  // Must redraw: without it a resize leaves a stale canvas until the next rAF,
  // and rAF is throttled to nothing in some embedded browsers.
  function onResize() { setCanvasVars(); fitFullscreen(); resizeCanvas(); layout(); if (L) render(); }
  window.addEventListener('resize', onResize);
  // The splash covers the board for its first two seconds, and on some browsers
  // the wrap is not at its final size until it is gone. Re-measure on the way out.
  window.addEventListener('splash-done', onResize);
  setTimeout(onResize, 0); setTimeout(onResize, 300);

  // ---------- render ----------
  function meanAmpDisplay() {
    let s = 0, c = 0;
    for (const i of free) {
      if (pinned[i]) continue;
      const dx = px[i] - rx[i], dy = py[i] - ry[i];
      s += Math.hypot(dx, dy) * MAG * scale; c++;   // must match the drawn amplitude
    }
    return c ? s / c : 0;
  }

  function render() {
    uiButtons = [];                  // rebuilt every frame; without this it grows forever
    ctx.clearRect(0, 0, LW, LH);
    ctx.fillStyle = GROUND; ctx.fillRect(0, 0, LW, LH);

    // springs
    ctx.strokeStyle = SPRING; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < ns; k++) { ctx.moveTo(sx(sa[k]), sy(sa[k])); ctx.lineTo(sx(sb[k]), sy(sb[k])); }
    ctx.stroke();

    // trails — velocity read as length, which the eye measures far better than
    // it measures a sub-pixel displacement
    if (!REDUCED) {
      ctx.lineCap = 'round';
      for (let fi = 0; fi < free.length; fi++) {
        const i = free[fi], tr = trails[fi];
        if (pinned[i] || tr.length < 4) continue;
        for (let j = 1; j < tr.length; j++) {
          const f = j / (tr.length - 1);
          ctx.strokeStyle = 'rgba(143,200,240,' + (0.6 * f).toFixed(3) + ')';
          ctx.lineWidth = 0.6 + 3.2 * f;
          ctx.beginPath();
          ctx.moveTo(tr[j - 1][0], tr[j - 1][1]);
          ctx.lineTo(tr[j][0], tr[j][1]);
          ctx.stroke();
        }
      }
    } else {
      // reduced motion: a static envelope segment through each node, so
      // amplitude is still legible with nothing moving
      ctx.strokeStyle = TRAIL; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (const i of free) {
        if (pinned[i]) continue;
        const a = envelope[i] * scale;
        ctx.beginPath(); ctx.moveTo(ox + rx[i] * scale, oy + ry[i] * scale - a);
        ctx.lineTo(ox + rx[i] * scale, oy + ry[i] * scale + a); ctx.stroke();
      }
    }

    // anchors
    ctx.fillStyle = ANCHOR;
    for (let i = 0; i < n; i++) if (fixed[i]) ctx.fillRect(sx(i) - 5, sy(i) - 5, 10, 10);

    // markers
    ring(L.target, TARGET_RING, 'GO STILL'); ring(L.bell, BELL_RING, 'KEEP RINGING');

    // hinted nodes: a dashed ring in the PIN colour reads as "a pin belongs
    // here" without needing a new colour or a legend. Static, never pulsing —
    // section 7.5 forbids any moving pixel that is not the simulation.
    for (const i of hintNodes()) {
      if (pinned[i]) continue;
      const hx = ox + rx[i] * scale, hy = oy + ry[i] * scale;
      ctx.strokeStyle = PINNED; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(hx, hy, 11, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = PINNED; ctx.font = '800 10px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('PIN HERE', hx, hy + 15);
      ctx.textAlign = 'left';
    }

    // the node being previewed
    if (previewNode >= 0) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(sx(previewNode), sy(previewNode), 12, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
    }

    // node heads
    for (const i of free) {
      if (pinned[i]) { ctx.fillStyle = PINNED; ctx.beginPath(); ctx.arc(sx(i), sy(i), 7, 0, 7); ctx.fill(); }
      else { ctx.fillStyle = HEAD; ctx.beginPath(); ctx.arc(sx(i), sy(i), 3.5, 0, 7); ctx.fill(); }
    }
    hud();
    if (phase === 'won') bloom();
  }
  // Rings carry their JOB as a label, not a colour name. "Pale" and "amber"
  // both fail a second-language player, and so would any colour word — the
  // ring's colour should reinforce the instruction, never carry it.
  function ring(i, col, label) {
    const cx = ox + rx[i] * scale, cy = oy + ry[i] * scale;
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 13, 0, 7); ctx.stroke();
    ctx.fillStyle = col; ctx.font = '800 11px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(label, cx, cy - 17);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  // Win bloom: one shot, then stop. Forbidden during play — additive brightness
  // encodes node density as well as motion, which is a false signal.
  function bloom() {
    const k = Math.max(0, 1 - (performance.now() - wonT) / 700);
    if (k <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const i of free) {
      const sp = Math.hypot(vx[i], vy[i]);
      ctx.fillStyle = 'rgba(143,200,240,' + (0.5 * k * Math.min(1, sp * 3)).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(sx(i), sy(i), 10, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function hud() {
    const hs = Math.max(0.7, Math.min(1, LW / 900));
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.round(26 * hs) + 'px Inter, sans-serif';
    ctx.fillText('PINS', 28, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.font = '600 ' + Math.round(15 * hs) + 'px Inter, sans-serif';
    // "pins 3 / 3" reads as "3 used of 3" to most people, which is the exact
    // opposite of what it means. Spell out that the number is what is left.
    ctx.fillText('Level ' + (li + 1) + '   ·   ' + (budget - pinsUsed) + ' of ' + budget + ' pins left', 28, 20 + Math.round(30 * hs));

    // Two gauges instead of two numbers. A bare percentage does not say whether
    // you are near the line; a bar with the line drawn on it does. Thresholds
    // come from the level, never hardcoded.
    const pv = previewNode >= 0 ? previewFor(previewNode) : null;
    const bw = Math.round(Math.min(300, LW * 0.34)), bh = 12;
    const bx = LW - 28 - bw, by = 22;
    gauge(bx, by, bw, bh, 'GO STILL', verdict.t / L.baseT, L.targetThreshold / L.baseT,
      'below', TARGET_RING, pv ? pv.t / L.baseT : null, hs);
    gauge(bx, by + Math.round(46 * hs), bw, bh, 'KEEP RINGING', verdict.b / L.baseB, L.bellThreshold / L.baseB,
      'above', BELL_RING, pv ? pv.b / L.baseB : null, hs);

    ctx.textAlign = 'center';
    if (phase === 'won') {
      // A solved-for-you win is labelled as one. Same rule Palette ships: the
      // board is cleared, but it does not read as your clear.
      ctx.fillStyle = assisted ? '#B9A2F5' : '#DCEEFF';
      ctx.font = '800 ' + Math.round(30 * hs) + 'px Inter, sans-serif';
      ctx.fillText(assisted ? 'SOLVED FOR YOU' : 'HELD STILL', LW / 2, LH - 112);
      ctx.fillStyle = 'rgba(255,255,255,0.86)'; ctx.font = '500 ' + Math.round(16 * hs) + 'px Inter, sans-serif';
      ctx.fillText(assisted ? 'not counted as a solve — tap the web for the next one' : 'tap for the next web', LW / 2, LH - 80);
      // An assisted win must be undoable, or seeing the answer costs you the
      // chance to work it out. A genuine win needs no such escape.
      if (assisted) pill('Clear and try it myself', LW / 2, LH - 38, 'clear', false, () => clearPins(true), hs);
    } else {
      drawControls(hs);
      // was rgba(255,255,255,0.42) on #0A1A2F, which fails the 4.5:1 floor
      ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = '500 ' + Math.round(15 * hs) + 'px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(previewNode >= 0
        ? 'Preview — release to leave it unpinned'
        : hintsShown > 0
          ? 'A dashed teal ring marks a node that belongs in the solution.'
          : 'Tap a node to pin it. Hold a node to preview what it would do.', LW / 2, LH - 34);
    }
    ctx.textAlign = 'left';
  }

  function pill(label, cx, cy, id, dim, act, hs) {
    ctx.font = '700 ' + Math.round(14 * hs) + 'px Inter, sans-serif';
    const w = Math.round(ctx.measureText(label).width + 34), h = Math.round(36 * hs);
    const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.42)'; roundRect(x, y, w, h, h / 2); ctx.stroke();
    ctx.fillStyle = dim ? 'rgba(255,255,255,0.58)' : 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, y + h / 2 + 1);
    ctx.textBaseline = 'top';
    if (!dim) uiButtons.push({ x, y, w, h, id, act });
    return w;
  }
  // Flat outlined speaker drawn on canvas — no emoji glyphs anywhere.
  function soundPill(cx, cy, w, hs) {
    const h = Math.round(36 * hs), x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.42)'; roundRect(x, y, w, h, h / 2); ctx.stroke();
    const on = snd.on(), s = Math.round(8 * hs);
    ctx.strokeStyle = on ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.58)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.8, cy - s * 0.3); ctx.lineTo(cx - s * 0.35, cy - s * 0.3);
    ctx.lineTo(cx + s * 0.15, cy - s * 0.75); ctx.lineTo(cx + s * 0.15, cy + s * 0.75);
    ctx.lineTo(cx - s * 0.35, cy + s * 0.3); ctx.lineTo(cx - s * 0.8, cy + s * 0.3);
    ctx.closePath(); ctx.fill();
    if (on) {
      ctx.beginPath(); ctx.arc(cx + s * 0.35, cy, s * 0.42, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + s * 0.35, cy, s * 0.78, -0.85, 0.85); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(cx + s * 0.42, cy - s * 0.42); ctx.lineTo(cx + s * 1.0, cy + s * 0.42);
      ctx.moveTo(cx + s * 1.0, cy - s * 0.42); ctx.lineTo(cx + s * 0.42, cy + s * 0.42); ctx.stroke();
    }
    uiButtons.push({ x, y, w, h, id: 'sound', act: () => { snd.ready(); snd.toggle(); } });
    return w;
  }
  function drawControls(hs) {
    const sol = bestSolution();
    const cy = LH - 78, gap = Math.round(10 * hs);
    const labels = [
      ['Hint', 'hint', hintsShown >= sol.length, () => { snd.hint(); hintsShown = Math.min(sol.length, hintsShown + 1); }],
      ['Solve for me', 'solve', false, solveForMe],
      ['Clear pins', 'clear', pinsUsed === 0, () => clearPins(false)],
    ];
    ctx.font = '700 ' + Math.round(14 * hs) + 'px Inter, sans-serif';
    const wS = Math.round(42 * hs);
    let total = wS + gap;
    for (const [t] of labels) total += Math.round(ctx.measureText(t).width + 34) + gap;
    total -= gap;
    let x = Math.round(LW / 2 - total / 2);
    x += soundPill(x + wS / 2, cy, wS, hs) + gap;
    for (const [t, id, dim, act] of labels) {
      ctx.font = '700 ' + Math.round(14 * hs) + 'px Inter, sans-serif';
      const w = pill(t, x + Math.round(ctx.measureText(t).width + 34) / 2, cy, id, dim, act, hs);
      x += w + gap;
    }
  }
  // resetHints is for the escape hatch after a solve-for-me: leaving every
  // PIN HERE ring on screen would make "try it myself" impossible. The plain
  // Clear pins button keeps the hints the player has already spent.
  function clearPins(resetHints) {
    pinned.fill(0); pinsUsed = 0;
    previewCache = new Map(); previewNode = -1;
    phase = 'play'; assisted = false;
    if (resetHints) hintsShown = 0;
    snd.clear();
    resettle();
    seedSound();                    // back to the empty board: nothing to announce
  }
  function solveForMe() {
    const set = L.solutions[0].set;
    pinned.fill(0); pinsUsed = 0;
    for (const p of set) { pinned[p] = 1; pinsUsed++; }
    previewCache = new Map(); previewNode = -1;
    hintsShown = set.length;
    assisted = true;
    phase = 'play';                 // let resettle() award the win so the verdict is real
    resettle();
    seedSound();                    // resettle already sounded the outcome
  }

  // One condition as a bar with its pass line marked, plus a ghost showing
  // where the held pin would move it.
  function gauge(x, y, w, h, label, val, thresh, dir, col, preview, hs) {
    const clamp01 = v => Math.max(0, Math.min(1, v));
    const ok = v => dir === 'below' ? v <= thresh : v >= thresh;
    const pass = ok(val), prevPass = preview != null ? ok(preview) : null;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = col; ctx.font = '800 ' + Math.round(12 * hs) + 'px Inter, sans-serif';
    ctx.fillText(label, x, y - 6);
    // While previewing, the status shows what this pin WOULD leave you with —
    // otherwise both bars just dim and the player cannot tell which change helps.
    ctx.textAlign = 'right';
    ctx.font = '700 ' + Math.round(12 * hs) + 'px Inter, sans-serif';
    const shown = preview != null ? prevPass : pass;
    ctx.fillStyle = shown ? '#9FE6A4' : (preview != null ? '#F2836B' : 'rgba(255,255,255,0.82)');
    ctx.fillText((preview != null ? '→ ' : '') +
      (shown ? 'MET' : (dir === 'below' ? 'needs under ' : 'needs over ') + Math.round(thresh * 100) + '%'),
      x + w, y - 6);

    ctx.fillStyle = 'rgba(255,255,255,0.10)'; roundRect(x, y, w, h, h / 2); ctx.fill();
    // the satisfying side of the line, shaded so the goal reads without words
    ctx.fillStyle = 'rgba(159,230,164,0.13)';
    if (dir === 'below') roundRect(x, y, Math.max(2, w * clamp01(thresh)), h, h / 2);
    else roundRect(x + w * clamp01(thresh), y, Math.max(2, w * (1 - clamp01(thresh))), h, h / 2);
    ctx.fill();
    ctx.fillStyle = pass ? '#9FE6A4' : col;
    roundRect(x, y, Math.max(3, w * clamp01(val)), h, h / 2); ctx.fill();
    // The preview is drawn ON TOP as a delta band plus a marker, never as a
    // fill underneath: the interesting previews make the value SMALLER, and a
    // ghost fill under the current bar is invisible in exactly that case.
    if (preview != null) {
      const a = w * clamp01(val), b = w * clamp01(preview);
      // tinted by whether the previewed state PASSES, so a helpful change and a
      // fatal one never look the same
      ctx.fillStyle = prevPass ? 'rgba(159,230,164,0.45)' : 'rgba(242,131,107,0.45)';
      ctx.fillRect(x + Math.min(a, b), y + 1, Math.max(2, Math.abs(a - b)), h - 2);
      ctx.strokeStyle = prevPass ? '#9FE6A4' : '#F2836B'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x + b, y - 1); ctx.lineTo(x + b, y + h + 1); ctx.stroke();
    }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + w * clamp01(thresh), y - 3); ctx.lineTo(x + w * clamp01(thresh), y + h + 3); ctx.stroke();
    ctx.textBaseline = 'top';
  }
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- loop: one physics step per frame, so the vibration is visible ----------
  const envelope = new Float64Array(4096);
  function frame() {
    step();
    const bl = Math.max(6, Math.min(40, Math.round(44 / (meanAmpDisplay() + 1.2))));
    bufLen = bl;
    for (let fi = 0; fi < free.length; fi++) {
      const i = free[fi];
      const tr = trails[fi];
      tr.push([sx(i), sy(i)]);
      while (tr.length > bl) tr.shift();
      const d = Math.hypot(px[i] - rx[i], py[i] - ry[i]);
      envelope[i] = Math.max(envelope[i] * 0.995, d);
    }
    render();
    requestAnimationFrame(frame);
  }

  // ---------- input ----------
  function pick(x, y) {
    let best = -1, bd = 26 * 26;
    for (const i of free) {
      const dx = x - (ox + rx[i] * scale), dy = y - (oy + ry[i] * scale);
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // Quick tap places or lifts a pin. Press and hold peeks at what that pin
  // would do without spending it — a hold never commits.
  const HOLD_MS = 220;
  let holdTimer = 0, downNode = -1, held = false;
  function toLocal(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (LW / r.width), y: (e.clientY - r.top) * (LH / r.height) };
  }
  const pinnableNode = i => i >= 0 && i !== L.target && i !== L.bell;

  const hitBtn = (x, y) => uiButtons.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  canvas.addEventListener('pointerdown', e => {
    snd.ready();                               // browsers only allow audio after a gesture
    if (phase === 'won') return;
    const { x, y } = toLocal(e);
    pendingBtn = hitBtn(x, y);
    if (pendingBtn) return;                    // buttons win over nodes
    const i = pick(x, y);
    if (!pinnableNode(i)) return;
    downNode = i; held = false;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { held = true; previewNode = i; }, HOLD_MS);
  });
  canvas.addEventListener('pointermove', e => {
    if (downNode >= 0) return;                 // a press in progress owns the preview
    // Gate on the ACTUAL pointer, not a mode guessed at load: a touchscreen
    // laptop then gets both, and a 0-width first frame cannot disable hover.
    if (!REDUCED && e.pointerType !== 'touch') {   // hover peek, no press needed
      const { x, y } = toLocal(e);
      const i = pick(x, y);
      previewNode = pinnableNode(i) ? i : -1;
    }
  });
  canvas.addEventListener('pointerleave', () => { if (downNode < 0) previewNode = -1; });
  canvas.addEventListener('pointercancel', () => { clearTimeout(holdTimer); downNode = -1; held = false; previewNode = -1; });
  canvas.addEventListener('pointerup', e => {
    e.preventDefault();
    clearTimeout(holdTimer);
    if (pendingBtn) {
      // match on id, not object identity — the row is rebuilt every frame by
      // render(), so the object captured on press no longer exists by release
      const { x, y } = toLocal(e);
      const b = hitBtn(x, y);
      if (b && b.id === pendingBtn.id) b.act();
      pendingBtn = null; downNode = -1; return;
    }
    if (phase === 'won') { li = (li + 1) % LEVELS.length; loadLevel(li); downNode = -1; return; }
    const wasHeld = held, i = downNode;
    downNode = -1; held = false;
    previewNode = -1;
    if (wasHeld || i < 0) return;              // a hold peeks, it never commits
    if (pinned[i]) { pinned[i] = 0; pinsUsed--; snd.unpin(); }
    else { if (pinsUsed >= budget) return; pinned[i] = 1; pinsUsed++; snd.pin(); }
    previewCache = new Map();                  // the board changed; every preview is stale
    resettle();
    // The pin lands, then a beat later you hear what it did. Cause, then effect
    // — the same order the eye reads the gauges in.
    const c = closenessToStill();
    if (phase !== 'won') setTimeout(() => snd.reading(c), 120);
    announce();
  });

  window.__pins = {
    get state() {
      return {
        level: li + 1, of: LEVELS.length, dims: cols + 'x' + rows, pinsUsed, budget,
        target: +verdict.t.toFixed(3), bell: +verdict.b.toFixed(3),
        targetPct: +(100 * verdict.t / L.baseT).toFixed(1), bellPct: +(100 * verdict.b / L.baseB).toFixed(1),
        solved: verdict.solved, phase, bufLen,
      };
    },
    solution() { return L.solutions[0].set; },
    preview(i) { const r = previewFor(i); return r ? { t: +r.t.toFixed(4), b: +r.b.toFixed(4) } : null; },
    get hoverable() { return free.filter(i => i !== L.target && i !== L.bell); },
    at(i) { return { x: ox + rx[i] * scale, y: oy + ry[i] * scale }; },
    setPreview(i) { previewNode = i; return i < 0 ? null : this.preview(i); },
    // uiButtons only exists after a render, and rAF is throttled inside embedded
    // preview browsers — so a harness that just reads .buttons reads whatever the
    // last frame happened to leave behind. Force the frame instead.
    renderNow() { render(); return this.buttons; },
    get buttons() { return uiButtons.map(b => ({ id: b.id, cx: b.x + b.w / 2, cy: b.y + b.h / 2 })); },
    press(id) { render(); const b = uiButtons.find(z => z.id === id); if (!b) return 'no button ' + id; b.act(); render(); return this.state; },
    get hints() { return { shown: hintsShown, nodes: hintNodes(), assisted }; },
    apply(set) { pinned.fill(0); pinsUsed = 0; for (const p of set) { pinned[p] = 1; pinsUsed++; } resettle(); return this.state; },
    goto(i) { li = (i - 1 + LEVELS.length) % LEVELS.length; loadLevel(li); return this.state; },
    levels: LEVELS,
  };

  setCanvasVars(); resizeCanvas(); fitFullscreen();
  if (!LEVELS.length) {
    ctx.fillStyle = GROUND; ctx.fillRect(0, 0, LW, LH);
    ctx.fillStyle = '#fff'; ctx.font = '600 16px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('no baked levels', LW / 2, LH / 2);
  } else {
    loadLevel(0);
    requestAnimationFrame(frame);
  }
})();
