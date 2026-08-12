/* ============================================================
   Basin · a Zamborin Game — PROTOTYPE, build order steps 1-4

   A landscape of square cells, each with an integer height 0..6. A spring
   releases a FINITE amount of water. Water runs downhill, pools in hollows,
   and spills onward when a hollow fills. One verb: press a marked cell and
   drag up or down to change its height.

   WHAT IS DELIBERATELY NOT HERE YET. The brief gates at step 4: play it and
   report a verdict on the verb before building anything cosmetic. So the
   shoots are placeholder rings, not the five-stage growth art of §6.2, and
   there are no reeds. Everything the verdict depends on IS here: the exact
   two-pass water model, the editable set with decoys, live recompute during
   the drag, and the ground itself as the feedback.
   ============================================================ */
(() => {
  'use strict';

  let LW = 800, LH = 800;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const BG_TOP = '#1B2A47', BG_MID = '#131F36', BG_BOT = '#0E1726';

  // §6.1 — three ramps indexed by height 0..6, plus a pond ramp by depth.
  const PARCHED = ['#443f36', '#4e483c', '#585142', '#625a48', '#6c634e', '#766c54', '#80755a'];
  const GREEN   = ['#23543a', '#2a6244', '#31704e', '#387e58', '#3f8c62', '#469a6c', '#4da876'];
  const POND_DEEP = '#2170a8', POND_SHALLOW = '#2a80bc';
  const CONTOUR = '#0E1726';
  const SHOOT_STEM = '#17753d', SHOOT_LEAF = '#2fae5e', SHOOT_LIGHT = '#93dca8', SHOOT_HUSK = '#8a7a5c';
  const METER_FILL = '#3a9bde';

  const HMAX = 6;
  const STEP_PX = 18;          // §5 — 18px of vertical travel per height step
  const GROW_DUR = 700;

  const NBR = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  // ---------- MODE + CANVAS (Bloom's block, verbatim) ----------
  const MODE = (matchMedia('(pointer: coarse)').matches || window.innerWidth < 768) ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);
  function setCanvasVars() {
    if (MODE === 'mobile') { LW = window.innerWidth; LH = window.innerHeight; }
    else { LW = 560; LH = 640; }
    document.body.style.setProperty('--canvas-w', LW + 'px');
    document.body.style.setProperty('--canvas-h', LH + 'px');
  }
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const dW = rect.width || LW, dH = rect.height || LH;
    const bW = Math.round(dW * dpr), bH = Math.round(dH * dpr);
    if (canvas.width !== bW) canvas.width = bW;
    if (canvas.height !== bH) canvas.height = bH;
    const scale = Math.min(bW / LW, bH / LH);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  const gameWrap = canvas.parentElement;
  function fitFullscreen() {
    if (MODE === 'mobile') {
      gameWrap.style.width = window.innerWidth + 'px';
      gameWrap.style.height = window.innerHeight + 'px';
      return;
    }
    const active = document.body.classList.contains('focus-mode');
    if (!active) { gameWrap.style.width = ''; gameWrap.style.height = ''; }
    else {
      const vw = window.innerWidth, vh = window.innerHeight, aspect = LW / LH;
      let cw = vw, ch = Math.round(vw / aspect);
      if (ch > vh) { ch = vh; cw = Math.round(vh * aspect); }
      gameWrap.style.width = cw + 'px'; gameWrap.style.height = ch + 'px';
    }
  }
  function onResize() {
    if (MODE === 'mobile') setCanvasVars();
    fitFullscreen(); resizeCanvas(); layout(); render(performance.now());
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', () => render(performance.now()));

  // ---------- state ----------
  let R = 9, C = 8, cell = 60, ox = 0, oy = 0;
  let height = [], solvedH = [], editable = [], isShoot = [], growT = [];
  let filled = [], depth = [], wet = [], spent = 0;
  let spring = 0, BUDGET = 0, par = 0;
  let level = 1, moves = 0, phase = 'play';
  let raf = 0, fb = 0, animEnd = 0, wonT = -1e9, history = [], uiButtons = [];
  let drag = null;
  const LS = 'zamborin-basin.level';
  function saveLevel() { try { localStorage.setItem(LS, String(level)); } catch (e) {} }
  function loadLevel() { try { const v = parseInt(localStorage.getItem(LS), 10); return (v >= 1 && v <= 999) ? v : 1; } catch (e) { return 1; } }

  const idx = (r, c) => r * C + c;
  const rc = (i) => ({ r: (i / C) | 0, c: i % C });
  const TOP_BAND = 100, BOT_BAND = 96;
  const sidePad = () => (LW < 520 ? 8 : 30);

  // §8 — cells must be at least 44px on the smallest phone. Rather than assume
  // 8 columns always clears that, derive the column count FROM the 44px floor:
  // at 360px wide, 8 columns would be 43px, which breaks the promise.
  function gridDims(lvl) {
    if (MODE === 'mobile') {
      const availW = Math.max(60, LW - sidePad() * 2);
      const cols = Math.max(5, Math.min(8, Math.floor(availW / 44)));
      const availH = Math.max(60, LH - TOP_BAND - BOT_BAND);
      const rows = Math.max(7, Math.min(11, Math.floor(availH / (availW / cols))));
      return [rows, cols];
    }
    const c = 6 + Math.min(Math.floor((lvl - 1) / 3), 6);      // 6 → 12 wide
    const r = Math.max(5, Math.min(9, Math.round(c * 0.75)));  // → 9 tall
    return [r, c];
  }
  function layout() {
    const availW = Math.max(60, LW - sidePad() * 2);
    const availH = Math.max(60, LH - TOP_BAND - BOT_BAND);
    cell = Math.max(8, Math.floor(Math.min(availW / C, availH / R)));
    ox = Math.round((LW - C * cell) / 2);
    oy = Math.round(TOP_BAND + (availH - R * cell) / 2);
  }
  const ccx = (c) => ox + (c + 0.5) * cell;
  const ccy = (r) => oy + (r + 0.5) * cell;

  // ---------- §2 the water model ----------
  // A binary min-heap keyed on (value, cellIndex). The index tiebreak is not
  // decoration: with a floating tiebreak two cells at the same elevation can
  // swap order between frames, and the pond then flickers between two shapes
  // for no reason the player can see.
  function heap() {
    const a = [];
    const less = (x, y) => (x.k < y.k) || (x.k === y.k && x.i < y.i);
    return {
      size: () => a.length,
      push(k, i) {
        a.push({ k, i });
        let c = a.length - 1;
        while (c > 0) { const p = (c - 1) >> 1; if (less(a[c], a[p])) { const t = a[c]; a[c] = a[p]; a[p] = t; c = p; } else break; }
      },
      pop() {
        const top = a[0], last = a.pop();
        if (a.length) {
          a[0] = last;
          let p = 0;
          for (;;) {
            const l = 2 * p + 1, r = l + 1; let m = p;
            if (l < a.length && less(a[l], a[m])) m = l;
            if (r < a.length && less(a[r], a[m])) m = r;
            if (m === p) break;
            const t = a[p]; a[p] = a[m]; a[m] = t; p = m;
          }
        }
        return top;
      },
    };
  }

  // Pass 1 — priority-flood. Raise every depression to its spill elevation,
  // treating the grid boundary as an outlet (Barnes, Lehman & Mulla 2014).
  function computeFilled(h) {
    const n = R * C, out = new Array(n).fill(Infinity), q = heap();
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      if (r === 0 || c === 0 || r === R - 1 || c === C - 1) { const i = idx(r, c); out[i] = h[i]; q.push(out[i], i); }
    }
    while (q.size()) {
      const { i } = q.pop(), { r, c } = rc(i);
      for (const [dr, dc] of NBR) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
        const j = idx(nr, nc);
        if (out[j] !== Infinity) continue;
        out[j] = Math.max(h[j], out[i]);
        q.push(out[j], j);
      }
    }
    return out;
  }

  // Pass 2 — route the spring's water over the filled surface, spending the
  // budget. A hollow costs its whole depth before the water may pass, which is
  // the entire game: a deep pond on the route drinks everything beyond it.
  function routeWater(h, fil, budget) {
    const n = R * C;
    const dep = new Array(n), w = new Array(n).fill(false);
    for (let i = 0; i < n; i++) dep[i] = fil[i] - h[i];
    let used = 0;
    const q = heap();
    q.push(fil[spring], spring);
    while (q.size()) {
      const { i } = q.pop();
      if (w[i]) continue;
      if (used + dep[i] > budget) break;
      used += dep[i];
      w[i] = true;
      const { r, c } = rc(i);
      for (const [dr, dc] of NBR) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
        const j = idx(nr, nc);
        if (!w[j] && fil[j] <= fil[i]) q.push(fil[j], j);
      }
    }
    return { wet: w, depth: dep, spent: used };
  }

  function computeWater(now) {
    const was = wet;
    filled = computeFilled(height);
    const res = routeWater(height, filled, BUDGET);
    wet = res.wet; depth = res.depth; spent = res.spent;
    // rising-edge growth trigger, exactly Bloom's discipline: stamp only on the
    // dry -> wet transition so re-watering a grown shoot does not restart it
    for (let i = 0; i < R * C; i++) if (isShoot[i] && wet[i] && !(was && was[i])) growT[i] = now || performance.now();
  }
  function shootsGrown() { let n = 0, t = 0; for (let i = 0; i < R * C; i++) if (isShoot[i]) { t++; if (wet[i]) n++; } return [n, t]; }
  function wetCells() { let n = 0; for (let i = 0; i < R * C; i++) if (wet[i]) n++; return n; }

  // ---------- sound ----------
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zamborin-basin.sound' }) : null;
  const snd = {
    on: () => !!(sfx && sfx.isOn()),
    ready() { if (sfx) sfx.ensureAudio(); },
    toggle() { if (!sfx) return; sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.tone(880, 0.05, 0.03, 'sine'); },
    step() { if (sfx) sfx.tone(150, 0.06, 0.028, 'sine'); },          // soft low thud per height step
    flow() { if (sfx) { sfx.tone(190, 0.16, 0.030, 'sine'); sfx.noise(0.10, 620, 1.1, 0.030); } },
    shoot(n) {
      if (!sfx) return;
      const s = Math.min(11, Math.max(0, n - 1));
      sfx.tone(587.33 * Math.pow(2, s / 12), 0.20, 0.042, 'triangle');
      sfx.tone(587.33 * Math.pow(2, s / 12) * 2, 0.10, 0.013, 'sine');
    },
    win() { if (sfx) sfx.arpeggio(587.33, 0.10, 2); },
    undo() { if (sfx) sfx.tone(330, 0.05, 0.018, 'sine'); },
  };
  // The generator runs computeWater dozens of times per level and must stay silent.
  let lastShoots = 0, lastWet = 0;
  function seedSound() { lastShoots = shootsGrown()[0]; lastWet = wetCells(); }
  function announceWater() {
    if (phase === 'menu') { seedSound(); return; }
    const s = shootsGrown()[0], w = wetCells();
    if (w > lastWet) snd.flow();
    if (s > lastShoots) for (let i = lastShoots + 1; i <= s; i++) snd.shoot(i);
    lastShoots = s; lastWet = w;
  }

  // ---------- §4 generation ----------
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } }
  const clampH = (v) => Math.max(0, Math.min(HMAX, v));

  // All shoots wet on the given height field, under the given budget?
  function allWet(h, budget) {
    const f = computeFilled(h);
    const r = routeWater(h, f, budget);
    for (let i = 0; i < R * C; i++) if (isShoot[i] && !r.wet[i]) return false;
    return true;
  }
  function wetCount(h, budget) {
    const r = routeWater(h, computeFilled(h), budget);
    let n = 0; for (let i = 0; i < R * C; i++) if (r.wet[i]) n++;
    return n;
  }
  // Does the budget withhold ground the terrain alone would have let water
  // reach? If not, this board is the unlimited-water game and is rejected.
  function budgetBinds(h, budget) {
    const f = computeFilled(h);
    const a = routeWater(h, f, budget), b = routeWater(h, f, 1e9);
    let na = 0, nb = 0;
    for (let i = 0; i < R * C; i++) { if (a.wet[i]) na++; if (b.wet[i]) nb++; }
    return na < nb;
  }

  function genLevel(lvl, asMenu) {
    level = lvl; saveLevel();
    const [gr, gc] = gridDims(lvl);
    R = gr; C = gc;
    const n = R * C;
    const K = Math.min(6, 4 + Math.floor((lvl - 1) / 5));        // shoots
    const N = Math.min(9, 3 + Math.floor((lvl - 1) * 0.7));      // scramble edits = par

    let built = null;
    for (let attempt = 0; attempt < 400 && !built; attempt++) {
      // 1. terrain sloping away from a high corner, plus noise
      const sr = (Math.random() < 0.5) ? 0 : R - 1, sc = (Math.random() < 0.5) ? 0 : C - 1;
      spring = idx(sr, sc);
      const h = new Array(n);
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const d = Math.abs(r - sr) + Math.abs(c - sc);
        h[idx(r, c)] = clampH(Math.round(HMAX - d * 0.5 + (Math.random() * 2 - 1) * 1.0));
      }
      h[spring] = HMAX;

      // The brief's formula is a monotone slope plus +/-1 noise, and MEASURED it
      // does not do the job: priority-flood found total depressions of 1 to 4
      // cells per board, so ponds were puddles, "spent" sat at 0 to 2 against a
      // budget of 5 to 7, and the budget never bound on any board. That is the
      // unlimited-water game §0 calls fatal, arrived at by accident.
      //
      // A slope has no local minima to find. So carve basins explicitly: a few
      // bowls, each a cell dropped hard with its neighbours dropped less, which
      // is a shape priority-flood will actually fill.
      const bowls = 1 + ((Math.random() * 2) | 0);
      for (let b = 0; b < bowls; b++) {
        const br = 1 + ((Math.random() * (R - 2)) | 0), bc = 1 + ((Math.random() * (C - 2)) | 0);
        if (idx(br, bc) === spring) continue;
        h[idx(br, bc)] = clampH(h[idx(br, bc)] - 3);
        for (const [dr, dc] of NBR) {
          const nr = br + dr, nc = bc + dc;
          if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
          if (idx(nr, nc) === spring) continue;
          h[idx(nr, nc)] = clampH(h[idx(nr, nc)] - 1);
        }
      }

      // 3. shoots spread across the map, never on the spring
      isShoot = new Array(n).fill(false); growT = new Array(n).fill(-1e9);
      const cand = [];
      for (let i = 0; i < n; i++) if (i !== spring) cand.push(i);
      shuffle(cand);
      const chosen = [];
      for (const i of cand) {
        if (chosen.length >= K) break;
        const { r, c } = rc(i);
        if (chosen.every(j => { const q = rc(j); return Math.abs(q.r - r) + Math.abs(q.c - c) >= 3; })) chosen.push(i);
      }
      if (chosen.length < K) continue;
      for (const i of chosen) isShoot[i] = true;

      // 2/4. budget with a comfortable surplus early, tightening with level
      const f0 = computeFilled(h);
      const r0 = routeWater(h, f0, 1e9);
      let need = 0;
      for (let i = 0; i < n; i++) if (r0.wet[i]) need += f0[i] - h[i];
      if (!isShootAllWet(r0.wet)) continue;
      // Slack is the whole difficulty knob and it was set far too loose. At 2-6
      // spare units, a scrambled pit costing 2 could never exceed it, so the
      // budget was decorative. Keep it to 1-3: enough that the solved board is
      // never on a knife edge, tight enough that a dug hollow really does drink
      // the water before it reaches the far side.
      const slack = Math.max(1, 3 - Math.floor((lvl - 1) / 6));
      BUDGET = need + slack;
      if (!allWet(h, BUDGET)) continue;

      // 5. scramble: raise some cells into a blocking ridge, lower others into
      // a wasting hollow. Both failure modes on purpose — the second is the one
      // the player has to discover.
      const pool = [];
      for (let i = 0; i < n; i++) if (i !== spring && !isShoot[i]) pool.push(i);
      shuffle(pool);
      const edits = [];
      const scrambled = h.slice();
      let lastPit = -1;
      for (const i of pool) {
        if (edits.length >= N) break;
        const up = edits.length % 2 === 0;
        let target = i;
        if (!up && lastPit >= 0) {
          // Dig the second and later pit cells NEXT TO the first. A lone
          // lowered cell is a one-cell dent costing one or two units; a cluster
          // is a bowl, and only a bowl can drink a budget.
          const { r, c } = rc(lastPit);
          const adj = NBR.map(([dr, dc]) => [r + dr, c + dc])
            .filter(([nr, nc]) => nr >= 0 && nr < R && nc >= 0 && nc < C)
            .map(([nr, nc]) => idx(nr, nc))
            .filter(j => j !== spring && !isShoot[j] && !edits.some(e => e.i === j));
          if (adj.length) target = adj[(Math.random() * adj.length) | 0];
        }
        const nh = clampH(scrambled[target] + (up ? 2 : -3));
        if (nh === scrambled[target]) continue;
        edits.push({ i: target, from: scrambled[target], to: nh });
        scrambled[target] = nh;
        if (!up) lastPit = target;
      }
      if (edits.length < N) continue;

      if (allWet(scrambled, BUDGET)) continue;                   // must actually break something
      // and it must break it the RIGHT way at least sometimes: the budget has
      // to be withholding ground, not just a ridge blocking the path
      if (!budgetBinds(scrambled, BUDGET)) continue;
      // The starved board must still have a RIVER on it. First cut of this
      // starved so hard that a level 7 board showed 3 wet cells out of 48: a
      // pit dug beside the spring drank the budget at source, so the player
      // faced a brown field with nothing to read and no water to steer. §3c
      // makes newly-green ground the whole feedback channel, so the loss has to
      // happen at the frontier, not at the tap. Keep at least 40% of the
      // solved board's reach.
      if (wetCount(scrambled, BUDGET) < 0.4 * wetCount(h, BUDGET)) continue;
      // undoing the N edits must restore the solution
      const restored = scrambled.slice();
      for (const e of edits) restored[e.i] = e.from;
      if (!allWet(restored, BUDGET)) continue;

      // 6. editable = the scrambled cells + an equal number of decoys
      const ed = new Array(n).fill(false);
      for (const e of edits) ed[e.i] = true;
      const decoyPool = pool.filter(i => !ed[i]);
      shuffle(decoyPool);
      for (let k = 0; k < Math.min(N, decoyPool.length); k++) ed[decoyPool[k]] = true;

      built = { h: scrambled, solved: h, editable: ed, par: edits.length };
    }

    if (!built) { BUDGET = 999; height = new Array(n).fill(3); solvedH = height.slice(); editable = new Array(n).fill(false); par = 0; }
    else { height = built.h; solvedH = built.solved; editable = built.editable; par = built.par; }

    moves = 0; phase = asMenu ? 'menu' : 'play'; history = []; animEnd = 0; wonT = -1e9; drag = null;
    wet = null;
    computeWater(); seedSound(); layout(); render(performance.now());
  }
  function isShootAllWet(w) { for (let i = 0; i < R * C; i++) if (isShoot[i] && !w[i]) return false; return true; }

  function restart() {
    if (!history.length) return;
    while (history.length) { const e = history.pop(); height[e.i] = e.from; }
    moves = 0; phase = 'play'; growT = growT.map(() => -1e9); wet = null;
    computeWater(); seedSound(); render(performance.now());
  }

  // ---------- §5 interaction ----------
  function setHeight(i, v, now) {
    v = clampH(v);
    if (v === height[i]) return false;
    height[i] = v;
    computeWater(now);
    return true;
  }
  function commitDrag(now) {
    if (!drag) return;
    const d = drag; drag = null;
    if (height[d.i] === d.from) { render(now); return; }          // no net change: no move, no sound
    history.push({ i: d.i, from: d.from });
    if (history.length > 400) history.shift();
    moves++;
    snd.step();
    announceWater();
    const [g, t] = shootsGrown();
    animEnd = Math.max(now + GROW_DUR + 40, animEnd);
    if (g === t && phase === 'play') { phase = 'won'; wonT = now; snd.win(); animEnd = Math.max(animEnd, now + GROW_DUR + 350 + 450 + 60); }
    ensureAnim(now);
  }
  function undo() {
    if (!history.length || phase !== 'play' || drag) return;
    const e = history.pop();
    height[e.i] = e.from; moves++;
    snd.undo();
    computeWater(); announceWater(); render(performance.now());
  }
  function ensureAnim(now) { render(now); if (!raf) { raf = 1; requestAnimationFrame(tick); } clearTimeout(fb); fb = setTimeout(() => { raf = 0; render(performance.now()); }, (animEnd - now) + 120); }
  function tick(t) { render(t); if (t < animEnd || drag) requestAnimationFrame(tick); else raf = 0; }

  function toLocal(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (LW / rect.width), y: (e.clientY - rect.top) * (LH / rect.height) };
  }
  function onDown(e) {
    snd.ready();
    const { x, y } = toLocal(e);
    for (const b of uiButtons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { e.preventDefault(); b.act(); return; }
    if (phase === 'menu') { phase = 'play'; render(performance.now()); return; }
    if (phase === 'won') { genLevel(level + 1); return; }
    const c = Math.floor((x - ox) / cell), r = Math.floor((y - oy) / cell);
    if (r < 0 || r >= R || c < 0 || c >= C) return;
    const i = idx(r, c);
    if (!editable[i]) return;                                     // §5 — non-editable cells ignore the gesture entirely
    e.preventDefault();
    drag = { i, y0: y, from: height[i], base: height[i], id: e.pointerId };
    canvas.setPointerCapture?.(e.pointerId);
    ensureAnim(performance.now());
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    const { y } = toLocal(e);
    // up = raise, down = lower. Live recompute on every step (§3b): the river
    // has to move under the finger, not after release.
    const steps = Math.round((drag.y0 - y) / STEP_PX);
    const want = clampH(drag.base + steps);
    if (want !== height[drag.i]) { setHeight(drag.i, want, performance.now()); render(performance.now()); }
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    commitDrag(performance.now());
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'z' || e.key === 'Z') undo();
    if (e.key === 'r' || e.key === 'R') restart();
    if (e.key === 'n' || e.key === 'N') genLevel(++level);
  });

  // ---------- render ----------
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function roundRect(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function cellFill(i) {
    if (!wet[i]) return PARCHED[clampH(height[i])];
    if (depth[i] > 0) return depth[i] >= 2 ? POND_DEEP : POND_SHALLOW;
    return GREEN[clampH(height[i])];
  }

  function render(now) {
    ctx.clearRect(0, 0, LW, LH);
    const bg = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    bg.addColorStop(0, BG_TOP); bg.addColorStop(0.6, BG_MID); bg.addColorStop(1, BG_BOT);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);
    uiButtons = [];

    // ground
    for (let i = 0; i < R * C; i++) {
      const { r, c } = rc(i);
      ctx.fillStyle = cellFill(i);
      ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell);
    }

    // §6.1 contour lines — a dark edge wherever two cells differ in height.
    // This one detail is what makes flat colour read as terrain.
    ctx.strokeStyle = CONTOUR; ctx.lineWidth = 1.6; ctx.lineCap = 'butt';
    ctx.beginPath();
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const i = idx(r, c), x = ox + c * cell, y = oy + r * cell;
      if (c + 1 < C && height[idx(r, c + 1)] !== height[i]) { ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell); }
      if (r + 1 < R && height[idx(r + 1, c)] !== height[i]) { ctx.moveTo(x, y + cell); ctx.lineTo(x + cell, y + cell); }
    }
    ctx.stroke();
    // board edge
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, C * cell, R * cell);

    // §3a editable caps
    for (let i = 0; i < R * C; i++) {
      if (!editable[i]) continue;
      const { r, c } = rc(i);
      const s = Math.round(cell * 0.2), pad = Math.round(cell * 0.12);
      const lift = (drag && drag.i === i) ? 2 : 0;
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      roundRect(ox + c * cell + pad, oy + r * cell + pad - lift, s, s, s * 0.3); ctx.fill();
      if (drag && drag.i === i) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
        ctx.strokeRect(ox + c * cell + 1, oy + r * cell + 1, cell - 2, cell - 2);
      }
    }

    drawSpring(now);
    for (let i = 0; i < R * C; i++) if (isShoot[i]) drawShoot(i, now);

    drawMeter();
    drawHUD(now);
    if (phase === 'play') drawControls();
    if (phase === 'won') winOverlay(now);
    if (phase === 'menu') menuOverlay();
  }

  function drawSpring(now) {
    const { r, c } = rc(spring), cx = ccx(c), cy = ccy(r), s = cell * 0.5;
    ctx.fillStyle = wet[spring] ? '#2f86c8' : '#33435c';
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.42, 0, 7); ctx.fill();
    ctx.fillStyle = '#eaf6ff';
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.27, 0, 7); ctx.fill();
    ctx.fillStyle = '#2f86c8';
    const d = s * 0.17;
    ctx.beginPath(); ctx.moveTo(cx, cy - d);
    ctx.bezierCurveTo(cx + d * 0.9, cy - d * 0.05, cx + d * 0.7, cy + d, cx, cy + d);
    ctx.bezierCurveTo(cx - d * 0.7, cy + d, cx - d * 0.9, cy - d * 0.05, cx, cy - d);
    ctx.closePath(); ctx.fill();
  }

  // PLACEHOLDER. §6.2's five-stage shoot art is step 5 of the build order, held
  // back until the verb is judged. This is enough to see targets and whether
  // they are watered, and nothing more.
  function drawShoot(i, now) {
    const { r, c } = rc(i), cx = ccx(c), cy = ccy(r), s = cell * 0.5;
    const on = wet[i];
    const prog = on ? Math.min(1, (now - growT[i]) / GROW_DUR) : 0;
    const g = on ? ease(Math.max(0.001, prog)) : 0;
    if (!on) {
      ctx.strokeStyle = SHOOT_HUSK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.46, 0, 7); ctx.stroke();
      ctx.fillStyle = SHOOT_HUSK;
      ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.2, s * 0.26, 0, 0, 7); ctx.fill();
      return;
    }
    ctx.strokeStyle = SHOOT_STEM; ctx.lineWidth = Math.max(2, cell * 0.06); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.5); ctx.lineTo(cx, cy + s * 0.5 - s * 0.9 * g); ctx.stroke();
    const ly = cy + s * 0.5 - s * 0.55 * g, lw = s * 0.42 * g;
    for (const dir of [-1, 1]) {
      ctx.fillStyle = SHOOT_LEAF;
      ctx.beginPath(); ctx.ellipse(cx + dir * lw * 0.6, ly, lw, lw * 0.42, dir * 0.5, 0, 7); ctx.fill();
      ctx.fillStyle = SHOOT_LIGHT;
      ctx.beginPath(); ctx.ellipse(cx + dir * lw * 0.6, ly - lw * 0.12, lw * 0.62, lw * 0.2, dir * 0.5, 0, 7); ctx.fill();
    }
  }

  // §7 water meter — the bar is the reading, no numerals
  function drawMeter() {
    const w = Math.min(180, C * cell * 0.5), h = 8;
    const x = Math.round(ox + C * cell - w), y = Math.round(oy - 20);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; roundRect(x, y, w, h, h / 2); ctx.fill();
    const f = BUDGET > 0 ? Math.max(0, Math.min(1, spent / BUDGET)) : 0;
    ctx.fillStyle = METER_FILL; roundRect(x, y, Math.max(h, w * f), h, h / 2); ctx.fill();
  }

  // ---------- HUD (Bloom's, renamed) ----------
  function drawHUD(now) {
    const hs = Math.max(0.66, Math.min(1, LW / 620));
    const P = Math.round(28 * hs);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.round(30 * hs) + 'px Inter, sans-serif'; ctx.fillText('BASIN', P, Math.round(22 * hs));
    const [g, t] = shootsGrown();
    ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.font = '600 ' + Math.round(16 * hs) + 'px Inter, sans-serif';
    ctx.fillText('Level ' + level + '   ·   ' + g + '/' + t + ' grown   ·   ' + moves + (moves === 1 ? ' move' : ' moves') + '   ·   par ' + par, P, Math.round(56 * hs));
    if (phase === 'play' && moves === 0) {
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.42)'; ctx.font = '500 ' + Math.round(15 * hs) + 'px Inter, sans-serif';
      ctx.fillText('Drag the ground up or down.', LW / 2, LH - 46);
    }
  }
  function pill(label, cx, cy, dim) {
    ctx.font = '700 15px Inter, sans-serif';
    const w = Math.round(ctx.measureText(label).width + 36), h = 40, x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.24)'; roundRect(x, y, w, h, h / 2); ctx.stroke();
    ctx.fillStyle = dim ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.92)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx, y + h / 2 + 1);
    return { x, y, w, h };
  }
  function speakerIcon(cx, cy, on) {
    const s = 8;
    ctx.strokeStyle = on ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.4)';
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
  }
  function iconPill(cx, cy, on) {
    const w = 44, h = 40, x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.24)'; roundRect(x, y, w, h, h / 2); ctx.stroke();
    speakerIcon(cx, cy, on);
    return { x, y, w, h };
  }
  function drawControls() {
    const cy = LH - 74, wS = 44;
    const labels = ['Undo', 'Restart', 'Rules'];
    ctx.font = '700 15px Inter, sans-serif';
    const text = labels.map(l => ctx.measureText(l).width);
    const wide = 44 + text.reduce((a, b) => a + Math.round(b + 36), 0) + 12 * 3 <= LW - 20;
    const pad = wide ? 36 : 26, gap = wide ? 12 : 10;
    const w = text.map(t => Math.round(t + pad));
    let x = Math.round(LW / 2 - (wS + w.reduce((a, b) => a + b, 0) + gap * 3) / 2);
    uiButtons.push({ ...iconPill(x + wS / 2, cy, snd.on()), act: () => { snd.ready(); snd.toggle(); render(performance.now()); } }); x += wS + gap;
    uiButtons.push({ ...pill('Undo', x + w[0] / 2, cy, !history.length), act: undo }); x += w[0] + gap;
    uiButtons.push({ ...pill('Restart', x + w[1] / 2, cy, !history.length), act: restart }); x += w[1] + gap;
    uiButtons.push({ ...pill('Rules', x + w[2] / 2, cy, false), act: () => { phase = 'menu'; render(performance.now()); } });
  }
  function winOverlay(now) {
    const t = Math.max(0, Math.min(1, (now - (wonT + GROW_DUR + 350)) / 450));
    if (t <= 0) return;
    ctx.globalAlpha = t;
    ctx.fillStyle = 'rgba(10,16,28,0.82)'; ctx.fillRect(0, 0, LW, LH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fe6a4'; ctx.font = '800 52px Inter, sans-serif'; ctx.fillText('THE VALLEY GREEN', LW / 2, LH / 2 - 30);
    ctx.fillStyle = '#FFD166'; ctx.font = '600 24px Inter, sans-serif'; ctx.fillText('every shoot grown in ' + moves + (moves === 1 ? ' move' : ' moves'), LW / 2, LH / 2 + 22);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '500 20px Inter, sans-serif'; ctx.fillText('tap for the next valley', LW / 2, LH / 2 + 62);
    ctx.globalAlpha = 1;
  }
  function wrapText(text, x, y, maxW, lh, align, measureOnly) {
    const words = text.split(' '); let line = '';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'top';
    for (const w of words) { const tt = line ? line + ' ' + w : w; if (ctx.measureText(tt).width > maxW && line) { if (!measureOnly) ctx.fillText(line, x, y); y += lh; line = w; } else line = tt; }
    if (line) { if (!measureOnly) ctx.fillText(line, x, y); y += lh; } return y;
  }
  function menuOverlay() {
    ctx.fillStyle = 'rgba(10,16,28,0.88)'; ctx.fillRect(0, 0, LW, LH);
    const pw = Math.min(LW - 56, 470);
    const sub = 'Shape the ground so water reaches every shoot.';
    const rules = ['Drag a marked cell up or down to reshape the ground.',
                   'Water runs downhill from the spring and pools in hollows.',
                   'There is only so much water. A deep hollow will drink it all.'];
    let ph = 34 + 54;
    ctx.font = '600 17px Inter, sans-serif';
    ph = wrapText(sub, 0, ph, pw - 70, 24, 'center', true) + 18;
    ctx.font = '500 15px Inter, sans-serif';
    for (const r of rules) ph = wrapText(r, 0, ph, pw - 100, 21, 'left', true) + 13;
    ph += 14 + 50 + 32;
    const px = (LW - pw) / 2, py = Math.max(10, (LH - ph) / 2);
    ctx.fillStyle = '#16233a'; roundRect(px, py, pw, ph, 22); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; roundRect(px, py, pw, ph, 22); ctx.stroke();
    const cx = LW / 2; let y = py + 34;
    ctx.fillStyle = '#fff'; ctx.font = '800 40px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('BASIN', cx, y); y += 54;
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = '600 17px Inter, sans-serif';
    y = wrapText(sub, cx, y, pw - 70, 24); y += 18;
    const rx = px + 32;
    for (let i = 0; i < rules.length; i++) {
      ctx.fillStyle = '#3a9bde'; ctx.beginPath(); ctx.arc(rx + 11, y + 11, 12, 0, 7); ctx.fill();
      ctx.fillStyle = '#0E1726'; ctx.font = '800 14px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), rx + 11, y + 12);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '500 15px Inter, sans-serif';
      y = wrapText(rules[i], rx + 34, y, pw - 100, 21, 'left') + 13;
    }
    const label = moves > 0 ? 'RESUME' : 'PLAY';
    ctx.font = '800 17px Inter, sans-serif';
    const bw = Math.round(Math.max(210, ctx.measureText(label).width + 90)), bh = 50, bx = cx - bw / 2, by = py + ph - 32 - bh / 2;
    ctx.fillStyle = '#3DDC84'; roundRect(bx, by, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#0E1726'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx, by + bh / 2 + 1);
    uiButtons.push({ x: bx, y: by, w: bw, h: bh, act: () => { phase = 'play'; render(performance.now()); } });
  }

  // ---------- debug ----------
  window.__basin = {
    get state() { const [g, t] = shootsGrown(); return { level, R, C, moves, par, phase, grown: g, shoots: t, BUDGET, spent, wetCells: wetCells(), editableCount: editable.filter(Boolean).length }; },
    get grid() { return { height: height.slice(), solved: solvedH.slice(), filled: filled.slice(), depth: depth.slice(), wet: wet.slice(), editable: editable.slice(), isShoot: isShoot.slice(), spring }; },
    // Is the BUDGET actually doing anything, or is the water stopping for
    // topographic reasons alone? Compare the reachable set at BUDGET with the
    // reachable set at infinity. If they match, this board is the unlimited-
    // water game that §0 says degenerates, whatever the meter shows.
    get budgetBite() {
      const f = computeFilled(height);
      const lim = routeWater(height, f, BUDGET), inf = routeWater(height, f, 1e9);
      let atBudget = 0, atInf = 0, deepest = 0, pondCells = 0;
      for (let i = 0; i < R * C; i++) {
        if (lim.wet[i]) atBudget++;
        if (inf.wet[i]) atInf++;
        if (inf.depth[i] > deepest) deepest = inf.depth[i];
        if (lim.wet[i] && lim.depth[i] > 0) pondCells++;
      }
      let shootsInfOnly = 0;
      for (let i = 0; i < R * C; i++) if (isShoot[i] && inf.wet[i] && !lim.wet[i]) shootsInfOnly++;
      return { binds: atBudget < atInf, cellsWithheld: atInf - atBudget, shootsWithheldByBudgetAlone: shootsInfOnly,
               spent: lim.spent, BUDGET, deepestHollow: deepest, pondCells };
    },
    solve() { height = solvedH.slice(); computeWater(); const [g, t] = shootsGrown(); if (g === t) { phase = 'won'; wonT = performance.now() - GROW_DUR - 350; } render(performance.now()); return this.state; },
    set(i, v) { setHeight(i, v, performance.now()); render(performance.now()); return this.state; },
    next() { genLevel(level + 1); }, goto(n) { genLevel(n); },
    get geom() { return { LW, LH, cell, ox, oy, R, C }; },
  };

  // ---------- boot ----------
  setCanvasVars();
  resizeCanvas();
  fitFullscreen();
  resizeCanvas();
  genLevel(loadLevel(), true);
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
})();
